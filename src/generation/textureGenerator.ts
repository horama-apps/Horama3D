import type { GeneratedModel, ProductParams } from '../types';

interface TextureWorkerResponse {
  id: number;
  model?: ArrayBuffer;
  reliefCount?: number;
  warnings?: string[];
  error?: string;
}

let requestId = 0;

export async function generateTextureModelLocally(
  file: File,
  params: ProductParams,
): Promise<GeneratedModel> {
  const worker = new Worker(new URL('./texture.worker.ts', import.meta.url), {
    type: 'module',
  });
  const id = ++requestId;
  const input = await file.arrayBuffer();

  try {
    const response = await new Promise<TextureWorkerResponse>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('La generación local de la textura superó el límite de cinco minutos.'));
      }, 300_000);
      worker.onmessage = (event: MessageEvent<TextureWorkerResponse>) => {
        if (event.data.id !== id) return;
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'El worker local de Texturas se detuvo.'));
      };
      worker.postMessage({
        id,
        input,
        params: {
          texture: normalizeTexture(params.texture),
          depthMm: boundedNumber(params.texture_depth_mm, 0.05, 2, 0.45),
          spacingMm: boundedNumber(params.texture_spacing_mm, 0.8, 12, 3),
        },
      }, [input]);
    });

    if (response.error) throw new Error(response.error);
    if (!response.model) {
      throw new Error('El worker local de Texturas devolvió un resultado incompleto.');
    }
    const blob = new Blob([response.model], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    const name = file.name.replace(/\.stl$/i, '') || 'modelo';
    return {
      source: 'local',
      name: `${name}-${normalizeTexture(params.texture)}.stl`,
      modelUrl: url,
      downloadUrl: url,
      blob,
      format: 'stl',
      metadata: {
        objects: ['piece'],
        warnings: response.warnings ?? [],
      },
    };
  } finally {
    worker.terminate();
  }
}

function normalizeTexture(value: ProductParams[string] | undefined) {
  const texture = String(value ?? 'none').toLowerCase();
  return ['woven', 'knit', 'carbon', 'wood'].includes(texture) ? texture : 'none';
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
