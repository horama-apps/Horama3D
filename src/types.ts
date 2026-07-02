export type ProductType = 'urn' | 'clicker' | 'textures';

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
  options: Array<{ label: string; value: string }>;
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

export interface GeneratedModel {
  source: 'empty' | 'api' | 'upload';
  name?: string;
  modelUrl?: string;
  downloadUrl?: string;
  blob?: Blob;
  format: 'stl' | '3mf' | 'glb';
}
