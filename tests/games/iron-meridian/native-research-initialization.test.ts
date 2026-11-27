import { describe, expect, it } from 'vitest';
import { initializeNativeResearch } from '../../../src/games/iron-meridian/native/research-construction';
import type { ResearchConstructionDependencies, ResearchConstructionMemory } from '../../../src/games/iron-meridian/native/research-construction';
import type { ResearchLinksDependencies } from '../../../src/games/iron-meridian/native/research-links';
import reference from '../../../work/iron-meridian/native-initialization/reference.json';

describe('complete research initialization against one original F60650 execution', () => {
  // Constructor output, slot writes, graph links, statuses, callbacks and partial effects share one native run.
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const bytes = new Map<bigint, number>();
    type Event = { call: { name: string; arguments: string[]; contextFields?: { offset: number; bytes: string }[] } } | { write: { address: string; bytes: string } };
    const events: Event[] = [];
    const allocations: { address: string; size: number }[] = [];
    const object = BigInt(input.objectAddress), owner = BigInt(input.ownerAddress);
    const hex = (value: bigint) => `0x${BigInt.asUintN(64, value).toString(16)}`;
    function apply(writes: readonly { address: string; bytes: string }[]) {
      for (const entry of writes) for (let index = 0; index < entry.bytes.length; index += 2) {
        bytes.set(BigInt(entry.address) + BigInt(index / 2), Number.parseInt(entry.bytes.slice(index, index + 2), 16));
      }
    }
    const tracked = (address: bigint) => address >= object && address < object + 0x1f8n || address >= owner && address < owner + 0x150n || address >= 0x280000n && address < 0x300000n || address >= 0x143129e70n && address < 0x143129e90n;
    const memory: ResearchConstructionMemory = {
      readByte(address) {
        if (!reference.metadata.memoryRegions.some(region => address >= BigInt(region.address) && address < BigInt(region.address) + BigInt(region.size))) {
          throw new Error(`Unmapped construction read ${hex(address)}`);
        }
        return bytes.get(address) ?? (address >= 0x700000n && address < 0x740000n ? input.stackFill : 0);
      },
      readDword(address) { let value = 0; for (let i = 0; i < 4; i++) value += this.readByte(address + BigInt(i)) * 2 ** (8 * i); return value >>> 0; },
      readQword(address) { let value = 0n; for (let i = 0; i < 8; i++) value |= BigInt(this.readByte(address + BigInt(i))) << BigInt(8 * i); return value; },
      writeByte(address, value) { this.writeBytes(address, Uint8Array.of(value & 255)); },
      writeWord(address, value) { this.writeBytes(address, Uint8Array.of(value & 255, value >>> 8 & 255)); },
      writeDword(address, value) { this.writeBytes(address, Uint8Array.from({ length: 4 }, (_, i) => value >>> (8 * i) & 255)); },
      writeQword(address, value) { this.writeBytes(address, Uint8Array.from({ length: 8 }, (_, i) => Number(BigInt.asUintN(64, value) >> BigInt(i * 8) & 255n))); },
      writeBytes(address, payload) {
        if (payload.length && tracked(address)) events.push({ write: { address: hex(address), bytes: [...payload].map(value => value.toString(16).padStart(2, '0')).join('') } });
        payload.forEach((value, i) => bytes.set(address + BigInt(i), value));
      },
    };
    apply([{ address: input.objectAddress, bytes: 'cd'.repeat(0x1f8) }, ...input.memoryWrites]);
    let heap = 0x280000n, allocationCount = 0;
    function leaf(name: string, args: bigint[], context?: bigint) {
      events.push({ call: { name, arguments: args.map(hex), ...(context === undefined ? {} : { contextFields: reference.metadata.conditionFields.map(field => ({
        offset: field.offset, bytes: Array.from({ length: field.size }, (_, index) => memory.readByte(context + BigInt(field.offset + index)).toString(16).padStart(2, '0')).join(''),
      })) }) } });
      const changes = (input.leafWrites as Record<string, { address: string; bytes: string }[]>)[name];
      if (changes) apply(changes);
    }
    const missing: readonly string[] = input.missingLeaves;
    const missingGraph: readonly string[] = input.missingGraphLeaves;
    function lookup(name: string, target: bigint, table: bigint, query: bigint, fallback?: bigint) {
      leaf(name, fallback === undefined ? [target, table, query] : [target, table, query, fallback]);
      const group = ({ 'registry-1406c6970': 0x248, 'registry-140705890': 0x260, 'registry-140a34120': 0x278,
        'registry-140a34020': 0x290, 'registry-140b1a1e0': 0x2c0, 'registry-140b1a2e0': 0x380 } as Record<string, number>)[name];
      const candidates = input.queries.filter(candidate => candidate.group === group);
      const item = group === 0x278 ? candidates.find(candidate => memory.readDword(BigInt(candidate.reference) + 0x20n) === memory.readDword(query + 0x20n))
        : candidates.find(candidate => BigInt(candidate.reference) === query);
      if (!item) throw new Error('No declared raw registry fixture');
      return BigInt(item.resolved);
    }
    const dependencies: ResearchConstructionDependencies = {
      allocate: missing.includes('allocate') ? undefined : ({ target, size, allocator, alignment }) => {
        leaf('allocate', allocator === undefined ? [target, size] : [target, allocator, size, BigInt(alignment!)]);
        const pointer = allocationCount++ === input.failAllocation ? 0n : heap;
        if (pointer !== 0n) {
          expect(size).toBeLessThan(0x10000n); heap += (size + 31n) & ~31n;
          allocations.push({ address: hex(pointer), size: Number(size) });
          apply([{ address: hex(pointer), bytes: 'b3'.repeat(Number(size)) }]);
        }
        return pointer;
      },
      release: missing.includes('release') ? undefined : ({ target, pointer, allocator }) => leaf('release', allocator === undefined ? [target, pointer] : [target, allocator, pointer]),
      registry1406c6970: missing.includes('registry-1406c6970') ? undefined : (table, query, fallback) => lookup('registry-1406c6970', 0x1406c6970n, table, query, fallback),
      registry140705890: missing.includes('registry-140705890') ? undefined : (table, query) => lookup('registry-140705890', 0x140705890n, table, query),
      registry140a34120: missing.includes('registry-140a34120') ? undefined : (table, query, fallback) => lookup('registry-140a34120', 0x140a34120n, table, query, fallback),
      registry140a34020: missing.includes('registry-140a34020') ? undefined : (table, query, fallback) => lookup('registry-140a34020', 0x140a34020n, table, query, fallback),
      registry140b1a1e0: missing.includes('registry-140b1a1e0') ? undefined : (table, query, fallback) => lookup('registry-140b1a1e0', 0x140b1a1e0n, table, query, fallback),
      registry140b1a2e0: missing.includes('registry-140b1a2e0') ? undefined : (table, query, fallback) => lookup('registry-140b1a2e0', 0x140b1a2e0n, table, query, fallback),
      traitActiveVirtual50: missing.includes('trait-active') ? undefined : ({ target, object }) => {
        leaf('trait-active', [target, object]); return input.virtuals.find(item => BigInt(item.object) === object)!.active;
      },
      conditionVirtual18: missing.includes('condition') ? undefined : ({ target, condition, context }) => {
        expect(memory.readQword(context)).toBe(0x142852168n);
        leaf('condition', [target, condition, context], context); return input.virtuals.find(item => BigInt(item.condition) === condition)!.value;
      },
      clearConditionVector140201280: missing.includes('condition-vector-clear') ? undefined : address => leaf('condition-vector-clear', [0x140201280n, address]),
      tlsGuardAcquire1425a0588: missing.includes('tls-guard-acquire') ? undefined : guard => { leaf('tls-guard-acquire', [0x1425a0588n, guard]); memory.writeDword(guard, -1); },
      tlsAllocatorInitialize1425a0450: missing.includes('tls-allocator-initialize') ? undefined : address => leaf('tls-allocator-initialize', [0x1425a0450n, address]),
      tlsGuardRelease1425a051c: missing.includes('tls-guard-release') ? undefined : guard => { leaf('tls-guard-release', [0x1425a051cn, guard]); memory.writeDword(guard, 0); memory.writeDword(BigInt(input.tlsBlock) + 0x20ecn, 0); },
      tlsFormat1422aeab0: missing.includes('tls-format') ? undefined : ({ output, format, arg3, arg4 }) => {
        leaf('tls-format', [0x1422aeab0n, output, format, arg3, BigInt(arg4)]);
        apply([{ address: '0x271000', bytes: new TextEncoder().encode('RESEARCH_NO_RESEARCH\0').reduce((s, v) => s + v.toString(16).padStart(2, '0'), '') }]);
        memory.writeQword(output, 0x271000n); memory.writeBytes(output + 8n, new Uint8Array(8).fill(input.stackFill));
        memory.writeQword(output + 0x10n, 20n); memory.writeQword(output + 0x18n, 31n);
      },
    };
    const context = { tlsBlock: BigInt(input.tlsBlock), frameBase: BigInt(input.frameBase) };
    const graphServices: ResearchLinksDependencies = {
      allocate: missingGraph.includes('allocate') ? undefined : dependencies.allocate,
      release: missingGraph.includes('release') ? undefined : dependencies.release,
      conditionVirtual18: missingGraph.includes('condition') ? undefined : dependencies.conditionVirtual18,
      localeCompare1425d05d0: missing.includes('locale-compare') ? undefined : ({ target, left, right }) => { leaf('locale-compare', [target, left, right]); return input.localeResult; },
      profileEnter142551e20: missing.includes('profile-enter') ? undefined : ({ output, object, description, mode }) => leaf('profile-enter', [0x142551e20n, output, object, description, BigInt(mode)]),
      profileExit142552500: missing.includes('profile-exit') || missingGraph.includes('profile-exit') ? undefined : profile => leaf('profile-exit', [0x142552500n, profile]),
    };
    const result = initializeNativeResearch(memory, owner, context, dependencies, graphServices);
    expect(result.kind).toBe(expected.kind);
    if (result.kind === 'runtime-required') { expect(result.boundary).toBe(expected.boundary); expect(result.nativeAddress).toBe(BigInt(expected.nativeAddress!)); }
    function rawBytes(address: bigint, length: number) { return Array.from({ length }, (_, i) => memory.readByte(address + BigInt(i)).toString(16).padStart(2, '0')).join(''); }
    expect(rawBytes(object, 0x48)).toBe(expected.objectBytes);
    expect(rawBytes(owner, 0x150)).toBe(expected.ownerBytes);
    expect(allocations).toEqual(expected.allocations);
    for (const entry of expected.allocationBytes) expect(rawBytes(BigInt(entry.address), entry.bytes.length / 2)).toBe(entry.bytes);
    // Equivalent scalar/SIMD stores retain identical byte order across external calls.
    function normalize(entries: readonly Event[]) {
      return entries.flatMap<Event>(entry => 'call' in entry ? [entry] : Array.from({ length: entry.write.bytes.length / 2 }, (_, index) => ({
        write: { address: hex(BigInt(entry.write.address) + BigInt(index)), bytes: entry.write.bytes.slice(index * 2, index * 2 + 2) },
      })));
    }
    expect(normalize(events)).toEqual(normalize(expected.events as Event[]));
  });
});
