import type { KeywordRecordMemory } from './keyword-record';
import { NativeTokenizer } from './tokenizer';

type RuntimeStop = { kind: 'runtime-required'; boundary: string; nativeAddress: bigint; callSite: bigint };
export type ParserSkipResult = { kind: 'returned'; value: boolean } | RuntimeStop;
export type ParserBalancedResult = { kind: 'complete' } | RuntimeStop;
class Stop { constructor(readonly result: RuntimeStop) {} }
const u64 = (v: bigint) => BigInt.asUintN(64, v);

/** Actual142544B90 and142544C00, composing the concrete tokenizer. */
export class NativeParserNavigation {
  constructor(private readonly memory: KeywordRecordMemory, private readonly tokenizer: NativeTokenizer, private readonly loopBudget = 1_000_000) {}
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private int(a: bigint) { return this.memory.readDword(u64(a)) | 0; }
  private next(input: bigint, entry: bigint, site: bigint) {
    const target = this.q(this.q(input) + 8n);
    if (target !== 0x14253f460n) throw new Stop({ kind: 'runtime-required', boundary: 'input-next-token', nativeAddress: target, callSite: site });
    const result = this.tokenizer.next(input, entry);
    if (result.kind !== 'returned') throw new Stop(result);
    return result.value >>> 0;
  }
  private balanced(parser: bigint, entry: bigint, guarded: boolean) {
    let depth = 0, steps = 0;
    const firstSite = guarded ? 0x142544bb0n : 0x142544c16n, repeatSite = guarded ? 0x142544bddn : 0x142544c46n;
    let available = this.next(this.q(parser + 0x28n), entry, firstSite);
    while (available !== 0) {
      if (++steps > this.loopBudget) {
        const site = guarded ? 0x142544bb7n : 0x142544c20n;
        throw new Stop({ kind: 'runtime-required', boundary: 'parser-navigation-loop-budget', nativeAddress: site, callSite: site });
      }
      // Exact1401B6BE0 getter over a freshly reloaded input pointer.
      const kind = this.int(this.q(parser + 0x28n) + 0x18n);
      if (kind === 3) depth = (depth + 1) | 0;
      else if (kind === 4) { if (depth <= 0) return; depth = (depth - 1) | 0; }
      available = this.next(this.q(parser + 0x28n), entry, repeatSite);
    }
  }
  skipValue(parser: bigint, entryStack: bigint): ParserSkipResult {
    parser = u64(parser); entryStack = u64(entryStack);
    if (this.int(parser + 0xc0n) !== 3) return { kind: 'returned', value: false };
    try { this.balanced(parser, u64(entryStack - 0x30n), true); return { kind: 'returned', value: true }; }
    catch (error) { if (error instanceof Stop) return error.result; throw error; }
  }
  skipBalanced(parser: bigint, entryStack: bigint): ParserBalancedResult {
    try { this.balanced(u64(parser), u64(entryStack - 0x30n), false); return { kind: 'complete' }; }
    catch (error) { if (error instanceof Stop) return error.result; throw error; }
  }
}
