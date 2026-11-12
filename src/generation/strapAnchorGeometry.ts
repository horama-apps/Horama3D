import * as THREE from 'three';
import type { Manifold, ManifoldToplevel, Mat4, Vec3 } from 'manifold-3d';

export interface AnchorPort {
  point: [number, number, number];
  normal: [number, number, number];
}
export type AnchorPorts = [AnchorPort | null, AnchorPort | null];

export function parseAnchorPorts(value: unknown): AnchorPorts {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(parsed) || parsed.length !== 2) return [null, null];
    return parsed.map((port) => {
      if (!port || ![port.point, port.normal].every((v) => Array.isArray(v) && v.length === 3 && v.every((x: unknown) => typeof x === 'number' && Number.isFinite(x)))) return null;
      const normal = new THREE.Vector3(...port.normal as [number, number, number]);
      if (normal.length() < 0.5) return null;
      return { point: [...port.point], normal: normal.normalize().toArray() };
    }) as AnchorPorts;
  } catch { return [null, null]; }
}

export function anchorCurve(ports: [AnchorPort, AnchorPort], diameter: number, wall: number) {
  const [a, b] = ports;
  const start = new THREE.Vector3(...a.point);
  const end = new THREE.Vector3(...b.point);
  const handle = (diameter / 2 + wall) * 2.2;
  return new THREE.CubicBezierCurve3(start,
    start.clone().addScaledVector(new THREE.Vector3(...a.normal), -handle),
    end.clone().addScaledVector(new THREE.Vector3(...b.normal), -handle), end);
}

export function anchorPath(ports: [AnchorPort, AnchorPort], diameter: number, wall: number) {
  const curve = anchorCurve(ports, diameter, wall);
  return [new THREE.Vector3(...ports[0].point).addScaledVector(new THREE.Vector3(...ports[0].normal), diameter),
    ...curve.getPoints(24),
    new THREE.Vector3(...ports[1].point).addScaledVector(new THREE.Vector3(...ports[1].normal), diameter)];
}

export function cutIntegratedAnchor(wasm: ManifoldToplevel, body: Manifold,
  ports: [AnchorPort, AnchorPort], diameter: number, wall: number): Manifold {
  if (!Number.isFinite(diameter) || diameter < 1.5 || diameter > 8 || !Number.isFinite(wall) || wall < 1 || wall > 6) {
    throw new Error('Usa un diámetro entre 1.5 y 8 mm y una pared mínima entre 1 y 6 mm.');
  }
  const valid = parseAnchorPorts(ports);
  if (!valid[0] || !valid[1]) throw new Error('Marca las dos entradas sobre la superficie del STL.');
  ports = [valid[0], valid[1]];
  const radius = diameter / 2;
  const distance = new THREE.Vector3(...ports[0].point).distanceTo(new THREE.Vector3(...ports[1].point));
  if (distance < diameter * 2 + wall) throw new Error('Separa más las entradas para dejar un puente de material entre ellas.');
  if (distance > 60) throw new Error('Coloca las dos entradas en una misma zona, a menos de 60 mm entre sí.');
  for (const port of ports) {
    const point = new THREE.Vector3(...port.point);
    const normal = new THREE.Vector3(...port.normal);
    const hits = body.rayCast(point.clone().addScaledVector(normal, diameter).toArray() as Vec3,
      point.clone().addScaledVector(normal, -diameter).toArray() as Vec3);
    if (!hits.length || new THREE.Vector3(...hits[0].position).distanceTo(point) > 0.2
      || new THREE.Vector3(...hits[0].normal).normalize().dot(normal) < 0.5) {
      throw new Error('Una entrada ya no coincide con la superficie exterior. Vuelve a colocarla sobre el modelo original.');
    }
  }
  const curve = anchorCurve(ports, diameter, wall);
  // Check full material envelopes at nine interior stations, not just center points.
  for (let i = 0; i < 9; i++) {
    const point = curve.getPoint(0.2 + i * 0.075);
    const sphere = wasm.Manifold.sphere(radius + wall, 32);
    const envelope = sphere.translate(point.toArray() as Vec3);
    const outside = wasm.Manifold.difference(envelope, body);
    const missing = outside.volume();
    outside.delete(); envelope.delete(); sphere.delete();
    if (missing > 0.001) {
      throw new Error('No hay suficiente material alrededor del túnel. Mueve las entradas a una zona más gruesa o reduce el diámetro y la pared mínima.');
    }
  }
  const primitives: Manifold[] = [];
  let cutter: Manifold | undefined;
  let result: Manifold | undefined;
  try {
    const points = anchorPath(ports, diameter, wall);
    for (const point of points) {
      const ball = wasm.Manifold.sphere(radius, 24);
      primitives.push(ball.translate(point.toArray() as Vec3));
      ball.delete();
    }
    for (let i = 1; i < points.length; i++) {
      const start = points[i - 1];
      const direction = points[i].clone().sub(start);
      const length = direction.length();
      if (length < 1e-6) continue;
      const cylinder = wasm.Manifold.cylinder(length, radius, radius, 24);
      const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction.normalize());
      const matrix = new THREE.Matrix4().compose(start, rotation, new THREE.Vector3(1, 1, 1));
      primitives.push(cylinder.transform(matrix.toArray() as Mat4));
      cylinder.delete();
    }
    cutter = wasm.Manifold.union(primitives);
    result = wasm.Manifold.difference(body, cutter);
    // Collapse sub-micron Boolean slivers before binary STL rounds vertices to float32.
    const simplified = result.simplify(0.0001);
    result.delete();
    result = simplified;
    if (result.isEmpty() || body.volume() - result.volume() < 0.1) throw new Error('El túnel no produjo un corte válido. Revisa sus entradas.');
    const originalParts = body.decompose();
    const cutParts = result.decompose();
    const detached = cutParts.length > originalParts.length;
    originalParts.forEach((part) => part.delete());
    cutParts.forEach((part) => part.delete());
    if (detached) throw new Error('El corte separaría una parte del objeto. Reubica las entradas para conservar el puente de material.');
    const completed = result;
    result = undefined;
    return completed;
  } finally {
    result?.delete(); cutter?.delete(); primitives.forEach((part) => part.delete());
  }
}
