import type { GeneratedModel, LampTransformInfo, ProductParams } from '../types';
import { analyzeStlLocally, type AnalyzeModelResult } from './stlValidation';

interface LampWorkerResponse {
  id: number;
  body?: ArrayBuffer;
  base?: ArrayBuffer;
  metadata?: LampTransformInfo;
  warnings?: string[];
  error?: string;
}

let requestId = 0;

export async function analyzeLampModelLocally(file: File): Promise<AnalyzeModelResult> {
  return analyzeStlLocally(file);
}

export async function generateLampModelLocally(
  file: File,
  params: ProductParams,
): Promise<GeneratedModel> {
  const worker = new Worker(new URL('./lamp.worker.ts', import.meta.url), {
    type: 'module',
  });
  const id = ++requestId;
  const input = await file.arrayBuffer();
  const baseUrl = import.meta.env.BASE_URL;

  try {
    const response = await new Promise<LampWorkerResponse>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('Local lamp generation exceeded the five-minute safety limit.'));
      }, 300_000);
      worker.onmessage = (event: MessageEvent<LampWorkerResponse>) => {
        if (event.data.id !== id) return;
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'The local geometry worker stopped unexpectedly.'));
      };
      worker.postMessage({
        id,
        input,
        topUrl: `${baseUrl}lamp-assets/top-lamp.stl`,
        baseUrl: `${baseUrl}lamp-assets/base-lamp.stl`,
        params: {
          baseThicknessMm: boundedNumber(params.base_thickness_mm, 1, 20, 3),
          innerScale: boundedNumber(params.inner_scale, 0.05, 0.98, 0.7),
          planarCutMm: boundedNumber(params.planar_cut_base_mm, 0, 100, 8),
          connectorMarginMm: boundedNumber(params.connector_margin_mm, 0, 20, 2),
          partGapMm: boundedNumber(params.part_gap_mm, 0, 100, 8),
          fitClearanceMm: boundedNumber(params.fit_clearance_mm, 0.2, 2.5, 0.9),
        },
      }, [input]);
    });

    if (response.error) throw new Error(response.error);
    if (!response.body || !response.base || !response.metadata) {
      throw new Error('The local lamp worker returned an incomplete result.');
    }

    const bodyUrl = URL.createObjectURL(new Blob([response.body], { type: 'model/stl' }));
    const basePartUrl = URL.createObjectURL(new Blob([response.base], { type: 'model/stl' }));
    const name = file.name.replace(/\.stl$/i, '') || 'lamp';
    return {
      source: 'local',
      name: `${name}-lamp.stl`,
      modelUrl: bodyUrl,
      downloadUrl: bodyUrl,
      previewFiles: [
        { role: 'body', object: 'body', filename: 'body.stl', url: bodyUrl, format: 'stl' },
        { role: 'lid', object: 'base', filename: 'base.stl', url: basePartUrl, format: 'stl' },
      ],
      format: 'stl',
      metadata: {
        objects: ['body', 'base'],
        lamp: response.metadata,
        warnings: response.warnings ?? [],
      },
    };
  } finally {
    worker.terminate();
  }
}

function boundedNumber(
  value: ProductParams[string] | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(minimum, Math.min(maximum, numeric))
    : fallback;
}
