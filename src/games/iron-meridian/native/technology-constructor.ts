import { NativeInputObject } from './input-object';
import type { InputObjectMemory, InputObjectResult, InputObjectServices } from './input-object';
import { NativeKeywordRecord } from './keyword-record';
import { NativeKeywordRegistry } from './keyword-registry';

export type TechnologyConstructorResult = InputObjectResult<bigint>;
type Failure = Exclude<TechnologyConstructorResult, { kind: 'returned' }>;
class Stop { constructor(readonly result: Failure) {} }
const u64 = (v: bigint) => BigInt.asUintN(64, v);

/** Actual140B1D820 and its concrete subobject initialization closure. */
export class NativeTechnologyConstructor {
  constructor(readonly memory: InputObjectMemory, readonly services: InputObjectServices, readonly gsBase: bigint) {}
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private d(a: bigint) { return this.memory.readDword(u64(a)) >>> 0; }
  private int(a: bigint) { return this.d(a) | 0; }
  private b(a: bigint) { return this.memory.readByte(u64(a)) & 255; }
  private wb(a: bigint, v: number) { this.memory.writeByte(u64(a), v & 255); }
  private wd(a: bigint, v: number) { this.memory.writeDword(u64(a), v >>> 0); }
  private wq(a: bigint, v: bigint) { this.memory.writeQword(u64(a), u64(v)); }
  private zero16(a: bigint) { this.wq(a, 0n); this.wq(a + 8n, 0n); }
  private word(a: bigint, v: number) { this.wb(a, v); this.wb(a + 1n, v >>> 8); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new Stop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private accept<T>(result: InputObjectResult<T>): T { if (result.kind !== 'returned') throw new Stop(result); return result.value; }
  private malloc(n: bigint, site: bigint) {
    if (!this.services.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, site);
    return u64(this.services.crtAllocate(u64(n)));
  }
  private copy(dst: bigint, src: bigint, n: bigint, site: bigint) {
    if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, site);
    this.services.copy(u64(dst), u64(src), u64(n));
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
    else if (target === 0x14011d560n) {
      if (p !== 0n) { if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n); this.services.crtFree(p); }
    } else { if (!this.services.release) this.stop('allocator-release', target, site); this.services.release(target, a, p); }
  }
  private guard(table: bigint, index: number, site: bigint) {
    const thread = this.q(table + BigInt(index) * 8n);
    if (this.int(thread + 0x20ecn) < this.int(0x1433dd120n)) this.stop('tls-guard-acquire', 0x1425a0588n, site);
  }
  /** Actual14011F6F0 captures the TLS index before clearing the header. */
  private vector(v: bigint) {
    const index = this.d(0x143693a98n); this.wq(v, 0n); this.wq(v + 8n, 0n);
    this.guard(this.q(this.gsBase + 0x58n), index, 0x14011f740n); this.wq(v + 16n, 0x1430fd000n);
  }
  private string(s: bigint) { this.zero16(s); this.wq(s + 16n, 0n); this.wq(s + 24n, 15n); this.wb(s, 0); }
  private growth(old: number, needed: number) {
    const f = new DataView(new ArrayBuffer(4)); f.setUint32(0, this.d(0x142795988n), true);
    const product = Math.fround(Math.fround(old) * f.getFloat32(0, true));
    const value = !Number.isFinite(product) || product >= 2147483648 || product < -2147483648 ? -2147483648 : Math.trunc(product);
    return value < needed ? needed : value;
  }
  /** Actual140121D60 pointer-vector append, retaining callback reloads. */
  private append(vector: bigint, source: bigint) {
    const count = this.int(vector + 12n), capacity = this.int(vector + 8n);
    if (count !== capacity) { this.wq(this.q(vector) + BigInt(count) * 8n, this.q(source)); this.wd(vector + 12n, this.d(vector + 12n) + 1); return; }
    const nextCapacity = this.growth(capacity, (count + 1) | 0), pointer = this.allocate(this.q(vector + 16n), BigInt(nextCapacity >>> 0) << 3n, 8, 0x140121dbcn);
    this.wq(pointer + BigInt(this.int(vector + 12n)) * 8n, this.q(source));
    this.copy(pointer, this.q(vector), BigInt(this.int(vector + 12n)) << 3n, 0x140121ddbn);
    const next = (this.int(vector + 12n) + 1) | 0, allocator = this.q(vector + 16n), oldPointer = this.q(vector);
    this.wd(vector + 12n, 0); this.release(allocator, oldPointer, 0x140121df6n);
    this.wq(vector, pointer); this.wd(vector + 8n, nextCapacity); this.wd(vector + 12n, next);
  }
  /** Actual140594160 /140584BF0 shared operations, with distinct native store order. */
  private initializeTracking(primary: boolean) {
    const pointer = this.malloc(primary ? 64n : 40n, primary ? 0x140594174n : 0x140584c02n), global = primary ? 0x1433de538n : 0x1433de4e0n;
    if (pointer === 0n) { this.wq(global, 0n); return; }
    if (primary) this.vector(pointer); else { this.wq(pointer, 0n); this.wq(pointer + 8n, 0n); }
    const tree = primary ? pointer + 24n : pointer;
    if (primary) { this.wq(tree, 0n); this.wq(tree + 8n, 0n); }
    const node = this.malloc(48n, primary ? 0x1405941aan : 0x140584c26n);
    this.wq(node, node); this.wq(node + 8n, node); this.wq(node + 16n, node); this.word(node + 24n, 0x101); this.wq(tree, node);
    let vector: bigint;
    if (primary) {
      this.wq(pointer + 40n, 0n); this.wq(pointer + 48n, 0n);
      this.guard(this.q(this.gsBase + 0x58n), this.d(0x143693a98n), 0x140594297n); this.wq(pointer + 56n, 0x1430fd000n); vector = pointer;
    } else { vector = pointer + 16n; this.vector(vector); }
    const capacity = this.int(vector + 8n);
    if (capacity < 2000) {
      const nextCapacity = this.growth(capacity, 2000), destination = this.allocate(this.q(vector + 16n), BigInt(nextCapacity >>> 0) << 3n, 8, primary ? 0x140594234n : 0x140584c7fn);
      this.copy(destination, this.q(vector), BigInt(this.int(vector + 12n)) << 3n, primary ? 0x140594248n : 0x140584c94n);
      this.release(this.q(vector + 16n), this.q(vector), primary ? 0x140594257n : 0x140584ca4n);
      this.wq(vector, destination); this.wd(vector + 8n, nextCapacity);
    }
    this.wq(global, pointer);
  }
  /** Actual140591560 /140584380; active engine lock contexts remain precise entry stops. */
  private tracked(object: bigint, entry: bigint, primary: boolean) {
    this.vector(object + 8n);
    if (!primary) this.wq(object, 0x1428526e0n);
    this.wd(object + 32n, -1); this.wd(object + 36n, this.d(object + 36n) & 0xfffff000);
    if (primary) this.word(object + 40n, 0);
    this.wb(object + 44n, 0xaa); this.wb(object + 52n, 0); this.string(object + 56n);
    if (primary) this.wq(object, 0x142853368n);
    const global = primary ? 0x1433de538n : 0x1433de4e0n;
    let list = this.q(global); if (list === 0n) { this.initializeTracking(primary); list = this.q(global); }
    this.wq(entry + 24n, object);
    if (this.q(0x1433dd6b0n) !== 0n) this.stop('constructor-thread-lock-context', primary ? 0x140591610n : 0x140584460n, primary ? 0x1405915d9n : 0x140584421n);
    this.wb(entry + 16n, 0); this.append(primary ? list : list + 16n, entry + 24n);
  }
  private modifier(object: bigint, child: bigint) { this.tracked(object, child - 0x30n, true); this.wd(object + 32n, 0x2968); this.wq(object, 0x1427964c8n); }
  private group(object: bigint) {
    for (const offset of [0n, 24n, 48n]) this.vector(object + offset);
    this.string(object + 72n); this.wq(object + 112n, 0x1430fee00n); this.wq(object + 120n, 0n); this.wb(object + 128n, 0); this.wd(object + 132n, 0x3f666666);
    this.wq(object + 144n, 0x1430fee50n); this.wq(object + 152n, 0n); this.wb(object + 160n, 0); this.wd(object + 164n, 0x3f666666); this.wd(object + 168n, -1); this.wd(object + 172n, 1);
  }
  private findByte(pointer: bigint, value: number) {
    for (let i = 0n; i < 0x100000n; i++) { const b = this.b(pointer + i); if (b === value) return pointer + i; if (b === 0) return 0n; }
    this.stop('constructor-string-scan-budget', 0x1425c3c70n, 0x1422aeb78n);
  }
  private allocateString(capacity: bigint, site: bigint, alignedSite: bigint, invalidSite: bigint) {
    if (capacity + 1n < 0x1000n) return this.malloc(capacity + 1n, site);
    const raw = this.malloc(capacity + 0x28n, alignedSite);
    if (raw === 0n) this.stop('invalid-parameter', 0x1425c7db4n, invalidSite);
    const pointer = u64(raw + 0x27n) & ~31n; this.wq(pointer - 8n, raw); return pointer;
  }
  private freeStringBuffer(pointer: bigint, capacity: bigint, invalidSite: bigint) {
    if (capacity <= 15n) return;
    if (capacity + 1n >= 0x1000n) {
      const raw = this.q(pointer - 8n);
      if (u64(pointer - raw - 8n) > 31n) this.stop('invalid-parameter', 0x1425c7db4n, invalidSite);
      pointer = raw;
    }
    if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
    this.services.crtFree(pointer);
  }
  /** Actual14011F030 literal string construction, including its primitive sites. */
  private constructString(output: bigint, source: bigint, length: bigint) {
    length = u64(length);
    if (length > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f138n);
    if (length <= 15n) { this.wq(output + 16n, length); this.wq(output + 24n, 15n); this.copy(output, source, length, 0x14011f073n); this.wb(output + length, 0); return; }
    let capacity = length | 15n; if (capacity > 0x7fffffffffffffffn) capacity = 0x7fffffffffffffffn; else if (capacity < 22n) capacity = 22n;
    const pointer = this.allocateString(capacity, 0x14011f0ecn, 0x14011f0a4n, 0x14011f12cn);
    this.wq(output, pointer); this.wq(output + 16n, length); this.wq(output + 24n, capacity);
    this.copy(pointer, source, length, 0x14011f108n); this.wb(pointer + length, 0);
  }
  /** Actual14241F170 and empty-count14241F0E0. Nonempty tables remain explicit. */
  private localizationLookup(text: bigint, length: bigint) {
    const table = this.q(0x143667f08n);
    if (table === 0n) throw new Stop({ kind: 'native-memory-fault', nativeAddress: 0x14241f181n, address: 0n, access: 'read', bytes: 8 });
    const entries = this.q(table); let hash = 0xcbf29ce484222325n;
    if (BigInt.asIntN(32, length) > 0n) for (let i = 0n; i < BigInt.asUintN(32, length); i++) hash = u64((hash ^ BigInt(this.b(text + i))) * 0x100000001b3n);
    void hash;
    if (this.int(entries + 44n) !== 0) this.stop('localization-nonempty-table', 0x14241f0e0n, 0x14241f1ban);
    return 0n;
  }
  /** Actual1422AEAB0 with concrete literal fallback of1422AE380 over an empty table. */
  private format(output: bigint, text: bigint, entry: bigint) {
    const sp = entry - 0x68n, home = sp + 0x48n;
    if (text === 0n && this.b(0x14368f611n) !== 0 && this.b(0x143500f9an) === 0) this.stop('assert-diagnostic', 0x14254ab40n, 0x1422aeb1bn);
    if (this.b(text) === 0) { this.zero16(output + 16n); this.zero16(output); this.wq(output + 16n, 0n); this.wq(output + 24n, 15n); this.wb(output, 0); return; }
    const thread = this.q(this.q(this.gsBase + 0x58n) + BigInt(this.d(0x143693a98n)) * 8n), buffer = thread + 2000n;
    this.wq(home, buffer); const end = this.findByte(text, 0), bound = this.q(home) + 0x1800n;
    this.wd(sp + 0x38n, 0); this.wd(sp + 0x30n, 0); this.wq(sp + 0x28n, 0n); this.wq(sp + 0x20n, text);
    const length = end - text; this.localizationLookup(text, length);
    const room = BigInt.asIntN(64, bound - this.q(home)), copied = room < length ? room : length;
    this.copy(this.q(home), text, copied, 0x1422ae7e1n); this.wq(home, this.q(home) + copied);
    const written = BigInt((this.d(home) - Number(buffer & 0xffffffffn)) | 0);
    this.zero16(output); this.wq(output + 16n, 0n); this.wq(output + 24n, 0n); this.constructString(output, buffer, written);
  }
  /** Actual14012B330 /14011F240. Old length/capacity and source remain captured across allocation. */
  private appendString(output: bigint, source: bigint, amount: bigint) {
    const length = this.q(output + 16n), capacity = this.q(output + 24n);
    if (u64(capacity - length) >= amount) {
      this.wq(output + 16n, length + amount); const pointer = this.q(output + 24n) > 15n ? this.q(output) : output;
      this.copy(pointer + length, source, amount, 0x14012b376n); this.wb(pointer + length + amount, 0); return;
    }
    if (0x7fffffffffffffffn - length < amount) this.stop('string-length-error', 0x14012b310n, 0x14011f3bfn);
    const next = length + amount, masked = next | 15n, half = capacity >> 1n;
    const nextCapacity = masked > 0x7fffffffffffffffn || capacity > 0x7fffffffffffffffn - half ? 0x7fffffffffffffffn : masked < capacity + half ? capacity + half : masked;
    const pointer = this.allocateString(nextCapacity, 0x14011f309n, 0x14011f2edn, 0x14011f3b3n);
    this.wq(output + 16n, next); this.wq(output + 24n, nextCapacity);
    const old = capacity > 15n ? this.q(output) : output;
    this.copy(pointer, old, length, capacity > 15n ? 0x14011f32fn : 0x14011f379n);
    this.copy(pointer + length, source, amount, capacity > 15n ? 0x14011f33dn : 0x14011f387n); this.wb(pointer + length + amount, 0);
    if (capacity > 15n) this.freeStringBuffer(old, capacity, 0x14011f3b3n); this.wq(output, pointer);
  }
  private pair(dst: bigint, src: bigint) { const a = this.q(src), b = this.q(src + 8n); this.wq(dst, a); this.wq(dst + 8n, b); }
  private resetString(s: bigint) { this.wq(s + 16n, 0n); this.wq(s + 24n, 15n); this.wb(s, 0); }
  private moveString(dst: bigint, src: bigint) {
    if (dst === src) return;
    this.freeStringBuffer(this.q(dst), this.q(dst + 24n), 0x140121515n); this.wq(dst + 24n, 15n); this.wq(dst + 16n, 0n); this.wb(dst, 0);
    this.pair(dst, src); this.pair(dst + 16n, src + 16n); this.resetString(src);
  }
  /** Actual14206CEC0, shared by original hash displacement. */
  private swapEntries(left: bigint, right: bigint, entry: bigint) {
    const frame = entry - 0x78n, first = left + 8n, second = right + 8n;
    const leftHash = this.d(left), rightHash = this.d(right); this.wd(left, rightHash);
    const rightDistance = this.b(right + 4n); this.wd(right, leftHash);
    const leftDistance = this.b(left + 4n); this.wb(left + 4n, rightDistance); this.wb(right + 4n, leftDistance);
    const lo0 = this.q(first), lo1 = this.q(first + 8n); this.wq(frame + 0x20n, lo0); this.wq(frame + 0x28n, lo1); this.wq(frame + 0x40n, lo0); this.wq(frame + 0x48n, lo1);
    const hi0 = this.q(first + 16n), hi1 = this.q(first + 24n); this.wq(frame + 0x30n, hi0); this.wq(frame + 0x38n, hi1); this.wq(frame + 0x50n, hi0); this.wq(frame + 0x58n, hi1);
    this.resetString(first); const value = this.d(first + 32n);
    if (first !== second) { this.resetString(first); this.pair(first, second); this.pair(first + 16n, second + 16n); this.resetString(second); }
    this.wd(first + 32n, this.d(second + 32n));
    let capacity = 15n;
    if (second !== frame + 0x40n) { this.freeStringBuffer(this.q(second), this.q(second + 24n), 0x14206d00bn); const a = this.q(frame + 0x20n), b = this.q(frame + 0x28n); this.wb(frame + 0x40n, 0); const c = this.q(frame + 0x30n), d = this.q(frame + 0x38n); this.wq(second, a); this.wq(second + 8n, b); this.wq(second + 16n, c); this.wq(second + 24n, d); }
    else capacity = this.q(frame + 0x58n);
    this.wd(second + 32n, value); this.freeStringBuffer(this.q(frame + 0x40n), capacity, 0x14206d00bn);
  }
  private hashSpan(span: bigint) {
    const pointer = this.q(span), count = this.d(span + 8n); let hash = 0x811c9dc5;
    if ((count | 0) > 0) for (let i = 0; i < count; i++) { const raw = this.b(pointer + BigInt(i)), folded = ((raw - 65) >>> 0) <= 25 ? raw + 32 : raw; hash = Math.imul(hash ^ folded, 0x1000193) >>> 0; }
    return hash;
  }
  private sameSpan(span: bigint, bucket: bigint, scratch: bigint) {
    const length = this.q(bucket + 24n); if (this.q(span + 8n) !== length) return false;
    const stored = this.q(bucket + 32n) > 15n ? this.q(bucket + 8n) : bucket + 8n;
    this.wq(scratch, this.q(span)); this.wq(scratch + 8n, this.q(span + 8n)); this.wq(scratch + 16n, stored); this.wq(scratch + 24n, length);
    const result = new NativeKeywordRegistry(this.memory, this.services, this.gsBase).compare(scratch, scratch + 16n);
    if (result.kind !== 'returned') throw new Stop(result); return result.value === 0n;
  }
  private lookupSpan(table: bigint, out: bigint, span: bigint, entry: bigint) {
    let bucket = this.q(table + 8n) + BigInt((this.hashSpan(span) & this.d(table + 20n)) | 0) * 48n, distance = 1;
    while (distance <= this.b(bucket + 4n)) {
      if (this.sameSpan(span, bucket, entry - 0x20n)) { this.wq(out, bucket); return; }
      distance = (distance + 1) & 255; bucket += 48n;
      if (distance === 0) this.stop('registry-probe-budget', 0x14253d8b0n, 0x14253d8b0n);
    }
    this.wq(out, this.q(table + 8n) + BigInt((this.d(table + 20n) + this.b(table + 24n) + 1) | 0) * 48n);
  }
  private installSpan(bucket: bigint, distance: number, hash: number, span: bigint, value: bigint, entry: bigint) {
    this.wd(bucket, hash); this.wb(bucket + 4n, distance); const length = this.q(span + 8n), pointer = this.q(span), temporary = entry - 0x38n;
    this.zero16(temporary); this.zero16(temporary + 16n); this.constructString(temporary, pointer, length);
    this.wd(temporary + 32n, this.d(value)); this.moveString(bucket + 8n, temporary);
    const capacity = this.q(temporary + 24n), identifier = this.d(temporary + 32n); this.wd(bucket + 40n, identifier);
    this.freeStringBuffer(this.q(temporary), capacity, 0x14253da78n);
  }
  /** Actual14253CE70 span insertion. Rehash remains an explicit native dependency. */
  private insertSpan(table: bigint, output: bigint, hash: number, span: bigint, value: bigint, entry: bigint) {
    this.wd(entry + 24n, hash); const fp = entry - 0x57n, sp = entry - 0xc8n;
    let bucket = this.q(table + 8n) + BigInt((hash & this.d(table + 20n)) | 0) * 48n, distance = 1;
    while (distance <= this.b(bucket + 4n)) {
      if (this.sameSpan(span, bucket, fp - 0x21n)) { this.wq(output, bucket); this.wb(output + 8n, 0); return; }
      distance = (distance + 1) & 255; bucket += 48n;
      if (distance === 0) this.stop('registry-probe-budget', 0x14253ce70n, 0x14253ce70n);
    }
    const f = new DataView(new ArrayBuffer(4)); f.setUint32(0, this.d(table + 28n), true);
    const ratio = Math.fround(Math.fround((this.int(table + 16n) + 1) | 0) / Math.fround(this.int(table + 20n)));
    if (distance > this.b(table + 24n) || ratio > f.getFloat32(0, true)) this.stop('registry-span-rehash', 0x14253fe90n, 0x14253d198n);
    if (this.b(bucket + 4n) === 0) {
      this.wd(bucket, hash); this.wb(bucket + 4n, distance); this.zero16(bucket + 8n); this.wq(bucket + 24n, 0n); this.wq(bucket + 32n, 0n);
      this.constructString(bucket + 8n, this.q(span), this.q(span + 8n)); this.wd(bucket + 40n, this.d(value));
    } else {
      const displacedHash = this.d(bucket), displacedDistance = (this.b(bucket + 4n) + 1) & 255;
      if (this.b(bucket + 52n) === 0) {
        this.wd(bucket + 48n, displacedHash); this.wb(bucket + 52n, displacedDistance); this.zero16(bucket + 56n); this.wq(bucket + 72n, 0n); this.wq(bucket + 80n, 0n);
        this.pair(bucket + 56n, bucket + 8n); this.pair(bucket + 72n, bucket + 24n); this.resetString(bucket + 8n); this.wd(bucket + 88n, this.d(bucket + 40n));
        this.wq(sp + 32n, value); this.installSpan(bucket, distance, hash, span, value, sp - 8n);
      } else {
        const carried = fp - 17n, key = carried + 8n;
        this.wd(carried, displacedHash); this.zero16(key + 16n); this.wb(carried + 4n, displacedDistance); this.zero16(key);
        this.pair(key, bucket + 8n); this.pair(key + 16n, bucket + 24n); this.resetString(bucket + 8n); this.wd(key + 32n, this.d(bucket + 40n));
        this.wq(sp + 32n, value); this.installSpan(bucket, distance, hash, span, value, sp - 8n);
        const first = bucket; let current = bucket, carriedDistance = this.b(carried + 4n);
        for (let steps = 0; ; steps++) {
          if (steps >= 256) this.stop('registry-displacement-budget', 0x14253d070n, 0x14253d070n);
          const next = current + 48n, nextDistance = this.b(next + 4n);
          if (nextDistance === 0) {
            this.wd(next, this.d(carried)); this.wb(next + 4n, carriedDistance); this.zero16(next + 8n); this.wq(next + 24n, 0n); this.wq(next + 32n, 0n); this.pair(next + 8n, key);
            const a = this.q(key + 16n), b = this.q(key + 24n), c = this.q(0x142795990n), d = this.q(0x142795998n); this.wq(next + 24n, a); this.wq(next + 32n, b);
            const identifier = this.d(key + 32n); this.wq(key + 16n, c); this.wq(key + 24n, d); this.wb(key, 0); this.wd(next + 40n, identifier);
            this.freeStringBuffer(this.q(key), this.q(key + 24n), 0x14253d1bdn); bucket = first; break;
          }
          if (nextDistance < carriedDistance) { this.swapEntries(carried, next, sp - 8n); carriedDistance = (this.b(carried + 4n) + 1) & 255; this.wb(carried + 4n, carriedDistance); current = next; continue; }
          carriedDistance = (carriedDistance + 1) & 255; this.wb(carried + 4n, carriedDistance); current = next;
          if (carriedDistance > this.b(table + 24n)) { this.swapEntries(carried, first, sp - 8n); this.stop('registry-span-rehash', 0x14253fe90n, 0x14253d0b4n); }
        }
      }
    }
    this.wd(table + 16n, this.d(table + 16n) + 1); this.wq(output, bucket); this.wb(output + 8n, 1);
  }
  private readLock(mutex: bigint) {
    this.wd(mutex, this.d(mutex) + 1);
    if (this.int(mutex + 4n) > 0) { this.wd(mutex, this.d(mutex) - 1); this.stop('contended-read-lock', 0x142569b80n, 0x142569b80n); }
  }
  private writeLock(mutex: bigint) {
    if (this.d(mutex + 4n) !== 0) this.stop('contended-write-lock', 0x142569ba5n, 0x142569ba5n);
    this.wd(mutex + 4n, 1); if (this.int(mutex) > 0) this.stop('contended-write-readers', 0x142569bb8n, 0x142569bb8n);
  }
  private recordFromSpan(output: bigint, identifier: number, span: bigint) {
    const record = new NativeKeywordRecord(this.memory, this.services, this.gsBase);
    this.wd(output, 0); this.wb(output + 4n, 0); this.accept(record.initializeVector(output + 8n));
    const length = this.q(span + 8n); this.wb(output + 4n, 0); this.wd(output, identifier);
    const pointer = this.accept(record.resize(output, Number(BigInt.asIntN(32, length + 1n))));
    this.copy(pointer, this.q(span), length, 0x142547713n); this.wb(pointer + length, 0);
  }
  /** Actual14253DED0 wrapper and ordinary-name path of14253DF70. */
  private internName(output: bigint, source: bigint, entry: bigint) {
    if (this.b(0x14368f571n) === 0 && this.b(0x14368f611n) !== 0 && this.b(0x14368f5bcn) === 0) this.stop('assert-diagnostic', 0x14254ab40n, 0x14253df2dn);
    const span = entry - 0x18n; this.pair(span, source);
    const inner = entry - 0x50n, fp = inner - 0xd8n, sp = inner - 0x1d8n, scratch = fp + 0xf0n, mutex = 0x14368f598n, table = 0x14313f738n;
    this.wd(scratch, 0);
    if (this.b(0x14368f570n) === 0) {
      if (this.b(0x14368f611n) !== 0 && this.b(0x14368f5b9n) === 0) this.stop('registry-initialization-diagnostic', 0x14253dfccn, 0x14253dfccn);
      this.wd(output, 0); return;
    }
    if (this.q(span + 8n) === 0n) this.stop('lexer-diagnostic-context', 0x14254bce0n, 0x14253e021n);
    const first = this.b(this.q(span));
    if (first === 45 || ((first - 48) & 255) < 10) this.stop('registry-numeric-name-diagnostic-untranslated', 0x14253e3e7n, 0x14253e3e7n);
    this.wq(sp + 0x30n, mutex); this.wd(sp + 0x38n, 0); this.readLock(mutex);
    this.lookupSpan(table, scratch, span, sp - 8n);
    const sentinel = () => this.q(table + 8n) + BigInt((this.d(table + 20n) + this.b(table + 24n) + 1) | 0) * 48n;
    if (this.q(scratch) !== sentinel()) { this.wd(output, this.d(this.q(scratch) + 40n)); this.wd(mutex, this.d(mutex) - 1); return; }
    this.wd(mutex, this.d(mutex) - 1); this.wq(sp + 0x50n, mutex); this.wd(sp + 0x58n, 1); this.writeLock(mutex);
    const identifier = (this.d(0x14368f57cn) + this.d(0x14368f58cn) + 1) >>> 0;
    this.lookupSpan(table, scratch, span, sp - 8n);
    if (this.q(scratch) !== sentinel()) { this.wd(output, this.d(this.q(scratch) + 40n)); this.wd(mutex + 4n, this.d(mutex + 4n) - 1); return; }
    if (this.d(0x14368f58cn) === this.d(0x14368f588n)) this.stop('registry-record-array-growth-untranslated', 0x14253e218n, 0x14253e218n);
    const record = this.q(0x14368f580n) + BigInt(this.int(0x14368f58cn)) * 72n;
    this.pair(sp + 0x30n, span); this.recordFromSpan(record, identifier, sp + 0x30n); this.wd(0x14368f58cn, this.d(0x14368f58cn) + 1);
    this.wd(scratch, identifier); this.wq(sp + 32n, scratch); this.insertSpan(table, sp + 0x30n, this.hashSpan(span), span, scratch, sp - 8n);
    if (this.b(sp + 0x38n) === 0) this.wd(this.q(sp + 0x30n) + 40n, this.d(scratch));
    if ((identifier | 0) >= this.int(0x14368f5acn)) this.stop('registry-reverse-array-growth', 0x1425406f0n, 0x14253e3d0n);
    this.accept(new NativeInputObject(this.memory, this.services, this.gsBase).assignName(this.q(0x14368f5a0n) + BigInt(identifier | 0) * 32n, this.q(span), this.q(span + 8n)));
    this.wd(0x14368f574n, this.d(0x14368f574n) + 1); this.wd(mutex + 4n, this.d(mutex + 4n) - 1); this.wd(output, identifier);
  }
  construct(destination: bigint, name: bigint, index: number, entryStack: bigint): TechnologyConstructorResult {
    destination = u64(destination); name = u64(name); entryStack = u64(entryStack); index >>>= 0;
    const fp = u64(entryStack - 0x5fn), child = u64(entryStack - 0xd0n);
    try {
      this.wd(fp + 0x77n, 0); this.string(destination + 16n); this.wd(destination + 48n, this.d(0x14285ba80n)); this.wq(destination + 56n, -1n); this.wb(destination + 64n, 1);
      this.wq(destination, 0x1429b9f10n); this.wq(destination + 8n, 0x1429b9f60n);
      for (const offset of [0x48n, 0xa0n, 0xf8n]) this.modifier(destination + offset, child);
      this.wq(destination + 0x150n, 0x14285e858n); this.vector(destination + 0x158n); this.vector(destination + 0x170n);
      this.wq(fp + 0x6fn, destination + 0x188n); this.group(destination + 0x198n); this.wd(destination + 0x190n, 0x165); this.wq(destination + 0x188n, 0x1427965d8n);
      for (let offset = 0x248n; offset <= 0x398n; offset += 24n) this.vector(destination + offset);
      this.string(destination + 0x3b0n); this.wd(destination + 0x3d0n, this.d(0x14285ba80n)); this.wd(destination + 0x3d8n, 0); this.wd(destination + 0x3dcn, 1); this.wq(destination + 0x3e0n, 0n);
      this.string(destination + 0x3e8n); this.wd(destination + 0x408n, 0); this.wb(destination + 0x40cn, 0); this.wd(destination + 0x410n, -1);
      this.wd(destination + 0x420n, 0x165); this.wd(destination + 0x428n, 4); this.wq(destination + 0x418n, 0x142796588n); this.wq(destination + 0x430n, 100000n); this.vector(destination + 0x438n);
      const tlsIndex = this.d(0x143693a98n); this.wq(destination + 0x450n, 0x14285f478n); this.wq(destination + 0x458n, 0n); this.wq(destination + 0x460n, 0n);
      this.guard(this.q(this.gsBase + 0x58n), tlsIndex, 0x14145fe9bn); this.wq(destination + 0x468n, 0x1430fd000n);
      this.modifier(destination + 0x470n, child); this.tracked(destination + 0x4c8n, child, false); this.wd(destination + 0x520n, 0);
      for (const offset of [0x528n, 0x530n, 0x538n]) { this.wq(fp + 0x6fn, -100000n); this.wq(destination + offset, this.q(fp + 0x6fn)); }
      this.wb(destination + 0x540n, 0); this.string(destination + 0x548n); this.string(destination + 0x568n); this.wd(destination + 0x588n, -1); this.wd(destination + 0x38n, index);
      if (destination + 16n !== name) {
        const pointer = this.q(name + 24n) > 15n ? this.q(name) : name, count = this.q(name + 16n);
        this.accept(new NativeInputObject(this.memory, this.services, this.gsBase).assignName(destination + 16n, pointer, count));
      }
      this.wd(destination + 48n, this.d(name + 32n));
      const pointer = this.q(name + 24n) > 15n ? this.q(name) : name, count = this.q(name + 16n);
      this.wq(fp - 0x49n, pointer); this.wq(fp - 0x41n, count);
      this.internName(fp + 0x77n, fp - 0x49n, child); this.wd(destination + 60n, this.d(fp + 0x77n));
      const formatName = this.q(name + 24n) > 15n ? this.q(name) : name;
      this.format(fp - 9n, formatName, child); this.format(fp - 0x49n, 0x1429c1430n, child);
      this.pair(fp - 0x29n, fp - 0x49n); this.pair(fp - 0x19n, fp - 0x39n);
      let defaultLength = this.q(0x142795990n), defaultCapacity = this.q(0x142795998n);
      this.wq(fp - 0x39n, defaultLength); this.wq(fp - 0x31n, defaultCapacity); this.wb(fp - 0x49n, 0); this.wd(fp + 0x77n, 0x1f);
      const labelPointer = this.q(fp + 15n) > 15n ? this.q(fp - 9n) : fp - 9n;
      this.appendString(fp - 0x29n, labelPointer, this.q(fp + 7n));
      const combined = fp - 0x29n, description = destination + 0x1e0n;
      if (description !== combined) this.accept(new NativeInputObject(this.memory, this.services, this.gsBase).assignName(description, this.q(combined + 24n) > 15n ? this.q(combined) : combined, this.q(combined + 16n)));
      let capacity = this.q(fp - 17n);
      if (capacity > 15n) { this.freeStringBuffer(this.q(combined), capacity, 0x140b1dd08n); defaultLength = this.q(0x142795990n); defaultCapacity = this.q(0x142795998n); }
      this.wq(fp - 0x19n, defaultLength); this.wq(fp - 0x11n, defaultCapacity); this.wb(combined, 0);
      capacity = this.q(fp - 0x31n);
      if (capacity > 15n) { this.freeStringBuffer(this.q(fp - 0x49n), capacity, 0x140b1dd0en); defaultLength = this.q(0x142795990n); defaultCapacity = this.q(0x142795998n); }
      this.wq(fp - 0x39n, defaultLength); this.wq(fp - 0x31n, defaultCapacity); this.wb(fp - 0x49n, 0);
      this.freeStringBuffer(this.q(fp - 9n), this.q(fp + 15n), 0x140b1dd02n);
      this.wd(destination + 0x190n, this.d(destination + 60n)); return { kind: 'returned', value: destination };
    } catch (error) { if (error instanceof Stop) return error.result; throw error; }
  }
}
