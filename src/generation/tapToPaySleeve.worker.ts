/// <reference lib="webworker" />

import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { ShapeUtils, Vector2 } from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

import {
  collapseIncidentalPalette,
  preserveExtremePaletteColors,
  preserveRasterExtremes,
  reinforceDarkLineArt,
  type RgbColor,
} from './imagePalette.ts';
import {
  labelsToMasks,
  addEntryDetents,
  normalizeDiagonalLabels,
  replaceBorderConnectedLabel,
  removeDiagonalMaskContacts,
  rearRailMask,
  roundedRectangleMask,
} from './tapToPaySleeveGeometry.ts';

interface WorkerRequest {
  id: number;
  input: ArrayBuffer;
  bodyInput?: ArrayBuffer;
  bodyName?: string;
  mimeType: string;
  params: TapToPaySleeveWorkerParams;
}

export interface TapToPaySleeveWorkerParams {
  colorCount: number;
  fitMode: string;
  detailPreset: string;
  backgroundStrategy: string;
  cardClearanceMm: number;
  faceThicknessMm: number;
  colorThicknessMm: number;
  openingSide: 'left' | 'right';
}

interface GeneratedPart {
  name: string;
  color: string;
  buffer: ArrayBuffer;
}

interface ColorSpec {
  paletteIndex: number;
  color: RgbColor;
  colorHex: string;
  mask: Uint8Array;
  pixelCount: number;
}

const CARD_WIDTH_MM = 85.6;
const CARD_HEIGHT_MM = 53.98;
const CARD_THICKNESS_MM = 0.76;
const SIDE_WALL_MM = 1.05;
const RETAINING_OVERLAP_MM = 0.35;
const REAR_LIP_THICKNESS_MM = 0.45;
const CORNER_RADIUS_MM = 2.4;
let modulePromise: Promise<ManifoldToplevel> | undefined;

if (typeof self !== 'undefined') self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result = await generateSleeve(request);
    self.postMessage({ id: request.id, ...result }, result.parts.map((part) => part.buffer));
  } catch (error) {
    self.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : 'No se pudo generar el portatarjeta.',
    });
  }
};

async function generateSleeve(request: WorkerRequest) {
  const { params } = request;
  let template: SleeveTemplate | undefined;
  if (request.bodyInput) template = await prepareSleeveTemplate(request.bodyInput, params.colorThicknessMm);
  const cavityWidthMm = CARD_WIDTH_MM + params.cardClearanceMm;
  const cavityHeightMm = CARD_HEIGHT_MM + params.cardClearanceMm;
  const outerWidthMm = template?.outerWidthMm ?? cavityWidthMm + SIDE_WALL_MM;
  const outerHeightMm = template?.outerHeightMm ?? cavityHeightMm + SIDE_WALL_MM * 2;
  const maximumPixels = params.detailPreset === 'high' ? 400 : params.detailPreset === 'draft' ? 180 : 280;
  const width = maximumPixels;
  const height = Math.max(2, Math.round(width * outerHeightMm / outerWidthMm));
  const pixelWidthMm = outerWidthMm / width;
  const pixelHeightMm = outerHeightMm / height;
  const outerMask = roundedRectangleMask(
    width,
    height,
    Math.round(CORNER_RADIUS_MM / Math.max(pixelWidthMm, pixelHeightMm)),
  );

  const bitmap = await createImageBitmap(new Blob([request.input], { type: request.mimeType }));
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Este navegador no permite procesar la imagen localmente.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  drawFittedImage(context, bitmap, width, height, params.fitMode);
  bitmap.close();
  const rgba = context.getImageData(0, 0, width, height).data;

  return generateTapToPaySleeveFromPixels(rgba, originalWidth, originalHeight, width, height, params, template);
}

export interface SleeveTemplate {
  bodyBuffer: ArrayBuffer;
  outerWidthMm: number;
  outerHeightMm: number;
  totalThicknessMm: number;
}

