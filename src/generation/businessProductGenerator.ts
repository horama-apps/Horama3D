import * as THREE from 'three';
import QRCode from 'qrcode';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import type { GeneratedModel, PreviewFile, ProductParams } from '../types';
import { loadFont } from './signGenerator';
import { generateTipJarModel } from './tipJarGenerator';

type Component = {
  role: PreviewFile['role'];
  object: string;
  filename: string;
  mesh: THREE.Object3D;
  color: string;
  assembly: string;
};

type PlateSize = {
  width: number;
  height: number;
};

export async function generateQrSignModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const size = normalizePlateSize(params.qr_sign_size);
  const mount = stringParam(params.mount_style, 'tabletop');
  const title = stringParam(params.business_name, 'HORAMA CAFÉ').trim();
  const label = stringParam(params.qr_label, 'ESCANEA AQUÍ').trim();
  const url = normalizeUrl(params.qr_url);
  const plateDepth = clampNumber(params.base_thickness_mm, 3.2, 1.6, 8);
  const relief = clampNumber(params.relief_height_mm, 0.8, 0.4, 2.4);
  const radius = clampNumber(params.corner_radius_mm, 8, 1, 24);
  const font = await loadFont(stringParam(params.font, 'montserrat_regular'));
  const plateColor = stringParam(params.base_color, '#efe6d5');
  const detailColor = stringParam(params.detail_color, '#171717');
  const supportColor = stringParam(params.support_color, '#c8755b');

  const plate = new THREE.Mesh(
    extrudeRoundedRectangle(size.width, size.height, radius, plateDepth),
  );
  const details = new THREE.Group();
  const titleMesh = buildText(font, title, size.width * 0.78, size.height * 0.09, relief);
  titleMesh.position.set(0, size.height * 0.38, plateDepth);
  details.add(titleMesh);
  const labelMesh = buildText(font, label, size.width * 0.7, size.height * 0.07, relief);
  labelMesh.position.set(0, -size.height * 0.38, plateDepth);
  details.add(labelMesh);
  const qr = buildQr(url, Math.min(size.width * 0.68, size.height * 0.58), plateDepth, relief);
  qr.position.y = -size.height * 0.02;

  const components: Component[] = [
    component('body', 'placa', 'placa-qr.stl', plate, plateColor, 'placa-qr'),
    component('text', 'textos', 'placa-qr-textos.stl', details, detailColor, 'placa-qr'),
    component('detail', 'codigo-qr', 'placa-qr-codigo.stl', qr, detailColor, 'placa-qr'),
  ];
  if (mount === 'tabletop') {
    components.push(
      component(
        'support',
        'base-de-mostrador',
        'placa-qr-base.stl',
        buildTabletopBase(size.width, plateDepth, size.height),
        supportColor,
        'placa-qr',
      ),
    );
  }

  return finalize(
    components,
    `placa-qr-${slugify(label)}`,
    ['Prueba el QR desde la vista previa y con una impresión de prueba antes de producir el lote.'],
  );
}

