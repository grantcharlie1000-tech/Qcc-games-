import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { NativeKeywordInitialization } from '../../../src/games/iron-meridian/native/keyword-initialization';
import type { GeneratedKeywordPlan, KeywordInitializationServices } from '../../../src/games/iron-meridian/native/keyword-initialization';
import type { KeywordRecordMemory } from '../../../src/games/iron-meridian/native/keyword-record';

type Write = { address: string; bytes: string };
type Call = { role: string; arguments: string[]; value: string };
type Allocation = { address: string; bytes: number; record: number; live: boolean; contents: string };
type Response = { role: string; ordinal: number; writes?: Write[]; value?: string };
type Expected = { result: unknown; enteredRecords: number; completedRecords: number; recordBytes: string; nameBytes: string[]; allocations: Allocation[]; calls: Call[]; enumLocals: string; enumHomes: string; traceSha256: string; traceCount: number; observedArgumentsSha256: string };
type Fixture = { name: string; changes?: Write[]; missing?: [string, number][]; responses?: Response[]; expected: Expected };
const directory = fileURLToPath(new URL('../../../work/iron-meridian/native-keyword-initialization/', import.meta.url));
const fixtures = JSON.parse(readFileSync(directory + 'reference.json', 'utf8')) as { cases: Fixture[] };
const inputs = JSON.parse(readFileSync(directory + 'inputs.json', 'utf8')) as Write[];
const plan = JSON.parse(readFileSync(directory + 'plan.json', 'utf8')) as GeneratedKeywordPlan;
const u64 = (value: bigint) => BigInt.asUintN(64, value);
const hex = (value: bigint) => '0x' + u64(value).toString(16);
const ENTRY = 0x73f008n, FRAME = ENTRY - 0x1f8e8n, RECORDS = 0x14343af20n, COUNT = 10767;

