/// <reference lib="webworker" />

import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d';
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

interface UrnWorkerRequest {
  id: number;
  input: ArrayBuffer;
  params: {
    size: string;
    targetCapacityMl: number;
    wallThicknessMm: number;
    innerScale: number;
    planarCutMm: number;
    plateSizeMm: [number, number, number];
    partGapMm: number;
  };
}

interface UrnMetadata {
  size: string;
  target_capacity_ml: number;
  initial_capacity_ml: number;
  estimated_capacity_ml: number;
  requested_scale: number;
  applied_scale: number;
  pressure_rib_count: number;
}

interface UrnWorkerResponse {
  id: number;
  body?: ArrayBuffer;
  lid?: ArrayBuffer;
  lidBounds?: { min: number[]; max: number[] };
  metadata?: UrnMetadata;
  warnings?: string[];
  error?: string;
}

interface CavityResult {
  body: Manifold;
  capacityMl: number;
  openingRing: number[][];
}

const LID_THICKNESS_MM = 1;
const LID_SEAT_WIDTH_MM = 1;
const LID_FIT_CLEARANCE_MM = 0.1;
const LID_SKIRT_HEIGHT_MM = 2;
const LID_REST_HEIGHT_MM = 0.5;
const RIB_COUNT = 4;
const RIB_DEPTH_MM = 0.45;
const RIB_WIDTH_MM = 2.4;
const RIB_HEIGHT_MM = 1.5;
const RIB_Z_MIN_MM = 1.25;

let modulePromise: Promise<ManifoldToplevel> | undefined;

self.onmessage = async (event: MessageEvent<UrnWorkerRequest>) => {
  const request = event.data;
  try {
    const wasm = await getModule();
    const result = generateUrn(wasm, request.input, request.params);
    const response: UrnWorkerResponse = { id: request.id, ...result };
    self.postMessage(response, [result.body, result.lid]);
  } catch (error) {
    const response: UrnWorkerResponse = {
      id: request.id,
      error: error instanceof Error ? error.message : 'La generación local de la urna falló.',
    };
    self.postMessage(response);
  }
};

