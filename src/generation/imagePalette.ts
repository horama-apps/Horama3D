export type RgbColor = [number, number, number];

export function preserveExtremePaletteColors(
  palette: RgbColor[],
  samples: Array<{ color: RgbColor; weight: number }>,
): RgbColor[] {
  const result = palette.map((color) => [...color] as RgbColor);
  const total = samples.reduce((sum, sample) => sum + sample.weight, 0);
  const snap = (predicate: (color: RgbColor) => boolean) => {
    const candidates = samples.filter((sample) => predicate(sample.color));
    const weight = candidates.reduce((sum, sample) => sum + sample.weight, 0);
    if (weight < total * 0.0015) return;
    const target: RgbColor = [
      Math.round(candidates.reduce((sum, sample) => sum + sample.color[0] * sample.weight, 0) / weight),
      Math.round(candidates.reduce((sum, sample) => sum + sample.color[1] * sample.weight, 0) / weight),
      Math.round(candidates.reduce((sum, sample) => sum + sample.color[2] * sample.weight, 0) / weight),
    ];
    result[nearestColorIndex(target, result)] = target;
  };
  snap((color) => luminance(color) <= 52);
  snap((color) => luminance(color) >= 244);
  return result;
}

export function preserveRasterExtremes(
  palette: RgbColor[],
  rgba: Uint8ClampedArray,
  visible: Uint8Array,
): { palette: RgbColor[]; labels: Uint8Array } {
  const samples: Array<{ color: RgbColor; weight: number }> = [];
  const histogram = new Map<number, number>();
  for (let index = 0; index < visible.length; index += 1) {
    if (!visible[index]) continue;
    const offset = index * 4;
    const key = (rgba[offset] << 16) | (rgba[offset + 1] << 8) | rgba[offset + 2];
    histogram.set(key, (histogram.get(key) ?? 0) + 1);
  }
  for (const [key, weight] of histogram) {
    samples.push({ color: [(key >> 16) & 255, (key >> 8) & 255, key & 255], weight });
  }
  const resultPalette = preserveExtremePaletteColors(palette, samples);
  const total = samples.reduce((sum, sample) => sum + sample.weight, 0);
  const snapSupportedExtreme = (
    supportPredicate: (color: RgbColor) => boolean,
    anchorPredicate: (color: RgbColor) => boolean,
    paletteIndex: number,
  ) => {
    const support = samples.filter((sample) => supportPredicate(sample.color));
    if (support.reduce((sum, sample) => sum + sample.weight, 0) < total * 0.0015) return;
    const anchors = samples.filter((sample) => anchorPredicate(sample.color));
    const anchorWeight = anchors.reduce((sum, sample) => sum + sample.weight, 0);
    if (!anchorWeight) return;
    resultPalette[paletteIndex] = [
      Math.round(anchors.reduce((sum, sample) => sum + sample.color[0] * sample.weight, 0) / anchorWeight),
      Math.round(anchors.reduce((sum, sample) => sum + sample.color[1] * sample.weight, 0) / anchorWeight),
      Math.round(anchors.reduce((sum, sample) => sum + sample.color[2] * sample.weight, 0) / anchorWeight),
    ];
  };
  let darkest = 0;
  let brightest = 0;
  for (let index = 1; index < resultPalette.length; index += 1) {
    if (luminance(resultPalette[index]) < luminance(resultPalette[darkest])) darkest = index;
    if (luminance(resultPalette[index]) > luminance(resultPalette[brightest])) brightest = index;
  }
  snapSupportedExtreme((color) => luminance(color) <= 115, (color) => luminance(color) <= 70, darkest);
  snapSupportedExtreme((color) => luminance(color) >= 235, (color) => luminance(color) >= 248, brightest);
  const labels = new Uint8Array(visible.length);
  for (let index = 0; index < visible.length; index += 1) {
    if (!visible[index]) continue;
    const offset = index * 4;
    labels[index] = nearestColorIndex([rgba[offset], rgba[offset + 1], rgba[offset + 2]], resultPalette);
  }
  return { palette: resultPalette, labels };
}

