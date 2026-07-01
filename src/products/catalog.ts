import type { ProductDefinition, ProductParams, ProductType } from '../types';

export const products: ProductDefinition[] = [
  {
    type: 'urn',
    name: 'Urns',
    description: 'Vessel proportions, lid fit, wall thickness, and decorative bands.',
    accent: '#2f8f83',
    params: [
      {
        kind: 'number',
        key: 'heightMm',
        label: 'Height',
        unit: 'mm',
        min: 90,
        max: 320,
        step: 5,
        defaultValue: 180,
      },
      {
        kind: 'number',
        key: 'diameterMm',
        label: 'Diameter',
        unit: 'mm',
        min: 55,
        max: 180,
        step: 5,
        defaultValue: 95,
      },
      {
        kind: 'number',
        key: 'wallMm',
        label: 'Wall',
        unit: 'mm',
        min: 1.2,
        max: 5,
        step: 0.2,
        defaultValue: 2.4,
      },
      {
        kind: 'select',
        key: 'profile',
        label: 'Profile',
        defaultValue: 'soft-shoulder',
        options: [
          { label: 'Soft shoulder', value: 'soft-shoulder' },
          { label: 'Straight', value: 'straight' },
          { label: 'Tapered', value: 'tapered' },
        ],
      },
      {
        kind: 'boolean',
        key: 'decorativeBand',
        label: 'Decorative band',
        defaultValue: true,
      },
    ],
  },
  {
    type: 'clicker',
    name: 'Clickers',
    description: 'Button body, cap size, switch clearance, and keychain options.',
    accent: '#b6682f',
    params: [
      {
        kind: 'number',
        key: 'capWidthMm',
        label: 'Cap width',
        unit: 'mm',
        min: 24,
        max: 60,
        step: 1,
        defaultValue: 35,
      },
      {
        kind: 'number',
        key: 'topThicknessMm',
        label: 'Top thickness',
        unit: 'mm',
        min: 0.8,
        max: 4,
        step: 0.1,
        defaultValue: 1.5,
      },
      {
        kind: 'number',
        key: 'clearanceMm',
        label: 'Switch clearance',
        unit: 'mm',
        min: 0.1,
        max: 1.2,
        step: 0.1,
        defaultValue: 0.4,
      },
      {
        kind: 'select',
        key: 'baseShape',
        label: 'Base shape',
        defaultValue: 'rounded-square',
        options: [
          { label: 'Rounded square', value: 'rounded-square' },
          { label: 'Circle', value: 'circle' },
          { label: 'Outline', value: 'outline' },
        ],
      },
      {
        kind: 'boolean',
        key: 'keychain',
        label: 'Keychain loop',
        defaultValue: false,
      },
    ],
  },
];

export function getProduct(type: ProductType): ProductDefinition {
  const product = products.find((item) => item.type === type);
  if (!product) throw new Error(`Unknown product type: ${type}`);
  return product;
}

export function getDefaultParams(product: ProductDefinition): ProductParams {
  return Object.fromEntries(
    product.params.map((param) => [param.key, param.defaultValue]),
  );
}