export async function generateBusinessSignageModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const template = stringParam(params.signage_template, 'custom');
  const size = {
    width: clampNumber(params.width_mm, 160, 70, 400),
    height: clampNumber(params.height_mm, 70, 40, 260),
  };
  const mount = stringParam(params.mount_style, 'tabletop');
  const frontText = resolveTemplateText(
    template,
    stringParam(params.front_text, 'ABIERTO'),
    params,
  );
  const backText = stringParam(params.back_text, 'CERRADO');
  const doubleSided = Boolean(params.double_sided);
  const selectedIcon = stringParam(params.signage_icon, 'auto');
  const icon = selectedIcon === 'auto' ? templateIcon(template) : selectedIcon;
  const depth = clampNumber(params.base_thickness_mm, 3.2, 1.6, 10);
  const relief = clampNumber(params.relief_height_mm, 1, 0.4, 3);
  const radius = clampNumber(params.corner_radius_mm, 8, 1, 30);
  const font = await loadFont(stringParam(params.font, 'montserrat_regular'));
  const plateColor = stringParam(params.base_color, '#efe6d5');
  const detailColor = stringParam(params.detail_color, '#171717');
  const supportColor = stringParam(params.support_color, '#c8755b');

  const plate = new THREE.Mesh(extrudeRoundedRectangle(size.width, size.height, radius, depth));
  const front = new THREE.Group();
  const frontLabel = buildText(
    font,
    frontText,
    size.width * (icon === 'none' ? 0.8 : 0.67),
    size.height * 0.3,
    relief,
  );
  frontLabel.position.set(icon === 'none' ? 0 : size.width * 0.08, 0, depth);
  front.add(frontLabel);
  if (icon !== 'none') {
    const iconMesh = buildIcon(icon, Math.min(size.height * 0.25, size.width * 0.14), relief);
    iconMesh.position.set(-size.width * 0.34, 0, depth);
    front.add(iconMesh);
  }

  const components: Component[] = [
    component('body', 'placa', 'senal-placa.stl', plate, plateColor, 'senal'),
    component('text', 'frente', 'senal-frente.stl', front, detailColor, 'senal'),
  ];
  if (doubleSided && backText.trim()) {
    const back = buildText(font, backText, size.width * 0.78, size.height * 0.3, relief);
    back.rotation.y = Math.PI;
    back.position.set(0, 0, 0);
    components.push(component('text', 'reverso', 'senal-reverso.stl', back, detailColor, 'senal'));
  }
  if (mount === 'tabletop') {
    components.push(
      component(
        'support',
        'base-de-mostrador',
        'senal-base.stl',
        buildTabletopBase(size.width, depth, size.height),
        supportColor,
        'senal',
      ),
    );
  } else if (mount === 'wall') {
    components.push(
      component(
        'support',
        'plantilla-de-montaje',
        'senal-plantilla-montaje.stl',
        buildWallMountTemplate(size.width, size.height),
        supportColor,
        'senal',
      ),
    );
  }

  return finalize(components, `senal-${slugify(frontText)}`);
}

export async function generateBusinessKeychainModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const shape = stringParam(params.keychain_shape, 'rounded');
  const text = stringParam(params.keychain_text, 'HORAMA').trim();
  if (!text) throw new Error('Agrega el texto o monograma del llavero.');
  const width = clampNumber(params.keychain_width_mm, 62, 30, 110);
  const height = clampNumber(params.keychain_height_mm, 32, 20, 70);
  const depth = clampNumber(params.base_thickness_mm, 3.2, 1.6, 8);
  const relief = clampNumber(params.relief_height_mm, 0.8, 0.4, 2.4);
  const hole = clampNumber(params.keychain_hole_diameter_mm, 5, 3, 10);
  const font = await loadFont(stringParam(params.font, 'montserrat_regular'));
  const bodyColor = stringParam(params.base_color, '#c8755b');
  const detailColor = stringParam(params.detail_color, '#171717');

  const body = new THREE.Mesh(buildKeychainGeometry(shape, width, height, depth, hole));
  const label = buildText(font, text, width * 0.62, height * 0.35, relief);
  label.position.set(width * 0.08, 0, depth);
  const components: Component[] = [
    component('body', 'llavero', 'llavero-cuerpo.stl', body, bodyColor, 'llavero'),
    component('text', 'marca', 'llavero-marca.stl', label, detailColor, 'llavero'),
  ];
  return finalize(components, `llavero-${slugify(text)}`);
}

export async function generateDisplayAccessoryModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const kind = stringParam(params.accessory_type, 'card_holder');
  const width = clampNumber(params.width_mm, kind === 'menu_holder' ? 150 : 100, 60, 300);
  const height = clampNumber(params.height_mm, kind === 'menu_holder' ? 190 : 65, 40, 320);
  const wall = clampNumber(params.wall_thickness_mm, 3, 1.6, 8);
  const label = stringParam(params.front_text, 'HORAMA CAFÉ');
  const font = await loadFont(stringParam(params.font, 'montserrat_regular'));
  const bodyColor = stringParam(params.base_color, '#c8755b');
  const detailColor = stringParam(params.detail_color, '#171717');
  let body: THREE.Object3D;

  if (kind === 'menu_holder') body = buildMenuHolder(width, height, wall);
  else if (kind === 'decor') body = buildDecoration(Math.min(width, height) * 0.42, wall);
  else body = buildCardHolder(width, height, wall);

  const components: Component[] = [
    component('body', kind, `${kind}.stl`, body, bodyColor, 'accesorio'),
  ];
  if (kind !== 'decor' && label.trim()) {
    const text = buildText(font, label, width * 0.72, height * 0.16, 1);
    text.position.set(0, kind === 'menu_holder' ? -height * 0.32 : -height * 0.14, wall * 2);
    components.push(component('text', 'marca', `${kind}-marca.stl`, text, detailColor, 'accesorio'));
  }
  return finalize(components, `${kind}-${slugify(label)}`);
}