async function getModule(): Promise<ManifoldToplevel> {
  if (!modulePromise) {
    modulePromise = Module({ locateFile: () => manifoldWasmUrl }).then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return modulePromise;
}

function generateUrn(
  wasm: ManifoldToplevel,
  input: ArrayBuffer,
  params: UrnWorkerRequest['params'],
): Omit<UrnWorkerResponse, 'id' | 'error'> & { body: ArrayBuffer; lid: ArrayBuffer } {
  const original = stlToManifold(wasm, input, 'El STL');
  try {
    const initialOuter = prepareOuter(original, 1, params.planarCutMm);
    const initialCavity = createCavity(
      wasm,
      initialOuter,
      params.wallThicknessMm,
      params.innerScale,
    );
    const initialCapacityMl = initialCavity.capacityMl;
    initialCavity.body.delete();
    if (initialCapacityMl <= 0) {
      throw new Error('No se pudo estimar una capacidad interior para esta urna.');
    }
    const requestedScale = Math.cbrt(params.targetCapacityMl / initialCapacityMl);
    const initialBounds = initialOuter.boundingBox();
    const initialExtents = boxExtents(initialBounds);
    const maximumPlateScale = Math.min(
      ...initialExtents.map((extent, index) =>
        extent > 0 ? params.plateSizeMm[index] / extent : Number.POSITIVE_INFINITY,
      ),
    );
    initialOuter.delete();

    let appliedScale = Math.min(requestedScale, maximumPlateScale);
    for (let iteration = 0; iteration < 6; iteration += 1) {
      const capacityMl = estimateCapacityAtScale(wasm, original, appliedScale, params);
      const capacityRatio = params.targetCapacityMl / capacityMl;
      if (Math.abs(capacityRatio - 1) <= 0.01) break;
      const nextScale = Math.max(
        0.05,
        Math.min(maximumPlateScale, appliedScale * Math.cbrt(capacityRatio)),
      );
      if (Math.abs(nextScale - appliedScale) <= 1e-4) break;
      appliedScale = nextScale;
    }

    let outer = prepareOuter(original, appliedScale, params.planarCutMm);
    const cavity = createCavity(
      wasm,
      outer,
      params.wallThicknessMm,
      params.innerScale,
    );
    let body = cavity.body;
    const rest = buildRingExtrusion(
      wasm,
      cavity.openingRing,
      offsetRing(cavity.openingRing, -LID_SEAT_WIDTH_MM),
      LID_REST_HEIGHT_MM,
      0,
    );
    body = replaceManifold(body, wasm.Manifold.union([body, rest]));
    rest.delete();
    if (body.numTri() === 0) {
      body.delete();
      throw new Error('La pared y el asiento de la tapa no pudieron generarse.');
    }

    let lid = buildPressureLid(wasm, cavity.openingRing);
    const bodyBounds = body.boundingBox();
    const lidBoundsBeforeMove = lid.boundingBox();
    lid = replaceManifold(
      lid,
      lid.translate([
        bodyBounds.max[0] - lidBoundsBeforeMove.min[0] + params.partGapMm,
        0,
        -lidBoundsBeforeMove.min[2],
      ]),
    );
    const lidBounds = lid.boundingBox();
    const bodyStl = manifoldToBinaryStl(body);
    const lidStl = manifoldToBinaryStl(lid);
    body.delete();
    lid.delete();
    outer.delete();

    const warnings = [
      'La capacidad se estima a partir de la geometría STL suponiendo unidades en milímetros.',
      'La tapa conserva una falda de presión y cuatro nervaduras distribuidas cada 90°.',
      'La urna fue procesada localmente en este navegador.',
    ];
    if (appliedScale + 1e-6 < requestedScale) {
      warnings.push('La capacidad solicitada fue limitada por la cama de impresión de 250 × 250 × 250 mm.');
    }
    return {
      body: bodyStl,
      lid: lidStl,
      lidBounds,
      metadata: {
        size: params.size,
        target_capacity_ml: params.targetCapacityMl,
        initial_capacity_ml: initialCapacityMl,
        estimated_capacity_ml: cavity.capacityMl,
        requested_scale: requestedScale,
        applied_scale: appliedScale,
        pressure_rib_count: RIB_COUNT,
      },
      warnings,
    };
  } finally {
    original.delete();
  }
}

function estimateCapacityAtScale(
  wasm: ManifoldToplevel,
  original: Manifold,
  scale: number,
  params: UrnWorkerRequest['params'],
): number {
  const outer = prepareOuter(original, scale, params.planarCutMm);
  try {
    const cavity = createCavity(
      wasm,
      outer,
      params.wallThicknessMm,
      params.innerScale,
    );
    const capacityMl = cavity.capacityMl;
    cavity.body.delete();
    return capacityMl;
  } finally {
    outer.delete();
  }
}

function prepareOuter(original: Manifold, scale: number, cutMm: number): Manifold {
  const bounds = original.boundingBox();
  const center: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  let outer = original.translate([-center[0], -center[1], -center[2]]);
  outer = replaceManifold(outer, outer.scale(scale));
  outer = replaceManifold(outer, outer.translate(center));
  const scaledBounds = outer.boundingBox();
  const cutHeight = scaledBounds.min[2] + cutMm;
  if (cutHeight >= scaledBounds.max[2] - 0.1) {
    outer.delete();
    throw new Error('El corte de base elimina el modelo completo.');
  }
  if (cutMm > 0) {
    outer = replaceManifold(outer, outer.trimByPlane([0, 0, 1], cutHeight));
  }
  return moveBoundsMinimumToOrigin(outer);
}

function createCavity(
  wasm: ManifoldToplevel,
  outer: Manifold,
  wallThicknessMm: number,
  innerScale: number,
): CavityResult {
  const lofted = buildLoftedCavity(wasm, outer, wallThicknessMm);
  let cutter: Manifold;
  let openingRing: number[][];
  if (lofted) {
    cutter = lofted.cutter;
    openingRing = lofted.openingRing;
  } else {
    const fallback = buildScaledCavity(outer, wallThicknessMm, innerScale);
    cutter = fallback.cutter;
    openingRing = fallback.openingRing;
  }
  const body = wasm.Manifold.difference(outer, cutter);
  const capacityMl = Math.max(0, cutter.volume() / 1000);
  cutter.delete();
  if (body.numTri() === 0 || capacityMl <= 0) {
    body.delete();
    throw new Error('No fue posible crear una cavidad cerrada dentro del modelo.');
  }
  return {
    body: keepLargest(body, 'La cavidad separó el cuerpo de la urna.'),
    capacityMl,
    openingRing,
  };
}

function buildLoftedCavity(
  wasm: ManifoldToplevel,
  outer: Manifold,
  wallThicknessMm: number,
  sliceCount = 36,
  ringCount = 96,
): { cutter: Manifold; openingRing: number[][] } | undefined {
  const bounds = outer.boundingBox();
  const height = bounds.max[2] - bounds.min[2];
  if (height <= 0) return undefined;
  const wall = Math.max(0.25, wallThicknessMm);
  const center: [number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
  ];
  const baseProbe = bounds.min[2] + Math.min(Math.max(0.05, height * 0.002), 0.25);
  const basePolygons = sectionPolygons(outer, baseProbe);
  if (basePolygons.length === 0) return undefined;
  const openingRing = radialInsetRing(basePolygons[0], center, ringCount, wall);
  if (!openingRing) return undefined;
  const rings: Array<{ z: number; points: number[][] }> = [
    { z: bounds.min[2] - 0.2, points: openingRing },
  ];
  const sampleStart = bounds.min[2] + Math.max(0.5, height * 0.015);
  const sampleEnd = bounds.max[2] - Math.max(wall * 1.5, height * 0.03);
  for (let index = 0; index < sliceCount; index += 1) {
    const z = sampleStart + (sampleEnd - sampleStart) * (index / Math.max(1, sliceCount - 1));
    const polygons = sectionPolygons(outer, z);
    if (polygons.length === 0) continue;
    const ring = radialInsetRing(polygons[0], center, ringCount, wall);
    if (ring && Math.abs(polygonArea(ring)) >= 1) rings.push({ z, points: ring });
  }
  if (rings.length < 3) return undefined;
  const cutter = loftRingsToManifold(wasm, rings, ringCount);
  return cutter ? { cutter, openingRing } : undefined;
}

function buildScaledCavity(
  outer: Manifold,
  wallThicknessMm: number,
  requestedScale: number,
): { cutter: Manifold; openingRing: number[][] } {
  const bounds = outer.boundingBox();
  const extents = boxExtents(bounds);
  const maximumScale = Math.max(
    0.05,
    Math.min(
      (extents[0] - wallThicknessMm * 2) / extents[0],
      (extents[1] - wallThicknessMm * 2) / extents[1],
      0.98,
    ),
  );
  const scale = Math.min(requestedScale, maximumScale);
  const center: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  let cutter = outer.translate([-center[0], -center[1], -center[2]]);
  cutter = replaceManifold(cutter, cutter.scale(scale));
  cutter = replaceManifold(cutter, cutter.translate(center));
  const innerBounds = cutter.boundingBox();
  cutter = replaceManifold(
    cutter,
    cutter.translate([0, 0, bounds.min[2] - innerBounds.min[2] - 0.05]),
  );
  const shiftedBounds = cutter.boundingBox();
  const polygons = sectionPolygons(cutter, shiftedBounds.min[2] + 0.1);
  if (polygons.length === 0) {
    cutter.delete();
    throw new Error('No se pudo obtener la abertura de la cavidad.');
  }
  return { cutter, openingRing: resamplePolygon(polygons[0], 96) };
}

function buildPressureLid(wasm: ManifoldToplevel, openingRing: number[][]): Manifold {
  const plate = extrudePolygon(wasm, openingRing, LID_THICKNESS_MM, 0);
  const skirtRing = offsetRing(openingRing, -(LID_SEAT_WIDTH_MM + LID_FIT_CLEARANCE_MM));
  const skirt = extrudePolygon(wasm, skirtRing, LID_SKIRT_HEIGHT_MM, LID_THICKNESS_MM);
  const center = polygonCenter(skirtRing);
  const ribs: Manifold[] = [];
  for (let index = 0; index < RIB_COUNT; index += 1) {
    const angle = Math.PI * 2 * index / RIB_COUNT;
    const radial: [number, number] = [Math.cos(angle), Math.sin(angle)];
    const radius = rayPolygonRadius(skirtRing, center, radial);
    if (radius === undefined) continue;
    const ribCenter: [number, number] = [
      center[0] + radial[0] * (radius + RIB_DEPTH_MM / 2 - 0.03),
      center[1] + radial[1] * (radius + RIB_DEPTH_MM / 2 - 0.03),
    ];
    let rib = wasm.Manifold.cube([RIB_DEPTH_MM, RIB_WIDTH_MM, RIB_HEIGHT_MM]);
    rib = replaceManifold(
      rib,
      rib.translate([-RIB_DEPTH_MM / 2, -RIB_WIDTH_MM / 2, RIB_Z_MIN_MM]),
    );
    rib = replaceManifold(rib, rib.rotate([0, 0, angle * 180 / Math.PI]));
    rib = replaceManifold(rib, rib.translate([ribCenter[0], ribCenter[1], 0]));
    ribs.push(rib);
  }
  let lid = wasm.Manifold.union([plate, skirt, ...ribs]);
  plate.delete();
  skirt.delete();
  ribs.forEach((rib) => rib.delete());
  if (ribs.length !== RIB_COUNT || lid.numTri() === 0) {
    lid.delete();
    throw new Error('La tapa no pudo conservar sus cuatro nervaduras de presión.');
  }
  return lid;
}

function extrudePolygon(
  wasm: ManifoldToplevel,
  polygon: number[][],
  height: number,
  z: number,
): Manifold {
  const oriented = polygonArea(polygon) < 0 ? [...polygon].reverse() : polygon;
  const section = new wasm.CrossSection([asSimplePolygon(oriented)]);
  const solid = section.extrude(height).translate([0, 0, z]);
  section.delete();
  return solid;
}

function buildRingExtrusion(
  wasm: ManifoldToplevel,
  outer: number[][],
  inner: number[][],
  height: number,
  z: number,
): Manifold {
  const outerSection = new wasm.CrossSection([
    asSimplePolygon(polygonArea(outer) < 0 ? [...outer].reverse() : outer),
  ]);
  const innerSection = new wasm.CrossSection([
    asSimplePolygon(polygonArea(inner) < 0 ? [...inner].reverse() : inner),
  ]);
  const ringSection = wasm.CrossSection.difference([outerSection, innerSection]);
  const ring = ringSection.extrude(height).translate([0, 0, z]);
  outerSection.delete();
  innerSection.delete();
  ringSection.delete();
  return ring;
}

function loftRingsToManifold(
  wasm: ManifoldToplevel,
  rings: Array<{ z: number; points: number[][] }>,
  ringCount: number,
): Manifold | undefined {
  const vertices = new Float32Array((rings.length * ringCount + 2) * 3);
  rings.forEach((ring, ringIndex) => {
    ring.points.forEach((point, pointIndex) => {
      const offset = (ringIndex * ringCount + pointIndex) * 3;
      vertices[offset] = point[0];
      vertices[offset + 1] = point[1];
      vertices[offset + 2] = ring.z;
    });
  });
  const bottomCenterIndex = rings.length * ringCount;
  const topCenterIndex = bottomCenterIndex + 1;
  const bottomCenter = polygonCenter(rings[0].points);
  const topCenter = polygonCenter(rings[rings.length - 1].points);
  vertices.set([bottomCenter[0], bottomCenter[1], rings[0].z], bottomCenterIndex * 3);
  vertices.set([topCenter[0], topCenter[1], rings[rings.length - 1].z], topCenterIndex * 3);
  const triangles: number[] = [];
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const current = ringIndex * ringCount;
    const next = (ringIndex + 1) * ringCount;
    for (let index = 0; index < ringCount; index += 1) {
      const following = (index + 1) % ringCount;
      triangles.push(current + index, current + following, next + following);
      triangles.push(current + index, next + following, next + index);
    }
  }
  const last = (rings.length - 1) * ringCount;
  for (let index = 0; index < ringCount; index += 1) {
    const following = (index + 1) % ringCount;
    triangles.push(bottomCenterIndex, following, index);
    triangles.push(topCenterIndex, last + index, last + following);
  }
  try {
    const mesh = new wasm.Mesh({
      numProp: 3,
      vertProperties: vertices,
      triVerts: new Uint32Array(triangles),
    });
    return new wasm.Manifold(mesh);
  } catch {
    return undefined;
  }
}

