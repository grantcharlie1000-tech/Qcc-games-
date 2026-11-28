import { describe, expect, it } from 'vitest';
import { captureNativeBaseDirectory } from '../../../src/games/iron-meridian/native/local-source';

function file(path: string, bytes: Uint8Array = new Uint8Array()): File {
  const value = new File([new Uint8Array(bytes).buffer], path.split('/').at(-1)!);
  Object.defineProperty(value, 'webkitRelativePath', { value: `Installation/${path}` });
  return value;
}
function source(extra: File[] = []) {
  return captureNativeBaseDirectory([
    file('map/default.map', Uint8Array.of(0, 255, 128, 13, 10)),
    file('common/defines/empty.lua'), file('history/states/empty.txt'), ...extra,
  ]);
}

describe('selected browser bytes through recovered native file operations', () => {
  it('returns exact binary bytes and closes native handles before reporting completion', async () => {
    const { NativeBaseFiles } = await import('../../../src/games/iron-meridian/native/base-files');
    const reader = new NativeBaseFiles(source());
    expect(await reader.read('map/default.map')).toEqual(Uint8Array.of(0, 255, 128, 13, 10));
    expect(reader.report).toMatchObject({ model: 'captured-loose-base-v1', completedReads: 1, statCalls: 1, openReadCalls: 1, readBytesCalls: 1, closeCalls: 1, liveHandles: 0,
      streamConstructions: 1, readAllCalls: 1, streamDestructions: 1, vectorDestructions: 1 });
  });

  it('does not alias returned bytes or carry a cursor into another file or later read', async () => {
    const { NativeBaseFiles } = await import('../../../src/games/iron-meridian/native/base-files');
    const reader = new NativeBaseFiles(source([file('map/second.bin', Uint8Array.of(7, 8, 9))]));
    const first = await reader.read('map/default.map'); first.fill(42);
    expect(await reader.read('map/second.bin')).toEqual(Uint8Array.of(7, 8, 9));
    expect(await reader.read('map/default.map')).toEqual(Uint8Array.of(0, 255, 128, 13, 10));
    expect(reader.report).toMatchObject({ completedReads: 3, closeCalls: 3, liveHandles: 0 });
  });

  it('accepts an empty regular file and reaches EOF without inventing content', async () => {
    const { NativeBaseFiles } = await import('../../../src/games/iron-meridian/native/base-files');
    const reader = new NativeBaseFiles(source());
    expect(await reader.read('common/defines/empty.lua')).toEqual(new Uint8Array());
    expect(reader.report).toMatchObject({ completedReads: 1, closeCalls: 1, liveHandles: 0, readBytesCalls: 0, readAllCalls: 1, streamDestructions: 1, vectorDestructions: 1 });
  });

  it.each([0x100000 - 1, 0x100000, 0x100000 + 17])('preserves binary content across the native one-MiB buffer boundary at %i bytes', async size => {
    const { NativeBaseFiles } = await import('../../../src/games/iron-meridian/native/base-files');
    const bytes = Uint8Array.from({ length: size }, (_, index) => (index * 73 + (index >>> 8)) & 255);
    const reader = new NativeBaseFiles(source([file('map/buffer.bin', bytes)]));
    expect(Buffer.from(await reader.read('map/buffer.bin')).equals(bytes)).toBe(true);
    expect(reader.report).toMatchObject({ completedReads: 1, readBytesCalls: 1, closeCalls: 1, liveHandles: 0,
      streamConstructions: 1, readAllCalls: 1, streamDestructions: 1, vectorDestructions: 1 });
  });

  it('distinguishes an absent file from an existing directory without opening either', async () => {
    const { NativeBaseFiles } = await import('../../../src/games/iron-meridian/native/base-files');
    const reader = new NativeBaseFiles(source());
    await expect(reader.read('map/missing.bin')).rejects.toMatchObject({ detail: { phase: 'read', code: 'missing-input', path: 'map/missing.bin' } });
    await expect(reader.read('map')).rejects.toMatchObject({ detail: { phase: 'read', code: 'not-regular-file', path: 'map' } });
    expect(reader.report).toMatchObject({ completedReads: 0, statCalls: 2, openReadCalls: 0, liveHandles: 0 });
  });

  it('supports independent concurrent Blob hydration and native file lifetimes', async () => {
    const { NativeBaseFiles } = await import('../../../src/games/iron-meridian/native/base-files');
    const reader = new NativeBaseFiles(source([file('map/second.bin', Uint8Array.of(31, 0, 17))]));
    expect(await Promise.all([reader.read('map/default.map'), reader.read('map/second.bin')])).toEqual([Uint8Array.of(0, 255, 128, 13, 10), Uint8Array.of(31, 0, 17)]);
    expect(reader.report).toMatchObject({ completedReads: 2, closeCalls: 2, liveHandles: 0 });
  });

  it('uses native heap temporary paths for long captured names and releases them', async () => {
    const { NativeBaseFiles } = await import('../../../src/games/iron-meridian/native/base-files');
    const path = 'map/' + 'x'.repeat(520) + '.bin';
    const reader = new NativeBaseFiles(source([file(path, Uint8Array.of(111, 112))]));
    expect(await reader.read(path)).toEqual(Uint8Array.of(111, 112));
    expect(reader.report).toMatchObject({ completedReads: 1, closeCalls: 1, liveHandles: 0 });
  });

  it('reports a real Blob acquisition failure before publishing a native handle', async () => {
    const { NativeBaseFiles } = await import('../../../src/games/iron-meridian/native/base-files');
    class FailingBlob extends Blob { override async arrayBuffer(): Promise<ArrayBuffer> { throw new Error('Unavailable'); } }
    const captured = source();
    const reader = new NativeBaseFiles({ ...captured, files: captured.files.map(value => value.path === 'map/default.map' ? { ...value, blob: new FailingBlob(['data']) } : value) });
    await expect(reader.read('map/default.map')).rejects.toMatchObject({ detail: { phase: 'read', code: 'read-failed', path: 'map/default.map' } });
    expect(reader.report).toMatchObject({ completedReads: 0, liveHandles: 0 });
  });

  it('rejects Blob data whose actual byte count differs from its stat size', async () => {
    const { NativeBaseFiles } = await import('../../../src/games/iron-meridian/native/base-files');
    class ShortBlob extends Blob { override async arrayBuffer(): Promise<ArrayBuffer> { return Uint8Array.of(1).buffer; } }
    const captured = source();
    const reader = new NativeBaseFiles({ ...captured, files: captured.files.map(value => value.path === 'map/default.map' ? { ...value, blob: new ShortBlob(['longer']) } : value) });
    await expect(reader.read('map/default.map')).rejects.toMatchObject({ detail: { phase: 'read', code: 'size-mismatch', path: 'map/default.map' } });
    expect(reader.report).toMatchObject({ completedReads: 0, liveHandles: 0 });
  });
});
