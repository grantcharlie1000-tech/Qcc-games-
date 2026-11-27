import { describe, expect, it } from 'vitest';
import { evaluateResearchStatus } from '../../../src/games/iron-meridian/native/research-links';
import { computeResearchBudgetCost, readResearchBudgetResource } from '../../../src/games/iron-meridian/native/research-budget';
import type { ResearchLinksDependencies } from '../../../src/games/iron-meridian/native/research-links';
import type { ResearchConstructionMemory } from '../../../src/games/iron-meridian/native/research-construction';
import reference from '../../../work/iron-meridian/native-budget/reference.json';

describe('ordinary native research budget against original instructions', () => {
  // A wrong reference match, link, count, status, padding write, callback argument, or early-stop order must fail.
  // The identical 33-category input now completes in native-research-sort-composed.test.ts.
  it.each(reference.cases.filter(item => item.id !== 'category-large-sort-explicit-stop'))('$id', ({ input, expected }) => {
    const bytes = new Map<bigint, number>();
    type Event = { call: { name: string; arguments: string[]; contextFields?: { offset: number; bytes: string }[] } } | { write: { address: string; bytes: string } };
    const events: Event[] = [], allocations: { address: string; size: number }[] = [];
    const hex = (value: bigint) => `0x${BigInt.asUintN(64, value).toString(16)}`;
    const encode = (payload: Uint8Array) => [...payload].map(value => value.toString(16).padStart(2, '0')).join('');
    function apply(writes: readonly { address: string; bytes: string }[]) {
      for (const item of writes) for (let index = 0; index < item.bytes.length; index += 2) bytes.set(BigInt(item.address) + BigInt(index / 2), Number.parseInt(item.bytes.slice(index, index + 2), 16));
    }
    const memory: ResearchConstructionMemory = {
      readByte(address) {
        if (!reference.metadata.memoryRegions.some(region => address >= BigInt(region.address) && address < BigInt(region.address) + BigInt(region.size))) throw new Error(`Unmapped links read ${hex(address)}`);
        return bytes.get(address) ?? (address >= 0x700000n && address < 0x740000n ? 0xa7 : 0);
      },
      readDword(address) { let value = 0; for (let i = 0; i < 4; i++) value += this.readByte(address + BigInt(i)) * 2 ** (8 * i); return value >>> 0; },
      readQword(address) { let value = 0n; for (let i = 0; i < 8; i++) value |= BigInt(this.readByte(address + BigInt(i))) << BigInt(i * 8); return value; },
      writeByte(address, value) { this.writeBytes(address, Uint8Array.of(value & 255)); },
      writeWord(address, value) { this.writeBytes(address, Uint8Array.of(value & 255, value >>> 8 & 255)); },
      writeDword(address, value) { this.writeBytes(address, Uint8Array.from({ length: 4 }, (_, i) => value >>> (8 * i) & 255)); },
      writeQword(address, value) { this.writeBytes(address, Uint8Array.from({ length: 8 }, (_, i) => Number(BigInt.asUintN(64, value) >> BigInt(i * 8) & 255n))); },
      writeBytes(address, payload) {
        if (payload.length && address >= 0x200000n && address < 0x300000n) events.push({ write: { address: hex(address), bytes: encode(payload) } });
        payload.forEach((value, index) => bytes.set(address + BigInt(index), value));
      },
    };
    apply(input.memoryWrites);
    function leaf(name: string, args: bigint[], context?: bigint) {
      events.push({ call: { name, arguments: args.map(hex), ...(context === undefined ? {} : { contextFields: reference.metadata.conditionFields.map(field => ({
        offset: field.offset, bytes: encode(Uint8Array.from({ length: field.size }, (_, index) => memory.readByte(context + BigInt(field.offset + index)))),
      })) }) } });
      const invocation = invocations.get(name) ?? 0; invocations.set(name, invocation + 1);
      const writes = input.leafWrites as Record<string, { address: string; bytes: string }[]>;
      const changes = writes[`${name}:${invocation}`] ?? writes[name];
      if (changes) apply(changes);
    }
    const missing: readonly string[] = input.missingLeaves;
    const invocations = new Map<string, number>();
    let heap = 0x280000n;
    const services: ResearchLinksDependencies = {
      allocate: missing.includes('allocate') ? undefined : ({ target, size, allocator, alignment }) => {
        leaf('allocate', allocator === undefined ? [target, size] : [target, allocator, size, BigInt(alignment!)]);
        expect(size).toBeLessThan(0x10000n);
        const pointer = heap; heap += (size + 31n) & ~31n;
        allocations.push({ address: hex(pointer), size: Number(size) }); apply([{ address: hex(pointer), bytes: 'b3'.repeat(Number(size)) }]); return pointer;
      },
      release: missing.includes('release') ? undefined : ({ target, pointer, allocator }) => leaf('release', allocator === undefined ? [target, pointer] : [target, allocator, pointer]),
      localeCompare1425d05d0: missing.includes('locale-compare') ? undefined : ({ target, left, right }) => { leaf('locale-compare', [target, left, right]); return input.localeResult; },
      contextMask: missing.includes('context-mask') ? undefined : ({ target }) => { leaf('context-mask', [target]); return input.contextMask; },
      observerVirtual10: missing.includes('observer') ? undefined : ({ target, observer, state, previousStatus }) => leaf('observer', [target, observer, state, BigInt(previousStatus >>> 0)]),
      profileEnter142551e20: missing.includes('profile-enter') ? undefined : ({ output, object, description, mode }) => leaf('profile-enter', [0x142551e20n, output, object, description, BigInt(mode)]),
      profileExit142552500: missing.includes('profile-exit') ? undefined : profile => leaf('profile-exit', [0x142552500n, profile]),
      conditionVirtual18: missing.includes('condition') ? undefined : ({ target, condition, context }) => {
        leaf('condition', [target, condition, context], context); return (condition & 0xfffn) === 0xf8n ? input.visibleCondition
          : (condition & 0xfffn) === 0x70n ? input.categoryConditionResult : input.allowCondition;
      },
    };
    const state = BigInt(input.state), context = { entryStack: BigInt(input.entryStack), tlsBlock: BigInt(input.tlsBlock) };
    const result = input.kind === 'cost' ? computeResearchBudgetCost(memory, state, BigInt(input.output), BigInt(input.countryIdAddress), context, services)
      : input.kind === 'resource' ? readResearchBudgetResource(memory, BigInt(input.resourceObject), BigInt(input.output), input.budgetType)
        : evaluateResearchStatus(memory, BigInt(input.owner), state, input.checkParent, context, services);
    expect(result.kind).toBe(expected.kind);
    if (result.kind === 'runtime-required') { expect(result.boundary).toBe(expected.boundary); expect(result.nativeAddress).toBe(BigInt(expected.nativeAddress!)); }
    if (result.kind === 'returned' && expected.value !== undefined) expect(String(result.value)).toBe(String(expected.value));
    if (result.kind === 'returned' && expected.nativeReturnPointer !== undefined) expect('output' in result && result.output).toBe(BigInt(expected.nativeReturnPointer));
    const raw = (address: bigint, size: number) => encode(Uint8Array.from({ length: size }, (_, index) => memory.readByte(address + BigInt(index))));
    for (const snapshot of expected.snapshots) expect(raw(BigInt(snapshot.address), snapshot.bytes.length / 2)).toBe(snapshot.bytes);
    expect(allocations).toEqual(expected.allocations);
    for (const item of expected.allocationBytes) expect(raw(BigInt(item.address), item.bytes.length / 2)).toBe(item.bytes);
    function normalized(entries: readonly Event[]) {
      return entries.flatMap<Event>(entry => 'call' in entry ? [entry] : Array.from({ length: entry.write.bytes.length / 2 }, (_, index) => ({
        write: { address: hex(BigInt(entry.write.address) + BigInt(index)), bytes: entry.write.bytes.slice(index * 2, index * 2 + 2) },
      })));
    }
    expect(normalized(events)).toEqual(normalized(expected.events as Event[]));
  });
});
