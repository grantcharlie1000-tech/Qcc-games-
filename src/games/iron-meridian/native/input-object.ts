import type { NativeContentMemory } from './content-stream';
import type { NativeFileOpenDependencies, NativeFileOpenWorkspace } from './file-open';
import type { KeywordRecordServices } from './keyword-record';
import { NativeKeywordRecord } from './keyword-record';
import { NativeInputFactory } from './input-factory';
import { NativeStreamConstruction } from './engine-construction';
import type { NativeStreamConstructionDependencies } from './engine-construction';
import type { NativeKeywordRegistry } from './keyword-registry';
export type InputObjectMemory = NativeContentMemory;
export interface InputObjectServices extends KeywordRecordServices {
  readonly file: NativeFileOpenDependencies;
  zero?(destination: bigint, value: number, bytes: bigint): void;
  readerSeek?(target: bigint, reader: bigint, position: number): number;
  readerSize?(target: bigint, reader: bigint): bigint;
}
export type InputObjectResult<T> = { kind: 'returned'; value: T }
  | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint; callSite: bigint }
  | { kind: 'native-memory-fault'; nativeAddress: bigint; address: bigint; access: 'read' | 'write'; bytes: number }
  | { kind: 'native-exception'; code: number; nativeAddress: bigint }
  | { kind: 'native-assertion'; line: number; nativeAddress: bigint };