export async function generateBusinessPackageModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const tier = stringParam(params.package_tier, 'essential');
  const business = stringParam(params.business_name, 'HORAMA CAFÉ').trim();
  const wifiPayload = buildWifiPayload(params);
  const contactUrl = normalizeUrl(params.qr_url);
  const menuUrl = normalizeUrl(params.secondary_qr_url);
  const reviewsUrl = normalizeUrl(params.tertiary_qr_url);
  const font = await loadFont(stringParam(params.font, 'montserrat_regular'));
  const bodyColor = stringParam(params.base_color, '#efe6d5');
  const detailColor = stringParam(params.detail_color, '#171717');
  const supportColor = stringParam(params.support_color, '#c8755b');
  const components: Component[] = [];

  if (tier === 'kit_qr') {
    components.push(...buildPackageQr(font, 'WIFI', wifiPayload, 'wifi', bodyColor, detailColor, supportColor));
    components.push(...buildPackageQr(font, 'CONTÁCTANOS', contactUrl, 'contacto', bodyColor, detailColor, supportColor));
    components.push(...buildPackageQr(font, 'RESEÑAS', reviewsUrl, 'resenas', bodyColor, detailColor, supportColor));
    return finalize(
      components,
      `paquete-kit-qr-${slugify(business)}`,
      ['Prueba los tres códigos QR antes de producir el lote.'],
    );
  }

  components.push(...buildPackageLogo(font, business, bodyColor, detailColor, supportColor, tier));
  components.push(...buildPackageQr(font, 'WIFI', wifiPayload, 'wifi', bodyColor, detailColor, supportColor));
  components.push(...buildPackageSign(font, 'HORARIO', 'horario', bodyColor, detailColor, supportColor));
  for (let index = 1; index <= 4; index += 1) {
    components.push(...buildPackageKeychain(font, business, index, bodyColor, detailColor));
  }

  if (tier === 'presence' || tier === 'experience') {
    components.push(...buildPackageQr(font, 'MENÚ', menuUrl, 'menu', bodyColor, detailColor, supportColor));
    components.push(component('body', 'portamenu', 'portamenu.stl', buildMenuHolder(150, 190, 3), supportColor, 'portamenu'));
    components.push(...buildPackageSign(font, 'ABIERTO', 'abierto', bodyColor, detailColor, supportColor));
    components.push(component('body', 'portatarjetas', 'portatarjetas.stl', buildCardHolder(100, 65, 3), supportColor, 'portatarjetas'));
    components.push(...buildPackageSign(font, 'RESERVADO', 'reservado', bodyColor, detailColor, supportColor));
    components.push(component('detail', 'decoracion', 'decoracion-marca.stl', buildDecoration(30, 3), detailColor, 'decoracion'));
  }

  if (tier === 'experience') {
    const wallLogo = buildText(font, business, 180, 42, 4);
    components.push(component('detail', 'logotipo-decorativo', 'logotipo-decorativo.stl', wallLogo, detailColor, 'logotipo-decorativo'));
    components.push(...buildPackageSign(font, '01', 'mesa-01', bodyColor, detailColor, supportColor, 65, 90));
    components.push(...buildPackageSign(font, '02', 'mesa-02', bodyColor, detailColor, supportColor, 65, 90));
    components.push(...buildPackageSign(font, 'RECEPCIÓN →', 'direccion', bodyColor, detailColor, supportColor, 190, 70));
    components.push(...await buildPackageTipJar(params, business, reviewsUrl, bodyColor, detailColor, supportColor));
  }

  return finalize(
    components,
    `paquete-${tier}-${slugify(business)}`,
    [
      'El paquete genera las piezas como archivos STL independientes dentro de la descarga.',
      'Valida los QR y las holguras de soportes con impresiones de prueba antes de producir el lote.',
    ],
  );
}

