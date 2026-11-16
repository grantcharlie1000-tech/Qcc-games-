/// <reference lib="webworker" />
import { encodePosition, policyDistribution, samplePolicy } from './encoding';
import type { MaiaCommand, MaiaReply } from './protocol';

interface OrtTensor { data: Float32Array; dims: readonly number[] }
interface OrtSession { run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>> }
interface OrtModule {
  env: { wasm: { numThreads: number; proxy: boolean; wasmPaths: string } };
  Tensor: new (type: 'float32', data: Float32Array, dims: number[]) => OrtTensor;
  InferenceSession: { create(bytes: Uint8Array, options: { executionProviders: string[]; graphOptimizationLevel: string }): Promise<OrtSession> };
}

const MODEL_BYTES = 45_683_686;
const MODEL_SHA256 = '405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856';
const PART_BYTES = [16_000_000, 16_000_000, 13_683_686];
let ort: OrtModule | undefined;
let session: OrtSession | undefined;
const send = (reply: MaiaReply) => postMessage(reply);

async function loadModel(assetBase: string, id: number): Promise<Uint8Array> {
  const model = new Uint8Array(MODEL_BYTES);
  let loaded = 0;
  send({ type: 'progress', id, progress: { phase: 'download', fraction: 0, loadedBytes: 0, totalBytes: MODEL_BYTES } });
  for (let part = 0; part < PART_BYTES.length; part++) {
    const response = await fetch(`${assetBase}model.part${part + 1}`);
    if (!response.ok || !response.body) throw new Error(`Maia3 model part ${part + 1} unavailable (${response.status}).`);
    const reader = response.body.getReader();
    let partLoaded = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (partLoaded + value.length > PART_BYTES[part]) {
        await reader.cancel();
        throw new Error(`Maia3 model part ${part + 1} has an invalid size.`);
      }
      model.set(value, loaded);
      loaded += value.length;
      partLoaded += value.length;
      send({ type: 'progress', id, progress: { phase: 'download', fraction: loaded / MODEL_BYTES, loadedBytes: loaded, totalBytes: MODEL_BYTES } });
    }
    if (partLoaded !== PART_BYTES[part]) throw new Error(`Maia3 model part ${part + 1} is incomplete.`);
  }
  const digest = await crypto.subtle.digest('SHA-256', model);
  const actual = [...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, '0')).join('');
  if (actual !== MODEL_SHA256) throw new Error('Maia3 model checksum mismatch.');
  return model;
}

async function run(fen: string, rating: number): Promise<Float32Array> {
  if (!session || !ort) throw new Error('Maia3 is not initialized.');
  const tokens = encodePosition(fen);
  const result = await session.run({
    tokens: new ort.Tensor('float32', tokens, [1, 64, 12]),
    elo_self: new ort.Tensor('float32', new Float32Array([rating]), [1]),
    elo_oppo: new ort.Tensor('float32', new Float32Array([rating]), [1]),
  });
  const logits = result.logits_move?.data;
  if (!(logits instanceof Float32Array) || logits.length !== 4352) throw new Error('Unexpected Maia3 network output.');
  return logits;
}

self.onmessage = async ({ data }: MessageEvent<MaiaCommand>) => {
  try {
    if (data.type === 'init') {
      if (typeof WebAssembly === 'undefined') throw new Error('Maia3 requires WebAssembly.');
      const model = await loadModel(data.assetBase, data.id);
      send({ type: 'progress', id: data.id, progress: { phase: 'compile', fraction: 0 } });
      ort = await import(/* @vite-ignore */ `${data.assetBase}ort.wasm.min.mjs`) as OrtModule;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      ort.env.wasm.wasmPaths = data.assetBase;
      session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
      send({ type: 'progress', id: data.id, progress: { phase: 'warmup', fraction: 0 } });
      const logits = await run('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 1300);
      if (!Number.isFinite(logits[796])) throw new Error('Maia3 warmup produced invalid logits.');
      send({ type: 'progress', id: data.id, progress: { phase: 'warmup', fraction: 1 } });
      send({ type: 'ready', id: data.id });
    } else if (data.type === 'move') {
      const started = performance.now();
      const logits = await run(data.fen, data.rating);
      const policy = policyDistribution(logits, data.fen.split(' ')[1] === 'b', data.legalMovesUci);
      const moveUci = samplePolicy(policy, data.random);
      const inferenceMs = performance.now() - started;
      const wait = data.pacingMs - inferenceMs;
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      send({ type: 'move', id: data.id, revision: data.revision, moveUci, inferenceMs });
    }
  } catch (error) {
    send({ type: 'error', id: data.id, message: error instanceof Error ? error.message : String(error) });
  }
};
