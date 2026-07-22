import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { GeneratedModel, PreviewFile, ProductParams, ProductType } from '../types';
import {
  DEFAULT_COLOR,
  KEYCHAIN_HOLE_RADIUS_MM,
  KEYCHAIN_LOOP_OVERLAP_MM,
  KEYCHAIN_LOOP_RADIUS_MM,
  KEYCHAIN_NECK_LENGTH_MM,
  KEYCHAIN_NECK_WIDTH_MM,
  KEYCHAIN_THICKNESS_MM,
} from '../config/constants';

export type DownloadFormat = 'stl' | '3mf';

interface ExportPart {
  role: string;
  object?: string;
  filename: string;
  url: string;
}

interface ExportMaterial {
  role: string;
  name: string;
  color: string;
}

interface AssignedMesh {
  part: ExportPart;
  material: ExportMaterial;
  mesh: MeshData;
}

interface PreparedBambuMesh extends AssignedMesh {
  centeredVertices: THREE.Vector3[];
  center: THREE.Vector3;
  componentTranslation: THREE.Vector3;
  extruder: number;
}

interface MeshData {
  vertices: THREE.Vector3[];
  triangles: Array<[number, number, number]>;
  bounds: {
    min: THREE.Vector3;
    max: THREE.Vector3;
    minZ: number;
    maxZ: number;
    centerZ: number;
  };
}

interface ParsedMesh {
  part: ExportPart;
  role: string;
  roleConfidence: 'explicit' | 'fallback';
  mesh: MeshData;
}

type KeychainPlacement = 'bottom' | 'top';

export async function exportModel(
  model: GeneratedModel,
  productType: ProductType,
  params: ProductParams,
  format: DownloadFormat,
): Promise<{ blob: Blob; filename: string }> {
  if (format === '3mf') {
    return export3mf(model, productType, params);
  }

  return exportStlZip(model, productType, params);
}

export function getDefaultExportName(
  model: GeneratedModel | null,
  productType: ProductType,
  format: DownloadFormat,
): string {
  const baseName = getBaseName(model?.name ?? `${productType}-stp-model`);
  return format === '3mf' ? `${baseName}.3mf` : `${baseName}-stl.zip`;
}

async function exportStlZip(
  model: GeneratedModel,
  productType: ProductType,
  params: ProductParams,
): Promise<{ blob: Blob; filename: string }> {
  const parts = getExportParts(model, productType);
  if (parts.length === 0) {
    throw new Error('No STL files are loaded for download.');
  }

  const files = shouldAddKeychainLoop(productType, params)
    ? await buildClickerStlFilesWithKeychain(parts, productType, params)
    : await Promise.all(
        parts.map(async (part) => ({
          name: ensureExtension(part.filename, 'stl'),
          data: await fetchBytes(part.url),
        })),
      );

  return {
    blob: createZip(uniquifyZipNames(files)),
    filename: getDefaultExportName(model, productType, 'stl'),
  };
}

async function export3mf(
  model: GeneratedModel,
  productType: ProductType,
  params: ProductParams,
): Promise<{ blob: Blob; filename: string }> {
  const parts = getExportParts(model, productType);
  if (parts.length === 0) {
    throw new Error('No STL files are loaded for 3MF export.');
  }

  const loader = new STLLoader();
  const parsedMeshes = await Promise.all(
    parts.map(async (part) => {
      const bytes = await fetchBytes(part.url);
      const geometry = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const roleResult = getPartRole(productType, part);
      return {
        part,
        role: roleResult.role,
        roleConfidence: roleResult.confidence,
        mesh: geometryToMeshData(geometry),
      };
    }),
  );
  const meshes = addKeychainLoopToClickerMeshes(
    resolveMeshRoles(productType, parsedMeshes).map(({ part, role, mesh }) => ({
    part: { ...part, role },
    material: getExportMaterial(productType, params, role),
    mesh,
    })),
    productType,
    params,
  );

  const title = getBaseName(getDefaultExportName(model, productType, '3mf'));
  const bambuProject = buildBambu3mfProject(meshes, title);
  const metadata = {
    application: 'Horama3D',
    exporter: 'BambuStudio-compatible Horama3D exporter',
    sourceFormat: 'stl',
    productType,
    exportedAt: new Date().toISOString(),
    selectedColors: getSelectedColors(productType, params),
    parts: meshes.map(({ part, material }) => ({
      role: part.role,
      object: part.object,
      filename: part.filename,
      material,
    })),
  };

  return {
    blob: createZip([
      { name: '[Content_Types].xml', data: encodeText(buildBambuContentTypesXml()) },
      { name: '_rels/.rels', data: encodeText(buildRelsXml()) },
      { name: '3D/3dmodel.model', data: encodeText(bambuProject.mainModelXml) },
      { name: '3D/_rels/3dmodel.model.rels', data: encodeText(buildBambuModelRelsXml()) },
      { name: '3D/Objects/object_1.model', data: encodeText(bambuProject.objectsModelXml) },
      { name: 'Metadata/model_settings.config', data: encodeText(bambuProject.modelSettingsXml) },
      { name: 'Metadata/project_settings.config', data: encodeText(bambuProject.projectSettingsJson) },
      { name: 'Metadata/slice_info.config', data: encodeText(buildBambuSliceInfoXml()) },
      { name: 'Metadata/cut_information.xml', data: encodeText(buildBambuCutInformationXml()) },
      { name: 'Metadata/filament_sequence.json', data: encodeText(buildBambuFilamentSequenceJson()) },
      { name: '3D/Metadata/horama3d-metadata.json', data: encodeText(JSON.stringify(metadata, null, 2)) },
    ], 'application/vnd.ms-package.3dmanufacturing-3dmodel+xml'),
    filename: getDefaultExportName(model, productType, '3mf'),
  };
}