function buildPackageLogo(
  font: Awaited<ReturnType<typeof loadFont>>,
  text: string,
  bodyColor: string,
  detailColor: string,
  supportColor: string,
  tier: string,
): Component[] {
  const width = tier === 'experience' ? 250 : 190;
  const height = tier === 'experience' ? 120 : 95;
  const depth = 3.2;
  const plate = new THREE.Mesh(extrudeRoundedRectangle(width, height, 12, depth));
  const label = buildText(font, text, width * 0.76, height * 0.28, 1);
  label.position.z = depth;
  return [
    component('body', 'letrero-principal', 'letrero-principal-placa.stl', plate, bodyColor, 'letrero-principal'),
    component('text', 'letrero-principal-marca', 'letrero-principal-marca.stl', label, detailColor, 'letrero-principal'),
    component('support', 'letrero-principal-base', 'letrero-principal-base.stl', buildTabletopBase(width, depth, height), supportColor, 'letrero-principal'),
  ];
}

function buildPackageQr(
  font: Awaited<ReturnType<typeof loadFont>>,
  label: string,
  url: string,
  slug: string,
  bodyColor: string,
  detailColor: string,
  supportColor: string,
): Component[] {
  const width = 105;
  const height = 135;
  const depth = 3;
  const plate = new THREE.Mesh(extrudeRoundedRectangle(width, height, 8, depth));
  const text = buildText(font, label, width * 0.7, height * 0.1, 0.9);
  text.position.set(0, height * 0.38, depth);
  const qr = buildQr(url, 72, depth, 0.9);
  qr.position.y = -height * 0.05;
  return [
    component('body', `${slug}-placa`, `${slug}-placa.stl`, plate, bodyColor, slug),
    component('text', `${slug}-texto`, `${slug}-texto.stl`, text, detailColor, slug),
    component('detail', `${slug}-qr`, `${slug}-qr.stl`, qr, detailColor, slug),
    component('support', `${slug}-base`, `${slug}-base.stl`, buildTabletopBase(width, depth, height), supportColor, slug),
  ];
}

function buildPackageSign(
  font: Awaited<ReturnType<typeof loadFont>>,
  label: string,
  slug: string,
  bodyColor: string,
  detailColor: string,
  supportColor: string,
  width = 135,
  height = 58,
): Component[] {
  const depth = 3;
  const plate = new THREE.Mesh(extrudeRoundedRectangle(width, height, 7, depth));
  const text = buildText(font, label, width * 0.76, height * 0.3, 1);
  text.position.z = depth;
  return [
    component('body', `${slug}-placa`, `${slug}-placa.stl`, plate, bodyColor, slug),
    component('text', `${slug}-texto`, `${slug}-texto.stl`, text, detailColor, slug),
    component('support', `${slug}-base`, `${slug}-base.stl`, buildTabletopBase(width, depth, height), supportColor, slug),
  ];
}

