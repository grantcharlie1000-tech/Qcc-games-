export interface CharacterClassMemory {
  readByte(address: bigint): number;
  readQword(address: bigint): bigint;
  writeByte(address: bigint, value: number): void;
}
export interface CharacterClassServices {
  /** Resolved import address and its individual four-argument WinAPI leaf. */
  getStringTypeW?: { address: bigint; call(informationType: number, source: bigint, count: number, output: bigint): bigint };
}
export type CharacterClassResult = { kind: 'returned'; value: number }
  | { kind: 'runtime-required'; boundary: 'get-string-type-w'; nativeAddress: bigint; callSite: 0x142605870n };
const u64 = (value: bigint) => BigInt.asUintN(64, value);
export class NativeCharacterClasses {
  constructor(readonly memory: CharacterClassMemory, readonly services: CharacterClassServices = {}) {}
  private word(address: bigint) { return (this.memory.readByte(u64(address)) & 255) | (this.memory.readByte(u64(address + 1n)) & 255) << 8; }
  private storeWord(address: bigint, value: number) { this.memory.writeByte(u64(address), value & 255); this.memory.writeByte(u64(address + 1n), value >>> 8 & 255); }
  classify(character: bigint | number, mask: bigint | number, entryStack: bigint): CharacterClassResult {
    // EBX captures DX before either semantic stack home or the import callback.
    const capturedMask = Number(BigInt.asUintN(16, BigInt(mask)));
    const code = Number(BigInt.asUintN(16, BigInt(character)));
    if (code === 0xffff) return { kind: 'returned', value: 0 };
    if (code < 256) {
      const table = u64(this.memory.readQword(0x143140320n));
      return { kind: 'returned', value: this.word(u64(table + BigInt(code * 2))) & capturedMask };
    }
    const source = u64(entryStack + 0x18n), output = u64(entryStack + 8n);
    this.storeWord(source, code); this.storeWord(output, 0);
    // Original142605870 JMP [142785228] is traversed before resolving this leaf.
    const target = u64(this.memory.readQword(0x142785228n)), service = this.services.getStringTypeW;
    if (!service || u64(service.address) !== target) return { kind: 'runtime-required', boundary: 'get-string-type-w', nativeAddress: target, callSite: 0x142605870n };
    const succeeded = BigInt.asUintN(32, service.call(1, source, 1, output)) !== 0n;
    return { kind: 'returned', value: succeeded ? this.word(output) & capturedMask : 0 };
  }
  whitespace(character: bigint | number, entryStack: bigint): CharacterClassResult { return this.classify(character, 8, entryStack); }
}
