/// <reference lib="webworker" />
import Module, { type Manifold } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { StrapCutter } from './strapCutterGeometry';
import { createCutterOutput } from './strapAnchorOutput';

self.onmessage = async (event: MessageEvent<{ input: ArrayBuffer; cutter: StrapCutter }>) => {
  try {
    const wasm = await Module({ locateFile: () => wasmUrl });
    wasm.setup();
    const parsed = new STLLoader().parse(event.data.input);
    parsed.deleteAttribute('normal');
    const welded = mergeVertices(parsed, 1e-5);
    const mesh = new wasm.Mesh({ numProp: 3,
      vertProperties: new Float32Array(welded.getAttribute('position').array),
      triVerts: new Uint32Array(welded.getIndex()!.array) });
    mesh.merge();
    parsed.dispose(); welded.dispose();
    let body: Manifold;
    try { body = new wasm.Manifold(mesh); }
    catch { throw new Error('Este STL debe ser un sólido cerrado. Repara la malla antes de crear el túnel.'); }
    try {
      const { output, warnings } = await createCutterOutput(wasm, body, event.data.cutter);
      self.postMessage({ output, warnings }, [output]);
    } finally { body.delete(); }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'No se pudo crear el túnel integrado.' });
  }
};