function buildPackageKeychain(
  font: Awaited<ReturnType<typeof loadFont>>,
  business: string,
  index: number,
  bodyColor: string,
  detailColor: string,
): Component[] {
  const body = new THREE.Mesh(buildKeychainGeometry('rounded', 58, 30, 3, 5));
  const text = buildText(font, business, 35, 8, 0.8);
  text.position.set(4, 0, 3);
  return [
    component('body', `llavero-${index}`, `llavero-${index}-cuerpo.stl`, body, bodyColor, `llavero-${index}`),
    component('text', `llavero-${index}-marca`, `llavero-${index}-marca.stl`, text, detailColor, `llavero-${index}`),
  ];
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

function buildQr(payload: string, targetSize: number, baseDepth: number, relief: number): THREE.Group {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const moduleSize = targetSize / (qr.modules.size + 8);
  const group = new THREE.Group();
  for (let row = 0; row < qr.modules.size; row += 1) {
    for (let column = 0; column < qr.modules.size; column += 1) {
      if (!qr.modules.get(row, column)) continue;
      const module = new THREE.Mesh(
        new THREE.BoxGeometry(moduleSize * 1.02, moduleSize * 1.02, relief),
      );
      module.position.set(
        (column - (qr.modules.size - 1) / 2) * moduleSize,
        ((qr.modules.size - 1) / 2 - row) * moduleSize,
        baseDepth + relief / 2,
      );
      group.add(module);
    }
  }
  return group;
}

function buildWifiPayload(params: ProductParams): string {
  const security = stringParam(params.wifi_security, 'WPA');
  const ssid = escapeWifiValue(stringParam(params.wifi_ssid, 'HORAMA CAFE'));
  const password = escapeWifiValue(stringParam(params.wifi_password, ''));
  const hidden = Boolean(params.wifi_hidden) ? 'true' : 'false';
  return `WIFI:T:${security};S:${ssid};P:${security === 'nopass' ? '' : password};H:${hidden};;`;
}

function escapeWifiValue(value: string): string {
  return value.replace(/([\\;,:\"])/g, '\\$1');
}

function buildTabletopBase(width: number, plateDepth: number, plateHeight: number): THREE.Group {
  const group = new THREE.Group();
  const bottomY = -plateHeight / 2;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(width + 18, 16, 12));
  foot.position.set(0, bottomY - 8, 6);
  const rear = new THREE.Mesh(new THREE.BoxGeometry(width + 8, 7, plateDepth + 6));
  rear.position.set(0, bottomY + 1.5, (plateDepth + 6) / 2);
  group.add(foot, rear);
  return group;
}

function buildWallMountTemplate(width: number, height: number): THREE.Group {
  const group = new THREE.Group();
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width * 0.72, 5, 3));
  const markerA = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 2, 24));
  markerA.rotation.x = Math.PI / 2;
  markerA.position.x = -width * 0.28;
  const markerB = markerA.clone();
  markerB.position.x = width * 0.28;
  rail.position.y = -height * 0.38;
  markerA.position.y = rail.position.y;
  markerB.position.y = rail.position.y;
  group.add(rail, markerA, markerB);
  return group;
}

function buildKeychainGeometry(
  shapeName: string,
  width: number,
  height: number,
  depth: number,
  holeDiameter: number,
): THREE.ExtrudeGeometry {
  const shape = shapeName === 'round'
    ? circleShape(width / 2)
    : roundedRectangleShape(width, height, Math.min(height * 0.28, 9));
  const hole = new THREE.Path();
  hole.absarc(-width * 0.38, 0, holeDiameter / 2, 0, Math.PI * 2, false);
  shape.holes.push(hole);
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 20,
    steps: 1,
  });
}

function buildCardHolder(width: number, height: number, wall: number): THREE.Group {
  const group = new THREE.Group();
  const depth = 28;
  const base = new THREE.Mesh(new THREE.BoxGeometry(width, depth, wall));
  base.position.z = wall / 2;
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, wall, height));
  back.position.set(0, depth / 2 - wall / 2, height / 2);
  const front = new THREE.Mesh(new THREE.BoxGeometry(width, wall, height * 0.42));
  front.position.set(0, -depth / 2 + wall / 2, height * 0.21);
  const left = new THREE.Mesh(new THREE.BoxGeometry(wall, depth, height * 0.45));
  left.position.set(-width / 2 + wall / 2, 0, height * 0.225);
  const right = left.clone();
  right.position.x *= -1;
  group.add(base, back, front, left, right);
  return group;
}

function buildMenuHolder(width: number, height: number, wall: number): THREE.Group {
  const group = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(width + 18, 34, wall * 2));
  base.position.z = wall;
  const back = new THREE.Mesh(new THREE.BoxGeometry(width, wall, height));
  back.rotation.x = -THREE.MathUtils.degToRad(12);
  back.position.set(0, 5, height / 2 + wall * 2);
  const lip = new THREE.Mesh(new THREE.BoxGeometry(width, 12, wall * 2));
  lip.position.set(0, -8, wall * 3);
  group.add(base, back, lip);
  return group;
}

function buildDecoration(radius: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.34, radius * 0.34, depth, 40));
  disc.rotation.x = Math.PI / 2;
  for (let index = 0; index < 12; index += 1) {
    const ray = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.42, radius * 0.08, depth));
    const angle = (Math.PI * 2 * index) / 12;
    ray.rotation.z = angle;
    ray.position.set(Math.cos(angle) * radius * 0.72, Math.sin(angle) * radius * 0.72, 0);
    group.add(ray);
  }
  group.add(disc);
  return group;
}

