import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { FontLoader, type Font } from 'three/addons/loaders/FontLoader.js';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import helvetikerBoldUrl from 'three/examples/fonts/helvetiker_bold.typeface.json?url';
import helvetikerRegularUrl from 'three/examples/fonts/helvetiker_regular.typeface.json?url';
import gentilisRegularUrl from 'three/examples/fonts/gentilis_regular.typeface.json?url';
import optimerBoldUrl from 'three/examples/fonts/optimer_bold.typeface.json?url';
import droidSansMonoUrl from 'three/examples/fonts/droid/droid_sans_mono_regular.typeface.json?url';
import type { GeneratedModel, ProductParams } from '../types';

const bundledFonts: Record<string, string> = {
  helvetiker_bold: helvetikerBoldUrl,
  helvetiker_regular: helvetikerRegularUrl,
  gentilis_regular: gentilisRegularUrl,
  optimer_bold: optimerBoldUrl,
  droid_sans_mono_regular: droidSansMonoUrl,
};

const localTtfFonts = new Set([
  'roboto_regular',
  'montserrat_regular',
  'open_sans_regular',
  'poppins_regular',
  'oswald_regular',
  'lato_regular',
  'playfair_display_regular',
  'bebas_neue_regular',
  'raleway_regular',
  'merriweather_regular',
  'lobster_regular',
  'pacifico_regular',
  'courgette_regular',
  'kaushan_script_regular',
  'satisfy_regular',
  'bungee_regular',
  'black_ops_one_regular',
  'alfa_slab_one_regular',
  'luckiest_guy_regular',
  'righteous_regular',
]);

const fontCache = new Map<string, Promise<Font>>();

export async function generateSignModel(params: ProductParams): Promise<GeneratedModel> {
  const text = String(params.text ?? '').trim();
  if (!text) throw new Error('Add text before generating the sign.');

  const fontKey = String(params.font ?? 'helvetiker_bold');
  const font = await loadFont(fontKey);
  const baseDepth = positiveNumber(params.base_thickness_mm, 2.4);
  const wallHeight = positiveNumber(params.wall_height_mm, 20);
  const hollow = Boolean(params.hollow);
  const { group, mountingHoles: generatedMountingHoles } = buildSignGroup(
    font,
    text,
    params,
    baseDepth,
    wallHeight,
    hollow,
  );
  const exporter = new STLExporter();
  group.updateMatrixWorld(true);
  const view = exporter.parse(group, { binary: true }) as DataView;
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  const blob = new Blob([bytes], { type: 'model/stl' });
  const url = URL.createObjectURL(blob);

  return {
    source: 'local',
    name: `${slugify(text)}.stl`,
    modelUrl: url,
    downloadUrl: url,
    blob,
    format: 'stl',
    metadata: {
      objects: ['sign'],
      mountingHoles: generatedMountingHoles,
    },
  };
}

export async function loadFont(key: string): Promise<Font> {
  const isTtf = localTtfFonts.has(key);
  const url = bundledFonts[key] ?? `${import.meta.env.BASE_URL}fonts/${key}.${isTtf ? 'ttf' : 'typeface.json'}`;
  const cached = fontCache.get(url);
  if (cached) return cached;
  const request = (
    isTtf
      ? new TTFLoader().loadAsync(url).then((data) => new FontLoader().parse(data))
      : new FontLoader().loadAsync(url)
  ).catch(() => {
      throw new Error(`Could not load the local font “${key}”.`);
    });
  fontCache.set(url, request);
  return request;
}

