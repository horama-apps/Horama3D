import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { GeneratedModel, PreviewFile, ProductParams, ProductType } from '../types';

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

interface MeshData {
  vertices: THREE.Vector3[];
  triangles: Array<[number, number, number]>;
  bounds: {
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

export async function exportModel(
  model: GeneratedModel,
  productType: ProductType,
  params: ProductParams,
  format: DownloadFormat,
): Promise<{ blob: Blob; filename: string }> {
  if (format === '3mf') {
    return export3mf(model, productType, params);
  }

  return exportStlZip(model, productType);
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
): Promise<{ blob: Blob; filename: string }> {
  const parts = getExportParts(model, productType);
  if (parts.length === 0) {
    throw new Error('No STL files are loaded for download.');
  }

  const files = await Promise.all(
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
  const meshes = resolveMeshRoles(productType, parsedMeshes).map(({ part, role, mesh }) => ({
    part: { ...part, role },
    material: getExportMaterial(productType, params, role),
    mesh,
  }));

  const materials = getUniqueMaterials(meshes);
  const modelXml = build3mfModelXml(meshes, materials);
  const slicerModelConfigXml = buildSlic3rModelConfigXml(meshes, materials);
  const slicerPrintConfig = buildSlic3rPrintConfig(materials);
  const projectSettingsJson = buildBambuProjectSettingsJson(materials);
  const metadata = {
    application: 'Horama3D',
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
      { name: '[Content_Types].xml', data: encodeText(buildContentTypesXml()) },
      { name: '_rels/.rels', data: encodeText(buildRelsXml()) },
      { name: '3D/3dmodel.model', data: encodeText(modelXml) },
      { name: 'Metadata/Slic3r_PE_model.config', data: encodeText(slicerModelConfigXml) },
      { name: 'Metadata/Slic3r_PE.config', data: encodeText(slicerPrintConfig) },
      { name: 'Metadata/project_settings.config', data: encodeText(projectSettingsJson) },
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

function geometryToMeshData(geometry: THREE.BufferGeometry): MeshData {
  const position = geometry.getAttribute('position');
  const vertices: THREE.Vector3[] = [];
  const triangles: Array<[number, number, number]> = [];
  const vertexMap = new Map<string, number>();
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < position.count; index += 3) {
    const triangle = [0, 1, 2].map((offset) => {
      const vertex = new THREE.Vector3(
        position.getX(index + offset),
        position.getY(index + offset),
        position.getZ(index + offset),
      );
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
      minZ: Number.isFinite(minZ) ? minZ : 0,
      maxZ: Number.isFinite(maxZ) ? maxZ : 0,
      centerZ: Number.isFinite(minZ) && Number.isFinite(maxZ) ? (minZ + maxZ) / 2 : 0,
    },
  };
}

function build3mfModelXml(meshes: AssignedMesh[], materials: ExportMaterial[]): string {
  const resourceXml = meshes
    .map(({ part, material, mesh }, index) => {
      const objectId = index + 1;
      const materialIndex = getMaterialIndex(materials, material);
      return `
    <object id="${objectId}" type="model" name="${escapeXml(part.object ?? part.filename)}" pid="1" pindex="${materialIndex}">
      <mesh>
        <vertices>
${mesh.vertices.map((vertex) => `          <vertex x="${formatNumber(vertex.x)}" y="${formatNumber(vertex.y)}" z="${formatNumber(vertex.z)}" />`).join('\n')}
        </vertices>
        <triangles>
${mesh.triangles.map((triangle) => `          <triangle v1="${triangle[0]}" v2="${triangle[1]}" v3="${triangle[2]}" pid="1" p1="${materialIndex}" p2="${materialIndex}" p3="${materialIndex}" />`).join('\n')}
        </triangles>
      </mesh>
    </object>`;
    })
    .join('\n');
  const materialXml = `
    <basematerials id="1">
${materials.map((material) => `      <base name="${escapeXml(material.name)}" displaycolor="${material.color}" />`).join('\n')}
    </basematerials>`;

  const buildXml = meshes
    .map((_, index) => `    <item objectid="${index + 1}" />`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">
  <metadata name="Application">PrusaSlicer Horama3D</metadata>
  <metadata name="slic3rpe:Version3mf">1</metadata>
  <resources>${materialXml}${resourceXml}
  </resources>
  <build>
${buildXml}
  </build>
</model>`;
}

function buildContentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" />
  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml" />
  <Default Extension="json" ContentType="application/json" />
  <Override PartName="/Metadata/Slic3r_PE_model.config" ContentType="text/xml" />
  <Override PartName="/Metadata/Slic3r_PE.config" ContentType="text/plain" />
  <Override PartName="/Metadata/project_settings.config" ContentType="application/json" />
</Types>`;
}

function buildRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel" />
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
        ? getColorParam(params.top_color, '#ffffff')
        : normalizedRole === 'body'
          ? getColorParam(params.bottom_color, '#ffffff')
          : getBaseColor(productType)
      : productType === 'urn'
        ? normalizedRole === 'text'
          ? getColorParam(params.text_color, '#232629')
          : normalizedRole === 'lid'
            ? getColorParam(params.lid_color, '#ffffff')
            : normalizedRole === 'body'
              ? getColorParam(params.body_color, '#ffffff')
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

function buildSlic3rModelConfigXml(meshes: AssignedMesh[], materials: ExportMaterial[]): string {
  const objectXml = meshes
    .map(({ part, material, mesh }, index) => {
      const objectId = index + 1;
      const extruder = getMaterialIndex(materials, material) + 1;
      const name = part.object ?? part.filename;
      return ` <object id="${objectId}" instances_count="1">
  <metadata type="object" key="name" value="${escapeXml(name)}"/>
  <metadata type="object" key="extruder" value="${extruder}"/>
  <volume firstid="0" lastid="${Math.max(0, mesh.triangles.length - 1)}">
   <metadata type="volume" key="name" value="${escapeXml(name)}"/>
   <metadata type="volume" key="volume_type" value="ModelPart"/>
   <metadata type="volume" key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
   <metadata type="volume" key="source_file" value="${escapeXml(part.filename)}"/>
   <metadata type="volume" key="source_object_id" value="0"/>
   <metadata type="volume" key="source_volume_id" value="0"/>
   <metadata type="volume" key="source_offset_x" value="0"/>
   <metadata type="volume" key="source_offset_y" value="0"/>
   <metadata type="volume" key="source_offset_z" value="0"/>
   <metadata type="volume" key="extruder" value="${extruder}"/>
   <mesh edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
  </volume>
 </object>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<config>
${objectXml}
</config>`;
}

function buildSlic3rPrintConfig(materials: ExportMaterial[]): string {
  const colors = materials.map((material) => material.color.slice(0, 7)).join(';');
  const types = materials.map(() => 'PLA').join(';');
  return `# generated by Horama3D
filament_colour = ${colors}
filament_type = ${types}
extruders_count = ${materials.length}
single_extruder_multi_material = 0
`;
}

function buildBambuProjectSettingsJson(materials: ExportMaterial[]): string {
  return JSON.stringify(
    {
      filament_colour: materials.map((material) => material.color.slice(0, 7)),
      filament_type: materials.map(() => 'PLA'),
    },
    null,
    2,
  );
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
      bottom_color: normalizeHexColor(getColorParam(params.bottom_color, '#ffffff')),
      top_color: normalizeHexColor(getColorParam(params.top_color, '#ffffff')),
    };
  }

  if (productType === 'urn') {
    return {
      body_color: normalizeHexColor(getColorParam(params.body_color, '#ffffff')),
      lid_color: normalizeHexColor(getColorParam(params.lid_color, '#ffffff')),
      text_color: normalizeHexColor(getColorParam(params.text_color, '#232629')),
    };
  }

  return undefined;
}

function getBaseColor(productType: ProductType): string {
  if (productType === 'urn') return '#2f8f83';
  if (productType === 'textures') return '#6f6ad8';
  return '#b6682f';
}

function normalizeHexColor(color: string): string {
  const value = color.trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value.toUpperCase();
  if (/^#[0-9a-f]{3}$/i.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toUpperCase();
  }
  return '#FFFFFF';
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
