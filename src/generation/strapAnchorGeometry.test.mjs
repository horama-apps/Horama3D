import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { analyzeStlLocally } from './stlValidation.ts';
import { cutIntegratedAnchor, anchorCurve, parseAnchorPorts } from './strapAnchorGeometry.ts';
const wasm = await Module(); wasm.setup();
const ports = [{ point: [20, -14, 0], normal: [1, 0, 0] }, { point: [14, -20, 0], normal: [0, -1, 0] }];

test('creates a continuous two-entry corner tunnel while keeping one closed solid', () => {
  const cube = wasm.Manifold.cube([40, 40, 20], true);
  const result = cutIntegratedAnchor(wasm, cube, ports, 2.5, 1.2);
  assert.equal(result.status(), 'NoError');
  assert.ok(result.volume() < cube.volume());
  const parts = result.decompose(); assert.equal(parts.length, 1); parts.forEach(p => p.delete());
  for (const t of [.1, .25, .5, .75, .9]) {
    const p = anchorCurve(ports, 2.5, 1.2).getPoint(t);
    const ball = wasm.Manifold.sphere(.2, 12); const sample = ball.translate(p.toArray());
    const material = wasm.Manifold.intersection(result, sample);
    assert.ok(material.volume() < 1e-5, `Tunnel blocked at ${t}`);
    material.delete(); sample.delete(); ball.delete();
  }
  result.delete(); cube.delete();
});

test('rejects cuts through thin walls and leaves the input unchanged', () => {
  const slab = wasm.Manifold.cube([40, 40, 3], true);
  const volume = slab.volume();
  const facePorts = [{ point: [-6, 0, 1.5], normal: [0, 0, 1] }, { point: [6, 0, 1.5], normal: [0, 0, 1] }];
  assert.throws(() => cutIntegratedAnchor(wasm, slab, facePorts, 2.5, 1.2), /suficiente material/);
  assert.equal(slab.volume(), volume); slab.delete();
});

test('rejects entries that would merge and invalid surface positions', () => {
  const cube = wasm.Manifold.cube([40, 40, 20], true);
  assert.throws(() => cutIntegratedAnchor(wasm, cube, [ports[0], ports[0]], 2.5, 1.2), /Separa/);
  assert.throws(() => cutIntegratedAnchor(wasm, cube, [{ ...ports[0], point: [50, 50, 50] }, ports[1]], 2.5, 1.2), /superficie|60 mm/);
  assert.deepEqual(parseAnchorPorts('invalid'), [null, null]); cube.delete();
});

test('keeps the original coordinate system and supports entries on a shared face', () => {
  const raw = wasm.Manifold.cube([40, 40, 20], true);
  const cube = raw.translate([100, -50, 30]); raw.delete();
  const facePorts = [{ point: [94, -70, 30], normal: [0, -1, 0] }, { point: [106, -70, 30], normal: [0, -1, 0] }];
  const result = cutIntegratedAnchor(wasm, cube, facePorts, 2.5, 1.2);
  assert.deepEqual(result.boundingBox(), cube.boundingBox());
  result.delete(); cube.delete();
});

test('binary STL export remains watertight at ray-picked floating point positions', async () => {
  const cube = wasm.Manifold.cube([40, 40, 20], true);
  for (const delta of [0, 0.00000265, -0.00000371]) {
    const selected = [{ point: [20, -14 + delta, delta], normal: [1, 0, 0] },
      { point: [14 + delta, -20, delta], normal: [0, -1, 0] }];
    const cut = cutIntegratedAnchor(wasm, cube, selected, 2.5, 1.2);
    const mesh = cut.getMesh();
    const geometry = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(mesh.vertProperties, 3));
    geometry.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
    const object = new THREE.Mesh(geometry); object.updateMatrixWorld(true);
    const data = new STLExporter().parse(object, { binary: true });
    const result = await analyzeStlLocally({ arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) });
    assert.equal(result.isWatertight, true, JSON.stringify({ delta, ...result }));
    geometry.dispose(); object.material.dispose(); cut.delete();
  }
  cube.delete();
});
