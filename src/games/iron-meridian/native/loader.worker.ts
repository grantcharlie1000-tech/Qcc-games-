import type { OrderedDefines } from './defines';
import { loadNativeBaseInspection, nativeLoaderFailure } from './loader';
import { NativeLoaderError } from './loader-protocol';
import type { NativeLoaderRequest, NativeLoaderResponse } from './loader-protocol';

let session: number | undefined;
let generation = 0;
let loading = false;
let defines: OrderedDefines | undefined;
const send = (message: NativeLoaderResponse, transfer: Transferable[] = []) => self.postMessage(message, { transfer });

async function load(request: Extract<NativeLoaderRequest, { type: 'load' }>): Promise<void> {
  if (loading || defines) {
    send({ type: 'failed', sessionId: request.sessionId, error: { phase: 'runtime', code: 'already-loaded', message: 'Replace the content worker to load another source.' } });
    return;
  }
  const sessionId = request.sessionId;
  session = sessionId;
  const ticket = ++generation;
  loading = true;
  try {
    let runtimeBytes: Uint8Array;
    try {
      const response = await fetch(new URL('./lua51/runtime.wasm', import.meta.url));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      runtimeBytes = new Uint8Array(await response.arrayBuffer());
    } catch {
      throw new NativeLoaderError({ phase: 'runtime', code: 'runtime-read-failed', message: 'Could not load the Lua runtime.' });
    }
    if (ticket !== generation) return;
    const result = await loadNativeBaseInspection(request.source, {
      runtimeBytes,
      onProgress(progress) { if (ticket === generation) send({ type: 'progress', sessionId, ...progress }); },
    });
    if (ticket !== generation) { result.close(); return; }
    defines = result.defines;
    const pixels = result.world.provinceIds.buffer;
    if (!(pixels instanceof ArrayBuffer)) throw new Error('Unsupported province buffer.');
    send({ type: 'ready', sessionId, manifest: result.manifest, world: result.world }, [pixels]);
    // No world, Blob, source index or returned result is retained after this operation.
  } catch (error) {
    defines?.close();
    defines = undefined;
    if (ticket === generation) send({ type: 'failed', sessionId, error: nativeLoaderFailure(error, 'runtime') });
  } finally { if (ticket === generation) loading = false; }
}

// Only the owning app view posts to this dedicated worker. It terminates the worker
// to cancel running synchronous Lua/WASM; close messages cannot interrupt a chunk.
self.addEventListener('message', ({ data }: MessageEvent<NativeLoaderRequest>) => {
  if (data.type === 'load') { void load(data); return; }
  if (data.sessionId !== session) return;
  if (data.type === 'close') {
    generation++;
    defines?.close();
    defines = undefined;
    self.close();
    return;
  }
  if (!defines || loading) {
    send({ type: 'failed', sessionId: data.sessionId, requestId: data.requestId, error: { phase: 'query', code: 'not-ready', message: 'Base content is not ready.' } });
    return;
  }
  try {
    const value = defines.get(data.root, data.section, data.key);
    send({ type: 'define-result', sessionId: data.sessionId, requestId: data.requestId, value });
  } catch (error) {
    send({ type: 'failed', sessionId: data.sessionId, requestId: data.requestId, error: nativeLoaderFailure(error, 'query') });
  }
});
