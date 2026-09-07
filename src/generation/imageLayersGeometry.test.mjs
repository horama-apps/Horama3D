import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignFrameToColor,
  buildBackingMask,
  countMaskPixels,
  maximumMaskOverlap,
  removeDiagonalContacts,
} from './imageLayersGeometry.ts';

test('assigns every frame pixel exclusively to the selected color', () => {
  const masks = [
    Uint8Array.from([1, 0, 0, 1, 0, 0]),
    Uint8Array.from([0, 1, 0, 0, 1, 0]),
    Uint8Array.from([0, 0, 1, 0, 0, 1]),
  ];
  const frame = Uint8Array.from([1, 1, 1, 0, 0, 0]);

  const result = assignFrameToColor(masks, frame, 0);

  assert.deepEqual([...result[0]], [1, 1, 1, 1, 0, 0]);
  assert.deepEqual([...result[1]], [0, 0, 0, 0, 1, 0]);
  assert.deepEqual([...result[2]], [0, 0, 0, 0, 0, 1]);
  assert.equal(maximumMaskOverlap(result), 1);
  assert.equal(countMaskPixels(result[0]), 4);
});

test('creates a continuous rectangular backing', () => {
  assert.deepEqual(
    [...buildBackingMask(3, 2)],
    [1, 1, 1, 1, 1, 1],
  );
});

test('reports accidental overlaps between color masks', () => {
  const masks = [
    Uint8Array.from([1, 1, 0]),
    Uint8Array.from([0, 1, 1]),
  ];
  assert.equal(maximumMaskOverlap(masks), 2);
});

test('removes diagonal-only contacts that become non-manifold edges', () => {
  const masks = [Uint8Array.from([
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
  ])];
  const [result] = removeDiagonalContacts(masks, 3, 3);
  assert.deepEqual([...result], [1, 0, 0, 0, 0, 0, 0, 0, 1]);
});
