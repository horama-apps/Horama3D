import type { GeneratedModel, ProductParams, ProductType } from '../types';

const apiBaseUrl = import.meta.env.VITE_STP_API_BASE_URL as string | undefined;

interface ApiGenerateResponse {
  modelUrl?: string;
  downloadUrl?: string;
  filename?: string;
  format?: GeneratedModel['format'];
}

interface ApiAnalyzeResponse {
  success?: boolean;
  valid?: boolean;
  isValid?: boolean;
  correct?: boolean;
  isCorrect?: boolean;
  status?: string;
  message?: string;
  properties?: {
    is_valid_scenario?: boolean;
    validation_issues?: string[];
  };
}

export interface AnalyzeModelResult {
  isValid: boolean;
  message?: string;
}

export async function analyzeModel(file: File): Promise<AnalyzeModelResult> {
  const body = new FormData();
  body.append('file', file, file.name);

  const response = await postAnalyzeModel(body);

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    return { isValid: true };
  }

  const payload = (await response.json()) as ApiAnalyzeResponse;
  return {
    isValid: isAnalyzePayloadValid(payload),
    message: payload.message ?? payload.properties?.validation_issues?.join(', '),
  };
}

export async function generateModel(
  productType: ProductType,
  params: ProductParams,
  file?: File,
): Promise<GeneratedModel> {
  if (productType === 'textures') {
    if (!file) throw new Error('Load a valid STL before applying textures.');
    return generateTextureModel(file, params);
  }

  if (!apiBaseUrl) {
    await sleep(350);
    return { source: 'empty', format: 'stl' };
  }

  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productType, params }),
  });

  if (!response.ok) {
    throw new Error(`STP API returned ${response.status}`);
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as ApiGenerateResponse;
    return {
      source: 'api',
      modelUrl: payload.modelUrl,
      downloadUrl: payload.downloadUrl,
      format: payload.format ?? inferFormat(payload.modelUrl ?? payload.downloadUrl),
    };
  }

  const blob = await response.blob();
  return {
    source: 'api',
    blob,
    downloadUrl: URL.createObjectURL(blob),
    format: inferFormatFromContentType(contentType),
  };
}

async function generateTextureModel(file: File, params: ProductParams): Promise<GeneratedModel> {
  const body = new FormData();
  body.append('file', file, file.name);
  appendDefined(body, 'texture', params.texture);
  appendDefined(body, 'texture_depth_mm', params.texture_depth_mm);
  appendDefined(body, 'texture_spacing_mm', params.texture_spacing_mm);
  body.append('lid_type', 'none');
  body.append('output_format', 'stl_combined');

  const response = await postTextureTransform(body);

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as ApiGenerateResponse;
    const downloadUrl = payload.downloadUrl ?? buildDownloadUrl(payload.filename);
    return {
      source: 'api',
      modelUrl: payload.modelUrl ?? downloadUrl,
      downloadUrl,
      format: payload.format ?? inferFormat(payload.modelUrl ?? downloadUrl ?? payload.filename),
    };
  }

  const blob = await response.blob();
  return {
    source: 'api',
    blob,
    downloadUrl: URL.createObjectURL(blob),
    format: inferFormatFromContentType(contentType),
  };
}

async function postTextureTransform(body: FormData): Promise<Response> {
  const response = await fetch(getApiUrl('/transforms/generic'), {
    method: 'POST',
    body,
  });

  if (response.status !== 404 && response.status !== 405) return response;

  return fetch(getApiUrl('/transform'), {
    method: 'POST',
    body,
  });
}

async function postAnalyzeModel(body: FormData): Promise<Response> {
  const response = await fetch(getApiUrl('/models/analyze'), {
    method: 'POST',
    body,
  });

  if (response.status !== 404 && response.status !== 405) return response;

  return fetch(getApiUrl('/analyze'), {
    method: 'POST',
    body,
  });
}

function inferFormat(url?: string): GeneratedModel['format'] {
  if (!url) return 'stl';
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.3mf')) return '3mf';
  if (clean.endsWith('.glb')) return 'glb';
  return 'stl';
}

function inferFormatFromContentType(contentType: string): GeneratedModel['format'] {
  if (contentType.includes('model/gltf-binary')) return 'glb';
  if (contentType.includes('3mf')) return '3mf';
  return 'stl';
}

function appendDefined(body: FormData, key: string, value: ProductParams[string] | undefined) {
  if (value === undefined || value === '') return;
  body.append(key, String(value));
}

function buildDownloadUrl(filename?: string): string | undefined {
  if (!filename) return undefined;
  const cleanFilename = filename.split('/').pop();
  return cleanFilename ? getApiUrl(`/download/${encodeURIComponent(cleanFilename)}`) : undefined;
}

function getApiUrl(path: string): string {
  return apiBaseUrl ? `${apiBaseUrl.replace(/\/$/, '')}${path}` : path;
}

async function getApiErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as { detail?: string; message?: string };
    return payload.detail ?? payload.message ?? `STP API returned ${response.status}`;
  }

  const text = await response.text();
  return text || `STP API returned ${response.status}`;
}

function isAnalyzePayloadValid(payload: ApiAnalyzeResponse): boolean {
  if (typeof payload.properties?.is_valid_scenario === 'boolean') {
    return payload.properties.is_valid_scenario;
  }
  if (typeof payload.success === 'boolean') return payload.success;
  if (typeof payload.valid === 'boolean') return payload.valid;
  if (typeof payload.isValid === 'boolean') return payload.isValid;
  if (typeof payload.correct === 'boolean') return payload.correct;
  if (typeof payload.isCorrect === 'boolean') return payload.isCorrect;

  const normalizedStatus = payload.status?.toLowerCase();
  return ['valid', 'correct', 'ok', 'success', 'approved'].includes(normalizedStatus ?? '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
