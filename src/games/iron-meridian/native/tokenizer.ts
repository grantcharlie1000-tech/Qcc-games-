import type { KeywordRecordMemory, KeywordRecordServices } from './keyword-record';
import { NativeCharacterReader } from './character-reader';
import type { CharacterReaderMemory, CharacterReaderServices } from './character-reader';
import { NativeCharacterClasses } from './character-classes';
import type { CharacterClassServices } from './character-classes';
import { NativeTokenBuffer } from './token-buffer';
import { NativeKeywordRegistry } from './keyword-registry';

export interface TokenizerServices extends KeywordRecordServices, CharacterReaderServices, CharacterClassServices {}
export type TokenizerResult = { kind: 'returned'; value: number }
  | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint; callSite: bigint };
type RuntimeStop = Exclude<TokenizerResult, { kind: 'returned' }>;
class Stop { constructor(readonly result: RuntimeStop) {} }
const u64 = (v: bigint) => BigInt.asUintN(64, v);
const signedByte = (v: number) => (v & 255) << 24 >> 24;

/** Original14253F460, with concrete reader/classes/buffering and registry code. */
export class NativeTokenizer {
  private readonly reader: NativeCharacterReader;
  private readonly classes: NativeCharacterClasses;
  private readonly buffer: NativeTokenBuffer;
  constructor(private readonly memory: KeywordRecordMemory & CharacterReaderMemory, private readonly services: TokenizerServices, private readonly registry: NativeKeywordRegistry, private readonly loopBudget = 10_000_000) {
    this.reader = new NativeCharacterReader(memory, services); this.classes = new NativeCharacterClasses(memory, services); this.buffer = new NativeTokenBuffer(memory, services);
  }
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private d(a: bigint) { return this.memory.readDword(u64(a)) >>> 0; }
  private int(a: bigint) { return this.d(a) | 0; }
  private b(a: bigint) { return this.memory.readByte(u64(a)) & 255; }
  private wb(a: bigint, v: number) { this.memory.writeByte(u64(a), v & 255); }
  private wd(a: bigint, v: number) { this.memory.writeDword(u64(a), v >>> 0); }
  private wq(a: bigint, v: bigint) { this.memory.writeQword(u64(a), u64(v)); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new Stop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private unwrap<T>(result: { kind: 'returned'; value: T } | RuntimeStop): T { if (result.kind !== 'returned') throw new Stop(result); return result.value; }
  private complete(result: { kind: 'complete' } | RuntimeStop) { if (result.kind !== 'complete') throw new Stop(result); }
  private backing(allocator: bigint, site: bigint) {
    const target = this.q(this.q(allocator) + 0x38n);
    if (target === 0x1401693c0n) return this.q(allocator + 0x20n);
    if (!this.services.allocatorGetter) this.stop('allocator-getter', target, site);
    return u64(this.services.allocatorGetter(target, allocator));
  }
  private allocate(allocator: bigint, bytes: bigint, site: bigint): bigint {
    const target = this.q(this.q(allocator) + 8n);
    if (target === 0x140121d20n) return this.allocate(this.backing(allocator, 0x140121d33n), bytes, 0x140121d50n);
    if (target === 0x14011d540n) {
      if (!this.services.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, 0x14011d547n);
      return u64(this.services.crtAllocate(bytes));
    }
    if (!this.services.allocate) this.stop('allocator-allocate', target, site);
    return u64(this.services.allocate(target, allocator, bytes, 1));
  }
  private release(allocator: bigint, pointer: bigint, site: bigint): void {
    const target = this.q(this.q(allocator) + 0x10n);
    if (target === 0x140122500n) {
      if (pointer !== u64(allocator + 8n)) this.release(this.backing(allocator, 0x140122515n), pointer, 0x140122526n);
    } else if (target === 0x14011d560n) {
      if (pointer !== 0n) {
        if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
        this.services.crtFree(pointer);
      }
    } else {
      if (!this.services.release) this.stop('allocator-release', target, site);
      this.services.release(target, allocator, pointer);
    }
  }
  private inlinedAppend(token: bigint, value: number, growth: number, quoted: boolean): boolean {
    const count = this.int(token + 0x14n), capacity = this.int(token + 0x10n);
    if (count !== capacity) {
      this.wb(this.q(token + 8n) + BigInt(count), value); this.wd(token + 0x14n, this.int(token + 0x14n) + 1);
      return false;
    }
    const product = Math.fround(Math.fround(capacity) * growth);
    const converted = !Number.isFinite(product) || product >= 2147483648 || product < -2147483648 ? -2147483648 : Math.trunc(product);
    const required = (count + 1) | 0, nextCapacity = converted < required ? required : converted;
    const destination = this.allocate(this.q(token + 0x18n), BigInt(nextCapacity >>> 0), quoted ? 0x14253f891n : 0x14253f546n);
    this.wb(destination + BigInt(this.int(token + 0x14n)), value);
    const copyCount = u64(BigInt(this.int(token + 0x14n))), source = this.q(token + 8n);
    if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, quoted ? 0x14253f8aan : 0x14253f55fn);
    this.services.copy(destination, source, copyCount);
    const finalCount = (this.int(token + 0x14n) + 1) | 0;
    // The containing lexer clears count BEFORE loading the release allocator.
    this.wd(token + 0x14n, 0); this.release(this.q(token + 0x18n), this.q(token + 8n), quoted ? 0x14253f8c8n : 0x14253f57dn);
    this.wq(token + 8n, destination); this.wd(token + 0x10n, nextCapacity); this.wd(token + 0x14n, finalCount);
    return true;
  }
  private read(reader: bigint, site: bigint) {
    const target = this.q(this.q(reader) + 8n);
    if (target !== 0x142573740n) this.stop('reader-read-byte', target, site);
    return this.unwrap(this.reader.readByte(reader)) & 255;
  }
  private whitespace(value: number, stack: bigint) { return this.unwrap(this.classes.whitespace(signedByte(value), u64(stack - 8n))); }
  private branch(value: number, byteTable: bigint, targets: bigint, fallback: bigint, site: bigint) {
    const index = (signedByte(value) - 0x21) >>> 0;
    if (index > 0x5c) return fallback;
    const slot = this.b(byteTable + BigInt(index));
    const target = 0x140000000n + BigInt(this.d(targets + BigInt(slot * 4)));
    if (target < 0x14253f460n || target >= 0x14253fd26n) this.stop('tokenizer-branch-target', target, site);
    return target;
  }
  private cleanupLookup(stack: bigint, path: 'matched' | 'numeric' | 'string') {
    const capacity = this.q(stack + 0x48n);
    if (capacity <= 15n) return;
    let pointer = this.q(stack + 0x30n), bytes = u64(capacity + 1n);
    if (bytes >= 0x1000n) {
      const base = this.q(pointer - 8n);
      if (u64(pointer - base - 8n) > 31n) this.stop('invalid-parameter', 0x1425c7db4n, 0x14253fd21n);
      pointer = base; bytes = u64(bytes + 0x27n);
    }
    //1425A0218 ->14222F060 both execute before the actual single-pointer CRT leaf.
    if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
    this.services.crtFree(pointer);
    // The native continuations use the same CRT argument, but distinct call sites.
    void bytes; void path;
  }
  next(input: bigint, entryStack: bigint): TokenizerResult {
    input = u64(input); entryStack = u64(entryStack);
    const stack = u64(entryStack - 0x1d8n), frame = u64(entryStack - 0xd8n), token = u64(input + 0x18n);
    const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, this.d(0x142795988n), true); const growth = view.getFloat32(0, true);
    let readerSlot = u64(input + 8n), steps = 0;
    const tick = (site: bigint) => { if (++steps > this.loopBudget) this.stop('tokenizer-loop-budget', site, site); };
    try {
      while (true) {
        tick(0x14253f4a0n); this.wq(u64(frame + 0xe0n), readerSlot);
        if (this.b(0x14369180cn) !== 0) this.stop('lexer-source-diagnostic', 0x1425698c0n, 0x14253f4c0n);
        if (this.b(input + 0x64n) === 1) { this.wb(input + 0x64n, 0); return { kind: 'returned', value: this.d(input + 0x10n) }; }
        const reader = this.q(readerSlot);
        let current = this.read(reader, 0x14253f4d9n);
        while (current !== 255 && this.whitespace(current, stack) !== 0) { tick(0x14253f4f1n); current = this.read(reader, 0x14253f4f7n); }
        if (current === 255) return { kind: 'returned', value: 0 };
        this.complete(this.buffer.clear(token));
        if (this.inlinedAppend(token, current, growth, false)) readerSlot = this.q(u64(frame + 0xe0n));
        const target = this.branch(current, 0x14253fd54n, 0x14253fd28n, 0x14253f688n, 0x14253f5cdn);
        if (target === 0x14253f623n) {
          this.wd(token, 9); this.wb(input + 0x1cn, 0);
          current = this.read(reader, 0x14253f636n);
          while (current !== 255 && current !== 10) { tick(0x14253f641n); current = this.read(reader, 0x14253f64fn); }
          continue;
        }
        if (target === 0x14253f755n) {
          this.wd(token, 2); this.wb(input + 0x1cn, 0);
          if (this.int(token + 0x14n) !== 0) this.wd(token + 0x14n, this.int(token + 0x14n) - 1);
          current = this.read(reader, 0x14253f776n); let previous = 0;
          while (current !== 255) {
            tick(0x14253f788n);
            if (current === 34 && previous !== 92) break;
            if (previous === 92) {
              if (current !== 34 && current !== 92) this.stop('lexer-diagnostic-context', 0x14254bce0n, 0x14253f7c5n);
              if (this.int(token + 0x14n) !== 0) this.wd(token + 0x14n, this.int(token + 0x14n) - 1);
              previous = 0;
            } else previous = current;
            this.inlinedAppend(token, current, growth, true); current = this.read(reader, 0x14253f8een);
          }
          this.complete(this.buffer.append(token, 0)); this.wd(token, 15); this.wb(input + 0x1cn, 1); return { kind: 'returned', value: 1 };
        }
        let kind: number;
        switch (target) {
          case 0x14253f5cfn: kind = 1; break;
          case 0x14253f5e1n: kind = 3; break;
          case 0x14253f5f3n: kind = 4; break;
          case 0x14253f605n: kind = 5; break;
          case 0x14253f614n: kind = 6; break;
          case 0x14253f65bn: kind = 8; break;
          case 0x14253f66an: kind = 0x1d3; break;
          case 0x14253f679n: kind = 0x1d4; break;
          case 0x14253f688n: kind = 0; break;
          default: this.stop('tokenizer-branch-target', target, 0x14253f5cdn);
        }
        this.wd(token, kind); this.wb(input + 0x1cn, 0);
        if (current === 63) {
          current = this.read(reader, 0x14253f6a3n);
          if (current !== 61) { this.unwrap(this.reader.unreadByte(reader)); this.stop('lexer-diagnostic-context', 0x14254bce0n, 0x14253f6b9n); }
          this.complete(this.buffer.append(token, 61)); this.complete(this.buffer.append(token, 0)); this.wd(token, 0x318); return { kind: 'returned', value: 1 };
        }
        if (kind !== 0) { this.complete(this.buffer.append(token, 0)); return { kind: 'returned', value: 1 }; }
        current = this.read(reader, 0x14253f966n);
        while (current !== 255) {
          tick(0x14253f980n); if (this.whitespace(current, stack) !== 0) break;
          const next = this.branch(current, 0x14253fdbcn, 0x14253fdb4n, 0x14253f9b1n, 0x14253f9afn);
          if (next === 0x14253f9cdn) break;
          if (next !== 0x14253f9b1n) this.stop('tokenizer-branch-target', next, 0x14253f9afn);
          this.complete(this.buffer.append(token, current)); current = this.read(reader, 0x14253f9c3n);
        }
        const unread = this.branch(current, 0x14253fe24n, 0x14253fe1cn, 0x14253f9fdn, 0x14253f9efn);
        if (unread === 0x14253f9f1n) this.unwrap(this.reader.unreadByte(reader));
        else if (unread !== 0x14253f9fdn) this.stop('tokenizer-branch-target', unread, 0x14253f9efn);
        this.complete(this.buffer.append(token, 0));
        let text = this.int(input + 0x2cn) === 0 ? 0x14279471dn : this.q(input + 0x20n);
        const first = this.b(text);
        if (((first - 48) & 255) <= 9 || this.int(input + 0x2cn) !== 0 && this.b(this.q(input + 0x20n)) === 45) kind = 12;
        else {
          text = this.int(input + 0x2cn) === 0 ? 0x14279471dn : this.q(input + 0x20n);
          const lookup = this.registry.lookupCString(text, stack, frame);
          if (lookup.kind === 'runtime-required') throw new Stop(lookup);
          if (lookup.kind === 'matched') { kind = lookup.id; this.cleanupLookup(stack, 'matched'); }
          else {
            text = this.int(input + 0x2cn) === 0 ? 0x14279471dn : this.q(input + 0x20n); kind = 12;
            for (let cursor = text, byte = this.b(cursor); byte !== 0; byte = this.b(cursor = u64(cursor + 1n))) {
              tick(0x14253fbc2n);
              if (((byte - 48) & 255) > 9 && ((byte - 45) & 255) > 1) { kind = 15; break; }
            }
            this.cleanupLookup(stack, kind === 12 ? 'numeric' : 'string');
          }
        }
        this.wd(token, kind); return { kind: 'returned', value: current === 255 ? 0 : 1 };
      }
    } catch (error) { if (error instanceof Stop) return error.result; throw error; }
  }
}