export function generateTapToPaySleeveFromPixels(
  rgba: Uint8ClampedArray,
  originalWidth: number,
  originalHeight: number,
  width: number,
  height: number,
  params: TapToPaySleeveWorkerParams,
  template?: SleeveTemplate,
) {
  const cavityWidthMm = CARD_WIDTH_MM + params.cardClearanceMm;
  const cavityHeightMm = CARD_HEIGHT_MM + params.cardClearanceMm;
  const outerWidthMm = template?.outerWidthMm ?? cavityWidthMm + SIDE_WALL_MM;
  const outerHeightMm = template?.outerHeightMm ?? cavityHeightMm + SIDE_WALL_MM * 2;
  const pixelWidthMm = outerWidthMm / width;
  const pixelHeightMm = outerHeightMm / height;
  const outerMask = roundedRectangleMask(
    width,
    height,
    Math.round(CORNER_RADIUS_MM / Math.max(pixelWidthMm, pixelHeightMm)),
  );

  const quantized = quantize(rgba, outerMask, params.colorCount);
  const collapsed = collapseIncidentalPalette(quantized.palette, quantized.labels, outerMask);
  const preserved = preserveRasterExtremes(collapsed.palette, rgba, outerMask);
  let labels = conservativeNoiseFilter(preserved.labels, outerMask, width, height);
  labels = reinforceDarkLineArt(labels, rgba, outerMask, preserved.palette);
  const backgroundLabel = chooseBackgroundLabel(
    labels,
    outerMask,
    preserved.palette.length,
    width,
    height,
    params.backgroundStrategy,
  );
  if (params.backgroundStrategy === 'dominant') {
    const borderLabel = chooseBackgroundLabel(
      labels,
      outerMask,
      preserved.palette.length,
      width,
      height,
      'border',
    );
    labels = replaceBorderConnectedLabel(
      labels,
      outerMask,
      width,
      height,
      borderLabel,
      backgroundLabel,
    );
  }
  labels = relabelSmallComponents(
    labels,
    outerMask,
    width,
    height,
    params.detailPreset === 'high' ? 4 : params.detailPreset === 'draft' ? 14 : 8,
    backgroundLabel,
    new Set(preserved.palette.flatMap((color, index) => (
      Math.max(...color) <= 80 ? [index] : []
    ))),
  );
  labels = normalizeDiagonalLabels(labels, outerMask, width, height);
  const masks = labelsToMasks(labels, outerMask, preserved.palette.length);
  for (let index = 0; index < masks.length; index += 1) {
    if (index === backgroundLabel) continue;
    const cleaned = removeDiagonalMaskContacts(masks[index], width, height);
    masks[index] = cleaned.mask;
    for (const removed of cleaned.removed) masks[backgroundLabel][removed] = 1;
  }
  masks[backgroundLabel] = removeDiagonalMaskContacts(masks[backgroundLabel], width, height).mask;
  let specs = preserved.palette.map((color, paletteIndex): ColorSpec => ({
    paletteIndex,
    color,
    colorHex: rgbToHex(color),
    mask: masks[paletteIndex],
    pixelCount: countMask(masks[paletteIndex]),
  })).filter((spec) => spec.pixelCount > 0);
  if (specs.length < 2) throw new Error('La imagen necesita al menos dos colores distinguibles.');
  const background = specs.find((spec) => spec.paletteIndex === backgroundLabel)
    ?? [...specs].sort((a, b) => b.pixelCount - a.pixelCount)[0];
  specs = [background, ...specs.filter((spec) => spec !== background).sort((a, b) => b.pixelCount - a.pixelCount)];

  const bodyColor = background.colorHex;
  const surfaceTop = params.colorThicknessMm;
  const faceTop = surfaceTop + params.faceThicknessMm;
  const cardGapMm = CARD_THICKNESS_MM + Math.max(0.16, params.cardClearanceMm);
  const lipBottom = faceTop + cardGapMm;
  const totalThicknessMm = template?.totalThicknessMm ?? lipBottom + REAR_LIP_THICKNESS_MM;
  const wallPixels = Math.max(1, Math.round(SIDE_WALL_MM / Math.max(pixelWidthMm, pixelHeightMm)));
  const lipPixels = Math.max(wallPixels + 1, Math.round((SIDE_WALL_MM + RETAINING_OVERLAP_MM) / Math.max(pixelWidthMm, pixelHeightMm)));
  const wallMask = addEntryDetents(
    rearRailMask(outerMask, width, height, wallPixels, params.openingSide),
    outerMask,
    width,
    height,
    wallPixels,
    params.openingSide,
    Math.max(2, Math.round(1.6 / pixelWidthMm)),
  );
  const lipMask = rearRailMask(outerMask, width, height, lipPixels, params.openingSide);

  const effectiveClearanceX = outerWidthMm - wallPixels * pixelWidthMm - CARD_WIDTH_MM;
  const effectiveClearanceY = outerHeightMm - wallPixels * pixelHeightMm * 2 - CARD_HEIGHT_MM;
  const effectiveClearanceZ = cardGapMm - CARD_THICKNESS_MM;

  const generatedBody = template?.bodyBuffer ?? layeredMasksToBinaryStl([
    { mask: outerMask, z0: surfaceTop, z1: faceTop },
    { mask: wallMask, z0: faceTop, z1: lipBottom },
    { mask: lipMask, z0: lipBottom, z1: totalThicknessMm },
  ], width, height, pixelWidthMm, pixelHeightMm);
  const modifierSpecs = template ? specs.filter((spec) => spec !== background) : specs;
  const parts: GeneratedPart[] = [
    {
      name: `body_${bodyColor.slice(1).toLowerCase()}`,
      color: bodyColor,
      buffer: generatedBody,
    },
    ...modifierSpecs.map((spec, index) => ({
      name: `color_${String(index + 1).padStart(2, '0')}_${spec.colorHex.slice(1).toLowerCase()}`,
      color: spec.colorHex,
      buffer: maskToBinaryStl(spec.mask, width, height, pixelWidthMm, pixelHeightMm, 0, surfaceTop),
    })),
  ];

  return {
    parts,
    metadata: {
      original_width_px: originalWidth,
      original_height_px: originalHeight,
      processed_width_px: width,
      processed_height_px: height,
      outer_width_mm: outerWidthMm,
      outer_height_mm: outerHeightMm,
      total_thickness_mm: totalThicknessMm,
      card_width_mm: template ? undefined : CARD_WIDTH_MM,
      card_height_mm: template ? undefined : CARD_HEIGHT_MM,
      card_clearance_mm: template ? undefined : params.cardClearanceMm,
      effective_clearance_x_mm: template ? undefined : effectiveClearanceX,
      effective_clearance_y_mm: template ? undefined : effectiveClearanceY,
      effective_clearance_z_mm: template ? undefined : effectiveClearanceZ,
      color_thickness_mm: params.colorThicknessMm,
      color_count: specs.length,
      colors: specs.map((spec) => spec.colorHex),
      opening_side: params.openingSide,
    },
    warnings: [
      'Imprime el portatarjeta con la cara multicolor contra la cama para obtener el frente liso.',
      ...(template ? ['Se conservó completo el cuerpo STL; las regiones de color se exportan como modificadores superpuestos en el mismo assembly.'] : []),
      `Asignación sugerida: ${specs.map((spec, index) => `Filamento ${index + 1} ${spec.colorHex}`).join(', ')}. Confirma estas ranuras en Bambu Studio antes de laminar.`,
      'Haz una prueba de ajuste: la holgura puede necesitar cambios según el material y la calibración de tu impresora.',
      ...(template ? [] : ['El pequeño retén junto a la entrada ayuda a evitar que la tarjeta se salga accidentalmente.']),
    ],
  };
}