type Failure = Exclude<InputObjectResult<never>, { kind: 'returned' }>;
class ObjectStop { constructor(readonly result: Failure) {} }
const u64 = (v: bigint) => BigInt.asUintN(64, v), at = (a: bigint, offset: bigint) => u64(a + offset);
export class NativeInputObject {
  constructor(readonly memory: InputObjectMemory, readonly services: InputObjectServices, readonly gsBase: bigint, readonly registry?: NativeKeywordRegistry) {}
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private int(a: bigint) { return this.memory.readDword(u64(a)) | 0; }
  private wb(a: bigint, v: number) { this.memory.writeByte(u64(a), v & 255); }
  private wd(a: bigint, v: number) { this.memory.writeDword(u64(a), v >>> 0); }
  private wq(a: bigint, v: bigint) { this.memory.writeQword(u64(a), u64(v)); }
  private run<T>(operation: () => T): InputObjectResult<T> {
    try { return { kind: 'returned', value: operation() }; }
    catch (error) { if (error instanceof ObjectStop) return error.result; throw error; }
  }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new ObjectStop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private unwrap<T>(result: { kind: 'returned'; value: T } | Failure): T {
    if (result.kind === 'returned') return result.value;
    if (result.kind === 'runtime-required' && result.boundary === 'crt-free') this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
    throw new ObjectStop(result);
  }
  private malloc(bytes: bigint, site: bigint) {
    if (!this.services.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, site);
    return u64(this.services.crtAllocate(u64(bytes)));
  }
  private free(pointer: bigint) {
    if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
    this.services.crtFree(u64(pointer));
  }
  private copy(destination: bigint, source: bigint, count: bigint, site: bigint) {
    if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, site);
    this.services.copy(u64(destination), u64(source), u64(count));
  }
  private backing(allocator: bigint, site: bigint) {
    const target = this.q(at(this.q(allocator), 0x38n));
    if (target === 0x1401693c0n) return this.q(at(allocator, 0x20n));
    if (!this.services.allocatorGetter) this.stop('allocator-getter', target, site);
    return u64(this.services.allocatorGetter(target, allocator));
  }
  private allocate(allocator: bigint, bytes: bigint, site: bigint): bigint {
    const target = this.q(at(this.q(allocator), 8n));
    if (target === 0x140121d20n) return this.allocate(this.backing(allocator, 0x140121d33n), bytes, 0x140121d50n);
    if (target === 0x14011d540n) return this.malloc(bytes, 0x14011d547n);
    if (!this.services.allocate) this.stop('allocator-allocate', target, site);
    return u64(this.services.allocate(target, allocator, u64(bytes), 1));
  }
  private release(allocator: bigint, pointer: bigint, site: bigint): void {
    const target = this.q(at(this.q(allocator), 0x10n));
    if (target === 0x140122500n) { if (pointer !== at(allocator, 8n)) this.release(this.backing(allocator, 0x140122515n), pointer, 0x140122526n); return; }
    if (target === 0x14011d560n) { if (pointer !== 0n) this.free(pointer); return; }
    if (!this.services.release) this.stop('allocator-release', target, site);
    this.services.release(target, allocator, pointer);
  }
  private capacity(old: number, minimum: number) {
    const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, this.memory.readDword(0x142795988n), true);
    const value = Math.fround(Math.fround(old) * view.getFloat32(0, true));
    const converted = !Number.isFinite(value) || value >= 2147483648 || value < -2147483648 ? -2147483648 : Math.trunc(value);
    return converted < minimum ? minimum : converted;
  }
  private append(token: bigint, index: number, value: number) {
    index >>>= 0; value &= 255;
    if (index < (this.memory.readDword(at(token, 0x14n)) >>> 0)) { this.wb(at(this.q(at(token, 8n)), BigInt(index | 0)), value); return; }
    const count = this.int(at(token, 0x14n)), oldCapacity = this.int(at(token, 0x10n));
    if (count !== oldCapacity) {
      this.wb(at(this.q(at(token, 8n)), BigInt(count)), value);
      // Native INC rereads the count after the potentially aliased byte store.
      this.wd(at(token, 0x14n), this.int(at(token, 0x14n)) + 1); return;
    }
    const capacity = this.capacity(oldCapacity, count + 1 | 0), destination = this.allocate(this.q(at(token, 0x18n)), BigInt(capacity >>> 0), 0x1425481fcn);
    this.wb(at(destination, BigInt(this.int(at(token, 0x14n)))), value);
    this.copy(destination, this.q(at(token, 8n)), BigInt(this.int(at(token, 0x14n))), 0x142548214n);
    const next = this.int(at(token, 0x14n)) + 1 | 0, allocator = this.q(at(token, 0x18n)), pointer = this.q(at(token, 8n));
    this.wd(at(token, 0x14n), 0); this.release(allocator, pointer, 0x142548230n);
    this.wq(at(token, 8n), destination); this.wd(at(token, 0x10n), capacity); this.wd(at(token, 0x14n), next);
  }
  appendByte(token: bigint, index: number, value: number): InputObjectResult<null> { return this.run(() => { this.append(u64(token), index, value); return null; }); }
  private assign(output: bigint, source: bigint, count: bigint) {
    const oldCapacity = this.q(at(output, 24n));
    if (count <= oldCapacity) {
      const destination = oldCapacity > 15n ? this.q(output) : output;
      this.wq(at(output, 16n), count); this.copy(destination, source, count, 0x14012b3f7n); this.wb(at(destination, count), 0); return output;
    }
    const maximum = 0x7fffffffffffffffn;
    if (count > maximum) this.stop('string-length-error', 0x14012b310n, 0x14012b50fn);
    const proposed = count | 15n, half = oldCapacity >> 1n;
    const capacity = proposed > maximum || oldCapacity > maximum - half ? maximum : proposed < oldCapacity + half ? oldCapacity + half : proposed;
    const size = u64(capacity + 1n); let destination = 0n;
    if (size !== 0n) {
      if (size < 4096n) destination = this.malloc(size, 0x14012b49bn);
      else {
        const total = u64(size + 0x27n);
        if (total <= size) this.stop('allocation-overflow', 0x14012b2d0n, 0x14012b515n);
        const raw = this.malloc(total, 0x14012b47fn);
        if (raw === 0n) this.stop('invalid-parameter', 0x1425c7db4n, 0x14012b51bn);
        destination = u64(raw + 0x27n) & ~31n; this.wq(at(destination, -8n), raw);
      }
    }
    this.wq(at(output, 16n), count); this.wq(at(output, 24n), capacity);
    this.copy(destination, source, count, 0x14012b4b4n); this.wb(at(destination, count), 0);
    if (oldCapacity > 15n) {
      let pointer = this.q(output);
      if (u64(oldCapacity + 1n) >= 4096n) {
        const raw = this.q(at(pointer, -8n));
        if (u64(pointer - raw - 8n) > 31n) this.stop('invalid-parameter', 0x1425c7db4n, 0x14012b51bn);
        pointer = raw;
      }
      this.free(pointer);
    }
    this.wq(output, destination); return output;
  }
  assignName(output: bigint, source: bigint, count: bigint): InputObjectResult<bigint> { return this.run(() => this.assign(u64(output), u64(source), u64(count))); }
  construct(object: bigint, nameRecord: bigint, mode: number, bomMode: number, entryStack: bigint, workspace: NativeFileOpenWorkspace): InputObjectResult<bigint> {
    return this.run(() => {
      object = u64(object); nameRecord = u64(nameRecord); entryStack = u64(entryStack); mode |= 0; bomMode |= 0;
      this.wq(at(entryStack, 8n), object);
      this.wq(object, 0x142c04d80n); this.wd(at(object, 0x18n), 0); this.wb(at(object, 0x1cn), 0);
      this.unwrap(new NativeKeywordRecord(this.memory, this.services, this.gsBase).initializeVector(at(object, 0x20n)));
      this.wd(at(object, 0x60n), bomMode); this.wb(at(object, 0x64n), 0); this.wb(at(object, 0x65n), 1);
      this.wb(at(entryStack, -0x68n), 1);
      const owner = this;
      // Inherit individual file services without freezing their callback identity.
      const file = Object.create(this.services.file) as NativeStreamConstructionDependencies;
      Object.defineProperties(file, {
        crtAllocate: { get() { return owner.services.crtAllocate; } },
        crtFree: { value(pointer: bigint) { owner.free(pointer); } },
        copy1426079d0: { get() { return owner.services.copy; } },
      });
      const childStack = at(entryStack, -0x90n);
      const stream = this.unwrap(new NativeStreamConstruction(this.memory, file, this.gsBase).constructStream(at(entryStack, -0x58n), nameRecord, 0, 0x100000, childStack, workspace));
      const factory = new NativeInputFactory(this.memory, {
        io: file,
        get crtAllocate() { return owner.services.crtAllocate; }, crtFree(pointer) { owner.free(pointer); },
        get copy() { return owner.services.copy; }, get zero() { return owner.services.zero; },
        get allocate() { return owner.services.allocate; }, get release() { return owner.services.release; },
        get readerSeek() { return owner.services.readerSeek; }, get readerSize() { return owner.services.readerSize; },
      }, this.gsBase);
      const reader = this.unwrap(factory.create(stream, mode, bomMode, childStack)); this.wq(at(object, 8n), reader);
      const nameOutput = at(reader, 0x18n);
      if (nameOutput !== nameRecord) {
        const count = this.q(at(nameRecord, 0x10n)), source = this.q(at(nameRecord, 0x18n)) > 15n ? this.q(nameRecord) : nameRecord;
        this.assign(nameOutput, source, count);
      }
      if ((this.memory.readByte(0x14368f570n) & 255) === 0) {
        if (!this.registry) this.stop('keyword-registry', 0x1425401b0n, 0x14253db82n);
        const result = this.registry.populate(childStack); if (result.kind !== 'complete') throw new ObjectStop(result);
      }
      this.wd(at(object, 0x18n), 0); this.append(at(object, 0x18n), 0, 0); return object;
    });
  }
}