export function reinforceDarkLineArt(
  labels: Uint8Array,
  rgba: Uint8ClampedArray,
  visible: Uint8Array,
  palette: RgbColor[],
  maximumSourceLuminance = 150,
): Uint8Array {
  let darkest = 0;
  for (let index = 1; index < palette.length; index += 1) {
    if (luminance(palette[index]) < luminance(palette[darkest])) darkest = index;
  }
  if (!palette.length || luminance(palette[darkest]) > 80) return labels;
  const result = labels.slice();
  for (let index = 0; index < visible.length; index += 1) {
    if (!visible[index]) continue;
    const offset = index * 4;
    if (luminance([rgba[offset], rgba[offset + 1], rgba[offset + 2]]) <= maximumSourceLuminance) {
      result[index] = darkest;
    }
  }
  return result;
}

export function collapseIncidentalPalette(
  palette: RgbColor[],
  labels: Uint8Array,
  visible: Uint8Array,
): { palette: RgbColor[]; labels: Uint8Array } {
  if (palette.length <= 2) return { palette, labels };
  const weights = palette.map(() => 0);
  let total = 0;
  for (let index = 0; index < labels.length; index += 1) {
    if (!visible[index]) continue;
    weights[labels[index]] += 1;
    total += 1;
  }

  const keep = palette.map(() => true);
  for (let candidate = 0; candidate < palette.length; candidate += 1) {
    if (weights[candidate] / Math.max(1, total) >= 0.04) continue;
    if (liesBetweenStrongerColors(candidate, palette, weights)) keep[candidate] = false;
  }
  if (keep.every(Boolean) || keep.filter(Boolean).length < 2) return { palette, labels };

  const keptColors = palette.filter((_, index) => keep[index]);
  const indexMap = palette.map((color, index) => {
    if (keep[index]) return keptColors.indexOf(color);
    return nearestColorIndex(color, keptColors);
  });
  const remapped = labels.slice();
  for (let index = 0; index < remapped.length; index += 1) {
    if (visible[index]) remapped[index] = indexMap[labels[index]];
  }
  return { palette: keptColors, labels: remapped };
}

function liesBetweenStrongerColors(candidate: number, palette: RgbColor[], weights: number[]): boolean {
  for (let first = 0; first < palette.length; first += 1) {
    if (first === candidate || weights[first] <= weights[candidate]) continue;
    for (let second = first + 1; second < palette.length; second += 1) {
      if (second === candidate || weights[second] <= weights[candidate]) continue;
      const { distance, position } = distanceToSegment(palette[candidate], palette[first], palette[second]);
      if (distance <= 18 && position >= 0.12 && position <= 0.88) return true;
    }
  }
  return false;
}

function distanceToSegment(point: RgbColor, start: RgbColor, end: RgbColor) {
  const direction = end.map((value, index) => value - start[index]);
  const lengthSquared = direction.reduce((sum, value) => sum + value * value, 0);
  const rawPosition = lengthSquared === 0
    ? 0
    : direction.reduce((sum, value, index) => sum + (point[index] - start[index]) * value, 0) / lengthSquared;
  const position = Math.max(0, Math.min(1, rawPosition));
  const projection = start.map((value, index) => value + direction[index] * position);
  return {
    position,
    distance: Math.hypot(
      point[0] - projection[0],
      point[1] - projection[1],
      point[2] - projection[2],
    ),
  };
}

function nearestColorIndex(color: RgbColor, palette: RgbColor[]): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  palette.forEach((candidate, index) => {
    const distance = Math.hypot(
      color[0] - candidate[0],
      color[1] - candidate[1],
      color[2] - candidate[2],
    );
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

function luminance(color: RgbColor): number {
  return color[0] * 0.2126 + color[1] * 0.7152 + color[2] * 0.0722;
}
