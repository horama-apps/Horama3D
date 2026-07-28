/// <reference lib="webworker" />

interface WorkerRequest {
  id: number;
  input: ArrayBuffer;
  mimeType: string;
  params: {
    mode: string;
    backingStyle: string;
    widthMm: number;
    baseThicknessMm: number;
    reliefHeightMm: number;
    thresholdPercent: number;
    lineWidthMm: number;
    backingMarginMm: number;
    detailPreset: string;
    invert: boolean;
    baseColor: string;
    detailColor: string;
    midColor: string;
  };
}

interface GeneratedPart {
  name: string;
  role: string;
  color: string;
  buffer: ArrayBuffer;
  pixelCount: number;
  zMinMm: number;
  zMaxMm: number;
}

interface CropBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    const result = await generateDecoration(request);
    self.postMessage(
      { id: request.id, ...result },
      result.parts.map((part) => part.buffer),
    );
  } catch (error) {
    self.postMessage({
      id: request.id,
      error: error instanceof Error
        ? error.message
        : 'No se pudo simplificar la imagen.',
    });
  }
};

async function generateDecoration(request: WorkerRequest) {
  const { params } = request;
  const bitmap = await createImageBitmap(
    new Blob([request.input], { type: request.mimeType }),
  );
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const maximumPixels =
    params.detailPreset === 'high'
      ? 240
      : params.detailPreset === 'draft'
        ? 96
        : 160;
  const scale = Math.min(1, maximumPixels / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(3, Math.round(bitmap.width * scale));
  const height = Math.max(3, Math.round(bitmap.height * scale));
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    throw new Error('Este navegador no permite procesar la imagen localmente.');
  }
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const rgba = context.getImageData(0, 0, width, height).data;
  const gray = new Uint8Array(width * height);
  const alpha = new Uint8Array(width * height);
  for (let index = 0; index < gray.length; index += 1) {
    const offset = index * 4;
    gray[index] = Math.round(
      rgba[offset] * 0.2126 +
      rgba[offset + 1] * 0.7152 +
      rgba[offset + 2] * 0.0722,
    );
    alpha[index] = rgba[offset + 3];
  }

  const cutoff = 255 - Math.round(params.thresholdPercent * 2.55);
  const ink = new Uint8Array(gray.length);
  const foreground = new Uint8Array(gray.length);
  for (let index = 0; index < gray.length; index += 1) {
    ink[index] = params.invert ? gray[index] : 255 - gray[index];
    if (alpha[index] > 20 && ink[index] >= cutoff) foreground[index] = 1;
  }

  const minimumArea =
    params.detailPreset === 'high'
      ? 3
      : params.detailPreset === 'draft'
        ? 12
        : 6;
  let primaryMask: Uint8Array;
  let secondaryMask: Uint8Array | undefined;
  if (params.mode === 'line_art') {
    primaryMask = sobelEdges(gray, alpha, width, height, params.invert);
  } else if (params.mode === 'levels') {
    const middleCutoff = Math.max(18, Math.round(cutoff * 0.55));
    const topCutoff = Math.min(245, Math.round(cutoff * 1.25));
    primaryMask = thresholdInk(ink, alpha, middleCutoff);
    secondaryMask = thresholdInk(ink, alpha, topCutoff);
  } else {
    primaryMask = foreground;
  }
  primaryMask = removeSmallComponents(
    primaryMask,
    width,
    height,
    minimumArea,
  );
  if (secondaryMask) {
    secondaryMask = removeSmallComponents(
      secondaryMask,
      width,
      height,
      minimumArea,
    );
  }
  if (countMask(primaryMask) === 0) {
    throw new Error(
      'No se detectó una figura. Ajusta el umbral o activa Invertir imagen.',
    );
  }

  let bounds = maskBounds(primaryMask, width, height, 3);
  let croppedPrimary = cropMask(primaryMask, width, bounds);
  let croppedSecondary = secondaryMask
    ? cropMask(secondaryMask, width, bounds)
    : undefined;
  let croppedWidth = bounds.maxX - bounds.minX + 1;
  let croppedHeight = bounds.maxY - bounds.minY + 1;
  let pixelSizeMm = params.widthMm / croppedWidth;

  if (params.mode === 'line_art') {
    const radius = Math.max(1, Math.ceil(params.lineWidthMm / pixelSizeMm / 2));
    croppedPrimary = dilate(
      croppedPrimary,
      croppedWidth,
      croppedHeight,
      radius,
    );
  }

  const backingSource =
    params.mode === 'levels' && croppedSecondary
      ? unionMasks(croppedPrimary, croppedSecondary)
      : croppedPrimary;
  let backingMask: Uint8Array | undefined;
  if (params.backingStyle === 'rectangle') {
    backingMask = new Uint8Array(croppedWidth * croppedHeight).fill(1);
  } else if (params.backingStyle === 'contour') {
    const marginPixels = Math.max(
      1,
      Math.ceil(params.backingMarginMm / pixelSizeMm),
    );
    backingMask = dilate(
      backingSource,
      croppedWidth,
      croppedHeight,
      marginPixels,
    );
  }

  const parts: GeneratedPart[] = [];
  const baseZ = backingMask ? params.baseThicknessMm : 0;
  if (backingMask) {
    parts.push(
      createPart(
        'respaldo',
        'body',
        params.baseColor,
        backingMask,
        croppedWidth,
        croppedHeight,
        pixelSizeMm,
        0,
        params.baseThicknessMm,
      ),
    );
  }

  if (params.mode === 'levels' && croppedSecondary) {
    const middleHeight = params.reliefHeightMm / 2;
    parts.push(
      createPart(
        'relieve-medio',
        'detail_mid',
        params.midColor,
        croppedPrimary,
        croppedWidth,
        croppedHeight,
        pixelSizeMm,
        baseZ,
        baseZ + middleHeight,
      ),
    );
    parts.push(
      createPart(
        'relieve-superior',
        'detail',
        params.detailColor,
        croppedSecondary,
        croppedWidth,
        croppedHeight,
        pixelSizeMm,
        baseZ + middleHeight,
        baseZ + params.reliefHeightMm,
      ),
    );
  } else {
    parts.push(
      createPart(
        params.mode === 'line_art' ? 'line-art' : 'silueta',
        'detail',
        params.detailColor,
        croppedPrimary,
        croppedWidth,
        croppedHeight,
        pixelSizeMm,
        baseZ,
        baseZ + params.reliefHeightMm,
      ),
    );
  }

  const heightMm = croppedHeight * pixelSizeMm;
  return {
    parts,
    metadata: {
      original_width_px: originalWidth,
      original_height_px: originalHeight,
      processed_width_px: croppedWidth,
      processed_height_px: croppedHeight,
      width_mm: params.widthMm,
      height_mm: heightMm,
      layer_height_mm: params.reliefHeightMm,
      color_count: new Set(parts.map((part) => part.color)).size,
      layer_count: parts.length,
      colors: [...new Set(parts.map((part) => part.color))],
    },
    warnings: [
      'La imagen fue recortada y simplificada localmente; revisa detalles finos antes de imprimir.',
      params.backingStyle === 'none'
        ? 'Sin respaldo, las regiones desconectadas se imprimirán como piezas independientes dentro del mismo STL.'
        : 'El respaldo mantiene unidos los detalles simplificados para facilitar la impresión y el montaje.',
    ],
  };
}

