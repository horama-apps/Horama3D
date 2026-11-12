import type { GeneratedModel, ProductParams } from '../types';
import { parseCutterPose } from './strapCutterGeometry';

export async function generateStrapAnchorModel(file: File, params: ProductParams): Promise<GeneratedModel> {
  const pose = parseCutterPose(params.anchor_cutter_pose);
  if (!pose) throw new Error('Coloca el cortador sobre el STL antes de aplicar el corte.');
  const input = await file.arrayBuffer();
  const worker = new Worker(new URL('./strapAnchor.worker.ts', import.meta.url), { type: 'module' });
  try {
    const { output, warnings } = await new Promise<{ output: ArrayBuffer; warnings: string[] }>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error('El corte tardó demasiado. Prueba con un STL más ligero.')), 60_000);
      worker.onmessage = (event: MessageEvent<{ output?: ArrayBuffer; warnings?: string[]; error?: string }>) => {
        window.clearTimeout(timer);
        if (event.data.error) reject(new Error(event.data.error));
        else if (event.data.output) resolve({ output: event.data.output, warnings: event.data.warnings ?? [] });
        else reject(new Error('La herramienta no devolvió un STL válido.'));
      };
      worker.onerror = (event) => { window.clearTimeout(timer); reject(new Error(event.message || 'No se pudo procesar el STL.')); };
      worker.postMessage({ input, cutter: { pose, diameter: Number(params.anchor_diameter_mm), wall: Number(params.anchor_wall_mm), spacing: Number(params.anchor_spacing_mm), depth: Number(params.anchor_depth_mm) } }, [input]);
    });
    const blob = new Blob([output], { type: 'model/stl' });
    const url = URL.createObjectURL(blob);
    return { source: 'local', name: `${file.name.replace(/\.stl$/i, '')}-tunel-correa.stl`,
      modelUrl: url, downloadUrl: url, blob, format: 'stl', metadata: {
        preserveCamera: true, objects: ['objeto-con-tunel'],
        warnings: [...warnings, 'El túnel se cortó dentro del STL original. Comprueba el recorrido y el material restante en tu laminador.',
          'La pared mínima se comprueba en puntos del recorrido; no es una garantía de resistencia. Prueba la pieza impresa antes de colgar objetos.'],
      } };
  } finally { worker.terminate(); }
}
