export type ProductType = 'urn' | 'clicker';

export type ParamKind = 'number' | 'boolean' | 'select';

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

export type ParamDefinition =
  | NumberParamDefinition
  | BooleanParamDefinition
  | SelectParamDefinition;

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
