import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { GeneratedModel, ProductParams, PreviewFile } from '../types';
import {
  loadReusableShape,
  petShapeAssetByValue,
} from '../shapes/reusableShapeLibrary';
import { loadFont } from './signGenerator';

interface HolePosition {
  u: number;
  v: number;
}

export async function generatePetKeychainModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const text = String(params.text ?? '').trim();
  if (!text) throw new Error('Add a pet name before generating the keychain.');

  const width = clampNumber(params.tag_width_mm, 60, 20, 100);
  const baseDepth = clampNumber(params.base_thickness_mm, 3, 1.6, 8);
  const textDepth = clampNumber(params.text_height_mm, 1.2, 0.4, 4);
  const maximumHoleDiameter = Math.max(3, Math.min(10, Math.floor(width * 0.3 * 2) / 2));
  const holeRadius =
    clampNumber(params.keychain_hole_diameter_mm, 5, 3, maximumHoleDiameter) / 2;
  const shapeValue = String(params.pet_shape ?? 'bone');
  const sourceShapes = await loadReusableShape(
    petShapeAssetByValue[shapeValue] ?? 'bone',
  );
  const sourceShape = sourceShapes[0];
  const shapeBounds = getShapeBounds(sourceShape);
  const scale = width / Math.max(shapeBounds.width, 0.001);
  const shape = scaleShapes([sourceShape], scale)[0];

  const bounds = getShapeBounds(shape);
  const preferred = parseHolePosition(params.keychain_hole_position);
  const hole = findSafeHole(shape, bounds, holeRadius, preferred);
  if (!hole) throw new Error('The selected tag is too small for this hole diameter.');

  const bodyGeometry = new THREE.ExtrudeGeometry(shape, extrusionOptions(baseDepth));
  const body = subtractHole(bodyGeometry, hole, holeRadius, baseDepth + textDepth);

  const font = await loadFont(String(params.font ?? 'helvetiker_bold'));
  const sourceTextShapes = font.generateShapes(text, 10);
  const textBounds = getShapesBounds(sourceTextShapes);
  const availableWidth = bounds.width * 0.62;
  const availableHeight = bounds.height * 0.27;
  const textScale = Math.min(
    availableWidth / Math.max(textBounds.width, 0.001),
    availableHeight / Math.max(textBounds.height, 0.001),
  );
  const textShapes = scaleShapes(sourceTextShapes, textScale);
  const scaledTextBounds = getShapesBounds(textShapes);
  const textGeometry = new THREE.ExtrudeGeometry(textShapes, extrusionOptions(textDepth));
  textGeometry.translate(
    bounds.minX + (bounds.width - scaledTextBounds.width) / 2 - scaledTextBounds.minX,
    bounds.minY + (bounds.height - scaledTextBounds.height) / 2 - scaledTextBounds.minY,
    baseDepth,
  );
  const raisedText = subtractHole(textGeometry, hole, holeRadius, baseDepth + textDepth);

  const bodyBlob = exportObject(body);
  const textBlob = exportObject(raisedText);
  const combined = new THREE.Group();
  combined.add(body.clone(), raisedText.clone());
  const combinedBlob = exportObject(combined);
  const bodyUrl = URL.createObjectURL(bodyBlob);
  const textUrl = URL.createObjectURL(textBlob);
  const combinedUrl = URL.createObjectURL(combinedBlob);
  const slug = slugify(text);
  const previewFiles: PreviewFile[] = [
    {
      role: 'body',
      object: 'tag',
      filename: `${slug}-tag.stl`,
      url: bodyUrl,
      format: 'stl',
      color: String(params.body_color ?? '#e8794f'),
    },
    {
      role: 'text',
      object: 'name',
      filename: `${slug}-name.stl`,
      url: textUrl,
      format: 'stl',
      color: String(params.text_color ?? '#fff4dc'),
    },
  ];

  return {
    source: 'local',
    name: `${slug}-pet-keychain.stl`,
    modelUrl: combinedUrl,
    downloadUrl: combinedUrl,
    blob: combinedBlob,
    previewFiles,
    format: 'stl',
    metadata: {
      objects: ['tag', 'name'],
      mountingHoles: [
        {
          key: 'pet-keychain-hole',
          x: hole.x,
          y: hole.y,
          radius: holeRadius,
          depth: baseDepth + textDepth,
          bounds: {
            minX: bounds.minX,
            maxX: bounds.maxX,
            minY: bounds.minY,
            maxY: bounds.maxY,
          },
        },
      ],
    },
  };
}

