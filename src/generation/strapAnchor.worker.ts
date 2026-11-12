/// <reference lib="webworker" />
import Module, { type Manifold } from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { analyzeStlLocally } from './stlValidation';
import { cutIntegratedAnchor, type AnchorPort } from './strapAnchorGeometry';

self.onmessage = async (event: MessageEvent<{ input: ArrayBuffer; ports: [AnchorPort, AnchorPort]; diameter: number; wall: number }>) => {
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
      const result = cutIntegratedAnchor(wasm, body, event.data.ports, event.data.diameter, event.data.wall);
      try {
        const resultMesh = result.getMesh();
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(resultMesh.vertProperties, 3));
        geometry.setIndex(new THREE.BufferAttribute(resultMesh.triVerts, 1));
        const object = new THREE.Mesh(geometry);
        object.updateMatrixWorld(true);
        const data = new STLExporter().parse(object, { binary: true }) as DataView;
        const output = new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice().buffer;
        geometry.dispose();
        const validation = await analyzeStlLocally(new File([output], 'tunel.stl', { type: 'model/stl' }));
        if (!validation.isValid || !validation.isWatertight) {
          throw new Error('No se pudo obtener un STL cerrado con estas entradas. Reubícalas ligeramente y vuelve a generar.');
        }
        self.postMessage({ output }, [output]);
      } finally { result.delete(); }
    } finally { body.delete(); }
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'No se pudo crear el túnel integrado.' });
  }
};