function sectionPolygons(manifold: Manifold, z: number): number[][][] {
  const section = manifold.slice(z);
  const polygons = section.toPolygons()
    .map((polygon) => decimateLoop(polygon, 1200))
    .filter((polygon) => polygon.length >= 3 && Math.abs(polygonArea(polygon)) > 0.1)
    .sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
  section.delete();
  return polygons;
}

function radialInsetRing(
  polygon: number[][],
  requestedCenter: [number, number],
  ringCount: number,
  wallThicknessMm: number,
): number[][] | undefined {
  const center = pointInPolygon(requestedCenter, polygon)
    ? requestedCenter
    : polygonCenter(polygon);
  if (!pointInPolygon(center, polygon)) return undefined;
  const points: number[][] = [];
  for (let index = 0; index < ringCount; index += 1) {
    const angle = Math.PI * 2 * index / ringCount;
    const direction: [number, number] = [Math.cos(angle), Math.sin(angle)];
    const radius = rayPolygonRadius(polygon, center, direction);
    if (radius === undefined || radius <= wallThicknessMm + 0.05) return undefined;
    points.push([
      center[0] + direction[0] * (radius - wallThicknessMm),
      center[1] + direction[1] * (radius - wallThicknessMm),
    ]);
  }
  return points;
}

function rayPolygonRadius(
  polygon: number[][],
  center: [number, number],
  direction: [number, number],
): number | undefined {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < polygon.length; index += 1) {
    const start = polygon[index];
    const end = polygon[(index + 1) % polygon.length];
    const edgeX = end[0] - start[0];
    const edgeY = end[1] - start[1];
    const denominator = direction[0] * edgeY - direction[1] * edgeX;
    if (Math.abs(denominator) <= 1e-9) continue;
    const relativeX = start[0] - center[0];
    const relativeY = start[1] - center[1];
    const distance = (relativeX * edgeY - relativeY * edgeX) / denominator;
    const edgePosition = (relativeX * direction[1] - relativeY * direction[0]) / denominator;
    if (distance > 1e-6 && edgePosition >= -1e-7 && edgePosition <= 1 + 1e-7) {
      nearest = Math.min(nearest, distance);
    }
  }
  return Number.isFinite(nearest) ? nearest : undefined;
}

