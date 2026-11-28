import { NativeKeywordRecord } from './keyword-record';
import type { KeywordRecordMemory } from './keyword-record';
import type { TokenizerServices, NativeTokenizer } from './tokenizer';
export type ParserConstantsResult<T = never> = { kind: 'complete' } | { kind: 'returned'; value: T }
  | { kind: 'runtime-required'; boundary: string; nativeAddress: bigint; callSite: bigint };
type RuntimeStop = Extract<ParserConstantsResult, { kind: 'runtime-required' }>;
class Stop { constructor(readonly result: RuntimeStop) {} }
export interface ParserConstantsServices extends TokenizerServices { errorHandler?(target: bigint, handler: bigint, parser: bigint): number; }
const u64 = (v: bigint) => BigInt.asUintN(64, v);
/** Raw142544220/142542F40 and their local string/vector/record operations. */
export class NativeParserConstants {
  constructor(readonly memory: KeywordRecordMemory, readonly services: ParserConstantsServices,
    readonly tokenizer: NativeTokenizer, readonly gsBase: bigint) {}
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private d(a: bigint) { return this.memory.readDword(u64(a)) >>> 0; }
  private int(a: bigint) { return this.d(a) | 0; }
  private b(a: bigint) { return this.memory.readByte(u64(a)) & 255; }
  private wb(a: bigint, v: number) { this.memory.writeByte(u64(a), v & 255); }
  private wd(a: bigint, v: number) { this.memory.writeDword(u64(a), v >>> 0); }
  private wq(a: bigint, v: bigint) { this.memory.writeQword(u64(a), u64(v)); }
  private bytes(a: bigint, n: number) { return Uint8Array.from({ length: n }, (_, i) => this.b(a + BigInt(i))); }
  private write(a: bigint, bytes: Uint8Array) { for (let i = 0; i < bytes.length; i++) this.wb(a + BigInt(i), bytes[i]!); }
  private zero(a: bigint, n: number) { this.write(a, new Uint8Array(n)); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new Stop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private copy(dst: bigint, src: bigint, n: bigint, site: bigint) {
    if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, site);
    this.services.copy(u64(dst), u64(src), u64(n));
  }
  private malloc(n: bigint, site: bigint) {
    if (!this.services.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, site);
    return u64(this.services.crtAllocate(u64(n)));
  }
  private free(p: bigint, site: bigint) {
    if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, site);
    this.services.crtFree(p);
  }
  private backing(a: bigint, site: bigint) {
    const target = this.q(this.q(a) + 0x38n);
    if (target === 0x1401693c0n) return this.q(a + 0x20n);
    if (!this.services.allocatorGetter) this.stop('allocator-getter', target, site);
    return u64(this.services.allocatorGetter(target, a));
  }
  private allocate(a: bigint, n: bigint, alignment: number, site: bigint): bigint {
    const target = this.q(this.q(a) + 8n);
    if (target === 0x140121d20n) return this.allocate(this.backing(a, 0x140121d33n), n, alignment, 0x140121d50n);
    if (target === 0x14011d540n) return this.malloc(n, 0x14011d547n);
    if (!this.services.allocate) this.stop('allocator-allocate', target, site);
    return u64(this.services.allocate(target, a, n, alignment));
  }
  private release(a: bigint, p: bigint, site: bigint): void {
    const target = this.q(this.q(a) + 0x10n);
    if (target === 0x140122500n) { if (p !== u64(a + 8n)) this.release(this.backing(a, 0x140122515n), p, 0x140122526n); }
    else if (target === 0x14011d560n) { if (p !== 0n) this.free(p, 0x14222f060n); }
    else { if (!this.services.release) this.stop('allocator-release', target, site); this.services.release(target, a, p); }
  }
  private initialize(v: bigint) {
    const r = new NativeKeywordRecord(this.memory, this.services, this.gsBase).initializeVector(v);
    if (r.kind !== 'returned') throw new Stop(r);
  }
  private growth(cap: number, needed: number) {
    const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, this.d(0x142795988n), true);
    const f = Math.fround(Math.fround(cap) * view.getFloat32(0, true));
    const converted = !Number.isFinite(f) || f >= 2147483648 || f < -2147483648 ? -2147483648 : Math.trunc(f);
    return converted < needed ? needed : converted;
  }
  private stringPointer(s: bigint) { return this.q(s + 24n) > 15n ? this.q(s) : s; }
  private stringInitial(s: bigint) { this.zero(s, 16); this.write(s + 16n, this.bytes(0x142795990n, 16)); this.wb(s, 0); }
  private stringFree(s: bigint, site: bigint) {
    let n = this.q(s + 24n) + 1n;
    if (n <= 16n) return;
    let p = this.q(s);
    if (n >= 0x1000n) {
      n += 0x27n; const raw = this.q(p - 8n);
      if (u64(p - raw - 8n) > 31n) this.stop('invalid-parameter', 0x1425c7db4n, site);
      p = raw;
    }
    this.free(p, 0x14222f060n);
  }
  private stringAllocate(cap: bigint, copied = false) {
    if (cap + 1n < 0x1000n) return this.malloc(cap + 1n, copied ? 0x14011f83en : 0x14011f0ecn);
    const raw = this.malloc(cap + 0x28n, copied ? 0x14011f7f7n : 0x14011f0a4n);
    if (raw === 0n) this.stop('invalid-parameter', 0x1425c7db4n, copied ? 0x14011f876n : 0x14011f12cn);
    const p = u64(raw + 0x27n) & ~31n; this.wq(p - 8n, raw); return p;
  }
  private stringConstruct(s: bigint, src: bigint, n: bigint) {
    if (n > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f138n);
    if (n <= 15n) { this.wq(s + 16n, n); this.wq(s + 24n, 15n); this.copy(s, src, n, 0x14011f073n); this.wb(s + n, 0); return; }
    let cap = n | 15n; if (cap > 0x7fffffffffffffffn) cap = 0x7fffffffffffffffn; else if (cap < 22n) cap = 22n;
    const p = this.stringAllocate(cap);
    this.wq(s, p); this.wq(s + 16n, n); this.wq(s + 24n, cap);
    this.copy(p, src, n, 0x14011f108n); this.wb(p + n, 0);
  }
  private stringCopy(dst: bigint, src: bigint) {
    this.zero(dst, 16); this.wq(dst + 16n, 0n); this.wq(dst + 24n, 0n);
    const n = this.q(src + 16n), p = this.stringPointer(src);
    if (n > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f882n);
    if (n <= 15n) { this.wq(dst + 16n, n); this.wq(dst + 24n, 15n); this.write(dst, this.bytes(p, 16)); }
    else { let cap = n | 15n; if (cap > 0x7fffffffffffffffn) cap = 0x7fffffffffffffffn; else if (cap < 22n) cap = 22n;
      const buffer = this.stringAllocate(cap, true); this.wq(dst, buffer); this.wq(dst + 16n, n); this.wq(dst + 24n, cap); this.copy(buffer, p, n + 1n, 0x14011f858n); }
  }
  private strippedName(name: bigint, tmp: bigint, text: bigint, freeSite: bigint) {
    const src = u64(text + 1n); this.zero(tmp, 16); this.zero(tmp + 16n, 16);
    let n = 0n; while (this.b(src + n) !== 0) n++;
    this.stringConstruct(tmp, src, n); this.stringFree(name, freeSite);
    this.write(name, this.bytes(tmp, 16)); this.write(name + 16n, this.bytes(tmp + 16n, 16));
  }
  private hash(name: bigint) { let h = 0x811c9dc5; for (let p = this.stringPointer(name), v = this.b(p); v !== 0; v = this.b(++p)) h = Math.imul(h ^ v, 0x1000193) >>> 0; return h; }
  private resize(v: bigint, n: number) {
    n |= 0; if (n <= this.int(v + 12n) || n <= this.int(v + 8n)) { this.wd(v + 12n, n); return; }
    const cap = this.growth(this.int(v + 8n), n), p = this.allocate(this.q(v + 16n), BigInt(cap >>> 0), 1, 0x1401b157cn);
    this.copy(p, this.q(v), BigInt(this.int(v + 12n)), 0x1401b158cn);
    this.release(this.q(v + 16n), this.q(v), 0x1401b159bn); this.wq(v, p); this.wd(v + 8n, cap); this.wd(v + 12n, n);
  }
  private reverse(first: bigint, last: bigint) {
    if (u64(last - first) >= 64n && (this.d(0x14313ffacn) & 32)) this.stop('avx2-byte-reverse', 0x1425a30d9n, 0x1425a30d9n);
    if (u64(last - first) >= 32n && (this.d(0x14313ffacn) & 4)) {
      const mask = this.bytes(0x142c0da00n, 16), end = first + ((last - first) / 2n & ~15n);
      const shuffle = (a: Uint8Array) => Uint8Array.from(mask, x => (x & 128) ? 0 : a[x & 15]!);
      do { const a = shuffle(this.bytes(first, 16)); last -= 16n; const b = shuffle(this.bytes(last, 16)); this.write(first, b); first += 16n; this.write(last, a); } while (first !== end);
    }
    while (first !== last) { last--; if (first === last) return; const a = this.b(first), b = this.b(last); this.wb(first++, b); this.wb(last, a); }
  }
  private insert(v: bigint, position: number, source: bigint, amount: number) {
    const count = this.int(v + 12n), n = (count + amount) | 0, pos = BigInt(position | 0), added = BigInt(amount | 0);
    if (n > this.int(v + 8n)) {
      const cap = this.growth(this.int(v + 8n), n), p = this.allocate(this.q(v + 16n), BigInt(cap >>> 0), 1, 0x14018e497n);
      this.copy(p + pos, source, added, 0x14018e4a7n); this.copy(p, this.q(v), pos, 0x14018e4b5n);
      const old = this.q(v); this.copy(p + pos + added, old + pos, BigInt(this.int(v + 12n)) - pos, 0x14018e4d2n);
      const next = (this.int(v + 12n) + amount) | 0, alloc = this.q(v + 16n), oldPointer = this.q(v); this.wd(v + 12n, 0);
      this.release(alloc, oldPointer, 0x14018e4f0n); this.wd(v + 8n, cap); this.wq(v, p); this.wd(v + 12n, next);
    } else {
      this.copy(this.q(v) + BigInt(count), source, added, 0x14018e511n);
      const current = this.int(v + 12n), p = this.q(v), next = (current + amount) | 0, first = p + pos, mid = p + BigInt(current), last = p + BigInt(next);
      this.wd(v + 12n, next); if (first !== mid && mid !== last) { this.reverse(first, mid); this.reverse(mid, last); this.reverse(first, last); }
    }
  }
  private token(dst: bigint, src: bigint) {
    this.wd(dst, this.d(src)); this.wb(dst + 4n, this.b(src + 4n)); const n = this.int(src + 20n), p = this.q(src + 8n);
    this.initialize(dst + 8n); this.insert(dst + 8n, this.int(dst + 20n), p, n);
  }
  private cleanVector(v: bigint, site: bigint, reset = true) {
    const p = this.q(v); if (p === 0n) return; this.wd(v + 12n, 0); this.release(this.q(v + 16n), p, site);
    if (reset) { this.wq(v, 0n); this.wd(v + 8n, 0); }
  }
  private inline(local: bigint, pointer: bigint, cap: bigint, slot: bigint, site: bigint) {
    const target = this.q(this.q(local) + slot);
    if (target === 0x1401691d0n) { this.wq(pointer, local + 8n); this.wd(cap, 21); return; }
    if (!this.services.inlineBuffer) this.stop('inline-buffer', target, site);
    this.services.inlineBuffer(target, local, pointer, cap);
  }
  private swapRanges(first: bigint, last: bigint, other: bigint) {
    const n = u64(last - first), flags = this.d(0x14313ffacn);
    if (n >= 32n && (flags & 32)) this.stop('avx2-byte-swap', 0x1425a3383n, 0x1425a3383n);
    if (n >= 16n && (flags & 4)) while (u64(last - first) >= 16n) { const a = this.bytes(first, 16), b = this.bytes(other, 16); this.write(first, b); this.write(other, a); first += 16n; other += 16n; }
    while (u64(last - first) >= 8n) { const a = this.bytes(first, 8), b = this.bytes(other, 8); this.write(first, b); this.write(other, a); first += 8n; other += 8n; }
    while (first !== last) { const b = this.b(other), a = this.b(first); this.wb(first++, b); this.wb(other++, a); }
  }
  private moveVector(dst: bigint, src: bigint, entry: bigint) {
    this.wd(dst + 12n, 0); this.release(this.q(dst + 16n), this.q(dst), 0x1401608ddn); this.wq(dst, 0n); this.wd(dst + 8n, 0);
    this.inline(dst + 24n, dst, dst + 8n, 32n, 0x1401608f6n);
    const p = this.q(src); this.inline(src + 24n, entry + 16n, entry + 8n, 40n, 0x14016090en);
    if (this.q(entry + 16n) <= p && p < u64(this.q(entry + 16n) + BigInt(this.int(entry + 8n)))) {
      const small = this.int(src + 12n) < this.int(dst + 12n) ? src : dst, large = small === src ? dst : src;
      const first = this.q(small); this.swapRanges(first, first + BigInt(this.int(small + 12n)), this.q(large));
      const count = BigInt(this.int(small + 12n)), largePointer = this.q(large);
      this.copy(this.q(small) + count, largePointer + count, BigInt(this.int(large + 12n)) - count, 0x140160967n);
      const a = this.d(small + 12n), b = this.d(large + 12n); this.wd(small + 12n, b); this.wd(large + 12n, a); return;
    }
    // Both virtual +30 and +38 use the same concrete1401693C0 accessor.
    const get = (local: bigint, site: bigint) => { const target = this.q(this.q(local) + 48n); if (target === 0x1401693c0n) return this.q(local + 32n); if (!this.services.allocatorGetter) this.stop('allocator-getter', target, site); return u64(this.services.allocatorGetter(target, local)); };
    const a = get(dst + 24n, 0x140160982n), b = get(src + 24n, 0x140160990n);
    if (a === b && get(dst + 24n, 0x1401609a0n) !== 0n) { this.wq(dst, this.q(src)); this.wd(dst + 12n, this.d(src + 12n)); this.wd(dst + 8n, this.d(src + 8n)); this.wq(src + 8n, 0n); this.wq(src, 0n); return; }
    this.fallbackMove(dst, src, entry - 80n);
  }
  private fallbackMove(dst: bigint, src: bigint, entry: bigint, depth = 0) {
    if (depth > 64) this.stop('vector-move-recursion-budget', 0x14015d7b0n, 0x14015d7b0n);
    if (this.q(dst + 16n) === this.q(src + 16n)) {
      this.wd(dst + 12n, 0); this.release(this.q(dst + 16n), this.q(dst), 0x14015d7f0n); this.wq(dst, 0n); this.wd(dst + 8n, 0);
      if (this.q(dst + 16n) === this.q(src + 16n)) {
        this.wq(dst, this.q(src)); this.wq(src, 0n); const dc = this.d(dst + 12n), sc = this.d(src + 12n); this.wd(dst + 12n, sc); this.wd(src + 12n, dc);
        const da = this.d(dst + 8n), sa = this.d(src + 8n); this.wd(dst + 8n, sa); this.wd(src + 8n, da); return;
      }
      const small = this.int(src + 12n) < this.int(dst + 12n) ? src : dst, large = small === src ? dst : src;
      const thread = this.q(this.q(this.gsBase + 0x58n) + BigInt(this.d(0x143693a98n)) * 8n);
      if (this.int(thread + 0x20ecn) < this.int(0x1433dd120n)) this.stop('tls-guard-acquire', 0x1425a0588n, 0x14015d9a8n);
      const sp = entry - 0x468n, temp = sp + 32n, local = sp + 64n;
      this.wq(local, 0x1427962c0n); this.wq(sp + 0x448n, 0x1430fd000n); this.wq(temp, 0n); this.wq(temp + 8n, 0n); this.wq(temp + 16n, local);
      this.fallbackMove(temp, small, sp - 8n, depth + 1); this.fallbackMove(small, large, sp - 8n, depth + 1); this.fallbackMove(large, temp, sp - 8n, depth + 1);
      const p = this.q(temp); if (p !== 0n) { this.wd(temp + 12n, 0); const a = this.q(temp + 16n), target = this.q(this.q(a) + 16n);
        if (target === 0x140122500n) { if (p !== a + 8n) { const backing = this.backing(a, 0x14015d8f1n); this.release(backing, p, 0x14015d8fdn); } }
        else this.release(a, p, 0x14015d906n);
      } return;
    }
    const n = this.int(src + 12n), p = this.q(src), dc = this.int(dst + 12n);
    if (n <= dc) { this.copy(this.q(dst), p, BigInt(n), 0x14015d922n); this.wd(dst + 12n, n); }
    else if (n <= this.int(dst + 8n)) {
      const end = p + BigInt(n); this.copy(this.q(dst), p, BigInt(dc), 0x14015d93en);
      const count = BigInt(this.int(dst + 12n)); this.copy(this.q(dst) + count, p + count, end - p - count, 0x14015d954n); this.wd(dst + 12n, n);
    } else { this.wd(dst + 12n, 0); this.resize(dst, n); this.copy(this.q(dst), p, BigInt(n), 0x14015d974n); }
    this.wd(src + 12n, 0);
  }
  private moveVariable(dst: bigint, src: bigint, entry: bigint) {
    this.wq(entry + 8n, dst); this.zero(dst, 16); this.wq(dst + 16n, 0n); this.wq(dst + 24n, 0n);
    this.write(dst, this.bytes(src, 16)); this.write(dst + 16n, this.bytes(src + 16n, 16));
    this.wq(src + 16n, 0n); this.wq(src + 24n, 15n); this.wb(src, 0);
    this.wd(dst + 32n, this.d(src + 32n)); this.wd(dst + 40n, this.d(src + 40n)); this.wb(dst + 44n, this.b(src + 44n));
    this.wq(entry + 16n, dst + 48n); this.initialize(dst + 48n); this.moveVector(dst + 48n, src + 48n, entry - 48n);
  }
  private destroyVariable(p: bigint) { this.cleanVector(p + 48n, 0x140158a42n); this.stringFree(p, 0x140158a9cn); this.wq(p + 16n, 0n); this.wq(p + 24n, 15n); this.wb(p, 0); }
  private copyVariable(dst: bigint, name: bigint, hashHome: bigint, value: bigint) {
    this.stringCopy(dst, name); this.wd(dst + 32n, this.d(hashHome)); this.wd(dst + 40n, this.d(value)); this.wb(dst + 44n, this.b(value + 4n));
    const n = this.int(value + 20n), p = this.q(value + 8n); this.initialize(dst + 48n); this.insert(dst + 48n, this.int(dst + 60n), p, n);
  }
  private run<T>(body: () => T): ParserConstantsResult<T> { try { return { kind: 'returned', value: body() }; } catch (error) { if (error instanceof Stop) return error.result; throw error; } }
  insertBytes(vector: bigint, position: number, source: bigint, amount: number): ParserConstantsResult<bigint> { return this.run(() => { this.insert(u64(vector), position, u64(source), amount); return u64(vector); }); }
  moveBytes(destination: bigint, source: bigint, entry: bigint): ParserConstantsResult<bigint> { return this.run(() => { this.moveVector(u64(destination), u64(source), u64(entry)); return u64(destination); }); }
  diagnoseExpression(parser: bigint, entry: bigint): ParserConstantsResult<number> { return this.run(() => this.expressionDiagnostic(u64(parser), u64(entry))); }
  constructInteger(output: bigint, value: number, entry: bigint): ParserConstantsResult<bigint> { return this.run(() => { this.numericToken(u64(output), value, u64(entry)); return u64(output); }); }
  private current(parser: bigint) { return u64(this.q(parser + 40n) + 24n); }
  private text(token: bigint) { return this.int(token + 20n) === 0 ? 0x14279471dn : this.q(token + 8n); }
  private next(input: bigint, entry: bigint, site: bigint) {
    const target = this.q(this.q(input) + 8n); if (target !== 0x14253f460n) this.stop('input-next-token', target, site);
    const result = this.tokenizer.next(input, entry); if (result.kind !== 'returned') throw new Stop(result); return result.value >>> 0;
  }
  /** Actual142550600 writes digits in reverse address order and returns past NUL. */
  formatInteger(output: bigint, value: number): bigint {
    value |= 0; if (value === 0) { this.wb(output, 48); this.wb(output + 1n, 0); return u64(output + 2n); }
    const negative = value < 0, sign = negative ? 1n : 0n; let n = BigInt(value); if (negative) { this.wb(output, 45); n = -n; }
    let digits = 0n; for (let t = n; t > 0n; t /= 10n) digits++;
    let p = output + sign + digits;
    do { this.wb(--p, Number(n % 10n) + 48); n /= 10n; } while (n > 0n);
    this.wb(output + sign + digits, 0); return u64(output + sign + digits + 1n);
  }
  private numericToken(out: bigint, value: number, entry: bigint) {
    this.wq(entry + 8n, out); this.wd(out, 12); this.wb(out + 4n, 0); this.initialize(out + 8n);
    const result = new NativeKeywordRecord(this.memory, this.services, this.gsBase).resize(out, 21);
    if (result.kind !== 'returned') throw new Stop(result); this.formatInteger(result.value, value);
  }
  /** Actual142544730, including concrete error-node construction and cleanup. */
  private diagnostic(parser: bigint, message: bigint, entry: bigint) {
    let handler = this.q(parser + 0x128n);
    if (handler !== 0n) {
      this.wb(handler + 8n, 1); handler = this.q(parser + 0x128n); const target = this.q(this.q(handler));
      if (!this.services.errorHandler) this.stop('parser-error-handler', target, 0x142544765n);
      if (this.services.errorHandler(target, handler, parser) & 255) { this.wb(this.q(parser + 0x128n) + 9n, 1); return 1; }
    }
    const sp = entry - 0x98n, name = sp + 32n, record = sp + 64n, text = this.text(this.current(parser));
    this.zero(name, 16); this.zero(name + 16n, 16); let n = 0n; while (this.b(text + n) !== 0) n++;
    this.stringConstruct(name, text, n); const line = this.d(this.q(this.q(parser + 40n) + 8n) + 8n);
    this.stringCopy(record, message); this.wd(sp + 96n, line); this.stringCopy(sp + 104n, name);
    const oldTail = this.q(parser + 16n), node = this.malloc(96n, 0x1425447fbn); this.wq(sp + 160n, node);
    if (node !== 0n) {
      this.wq(sp + 176n, node); this.stringCopy(node, record); this.wd(node + 32n, this.d(sp + 96n)); this.stringCopy(node + 40n, sp + 104n);
      this.wq(node + 72n, oldTail); this.wq(node + 80n, 0n); this.wb(node + 88n, 0);
    }
    this.wq(parser + 16n, node); const oldCount = this.d(parser + 24n); this.wd(parser + 24n, oldCount + 1);
    if (oldCount === 0) this.wq(parser + 8n, node); else this.wq(oldTail + 80n, node);
    this.stringFree(record + 40n, 0x140a0afd3n); this.wq(record + 56n, 0n); this.wq(record + 64n, 15n); this.wb(record + 40n, 0);
    this.stringFree(record, 0x140a0afd3n); this.wq(record + 16n, 0n); this.wq(record + 24n, 15n); this.wb(record, 0);
    this.stringFree(name, 0x1425448can); this.wb(parser + 32n, 1); return 0;
  }
  private expressionDiagnostic(parser: bigint, entry: bigint) {
    const tmp = entry - 40n; this.zero(tmp, 16); this.write(tmp + 16n, this.bytes(0x1427959f0n, 16));
    this.write(tmp, this.bytes(0x142c051d8n, 8)); this.wd(tmp + 8n, this.d(0x142c051e0n));
    this.wb(tmp + 12n, this.b(0x142c051e4n)); this.wb(tmp + 13n, this.b(0x142c051e5n)); this.wb(tmp + 14n, this.b(0x142c051e6n)); this.wb(tmp + 15n, 0);
    const result = this.diagnostic(parser, tmp, entry - 80n); this.stringFree(tmp, 0x14254496fn); return result;
  }
  define(parser: bigint, entry: bigint): ParserConstantsResult {
    try { this.defineBody(u64(parser), u64(entry)); return { kind: 'complete' }; }
    catch (error) { if (error instanceof Stop) return error.result; throw error; }
  }
  private defineBody(parser: bigint, e: bigint) {
    const sp = e - 0x178n, fp = e - 0x78n, child = e - 0x180n, name = sp + 32n, value = sp + 72n, peek = fp - 80n;
    this.stringInitial(name); this.wd(value, 0); this.wb(value + 4n, 0); this.initialize(value + 8n);
    this.strippedName(name, fp - 112n, this.text(this.current(parser)), 0x142544727n); const hash = this.hash(name); this.wd(sp + 64n, hash);
    const n = this.int(parser + 0x13cn), array = this.q(parser + 0x130n);
    for (let i = 0; i < n; i++) if (this.d(array + BigInt(i * 112) + 32n) === hash) this.stop('parser-variable-duplicate-diagnostic', 0x14254b3f0n, 0x14254447fn);
    if (this.next(this.q(parser + 40n), child, 0x142544393n) !== 0 && this.int(this.current(parser)) === 1) {
      const input = this.q(parser + 40n), token = input + 24n;
      if (this.b(input + 100n) === 0) { const r = this.next(input, child, 0x1425443c4n); this.wd(input + 16n, r); if (r === 0) this.wd(token, 19); this.wb(input + 100n, 1); }
      this.token(peek, token);
      if (this.int(peek + 20n) !== 0 && this.b(this.q(peek + 8n)) === 64) {
        const result = this.resolveBody(parser, fp, child); this.wd(value, this.d(result)); this.wb(value + 4n, this.b(result + 4n)); this.moveVector(value + 8n, result + 8n, child);
        this.cleanVector(fp + 8n, 0x142544460n, false);
      } else {
        this.next(this.q(parser + 40n), child, 0x1425444b0n); const src = this.current(parser);
        this.wd(value, this.d(src)); this.wb(value + 4n, this.b(src + 4n));
        if (value + 8n !== src + 8n) { const count = this.int(src + 20n), p = this.q(src + 8n); this.wd(value + 20n, 0); this.resize(value + 8n, count); this.copy(this.q(value + 8n), p, BigInt(count), 0x1425444fbn); }
      }
      const count = this.int(parser + 0x13cn), cap = this.int(parser + 0x138n);
      if (count === cap) {
        const grown = this.growth(cap, (count + 1) | 0), p = this.allocate(this.q(parser + 0x140n), BigInt(grown >>> 0) * 112n, 8, 0x14254454en);
        this.copyVariable(p + BigInt(this.int(parser + 0x13cn)) * 112n, name, sp + 64n, value);
        let old = this.q(parser + 0x130n), to = p; const end = old + BigInt(this.int(parser + 0x13cn)) * 112n;
        while (old !== end) { this.moveVariable(to, old, child); this.destroyVariable(old); to += 112n; old += 112n; }
        const next = (this.int(parser + 0x13cn) + 1) | 0; this.wd(parser + 0x13cn, 0); this.release(this.q(parser + 0x140n), this.q(parser + 0x130n), 0x142544611n);
        this.wq(parser + 0x130n, p); this.wd(parser + 0x138n, grown); this.wd(parser + 0x13cn, next);
      } else { this.copyVariable(this.q(parser + 0x130n) + BigInt(count) * 112n, name, sp + 64n, value); this.wd(parser + 0x13cn, this.d(parser + 0x13cn) + 1); }
      this.cleanVector(peek + 8n, 0x142544698n);
    }
    this.cleanVector(value + 8n, 0x1425446ban); this.stringFree(name, 0x142544721n);
  }
  resolve(parser: bigint, output: bigint, entry: bigint): ParserConstantsResult<bigint> {
    try { return { kind: 'returned', value: this.resolveBody(u64(parser), u64(output), u64(entry)) }; }
    catch (error) { if (error instanceof Stop) return error.result; throw error; }
  }
  private resolveBody(parser: bigint, out: bigint, e: bigint): bigint {
    let src = this.current(parser);
    if (this.b(src + 4n) !== 0) { this.token(out, this.current(parser)); return out; }
    if (this.b(this.text(src) + 1n) === 40) {
      if (this.b(0x14368f610n) !== 0 && this.b(0x14368f603n) === 0) {
        this.wb(e + 8n, 0); this.wq(e - 0xc0n, 0x14368f603n); this.wq(e - 0xc8n, e + 8n);
        this.stop('assert-diagnostic', 0x14254ab40n, 0x142543015n);
      }
      this.expressionDiagnostic(parser, e - 0xf0n); this.numericToken(out, 0, e - 0xf0n); return out;
    }
    const name = e - 0xa8n, local = e - 0x80n;
    this.stringInitial(name); this.wd(local, 0); this.wb(local + 4n, 0); this.initialize(local + 8n);
    src = this.current(parser); this.strippedName(name, e - 0x38n, this.text(src), 0x1425432ben);
    const hash = this.hash(name), count = this.int(parser + 0x13cn), array = this.q(parser + 0x130n); let matched: bigint | undefined;
    for (let i = 0; i < count; i++) if (this.d(array + BigInt(i * 112) + 32n) === hash) { matched = array + BigInt(i * 112) + 40n; break; }
    this.token(out, matched ?? this.current(parser)); this.cleanVector(local + 8n, matched === undefined ? 0x1425431ban : 0x14254325cn); this.stringFree(name, 0x1425432c4n); return out;
  }
}
