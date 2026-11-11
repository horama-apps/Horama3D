import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildQrSignBaseGeometry, getQrSignBaseDimensions, engraveQrSignBase, placeQrSignBaseText } from './qrSignBaseGeometry.ts';

for (const width of [105, 140, 180]) {
  for (const thickness of [1.6, 3.2, 8]) {
    test(`base fits ${width} mm plate at ${thickness} mm thickness`, () => {
      const dimensions = getQrSignBaseDimensions(width, thickness);
      const geometry = buildQrSignBaseGeometry(width, thickness);
      geometry.computeBoundingBox();
      const size = geometry.boundingBox.getSize(new THREE.Vector3());
      assert.equal(size.x, width + 12);
      assert.equal(size.y, 46);
      assert.equal(size.z, 18);
      assert.ok(Math.abs(dimensions.slotWidth - thickness - 0.2) < 1e-6);
      const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
      mesh.updateMatrixWorld(true);
      const topAt = (x, y) => new THREE.Raycaster(
        new THREE.Vector3(x, y, 30), new THREE.Vector3(0, 0, -1),
      ).intersectObject(mesh)[0]?.point.z;
      // Both faces of the inserted plate fit down to the slot floor.
      for (const x of [-width / 2, 0, width / 2]) {
        for (const y of [6 - thickness / 2, 6 + thickness / 2]) {
          assert.ok(Math.abs(topAt(x, y) - 9) < 1e-5);
        }
      }
      assert.equal(topAt(0, -12), 18);
      assert.ok(topAt(0, 18) < 18);
      // The lettering sits on the sloped front and faces the viewer, not the top.
      const normal = new THREE.Vector3(0, -12 / 13, 5 / 13);
      const textCenter = new THREE.Vector3(0, dimensions.frontTextY, dimensions.frontTextZ);
      const frontHit = new THREE.Raycaster(
        textCenter.clone().addScaledVector(normal, 20), normal.clone().negate(),
      ).intersectObject(mesh)[0];
      assert.ok(frontHit.point.distanceTo(textCenter) < 1e-5);
      const textNormal = new THREE.Vector3(0, 0, 1).applyAxisAngle(
        new THREE.Vector3(1, 0, 0), dimensions.frontTextAngle,
      );
      assert.ok(textNormal.distanceTo(normal) < 1e-6);
      assert.equal(dimensions.height - dimensions.floorThickness, 9);
      geometry.dispose();
      mesh.material.dispose();
    });
  }
}

test('engraving cuts into the front without adding raised geometry', () => {
  const base = buildQrSignBaseGeometry(140, 3.2);
  const cutter = new THREE.BoxGeometry(10, 5, 0.85);
  cutter.translate(0, 0, 0.85 / 2);
  const geometry = engraveQrSignBase(base, cutter, 140, 3.2, 0.8);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld(true);
  const normal = new THREE.Vector3(0, -12 / 13, 5 / 13);
  const center = new THREE.Vector3(0, -18.5, 10);
  const hit = new THREE.Raycaster(center.clone().addScaledVector(normal, 10), normal.clone().negate()).intersectObject(mesh)[0];
  assert.ok(Math.abs(hit.distance - 10.8) < 1e-4);
  geometry.computeBoundingBox();
  assert.equal(geometry.boundingBox.max.z, 18);
  base.dispose(); cutter.dispose(); geometry.dispose(); mesh.material.dispose();
});

test('colored text insert ends flush with the front and fills the engraved depth', () => {
  const depth = 0.8;
  const geometry = new THREE.BoxGeometry(10, 5, depth);
  geometry.translate(0, 0, depth / 2);
  const insert = new THREE.Mesh(geometry);
  placeQrSignBaseText(insert, 140, 3.2, depth);
  insert.updateMatrixWorld(true);
  const normal = new THREE.Vector3(0, -12 / 13, 5 / 13);
  const center = new THREE.Vector3(0, -18.5, 10);
  const vertices = geometry.getAttribute('position');
  const distances = Array.from({ length: vertices.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(vertices, i).applyMatrix4(insert.matrixWorld).sub(center).dot(normal));
  assert.ok(Math.abs(Math.max(...distances)) < 1e-6);
  assert.ok(Math.abs(Math.min(...distances) + depth) < 1e-6);
  geometry.dispose(); insert.material.dispose();
});