function offsetRing(ring: number[][], distance: number): number[][] {
  const center = polygonCenter(ring);
  return ring.map((point) => {
    const dx = point[0] - center[0];
    const dy = point[1] - center[1];
    const radius = Math.max(Math.hypot(dx, dy), 1e-6);
    const nextRadius = Math.max(0.05, radius + distance);
    return [center[0] + dx / radius * nextRadius, center[1] + dy / radius * nextRadius];
  });
}

function resamplePolygon(polygon: number[][], count: number): number[][] {
  if (polygon.length === count) return polygon;
  const closed = [...polygon, polygon[0]];
  const lengths = polygon.map((point, index) =>
    Math.hypot(closed[index + 1][0] - point[0], closed[index + 1][1] - point[1]),
  );
  const perimeter = lengths.reduce((sum, length) => sum + length, 0);
  const result: number[][] = [];
  let segment = 0;
  let accumulated = 0;
  for (let index = 0; index < count; index += 1) {
    const target = perimeter * index / count;
    while (segment < lengths.length - 1 && accumulated + lengths[segment] < target) {
      accumulated += lengths[segment];
      segment += 1;
    }
    const fraction = lengths[segment] <= 1e-9 ? 0 : (target - accumulated) / lengths[segment];
    result.push([
      closed[segment][0] + (closed[segment + 1][0] - closed[segment][0]) * fraction,
      closed[segment][1] + (closed[segment + 1][1] - closed[segment][1]) * fraction,
    ]);
  }
  return result;
}

