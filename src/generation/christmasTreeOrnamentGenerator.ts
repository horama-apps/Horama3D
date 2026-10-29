import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
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

const SOURCE_WIDTH = 80.90521240234375;
const SOURCE_FACE_Z = 2.7599985599517822;
const SOURCE_RIM_Z = 4.731426239013672;
const TREE_CENTER_X = SOURCE_WIDTH / 2;

type DecorationSpec = {
  key: string;
  color: 'green' | 'red';
  shape: 'disc' | 'star';
  x: number;
  y: number;
  radius: number;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
};

type DecorationPosition = DecorationSpec & { currentX: number; currentY: number };

const DECORATIONS: DecorationSpec[] = [
  { key: 'green-upper-left', color: 'green', shape: 'disc', x: 27.5, y: 78, radius: 1.75, bounds: { minX: 22, maxX: 35, minY: 71, maxY: 82 } },
  { key: 'green-upper-right', color: 'green', shape: 'disc', x: 53.5, y: 75, radius: 2.05, bounds: { minX: 47, maxX: 61, minY: 68, maxY: 80 } },
  { key: 'green-upper-center', color: 'green', shape: 'disc', x: 40.5, y: 68.5, radius: 1.25, bounds: { minX: 35, maxX: 46, minY: 66, maxY: 76 } },
  { key: 'green-lower-left', color: 'green', shape: 'disc', x: 18, y: 28.5, radius: 1.45, bounds: { minX: 12, maxX: 29, minY: 24, maxY: 33 } },
  { key: 'green-lower-star', color: 'green', shape: 'star', x: 65.5, y: 16.5, radius: 3.1, bounds: { minX: 57, maxX: 69, minY: 13, maxY: 24 } },
  { key: 'red-top-star', color: 'red', shape: 'star', x: TREE_CENTER_X, y: 88, radius: 3.4, bounds: { minX: 34, maxX: 47, minY: 83, maxY: 92 } },
  { key: 'red-lower-star', color: 'red', shape: 'star', x: 14.5, y: 16.5, radius: 3, bounds: { minX: 11, maxX: 24, minY: 13, maxY: 24 } },
  { key: 'red-middle-left', color: 'red', shape: 'disc', x: 17, y: 47, radius: 1.35, bounds: { minX: 13, maxX: 25, minY: 43, maxY: 52 } },
  { key: 'red-middle-right', color: 'red', shape: 'disc', x: 65, y: 46, radius: 1.5, bounds: { minX: 56, maxX: 68, minY: 42, maxY: 52 } },
  { key: 'red-separator', color: 'red', shape: 'disc', x: TREE_CENTER_X, y: 34.5, radius: 1.45, bounds: { minX: 35, maxX: 46, minY: 32, maxY: 39 } },
  { key: 'red-lower-right', color: 'red', shape: 'disc', x: 64, y: 29, radius: 1.45, bounds: { minX: 55, maxX: 69, minY: 25, maxY: 33 } },
];

