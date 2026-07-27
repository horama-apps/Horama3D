import * as THREE from 'three';
import QRCode from 'qrcode';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import type { GeneratedModel, PreviewFile, ProductParams } from '../types';
import { loadFont } from './signGenerator';

type WifiSecurity = 'WPA' | 'WEP' | 'nopass';
type WifiSignSize = 'compact' | 'standard' | 'large';

interface SignDimensions {
  width: number;
  height: number;
}

export async function generateWifiSignModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const size = normalizeSize(params.wifi_sign_size);
  const dimensions = getDimensions(size);
  const baseDepth = clampNumber(params.base_thickness_mm, 3.2, 1.6, 8);
  const reliefDepth = clampNumber(params.relief_height_mm, 0.8, 0.4, 2.4);
  const cornerRadius = clampNumber(
    params.corner_radius_mm,
    7,
    1,
    Math.min(dimensions.width, dimensions.height) * 0.18,
  );
  const title = stringParam(params.wifi_title, 'Casa Monte Alban').trim();
  const wifiLabel = stringParam(params.wifi_label, 'WiFi').trim();
  const ssid = stringParam(params.wifi_ssid, 'MI RED WIFI');
  const password = stringParam(params.wifi_password, 'CONTRASEÑA');
  const security = normalizeSecurity(params.wifi_security);
  const hidden = Boolean(params.wifi_hidden);
  const showCredentials = Boolean(params.show_credentials);
  const baseColor = stringParam(params.base_color, '#e7a0b4');
  const detailColor = stringParam(params.detail_color, '#171717');

  if (!ssid.trim()) throw new Error('Agrega el nombre de la red WiFi antes de generar.');
  if (security !== 'nopass' && !password) {
    throw new Error('Agrega la contraseña o selecciona una red abierta.');
  }

  const titleFont = await loadFont(stringParam(params.font, 'playfair_display_regular'));
  const scriptFont = await loadFont('satisfy_regular');
  const credentialFont = await loadFont('helvetiker_bold');
  const payload = buildWifiPayload(ssid, password, security, hidden);

  const base = buildBase(dimensions, cornerRadius, baseDepth);
  const details = new THREE.Group();
  const topTitle = buildText(
    titleFont,
    title,
    dimensions.width * 0.84,
    dimensions.height * 0.09,
    reliefDepth,
  );
  topTitle.position.set(0, dimensions.height * 0.36, baseDepth);
  details.add(topTitle);
  details.add(buildDivider(dimensions.width * 0.82, 1, reliefDepth, dimensions.height * 0.255, baseDepth));

  const qr = buildQr(payload, dimensions, baseDepth, reliefDepth);
  details.add(buildDivider(dimensions.width * 0.78, 1, reliefDepth, -dimensions.height * 0.245, baseDepth));

  const wifiText = buildText(
    scriptFont,
    wifiLabel || 'WiFi',
    dimensions.width * 0.42,
    dimensions.height * 0.105,
    reliefDepth,
  );
  wifiText.position.set(0, -dimensions.height * 0.34, baseDepth);
  details.add(wifiText);

  if (showCredentials) {
    details.add(buildDivider(
      dimensions.width * 0.72,
      0.9,
      reliefDepth,
      -dimensions.height * 0.405,
      baseDepth,
    ));
    const credentialHeight = dimensions.height * 0.027;
    const ssidText = buildText(
      credentialFont,
      ssid,
      dimensions.width * 0.76,
      credentialHeight,
      reliefDepth,
    );
    ssidText.position.set(0, -dimensions.height * 0.445, baseDepth);
    details.add(ssidText);
    if (security !== 'nopass') {
      const passwordText = buildText(
        credentialFont,
        password,
        dimensions.width * 0.72,
        credentialHeight,
        reliefDepth,
      );
      passwordText.position.set(0, -dimensions.height * 0.48, baseDepth);
      details.add(passwordText);
    }
  }

  const components: Array<{
    role: PreviewFile['role'];
    object: string;
    filename: string;
    mesh: THREE.Object3D;
    color: string;
  }> = [
    {
      role: 'body',
      object: 'placa',
      filename: 'letrero-wifi-placa.stl',
      mesh: base,
      color: baseColor,
    },
    {
      role: 'text',
      object: 'textos-y-lineas',
      filename: 'letrero-wifi-textos.stl',
      mesh: details,
      color: detailColor,
    },
    {
      role: 'detail',
      object: 'codigo-qr-wifi',
      filename: 'letrero-wifi-qr.stl',
      mesh: qr,
      color: detailColor,
    },
  ];

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
    name: `letrero-wifi-${slugify(ssid)}.stl`,
    modelUrl: combinedUrl,
    downloadUrl: combinedUrl,
    blob: combinedBlob,
    previewFiles,
    format: 'stl',
    metadata: {
      objects: components.map(({ object }) => object),
      warnings: [
        'El QR contiene las credenciales WiFi configuradas. Escanéalo desde la vista previa y realiza una impresión de prueba antes de producir la pieza final.',
        showCredentials
          ? 'Las credenciales también aparecen como texto visible en la placa.'
          : 'Las credenciales no se muestran como texto, pero permanecen codificadas dentro del QR.',
      ],
    },
  };
}