function buildSignGroup(
  font: Font,
  text: string,
  params: ProductParams,
  baseDepth: number,
  wallHeight: number,
  hollow: boolean,
) {
  const fontSize = positiveNumber(params.font_size_mm, 60);
  const letterSpacing = finiteNumber(params.letter_spacing_mm, 2);
  const lineSpacing = positiveNumber(params.line_spacing_mm, 10);
  const wallThickness = positiveNumber(params.wall_thickness_mm, 1.6);
  const mountingHoles = Boolean(params.mounting_holes) && !hollow;
  const mountingRadius = positiveNumber(params.mounting_hole_diameter_mm, 4) / 2;
  const totalDepth = baseDepth + wallHeight;
  const minimumFrontSkin = Math.min(1.2, totalDepth * 0.25);
  const mountingDepth = Math.min(
    positiveNumber(params.mounting_hole_depth_mm, 6),
    Math.max(0.2, totalDepth - minimumFrontSkin),
  );
  const customHolePositions = parseMountingHolePositions(
    params.mounting_hole_positions,
  );
  const signGroup = new THREE.Group();
  const mountingHolePreviews: Array<{
    key: string;
    x: number;
    y: number;
    radius: number;
    depth: number;
    bounds: {
      minX: number;
      maxX: number;
      minY: number;
      maxY: number;
    };
  }> = [];
  let cursorY = 0;

  text.split(/\r?\n/).forEach((line, lineIndex) => {
    let cursorX = 0;
    Array.from(line || ' ').forEach((character, characterIndex) => {
      const shapes = font.generateShapes(character, fontSize);
      const bounds = getShapesBounds(shapes);
      if (shapes.length > 0) {
        const offsetX = cursorX - bounds.minX;
        if (mountingHoles) {
          const key = `${lineIndex}-${characterIndex}`;
          const hole = findMountingHole(
            shapes,
            mountingRadius,
            customHolePositions[key],
          );
          const geometry = new THREE.ExtrudeGeometry(
            shapes,
            extrusionOptions(totalDepth),
          );
          geometry.translate(offsetX, cursorY, 0);
          applyTexture(geometry, params, totalDepth);
          if (hole) {
            const positionedHole = {
              x: hole.x + offsetX,
              y: hole.y + cursorY,
              radius: hole.radius,
            };
            signGroup.add(
              subtractBlindMountingHole(geometry, positionedHole, mountingDepth),
            );
            mountingHolePreviews.push({
              key,
              ...positionedHole,
              depth: mountingDepth,
              bounds: {
                minX: bounds.minX + offsetX,
                maxX: bounds.maxX + offsetX,
                minY: bounds.minY + cursorY,
                maxY: bounds.maxY + cursorY,
              },
            });
          } else {
            signGroup.add(new THREE.Mesh(geometry));
          }
        } else {
          addExtrudedMesh(
            signGroup,
            shapes,
            hollow ? baseDepth : totalDepth,
            offsetX,
            cursorY,
            0,
            params,
            hollow ? baseDepth : totalDepth,
          );
        }

        if (hollow) {
          const wallShapes = createWallShapes(shapes, wallThickness);
          const wallGeometry = new THREE.ExtrudeGeometry(
            wallShapes,
            extrusionOptions(wallHeight),
          );
          wallGeometry.translate(offsetX, cursorY, baseDepth);
          signGroup.add(new THREE.Mesh(wallGeometry));
        }
      }
      cursorX += Math.max(bounds.width, character === ' ' ? fontSize * 0.35 : fontSize * 0.15) + letterSpacing;
    });
    cursorY -= fontSize + lineSpacing;
  });

  centerGroup(signGroup);
  mountingHolePreviews.forEach((hole) => {
    hole.x += signGroup.position.x;
    hole.y += signGroup.position.y;
    hole.bounds.minX += signGroup.position.x;
    hole.bounds.maxX += signGroup.position.x;
    hole.bounds.minY += signGroup.position.y;
    hole.bounds.maxY += signGroup.position.y;
  });
  return {
    group: signGroup,
    mountingHoles: mountingHolePreviews,
  };
}

function subtractBlindMountingHole(
  geometry: THREE.BufferGeometry,
  hole: { x: number; y: number; radius: number },
  depth: number,
): THREE.Mesh {
  const epsilon = 0.02;
  const solid = new Brush(geometry);
  solid.updateMatrixWorld(true);

  const cutter = new Brush(
    new THREE.CylinderGeometry(hole.radius, hole.radius, depth + epsilon, 32),
  );
  cutter.rotation.x = Math.PI / 2;
  cutter.position.set(hole.x, hole.y, (depth - epsilon) / 2);
  cutter.updateMatrixWorld(true);

  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  const result = evaluator.evaluate(solid, cutter, SUBTRACTION);
  result.geometry.deleteAttribute('uv');
  result.geometry.computeVertexNormals();
  return result;
}

function addExtrudedMesh(
  group: THREE.Group,
  shapes: THREE.Shape[],
  depth: number,
  x: number,
  y: number,
  z: number,
  textureParams?: ProductParams,
  texturedTopZ?: number,
) {
  if (depth <= 0.001 || shapes.length === 0) return;
  const geometry = new THREE.ExtrudeGeometry(shapes, extrusionOptions(depth));
  geometry.translate(x, y, z);
  if (textureParams && texturedTopZ !== undefined) {
    applyTexture(geometry, textureParams, texturedTopZ);
  }
  group.add(new THREE.Mesh(geometry));
}

function extrusionOptions(depth: number): THREE.ExtrudeGeometryOptions {
  return { depth, bevelEnabled: false, curveSegments: 10, steps: 1 };
}

function getShapesBounds(shapes: THREE.Shape[]) {
  if (shapes.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0 };
  }
  const geometry = new THREE.ShapeGeometry(shapes, 8);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  geometry.dispose();
  return {
    minX: box?.min.x ?? 0,
    maxX: box?.max.x ?? 0,
    minY: box?.min.y ?? 0,
    maxY: box?.max.y ?? 0,
    width: box ? box.max.x - box.min.x : 0,
    height: box ? box.max.y - box.min.y : 0,
  };
}