async function getModule(): Promise<ManifoldToplevel> {
  if (!modulePromise) {
    modulePromise = Promise.all([
      import('manifold-3d'),
      import('manifold-3d/manifold.wasm?url'),
    ]).then(([{ default: Module }, { default: manifoldWasmUrl }]) => Module({ locateFile: () => manifoldWasmUrl })).then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return modulePromise;
}

async function prepareSleeveTemplate(input: ArrayBuffer, faceDepthMm: number): Promise<SleeveTemplate> {
  const wasm = await getModule();
  let body = stlToManifold(wasm, input);
  try {
    const initialBounds = body.boundingBox();
    body = replaceManifold(body, body.translate([
      -initialBounds.min[0],
      -initialBounds.min[1],
      -initialBounds.min[2],
    ]));
    const bounds = body.boundingBox();
    const outerWidthMm = bounds.max[0] - bounds.min[0];
    const outerHeightMm = bounds.max[1] - bounds.min[1];
    const totalThicknessMm = bounds.max[2] - bounds.min[2];
    if (outerWidthMm < 40 || outerHeightMm < 25 || totalThicknessMm < faceDepthMm + 0.4) {
      throw new Error('El STL del cuerpo es demasiado pequeño o delgado para aplicar la imagen.');
    }
    return {
      bodyBuffer: manifoldToBinaryStl(body),
      outerWidthMm,
      outerHeightMm,
      totalThicknessMm,
    };
  } finally {
    body.delete();
  }
}

function stlToManifold(wasm: ManifoldToplevel, buffer: ArrayBuffer): Manifold {
  const parsed = new STLLoader().parse(buffer);
  parsed.deleteAttribute('normal');
  const geometry = mergeVertices(parsed, 1e-5);
  parsed.dispose();
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index || position.count < 4 || index.count < 12) {
    geometry.dispose();
    throw new Error('El STL del cuerpo no contiene una malla sólida válida.');
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
    throw new Error('El STL del cuerpo debe ser hermético y representar un volumen válido.');
  }
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
  new Uint8Array(buffer).set(new TextEncoder().encode('Horama3D source card sleeve body').slice(0, 80));
  view.setUint32(80, triangleCount, true);
  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const points = [0, 1, 2].map((corner) => {
      const vertex = mesh.triVerts[triangle * 3 + corner];
      const start = vertex * mesh.numProp;
      return [mesh.vertProperties[start], mesh.vertProperties[start + 1], mesh.vertProperties[start + 2]];
    });
    const normal = triangleNormal(points[0], points[1], points[2]);
    for (const value of normal) { view.setFloat32(offset, value, true); offset += 4; }
    for (const point of points) for (const value of point) { view.setFloat32(offset, value, true); offset += 4; }
    view.setUint16(offset, 0, true); offset += 2;
  }
  return buffer;
}