function createPart(
  name: string,
  role: string,
  color: string,
  mask: Uint8Array,
  width: number,
  height: number,
  pixelSizeMm: number,
  zMinMm: number,
  zMaxMm: number,
): GeneratedPart {
  return {
    name,
    role,
    color,
    buffer: maskToBinaryStl(
      mask,
      width,
      height,
      pixelSizeMm,
      zMinMm,
      zMaxMm,
    ),
    pixelCount: countMask(mask),
    zMinMm,
    zMaxMm,
  };
}

function thresholdInk(
  ink: Uint8Array,
  alpha: Uint8Array,
  cutoff: number,
): Uint8Array {
  const mask = new Uint8Array(ink.length);
  for (let index = 0; index < ink.length; index += 1) {
    if (alpha[index] > 20 && ink[index] >= cutoff) mask[index] = 1;
  }
  return mask;
}

function sobelEdges(
  gray: Uint8Array,
  alpha: Uint8Array,
  width: number,
  height: number,
  invert: boolean,
): Uint8Array {
  const edges = new Uint8Array(width * height);
  const sample = (row: number, col: number) => {
    const index = row * width + col;
    if (alpha[index] <= 20) return invert ? 0 : 255;
    return gray[index];
  };
  for (let row = 1; row < height - 1; row += 1) {
    for (let col = 1; col < width - 1; col += 1) {
      const gx =
        -sample(row - 1, col - 1) +
        sample(row - 1, col + 1) -
        2 * sample(row, col - 1) +
        2 * sample(row, col + 1) -
        sample(row + 1, col - 1) +
        sample(row + 1, col + 1);
      const gy =
        sample(row - 1, col - 1) +
        2 * sample(row - 1, col) +
        sample(row - 1, col + 1) -
        sample(row + 1, col - 1) -
        2 * sample(row + 1, col) -
        sample(row + 1, col + 1);
      if (Math.hypot(gx, gy) >= 72) edges[row * width + col] = 1;
    }
  }
  return edges;
}

