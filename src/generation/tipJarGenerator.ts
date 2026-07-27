import * as THREE from 'three';
import QRCode from 'qrcode';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { Brush, Evaluator, SUBTRACTION } from 'three-bvh-csg';
import type { GeneratedModel, PreviewFile, ProductParams } from '../types';
import { loadFont } from './signGenerator';

type TipJarVersion = 'basic' | 'qr' | 'qr_nfc' | 'premium';

interface TipJarDimensions {
  width: number;
  depth: number;
  height: number;
}

export async function generateTipJarModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const version = normalizeVersion(params.tip_jar_version);
  const dimensions = getDimensions(version);
  const wall = clampNumber(params.wall_thickness_mm, 2.4, 1.6, 5);
  const bottom = clampNumber(params.base_thickness_mm, 3.2, 2, 8);
  const lidThickness = clampNumber(params.lid_thickness_mm, 4, 2.4, 8);
  const clearance = clampNumber(params.fit_clearance_mm, 0.55, 0.2, 1.5);
  const bodyColor = stringParam(params.body_color, '#151515');
  const lidColor = stringParam(params.lid_color, '#d5b72f');
  const accentColor = stringParam(params.text_color, '#ffffff');
  const qrColor = stringParam(params.qr_color, '#171717');
  const businessName = stringParam(params.business_name, 'TU NEGOCIO').trim();
  const message = stringParam(params.tip_message, 'GRACIAS').trim();
  const qrUrl = normalizeQrUrl(params.qr_url);
  const font = await loadFont(stringParam(params.font, 'helvetiker_bold'));

  const body = buildBody(dimensions, wall, bottom);
  const lid = buildLid(dimensions, wall, lidThickness, clearance);
  const panel = buildFrontPanel(dimensions, version);
  const text = buildFrontText(font, businessName, message, dimensions, version);
  const qr = version === 'basic'
    ? undefined
    : buildQrDetail(qrUrl, dimensions, version);
  const nfc = version === 'qr_nfc' || version === 'premium'
    ? buildNfcBadge(dimensions, version)
    : undefined;

  const components: Array<{
    role: PreviewFile['role'];
    object: string;
    filename: string;
    mesh: THREE.Object3D;
    color: string;
  }> = [
    { role: 'body', object: 'bote', filename: 'bote-propinas-cuerpo.stl', mesh: body, color: bodyColor },
    { role: 'lid', object: 'tapa', filename: 'bote-propinas-tapa.stl', mesh: lid, color: lidColor },
    { role: 'detail', object: 'placa-frontal', filename: 'bote-propinas-placa.stl', mesh: panel, color: lidColor },
    { role: 'text', object: 'texto', filename: 'bote-propinas-texto.stl', mesh: text, color: accentColor },
  ];
  if (qr) {
    components.push({
      role: 'detail',
      object: 'codigo-qr',
      filename: 'bote-propinas-qr.stl',
      mesh: qr,
      color: qrColor,
    });
  }
  if (nfc) {
    components.push({
      role: 'detail',
      object: 'nfc',
      filename: 'bote-propinas-nfc.stl',
      mesh: nfc,
      color: accentColor,
    });
  }

  const previewFiles = components.map((component) => {
    const blob = exportObject(component.mesh);
    return {
      role: component.role,
      object: component.object,
      filename: component.filename,
      url: URL.createObjectURL(blob),
      format: 'stl' as const,
      color: component.color,
    };
  });

  const combined = new THREE.Group();
  components.forEach(({ mesh }) => combined.add(mesh.clone(true)));
  const combinedBlob = exportObject(combined);
  const combinedUrl = URL.createObjectURL(combinedBlob);

  return {
    source: 'local',
    name: `bote-propinas-${version}.stl`,
    modelUrl: combinedUrl,
    downloadUrl: combinedUrl,
    blob: combinedBlob,
    previewFiles,
    format: 'stl',
    metadata: {
      objects: components.map(({ object }) => object),
      warnings: [
        'El código QR se genera con el enlace indicado. Escanéalo en la vista previa o en una impresión de prueba antes de producir la pieza final.',
        'El símbolo NFC reserva la ubicación visual; el tag NFC físico se instala por separado después de imprimir.',
      ].filter((warning) =>
        warning.includes('NFC') ? version === 'qr_nfc' || version === 'premium' : version !== 'basic',
      ),
    },
  };
}