function drawFittedImage(
  context: OffscreenCanvasRenderingContext2D,
  bitmap: ImageBitmap,
  width: number,
  height: number,
  fitMode: string,
) {
  const scale = fitMode === 'contain'
    ? Math.min(width / bitmap.width, height / bitmap.height)
    : Math.max(width / bitmap.width, height / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function quantize(rgba: Uint8ClampedArray, active: Uint8Array, requestedCount: number) {
  const histogram = new Map<number, number>();
  for (let index = 0; index < active.length; index += 1) {
    if (!active[index]) continue;
    const offset = index * 4;
    const key = ((rgba[offset] >> 3) << 10) | ((rgba[offset + 1] >> 3) << 5) | (rgba[offset + 2] >> 3);
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  const samples = [...histogram.entries()].map(([key, weight]) => ({
    color: [((key >> 10) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4] as RgbColor,
    weight,
  }));
  if (samples.length < 2) throw new Error('La imagen necesita al menos dos colores distinguibles.');
  const count = Math.max(2, Math.min(requestedCount, samples.length));
  let palette: RgbColor[] = [[...samples.reduce((best, sample) => sample.weight > best.weight ? sample : best).color] as RgbColor];
  while (palette.length < count) {
    let best = samples[0];
    let bestScore = -1;
    for (const sample of samples) {
      const distance = Math.min(...palette.map((color) => colorDistance(sample.color, color)));
      const score = distance * Math.sqrt(sample.weight);
      if (score > bestScore) { best = sample; bestScore = score; }
    }
    palette.push([...best.color]);
  }
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const sums = palette.map(() => [0, 0, 0, 0]);
    for (const sample of samples) {
      const cluster = nearestColor(sample.color, palette);
      sums[cluster][0] += sample.color[0] * sample.weight;
      sums[cluster][1] += sample.color[1] * sample.weight;
      sums[cluster][2] += sample.color[2] * sample.weight;
      sums[cluster][3] += sample.weight;
    }
    sums.forEach((sum, index) => {
      if (sum[3] > 0) palette[index] = [Math.round(sum[0] / sum[3]), Math.round(sum[1] / sum[3]), Math.round(sum[2] / sum[3])];
    });
  }
  palette = preserveExtremePaletteColors(palette, samples);
  const labels = new Uint8Array(active.length);
  for (let index = 0; index < active.length; index += 1) {
    if (!active[index]) continue;
    const offset = index * 4;
    labels[index] = nearestColor([rgba[offset], rgba[offset + 1], rgba[offset + 2]], palette);
  }
  return { palette, labels };
}

function conservativeNoiseFilter(labels: Uint8Array, active: Uint8Array, width: number, height: number): Uint8Array {
  const result = labels.slice();
  for (let row = 1; row < height - 1; row += 1) {
    for (let column = 1; column < width - 1; column += 1) {
      const index = row * width + column;
      if (!active[index]) continue;
      const counts = new Uint16Array(8);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const neighbor = index + dy * width + dx;
        if (active[neighbor]) counts[labels[neighbor]] += 1;
      }
      const current = labels[index];
      let best = current;
      for (let label = 0; label < counts.length; label += 1) if (counts[label] > counts[best]) best = label;
      if (counts[current] <= 1 && counts[best] >= 5) result[index] = best;
    }
  }
  return result;
}

function relabelSmallComponents(
  labels: Uint8Array,
  active: Uint8Array,
  width: number,
  height: number,
  minimumArea: number,
  fallbackLabel: number,
  protectedLabels = new Set<number>(),
): Uint8Array {
  const result = labels.slice();
  const visited = new Uint8Array(labels.length);
  const queue = new Int32Array(labels.length);
  for (let start = 0; start < labels.length; start += 1) {
    if (!active[start] || visited[start]) continue;
    const target = result[start];
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const current = queue[head++];
      const row = Math.floor(current / width);
      const column = current % width;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextRow = row + dy;
        const nextColumn = column + dx;
        if (nextRow < 0 || nextRow >= height || nextColumn < 0 || nextColumn >= width) continue;
        const next = nextRow * width + nextColumn;
        if (active[next] && !visited[next] && result[next] === target) {
          visited[next] = 1;
          queue[tail++] = next;
        }
      }
    }
    if (tail < minimumArea && target !== fallbackLabel && !protectedLabels.has(target)) {
      const neighboring = new Uint32Array(8);
      for (let item = 0; item < tail; item += 1) {
        const current = queue[item];
        const row = Math.floor(current / width);
        const column = current % width;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nextRow = row + dy;
          const nextColumn = column + dx;
          if (nextRow < 0 || nextRow >= height || nextColumn < 0 || nextColumn >= width) continue;
          const next = nextRow * width + nextColumn;
          if (active[next] && result[next] !== target) neighboring[result[next]] += 1;
        }
      }
      let replacement = fallbackLabel;
      for (let label = 0; label < neighboring.length; label += 1) {
        if (neighboring[label] > neighboring[replacement]) replacement = label;
      }
      for (let index = 0; index < tail; index += 1) result[queue[index]] = replacement;
    }
  }
  return result;
}