function createWallShapes(shapes: THREE.Shape[], thickness: number): THREE.Shape[] {
  return shapes.flatMap((shape) => {
    const points = shape.extractPoints(10);
    return [points.shape, ...points.holes].flatMap((contour) =>
      createContourStrokeShapes(contour, thickness),
    );
  });
}

function findMountingHole(
  shapes: THREE.Shape[],
  radius: number,
  preferredPosition?: { u: number; v: number },
): { x: number; y: number; radius: number } | undefined {
  const samples = shapes.map((shape) => ({
    shape,
    points: shape.extractPoints(14),
  }));
  const bounds = new THREE.Box2();
  samples.forEach(({ points }) => points.shape.forEach((point) => bounds.expandByPoint(point)));
  if (bounds.isEmpty()) return undefined;

  const size = bounds.getSize(new THREE.Vector2());
  const target = new THREE.Vector2(
    THREE.MathUtils.lerp(
      bounds.min.x,
      bounds.max.x,
      THREE.MathUtils.clamp(preferredPosition?.u ?? 0.5, 0, 1),
    ),
    THREE.MathUtils.lerp(
      bounds.min.y,
      bounds.max.y,
      THREE.MathUtils.clamp(preferredPosition?.v ?? 0.55, 0, 1),
    ),
  );
  const requiredClearance = radius / 0.82;
  let best: { point: THREE.Vector2; clearance: number; score: number } | null = null;
  const divisions = 36;
  for (let xIndex = 0; xIndex <= divisions; xIndex += 1) {
    for (let yIndex = 0; yIndex <= divisions; yIndex += 1) {
      const point = new THREE.Vector2(
        THREE.MathUtils.lerp(bounds.min.x, bounds.max.x, (xIndex + 0.5) / (divisions + 1)),
        THREE.MathUtils.lerp(bounds.min.y, bounds.max.y, (yIndex + 0.5) / (divisions + 1)),
      );
      for (let shapeIndex = 0; shapeIndex < samples.length; shapeIndex += 1) {
        const { points } = samples[shapeIndex];
        if (!isPointInFilledShape(point, points.shape, points.holes)) continue;
        const clearance = getContourClearance(point, [points.shape, ...points.holes]);
        const normalizedX = (point.x - target.x) / Math.max(size.x, 0.01);
        const normalizedY = (point.y - target.y) / Math.max(size.y, 0.01);
        const centerDistance = normalizedX ** 2 + normalizedY ** 2 * 1.35;
        const undersizedPenalty = clearance < requiredClearance
          ? 10 + (requiredClearance - clearance) / Math.max(requiredClearance, 0.01)
          : 0;
        const score = centerDistance + undersizedPenalty - clearance / Math.max(size.x, size.y, 0.01) * 0.04;
        if (!best || score < best.score) best = { point, clearance, score };
      }
    }
  }

  if (!best) return undefined;
  const safeRadius = Math.min(radius, best.clearance * 0.82);
  if (safeRadius < 0.6) return undefined;
  return { x: best.point.x, y: best.point.y, radius: safeRadius };
}

function parseMountingHolePositions(
  value: ProductParams[string] | undefined,
): Record<string, { u: number; v: number }> {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, { u?: unknown; v?: unknown }>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, position]) => {
        const u = Number(position?.u);
        const v = Number(position?.v);
        return Number.isFinite(u) && Number.isFinite(v)
          ? [[key, { u: THREE.MathUtils.clamp(u, 0, 1), v: THREE.MathUtils.clamp(v, 0, 1) }]]
          : [];
      }),
    );
  } catch {
    return {};
  }
}

function isPointInFilledShape(
  point: THREE.Vector2,
  outer: THREE.Vector2[],
  holes: THREE.Vector2[][],
): boolean {
  return isPointInPolygon(point, outer) && !holes.some((hole) => isPointInPolygon(point, hole));
}

function isPointInPolygon(point: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    const intersects =
      currentPoint.y > point.y !== previousPoint.y > point.y &&
      point.x <
        ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) /
          (previousPoint.y - currentPoint.y || Number.EPSILON) +
          currentPoint.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function getContourClearance(point: THREE.Vector2, contours: THREE.Vector2[][]): number {
  let minimum = Number.POSITIVE_INFINITY;
  contours.forEach((contour) => {
    for (let index = 0; index < contour.length; index += 1) {
      minimum = Math.min(
        minimum,
        point.distanceTo(getClosestPointOnSegment(point, contour[index], contour[(index + 1) % contour.length])),
      );
    }
  });
  return minimum;
}

