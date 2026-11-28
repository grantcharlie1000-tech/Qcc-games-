import { describe, expect, it } from 'vitest';
import { researchModifiersDaily } from '../../../src/games/iron-meridian/native/research-modifiers';
import type { ResearchModifierMemory } from '../../../src/games/iron-meridian/native/research-modifiers';
import { researchRateAfterHelpers } from '../../../src/games/iron-meridian/native/research-rate';
import reference from '../../../work/iron-meridian/native-modifiers/reference.json';

describe('native daily research modifier closure against original x86-64 instructions', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const bytes = new Map<bigint, number>();
    for (const write of input.memoryWrites) {
      const address = BigInt(write.address);
      for (let index = 0; index < write.bytes.length; index += 2) {
        bytes.set(address + BigInt(index / 2), Number.parseInt(write.bytes.slice(index, index + 2), 16));
      }
    }
    const regions = reference.metadata.memoryRegions.map(region => ({ start: BigInt(region.address), size: BigInt(region.size) }));
    const memory: ResearchModifierMemory = {
      readByte(address) {
        if (!regions.some(region => address >= region.start && address < region.start + region.size)) {
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
    const calls: string[] = [];
    const hookFor = (entry: bigint) => {
      const hook = input.entryHooks.find(item => BigInt(item.address) === entry);
      if (!hook) throw new Error(`No declared virtual boundary for ${entry.toString(16)}`);
      return hook;
    };
    const result = researchModifiersDaily(memory, BigInt(input.stateAddress), {
      entryVirtual78({ target, entry }) {
        expect(target).toBe(0x900100n);
        calls.push(`v78:0x${entry.toString(16)}`);
        const hook = hookFor(entry);
        return { begin: BigInt(hook.begin), end: BigInt(hook.end) };
      },
      entryVirtual80({ target, entry, definition, countryIdAddress }) {
        expect(target).toBe(0x900200n);
        calls.push(`v80:0x${entry.toString(16)}:0x${definition.toString(16)}:0x${countryIdAddress.toString(16)}`);
        return hookFor(entry).level;
      },
      resolveCountry140c07bf0() { throw new Error('Unresolved assertion/TLS country path reached'); },
      resolveGroup140c08790() { throw new Error('Unresolved assertion/TLS group path reached'); },
      contextMask({ target }) {
        expect(target).toBe(0x900300n);
        calls.push('context');
        return input.contextMask;
      },
      localeCompare1425d05d0({ target, left, right }) {
        expect(target).toBe(0x1425d05d0n);
        calls.push(`locale:0x${left.toString(16)}:0x${right.toString(16)}`);
        return input.localeComparison;
      },
    });
    expect(result.stack30).toBe(BigInt(expected.stack30));
    expect(result.stack38).toBe(BigInt(expected.stack38));
    expect(result.temporarySourceEntries.map(String)).toEqual(expected.temporarySourceEntries);
    expect(calls).toEqual(expected.leafCalls);

    const rate = researchRateAfterHelpers({
      helper140f537e0Stack30: result.stack30,
      helper140f537e0Stack38: result.stack38,
      rawStatusOffset1c0: BigInt(input.rawStatus1c0),
      rawStatusOffset1c8: BigInt(input.rawStatus1c8),
      helper140b205b0Pointee: BigInt(input.technologyPointee),
      runtimeGlobal1433e4658: BigInt(input.runtimeLowerBound),
    });
    expect(rate.kind).toBe(expected.rateKind);
    expect(rate.kind === 'returned' ? rate.value : rate.outputBeforeFault).toBe(BigInt(expected.rateOutputQword));
  });
});