function chooseBackgroundLabel(
  labels: Uint8Array,
  active: Uint8Array,
  colorCount: number,
  width: number,
  height: number,
  strategy: string,
): number {
  const counts = new Uint32Array(colorCount);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      if (!active[index]) continue;
      if (strategy === 'dominant' || row < 2 || row >= height - 2 || column < 2 || column >= width - 2) {
        counts[labels[index]] += 1;
      }
    }
  }
  let best = 0;
  for (let index = 1; index < counts.length; index += 1) if (counts[index] > counts[best]) best = index;
  return best;
}

export function maskToBinaryStl(
  mask: Uint8Array,
  width: number,
  height: number,
  pixelWidth: number,
  pixelHeight: number,
  z0: number,
  z1: number,
): ArrayBuffer {
  const vectorized = maskToVectorBinaryStl(mask, width, height, pixelWidth, pixelHeight, z0, z1);
  return hasInvalidBinaryStlEdges(vectorized)
    ? maskToGridBinaryStl(mask, width, height, pixelWidth, pixelHeight, z0, z1)
    : vectorized;
}

function maskToGridBinaryStl(
  mask: Uint8Array,
  width: number,
  height: number,
  pixelWidth: number,
  pixelHeight: number,
  z0: number,
  z1: number,
): ArrayBuffer {
  let triangles = countMask(mask) * 4;
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const index = row * width + column;
    if (!mask[index]) continue;
    if (row === 0 || !mask[index - width]) triangles += 2;
    if (row === height - 1 || !mask[index + width]) triangles += 2;
    if (column === 0 || !mask[index - 1]) triangles += 2;
    if (column === width - 1 || !mask[index + 1]) triangles += 2;
  }
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode('Horama3D tap-to-pay sleeve').slice(0, 80));
  view.setUint32(80, triangles, true);
  let offset = 84;
  const add = (a: number[], b: number[], c: number[]) => {
    const normal = triangleNormal(a, b, c);
    for (const value of normal) { view.setFloat32(offset, value, true); offset += 4; }
    for (const point of [a, b, c]) for (const value of point) { view.setFloat32(offset, value, true); offset += 4; }
    view.setUint16(offset, 0, true); offset += 2;
  };
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { add(a, b, c); add(a, c, d); };
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const index = row * width + column;
    if (!mask[index]) continue;
    const x0 = column * pixelWidth;
    const x1 = (column + 1) * pixelWidth;
    const y0 = (height - row - 1) * pixelHeight;
    const y1 = (height - row) * pixelHeight;
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]);
    quad([x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[x0,y0,z0]);
    if (row === 0 || !mask[index-width]) quad([x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]);
    if (row === height-1 || !mask[index+width]) quad([x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y0,z0]);
    if (column === 0 || !mask[index-1]) quad([x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]);
    if (column === width-1 || !mask[index+1]) quad([x1,y1,z0],[x1,y0,z0],[x1,y0,z1],[x1,y1,z1]);
  }
  return buffer;
}

