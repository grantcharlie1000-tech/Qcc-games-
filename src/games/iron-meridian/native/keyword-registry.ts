import type { KeywordRecordMemory, KeywordRecordServices } from './keyword-record';

export type KeywordRegistryMemory = KeywordRecordMemory;
export interface KeywordRegistryServices extends KeywordRecordServices {
  registerExit?(destructor: bigint): bigint;
}
export type RegistryStop = { kind: 'runtime-required'; boundary: string; nativeAddress: bigint; callSite: bigint };
export type RegistryResult = { kind: 'returned'; value: bigint } | RegistryStop;
export type RegistryVoidResult = { kind: 'complete' } | RegistryStop;
export type KeywordLookupResult = { kind: 'matched'; id: number; exit: 0x14253fc71n } | { kind: 'miss'; exit: 0x14253fba9n } | RegistryStop;
class Stop { constructor(readonly result: RegistryStop) {} }
const u64 = (v: bigint) => BigInt.asUintN(64, v);
const i32 = (v: number) => v | 0;
const fold = (v: number) => ((v - 65) >>> 0) <= 25 ? v + 32 : v;

/** Recovered registry primitives. Memory is raw x64 layout, not JavaScript strings.
 * Locks use the declared single-participant memory model. A contended loop stops
 * after its executed stores; it does not fabricate successful synchronization.
 */
