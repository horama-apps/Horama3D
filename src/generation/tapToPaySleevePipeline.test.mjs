import assert from 'node:assert/strict';
import test from 'node:test';

import { generateTapToPaySleeveFromPixels } from './tapToPaySleeve.worker.ts';

test('generates one manifold card body plus four printable color parts', () => {
  const width = 160;
  const height = 104;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) for (let column = 0; column < width; column += 1) {
    const offset = (row * width + column) * 4;
    const eye = row >= 30 && row <= 46 && ((column >= 105 && column <= 120) || (column >= 124 && column <= 139));
    const muzzle = row >= 50 && row <= 76 && column >= 105 && column <= 140;
    const line = (row === 49 && column >= 112 && column <= 137)
      || (row === 68 && column >= 124 && column <= 139)
      || (column === 122 && row >= 34 && row <= 48);
    const color = line
      ? (row === 49 || column === 122 ? [20, 20, 18] : [92, 82, 55])
      : eye ? [254, 254, 254] : muzzle ? [209, 176, 125] : [254, 212, 32];
    rgba.set([...color, 255], offset);
  }
  const generated = generateTapToPaySleeveFromPixels(rgba, 800, 500, width, height, {
    colorCount: 4,
    fitMode: 'cover',
    detailPreset: 'balanced',
    backgroundStrategy: 'border',
    cardClearanceMm: 0.35,
    faceThicknessMm: 0.6,
    colorThicknessMm: 0.4,
    openingSide: 'right',
  });
  assert.equal(generated.parts.filter((part) => part.name.startsWith('body_')).length, 1);
  assert.equal(generated.parts.length, 5);
  assert.equal(generated.metadata.color_count, 4);
  assert.ok(generated.metadata.colors.some((hex) => parseInt(hex.slice(1, 3), 16) < 60));
  assert.ok(Math.abs(generated.metadata.effective_clearance_z_mm - 0.35) < 1e-6);
  for (const part of generated.parts) assert.equal(countInvalidStlEdges(part.buffer), 0, part.name);
});

function countInvalidStlEdges(buffer) {
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);
  const edges = new Map();
  const vertex = (offset) => [0, 4, 8].map((delta) => view.getFloat32(offset + delta, true).toFixed(5)).join(',');
  for (let index = 0; index < triangleCount; index += 1) {
    const base = 84 + index * 50 + 12;
    const vertices = [vertex(base), vertex(base + 12), vertex(base + 24)];
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) {
      const edge = vertices[a] < vertices[b] ? `${vertices[a]}|${vertices[b]}` : `${vertices[b]}|${vertices[a]}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
  }
  return [...edges.values()].filter((count) => count !== 2).length;
}
