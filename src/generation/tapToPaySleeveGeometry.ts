export function roundedRectangleMask(
  width: number,
  height: number,
  radiusPixels: number,
): Uint8Array {
  const mask = new Uint8Array(width * height);
  const radius = Math.max(0, Math.min(radiusPixels, Math.floor(Math.min(width, height) / 2)));
  const left = radius;
  const right = width - radius;
  const bottom = radius;
  const top = height - radius;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const x = column + 0.5;
      const y = row + 0.5;
      const closestX = Math.max(left, Math.min(right, x));
      const closestY = Math.max(bottom, Math.min(top, y));
      if (Math.hypot(x - closestX, y - closestY) <= radius) {
        mask[row * width + column] = 1;
      }
    }
  }
  return mask;
}

export function rearRailMask(
  outer: Uint8Array,
  width: number,
  height: number,
  railPixels: number,
  openingSide: 'left' | 'right',
): Uint8Array {
  const mask = new Uint8Array(outer.length);
  const rail = Math.max(1, Math.min(railPixels, Math.floor(Math.min(width, height) / 3)));
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const index = row * width + column;
      if (!outer[index]) continue;
      const horizontalRail = row < rail || row >= height - rail;
      const closedEnd = openingSide === 'right' ? column < rail : column >= width - rail;
      if (horizontalRail || closedEnd) mask[index] = 1;
    }
  }
  return mask;
}

export function addEntryDetents(
  railMask: Uint8Array,
  outer: Uint8Array,
  width: number,
  height: number,
  railPixels: number,
  openingSide: 'left' | 'right',
  lengthPixels: number,
): Uint8Array {
  const result = railMask.slice();
  const rail = Math.max(1, railPixels);
  const length = Math.max(1, Math.min(width, lengthPixels));
  const start = openingSide === 'right' ? width - length : 0;
  const end = openingSide === 'right' ? width : length;
  for (let column = start; column < end; column += 1) {
    const row = rail;
    const index = row * width + column;
    if (row >= 0 && row < height && outer[index]) result[index] = 1;
  }
  return result;
}

export function normalizeDiagonalLabels(
  labels: Uint8Array,
  active: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const result = labels.slice();
  for (let pass = 0; pass < Math.max(8, width + height); pass += 1) {
    let changed = false;
    for (let row = 0; row < height - 1; row += 1) {
      for (let column = 0; column < width - 1; column += 1) {
        const topLeft = row * width + column;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + width;
        const bottomRight = bottomLeft + 1;
        const a = result[topLeft];
        const b = result[topRight];
        const c = result[bottomLeft];
        const d = result[bottomRight];
        if (active[topLeft] && active[bottomRight]
          && a === d
          && (!active[topRight] || a !== b)
          && (!active[bottomLeft] || a !== c)) {
          if (active[bottomLeft]) result[bottomRight] = c;
          else if (active[topRight]) result[bottomRight] = b;
          else continue;
          changed = true;
        } else if (active[topRight] && active[bottomLeft]
          && b === c
          && (!active[topLeft] || b !== a)
          && (!active[bottomRight] || b !== d)) {
          if (active[bottomRight]) result[bottomLeft] = d;
          else if (active[topLeft]) result[bottomLeft] = a;
          else continue;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  return result;
}

export function labelsToMasks(
  labels: Uint8Array,
  active: Uint8Array,
  colorCount: number,
): Uint8Array[] {
  const masks = Array.from({ length: colorCount }, () => new Uint8Array(labels.length));
  for (let index = 0; index < labels.length; index += 1) {
    if (active[index] && labels[index] < masks.length) masks[labels[index]][index] = 1;
  }
  return masks;
}

export function removeDiagonalMaskContacts(
  mask: Uint8Array,
  width: number,
  height: number,
): { mask: Uint8Array; removed: number[] } {
  const result = mask.slice();
  const removed: number[] = [];
  const degree = (index: number) => {
    const row = Math.floor(index / width);
    const column = index % width;
    let neighbors = 0;
    if (row > 0 && result[index - width]) neighbors += 1;
    if (row + 1 < height && result[index + width]) neighbors += 1;
    if (column > 0 && result[index - 1]) neighbors += 1;
    if (column + 1 < width && result[index + 1]) neighbors += 1;
    return neighbors;
  };
  for (let pass = 0; pass < Math.max(width, height); pass += 1) {
    let changed = false;
    for (let row = 0; row < height - 1; row += 1) for (let column = 0; column < width - 1; column += 1) {
      const topLeft = row * width + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + width;
      const bottomRight = bottomLeft + 1;
      let target = -1;
      if (result[topLeft] && result[bottomRight] && !result[topRight] && !result[bottomLeft]) {
        target = degree(topLeft) < degree(bottomRight) ? topLeft : bottomRight;
      } else if (result[topRight] && result[bottomLeft] && !result[topLeft] && !result[bottomRight]) {
        target = degree(topRight) < degree(bottomLeft) ? topRight : bottomLeft;
      }
      if (target >= 0) {
        result[target] = 0;
        removed.push(target);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { mask: result, removed };
}

export function maskOverlapCount(masks: Uint8Array[]): number {
  let overlaps = 0;
  const length = masks[0]?.length ?? 0;
  for (let index = 0; index < length; index += 1) {
    let count = 0;
    for (const mask of masks) count += mask[index] ? 1 : 0;
    if (count > 1) overlaps += 1;
  }
  return overlaps;
}
