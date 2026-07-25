import * as THREE from 'three';
import { SVGLoader } from 'three/addons/loaders/SVGLoader.js';

export type ReusableShapeId =
  | 'bone'
  | 'fish'
  | 'cat'
  | 'dog'
  | 'paw'
  | 'heart'
  | 'round-tag'
  | 'pet-house'
  | 'rabbit'
  | 'bird'
  | 'turtle'
  | 'hamster'
  | 'butterfly'
  | 'flower'
  | 'gamepad'
  | 'smiley'
  | 'star'
  | 'moon'
  | 'sun'
  | 'cloud'
  | 'lightning'
  | 'crown'
  | 'music-note'
  | 'bow'
  | 'skull'
  | 'rocket'
  | 'diamond'
  | 'clover';

export type ReusableShapeCategory =
  | 'pet'
  | 'nature'
  | 'emoji'
  | 'gaming'
  | 'general';

export interface ReusableShapeDefinition {
  id: ReusableShapeId;
  label: string;
  filename: string;
  categories: ReusableShapeCategory[];
}

const publicAsset = (path: string) =>
  `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;

export const reusableShapes: ReusableShapeDefinition[] = [
  { id: 'bone', label: 'Bone', filename: 'bone.svg', categories: ['pet'] },
  { id: 'fish', label: 'Fish', filename: 'fish.svg', categories: ['pet'] },
  { id: 'cat', label: 'Cat', filename: 'cat.svg', categories: ['pet'] },
  { id: 'dog', label: 'Dog', filename: 'dog.svg', categories: ['pet'] },
  { id: 'paw', label: 'Paw', filename: 'paw.svg', categories: ['pet', 'emoji', 'general'] },
  { id: 'heart', label: 'Heart', filename: 'heart.svg', categories: ['pet', 'emoji', 'general'] },
  { id: 'round-tag', label: 'Round tag', filename: 'round-tag.svg', categories: ['pet', 'general'] },
  { id: 'pet-house', label: 'Pet house', filename: 'pet-house.svg', categories: ['pet'] },
  { id: 'rabbit', label: 'Rabbit', filename: 'rabbit.svg', categories: ['pet'] },
  { id: 'bird', label: 'Bird', filename: 'bird.svg', categories: ['pet', 'nature'] },
  { id: 'turtle', label: 'Turtle', filename: 'turtle.svg', categories: ['pet', 'nature'] },
  { id: 'hamster', label: 'Hamster', filename: 'hamster.svg', categories: ['pet'] },
  { id: 'butterfly', label: 'Butterfly', filename: 'butterfly.svg', categories: ['nature', 'general'] },
  { id: 'flower', label: 'Flower', filename: 'flower.svg', categories: ['nature', 'general'] },
  { id: 'gamepad', label: 'Game controller', filename: 'gamepad.svg', categories: ['gaming', 'general'] },
  { id: 'smiley', label: 'Smiley', filename: 'smiley.svg', categories: ['emoji', 'general'] },
  { id: 'star', label: 'Star', filename: 'star.svg', categories: ['emoji', 'general'] },
  { id: 'moon', label: 'Moon', filename: 'moon.svg', categories: ['nature', 'emoji', 'general'] },
  { id: 'sun', label: 'Sun', filename: 'sun.svg', categories: ['nature', 'emoji', 'general'] },
  { id: 'cloud', label: 'Cloud', filename: 'cloud.svg', categories: ['nature', 'emoji', 'general'] },
  { id: 'lightning', label: 'Lightning', filename: 'lightning.svg', categories: ['nature', 'emoji', 'general'] },
  { id: 'crown', label: 'Crown', filename: 'crown.svg', categories: ['emoji', 'general'] },
  { id: 'music-note', label: 'Music note', filename: 'music-note.svg', categories: ['general'] },
  { id: 'bow', label: 'Bow', filename: 'bow.svg', categories: ['general'] },
  { id: 'skull', label: 'Skull', filename: 'skull.svg', categories: ['emoji', 'general'] },
  { id: 'rocket', label: 'Rocket', filename: 'rocket.svg', categories: ['emoji', 'general'] },
  { id: 'diamond', label: 'Diamond', filename: 'diamond.svg', categories: ['emoji', 'general'] },
  { id: 'clover', label: 'Clover', filename: 'clover.svg', categories: ['nature', 'emoji', 'general'] },
];

export const petKeychainShapeOptions = [
  shapeOption('bone', 'bone'),
  shapeOption('fish', 'fish'),
  shapeOption('cat', 'cat'),
  shapeOption('dog', 'dog'),
  shapeOption('paw', 'paw'),
  shapeOption('heart', 'heart'),
  shapeOption('round', 'round-tag'),
  shapeOption('house', 'pet-house'),
  shapeOption('rabbit', 'rabbit'),
  shapeOption('bird', 'bird'),
  shapeOption('turtle', 'turtle'),
  shapeOption('hamster', 'hamster'),
];

export const braceletCharmOptions = [
  shapeOption('butterfly', 'butterfly'),
  shapeOption('flower', 'flower'),
  shapeOption('gamepad', 'gamepad'),
  shapeOption('smiley', 'smiley'),
  shapeOption('heart', 'heart'),
  shapeOption('star', 'star'),
  shapeOption('paw', 'paw'),
  shapeOption('moon', 'moon'),
  shapeOption('sun', 'sun'),
  shapeOption('cloud', 'cloud'),
  shapeOption('lightning', 'lightning'),
  shapeOption('crown', 'crown'),
  shapeOption('music_note', 'music-note'),
  shapeOption('bow', 'bow'),
  shapeOption('skull', 'skull'),
  shapeOption('rocket', 'rocket'),
  shapeOption('diamond', 'diamond'),
  shapeOption('clover', 'clover'),
  shapeOption('cat', 'cat'),
  shapeOption('dog', 'dog'),
];

export const petShapeAssetByValue = Object.fromEntries(
  petKeychainShapeOptions.map((option) => [option.value, option.assetId]),
) as Record<string, ReusableShapeId>;

export const braceletCharmAssetByValue = Object.fromEntries(
  braceletCharmOptions.map((option) => [option.value, option.assetId]),
) as Record<string, ReusableShapeId>;

const shapeCache = new Map<ReusableShapeId, Promise<THREE.Shape[]>>();

export async function loadReusableShape(
  id: ReusableShapeId,
): Promise<THREE.Shape[]> {
  const cached = shapeCache.get(id);
  if (cached) return cached.then(cloneShapes);

  const definition = getReusableShape(id);
  const request = new SVGLoader()
    .loadAsync(getReusableShapeUrl(definition))
    .then((data) => {
      const shapes = data.paths.flatMap((path) => SVGLoader.createShapes(path));
      if (shapes.length === 0) {
        throw new Error(`El SVG “${definition.filename}” no contiene una silueta rellena.`);
      }
      return shapes;
    })
    .catch(() => {
      throw new Error(`No se pudo cargar la figura SVG “${definition.filename}”.`);
    });
  shapeCache.set(id, request);
  return request.then(cloneShapes);
}

export function getReusableShapeUrl(
  definitionOrId: ReusableShapeDefinition | ReusableShapeId,
): string {
  const definition =
    typeof definitionOrId === 'string'
      ? getReusableShape(definitionOrId)
      : definitionOrId;
  return publicAsset(`shape-assets/${definition.filename}`);
}

function shapeOption(value: string, assetId: ReusableShapeId) {
  const definition = getReusableShape(assetId);
  return {
    label: definition.label,
    value,
    assetId,
    preview: getReusableShapeUrl(definition),
    previewAlt: definition.label,
  };
}

function getReusableShape(id: ReusableShapeId): ReusableShapeDefinition {
  const definition = reusableShapes.find((shape) => shape.id === id);
  if (!definition) throw new Error(`Unknown reusable shape: ${id}`);
  return definition;
}

function cloneShapes(shapes: THREE.Shape[]) {
  return shapes.map((shape) => shape.clone());
}
