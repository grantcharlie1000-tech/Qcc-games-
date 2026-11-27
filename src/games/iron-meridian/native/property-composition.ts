import { NativeScalarValues } from './scalar-values';
import { NativeScalarWrappers, NativeTechnologyNumericFields } from './scalar-wrappers';
import type { InputObjectMemory, InputObjectServices } from './input-object';
import type { NativeTokenizer } from './tokenizer';
import type { NativeParserConstants, ParserConstantsServices } from './parser-constants';
import type { NativeParserExtended } from './parser-extended';
import { NativeTechnologyFields } from './technology-fields';
import type { TechnologyFieldResult } from './technology-fields';

export type PropertyIteratorResult = TechnologyFieldResult;
type RuntimeStop = Exclude<PropertyIteratorResult, { kind: 'complete' }>;
class Stop { constructor(readonly result: RuntimeStop) {} }
const u64 = (v: bigint) => BigInt.asUintN(64, v);

/** Actual 142541100 composed with reviewed Boolean and two numeric technology branches. */
export class NativeTechnologyPropertyComposition {
  private readonly fields: NativeTechnologyFields;
  private readonly numeric: NativeTechnologyNumericFields;
  constructor(private readonly memory: InputObjectMemory, private readonly services: ParserConstantsServices & InputObjectServices,
    private readonly tokenizer: NativeTokenizer, private readonly constants: NativeParserConstants,
    private readonly parser: NativeParserExtended, private readonly gsBase: bigint, private readonly loopBudget = 1_000_000) {
    this.fields = new NativeTechnologyFields(memory, services, gsBase);
    this.numeric = new NativeTechnologyNumericFields(new NativeScalarWrappers(new NativeScalarValues(memory), constants));
  }
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private d(a: bigint) { return this.memory.readDword(u64(a)) >>> 0; }
  private int(a: bigint) { return this.d(a) | 0; }
  private b(a: bigint) { return this.memory.readByte(u64(a)) & 255; }
  private wb(a: bigint, v: number) { this.memory.writeByte(u64(a), v & 255); }
  private wd(a: bigint, v: number) { this.memory.writeDword(u64(a), v >>> 0); }
  private wq(a: bigint, v: bigint) { this.memory.writeQword(u64(a), u64(v)); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new Stop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private accept(result: { kind: string }) { if (result.kind !== 'returned' && result.kind !== 'complete') throw new Stop(result as RuntimeStop); }
  private backing(a: bigint, site: bigint) {
    const target = this.q(this.q(a) + 0x38n);
    if (target === 0x1401693c0n) return this.q(a + 0x20n);
    if (target === 0x140169400n) return this.q(a + 0x48n);
    if (!this.services.allocatorGetter) this.stop('allocator-getter', target, site);
    return u64(this.services.allocatorGetter(target, a));
  }
  private release(a: bigint, p: bigint, site: bigint): void {
    const target = this.q(this.q(a) + 0x10n);
    if (target === 0x140122500n) {
      if (p !== u64(a + 8n)) this.release(this.backing(a, 0x140122515n), p, 0x140122526n);
    } else if (target === 0x14011d560n) {
      if (p !== 0n) {
        if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
        this.services.crtFree(p);
      }
    } else {
      if (!this.services.release) this.stop('allocator-release', target, site);
      this.services.release(target, a, p);
    }
  }
  private copy(dst: bigint, src: bigint, count: bigint, site: bigint) {
    if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, site);
    this.services.copy(u64(dst), u64(src), u64(count));
  }
  private guard(table: bigint, site: bigint) {
    const thread = this.q(table + BigInt(this.d(0x143693a98n)) * 8n);
    if (this.int(thread + 0x20ecn) < this.int(0x1433dd120n)) this.stop('tls-guard-acquire', 0x1425a0588n, site);
  }
  private virtual(definition: bigint, slot: bigint, expected: bigint, boundary: string, site: bigint) {
    const target = this.q(this.q(definition) + slot);
    if (target !== expected) this.stop(boundary, target, site);
  }
  private next(input: bigint, entry: bigint, site: bigint) {
    const target = this.q(this.q(input) + 8n);
    if (target !== 0x14253f460n) this.stop('input-next-token', target, site);
    const result = this.tokenizer.next(input, entry); this.accept(result);
    if (result.kind !== 'returned') throw Error('Tokenizer returned no value');
    return result.value >>> 0;
  }
  /** Actual140152EE0. Its initialization order differs from14014D6F0. */
  private token(dst: bigint, src: bigint) {
    this.wd(dst, this.d(src)); this.wb(dst + 4n, this.b(src + 4n));
    const count = this.int(src + 20n), pointer = this.q(src + 8n), table = this.q(this.gsBase + 0x58n), local = u64(dst + 32n);
    this.wq(dst + 8n, 0n); this.wq(dst + 16n, 0n); this.wq(dst + 24n, local);
    this.guard(table, 0x140152febn);
    this.wq(local, 0x142796130n); this.wq(local + 32n, 0x1430fd000n);
    const allocator = this.q(dst + 24n), oldPointer = this.q(dst + 8n);
    this.wd(dst + 20n, 0); this.release(allocator, oldPointer, 0x140152f71n);
    this.wq(dst + 8n, 0n); const vtable = this.q(local); this.wd(dst + 16n, 0);
    const target = this.q(vtable + 32n);
    if (target === 0x1401691d0n) { this.wd(dst + 16n, 21); this.wq(dst + 8n, local + 8n); }
    else {
      if (!this.services.inlineBuffer) this.stop('inline-buffer', target, 0x140152facn);
      this.services.inlineBuffer(target, local, dst + 8n, dst + 16n);
    }
    this.accept(this.constants.insertBytes(dst + 8n, this.int(dst + 20n), pointer, count));
  }
  private cleanToken(token: bigint, site: bigint) {
    const pointer = this.q(token + 8n);
    if (pointer !== 0n) { this.wd(token + 20n, 0); this.release(this.q(token + 24n), pointer, site); }
  }
  private line(parser: bigint) { return this.d(this.q(this.q(parser + 0x28n) + 8n) + 8n); }
  /** Actual140B23AA0. Constructor provenance remains outside this stage. */
  private finalize(definition: bigint) {
    if (this.d(definition + 0x520n) !== 0) {
      for (const [offset, global] of [[0x528n, 0x1433e43d8n], [0x530n, 0x1433e4488n], [0x538n, 0x1433e4588n]] as const) {
        if (BigInt.asIntN(64, this.q(definition + offset)) < 0n) this.wq(definition + offset, this.q(global));
      }
    }
  }
  begin(definition: bigint, parser: bigint, entryStack: bigint): PropertyIteratorResult {
    const metadata = this.fields.begin(definition, parser);
    if (metadata.kind === 'runtime-required' && metadata.boundary === 'technology-property-iterator') return this.iterate(definition, parser, entryStack);
    return metadata;
  }
  iterate(definition: bigint, parser: bigint, entryStack: bigint): PropertyIteratorResult {
    definition = u64(definition); parser = u64(parser); entryStack = u64(entryStack);
    const sp = u64(entryStack - 0x288n), fp = u64(entryStack - 0x188n), child = u64(sp - 8n), vector = u64(sp + 0x30n), local = u64(sp + 0x48n);
    const peek = u64(fp - 0x10n), terminating = u64(fp - 0x60n); let steps = 0;
    try {
      this.virtual(definition, 0x30n, 0x140154030n, 'property-initial-hook', 0x142541136n);
      this.wd(entryStack + 8n, this.line(parser));
      this.wq(vector, 0n); this.wq(vector + 8n, 0n); this.wq(vector + 16n, local);
      this.guard(this.q(this.gsBase + 0x58n), 0x142541675n);
      this.wq(local, 0x1429ce910n); this.wq(fp - 0x70n, 0x1430fd000n); this.wd(vector + 12n, 0);
      this.copy(0n, 0n, 0n, 0x1425411b7n);
      this.release(this.q(vector + 16n), this.q(vector), 0x1425411c9n);
      this.wq(vector, 0n); this.wd(vector + 8n, 0);
      const inline = this.q(this.q(local) + 0x20n);
      if (inline === 0x140169280n) { this.wq(vector, local + 8n); this.wd(vector + 8n, 16); }
      else {
        if (!this.services.inlineBuffer) this.stop('inline-buffer', inline, 0x14254120en);
        this.services.inlineBuffer(inline, local, vector, vector + 8n);
      }
      while (true) {
        if (++steps > this.loopBudget) this.stop('property-loop-budget', 0x142541221n, 0x142541221n);
        const input = this.q(parser + 0x28n);
        if (this.b(input + 0x64n) === 0) {
          const available = this.next(input, child, 0x142541231n); this.wd(input + 0x10n, available);
          if (available === 0) this.wd(input + 0x18n, 19);
          this.wb(input + 0x64n, 1);
        }
        this.token(peek, input + 0x18n); const kind = this.d(peek), ended = kind === 4 || kind === 19;
        this.cleanToken(peek, 0x14254127an);
        if (ended) break;
        this.accept(this.parser.consume(parser, 0, child));
        const identifier = this.d(parser + 0x30n);
        this.virtual(definition, 0x28n, 0x14011d530n, 'property-duplicate-predicate', 0x14254129cn);
        this.virtual(definition, 0x20n, 0x140b25c90n, 'property-dispatcher', 0x1425414d2n);
        this.accept(identifier === 0x2e62 || identifier === 0x2e64
          ? this.numeric.dispatch(definition, parser, identifier, child)
          : this.fields.dispatch(definition, parser, identifier));
        if (this.d(parser + 0x18n) !== 0) this.stop('property-parser-diagnostic', 0x142542b00n, 0x1425414f5n);
      }
      this.next(this.q(parser + 0x28n), child, 0x142541506n);
      this.token(terminating, this.q(parser + 0x28n) + 0x18n);
      const startLine = this.d(entryStack + 8n);
      let pointer = this.q(terminating + 8n);
      if (this.int(terminating + 20n) !== 0 && this.b(pointer) === 64) {
        const resolved = this.constants.resolve(parser, peek, child); this.accept(resolved);
        if (resolved.kind !== 'returned') throw Error('Resolution returned no token');
        this.wd(terminating, this.d(resolved.value)); this.wb(terminating + 4n, this.b(resolved.value + 4n));
        this.accept(this.constants.moveBytes(terminating + 8n, resolved.value + 8n, child));
        this.cleanToken(peek, 0x142541578n);
        this.accept(this.parser.assignToken(this.q(parser + 0x28n) + 0x18n, terminating));
        pointer = this.q(terminating + 8n);
      }
      if (pointer !== 0n) { this.wd(terminating + 20n, 0); this.release(this.q(terminating + 24n), pointer, 0x1425415d5n); }
      if (this.d(parser + 0x18n) !== 0) this.stop('property-parser-diagnostic', 0x142542b00n, 0x142541628n);
      this.virtual(definition, 0x40n, 0x140b23aa0n, 'technology-finalizer', 0x1425415ebn); this.finalize(definition);
      const sourceHook = this.q(this.q(definition) + 0x38n), endLine = this.line(parser), source = u64(this.q(this.q(parser + 0x28n) + 8n) + 0x18n);
      void startLine; void endLine; void source;
      if (sourceHook !== 0x140154030n) this.stop('property-source-hook', sourceHook, 0x142541614n);
      const vectorPointer = this.q(vector);
      if (vectorPointer !== 0n) { this.wd(vector + 12n, 0); this.release(this.q(vector + 16n), vectorPointer, 0x142541645n); }
      return { kind: 'complete' };
    } catch (error) { if (error instanceof Stop) return error.result; throw error; }
  }
}
