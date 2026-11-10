import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildQrSignBaseGeometry, getQrSignBaseDimensions } from './qrSignBaseGeometry.ts';

for (const width of [105, 140, 180]) {
  for (const thickness of [1.6, 3.2, 8]) {
    test(`base fits ${width} mm plate at ${thickness} mm thickness`, () => {
      const dimensions = getQrSignBaseDimensions(width, thickness);
      const geometry = buildQrSignBaseGeometry(width, thickness);
      geometry.computeBoundingBox();
      const size = geometry.boundingBox.getSize(new THREE.Vector3());
      assert.equal(size.x, width + 12);
      assert.equal(size.y, 46);
      assert.equal(size.z, 12);
      assert.ok(Math.abs(dimensions.slotWidth - thickness - 0.6) < 1e-6);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.updateMatrixWorld(true);
      const topAt = (x, y) => new THREE.Raycaster(
        new THREE.Vector3(x, y, 30), new THREE.Vector3(0, 0, -1),
      ).intersectObject(mesh)[0]?.point.z;
      // Both faces of the inserted plate fit down to the slot floor.
      for (const x of [-width / 2, 0, width / 2]) {
        for (const y of [6 - thickness / 2, 6 + thickness / 2]) {
          assert.ok(Math.abs(topAt(x, y) - 3) < 1e-5);
        }
      }
      assert.equal(topAt(0, -12), 12);
      assert.equal(topAt(0, 18), 12);
      geometry.dispose();
      mesh.material.dispose();
    });
  }
}
