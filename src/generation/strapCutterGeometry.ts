import * as THREE from 'three';
import type { Manifold, ManifoldToplevel, Mat4, Vec3 } from 'manifold-3d';

export interface CutterPose { position: [number, number, number]; rotation: [number, number, number] }
export interface StrapCutter { pose: CutterPose; diameter: number; spacing: number; depth: number; wall: number }
export function parseCutterPose(value: unknown): CutterPose | null {
  try {
    const pose = typeof value === 'string' ? JSON.parse(value) : value;
    if (!pose || ![pose.position, pose.rotation].every(v => Array.isArray(v) && v.length === 3 && v.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)))) return null;
    return { position: [...pose.position] as [number, number, number], rotation: [...pose.rotation] as [number, number, number] };
  } catch { return null; }
}
export function cutterQuaternion(pose: CutterPose) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(...pose.rotation.map(THREE.MathUtils.degToRad) as [number, number, number], 'XYZ'));
}
export function cutterPoseOnSurface(point: [number, number, number], normal: [number, number, number]): CutterPose {
  const y = new THREE.Vector3(...normal).normalize().negate();
  const up = Math.abs(y.z) > .95 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  const x = new THREE.Vector3().crossVectors(y, up).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const euler = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  return { position: point, rotation: [euler.x, euler.y, euler.z].map(THREE.MathUtils.radToDeg) as [number, number, number] };
}
/** The U lies in XY, enters along +Y and extends outside the object along -Y. */
export function cutterLocalPath(cutter: StrapCutter): THREE.Vector3[] {
  const radius = cutter.spacing / 2;
  const depth = Math.max(cutter.depth, radius);
  const extension = Math.max(4, cutter.diameter * 2);
  const points = [new THREE.Vector3(-radius, -extension, 0), new THREE.Vector3(-radius, depth - radius, 0)];
  for (let i = 1; i <= 24; i++) {
    const angle = Math.PI - Math.PI * i / 24;
    points.push(new THREE.Vector3(radius * Math.cos(angle), depth - radius + radius * Math.sin(angle), 0));
  }
  points.push(new THREE.Vector3(radius, -extension, 0));
  return points;
}
export function cutterWorldPath(cutter: StrapCutter) {
  const q = cutterQuaternion(cutter.pose), p = new THREE.Vector3(...cutter.pose.position);
  return cutterLocalPath(cutter).map(point => point.applyQuaternion(q).add(p));
}
/** Preview and Boolean use the same capsules and transforms. */
export function createCutterPreview(cutter: StrapCutter): THREE.Group {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: .55, depthTest: false, depthWrite: false });
  const points = cutterLocalPath(cutter);
  for (const point of points) {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(cutter.diameter / 2, 24, 12), material);
    ball.position.copy(point); ball.renderOrder = 29; group.add(ball);
  }
  for (let i = 1; i < points.length; i++) {
    const direction = points[i].clone().sub(points[i - 1]);
    const cylinder = new THREE.Mesh(new THREE.CylinderGeometry(cutter.diameter / 2, cutter.diameter / 2, direction.length(), 24), material);
    cylinder.position.copy(points[i]).add(points[i - 1]).multiplyScalar(.5);
    cylinder.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    cylinder.renderOrder = 29; group.add(cylinder);
  }
  return group;
}
export function cutWithStrapCutter(wasm: ManifoldToplevel, body: Manifold, cutter: StrapCutter): Manifold {
  if (!parseCutterPose(cutter.pose) || !Number.isFinite(cutter.diameter) || cutter.diameter < 1.5 || cutter.diameter > 8
    || !Number.isFinite(cutter.spacing) || cutter.spacing < 3 || cutter.spacing > 30
    || !Number.isFinite(cutter.depth) || cutter.depth < cutter.spacing / 2 || cutter.depth > 30
    || !Number.isFinite(cutter.wall) || cutter.wall < 1 || cutter.wall > 6) throw new Error('Revisa las medidas del cortador. La profundidad debe ser al menos la mitad de la separación.');
  if (cutter.spacing - cutter.diameter + 1e-6 < cutter.wall) throw new Error('Aumenta la separación del cortador o reduce el diámetro para conservar el puente de material.');
  const points = cutterWorldPath(cutter);
  const max = body.boundingBox().max;
  const inside = (p: THREE.Vector3) => body.rayCast(p.toArray() as Vec3, [max[0] + 20, p.y + .123, p.z + .321]).length % 2 === 1;
  if (inside(points[0]) || inside(points[points.length - 1])) throw new Error('Los extremos del cortador deben sobresalir del objeto. Muévelo hacia afuera para abrir las dos entradas.');
  // Sample every segment, including the straight legs, to reject internal cavities.
  const samples: boolean[] = [];
  for (let i = 1; i < points.length; i++) {
    const count = Math.max(1, Math.ceil(points[i].distanceTo(points[i - 1]) / .25));
    for (let j = 0; j < count; j++) samples.push(inside(points[i - 1].clone().lerp(points[i], j / count)));
  }
  const first = samples.indexOf(true), last = samples.lastIndexOf(true);
  if (first === -1) throw new Error('El cortador no atraviesa el STL. Colócalo sobre el objeto y ajusta su profundidad.');
  if (samples.slice(first, last + 1).some(value => !value)) throw new Error('El recorrido cruza un hueco interior. Mueve el cortador a una zona maciza o reduce su profundidad.');
  const rotation = cutterQuaternion(cutter.pose), position = new THREE.Vector3(...cutter.pose.position);
  for (let i = 0; i < 9; i++) {
    const angle = Math.PI / 3 + Math.PI / 3 * i / 8, r = cutter.spacing / 2;
    const point = new THREE.Vector3(r * Math.cos(angle), cutter.depth - r + r * Math.sin(angle), 0).applyQuaternion(rotation).add(position);
    const sphere = wasm.Manifold.sphere(cutter.diameter / 2 + cutter.wall, 32);
    const envelope = sphere.translate(point.toArray() as Vec3);
    const outside = wasm.Manifold.difference(envelope, body);
    const missing = outside.volume(); outside.delete(); envelope.delete(); sphere.delete();
    if (missing > .001) throw new Error('Falta material alrededor de la curva del túnel. Mueve el cortador hacia una zona más gruesa o ajusta sus medidas.');
  }
  const primitives: Manifold[] = [];
  let tool: Manifold | undefined, result: Manifold | undefined;
  try {
    for (const point of points) {
      const sphere = wasm.Manifold.sphere(cutter.diameter / 2, 24);
      primitives.push(sphere.translate(point.toArray() as Vec3)); sphere.delete();
    }
    for (let i = 1; i < points.length; i++) {
      const direction = points[i].clone().sub(points[i - 1]);
      if (direction.length() < 1e-6) continue;
      const cylinder = wasm.Manifold.cylinder(direction.length(), cutter.diameter / 2, cutter.diameter / 2, 24);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
      primitives.push(cylinder.transform(new THREE.Matrix4().compose(points[i - 1], q, new THREE.Vector3(1, 1, 1)).toArray() as Mat4)); cylinder.delete();
    }
    tool = wasm.Manifold.union(primitives);
    const cut = wasm.Manifold.difference(body, tool); result = cut.simplify(.0001); cut.delete();
    if (result.isEmpty() || body.volume() - result.volume() < .1) throw new Error('El cortador no produjo un corte válido. Revisa su posición.');
    const before = body.decompose(), after = result.decompose();
    const detached = after.length > before.length;
    before.forEach(p => p.delete()); after.forEach(p => p.delete());
    if (detached) throw new Error('El corte separaría una parte del objeto. Ajusta la posición o las medidas del cortador.');
    const completed = result; result = undefined; return completed;
  } finally { tool?.delete(); result?.delete(); primitives.forEach(p => p.delete()); }
}
