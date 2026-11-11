/// <reference lib="webworker" />
import Module from 'manifold-3d';
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { cutQrSignBase } from './qrSignBaseCut';

self.onmessage = async (event: MessageEvent<{ base: Float32Array; text: Float32Array }>) => {
  try {
    const wasm = await Module({ locateFile: () => wasmUrl });
    wasm.setup();
    const result = cutQrSignBase(wasm, event.data.base, event.data.text);
    self.postMessage(result, [result.positions.buffer, result.indices.buffer]);
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'No se pudo generar la base.' });
  }
};
