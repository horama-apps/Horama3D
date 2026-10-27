import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import type { Font } from 'three/addons/loaders/FontLoader.js';
import type { GeneratedModel, PreviewFile, ProductParams } from '../types';
import { loadFont } from './signGenerator';

type OrnamentPart = {
  role: PreviewFile['role'];
  object: string;
  filename: string;
  mesh: THREE.Object3D;
  color: string;
};

const TREE_POINTS = [
  [-10, -70], [-10, -60], [-46, -60], [-31, -31], [-39, -31],
  [-21, 4], [-29, 4], [0, 66], [29, 4], [21, 4],
  [39, -31], [31, -31], [46, -60], [10, -60], [10, -70],
] as const;

export async function generateChristmasTreeOrnamentModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const familyText = stringParam(params.family_text, 'FAMILIA OJEDA').trim();
  const nameText = stringParam(params.name_text, 'Laura').trim();
  if (!familyText) throw new Error('Agrega el texto de la familia.');
  if (!nameText) throw new Error('Agrega el nombre del adorno.');

  const width = clampNumber(params.ornament_width_mm, 100, 70, 180);
  const scale = width / 100;
  const baseDepth = clampNumber(params.base_thickness_mm, 3, 1.6, 8);
  const relief = clampNumber(params.relief_height_mm, 1, 0.4, 2.4);
  const frameWidth = clampNumber(params.frame_width_mm, 2.4, 1.2, 5);
  const holeDiameter = clampNumber(params.hanging_hole_diameter_mm, 8, 4, 14);
  const font = await loadFont(stringParam(params.font, 'kaushan_script_regular'));
  const baseColor = stringParam(params.base_color, '#d9ae78');
  const greenColor = stringParam(params.frame_color, '#3f7d45');
  const redColor = stringParam(params.text_color, '#d72d22');

  const body = buildBody(scale, baseDepth, holeDiameter);
  const greenDetails = buildGreenDetails(scale, baseDepth, relief, frameWidth);
  const redDetails = buildRedDetails(
    font,
    familyText,
    nameText,
    scale,
    baseDepth,
    relief,
  );

  const parts: OrnamentPart[] = [
    {
      role: 'body',
      object: 'arbol-base',
      filename: 'adorno-navidad-base.stl',
      mesh: body,
      color: baseColor,
    },
    {
      role: 'detail',
      object: 'marco-y-adornos-verdes',
      filename: 'adorno-navidad-verde.stl',
      mesh: greenDetails,
      color: greenColor,
    },
    {
      role: 'text',
      object: 'textos-y-adornos-rojos',
      filename: 'adorno-navidad-rojo.stl',
      mesh: redDetails,
      color: redColor,
    },
  ];

  return finalize(parts, `adorno-navidad-${slugify(nameText)}`);
}

function buildBody(scale: number, depth: number, holeDiameter: number): THREE.Group {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(extrudeShape(treeShape(scale), depth)));

  const loopCenterY = 76 * scale;
  const outerRadius = Math.max(holeDiameter / 2 + 3.2, 10.5 * scale);
  const loop = new THREE.Shape();
  loop.absarc(0, loopCenterY, outerRadius, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, loopCenterY, holeDiameter / 2, 0, Math.PI * 2, true);
  loop.holes.push(hole);
  group.add(new THREE.Mesh(extrudeShape(loop, depth)));

  const connector = new THREE.Mesh(
    new THREE.BoxGeometry(Math.max(8 * scale, outerRadius * 0.9), 11 * scale, depth),
  );
  connector.position.set(0, 65.5 * scale, depth / 2);
  group.add(connector);
  return group;
}

