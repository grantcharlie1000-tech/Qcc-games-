import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NativeParserState } from '../../../src/games/iron-meridian/native/parser-state';
import type { KeywordRecordMemory } from '../../../src/games/iron-meridian/native/keyword-record';

type Write = { address: string; bytes: string };
type Fixture = { name: string; memoryWrites: Write[]; operations: { method: 'construct' | 'currentToken'; arguments: string[] }[]; expected: { snapshots: Write[]; results: unknown[]; calls: unknown[]; allocations: unknown[]; traceSha256: string; traceCount: number } };
const identity = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-parser-state/instructions.json', import.meta.url), 'utf8')) as { data: Write[] };
const fixtures = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-parser-state/reference.json', import.meta.url), 'utf8')) as { cases: Fixture[] };
const u64 = (value: bigint) => BigInt.asUintN(64, value);
const hex = (value: bigint) => '0x' + u64(value).toString(16);

describe('original parser construction and current-token address', () => {
  for (const row of fixtures.cases) it(row.name, () => {
    const bytes = new Map<bigint, number>(), trace: string[] = [];
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
    for (const item of [...identity.data, ...row.memoryWrites]) write(BigInt(item.address), Buffer.from(item.bytes, 'hex'));
    active = true;
    const port = new NativeParserState(memory, {}, 0x100000n), results: unknown[] = [];
    for (const operation of row.operations) {
      const args = operation.arguments.map(BigInt);
      const result = operation.method === 'construct' ? port.construct(args[0]!, args[1]!) : port.currentToken(args[0]!);
      results.push(result.kind === 'returned' ? { ...result, value: hex(result.value) } : { ...result, nativeAddress: hex(result.nativeAddress), callSite: hex(result.callSite) });
      if (result.kind !== 'returned') break;
    }
    const snapshots = row.expected.snapshots.map(item => ({ address: item.address, bytes: Buffer.from(read(BigInt(item.address), item.bytes.length / 2)).toString('hex') }));
    expect({ results, calls: [], allocations: [], snapshots, traceSha256: createHash('sha256').update(trace.join('\n')).digest('hex'), traceCount: trace.length }).toEqual(row.expected);
  });
});
