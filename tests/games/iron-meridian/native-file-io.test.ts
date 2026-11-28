import { describe, expect, it } from 'vitest';
import { NativeFileIo } from '../../../src/games/iron-meridian/native/file-io';
import type { NativeFileIoDependencies, NativeFileIoMemory, NativeFileIoResult } from '../../../src/games/iron-meridian/native/file-io';
import reference from '../../../work/iron-meridian/native-file-io/reference.json';

const bytes = (value: string) => Uint8Array.from(value.match(/../g) ?? [], pair => Number.parseInt(pair, 16));
const hex = (value: Uint8Array) => [...value].map(byte => byte.toString(16).padStart(2, '0')).join('');
const address = (value: bigint) => '0x' + BigInt.asUintN(64, value).toString(16);

describe('supplied native handle IO against original machine instructions', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const storage = new Map<bigint, number>();
    const apply = (writes: readonly { address: string; bytes: string }[]) => {
      for (const write of writes) {
        const start = BigInt(write.address);
        bytes(write.bytes).forEach((byte, index) => storage.set(start + BigInt(index), byte));
      }
    };
    apply(input.memoryWrites);
    const memory: NativeFileIoMemory = {
      readByte: at => storage.get(at) ?? 0,
      readDword(at) { let value = 0; for (let index = 0; index < 4; index++) value += this.readByte(at + BigInt(index)) * 2 ** (index * 8); return value >>> 0; },
      readQword(at) { let value = 0n; for (let index = 0; index < 8; index++) value |= BigInt(this.readByte(at + BigInt(index))) << BigInt(index * 8); return value; },
      writeByte(at, value) { storage.set(at, value & 255); },
      writeDword(at, value) { for (let index = 0; index < 4; index++) storage.set(at + BigInt(index), value >>> (index * 8) & 255); },
      writeQword(at, value) { for (let index = 0; index < 8; index++) storage.set(at + BigInt(index), Number(BigInt.asUintN(64, value) >> BigInt(index * 8) & 255n)); },
    };
    let callIndex = 0;
    // These are individually supplied external service responses. The reference
    // executes the complete selected native caller/helper instructions itself.
    const invoke = (role: string, target: bigint, args: readonly bigint[]): bigint => {
      const answer = expected.calls[callIndex++];
      expect(answer, 'undeclared service call').toBeDefined();
      if (!answer) throw new Error('Undeclared service call');
      expect({ role, target: address(target), arguments: args.map(address) }).toEqual({ role: answer.role, target: answer.target, arguments: answer.arguments });
      apply(answer.writes);
      return BigInt(answer.value);
    };
    const missingRoles: readonly string[] = input.missing;
    const missing = (role: string) => missingRoles.includes(role);
    const dependencies: NativeFileIoDependencies = {
      read: missing('read') ? undefined : (target, io, destination, count) => invoke('read', target, [io, destination, count]),
      write: missing('write') ? undefined : (target, io, source, count) => invoke('write', target, [io, source, count]),
      seek: missing('seek') ? undefined : (target, io, offset) => Number(BigInt.asIntN(32, invoke('seek', target, [io, offset]))),
      tell: missing('tell') ? undefined : (target, io) => invoke('tell', target, [io]),
      length: missing('length') ? undefined : (target, io) => invoke('length', target, [io]),
      flush: missing('flush') ? undefined : (target, io) => Number(BigInt.asIntN(32, invoke('flush', target, [io]))),
      destroy: missing('destroy') ? undefined : (target, io) => { invoke('destroy', target, [io]); },
      reallocate: missing('reallocate') ? undefined : (target, pointer, count) => invoke('reallocate', target, [pointer, count]),
      free: missing('free') ? undefined : (target, pointer) => { invoke('free', target, [pointer]); },
      copy1426079d0: missing('copy') ? undefined : (destination, source, count) => { invoke('copy', 0x1426079d0n, [destination, source, count]); },
      lock1425a3b80: missing('lock') ? undefined : mutex => Number(BigInt.asIntN(32, invoke('lock', 0x1425a3b80n, [mutex]))),
      unlock1425a3b88: missing('unlock') ? undefined : mutex => { invoke('unlock', 0x1425a3b88n, [mutex]); },
      initializeHeader1425a0588: missing('initialize-header') ? undefined : guard => { invoke('initialize-header', 0x1425a0588n, [guard]); },
      initializeFooter1425a051c: missing('initialize-footer') ? undefined : guard => { invoke('initialize-footer', 0x1425a051cn, [guard]); },
    };
    const io = new NativeFileIo(memory, dependencies, BigInt(input.gsBase));
    const results = [];
    for (const op of input.operations) {
      const file = BigInt(op.file), args = op.arguments.map(BigInt);
      let result: NativeFileIoResult<bigint | number>;
      switch (op.method) {
        case 'readBytes': result = io.readBytes(file, args[0]!, args[1]!); break;
        case 'readEngineFile': result = io.readEngineFile(file, args[0]!, args[1]!); break;
        case 'tell': result = io.tell(file); break;
        case 'fileLength': result = io.fileLength(file); break;
        case 'eof': result = io.eof(file); break;
        case 'flush': result = io.flush(file); break;
        case 'seek': result = io.seek(file, args[0]!); break;
        case 'setBuffer': result = io.setBuffer(file, args[0]!); break;
        case 'close': result = io.close(file); break;
        default: throw new Error('Unknown fixture operation');
      }
      if (result.kind === 'returned') results.push({ kind: result.kind, value: String(result.value) });
      else if (result.kind === 'runtime-required') results.push({ ...result, nativeAddress: address(result.nativeAddress), callSite: address(result.callSite) });
      else results.push({ ...result, nativeAddress: address(result.nativeAddress) });
      if (result.kind !== 'returned') break;
    }
    expect(results).toEqual(expected.results);
    expect(callIndex).toBe(expected.calls.length);
    for (const region of expected.memory) {
      const start = BigInt(region.address);
      const actual = Uint8Array.from({ length: region.bytes.length / 2 }, (_, index) => memory.readByte(start + BigInt(index)));
      expect(hex(actual), region.address).toBe(region.bytes);
    }
  });
});
