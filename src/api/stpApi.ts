import type { GeneratedModel, ProductParams, ProductType } from '../types';

const apiBaseUrl = import.meta.env.VITE_STP_API_BASE_URL as string | undefined;

interface ApiGenerateResponse {
  modelUrl?: string;
  downloadUrl?: string;
  format?: GeneratedModel['format'];
}

export async function generateModel(
  productType: ProductType,
  params: ProductParams,
): Promise<GeneratedModel> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
