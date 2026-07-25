import * as THREE from 'three';
import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { GeneratedModel, ProductParams } from '../types';
import {
  braceletCharmAssetByValue,
  loadReusableShape,
} from '../shapes/reusableShapeLibrary';
import { loadFont } from './signGenerator';

const BOOLEAN_ASSET = 'bracelet-assets/bracelet%20boolean.stl';
const STOP_ASSET = 'bracelet-assets/stop.stl';
const MAX_TUNNEL_SCALE = 0.85;
const MINIMUM_TUNNEL_SKIN_MM = 0.05;

let manifoldModulePromise: Promise<ManifoldToplevel> | undefined;

export async function generateBraceletGemsModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const text = Array.from(String(params.text ?? '').trim().toUpperCase()).filter(
    (character) => character.trim().length > 0,
  );
  if (text.length === 0) throw new Error('Agrega un nombre antes de generar Bracelet Gems.');

  const [font, tunnelGeometry, stopGeometry, wasm] = await Promise.all([
    loadFont(String(params.font ?? 'helvetiker_bold')),
    loadStlAsset(BOOLEAN_ASSET),
    loadStlAsset(STOP_ASSET),
    getManifoldModule(),
  ]);
  const gemWidth = positiveNumber(params.gem_width_mm, 13);
  const gemHeight = positiveNumber(params.gem_height_mm, 25);
  const gemThickness = positiveNumber(params.gem_thickness_mm, 5);
  const spacing = positiveNumber(params.piece_spacing_mm, 3);
  const includeStops = Boolean(params.cord_stops);
  const orientation = params.thread_orientation === 'horizontal' ? 'horizontal' : 'vertical';
  const charms = parseCharmSelection(params.bracelet_charms);
  const charmShapes = await Promise.all(
    charms.map(async (kind) => ({
      kind,
      shapes: await loadReusableShape(
        braceletCharmAssetByValue[kind] ?? 'heart',
      ),
    })),
  );
  const group = new THREE.Group();
  const pieces: Array<{ object: THREE.Object3D; name: string }> = [];

  if (includeStops) {
    pieces.push(
      {
        object: createCordStop(stopGeometry, gemWidth, gemThickness, orientation),
        name: 'cord-stop-start',
      },
    );
  }
  text.forEach((character, index) => {
    pieces.push({
      object: createThreadablePiece(
        font.generateShapes(character, 100),
        tunnelGeometry,
        wasm,
        gemWidth,
        gemHeight,
        gemThickness,
        orientation,
      ),
      name: `gem-${index + 1}-${character}`,
    });
  });
  charmShapes.forEach(({ kind, shapes }, index) => {
    pieces.push({
      object: createThreadablePiece(
        shapes,
        tunnelGeometry,
        wasm,
        Math.max(gemWidth * 1.35, gemHeight * 0.72),
        gemHeight * 0.86,
        gemThickness,
        orientation,
      ),
      name: `charm-${index + 1}-${kind}`,
    });
  });
  if (includeStops) {
    pieces.push({
      object: createCordStop(stopGeometry, gemWidth, gemThickness, orientation),
      name: 'cord-stop-end',
    });
  }

  let cursor = 0;
  pieces.forEach(({ object, name }) => {
    const bounds = new THREE.Box3().setFromObject(object);
    const size = bounds.getSize(new THREE.Vector3());
    if (orientation === 'horizontal') {
      object.position.x += cursor - bounds.min.x;
    } else {
      object.position.y += cursor - bounds.min.y;
    }
    object.name = name;
    group.add(object);
    cursor += (orientation === 'horizontal' ? size.x : size.y) + spacing;
  });

  centerGroup(group);
  group.updateMatrixWorld(true);
  const exporter = new STLExporter();
  const view = exporter.parse(group, { binary: true }) as DataView;
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  const blob = new Blob([bytes], { type: 'model/stl' });
  const url = URL.createObjectURL(blob);
  const name = `${slugify(text.join(''))}-bracelet-gems.stl`;

  return {
    source: 'local',
    name,
    modelUrl: url,
    downloadUrl: url,
    blob,
    format: 'stl',
    metadata: {
      objects: pieces.map((piece) => piece.name),
    },
  };
}

async function getManifoldModule(): Promise<ManifoldToplevel> {
  if (!manifoldModulePromise) {
    manifoldModulePromise = Promise.all([
      import('manifold-3d'),
      import('manifold-3d/manifold.wasm?url'),
    ]).then(([{ default: Module }, { default: wasmUrl }]) =>
      Module({ locateFile: () => wasmUrl }).then((wasm) => {
        wasm.setup();
        return wasm;
      }),
    );
  }
  return manifoldModulePromise;
}

