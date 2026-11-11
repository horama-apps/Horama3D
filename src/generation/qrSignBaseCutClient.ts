import * as THREE from 'three';
import type { BaseCutMesh } from './qrSignBaseCut';
import { placeQrSignBaseText } from './qrSignBaseGeometry';

export async function engraveQrSignBase(base: THREE.BufferGeometry, text: THREE.BufferGeometry,
  plateWidth: number, plateThickness: number, depth: number): Promise<THREE.BufferGeometry> {
  const cutter = new THREE.Mesh(text);
  placeQrSignBaseText(cutter, plateWidth, plateThickness, depth);
  cutter.updateMatrixWorld(true);
  const transformed = text.clone().applyMatrix4(cutter.matrixWorld);
  const positions = (geometry: THREE.BufferGeometry): Float32Array => {
    const flattened = geometry.index ? geometry.toNonIndexed() : geometry;
    const result = new Float32Array(flattened.getAttribute('position').array);
    if (flattened !== geometry) flattened.dispose();
    return result;
  };
  const input = { base: positions(base), text: positions(transformed) };
  transformed.dispose();
  const worker = new Worker(new URL('./qrSignBase.worker.ts', import.meta.url), { type: 'module' });
  try {
    const result = await new Promise<BaseCutMesh>((resolve, reject) => {
      const timeout = window.setTimeout(() => reject(new Error('El texto de la base tardó demasiado. Prueba con un texto más corto.')), 30_000);
      worker.onmessage = (event: MessageEvent<BaseCutMesh & { error?: string }>) => {
        window.clearTimeout(timeout);
        if (event.data.error) reject(new Error(event.data.error));
        else resolve(event.data);
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'No se pudo generar el texto de la base.'));
      };
      worker.postMessage(input, [input.base.buffer, input.text.buffer]);
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(result.positions, 3));
    geometry.setIndex(new THREE.BufferAttribute(result.indices, 1));
    geometry.computeVertexNormals();
    return geometry;
  } finally {
    worker.terminate();
  }
}