export async function generateChristmasTreeOrnamentModel(
  params: ProductParams,
): Promise<GeneratedModel> {
  const familyText = stringParam(params.family_text, 'FAMILIA OJEDA').trim();
  const nameText = stringParam(params.name_text, 'Laura').trim();
  if (!familyText) throw new Error('Agrega el texto de la familia.');
  if (!nameText) throw new Error('Agrega el nombre del adorno.');

  const width = clampNumber(params.ornament_width_mm, 81, 65, 150);
  const scale = width / SOURCE_WIDTH;
  const relief = clampNumber(params.relief_height_mm, 1.2, 0.6, 2.4);
  const familyTextScale = clampNumber(params.family_text_scale_percent, 90, 50, 100) / 100;
  const nameTextScale = clampNumber(params.name_text_scale_percent, 100, 50, 100) / 100;
  const font = await loadFont(stringParam(params.font, 'kaushan_script_regular'));
  const baseColor = stringParam(params.base_color, '#d9ae78');
  const greenColor = stringParam(params.frame_color, '#3f7d45');
  const redColor = stringParam(params.text_color, '#d72d22');

  const source = await loadTreeGeometry();
  const decorations = resolveDecorations(params.ornament_positions);
  const body = new THREE.Mesh(source.clone());
  body.scale.setScalar(scale);

  const greenDetails = buildGreenDetails(source, decorations, scale, relief);
  const redDetails = buildRedDetails(
    font,
    familyText,
    nameText,
    decorations,
    scale,
    relief,
    familyTextScale,
    nameTextScale,
  );

  const parts: OrnamentPart[] = [
    {
      role: 'body',
      object: 'arbol-base-shapr3d',
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

  return finalize(
    parts,
    `adorno-navidad-${slugify(nameText)}`,
    buildDecorationHandles(decorations, scale),
  );
}

async function loadTreeGeometry(): Promise<THREE.BufferGeometry> {
  const url = `${import.meta.env.BASE_URL}christmas-tree-assets/tree.stl`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('No se pudo cargar la base del árbol navideño.');
  const geometry = new STLLoader().parse(await response.arrayBuffer());
  geometry.computeVertexNormals();
  return geometry;
}

function buildGreenDetails(
  source: THREE.BufferGeometry,
  decorations: DecorationPosition[],
  scale: number,
  relief: number,
): THREE.Group {
  const group = new THREE.Group();
  const rimCap = new THREE.Mesh(buildTopCap(source, Math.min(0.8, relief * 0.55) / scale));
  rimCap.scale.setScalar(scale);
  group.add(rimCap);

  const z = SOURCE_FACE_Z * scale;
  decorations
    .filter((decoration) => decoration.color === 'green')
    .forEach((decoration) => addDecoration(group, decoration, scale, z, relief));

  addFlourish(group, TREE_CENTER_X * scale, 35.5 * scale, z, relief, scale);
  return group;
}

function buildRedDetails(
  font: Font,
  familyText: string,
  nameText: string,
  decorations: DecorationPosition[],
  scale: number,
  relief: number,
  familyTextScale: number,
  nameTextScale: number,
): THREE.Group {
  const group = new THREE.Group();
  const z = SOURCE_FACE_Z * scale;
  const familyLines = wrapFamilyText(familyText);
  const lineHeight = 10.5 * scale;
  const familyCenterY = familyLines.length === 1 ? 52 * scale : 55.5 * scale;

  familyLines.forEach((line, index) => {
    const centerY =
      familyCenterY +
      ((familyLines.length - 1) * lineHeight) / 2 -
      index * lineHeight;
    const text = buildText(
      font,
      line,
      37 * scale * familyTextScale,
      10.5 * scale * familyTextScale,
      relief,
    );
    text.position.set(TREE_CENTER_X * scale, centerY, z);
    group.add(text);
  });

  const name = buildText(
    font,
    nameText,
    54 * scale * nameTextScale,
    17 * scale * nameTextScale,
    relief,
  );
  name.position.set(TREE_CENTER_X * scale, 20.5 * scale, z);
  group.add(name);

  decorations
    .filter((decoration) => decoration.color === 'red')
    .forEach((decoration) => addDecoration(group, decoration, scale, z, relief));
  return group;
}

function resolveDecorations(
  value: ProductParams[string] | undefined,
): DecorationPosition[] {
  const positions = parseNormalizedPositions(value);
  return DECORATIONS.map((decoration) => {
    const custom = positions[decoration.key];
    return {
      ...decoration,
      currentX: custom
        ? THREE.MathUtils.lerp(decoration.bounds.minX, decoration.bounds.maxX, custom.u)
        : decoration.x,
      currentY: custom
        ? THREE.MathUtils.lerp(decoration.bounds.minY, decoration.bounds.maxY, custom.v)
        : decoration.y,
    };
  });
}

function parseNormalizedPositions(
  value: ProductParams[string] | undefined,
): Record<string, { u: number; v: number }> {
  if (typeof value !== 'string' || !value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, { u?: unknown; v?: unknown }>;
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([key, position]) => {
        const u = Number(position?.u);
        const v = Number(position?.v);
        return Number.isFinite(u) && Number.isFinite(v)
          ? [[key, {
              u: THREE.MathUtils.clamp(u, 0, 1),
              v: THREE.MathUtils.clamp(v, 0, 1),
            }]]
          : [];
      }),
    );
  } catch {
    return {};
  }
}

function addDecoration(
  group: THREE.Group,
  decoration: DecorationPosition,
  scale: number,
  z: number,
  relief: number,
) {
  const args = [
    group,
    decoration.currentX * scale,
    decoration.currentY * scale,
    decoration.radius * scale,
    z,
    relief,
  ] as const;
  if (decoration.shape === 'star') addStar(...args);
  else addDisc(...args);
}

function buildDecorationHandles(
  decorations: DecorationPosition[],
  scale: number,
): NonNullable<GeneratedModel['metadata']>['mountingHoles'] {
  return decorations.map((decoration) => ({
    key: decoration.key,
    kind: 'decoration' as const,
    x: decoration.currentX * scale,
    y: decoration.currentY * scale,
    radius: Math.max(2.4, decoration.radius * scale),
    depth: 0,
    bounds: {
      minX: decoration.bounds.minX * scale,
      maxX: decoration.bounds.maxX * scale,
      minY: decoration.bounds.minY * scale,
      maxY: decoration.bounds.maxY * scale,
    },
  }));
}