function hasInvalidBinaryStlEdges(buffer: ArrayBuffer): boolean {
  const view = new DataView(buffer);
  const edgeCounts = new Map<string, number>();
  const vertexKey = (offset: number) => `${view.getFloat32(offset, true)},${view.getFloat32(offset + 4, true)},${view.getFloat32(offset + 8, true)}`;
  for (let triangle = 0; triangle < view.getUint32(80, true); triangle += 1) {
    const base = 84 + triangle * 50 + 12;
    const vertices = [vertexKey(base), vertexKey(base + 12), vertexKey(base + 24)];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const edge = vertices[a] < vertices[b] ? `${vertices[a]}|${vertices[b]}` : `${vertices[b]}|${vertices[a]}`;
      edgeCounts.set(edge, (edgeCounts.get(edge) ?? 0) + 1);
    }
  }
  return [...edgeCounts.values()].some((count) => count !== 2);
}

function maskToVectorBinaryStl(
  mask: Uint8Array,
  width: number,
  height: number,
  pixelWidth: number,
  pixelHeight: number,
  z0: number,
  z1: number,
): ArrayBuffer {
  const loops = maskBoundaryLoops(mask, width, height);
  const groups = groupBoundaryLoops(loops);
  const faces: Array<[number[], number[], number[]]> = [];
  for (const { outer, holes } of groups) {
    const points = [...outer, ...holes.flat()];
    const triangles = ShapeUtils.triangulateShape(
      outer.map(([x, y]) => new Vector2(x, y)),
      holes.map((hole) => hole.map(([x, y]) => new Vector2(x, y))),
    );
    for (const [a, b, c] of triangles) {
      const pa = scaledPoint(points[a], pixelWidth, pixelHeight, z1);
      const pb = scaledPoint(points[b], pixelWidth, pixelHeight, z1);
      const pc = scaledPoint(points[c], pixelWidth, pixelHeight, z1);
      faces.push([pa, pb, pc]);
      faces.push([
        scaledPoint(points[a], pixelWidth, pixelHeight, z0),
        scaledPoint(points[c], pixelWidth, pixelHeight, z0),
        scaledPoint(points[b], pixelWidth, pixelHeight, z0),
      ]);
    }
  }
  for (const loop of loops) for (let index = 0; index < loop.length; index += 1) {
    const a = loop[index];
    const b = loop[(index + 1) % loop.length];
    const a0 = scaledPoint(a, pixelWidth, pixelHeight, z0);
    const b0 = scaledPoint(b, pixelWidth, pixelHeight, z0);
    const a1 = scaledPoint(a, pixelWidth, pixelHeight, z1);
    const b1 = scaledPoint(b, pixelWidth, pixelHeight, z1);
    faces.push([a0, b0, b1], [a0, b1, a1]);
  }
  const buffer = new ArrayBuffer(84 + faces.length * 50);
  const view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode('Horama3D tap-to-pay sleeve').slice(0, 80));
  view.setUint32(80, faces.length, true);
  let offset = 84;
  const add = (a: number[], b: number[], c: number[]) => {
    const normal = triangleNormal(a, b, c);
    for (const value of normal) { view.setFloat32(offset, value, true); offset += 4; }
    for (const point of [a, b, c]) for (const value of point) { view.setFloat32(offset, value, true); offset += 4; }
    view.setUint16(offset, 0, true);
    offset += 2;
  };
  for (const face of faces) add(...face);
  return buffer;
}