function findSafeHole(
  shape: THREE.Shape,
  bounds: ReturnType<typeof getShapeBounds>,
  radius: number,
  preferred: HolePosition,
): { x: number; y: number } | null {
  const extracted = shape.extractPoints(24);
  const target = new THREE.Vector2(
    THREE.MathUtils.lerp(bounds.minX, bounds.maxX, preferred.u),
    THREE.MathUtils.lerp(bounds.minY, bounds.maxY, preferred.v),
  );
  let best: { point: THREE.Vector2; score: number } | null = null;
  const divisions = 55;
  for (let xIndex = 0; xIndex <= divisions; xIndex += 1) {
    for (let yIndex = 0; yIndex <= divisions; yIndex += 1) {
      const point = new THREE.Vector2(
        THREE.MathUtils.lerp(bounds.minX, bounds.maxX, xIndex / divisions),
        THREE.MathUtils.lerp(bounds.minY, bounds.maxY, yIndex / divisions),
      );
      if (!isInsideShape(point, extracted.shape, extracted.holes)) continue;
      const clearance = contourClearance(point, [extracted.shape, ...extracted.holes]);
      if (clearance < radius + 1.2) continue;
      const score = point.distanceToSquared(target);
      if (!best || score < best.score) best = { point, score };
    }
  }
  return best ? { x: best.point.x, y: best.point.y } : null;
}

function subtractHole(
  geometry: THREE.BufferGeometry,
  hole: { x: number; y: number },
  radius: number,
  totalDepth: number,
): THREE.Mesh {
  const solid = new Brush(geometry);
  solid.updateMatrixWorld(true);
  const cutter = new Brush(
    new THREE.CylinderGeometry(radius, radius, totalDepth + 0.2, 40),
  );
  cutter.rotation.x = Math.PI / 2;
  cutter.position.set(hole.x, hole.y, totalDepth / 2);
  cutter.updateMatrixWorld(true);
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  const result = evaluator.evaluate(solid, cutter, SUBTRACTION);
  result.geometry.deleteAttribute('uv');
  result.geometry.computeVertexNormals();
  return result;
}

function exportObject(object: THREE.Object3D): Blob {
  object.updateMatrixWorld(true);
  const view = new STLExporter().parse(object, { binary: true }) as DataView;
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return new Blob([bytes], { type: 'model/stl' });
}

function getShapeBounds(shape: THREE.Shape) {
  return getShapesBounds([shape]);
}

function scaleShapes(shapes: THREE.Shape[], scale: number): THREE.Shape[] {
  return shapes.map((shape) => {
    const points = shape.extractPoints(24);
    const scaled = new THREE.Shape(
      points.shape.map((point) => point.clone().multiplyScalar(scale)),
    );
    scaled.holes = points.holes.map(
      (hole) =>
        new THREE.Path(
          hole.map((point) => point.clone().multiplyScalar(scale)),
        ),
    );
    return scaled;
  });
}

function getShapesBounds(shapes: THREE.Shape[]) {
  const geometry = new THREE.ShapeGeometry(shapes, 12);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  geometry.dispose();
  return {
    minX: box.min.x,
    maxX: box.max.x,
    minY: box.min.y,
    maxY: box.max.y,
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
  };
}

function parseHolePosition(value: ProductParams[string] | undefined): HolePosition {
  if (typeof value !== 'string') return { u: 0.18, v: 0.72 };
  try {
    const parsed = JSON.parse(value) as Partial<HolePosition>;
    return {
      u: THREE.MathUtils.clamp(Number(parsed.u) || 0, 0, 1),
      v: THREE.MathUtils.clamp(Number(parsed.v) || 0, 0, 1),
    };
  } catch {
    return { u: 0.18, v: 0.72 };
  }
}

function isInsideShape(point: THREE.Vector2, outer: THREE.Vector2[], holes: THREE.Vector2[][]) {
  return isInsidePolygon(point, outer) && !holes.some((hole) => isInsidePolygon(point, hole));
}

function isInsidePolygon(point: THREE.Vector2, polygon: THREE.Vector2[]) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    if (
      current.y > point.y !== prior.y > point.y &&
      point.x < ((prior.x - current.x) * (point.y - current.y)) / (prior.y - current.y || Number.EPSILON) + current.x
    ) inside = !inside;
  }
  return inside;
}

function contourClearance(point: THREE.Vector2, contours: THREE.Vector2[][]) {
  let minimum = Number.POSITIVE_INFINITY;
  contours.forEach((contour) => {
    contour.forEach((start, index) => {
      const end = contour[(index + 1) % contour.length];
      const segment = end.clone().sub(start);
      const amount = THREE.MathUtils.clamp(
        point.clone().sub(start).dot(segment) / Math.max(segment.lengthSq(), Number.EPSILON),
        0,
        1,
      );
      minimum = Math.min(minimum, point.distanceTo(start.clone().add(segment.multiplyScalar(amount))));
    });
  });
  return minimum;
}

function extrusionOptions(depth: number): THREE.ExtrudeGeometryOptions {
  return { depth, bevelEnabled: false, curveSegments: 16, steps: 1 };
}

function clampNumber(value: ProductParams[string] | undefined, fallback: number, min: number, max: number) {
  const numeric = Number(value);
  return THREE.MathUtils.clamp(Number.isFinite(numeric) ? numeric : fallback, min, max);
}

function slugify(value: string) {
  return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'pet';
}
