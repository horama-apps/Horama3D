import * as THREE from 'three';

export function getQrSignBaseDimensions(plateWidth: number, plateThickness: number) {
  return {
    width: plateWidth + 12,
    depth: 46,
    height: 12,
    floorThickness: 3,
    slotWidth: plateThickness + 0.6,
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
  profile.lineTo(depth / 2, height);
  profile.lineTo(rear, height);
  profile.lineTo(rear, floorThickness);
  profile.lineTo(front, floorThickness);
  profile.lineTo(front, height);
  profile.lineTo(-depth / 2, height);
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
