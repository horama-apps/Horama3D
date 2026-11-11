import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { buildQrSignBaseGeometry, getQrSignBaseDimensions, placeQrSignBaseText } from './qrSignBaseGeometry.ts';

import Module from 'manifold-3d';
import { cutQrSignBase } from './qrSignBaseCut.ts';
import { readFileSync } from 'node:fs';
import { TTFLoader } from 'three/addons/loaders/TTFLoader.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';

const wasm = await Module();
wasm.setup();
function engraveQrSignBase(base, text, width, thickness, depth) {
  const tool = new THREE.Mesh(text);
  placeQrSignBaseText(tool, width, thickness, depth);
  tool.updateMatrixWorld(true);
  const transformed = text.clone().applyMatrix4(tool.matrixWorld);
  const flatten = (geometry) => new Float32Array((geometry.index ? geometry.toNonIndexed() : geometry).getAttribute('position').array);
  const result = cutQrSignBase(wasm, flatten(base), flatten(transformed));
  transformed.dispose();
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(result.positions, 3))
    .setIndex(new THREE.BufferAttribute(result.indices, 1));
}

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

test('cuts a realistic long script inscription promptly', () => {
  const bytes = readFileSync(new URL('../../public/fonts/satisfy_regular.ttf', import.meta.url));
  const data = new TTFLoader().parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const font = new FontLoader().parse(data);
  const shapes = font.generateShapes('Boda Melissa & Erick Eduardo', 10).map((shape) => {
    const points = shape.extractPoints(10);
    const polygon = new THREE.Shape(points.shape);
    polygon.holes = points.holes.map((hole) => new THREE.Path(hole));
    return polygon;
  });
  const text = new THREE.ExtrudeGeometry(shapes, { depth: 0.85, bevelEnabled: false, curveSegments: 4 });
  text.computeBoundingBox();
  const bounds = text.boundingBox.clone();
  const size = bounds.getSize(new THREE.Vector3());
  const scale = Math.min(117.6 / size.x, 8 / size.y);
  text.translate(-(bounds.min.x + bounds.max.x) / 2, -(bounds.min.y + bounds.max.y) / 2, 0);
  text.scale(scale, scale, 1);
  const base = buildQrSignBaseGeometry(140, 3.2);
  const start = performance.now();
  const result = engraveQrSignBase(base, text, 140, 3.2, 0.8);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 5000, `Text cut took ${elapsed.toFixed(0)} ms`);
  assert.ok(result.getAttribute('position').count > 100);
  console.log(`Long script text cut: ${elapsed.toFixed(0)} ms`);
  result.dispose(); text.dispose(); base.dispose();
});
