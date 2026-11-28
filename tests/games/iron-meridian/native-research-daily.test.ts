import { describe, expect, it } from 'vitest';
import { researchDaily } from '../../../src/games/iron-meridian/native/research-daily';
import type { ResearchDailyMemory } from '../../../src/games/iron-meridian/native/research-daily';
import reference from '../../../work/iron-meridian/native-daily/reference.json';

describe('composed daily research against one original-instruction execution', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const bytes = new Map<bigint, number>();
    function applyWrites(writes: readonly { address: string; bytes: string }[]) {
      for (const write of writes) {
        for (let index = 0; index < write.bytes.length; index += 2) {
          bytes.set(BigInt(write.address) + BigInt(index / 2), Number.parseInt(write.bytes.slice(index, index + 2), 16));
        }
      }
    }
    applyWrites(input.memoryWrites);
    const events: string[] = [];
    const calls: string[] = [];
    const memory: ResearchDailyMemory = {
      readByte(address) {
        if (!reference.metadata.memoryRegions.some(region => address >= BigInt(region.address) && address < BigInt(region.address) + BigInt(region.size))) {
          throw new Error(`Unmapped synthetic read at ${address.toString(16)}`);
        }
        return bytes.get(address) ?? 0;
      },
      readDword(address) {
        events.push(`d:0x${address.toString(16)}`);
        let value = 0;
        for (let index = 0; index < 4; index++) value += this.readByte(address + BigInt(index)) * 2 ** (index * 8);
        return value >>> 0;
      },
      readQword(address) {
        events.push(`q:0x${address.toString(16)}`);
        if (address === 0x1433e4658n && expected.kind !== 'returned') throw new Error('Minimum global must not be read on this path');
        let value = 0n;
        for (let index = 0; index < 8; index++) value |= BigInt(this.readByte(address + BigInt(index))) << BigInt(index * 8);
        return value;
      },
    };
    function leaf(value: string) { calls.push(value); events.push(`leaf:${value}`); }
    const hookFor = (entry: bigint) => {
      const hook = input.entryHooks.find(item => BigInt(item.address) === entry);
      if (!hook) throw new Error(`Missing declared virtual boundary for ${entry.toString(16)}`);
      return hook;
    };
    const state = BigInt(input.stateAddress);
    const result = researchDaily(memory, state, {
      entryVirtual78({ target, entry }) {
        expect(target).toBe(0x900100n);
        leaf(`v78:0x${entry.toString(16)}`);
        const hook = hookFor(entry);
        return { begin: BigInt(hook.begin), end: BigInt(hook.end) };
      },
      entryVirtual80({ target, entry, definition, countryIdAddress }) {
        expect(target).toBe(0x900200n);
        leaf(`v80:0x${entry.toString(16)}:0x${definition.toString(16)}:0x${countryIdAddress.toString(16)}`);
        applyWrites(input.virtual80Writes);
        return hookFor(entry).level;
      },
      resolveCountry140c07bf0() { throw new Error('Unresolved modifier country assertion/TLS path'); },
      resolveGroup140c08790() { throw new Error('Unresolved modifier group assertion/TLS path'); },
      contextMask({ target }) {
        expect(target).toBe(0x900300n); leaf('context'); return input.contextMask;
      },
      localeCompare1425d05d0({ target, left, right }) {
        expect(target).toBe(0x1425d05d0n);
        leaf(`locale:0x${left.toString(16)}:0x${right.toString(16)}`);
        return input.localeComparison;
      },
    });
    expect(result.kind).toBe(expected.kind);
    expect(result.modifiers.stack30).toBe(BigInt(expected.stack30));
    expect(result.modifiers.stack38).toBe(BigInt(expected.stack38));
    expect(result.modifiers.temporarySourceEntries.map(String)).toEqual(expected.temporarySourceEntries);
    expect(result.helper140b205b0Stack20).toBe(BigInt(expected.costAdjustment));
    expect(calls).toEqual(expected.leafCalls);

    const captured1c8 = events.indexOf(`q:0x${(state + 0x1c8n).toString(16)}`);
    const captured1c0 = events.indexOf(`q:0x${(state + 0x1c0n).toString(16)}`);
    const capturedDefinition = events.lastIndexOf(`q:0x${(state + 0x160n).toString(16)}`);
    expect(captured1c8).toBeGreaterThanOrEqual(0);
    expect(captured1c0).toBeGreaterThan(captured1c8);
    expect(capturedDefinition).toBeGreaterThan(captured1c0);
    expect(events.slice(captured1c8).some(event => event.startsWith('leaf:'))).toBe(false);
    expect(events.filter(event => event === 'q:0x1433e4658')).toHaveLength(expected.lowerBoundRead ? 1 : 0);
    if (result.kind === 'runtime-required') {
      expect(result.boundary).toBe(expected.boundary);
      expect(result.nativeAddress).toBe(BigInt(expected.nativeAddress!));
      return;
    }
    expect(result.cost.value).toBe(BigInt(expected.costValue!));
    const costFieldRead = events.indexOf(`d:0x${(BigInt(input.definitionAddress) + 0x3d8n).toString(16)}`);
    expect(costFieldRead).toBeGreaterThan(capturedDefinition);
    if (result.kind === 'returned') {
      expect(result.value).toBe(BigInt(expected.rateOutputQword!));
      expect(events.indexOf('q:0x1433e4658')).toBeGreaterThan(events.indexOf('q:0x1433e4138'));
    } else expect(result.outputBeforeFault).toBe(BigInt(expected.rateOutputQword!));
  });
});
