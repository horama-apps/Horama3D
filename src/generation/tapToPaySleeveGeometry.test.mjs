import assert from 'node:assert/strict';
import test from 'node:test';

import {
  labelsToMasks,
  addEntryDetents,
  maskOverlapCount,
  normalizeDiagonalLabels,
  rearRailMask,
  roundedRectangleMask,
} from './tapToPaySleeveGeometry.ts';

test('creates a rounded sleeve face and an open-ended rear rail', () => {
  const outer = roundedRectangleMask(12, 8, 2);
  const rail = rearRailMask(outer, 12, 8, 2, 'right');
  assert.equal(outer[0], 0);
  assert.equal(outer[4 * 12 + 6], 1);
  assert.equal(rail[4 * 12], 1);
  assert.equal(rail[4 * 12 + 11], 0);
  assert.equal(rail[5], 1);
});

test('adds a small mirrored single-sided entry detent without closing the card opening', () => {
  const outer = new Uint8Array(12 * 8).fill(1);
  const rightRail = rearRailMask(outer, 12, 8, 2, 'right');
  const right = addEntryDetents(rightRail, outer, 12, 8, 2, 'right', 3);
  const leftRail = rearRailMask(outer, 12, 8, 2, 'left');
  const left = addEntryDetents(leftRail, outer, 12, 8, 2, 'left', 3);
  assert.equal(right[2 * 12 + 11], 1);
  assert.equal(right[4 * 12 + 11], 0);
  assert.equal(right[5 * 12 + 11], 0);
  assert.equal(left[2 * 12], 1);
  assert.equal(left[4 * 12], 0);
  assert.equal(left[5 * 12], 0);
});

test('normalizes diagonal-only color contacts without losing coverage', () => {
  const active = new Uint8Array(9).fill(1);
  const normalized = normalizeDiagonalLabels(
    Uint8Array.from([0, 1, 1, 1, 0, 1, 1, 1, 0]),
    active,
    3,
    3,
  );
  const masks = labelsToMasks(normalized, active, 2);
  assert.equal(maskOverlapCount(masks), 0);
  assert.equal(masks.reduce((sum, mask) => sum + mask.reduce((a, b) => a + b, 0), 0), 9);
  assert.notEqual(normalized[0], normalized[4]);
});
