import type { GeneratedModel, PreviewFile, ProductParams, ProductType } from '../types';

const apiBaseUrl = import.meta.env.VITE_STP_API_BASE_URL as string | undefined;
const healthCheckPath = import.meta.env.VITE_STP_HEALTH_PATH as string | undefined;
const healthCheckTimeoutMs = 30000;

interface ApiGenerateResponse {
  artifact_id?: string;
  modelUrl?: string;
  downloadUrl?: string;
  download_url?: string;
  filename?: string;
  format?: GeneratedModel['format'];
  output_format?: string;
  preview_files?: unknown;
  objects?: unknown;
  cut_height_mm?: unknown;
  applied_scale?: unknown;
  minimum_xy_mm?: unknown;
  attachment_center_xy_mm?: unknown;
  attachment_clearance_mm?: unknown;
  effective_wall_thickness_mm?: unknown;
  estimated_capacity_ml?: unknown;
  urn?: {
    size?: unknown;
    target_capacity_ml?: unknown;
    initial_capacity_ml?: unknown;
    estimated_capacity_ml?: unknown;
    requested_scale?: unknown;
    applied_scale?: unknown;
    warnings?: unknown;
  };
  warnings?: unknown;
}

interface ApiAnalyzeResponse {
  success?: boolean;
  valid?: boolean;
  isValid?: boolean;
  correct?: boolean;
  isCorrect?: boolean;
  status?: string;
  message?: string;
  warning?: unknown;
  warnings?: unknown;
  properties?: {
    is_valid_scenario?: boolean;
    validation_issues?: unknown;
    validation_warnings?: unknown;
    warnings?: unknown;
  };
}

export interface AnalyzeModelResult {
  isValid: boolean;
  isValidScenario?: boolean;
  issues: string[];
  message?: string;
  warnings: string[];
}

export interface StpHealthStatus {
  isHealthy: boolean;
  message: string;
}

export async function checkStpHealth(): Promise<StpHealthStatus> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), healthCheckTimeoutMs);

  try {
    const response = await fetch(getApiUrl(healthCheckPath ?? '/health'), {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      return { isHealthy: false, message: `STP returned ${response.status}` };
    }

    return { isHealthy: true, message: 'STP healthy' };
  } catch (error) {
    return {
      isHealthy: false,
      message:
        error instanceof DOMException && error.name === 'AbortError'
          ? 'STP timeout'
          : 'No STP connection',
    };
  } finally {
    window.clearTimeout(timeoutId);
  }
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
    return { isValid: true, issues: [], warnings: [] };
  }

  const payload = (await response.json()) as ApiAnalyzeResponse;
  const issues = normalizeMessageList(payload.properties?.validation_issues);
  return {
    isValid: isAnalyzePayloadValid(payload),
    isValidScenario: payload.properties?.is_valid_scenario,
    issues,
    message: payload.message ?? (issues.length > 0 ? issues.join(', ') : undefined),
    warnings: collectAnalyzeWarnings(payload),
  };
}

