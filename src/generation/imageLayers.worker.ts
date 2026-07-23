/// <reference lib="webworker" />

interface WorkerRequest {
  id: number;
  input: ArrayBuffer;
  mimeType: string;
  params: {
    colorCount: number;
    widthMm: number;
    layerHeightMm: number;
    detailPreset: string;
    frameWidthMm: number;
    backgroundStrategy: string;
    layerOrderStrategy: string;
    topBorder: boolean;
    topBorderHeightMm: number;
  };
}

interface LayerSpec {
  paletteIndex: number;
  color: [number, number, number];
  colorHex: string;
  luminance: number;
  pixelCount: number;
  mask: Uint8Array;
}

interface GeneratedPart {
  name: string;
  color: string;
  buffer: ArrayBuffer;
  pixelCount: number;
  zMinMm: number;
  zMaxMm: number;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result = await generateLayers(request);
    self.postMessage(
      { id: request.id, ...result },
      result.parts.map((part) => part.buffer),
    );
  } catch (error) {
    self.postMessage({
      id: request.id,
      error: error instanceof Error ? error.message : 'No se pudieron generar las capas.',
    });
  }
};

async function generateLayers(request: WorkerRequest) {
  const { params } = request;
  const bitmap = await createImageBitmap(new Blob([request.input], { type: request.mimeType }));
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const maximumPixels = params.detailPreset === 'high' ? 160 : params.detailPreset === 'draft' ? 80 : 120;
  const scale = Math.min(1, maximumPixels / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(2, Math.round(bitmap.width * scale));
  const height = Math.max(2, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Este navegador no permite procesar la imagen localmente.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const rgba = context.getImageData(0, 0, width, height).data;
  const visible = new Uint8Array(width * height);
  let visibleCount = 0;
  for (let index = 0; index < visible.length; index += 1) {
    if (rgba[index * 4 + 3] > 16) {
      visible[index] = 1;
      visibleCount += 1;
    }
  }
  if (visibleCount === 0) throw new Error('La imagen no contiene píxeles visibles.');

  const { palette, labels } = quantize(rgba, visible, params.colorCount);
  const filteredLabels = modeFilter(labels, visible, width, height);
  const minimumRegionArea = params.detailPreset === 'high' ? 6 : params.detailPreset === 'draft' ? 18 : 10;
  let specs = buildLayerSpecs(palette, filteredLabels, visible, width, height, minimumRegionArea);
  if (specs.length < 2) throw new Error('La imagen necesita al menos dos regiones de color distinguibles.');
  specs = orderLayers(specs, filteredLabels, visible, width, height, params);

  const pixelSizeMm = params.widthMm / width;
  const heightMm = height * pixelSizeMm;
  const frame = rectangularFrame(width, height, Math.ceil(params.frameWidthMm / pixelSizeMm));
  const masks = buildBackfillMasks(specs.map((spec) => spec.mask), frame);
  const parts: GeneratedPart[] = specs.map((spec, index) => {
    const zMinMm = index * params.layerHeightMm;
    const zMaxMm = zMinMm + params.layerHeightMm;
    const name = `plate_${String(index + 1).padStart(2, '0')}_${spec.colorHex.slice(1).toLowerCase()}`;
    return {
      name,
      color: spec.colorHex,
      buffer: maskToBinaryStl(masks[index], width, height, pixelSizeMm, zMinMm, zMaxMm),
      pixelCount: spec.pixelCount,
      zMinMm,
      zMaxMm,
    };
  });

  if (params.topBorder && params.frameWidthMm > 0) {
    const previous = parts[parts.length - 1];
    const zMinMm = previous.zMaxMm;
    const zMaxMm = zMinMm + params.topBorderHeightMm;
    parts.push({
      name: `plate_${String(parts.length + 1).padStart(2, '0')}_${previous.color.slice(1).toLowerCase()}_top_border`,
      color: previous.color,
      buffer: maskToBinaryStl(frame, width, height, pixelSizeMm, zMinMm, zMaxMm),
      pixelCount: countMask(frame),
      zMinMm,
      zMaxMm,
    });
  }

  return {
    parts,
    metadata: {
      original_width_px: originalWidth,
      original_height_px: originalHeight,
      processed_width_px: width,
      processed_height_px: height,
      width_mm: params.widthMm,
      height_mm: heightMm,
      layer_height_mm: params.layerHeightMm,
      color_count: new Set(parts.map((part) => part.color)).size,
      layer_count: parts.length,
      colors: [...new Set(parts.map((part) => part.color))],
    },
    warnings: [
      'Las capas fueron cuantizadas, limpiadas y extruidas localmente en este navegador.',
      'El 3MF conserva cada capa como objeto separado con un color de material aproximado.',
    ],
  };
}

function quantize(rgba: Uint8ClampedArray, visible: Uint8Array, requestedCount: number) {
  const histogram = new Map<number, number>();
  for (let index = 0; index < visible.length; index += 1) {
    if (!visible[index]) continue;
    const offset = index * 4;
    const key = ((rgba[offset] >> 3) << 10) | ((rgba[offset + 1] >> 3) << 5) | (rgba[offset + 2] >> 3);
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  const samples = [...histogram.entries()].map(([key, weight]) => ({
    color: [((key >> 10) & 31) * 8 + 4, ((key >> 5) & 31) * 8 + 4, (key & 31) * 8 + 4] as [number, number, number],
    weight,
  }));
  const count = Math.max(2, Math.min(requestedCount, samples.length));
  const palette: Array<[number, number, number]> = [];
  palette.push([...samples.reduce((best, sample) => sample.weight > best.weight ? sample : best).color] as [number, number, number]);
  while (palette.length < count) {
    let best = samples[0];
    let bestScore = -1;
    samples.forEach((sample) => {
      const distance = Math.min(...palette.map((color) => colorDistance(sample.color, color)));
      const score = distance * Math.sqrt(sample.weight);
      if (score > bestScore) { best = sample; bestScore = score; }
    });
    palette.push([...best.color] as [number, number, number]);
  }
  for (let iteration = 0; iteration < 8; iteration += 1) {
    const sums = palette.map(() => [0, 0, 0, 0]);
    samples.forEach((sample) => {
      const cluster = nearestColor(sample.color, palette);
      sums[cluster][0] += sample.color[0] * sample.weight;
      sums[cluster][1] += sample.color[1] * sample.weight;
      sums[cluster][2] += sample.color[2] * sample.weight;
      sums[cluster][3] += sample.weight;
    });
    sums.forEach((sum, index) => {
      if (sum[3] > 0) palette[index] = [Math.round(sum[0] / sum[3]), Math.round(sum[1] / sum[3]), Math.round(sum[2] / sum[3])];
    });
  }
  const labels = new Uint8Array(visible.length);
  for (let index = 0; index < visible.length; index += 1) {
    if (!visible[index]) continue;
    const offset = index * 4;
    labels[index] = nearestColor([rgba[offset], rgba[offset + 1], rgba[offset + 2]], palette);
  }
  return { palette, labels };
}

function nearestColor(color: number[], palette: number[][]): number {
  let best = 0;
  let distance = Number.POSITIVE_INFINITY;
  palette.forEach((candidate, index) => {
    const next = colorDistance(color, candidate);
    if (next < distance) { best = index; distance = next; }
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

function modeFilter(labels: Uint8Array, visible: Uint8Array, width: number, height: number): Uint8Array {
  const result = labels.slice();
  for (let row = 1; row < height - 1; row += 1) {
    for (let col = 1; col < width - 1; col += 1) {
      const index = row * width + col;
      if (!visible[index]) continue;
      const counts = new Uint8Array(32);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        const neighbor = index + dy * width + dx;
        if (visible[neighbor]) counts[labels[neighbor]] += 1;
      }
      let best = labels[index];
      for (let label = 0; label < counts.length; label += 1) if (counts[label] > counts[best]) best = label;
      result[index] = best;
    }
  }
  return result;
}

function buildLayerSpecs(
  palette: Array<[number, number, number]>, labels: Uint8Array, visible: Uint8Array,
  width: number, height: number, minimumArea: number,
): LayerSpec[] {
  return palette.map((color, label) => {
    const raw = new Uint8Array(labels.length);
    for (let index = 0; index < labels.length; index += 1) if (visible[index] && labels[index] === label) raw[index] = 1;
    const mask = removeSmallComponents(raw, width, height, minimumArea);
    return {
      paletteIndex: label, color, colorHex: rgbToHex(color), luminance: color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722,
      pixelCount: countMask(mask), mask,
    };
  }).filter((spec) => spec.pixelCount >= minimumArea);
}

function removeSmallComponents(mask: Uint8Array, width: number, height: number, minimumArea: number): Uint8Array {
  const result = new Uint8Array(mask.length);
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0; let tail = 0; queue[tail++] = start; visited[start] = 1;
    while (head < tail) {
      const current = queue[head++]; const row = Math.floor(current / width); const col = current % width;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const nr = row + dy; const nc = col + dx;
        if (nr < 0 || nr >= height || nc < 0 || nc >= width) continue;
        const next = nr * width + nc;
        if (mask[next] && !visited[next]) { visited[next] = 1; queue[tail++] = next; }
      }
    }
    if (tail >= minimumArea) for (let index = 0; index < tail; index += 1) result[queue[index]] = 1;
  }
  return result;
}

function orderLayers(
  specs: LayerSpec[], labels: Uint8Array, visible: Uint8Array, width: number, height: number,
  params: WorkerRequest['params'],
): LayerSpec[] {
  let background: LayerSpec | undefined;
  if (params.backgroundStrategy === 'dominant') background = [...specs].sort((a, b) => b.pixelCount - a.pixelCount)[0];
  if (params.backgroundStrategy === 'border') {
    const counts = new Map<number, number>();
    for (let col = 0; col < width; col += 1) for (const row of [0, height - 1]) {
      const index = row * width + col; if (visible[index]) counts.set(labels[index], (counts.get(labels[index]) ?? 0) + 1);
    }
    for (let row = 1; row < height - 1; row += 1) for (const col of [0, width - 1]) {
      const index = row * width + col; if (visible[index]) counts.set(labels[index], (counts.get(labels[index]) ?? 0) + 1);
    }
    let bestLabel = -1; let bestCount = -1;
    counts.forEach((count, label) => { if (count > bestCount) { bestLabel = label; bestCount = count; } });
    if (bestLabel >= 0) background = specs.find((spec) => spec.paletteIndex === bestLabel);
  }
  const remaining = specs.filter((spec) => spec !== background);
  if (params.layerOrderStrategy === 'light_on_top') remaining.sort((a, b) => a.luminance - b.luminance);
  else remaining.sort((a, b) => b.luminance - a.luminance);
  if (!background) return remaining;
  return [{ ...background, mask: visible.slice(), pixelCount: countMask(visible) }, ...remaining];
}

function rectangularFrame(width: number, height: number, requested: number): Uint8Array {
  const frame = new Uint8Array(width * height);
  const size = Math.max(0, Math.min(requested, Math.floor(Math.min(width, height) / 2)));
  for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
    if (row < size || row >= height - size || col < size || col >= width - size) frame[row * width + col] = 1;
  }
  return frame;
}

function buildBackfillMasks(masks: Uint8Array[], frame: Uint8Array): Uint8Array[] {
  const result = new Array<Uint8Array>(masks.length);
  const support = frame.slice();
  for (let layer = masks.length - 1; layer >= 0; layer -= 1) {
    for (let index = 0; index < support.length; index += 1) if (masks[layer][index]) support[index] = 1;
    result[layer] = support.slice();
  }
  return result;
}

function maskToBinaryStl(mask: Uint8Array, width: number, height: number, pixel: number, z0: number, z1: number): ArrayBuffer {
  let triangles = countMask(mask) * 4;
  for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
    const index = row * width + col; if (!mask[index]) continue;
    if (row === 0 || !mask[index - width]) triangles += 2;
    if (row === height - 1 || !mask[index + width]) triangles += 2;
    if (col === 0 || !mask[index - 1]) triangles += 2;
    if (col === width - 1 || !mask[index + 1]) triangles += 2;
  }
  const buffer = new ArrayBuffer(84 + triangles * 50); const view = new DataView(buffer); view.setUint32(80, triangles, true); let offset = 84;
  const add = (a: number[], b: number[], c: number[]) => {
    const normal = triangleNormal(a, b, c); for (const value of normal) { view.setFloat32(offset, value, true); offset += 4; }
    for (const point of [a, b, c]) for (const value of point) { view.setFloat32(offset, value, true); offset += 4; }
    view.setUint16(offset, 0, true); offset += 2;
  };
  const quad = (a: number[], b: number[], c: number[], d: number[]) => { add(a, b, c); add(a, c, d); };
  for (let row = 0; row < height; row += 1) for (let col = 0; col < width; col += 1) {
    const index = row * width + col; if (!mask[index]) continue;
    const x0 = col * pixel; const x1 = (col + 1) * pixel; const y0 = (height - row - 1) * pixel; const y1 = (height - row) * pixel;
    quad([x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]);
    quad([x0,y1,z0],[x1,y1,z0],[x1,y0,z0],[x0,y0,z0]);
    if (row === 0 || !mask[index-width]) quad([x0,y1,z0],[x0,y1,z1],[x1,y1,z1],[x1,y1,z0]);
    if (row === height-1 || !mask[index+width]) quad([x1,y0,z0],[x1,y0,z1],[x0,y0,z1],[x0,y0,z0]);
    if (col === 0 || !mask[index-1]) quad([x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]);
    if (col === width-1 || !mask[index+1]) quad([x1,y1,z0],[x1,y0,z0],[x1,y0,z1],[x1,y1,z1]);
  }
  return buffer;
}

function triangleNormal(a: number[], b: number[], c: number[]): [number, number, number] {
  const ab = [b[0]-a[0],b[1]-a[1],b[2]-a[2]]; const ac = [c[0]-a[0],c[1]-a[1],c[2]-a[2]];
  const n: [number,number,number] = [ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]];
  const length = Math.hypot(...n) || 1; return [n[0]/length,n[1]/length,n[2]/length];
}

function countMask(mask: Uint8Array): number { let count = 0; for (const value of mask) count += value; return count; }
function rgbToHex(color: number[]): string { return `#${color.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2,'0')).join('').toUpperCase()}`; }

export {};