/** Builds a thin, watertight copy of the raised rim's horizontal top face. */
function buildTopCap(source: THREE.BufferGeometry, depth: number): THREE.BufferGeometry {
  const position = source.getAttribute('position');
  const triangles: Array<[Point, Point, Point]> = [];
  const edges = new Map<string, { count: number; start: Point; end: Point }>();

  for (let index = 0; index < position.count; index += 3) {
    const points = [0, 1, 2].map((offset) => ({
      x: position.getX(index + offset),
      y: position.getY(index + offset),
    })) as [Point, Point, Point];
    const isRimTop = [0, 1, 2].every(
      (offset) => Math.abs(position.getZ(index + offset) - SOURCE_RIM_Z) < 0.01,
    );
    if (!isRimTop) continue;

    if (cross2(points[0], points[1], points[2]) < 0) {
      [points[1], points[2]] = [points[2], points[1]];
    }
    triangles.push(points);
    addBoundaryEdge(edges, points[0], points[1]);
    addBoundaryEdge(edges, points[1], points[2]);
    addBoundaryEdge(edges, points[2], points[0]);
  }

  const vertices: number[] = [];
  const indices: number[] = [];
  const vertexIndices = new Map<string, number>();
  const vertex = (point: Point, z: number) => {
    const key = `${pointKey(point)}:${z.toFixed(4)}`;
    const existing = vertexIndices.get(key);
    if (existing !== undefined) return existing;
    const next = vertices.length / 3;
    vertices.push(point.x, point.y, z);
    vertexIndices.set(key, next);
    return next;
  };
  const bottomZ = SOURCE_RIM_Z;
  const topZ = bottomZ + depth;

  triangles.forEach(([a, b, c]) => {
    indices.push(vertex(a, topZ), vertex(b, topZ), vertex(c, topZ));
    indices.push(vertex(c, bottomZ), vertex(b, bottomZ), vertex(a, bottomZ));
  });
  edges.forEach(({ count, start, end }) => {
    if (count !== 1) return;
    const ab = vertex(start, bottomZ);
    const bb = vertex(end, bottomZ);
    const at = vertex(start, topZ);
    const bt = vertex(end, topZ);
    indices.push(ab, bb, bt, ab, bt, at);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

type Point = { x: number; y: number };

function addBoundaryEdge(
  edges: Map<string, { count: number; start: Point; end: Point }>,
  start: Point,
  end: Point,
) {
  const startKey = pointKey(start);
  const endKey = pointKey(end);
  const key = startKey < endKey ? `${startKey}|${endKey}` : `${endKey}|${startKey}`;
  const current = edges.get(key);
  if (current) current.count += 1;
  else edges.set(key, { count: 1, start, end });
}

function pointKey(point: Point): string {
  return `${point.x.toFixed(4)},${point.y.toFixed(4)}`;
}

function cross2(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function addFlourish(
  group: THREE.Group,
  centerX: number,
  centerY: number,
  z: number,
  relief: number,
  scale: number,
) {
  const makeCurve = (direction: -1 | 1) =>
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(centerX + direction * 3 * scale, centerY, z + relief / 2),
      new THREE.Vector3(centerX + direction * 10 * scale, centerY + 2 * scale, z + relief / 2),
      new THREE.Vector3(centerX + direction * 17 * scale, centerY, z + relief / 2),
      new THREE.Vector3(centerX + direction * 20.5 * scale, centerY + 3 * scale, z + relief / 2),
      new THREE.Vector3(centerX + direction * 18.5 * scale, centerY + 5.5 * scale, z + relief / 2),
    ]);
  group.add(
    new THREE.Mesh(new THREE.TubeGeometry(makeCurve(-1), 28, 0.65 * scale, 8, false)),
    new THREE.Mesh(new THREE.TubeGeometry(makeCurve(1), 28, 0.65 * scale, 8, false)),
  );
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

function finalize(
  parts: OrnamentPart[],
  name: string,
  decorationHandles: NonNullable<GeneratedModel['metadata']>['mountingHoles'],
): GeneratedModel {
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
      mountingHoles: decorationHandles,
      warnings: [
        'El archivo ZIP contiene una pieza STL por color para conservar la composición multicolor.',
        'Los aros turquesa del visor son controles: arrástralos para mover los adornos; no aparecen en la descarga.',
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