function getExportParts(model: GeneratedModel, productType: ProductType): ExportPart[] {
  if (model.previewFiles && model.previewFiles.length > 0) {
    return model.previewFiles
      .filter((file) => file.format === 'stl')
      .map((file, index) => ({
        role: file.role,
        object: file.object,
        filename: getPreviewFilename(file, index),
        url: file.url,
      }));
  }

  const url = model.modelUrl ?? model.downloadUrl;
  if (!url || model.format !== 'stl') return [];

  return [
    {
      role: 'body',
      filename: model.name ?? `${productType}-model.stl`,
      url,
    },
  ];
}

function getPreviewFilename(file: PreviewFile, index: number): string {
  return file.filename ?? file.object ?? `${file.role || 'part'}-${index + 1}.stl`;
}

async function fetchBytes(url: string): Promise<Uint8Array<ArrayBuffer>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not load ${url.split('/').pop() ?? 'model file'} for export.`);
  }
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

async function buildClickerStlFilesWithKeychain(
  parts: ExportPart[],
  productType: ProductType,
  params: ProductParams,
): Promise<Array<{ name: string; data: Uint8Array<ArrayBuffer> }>> {
  const loader = new STLLoader();
  const parsedMeshes = await Promise.all(
    parts.map(async (part) => {
      const bytes = await fetchBytes(part.url);
      const geometry = loader.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
      const roleResult = getPartRole(productType, part);
      return {
        part,
        role: roleResult.role,
        roleConfidence: roleResult.confidence,
        mesh: geometryToMeshData(geometry),
      };
    }),
  );
  const meshes = addKeychainLoopToClickerMeshes(
    resolveMeshRoles(productType, parsedMeshes).map(({ part, role, mesh }) => ({
      part: { ...part, role },
      material: getExportMaterial(productType, params, role),
      mesh,
    })),
    productType,
    params,
  );

  return meshes.map(({ part, mesh }) => ({
    name: ensureExtension(part.filename, 'stl'),
    data: serializeMeshDataToBinaryStl(mesh),
  }));
}

function geometryToMeshData(geometry: THREE.BufferGeometry): MeshData {
  const position = geometry.getAttribute('position');
  const vertices: THREE.Vector3[] = [];
  const triangles: Array<[number, number, number]> = [];
  const vertexMap = new Map<string, number>();
  const min = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < position.count; index += 3) {
    const triangle = [0, 1, 2].map((offset) => {
      const vertex = new THREE.Vector3(
        position.getX(index + offset),
        position.getY(index + offset),
        position.getZ(index + offset),
      );
      min.min(vertex);
      max.max(vertex);
      minZ = Math.min(minZ, vertex.z);
      maxZ = Math.max(maxZ, vertex.z);
      const key = `${roundVertex(vertex.x)},${roundVertex(vertex.y)},${roundVertex(vertex.z)}`;
      const existingIndex = vertexMap.get(key);
      if (existingIndex !== undefined) return existingIndex;

      const nextIndex = vertices.length;
      vertexMap.set(key, nextIndex);
      vertices.push(vertex);
      return nextIndex;
    }) as [number, number, number];

    triangles.push(triangle);
  }

  geometry.dispose();
  return {
    vertices,
    triangles,
    bounds: {
      min: vertices.length > 0 ? min : new THREE.Vector3(),
      max: vertices.length > 0 ? max : new THREE.Vector3(),
      minZ: Number.isFinite(minZ) ? minZ : 0,
      maxZ: Number.isFinite(maxZ) ? maxZ : 0,
      centerZ: Number.isFinite(minZ) && Number.isFinite(maxZ) ? (minZ + maxZ) / 2 : 0,
    },
  };
}

function addKeychainLoopToClickerMeshes(
  meshes: AssignedMesh[],
  productType: ProductType,
  params: ProductParams,
): AssignedMesh[] {
  if (!shouldAddKeychainLoop(productType, params)) return meshes;

  const placement = getKeychainPlacement(params.keychain_hole_placement);
  const targetIndex = getClickerKeychainMeshIndex(meshes, placement);
  if (targetIndex < 0) return meshes;

  return meshes.map((mesh, index) =>
    index === targetIndex
      ? {
          ...mesh,
          mesh: mergeMeshData(mesh.mesh, createKeychainLoopMesh(mesh.mesh, params, placement)),
        }
      : mesh,
  );
}

function getClickerKeychainMeshIndex(meshes: AssignedMesh[], placement: KeychainPlacement): number {
  if (placement === 'top') {
    return meshes.reduce(
      (bestIndex, mesh, index) => {
        if (bestIndex < 0) return index;
        return mesh.mesh.bounds.maxZ > meshes[bestIndex].mesh.bounds.maxZ ? index : bestIndex;
      },
      -1,
    );
  }

  return meshes.reduce(
    (bestIndex, mesh, index) => {
      if (mesh.part.role !== 'body') return bestIndex;
      if (bestIndex < 0) return index;
      return mesh.mesh.bounds.centerZ < meshes[bestIndex].mesh.bounds.centerZ ? index : bestIndex;
    },
    -1,
  );
}

function shouldAddKeychainLoop(productType: ProductType, params: ProductParams): boolean {
  return (
    productType === 'clicker' &&
    Boolean(params.keychain_hole) &&
    Number.isFinite(Number(params.keychain_hole_angle_deg))
  );
}

function createKeychainLoopMesh(
  baseMesh: MeshData,
  params: ProductParams,
  placement: KeychainPlacement,
): MeshData {
  const bounds = baseMesh.bounds;
  const angle = THREE.MathUtils.degToRad(Number(params.keychain_hole_angle_deg));
  const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0).normalize();
  const slice = getMeshSliceMetrics(baseMesh, direction, placement);
  const inset = Math.max(0, Number(params.keychain_hole_inset_mm) || 0);
  const loopCenter =
    placement === 'top'
      ? slice.center.clone()
      : slice.center
          .clone()
          .add(
            direction
              .clone()
              .multiplyScalar(
                slice.supportDistance +
                  KEYCHAIN_LOOP_RADIUS_MM -
                  KEYCHAIN_LOOP_OVERLAP_MM -
                  inset,
              ),
          );
  loopCenter.z = placement === 'top' ? bounds.maxZ - inset : bounds.minZ;

  const keychainGeometry = new THREE.ExtrudeGeometry(createKeychainShape(), {
    depth: KEYCHAIN_THICKNESS_MM,
    bevelEnabled: false,
    curveSegments: 64,
    steps: 1,
  });
  if (placement === 'top') {
    keychainGeometry.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2));
    loopCenter.z += KEYCHAIN_LOOP_RADIUS_MM;
  } else {
    keychainGeometry.applyMatrix4(
      new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, -1, 0), direction.clone().negate()),
      ),
    );
  }
  keychainGeometry.applyMatrix4(new THREE.Matrix4().makeTranslation(loopCenter.x, loopCenter.y, loopCenter.z));

  return geometryToMeshData(keychainGeometry);
}

function createKeychainShape(): THREE.Shape {
  const halfNeckWidth = KEYCHAIN_NECK_WIDTH_MM / 2;
  const neckJoinY = -Math.sqrt(Math.max(0, KEYCHAIN_LOOP_RADIUS_MM ** 2 - halfNeckWidth ** 2));
  const rightJoinAngle = Math.atan2(neckJoinY, halfNeckWidth);
  const leftJoinAngle = Math.atan2(neckJoinY, -halfNeckWidth);
  const shape = new THREE.Shape();
  shape.moveTo(halfNeckWidth, neckJoinY);
  shape.absarc(0, 0, KEYCHAIN_LOOP_RADIUS_MM, rightJoinAngle, leftJoinAngle, false);
  shape.lineTo(-halfNeckWidth, -KEYCHAIN_LOOP_RADIUS_MM - KEYCHAIN_NECK_LENGTH_MM);
  shape.lineTo(halfNeckWidth, -KEYCHAIN_LOOP_RADIUS_MM - KEYCHAIN_NECK_LENGTH_MM);
  shape.lineTo(halfNeckWidth, neckJoinY);

  const holePath = new THREE.Path();
  holePath.absarc(0, 0, KEYCHAIN_HOLE_RADIUS_MM, 0, Math.PI * 2, true);
  shape.holes.push(holePath);
  return shape;
}

function getMeshSliceMetrics(
  mesh: MeshData,
  direction: THREE.Vector3,
  placement: KeychainPlacement,
): { center: THREE.Vector3; supportDistance: number } {
  const size = mesh.bounds.max.clone().sub(mesh.bounds.min);
  const fallbackCenter = mesh.bounds.min.clone().add(mesh.bounds.max).multiplyScalar(0.5);
  const planeZ = placement === 'top' ? mesh.bounds.maxZ : mesh.bounds.minZ;
  const tolerance = Math.max(size.z * 0.04, 0.6);
  const vertices = mesh.vertices.filter((vertex) =>
    placement === 'top'
      ? vertex.z >= planeZ - tolerance
      : vertex.z <= planeZ + tolerance,
  );
  const sliceBounds = getVerticesBounds(vertices);
  const center = sliceBounds ? sliceBounds.min.clone().add(sliceBounds.max).multiplyScalar(0.5) : fallbackCenter;
  const supportDistance = vertices.reduce(
    (maxDistance, vertex) => Math.max(maxDistance, vertex.clone().sub(center).dot(direction)),
    Number.NEGATIVE_INFINITY,
  );

  return {
    center,
    supportDistance: Number.isFinite(supportDistance)
      ? supportDistance
      : getBoundsSupportDistance(mesh.bounds, center, direction),
  };
}

function getVerticesBounds(vertices: THREE.Vector3[]): MeshData['bounds'] | null {
  if (vertices.length === 0) return null;
  return getMeshBounds(vertices);
}

function getBoundsSupportDistance(
  bounds: MeshData['bounds'],
  center: THREE.Vector3,
  direction: THREE.Vector3,
): number {
  const size = bounds.max.clone().sub(bounds.min);
  const halfWidth = Math.max(size.x / 2, 0.001);
  const halfDepth = Math.max(size.y / 2, 0.001);
  return Math.min(
    Math.abs(direction.x) > 0.0001 ? halfWidth / Math.abs(direction.x) : Number.POSITIVE_INFINITY,
    Math.abs(direction.y) > 0.0001 ? halfDepth / Math.abs(direction.y) : Number.POSITIVE_INFINITY,
  );
}

function getKeychainPlacement(value: ProductParams[string] | undefined): KeychainPlacement {
  return value === 'top' ? 'top' : 'bottom';
}

function mergeMeshData(baseMesh: MeshData, addedMesh: MeshData): MeshData {
  const vertices = [
    ...baseMesh.vertices.map((vertex) => vertex.clone()),
    ...addedMesh.vertices.map((vertex) => vertex.clone()),
  ];
  const offset = baseMesh.vertices.length;
  const triangles: Array<[number, number, number]> = [
    ...baseMesh.triangles,
    ...addedMesh.triangles.map(
      (triangle) => [triangle[0] + offset, triangle[1] + offset, triangle[2] + offset] as [number, number, number],
    ),
  ];

  return {
    vertices,
    triangles,
    bounds: getMeshBounds(vertices),
  };
}

function getMeshBounds(vertices: THREE.Vector3[]): MeshData['bounds'] {
  const min = new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
  const max = new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY);
  vertices.forEach((vertex) => {
    min.min(vertex);
    max.max(vertex);
  });

  if (vertices.length === 0) {
    min.set(0, 0, 0);
    max.set(0, 0, 0);
  }

  return {
    min,
    max,
    minZ: min.z,
    maxZ: max.z,
    centerZ: (min.z + max.z) / 2,
  };
}

function serializeMeshDataToBinaryStl(mesh: MeshData): Uint8Array<ArrayBuffer> {
  const buffer = new ArrayBuffer(84 + mesh.triangles.length * 50);
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const encoder = new TextEncoder();
  bytes.set(encoder.encode('Horama3D STL export').slice(0, 80), 0);
  view.setUint32(80, mesh.triangles.length, true);

  mesh.triangles.forEach((triangle, triangleIndex) => {
    const offset = 84 + triangleIndex * 50;
    const a = mesh.vertices[triangle[0]];
    const b = mesh.vertices[triangle[1]];
    const c = mesh.vertices[triangle[2]];
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();
    const values = [normal.x, normal.y, normal.z, a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z];
    values.forEach((value, valueIndex) => {
      view.setFloat32(offset + valueIndex * 4, Number.isFinite(value) ? value : 0, true);
    });
    view.setUint16(offset + 48, 0, true);
  });

  return bytes;
}

function buildBambu3mfProject(meshes: AssignedMesh[], title: string) {
  const materials = getUniqueMaterials(meshes);
  const prepared = prepareBambuMeshes(meshes, materials);
  const assemblyMin = getAssemblyMin(meshes, getAssemblyCenter(meshes));
  const buildTranslation = new THREE.Vector3(165, 160, -assemblyMin.z);

  return {
    mainModelXml: buildBambuMainModelXml(prepared, buildTranslation, title),
    objectsModelXml: buildBambuObjectsModelXml(prepared),
    modelSettingsXml: buildBambuModelSettingsXml(prepared, buildTranslation, title, materials.length),
    projectSettingsJson: buildBambuProjectSettingsJson(materials),
  };
}

function prepareBambuMeshes(meshes: AssignedMesh[], materials: ExportMaterial[]): PreparedBambuMesh[] {
  const assemblyCenter = getAssemblyCenter(meshes);

  return meshes.map((mesh) => {
    const center = mesh.mesh.bounds.min.clone().add(mesh.mesh.bounds.max).multiplyScalar(0.5);
    return {
      ...mesh,
      centeredVertices: mesh.mesh.vertices.map((vertex) => vertex.clone().sub(center)),
      center,
      componentTranslation: center.clone().sub(assemblyCenter),
      extruder: getMaterialIndex(materials, mesh.material) + 1,
    };
  });
}

function getAssemblyCenter(meshes: AssignedMesh[]): THREE.Vector3 {
  const min = getBoundsMin(meshes);
  const max = getBoundsMax(meshes);
  return min.add(max).multiplyScalar(0.5);
}

function getAssemblyMin(meshes: AssignedMesh[], assemblyCenter: THREE.Vector3): THREE.Vector3 {
  return getBoundsMin(meshes).sub(assemblyCenter);
}

function getBoundsMin(meshes: AssignedMesh[]): THREE.Vector3 {
  return meshes.reduce(
    (min, { mesh }) => min.min(mesh.bounds.min),
    new THREE.Vector3(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY),
  );
}

function getBoundsMax(meshes: AssignedMesh[]): THREE.Vector3 {
  return meshes.reduce(
    (max, { mesh }) => max.max(mesh.bounds.max),
    new THREE.Vector3(Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY),
  );
}

function buildBambuMainModelXml(
  prepared: PreparedBambuMesh[],
  buildTranslation: THREE.Vector3,
  title: string,
): string {
  const today = new Date().toISOString().slice(0, 10);
  const componentsXml = prepared
    .map((part, index) => `      <component p:path="/3D/Objects/object_1.model" objectid="${index + 1}" p:UUID="${uuidWithPrefix(`000100${formatPaddedIndex(index)}`)}" transform="${matrixText(part.componentTranslation)}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" requiredextensions="p" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
  <metadata name="Application">BambuStudio-compatible Horama3D exporter</metadata>
  <metadata name="BambuStudio:3mfVersion">1</metadata>
  <metadata name="CreationDate">${today}</metadata>
  <metadata name="ModificationDate">${today}</metadata>
  <metadata name="Title">${escapeXml(title)}</metadata>
  <resources>
    <object id="4" p:UUID="${uuidWithPrefix('00000001')}" type="model">
      <components>