export class NativeKeywordRegistry {
  constructor(private readonly memory: KeywordRegistryMemory, private readonly services: KeywordRegistryServices, private readonly gsBase: bigint, private readonly loopBudget = 1_000_000) {}
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private d(a: bigint) { return this.memory.readDword(u64(a)) >>> 0; }
  private b(a: bigint) { return this.memory.readByte(u64(a)) & 255; }
  private wq(a: bigint, v: bigint) { this.memory.writeQword(u64(a), u64(v)); }
  private wd(a: bigint, v: number) { this.memory.writeDword(u64(a), v >>> 0); }
  private wb(a: bigint, v: number) { this.memory.writeByte(u64(a), v & 255); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new Stop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private operation<T>(f: () => T): T | RegistryStop { try { return f(); } catch (error) { if (error instanceof Stop) return error.result; throw error; } }
  private tick(iteration: number, pc: bigint) { if (iteration >= this.loopBudget) this.stop('instruction-loop-budget', pc, pc); }
  private copy(destination: bigint, source: bigint, bytes: bigint, site: bigint) {
    if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, site);
    this.services.copy(u64(destination), u64(source), u64(bytes));
  }
  private malloc(bytes: bigint, site: bigint) {
    if (!this.services.crtAllocate) this.stop('crt-allocate', 0x1425a01dcn, site);
    return u64(this.services.crtAllocate(u64(bytes)));
  }
  private free(pointer: bigint, _site: bigint) {
    // All selected release callers pass through actual1425A0218/14222F060.
    if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
    this.services.crtFree(u64(pointer));
  }
  private pair(destination: bigint, source: bigint) {
    const lo = this.q(source), hi = this.q(source + 8n);
    this.wq(destination, lo); this.wq(destination + 8n, hi);
  }
  private zero16(destination: bigint) { this.wq(destination, 0n); this.wq(destination + 8n, 0n); }
  private resetString(object: bigint) { this.wq(object + 0x10n, 0n); this.wq(object + 0x18n, 15n); this.wb(object, 0); }
  private float(a: bigint) { const v = new DataView(new ArrayBuffer(4)); v.setUint32(0, this.d(a), true); return v.getFloat32(0, true); }
  private growth(old: number, required: number) {
    const f = Math.fround(Math.fround(old) * this.float(0x142795988n));
    const n = !Number.isFinite(f) || f >= 2147483648 || f < -2147483648 ? -2147483648 : Math.trunc(f);
    return n < required ? required : n;
  }
  private allocate(allocator: bigint, bytes: bigint, alignment: number, site: bigint): bigint {
    const target = this.q(this.q(allocator) + 8n);
    if (target === 0x14011d540n) return this.malloc(bytes, 0x14011d547n);
    if (target === 0x140121d20n) {
      const getter = this.q(this.q(allocator) + 0x38n);
      const backing = getter === 0x1401693c0n ? this.q(allocator + 0x20n) : this.services.allocatorGetter ? this.services.allocatorGetter(getter, allocator) : this.stop('allocator-getter', getter, 0x140121d33n);
      return this.allocate(backing, bytes, alignment, 0x140121d50n);
    }
    if (!this.services.allocate) this.stop('allocator-allocate', target, site);
    return u64(this.services.allocate(target, allocator, u64(bytes), alignment >>> 0));
  }
  private release(allocator: bigint, pointer: bigint, site: bigint): void {
    const target = this.q(this.q(allocator) + 0x10n);
    if (target === 0x14011d560n) { if (pointer !== 0n) this.free(pointer, 0x14222f060n); return; }
    if (target === 0x140122500n) {
      if (pointer !== u64(allocator + 8n)) {
        const getter = this.q(this.q(allocator) + 0x38n);
        const backing = getter === 0x1401693c0n ? this.q(allocator + 0x20n) : this.services.allocatorGetter ? this.services.allocatorGetter(getter, allocator) : this.stop('allocator-getter', getter, 0x140122515n);
        this.release(backing, pointer, 0x140122526n);
      }
      return;
    }
    if (!this.services.release) this.stop('allocator-release', target, site);
    this.services.release(target, allocator, pointer);
  }
  private strlen(pointer: bigint) {
    let size = 0n;
    while (this.b(pointer + size) !== 0) { this.tick(Number(size), 0x14253fa60n); size = u64(size + 1n); }
    return size;
  }
  private allocation(capacity: bigint, site: bigint, invalidSite: bigint): bigint {
    const size = u64(capacity + 1n);
    if (size === 0n) return 0n;
    if (size < 0x1000n) return this.malloc(size, site);
    const total = u64(size + 0x27n);
    if (total <= size) this.stop('string-allocation-overflow', 0x14012b2d0n, 0x14011f132n);
    const raw = this.malloc(total, site);
    if (raw === 0n) this.stop('invalid-aligned-allocation', 0x1425c7db4n, invalidSite);
    const aligned = u64(raw + 0x27n) & ~31n;
    this.wq(aligned - 8n, raw); return aligned;
  }
  private constructString(destination: bigint, source: bigint, length: bigint): void {
    length = u64(length);
    if (length > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f138n);
    if (length <= 15n) {
      this.wq(destination + 0x10n, length); this.wq(destination + 0x18n, 15n);
      this.copy(destination, source, length, 0x14011f073n); this.wb(destination + length, 0); return;
    }
    const masked = length | 15n;
    const capacity = masked > 0x7fffffffffffffffn ? 0x7fffffffffffffffn : masked < 22n ? 22n : masked;
    const pointer = this.allocation(capacity, u64(capacity + 1n) < 0x1000n ? 0x14011f0ecn : 0x14011f0a4n, 0x14011f12cn);
    this.wq(destination, pointer); this.wq(destination + 0x10n, length); this.wq(destination + 0x18n, capacity);
    this.copy(pointer, source, length, 0x14011f108n); this.wb(pointer + length, 0);
  }
  private copyString(destination: bigint, input: bigint) {
    this.zero16(destination); this.wq(destination + 0x10n, 0n); this.wq(destination + 0x18n, 0n);
    const length = this.q(input + 0x10n), source = this.q(input + 0x18n) > 15n ? this.q(input) : input;
    if (length > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14011f882n);
    if (length <= 15n) { this.wq(destination + 0x10n, length); this.wq(destination + 0x18n, 15n); this.pair(destination, source); return; }
    const masked = length | 15n, capacity = masked > 0x7fffffffffffffffn ? 0x7fffffffffffffffn : masked < 22n ? 22n : masked;
    const pointer = this.allocation(capacity, capacity + 1n < 0x1000n ? 0x14011f83en : 0x14011f7f7n, 0x14011f876n);
    this.wq(destination, pointer); this.wq(destination + 0x10n, length); this.wq(destination + 0x18n, capacity);
    this.copy(pointer, source, u64(length + 1n), 0x14011f858n);
  }
  private moveString(destination: bigint, source: bigint) {
    if (destination !== source) {
      this.releaseStringBuffer(destination, this.q(destination + 0x18n), 0x1401214d6n, 0x140121515n);
      this.wq(destination + 0x18n, 15n); this.wq(destination + 0x10n, 0n); this.wb(destination, 0);
      this.pair(destination, source); this.pair(destination + 16n, source + 16n); this.resetString(source);
    }
  }
  private assignString(destination: bigint, source: bigint, length: bigint) {
    length = u64(length); const oldCapacity = this.q(destination + 0x18n);
    if (length <= oldCapacity) {
      const pointer = oldCapacity > 15n ? this.q(destination) : destination;
      this.wq(destination + 0x10n, length); this.copy(pointer, source, length, 0x14012b3f7n); this.wb(pointer + length, 0); return;
    }
    if (length > 0x7fffffffffffffffn) this.stop('string-length-error', 0x14012b310n, 0x14012b50fn);
    const masked = length | 15n, half = oldCapacity >> 1n;
    const capacity = masked > 0x7fffffffffffffffn || oldCapacity > 0x7fffffffffffffffn - half ? 0x7fffffffffffffffn : masked < oldCapacity + half ? oldCapacity + half : masked;
    const pointer = this.allocation(capacity, capacity + 1n < 0x1000n ? 0x14012b49bn : 0x14012b47fn, 0x14012b51bn);
    this.wq(destination + 0x10n, length); this.wq(destination + 0x18n, capacity);
    this.copy(pointer, source, length, 0x14012b4b4n); this.wb(pointer + length, 0);
    this.releaseStringBuffer(destination, oldCapacity, 0x14012b4ecn, 0x14012b51bn); this.wq(destination, pointer);
  }
  private releaseStringBuffer(object: bigint, capacity: bigint, site: bigint, invalidSite: bigint) {
    if (capacity <= 15n) return;
    let pointer = this.q(object);
    if (u64(capacity + 1n) >= 0x1000n) {
      const raw = this.q(pointer - 8n);
      if (u64(pointer - raw - 8n) > 31n) this.stop('invalid-aligned-allocation', 0x1425c7db4n, invalidSite);
      pointer = raw;
    }
    this.free(pointer, site);
  }
  private destroyStringBody(object: bigint): void {
    this.releaseStringBuffer(object, this.q(object + 0x18n), 0x14012056an, 0x140120588n);
    this.wq(object + 0x10n, 0n); this.wq(object + 0x18n, 15n); this.wb(object, 0);
  }
  private normalizeBody(object: bigint): void {
    const pointer = this.q(object + 0x18n) > 15n ? this.q(object) : object;
    const length = this.q(object + 0x10n);
    let index = 0;
    if (length !== 0n) do {
      this.tick(index, 0x1425501c0n);
      const raw = this.b(pointer + BigInt(index));
      if (raw === 0) break;
      // Native passes MOVSX byte, rather than an unsigned C character.
      const character = (raw << 24) >> 24;
      if (this.d(0x143694cccn) !== 0) this.stop('locale-lowercase', 0x1425e1af8n, 0x1425e1d6fn);
      this.wb(pointer + BigInt(index), fold(character));
      index = (index + 1) >>> 0;
    } while (BigInt(index) < length);
  }
  private compareBytes(left: bigint, right: bigint, count: bigint): number {
    if (this.d(0x143694cccn) !== 0) this.stop('locale-comparison', 0x1425dc538n, 0x1425dc532n);
    if (left === 0n || right === 0n || count > 0x7fffffffn) this.stop('invalid-compare-errno', 0x1425dccf0n, 0x1425dc4fan);
    let result = 0, index = 0n;
    while (count !== 0n) {
      this.tick(Number(index), 0x1425dc4b5n);
      const a = fold(this.b(left + index)), b = fold(this.b(right + index));
      result = (a - b) | 0;
      if (result !== 0 || a === 0) break;
      count--; index++;
    }
    return result;
  }
  private compareSpans(left: bigint, right: bigint): number {
    const leftLength = this.q(left + 8n), rightLength = this.q(right + 8n);
    const count = u64(BigInt(i32(Number(BigInt.asUintN(32, leftLength < rightLength ? leftLength : rightLength)))));
    const result = this.compareBytes(this.q(left), this.q(right), count);
    return result !== 0 ? result >>> 0 : leftLength < rightLength ? 0xffffffff : leftLength > rightLength ? 1 : 0;
  }
  private readLock(mutex: bigint) {
    this.wd(mutex, this.d(mutex) + 1);
    if (i32(this.d(mutex + 4n)) > 0) {
      this.wd(mutex, this.d(mutex) - 1);
      this.stop('contended-read-lock', 0x142569b80n, 0x142569b80n);
    }
  }
  private readUnlock(mutex: bigint) { this.wd(mutex, this.d(mutex) - 1); }
  private fnv(pointer: bigint, length: bigint): number {
    let hash = 0x811c9dc5;
    const count = Number(BigInt.asUintN(32, length));
    if (i32(count) > 0) for (let i = 0; i < count; i++) {
      this.tick(i, 0x14253fad0n); hash = Math.imul(hash ^ fold(this.b(pointer + BigInt(i))), 0x1000193) >>> 0;
    }
    return hash >>> 0;
  }
  private swapEntries(left: bigint, right: bigint, entry: bigint) {
    const frame = u64(entry - 0x78n), first = u64(left + 8n), second = u64(right + 8n);
    const leftHash = this.d(left), rightHash = this.d(right); this.wd(left, rightHash);
    const rightDistance = this.b(right + 4n); this.wd(right, leftHash);
    const leftDistance = this.b(left + 4n); this.wb(left + 4n, rightDistance); this.wb(right + 4n, leftDistance);
    const lo0 = this.q(first), lo1 = this.q(first + 8n);
    this.wq(frame + 0x20n, lo0); this.wq(frame + 0x28n, lo1); this.wq(frame + 0x40n, lo0); this.wq(frame + 0x48n, lo1);
    const hi0 = this.q(first + 16n), hi1 = this.q(first + 24n);
    this.wq(frame + 0x30n, hi0); this.wq(frame + 0x38n, hi1); this.wq(frame + 0x50n, hi0); this.wq(frame + 0x58n, hi1);
    this.resetString(first); const value = this.d(first + 0x20n);
    if (first !== second) { this.resetString(first); this.pair(first, second); this.pair(first + 16n, second + 16n); this.resetString(second); }
    this.wd(first + 0x20n, this.d(second + 0x20n));
    let cleanupCapacity = 15n;
    if (second !== u64(frame + 0x40n)) {
      this.releaseStringBuffer(second, this.q(second + 24n), 0x14206cf96n, 0x14206d00bn);
      const a = this.q(frame + 0x20n), b = this.q(frame + 0x28n);
      this.wb(frame + 0x40n, 0);
      const c = this.q(frame + 0x30n), d = this.q(frame + 0x38n);
      this.wq(second, a); this.wq(second + 8n, b); this.wq(second + 16n, c); this.wq(second + 24n, d);
    } else cleanupCapacity = this.q(frame + 0x58n);
    this.wd(second + 0x20n, value);
    this.releaseStringBuffer(frame + 0x40n, cleanupCapacity, 0x14206cfebn, 0x14206d00bn);
  }
  private installCopy(bucket: bigint, distance: number, hash: number, source: bigint, entry: bigint) {
    const frame = u64(entry - 0x58n), temporary = u64(frame + 0x20n);
    this.wb(bucket + 4n, distance); this.wd(bucket, hash); this.copyString(temporary, source);
    this.wd(frame + 0x40n, this.d(this.q(entry + 0x28n)));
    this.moveString(bucket + 8n, temporary);
    const capacity = this.q(frame + 0x38n), value = this.d(frame + 0x40n);
    this.wd(bucket + 0x28n, value);
    this.releaseStringBuffer(temporary, capacity, 0x140a8d8a8n, 0x140a8d8b3n);
  }
  private moveBucketString(destination: bigint, source: bigint) {
    this.zero16(destination); this.wq(destination + 0x10n, 0n); this.wq(destination + 0x18n, 0n);
    this.pair(destination, source); this.pair(destination + 16n, source + 16n); this.resetString(source);
  }
  private installMoved(bucket: bigint, distance: number, hash: number, source: bigint) {
    this.wd(bucket, hash); this.wb(bucket + 4n, distance); this.moveString(bucket + 8n, source); this.wd(bucket + 0x28n, this.d(source + 0x20n));
  }
  private loadExceeded(table: bigint): boolean {
    const numerator = Math.fround((i32(this.d(table + 0x10n)) + 1) | 0), denominator = Math.fround(i32(this.d(table + 0x14n)));
    return Math.fround(numerator / denominator) > this.float(table + 0x1cn);
  }
  private insertBody(table: bigint, output: bigint, hash: number, source: bigint, entry: bigint, moved: boolean, depth = 0): bigint {
    if (depth > 64) this.stop('instruction-recursion-budget', moved ? 0x14253d540n : 0x14253d1d0n, moved ? 0x14253d89an : 0x14253d523n);
    hash >>>= 0; this.wd(entry + 0x18n, hash);
    const frame = u64(entry - (moved ? 0x5fn : 0x57n)), sp = u64(entry - (moved ? 0xc8n : 0xd8n));
    const storedView = u64(frame - (moved ? 0x49n : 0x51n)), queryView = u64(storedView + 16n);
    let bucket = u64(this.q(table + 8n) + BigInt(i32(hash & this.d(table + 0x14n))) * 48n), distance = 1, iteration = 0;
    if (this.b(bucket + 4n) >= 1) {
      do {
        this.tick(iteration++, moved ? 0x14253d581n : 0x14253d211n);
        const stored = this.q(bucket + 0x20n) > 15n ? this.q(bucket + 8n) : bucket + 8n;
        const length = this.q(bucket + 0x18n), query = this.q(source + 0x18n) > 15n ? this.q(source) : source;
        this.wq(storedView, stored); this.wq(storedView + 8n, length); this.wq(queryView, query);
        const queryLength = this.q(source + 16n); this.wq(queryView + 8n, queryLength);
        if (length === queryLength) {
          // Both XMM loads precede both destination stores in the original caller.
          const a = this.q(storedView), b = this.q(storedView + 8n), c = this.q(queryView), d = this.q(queryView + 8n);
          this.wq(storedView + 32n, a); this.wq(storedView + 40n, b); this.wq(queryView + 32n, c); this.wq(queryView + 40n, d);
          if (this.compareSpans(queryView + 32n, storedView + 32n) === 0) { this.wq(output, bucket); this.wb(output + 8n, 0); return output; }
        }
        bucket = u64(bucket + 48n); distance = (distance + 1) & 255;
      } while (distance <= this.b(bucket + 4n));
      hash = this.d(entry + 0x18n);
    }
    if (distance > this.b(table + 0x18n) || this.loadExceeded(table)) {
      this.rehash(table, sp - 8n);
      if (!moved) this.wq(sp + 0x20n, this.q(entry + 0x28n));
      return this.insertBody(table, output, this.d(entry + 0x18n), source, sp - 8n, moved, depth + 1);
    }
    if (this.b(bucket + 4n) === 0) {
      this.wd(bucket, hash); this.wb(bucket + 4n, distance);
      if (moved) { this.moveBucketString(bucket + 8n, source); this.wd(bucket + 0x28n, this.d(source + 32n)); }
      else { this.copyString(bucket + 8n, source); this.wd(bucket + 0x28n, this.d(this.q(entry + 0x28n))); }
      this.wd(table + 16n, this.d(table + 16n) + 1); this.wq(output, bucket); this.wb(output + 8n, 1); return output;
    }
    const oldHash = this.d(bucket), displacedDistance = (this.b(bucket + 4n) + 1) & 255;
    if (this.b(bucket + 0x34n) === 0) {
      this.wd(bucket + 0x30n, oldHash); this.wb(bucket + 0x34n, displacedDistance);
      this.moveBucketString(bucket + 0x38n, bucket + 8n); this.wd(bucket + 0x58n, this.d(bucket + 0x28n));
      if (moved) this.installMoved(bucket, distance, hash, source);
      else { this.wq(sp + 0x20n, this.q(entry + 0x28n)); this.installCopy(bucket, distance, hash, source, sp - 8n); }
      this.wd(table + 16n, this.d(table + 16n) + 1); this.wq(output, bucket); this.wb(output + 8n, 1); return output;
    }
    const temporary = u64(frame - (moved ? 9n : 17n)), key = u64(temporary + 8n);
    this.wd(temporary, oldHash); this.zero16(key + 16n); this.wb(temporary + 4n, displacedDistance); this.zero16(key);
    this.pair(key, bucket + 8n); this.pair(key + 16n, bucket + 24n); this.resetString(bucket + 8n); this.wd(key + 32n, this.d(bucket + 40n));
    if (moved) this.installMoved(bucket, distance, hash, source);
    else { this.wq(sp + 0x20n, this.q(entry + 0x28n)); this.installCopy(bucket, distance, hash, source, sp - 8n); }
    const firstBucket = bucket;
    let carriedDistance = this.b(temporary + 4n);
    for (let count = 0; ; count++) {
      this.tick(count, moved ? 0x14253d760n : 0x14253d3e0n);
      const nextDistance = this.b(bucket + 0x34n); bucket = u64(bucket + 48n);
      if (nextDistance === 0) {
        this.wd(bucket, this.d(temporary)); this.wb(bucket + 4n, carriedDistance);
        this.zero16(bucket + 8n); this.wq(bucket + 24n, 0n); this.wq(bucket + 32n, 0n);
        this.pair(bucket + 8n, key);
        const a = this.q(key + 16n), b = this.q(key + 24n), c = this.q(0x142795990n), d = this.q(0x142795998n);
        this.wq(bucket + 24n, a); this.wq(bucket + 32n, b);
        const value = this.d(key + 32n); this.wq(key + 16n, c); this.wq(key + 24n, d); this.wb(key, 0); this.wd(bucket + 40n, value);
        this.releaseStringBuffer(key, this.q(key + 24n), moved ? 0x14253d875n : 0x14253d4f5n, moved ? 0x14253d8a4n : 0x14253d52dn);
        this.wd(table + 16n, this.d(table + 16n) + 1); this.wq(output, firstBucket); this.wb(output + 8n, 1); return output;
      }
      if (nextDistance < carriedDistance) {
        this.swapEntries(temporary, bucket, sp - 8n); carriedDistance = (this.b(temporary + 4n) + 1) & 255; this.wb(temporary + 4n, carriedDistance); continue;
      }
      carriedDistance = (carriedDistance + 1) & 255; this.wb(temporary + 4n, carriedDistance);
      if (carriedDistance <= this.b(table + 24n)) continue;
      this.swapEntries(temporary, firstBucket, sp - 8n); this.rehash(table, sp - 8n);
      const result = u64(frame - (moved ? 0x19n : 0x21n));
      this.insertBody(table, result, this.d(temporary), key, sp - 8n, true, depth + 1);
      this.releaseStringBuffer(key, this.q(key + 24n), moved ? 0x14253d7f3n : 0x14253d473n, moved ? 0x14253d8aan : 0x14253d533n);
      this.pair(output, result); return output;
    }
  }
  private rehash(table: bigint, entry: bigint) {
    const mask = this.d(table + 20n); let exponent: number;
    if (mask === 0 || mask === 1 || mask === 3) exponent = 3;
    else if (mask >= 7 && mask <= 0x1fffffff && (mask & (mask + 1)) === 0) exponent = 33 - Math.clz32(mask);
    else this.stop('rehash-diagnostic', 0x14254b3f0n, 0x14254012bn);
    // Small switch cases jump directly to 400FF, bypassing this debug-only block.
    if (mask >= 1023 && this.b(0x14368f611n) !== 0 && this.b(0x14368f5bfn) === 0) {
      const ratio = Math.fround(Math.fround(i32(this.d(table + 16n))) / Math.fround(i32(mask)));
      if (!(ratio > this.float(0x14279dd60n))) {
        const sp = u64(entry - 0x48n);
        this.wb(sp + 0x50n, 0); this.wq(sp + 0x28n, 0x14368f5bfn); this.wq(sp + 0x20n, sp + 0x50n);
        this.stop('assert-diagnostic', 0x14254ab40n, 0x1425400ecn);
      }
    }
    // 14254010E is a tail jump after restoring RSP, not a nested call.
    this.resizeTable(table, exponent, entry);
  }
  private resizeTable(table: bigint, exponent: number, entry: bigint) {
    exponent |= 0;
    if (((exponent - 1) >>> 0) > 29) this.stop('rehash-diagnostic', 0x14254b3f0n, 0x142540c5bn);
    const sp = u64(entry - 0x48n), capacity = (1 << exponent) >>> 0, probe = (exponent + 2) & 255;
    let remaining = i32(this.d(table + 16n)); const old = this.q(table + 8n);
    this.wd(table + 16n, 0); this.wd(table + 20n, capacity - 1); this.wb(table + 24n, probe);
    const pointer = this.malloc(BigInt((capacity + probe + 1) >>> 0) * 48n, 0x1425a07b4n);
    const end = u64(pointer + BigInt((capacity + this.b(table + 24n)) | 0) * 48n); this.wq(table + 8n, pointer);
    for (let at = pointer, count = 0; at !== end; at = u64(at + 48n), count++) { this.tick(count, 0x142540b91n); this.wb(at + 4n, 0); }
    this.wb(end + 4n, 255);
    if (old === 0x14313f760n) return;
    for (let at = u64(old + 32n), count = 0; remaining > 0; at = u64(at + 48n), count++) {
      this.tick(count, 0x142540bb6n);
      if (this.b(at - 28n) === 0) continue;
      this.insertBody(table, sp + 32n, this.d(at - 32n), at - 24n, sp - 8n, true);
      this.releaseStringBuffer(at - 24n, this.q(at), 0x142540c02n, 0x142540c79n);
      this.wq(at - 8n, 0n); remaining--; this.wq(at, 15n); this.wb(at - 24n, 0);
    }
    this.free(old, 0x142540c23n);
  }
  private clearStrings(vector: bigint, begin: number, end: number) {
    let index = BigInt(begin | 0), offset = u64(index * 32n), count = 0;
    const limit = BigInt(end | 0);
    while (index < limit) {
      this.tick(count++, 0x140122570n);
      const object = u64(this.q(vector) + offset);
      this.releaseStringBuffer(object, this.q(object + 24n), 0x1401225a6n, 0x1401225e9n);
      this.wq(object + 16n, 0n); index++; this.wq(object + 24n, 15n); this.wb(object, 0); offset = u64(offset + 32n);
    }
  }
  private reserveStrings(vector: bigint, requested: number) {
    const oldCapacity = i32(this.d(vector + 8n));
    if (requested <= oldCapacity) return;
    const capacity = this.growth(oldCapacity, requested);
    const destination = this.allocate(this.q(vector + 16n), BigInt(capacity >>> 0) << 5n, 8, 0x1401283b8n);
    let source = this.q(vector); const end = u64(source + BigInt(i32(this.d(vector + 12n))) * 32n);
    for (let output = destination, count = 0; source !== end; source = u64(source + 32n), output = u64(output + 32n), count++) {
      this.tick(count, 0x14012a170n);
      this.zero16(output); this.wq(output + 16n, 0n); this.wq(output + 24n, 0n);
      this.pair(output, source); this.pair(output + 16n, source + 16n);
      this.wq(source + 24n, 15n); this.wq(source + 16n, 0n); this.wq(source + 24n, 15n); this.wb(source, 0);
    }
    this.release(this.q(vector + 16n), this.q(vector), 0x14012a1bcn); this.wd(vector + 8n, capacity); this.wq(vector, destination);
  }
  private postInitializeBody() {
    if (this.b(0x14368f611n) !== 0 && this.b(0x14368f5bdn) === 0 && i32(this.d(0x14368f59cn)) <= 0) this.stop('postinit-debug-block', 0x142540721n, 0x14254071fn);
    const vector = 0x14368f5a0n, oldCount = i32(this.d(vector + 12n));
    const desired = ((oldCount !== 0 ? oldCount : i32(this.d(0x14368f57cn))) + 4000) | 0;
    this.clearStrings(vector, 0, oldCount); this.wd(vector + 12n, 0);
    if (desired > 0) {
      this.reserveStrings(vector, desired);
      const loaded = i32(this.d(vector + 12n)); let additional = (desired - loaded) | 0;
      for (let object = u64(this.q(vector) + BigInt(loaded) * 32n), count = 0; additional > 0; object = u64(object + 32n), count++, additional--) {
        this.tick(count, 0x1425407d0n); this.zero16(object); this.resetString(object);
      }
    } else this.clearStrings(vector, desired, 0);
    this.wd(vector + 12n, desired);
    for (let index = 0; index < 10767; index++) {
      const record = 0x14343af20n + BigInt(index) * 72n;
      const name = this.d(record + 20n) === 0 ? 0x14279471dn : this.q(record + 8n);
      const length = this.strlen(name), object = u64(this.q(vector) + BigInt(i32(this.d(record))) * 32n);
      this.assignString(object, name, length);
    }
    this.wd(0x14368f574n, this.d(0x14368f57cn));
    let records = this.q(0x14368f580n), offset = 0n, index = 0;
    while (index < i32(this.d(0x14368f58cn))) {
      this.tick(index, 0x142540880n);
      const record = u64(records + offset), name = this.d(record + 20n) === 0 ? 0x14279471dn : this.q(record + 8n);
      const length = this.strlen(name), object = u64(this.q(vector) + BigInt(i32(this.d(record))) * 32n);
      this.assignString(object, name, length); records = this.q(0x14368f580n);
      const id = i32(this.d(records + offset)); this.wd(0x14368f574n, Math.max(id, i32(this.d(0x14368f574n)))); index = (index + 1) | 0; offset = u64(offset + 72n);
    }
    // These literal addresses, lengths and offsets are embedded in 1425408EA..AAD.
    const punctuation = [[0x20n, 0x142a32428n, 1n], [0x40n, 0x14279b35cn, 1n], [0x60n, 0x142c04fc0n, 1n], [0x80n, 0x1428152fcn, 1n], [0xa0n, 0x1427afaecn, 1n], [0xc0n, 0x14279fe44n, 1n], [0x120n, 0x14279fe3cn, 1n], [0x100n, 0x14279fde4n, 1n], [0x200n, 0x142796e30n, 1n], [0x220n, 0x1427b01a8n, 1n], [0x240n, 0x1427948c0n, 1n], [0x3a60n, 0x142854e54n, 1n], [0x3a80n, 0x142854e58n, 1n], [0x6300n, 0x142c04fc4n, 2n]] as const;
    for (const [offset, literal, length] of punctuation) this.assignString(u64(this.q(vector) + offset), literal, length);
  }
  private writeLock(mutex: bigint) {
    if (this.d(mutex + 4n) !== 0) this.stop('contended-write-lock', 0x142569ba5n, 0x142569ba5n);
    this.wd(mutex + 4n, 1);
    if (i32(this.d(mutex)) > 0) this.stop('contended-write-readers', 0x142569bb8n, 0x142569bb8n);
  }
  private populateBody(entry: bigint) {
    const frame = u64(entry - 0x5fn), sp = u64(entry - 0xd8n), mutex = 0x14368f598n;
    this.wq(frame - 0x19n, mutex); this.wd(frame - 0x11n, 1); this.writeLock(mutex);
    if (this.b(0x14368f570n) !== 0) { this.wd(mutex + 4n, this.d(mutex + 4n) - 1); return; }
    const vector = 0x14368f580n, oldCapacity = i32(this.d(vector + 8n));
    if (oldCapacity < 32768) {
      const capacity = this.growth(oldCapacity, 32768), pointer = this.allocate(this.q(vector + 16n), BigInt(capacity) * 72n, 8, 0x142540244n);
      // Original relocation entry is reached even for an empty range, whose body returns.
      if (i32(this.d(vector + 12n)) !== 0) this.stop('populated-record-vector-relocation', 0x1403be610n, 0x14254026an);
      this.release(this.q(vector + 16n), this.q(vector), 0x142540287n); this.wq(vector, pointer); this.wd(vector + 8n, capacity);
    }
    const temporary = u64(frame + 0x17n), output = u64(frame - 0x29n);
    this.zero16(temporary); this.resetString(temporary); this.wd(0x14368f57cn, 0);
    let maximum = 0;
    for (let index = 0; index < 10767; index++) {
      const record = 0x14343af20n + BigInt(index) * 72n;
      const name = this.d(record + 20n) === 0 ? 0x14279471dn : this.q(record + 8n);
      this.assignString(temporary, name, this.strlen(name)); this.normalizeBody(temporary);
      if (this.b(0x14368f611n) !== 0 && this.b(0x14368f5b8n) === 0) this.stop('registry-debug-duplicate-block', 0x14254032an, 0x142540324n);
      const hash = this.fnv(this.q(temporary + 24n) > 15n ? this.q(temporary) : temporary, this.q(temporary + 16n));
      this.wq(sp + 0x20n, record); this.insertBody(0x14313f738n, output, hash, temporary, sp - 8n, false);
      if (this.b(output + 8n) === 0) this.wd(this.q(output) + 40n, this.d(record));
      maximum = Math.max(i32(this.d(record)), i32(this.d(0x14368f57cn))); this.wd(0x14368f57cn, maximum);
    }
    this.wb(0x14368f570n, 1); this.wd(0x14368f574n, maximum); this.postInitializeBody();
    this.releaseStringBuffer(temporary, this.q(temporary + 24n), 0x14254057dn, 0x1425405ddn); this.resetString(temporary);
    this.wd(mutex + 4n, this.d(mutex + 4n) - 1);
  }
  private lookupBody(stack: bigint, frame: bigint): Exclude<KeywordLookupResult, RegistryStop> {
    const string = u64(stack + 0x30n), mutex = 0x14368f598n;
    this.wq(stack + 0x70n, mutex); this.wd(stack + 0x78n, 0); this.readLock(mutex);
    let first = this.q(string), capacity = this.q(string + 0x18n), length = this.q(string + 0x10n);
    const hash = this.fnv(capacity > 15n ? first : string, length);
    let bucket = u64(this.q(0x14313f740n) + BigInt((hash & this.d(0x14313f74cn)) | 0) * 48n), distance = 1, iterations = 0;
    if (this.b(bucket + 4n) >= distance) do {
      this.tick(iterations++, 0x14253fb20n);
      const stored = this.q(bucket + 0x20n) > 15n ? this.q(bucket + 8n) : bucket + 8n;
      const storedLength = this.q(bucket + 0x18n);
      this.wq(stack + 0x50n, stored); this.wq(stack + 0x58n, storedLength);
      this.wq(stack + 0x60n, capacity > 15n ? first : string); this.wq(stack + 0x68n, length);
      if (length === storedLength) {
        this.pair(frame - 0x80n, stack + 0x50n); this.pair(frame - 0x70n, stack + 0x60n);
        if (this.compareSpans(frame - 0x70n, frame - 0x80n) === 0) {
          const sentinelIndex = (this.d(0x14313f74cn) + 1 + this.b(0x14313f750n)) | 0;
          const sentinel = u64(this.q(0x14313f740n) + BigInt(sentinelIndex) * 48n);
          if (bucket !== sentinel) {
            const id = this.d(bucket + 0x28n); this.readUnlock(mutex);
            return { kind: 'matched', id, exit: 0x14253fc71n };
          }
          break;
        }
        capacity = this.q(string + 0x18n); length = this.q(string + 0x10n); first = this.q(string);
      }
      distance = (distance + 1) & 255; bucket = u64(bucket + 48n);
    } while (distance <= this.b(bucket + 4n));
    this.readUnlock(mutex); return { kind: 'miss', exit: 0x14253fba9n };
  }
  /** 14253FA43 prefix, then FA7F lookup. RSI is zero at this bounded entry.
   * SP+30 is caller-owned C++ string storage; SP+50..78 and FP-80..61 are scratch.
   * The actual containing tokenizer has FP=SP+100. No cleanup runs on a stop.
   */
  lookupCString(cString: bigint, stackPointer: bigint, framePointer: bigint): KeywordLookupResult {
    return this.operation(() => {
      const string = u64(stackPointer + 0x30n);
      this.zero16(string); this.wq(string + 0x10n, 0n); this.wq(string + 0x18n, 0n);
      this.constructString(string, u64(cString), this.strlen(cString)); this.normalizeBody(string);
      return this.lookupBody(u64(stackPointer), u64(framePointer));
    });
  }
  /** Starts FA7F with an already-constructed, already-normalized query object. */
  lookupNormalized(stackPointer: bigint, framePointer: bigint): KeywordLookupResult { return this.operation(() => this.lookupBody(u64(stackPointer), u64(framePointer))); }
  /** Driver-selected 140120530 call, separate from the unexecuted lexer continuation. */
  destroyLookupString(stackPointer: bigint): RegistryVoidResult { return this.operation(() => { this.destroyStringBody(u64(stackPointer + 0x30n)); return { kind: 'complete' as const }; }); }
  normalize(object: bigint): RegistryVoidResult { return this.operation(() => { this.normalizeBody(u64(object)); return { kind: 'complete' as const }; }); }
  compare(leftSpan: bigint, rightSpan: bigint): RegistryResult { return this.operation(() => ({ kind: 'returned' as const, value: BigInt(this.compareSpans(u64(leftSpan), u64(rightSpan))) })); }
  /** Original 1425401B0 first/once initialization; record construction is separate. */
  populate(entryStack: bigint): RegistryVoidResult { return this.operation(() => { this.populateBody(u64(entryStack)); return { kind: 'complete' as const }; }); }
  insert(table: bigint, output: bigint, hash: number, source: bigint, entryStack: bigint): RegistryResult { return this.operation(() => ({ kind: 'returned' as const, value: this.insertBody(u64(table), u64(output), hash, u64(source), u64(entryStack), false) })); }
  insertMoved(table: bigint, output: bigint, hash: number, source: bigint, entryStack: bigint): RegistryResult { return this.operation(() => ({ kind: 'returned' as const, value: this.insertBody(u64(table), u64(output), hash, u64(source), u64(entryStack), true) })); }
  postInitialize(): RegistryVoidResult { return this.operation(() => { this.postInitializeBody(); return { kind: 'complete' as const }; }); }
  initializeRecordArrayAllocator(): RegistryResult { return this.initializeArrayAllocator(false); }
  initializeReverseArrayAllocator(): RegistryResult { return this.initializeArrayAllocator(true); }
  private initializeArrayAllocator(reverse: boolean): RegistryResult {
    return this.operation(() => {
      const index = this.d(0x143693a98n), table = this.q(u64(this.gsBase + 0x58n)), thread = this.q(table + BigInt(index) * 8n);
      if (i32(this.d(thread + 0x20ecn)) < i32(this.d(0x1433dd120n))) this.stop('tls-guard-acquire', 0x1425a0588n, reverse ? 0x14011b30cn : 0x14011b28cn);
      this.wq(reverse ? 0x14368f5b0n : 0x14368f590n, 0x1430fd000n);
      if (!this.services.registerExit) this.stop('atexit-registration', 0x1425a0450n, reverse ? 0x14011b300n : 0x14011b280n);
      return { kind: 'returned' as const, value: u64(this.services.registerExit(reverse ? 0x1427836d0n : 0x142783680n)) };
    });
  }
}
