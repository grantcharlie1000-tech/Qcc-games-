import { describe, expect, it } from 'vitest';
import { researchOwnerUpdate, researchProgressUpdate, researchSlotUpdate } from '../../../src/games/iron-meridian/native/research-update';
import type { ResearchUpdateDependencies, ResearchUpdateMemory } from '../../../src/games/iron-meridian/native/research-update';
import reference from '../../../work/iron-meridian/native-update/reference.json';

describe('native research progress and callers against original instructions', () => {
  // Removing a write, changing wrapping/clamps, or moving a runtime call across a write must fail.
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const bytes = new Map<bigint, number>();
    const calls: { name: string; arguments: string[] }[] = [];
    const writes: { address: string; size: number; value: string }[] = [];
    const events: ({ call: { name: string; arguments: string[] } } | { write: { address: string; size: number; value: string } })[] = [];
    function applyWrites(entries: readonly { address: string; bytes: string }[]) {
      for (const entry of entries) {
        for (let index = 0; index < entry.bytes.length; index += 2) {
          bytes.set(BigInt(entry.address) + BigInt(index / 2), Number.parseInt(entry.bytes.slice(index, index + 2), 16));
        }
      }
    }
    applyWrites(input.memoryWrites);
    function store(address: bigint, value: bigint, size: number) {
      const raw = BigInt.asUintN(size * 8, value);
      const event = { address: hex(address), size, value: String(raw) };
      writes.push(event); events.push({ write: event });
      for (let index = 0; index < size; index++) bytes.set(address + BigInt(index), Number(raw >> BigInt(index * 8) & 255n));
    }
    const memory: ResearchUpdateMemory = {
      readByte(address) {
        if (!reference.metadata.memoryRegions.some(region => address >= BigInt(region.address) && address < BigInt(region.address) + BigInt(region.size))) {
          throw new Error(`Unmapped raw fixture read at ${hex(address)}`);
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
      writeDword(address, value) { store(address, BigInt(value >>> 0), 4); },
      writeQword(address, value) { store(address, value, 8); },
    };
    function hex(value: bigint) { return `0x${BigInt.asUintN(64, value).toString(16)}`; }
    function leaf(name: string, args: bigint[] = []) {
      const event = { name, arguments: args.map(hex) };
      calls.push(event); events.push({ call: event });
      const entries = (input.leafWrites as Record<string, { address: string; bytes: string }[]>)[name];
      if (entries) applyWrites(entries);
    }
    function entryHook(entry: bigint) {
      const hook = input.entryHooks.find(candidate => BigInt(candidate.address) === entry);
      if (!hook) throw new Error(`Undeclared modifier entry ${hex(entry)}`);
      return hook;
    }
    const missingLeaves: readonly string[] = input.missingLeaves;
    const dependencies: ResearchUpdateDependencies = {
      modifiers: {
        entryVirtual78({ entry }) {
          leaf('v78', [entry]); const hook = entryHook(entry);
          return { begin: BigInt(hook.begin), end: BigInt(hook.end) };
        },
        entryVirtual80({ entry, definition, countryIdAddress }) {
          leaf('v80', [entry, definition, countryIdAddress]); applyWrites(input.virtual80Writes);
          return entryHook(entry).level;
        },
        contextMask() { leaf('context'); return input.contextMask; },
        localeCompare1425d05d0({ left, right }) { leaf('locale', [left, right]); return input.localeComparison; },
        resolveCountry140c07bf0() { throw new Error('Unresolved modifier country diagnostic path'); },
        resolveGroup140c08790() { throw new Error('Unresolved modifier group diagnostic path'); },
      },
      incrementObserver1422997a0: missingLeaves.includes('increment-observer') ? undefined : ({ value, sourceFile, sourceLine, context }) => {
        leaf('increment-observer', [value, sourceFile, BigInt(sourceLine), context]);
      },
      categoryUpdate140ee7300: missingLeaves.includes('category-update') ? undefined : ({ collection, key, value }) => {
        leaf('category-update', [collection, BigInt(key >>> 0), BigInt(value >>> 0)]);
      },
      resolveReference142284870: missingLeaves.includes('resolve-reference') ? undefined : address => {
        leaf('resolve-reference', [address]); return BigInt(input.resolvedAddress);
      },
      matchedEntryUpdate14146a440: missingLeaves.includes('matched-entry-update') ? undefined : entry => leaf('matched-entry-update', [entry]),
      prepareSlots140f615c0: missingLeaves.includes('prepare-slots') ? undefined : owner => leaf('prepare-slots', [owner]),
      profileEnter142551e20: missingLeaves.includes('profile-enter') ? undefined : () => leaf('profile-enter'),
      profileExit142552500: missingLeaves.includes('profile-exit') ? undefined : () => leaf('profile-exit'),
    };
    const state = BigInt(input.stateAddress), slot = BigInt(input.slotAddress), owner = BigInt(input.ownerAddress);
    const result = input.mode === 'writer'
      ? researchProgressUpdate(memory, state, BigInt(input.increment), input.bookkeepingMode, input.updateCategories, dependencies)
      : input.mode === 'slot' ? researchSlotUpdate(memory, slot, dependencies) : researchOwnerUpdate(memory, owner, dependencies);
    expect(result.kind).toBe(expected.kind);
    if (result.kind === 'runtime-required') {
      expect(result.boundary).toBe(expected.boundary);
      expect(result.nativeAddress).toBe(BigInt(expected.nativeAddress!));
    }
    if (result.kind === 'divide-error') expect(result.nativeAddress).toBe(0x140f53404n);
    expect(BigInt.asIntN(64, memory.readQword(state + 0x198n))).toBe(BigInt(expected.progress));
    expect(BigInt.asIntN(64, memory.readQword(state + 0x1a8n))).toBe(BigInt(expected.scaled));
    expect(memory.readDword(state + 0x1f4n)).toBe(expected.lastReferenceKey);
    expect(BigInt.asIntN(64, memory.readQword(slot + 0x20n))).toBe(BigInt(expected.bank));
    expect(writes).toEqual(expected.writes);
    expect(calls).toEqual(expected.calls);
    expect(events).toEqual(expected.events);
  });
});