${componentsXml}
      </components>
    </object>
  </resources>
  <build p:UUID="${randomUuid()}">
    <item objectid="4" p:UUID="${randomUuid()}" transform="${matrixText(buildTranslation)}" printable="1" />
  </build>
</model>`;
}

function buildBambuObjectsModelXml(prepared: PreparedBambuMesh[]): string {
  const objectsXml = prepared
    .map((part, index) => {
      const verticesXml = part.centeredVertices
        .map((vertex) => `          <vertex x="${formatNumber(vertex.x)}" y="${formatNumber(vertex.y)}" z="${formatNumber(vertex.z)}" />`)
        .join('\n');
      const trianglesXml = part.mesh.triangles
        .map((triangle) => `          <triangle v1="${triangle[0]}" v2="${triangle[1]}" v3="${triangle[2]}" />`)
        .join('\n');

      return `    <object id="${index + 1}" p:UUID="${uuidWithPrefix(`000100${formatPaddedIndex(index)}`)}" type="model">
      <mesh>
        <vertices>
${verticesXml}
        </vertices>
        <triangles>
${trianglesXml}
        </triangles>
      </mesh>
    </object>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" requiredextensions="p" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
  <metadata name="BambuStudio:3mfVersion">1</metadata>
  <resources>
${objectsXml}
  </resources>