async function loadStlAsset(path: string): Promise<THREE.BufferGeometry> {
  const url = `${import.meta.env.BASE_URL}${path}`;
  try {
    const geometry = await new STLLoader().loadAsync(url);
    geometry.computeVertexNormals();
    return geometry;
  } catch {
    throw new Error(`No se pudo cargar el recurso de Bracelet Gems: ${path}.`);
  }
}

function createThreadablePiece(
  shapes: THREE.Shape[],
  tunnelSource: THREE.BufferGeometry,
  wasm: ManifoldToplevel,
  width: number,
  height: number,
  thickness: number,
  orientation: 'vertical' | 'horizontal',
): THREE.Mesh {
  if (shapes.length === 0) throw new Error('Una letra no está disponible en la fuente seleccionada.');

  const tunnel = tunnelSource.clone();
  tunnel.computeBoundingBox();
  const tunnelSize = (tunnel.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
  const crossSectionLimit = orientation === 'horizontal' ? height : width;
  const minimumSkin = Math.min(MINIMUM_TUNNEL_SKIN_MM, thickness * 0.01);
  const fitScale = Math.max(
    0.001,
    Math.min(
      MAX_TUNNEL_SCALE,
      crossSectionLimit / tunnelSize.x,
      (thickness - minimumSkin * 2) / tunnelSize.y,
    ),
  );
  tunnel.scale(fitScale, fitScale, 1);
  tunnel.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  if (orientation === 'horizontal') {
    tunnel.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  }
  tunnel.computeBoundingBox();
  const tunnelBounds = tunnel.boundingBox as THREE.Box3;
  const tunnelCenter = tunnelBounds.getCenter(new THREE.Vector3());
  tunnel.translate(-tunnelCenter.x, -tunnelCenter.y, thickness / 2 - tunnelCenter.z);
  tunnel.deleteAttribute('uv');

  let solid: Manifold | undefined;
  let cutter: Manifold | undefined;
  let result: Manifold | undefined;
  try {
    solid = shapesToManifold(wasm, shapes, width, height, thickness);
    cutter = geometryToManifold(wasm, tunnel);
    result = wasm.Manifold.difference(solid, cutter);
    if (result.numTri() === 0) {
      throw new Error('El conducto eliminó toda la pieza.');
    }
    return new THREE.Mesh(manifoldToGeometry(result));
  } catch {
    throw new Error(
      'No se pudo crear un adorno sólido con estas dimensiones. Prueba aumentando el ancho o reduciendo la altura Z.',
    );
  } finally {
    solid?.delete();
    cutter?.delete();
    result?.delete();
    tunnel.dispose();
  }
}

function shapesToManifold(
  wasm: ManifoldToplevel,
  shapes: THREE.Shape[],
  width: number,
  height: number,
  thickness: number,
): Manifold {
  const contoursByShape = shapes.map((shape) => [
    contourPoints(shape),
    ...shape.holes.map(contourPoints),
  ]);
  const allPoints = contoursByShape.flat(2);
  if (allPoints.length < 3) {
    throw new Error('La figura no contiene un contorno válido.');
  }
  const bounds = new THREE.Box2().setFromPoints(
    allPoints.map(([x, y]) => new THREE.Vector2(x, y)),
  );
  const size = bounds.getSize(new THREE.Vector2());
  const scaleX = width / Math.max(size.x, 0.001);
  const scaleY = height / Math.max(size.y, 0.001);
  const parts: Manifold[] = [];

  try {
    contoursByShape.forEach((shapeContours) => {
      const transformedContours = shapeContours.map((contour) =>
        contour.map(([x, y]) => [
          (x - bounds.min.x) * scaleX - width / 2,
          (y - bounds.min.y) * scaleY - height / 2,
        ] as [number, number]),
      );
      const crossSection = new wasm.CrossSection(transformedContours, 'EvenOdd');
      try {
        const part = crossSection.extrude(thickness);
        if (part.numTri() === 0) {
          part.delete();
          throw new Error('La extrusión no produjo un volumen.');
        }
        parts.push(part);
      } finally {
        crossSection.delete();
      }
    });
    if (parts.length === 1) return parts.pop() as Manifold;
    return wasm.Manifold.union(parts);
  } finally {
    parts.forEach((part) => part.delete());
  }
}

function contourPoints(path: THREE.Path): [number, number][] {
  const points = path.getPoints(16);
  const contour = points.reduce<[number, number][]>((clean, point) => {
    const previous = clean[clean.length - 1];
    if (!previous || Math.abs(previous[0] - point.x) > 1e-7 || Math.abs(previous[1] - point.y) > 1e-7) {
      clean.push([point.x, point.y]);
    }
    return clean;
  }, []);
  if (
    contour.length > 2
    && Math.abs(contour[0][0] - contour[contour.length - 1][0]) <= 1e-7
    && Math.abs(contour[0][1] - contour[contour.length - 1][1]) <= 1e-7
  ) {
    contour.pop();
  }
  return contour;
}

function geometryToManifold(
  wasm: ManifoldToplevel,
  source: THREE.BufferGeometry,
): Manifold {
  const cleanSource = source.clone();
  Object.keys(cleanSource.attributes).forEach((name) => {
    if (name !== 'position') cleanSource.deleteAttribute(name);
  });
  const geometry = mergeVertices(cleanSource, 1e-5);
  cleanSource.dispose();
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index || position.count < 4 || index.count < 12) {
    geometry.dispose();
    throw new Error('La figura no contiene un volumen válido.');
  }

  const vertices = new Float32Array(position.count * 3);
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    vertices[vertex * 3] = position.getX(vertex);
    vertices[vertex * 3 + 1] = position.getY(vertex);
    vertices[vertex * 3 + 2] = position.getZ(vertex);
  }
  const triangleIndices: number[] = [];
  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  for (let triangle = 0; triangle < index.count; triangle += 3) {
    const a = index.getX(triangle);
    const b = index.getX(triangle + 1);
    const c = index.getX(triangle + 2);
    if (a === b || b === c || c === a) continue;
    edgeA.set(
      position.getX(b) - position.getX(a),
      position.getY(b) - position.getY(a),
      position.getZ(b) - position.getZ(a),
    );
    edgeB.set(
      position.getX(c) - position.getX(a),
      position.getY(c) - position.getY(a),
      position.getZ(c) - position.getZ(a),
    );
    if (edgeA.cross(edgeB).lengthSq() <= 1e-12) continue;
    triangleIndices.push(a, b, c);
  }
  const triangles = new Uint32Array(triangleIndices);
  geometry.dispose();

  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: vertices,
    triVerts: triangles,
  });
  mesh.merge();
  return new wasm.Manifold(mesh);
}

