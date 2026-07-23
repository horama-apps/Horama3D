/// <reference lib="webworker" />

import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d';
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

interface LampWorkerRequest {
  id: number;
  input: ArrayBuffer;
  topUrl: string;
  baseUrl: string;
  params: {
    baseThicknessMm: number;
    innerScale: number;
    planarCutMm: number;
    connectorMarginMm: number;
    partGapMm: number;
    fitClearanceMm: number;
  };
}

interface LampMetadata {
  applied_scale: number;
  minimum_xy_mm: number[];
  attachment_center_xy_mm: number[];
  attachment_clearance_mm: number;
  effective_wall_thickness_mm: number;
  estimated_capacity_ml: number;
}

interface LampWorkerResponse {
  id: number;
  body?: ArrayBuffer;
  base?: ArrayBuffer;
  metadata?: LampMetadata;
  warnings?: string[];
  error?: string;
}

const ADAPTER_OVERLAP_MM = 1.5;
const ADAPTER_THICKNESS_MM = 2;
const ADAPTER_RADIAL_OVERLAP_MM = 2.5;
const BASE_THROAT_EXTRA_HEIGHT_MM = 2;
const ATTACHMENT_FIT_TOLERANCE_MM = 0.75;
const MAX_AUTOMATIC_SCALE = 10;

let modulePromise: Promise<ManifoldToplevel> | undefined;

