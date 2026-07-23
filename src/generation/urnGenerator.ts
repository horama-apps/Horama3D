import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import type { GeneratedModel, ProductParams, UrnTransformInfo } from '../types';
import { loadFont } from './signGenerator';

interface UrnWorkerResponse {
  id: number;
  body?: ArrayBuffer;
  lid?: ArrayBuffer;
  lidBounds?: { min: number[]; max: number[] };
  metadata?: UrnTransformInfo;
  warnings?: string[];
  error?: string;
}

const TARGET_CAPACITY_ML: Record<string, number> = {
  s: 250,
  m: 500,
  l: 1000,
  xl: 2000,
};

let requestId = 0;

export async function generateUrnModelLocally(
  file: File,
  params: ProductParams,
): Promise<GeneratedModel> {
  const worker = new Worker(new URL('./urn.worker.ts', import.meta.url), {
    type: 'module',
  });
  const id = ++requestId;
  const input = await file.arrayBuffer();
  const size = normalizeSize(params.size);

  try {
    const response = await new Promise<UrnWorkerResponse>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject(new Error('La generación local de la urna superó el límite de cinco minutos.'));
      }, 300_000);
      worker.onmessage = (event: MessageEvent<UrnWorkerResponse>) => {
        if (event.data.id !== id) return;
        window.clearTimeout(timeout);
        resolve(event.data);
      };
      worker.onerror = (event) => {
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'El worker local de Urnas se detuvo.'));
      };
      worker.postMessage({
        id,
        input,
        params: {
          size,
          targetCapacityMl: TARGET_CAPACITY_ML[size],
          wallThicknessMm: boundedNumber(params.base_thickness_mm, 1, 12, 5),
          innerScale: boundedNumber(params.inner_scale, 0.4, 0.95, 0.7),
          planarCutMm: boundedNumber(params.planar_cut_base_mm, 0, 30, 8),
          plateSizeMm: [250, 250, 250],
          partGapMm: 5,
        },
      }, [input]);
    });

    if (response.error) throw new Error(response.error);
    if (!response.body || !response.lid || !response.lidBounds || !response.metadata) {
      throw new Error('El worker local de Urnas devolvió un resultado incompleto.');
    }

    const baseName = file.name.replace(/\.stl$/i, '') || 'urna';
    const bodyUrl = URL.createObjectURL(new Blob([response.body], { type: 'model/stl' }));
    const lidUrl = URL.createObjectURL(new Blob([response.lid], { type: 'model/stl' }));
    const previewFiles: GeneratedModel['previewFiles'] = [
      { role: 'body', object: 'piece', filename: `${baseName}-body.stl`, url: bodyUrl, format: 'stl' },
      { role: 'lid', object: 'lid', filename: `${baseName}-lid.stl`, url: lidUrl, format: 'stl' },
    ];
    const objects = ['piece', 'lid'];
    const textModel = await createLidTextModel(
      String(params.lid_text ?? ''),
      response.lidBounds,
      baseName,
    );
    if (textModel) {
      previewFiles.push(textModel.preview);
      objects.push('text');
    }

    return {
      source: 'local',
      name: `${baseName}-urn.stl`,
      modelUrl: bodyUrl,
      downloadUrl: bodyUrl,
      previewFiles,
      format: 'stl',
      metadata: {
        objects,
        urn: response.metadata,
        warnings: response.warnings ?? [],
      },
    };
  } finally {
    worker.terminate();
  }
}

async function createLidTextModel(
  value: string,
  lidBounds: { min: number[]; max: number[] },
  baseName: string,
) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return undefined;
  const font = await loadFont('helvetiker_regular');
  const lidWidth = lidBounds.max[0] - lidBounds.min[0];
  const lidHeight = lidBounds.max[1] - lidBounds.min[1];
  const margin = Math.max(3, Math.min(lidWidth, lidHeight) * 0.08);
  const maximumWidth = Math.max(0.1, Math.min(lidWidth * 0.7, lidWidth - margin * 2));
  const maximumHeight = Math.max(0.1, Math.min(lidHeight * 0.3, lidHeight - margin * 2));
  const fontSize = Math.max(0.1, Math.min(8, maximumHeight / lines.length / 1.25));
  const group = new THREE.Group();
  lines.forEach((line, index) => {
    const shapes = font.generateShapes(line, fontSize);
    if (shapes.length === 0) return;
    const geometry = new THREE.ExtrudeGeometry(shapes, {
      depth: 0.6,
      bevelEnabled: false,
      curveSegments: 10,
      steps: 1,
    });
    geometry.translate(0, -index * fontSize * 1.25, 0);
    group.add(new THREE.Mesh(geometry));
  });
  if (group.children.length === 0) return undefined;

  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  const scale = Math.min(maximumWidth / Math.max(size.x, 0.001), maximumHeight / Math.max(size.y, 0.001));
  group.scale.set(-scale, scale, 1);
  group.updateMatrixWorld(true);
  const scaledBounds = new THREE.Box3().setFromObject(group);
  const lidCenterX = (lidBounds.min[0] + lidBounds.max[0]) / 2;
  const lidCenterY = (lidBounds.min[1] + lidBounds.max[1]) / 2;
  const textCenter = scaledBounds.getCenter(new THREE.Vector3());
  group.position.set(
    lidCenterX - textCenter.x,
    lidCenterY - textCenter.y,
    lidBounds.min[2] - 0.02 - scaledBounds.min.z,
  );
  group.updateMatrixWorld(true);
  const view = new STLExporter().parse(group, { binary: true }) as DataView;
  const bytes = new Uint8Array(view.byteLength);
  bytes.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  const blob = new Blob([bytes], { type: 'model/stl' });
  const url = URL.createObjectURL(blob);
  return {
    preview: {
      role: 'text',
      object: 'text',
      filename: `${baseName}-text.stl`,
      url,
      format: 'stl' as const,
    },
  };
}

function normalizeSize(value: ProductParams[string] | undefined) {
  const size = String(value ?? 's').toLowerCase();
  return size in TARGET_CAPACITY_ML ? size : 's';
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