function buildBody(
  { width, depth, height }: TipJarDimensions,
  wall: number,
  bottom: number,
): THREE.Mesh {
  const radius = Math.min(width, depth) * 0.09;
  const outerGeometry = extrudeRoundedRectangle(width, depth, radius, height);
  const innerGeometry = extrudeRoundedRectangle(
    width - wall * 2,
    depth - wall * 2,
    Math.max(1, radius - wall),
    height - bottom + 1,
  );
  innerGeometry.translate(0, 0, bottom);
  return subtractGeometry(outerGeometry, innerGeometry);
}

function buildLid(
  { width, depth, height }: TipJarDimensions,
  wall: number,
  lidThickness: number,
  clearance: number,
): THREE.Group {
  const radius = Math.min(width, depth) * 0.09;
  const overhang = 2.2;
  const plateGeometry = extrudeRoundedRectangle(
    width + overhang * 2,
    depth + overhang * 2,
    radius + overhang,
    lidThickness,
  );
  const slotWidth = width * 0.52;
  const slotDepth = Math.max(9, depth * 0.075);
  const slot = new THREE.BoxGeometry(slotWidth, slotDepth, lidThickness + 2);
  slot.translate(0, 0, lidThickness / 2);
  const plate = subtractGeometry(plateGeometry, slot);
  plate.position.z = height;

  const plugOuter = extrudeRoundedRectangle(
    width - clearance * 2,
    depth - clearance * 2,
    Math.max(1, radius - clearance),
    8,
  );
  const plugInner = extrudeRoundedRectangle(
    width - wall * 2 - clearance * 2,
    depth - wall * 2 - clearance * 2,
    Math.max(1, radius - wall - clearance),
    9,
  );
  plugInner.translate(0, 0, -0.5);
  const plug = subtractGeometry(plugOuter, plugInner);
  plug.position.z = height - 8;

  const group = new THREE.Group();
  group.add(plate, plug);
  return group;
}

function buildFrontPanel(
  { width, depth, height }: TipJarDimensions,
  version: TipJarVersion,
): THREE.Mesh {
  const panelWidth = width * 0.84;
  const panelHeight = version === 'basic' ? height * 0.42 : height * 0.66;
  const panelDepth = 2.4;
  const geometry = extrudeRoundedRectangle(panelWidth, panelHeight, 8, panelDepth);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, -depth / 2, height * 0.48);
  return new THREE.Mesh(geometry);
}

function buildFrontText(
  font: Awaited<ReturnType<typeof loadFont>>,
  businessName: string,
  message: string,
  { width, depth, height }: TipJarDimensions,
  version: TipJarVersion,
): THREE.Group {
  const group = new THREE.Group();
  const maxTextWidth = width * 0.7;
  const businessZ = version === 'basic' ? height * 0.55 : height * 0.72;
  const messageZ = version === 'basic' ? height * 0.39 : height * 0.58;
  if (businessName) {
    group.add(buildVerticalText(font, businessName, maxTextWidth, height * 0.095, depth, businessZ));
  }
  if (message) {
    group.add(buildVerticalText(font, message, maxTextWidth * 0.78, height * 0.065, depth, messageZ));
  }
  return group;
}

function buildVerticalText(
  font: Awaited<ReturnType<typeof loadFont>>,
  value: string,
  maxWidth: number,
  maxHeight: number,
  depth: number,
  centerZ: number,
): THREE.Mesh {
  const shapes = font.generateShapes(value.slice(0, 28), 10);
  const sourceBounds = getShapesBounds(shapes);
  const scale = Math.min(
    maxWidth / Math.max(sourceBounds.width, 0.001),
    maxHeight / Math.max(sourceBounds.height, 0.001),
  );
  const scaledShapes = scaleShapes(shapes, scale);
  const bounds = getShapesBounds(scaledShapes);
  const geometry = new THREE.ExtrudeGeometry(scaledShapes, {
    depth: 1.4,
    bevelEnabled: false,
    curveSegments: 10,
    steps: 1,
  });
  geometry.translate(-bounds.minX - bounds.width / 2, -bounds.minY - bounds.height / 2, 0);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, -depth / 2 - 2.4, centerZ);
  return new THREE.Mesh(geometry);
}

function buildQrDetail(
  url: string,
  { width, depth, height }: TipJarDimensions,
  version: TipJarVersion,
): THREE.Group {
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const quietZone = 4;
  const targetSize = version === 'premium'
    ? Math.min(width * 0.52, height * 0.34)
    : Math.min(width * 0.48, height * 0.31);
  const moduleSize = targetSize / (qr.modules.size + quietZone * 2);
  const group = new THREE.Group();
  const centerZ = height * 0.3;
  const y = -depth / 2 - 3;

  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      const module = new THREE.Mesh(
        new THREE.BoxGeometry(moduleSize * 1.02, 1.2, moduleSize * 1.02),
      );
      module.position.set(
        (column - (qr.modules.size - 1) / 2) * moduleSize,
        y,
        centerZ + ((qr.modules.size - 1) / 2 - row) * moduleSize,
      );
      group.add(module);
    }
  }

  return group;
}

