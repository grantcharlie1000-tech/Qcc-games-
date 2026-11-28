export interface CharacterReaderMemory {
  readByte(address: bigint): number;
  readDword(address: bigint): number;
  readQword(address: bigint): bigint;
  writeByte(address: bigint, value: number): void;
  writeDword(address: bigint, value: number): void;
  writeQword(address: bigint, value: bigint): void;
  writeBytes(address: bigint, value: Uint8Array): void;
}
export interface CharacterReaderServices {
  copy?(destination: bigint, source: bigint, count: bigint): void;
  size?(target: bigint, reader: bigint): bigint;
  rewind?(target: bigint, reader: bigint): void;
}
export type CharacterReaderResult<T> = { kind: 'returned'; value: T }
  | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint; callSite: bigint };
class ReaderStop {
  constructor(readonly result: Extract<CharacterReaderResult<never>, { kind: 'runtime-required' }>) {}
}
const u64 = (value: bigint) => BigInt.asUintN(64, value);
const at = (address: bigint, offset: bigint) => u64(address + offset);

/** Concrete142C06C80 input, including the fixed empty-path constructor branch. */
export class NativeCharacterReader {
  constructor(private readonly memory: CharacterReaderMemory, private readonly services: CharacterReaderServices = {}) {}
  private q(address: bigint) { return u64(this.memory.readQword(u64(address))); }
  private int(address: bigint) { return this.memory.readDword(u64(address)) | 0; }
  private byte(address: bigint) { return this.memory.readByte(u64(address)) & 255; }
  private wq(address: bigint, value: bigint) { this.memory.writeQword(u64(address), u64(value)); }
  private wd(address: bigint, value: number) { this.memory.writeDword(u64(address), value >>> 0); }
  private wb(address: bigint, value: number) { this.memory.writeByte(u64(address), value & 255); }
  private bytes(address: bigint, count: number) { return Uint8Array.from({ length: count }, (_, index) => this.byte(at(address, BigInt(index)))); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new ReaderStop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private run<T>(operation: () => T): CharacterReaderResult<T> {
    try { return { kind: 'returned', value: operation() }; }
    catch (error) { if (error instanceof ReaderStop) return error.result; throw error; }
  }
  private copy(destination: bigint, source: bigint, count: bigint, site: bigint) {
    if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, site);
    this.services.copy(u64(destination), u64(source), u64(count));
  }
  private sizeValue(reader: bigint): bigint {
    const vector = this.q(at(reader, 0x38n));
    return BigInt(this.int(vector === 0n ? at(reader, 0x48n) : at(vector, 0xcn)));
  }
  private virtualSize(reader: bigint, site: bigint): bigint {
    const target = this.q(at(this.q(reader), 0x70n));
    if (target === 0x1425737b0n) return this.sizeValue(reader);
    if (!this.services.size) this.stop('reader-size', target, site);
    return BigInt.asIntN(64, this.services.size(target, reader));
  }
  private rewindValue(reader: bigint) { this.wb(at(reader, 0x54n), 0); this.wd(at(reader, 0x4cn), 0); }
  private source(reader: bigint) { const vector = this.q(at(reader, 0x38n)); return vector === 0n ? this.q(at(reader, 0x40n)) : this.q(vector); }
  construct(reader: bigint, vector: bigint, mode: number, origin: number, entryStack: bigint): CharacterReaderResult<bigint> {
    return this.run(() => {
      const temporary = at(entryStack, -0x28n);
      this.memory.writeBytes(temporary, new Uint8Array(16)); this.wq(at(temporary, 0x10n), 0n); this.wq(at(temporary, 0x18n), 0n);
      this.wq(at(temporary, 0x10n), 0n); this.wq(at(temporary, 0x18n), 15n);
      this.copy(temporary, 0x14279471dn, 0n, 0x14011f073n); this.wb(temporary, 0);
      this.wd(at(reader, 8n), 1); this.wq(reader, 0x142c07950n); this.wb(at(reader, 0xcn), 0); this.wb(at(reader, 0xdn), 0);
      this.wd(at(reader, 0x10n), mode); this.wd(at(reader, 0x14n), origin);
      this.memory.writeBytes(at(reader, 0x18n), new Uint8Array(16)); this.wq(at(reader, 0x28n), 0n); this.wq(at(reader, 0x30n), 0n);
      this.memory.writeBytes(at(reader, 0x18n), this.bytes(temporary, 16)); this.memory.writeBytes(at(reader, 0x28n), this.bytes(at(temporary, 0x10n), 16));
      this.wq(at(temporary, 0x18n), 15n); this.wq(at(temporary, 0x10n), 0n); this.wb(temporary, 0); this.wq(at(temporary, 0x18n), 15n);
      this.wq(reader, 0x142c06c80n); this.wq(at(reader, 0x40n), 0n); this.wq(at(reader, 0x48n), 0n); this.wb(at(reader, 0x54n), 0);
      this.wb(at(reader, 0x55n), this.byte(at(entryStack, 0x28n))); this.wq(at(reader, 0x38n), vector); this.wd(at(reader, 0x50n), -1);
      return reader;
    });
  }
  size(reader: bigint): CharacterReaderResult<bigint> { return this.run(() => this.sizeValue(reader)); }
  readByte(reader: bigint): CharacterReaderResult<number> {
    return this.run(() => {
      const previous = this.byte(at(reader, 0xcn));
      if (previous === 10) this.wd(at(reader, 8n), this.int(at(reader, 8n)) + 1);
      if (this.byte(at(reader, 0xdn))) { this.wb(at(reader, 0xdn), 0); return previous; }
      const position = this.int(at(reader, 0x4cn)), size = this.virtualSize(reader, 0x142573775n);
      const value = BigInt(position) < size ? this.byte(at(this.source(reader), BigInt(position))) : 255;
      this.wd(at(reader, 0x4cn), position + 1); this.wb(at(reader, 0xcn), value); return value;
    });
  }
  unreadByte(reader: bigint): CharacterReaderResult<null> { return this.run(() => { this.wb(at(reader, 0xdn), 1); if (this.byte(at(reader, 0xcn)) === 10) this.wd(at(reader, 8n), this.int(at(reader, 8n)) - 1); return null; }); }
  seek(reader: bigint, position: number): CharacterReaderResult<number> {
    return this.run(() => { position |= 0; const size = this.virtualSize(reader, 0x142573a63n); if (BigInt(position) > size || position < 0) return 0; this.wd(at(reader, 0x4cn), position); return 1; });
  }
  moveToEnd(reader: bigint): CharacterReaderResult<null> { return this.run(() => { this.wd(at(reader, 0x4cn), Number(BigInt.asUintN(32, this.virtualSize(reader, 0x142573a3cn)))); return null; }); }
  rewind(reader: bigint): CharacterReaderResult<number> { return this.run(() => { this.rewindValue(reader); return 1; }); }
  readInto(reader: bigint, destination: bigint, count: number): CharacterReaderResult<number> {
    return this.run(() => { count |= 0; const position = this.int(at(reader, 0x4cn)); if (this.virtualSize(reader, 0x142573965n) < BigInt(position + count | 0)) return 0;
      this.copy(destination, at(this.source(reader), BigInt(position)), BigInt(count), 0x142573996n); this.wd(at(reader, 0x4cn), this.int(at(reader, 0x4cn)) + count); return 1; });
  }
  checksum(reader: bigint, count: number): CharacterReaderResult<number> {
    return this.run(() => {
      count |= 0; if (count === -1) count = Number(BigInt.asIntN(32, this.virtualSize(reader, 0x1425736b5n)));
      const target = this.q(at(this.q(reader), 0x60n));
      if (target === 0x142573a20n) this.rewindValue(reader);
      else { if (!this.services.rewind) this.stop('reader-rewind', target, 0x1425736c1n); this.services.rewind(target, reader); }
      const source = this.source(reader); let first = 0, second = 0;
      if (count > 0) while (true) {
        const position = this.int(at(reader, 0x4cn)); if (count <= position) break;
        first += this.byte(at(source, BigInt(position))); if (first > 65535) first -= 65535;
        this.wd(at(reader, 0x4cn), position + 1); second += first; if (second > 65535) second -= 65535;
      }
      return (first << 16 | second) >>> 0;
    });
  }
}
