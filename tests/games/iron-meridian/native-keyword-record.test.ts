import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NativeKeywordRecord } from '../../../src/games/iron-meridian/native/keyword-record';
import type { KeywordRecordMemory, KeywordRecordServices } from '../../../src/games/iron-meridian/native/keyword-record';

type Write = { address: string; bytes: string };
type Reply = { value?: string | number; writes?: Write[] };
type Call = { role: string; target: string; arguments: string[]; value: string; writes: Write[] };
type Snapshot = { address: string; bytes: string };
type Expected = { results: unknown[]; calls: Call[]; allocations: { address: string; bytes: number }[]; snapshots: Snapshot[]; traceSha256: string; traceCount: number };
type Fixture = { name: string; operations: { method: 'construct' | 'resize' | 'initializeVector'; arguments: string[] }[]; memoryWrites: Write[]; responses: Record<string, Reply[]>; missing: string[]; expected: Expected };
const directory = fileURLToPath(new URL('../../../work/iron-meridian/native-keyword-record/', import.meta.url));
const reference = JSON.parse(readFileSync(directory + 'reference.json', 'utf8')) as { cases: Fixture[] };
const identity = JSON.parse(readFileSync(directory + 'instructions.json', 'utf8')) as { data: Write[] };
const u64 = (value: bigint) => BigInt.asUintN(64, value);
const hex = (value: bigint) => '0x' + u64(value).toString(16);

describe('original keyword record construction', () => {
  for (const row of reference.cases) it(row.name, () => {
    const bytes = new Map<bigint, number>();
    const trace: string[] = [], calls: Call[] = [], allocations: { address: string; bytes: number }[] = [];
    let active = false;
    const read = (address: bigint, count: number) => Uint8Array.from({ length: count }, (_, index) => bytes.get(u64(address + BigInt(index))) ?? 0);
    const write = (address: bigint, payload: Uint8Array) => {
      for (const [index, value] of payload.entries()) {
        const pointer = u64(address + BigInt(index)); bytes.set(pointer, value);
        if (active && !(pointer >= 0x300000n && pointer < 0x340000n)) trace.push(`w:${pointer.toString(16)}:${value.toString(16).padStart(2, '0')}`);
      }
    };
    const scalar = (address: bigint, count: number) => read(address, count).reduceRight((value, byte) => value << 8n | BigInt(byte), 0n);
    const store = (address: bigint, value: bigint, count: number) => write(address, Uint8Array.from({ length: count }, (_, index) => Number(value >> BigInt(index * 8) & 255n)));
    const memory: KeywordRecordMemory = {
      readByte: address => Number(scalar(address, 1)), readDword: address => Number(scalar(address, 4)), readQword: address => scalar(address, 8),
      writeByte: (address, value) => store(address, BigInt(value & 255), 1), writeDword: (address, value) => store(address, BigInt(value >>> 0), 4), writeQword: (address, value) => store(address, u64(value), 8),
    };
    const apply = (writes: Write[]) => { for (const item of writes) write(BigInt(item.address), Uint8Array.from(Buffer.from(item.bytes, 'hex'))); };
    apply(identity.data); apply(row.memoryWrites); active = true;
    const counts = new Map<string, number>(); let heap = 0x280000n;
    const service = (role: string, target: bigint, args: bigint[]): bigint => {
      const index = counts.get(role) ?? 0; counts.set(role, index + 1);
      const reply = row.responses[role]?.[index] ?? {};
      let value = BigInt(reply.value ?? 0);
      if (role === 'crtAllocate' || role === 'allocate') {
        const count = Number(args[role === 'crtAllocate' ? 0 : 1]);
        if (count >= 0x10000) throw Error('Allocation outside bounded fixture');
        if (reply.value === undefined) {
          value = heap; heap += BigInt((count + 31) & ~31); write(value, new Uint8Array(count).fill(0xb3)); allocations.push({ address: hex(value), bytes: count });
        }
      } else if (role === 'copy') {
        const [destination, source, count] = args;
        if (count >= 0x10000n) throw Error('Copy outside bounded fixture');
        write(destination, read(source, Number(count))); value = destination;
      }
      apply(reply.writes ?? []);
      const call: Call = { role, target: hex(target), arguments: args.map(hex), value: value.toString(), writes: reply.writes ?? [] };
      calls.push(call); trace.push('c:' + JSON.stringify(call)); return value;
    };
    const services: KeywordRecordServices = {
      crtAllocate: size => service('crtAllocate', 0x1425a01dcn, [size]), crtFree: pointer => { service('crtFree', 0x1425cec00n, [pointer]); },
      copy: (destination, source, size) => { service('copy', 0x1426079d0n, [destination, source, size]); },
      allocate: (target, allocator, size, alignment) => service('allocate', target, [allocator, size, BigInt(alignment)]),
      release: (target, allocator, pointer) => { service('release', target, [allocator, pointer]); },
      allocatorGetter: (target, allocator) => service('allocatorGetter', target, [allocator]),
      inlineBuffer: (target, allocator, pointerOutput, capacityOutput) => { service('inlineBuffer', target, [allocator, pointerOutput, capacityOutput]); },
    };
    for (const role of row.missing) delete services[role as keyof KeywordRecordServices];
    const port = new NativeKeywordRecord(memory, services, 0x100000n);
    const results: unknown[] = [];
    for (const operation of row.operations) {
      const args = operation.arguments.map(BigInt);
      const result = operation.method === 'construct' ? port.construct(args[0], Number(BigInt.asIntN(32, args[1])), args[2]) : operation.method === 'resize' ? port.resize(args[0], Number(BigInt.asIntN(32, args[1]))) : port.initializeVector(args[0]);
      results.push(result.kind === 'returned' ? { ...result, value: hex(result.value) } : { ...result, nativeAddress: hex(result.nativeAddress), callSite: hex(result.callSite) });
      if (result.kind !== 'returned') break;
    }
    const snapshots = row.expected.snapshots.map(item => ({ address: item.address, bytes: Buffer.from(read(BigInt(item.address), item.bytes.length / 2)).toString('hex') }));
    const actual = { results, calls, allocations, snapshots, traceSha256: createHash('sha256').update(trace.join('\n')).digest('hex'), traceCount: trace.length };
    expect(actual).toEqual(row.expected);
  });
});
