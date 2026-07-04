import type { ProductDefinition, ProductParams, ProductType } from '../types';
import {
  CLICKER_ACCENT_COLOR,
  DEFAULT_COLOR,
  KEYCHAINS_ACCENT_COLOR,
  TEXTURES_ACCENT_COLOR,
  URN_ACCENT_COLOR,
} from '../config/constants';

export const products: ProductDefinition[] = [
  {
    type: 'urn',
    name: 'Urns',
    description: 'Urn transform settings from the STP urn workflow.',
    accent: URN_ACCENT_COLOR,
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
        defaultValue: DEFAULT_COLOR,
      },
      {
        kind: 'color',
        key: 'lid_color',
        label: 'Lid color',
        defaultValue: DEFAULT_COLOR,
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
    accent: CLICKER_ACCENT_COLOR,
    params: [
      {
        kind: 'number',
        key: 'cut_height_mm',
        label: 'Cut height',
        unit: 'mm',
        min: 0,
        max: 1,
        step: 0.1,
        defaultValue: 0,
      },
      {
        kind: 'number',
        key: 'base_protrusion_mm',
        label: 'Base protrusion',
        unit: 'mm',
        min: -10,
        max: 10,
        step: 0.1,
        defaultValue: -2,
      },
      {
        kind: 'color',
        key: 'bottom_color',
        label: 'Bottom color',
        defaultValue: DEFAULT_COLOR,
      },
      {
        kind: 'color',
        key: 'top_color',
        label: 'Top color',
        defaultValue: DEFAULT_COLOR,
      },
      {
        kind: 'boolean',
        key: 'keychain_hole',
        label: 'Keychain hole',
        defaultValue: false,
      },
      {
        kind: 'select',
        key: 'keychain_hole_placement',
        label: 'Keychain placement',
        defaultValue: 'bottom',
        options: [
          { label: 'Bottom base', value: 'bottom' },
          { label: 'Top object', value: 'top' },
        ],
      },
      {
        kind: 'number',
        key: 'keychain_hole_angle_deg',
        label: 'Hole position',
        unit: 'deg',
        min: 0,
        max: 360,
        step: 1,
        defaultValue: 0,
      },
      {
        kind: 'number',
        key: 'keychain_hole_inset_mm',
        label: 'Move toward origin',
        unit: 'mm',
        min: 0,
        max: 24,
        step: 0.5,
        defaultValue: 0,
      },
    ],
  },
  {
    type: 'textures',
    name: 'Textures',
    description: 'Raised printable surface patterns from the generic transform flow.',
    accent: TEXTURES_ACCENT_COLOR,
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
  {
    type: 'keychains',
    name: 'Keychains',
    description: 'Standalone keychain tools coming soon.',
    accent: KEYCHAINS_ACCENT_COLOR,
    params: [],
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
