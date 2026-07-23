import type { GeneratedModel, ProductParams } from '../types';

interface ImageLayerWorkerPart {
  name: string;
  color: string;
  buffer: ArrayBuffer;
  pixelCount: number;
  zMinMm: number;
  zMaxMm: number;
}

interface ImageLayerWorkerResponse {
  id: number;
  parts?: ImageLayerWorkerPart[];
  metadata?: NonNullable<GeneratedModel['metadata']>['imageLayers'];
  warnings?: string[];
  error?: string;
}

let requestId = 0;

export async function generateImageLayersLocally(
  file: File,
  params: ProductParams,
): Promise<GeneratedModel> {
  const worker = new Worker(new URL('./imageLayers.worker.ts', import.meta.url), {
    type: 'module',
  });
  const id = ++requestId;
  const input = await file.arrayBuffer();

  try {
    const response = await new Promise<ImageLayerWorkerResponse>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('La generación de capas superó el límite de cinco minutos.')),
        300_000,
      );
      worker.onmessage = (event: MessageEvent<ImageLayerWorkerResponse>) => {
        if (event.data.id !== id) return;
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'El generador local de capas se detuvo.'));
      };
      worker.postMessage({
        id,
        input,
        mimeType: file.type || mimeTypeFromName(file.name),
        params: {
          colorCount: boundedInteger(params.color_count, 2, 16, 8),
          widthMm: boundedNumber(params.width_mm, 20, 400, 120),
          layerHeightMm: boundedNumber(params.layer_height_mm, 0.2, 5, 1.2),
          detailPreset: String(params.detail_preset ?? 'balanced'),
          frameWidthMm: boundedNumber(params.frame_width_mm, 0, 30, 4),
          backgroundStrategy: String(params.background_strategy ?? 'border'),
          layerOrderStrategy: String(params.layer_order_strategy ?? 'dark_on_top'),
          topBorder: Boolean(params.top_border),
          topBorderHeightMm: boundedNumber(params.top_border_height_mm, 0.2, 20, 3),
        },
      }, [input]);
    });

    if (response.error) throw new Error(response.error);
    if (!response.parts?.length || !response.metadata) {
      throw new Error('El generador local no produjo capas imprimibles.');
    }

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    const previewFiles = response.parts.map((part, index) => {
      const url = URL.createObjectURL(new Blob([part.buffer], { type: 'model/stl' }));
      return {
        role: `layer_${String(index + 1).padStart(2, '0')}`,
        object: part.name,
        filename: `${part.name}.stl`,
        url,
        format: 'stl' as const,
        color: part.color,
      };
    });

    return {
      source: 'local',
      name: `${baseName}-image-layers`,
      modelUrl: previewFiles[0].url,
      downloadUrl: previewFiles[0].url,
      previewFiles,
      format: 'stl',
      metadata: {
        objects: response.parts.map((part) => part.name),
        imageLayers: response.metadata,
        warnings: response.warnings ?? [],
      },
    };
  } finally {
    worker.terminate();
  }
}

function mimeTypeFromName(name: string): string {
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  return 'image/png';
}

function boundedNumber(
  value: ProductParams[string] | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback;
}

function boundedInteger(
  value: ProductParams[string] | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return Math.round(boundedNumber(value, minimum, maximum, fallback));
}