type GridPoint = [number, number];

function scaledPoint([x, y]: GridPoint, pixelWidth: number, pixelHeight: number, z: number): number[] {
  return [x * pixelWidth, y * pixelHeight, z];
}

function maskBoundaryLoops(mask: Uint8Array, width: number, height: number): GridPoint[][] {
  const edges = new Map<string, GridPoint[]>();
  const addEdge = (from: GridPoint, to: GridPoint) => {
    const key = `${from[0]},${from[1]}`;
    const list = edges.get(key) ?? [];
    list.push(to);
    edges.set(key, list);
  };
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const index = row * width + column;
    if (!mask[index]) continue;
    const y0 = height - row - 1;
    const y1 = y0 + 1;
    if (row === 0 || !mask[index - width]) addEdge([column + 1, y1], [column, y1]);
    if (row === height - 1 || !mask[index + width]) addEdge([column, y0], [column + 1, y0]);
    if (column === 0 || !mask[index - 1]) addEdge([column, y1], [column, y0]);
    if (column === width - 1 || !mask[index + 1]) addEdge([column + 1, y0], [column + 1, y1]);
  }
  const loops: GridPoint[][] = [];
  while (edges.size > 0) {
    const [startKey, destinations] = edges.entries().next().value as [string, GridPoint[]];
    const start = startKey.split(',').map(Number) as GridPoint;
    const loop: GridPoint[] = [start];
    let current = destinations.pop()!;
    if (destinations.length === 0) edges.delete(startKey);
    while (current[0] !== start[0] || current[1] !== start[1]) {
      loop.push(current);
      const key = `${current[0]},${current[1]}`;
      const destinations = edges.get(key);
      if (!destinations?.length) throw new Error('No se pudo cerrar el contorno de una región de color.');
      const previous = loop[loop.length - 2];
      const nextIndex = chooseBoundaryDestination(previous, current, destinations);
      current = destinations.splice(nextIndex, 1)[0];
      if (destinations.length === 0) edges.delete(key);
    }
    loops.push(removeCollinearPoints(loop));
  }
  return loops.filter((loop) => loop.length >= 3);
}

function chooseBoundaryDestination(previous: GridPoint, current: GridPoint, destinations: GridPoint[]): number {
  const directionIndex = ([x, y]: GridPoint) => {
    if (x > 0) return 0; // east
    if (y > 0) return 1; // north
    if (x < 0) return 2; // west
    return 3; // south
  };
  const incoming = directionIndex([current[0] - previous[0], current[1] - previous[1]]);
  const priority = [1, 0, 3, 2]; // left, straight, right, reverse
  let bestIndex = 0;
  let bestPriority = Number.POSITIVE_INFINITY;
  destinations.forEach((destination, index) => {
    const outgoing = directionIndex([destination[0] - current[0], destination[1] - current[1]]);
    const turn = (outgoing - incoming + 4) % 4;
    const rank = priority.indexOf(turn);
    if (rank < bestPriority) {
      bestPriority = rank;
      bestIndex = index;
    }
  });
  return bestIndex;
}

function removeCollinearPoints(loop: GridPoint[]): GridPoint[] {
  return loop.filter((point, index) => {
    const previous = loop[(index + loop.length - 1) % loop.length];
    const next = loop[(index + 1) % loop.length];
    return (point[0] - previous[0]) * (next[1] - point[1]) !== (point[1] - previous[1]) * (next[0] - point[0]);
  });
}

function signedArea(loop: GridPoint[]): number {
  return loop.reduce((area, point, index) => {
    const next = loop[(index + 1) % loop.length];
    return area + point[0] * next[1] - next[0] * point[1];
  }, 0) / 2;
}