async function buildPackageTipJar(
  params: ProductParams,
  business: string,
  qrUrl: string,
  bodyColor: string,
  detailColor: string,
  supportColor: string,
): Promise<Component[]> {
  const jar = await generateTipJarModel({
    tip_jar_version: 'qr',
    business_name: business,
    tip_message: 'GRACIAS',
    qr_url: qrUrl,
    font: params.font,
    body_color: supportColor,
    lid_color: bodyColor,
    text_color: detailColor,
    qr_color: detailColor,
  });
  const loader = new STLLoader();
  return Promise.all(
    (jar.previewFiles ?? []).map(async (file, index) => {
      const response = await fetch(file.url);
      const geometry = loader.parse(await response.arrayBuffer());
      return component(
        file.role,
        `bote-propinas-${file.object ?? index + 1}`,
        `paquete-${file.filename ?? `bote-propinas-${index + 1}.stl`}`,
        new THREE.Mesh(geometry),
        file.color ?? supportColor,
        'bote-propinas',
      );
    }),
  );
}

function buildIcon(name: string, size: number, depth: number): THREE.Object3D {
  const group = new THREE.Group();
  if (name === 'clock') {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(size * 0.42, size * 0.08, 8, 36));
    const handA = new THREE.Mesh(new THREE.BoxGeometry(size * 0.08, size * 0.34, depth));
    handA.position.y = size * 0.1;
    const handB = new THREE.Mesh(new THREE.BoxGeometry(size * 0.28, size * 0.08, depth));
    handB.position.x = size * 0.1;
    group.add(ring, handA, handB);
  } else if (name === 'card') {
    group.add(new THREE.Mesh(extrudeRoundedRectangle(size, size * 0.64, size * 0.08, depth)));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(size * 0.76, size * 0.1, depth));
    stripe.position.set(0, size * 0.1, depth);
    group.add(stripe);
  } else if (name === 'arrow') {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(size * 0.62, size * 0.16, depth));
    shaft.position.x = -size * 0.08;
    const tipShape = new THREE.Shape();
    tipShape.moveTo(size * 0.05, -size * 0.32);
    tipShape.lineTo(size * 0.45, 0);
    tipShape.lineTo(size * 0.05, size * 0.32);
    tipShape.closePath();
    const tip = new THREE.Mesh(new THREE.ExtrudeGeometry(tipShape, { depth, bevelEnabled: false }));
    group.add(shaft, tip);
  } else if (name === 'star') {
    group.add(new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(size * 0.46), { depth, bevelEnabled: false })));
  } else {
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(size * 0.35, size * 0.35, depth, 32));
    disc.rotation.x = Math.PI / 2;
    group.add(disc);
  }
  return group;
}

function finalize(
  components: Component[],
  name: string,
  warnings: string[] = [],
): GeneratedModel {
  const assemblyOffsets = getAssemblyOffsets(components);
  const previewFiles = components.map((item) => {
    const blob = exportObject(item.mesh);
    const offset = assemblyOffsets.get(item.assembly) ?? new THREE.Vector3();
    return {
      role: item.role,
      object: item.object,
      filename: item.filename,
      url: URL.createObjectURL(blob),
      format: 'stl' as const,
      color: item.color,
      previewPosition: offset.toArray() as [number, number, number],
    };
  });
  const combined = arrangeForPreview(components, assemblyOffsets);
  const blob = exportObject(combined);
  const url = URL.createObjectURL(blob);
  return {
    source: 'local',
    name: `${name}.stl`,
    modelUrl: url,
    downloadUrl: url,
    blob,
    previewFiles,
    format: 'stl',
    metadata: {
      objects: components.map((item) => item.object),
      warnings,
    },
  };
}

