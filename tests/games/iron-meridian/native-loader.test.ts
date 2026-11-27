import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { captureNativeBaseDirectory } from '../../../src/games/iron-meridian/native/local-source';
import { loadNativeBaseInspection } from '../../../src/games/iron-meridian/native/loader';
import type { LoadedNativeBaseInspection } from '../../../src/games/iron-meridian/native/loader';
import type { NativeLoaderProgress } from '../../../src/games/iron-meridian/native/loader-protocol';

const encoder = new TextEncoder();
const runtimeBytes = new Uint8Array(readFileSync(new URL('../../../src/games/iron-meridian/native/lua51/runtime.wasm', import.meta.url)));
const live: LoadedNativeBaseInspection[] = [];
afterEach(() => { for (const result of live.splice(0)) result.close(); vi.restoreAllMocks(); });

function selectedFile(path: string, content: string | Uint8Array, root = 'Hearts of Iron IV'): File {
  const blobPart = typeof content === 'string' ? content : new Uint8Array(content).buffer;
  const file = new File([blobPart], path.split('/').at(-1) ?? path);
  Object.defineProperty(file, 'webkitRelativePath', { value: root + '/' + path });
  return file;
}

function bitmap(firstColor = 0x010203): Uint8Array {
  const result = new Uint8Array(62);
  const view = new DataView(result.buffer);
  result.set([0x42, 0x4d]);
  view.setUint32(2, result.length, true); view.setUint32(10, 54, true); view.setUint32(14, 40, true);
  view.setInt32(18, 2, true); view.setInt32(22, 1, true);
  view.setUint16(26, 1, true); view.setUint16(28, 24, true); view.setUint32(34, 8, true);
  result.set([firstColor & 255, firstColor >>> 8 & 255, firstColor >>> 16, 6, 5, 4], 54);
  return result;
}

function inputs(chunks = [{ path: '00_base.lua', source: 'NDefines={NTechnology={MIN_RESEARCH_SPEED=0.1},Order=""}' }]): File[] {
  return [
    selectedFile('map/default.map', 'definitions="definition.csv" provinces="provinces.bmp"'),
    selectedFile('map/definition.csv', '0;0;0;0;land;false;unknown;0\n1;1;2;3;land;false;plains;1\n2;4;5;6;sea;false;ocean;0\n'),
    selectedFile('map/provinces.bmp', bitmap()),
    selectedFile('history/states/1-A.txt', 'state={id=1 name=STATE_ONE provinces={1} history={owner=FRA}}'),
    ...chunks.map(chunk => selectedFile('common/defines/' + chunk.path, chunk.source)),
  ];
}

function replace(files: File[], path: string, content: string | Uint8Array): File[] {
  return files.map(file => file.webkitRelativePath.endsWith('/' + path) ? selectedFile(path, content) : file);
}

async function load(files: File[], progress?: NativeLoaderProgress[]): Promise<LoadedNativeBaseInspection> {
  const result = await loadNativeBaseInspection(captureNativeBaseDirectory(files), { runtimeBytes, onProgress: value => progress?.push(value) });
  live.push(result);
  return result;
}

describe('browser base directory capture', () => {
  it('captures relevant Blob references without reading bytes or unrelated archives', () => {
    const files = [...inputs(), selectedFile('dlc/not-active.zip', 'archive'), selectedFile('map/not-consumed.txt', 'unused')];
    const reads = files.map(file => vi.spyOn(file, 'arrayBuffer'));
    const source = captureNativeBaseDirectory(files);
    expect(source).toMatchObject({ scope: 'base-loose-explicit', acquisition: 'directory-input', directoryCoverage: 'inferred-from-files', label: 'Hearts of Iron IV' });
    expect(source.files.map(file => file.path)).not.toContain('dlc/not-active.zip');
    expect(source.files.some(file => file.blob === files[0])).toBe(true);
    expect(reads.every(read => read.mock.calls.length === 0)).toBe(true);
  });

  it.each(['map/../default.map', '/map/default.map', 'map//default.map', 'map/./default.map', 'map/C:/default.map', 'map/back\\slash.bmp', 'map/é.bmp', 'map/a\0.bmp'])('rejects unsafe or unsupported captured paths: %s', path => {
    expect(() => captureNativeBaseDirectory([...inputs(), selectedFile(path, 'x')])).toThrow();
  });

  it('rejects duplicate paths, file/directory conflicts, multiple roots and flat file selections', () => {
    const files = inputs();
    expect(() => captureNativeBaseDirectory([...files, files[0]])).toThrow('Duplicate');
    expect(() => captureNativeBaseDirectory([...files, selectedFile('map', 'file')])).toThrow('both file and directory');
    expect(() => captureNativeBaseDirectory([...files, selectedFile('map/extra', 'x', 'Other')])).toThrow('one installation');
    expect(() => captureNativeBaseDirectory([new File(['x'], 'default.map')])).toThrow('installation folder');
    expect(() => captureNativeBaseDirectory([])).toThrow('installation folder');
  });
});

