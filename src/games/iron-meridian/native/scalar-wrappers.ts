import type { NativeParserConstants } from './parser-constants';
import type { NativeScalarValues, ScalarResult } from './scalar-values';
const u64 = (value: bigint) => BigInt.asUintN(64, value);
/** Actual142543360/142543500, including the restored-frame diagnostic tail call. */
export class NativeScalarWrappers {
  constructor(private readonly scalars: NativeScalarValues, private readonly constants: NativeParserConstants) {}
  private finish(parser: bigint, entryStack: bigint, result: ScalarResult): ScalarResult {
    if (result.kind !== 'returned' || result.value) return result;
    const diagnostic = this.constants.diagnoseExpression(parser, entryStack);
    if (diagnostic.kind === 'runtime-required') return diagnostic;
    if (diagnostic.kind !== 'returned') throw new Error('Diagnostic returned no native status');
    return { kind: 'returned', value: (diagnostic.value & 255) !== 0 };
  }
  readInteger(parser: bigint, output: bigint, entryStack: bigint): ScalarResult {
    parser = u64(parser); output = u64(output); entryStack = u64(entryStack);
    return this.finish(parser, entryStack, this.scalars.readInteger(u64(parser + 0xc0n), output));
  }
  readFixed(parser: bigint, output: bigint, entryStack: bigint): ScalarResult {
    parser = u64(parser); output = u64(output); entryStack = u64(entryStack);
    return this.finish(parser, entryStack, this.scalars.readFixed(u64(parser + 0xc0n), output, u64(entryStack - 0x30n)));
  }
}

export type NumericFieldResult = { kind: 'complete' } | Extract<ScalarResult, { kind: 'runtime-required' }>;
/** Actual140B25C90 start_year and research_cost branches; other fields stay explicit. */
export class NativeTechnologyNumericFields {
  constructor(private readonly wrappers: NativeScalarWrappers) {}
  dispatch(definition: bigint, parser: bigint, identifier: number, entryStack: bigint): NumericFieldResult {
    definition = u64(definition); parser = u64(parser); entryStack = u64(entryStack);
    const child = u64(entryStack - 0x360n);
    let result: ScalarResult;
    switch (identifier | 0) {
      case 0x2e62: result = this.wrappers.readInteger(parser, u64(definition + 0x3d8n), child); break;
      case 0x2e64: result = this.wrappers.readFixed(parser, u64(definition + 0x3e0n), child); break;
      default: return { kind: 'runtime-required', boundary: 'technology-numeric-field-untranslated', nativeAddress: 0x140b25c90n, callSite: 0x140b25c90n };
    }
    return result.kind === 'runtime-required' ? result : { kind: 'complete' };
  }
}
