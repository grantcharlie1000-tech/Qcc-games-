import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NativeTokenBuffer } from '../../../src/games/iron-meridian/native/token-buffer';
import type { KeywordRecordMemory, KeywordRecordServices } from '../../../src/games/iron-meridian/native/keyword-record';

type Write = { address: string; bytes: string };
type Reply = { value?: string; writes?: Write[] };
type Fixture = { name: string; input: { capacity: number; count: number; value: number; allocator: string; operations: string[]; inlinePointer?: boolean; changes?: Write[]; responses?: Record<string, Reply[]>; missing?: string[] }; expected: { results: unknown[]; calls: unknown[]; snapshots: Write[]; traceSha256: string; traceCount: number } };
const reference = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-token-buffer/reference.json', import.meta.url), 'utf8')) as { cases: Fixture[] };
const identity = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-token-buffer/instructions.json', import.meta.url), 'utf8')) as { data: Write[] };
const u64 = (v: bigint) => BigInt.asUintN(64, v), hex = (v: bigint) => '0x' + u64(v).toString(16);
const TOKEN = 0x200100n, OLD = 0x204000n, NEW = 0x210000n, ALLOCATOR = 0x200300n, VTABLE = 0x200400n, BACK = 0x200500n;
const ALLOC = 0x6000100n, RELEASE = 0x6000200n, GETTER = 0x6000300n, COPY = 0x1426079d0n, MALLOC = 0x1425a01dcn, FREE = 0x1425cec00n;
const qw = (a: bigint, value: bigint): Write => { const raw = Buffer.alloc(8); raw.writeBigUInt64LE(u64(value)); return { address: hex(a), bytes: raw.toString('hex') }; };
const dw = (a: bigint, value: number): Write => { const raw = Buffer.alloc(4); raw.writeUInt32LE(value >>> 0); return { address: hex(a), bytes: raw.toString('hex') }; };

