export interface KeywordRecordMemory {
  readByte(address: bigint): number;
  readDword(address: bigint): number;
  readQword(address: bigint): bigint;
  writeByte(address: bigint, value: number): void;
  writeDword(address: bigint, value: number): void;
  writeQword(address: bigint, value: bigint): void;
}
export interface KeywordRecordServices {
  crtAllocate?(bytes: bigint): bigint;
  crtFree?(pointer: bigint): void;
  copy?(destination: bigint, source: bigint, bytes: bigint): void;
  allocate?(target: bigint, allocator: bigint, bytes: bigint, alignment: number): bigint;
  release?(target: bigint, allocator: bigint, pointer: bigint): void;
  allocatorGetter?(target: bigint, allocator: bigint): bigint;
  inlineBuffer?(target: bigint, allocator: bigint, pointerOutput: bigint, capacityOutput: bigint): void;
}
export type KeywordRecordResult = { kind: 'returned'; value: bigint } | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint; callSite: bigint };
type RuntimeStop = Exclude<KeywordRecordResult, { kind: 'returned' }>;
class RecordStop { constructor(readonly result: RuntimeStop) {} }
const u64 = (value: bigint) => BigInt.asUintN(64, value);
export class NativeKeywordRecord {
  constructor(private readonly memory: KeywordRecordMemory, private readonly services: KeywordRecordServices, private readonly gsBase: bigint) {}
  private at(address: bigint, offset: bigint) { return u64(address + offset); }
  private q(address: bigint) { return u64(this.memory.readQword(u64(address))); }
  private int(address: bigint) { return this.memory.readDword(u64(address)) | 0; }
  private wb(address: bigint, value: number) { this.memory.writeByte(u64(address), value & 255); }
  private wd(address: bigint, value: number) { this.memory.writeDword(u64(address), value >>> 0); }
  private wq(address: bigint, value: bigint) { this.memory.writeQword(u64(address), u64(value)); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new RecordStop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private run(operation: () => bigint): KeywordRecordResult {
    try { return { kind: 'returned', value: operation() }; }
    catch (error) { if (error instanceof RecordStop) return error.result; throw error; }
  }
  private backing(allocator: bigint, site: bigint): bigint {
    const target = this.q(this.at(this.q(allocator), 0x38n));
    if (target === 0x1401693c0n) return this.q(this.at(allocator, 0x20n));
    if (!this.services.allocatorGetter) this.stop('allocator-getter', target, site);
    return u64(this.services.allocatorGetter(target, allocator));
  }
  private allocate(allocator: bigint, bytes: bigint, alignment: number, site: bigint): bigint {
    const target = this.q(this.at(this.q(allocator), 8n));
    if (target === 0x140121d20n) return this.allocate(this.backing(allocator, 0x140121d33n), bytes, alignment, 0x140121d50n);
    if (target === 0x14011d540n) {
      if (!this.services.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, 0x14011d547n);
      return u64(this.services.crtAllocate(bytes));
    }
    if (!this.services.allocate) this.stop('allocator-allocate', target, site);
    return u64(this.services.allocate(target, allocator, bytes, alignment >>> 0));
  }
  private release(allocator: bigint, pointer: bigint, site: bigint): void {
    const target = this.q(this.at(this.q(allocator), 0x10n));
    if (target === 0x140122500n) {
      if (pointer !== this.at(allocator, 8n)) this.release(this.backing(allocator, 0x140122515n), pointer, 0x140122526n);
      return;
    }
    if (target === 0x14011d560n) {
      if (pointer !== 0n) {
        if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
        this.services.crtFree(pointer);
      }
      return;
    }
    if (!this.services.release) this.stop('allocator-release', target, site);
    this.services.release(target, allocator, pointer);
  }
  private copy(destination: bigint, source: bigint, bytes: bigint, site: bigint) {
    if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, site);
    this.services.copy(destination, source, bytes);
  }
  private initialize(vector: bigint): bigint {
    // 14014D704 captures GS:[58] before any potentially aliased header write.
    const table = this.q(this.at(this.gsBase, 0x58n));
    const local = this.at(vector, 0x18n);
    // 14014D713..71D stores the allocator pointer before clearing both header qwords.
    this.wq(this.at(vector, 0x10n), local); this.wq(vector, 0n); this.wq(this.at(vector, 8n), 0n);
    const index = this.memory.readDword(0x143693a98n) >>> 0;
    const thread = this.q(this.at(table, BigInt(index) * 8n));
    if (this.int(this.at(thread, 0x20ecn)) < this.int(0x1433dd120n)) this.stop('tls-guard-acquire', 0x1425a0588n, 0x14014d7b5n);
    this.wq(local, 0x142796130n); this.wq(this.at(local, 0x20n), 0x1430fd000n);
    const allocator = this.q(this.at(vector, 0x10n)), pointer = this.q(vector);
    this.wd(this.at(vector, 0xcn), 0); this.release(allocator, pointer, 0x14014d75dn);
    this.wq(vector, 0n);
    const vtable = this.q(local);
    this.wd(this.at(vector, 8n), 0);
    const target = this.q(this.at(vtable, 0x20n));
    if (target === 0x1401691d0n) {
      this.wd(this.at(vector, 8n), 0x15); this.wq(vector, this.at(local, 8n));
    } else {
      if (!this.services.inlineBuffer) this.stop('inline-buffer', target, 0x14014d793n);
      this.services.inlineBuffer(target, local, vector, this.at(vector, 8n));
    }
    return vector;
  }
  private resized(record: bigint, requested: number): bigint {
    requested |= 0;
    if (requested <= this.int(this.at(record, 0x14n))) { this.wd(this.at(record, 0x14n), requested); return this.q(this.at(record, 8n)); }
    const oldCapacity = this.int(this.at(record, 0x10n));
    if (requested <= oldCapacity) { this.wd(this.at(record, 0x14n), requested); return this.q(this.at(record, 8n)); }
    const allocator = this.q(this.at(record, 0x18n));
    const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, this.memory.readDword(0x142795988n), true);
    const product = Math.fround(Math.fround(oldCapacity) * view.getFloat32(0, true));
    const converted = !Number.isFinite(product) || product >= 2147483648 || product < -2147483648 ? -2147483648 : Math.trunc(product);
    const capacity = converted < requested ? requested : converted;
    const destination = this.allocate(allocator, BigInt(capacity >>> 0), 1, 0x142547890n);
    // Both source and signed count reload after allocation. Release reloads after copy.
    const count = u64(BigInt(this.int(this.at(record, 0x14n))));
    const source = this.q(this.at(record, 8n));
    this.copy(destination, source, count, 0x1425478a1n);
    this.release(this.q(this.at(record, 0x18n)), this.q(this.at(record, 8n)), 0x1425478b1n);
    this.wq(this.at(record, 8n), destination); this.wd(this.at(record, 0x10n), capacity); this.wd(this.at(record, 0x14n), requested);
    return this.q(this.at(record, 8n));
  }
  construct(record: bigint, identifier: number, name: bigint): KeywordRecordResult {
    return this.run(() => {
      record = u64(record); name = u64(name); identifier |= 0;
      this.wd(record, 0); this.wb(this.at(record, 4n), 0); this.initialize(this.at(record, 8n));
      let length = 0n;
      while ((this.memory.readByte(this.at(name, length)) & 255) !== 0) length = u64(length + 1n);
      this.wb(this.at(record, 4n), 0); this.wd(record, identifier);
      const destination = this.resized(record, Number(BigInt.asIntN(32, length + 1n)));
      this.copy(destination, name, length, 0x14254768fn); this.wb(this.at(destination, length), 0);
      return record;
    });
  }
  resize(record: bigint, count: number): KeywordRecordResult { return this.run(() => this.resized(u64(record), count)); }
  initializeVector(vector: bigint): KeywordRecordResult { return this.run(() => this.initialize(u64(vector))); }
}
