import type { InputObjectMemory, InputObjectResult, InputObjectServices } from './input-object';
import { NativeInputObject } from './input-object';

export type TechnologyFieldResult = { kind: 'complete' } | Exclude<InputObjectResult<never>, {kind:'returned'}>;
export type TokenBooleanResult = { kind: 'returned'; value: boolean };
const u64 = (v: bigint) => BigInt.asUintN(64, v);

/** Recovered six boolean paths of140B25C90; other field bodies remain explicit. */
export class NativeTechnologyFields {
  constructor(private readonly memory: InputObjectMemory, private readonly services: InputObjectServices, private readonly gsBase: bigint) {}
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private d(a: bigint) { return this.memory.readDword(u64(a)) >>> 0; }
  private b(a: bigint) { return this.memory.readByte(u64(a)) & 255; }
  private wb(a: bigint, v: number) { this.memory.writeByte(u64(a), v & 255); }
  /** Actual142548100. Count is a captured zero/nonzero selector, not a compare bound. */
  readBoolean(token: bigint, output: bigint): TokenBooleanResult {
    token = u64(token); output = u64(output);
    const count = this.d(token + 0x14n), first = count === 0 ? 0x14279471dn : this.q(token + 8n);
    let equal = true;
    for (let i = 0n; i < 4n; i++) {
      if (this.b(0x1427b0b84n + i) !== this.b(first + i)) { equal = false; break; }
    }
    if (equal) { this.wb(output, 1); return { kind: 'returned', value: true }; }
    const second = count === 0 ? 0x14279471dn : this.q(token + 8n);
    if (this.b(second) === 110 && this.b(second + 1n) === 111 && this.b(second + 2n) === 0) {
      this.wb(output, 0); return { kind: 'returned', value: true };
    }
    return { kind: 'returned', value: false };
  }
  /** Actual142543690 including the tail-dispatch boundary on failed conversion. */
  applyBoolean(parser: bigint, output: bigint): TechnologyFieldResult {
    if (this.readBoolean(u64(parser + 0xc0n), u64(output)).value) return { kind: 'complete' };
    return { kind: 'runtime-required', boundary: 'parser-value-diagnostic', nativeAddress: 0x1425448d0n, callSite: 0x1425436b1n };
  }
  dispatch(definition: bigint, parser: bigint, identifier: number): TechnologyFieldResult {
    definition = u64(definition); parser = u64(parser); identifier |= 0;
    let offset: bigint;
    switch (identifier) {
      case 0x27af: offset = 0x540n; break;
      case 0x2c8c: offset = 0x40bn; break;
      case 0x35f9: offset = 0x409n; break;
      case 0x367e: offset = 0x40cn; break;
      case 0x3a30: offset = 0x408n; break;
      case 0x4ca7: offset = 0x40an; break;
      default: return { kind: 'runtime-required', boundary: 'technology-field-body-untranslated', nativeAddress: 0x140b25c90n, callSite: 0x140b25c90n };
    }
    return this.applyBoolean(parser, u64(definition + offset));
  }
  /** Actual140B25980 metadata prefix, stopping at its unported iterator tail. */
  begin(definition: bigint, parser: bigint): TechnologyFieldResult {
    definition = u64(definition); parser = u64(parser);
    const source = u64(this.q(this.q(parser + 0x28n) + 8n) + 0x18n), destination = u64(definition + 0x568n);
    if (destination !== source) {
      const capacity = this.q(source + 0x18n), count = this.q(source + 0x10n), pointer = capacity > 15n ? this.q(source) : source;
      const result = new NativeInputObject(this.memory, this.services, this.gsBase).assignName(destination, pointer, count);
      if (result.kind !== 'returned') return result;
    }
    const line = this.d(this.q(this.q(parser + 0x28n) + 8n) + 8n);
    this.memory.writeDword(u64(definition + 0x588n), line);
    return { kind: 'runtime-required', boundary: 'technology-property-iterator', nativeAddress: 0x142541100n, callSite: 0x140b259d8n };
  }
}
