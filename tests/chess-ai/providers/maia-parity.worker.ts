/// <reference lib="webworker" />
import { encodePosition } from '../../../src/chess-ai/providers/maia/encoding';
import reference from './maia-fixtures/reference.json';

/** Test-only numerical comparison against Python ORT CPU, never game code. */
self.onmessage = async ({ data }: MessageEvent<{ assetBase: string }>) => {
  try {
    const started = performance.now();
    const memories: WebAssembly.Memory[] = [];
    const OriginalMemory = WebAssembly.Memory;
    // Observe actual runtime arenas rather than infer them from JS heap APIs.
    // This diagnostic exists only in the isolated parity test Worker.
    WebAssembly.Memory = new Proxy(OriginalMemory, {
      construct(target, args) {
        const memory = Reflect.construct(target, args) as WebAssembly.Memory;
        memories.push(memory);
        return memory;
      },
    });
    const allocatedBytes = () => memories.reduce((sum, memory) => sum + memory.buffer.byteLength, 0);
    let peakObservedWasmBytes = 0;
    const parts = await Promise.all([1, 2, 3].map(async (n) => {
      const response = await fetch(`${data.assetBase}model.part${n}`);
      if (!response.ok) throw new Error(`Missing model.part${n}`);
      return new Uint8Array(await response.arrayBuffer());
    }));
    const model = new Uint8Array(parts.reduce((n, part) => n + part.length, 0));
    let offset = 0;
    for (const part of parts) { model.set(part, offset); offset += part.length; }
    const ort = await import(/* @vite-ignore */ `${data.assetBase}ort.wasm.min.mjs`);
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = data.assetBase;
    const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
    const readyWasmBytes = allocatedBytes();
    peakObservedWasmBytes = readyWasmBytes;
    const results = [];
    for (const fixture of reference.fixtures) {
      const result = await session.run({
        tokens: new ort.Tensor('float32', encodePosition(fixture.fen), [1, 64, 12]),
        elo_self: new ort.Tensor('float32', new Float32Array([fixture.rating]), [1]),
        elo_oppo: new ort.Tensor('float32', new Float32Array([fixture.rating]), [1]),
      });
      const deltas = fixture.selectedLogits.map((item) => Math.abs(result.logits_move.data[item.index] - item.logit));
      const valueDeltas = fixture.ldw.map((value, i) => Math.abs(result.logits_value.data[i] - value));
      peakObservedWasmBytes = Math.max(peakObservedWasmBytes, allocatedBytes());
      const maxLogitDelta = Math.max(...deltas);
      const maxValueDelta = Math.max(...valueDeltas);
      if (!Number.isFinite(maxLogitDelta) || maxLogitDelta > 0.125 || !Number.isFinite(maxValueDelta) || maxValueDelta > 0.125) {
        throw new Error(`Maia3 reference parity failed at rating ${fixture.rating}: move ${maxLogitDelta}, LDW ${maxValueDelta}`);
      }
      results.push({ rating: fixture.rating, maxLogitDelta, maxValueDelta });
    }
    await session.release();
    const afterReleaseWasmBytes = allocatedBytes();
    WebAssembly.Memory = OriginalMemory;
    postMessage({
      ok: true, reference: reference.runtime, results, elapsedMs: performance.now() - started,
      memory: {
        observedArenas: memories.length, readyWasmBytes, peakObservedWasmBytes, afterReleaseWasmBytes,
        assembledModelBytes: model.length,
        note: 'WASM linear memory arenas and model transport buffer measured separately; these are not total process RSS. Session release keeps its linear arena until the Worker terminates.',
      },
    });
  } catch (error) {
    postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};
