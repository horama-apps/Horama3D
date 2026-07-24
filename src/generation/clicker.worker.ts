/// <reference lib="webworker" />

import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d';
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

interface ClickerWorkerRequest {
  id: number;
  input: ArrayBuffer;
  baseAssetUrl: string;
  topAssetUrl: string;
  topSolidAssetUrl: string;
  params: {
    scalePercent: number;
    cutHeightMm: number;
    baseProtrusionMm: number;
    partGapMm: number;
  };
}

interface ClickerWorkerResponse {
  id: number;
  bottom?: ArrayBuffer;
  top?: ArrayBuffer;
  cutHeightMm?: number;
  scalePercent?: number;
  warnings?: string[];
  error?: string;
}

const BASE_CUTTER_OVERLAP_MM = 0.05;
const TOP_CUTTER_OVERLAP_MM = 0.25;
const TOP_FUSION_OVERLAP_MM = 0.15;
const TOP_STEM_SUPPORT_OVERLAP_MM = 0.02;
const TOP_CROSS_SLOT_WIDTH_RATIO = 0.27;

let modulePromise: Promise<ManifoldToplevel> | undefined;

self.onmessage = async (event: MessageEvent<ClickerWorkerRequest>) => {
  const request = event.data;
  try {
    const wasm = await getModule();
    const [baseBuffer, topBuffer, topSolidBuffer] = await Promise.all([
      fetchBuffer(request.baseAssetUrl),
      fetchBuffer(request.topAssetUrl),
      fetchBuffer(request.topSolidAssetUrl),
    ]);
    const result = generateClicker(
      wasm,
      request.input,
      baseBuffer,
      topBuffer,
      topSolidBuffer,
      request.params,
    );
    const response: ClickerWorkerResponse = { id: request.id, ...result };
    self.postMessage(response, [result.bottom, result.top]);
  } catch (error) {
    const response: ClickerWorkerResponse = {
      id: request.id,
      error: error instanceof Error ? error.message : 'La generación local del clicker falló.',
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
  if (!response.ok) throw new Error(`No se pudo cargar el recurso de Clickers: ${url}`);
  return response.arrayBuffer();
}

function generateClicker(
  wasm: ManifoldToplevel,
  input: ArrayBuffer,
  baseBuffer: ArrayBuffer,
  topBuffer: ArrayBuffer,
  topSolidBuffer: ArrayBuffer,
  params: ClickerWorkerRequest['params'],
): Omit<ClickerWorkerResponse, 'id' | 'error'> & {
  bottom: ArrayBuffer;
  top: ArrayBuffer;
  cutHeightMm: number;
} {
  let model = stlToManifold(wasm, input, 'El STL');
  try {
    const scalePercent = params.scalePercent;
    if (!Number.isFinite(scalePercent) || scalePercent < 10 || scalePercent > 200) {
      throw new Error('La escala del STL debe estar entre 10 % y 200 %.');
    }
    model = replaceManifold(model, model.scale([scalePercent / 100, scalePercent / 100, scalePercent / 100]));
    model = moveBoundsMinimumToOrigin(model);
    const modelBounds = model.boundingBox();
    const height = modelBounds.max[2] - modelBounds.min[2];
    const cutHeight = params.cutHeightMm;
    if (!Number.isFinite(cutHeight) || cutHeight <= 0 || cutHeight >= height) {
      throw new Error(`La altura de corte debe ser mayor que 0 y menor que ${height.toFixed(2)} mm.`);
    }
    const center: [number, number] = [
      (modelBounds.min[0] + modelBounds.max[0]) / 2,
      (modelBounds.min[1] + modelBounds.max[1]) / 2,
    ];

    let [top, bottom] = model.splitByPlane([0, 0, 1], cutHeight);
    if (top.numTri() === 0 || bottom.numTri() === 0) {
      top.delete();
      bottom.delete();
      throw new Error('El corte produjo una pieza superior o inferior vacía.');
    }

    let baseCutter = hullAndDelete(stlToManifold(wasm, baseBuffer, 'El cortador inferior'));
    baseCutter = alignAsset(baseCutter, center, undefined, cutHeight + BASE_CUTTER_OVERLAP_MM);
    let baseClicker = stlToManifold(wasm, baseBuffer, 'El conector inferior');
    baseClicker = alignAsset(baseClicker, center, undefined, cutHeight + params.baseProtrusionMm);
    validateConnectorFit(modelBounds, baseClicker.boundingBox());

    let topCutter = hullAndDelete(stlToManifold(wasm, topSolidBuffer, 'El cortador superior'));
    topCutter = alignAsset(topCutter, center, cutHeight - TOP_CUTTER_OVERLAP_MM);
    topCutter = shrinkXY(topCutter, TOP_FUSION_OVERLAP_MM);
    let topClicker = stlToManifold(wasm, topBuffer, 'El conector superior');
    topClicker = alignAsset(topClicker, center, cutHeight);
    let stemSupport = buildTopStemSupport(wasm, topBuffer);
    stemSupport = alignAsset(stemSupport, center, cutHeight);

    let next = wasm.Manifold.difference(bottom, baseCutter);
    bottom.delete();
    bottom = keepLargest(next);
    next = wasm.Manifold.union([bottom, baseClicker]);
    bottom.delete();
    bottom = keepLargest(next);

    next = wasm.Manifold.difference(top, topCutter);
    top.delete();
    top = keepLargest(next);
    next = wasm.Manifold.union([top, topClicker, stemSupport]);
    top.delete();
    top = keepLargest(next);

    baseCutter.delete();
    baseClicker.delete();
    topCutter.delete();
    topClicker.delete();
    stemSupport.delete();

    bottom = moveBoundsMinimumToOrigin(bottom);
    top = moveBoundsMinimumToOrigin(top);
    const bottomBounds = bottom.boundingBox();
    top = replaceManifold(
      top,
      top.translate([bottomBounds.max[0] - bottomBounds.min[0] + params.partGapMm, 0, 0]),
    );

    const bottomStl = manifoldToBinaryStl(bottom);
    const topStl = manifoldToBinaryStl(top);
    bottom.delete();
    top.delete();
    return {
      bottom: bottomStl,
      top: topStl,
      cutHeightMm: cutHeight,
      scalePercent,
      warnings: ['El clicker fue procesado localmente en este navegador.'],
    };
  } finally {
    model.delete();
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
    throw new Error(`${label} no contiene una malla sólida válida.`);
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
  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: vertices, triVerts: triangles });
  mesh.merge();
  try {
    return new wasm.Manifold(mesh);
  } catch {
    throw new Error(`${label} debe ser hermético y representar un volumen válido.`);
  }
}

function alignAsset(
  asset: Manifold,
  center: [number, number],
  minZ?: number,
  maxZ?: number,
): Manifold {
  const bounds = asset.boundingBox();
  const assetCenterX = (bounds.min[0] + bounds.max[0]) / 2;
  const assetCenterY = (bounds.min[1] + bounds.max[1]) / 2;
  const z = minZ === undefined ? (maxZ as number) - bounds.max[2] : minZ - bounds.min[2];
  return replaceManifold(
    asset,
    asset.translate([center[0] - assetCenterX, center[1] - assetCenterY, z]),
  );
}

function shrinkXY(asset: Manifold, amount: number): Manifold {
  const bounds = asset.boundingBox();
  const sizeX = bounds.max[0] - bounds.min[0];
  const sizeY = bounds.max[1] - bounds.min[1];
  if (sizeX <= amount * 2 || sizeY <= amount * 2) return asset;
  const center: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  let next = asset.translate([-center[0], -center[1], -center[2]]);
  next = replaceManifold(next, next.scale([(sizeX - amount * 2) / sizeX, (sizeY - amount * 2) / sizeY, 1]));
  next = replaceManifold(next, next.translate(center));
  asset.delete();
  return next;
}

function buildTopStemSupport(wasm: ManifoldToplevel, buffer: ArrayBuffer): Manifold {
  const geometry = new STLLoader().parse(buffer);
  const position = geometry.getAttribute('position');
  const levels = Array.from({ length: position.count }, (_, index) =>
    Math.round(position.getZ(index) * 10_000) / 10_000,
  ).sort((a, b) => a - b);
  const uniqueLevels = levels.filter((value, index) => index === 0 || value !== levels[index - 1]);
  if (uniqueLevels.length < 2) {
    geometry.dispose();
    throw new Error('El conector superior no contiene el soporte esperado.');
  }
  const minZ = uniqueLevels[0];
  const stemZ = uniqueLevels[1];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let offset = 0; offset < position.count; offset += 3) {
    const isStemFloor = [0, 1, 2].every(
      (corner) => Math.abs(position.getZ(offset + corner) - stemZ) < 1e-4,
    );
    if (!isStemFloor) continue;
    for (let corner = 0; corner < 3; corner += 1) {
      minX = Math.min(minX, position.getX(offset + corner));
      minY = Math.min(minY, position.getY(offset + corner));
      maxX = Math.max(maxX, position.getX(offset + corner));
      maxY = Math.max(maxY, position.getY(offset + corner));
    }
  }
  geometry.dispose();
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) {
    throw new Error('No se pudo medir el soporte del conector superior.');
  }
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const height = stemZ - minZ + TOP_STEM_SUPPORT_OVERLAP_MM;
  const radius = Math.max(spanX, spanY) / 2;
  const slotWidth = Math.min(spanX, spanY) * TOP_CROSS_SLOT_WIDTH_RATIO;
  let support = wasm.Manifold.cylinder(height, radius, radius, 64);
  const verticalSlot = wasm.Manifold.cube([slotWidth, spanY, height + TOP_STEM_SUPPORT_OVERLAP_MM])
    .translate([-slotWidth / 2, -spanY / 2, -TOP_STEM_SUPPORT_OVERLAP_MM / 2]);
  const horizontalSlot = wasm.Manifold.cube([spanX, slotWidth, height + TOP_STEM_SUPPORT_OVERLAP_MM])
    .translate([-spanX / 2, -slotWidth / 2, -TOP_STEM_SUPPORT_OVERLAP_MM / 2]);
  const slots = wasm.Manifold.union([verticalSlot, horizontalSlot]);
  support = replaceManifold(support, wasm.Manifold.difference(support, slots));
  slots.delete();
  verticalSlot.delete();
  horizontalSlot.delete();
  return support;
}

function validateConnectorFit(
  model: { min: number[]; max: number[] },
  connector: { min: number[]; max: number[] },
) {
  if (
    connector.min[0] < model.min[0] ||
    connector.min[1] < model.min[1] ||
    connector.max[0] > model.max[0] ||
    connector.max[1] > model.max[1]
  ) {
    throw new Error('El conector del clicker no cabe dentro de los límites XY del modelo.');
  }
}

function keepLargest(manifold: Manifold): Manifold {
  const parts = manifold.decompose();
  if (parts.length === 0 || manifold.numTri() === 0) {
    manifold.delete();
    throw new Error('Una operación booleana produjo una pieza vacía.');
  }
  if (parts.length === 1) {
    parts[0].delete();
    return manifold;
  }
  let largest = parts[0];
  for (let index = 1; index < parts.length; index += 1) {
    if (Math.abs(parts[index].volume()) > Math.abs(largest.volume())) {
      largest = parts[index];
    }
  }
  parts.forEach((part) => {
    if (part !== largest) part.delete();
  });
  manifold.delete();
  return largest;
}

function hullAndDelete(manifold: Manifold): Manifold {
  const hull = manifold.hull();
  manifold.delete();
  return hull;
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
