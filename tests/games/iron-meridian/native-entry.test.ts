// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameContext, GameInstance } from '../../../src/core/types';
import type { NativeLoaderResponse, NativeLoaderRequest } from '../../../src/games/iron-meridian/native/loader-protocol';
import type { NativeMapView } from '../../../src/games/iron-meridian/native-map-view';
import { readNativeViewSave } from '../../../src/games/iron-meridian/native-view-state';

const map = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../../src/games/iron-meridian/native-map-view', () => ({ createNativeMapView: map.create }));
import game from '../../../src/games/iron-meridian/native-entry';

class ContentWorker extends EventTarget {
  static instances: ContentWorker[] = [];
  requests: NativeLoaderRequest[] = [];
  terminated = false;
  constructor() { super(); ContentWorker.instances.push(this); }
  postMessage(request: NativeLoaderRequest) { this.requests.push(request); }
  terminate() { this.terminated = true; }
  send(data: NativeLoaderResponse) { this.dispatchEvent(new MessageEvent('message', { data })); }
}
const snapshotId = 'a'.repeat(64);
function ready(worker: ContentWorker, identity = snapshotId) {
  const request = worker.requests[0];
  worker.send({ type: 'ready', sessionId: request.sessionId, manifest: { snapshotId: identity }, world: { definitions: [1] } } as unknown as NativeLoaderResponse);
}
function choose(container: HTMLElement) {
  const names = ['map/default.map', 'common/defines/base.lua', 'history/states/1.txt'];
  const files = names.map(path => {
    const file = new File(['test'], path.split('/').at(-1)!);
    Object.defineProperty(file, 'webkitRelativePath', { value: `Hearts of Iron IV/${path}` });
    return file;
  });
  const input = container.querySelector('input')!;
  Object.defineProperty(input, 'files', { configurable: true, value: files });
  input.dispatchEvent(new Event('change'));
  return ContentWorker.instances.at(-1)!;
}
function view(): NativeMapView {
  return { zoom: vi.fn(), fit: vi.fn(), serialize: () => ({ x: 120, y: 80, zoom: 2 }), restore: vi.fn(), pause: vi.fn(), resume: vi.fn(), dispose: vi.fn() };
}
let instance: GameInstance, container: HTMLElement, context: GameContext;
beforeEach(async () => {
  vi.useFakeTimers(); vi.stubGlobal('Worker', ContentWorker); ContentWorker.instances = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  container = document.createElement('div'); document.body.append(container);
  context = { id: 'iron-meridian', settings: { sound: false, reducedMotion: true, colorBlind: false, autoNextEpisode: false }, highScore: 0,
    setScore: vi.fn(), setLevel: vi.fn(), setStatus: vi.fn(), announce: vi.fn(), save: vi.fn(), sound: vi.fn() };
  map.create.mockReset().mockImplementation(async () => view());
  instance = await game.mount(container, context);
});
afterEach(() => { instance.dispose(); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('actual native app entry lifecycle', () => {
  it('preserves a prototype save before import and carries it unchanged into native view metadata', async () => {
    const legacy = { version: 3, day: 47, focus: { progress: 12 }, units: [{ id: 9 }] };
    instance.restore(legacy);
    expect(instance.serialize()).toBe(legacy);
    const worker = choose(container); ready(worker);
    await vi.advanceTimersByTimeAsync(301);
    expect(instance.serialize()).toEqual({ kind: 'iron-meridian-native-view', version: 1, snapshotId, camera: { x: 120, y: 80, zoom: 2 }, legacyPrototypeSave: legacy });
    expect(context.save).toHaveBeenCalledWith(instance.serialize());
  });

  it('terminates the previous worker and ignores its stale success and failure after replacement', async () => {
    const first = choose(container), second = choose(container);
    expect(first.terminated).toBe(true);
    ready(first);
    first.send({ type: 'failed', sessionId: first.requests[0].sessionId, error: { phase: 'read', code: 'late', message: 'stale failure' } });
    expect(map.create).not.toHaveBeenCalled();
    expect(container.querySelector('.im-native')?.getAttribute('data-state')).toBe('loading');
    ready(second); await vi.advanceTimersByTimeAsync(0);
    expect(map.create).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.im-native')?.getAttribute('data-state')).toBe('ready');
    instance.dispose(); expect(second.terminated).toBe(true);
  });

  it('aborts map preparation on cancel and disposes a late returned view', async () => {
    let finish!: (value: NativeMapView) => void;
    map.create.mockImplementation(() => new Promise<NativeMapView>(resolve => { finish = resolve; }));
    const worker = choose(container); ready(worker);
    const signal = map.create.mock.calls[0][4] as AbortSignal;
    container.querySelector<HTMLButtonElement>('[data-action=cancel]')!.click();
    expect(signal.aborted).toBe(true); expect(worker.terminated).toBe(true);
    const late = view(); finish(late); await vi.advanceTimersByTimeAsync(301);
    expect(late.dispose).toHaveBeenCalledOnce();
    expect(container.querySelector('.im-native')?.getAttribute('data-state')).toBe('empty');
    expect(context.save).not.toHaveBeenCalled();
  });

  it('restores camera only for the same input snapshot and saves no selected file bytes', async () => {
    const saved = { kind: 'iron-meridian-native-view', version: 1, snapshotId, camera: { x: 55, y: 99, zoom: 3 } };
    instance.restore(saved); const firstView = view(); map.create.mockResolvedValueOnce(firstView);
    ready(choose(container), 'b'.repeat(64)); await vi.advanceTimersByTimeAsync(0);
    expect(firstView.restore).not.toHaveBeenCalled();
    // Reopening the app restores saved metadata before the user reselects files.
    instance.dispose(); instance = await game.mount(container, context); instance.restore(saved);
    const secondView = view(); map.create.mockResolvedValueOnce(secondView);
    ready(choose(container)); await vi.advanceTimersByTimeAsync(301);
    expect(secondView.restore).toHaveBeenCalledWith(saved.camera);
    const serialized = instance.serialize() as Record<string, unknown>;
    expect(Object.keys(serialized).sort()).toEqual(['camera', 'kind', 'snapshotId', 'version']);
    expect(JSON.stringify(serialized)).not.toMatch(/Blob|default\.map|common\/defines/);
  });

  it('keeps the loaded map if a replacement folder is invalid', async () => {
    ready(choose(container)); await vi.advanceTimersByTimeAsync(0);
    const input = container.querySelector('input')!;
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], 'unscoped.txt')] });
    input.dispatchEvent(new Event('change'));
    expect(container.querySelector('.im-native')?.getAttribute('data-state')).toBe('ready');
    expect(ContentWorker.instances[0].terminated).toBe(false);
    expect(context.announce).toHaveBeenCalledWith('Select the installation folder.');
  });

  it('retains successful view metadata if a subsequent replacement fails', async () => {
    ready(choose(container)); await vi.advanceTimersByTimeAsync(0);
    const saved = instance.serialize();
    const replacement = choose(container);
    replacement.send({ type: 'failed', sessionId: replacement.requests[0].sessionId, error: { phase: 'lua', code: 'bad-chunk', message: 'Invalid chunk.' } });
    expect(replacement.terminated).toBe(true);
    expect(container.querySelector('.im-native')?.getAttribute('data-state')).toBe('error');
    expect(instance.serialize()).toEqual(saved);
  });
});

describe('native view save boundary', () => {
  it('rejects invalid camera data without reinterpreting an old campaign as native state', () => {
    const base = { kind: 'iron-meridian-native-view', version: 1, snapshotId, camera: { x: 1, y: 2, zoom: 1 } };
    expect(readNativeViewSave(base)).toEqual(base);
    for (const camera of [null, [], { x: NaN, y: 2, zoom: 1 }, { x: 1, y: 2, zoom: Infinity }, { x: '1', y: 2, zoom: 1 }, { x: 1, y: 2, zoom: .9 }]) {
      expect(readNativeViewSave({ ...base, camera })).toBeUndefined();
    }
    expect(readNativeViewSave({ ...base, snapshotId: '../other' })).toBeUndefined();
    expect(readNativeViewSave({ version: 3, day: 47 })).toBeUndefined();
  });
});
