import { NativeFileIo } from './file-io';
import type { NativeFileIoMemory } from './file-io';
import { NativeFileOpen } from './file-open';
import type { NativeFileOpenDependencies, NativeFileOpenResult, NativeFileOpenWorkspace } from './file-open';
export interface NativeStreamConstructionMemory extends NativeFileIoMemory { writeBytes(address: bigint, payload: Uint8Array): void }
export interface NativeStreamConstructionDependencies extends NativeFileOpenDependencies {
  crtAllocate?(bytes: bigint): bigint;
  crtFree?(pointer: bigint, bytes: bigint): void;
}
export type NativeStreamConstructionResult = { kind: 'returned'; value: bigint } | Exclude<NativeFileOpenResult, { kind: 'returned' }>;
type Stop = Exclude<NativeStreamConstructionResult, { kind: 'returned' }>;
class ConstructionStop { constructor(readonly result: Stop) {} }
const u64 = (value: bigint) => BigInt.asUintN(64, value);
export class NativeStreamConstruction {
  constructor(readonly memory: NativeStreamConstructionMemory, readonly dependencies: NativeStreamConstructionDependencies, readonly gsBase: bigint) {}
  private at(address: bigint, offset: bigint) { return u64(address + offset); }
  private q(address: bigint) { return u64(this.memory.readQword(u64(address))); }
  private d(address: bigint) { return this.memory.readDword(u64(address)) >>> 0; }
  private byte(address: bigint) { return this.memory.readByte(u64(address)) & 255; }
  private wq(address: bigint, value: bigint) { this.memory.writeQword(u64(address), u64(value)); }
  private wb(address: bigint, value: number) { this.memory.writeByte(u64(address), value & 255); }
  private block(destination: bigint, source: bigint, size: number) {
    this.memory.writeBytes(destination, Uint8Array.from({ length: size }, (_, i) => this.byte(this.at(source, BigInt(i)))));
  }
  private clear(address: bigint, size: number) { this.memory.writeBytes(address, new Uint8Array(size)); }
  private run(operation: () => bigint): NativeStreamConstructionResult {
    try { return { kind: 'returned', value: operation() }; }
    catch (error) { if (error instanceof ConstructionStop) return error.result; throw error; }
  }
  private unwrap<T>(result: { kind: 'returned'; value: T } | Stop): T { if (result.kind !== 'returned') throw new ConstructionStop(result); return result.value; }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new ConstructionStop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private allocate(size: bigint, site: bigint) {
    if (!this.dependencies.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, site);
    return u64(this.dependencies.crtAllocate(u64(size)));
  }
  private free(pointer: bigint, size: bigint, site: bigint) {
    if (!this.dependencies.crtFree) this.stop('crt-free', 0x1425a0218n, site);
    this.dependencies.crtFree(pointer, u64(size));
  }
  private copy(destination: bigint, source: bigint, size: bigint, site: bigint) {
    if (!this.dependencies.copy1426079d0) this.stop('crt-copy', 0x1426079d0n, site);
    this.dependencies.copy1426079d0(u64(destination), u64(source), u64(size));
  }
  private stringStorage(size: bigint, copyConstructor: boolean): { pointer: bigint; capacity: bigint } {
    let capacity = size | 15n;
    if (capacity > 0x7fffffffffffffffn) capacity = 0x7fffffffffffffffn; else if (capacity < 22n) capacity = 22n;
    if (capacity + 1n < 4096n) return { pointer: this.allocate(capacity + 1n, copyConstructor ? 0x14011f83en : 0x14011f0ecn), capacity };
    const allocation = this.allocate(u64(capacity + 0x28n), copyConstructor ? 0x14011f7f7n : 0x14011f0a4n);
    if (allocation === 0n) this.stop('invalid-parameter', 0x1425c7db4n, copyConstructor ? 0x14011f876n : 0x14011f12cn);
    const pointer = u64(allocation + 0x27n) & ~31n; this.wq(this.at(pointer, -8n), allocation); return { pointer, capacity };
  }
  private copyString(output: bigint, input: bigint) {
    this.clear(output, 16); this.wq(this.at(output, 16n), 0n); this.wq(this.at(output, 24n), 0n);
    const size = this.q(this.at(input, 16n)), source = this.q(this.at(input, 24n)) > 15n ? this.q(input) : input;
    if (size > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f882n);
    if (size <= 15n) { this.wq(this.at(output, 16n), size); this.wq(this.at(output, 24n), 15n); this.block(output, source, 16); return; }
    const { pointer, capacity } = this.stringStorage(size, true);
    this.wq(output, pointer); this.wq(this.at(output, 16n), size); this.wq(this.at(output, 24n), capacity);
    this.copy(pointer, source, u64(size + 1n), 0x14011f858n);
  }
  private constructString(output: bigint, source: bigint, size: bigint) {
    if (size > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f138n);
    if (size <= 15n) { this.wq(this.at(output, 16n), size); this.wq(this.at(output, 24n), 15n); this.copy(output, source, size, 0x14011f073n); this.wb(this.at(output, size), 0); return; }
    const { pointer, capacity } = this.stringStorage(size, false);
    this.wq(output, pointer); this.wq(this.at(output, 16n), size); this.wq(this.at(output, 24n), capacity); this.copy(pointer, source, size, 0x14011f108n); this.wb(this.at(pointer, size), 0);
  }
  private freeString(input: bigint, site: bigint, invalidSite: bigint) {
    let size = u64(this.q(this.at(input, 24n)) + 1n); if (this.q(this.at(input, 24n)) <= 15n) return;
    let pointer = this.q(input);
    if (size >= 4096n) { size = u64(size + 0x27n); const allocation = this.q(this.at(pointer, -8n)); if (u64(pointer - allocation - 8n) > 31n) this.stop('invalid-parameter', 0x1425c7db4n, invalidSite); pointer = allocation; }
    this.free(pointer, size, site);
  }
  private lastError() {
    const index = this.d(0x143693a98n), block = this.q(this.at(this.q(this.at(this.gsBase, 0x58n)), BigInt(index) * 8n));
    const code = this.d(this.at(block, 0x20e4n)); this.memory.writeDword(this.at(block, 0x20e4n), 0); return code;
  }
  private errorPointer(code: number) {
    if (code > 29) return 0n;
    const pointers = [0x142c07fa0n, 0x142c07fb0n, 0x142c03620n, 0x142c07fc0n, 0x1429f20a0n, 0x142c07fd0n, 0x142c07fe0n, 0x142c07ff0n, 0x142c08008n, 0x1427b3db8n,
      0x142c08020n, 0x142c08030n, 0x142c08040n, 0x142c08058n, 0x142c08078n, 0x142c08090n, 0x142c080a8n, 0x142c080b8n, 0x142c080d0n, 0x142c080e0n,
      0x142c08100n, 0x142c08110n, 0x142c08128n, 0x142c08148n, 0x142c08168n, 0x142c08190n, 0x142c081a8n, 0x142c081c0n, 0x142c081d8n, 0x142c081e8n];
    return pointers[code]!;
  }
  private invalidMode(output: bigint, text: bigint, copied: bigint, flag: bigint, site: bigint, freeSite: bigint, invalidSite: bigint) {
    this.clear(text, 16); this.block(this.at(text, 16n), 0x1427959f0n, 16); this.block(text, 0x1427e38a8n, 14); this.wb(this.at(text, 14n), this.byte(0x1427e38b6n)); this.wb(this.at(text, 15n), 0);
    if (this.byte(0x14368f610n) && !this.byte(flag)) this.stop('diagnostic-assertion', 0x14254ab40n, site);
    this.copyString(copied, text); this.block(output, copied, 16); this.block(this.at(output, 16n), this.at(copied, 16n), 16); this.wb(this.at(output, 32n), 0);
    this.freeString(text, freeSite, invalidSite); return output;
  }
  private createEngineValue(output: bigint, path: bigint, mode: number, bufferBytes: number, entryStack: bigint, workspace: NativeFileOpenWorkspace): bigint {
    mode |= 0; bufferBytes >>>= 0; const frame = this.at(entryStack, -0x1a8n), text = this.at(frame, 0x30n);
    if (mode === 1 || mode === 2) this.stop('write-path-prepare', 0x1425602a0n, mode === 1 ? 0x14256259fn : 0x14256258dn);
    if (mode !== 0) {
      return this.invalidMode(output, text, this.at(frame, 0x60n), 0x1436917cbn, 0x14256250bn, 0x142562580n, 0x14256278cn);
    }
    const handle = this.unwrap(new NativeFileOpen(this.memory, this.dependencies, this.gsBase).openRead(path, workspace));
    if (handle === 0n) {
      const error = this.errorPointer(this.lastError()), source = error === 0n ? 0x1427a2ba0n : error;
      this.clear(text, 16); this.clear(this.at(text, 16n), 16); let size = 0n; while (this.byte(this.at(source, size)) !== 0) size++;
      this.constructString(text, source, size); this.block(output, text, 16); this.block(this.at(output, 16n), this.at(text, 16n), 16); this.wb(this.at(output, 32n), 0); return output;
    }
    if (bufferBytes !== 0 && this.unwrap(new NativeFileIo(this.memory, this.dependencies, this.gsBase).setBuffer(handle, BigInt(bufferBytes))) === 0) this.stop('buffer-failure-log', 0x14254bce0n, 0x1425625den);
    const pointer = this.allocate(24n, 0x1425626d8n); this.wq(this.at(frame, 0x58n), pointer);
    if (pointer !== 0n) { this.wb(this.at(pointer, 8n), mode !== 0 ? 1 : 0); this.wq(pointer, 0x142c05ff8n); this.wq(this.at(pointer, 16n), handle); }
    this.wq(output, pointer); this.wb(this.at(output, 32n), 1); return output;
  }
  createEngine(output: bigint, path: bigint, mode: number, bufferBytes: number, entryStack: bigint, workspace: NativeFileOpenWorkspace): NativeStreamConstructionResult {
    return this.run(() => this.createEngineValue(output, path, mode, bufferBytes, entryStack, workspace));
  }
  constructStream(output: bigint, record: bigint, mode: number, bufferBytes: number, entryStack: bigint, workspace: NativeFileOpenWorkspace): NativeStreamConstructionResult {
    return this.run(() => {
      mode |= 0; bufferBytes >>>= 0; this.wq(this.at(entryStack, 8n), output); this.wq(output, 0x142c06138n); this.wq(this.at(output, 8n), 0n);
      this.copyString(this.at(output, 16n), record); this.memory.writeDword(this.at(output, 48n), mode);
      const frame = this.at(entryStack, -0x68n), result = this.at(frame, 0x20n);
      if (this.q(this.at(record, 0x30n)) !== 0n) {
        if (mode === 0 || mode === 1 || mode === 2) this.stop('physical-path-wide-conversion', 0x14257fde0n, 0x142562257n);
        this.invalidMode(result, this.at(entryStack, -0x158n), this.at(entryStack, -0xd0n), 0x1436917cdn, 0x1425621bfn, 0x1425623b5n, 0x142562412n);
      } else {
        const path = this.q(this.at(record, 24n)) > 15n ? this.q(record) : record;
        this.createEngineValue(result, path, mode, bufferBytes, this.at(entryStack, -0x190n), workspace);
      }
      if (this.byte(this.at(result, 32n)) !== 0) this.wq(this.at(output, 8n), this.q(result));
      else { if (this.byte(this.at(entryStack, 0x28n)) !== 0) this.stop('stream-open-diagnostic', 0x142565c50n, 0x1425649aen); this.freeString(result, 0x1425649f0n, 0x142564a0fn); }
      return output;
    });
  }
}
