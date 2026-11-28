import { describe, expect, it } from 'vitest';
import { researchRateAfterHelpers } from '../../../src/games/iron-meridian/native/research-rate';
import reference from '../../../work/iron-meridian/native-port/research-rate-vectors.json';

describe('HOI4 VA 0x140F53350 arithmetic against isolated x86-64 execution', () => {
  it.each(reference.cases)('$id', ({ inputs, expected }) => {
    const result = researchRateAfterHelpers({
      helper140f537e0Stack30: BigInt(inputs.helper140f537e0Stack30),
      helper140f537e0Stack38: BigInt(inputs.helper140f537e0Stack38),
      rawStatusOffset1c0: BigInt(inputs.rawStatusOffset1c0),
      rawStatusOffset1c8: BigInt(inputs.rawStatusOffset1c8),
      helper140b205b0Pointee: BigInt(inputs.helper140b205b0Pointee),
      runtimeGlobal1433e4658: BigInt(inputs.runtimeGlobal1433e4658),
    });
    expect(result.kind).toBe(expected.kind);
    expect(result.helper140b205b0Stack20).toBe(BigInt(expected.helper140b205b0Stack20));
    const outputQword = result.kind === 'returned' ? result.value : result.outputBeforeFault;
    expect(outputQword).toBe(BigInt(expected.outputQword));
  });
});