</model>`;
}

function buildBambuModelSettingsXml(
  prepared: PreparedBambuMesh[],
  buildTranslation: THREE.Vector3,
  title: string,
  materialCount: number,
): string {
  const totalFaces = prepared.reduce((count, part) => count + part.mesh.triangles.length, 0);
  const partXml = prepared
    .map((part, index) => {
      const name = part.part.object ?? part.part.role ?? part.part.filename;
      return `    <part id="${index + 1}" subtype="normal_part">
      <metadata key="name" value="${escapeXml(name)}"/>
      <metadata key="matrix" value="${matrixText(part.componentTranslation, true)}"/>
      <metadata key="source_file" value="${escapeXml(title)}.3mf"/>
      <metadata key="source_object_id" value="${index}"/>
      <metadata key="source_volume_id" value="0"/>
      <metadata key="source_offset_x" value="${formatNumber(part.center.x)}"/>
      <metadata key="source_offset_y" value="${formatNumber(part.center.y)}"/>
      <metadata key="source_offset_z" value="${formatNumber(part.center.z)}"/>
      <metadata key="extruder" value="${part.extruder}"/>
      <mesh_stat face_count="${part.mesh.triangles.length}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>`;
    })
    .join('\n');
  const assembleItemsXml = prepared
    .map((part, index) => `   <assemble_item object_id="4" volume_id="${index}" transform="${matrixText(part.componentTranslation)}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="4">
    <metadata key="name" value="${escapeXml(title)}"/>
    <metadata key="extruder" value="${prepared[0]?.extruder ?? 1}"/>
    <metadata face_count="${totalFaces}"/>
${partXml}
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value=""/>
    <metadata key="locked" value="false"/>
    <metadata key="filament_map_mode" value="Auto For Flush"/>
    <metadata key="filament_maps" value="${buildBambuFilamentMaps(materialCount)}"/>
    <metadata key="filament_volume_maps" value="${Array.from({ length: materialCount }, () => '0').join(' ')}"/>
    <model_instance>
      <metadata key="object_id" value="4"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="1"/>
    </model_instance>
  </plate>
  <assemble>
   <assemble_item object_id="4" instance_id="0" transform="${matrixText(buildTranslation)}" offset="0 0 0" />
${assembleItemsXml}
  </assemble>
</config>
`;
}

function buildBambuContentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="gcode" ContentType="text/x.gcode"/>
</Types>`;
}

function buildRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
}

function buildBambuModelRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/Objects/object_1.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>
</Relationships>`;
}

function getExportMaterial(
  productType: ProductType,
  params: ProductParams,
  role: string,
): ExportMaterial {
  const normalizedRole = role;
  const color =
    productType === 'clicker'
      ? normalizedRole === 'lid'
        ? getColorParam(params.top_color, DEFAULT_COLOR)
        : normalizedRole === 'body'
          ? getColorParam(params.bottom_color, DEFAULT_COLOR)
          : getBaseColor(productType)
      : productType === 'lamp'
        ? normalizedRole === 'lid'
          ? getColorParam(params.base_color, DEFAULT_COLOR)
          : normalizedRole === 'body'
            ? getColorParam(params.body_color, DEFAULT_COLOR)
            : getBaseColor(productType)
        : productType === 'urn'
        ? normalizedRole === 'text'
          ? getColorParam(params.text_color, '#232629')
          : normalizedRole === 'lid'
            ? getColorParam(params.lid_color, DEFAULT_COLOR)
            : normalizedRole === 'body'
              ? getColorParam(params.body_color, DEFAULT_COLOR)
              : getBaseColor(productType)
        : getBaseColor(productType);

  return {
    role: normalizedRole,
    name: getMaterialName(productType, normalizedRole),
    color: `${normalizeHexColor(color)}FF`,
  };
}

