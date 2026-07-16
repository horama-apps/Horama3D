export type ProductType =
  | 'urn'
  | 'clicker'
  | 'textures'
  | 'keychains'
  | 'image_layers'
  | 'signs';

export type ParamKind = 'number' | 'boolean' | 'select' | 'text' | 'color';

export interface BaseParamDefinition {
  key: string;
  label: string;
  unit?: string;
  help?: string;
}

export interface NumberParamDefinition extends BaseParamDefinition {
  kind: 'number';
  min: number;
  max: number;
  step: number;
  defaultValue: number;
}

export interface BooleanParamDefinition extends BaseParamDefinition {
  kind: 'boolean';
  defaultValue: boolean;
}

export interface SelectParamDefinition extends BaseParamDefinition {
  kind: 'select';
  defaultValue: string;
  options: Array<{
    label: string;
    value: string;
    preview?: string;
    previewAlt?: string;
    fontFamily?: string;
  }>;
}

export interface TextParamDefinition extends BaseParamDefinition {
  kind: 'text';
  defaultValue: string;
  multiline?: boolean;
  placeholder?: string;
}

export interface ColorParamDefinition extends BaseParamDefinition {
  kind: 'color';
  defaultValue: string;
}

export type ParamDefinition =
  | NumberParamDefinition
  | BooleanParamDefinition
  | SelectParamDefinition
  | TextParamDefinition
  | ColorParamDefinition;

export type ProductParams = Record<string, number | boolean | string>;

export interface ProductDefinition {
  type: ProductType;
  name: string;
  description: string;
  accent: string;
  params: ParamDefinition[];
}

export interface ModelBounds {
  width: number;
  depth: number;
  height: number;
}

export interface GeneratedModel {
  source: 'empty' | 'api' | 'upload' | 'local';
  name?: string;
  modelUrl?: string;
  downloadUrl?: string;
  previewFiles?: PreviewFile[];
  blob?: Blob;
  format: 'stl' | '3mf' | 'glb';
  metadata?: {
    objects?: string[];
    urn?: UrnTransformInfo;
    clicker?: ClickerTransformInfo;
    mountingHoles?: Array<{
      key: string;
      x: number;
      y: number;
      radius: number;
      depth: number;
      bounds: {
        minX: number;
        maxX: number;
        minY: number;
        maxY: number;
      };
    }>;
    warnings?: string[];
  };
}

export interface PreviewFile {
  role: 'body' | 'lid' | 'text' | 'detail' | 'support' | 'texture' | string;
  object?: string;
  filename?: string;
  url: string;
  format: 'stl' | '3mf' | 'glb';
}

export interface UrnTransformInfo {
  size?: string;
  target_capacity_ml?: number;
  initial_capacity_ml?: number;
  estimated_capacity_ml?: number;
  requested_scale?: number;
  applied_scale?: number;
}

export interface ClickerTransformInfo {
  cut_height_mm?: number;
}
