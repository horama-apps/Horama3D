import assert from 'node:assert/strict';
import test from 'node:test';

import { generateTapToPaySleeveFromPixels, maskToBinaryStl } from './tapToPaySleeve.worker.ts';

test('preserves the full area of disconnected color regions', () => {
  const width = 32;
  const height = 20;
  const mask = new Uint8Array(width * height);
  for (let row = 1; row < 8; row += 1) for (let column = 1; column < 13; column += 1) mask[row * width + column] = 1;
  for (let row = 3; row < 16; row += 1) for (let column = 19; column < 30; column += 1) mask[row * width + column] = 1;
  for (let row = 10; row < 18; row += 1) for (let column = 5; column < 10; column += 1) mask[row * width + column] = 1;

  const thickness = 0.4;
  const buffer = maskToBinaryStl(mask, width, height, 0.2, 0.2, 0, thickness);
  const expectedVolume = [...mask].reduce((sum, value) => sum + value, 0) * 0.2 * 0.2 * thickness;
  assert.ok(Math.abs(binaryStlVolume(buffer) - expectedVolume) < 1e-4);
});

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

  const templated = generateTapToPaySleeveFromPixels(rgba, 800, 500, width, height, {
    colorCount: 4,
    fitMode: 'cover',
    detailPreset: 'balanced',
    backgroundStrategy: 'dominant',
    cardClearanceMm: 0.35,
    faceThicknessMm: 0.6,
    colorThicknessMm: 0.4,
    openingSide: 'right',
  }, {
    bodyBuffer: generated.parts[0].buffer,
    outerWidthMm: 86.6,
    outerHeightMm: 56.5,
    totalThicknessMm: 1.84,
  });
  assert.equal(templated.parts.length, templated.metadata.color_count);
  assert.ok(templated.parts.slice(1).every((part) => part.color !== templated.parts[0].color));
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
      const forward = vertices[a] < vertices[b];
      const edge = forward ? `${vertices[a]}|${vertices[b]}` : `${vertices[b]}|${vertices[a]}`;
      const current = edges.get(edge) ?? { count: 0, orientation: 0 };
      current.count += 1;
      current.orientation += forward ? 1 : -1;
      edges.set(edge, current);
    }
  }
  return [...edges.values()].filter(({ count, orientation }) => count !== 2 || orientation !== 0).length;
}

function binaryStlVolume(buffer) {
  const view = new DataView(buffer);
  let signedVolume = 0;
  for (let triangle = 0; triangle < view.getUint32(80, true); triangle += 1) {
    const base = 84 + triangle * 50 + 12;
    const point = (offset) => [0, 4, 8].map((delta) => view.getFloat32(offset + delta, true));
    const a = point(base);
    const b = point(base + 12);
    const c = point(base + 24);
    signedVolume += (
      a[0] * (b[1] * c[2] - b[2] * c[1])
      - a[1] * (b[0] * c[2] - b[2] * c[0])
      + a[2] * (b[0] * c[1] - b[1] * c[0])
    ) / 6;
  }
  return Math.abs(signedVolume);
}
