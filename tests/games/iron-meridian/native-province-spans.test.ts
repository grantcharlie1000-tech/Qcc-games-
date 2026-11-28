import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { initializeNativeProvinceSpans, updateNativeRegionCenters } from '../../../src/games/iron-meridian/native/province-spans';
import type { ProvinceSpanMemory, ProvinceSpanServices } from '../../../src/games/iron-meridian/native/province-spans';
import reference from '../../../work/iron-meridian/native-map-spans/reference.json';

describe('original native province spans and region centers', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const bytes = new Map<bigint, number>();
    const calls: { name: string; arguments: string[] }[] = [];
    type Event = { call: { name: string; arguments: string[] } } | { write: { address: string; bytes: string } };
    const events: Event[] = [];
    const allocations: { address: string; size: number }[] = [];
    const hex = (value: bigint) => `0x${BigInt.asUintN(64, value).toString(16)}`;
    const apply = (writes: readonly { address: string; bytes: string }[]) => {
      for (const entry of writes) for (let index = 0; index < entry.bytes.length; index += 2) bytes.set(BigInt(entry.address) + BigInt(index / 2), Number.parseInt(entry.bytes.slice(index, index + 2), 16));
    };
    const globalPages = [0x142795000n, 0x143693000n, 0x143691000n, 0x14368f000n, 0x1433de000n, 0x1433e7000n, 0x143500000n, 0x143501000n, 0x1433dd000n, 0x1433e3000n];
    const valid = (address: bigint) => reference.metadata.memoryRegions.some(region => address >= BigInt(region.address) && address < BigInt(region.address) + BigInt(region.size)) || globalPages.some(page => address >= page && address < page + 4096n);
    const tracked = (address: bigint) => address >= 0x1120d0n && address < 0x1120e4n || address >= 0x220000n && address < 0x260000n || address >= 0x280000n && address < 0x280200n || address >= 0x300000n && address < 0x310000n || address >= 0x400000n && address < 0x500000n || address === 0x1435002a8n;
    const memory: ProvinceSpanMemory = {
      readByte(address) { if (!valid(address)) throw new Error(`Unmapped map read ${hex(address)}`); return bytes.get(address) ?? 0; },
      readDword(address) { let value = 0; for (let index = 0; index < 4; index++) value += this.readByte(address + BigInt(index)) * 2 ** (8 * index); return value >>> 0; },
      readQword(address) { let value = 0n; for (let index = 0; index < 8; index++) value |= BigInt(this.readByte(address + BigInt(index))) << BigInt(index * 8); return value; },
      writeByte(address, value) { this.writeBytes(address, Uint8Array.of(value)); },
      writeWord(address, value) { this.writeBytes(address, Uint8Array.of(value & 255, value >>> 8 & 255)); },
      writeDword(address, value) { this.writeBytes(address, Uint8Array.from({ length: 4 }, (_, index) => value >>> (index * 8) & 255)); },
      writeQword(address, value) { this.writeBytes(address, Uint8Array.from({ length: 8 }, (_, index) => Number(BigInt.asUintN(64, value) >> BigInt(index * 8) & 255n))); },
      writeBytes(address, payload) {
        if (payload.length && tracked(address)) events.push({ write: { address: hex(address), bytes: [...payload].map(value => value.toString(16).padStart(2, '0')).join('') } });
        payload.forEach((value, index) => { const destination = address + BigInt(index); if (!valid(destination)) throw new Error(`Unmapped map write ${hex(destination)}`); bytes.set(destination, value); });
      },
    };
    apply(input.memoryWrites);
    apply([{ address: '0x142795988', bytes: reference.metadata.constantGrowthBytes }]);
    let heap = 0x400000n;
    const invocations = new Map<string, number>();
    const leaf = (name: string, args: bigint[]) => {
      const call = { name, arguments: args.map(hex) }; calls.push(call); events.push({ call });
      const invocation = invocations.get(name) ?? 0; invocations.set(name, invocation + 1);
      const changes = (input.mutations as Record<string, { address: string; bytes: string }[]>)[`${name}:${invocation}`];
      if (changes) apply(changes);
    };
    const services: ProvinceSpanServices = {
      allocate: ({ size, allocator, alignment }) => {
        const name = allocator === undefined ? 'scratch-allocate' : 'span-allocate';
        leaf(name, allocator === undefined ? [size] : [allocator, size, BigInt(alignment!)]);
        if (allocator === undefined) return 0x300000n;
        const pointer = heap; heap += (size + 31n) & ~31n;
        allocations.push({ address: hex(pointer), size: Number(size) });
        for (let index = 0; index < Number(size); index++) bytes.set(pointer + BigInt(index), 0xb3);
        return pointer;
      },
      release: ({ allocator, pointer }) => leaf('span-release', [allocator, pointer]),
      registerThreadCleanup: (_target, destructor) => leaf('thread-cleanup', [destructor]),
      threadRecord: key => { leaf('thread-record', [key]); return 0x2a0000n; },
    };
    const missing: readonly string[] = input.missing;
    if (missing.includes('scratch-allocate') || missing.includes('span-allocate')) services.allocate = undefined;
    if (missing.includes('span-release')) services.release = undefined;
    if (missing.includes('thread-cleanup')) services.registerThreadCleanup = undefined;
    if (missing.includes('thread-record')) services.threadRecord = undefined;
    const result = input.kind === 'centers'
      ? (updateNativeRegionCenters(memory, BigInt(input.registry)), { kind: 'returned' as const })
      : initializeNativeProvinceSpans(memory, BigInt(input.manager), { gsBase: 0x100000n, frameBase: BigInt(input.context.frameBase) }, services);
    expect(result.kind).toBe(expected.kind);
    if (result.kind === 'runtime-required') {
      expect(result.boundary).toBe(expected.boundary);
      expect(result.nativeAddress).toBe(BigInt(expected.nativeAddress!));
    }
    expect(calls).toEqual(expected.calls);
    expect(allocations).toEqual(expected.allocations);
    function normalize(entries: readonly Event[]) {
      return entries.flatMap<Event>(entry => 'call' in entry ? [entry] : Array.from({ length: entry.write.bytes.length / 2 }, (_, index) => ({ write: { address: hex(BigInt(entry.write.address) + BigInt(index)), bytes: entry.write.bytes.slice(index * 2, index * 2 + 2) } })));
    }
    expect(createHash('sha256').update(JSON.stringify(normalize(events))).digest('hex')).toBe(expected.eventsSha256);
    for (const snapshot of expected.snapshots) {
      const actual = Array.from({ length: snapshot.bytes.length / 2 }, (_, index) => memory.readByte(BigInt(snapshot.address) + BigInt(index)).toString(16).padStart(2, '0')).join('');
      expect(actual, `Native memory ${snapshot.address}`).toBe(snapshot.bytes);
    }
  });
});
