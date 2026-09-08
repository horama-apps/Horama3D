import type { GeneratedModel, ProductParams } from '../types';

interface SleeveWorkerPart {
  name: string;
  color: string;
  buffer: ArrayBuffer;
}

interface SleeveWorkerResponse {
  id: number;
  parts?: SleeveWorkerPart[];
  metadata?: NonNullable<GeneratedModel['metadata']>['tapToPaySleeve'];
  warnings?: string[];
  error?: string;
}

let requestId = 0;

export async function generateTapToPaySleeveLocally(
  file: File,
  params: ProductParams,
): Promise<GeneratedModel> {
  const input = await file.arrayBuffer();
  const bodyStyle = params.sleeve_body_style === 'reinforced' ? 'reinforced' : 'slim';
  const bodyName = bodyStyle === 'reinforced' ? 'card-sleeve-reinforced.stl' : 'card-sleeve-slim.stl';
  const bodyResponse = await fetch(`/tap-to-pay-assets/${bodyName}`);
  if (!bodyResponse.ok) throw new Error('No se pudo cargar el cuerpo incluido del portatarjeta.');
  const bodyInput = await bodyResponse.arrayBuffer();
  const worker = new Worker(new URL('./tapToPaySleeve.worker.ts', import.meta.url), { type: 'module' });
  const id = ++requestId;
  try {
    const response = await new Promise<SleeveWorkerResponse>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('La generación del portatarjeta superó cinco minutos.')),
        300_000,
      );
      worker.onmessage = (event: MessageEvent<SleeveWorkerResponse>) => {
        if (event.data.id !== id) return;
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'El generador del portatarjeta se detuvo.'));
      };
      worker.postMessage({
        id,
        input,
        bodyInput,
        bodyName,
        mimeType: file.type || mimeTypeFromName(file.name),
        params: {
          colorCount: boundedInteger(params.color_count, 2, 8, 4),
          fitMode: String(params.image_fit ?? 'cover'),
          detailPreset: String(params.detail_preset ?? 'balanced'),
          backgroundStrategy: String(params.background_strategy ?? 'border'),
          cardClearanceMm: boundedNumber(params.card_clearance_mm, 0.15, 0.8, 0.35),
          faceThicknessMm: boundedNumber(params.face_thickness_mm, 0.4, 1.2, 0.6),
          colorThicknessMm: boundedNumber(params.color_thickness_mm, 0.2, 0.6, 0.4),
          openingSide: params.opening_side === 'left' ? 'left' : 'right',
        },
      }, [input, bodyInput]);
    });
    if (response.error) throw new Error(response.error);
    if (!response.parts?.length || !response.metadata) {
      throw new Error('El generador no produjo un portatarjeta imprimible.');
    }
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image';
    const previewFiles = response.parts.map((part) => ({
      role: part.name.startsWith('body_') ? 'body' : 'detail',
      object: part.name,
      filename: `${part.name}.stl`,
      url: URL.createObjectURL(new Blob([part.buffer], { type: 'model/stl' })),
      format: 'stl' as const,
      color: part.color,
      meshType: part.name.startsWith('body_') ? 'normal_part' as const : 'modifier_part' as const,
      previewPosition: part.name.startsWith('body_') ? undefined : [0, 0, 0.01] as [number, number, number],
      previewRotation: [Math.PI, 0, 0] as [number, number, number],
    }));
    return {
      source: 'local',
      name: `${baseName}-tap-to-pay-sleeve`,
      modelUrl: previewFiles[0].url,
      downloadUrl: previewFiles[0].url,
      previewFiles,
      format: 'stl',
      metadata: {
        objects: response.parts.map((part) => part.name),
        tapToPaySleeve: response.metadata,
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

function boundedNumber(value: ProductParams[string] | undefined, min: number, max: number, fallback: number) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function boundedInteger(value: ProductParams[string] | undefined, min: number, max: number, fallback: number) {
  return Math.round(boundedNumber(value, min, max, fallback));
}