function removeSmallComponents(
  mask: Uint8Array,
  width: number,
  height: number,
  minimumArea: number,
): Uint8Array {
  const result = new Uint8Array(mask.length);
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    while (head < tail) {
      const current = queue[head++];
      const row = Math.floor(current / width);
      const col = current % width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nextRow = row + dy;
          const nextCol = col + dx;
          if (
            nextRow < 0 ||
            nextRow >= height ||
            nextCol < 0 ||
            nextCol >= width
          ) {
            continue;
          }
          const next = nextRow * width + nextCol;
          if (mask[next] && !visited[next]) {
            visited[next] = 1;
            queue[tail++] = next;
          }
        }
      }
    }
    if (tail >= minimumArea) {
      for (let index = 0; index < tail; index += 1) {
        result[queue[index]] = 1;
      }
    }
  }
  return result;
}

function dilate(
  mask: Uint8Array,
  width: number,
  height: number,
  radius: number,
): Uint8Array {
  if (radius <= 0) return mask.slice();
  const result = mask.slice();
  const radiusSquared = radius * radius;
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!mask[row * width + col]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (dx * dx + dy * dy > radiusSquared) continue;
          const nextRow = row + dy;
          const nextCol = col + dx;
          if (
            nextRow >= 0 &&
            nextRow < height &&
            nextCol >= 0 &&
            nextCol < width
          ) {
            result[nextRow * width + nextCol] = 1;
          }
        }
      }
    }
  }
  return result;
}

function unionMasks(a: Uint8Array, b: Uint8Array): Uint8Array {
  const result = new Uint8Array(a.length);
  for (let index = 0; index < result.length; index += 1) {
    if (a[index] || b[index]) result[index] = 1;
  }
  return result;
}

function maskBounds(
  mask: Uint8Array,
  width: number,
  height: number,
  padding: number,
): CropBounds {
  let minX = width - 1;
  let minY = height - 1;
  let maxX = 0;
  let maxY = 0;
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      if (!mask[row * width + col]) continue;
      minX = Math.min(minX, col);
      minY = Math.min(minY, row);
      maxX = Math.max(maxX, col);
      maxY = Math.max(maxY, row);
    }
  }
  return {
    minX: Math.max(0, minX - padding),
    minY: Math.max(0, minY - padding),
    maxX: Math.min(width - 1, maxX + padding),
    maxY: Math.min(height - 1, maxY + padding),
  };
}

function cropMask(
  mask: Uint8Array,
  sourceWidth: number,
  bounds: CropBounds,
): Uint8Array {
  const width = bounds.maxX - bounds.minX + 1;
  const height = bounds.maxY - bounds.minY + 1;
  const result = new Uint8Array(width * height);
  for (let row = 0; row < height; row += 1) {
    const sourceRow = bounds.minY + row;
    for (let col = 0; col < width; col += 1) {
      result[row * width + col] =
        mask[sourceRow * sourceWidth + bounds.minX + col];
    }
  }
  return result;
}

function maskToBinaryStl(
  mask: Uint8Array,
  width: number,
  height: number,
  pixel: number,
  z0: number,
  z1: number,
): ArrayBuffer {
  let triangles = countMask(mask) * 4;
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const index = row * width + col;
      if (!mask[index]) continue;
      if (row === 0 || !mask[index - width]) triangles += 2;
      if (row === height - 1 || !mask[index + width]) triangles += 2;
      if (col === 0 || !mask[index - 1]) triangles += 2;
      if (col === width - 1 || !mask[index + 1]) triangles += 2;
    }
  }
  const buffer = new ArrayBuffer(84 + triangles * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles, true);
  let offset = 84;
  const add = (a: number[], b: number[], c: number[]) => {
    const normal = triangleNormal(a, b, c);
    for (const value of normal) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
    for (const point of [a, b, c]) {
      for (const value of point) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  };
  const quad = (a: number[], b: number[], c: number[], d: number[]) => {
    add(a, b, c);
    add(a, c, d);
  };
  for (let row = 0; row < height; row += 1) {
    for (let col = 0; col < width; col += 1) {
      const index = row * width + col;
      if (!mask[index]) continue;
      const x0 = col * pixel;
      const x1 = (col + 1) * pixel;
      const y0 = (height - row - 1) * pixel;
      const y1 = (height - row) * pixel;
      quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]);
      quad([x0, y1, z0], [x1, y1, z0], [x1, y0, z0], [x0, y0, z0]);
      if (row === 0 || !mask[index - width]) {
        quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]);
      }
      if (row === height - 1 || !mask[index + width]) {
        quad([x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y0, z0]);
      }
      if (col === 0 || !mask[index - 1]) {
        quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1]);
      }
      if (col === width - 1 || !mask[index + 1]) {
        quad([x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]);
      }
    }
  }
  return buffer;
}

function triangleNormal(
  a: number[],
  b: number[],
  c: number[],
): [number, number, number] {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal: [number, number, number] = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const length = Math.hypot(...normal) || 1;
  return [
    normal[0] / length,
    normal[1] / length,
    normal[2] / length,
  ];
}

function countMask(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) count += value;
  return count;
}

export {};