describe('complete original generated keyword construction', () => {
  for (const fixture of fixtures.cases) it(fixture.name, () => {
    const bytes = new Map<bigint, number>();
    const digest = createHash('sha256'); let traceCount = 0, active = false, heap = 0x10000000n, currentRecord = -1;
    const calls: Call[] = [], allocations: Allocation[] = [];
    const counters = new Map<string, number>();
    const semantic = (address: bigint) => !(address >= 0x700000n && address < 0x740000n) || address >= FRAME + 0x20n && address < FRAME + 0xa85cn || address >= FRAME + 0xa860n && address < FRAME + 0x1f8d8n;
    const event = (value: string) => { digest.update(value + '\n'); traceCount++; };
    const read = (address: bigint, count: number) => Uint8Array.from({ length: count }, (_, index) => bytes.get(u64(address + BigInt(index))) ?? 0);
    const write = (address: bigint, payload: Uint8Array) => {
      if (active && payload.length === 4 && address >= RECORDS && address < RECORDS + BigInt(COUNT * 72) && (address - RECORDS) % 72n === 0n) currentRecord = Number((address - RECORDS) / 72n);
      for (const [index, byte] of payload.entries()) {
        const pointer = u64(address + BigInt(index)); bytes.set(pointer, byte);
        if (active && semantic(pointer)) event(`w:${pointer.toString(16)}:${byte.toString(16).padStart(2, '0')}`);
      }
    };
    const scalar = (address: bigint, count: number) => read(address, count).reduceRight((value, byte) => value << 8n | BigInt(byte), 0n);
    const store = (address: bigint, value: bigint, count: number) => write(address, Uint8Array.from({ length: count }, (_, index) => Number(value >> BigInt(index * 8) & 255n)));
    const apply = (writes: readonly Write[]) => { for (const item of writes) write(BigInt(item.address), Uint8Array.from(Buffer.from(item.bytes, 'hex'))); };
    const memory: KeywordRecordMemory = {
      readByte: address => Number(scalar(address, 1)), readDword: address => Number(scalar(address, 4)), readQword: address => scalar(address, 8),
      writeByte: (address, value) => store(address, BigInt(value & 255), 1), writeDword: (address, value) => store(address, BigInt(value >>> 0), 4), writeQword: (address, value) => store(address, u64(value), 8),
    };
    write(0x700000n, new Uint8Array(0x40000).fill(0xa7)); apply(inputs); apply(fixture.changes ?? []); active = true;
    let services: KeywordInitializationServices;
    const service = (role: string, args: bigint[]): bigint => {
      const ordinal = counters.get(role) ?? 0; counters.set(role, ordinal + 1);
      let value = role === 'stackProbe' ? args[0] : 0n;
      if (role === 'crtAllocate') {
        const count = Number(args[0]); if (count <= 0 || count >= 0x10000) throw Error('Fixture allocation bound');
        value = heap; heap += BigInt((count + 31) & ~31); write(value, new Uint8Array(count).fill(0xb3));
        allocations.push({ address: hex(value), bytes: count, record: currentRecord, live: true, contents: '' });
      } else if (role === 'copy') {
        if (args[2] >= 0x10000n) throw Error('Fixture copy bound');
        write(args[0], read(args[1], Number(args[2]))); value = args[0];
      } else if (role === 'crtFree') {
        const allocation = allocations.find(row => row.address === hex(args[0]) && row.live);
        if (!allocation) throw Error('Unknown allocation free'); allocation.live = false;
      }
      for (const reply of fixture.responses ?? []) if (reply.role === role && reply.ordinal === ordinal) {
        apply(reply.writes ?? []); if (reply.value !== undefined) value = BigInt(reply.value);
      }
      const call = { role, arguments: args.map(hex), value: hex(value) }; calls.push(call); event('c:' + JSON.stringify(call));
      if ((fixture.missing ?? []).some(item => item[0] === role && item[1] === ordinal + 1)) delete services[role as keyof KeywordInitializationServices];
      return value;
    };
    services = {
      stackProbe: bytes => { service('stackProbe', [bytes]); }, registerExit: pointer => service('registerExit', [pointer]),
      crtAllocate: bytes => service('crtAllocate', [bytes]), crtFree: pointer => { service('crtFree', [pointer]); }, copy: (destination, source, count) => { service('copy', [destination, source, count]); },
    };
    for (const [role, ordinal] of fixture.missing ?? []) if (ordinal === 0) delete services[role as keyof KeywordInitializationServices];
    const port = new NativeKeywordInitialization(memory, services, 0x100000n, plan);
    const output = port.run(ENTRY);
    const { enteredRecords, completedRecords, ...result } = output;
    const nativeResult = result.kind === 'returned' ? { ...result, value: hex(result.value) } : { ...result, nativeAddress: hex(result.nativeAddress), callSite: hex(result.callSite) };
    expect(nativeResult).toEqual(fixture.expected.result);
    const recordBytes = Buffer.from(read(RECORDS, COUNT * 72)).toString('hex');
    const names = Array.from({ length: completedRecords }, (_, index) => {
      const record = RECORDS + BigInt(index * 72), pointer = scalar(record + 8n, 8), count = Number(scalar(record + 0x14n, 4));
      if (count <= 0 || count >= 0x10000) throw Error('Fixture name snapshot bound');
      return Buffer.from(read(pointer, count)).toString('hex');
    });
    for (const allocation of allocations) allocation.contents = Buffer.from(read(BigInt(allocation.address), allocation.bytes)).toString('hex');
    if (traceCount === 0) digest.update('\n');
    const actual = { result: nativeResult, enteredRecords, completedRecords, recordBytes, nameBytes: names, allocations, calls,
      enumLocals: Buffer.from(read(FRAME + 0x20n, COUNT * 4)).toString('hex'), enumHomes: Buffer.from(read(FRAME + 0xa860n, COUNT * 8)).toString('hex'), traceSha256: digest.digest('hex'), traceCount };
    const { observedArgumentsSha256: _originalObservation, ...expected } = fixture.expected;
    expect(actual).toEqual(expected);
  }, 30000);
});
