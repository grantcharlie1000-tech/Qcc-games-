import type { NativeContentMemory } from './content-stream';
import { NativeContentStream } from './content-stream';
import type { NativeContentResult, NativeContentDependencies } from './content-stream';
import type { NativeFileIoDependencies } from './file-io';
import { NativeCharacterReader } from './character-reader';
export interface InputFactoryServices {
  io: NativeFileIoDependencies;
  crtAllocate?(bytes: bigint): bigint;
  crtFree?(pointer: bigint): void;
  copy?(destination: bigint, source: bigint, bytes: bigint): void;
  zero?(destination: bigint, value: number, bytes: bigint): void;
  allocate?(target: bigint, allocator: bigint, bytes: bigint, alignment: number): bigint;
  release?(target: bigint, allocator: bigint, pointer: bigint): void;
  readerSeek?(target: bigint, reader: bigint, position: number): number;
  readerSize?(target: bigint, reader: bigint): bigint;
}
export type InputFactoryResult = { kind: 'returned'; value: bigint }
  | Exclude<NativeContentResult<bigint>, { kind: 'returned' }>
  | { kind: 'native-memory-fault'; nativeAddress: bigint; address: bigint; access: 'read' | 'write'; bytes: number };
type Stop = Exclude<InputFactoryResult, { kind: 'returned' }>;
class FactoryStop { constructor(readonly result: Stop) {} }
const u64 = (value: bigint) => BigInt.asUintN(64, value), at = (a: bigint, offset: bigint) => u64(a + offset);
export class NativeInputFactory {
  constructor(readonly memory: NativeContentMemory, readonly services: InputFactoryServices, readonly gsBase: bigint) {}
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private int(a: bigint) { return this.memory.readDword(u64(a)) | 0; }
  private wq(a: bigint, value: bigint) { this.memory.writeQword(u64(a), u64(value)); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new FactoryStop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private run(operation: () => bigint): InputFactoryResult {
    try { return { kind: 'returned', value: operation() }; }
    catch (error) { if (error instanceof FactoryStop) return error.result; throw error; }
  }
  private unwrap<T>(result: { kind: 'returned'; value: T } | Stop): T {
    if (result.kind === 'returned') return result.value;
    // Prior components stop at a sized-delete trampoline. This composition executes
    // both retained forwarding jumps before reaching the single-pointer CRT leaf.
    if (result.kind === 'runtime-required' && result.boundary === 'crt-free') this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
    throw new FactoryStop(result);
  }
  private malloc(bytes: bigint, site: bigint) {
    if (!this.services.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, site);
    return u64(this.services.crtAllocate(bytes));
  }
  private free(pointer: bigint) {
    if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
    this.services.crtFree(pointer);
  }
  private initializeValue(vector: bigint) {
    // 14011F6F6 captures the TLS index before either header qword is cleared.
    const index = this.memory.readDword(0x143693a98n) >>> 0;
    this.wq(vector, 0n); this.wq(at(vector, 8n), 0n);
    const thread = this.q(at(this.q(at(this.gsBase, 0x58n)), BigInt(index) * 8n));
    if (this.int(0x1433dd120n) > this.int(at(thread, 0x20ecn))) this.stop('tls-guard-acquire', 0x1425a0588n, 0x14011f740n);
    this.wq(at(vector, 0x10n), 0x1430fd000n); return vector;
  }
  /** Actual 141015500 -> 14011F6F0 wrapper, for supplied nonnull vector storage. */
  initializeVector(vector: bigint): InputFactoryResult { return this.run(() => this.initializeValue(u64(vector))); }
  private allocate(target: bigint, allocator: bigint, bytes: bigint, alignment: number) {
    if (target === 0x14011d540n) return this.malloc(bytes, 0x14011d547n);
    if (!this.services.allocate) this.stop('allocator-allocate', target, 0x14255abf1n);
    return u64(this.services.allocate(target, allocator, bytes, alignment));
  }
  private release(target: bigint, allocator: bigint, pointer: bigint) {
    if (target === 0x14011d560n) { if (pointer !== 0n) this.free(pointer); return; }
    if (!this.services.release) this.stop('allocator-release', target, 0x14255ac10n);
    this.services.release(target, allocator, pointer);
  }
  create(stream: bigint, mode: number, bomMode: number, entryStack: bigint): InputFactoryResult {
    return this.run(() => {
      stream = u64(stream); entryStack = u64(entryStack); mode |= 0; bomMode |= 0;
      this.wq(at(entryStack, 8n), stream);
      const vector = this.malloc(24n, 0x142540623n); this.wq(at(entryStack, 0x20n), vector);
      if (vector !== 0n) this.initializeValue(vector);
      const original = this.memory;
      // Null allocation still enters readAll and runs its checks/length callback.
      // Its first vector dereference is the original resize count comparison.
      const memory: NativeContentMemory = {
        readByte: a => original.readByte(a), readQword: a => original.readQword(a),
        readDword: a => { if (vector === 0n && a === 12n) throw new FactoryStop({ kind: 'native-memory-fault', nativeAddress: 0x14255abb0n, address: 12n, access: 'read', bytes: 4 }); return original.readDword(a); },
        writeByte: (a, v) => original.writeByte(a, v), writeDword: (a, v) => original.writeDword(a, v), writeQword: (a, v) => original.writeQword(a, v), writeBytes: (a, v) => original.writeBytes(a, v),
      };
      const owner = this;
      const dependencies: NativeContentDependencies = {
        io: this.services.io,
        allocate: (target, allocator, bytes, alignment) => this.allocate(target, allocator, bytes, alignment),
        release: (target, allocator, pointer) => this.release(target, allocator, pointer),
        get copy() { return owner.services.copy; }, get zero() { return owner.services.zero; },
        get crtAllocate() { return owner.services.crtAllocate; },
        crtFree: pointer => this.free(pointer),
      };
      const content = new NativeContentStream(memory, dependencies, this.gsBase, at(entryStack, -0x60n));
      this.unwrap(content.readAll(stream, vector));
      // The native caller ignores readAll's AL result, then compares signed count.
      let position = 0;
      if (bomMode === 1 && this.int(at(vector, 12n)) >= 3) {
        const byteAt = (index: number) => index < 0 || this.int(at(vector, 12n)) <= index ? 0 : this.memory.readByte(at(this.q(vector), BigInt(index))) & 255;
        if (byteAt(0) === 0xef && byteAt(1) === 0xbb && byteAt(2) === 0xbf) position = 3;
      }
      const reader = this.malloc(88n, 0x142540696n); this.wq(at(entryStack, 0x20n), reader);
      if (reader === 0n) throw new FactoryStop({ kind: 'native-memory-fault', nativeAddress: 0x1425406ben, address: 0n, access: 'read', bytes: 8 });
      this.memory.writeByte(at(entryStack, -0x38n), 1);
      const character = new NativeCharacterReader(this.memory, { get copy() { return owner.services.copy; }, get size() { return owner.services.readerSize; } });
      const output = this.unwrap(character.construct(reader, vector, mode, 0, at(entryStack, -0x60n)));
      const target = this.q(at(this.q(output), 0x50n));
      if (target === 0x142573a50n) this.unwrap(character.seek(output, position));
      else { if (!this.services.readerSeek) this.stop('reader-seek', target, 0x1425406c6n); this.services.readerSeek(target, output, position); }
      this.unwrap(content.destroyStream(stream)); return output;
    });
  }
}