describe('actual VFS to Lua bytes to raw-world loader', () => {
  it('loads every consumed file through recovered stat, open, read and close with no live handles', async () => {
    const result = await load(inputs());
    expect(result.manifest.fileAccess).toMatchObject({
      model: 'captured-loose-base-v1', completedReads: 5, statCalls: 5,
      openReadCalls: 5, readBytesCalls: 5, closeCalls: 5, liveHandles: 0,
      streamConstructions: 5, readAllCalls: 5, streamDestructions: 5, vectorDestructions: 5,
    });
    expect(result.manifest.inputs).toHaveLength(5);
  });

  it('executes literal lua-suffix files in current-files-before-subdirectories order', async () => {
    const result = await load([...inputs([
      { path: 'b/00.lua', source: 'NDefines.Order=NDefines.Order.."b"' },
      { path: '00_base.lua', source: 'NDefines={Order=""}' },
      { path: 'z.lua', source: 'NDefines.Order=NDefines.Order.."z"' },
      { path: 'alua', source: 'NDefines.Order=NDefines.Order.."a"' },
      { path: 'a/00.lua', source: 'NDefines.Order=NDefines.Order.."d"' },
      { path: 'ignored.LUA', source: 'error("must not execute")' },
    ]), selectedFile('history/states/nested/ignored.txt', 'invalid state')]);
    expect(result.manifest.definePathsInExecutionOrder).toEqual([
      'common/defines/00_base.lua', 'common/defines/alua', 'common/defines/z.lua', 'common/defines/a/00.lua', 'common/defines/b/00.lua',
    ]);
    expect(result.defines.get('NDefines', 'Order')).toEqual({ type: 'string', value: encoder.encode('azdb') });
    expect(result.manifest.statePathsInAdapterOrder).toEqual(['history/states/1-A.txt']);
    expect(result.manifest.inputs.some(input => input.path.includes('ignored'))).toBe(false);
  });

  it('joins raw pixels and authored state relationships and preserves missing defines as typed nil', async () => {
    const progress: NativeLoaderProgress[] = [];
    const result = await load(inputs(), progress);
    expect([...result.world.provinceIds]).toEqual([1, 2]);
    expect(result.world.stateByProvinceId.get(1)).toBe(1);
    expect(result.world.states[0].name).toBe('STATE_ONE');
    expect(result.defines.get('NDefines', 'NTechnology', 'MIN_RESEARCH_SPEED')).toEqual({ type: 'number', value: 0.1 });
    expect(result.defines.get('NDefines', 'Missing')).toEqual({ type: 'nil' });
    expect(result.manifest.vfsInput).toEqual({ searchRoots: [], replacementPairs: [] });
    expect(result.manifest.scope).toBe('base-loose-explicit');
    expect(progress.at(-1)).toEqual({ phase: 'world', done: 1, total: 1 });
    expect(progress.filter(value => value.phase === 'read').at(-1)).toEqual({ phase: 'read', done: 5, total: 5 });
    result.close(); result.close();
    expect(() => result.defines.get('NDefines')).toThrow('closed');
  });

  it('hashes consumed bytes and actual runtime, with stable identities across input order and folder labels', async () => {
    const files = inputs();
    const first = await load(files);
    const renamed = await Promise.all([...files].reverse().map(async file => selectedFile(file.webkitRelativePath.split('/').slice(1).join('/'), new Uint8Array(await file.arrayBuffer()), 'Renamed')));
    const second = await load(renamed);
    expect(second.manifest).toEqual(first.manifest);
    for (const input of first.manifest.inputs) {
      const file = files.find(file => file.webkitRelativePath.endsWith('/' + input.path));
      if (!file) throw new Error('Missing test input');
      expect(input.bytes).toBe(file.size);
      expect(input.sha256).toBe(createHash('sha256').update(new Uint8Array(await file.arrayBuffer())).digest('hex'));
    }
    expect(first.manifest.luaRuntime.sha256).toBe(createHash('sha256').update(runtimeBytes).digest('hex'));
    const changed = await load(replace(inputs(), 'common/defines/00_base.lua', 'NDefines={Changed=true}'));
    expect(changed.manifest.snapshotId).not.toBe(first.manifest.snapshotId);
  });

  it('preserves invalid UTF-8 bytes in actual Lua chunks and result strings', async () => {
    const source = new Uint8Array([...encoder.encode('NDefines={Byte="'), 255, 254, ...encoder.encode('"}')]);
    const result = await load(replace(inputs(), 'common/defines/00_base.lua', source));
    expect(result.defines.get('NDefines', 'Byte')).toEqual({ type: 'string', value: Uint8Array.of(255, 254) });
  });

  it('instantiates the supplied WASM bytes and cannot fall back to the adjacent valid runtime', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(loadNativeBaseInspection(captureNativeBaseDirectory(inputs()), { runtimeBytes: Uint8Array.of(1, 2, 3, 4) }))
      .rejects.toMatchObject({ detail: { phase: 'runtime', code: 'runtime-failed' } });
  });

  it('reports failed and short file reads with the exact path', async () => {
    const failed = inputs();
    vi.spyOn(failed[0], 'arrayBuffer').mockRejectedValue(new Error('gone'));
    await expect(load(failed)).rejects.toMatchObject({ detail: { phase: 'read', code: 'read-failed', path: 'map/default.map' } });
    const short = inputs();
    vi.spyOn(short[0], 'arrayBuffer').mockResolvedValue(new ArrayBuffer(1));
    await expect(load(short)).rejects.toMatchObject({ detail: { phase: 'read', code: 'size-mismatch', path: 'map/default.map' } });
  });

  it('fails hashing explicitly rather than using file metadata as identity', async () => {
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('hash failed'));
    await expect(load(inputs())).rejects.toMatchObject({ detail: { phase: 'hash', code: 'hash-failed', path: 'map/default.map' } });
  });

  it.each(['this is invalid Lua', 'NDefines={Reached=true};error("stop")'])('aborts failed Lua chunks without reusing the temporary context: %s', async source => {
    await expect(load(replace(inputs(), 'common/defines/00_base.lua', source))).rejects.toMatchObject({ detail: { phase: 'lua', code: 'lua-failed', path: 'common/defines/00_base.lua' } });
    const fresh = await load(inputs());
    expect(fresh.defines.get('NDefines', 'Reached')).toEqual({ type: 'nil' });
  });

  it('requires actual supported map declarations and selected content', async () => {
    await expect(load(replace(inputs(), 'map/default.map', 'definitions="../outside.csv" provinces="provinces.bmp"'))).rejects.toMatchObject({ detail: { code: 'invalid-map-path' } });
    await expect(load(replace(inputs(), 'map/default.map', 'definitions="missing.csv" provinces="provinces.bmp"'))).rejects.toMatchObject({ detail: { phase: 'read', code: 'missing-input', path: 'map/missing.csv' } });
    await expect(load(replace(inputs(), 'map/default.map', 'definitions="a.csv" definitions="b.csv" provinces="provinces.bmp"'))).rejects.toMatchObject({ detail: { code: 'invalid-map-declaration' } });
    await expect(load(inputs([{ path: 'only.LUA', source: 'NDefines={}' }]))).rejects.toMatchObject({ detail: { code: 'missing-defines' } });
  });

  it('rejects invalid world text, bitmap and ambiguous relationships before ready', async () => {
    await expect(load(replace(inputs(), 'history/states/1-A.txt', Uint8Array.of(255)))).rejects.toMatchObject({ detail: { phase: 'world', code: 'invalid-text' } });
    await expect(load(replace(inputs(), 'map/provinces.bmp', Uint8Array.of(1, 2, 3)))).rejects.toMatchObject({ detail: { phase: 'world', code: 'invalid-world' } });
    await expect(load([...inputs(), selectedFile('history/states/2-B.txt', 'state={id=2 name=SECOND provinces={1}}')])).rejects.toMatchObject({ detail: { phase: 'world', code: 'world-validation' } });
    await expect(load(replace(inputs(), 'map/provinces.bmp', bitmap(0xffffff)))).rejects.toMatchObject({ detail: { phase: 'world', code: 'world-validation' } });
  });

  it('revalidates a structured-cloned index before reading its contents', async () => {
    const source = captureNativeBaseDirectory(inputs());
    await expect(loadNativeBaseInspection({ ...source, directories: [] }, { runtimeBytes })).rejects.toMatchObject({ detail: { code: 'invalid-directory-index' } });
  });
});