function buildNfcBadge(
  { width, depth, height }: TipJarDimensions,
  version: TipJarVersion,
): THREE.Group {
  const group = new THREE.Group();
  const radius = version === 'premium' ? 9 : 7.5;
  const x = width * 0.31;
  const y = -depth / 2 - 3.2;
  const z = height * 0.55;
  [0.45, 0.72, 1].forEach((scale) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius * scale, 0.9, 10, 34),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, y, z);
    group.add(ring);
  });
  const center = new THREE.Mesh(new THREE.SphereGeometry(1.8, 16, 12));
  center.position.set(x, y - 0.2, z);
  group.add(center);
  return group;
}

function extrudeRoundedRectangle(
  width: number,
  height: number,
  radius: number,
  depth: number,
): THREE.ExtrudeGeometry {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const safeRadius = Math.min(radius, halfWidth, halfHeight);
  const shape = new THREE.Shape();
  shape.moveTo(-halfWidth + safeRadius, -halfHeight);
  shape.lineTo(halfWidth - safeRadius, -halfHeight);
  shape.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + safeRadius);
  shape.lineTo(halfWidth, halfHeight - safeRadius);
  shape.quadraticCurveTo(halfWidth, halfHeight, halfWidth - safeRadius, halfHeight);
  shape.lineTo(-halfWidth + safeRadius, halfHeight);
  shape.quadraticCurveTo(-halfWidth, halfHeight, -halfWidth, halfHeight - safeRadius);
  shape.lineTo(-halfWidth, -halfHeight + safeRadius);
  shape.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + safeRadius, -halfHeight);
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 18,
    steps: 1,
  });
}

function subtractGeometry(
  solidGeometry: THREE.BufferGeometry,
  cutterGeometry: THREE.BufferGeometry,
): THREE.Mesh {
  const solid = new Brush(solidGeometry);
  const cutter = new Brush(cutterGeometry);
  solid.updateMatrixWorld(true);
  cutter.updateMatrixWorld(true);
  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  const result = evaluator.evaluate(solid, cutter, SUBTRACTION);
  result.geometry.deleteAttribute('uv');
  result.geometry.computeVertexNormals();
  return result;
}

function exportObject(object: THREE.Object3D): Blob {
  object.updateMatrixWorld(true);
  const view = new STLExporter().parse(object, { binary: true }) as DataView;
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return new Blob([bytes], { type: 'model/stl' });
}

function scaleShapes(shapes: THREE.Shape[], scale: number): THREE.Shape[] {
  return shapes.map((shape) => {
    const points = shape.extractPoints(24);
    const scaled = new THREE.Shape(
      points.shape.map((point) => point.clone().multiplyScalar(scale)),
    );
    scaled.holes = points.holes.map(
      (hole) =>
        new THREE.Path(hole.map((point) => point.clone().multiplyScalar(scale))),
    );
    return scaled;
  });
}

function getShapesBounds(shapes: THREE.Shape[]) {
  const geometry = new THREE.ShapeGeometry(shapes, 12);
  geometry.computeBoundingBox();
  const box = geometry.boundingBox ?? new THREE.Box3();
  geometry.dispose();
  return {
    minX: box.min.x,
    minY: box.min.y,
    width: box.max.x - box.min.x,
    height: box.max.y - box.min.y,
  };
}

function getDimensions(version: TipJarVersion): TipJarDimensions {
  return version === 'premium'
    ? { width: 180, depth: 180, height: 230 }
    : { width: 150, depth: 150, height: 200 };
}

function normalizeVersion(value: ProductParams[string] | undefined): TipJarVersion {
  return value === 'qr' || value === 'qr_nfc' || value === 'premium'
    ? value
    : 'basic';
}

function normalizeQrUrl(value: ProductParams[string] | undefined): string {
  const raw = stringParam(value, 'https://horama3d.com').trim();
  if (!raw) return 'https://horama3d.com';
  return /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
}

function stringParam(
  value: ProductParams[string] | undefined,
  fallback: string,
): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function clampNumber(
  value: ProductParams[string] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const numeric = Number(value);
  return THREE.MathUtils.clamp(Number.isFinite(numeric) ? numeric : fallback, min, max);
}