function getMaterialName(productType: ProductType, role: string): string {
  if (productType === 'clicker') {
    if (role === 'body') return 'Bottom Color';
    if (role === 'lid') return 'Top Color';
  }

  if (productType === 'lamp') {
    if (role === 'body') return 'Body Color';
    if (role === 'lid') return 'Base Color';
  }

  if (productType === 'urn') {
    if (role === 'body') return 'Body Color';
    if (role === 'lid') return 'Lid Color';
    if (role === 'text') return 'Text Color';
  }

  return role;
}

function getUniqueMaterials(meshes: AssignedMesh[]): ExportMaterial[] {
  const materials: ExportMaterial[] = [];
  meshes.forEach(({ material }) => {
    if (!materials.some((item) => item.role === material.role && item.color === material.color)) {
      materials.push(material);
    }
  });
  return materials.sort((a, b) => getRoleSortOrder(a.role) - getRoleSortOrder(b.role));
}

function getMaterialIndex(materials: ExportMaterial[], material: ExportMaterial): number {
  const index = materials.findIndex((item) => item.role === material.role && item.color === material.color);
  return Math.max(0, index);
}

function buildBambuFilamentMaps(materialCount: number): string {
  return Array.from({ length: Math.max(1, materialCount) }, (_, index) => String(index + 1)).join(' ');
}

function buildBambuProjectSettingsJson(materials: ExportMaterial[]): string {
  const materialColors = materials.map((material) => material.color.slice(0, 7));
  const filamentColours = materialColors.length > 0 ? materialColors : [DEFAULT_COLOR];
  const materialCount = filamentColours.length;
  const repeated = (value: string) => Array.from({ length: materialCount }, () => value);
  const filamentIndexes = Array.from({ length: materialCount }, (_, index) => String(index + 1));

  return JSON.stringify(
    {
      bottom_color_penetration_layers: '3',
      default_filament_colour: Array.from({ length: materialCount }, () => ''),
      default_filament_profile: ['Bambu PLA Basic @BBL A1'],
      enable_filament_dynamic_map: '0',
      enable_mixed_color_sublayer: '0',
      extruder_colour: filamentColours,
      filament_colour: filamentColours,
      filament_colour_type: repeated('0'),
      filament_ids: repeated('GFA00'),
      filament_is_support: repeated('0'),
      filament_map: repeated('1'),
      filament_map_mode: 'Auto For Flush',
      filament_multi_colour: filamentColours,
      filament_printable: repeated('3'),
      filament_self_index: filamentIndexes,
      filament_settings_id: repeated('Bambu PLA Basic @BBL A1'),
      filament_type: repeated('PLA'),
      filament_vendor: repeated('Bambu Lab'),
      flush_multiplier: ['1'],
      flush_volumes_matrix: buildFlushVolumesMatrix(materialCount),
      flush_volumes_vector: Array.from({ length: materialCount * 2 }, () => '140'),
      single_extruder_multi_material: materialCount > 1 ? '1' : '0',
      top_color_penetration_layers: '5',
    },
    null,
    4,
  );
}

