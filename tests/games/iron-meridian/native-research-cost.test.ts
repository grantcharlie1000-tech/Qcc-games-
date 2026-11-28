import { describe, expect, it } from 'vitest';
import { researchTechnologyDenominatorDaily, roundedFixedPoint142572ef0 } from '../../../src/games/iron-meridian/native/research-cost';
import type { ResearchCostMemory } from '../../../src/games/iron-meridian/native/research-cost';
import { researchRateAfterHelpers } from '../../../src/games/iron-meridian/native/research-rate';
import reference from '../../../work/iron-meridian/native-cost/reference.json';

describe('technology denominator against original x86-64 execution', () => {
  it.each(reference.roundCases)('$id', ({ input, expected }) => {
    expect(roundedFixedPoint142572ef0(BigInt(input))).toBe(BigInt(expected));
  });

  it.each(reference.cases)('$id', ({ input, expected }) => {
    const bytes = new Map<bigint, number>();
    for (const write of input.memoryWrites) {
      for (let index = 0; index < write.bytes.length; index += 2) {
        bytes.set(BigInt(write.address) + BigInt(index / 2), Number.parseInt(write.bytes.slice(index, index + 2), 16));
      }
    }
    const memory: ResearchCostMemory = {
      readByte(address) {
        if (!reference.metadata.memoryRegions.some(region => address >= BigInt(region.address) && address < BigInt(region.address) + BigInt(region.size))) {
          throw new Error(`Unmapped synthetic read at ${address.toString(16)}`);
        }
        return bytes.get(address) ?? 0;
      },
      readDword(address) {
        let value = 0;
        for (let index = 0; index < 4; index++) value += this.readByte(address + BigInt(index)) * 2 ** (index * 8);
        return value >>> 0;
      },
      readQword(address) {
        let value = 0n;
        for (let index = 0; index < 8; index++) value |= BigInt(this.readByte(address + BigInt(index))) << BigInt(index * 8);
        return value;
      },
    };
    const adjustment = BigInt.asIntN(64, BigInt(input.helperStack38) + BigInt(input.status1c0));
    expect(adjustment).toBe(BigInt(expected.adjustment));
    const result = researchTechnologyDenominatorDaily(memory, BigInt(input.definitionAddress), adjustment);
    expect(result.kind).toBe(expected.kind);
    if (result.kind === 'runtime-required') {
      expect(result.boundary).toBe(expected.boundary);
      expect(result.nativeAddress).toBe(BigInt(expected.nativeAddress!));
      return;
    }
    expect(result.value).toBe(BigInt(expected.value!));
    expect(result.roundedAdjustment).toBe(BigInt(expected.roundedAdjustment!));
    expect(result.rawGap32).toBe(BigInt(expected.rawGap32!));
    expect(result.positiveGap32).toBe(BigInt(expected.positiveGap32!));
    const rate = researchRateAfterHelpers({
      helper140f537e0Stack30: BigInt(input.helperStack30),
      helper140f537e0Stack38: BigInt(input.helperStack38),
      rawStatusOffset1c0: BigInt(input.status1c0),
      rawStatusOffset1c8: BigInt(input.status1c8),
      helper140b205b0Pointee: result.value,
      runtimeGlobal1433e4658: BigInt(input.runtimeLowerBound),
    });
    expect(rate.kind).toBe(expected.rateKind);
    expect(rate.kind === 'returned' ? rate.value : rate.outputBeforeFault).toBe(BigInt(expected.rateOutputQword!));
  });
});