function getClosestPointOnSegment(
  point: THREE.Vector2,
  start: THREE.Vector2,
  end: THREE.Vector2,
): THREE.Vector2 {
  const segment = end.clone().sub(start);
  const lengthSquared = segment.lengthSq();
  if (lengthSquared === 0) return start.clone();
  const amount = THREE.MathUtils.clamp(point.clone().sub(start).dot(segment) / lengthSquared, 0, 1);
  return start.clone().add(segment.multiplyScalar(amount));
}

function createContourStrokeShapes(contour: THREE.Vector2[], thickness: number): THREE.Shape[] {
  if (contour.length < 2) return [];
  const half = thickness / 2;
  const strokes: THREE.Shape[] = [];

  for (let index = 0; index < contour.length; index += 1) {
    const start = contour[index];
    const end = contour[(index + 1) % contour.length];
    const direction = end.clone().sub(start);
    if (direction.lengthSq() < 0.0001) continue;
    direction.normalize();
    const normal = new THREE.Vector2(-direction.y, direction.x).multiplyScalar(half);
    strokes.push(new THREE.Shape([
      start.clone().add(normal),
      end.clone().add(normal),
      end.clone().sub(normal),
      start.clone().sub(normal),
    ]));

    const join = new THREE.Shape();
    join.absarc(start.x, start.y, half, 0, Math.PI * 2, false);
    strokes.push(join);
  }

  return strokes;
}

function applyTexture(geometry: THREE.BufferGeometry, params: ProductParams, topZ: number) {
  const texture = String(params.texture ?? 'none');
  if (texture === 'none') return;
  const depth = positiveNumber(params.texture_depth_mm, 0.8);
  const spacing = positiveNumber(params.texture_spacing_mm, 3);
  subdivideTopSurface(geometry, topZ, spacing);
  const position = geometry.getAttribute('position');
  for (let index = 0; index < position.count; index += 1) {
    if (Math.abs(position.getZ(index) - topZ) > 0.001) continue;
    const x = position.getX(index) / spacing;
    const y = position.getY(index) / spacing;
    position.setZ(index, topZ + textureValue(texture, x, y) * depth);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
}

function subdivideTopSurface(
  geometry: THREE.BufferGeometry,
  topZ: number,
  spacing: number,
) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = source.getAttribute('position');
  const output: number[] = [];
  const targetEdge = Math.max(0.75, spacing * 0.7);

  for (let index = 0; index < position.count; index += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(position, index);
    const b = new THREE.Vector3().fromBufferAttribute(position, index + 1);
    const c = new THREE.Vector3().fromBufferAttribute(position, index + 2);
    const isTop = [a, b, c].every((point) => Math.abs(point.z - topZ) < 0.001);
    emitSubdividedTriangle(a, b, c, isTop ? 4 : 0, targetEdge, output);
  }

  geometry.setIndex(null);
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(output, 3));
  if (source !== geometry) source.dispose();
}

function emitSubdividedTriangle(
  a: THREE.Vector3,
  b: THREE.Vector3,
  c: THREE.Vector3,
  levels: number,
  targetEdge: number,
  output: number[],
) {
  const longestEdge = Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a));
  if (levels <= 0 || longestEdge <= targetEdge) {
    output.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    return;
  }

  const ab = a.clone().add(b).multiplyScalar(0.5);
  const bc = b.clone().add(c).multiplyScalar(0.5);
  const ca = c.clone().add(a).multiplyScalar(0.5);
  emitSubdividedTriangle(a, ab, ca, levels - 1, targetEdge, output);
  emitSubdividedTriangle(ab, b, bc, levels - 1, targetEdge, output);
  emitSubdividedTriangle(ca, bc, c, levels - 1, targetEdge, output);
  emitSubdividedTriangle(ab, bc, ca, levels - 1, targetEdge, output);
}

function textureValue(texture: string, x: number, y: number): number {
  if (texture === 'woven') return (Math.sin(x * Math.PI) * Math.sin(y * Math.PI) + 1) / 2;
  if (texture === 'knit') return (Math.sin(x * Math.PI + Math.sin(y * Math.PI)) + 1) / 2;
  if (texture === 'carbon') return (Math.floor(x) + Math.floor(y)) % 2 === 0 ? 1 : 0.2;
  if (texture === 'wood') return (Math.sin(x * 1.7 + Math.sin(y * 0.65) * 1.4) + 1) / 2;
  return 0;
}

function centerGroup(group: THREE.Group) {
  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  group.position.set(-center.x, -center.y, -bounds.min.z);
}

function finiteNumber(value: ProductParams[string] | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(value: ProductParams[string] | undefined, fallback: number): number {
  return Math.max(0.01, finiteNumber(value, fallback));
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'sign';
}
