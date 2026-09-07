import assert from 'node:assert/strict';
import test from 'node:test';

import { analyzeStlLocally } from './stlValidation.ts';

const encoder = new TextEncoder();

function stlFile(facets) {
  const body = facets
    .map(
      ([a, b, c]) => `facet normal 0 0 0
  outer loop
    vertex ${a.join(' ')}
    vertex ${b.join(' ')}
    vertex ${c.join(' ')}
  endloop
endfacet`,
    )
    .join('\n');
  const buffer = encoder.encode(`solid test\n${body}\nendsolid test`).buffer;
  return { arrayBuffer: async () => buffer };
}

const vertices = [
  [0, 0, 0],
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];

test('accepts a closed solid without topology warnings', async () => {
  const result = await analyzeStlLocally(
    stlFile([
      [vertices[0], vertices[2], vertices[1]],
      [vertices[0], vertices[1], vertices[3]],
      [vertices[1], vertices[2], vertices[3]],
      [vertices[2], vertices[0], vertices[3]],
    ]),
  );

  assert.equal(result.isValid, true);
  assert.equal(result.isWatertight, true);
  assert.deepEqual(result.warnings, []);
});

test('allows a non-watertight mesh with a warning', async () => {
  const result = await analyzeStlLocally(
    stlFile([
      [vertices[0], vertices[2], vertices[1]],
      [vertices[0], vertices[1], vertices[3]],
      [vertices[1], vertices[2], vertices[3]],
      [vertices[1], vertices[2], vertices[3]],
    ]),
  );

  assert.equal(result.isValid, true);
  assert.equal(result.isWatertight, false);
  assert.match(result.warnings[0], /no es hermético/);
  assert.match(result.warnings[0], /Se intentará procesar de todos modos/);
});