function buildGreenDetails(
  scale: number,
  baseDepth: number,
  relief: number,
  requestedFrameWidth: number,
): THREE.Group {
  const group = new THREE.Group();
  const frameWidth = Math.min(requestedFrameWidth / scale, 4.5);
  const outerScale = 0.955;
  const innerScale = Math.max(0.82, outerScale - frameWidth / 48);
  const frame = polygonShape(scalePoints(TREE_POINTS, scale * outerScale));
  const innerPoints = scalePoints(TREE_POINTS, scale * innerScale).reverse();
  frame.holes.push(new THREE.Path(innerPoints));
  const frameMesh = new THREE.Mesh(extrudeShape(frame, relief));
  frameMesh.position.z = baseDepth;
  group.add(frameMesh);

  addDisc(group, -19 * scale, 32 * scale, 2.1 * scale, baseDepth, relief);
  addDisc(group, 18 * scale, 28 * scale, 2.4 * scale, baseDepth, relief);
  addDisc(group, 0, 19 * scale, 1.5 * scale, baseDepth, relief);
  addDisc(group, -27 * scale, -33 * scale, 1.8 * scale, baseDepth, relief);
  addStar(group, 31 * scale, -50 * scale, 3.4 * scale, baseDepth, relief);

  const leftFlourish = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-7 * scale, -25 * scale, baseDepth + relief / 2),
    new THREE.Vector3(-17 * scale, -22 * scale, baseDepth + relief / 2),
    new THREE.Vector3(-27 * scale, -25 * scale, baseDepth + relief / 2),
    new THREE.Vector3(-30 * scale, -21 * scale, baseDepth + relief / 2),
    new THREE.Vector3(-27 * scale, -18 * scale, baseDepth + relief / 2),
  ]);
  const rightFlourish = new THREE.CatmullRomCurve3([
    new THREE.Vector3(7 * scale, -25 * scale, baseDepth + relief / 2),
    new THREE.Vector3(17 * scale, -22 * scale, baseDepth + relief / 2),
    new THREE.Vector3(27 * scale, -25 * scale, baseDepth + relief / 2),
    new THREE.Vector3(30 * scale, -21 * scale, baseDepth + relief / 2),
    new THREE.Vector3(27 * scale, -18 * scale, baseDepth + relief / 2),
  ]);
  group.add(
    new THREE.Mesh(new THREE.TubeGeometry(leftFlourish, 28, 0.75 * scale, 8, false)),
    new THREE.Mesh(new THREE.TubeGeometry(rightFlourish, 28, 0.75 * scale, 8, false)),
  );
  return group;
}

function buildRedDetails(
  font: Font,
  familyText: string,
  nameText: string,
  scale: number,
  baseDepth: number,
  relief: number,
): THREE.Group {
  const group = new THREE.Group();
  const familyLines = wrapFamilyText(familyText);
  const familyLineHeight = 17 * scale;
  const familyCenterY = familyLines.length === 1 ? 0 : 7 * scale;
  familyLines.forEach((line, index) => {
    const centerY =
      familyCenterY +
      (familyLines.length - 1) * familyLineHeight / 2 -
      index * familyLineHeight;
    const textHeight = 15 * scale;
    const text = buildText(
      font,
      line,
      safeTreeTextWidth(centerY, textHeight, scale, 5 * scale),
      textHeight,
      relief,
    );
    text.position.set(
      0,
      centerY,
      baseDepth,
    );
    group.add(text);
  });

  const nameCenterY = -43 * scale;
  const nameHeight = 21 * scale;
  const name = buildText(
    font,
    nameText,
    safeTreeTextWidth(nameCenterY, nameHeight, scale, 5 * scale),
    nameHeight,
    relief,
  );
  name.position.set(0, nameCenterY, baseDepth);
  group.add(name);

  addStar(group, 0, 49 * scale, 3.8 * scale, baseDepth, relief);
  addStar(group, -31 * scale, -50 * scale, 3.3 * scale, baseDepth, relief);
  addDisc(group, -31 * scale, -8 * scale, 1.5 * scale, baseDepth, relief);
  addDisc(group, 31 * scale, -10 * scale, 1.7 * scale, baseDepth, relief);
  addDisc(group, 0, -25 * scale, 1.7 * scale, baseDepth, relief);
  addDisc(group, 28 * scale, -34 * scale, 1.7 * scale, baseDepth, relief);
  return group;
}

function buildText(
  font: Font,
  value: string,
  maxWidth: number,
  maxHeight: number,
  depth: number,
): THREE.Mesh {
  const shapes = font.generateShapes(value.slice(0, 48), 10);
  const bounds = shapesBounds(shapes);
  const scale = Math.min(
    maxWidth / Math.max(bounds.width, 0.001),
    maxHeight / Math.max(bounds.height, 0.001),
  );
  const scaled = scaleShapes(shapes, scale);
  const scaledBounds = shapesBounds(scaled);
  const geometry = new THREE.ExtrudeGeometry(scaled, {
    depth,
    bevelEnabled: false,
    curveSegments: 12,
    steps: 1,
  });
  geometry.translate(
    -scaledBounds.minX - scaledBounds.width / 2,
    -scaledBounds.minY - scaledBounds.height / 2,
    0,
  );
  return new THREE.Mesh(geometry);
}

function wrapFamilyText(value: string): string[] {
  const words = value.replace(/\s+/g, ' ').trim().split(' ');
  if (words.length < 2 || value.length <= 11) return [value];
  let bestIndex = 1;
  let bestDifference = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const first = words.slice(0, index).join(' ').length;
    const second = words.slice(index).join(' ').length;
    const difference = Math.abs(first - second);
    if (difference < bestDifference) {
      bestDifference = difference;
      bestIndex = index;
    }
  }
  return [words.slice(0, bestIndex).join(' '), words.slice(bestIndex).join(' ')];
}

