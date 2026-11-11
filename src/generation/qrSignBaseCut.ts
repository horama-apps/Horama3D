import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import * as THREE from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

export interface BaseCutMesh {
  positions: Float32Array;
  indices: Uint32Array;
}

export function cutQrSignBase(wasm: ManifoldToplevel, base: Float32Array, text: Float32Array): BaseCutMesh {
  const solids: Manifold[] = [];
  try {
    for (const positions of [base, text]) {
      const source = new THREE.BufferGeometry();
      source.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const welded = mergeVertices(source, 1e-5);
      const mesh = new wasm.Mesh({
        numProp: 3,
        vertProperties: new Float32Array(welded.getAttribute('position').array),
        triVerts: new Uint32Array(welded.getIndex()!.array),
      });
      mesh.merge();
      const solid = new wasm.Manifold(mesh);
      source.dispose();
      welded.dispose();
      solids.push(solid);
    }
    const cut = wasm.Manifold.difference(solids[0], solids[1]);
    solids.push(cut);
    if (cut.isEmpty()) throw new Error('No se pudo generar la base con texto incrustado.');
    const mesh = cut.getMesh();
    return { positions: new Float32Array(mesh.vertProperties), indices: new Uint32Array(mesh.triVerts) };
  } finally {
    solids.forEach((solid) => solid.delete());
  }
}
