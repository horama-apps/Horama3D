export function assignFrameToColor(
  masks: Uint8Array[],
  frame: Uint8Array,
  ownerIndex = 0,
): Uint8Array[] {
  return masks.map((mask, maskIndex) => {
    const result = mask.slice();
    for (let index = 0; index < result.length; index += 1) {
      if (!frame[index]) continue;
      result[index] = maskIndex === ownerIndex ? 1 : 0;
    }
    return result;
  });
}

export function buildBackingMask(
  width: number,
  height: number,
): Uint8Array {
  return new Uint8Array(width * height).fill(1);
}

export function countMaskPixels(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) count += value;
  return count;
}

export function maximumMaskOverlap(masks: Uint8Array[]): number {
  const length = masks[0]?.length ?? 0;
  let maximum = 0;
  for (let index = 0; index < length; index += 1) {
    let overlap = 0;
    for (const mask of masks) overlap += mask[index] ? 1 : 0;
    maximum = Math.max(maximum, overlap);
  }
  return maximum;
}

export function removeDiagonalContacts(masks: Uint8Array[], width: number, height: number): Uint8Array[] {
  const result = masks.map((mask) => mask.slice());
  let changed = true;
  for (let pass = 0; pass < 4 && changed; pass += 1) {
    changed = false;
    for (const mask of result) {
      for (let row = 0; row < height - 1; row += 1) {
        for (let col = 0; col < width - 1; col += 1) {
          const topLeft = row * width + col;
          const topRight = topLeft + 1;
          const bottomLeft = topLeft + width;
          const bottomRight = bottomLeft + 1;
          if (mask[topLeft] && mask[bottomRight] && !mask[topRight] && !mask[bottomLeft]) {
            mask[bottomRight] = 0;
            changed = true;
          } else if (mask[topRight] && mask[bottomLeft] && !mask[topLeft] && !mask[bottomRight]) {
            mask[bottomLeft] = 0;
            changed = true;
          }
        }
      }
    }
  }
  return result;
}