function getAssemblyOffsets(components: Component[]): Map<string, THREE.Vector3> {
  const offsets = new Map<string, THREE.Vector3>();
  const assemblies = new Map<string, THREE.Group>();
  components.forEach((item) => {
    const assembly = assemblies.get(item.assembly) ?? new THREE.Group();
    assembly.add(item.mesh.clone(true));
    assemblies.set(item.assembly, assembly);
  });
  let cursorX = 0;
  let cursorY = 0;
  let rowHeight = 0;
  const maxRowWidth = 520;
  assemblies.forEach((assembly, assemblyName) => {
    const box = new THREE.Box3().setFromObject(assembly);
    const size = box.getSize(new THREE.Vector3());
    if (cursorX > 0 && cursorX + size.x > maxRowWidth) {
      cursorX = 0;
      cursorY -= rowHeight + 28;
      rowHeight = 0;
    }
    offsets.set(
      assemblyName,
      new THREE.Vector3(cursorX - box.min.x, cursorY - box.min.y, -box.min.z),
    );
    cursorX += size.x + 24;
    rowHeight = Math.max(rowHeight, size.y);
  });
  return offsets;
}

function arrangeForPreview(
  components: Component[],
  assemblyOffsets: Map<string, THREE.Vector3>,
): THREE.Group {
  const group = new THREE.Group();
  const assemblies = new Map<string, THREE.Group>();
  components.forEach((item) => {
    const assembly = assemblies.get(item.assembly) ?? new THREE.Group();
    assembly.add(item.mesh.clone(true));
    assemblies.set(item.assembly, assembly);
  });
  assemblies.forEach((assembly, assemblyName) => {
    assembly.position.copy(assemblyOffsets.get(assemblyName) ?? new THREE.Vector3());
    group.add(assembly);
  });
  const bounds = new THREE.Box3().setFromObject(group);
  const center = bounds.getCenter(new THREE.Vector3());
  group.position.set(-center.x, -center.y, -bounds.min.z);
  return group;
}

function component(
  role: PreviewFile['role'],
  object: string,
  filename: string,
  mesh: THREE.Object3D,
  color: string,
  assembly = object,
): Component {
  return { role, object, filename, mesh, color, assembly };
}

function extrudeRoundedRectangle(
  width: number,
  height: number,
  radius: number,
  depth: number,
): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(roundedRectangleShape(width, height, radius), {
    depth,
    bevelEnabled: false,
    curveSegments: 18,
    steps: 1,
  });
}

function roundedRectangleShape(width: number, height: number, radius: number): THREE.Shape {
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
  return shape;
}

function circleShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  return shape;
}

function starShape(radius: number): THREE.Shape {
  const shape = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * index) / 5;
    const current = index % 2 === 0 ? radius : radius * 0.44;
    const x = Math.cos(angle) * current;
    const y = Math.sin(angle) * current;
    if (index === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
}

function scaleShapes(shapes: THREE.Shape[], scale: number): THREE.Shape[] {
  return shapes.map((shape) => {
    const points = shape.extractPoints(24);
    const scaled = new THREE.Shape(points.shape.map((point) => point.clone().multiplyScalar(scale)));
    scaled.holes = points.holes.map(
      (hole) => new THREE.Path(hole.map((point) => point.clone().multiplyScalar(scale))),
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

function exportObject(object: THREE.Object3D): Blob {
  object.updateMatrixWorld(true);
  const view = new STLExporter().parse(object, { binary: true }) as DataView;
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return new Blob([bytes], { type: 'model/stl' });
}

function normalizePlateSize(value: ProductParams[string] | undefined): PlateSize {
  if (value === 'compact') return { width: 105, height: 135 };
  if (value === 'large') return { width: 180, height: 220 };
  return { width: 140, height: 180 };
}

function resolveTemplateText(
  template: string,
  customText: string,
  params: ProductParams,
): string {
  if (template === 'hours') return customText || 'HORARIO';
  if (template === 'payment') return customText || 'PAGOS';
  if (template === 'open_closed') return customText || 'ABIERTO';
  if (template === 'reserved') return customText || 'RESERVADO';
  if (template === 'table_number') return stringParam(params.table_number, '01');
  if (template === 'directional') return customText || 'RECEPCIÓN';
  return customText;
}

function templateIcon(template: string): string {
  if (template === 'hours') return 'clock';
  if (template === 'payment') return 'card';
  if (template === 'directional') return 'arrow';
  if (template === 'reserved') return 'star';
  return 'none';
}

function normalizeUrl(value: ProductParams[string] | undefined): string {
  const raw = stringParam(value, 'https://horama3d.com').trim();
  return /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
}

function stringParam(value: ProductParams[string] | undefined, fallback: string): string {
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
    .replace(/^-|-$/g, '') || 'horama';
}
