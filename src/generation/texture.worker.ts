/// <reference lib="webworker" />

import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';

type TextureName = 'none' | 'woven' | 'knit' | 'carbon' | 'wood';

interface TextureWorkerRequest {
  id: number;
  input: ArrayBuffer;
  params: {
    texture: TextureName;
    depthMm: number;
    spacingMm: number;
  };
}

interface TextureWorkerResponse {
  id: number;
  model?: ArrayBuffer;
  reliefCount?: number;
  warnings?: string[];
  error?: string;
}

interface ReliefHit {
  point: THREE.Vector3;
  normal: THREE.Vector3;
  group: 0 | 1 | 2;
  u: number;
  v: number;
}

const MAX_RELIEF_SOLIDS = 12_000;
const reliefMaterial = new THREE.MeshBasicMaterial();

self.onmessage = (event: MessageEvent<TextureWorkerRequest>) => {
  const request = event.data;
  try {
    const result = generateTexture(request.input, request.params);
    const response: TextureWorkerResponse = { id: request.id, ...result };
    self.postMessage(response, [result.model]);
  } catch (error) {
    const response: TextureWorkerResponse = {
      id: request.id,
      error: error instanceof Error ? error.message : 'La generación local de textura falló.',
    };
    self.postMessage(response);
  }
};

function generateTexture(
  input: ArrayBuffer,
  params: TextureWorkerRequest['params'],
): { model: ArrayBuffer; reliefCount: number; warnings: string[] } {
  if (params.texture === 'none') {
    return {
      model: input,
      reliefCount: 0,
      warnings: ['No se agregó relieve; el STL original se conservó sin cambios.'],
    };
  }

  const geometry = new STLLoader().parse(input);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds || bounds.isEmpty()) {
    geometry.dispose();
    throw new Error('El STL no contiene límites geométricos válidos.');
  }

  const sourceMaterial = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const sourceMesh = new THREE.Mesh(geometry, sourceMaterial);
  sourceMesh.updateMatrixWorld(true);
  const group = new THREE.Group();
  group.add(sourceMesh);
  const reliefHits = collectReliefHits(sourceMesh, bounds, params.texture, params.spacingMm);
  const warnings = ['La textura fue generada localmente en este navegador.'];
  let reliefCount = 0;

  for (const hit of reliefHits) {
    const reliefs = createReliefs(hit, params.texture, params.depthMm, params.spacingMm, bounds.min.z);
    for (const relief of reliefs) {
      if (reliefCount >= MAX_RELIEF_SOLIDS) {
        relief.geometry.dispose();
        continue;
      }
      group.add(relief);
      reliefCount += 1;
    }
  }
  if (reliefCount === MAX_RELIEF_SOLIDS) {
    warnings.push('El relieve alcanzó el límite de complejidad local; aumenta el espaciado para cubrir menos elementos.');
  }
  if (reliefCount === 0) {
    warnings.push('No se encontraron caras visibles adecuadas para aplicar el relieve.');
  }

  group.updateMatrixWorld(true);
  const exported = new STLExporter().parse(group, { binary: true }) as DataView;
  const model = exported.buffer.slice(
    exported.byteOffset,
    exported.byteOffset + exported.byteLength,
  ) as ArrayBuffer;
  group.traverse((object) => {
    if (object instanceof THREE.Mesh && object !== sourceMesh) object.geometry.dispose();
  });
  sourceMaterial.dispose();
  reliefMaterial.dispose();
  geometry.dispose();
  return { model, reliefCount, warnings };
}

