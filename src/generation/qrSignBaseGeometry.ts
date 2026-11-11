import * as THREE from 'three';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';

export function getQrSignBaseDimensions(plateWidth: number, plateThickness: number) {
  return {
    width: plateWidth + 12,
    depth: 46,
    height: 18,
    floorThickness: 9,
    frontTextY: -18.5,
    frontTextZ: 10,
    frontTextAngle: Math.atan2(12, 5),
    slotWidth: plateThickness + 0.2,
    slotCenterY: 6,
  };
}

// Extrude a single U profile so the base is one solid with an open insertion slot.
export function buildQrSignBaseGeometry(plateWidth: number, plateThickness: number) {
  const dimensions = getQrSignBaseDimensions(plateWidth, plateThickness);
  const { width, depth, height, floorThickness, slotWidth, slotCenterY } = dimensions;
  const front = slotCenterY - slotWidth / 2;
  const rear = slotCenterY + slotWidth / 2;
  const profile = new THREE.Shape();
  profile.moveTo(-depth / 2, 0);
  profile.lineTo(depth / 2, 0);
  // A low plinth, sloped shoulders and a narrow top bevel soften the silhouette.
  profile.lineTo(depth / 2, 2);
  profile.lineTo(depth / 2 - 2, 4);
  profile.lineTo(depth / 2 - 6, height - 2);
  profile.lineTo(depth / 2 - 8, height);
  profile.lineTo(rear, height);
  profile.lineTo(rear, floorThickness);
  profile.lineTo(front, floorThickness);
  profile.lineTo(front, height);
  profile.lineTo(-depth / 2 + 9, height);
  profile.lineTo(-depth / 2 + 7, height - 2);
  profile.lineTo(-depth / 2 + 2, 4);
  profile.lineTo(-depth / 2, 2);
  profile.closePath();
  const geometry = new THREE.ExtrudeGeometry(profile, {
    depth: width, bevelEnabled: false, steps: 1, curveSegments: 1,
  });
  geometry.applyMatrix4(new THREE.Matrix4().set(
    0, 0, 1, -width / 2,
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 0, 1,
  ));
  return geometry;
}

// Cut into the front face; the cutter extends slightly outside to avoid coplanar faces.
export function engraveQrSignBase(base: THREE.BufferGeometry, text: THREE.BufferGeometry,
  plateWidth: number, plateThickness: number, depth: number) {
  const dimensions = getQrSignBaseDimensions(plateWidth, plateThickness);
  const normal = new THREE.Vector3(0, -12 / 13, 5 / 13);
  const solid = new Brush(base);
  const cutter = new Brush(text);
  cutter.rotation.x = dimensions.frontTextAngle;
  cutter.position.set(0, dimensions.frontTextY, dimensions.frontTextZ);
  cutter.position.addScaledVector(normal, -depth);
  solid.updateMatrixWorld(true);
  cutter.updateMatrixWorld(true);
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  const result = evaluator.evaluate(solid, cutter, SUBTRACTION);
  result.geometry.computeVertexNormals();
  return result.geometry;
}