describe('original token append/reset and concrete allocator closure', () => {
  for (const fixture of reference.cases) it(fixture.name, () => {
    const row = fixture.input, bytes = new Map<bigint, number>(), trace: string[] = [], calls: unknown[] = [], ordinals = new Map<string, number>();
    let active = false;
    const host = (a: bigint) => a >= 0x200000n && a < 0x220000n;
    const mapped = (a: bigint) => host(a) || identity.data.some(d => a >= (BigInt(d.address) & ~4095n) && a < ((BigInt(d.address) + BigInt(d.bytes.length / 2) + 4095n) & ~4095n));
    const memory: KeywordRecordMemory = {
      readByte(a) { a = u64(a); if (!mapped(a)) throw Error('Unmapped read ' + hex(a)); return bytes.get(a) ?? (host(a) ? 0xa7 : 0); },
      readDword(a) { let v = 0; for (let i = 0; i < 4; i++) v |= this.readByte(u64(a + BigInt(i))) << (i * 8); return v >>> 0; },
      readQword(a) { let v = 0n; for (let i = 0; i < 8; i++) v |= BigInt(this.readByte(u64(a + BigInt(i)))) << BigInt(i * 8); return v; },
      writeByte(a, value) { a = u64(a); if (!mapped(a)) throw Error('Unmapped write ' + hex(a)); bytes.set(a, value & 255); if (active) trace.push(`w:${a.toString(16)}:${(value & 255).toString(16).padStart(2, '0')}`); },
      writeDword(a, value) { for (let i = 0; i < 4; i++) this.writeByte(u64(a + BigInt(i)), value >>> (i * 8)); },
      writeQword(a, value) { for (let i = 0; i < 8; i++) this.writeByte(u64(a + BigInt(i)), Number(u64(value) >> BigInt(i * 8) & 255n)); },
    };
    const raw = (a: bigint, n: number) => Buffer.from(Uint8Array.from({ length: n }, (_, i) => memory.readByte(u64(a + BigInt(i)))));
    const apply = (writes: Write[]) => { for (const w of writes) for (const [i, v] of Buffer.from(w.bytes, 'hex').entries()) memory.writeByte(BigInt(w.address) + BigInt(i), v); };
    apply(identity.data);
    const initial = [qw(TOKEN + 8n, OLD), dw(TOKEN + 0x10n, row.capacity), dw(TOKEN + 0x14n, row.count), qw(TOKEN + 0x18n, ALLOCATOR), qw(ALLOCATOR, VTABLE), qw(ALLOCATOR + 0x20n, BACK), qw(VTABLE + 8n, ALLOC), qw(VTABLE + 0x10n, RELEASE), qw(VTABLE + 0x38n, GETTER), qw(BACK, 0x142794550n), { address: hex(OLD), bytes: Buffer.from('abcdefghi').toString('hex') }];
    if (row.allocator === 'global') initial.push(qw(TOKEN + 0x18n, 0x1430fd000n));
    if (row.allocator === 'inline' || row.allocator === 'custom-backing') initial.push(qw(VTABLE + 8n, 0x140121d20n), qw(VTABLE + 0x10n, 0x140122500n));
    if (row.allocator === 'inline') initial.push(qw(VTABLE + 0x38n, 0x1401693c0n));
    if (row.inlinePointer) initial.push(qw(TOKEN + 8n, ALLOCATOR + 8n));
    apply(initial); apply(row.changes ?? []);
    const invoke = (kind: string, target: bigint, args: bigint[], fallback = 0n) => {
      const ordinal = ordinals.get(kind) ?? 0; ordinals.set(kind, ordinal + 1);
      const reply = row.responses?.[kind]?.[ordinal] ?? {}, value = u64(BigInt(reply.value ?? hex(fallback)));
      if (kind === 'copy') { const destination = args[0]!, source = args[1]!, count = args[2]!; expect(count).toBeLessThanOrEqual(4096n); const payload = raw(source, Number(count)); for (const [i, byte] of payload.entries()) memory.writeByte(destination + BigInt(i), byte); }
      apply(reply.writes ?? []);
      const call = { kind, target: hex(target), arguments: args.map(hex), value: hex(value), writes: reply.writes ?? [] }; calls.push(call); trace.push('c:' + JSON.stringify(call));
      return value;
    };
    const services: KeywordRecordServices = {
      allocate(target, allocator, count, alignment) { return invoke('allocate', target, [allocator, count, BigInt(alignment)], NEW); },
      release(target, allocator, pointer) { invoke('release', target, [allocator, pointer]); },
      allocatorGetter(target, allocator) { return invoke('getter', target, [allocator], BACK); },
      copy(destination, source, count) { invoke('copy', COPY, [destination, source, count]); },
      crtAllocate(count) { return invoke('crt-allocate', MALLOC, [count], NEW); },
      crtFree(pointer) { invoke('crt-free', FREE, [pointer]); },
    };
    for (const missing of row.missing ?? []) {
      if (missing === 'allocate') delete services.allocate;
      if (missing === 'release') delete services.release;
      if (missing === 'getter') delete services.allocatorGetter;
      if (missing === 'copy') delete services.copy;
      if (missing === 'crt-allocate') delete services.crtAllocate;
      if (missing === 'crt-free') delete services.crtFree;
    }
    active = true; const port = new NativeTokenBuffer(memory, services), results: unknown[] = [];
    for (const operation of row.operations) {
      const result = operation === 'clear' ? port.clear(TOKEN) : port.append(TOKEN, row.value);
      results.push(result.kind === 'complete' ? result : { ...result, nativeAddress: hex(result.nativeAddress), callSite: hex(result.callSite) });
      if (result.kind !== 'complete') break;
    }
    const snapshots = fixture.expected.snapshots.map(w => ({ address: w.address, bytes: raw(BigInt(w.address), w.bytes.length / 2).toString('hex') }));
    expect({ results, calls, snapshots, traceSha256: createHash('sha256').update(trace.join('\n') + '\n').digest('hex'), traceCount: trace.length }).toEqual(fixture.expected);
  });
});
