import type { ProductDefinition, ProductParams, ProductType } from '../types';

export const products: ProductDefinition[] = [
  {
    type: 'urn',
    name: 'Urns',
    description: 'Urn transform settings from the STP urn workflow.',
    accent: '#2f8f83',
    params: [
      {
        kind: 'select',
        key: 'size',
        label: 'Size',
        defaultValue: 's',
        options: [
          { label: 'Small - 250 ml', value: 's' },
          { label: 'Medium - 500 ml', value: 'm' },
          { label: 'Large - 1000 ml', value: 'l' },
          { label: 'XL - 2000 ml', value: 'xl' },
        ],
      },
      {
        kind: 'text',
        key: 'lid_text',
        label: 'Lid text',
        defaultValue: '',
        multiline: true,
        placeholder: 'add your lid text here',
      },
      {
        kind: 'color',
        key: 'body_color',
        label: 'Body color',
        defaultValue: '#FFFFFF',
      },
      {
        kind: 'color',
        key: 'lid_color',
        label: 'Lid color',
        defaultValue: '#FFFFFF',
      },
      {
        kind: 'color',
        key: 'text_color',
        label: 'Text color',
        defaultValue: '#232629',
      },
      {
        kind: 'number',
        key: 'base_thickness_mm',
        label: 'Base thickness',
        unit: 'mm',
        min: 1,
        max: 12,
        step: 0.5,
        defaultValue: 5,
      },
      {
        kind: 'number',
        key: 'inner_scale',
        label: 'Inner scale',
        min: 0.4,
        max: 0.95,
        step: 0.05,
        defaultValue: 0.7,
      },
      {
        kind: 'number',
        key: 'planar_cut_base_mm',
        label: 'Base cut',
        unit: 'mm',
        min: 0,
        max: 30,
        step: 0.5,
        defaultValue: 8,
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
  {
    type: 'textures',
    name: 'Textures',
    description: 'Raised printable surface patterns from the generic transform flow.',
    accent: '#6f6ad8',
    params: [
      {
        kind: 'select',
        key: 'texture',
        label: 'Texture',
        defaultValue: 'woven',
        options: [
          { label: 'Woven', value: 'woven' },
          { label: 'Knit', value: 'knit' },
          { label: 'Carbon', value: 'carbon' },
          { label: 'Wood', value: 'wood' },
          { label: 'None', value: 'none' },
        ],
      },
      {
        kind: 'number',
        key: 'texture_depth_mm',
        label: 'Relief depth',
        unit: 'mm',
        min: 0.1,
        max: 1.2,
        step: 0.05,
        defaultValue: 0.45,
      },
      {
        kind: 'number',
        key: 'texture_spacing_mm',
        label: 'Pattern spacing',
        unit: 'mm',
        min: 1,
        max: 8,
        step: 0.25,
        defaultValue: 3,
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
