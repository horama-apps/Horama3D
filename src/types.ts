export type ProductType =
  | 'lamp'
  | 'urn'
  | 'clicker'
  | 'head_keychains'
  | 'textures'
  | 'keychains'
  | 'image_layers'
  | 'signs'
  | 'pet_keychains'
  | 'bracelet_gems';

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

export interface ModelObjectBounds extends ModelBounds {
  name: string;
}

export interface GeneratedModel {
  source: 'empty' | 'upload' | 'local';
  name?: string;
  modelUrl?: string;
  downloadUrl?: string;
  previewFiles?: PreviewFile[];
  blob?: Blob;
  format: 'stl' | '3mf' | 'glb';
  metadata?: {
    objects?: string[];
    lamp?: LampTransformInfo;
    urn?: UrnTransformInfo;
    clicker?: ClickerTransformInfo;
    headKeychain?: HeadKeychainTransformInfo;
    imageLayers?: ImageLayersTransformInfo;
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
  color?: string;
}

export interface LampTransformInfo {
  applied_scale?: number;
  minimum_xy_mm?: number[];
  attachment_center_xy_mm?: number[];
  attachment_clearance_mm?: number;
  effective_wall_thickness_mm?: number;
  estimated_capacity_ml?: number;
}

export interface UrnTransformInfo {
  size?: string;
  target_capacity_ml?: number;
  initial_capacity_ml?: number;
  estimated_capacity_ml?: number;
  requested_scale?: number;
  applied_scale?: number;
  pressure_rib_count?: number;
}

export interface ClickerTransformInfo {
  applied_scale?: number;
  cut_height_mm?: number;
}

export interface HeadKeychainTransformInfo {
  applied_scale?: number;
  cut_height_mm?: number;
}

export interface ImageLayersTransformInfo {
  original_width_px?: number;
  original_height_px?: number;
  processed_width_px?: number;
  processed_height_px?: number;
  width_mm?: number;
  height_mm?: number;
  layer_height_mm?: number;
  color_count?: number;
  layer_count?: number;
  colors?: string[];
}