function pointInPolygon(point: [number, number], polygon: number[][]): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (
      (currentPoint[1] > point[1]) !== (previousPoint[1] > point[1]) &&
      point[0] <
        ((previousPoint[0] - currentPoint[0]) * (point[1] - currentPoint[1])) /
          (previousPoint[1] - currentPoint[1]) + currentPoint[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function polygonArea(polygon: number[][]): number {
  let area = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function polygonCenter(polygon: number[][]): [number, number] {
  const sum = polygon.reduce(
    (total, point) => [total[0] + point[0], total[1] + point[1]],
    [0, 0],
  );
  return [sum[0] / polygon.length, sum[1] / polygon.length];
}

function asSimplePolygon(polygon: number[][]): Array<[number, number]> {
  return polygon.map((point) => [point[0], point[1]]);
}

function decimateLoop(loop: number[][], maximumPoints: number): number[][] {
  if (loop.length <= maximumPoints) return loop;
  const step = loop.length / maximumPoints;
  return Array.from({ length: maximumPoints }, (_, index) => loop[Math.floor(index * step)]);
}

function stlToManifold(
  wasm: ManifoldToplevel,
  buffer: ArrayBuffer,
  label: string,
): Manifold {
  const parsed = new STLLoader().parse(buffer);
  parsed.deleteAttribute('normal');
  const geometry = mergeVertices(parsed, 1e-5);
  parsed.dispose();
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index || position.count < 4 || index.count < 12) {
    geometry.dispose();
    throw new Error(`${label} no contiene una malla sólida válida.`);
  }
  const vertices = new Float32Array(position.count * 3);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    vertices[vertex * 3] = position.getX(vertex);
    vertices[vertex * 3 + 1] = position.getY(vertex);
    vertices[vertex * 3 + 2] = position.getZ(vertex);
  }
  const triangles = new Uint32Array(index.count);
  for (let triangle = 0; triangle < index.count; triangle += 1) triangles[triangle] = index.getX(triangle);
  geometry.dispose();
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: vertices, triVerts: triangles });
  mesh.merge();
  try {
    return new wasm.Manifold(mesh);
  } catch {
    throw new Error(`${label} debe ser hermético y representar un volumen válido.`);
  }
}

