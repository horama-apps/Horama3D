import type { GeneratedModel, PhoneCaseTransformInfo, ProductParams } from '../types';

interface PhoneCaseWorkerPart {
  name: string;
  color: string;
  buffer: ArrayBuffer;
}

interface PhoneCaseWorkerResponse {
  id: number;
  parts?: PhoneCaseWorkerPart[];
  metadata?: PhoneCaseTransformInfo;
  warnings?: string[];
  error?: string;
}

const PHONE_CASE_ASSETS: Record<string, string> = {
  iphone_17_pro_max: 'iphone-17-pro-max.stl',
};

let requestId = 0;

export async function generatePhoneCaseLocally(
  file: File,
  params: ProductParams,
): Promise<GeneratedModel> {
  const input = await file.arrayBuffer();
  const modelKey = String(params.phone_case_model ?? 'iphone_17_pro_max');
  const bodyName = PHONE_CASE_ASSETS[modelKey] ?? PHONE_CASE_ASSETS.iphone_17_pro_max;
  const bodyResponse = await fetch(`${import.meta.env.BASE_URL}phone-case-assets/${bodyName}`);
  if (!bodyResponse.ok) throw new Error('No se pudo cargar el cuerpo incluido de la funda.');
  const bodyInput = await bodyResponse.arrayBuffer();
  const worker = new Worker(new URL('./tapToPaySleeve.worker.ts', import.meta.url), { type: 'module' });
  const id = ++requestId;
  try {
    const response = await new Promise<PhoneCaseWorkerResponse>((resolve, reject) => {
      const timeout = window.setTimeout(
        () => reject(new Error('La generación de la funda superó cinco minutos.')),
        300_000,
      );
      worker.onmessage = (event: MessageEvent<PhoneCaseWorkerResponse>) => {
        if (event.data.id !== id) return;
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'El generador de fundas se detuvo.'));
      };
      worker.postMessage({
        id,
        input,
        bodyInput,
        bodyName,
        mimeType: file.type || mimeTypeFromName(file.name),
        params: {
          colorCount: boundedInteger(params.color_count, 2, 8, 4),
          fitMode: String(params.image_fit ?? 'contain'),
          detailPreset: String(params.detail_preset ?? 'high'),
          backgroundStrategy: String(params.background_strategy ?? 'border'),
          cardClearanceMm: 0.35,
          faceThicknessMm: 0.6,
          colorThicknessMm: boundedNumber(params.color_thickness_mm, 0.2, 0.6, 0.4),
          openingSide: 'right',
          templateKind: 'phone_case',
          imageScalePercent: boundedNumber(params.image_scale_percent, 25, 200, 100),
          imageOffsetXmm: boundedNumber(params.image_offset_x_mm, -60, 60, 0),
          imageOffsetYmm: boundedNumber(params.image_offset_y_mm, -100, 100, 0),
          imageRotationDeg: boundedNumber(params.image_rotation_deg, -180, 180, 0),
        },
      }, [input, bodyInput]);
    });
    if (response.error) throw new Error(response.error);
    if (!response.parts?.length || !response.metadata) {
      throw new Error('El generador no produjo una funda imprimible.');
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
      name: `${baseName}-phone-case`,
      modelUrl: previewFiles[0].url,
      downloadUrl: previewFiles[0].url,
      previewFiles,
      format: 'stl',
      metadata: {
        objects: response.parts.map((part) => part.name),
        phoneCase: response.metadata,
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