function pointInLoop(point: GridPoint, loop: GridPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const a = loop[i];
    const b = loop[j];
    if ((a[1] > point[1]) !== (b[1] > point[1])
      && point[0] < ((b[0] - a[0]) * (point[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}

function groupBoundaryLoops(loops: GridPoint[][]): Array<{ outer: GridPoint[]; holes: GridPoint[][] }> {
  const groups = loops.filter((loop) => signedArea(loop) > 0).map((outer) => ({ outer, holes: [] as GridPoint[][] }));
  for (const hole of loops.filter((loop) => signedArea(loop) < 0)) {
    const owner = groups.find((group) => pointInLoop(hole[0], group.outer));
    if (owner) owner.holes.push(hole);
  }
  return groups;
}

function layeredMasksToBinaryStl(
  layers: Array<{ mask: Uint8Array; z0: number; z1: number }>,
  width: number,
  height: number,
  pixelWidth: number,
  pixelHeight: number,
): ArrayBuffer {
  let triangles = 0;
  layers.forEach((layer, layerIndex) => {
    const below = layers[layerIndex - 1]?.mask;
    const above = layers[layerIndex + 1]?.mask;
    for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      if (!layer.mask[index]) continue;
      if (!below?.[index]) triangles += 2;
      if (!above?.[index]) triangles += 2;
      if (row === 0 || !layer.mask[index - width]) triangles += 2;
      if (row === height - 1 || !layer.mask[index + width]) triangles += 2;
      if (column === 0 || !layer.mask[index - 1]) triangles += 2;
      if (column === width - 1 || !layer.mask[index + 1]) triangles += 2;
    }
  });
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  new Uint8Array(buffer).set(new TextEncoder().encode('Horama3D unified tap-to-pay sleeve').slice(0, 80));
  view.setUint32(80, triangles, true);
  let offset = 84;
  const add = (a: number[], b: number[], c: number[]) => {
    const normal = triangleNormal(a, b, c);
    for (const value of normal) { view.setFloat32(offset, value, true); offset += 4; }
    for (const point of [a, b, c]) for (const value of point) { view.setFloat32(offset, value, true); offset += 4; }
    view.setUint16(offset, 0, true); offset += 2;
  };
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { add(a, b, c); add(a, c, d); };
  layers.forEach((layer, layerIndex) => {
    const below = layers[layerIndex - 1]?.mask;
    const above = layers[layerIndex + 1]?.mask;
    for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      if (!layer.mask[index]) continue;
      const x0 = column * pixelWidth;
      const x1 = (column + 1) * pixelWidth;
      const y0 = (height - row - 1) * pixelHeight;
      const y1 = (height - row) * pixelHeight;
      if (!above?.[index]) quad([x0,y0,layer.z1],[x1,y0,layer.z1],[x1,y1,layer.z1],[x0,y1,layer.z1]);
      if (!below?.[index]) quad([x0,y1,layer.z0],[x1,y1,layer.z0],[x1,y0,layer.z0],[x0,y0,layer.z0]);
      if (row === 0 || !layer.mask[index-width]) quad([x0,y1,layer.z0],[x0,y1,layer.z1],[x1,y1,layer.z1],[x1,y1,layer.z0]);
      if (row === height-1 || !layer.mask[index+width]) quad([x1,y0,layer.z0],[x1,y0,layer.z1],[x0,y0,layer.z1],[x0,y0,layer.z0]);
      if (column === 0 || !layer.mask[index-1]) quad([x0,y0,layer.z0],[x0,y1,layer.z0],[x0,y1,layer.z1],[x0,y0,layer.z1]);
      if (column === width-1 || !layer.mask[index+1]) quad([x1,y1,layer.z0],[x1,y0,layer.z0],[x1,y0,layer.z1],[x1,y1,layer.z1]);
    }
  });
  return buffer;
}

function nearestColor(color: number[], palette: number[][]): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  palette.forEach((candidate, index) => {
    const distance = colorDistance(color, candidate);
    if (distance < bestDistance) { best = index; bestDistance = distance; }
  });
  return best;
}

function colorDistance(a: number[], b: number[]): number {
  const redMean = (a[0] + b[0]) / 2;
  const red = a[0] - b[0];
  const green = a[1] - b[1];
  const blue = a[2] - b[2];
  return (2 + redMean / 256) * red * red + 4 * green * green + (2 + (255 - redMean) / 256) * blue * blue;
}

function triangleNormal(a: number[], b: number[], c: number[]): [number, number, number] {
  const ab = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
  const ac = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
  const normal: [number, number, number] = [
    ab[1]*ac[2]-ab[2]*ac[1],
    ab[2]*ac[0]-ab[0]*ac[2],
    ab[0]*ac[1]-ab[1]*ac[0],
  ];
  const length = Math.hypot(...normal) || 1;
  return [normal[0]/length, normal[1]/length, normal[2]/length];
}

function countMask(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) count += value;
  return count;
}

function rgbToHex(color: number[]): string {
  return `#${color.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

export {};
