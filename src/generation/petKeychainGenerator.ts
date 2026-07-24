import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { GeneratedModel, ProductParams, PreviewFile } from '../types';
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
  const sourceShape = createPetShape(String(params.pet_shape ?? 'bone'));
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

function createPetShape(kind: string): THREE.Shape {
  if (kind === 'fish') return createFishShape();
  if (kind === 'cat') return createCatShape();
  if (kind === 'dog') return createDogShape();
  if (kind === 'paw') return createPawShape();
  if (kind === 'heart') return createHeartShape();
  if (kind === 'round') return createRoundShape();
  if (kind === 'house') return createHouseShape();
  if (kind === 'rabbit') return createRabbitShape();
  if (kind === 'bird') return createBirdShape();
  if (kind === 'turtle') return createTurtleShape();
  if (kind === 'hamster') return createHamsterShape();
  return createBoneShape();
}

function createBoneShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-24, -10);
  shape.bezierCurveTo(-31, -17, -40, -9, -34, -2);
  shape.bezierCurveTo(-42, 5, -32, 17, -24, 10);
  shape.bezierCurveTo(-15, 7, 15, 7, 24, 10);
  shape.bezierCurveTo(32, 17, 42, 5, 34, -2);
  shape.bezierCurveTo(40, -9, 31, -17, 24, -10);
  shape.bezierCurveTo(15, -7, -15, -7, -24, -10);
  return shape;
}

function createFishShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-34, 0);
  shape.lineTo(-45, 14);
  shape.lineTo(-43, 1);
  shape.lineTo(-45, -14);
  shape.lineTo(-34, 0);
  shape.bezierCurveTo(-18, 21, 17, 21, 34, 0);
  shape.bezierCurveTo(17, -21, -18, -21, -34, 0);
  return shape;
}

function createCatShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-27, 10);
  shape.lineTo(-25, 30);
  shape.lineTo(-11, 21);
  shape.bezierCurveTo(-4, 24, 4, 24, 11, 21);
  shape.lineTo(25, 30);
  shape.lineTo(27, 10);
  shape.bezierCurveTo(34, -10, 20, -30, 0, -31);
  shape.bezierCurveTo(-20, -30, -34, -10, -27, 10);
  return shape;
}

function createDogShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-18, 22);
  shape.bezierCurveTo(-28, 31, -39, 22, -34, 7);
  shape.lineTo(-29, -11);
  shape.bezierCurveTo(-26, -20, -18, -17, -16, -10);
  shape.bezierCurveTo(-10, -25, 10, -25, 16, -10);
  shape.bezierCurveTo(18, -17, 26, -20, 29, -11);
  shape.lineTo(34, 7);
  shape.bezierCurveTo(39, 22, 28, 31, 18, 22);
  shape.bezierCurveTo(8, 27, -8, 27, -18, 22);
  return shape;
}

function createPawShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-18, -25);
  shape.bezierCurveTo(-31, -19, -33, -4, -25, 5);
  shape.bezierCurveTo(-32, 10, -31, 23, -23, 27);
  shape.bezierCurveTo(-16, 30, -11, 24, -12, 17);
  shape.bezierCurveTo(-11, 29, 1, 34, 8, 27);
  shape.bezierCurveTo(13, 22, 10, 14, 5, 11);
  shape.bezierCurveTo(15, 19, 27, 13, 26, 3);
  shape.bezierCurveTo(25, -5, 17, -8, 11, -4);
  shape.bezierCurveTo(20, -17, 8, -31, -1, -24);
  shape.bezierCurveTo(-7, -31, -14, -30, -18, -25);
  return shape;
}

function createHeartShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(0, -29);
  shape.bezierCurveTo(-8, -19, -34, 1, -34, 16);
  shape.bezierCurveTo(-34, 34, -10, 38, 0, 21);
  shape.bezierCurveTo(10, 38, 34, 34, 34, 16);
  shape.bezierCurveTo(34, 1, 8, -19, 0, -29);
  return shape;
}

function createRoundShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 34, 0, Math.PI * 2, false);
  return shape;
}

function createHouseShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-34, -28);
  shape.lineTo(-34, 10);
  shape.lineTo(-42, 10);
  shape.lineTo(0, 38);
  shape.lineTo(42, 10);
  shape.lineTo(34, 10);
  shape.lineTo(34, -28);
  shape.bezierCurveTo(18, -34, -18, -34, -34, -28);
  return shape;
}

function createRabbitShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-19, 16);
  shape.bezierCurveTo(-32, 33, -29, 47, -20, 48);
  shape.bezierCurveTo(-11, 48, -10, 31, -9, 23);
  shape.bezierCurveTo(-3, 26, 3, 26, 9, 23);
  shape.bezierCurveTo(10, 31, 11, 48, 20, 48);
  shape.bezierCurveTo(29, 47, 32, 33, 19, 16);
  shape.bezierCurveTo(34, 2, 27, -27, 0, -31);
  shape.bezierCurveTo(-27, -27, -34, 2, -19, 16);
  return shape;
}

function createBirdShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-38, -4);
  shape.bezierCurveTo(-23, 0, -21, 18, -7, 24);
  shape.bezierCurveTo(7, 30, 25, 20, 27, 7);
  shape.lineTo(43, 1);
  shape.lineTo(28, -5);
  shape.bezierCurveTo(21, -24, -7, -29, -23, -15);
  shape.lineTo(-39, -24);
  shape.bezierCurveTo(-35, -15, -35, -10, -38, -4);
  return shape;
}

function createTurtleShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-27, -17);
  shape.lineTo(-39, -26);
  shape.lineTo(-35, -12);
  shape.bezierCurveTo(-49, -7, -48, 7, -35, 10);
  shape.lineTo(-40, 24);
  shape.lineTo(-25, 17);
  shape.bezierCurveTo(-9, 30, 15, 28, 27, 15);
  shape.lineTo(39, 22);
  shape.lineTo(35, 9);
  shape.bezierCurveTo(50, 5, 50, -6, 35, -10);
  shape.lineTo(40, -24);
  shape.lineTo(26, -17);
  shape.bezierCurveTo(10, -29, -11, -29, -27, -17);
  return shape;
}

function createHamsterShape(): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-21, 21);
  shape.bezierCurveTo(-34, 33, -43, 18, -35, 6);
  shape.bezierCurveTo(-42, -15, -25, -34, 0, -34);
  shape.bezierCurveTo(25, -34, 42, -15, 35, 6);
  shape.bezierCurveTo(43, 18, 34, 33, 21, 21);
  shape.bezierCurveTo(10, 29, -10, 29, -21, 21);
  return shape;
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