function buildFlushVolumesMatrix(materialCount: number): string[] {
  const volumes: string[] = [];
  for (let from = 0; from < materialCount; from += 1) {
    for (let to = 0; to < materialCount; to += 1) {
      volumes.push(from === to ? '0' : '280');
    }
  }
  return volumes;
}

function buildBambuSliceInfoXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="Horama3D"/>
  </header>
</config>`;
}

function buildBambuCutInformationXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<objects>
 <object id="1">
  <cut_id id="0" check_sum="1" connectors_cnt="0"/>
 </object>
</objects>`;
}

function buildBambuFilamentSequenceJson(): string {
  return `${JSON.stringify({ plate_1: { nozzle_sequence: [], optimal_assignment: [], sequence: [] } })}\n`;
}

function matrixText(translation: THREE.Vector3, sixteen = false): string {
  const { x, y, z } = translation;
  const values = sixteen
    ? [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z, 0, 0, 0, 1]
    : [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z];
  return values.map(formatNumber).join(' ');
}

function uuidWithPrefix(prefix: string): string {
  return `${prefix}-${randomUuid().split('-').slice(1).join('-')}`;
}

function randomUuid(): string {
  return crypto.randomUUID();
}

function formatPaddedIndex(index: number): string {
  return index.toString().padStart(2, '0');
}

function getRoleSortOrder(role: string): number {
  if (role === 'body') return 0;
  if (role === 'lid') return 1;
  if (role === 'text') return 2;
  if (role === 'detail') return 3;
  if (role === 'support') return 4;
  if (role === 'texture') return 5;
  return 6;
}

function resolveMeshRoles(productType: ProductType, meshes: ParsedMesh[]): ParsedMesh[] {
  if (productType !== 'clicker' || meshes.length < 2) return meshes;

  const hasExplicitTop = meshes.some((mesh) => mesh.role === 'lid' && mesh.roleConfidence === 'explicit');
  const hasExplicitBottom = meshes.some((mesh) => mesh.role === 'body' && mesh.roleConfidence === 'explicit');
  if (hasExplicitTop && hasExplicitBottom) return meshes;

  const fallbackMeshes = meshes.filter((mesh) => mesh.roleConfidence === 'fallback');
  if (fallbackMeshes.length === 0) return meshes;

  if (hasExplicitBottom && !hasExplicitTop) {
    return meshes.map((mesh) => (mesh.roleConfidence === 'fallback' ? { ...mesh, role: 'lid' } : mesh));
  }

  if (hasExplicitTop && !hasExplicitBottom) {
    return meshes.map((mesh) => (mesh.roleConfidence === 'fallback' ? { ...mesh, role: 'body' } : mesh));
  }

  const orderedByHeight = [...fallbackMeshes].sort((a, b) => a.mesh.bounds.centerZ - b.mesh.bounds.centerZ);
  const splitIndex = Math.max(1, Math.floor(orderedByHeight.length / 2));
  const bottomSet = new Set(orderedByHeight.slice(0, splitIndex));

  return meshes.map((mesh) => {
    if (mesh.roleConfidence === 'explicit') return mesh;
    return {
      ...mesh,
      role: bottomSet.has(mesh) ? 'body' : 'lid',
    };
  });
}

function getPartRole(
  productType: ProductType,
  part: ExportPart,
): { role: string; confidence: 'explicit' | 'fallback' } {
  const roleName = part.role.toLowerCase();
  const objectName = [part.object, part.filename]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const name = [part.role, part.object, part.filename]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/(^|[^a-z0-9])(text|label|letter|letters|engraving|inscription)([^a-z0-9]|$)/.test(name)) {
    return { role: 'text', confidence: 'explicit' };
  }

  if (/(^|[^a-z0-9])(lid|top|cap|cover)([^a-z0-9]|$)/.test(name)) {
    return { role: 'lid', confidence: 'explicit' };
  }

  if (
    productType === 'clicker' &&
    (
      /(^|[^a-z0-9])(bottom|base|lower)([^a-z0-9]|$)/.test(roleName) ||
      /(^|[^a-z0-9])(bottom|base|body|lower)([^a-z0-9]|$)/.test(objectName)
    )
  ) {
    return { role: 'body', confidence: 'explicit' };
  }

  if (
    productType === 'urn' &&
    /(^|[^a-z0-9])(body|base|shell|vessel|urn|lower)([^a-z0-9]|$)/.test(name)
  ) {
    return { role: 'body', confidence: 'explicit' };
  }

  if (/(^|[^a-z0-9])(detail|support|texture)([^a-z0-9]|$)/.test(name)) {
    return { role: name.match(/detail|support|texture/)?.[0] ?? 'body', confidence: 'explicit' };
  }

  return { role: 'body', confidence: 'fallback' };
}

