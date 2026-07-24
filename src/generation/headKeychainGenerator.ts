import type { GeneratedModel, ProductParams } from '../types';

interface HeadKeychainWorkerResponse {
  id: number;
  head?: ArrayBuffer;
  cutHeightMm?: number;
  scalePercent?: number;
  warnings?: string[];
  error?: string;
}

let requestId = 0;

export async function generateHeadKeychainModelLocally(
  file: File,
  params: ProductParams,
): Promise<GeneratedModel> {
  const worker = new Worker(new URL('./headKeychain.worker.ts', import.meta.url), {
    type: 'module',
  });
  const id = ++requestId;
  const input = await file.arrayBuffer();

  try {
    const response = await new Promise<HeadKeychainWorkerResponse>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('La generación local del Head Keychain superó el límite de cinco minutos.'));
      }, 300_000);
      worker.onmessage = (event: MessageEvent<HeadKeychainWorkerResponse>) => {
        if (event.data.id !== id) return;
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'El worker local de Head Keychains se detuvo.'));
      };
      worker.postMessage({
        id,
        input,
        params: {
          scalePercent: boundedNumber(params.stl_scale_percent, 10, 200, 100),
          cutHeightMm: Number(params.cut_height_mm),
          attachmentMode:
            params.head_keychain_attachment === 'integrated_hole'
              ? 'integrated_hole'
              : 'exterior_ring',
          holeDiameterMm: boundedNumber(params.head_hole_diameter_mm, 1.5, 10, 3),
          holeOffsetXmm: Number(params.head_hole_offset_x_mm) || 0,
          holeOffsetZmm: Number(params.head_hole_offset_z_mm) || 0,
        },
      }, [input]);
    });

    if (response.error) throw new Error(response.error);
    if (!response.head || response.cutHeightMm === undefined) {
      throw new Error('El worker local de Head Keychains devolvió un resultado incompleto.');
    }

    const headUrl = URL.createObjectURL(new Blob([response.head], { type: 'model/stl' }));
    const name = file.name.replace(/\.stl$/i, '') || 'head';
    return {
      source: 'local',
      name: `${name}-head-keychain.stl`,
      modelUrl: headUrl,
      downloadUrl: headUrl,
      format: 'stl',
      metadata: {
        objects: ['head'],
        headKeychain: {
          applied_scale: (response.scalePercent ?? 100) / 100,
          cut_height_mm: response.cutHeightMm,
        },
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
