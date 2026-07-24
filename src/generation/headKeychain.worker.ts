/// <reference lib="webworker" />

import Module, { type Manifold, type ManifoldToplevel } from 'manifold-3d';
import manifoldWasmUrl from 'manifold-3d/manifold.wasm?url';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

interface HeadKeychainWorkerRequest {
  id: number;
  input: ArrayBuffer;
  params: {
    scalePercent: number;
    cutHeightMm: number;
    attachmentMode: 'exterior_ring' | 'integrated_hole';
    holeDiameterMm: number;
    holeOffsetXmm: number;
    holeOffsetZmm: number;
  };
}

interface HeadKeychainWorkerResponse {
  id: number;
  head?: ArrayBuffer;
  cutHeightMm?: number;
  scalePercent?: number;
  warnings?: string[];
  error?: string;
}

let modulePromise: Promise<ManifoldToplevel> | undefined;

self.onmessage = async (event: MessageEvent<HeadKeychainWorkerRequest>) => {
  const request = event.data;
  try {
    const wasm = await getModule();
    const result = generateHeadKeychain(wasm, request.input, request.params);
    const response: HeadKeychainWorkerResponse = { id: request.id, ...result };
    self.postMessage(response, [result.head]);
  } catch (error) {
    const response: HeadKeychainWorkerResponse = {
      id: request.id,
      error: error instanceof Error
        ? error.message
        : 'La generación local del Head Keychain falló.',
    };
    self.postMessage(response);
  }
};

async function getModule(): Promise<ManifoldToplevel> {
  if (!modulePromise) {
    modulePromise = Module({ locateFile: () => manifoldWasmUrl }).then((wasm) => {
      wasm.setup();
      return wasm;
    });
  }
  return modulePromise;
}

function generateHeadKeychain(
  wasm: ManifoldToplevel,
  input: ArrayBuffer,
  params: HeadKeychainWorkerRequest['params'],
): Omit<HeadKeychainWorkerResponse, 'id' | 'error'> & { head: ArrayBuffer } {
  let model = stlToManifold(wasm, input);
  try {
    const scalePercent = params.scalePercent;
    if (!Number.isFinite(scalePercent) || scalePercent < 10 || scalePercent > 200) {
      throw new Error('La escala del STL debe estar entre 10 % y 200 %.');
    }
    model = replaceManifold(
      model,
      model.scale([scalePercent / 100, scalePercent / 100, scalePercent / 100]),
    );
    model = moveBoundsMinimumToOrigin(model);

    const bounds = model.boundingBox();
    const height = bounds.max[2] - bounds.min[2];
    const cutHeight = params.cutHeightMm;
    if (!Number.isFinite(cutHeight) || cutHeight < 0 || cutHeight >= height) {
      throw new Error(`La altura de corte debe estar entre 0 y ${height.toFixed(2)} mm.`);
    }

    let head: Manifold;
    if (cutHeight === 0) {
      head = model.translate([0, 0, 0]);
    } else {
      const [splitHead, discardedBody] = model.splitByPlane([0, 0, 1], cutHeight);
      discardedBody.delete();
      head = splitHead;
    }
    if (head.numTri() === 0) {
      head.delete();
      throw new Error('El corte no produjo una cabeza válida.');
    }

    head = moveBoundsMinimumToOrigin(head);
    if (params.attachmentMode === 'integrated_hole') {
      head = subtractIntegratedHole(wasm, head, params);
    }
    const headStl = manifoldToBinaryStl(head);
    head.delete();
    return {
      head: headStl,
      cutHeightMm: cutHeight,
      scalePercent,
      warnings: ['El Head Keychain fue procesado localmente en este navegador.'],
    };
  } finally {
    model.delete();
  }
}