function manifoldToGeometry(manifold: Manifold): THREE.BufferGeometry {
  const mesh = manifold.getMesh();
  const positions = new Float32Array(mesh.vertProperties.length / mesh.numProp * 3);
  for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
    positions[vertex * 3] = mesh.vertProperties[vertex * mesh.numProp];
    positions[vertex * 3 + 1] = mesh.vertProperties[vertex * mesh.numProp + 1];
    positions[vertex * 3 + 2] = mesh.vertProperties[vertex * mesh.numProp + 2];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.triVerts), 1));
  geometry.computeVertexNormals();
  return geometry;
}

function parseCharmSelection(
  value: ProductParams[string] | undefined,
): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).flatMap(([kind, amount]) => {
      if (!braceletCharmAssetByValue[kind]) return [];
      const quantity = Math.max(0, Math.min(9, Math.floor(Number(amount))));
      return Array.from({ length: quantity }, () => kind);
    });
  } catch {
    return [];
  }
}

function createCordStop(
  source: THREE.BufferGeometry,
  targetWidth: number,
  targetThickness: number,
  orientation: 'vertical' | 'horizontal',
): THREE.Mesh {
  const geometry = source.clone();
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(-Math.PI / 2));
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox as THREE.Box3;
  const size = bounds.getSize(new THREE.Vector3());
  const targetHeight = Math.max(4, targetWidth * 0.42);
  geometry.translate(-bounds.min.x, -bounds.min.y, -bounds.min.z);
  geometry.scale(
    targetWidth / Math.max(size.x, 0.001),
    targetHeight / Math.max(size.y, 0.001),
    targetThickness / Math.max(size.z, 0.001),
  );
  geometry.translate(-targetWidth / 2, -targetHeight / 2, 0);
  if (orientation === 'horizontal') {
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationZ(-Math.PI / 2));
  }
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry);
}

function centerGroup(group: THREE.Group) {
  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  group.position.set(-center.x, -center.y, -bounds.min.z);
}

function positiveNumber(value: ProductParams[string] | undefined, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function slugify(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase() || 'bracelet-gems';
}