export async function generateModel(
  productType: ProductType,
  params: ProductParams,
  file?: File,
): Promise<GeneratedModel> {
  if (productType === 'lamp') {
    if (!file) throw new Error('Load a valid STL before generating a lamp.');
    return generateLampModel(file, params);
  }

  if (productType === 'urn') {
    if (!file) throw new Error('Load a valid STL before applying the urn transform.');
    return generateUrnTransformModel(file, params);
  }

  if (productType === 'textures') {
    if (!file) throw new Error('Load a valid STL before applying textures.');
    return generateTextureModel(file, params);
  }

  if (productType === 'clicker') {
    if (!file) throw new Error('Load a valid STL before generating a clicker.');
    return generateClickerModel(file, params);
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
    const downloadUrl = getPayloadDownloadUrl(payload);
    const modelUrl = normalizeApiUrl(payload.modelUrl) ?? downloadUrl;
    return {
      source: 'api',
      name: getDownloadName(payload.filename),
      modelUrl,
      downloadUrl,
      previewFiles: getPayloadPreviewFiles(payload),
      format: getPayloadFormat(payload, modelUrl),
      metadata: {
        objects: normalizeStringList(payload.objects),
        warnings: normalizeMessageList(payload.warnings),
      },
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

async function generateLampModel(file: File, params: ProductParams): Promise<GeneratedModel> {
  const body = new FormData();
  body.append('file', file, file.name);
  appendDefined(body, 'output_format', 'stl');
  appendDefined(body, 'body_color', params.body_color);
  appendDefined(body, 'base_color', params.base_color);
  appendDefined(body, 'base_thickness_mm', params.base_thickness_mm);
  appendDefined(body, 'inner_scale', params.inner_scale);
  appendDefined(body, 'planar_cut_base_mm', params.planar_cut_base_mm);
  appendDefined(body, 'connector_margin_mm', params.connector_margin_mm);
  appendDefined(body, 'part_gap_mm', params.part_gap_mm);

  const response = await fetch(getApiUrl('/transforms/lamps'), {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as ApiGenerateResponse;
    const downloadUrl = getPayloadDownloadUrl(payload);
    const modelUrl = normalizeApiUrl(payload.modelUrl) ?? downloadUrl;
    return {
      source: 'api',
      name: getDownloadName(payload.filename),
      modelUrl,
      downloadUrl,
      previewFiles: getPayloadPreviewFiles(payload),
      format: getPayloadFormat(payload, modelUrl),
      metadata: {
        objects: normalizeStringList(payload.objects),
        lamp: {
          applied_scale: normalizeNumber(payload.applied_scale),
          minimum_xy_mm: normalizeNumberList(payload.minimum_xy_mm),
          attachment_center_xy_mm: normalizeNumberList(payload.attachment_center_xy_mm),
          attachment_clearance_mm: normalizeNumber(payload.attachment_clearance_mm),
          effective_wall_thickness_mm: normalizeNumber(payload.effective_wall_thickness_mm),
          estimated_capacity_ml: normalizeNumber(payload.estimated_capacity_ml),
        },
        warnings: normalizeMessageList(payload.warnings),
      },
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

async function generateClickerModel(file: File, params: ProductParams): Promise<GeneratedModel> {
  const body = new FormData();
  body.append('file', file, file.name);
  appendDefined(body, 'cut_height_mm', params.cut_height_mm);
  appendDefined(body, 'base_protrusion_mm', params.base_protrusion_mm);
  appendDefined(body, 'output_format', 'stl');
  appendDefined(body, 'bottom_color', params.bottom_color);
  appendDefined(body, 'top_color', params.top_color);

  const response = await fetch(getApiUrl('/transforms/clickers'), {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as ApiGenerateResponse;
    const downloadUrl = getPayloadDownloadUrl(payload);
    const modelUrl = normalizeApiUrl(payload.modelUrl) ?? downloadUrl;
    return {
      source: 'api',
      name: getDownloadName(payload.filename),
      modelUrl,
      downloadUrl,
      previewFiles: getPayloadPreviewFiles(payload),
      format: getPayloadFormat(payload, modelUrl),
      metadata: {
        objects: normalizeStringList(payload.objects),
        clicker: {
          cut_height_mm: normalizeNumber(payload.cut_height_mm),
        },
        warnings: normalizeMessageList(payload.warnings),
      },
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

async function generateUrnTransformModel(file: File, params: ProductParams): Promise<GeneratedModel> {
  const body = new FormData();
  body.append('file', file, file.name);
  appendDefined(body, 'size', params.size);
  appendDefined(body, 'lid_text', params.lid_text);
  appendDefined(body, 'output_format', 'stl');

  appendDefined(body, 'base_thickness_mm', params.base_thickness_mm);
  appendDefined(body, 'inner_scale', params.inner_scale);
  appendDefined(body, 'planar_cut_base_mm', params.planar_cut_base_mm);

  const response = await fetch(getApiUrl('/transforms/urns'), {
    method: 'POST',
    body,
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as ApiGenerateResponse;
    const downloadUrl = getPayloadDownloadUrl(payload);
    const modelUrl = normalizeApiUrl(payload.modelUrl) ?? downloadUrl;
    const previewFiles = getPayloadPreviewFiles(payload);
    const warnings = normalizeMessageList([payload.warnings, payload.urn?.warnings]);
    return {
      source: 'api',
      name: getDownloadName(payload.filename),
      modelUrl,
      downloadUrl,
      previewFiles,
      format: getPayloadFormat(payload, modelUrl),
      metadata: {
        objects: normalizeStringList(payload.objects),
        urn: {
          size: typeof payload.urn?.size === 'string' ? payload.urn.size : undefined,
          target_capacity_ml: normalizeNumber(payload.urn?.target_capacity_ml),
          initial_capacity_ml: normalizeNumber(payload.urn?.initial_capacity_ml),
          estimated_capacity_ml: normalizeNumber(payload.urn?.estimated_capacity_ml),
          requested_scale: normalizeNumber(payload.urn?.requested_scale),
          applied_scale: normalizeNumber(payload.urn?.applied_scale),
        },
        warnings,
      },
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
  body.append('output_format', 'stl');

  const response = await postTextureTransform(body);

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response));
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    const payload = (await response.json()) as ApiGenerateResponse;
    const downloadUrl = getPayloadDownloadUrl(payload);
    const modelUrl = normalizeApiUrl(payload.modelUrl) ?? downloadUrl;
    return {
      source: 'api',
      name: getDownloadName(payload.filename),
      modelUrl,
      downloadUrl,
      previewFiles: getPayloadPreviewFiles(payload),
      format: getPayloadFormat(payload, modelUrl),
      metadata: {
        objects: normalizeStringList(payload.objects),
        warnings: normalizeMessageList(payload.warnings),
      },
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
  return cleanFilename ? getApiUrl(`/downloads/${encodeURIComponent(cleanFilename)}`) : undefined;
}

function getDownloadName(filename?: string): string | undefined {
  return filename?.split('/').pop();
}

function getApiUrl(path: string): string {
  return apiBaseUrl ? `${apiBaseUrl.replace(/\/$/, '')}${path}` : path;
}

function getPayloadDownloadUrl(payload: ApiGenerateResponse): string | undefined {
  return (
    normalizeApiUrl(payload.downloadUrl) ??
    normalizeApiUrl(payload.download_url) ??
    buildArtifactDownloadUrl(payload.artifact_id) ??
    buildDownloadUrl(payload.filename)
  );
}

function buildArtifactDownloadUrl(artifactId?: string): string | undefined {
  return artifactId ? getApiUrl(`/downloads/${encodeURIComponent(artifactId)}`) : undefined;
}

function buildArtifactObjectDownloadUrl(artifactId?: string, objectName?: string): string | undefined {
  if (!artifactId || !objectName) return undefined;
  return getApiUrl(`/downloads/${encodeURIComponent(artifactId)}/${encodeURIComponent(objectName)}`);
}

function normalizeApiUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) || value.startsWith('blob:')) return value;
  return getApiUrl(value.startsWith('/') ? value : `/${value}`);
}

function getPayloadFormat(
  payload: ApiGenerateResponse,
  fallbackUrl?: string,
): GeneratedModel['format'] {
  return (
    normalizeFormat(payload.format) ??
    normalizeFormat(payload.output_format) ??
    inferFormat(fallbackUrl ?? payload.filename)
  );
}

function normalizeFormat(value?: string): GeneratedModel['format'] | undefined {
  const normalized = value?.toLowerCase().replace(/^[.]/, '').replace('-', '_');
  if (normalized === '3mf') return '3mf';
  if (normalized === 'glb') return 'glb';
  if (normalized === 'stl' || normalized === 'stl_combined') return 'stl';
  return undefined;
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
  return payload.success === true && payload.properties?.is_valid_scenario === true;
}

function collectAnalyzeWarnings(payload: ApiAnalyzeResponse): string[] {
  return [
    ...normalizeMessageList(payload.warnings),
    ...normalizeMessageList(payload.warning),
    ...normalizeMessageList(payload.properties?.validation_warnings),
    ...normalizeMessageList(payload.properties?.warnings),
  ];
}

function normalizeMessageList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeMessageList);
  if (typeof value === 'string') return value.trim() ? [value] : [];
  if (typeof value === 'object') {
    const record = value as { message?: unknown; detail?: unknown; warning?: unknown };
    return normalizeMessageList(record.message ?? record.detail ?? record.warning);
  }

  return [String(value)];
}

function normalizeStringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
  return items.length > 0 ? items : undefined;
}

function normalizeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return undefined;
}

function normalizeNumberList(value: unknown): number[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.filter(
    (item): item is number => typeof item === 'number' && Number.isFinite(item),
  );
  return values.length > 0 ? values : undefined;
}

function getPayloadPreviewFiles(payload: ApiGenerateResponse): GeneratedModel['previewFiles'] {
  return (
    normalizePreviewFiles(payload.preview_files, payload.artifact_id) ??
    normalizeObjectPreviewFiles(payload.objects, payload.artifact_id)
  );
}

function normalizePreviewFiles(value: unknown, artifactId?: string): GeneratedModel['previewFiles'] {
  if (!Array.isArray(value)) return undefined;

  const previewFiles = value.flatMap((item): PreviewFile[] => {
    if (!item || typeof item !== 'object') return [];
    const record = item as {
      role?: unknown;
      object?: unknown;
      filename?: unknown;
      url?: unknown;
      download_url?: unknown;
      downloadUrl?: unknown;
    };
    const objectName = normalizeObjectName(record.object);
    const url =
      normalizeApiUrl(normalizeFilename(record.url)) ??
      normalizeApiUrl(normalizeFilename(record.downloadUrl)) ??
      normalizeApiUrl(normalizeFilename(record.download_url)) ??
      buildArtifactObjectDownloadUrl(artifactId, objectName) ??
      buildDownloadUrl(normalizeFilename(record.filename));
    if (!url) return [];

    return [
      {
        role: typeof record.role === 'string' && record.role.trim() ? record.role : 'body',
        object: objectName,
        filename: normalizeFilename(record.filename),
        url,
        format: inferFormat(url),
      },
    ];
  });

  return previewFiles.length > 0 ? previewFiles : undefined;
}

function normalizeObjectPreviewFiles(value: unknown, artifactId?: string): GeneratedModel['previewFiles'] {
  if (!Array.isArray(value)) return undefined;

  const previewFiles = value.flatMap((item): PreviewFile[] => {
    if (typeof item === 'string') {
      const objectName = normalizeObjectName(item);
      const url = buildArtifactObjectDownloadUrl(artifactId, objectName);
      return url ? [{ role: getPreviewRoleForObject(objectName), object: objectName, url, format: 'stl' }] : [];
    }

    if (!item || typeof item !== 'object') return [];
    const record = item as {
      role?: unknown;
      name?: unknown;
      object?: unknown;
      filename?: unknown;
      url?: unknown;
      download_url?: unknown;
      downloadUrl?: unknown;
    };
    const objectName = normalizeObjectName(record.object) ?? normalizeObjectName(record.name);
    const url =
      normalizeApiUrl(normalizeFilename(record.url)) ??
      normalizeApiUrl(normalizeFilename(record.downloadUrl)) ??
      normalizeApiUrl(normalizeFilename(record.download_url)) ??
      buildArtifactObjectDownloadUrl(artifactId, objectName) ??
      buildDownloadUrl(normalizeFilename(record.filename));
    if (!url) return [];

    return [
      {
        role: typeof record.role === 'string' && record.role.trim() ? record.role : getPreviewRoleForObject(objectName),
        object: objectName,
        filename: normalizeFilename(record.filename),
        url,
        format: inferFormat(url),
      },
    ];
  });

  return previewFiles.length > 0 ? previewFiles : undefined;
}

function normalizeFilename(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function normalizeObjectName(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getPreviewRoleForObject(objectName?: string): string {
  if (objectName === 'top' || objectName === 'lid') return 'lid';
  if (objectName === 'text') return 'text';
  return 'body';
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
