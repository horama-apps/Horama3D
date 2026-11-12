import test from 'node:test';
import assert from 'node:assert/strict';
import Module from 'manifold-3d';
import { createAnchorOutput } from './strapAnchorOutput.ts';
import { analyzeStlLocally } from './stlValidation.ts';

const wasm = await Module(); wasm.setup();

test('exports a closed tunnel in a detailed curved model away from the origin', async () => {
  const cylinder = wasm.Manifold.cylinder(7, 6, 6, 256);
  const source = cylinder.translate([375, 102, 38]); cylinder.delete();
  const hits = [source.rayCast([390, 102, 41.5], [375, 102, 41.5])[0],
    source.rayCast([375, 87, 41.5], [375, 102, 41.5])[0]];
  const ports = hits.map(hit => ({ point: hit.position, normal: hit.normal }));
  const before = source.volume();
  try {
    const { output } = await createAnchorOutput(wasm, source, ports, 2.5, 1.2);
    const validation = await analyzeStlLocally(new File([output], 'curved.stl'));
    assert.equal(validation.isWatertight, true);
    assert.equal(source.volume(), before, 'export must preserve the original input');
  } finally { source.delete(); }
});

test('output recovery never bypasses insufficient material checks', async () => {
  const source = wasm.Manifold.cube([40, 40, 3], true);
  try {
    const ports = [{ point: [-6, 0, 1.5], normal: [0, 0, 1] },
      { point: [6, 0, 1.5], normal: [0, 0, 1] }];
    await assert.rejects(createAnchorOutput(wasm, source, ports, 2.5, 1.2), /suficiente material/);
  } finally { source.delete(); }
});
