import type { GeneratedModel, ProductParams } from '../types';

interface ClickerWorkerResponse {
  id: number;
  bottom?: ArrayBuffer;
  top?: ArrayBuffer;
  cutHeightMm?: number;
  warnings?: string[];
  error?: string;
}

let requestId = 0;

export async function generateClickerModelLocally(
  file: File,
  params: ProductParams,
): Promise<GeneratedModel> {
  const worker = new Worker(new URL('./clicker.worker.ts', import.meta.url), {
    type: 'module',
  });
  const id = ++requestId;
  const input = await file.arrayBuffer();
  const baseUrl = import.meta.env.BASE_URL;

  try {
    const response = await new Promise<ClickerWorkerResponse>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('La generación local del clicker superó el límite de cinco minutos.'));
      }, 300_000);
      worker.onmessage = (event: MessageEvent<ClickerWorkerResponse>) => {
        if (event.data.id !== id) return;
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'El worker local de Clickers se detuvo.'));
      };
      worker.postMessage({
        id,
        input,
        baseAssetUrl: `${baseUrl}clicker-assets/base-clicker.stl`,
        topAssetUrl: `${baseUrl}clicker-assets/top-clicker.stl`,
        topSolidAssetUrl: `${baseUrl}clicker-assets/top-clicker-solid.stl`,
        params: {
          cutHeightMm: Number(params.cut_height_mm),
          baseProtrusionMm: boundedNumber(params.base_protrusion_mm, -10, 10, -2),
          partGapMm: 8,
        },
      }, [input]);
    });

    if (response.error) throw new Error(response.error);
    if (!response.bottom || !response.top || response.cutHeightMm === undefined) {
      throw new Error('El worker local de Clickers devolvió un resultado incompleto.');
    }

    const bottomUrl = URL.createObjectURL(new Blob([response.bottom], { type: 'model/stl' }));
    const topUrl = URL.createObjectURL(new Blob([response.top], { type: 'model/stl' }));
    const name = file.name.replace(/\.stl$/i, '') || 'clicker';
    return {
      source: 'local',
      name: `${name}-clicker.stl`,
      modelUrl: bottomUrl,
      downloadUrl: bottomUrl,
      previewFiles: [
        { role: 'body', object: 'bottom', filename: `${name}-bottom.stl`, url: bottomUrl, format: 'stl' },
        { role: 'lid', object: 'top', filename: `${name}-top.stl`, url: topUrl, format: 'stl' },
      ],
      format: 'stl',
      metadata: {
        objects: ['bottom', 'top'],
        clicker: { cut_height_mm: response.cutHeightMm },
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
) {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(minimum, Math.min(maximum, numeric))
    : fallback;
}