self.onmessage = async (event: MessageEvent<LampWorkerRequest>) => {
  const request = event.data;
  try {
    const wasm = await getModule();
    const [topBuffer, baseBuffer] = await Promise.all([
      fetchBuffer(request.topUrl),
      fetchBuffer(request.baseUrl),
    ]);
    const result = generateLamp(
      wasm,
      request.input,
      topBuffer,
      baseBuffer,
      request.params,
    );
    const response: LampWorkerResponse = { id: request.id, ...result };
    self.postMessage(response, [result.body, result.base]);
  } catch (error) {
    const response: LampWorkerResponse = {
      id: request.id,
      error: error instanceof Error ? error.message : 'Local lamp generation failed.',
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

async function fetchBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load lamp asset: ${url}`);
  return response.arrayBuffer();
}

function generateLamp(
  wasm: ManifoldToplevel,
  inputBuffer: ArrayBuffer,
  topBuffer: ArrayBuffer,
  baseBuffer: ArrayBuffer,
  params: LampWorkerRequest['params'],
): Omit<LampWorkerResponse, 'id' | 'error'> & { body: ArrayBuffer; base: ArrayBuffer } {
  let outer = stlToManifold(wasm, inputBuffer, 'uploaded STL');
  let top = stlToManifold(wasm, topBuffer, 'top lamp');
  let base = stlToManifold(wasm, baseBuffer, 'base lamp');

  try {
    const initialBounds = outer.boundingBox();
    const cutHeight = initialBounds.min[2] + params.planarCutMm;
    if (cutHeight >= initialBounds.max[2] - 0.1) {
      throw new Error('The planar cut removes the complete model.');
    }
    outer = replaceManifold(outer, outer.trimByPlane([0, 0, 1], cutHeight));
    outer = moveBoundsMinimumToOrigin(outer);

    const topBounds = top.boundingBox();
    const topExtents = boxExtents(topBounds);
    const minimumXY = [
      topExtents[0] + params.connectorMarginMm * 2,
      topExtents[1] + params.connectorMarginMm * 2,
    ];
    let appliedScale = Math.max(
      1,
      minimumXY[0] / boxExtents(outer.boundingBox())[0],
      minimumXY[1] / boxExtents(outer.boundingBox())[1],
    );
    if (appliedScale > 1) {
      outer = replaceManifold(outer, outer.scale(appliedScale));
    }

    const requiredRadius = footprintRadius(top) + params.connectorMarginMm;
    let fit = findAttachmentFit(outer, top);
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if (fit.clearance + ATTACHMENT_FIT_TOLERANCE_MM >= requiredRadius) break;
      const localScale = requiredRadius / Math.max(
        fit.clearance - ATTACHMENT_FIT_TOLERANCE_MM,
        1,
      );
      if (appliedScale * localScale > MAX_AUTOMATIC_SCALE) {
        throw new Error('The lamp connector requires an impractically large model scale.');
      }
      outer = replaceManifold(outer, outer.scale(localScale));
      appliedScale *= localScale;
      fit = findAttachmentFit(outer, top);
    }
    if (fit.clearance + ATTACHMENT_FIT_TOLERANCE_MM < requiredRadius) {
      throw new Error('The top mount does not fit inside the model base.');
    }

    const cavity = buildSafeCavity(
      wasm,
      outer,
      params.innerScale,
      params.baseThicknessMm,
      fit.center,
    );
    let body = cavity.body;

    const alignedTopBounds = top.boundingBox();
    top = replaceManifold(
      top,
      top.translate([
        fit.center[0] - (alignedTopBounds.min[0] + alignedTopBounds.max[0]) / 2,
        fit.center[1] - (alignedTopBounds.min[1] + alignedTopBounds.max[1]) / 2,
        -alignedTopBounds.min[2],
      ]),
    );

    const adapter = buildAttachmentAdapter(wasm, outer, top);
    body = replaceManifold(body, wasm.Manifold.union([body, adapter]));
    adapter.delete();

    const throat = buildBaseInsertionThroat(
      wasm,
      base,
      top,
      params.fitClearanceMm,
    );
    body = replaceManifold(body, wasm.Manifold.difference(body, throat));
    throat.delete();
    body = replaceManifold(body, wasm.Manifold.union([body, top]));

    const components = body.decompose();
    const componentCount = components.length;
    components.forEach((component) => component.delete());
    if (componentCount !== 1) {
      throw new Error('The top mount could not be joined to the lamp body.');
    }

    body = moveBoundsMinimumToBed(body);
    base = moveBoundsMinimumToBed(base);
    const bodyBounds = body.boundingBox();
    const baseBounds = base.boundingBox();
    base = replaceManifold(
      base,
      base.translate([
        bodyBounds.max[0] - baseBounds.min[0] + params.partGapMm,
        0,
        0,
      ]),
    );

    const bodyStl = manifoldToBinaryStl(body);
    const baseStl = manifoldToBinaryStl(base);
    const warnings = [
      'The STL was processed locally in this browser.',
      'The model was hollowed with a bottom opening for the lamp base.',
    ];
    if (appliedScale > 1.0001) {
      warnings.push('The model was uniformly enlarged to cover the top lamp connector.');
    }

    return {
      body: bodyStl,
      base: baseStl,
      metadata: {
        applied_scale: appliedScale,
        minimum_xy_mm: minimumXY,
        attachment_center_xy_mm: fit.center,
        attachment_clearance_mm: fit.clearance,
        effective_wall_thickness_mm: cavity.wallThickness,
        estimated_capacity_ml: cavity.capacityMm3 / 1000,
      },
      warnings,
    };
  } finally {
    outer.delete();
    top.delete();
    base.delete();
  }
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
    throw new Error(`${label} does not contain a valid solid mesh.`);
  }

  const vertices = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    vertices[i * 3] = position.getX(i);
    vertices[i * 3 + 1] = position.getY(i);
    vertices[i * 3 + 2] = position.getZ(i);
  }
  const triangles = new Uint32Array(index.count);
  for (let i = 0; i < index.count; i += 1) triangles[i] = index.getX(i);
  geometry.dispose();

  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: vertices,
    triVerts: triangles,
  });
  mesh.merge();
  try {
    return new wasm.Manifold(mesh);
  } catch {
    throw new Error(`${label} must be watertight and represent a valid volume.`);
  }
}

function buildSafeCavity(
  wasm: ManifoldToplevel,
  outer: Manifold,
  requestedScale: number,
  baseThicknessMm: number,
  cavityCenterXY: [number, number],
): { body: Manifold; wallThickness: number; capacityMm3: number } {
  const bounds = outer.boundingBox();
  const extents = boxExtents(bounds);
  const minimumExtent = Math.min(extents[0], extents[1]);
  const scaledWall = minimumExtent * (1 - requestedScale) / 2;
  const startingWall = Math.max(baseThicknessMm, scaledWall);
  const maximumWall = Math.max(startingWall, minimumExtent * 0.42);
  const outerGenus = outer.genus();
  const wallCandidates: number[] = [];
  let wall = startingWall;
  while (wall <= maximumWall + 1e-6 && wallCandidates.length < 6) {
    wallCandidates.push(wall);
    wall = Math.max(wall + 2, wall * 1.2);
  }
  if (wallCandidates[wallCandidates.length - 1] < maximumWall) {
    wallCandidates.push(maximumWall);
  }

  for (const candidateWall of wallCandidates) {
    let inner = buildLoftedSilhouetteCutter(
      wasm,
      outer,
      candidateWall,
      cavityCenterXY,
    );
    let scale = requestedScale;
    if (!inner) {
      const maximumScale = Math.max(
        0.05,
        Math.min(
          (extents[0] - candidateWall * 2) / extents[0],
          (extents[1] - candidateWall * 2) / extents[1],
          (extents[2] - candidateWall * 1.5) / extents[2],
        ),
      );
      scale = Math.min(requestedScale, maximumScale);
      const center = boxCenter(bounds);
      let translated = outer.translate([-center[0], -center[1], -center[2]]);
      let scaled = translated.scale(scale);
      translated.delete();
      inner = scaled.translate(center);
      scaled.delete();
      const innerBounds = inner.boundingBox();
      inner = replaceManifold(
        inner,
        inner.translate([0, 0, bounds.min[2] - innerBounds.min[2] - 0.05]),
      );
    }
    const body = wasm.Manifold.difference(outer, inner);
    const parts = body.decompose();
    const safe = parts.length === 1 && body.genus() <= outerGenus;
    parts.forEach((part) => part.delete());
    const capacityMm3 = Math.max(0, outer.volume() - body.volume());
    inner.delete();
    if (safe && capacityMm3 > 1) {
      return {
        body,
        wallThickness: Math.max(candidateWall, minimumExtent * (1 - scale) / 2),
        capacityMm3,
      };
    }
    body.delete();
  }
  throw new Error('Unable to create a closed cavity without perforating the model exterior.');
}

function buildLoftedSilhouetteCutter(
  wasm: ManifoldToplevel,
  outer: Manifold,
  wallThicknessMm: number,
  preferredCenter: [number, number],
  sliceCount = 36,
  ringCount = 96,
): Manifold | undefined {
  const bounds = outer.boundingBox();
  const height = bounds.max[2] - bounds.min[2];
  if (height <= 0) return undefined;
  const center: [number, number] = preferredCenter;
  const rings: Array<{ z: number; points: number[][] }> = [];
  const openingZ = bounds.min[2] - 0.2;
  const baseProbe = bounds.min[2] + Math.min(Math.max(0.05, height * 0.002), 0.25);
  const basePolygons = sectionPolygons(outer, baseProbe);
  if (basePolygons.length === 0) return undefined;
  const openingRing = radialInsetRing(
    largestPolygon(basePolygons),
    center,
    ringCount,
    wallThicknessMm,
  );
  if (!openingRing) return undefined;
  rings.push({ z: openingZ, points: openingRing });

  const sampleStart = bounds.min[2] + Math.max(0.5, height * 0.015);
  const sampleEnd = bounds.max[2] - Math.max(wallThicknessMm * 1.5, height * 0.03);
  for (let index = 0; index < sliceCount; index += 1) {
    const z = sampleStart + (sampleEnd - sampleStart) * (index / Math.max(1, sliceCount - 1));
    const polygons = sectionPolygons(outer, z);
    if (polygons.length === 0) continue;
    const sorted = [...polygons].sort(
      (a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)),
    );
    if (
      sorted.length > 1 &&
      Math.abs(polygonArea(sorted[1])) > Math.abs(polygonArea(sorted[0])) * 0.08 &&
      rings.length >= 3
    ) {
      break;
    }
    const ring = radialInsetRing(sorted[0], center, ringCount, wallThicknessMm);
    if (ring && Math.abs(polygonArea(ring)) >= 1) rings.push({ z, points: ring });
  }
  if (rings.length < 3) return undefined;

  const vertexCount = rings.length * ringCount + 2;
  const vertices = new Float32Array(vertexCount * 3);
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
  vertices.set(
    [topCenter[0], topCenter[1], rings[rings.length - 1].z],
    topCenterIndex * 3,
  );

  const triangles: number[] = [];
  for (let ringIndex = 0; ringIndex < rings.length - 1; ringIndex += 1) {
    const current = ringIndex * ringCount;
    const next = (ringIndex + 1) * ringCount;
    for (let i = 0; i < ringCount; i += 1) {
      const j = (i + 1) % ringCount;
      triangles.push(current + i, current + j, next + j);
      triangles.push(current + i, next + j, next + i);
    }
  }
  const last = (rings.length - 1) * ringCount;
  for (let i = 0; i < ringCount; i += 1) {
    const j = (i + 1) % ringCount;
    triangles.push(bottomCenterIndex, j, i);
    triangles.push(topCenterIndex, last + i, last + j);
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
  const polygons = section.toPolygons().map((polygon) => decimateLoop(polygon, 1200));
  section.delete();
  return polygons.filter((polygon) => polygon.length >= 3 && Math.abs(polygonArea(polygon)) > 0.1);
}

function largestPolygon(polygons: number[][][]): number[][] {
  return polygons.reduce((best, polygon) =>
    Math.abs(polygonArea(polygon)) > Math.abs(polygonArea(best)) ? polygon : best,
  );
}

function radialInsetRing(
  polygon: number[][],
  requestedCenter: [number, number],
  ringCount: number,
  wallThicknessMm: number,
): number[][] | undefined {
  const center = pointInPolygons(requestedCenter[0], requestedCenter[1], [polygon])
    ? requestedCenter
    : polygonCenter(polygon);
  if (!pointInPolygons(center[0], center[1], [polygon])) return undefined;
  const points: number[][] = [];
  for (let index = 0; index < ringCount; index += 1) {
    const angle = Math.PI * 2 * index / ringCount;
    const direction = [Math.cos(angle), Math.sin(angle)];
    let nearest = Number.POSITIVE_INFINITY;
    for (let i = 0; i < polygon.length; i += 1) {
      const start = polygon[i];
      const end = polygon[(i + 1) % polygon.length];
      const edgeX = end[0] - start[0];
      const edgeY = end[1] - start[1];
      const denominator = direction[0] * edgeY - direction[1] * edgeX;
      if (Math.abs(denominator) <= 1e-9) continue;
      const relativeX = start[0] - center[0];
      const relativeY = start[1] - center[1];
      const t = (relativeX * edgeY - relativeY * edgeX) / denominator;
      const u = (relativeX * direction[1] - relativeY * direction[0]) / denominator;
      if (t > 1e-6 && u >= -1e-7 && u <= 1 + 1e-7) nearest = Math.min(nearest, t);
    }
    if (!Number.isFinite(nearest) || nearest <= wallThicknessMm + 0.05) return undefined;
    const radius = nearest - wallThicknessMm;
    points.push([
      center[0] + direction[0] * radius,
      center[1] + direction[1] * radius,
    ]);
  }
  return points;
}

function findAttachmentFit(
  outer: Manifold,
  top: Manifold,
): { center: [number, number]; clearance: number } {
  const outerBounds = outer.boundingBox();
  const topBounds = top.boundingBox();
  const zMin = Math.max(outerBounds.min[2] + 0.5, topBounds.min[2] + 1);
  const zMax = Math.min(outerBounds.max[2] - 0.1, topBounds.max[2] - 1);
  if (zMax <= zMin) throw new Error('The model is too short for the lamp top mount.');

  const sections: number[][][][] = [];
  for (let i = 0; i < 4; i += 1) {
    const z = zMin + (zMax - zMin) * (i / 3);
    const section = outer.slice(z);
    const polygons = section.toPolygons().map((polygon) => decimateLoop(polygon, 420));
    section.delete();
    if (polygons.length > 0) sections.push(polygons);
  }
  if (sections.length === 0) {
    throw new Error('Unable to measure the model base for top mount placement.');
  }

  let best = searchAttachmentGrid(
    sections,
    outerBounds.min[0],
    outerBounds.max[0],
    outerBounds.min[1],
    outerBounds.max[1],
    2,
  );
  if (!best) throw new Error('Unable to fit the top mount inside the model base.');
  best = searchAttachmentGrid(
    sections,
    best.center[0] - 3,
    best.center[0] + 3,
    best.center[1] - 3,
    best.center[1] + 3,
    0.5,
  ) ?? best;
  return best;
}

function searchAttachmentGrid(
  sections: number[][][][],
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  pitch: number,
): { center: [number, number]; clearance: number } | undefined {
  let best: { center: [number, number]; clearance: number } | undefined;
  for (let y = minY; y <= maxY; y += pitch) {
    for (let x = minX; x <= maxX; x += pitch) {
      let clearance = Number.POSITIVE_INFINITY;
      let inside = true;
      for (const polygons of sections) {
        if (!pointInPolygons(x, y, polygons)) {
          inside = false;
          break;
        }
        clearance = Math.min(clearance, distanceToPolygons(x, y, polygons));
      }
      if (inside && (!best || clearance > best.clearance)) {
        best = { center: [x, y], clearance };
      }
    }
  }
  return best;
}

function pointInPolygons(x: number, y: number, polygons: number[][][]): boolean {
  let inside = false;
  for (const polygon of polygons) {
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
      const xi = polygon[i][0];
      const yi = polygon[i][1];
      const xj = polygon[j][0];
      const yj = polygon[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function distanceToPolygons(x: number, y: number, polygons: number[][][]): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i += 1) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      minimum = Math.min(minimum, pointSegmentDistance(x, y, a[0], a[1], b[0], b[1]));
    }
  }
  return minimum;
}

function pointSegmentDistance(
  x: number,
  y: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared <= 1e-12
    ? 0
    : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSquared));
  return Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
}

function decimateLoop(loop: number[][], maximumPoints: number): number[][] {
  if (loop.length <= maximumPoints) return loop;
  const step = loop.length / maximumPoints;
  return Array.from({ length: maximumPoints }, (_, index) => loop[Math.floor(index * step)]);
}

function buildAttachmentAdapter(
  wasm: ManifoldToplevel,
  outer: Manifold,
  top: Manifold,
): Manifold {
  const outerBounds = outer.boundingBox();
  const topBounds = top.boundingBox();
  const slabMinZ = Math.max(0, topBounds.max[2] - ADAPTER_OVERLAP_MM);
  const slabMaxZ = Math.min(outerBounds.max[2], topBounds.max[2] + ADAPTER_THICKNESS_MM);
  if (slabMaxZ <= slabMinZ) throw new Error('Unable to build the top mount adapter.');

  const slab = wasm.Manifold.cube([
    outerBounds.max[0] - outerBounds.min[0] + 4,
    outerBounds.max[1] - outerBounds.min[1] + 4,
    slabMaxZ - slabMinZ,
  ]).translate([outerBounds.min[0] - 2, outerBounds.min[1] - 2, slabMinZ]);
  const band = wasm.Manifold.intersection(outer, slab);
  slab.delete();

  const center = boxCenter(topBounds);
  const openingRadius = Math.max(1, adapterOpeningRadius(top) - ADAPTER_RADIAL_OVERLAP_MM);
  const opening = wasm.Manifold.cylinder(
    slabMaxZ - slabMinZ + 1,
    openingRadius,
    openingRadius,
    128,
  ).translate([center[0], center[1], slabMinZ - 0.5]);
  const adapter = wasm.Manifold.difference(band, opening);
  band.delete();
  opening.delete();
  return adapter;
}

function adapterOpeningRadius(top: Manifold): number {
  const bounds = top.boundingBox();
  const z = bounds.min[2] + (bounds.max[2] - bounds.min[2]) * 0.45;
  const section = top.slice(z);
  const polygons = section.toPolygons();
  section.delete();
  if (polygons.length === 0) return footprintRadius(top) * 0.8;
  const outer = polygons.reduce((best, polygon) =>
    Math.abs(polygonArea(polygon)) > Math.abs(polygonArea(best)) ? polygon : best,
  );
  const center = polygonCenter(outer);
  return Math.min(...outer.map((point) => Math.hypot(point[0] - center[0], point[1] - center[1])));
}

function buildBaseInsertionThroat(
  wasm: ManifoldToplevel,
  base: Manifold,
  top: Manifold,
  clearanceMm: number,
): Manifold {
  const topBounds = top.boundingBox();
  const center = boxCenter(topBounds);
  const radius = footprintRadius(base) + clearanceMm;
  const minZ = -0.5;
  const maxZ = topBounds.max[2] + ADAPTER_THICKNESS_MM + BASE_THROAT_EXTRA_HEIGHT_MM;
  return wasm.Manifold.cylinder(maxZ - minZ, radius, radius, 128)
    .translate([center[0], center[1], minZ]);
}

function footprintRadius(manifold: Manifold): number {
  const bounds = manifold.boundingBox();
  const center = boxCenter(bounds);
  const mesh = manifold.getMesh();
  let radius = 0;
  for (let i = 0; i < mesh.numVert; i += 1) {
    const offset = i * mesh.numProp;
    radius = Math.max(
      radius,
      Math.hypot(
        mesh.vertProperties[offset] - center[0],
        mesh.vertProperties[offset + 1] - center[1],
      ),
    );
  }
  return radius;
}

function moveBoundsMinimumToOrigin(manifold: Manifold): Manifold {
  const bounds = manifold.boundingBox();
  return replaceManifold(
    manifold,
    manifold.translate([-bounds.min[0], -bounds.min[1], -bounds.min[2]]),
  );
}

function moveBoundsMinimumToBed(manifold: Manifold): Manifold {
  const bounds = manifold.boundingBox();
  return replaceManifold(manifold, manifold.translate([0, 0, -bounds.min[2]]));
}

function replaceManifold(previous: Manifold, next: Manifold): Manifold {
  previous.delete();
  return next;
}

function boxExtents(box: { min: number[]; max: number[] }): [number, number, number] {
  return [
    box.max[0] - box.min[0],
    box.max[1] - box.min[1],
    box.max[2] - box.min[2],
  ];
}

function boxCenter(box: { min: number[]; max: number[] }): [number, number, number] {
  return [
    (box.min[0] + box.max[0]) / 2,
    (box.min[1] + box.max[1]) / 2,
    (box.min[2] + box.max[2]) / 2,
  ];
}

function polygonArea(polygon: number[][]): number {
  let area = 0;
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
}

function polygonCenter(polygon: number[][]): [number, number] {
  const total = polygon.reduce((sum, point) => [sum[0] + point[0], sum[1] + point[1]], [0, 0]);
  return [total[0] / polygon.length, total[1] / polygon.length];
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
      const index = vertex * mesh.numProp;
      return [
        mesh.vertProperties[index],
        mesh.vertProperties[index + 1],
        mesh.vertProperties[index + 2],
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