function getColorParam(value: ProductParams[string] | undefined, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function getSelectedColors(productType: ProductType, params: ProductParams): Record<string, string> | undefined {
  if (productType === 'clicker') {
    return {
      bottom_color: normalizeHexColor(getColorParam(params.bottom_color, DEFAULT_COLOR)),
      top_color: normalizeHexColor(getColorParam(params.top_color, DEFAULT_COLOR)),
    };
  }

  if (productType === 'lamp') {
    return {
      body_color: normalizeHexColor(getColorParam(params.body_color, DEFAULT_COLOR)),
      base_color: normalizeHexColor(getColorParam(params.base_color, DEFAULT_COLOR)),
    };
  }

  if (productType === 'urn') {
    return {
      body_color: normalizeHexColor(getColorParam(params.body_color, DEFAULT_COLOR)),
      lid_color: normalizeHexColor(getColorParam(params.lid_color, DEFAULT_COLOR)),
      text_color: normalizeHexColor(getColorParam(params.text_color, '#232629')),
    };
  }

  return undefined;
}

function getBaseColor(productType: ProductType): string {
  void productType;
  return DEFAULT_COLOR;
}

function normalizeHexColor(color: string): string {
  const value = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase();
  }
  return DEFAULT_COLOR;
}

function createZip(
  files: Array<{ name: string; data: Uint8Array<ArrayBuffer> }>,
  mimeType = 'application/zip',
): Blob {
  const encoder = new TextEncoder();
  const localRecords: Uint8Array<ArrayBuffer>[] = [];
  const centralRecords: Uint8Array<ArrayBuffer>[] = [];
  let offset = 0;

  files.forEach((file) => {
    const filename = encoder.encode(sanitizeZipPath(file.name));
    const crc = crc32(file.data);
    const localHeader = new Uint8Array(30 + filename.length);
    const localView = new DataView(localHeader.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, 0, true);
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, file.data.length, true);
    localView.setUint32(22, file.data.length, true);
    localView.setUint16(26, filename.length, true);
    localHeader.set(filename, 30);
    localRecords.push(localHeader, file.data);

    const centralHeader = new Uint8Array(46 + filename.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, 0, true);
    centralView.setUint16(14, 0, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, file.data.length, true);
    centralView.setUint32(24, file.data.length, true);
    centralView.setUint16(28, filename.length, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(filename, 46);
    centralRecords.push(centralHeader);

    offset += localHeader.length + file.data.length;
  });

  const centralSize = centralRecords.reduce((size, record) => size + record.length, 0);
  const endRecord = new Uint8Array(22);
  const endView = new DataView(endRecord.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, files.length, true);
  endView.setUint16(10, files.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);

  return new Blob([...localRecords, ...centralRecords, endRecord], { type: mimeType });
}

function crc32(bytes: Uint8Array<ArrayBuffer>): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const crcTable = new Uint32Array(
  Array.from({ length: 256 }, (_, index) => {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    return crc >>> 0;
  }),
);

function encodeText(value: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(value) as Uint8Array<ArrayBuffer>;
}

function ensureExtension(filename: string, extension: string): string {
  return filename.toLowerCase().endsWith(`.${extension}`) ? filename : `${filename}.${extension}`;
}

function getBaseName(filename: string): string {
  return filename.split('/').pop()?.replace(/\.[^.]+$/, '') || 'horama3d-model';
}

function sanitizeZipPath(path: string): string {
  return path
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

function uniquifyZipNames(files: Array<{ name: string; data: Uint8Array<ArrayBuffer> }>) {
  const used = new Set<string>();
  return files.map((file) => {
    const cleanName = sanitizeZipPath(file.name) || 'model.stl';
    if (!used.has(cleanName)) {
      used.add(cleanName);
      return { ...file, name: cleanName };
    }

    const extensionIndex = cleanName.lastIndexOf('.');
    const base = extensionIndex > 0 ? cleanName.slice(0, extensionIndex) : cleanName;
    const extension = extensionIndex > 0 ? cleanName.slice(extensionIndex) : '';
    let suffix = 2;
    let nextName = `${base}-${suffix}${extension}`;
    while (used.has(nextName)) {
      suffix += 1;
      nextName = `${base}-${suffix}${extension}`;
    }
    used.add(nextName);
    return { ...file, name: nextName };
  });
}

function roundVertex(value: number): string {
  return value.toFixed(5);
}

function formatNumber(value: number): string {
  return Number.isFinite(value) ? Number(value.toFixed(6)).toString() : '0';
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
