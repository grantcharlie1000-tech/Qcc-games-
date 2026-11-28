import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { sortResearchCategoryPointers } from '../../../src/games/iron-meridian/native/research-category-sort';
import type { ResearchCategorySortServices } from '../../../src/games/iron-meridian/native/research-category-sort';
import type { ResearchConstructionMemory } from '../../../src/games/iron-meridian/native/research-construction';
type Write = { address: string; bytes: string };
type Event = { call: { name: string; arguments: string[] } } | { write: Write };
interface Reference {
  metadata: { memoryRegions: { address: string; size: number }[] };
  cases: { id: string; input: { count: number; entryStack: string; header: string; memoryWrites: Write[]; missing: string[]; allocationResults: number[]; leafWrites: Record<string, Write[]> }; expected: { kind: string; boundary?: string; nativeAddress?: string; snapshots: Write[]; allocations: { address: string; size: number }[]; allocationBytes: Write[]; events: Event[] } }[];
}
const reference = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-budget/sort-closure/reference.json', import.meta.url), 'utf8')) as Reference;

describe('native category sort against complete original instruction runs', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const bytes = new Map<bigint, number>(), allocations: { address: string; size: number }[] = [];
    const events: Event[] = [], invocations = new Map<string, number>();
    const hex = (value: bigint) => `0x${BigInt.asUintN(64, value).toString(16)}`;
    const encode = (payload: Uint8Array) => [...payload].map(value => value.toString(16).padStart(2, '0')).join('');
    function apply(writes: readonly { address: string; bytes: string }[]) {
      for (const item of writes) for (let i = 0; i < item.bytes.length; i += 2) bytes.set(BigInt(item.address) + BigInt(i / 2), Number.parseInt(item.bytes.slice(i, i + 2), 16));
    }
    const memory: ResearchConstructionMemory = {
      readByte(address) {
        if (!reference.metadata.memoryRegions.some(region => address >= BigInt(region.address) && address < BigInt(region.address) + BigInt(region.size))) throw new Error(`Unmapped sort read ${hex(address)}`);
        return bytes.get(address) ?? (address >= 0x700000n && address < 0x740000n ? 0xa7 : 0);
      },
      readDword(address) { let value = 0; for (let i = 0; i < 4; i++) value += this.readByte(address + BigInt(i)) * 2 ** (i * 8); return value >>> 0; },
      readQword(address) { let value = 0n; for (let i = 0; i < 8; i++) value |= BigInt(this.readByte(address + BigInt(i))) << BigInt(i * 8); return value; },
      writeByte(address, value) { this.writeBytes(address, Uint8Array.of(value & 255)); },
      writeWord(address, value) { this.writeBytes(address, Uint8Array.of(value & 255, value >>> 8 & 255)); },
      writeDword(address, value) { this.writeBytes(address, Uint8Array.from({ length: 4 }, (_, i) => value >>> (i * 8) & 255)); },
      writeQword(address, value) { this.writeBytes(address, Uint8Array.from({ length: 8 }, (_, i) => Number(BigInt.asUintN(64, value) >> BigInt(i * 8) & 255n))); },
      writeBytes(address, payload) {
        if (payload.length && (address >= 0x200000n && address < 0x300000n || address >= 0x700000n && address < 0x740000n)) events.push({ write: { address: hex(address), bytes: encode(payload) } });
        payload.forEach((value, i) => bytes.set(address + BigInt(i), value));
      },
    };
    apply(input.memoryWrites); let heap = 0x280000n;
    function leaf(name: string, args: bigint[]) {
      events.push({ call: { name, arguments: args.map(hex) } });
      const invocation = invocations.get(name) ?? 0; invocations.set(name, invocation + 1);
      const writes = input.leafWrites as Record<string, { address: string; bytes: string }[]>;
      apply(writes[`${name}:${invocation}`] ?? writes[name] ?? []); return invocation;
    }
    const services: ResearchCategorySortServices = {
      allocate: input.missing.includes('allocate') ? undefined : ({ target, size, descriptor }) => {
        const invocation = leaf('allocate', [target, size, descriptor]);
        if (invocation < input.allocationResults.length && input.allocationResults[invocation] === 0) return 0n;
        const pointer = heap; heap += size + 31n & ~31n;
        allocations.push({ address: hex(pointer), size: Number(size) }); apply([{ address: hex(pointer), bytes: 'b3'.repeat(Number(size)) }]); return pointer;
      },
      release: input.missing.includes('release') ? undefined : ({ target, pointer }) => { leaf('release', [target, pointer]); },
    };
    const result = sortResearchCategoryPointers(memory, BigInt(input.header), BigInt(input.entryStack), services);
    expect(result.kind).toBe(expected.kind);
    if (result.kind === 'runtime-required') {
      expect(result.boundary).toBe('boundary' in expected ? expected.boundary : undefined);
      expect(result.nativeAddress).toBe(expected.nativeAddress === undefined ? undefined : BigInt(expected.nativeAddress));
    }
    const raw = (address: bigint, size: number) => encode(Uint8Array.from({ length: size }, (_, i) => memory.readByte(address + BigInt(i))));
    for (const snapshot of expected.snapshots) {
      const actual = raw(BigInt(snapshot.address), snapshot.bytes.length / 2);
      const differences = Array.from({ length: snapshot.bytes.length / 2 }, (_, i) => i).filter(i => actual.slice(i * 2, i * 2 + 2) !== snapshot.bytes.slice(i * 2, i * 2 + 2)).slice(0, 12).map(i => `${hex(BigInt(snapshot.address) + BigInt(i))}: ${actual.slice(i * 2, i * 2 + 2)} != ${snapshot.bytes.slice(i * 2, i * 2 + 2)}`);
      expect(actual === snapshot.bytes, differences.join(', ')).toBe(true);
    }
    expect(allocations).toEqual(expected.allocations);
    for (const allocation of expected.allocationBytes) expect(raw(BigInt(allocation.address), allocation.bytes.length / 2)).toBe(allocation.bytes);
    const normalized = (entries: readonly Event[]) => entries.flatMap<Event>(entry => 'call' in entry ? [entry] : Array.from({ length: entry.write.bytes.length / 2 }, (_, i) => ({ write: { address: hex(BigInt(entry.write.address) + BigInt(i)), bytes: entry.write.bytes.slice(i * 2, i * 2 + 2) } })));
    expect(normalized(events)).toEqual(normalized(expected.events as Event[]));
  });
});