function subtractIntegratedHole(
  wasm: ManifoldToplevel,
  head: Manifold,
  params: HeadKeychainWorkerRequest['params'],
): Manifold {
  const bounds = head.boundingBox();
  const width = bounds.max[0] - bounds.min[0];
  const depth = bounds.max[1] - bounds.min[1];
  const height = bounds.max[2] - bounds.min[2];
  const diameter = params.holeDiameterMm;
  if (!Number.isFinite(diameter) || diameter < 1.5 || diameter > 10) {
    throw new Error('El diámetro del orificio debe estar entre 1.5 y 10 mm.');
  }

  const radius = diameter / 2;
  const margin = Math.max(0.6, radius * 0.45);
  const centerX = Math.max(
    bounds.min[0] + radius + margin,
    Math.min(
      bounds.max[0] - radius - margin,
      bounds.min[0] + width / 2 + params.holeOffsetXmm,
    ),
  );
  const defaultCenterZ = bounds.max[2] - radius - margin;
  const centerZ = Math.max(
    bounds.min[2] + radius + margin,
    Math.min(
      bounds.max[2] - radius - margin,
      defaultCenterZ + params.holeOffsetZmm,
    ),
  );
  if (width <= diameter + margin * 2 || height <= diameter + margin * 2) {
    throw new Error('La cabeza es demasiado pequeña para el diámetro de orificio seleccionado.');
  }

  let cutter = wasm.Manifold.cylinder(depth + 2, radius, radius, 64);
  cutter = replaceManifold(cutter, cutter.rotate([-90, 0, 0]));
  cutter = replaceManifold(
    cutter,
    cutter.translate([centerX, bounds.min[1] - 1, centerZ]),
  );
  const result = wasm.Manifold.difference(head, cutter);
  cutter.delete();
  if (result.numTri() === 0) {
    result.delete();
    throw new Error('El orificio eliminó toda la geometría de la cabeza.');
  }
  head.delete();
  return result;
}

function stlToManifold(wasm: ManifoldToplevel, buffer: ArrayBuffer): Manifold {
  const parsed = new STLLoader().parse(buffer);
  parsed.deleteAttribute('normal');
  const geometry = mergeVertices(parsed, 1e-5);
  parsed.dispose();
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index || position.count < 4 || index.count < 12) {
    geometry.dispose();
    throw new Error('El STL no contiene una malla sólida válida.');
  }

  const vertices = new Float32Array(position.count * 3);
  for (let indexPosition = 0; indexPosition < position.count; indexPosition += 1) {
    vertices[indexPosition * 3] = position.getX(indexPosition);
    vertices[indexPosition * 3 + 1] = position.getY(indexPosition);
    vertices[indexPosition * 3 + 2] = position.getZ(indexPosition);
  }
  const triangles = new Uint32Array(index.count);
  for (let triangle = 0; triangle < index.count; triangle += 1) {
    triangles[triangle] = index.getX(triangle);
  }
  geometry.dispose();

  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: vertices,
    triVerts: triangles,
  });
  mesh.merge();
  try {
    return new wasm.Manifold(mesh);
  } catch {
    throw new Error('El STL debe ser hermético y representar un volumen válido.');
  }
}

function moveBoundsMinimumToOrigin(manifold: Manifold): Manifold {
  const bounds = manifold.boundingBox();
  return replaceManifold(
    manifold,
    manifold.translate([-bounds.min[0], -bounds.min[1], -bounds.min[2]]),
  );
}

function replaceManifold(previous: Manifold, next: Manifold): Manifold {
  previous.delete();
  return next;
}

function manifoldToBinaryStl(manifold: Manifold): ArrayBuffer {
  const mesh = manifold.getMesh();
  const triangleCount = mesh.triVerts.length / 3;
  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangleCount, true);
  let offset = 84;
  for (let triangle = 0; triangle < triangleCount; triangle += 1) {
    const points = [0, 1, 2].map((corner) => {
      const vertex = mesh.triVerts[triangle * 3 + corner];
      const index = vertex * mesh.numProp;
      return [
        mesh.vertProperties[index],
        mesh.vertProperties[index + 1],
        mesh.vertProperties[index + 2],
      ];
    });
    const normal = triangleNormal(points[0], points[1], points[2]);
    for (const value of normal) {
      view.setFloat32(offset, value, true);
      offset += 4;
    }
    for (const point of points) {
      for (const value of point) {
        view.setFloat32(offset, value, true);
        offset += 4;
      }
    }
    view.setUint16(offset, 0, true);
    offset += 2;
  }
  return buffer;
}

function triangleNormal(a: number[], b: number[], c: number[]): [number, number, number] {
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const normal: [number, number, number] = [
    ab[1] * ac[2] - ab[2] * ac[1],
    ab[2] * ac[0] - ab[0] * ac[2],
    ab[0] * ac[1] - ab[1] * ac[0],
  ];
  const length = Math.hypot(...normal) || 1;
  return [normal[0] / length, normal[1] / length, normal[2] / length];
}

export {};
