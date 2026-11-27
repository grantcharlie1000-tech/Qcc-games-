/** Bounded original %i/%lli paths. Scanner stack/control equivalence is not claimed. */
export interface ScalarMemory {
  readByte(address: bigint): number;
  readDword(address: bigint): number;
  readQword(address: bigint): bigint;
  writeByte(address: bigint, value: number): void;
  writeDword(address: bigint, value: number): void;
  writeQword(address: bigint, value: bigint): void;
}
export type ScalarResult = { kind: 'returned'; value: boolean }
  | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint; callSite: bigint };
class ScalarStop {
  constructor(readonly result: Exclude<ScalarResult, { kind: 'returned' }>) {}
}
const u64 = (value: bigint) => BigInt.asUintN(64, value);
const i64 = (value: bigint) => BigInt.asIntN(64, value);

export class NativeScalarValues {
  constructor(private readonly memory: ScalarMemory) {}
  private b(address: bigint) { return this.memory.readByte(u64(address)) & 255; }
  private d(address: bigint) { return this.memory.readDword(u64(address)) >>> 0; }
  private q(address: bigint) { return u64(this.memory.readQword(u64(address))); }
  private wb(address: bigint, value: number) { this.memory.writeByte(u64(address), value & 255); }
  private wq(address: bigint, value: bigint) { this.memory.writeQword(u64(address), u64(value)); }
  private text(token: bigint) { return this.d(token + 0x14n) === 0 ? 0x14279471dn : this.q(token + 8n); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never {
    throw new ScalarStop({ kind: 'runtime-required', boundary, nativeAddress, callSite });
  }
  private run(body: () => boolean): ScalarResult {
    try { return { kind: 'returned', value: body() }; }
    catch (error) { if (error instanceof ScalarStop) return error.result; throw error; }
  }
  /** 1425D55F0/1425CF2C8 signed base0 accumulation used by actual i/ll-i format paths. */
  private scanKnownInteger(text: bigint, output: bigint, bits: 32 | 64): number {
    text = u64(text); output = u64(output);
    // Actual adapter calls bounded strlen before initializing its locale wrapper.
    if (this.d(0x14313ffa8n) >= 5) this.stop('crt-length-avx2-untranslated', 0x1425efbacn, 0x1425da4c1n);
    let end = text; while (this.b(end) !== 0) end = u64(end + 1n);
    if (this.d(0x143694cccn) !== 0) this.stop('crt-locale-initialization', 0x1425d04b0n, 0x1425da4d2n);
    if (this.q(0x1433dd988n) !== 0n) this.stop('crt-scan-options-untranslated', 0x1425d93acn, 0x1425da551n);
    // The locale wrapper copies143140488/490. 1425D0068 reads the first locale's ctype table.
    const ctype = this.q(this.q(0x143140488n));
    const space = (byte: number) => {
      const address = ctype + BigInt(byte * 2);
      return ((this.b(address) | this.b(address + 1n) << 8) & 8) !== 0;
    };
    let cursor = text;
    while (cursor !== end && space(this.b(cursor))) cursor = u64(cursor + 1n);
    const sign = this.b(cursor), negative = sign === 45;
    if (sign === 43 || sign === 45) cursor = u64(cursor + 1n);
    let base = 10n;
    if (this.b(cursor) === 48) {
      const next = cursor === end ? 0 : this.b(cursor + 1n);
      if (next === 120 || next === 88) { base = 16n; cursor = u64(cursor + 2n); }
      else base = 8n;
    }
    let value = 0n, hasDigit = false, overflow = false;
    for (;;) {
      const byte = cursor === end ? 0 : this.b(cursor);
      const digit = byte >= 48 && byte <= 57 ? byte - 48 : byte >= 97 && byte <= 122 ? byte - 87 : byte >= 65 && byte <= 90 ? byte - 55 : -1;
      if (digit < 0 || BigInt(digit) >= base) break;
      hasDigit = true;
      const product = value * base, sum = product + BigInt(digit);
      overflow ||= product > 0xffffffffffffffffn || sum > 0xffffffffffffffffn;
      value = u64(sum); cursor = u64(cursor + 1n);
    }
    if (!hasDigit) return cursor === end ? -1 : 0;
    overflow ||= value > (negative ? 0x8000000000000000n : 0x7fffffffffffffffn);
    if (overflow) this.stop('crt-error-state-untranslated', 0x1425c79a8n, 0x1425d5adbn);
    if (negative) value = u64(-value);
    // 1425DA360 consumes the vararg pointer and writes the requested original width.
    if (bits === 32) this.memory.writeDword(output, Number(value & 0xffffffffn));
    else this.wq(output, value);
    return 1;
  }
  /** Actual142547CE0 uses the scan return !=0, including native EOF(-1). */
  readInteger(token: bigint, output: bigint): ScalarResult {
    return this.run(() => this.scanKnownInteger(this.text(u64(token)), u64(output), 32) !== 0);
  }
  /** Actual142547EA0, including five-byte fraction padding and final input reload. */
  readFixed(token: bigint, output: bigint, entryStack: bigint): ScalarResult {
    return this.run(() => {
      token = u64(token); output = u64(output); entryStack = u64(entryStack);
      const integer = u64(entryStack + 0x18n), fraction = u64(entryStack + 8n), digits = u64(entryStack - 0x28n);
      this.wq(integer, 0n); this.wq(fraction, 0n);
      if (this.scanKnownInteger(this.text(token), integer, 64) === 0) return false;
      const text = this.text(token); let dot = text;
      while (this.b(dot) !== 0 && this.b(dot) !== 46) dot = u64(dot + 1n);
      if (this.b(dot) === 0) { this.wq(output, this.q(integer) * 100000n); return true; }
      // Original word then dword stores initialize exactly "00000\0".
      this.wb(digits + 4n, 48); this.wb(digits + 5n, 0);
      for (let i = 0n; i < 4n; i++) this.wb(digits + i, 48);
      for (let i = 0n; i < 5n; i++) {
        const byte = this.b(dot + 1n + i); if (byte === 0) break; this.wb(digits + i, byte);
      }
      let first = digits; while (this.b(first) === 48) first = u64(first + 1n);
      this.scanKnownInteger(first, fraction, 64);
      const whole = this.q(integer);
      if (i64(whole) < 0n) this.wq(fraction, -this.q(fraction));
      const combined = u64(whole * 100000n + this.q(fraction)); this.wq(output, combined);
      if (this.d(token + 0x14n) !== 0 && this.b(this.q(token + 8n)) === 45 && whole === 0n) this.wq(output, -combined);
      return true;
    });
  }
}
