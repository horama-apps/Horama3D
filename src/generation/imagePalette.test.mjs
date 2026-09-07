import assert from 'node:assert/strict';
import test from 'node:test';

import { collapseIncidentalPalette, preserveExtremePaletteColors, preserveRasterExtremes, reinforceDarkLineArt } from './imagePalette.ts';

test('collapses a small antialias color between black and white', () => {
  const palette = [[250, 250, 250], [30, 30, 30], [250, 195, 25], [135, 135, 135]];
  const labels = Uint8Array.from([
    ...Array(70).fill(0),
    ...Array(20).fill(1),
    ...Array(8).fill(2),
    ...Array(2).fill(3),
  ]);
  const result = collapseIncidentalPalette(palette, labels, new Uint8Array(100).fill(1));
  assert.deepEqual(result.palette, palette.slice(0, 3));
  assert.equal(new Set(result.labels).size, 3);
});

test('keeps antialiased dark strokes assigned to the black filament', () => {
  const palette = [[252, 211, 36], [209, 176, 125], [254, 254, 254], [30, 30, 26]];
  const rgba = new Uint8ClampedArray([
    252, 211, 36, 255,
    125, 112, 70, 255,
    209, 176, 125, 255,
  ]);
  const labels = reinforceDarkLineArt(Uint8Array.from([0, 1, 1]), rgba, new Uint8Array(3).fill(1), palette);
  assert.deepEqual([...labels], [0, 3, 1]);
});

test('restores black assignments after an antialias palette was collapsed', () => {
  const rgba = new Uint8ClampedArray([
    254, 212, 32, 255,
    15, 15, 15, 255,
    252, 252, 252, 255,
    209, 176, 125, 255,
  ]);
  const visible = new Uint8Array(4).fill(1);
  const result = preserveRasterExtremes(
    [[252, 211, 36], [137, 122, 66], [208, 177, 124], [247, 247, 246]],
    rgba,
    visible,
  );
  assert.ok(result.palette.some((color) => color.every((channel) => channel <= 20)));
  assert.equal(result.labels[1], result.palette.findIndex((color) => color.every((channel) => channel <= 20)));
});

test('keeps a small saturated accent color', () => {
  const palette = [[250, 250, 250], [30, 30, 30], [250, 195, 25]];
  const labels = Uint8Array.from([
    ...Array(78).fill(0),
    ...Array(20).fill(1),
    ...Array(2).fill(2),
  ]);
  const result = collapseIncidentalPalette(palette, labels, new Uint8Array(100).fill(1));
  assert.equal(result.palette.length, 3);
  assert.deepEqual(result.palette[2], [250, 195, 25]);
});

test('preserves meaningful black and white endpoints for line art', () => {
  const palette = [[252, 211, 36], [137, 122, 66], [208, 177, 124], [247, 247, 246]];
  const samples = [
    { color: [252, 211, 36], weight: 9000 },
    { color: [20, 20, 20], weight: 180 },
    { color: [208, 177, 124], weight: 600 },
    { color: [252, 252, 252], weight: 500 },
  ];
  const result = preserveExtremePaletteColors(palette, samples);
  assert.ok(result.some((color) => color.every((channel) => channel <= 24)));
  assert.ok(result.some((color) => color.every((channel) => channel >= 248)));
});
