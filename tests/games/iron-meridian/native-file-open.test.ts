import { describe, expect, it } from 'vitest';
import { NativeFileIo } from '../../../src/games/iron-meridian/native/file-io';
import type { NativeFileIoMemory } from '../../../src/games/iron-meridian/native/file-io';
import { NativeFileOpen } from '../../../src/games/iron-meridian/native/file-open';
import type { NativeFileOpenDependencies } from '../../../src/games/iron-meridian/native/file-open';
import reference from '../../../work/iron-meridian/native-file-open/reference.json';

const bytes = (value: string) => Uint8Array.from(value.match(/../g) ?? [], pair => Number.parseInt(pair, 16));
const hex = (value: Uint8Array) => [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');
const address = (value: bigint) => '0x' + BigInt.asUintN(64, value).toString(16);

describe('original native opener, converter, mount acceptance and handle lifetime', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const storage = new Map<bigint, number>();
    const apply = (writes: readonly { address: string; bytes: string }[]) => {
      for (const item of writes) bytes(item.bytes).forEach((byte, index) => storage.set(BigInt(item.address) + BigInt(index), byte));
    };
    apply(input.memoryWrites);
    const memory: NativeFileIoMemory = {
      readByte: at => storage.get(at) ?? 0,
      readDword(at) { let value = 0; for (let i = 0; i < 4; i++) value += this.readByte(at + BigInt(i)) * 2 ** (i * 8); return value >>> 0; },
      readQword(at) { let value = 0n; for (let i = 0; i < 8; i++) value |= BigInt(this.readByte(at + BigInt(i))) << BigInt(i * 8); return value; },
      writeByte(at, value) { storage.set(at, value & 255); },
      writeDword(at, value) { for (let i = 0; i < 4; i++) storage.set(at + BigInt(i), value >>> (i * 8) & 255); },
      writeQword(at, value) { for (let i = 0; i < 8; i++) storage.set(at + BigInt(i), Number(BigInt.asUintN(64, value) >> BigInt(i * 8) & 255n)); },
    };
    const cstring = (pointer: bigint) => {
      const output: number[] = [];
      while (memory.readByte(pointer) !== 0) { output.push(memory.readByte(pointer)); pointer++; if (output.length > 16384) throw new Error('Unterminated fixture string'); }
      return hex(Uint8Array.from(output));
    };
    let callIndex = 0;
    const invoke = (role: string, target: bigint, args: readonly bigint[]): bigint => {
      const answer = expected.calls[callIndex++];
      expect(answer, 'undeclared individual service call').toBeDefined();
      if (!answer) throw new Error('Undeclared service call');
      expect({ role, target: address(target), arguments: args.map(address),
        ...(role === 'open' || role === 'stat' ? { pathBytes: cstring(args[1]!) } : {}) })
        .toEqual({ role: answer.role, target: answer.target, arguments: answer.arguments,
          ...('pathBytes' in answer ? { pathBytes: answer.pathBytes } : {}) });
      apply(answer.writes);
      return BigInt(answer.value);
    };
    const missingRoles: readonly string[] = input.missing;
    const missing = (role: string) => missingRoles.includes(role);
    const dependencies: NativeFileOpenDependencies = {
      allocate: missing('allocate') ? undefined : (target, count) => invoke('allocate', target, [count]),
      openRead: missing('open') ? undefined : (target, opaque, path) => invoke('open', target, [opaque, path]),
      stat: missing('stat') ? undefined : (target, opaque, path, output) => Number(BigInt.asIntN(32, invoke('stat', target, [opaque, path, output]))),
      comparePrefix1425ceb80: missing('compare') ? undefined : (left, right, count) => Number(BigInt.asIntN(32, invoke('compare', 0x1425ceb80n, [left, right, count]))),
      findSlash1425c3c70: missing('find-slash') ? undefined : (path, byte) => invoke('find-slash', 0x1425c3c70n, [path, BigInt(byte)]),
      probeStack1425a07d0: missing('probe') ? undefined : count => { invoke('probe', 0x1425a07d0n, [count]); },
      read: missing('read') ? undefined : (target, io, destination, count) => invoke('read', target, [io, destination, count]),
      write: missing('write') ? undefined : (target, io, source, count) => invoke('write', target, [io, source, count]),
      seek: missing('seek') ? undefined : (target, io, offset) => Number(BigInt.asIntN(32, invoke('seek', target, [io, offset]))),
      tell: missing('tell') ? undefined : (target, io) => invoke('tell', target, [io]),
      length: missing('length') ? undefined : (target, io) => invoke('length', target, [io]),
      flush: missing('flush') ? undefined : (target, io) => Number(BigInt.asIntN(32, invoke('flush', target, [io]))),
      destroy: missing('destroy') ? undefined : (target, io) => { invoke('destroy', target, [io]); },
      free: missing('free') ? undefined : (target, pointer) => { invoke('free', target, [pointer]); },
      reallocate: missing('reallocate') ? undefined : (target, pointer, count) => invoke('reallocate', target, [pointer, count]),
      copy1426079d0: missing('copy') ? undefined : (destination, source, count) => { invoke('copy', 0x1426079d0n, [destination, source, count]); },
      lock1425a3b80: missing('lock') ? undefined : mutex => Number(BigInt.asIntN(32, invoke('lock', 0x1425a3b80n, [mutex]))),
      unlock1425a3b88: missing('unlock') ? undefined : mutex => { invoke('unlock', 0x1425a3b88n, [mutex]); },
      initializeHeader1425a0588: missing('initialize-header') ? undefined : guard => { invoke('initialize-header', 0x1425a0588n, [guard]); },
      initializeFooter1425a051c: missing('initialize-footer') ? undefined : guard => { invoke('initialize-footer', 0x1425a051cn, [guard]); },
    };
    const workspace = { stackHeader: BigInt(input.workspace.stackHeader), pathPointer: BigInt(input.workspace.pathPointer), stat: BigInt(input.workspace.stat) };
    const opener = new NativeFileOpen(memory, dependencies, BigInt(input.gsBase));
    const io = new NativeFileIo(memory, dependencies, BigInt(input.gsBase));
    const results = [];
    let handle = 0n;
    for (const [index, operation] of input.operations.entries()) {
      const args = operation.arguments.map(BigInt);
      const file = operation.file === 'last' ? handle : BigInt(operation.file);
      const result = (() => {
        switch (operation.method) {
          case 'openRead': return opener.openRead(args[0]!, workspace);
          case 'convertPath': return opener.convertPath(args[0]!, args[1]!);
          case 'acceptMountPath': return opener.acceptMountPath(args[0]!, args[1]!, Number(args[2]), workspace.stat);
          case 'readBytes': return io.readBytes(file, args[0]!, args[1]!);
          case 'tell': return io.tell(file);
          case 'eof': return io.eof(file);
          case 'setBuffer': return io.setBuffer(file, args[0]!);
          case 'close': return io.close(file);
          default: throw new Error('Unknown fixture operation');
        }
      })();
      if (result.kind === 'returned') { results.push({ kind: result.kind, value: String(result.value) }); if (operation.method === 'openRead') handle = BigInt(result.value); }
      else if (result.kind === 'runtime-required') results.push({ ...result, nativeAddress: address(result.nativeAddress), callSite: address(result.callSite) });
      else if (result.kind === 'native-memory-fault') results.push({ ...result, nativeAddress: address(result.nativeAddress), address: address(result.address) });
      else results.push({ ...result, nativeAddress: address(result.nativeAddress) });
      for (const region of expected.memoryAfterOperations[index]!) {
        const start = BigInt(region.address);
        expect(hex(Uint8Array.from({ length: region.bytes.length / 2 }, (_, i) => memory.readByte(start + BigInt(i)))), region.address).toBe(region.bytes);
      }
      if (result.kind !== 'returned') break;
    }
    expect(results).toEqual(expected.results);
    expect(callIndex).toBe(expected.calls.length);
  });
});