function buildBase(
  { width, height }: SignDimensions,
  radius: number,
  depth: number,
): THREE.Mesh {
  return new THREE.Mesh(extrudeRoundedRectangle(width, height, radius, depth));
}

function buildQr(
  payload: string,
  { width, height }: SignDimensions,
  baseDepth: number,
  reliefDepth: number,
): THREE.Group {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const quietZone = 4;
  const targetSize = Math.min(width * 0.64, height * 0.48);
  const moduleSize = targetSize / (qr.modules.size + quietZone * 2);
  const centerY = height * 0.005;
  const group = new THREE.Group();
  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      const module = new THREE.Mesh(
        new THREE.BoxGeometry(moduleSize * 1.015, moduleSize * 1.015, reliefDepth),
      );
      module.position.set(
        (column - (qr.modules.size - 1) / 2) * moduleSize,
        centerY + ((qr.modules.size - 1) / 2 - row) * moduleSize,
        baseDepth + reliefDepth / 2,
      );
      group.add(module);
    }
  }
  return group;
}

function buildDivider(
  width: number,
  height: number,
  depth: number,
  y: number,
  baseDepth: number,
): THREE.Mesh {
  const divider = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth));
  divider.position.set(0, y, baseDepth + depth / 2);
  return divider;
}

function buildText(
  font: Awaited<ReturnType<typeof loadFont>>,
  value: string,
  maxWidth: number,
  maxHeight: number,
  depth: number,
): THREE.Mesh {
  const shapes = font.generateShapes(value.slice(0, 48), 10);
  const bounds = getShapesBounds(shapes);
  const scale = Math.min(
    maxWidth / Math.max(bounds.width, 0.001),
    maxHeight / Math.max(bounds.height, 0.001),
  );
  const scaledShapes = scaleShapes(shapes, scale);
  const scaledBounds = getShapesBounds(scaledShapes);
  const geometry = new THREE.ExtrudeGeometry(scaledShapes, {
    depth,
    bevelEnabled: false,
    curveSegments: 10,
    steps: 1,
  });
  geometry.translate(
    -scaledBounds.minX - scaledBounds.width / 2,
    -scaledBounds.minY - scaledBounds.height / 2,
    0,
  );
  return new THREE.Mesh(geometry);
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

function buildWifiPayload(
  ssid: string,
  password: string,
  security: WifiSecurity,
  hidden: boolean,
): string {
  const escapedSsid = escapeWifiValue(ssid);
  const escapedPassword = escapeWifiValue(password);
  return security === 'nopass'
    ? `WIFI:T:nopass;S:${escapedSsid};H:${hidden};;`
    : `WIFI:T:${security};S:${escapedSsid};P:${escapedPassword};H:${hidden};;`;
}

function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:"'])/g, '\\$1');
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

function getDimensions(size: WifiSignSize): SignDimensions {
  if (size === 'compact') return { width: 120, height: 150 };
  if (size === 'large') return { width: 180, height: 220 };
  return { width: 150, height: 180 };
}

function normalizeSize(value: ProductParams[string] | undefined): WifiSignSize {
  return value === 'compact' || value === 'large' ? value : 'standard';
}

function normalizeSecurity(
  value: ProductParams[string] | undefined,
): WifiSecurity {
  return value === 'WEP' || value === 'nopass' ? value : 'WPA';
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'red';
}