function collectReliefHits(
  mesh: THREE.Mesh,
  bounds: THREE.Box3,
  texture: TextureName,
  spacing: number,
): ReliefHit[] {
  const [spacingU, spacingV] = textureSpacing(texture, spacing);
  const axes: Array<{
    group: 0 | 1 | 2;
    u: number[];
    v: number[];
    rays: (u: number, v: number) => Array<[THREE.Vector3, THREE.Vector3]>;
  }> = [
    {
      group: 0,
      u: gridPoints(bounds.min.y, bounds.max.y, spacingU),
      v: gridPoints(bounds.min.z, bounds.max.z, spacingV),
      rays: (y, z) => [
        [new THREE.Vector3(bounds.max.x + 5, y, z), new THREE.Vector3(-1, 0, 0)],
        [new THREE.Vector3(bounds.min.x - 5, y, z), new THREE.Vector3(1, 0, 0)],
      ],
    },
    {
      group: 1,
      u: gridPoints(bounds.min.x, bounds.max.x, spacingU),
      v: gridPoints(bounds.min.z, bounds.max.z, spacingV),
      rays: (x, z) => [
        [new THREE.Vector3(x, bounds.max.y + 5, z), new THREE.Vector3(0, -1, 0)],
        [new THREE.Vector3(x, bounds.min.y - 5, z), new THREE.Vector3(0, 1, 0)],
      ],
    },
    {
      group: 2,
      u: gridPoints(bounds.min.x, bounds.max.x, spacingU),
      v: gridPoints(bounds.min.y, bounds.max.y, spacingV),
      rays: (x, y) => [
        [new THREE.Vector3(x, y, bounds.max.z + 5), new THREE.Vector3(0, 0, -1)],
        [new THREE.Vector3(x, y, bounds.min.z - 5), new THREE.Vector3(0, 0, 1)],
      ],
    },
  ];
  const hits: ReliefHit[] = [];
  const seen = new Set<string>();
  const raycaster = new THREE.Raycaster();

  for (const axis of axes) {
    axis.v.forEach((vValue, v) => {
      axis.u.forEach((uValue, u) => {
        axis.rays(uValue, vValue).forEach(([origin, direction]) => {
          raycaster.set(origin, direction);
          const intersections = raycaster.intersectObject(mesh, false);
          for (const intersection of intersections) {
            if (!intersection.face) continue;
            const normal = intersection.face.normal.clone().normalize();
            if (normal.z < -0.5) continue;
            const dominant = dominantAxis(normal);
            if (dominant !== axis.group) continue;
            const key = `${axis.group}:${u}:${v}:${quantize(intersection.point.x)}:${quantize(intersection.point.y)}:${quantize(intersection.point.z)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            hits.push({
              point: intersection.point.clone(),
              normal,
              group: axis.group,
              u,
              v,
            });
          }
        });
      });
    });
  }
  return hits;
}

function createReliefs(
  hit: ReliefHit,
  texture: TextureName,
  depth: number,
  spacing: number,
  minimumZ: number,
): THREE.Mesh[] {
  const point = hit.point.clone();
  const halfLengthZ = getVerticalHalfLength(texture, spacing, hit.v);
  if (hit.group !== 2 && point.z - halfLengthZ < minimumZ) {
    point.z = minimumZ + halfLengthZ;
  }
  const tangent = hit.group === 0
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);
  tangent.addScaledVector(hit.normal, -tangent.dot(hit.normal));
  if (tangent.lengthSq() < 1e-10) {
    tangent.copy(Math.abs(hit.normal.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0));
    tangent.cross(hit.normal).normalize();
  } else {
    tangent.normalize();
  }
  const bitangent = new THREE.Vector3().crossVectors(hit.normal, tangent).normalize();
  const basis = new THREE.Matrix4().makeBasis(tangent, bitangent, hit.normal);
  basis.setPosition(point);

  if (texture === 'knit') {
    const cord = Math.max(0.18, spacing * 0.22);
    const length = spacing * 0.85;
    const angle = THREE.MathUtils.degToRad(30);
    const offset = (length / 2) * Math.sin(angle);
    return [
      reliefBox(cord, length, depth, -offset, 0, depth / 2 - 0.02, angle, basis),
      reliefBox(cord, length, depth, offset, 0, depth / 2 - 0.02, -angle, basis),
    ];
  }
  if (texture === 'woven') {
    const cord = Math.max(0.25, spacing * 0.32);
    return (hit.u + hit.v) % 2 === 0
      ? [reliefBox(spacing, cord, depth, 0, 0, depth / 2 - 0.02, 0, basis)]
      : [reliefBox(cord, spacing, depth * 0.75, 0, 0, depth / 2 - 0.02 + depth * 0.18, 0, basis)];
  }
  if (texture === 'carbon') {
    const cord = Math.max(0.18, spacing * 0.18);
    const length = spacing * 1.2;
    const angle = (hit.u + hit.v) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4;
    const height = angle > 0 ? depth : depth * 0.75;
    const z = depth / 2 - 0.02 + (angle > 0 ? 0 : depth * 0.12);
    return [reliefBox(cord, length, height, 0, 0, z, angle, basis)];
  }
  if (texture === 'wood') {
    const cord = Math.max(0.12, spacing * 0.14);
    const width = cord * (1 + (hit.v % 3) * 0.45);
    const yOffset = ((hit.v % 5) - 2) * spacing * 0.08;
    return [reliefBox(spacing, width, depth * 0.65, 0, yOffset, depth / 2 - 0.02, 0, basis)];
  }
  return [];
}

function reliefBox(
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
  rotation: number,
  basis: THREE.Matrix4,
) {
  const geometry = new THREE.BoxGeometry(width, height, depth);
  const local = new THREE.Matrix4().makeRotationZ(rotation);
  local.setPosition(x, y, z);
  geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(basis, local));
  return new THREE.Mesh(geometry, reliefMaterial);
}

function textureSpacing(texture: TextureName, spacing: number): [number, number] {
  if (texture === 'knit') return [spacing, spacing * 1.6];
  if (texture === 'carbon') {
    const dense = Math.max(0.8, spacing * 0.65);
    return [dense, dense];
  }
  if (texture === 'wood') return [spacing, spacing * 0.7];
  return [spacing, spacing];
}

function gridPoints(start: number, end: number, spacing: number): number[] {
  const length = end - start;
  if (length <= 0) return [(start + end) / 2];
  const count = Math.min(120, Math.max(1, Math.round(length / spacing)));
  if (count === 1) return [(start + end) / 2];
  return Array.from(
    { length: count },
    (_, index) => start + length / (2 * count) + index * (length / count),
  );
}

function getVerticalHalfLength(texture: TextureName, spacing: number, row: number) {
  if (texture === 'knit') {
    const length = spacing * 0.85;
    const cord = Math.max(0.18, spacing * 0.22);
    const angle = Math.PI / 6;
    const offset = (length / 2) * Math.sin(angle);
    return offset * Math.sin(angle) + (length / 2) * Math.cos(angle) + (cord / 2) * Math.sin(angle) + 0.02;
  }
  if (texture === 'woven') return spacing / 2 + 0.02;
  if (texture === 'carbon') {
    const cord = Math.max(0.18, spacing * 0.18);
    return (spacing * 1.2 / 2) * Math.SQRT1_2 + (cord / 2) * Math.SQRT1_2 + 0.02;
  }
  if (texture === 'wood') {
    const cord = Math.max(0.12, spacing * 0.14);
    const width = cord * (1 + (row % 3) * 0.45);
    return width / 2 + Math.abs(((row % 5) - 2) * spacing * 0.08) + 0.02;
  }
  return 0;
}

function dominantAxis(normal: THREE.Vector3): 0 | 1 | 2 {
  const absolute = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
  return absolute[0] >= absolute[1] && absolute[0] >= absolute[2]
    ? 0
    : absolute[1] >= absolute[2]
      ? 1
      : 2;
}

function quantize(value: number) {
  return Math.round(value * 1_000) / 1_000;
}

export {};