function keepLargest(manifold: Manifold, errorMessage: string): Manifold {
  const parts = manifold.decompose();
  if (parts.length === 0 || manifold.numTri() === 0) {
    manifold.delete();
    throw new Error(errorMessage);
  }
  if (parts.length === 1) {
    parts[0].delete();
    return manifold;
  }
  let largest = parts[0];
  for (let index = 1; index < parts.length; index += 1) {
    if (Math.abs(parts[index].volume()) > Math.abs(largest.volume())) largest = parts[index];
  }
  parts.forEach((part) => {
    if (part !== largest) part.delete();
  });
  manifold.delete();
  return largest;
}

function moveBoundsMinimumToOrigin(manifold: Manifold): Manifold {
  const bounds = manifold.boundingBox();
  return replaceManifold(
    manifold,
    manifold.translate([-bounds.min[0], -bounds.min[1], -bounds.min[2]]),
  );
}

function replaceManifold(previous: Manifold, next: Manifold): Manifold {
  previous.delete();
  return next;
}

function boxExtents(bounds: { min: number[]; max: number[] }): [number, number, number] {
  return [
    bounds.max[0] - bounds.min[0],
    bounds.max[1] - bounds.min[1],
    bounds.max[2] - bounds.min[2],
  ];
}

function manifoldToBinaryStl(manifold: Manifold): ArrayBuffer {
  const mesh = manifold.getMesh();
  const triangleCount = mesh.triVerts.length / 3;
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangleCount, true);
  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const points = [0, 1, 2].map((corner) => {
      const vertex = mesh.triVerts[triangle * 3 + corner];
      const property = vertex * mesh.numProp;
      return [
        mesh.vertProperties[property],
        mesh.vertProperties[property + 1],
        mesh.vertProperties[property + 2],
      ];
    });
    const normal = triangleNormal(points[0], points[1], points[2]);
    for (const value of normal) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
    for (const point of points) {
      for (const value of point) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}

function triangleNormal(a: number[], b: number[], c: number[]): [number, number, number] {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal: [number, number, number] = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const length = Math.hypot(...normal) || 1;
  return [normal[0] / length, normal[1] / length, normal[2] / length];
}

export {};
