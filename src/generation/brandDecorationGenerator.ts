import type { GeneratedModel, ProductParams } from '../types';

interface DecorationWorkerPart {
  name: string;
  role: string;
  color: string;
  buffer: ArrayBuffer;
  pixelCount: number;
  zMinMm: number;
  zMaxMm: number;
}

interface DecorationWorkerResponse {
  id: number;
  parts?: DecorationWorkerPart[];
  metadata?: NonNullable<GeneratedModel['metadata']>['imageLayers'];
  warnings?: string[];
  error?: string;
}

let requestId = 0;

export async function generateBrandDecorationLocally(
  file: File,
  params: ProductParams,
): Promise<GeneratedModel> {
  const worker = new Worker(
    new URL('./brandDecoration.worker.ts', import.meta.url),
    { type: 'module' },
  );
  const id = ++requestId;
  const input = await file.arrayBuffer();

  try {
    const response = await new Promise<DecorationWorkerResponse>(
      (resolve, reject) => {
        const timeout = window.setTimeout(
          () =>
            reject(
              new Error(
                'La simplificación de la imagen superó el límite de cinco minutos.',
              ),
            ),
          300_000,
        );
        worker.onmessage = (
          event: MessageEvent<DecorationWorkerResponse>,
        ) => {
          if (event.data.id !== id) return;
          window.clearTimeout(timeout);
          resolve(event.data);
        };
        worker.onerror = (event) => {
          window.clearTimeout(timeout);
          reject(
            new Error(
              event.message ||
                'El generador local de decoración se detuvo.',
            ),
          );
        };
        worker.postMessage(
          {
            id,
            input,
            mimeType: file.type || mimeTypeFromName(file.name),
            params: {
              mode: String(params.simplification_mode ?? 'silhouette'),
              backingStyle: String(params.backing_style ?? 'contour'),
              widthMm: boundedNumber(params.width_mm, 30, 500, 160),
              baseThicknessMm: boundedNumber(
                params.base_thickness_mm,
                0.8,
                8,
                2.4,
              ),
              reliefHeightMm: boundedNumber(
                params.relief_height_mm,
                0.4,
                8,
                1.2,
              ),
              thresholdPercent: boundedNumber(
                params.image_threshold,
                5,
                95,
                55,
              ),
              lineWidthMm: boundedNumber(
                params.line_width_mm,
                0.6,
                8,
                1.6,
              ),
              backingMarginMm: boundedNumber(
                params.backing_margin_mm,
                0,
                20,
                3,
              ),
              detailPreset: String(params.detail_preset ?? 'balanced'),
              invert: Boolean(params.invert_image),
              baseColor: String(params.base_color ?? '#efe6d5'),
              detailColor: String(params.detail_color ?? '#171717'),
              midColor: String(params.mid_color ?? '#c8755b'),
            },
          },
          [input],
        );
      },
    );

    if (response.error) throw new Error(response.error);
    if (!response.parts?.length || !response.metadata) {
      throw new Error(
        'El generador local no produjo una decoración imprimible.',
      );
    }

    const baseName =
      file.name.replace(/\.[^.]+$/, '') || 'decoracion-de-marca';
    const previewFiles = response.parts.map((part, index) => ({
      role: part.role || `detail_${index + 1}`,
      object: part.name,
      filename: `${baseName}-${part.name}.stl`,
      url: URL.createObjectURL(
        new Blob([part.buffer], { type: 'model/stl' }),
      ),
      format: 'stl' as const,
      color: part.color,
    }));

    return {
      source: 'local',
      name: `${baseName}-decoracion-de-marca`,
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
  return Number.isFinite(number)
    ? Math.max(minimum, Math.min(maximum, number))
    : fallback;
}
