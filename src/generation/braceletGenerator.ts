import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { GeneratedModel, ProductParams } from '../types';
import { loadFont } from './signGenerator';

const BOOLEAN_ASSET = 'bracelet-assets/bracelet%20boolean.stl';
const STOP_ASSET = 'bracelet-assets/stop.stl';

export async function generateBraceletGemsModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const text = Array.from(String(params.text ?? '').trim().toUpperCase()).filter(
    (character) => character.trim().length > 0,
  );
  if (text.length === 0) throw new Error('Agrega un nombre antes de generar Bracelet Gems.');

  const [font, tunnelGeometry, stopGeometry] = await Promise.all([
    loadFont(String(params.font ?? 'helvetiker_bold')),
    loadStlAsset(BOOLEAN_ASSET),
    loadStlAsset(STOP_ASSET),
  ]);
  const gemWidth = positiveNumber(params.gem_width_mm, 13);
  const gemHeight = positiveNumber(params.gem_height_mm, 25);
  const gemThickness = positiveNumber(params.gem_thickness_mm, 5);
  const spacing = positiveNumber(params.piece_spacing_mm, 3);
  const includeStops = Boolean(params.cord_stops);
  const orientation = params.thread_orientation === 'horizontal' ? 'horizontal' : 'vertical';
  const group = new THREE.Group();
  const pieces: THREE.Object3D[] = [];

  if (includeStops) pieces.push(createCordStop(stopGeometry, gemWidth, gemThickness, orientation));
  text.forEach((character) => {
    pieces.push(
      createThreadableLetter(
        font.generateShapes(character, 100),
        tunnelGeometry,
        gemWidth,
        gemHeight,
        gemThickness,
        orientation,
      ),
    );
  });
  if (includeStops) pieces.push(createCordStop(stopGeometry, gemWidth, gemThickness, orientation));

  let cursor = 0;
  pieces.forEach((piece, index) => {
    const bounds = new THREE.Box3().setFromObject(piece);
    const size = bounds.getSize(new THREE.Vector3());
    if (orientation === 'horizontal') {
      piece.position.x += cursor - bounds.min.x;
    } else {
      piece.position.y += cursor - bounds.min.y;
    }
    piece.name = index === 0 && includeStops || index === pieces.length - 1 && includeStops
      ? 'cord-stop'
      : `gem-${text[index - (includeStops ? 1 : 0)] ?? index}`;
    group.add(piece);
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
      objects: [
        ...(includeStops ? ['cord-stop-start'] : []),
        ...text.map((character, index) => `gem-${index + 1}-${character}`),
        ...(includeStops ? ['cord-stop-end'] : []),
      ],
    },
  };
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

function createThreadableLetter(
  shapes: THREE.Shape[],
  tunnelSource: THREE.BufferGeometry,
  width: number,
  height: number,
  thickness: number,
  orientation: 'vertical' | 'horizontal',
): THREE.Mesh {
  if (shapes.length === 0) throw new Error('Una letra no está disponible en la fuente seleccionada.');
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 10,
    steps: 1,
  });
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox as THREE.Box3;
  const size = bounds.getSize(new THREE.Vector3());
  geometry.translate(-bounds.min.x, -bounds.min.y, 0);
  geometry.scale(width / Math.max(size.x, 0.001), height / Math.max(size.y, 0.001), 1);
  geometry.translate(-width / 2, -height / 2, 0);
  geometry.deleteAttribute('uv');

  const tunnel = tunnelSource.clone();
  tunnel.computeBoundingBox();
  const tunnelSize = (tunnel.boundingBox as THREE.Box3).getSize(new THREE.Vector3());
  const crossSectionLimit = orientation === 'horizontal' ? height : width;
  const fitScale = Math.min(1, crossSectionLimit / tunnelSize.x, thickness / tunnelSize.y);
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

  const solid = new Brush(geometry);
  const cutter = new Brush(tunnel);
  solid.updateMatrixWorld(true);
  cutter.updateMatrixWorld(true);
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  evaluator.attributes = ['position', 'normal'];
  const result = evaluator.evaluate(solid, cutter, SUBTRACTION);
  result.geometry.deleteAttribute('uv');
  result.geometry.computeVertexNormals();
  return result;
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
