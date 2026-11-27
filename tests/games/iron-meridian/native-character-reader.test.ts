import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NativeCharacterReader } from '../../../src/games/iron-meridian/native/character-reader';
import type { CharacterReaderMemory, CharacterReaderResult, CharacterReaderServices } from '../../../src/games/iron-meridian/native/character-reader';

type Write = { address: string; bytes: string };
interface Reference {
  metadata: { entryStack: string; reader: string; vector: string; destination: string; memoryRegions: { address: string; bytes: number }[]; nativeData: Write[] };
  cases: { id: string; input: { operations: { method: string; arguments: string[] }[]; memoryWrites: Write[]; missing: string[]; responses: Record<string, { value?: string; writes?: Write[] }[]> }; expected: { results: unknown[]; calls: unknown[]; snapshots: Write[]; traceSha256: string } }[];
}
const reference = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-character-reader/reference.json', import.meta.url), 'utf8')) as Reference;
describe('concrete native character reader against original instruction execution', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const bytes = new Map<bigint, number>(), trace: string[] = [], calls: unknown[] = [], counts = new Map<string, number>();
    const stack = BigInt(reference.metadata.entryStack), reader = BigInt(reference.metadata.reader), vector = BigInt(reference.metadata.vector), destination = BigInt(reference.metadata.destination);
    const hex = (value: bigint) => `0x${BigInt.asUintN(64, value).toString(16)}`;
    const encode = (payload: Uint8Array) => [...payload].map(byte => byte.toString(16).padStart(2, '0')).join('');
    let active: string | undefined;
    const semantic = (address: bigint) => address >= 0x200000n && address < 0x600000n || active === 'construct' && address >= stack - 0x28n && address < stack - 8n || address === stack + 0x28n;
    const mapped = (address: bigint) => reference.metadata.memoryRegions.some(region => address >= BigInt(region.address) && address < BigInt(region.address) + BigInt(region.bytes));
    const memory: CharacterReaderMemory = {
      readByte(address) { if (!mapped(address)) throw new Error(`Unmapped read ${hex(address)}`); return bytes.get(address) ?? (address >= 0x200000n && address < 0x740000n ? 0xa7 : 0); },
      readDword(address) { let value = 0; for (let index = 0; index < 4; index++) value += this.readByte(address + BigInt(index)) * 2 ** (8 * index); return value >>> 0; },
      readQword(address) { let value = 0n; for (let index = 0; index < 8; index++) value |= BigInt(this.readByte(address + BigInt(index))) << BigInt(8 * index); return value; },
      writeByte(address, value) { if (!mapped(address)) throw new Error(`Unmapped write ${hex(address)}`); bytes.set(address, value & 255); if (active && semantic(address)) trace.push(`w:${address.toString(16)}:${(value & 255).toString(16).padStart(2, '0')}`); },
      writeDword(address, value) { for (let index = 0; index < 4; index++) this.writeByte(address + BigInt(index), value >>> (8 * index)); },
      writeQword(address, value) { for (let index = 0; index < 8; index++) this.writeByte(address + BigInt(index), Number(BigInt.asUintN(64, value) >> BigInt(8 * index) & 255n)); },
      writeBytes(address, payload) { payload.forEach((byte, index) => this.writeByte(address + BigInt(index), byte)); },
    };
    const raw = (address: bigint, count: number) => Uint8Array.from({ length: count }, (_, index) => memory.readByte(address + BigInt(index)));
    const apply = (writes: readonly Write[]) => { for (const item of writes) for (let index = 0; index < item.bytes.length; index += 2) memory.writeByte(BigInt(item.address) + BigInt(index / 2), Number.parseInt(item.bytes.slice(index, index + 2), 16)); };
    apply(reference.metadata.nativeData); apply(input.memoryWrites);
    function leaf(role: string, target: bigint, args: bigint[]) {
      const invocation = counts.get(role) ?? 0; counts.set(role, invocation + 1);
      const response = input.responses[role]?.[invocation] ?? {}, value = BigInt(response.value ?? (role === 'copy' ? args[0]! : 0n));
      if (role === 'copy') memory.writeBytes(args[0]!, raw(args[1]!, Number(args[2]!)));
      apply(response.writes ?? []);
      const call = { role, target: hex(target), arguments: args.map(hex), value: String(value), writes: response.writes ?? [] };
      calls.push(call); trace.push('c:' + JSON.stringify(call)); return value;
    }
    const services: CharacterReaderServices = {
      copy: input.missing.includes('copy') ? undefined : (dest, source, count) => { leaf('copy', 0x1426079d0n, [dest, source, count]); },
      size: input.missing.includes('size') ? undefined : (target, object) => leaf('size', target, [object]),
      rewind: input.missing.includes('rewind') ? undefined : (target, object) => { leaf('rewind', target, [object]); },
    };
    const adapter = new NativeCharacterReader(memory, services), results: CharacterReaderResult<bigint | number | null>[] = [];
    for (const operation of input.operations) {
      active = operation.method; const args = operation.arguments.map(Number);
      const result = active === 'construct' ? adapter.construct(reader, vector, args[0]!, args[1]!, stack)
        : active === 'readByte' ? adapter.readByte(reader) : active === 'unreadByte' ? adapter.unreadByte(reader)
          : active === 'size' ? adapter.size(reader) : active === 'seek' ? adapter.seek(reader, args[0]!)
            : active === 'moveToEnd' ? adapter.moveToEnd(reader) : active === 'rewind' ? adapter.rewind(reader)
              : active === 'readInto' ? adapter.readInto(reader, destination, args[0]!) : adapter.checksum(reader, args[0]!);
      results.push(result); if (result.kind !== 'returned') break;
    }
    expect(results.map(result => result.kind === 'returned' ? { kind: result.kind, value: result.value === null ? null : String(result.value) } : { ...result, nativeAddress: hex(result.nativeAddress), callSite: hex(result.callSite) })).toEqual(expected.results);
    expect(calls).toEqual(expected.calls);
    for (const item of expected.snapshots) expect(encode(raw(BigInt(item.address), item.bytes.length / 2)), item.address).toBe(item.bytes);
    expect(createHash('sha256').update(trace.join('\n') + '\n').digest('hex')).toBe(expected.traceSha256);
  });
});