function safeTreeTextWidth(
  centerY: number,
  textHeight: number,
  treeScale: number,
  horizontalPadding: number,
): number {
  const polygon = scalePoints(TREE_POINTS, treeScale);
  let safeWidth = Number.POSITIVE_INFINITY;
  const samples = 12;
  for (let sample = 0; sample <= samples; sample += 1) {
    const y = centerY - textHeight / 2 + textHeight * sample / samples;
    const intersections: number[] = [];
    polygon.forEach((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      if ((start.y > y) === (end.y > y)) return;
      const amount = (y - start.y) / (end.y - start.y);
      intersections.push(THREE.MathUtils.lerp(start.x, end.x, amount));
    });
    intersections.sort((a, b) => a - b);
    for (let index = 0; index + 1 < intersections.length; index += 2) {
      const left = intersections[index];
      const right = intersections[index + 1];
      if (left <= 0 && right >= 0) {
        safeWidth = Math.min(safeWidth, right - left - horizontalPadding * 2);
        break;
      }
    }
  }
  return Number.isFinite(safeWidth)
    ? Math.max(12 * treeScale, safeWidth)
    : 12 * treeScale;
}

function treeShape(scale: number): THREE.Shape {
  return polygonShape(scalePoints(TREE_POINTS, scale));
}

function polygonShape(points: THREE.Vector2[]): THREE.Shape {
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, point.y);
    else shape.lineTo(point.x, point.y);
  });
  shape.closePath();
  return shape;
}

function scalePoints(
  points: ReadonlyArray<readonly [number, number]>,
  scale: number,
): THREE.Vector2[] {
  return points.map(([x, y]) => new THREE.Vector2(x * scale, y * scale));
}

function extrudeShape(shape: THREE.Shape, depth: number): THREE.ExtrudeGeometry {
  return new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    curveSegments: 24,
    steps: 1,
  });
}

function addDisc(
  group: THREE.Group,
  x: number,
  y: number,
  radius: number,
  z: number,
  depth: number,
) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const mesh = new THREE.Mesh(extrudeShape(shape, depth));
  mesh.position.set(x, y, z);
  group.add(mesh);
}

function addStar(
  group: THREE.Group,
  x: number,
  y: number,
  radius: number,
  z: number,
  depth: number,
) {
  const star = new THREE.Shape();
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const currentRadius = index % 2 === 0 ? radius : radius * 0.43;
    const px = Math.cos(angle) * currentRadius;
    const py = Math.sin(angle) * currentRadius;
    if (index === 0) star.moveTo(px, py);
    else star.lineTo(px, py);
  }
  star.closePath();
  const mesh = new THREE.Mesh(extrudeShape(star, depth));
  mesh.position.set(x, y, z);
  group.add(mesh);
}

function scaleShapes(shapes: THREE.Shape[], scale: number): THREE.Shape[] {
  return shapes.map((shape) => {
    const points = shape.extractPoints(28);
    const scaled = new THREE.Shape(
      points.shape.map((point) => point.clone().multiplyScalar(scale)),
    );
    scaled.holes = points.holes.map(
      (hole) => new THREE.Path(hole.map((point) => point.clone().multiplyScalar(scale))),
    );
    return scaled;
  });
}

function shapesBounds(shapes: THREE.Shape[]) {
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

function finalize(parts: OrnamentPart[], name: string): GeneratedModel {
  const previewFiles = parts.map((part) => {
    const blob = exportObject(part.mesh);
    return {
      role: part.role,
      object: part.object,
      filename: part.filename,
      url: URL.createObjectURL(blob),
      format: 'stl' as const,
      color: part.color,
    };
  });
  const combined = new THREE.Group();
  parts.forEach((part) => combined.add(part.mesh.clone(true)));
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
      objects: parts.map((part) => part.object),
      warnings: [
        'El archivo ZIP contiene una pieza STL por color para conservar la composición multicolor.',
      ],
    },
  };
}

function exportObject(object: THREE.Object3D): Blob {
  object.updateMatrixWorld(true);
  const view = new STLExporter().parse(object, { binary: true }) as DataView;
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return new Blob([bytes], { type: 'model/stl' });
}

function stringParam(value: ProductParams[string] | undefined, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function clampNumber(
  value: ProductParams[string] | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(value);
  return THREE.MathUtils.clamp(Number.isFinite(parsed) ? parsed : fallback, min, max);
}

function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'personalizado';
}
