import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { analyzeStlLocally } from './stlValidation.ts';
import { cutIntegratedAnchor, type AnchorPort } from './strapAnchorGeometry.ts';
import { cutWithStrapCutter, type StrapCutter } from './strapCutterGeometry.ts';

function serialize(body: Manifold): ArrayBuffer {
  const mesh = body.getMesh();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(mesh.vertProperties, 3));
  geometry.setIndex(new THREE.BufferAttribute(mesh.triVerts, 1));
  const object = new THREE.Mesh(geometry);
  try {
    object.updateMatrixWorld(true);
    const data = new STLExporter().parse(object, { binary: true }) as DataView;
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice().buffer;
  } finally { geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material.dispose()); }
}

/** Retry from the source: simplifying only the cut cannot resolve source slivers. */
export async function createAnchorOutput(wasm: ManifoldToplevel, source: Manifold,
  ports: [AnchorPort, AnchorPort], diameter: number, wall: number) {
  return createValidatedOutput(source, body => cutIntegratedAnchor(wasm, body, ports, diameter, wall));
}

export async function createCutterOutput(wasm: ManifoldToplevel, source: Manifold, cutter: StrapCutter) {
  return createValidatedOutput(source, body => cutWithStrapCutter(wasm, body, cutter));
}

async function createValidatedOutput(source: Manifold, cut: (body: Manifold) => Manifold) {
  for (const tolerance of [0, 0.005]) {
    const body = tolerance ? source.simplify(tolerance) : source;
    try {
      // Repeat all geometric checks after source cleanup.
      const result = cut(body);
      let output: ArrayBuffer;
      try { output = serialize(result); } finally { result.delete(); }
      const validation = await analyzeStlLocally(new File([output], 'tunel.stl', { type: 'model/stl' }));
      if (validation.isValid && validation.isWatertight) {
        return { output, warnings: tolerance
          ? ['Se limpiaron irregularidades diminutas de la malla original (tolerancia de 0.005 mm) para obtener un STL cerrado.'] : [] };
      }
    } finally { if (body !== source) body.delete(); }
  }
  throw new Error('No se pudo obtener un STL cerrado. Repara la malla original o prueba otra ubicación del cortador.');
}
