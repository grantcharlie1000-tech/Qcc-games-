import { describe, expect, it } from 'vitest';
import { adjustNativeMountDependencyPriority, mountNativeSelection } from '../../../src/games/iron-meridian/native/mounting';
import type { NativeMountDependencies, NativeMountMemory } from '../../../src/games/iron-meridian/native/mounting';
import reference from '../../../work/iron-meridian/native-mounting/reference.json';

const bytes = (value: string) => Uint8Array.from(value.match(/../g) ?? [], pair => Number.parseInt(pair, 16));
const hex = (value: Uint8Array) => [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');
const address = (value: bigint) => `0x${BigInt.asUintN(64, value).toString(16)}`;

describe('mount planner against original tree, priority, full sort, path and registration instructions', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const storage = new Map<bigint, number>();
    const calls: { name: string; arguments: (string | number)[] }[] = [];
    const pairs: { physicalRoot: string; virtualDirectory: string }[] = [];
    let allocated = 0x4300000n;
    let rootResponse = 0;
    // JSON case unions can infer empty arrays as never[], so widen fixture lists.
    const missing: readonly string[] = input.missing;
    const existingPaths: readonly string[] = input.exists;
    const archives: readonly string[] = input.physicalArchives;
    const directories: readonly string[] = input.directories;
    const apply = (writes: readonly { address: string; bytes: string }[]) => {
      for (const write of writes) {
        const start = BigInt(write.address);
        bytes(write.bytes).forEach((value, index) => storage.set(start + BigInt(index), value));
      }
    };
    apply(input.memoryWrites);
    const write = (start: bigint, value: Uint8Array) => value.forEach((byte, index) => storage.set(start + BigInt(index), byte));
    const memory: NativeMountMemory = {
      readByte: at => storage.get(at) ?? 0,
      readDword(at) { let value = 0; for (let index = 0; index < 4; index++) value += this.readByte(at + BigInt(index)) * 2 ** (index * 8); return value >>> 0; },
      readQword(at) { let value = 0n; for (let index = 0; index < 8; index++) value |= BigInt(this.readByte(at + BigInt(index))) << BigInt(index * 8); return value; },
      writeByte: (at, value) => { storage.set(at, value & 255); },
      writeQword(at, value) { for (let index = 0; index < 8; index++) this.writeByte(at + BigInt(index), Number(BigInt.asUintN(64, value) >> BigInt(index * 8) & 255n)); },
      writeString(at, value) {
        write(at, new Uint8Array(32));
        if (value.length <= 15) { write(at, value); this.writeQword(at + 24n, 15n); }
        else {
          const pointer = allocated; allocated += BigInt(value.length + 32);
          write(pointer, value); this.writeByte(pointer + BigInt(value.length), 0);
          this.writeQword(at, pointer); this.writeQword(at + 24n, BigInt(value.length));
        }
        this.writeQword(at + 16n, BigInt(value.length));
      },
      appendReplacement(virtualDirectory, physicalRoot) { pairs.push({ physicalRoot: hex(physicalRoot), virtualDirectory: hex(virtualDirectory) }); },
    };
    const call = (name: string, args: (string | number)[]) => {
      calls.push({ name, arguments: args });
      apply((input.leafWrites as Record<string, { address: string; bytes: string }[]>)[name] ?? []);
    };
    const dependencies: NativeMountDependencies = {
      exists142561180: missing.includes('vfs-exists') ? undefined : path => { call('vfs-exists', [hex(path)]); return existingPaths.includes(hex(path)); },
      openArchive1425e1aec: missing.includes('archive-open') ? undefined : (path, mode, sharing) => { call('archive-open', [hex(path), hex(mode), sharing]); return archives.includes(hex(path)) ? 0xa001n : 0n; },
      closeArchive1425d1944: missing.includes('archive-close') ? undefined : handle => call('archive-close', [address(handle)]),
      directory14257fdb0: missing.includes('directory-status') ? undefined : path => { call('directory-status', [hex(path)]); return directories.includes(hex(path)); },
      physfsMount14257a1c0: missing.includes('physfs-mount') ? undefined : (path, mountPoint, appendToPath) => { expect(mountPoint).toBeNull(); call('physfs-mount', [hex(path), '0x0', appendToPath]); return input.mountResult; },
      freeList142579040: missing.includes('free-search-path') ? undefined : list => call('free-search-path', [address(list)]),
      getSearchPath1425798f0: missing.includes('get-search-path') ? undefined : () => {
        call('get-search-path', []);
        const response = input.rootResponses[rootResponse++];
        if (!response) throw new Error('Undeclared PHYSFS search-path response');
        apply(response.memoryWrites);
        return BigInt(response.pointer);
      },
      diagnostic14254ab40: missing.includes('diagnostic') ? undefined : kind => { call('diagnostic', [kind]); return { onceValue: 1, shouldBreak: input.diagnosticBreak }; },
      log14254b900: missing.includes('log') ? undefined : kind => call('log', [kind]),
    };
    const result = mountNativeSelection(memory, BigInt(input.manager), dependencies, { gsBase: BigInt(input.gsBase), dependencyVisitBudget: input.budget });
    expect(result.kind).toBe(expected.kind);
    if (result.kind !== 'returned') expect(address(result.nativeAddress)).toBe(expected.nativeAddress);
    if (result.kind === 'runtime-required') expect(result.boundary).toBe(expected.boundary);
    expect(result.selected.map(item => ({ descriptor: address(item.descriptor), priority: item.priority }))).toEqual(expected.selected);
    expect(result.dependencyVisits).toBe(expected.dependencyVisits);
    expect(result.mountRequests.map(hex)).toEqual(expected.mountRequests);
    expect(result.replacementWrites.map(pair => ({ physicalRoot: hex(pair.physicalRoot), virtualDirectory: hex(pair.virtualDirectory) }))).toEqual(expected.replacementWrites);
    expect(pairs).toEqual(expected.replacementWrites);
    expect(calls).toEqual(expected.calls);
    const readString = (at: bigint) => {
      const pointer = memory.readQword(at + 24n) > 15n ? memory.readQword(at) : at;
      return Uint8Array.from({ length: Number(memory.readQword(at + 16n)) }, (_, index) => memory.readByte(pointer + BigInt(index)));
    };
    expect(hex(readString(BigInt(input.manager) + 0x80n))).toBe(expected.aggregate);
    const readCString = (pointer: bigint) => {
      const output: number[] = [];
      while (memory.readByte(pointer) !== 0) { output.push(memory.readByte(pointer)); pointer++; }
      return hex(Uint8Array.from(output));
    };
    const pointer = memory.readQword(0x1436917a8n);
    const roots = pointer === 0n ? null : [] as string[];
    if (roots) for (let at = pointer; memory.readQword(at) !== 0n; at += 8n) roots.push(readCString(memory.readQword(at)));
    expect(roots).toEqual(expected.roots);
    expect(address(pointer)).toBe(expected.rootPointer);
    expect(hex(Uint8Array.from({ length: 3 }, (_, index) => memory.readByte(0x1434f83b0n + BigInt(index))))).toBe(expected.once);
  });
  it.each(reference.priorityCases)('original dword priority adjustment $source / $target', ({ source, target, expected }) => {
    expect(adjustNativeMountDependencyPriority(source, target)).toBe(expected);
  });
});
