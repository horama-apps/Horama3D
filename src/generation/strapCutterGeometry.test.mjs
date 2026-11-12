import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { cutWithStrapCutter, cutterWorldPath, cutterLocalPath, cutterPoseOnSurface, cutterQuaternion, parseCutterPose } from './strapCutterGeometry.ts';
import { createCutterOutput } from './strapAnchorOutput.ts';
import { analyzeStlLocally } from './stlValidation.ts';
import * as THREE from 'three';
const wasm = await Module(); wasm.setup();
const cutter = { pose: { position: [0, -20, 0], rotation: [0, 0, 0] }, diameter: 2.5, spacing: 4.5, depth: 5, wall: 1.2 };

test('subtracts a U volume with closer openings while retaining a material bridge', () => {
  const body = wasm.Manifold.cube([40, 40, 20], true);
  const before = body.volume();
  const cut = cutWithStrapCutter(wasm, body, cutter);
  try {
    assert.ok(cut.volume() < before); assert.equal(body.volume(), before);
    const parts = cut.decompose(); assert.equal(parts.length, 1); parts.forEach(p => p.delete());
    for (const point of cutterWorldPath(cutter).slice(1, -1)) {
      const sphere = wasm.Manifold.sphere(.15, 12), sample = sphere.translate(point.toArray());
      const intersection = wasm.Manifold.intersection(cut, sample);
      assert.ok(intersection.volume() < 1e-5, 'passage must remain open');
      intersection.delete(); sample.delete(); sphere.delete();
    }
    const bridgeSphere = wasm.Manifold.sphere(.2, 12), bridge = bridgeSphere.translate([0, -19, 0]);
    const material = wasm.Manifold.intersection(cut, bridge);
    assert.ok(material.volume() > .02, 'U must retain the bridge between its legs');
    material.delete(); bridge.delete(); bridgeSphere.delete();
  } finally { cut.delete(); body.delete(); }
});

test('exports a rotated and translated cutter result as a closed STL', async () => {
  const cube = wasm.Manifold.cube([40, 40, 20], true), shifted = cube.translate([0, 20, 0]); cube.delete();
  const rotated = shifted.rotate([90, 0, 35]); shifted.delete();
  const body = rotated.translate([375, 102, 40]); rotated.delete();
  try {
    const { output } = await createCutterOutput(wasm, body, { ...cutter, pose: { position: [375, 102, 40], rotation: [90, 0, 35] } });
    assert.equal((await analyzeStlLocally(new File([output], 'rotated.stl'))).isWatertight, true);
  } finally { body.delete(); }
});

test('rejects nonintersecting or enclosed cutters, weak bridges and thin parts', () => {
  const body = wasm.Manifold.cube([40, 40, 20], true), thin = wasm.Manifold.cube([40, 40, 3], true);
  try {
    assert.throws(() => cutWithStrapCutter(wasm, body, { ...cutter, pose: { position: [100, -20, 0], rotation: [0, 0, 0] } }), /no atraviesa/);
    assert.throws(() => cutWithStrapCutter(wasm, body, { ...cutter, pose: { position: [0, 0, 0], rotation: [0, 0, 0] } }), /sobresalir/);
    assert.throws(() => cutWithStrapCutter(wasm, body, { ...cutter, spacing: 3 }), /puente/);
    assert.throws(() => cutWithStrapCutter(wasm, thin, cutter), /material/);
  } finally { body.delete(); thin.delete(); }
});

test('surface placement points the cutter into curved, vertical and horizontal faces', () => {
  for (const normal of [[0, -1, 0], [1, 0, 0], [0, 0, 1], [.6, -.8, 0]]) {
    const pose = cutterPoseOnSurface([375, 102, 42], normal);
    const into = new THREE.Vector3(0, 1, 0).applyQuaternion(cutterQuaternion(pose));
    assert.ok(into.dot(new THREE.Vector3(...normal)) < -.9999);
  }
  assert.equal(parseCutterPose('{"position":[0,0,0],"rotation":[0,null,0]}'), null);
  assert.equal(parseCutterPose('not a pose'), null);
  const points = cutterLocalPath(cutter);
  assert.equal(points[0].x, -cutter.spacing / 2);
  assert.equal(points.at(-1).x, cutter.spacing / 2);
  assert.ok(Math.abs(Math.max(...points.map(p => p.y)) - cutter.depth) < 1e-6);
});
