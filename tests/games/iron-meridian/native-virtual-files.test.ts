import { describe, expect, it } from 'vitest';
import { enumerateNativeVirtualFiles, nativeVfsStateAfterWrites } from '../../../src/games/iron-meridian/native/virtual-files';
import reference from '../../../work/iron-meridian/native-vfs/reference.json';

const bytes = (value: string) => Uint8Array.from(value.match(/../g) ?? [], pair => Number.parseInt(pair, 16));
const hex = (value: Uint8Array) => [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');
const cString = (value: string) => {
  for (let index = 0; index < value.length; index += 2) if (value.slice(index, index + 2) === '00') return value.slice(0, index);
  return value;
};

describe('native VFS selection against original x86-64 enumeration instructions', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const calls: string[] = [];
    const statQueues = new Map<string, { succeeded: boolean; rawFileType: number }[]>();
    for (const listing of input.listings) {
      for (const entry of listing.entries) {
        if ((entry.rawFileType | 0) !== 4) continue;
        const path = cString(listing.directory) + '2f' + cString(entry.name);
        statQueues.set(path, [...(statQueues.get(path) ?? []), entry.stat]);
      }
    }
    const state = nativeVfsStateAfterWrites(input.searchRoots.map(bytes), input.replacementWrites.map(pair => ({
      virtualDirectory: bytes(pair.virtualDirectory), physicalRoot: bytes(pair.physicalRoot),
    })));
    expect({
      searchRoots: state.searchRoots.map(hex),
      replacementPairs: state.replacementPairs.map(pair => ({ physicalRoot: hex(pair.physicalRoot), virtualDirectory: hex(pair.virtualDirectory) })),
    }).toEqual(expected.normalizedState);

    const result = enumerateNativeVirtualFiles({
      directory: bytes(input.directory), outputPrefix: bytes(input.outputPrefix),
      suffix: input.suffix === null ? null : bytes(input.suffix),
      contains: input.contains === null ? null : bytes(input.contains),
      currentDepth: input.currentDepth, maximumDepth: input.maximumDepth,
    }, state, {
      enumerate(directory) {
        const path = hex(directory);
        calls.push('enumerate:' + path);
        const listing = input.listings.find(item => cString(item.directory) === path);
        if (!listing) throw new Error('Undeclared PHYSFS listing: ' + path);
        return { succeeded: listing.succeeded, entries: listing.entries.map(entry => ({
          name: bytes(entry.name), rawFileType: entry.rawFileType, rawMetadata: bytes(entry.rawMetadata),
        })) };
      },
      stat(path) {
        const key = hex(path);
        calls.push('stat:' + key);
        const result = statQueues.get(key)?.shift();
        if (!result) throw new Error('Undeclared PHYSFS stat: ' + key);
        return result;
      },
      getRealDir(path) {
        const key = hex(path);
        calls.push('realDir:' + key);
        const row = input.realDirs.find(item => cString(item.path) === key);
        if (!row) throw new Error('Undeclared PHYSFS real directory: ' + key);
        return row.value === null ? null : bytes(row.value);
      },
    });
    expect(result.kind).toBe(expected.kind);
    expect(result.files.map(file => ({ name: hex(file.name), rawMetadata: hex(file.rawMetadata) }))).toEqual(expected.files);
    expect(result.diagnostics.map(diagnostic => ({ kind: diagnostic.kind, path: hex(diagnostic.path) }))).toEqual(expected.diagnostics);
    expect(calls).toEqual(expected.calls);
    if (result.kind === 'depth-exceeded') {
      expect(hex(result.directory)).toBe(expected.directory);
      expect(result.depth).toBe(expected.depth);
      expect(result.maximumDepth).toBe(expected.maximumDepth);
    }
  });
});
