import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NativeCharacterClasses } from '../../../src/games/iron-meridian/native/character-classes';
import type { CharacterClassMemory, CharacterClassServices } from '../../../src/games/iron-meridian/native/character-classes';
type Write = { address: string; bytes: string };
type Fixture = { name: string; operations: { method: string; character: string; mask: string }[]; changes?: Write[]; missing?: number[]; replies?: { value?: string; writes?: Write[] }[]; expected: { results: unknown[]; calls: unknown[]; snapshots: Write[]; traceSha256: string; traceCount: number } };
const reference = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-character-classes/reference.json', import.meta.url), 'utf8')) as { cases: Fixture[] };
const identity = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-character-classes/instructions.json', import.meta.url), 'utf8')) as { data: Write[] };
const u64 = (value: bigint) => BigInt.asUintN(64, value), hex = (value: bigint) => '0x' + u64(value).toString(16);
const ENTRY = 0x330008n, API = 0x6000100n, ALT = 0x2a0000n, IAT = 0x142785228n;
describe('original byte/wide classification and whitespace wrapper', () => {
  for (const fixture of reference.cases) it(fixture.name, () => {
    const bytes = new Map<bigint, number>(), trace: string[] = [], calls: unknown[] = [];
    let active = false, ordinal = 0;
    const semantic = (a: bigint) => !(a >= 0x300000n && a < 0x340000n) || a >= ENTRY + 8n && a < ENTRY + 10n || a >= ENTRY + 0x18n && a < ENTRY + 0x1an;
    const mapped = (a: bigint) => a >= 0x300000n && a < 0x340000n || a >= ALT && a < ALT + 4096n || identity.data.some(d => a >= (BigInt(d.address) & ~4095n) && a < ((BigInt(d.address) + BigInt(d.bytes.length / 2) + 4095n) & ~4095n));
    const memory: CharacterClassMemory = {
      readByte(a) { a = u64(a); if (!mapped(a)) throw Error('Unmapped fixture read ' + hex(a)); return bytes.get(a) ?? (a >= 0x300000n && a < 0x340000n ? 0xa7 : 0); },
      readQword(a) { let value = 0n; for (let i = 0; i < 8; i++) value |= BigInt(this.readByte(a + BigInt(i))) << BigInt(i * 8); return value; },
      writeByte(a, v) { a = u64(a); if (!mapped(a)) throw Error('Unmapped fixture write ' + hex(a)); bytes.set(a, v & 255); if (active && semantic(a)) trace.push(`w:${a.toString(16)}:${(v & 255).toString(16).padStart(2, '0')}`); },
    };
    const raw = (a: bigint, n: number) => Uint8Array.from({ length: n }, (_, i) => memory.readByte(a + BigInt(i)));
    const apply = (writes: readonly Write[]) => { for (const w of writes) for (const [i, byte] of Buffer.from(w.bytes, 'hex').entries()) memory.writeByte(BigInt(w.address) + BigInt(i), byte); };
    apply(identity.data); const slot = Buffer.alloc(8); slot.writeBigUInt64LE(API); apply([{ address: hex(IAT), bytes: slot.toString('hex') }]); apply(fixture.changes ?? []);
    const services: CharacterClassServices = { getStringTypeW: { address: API, call(informationType, source, count, output) {
      const reply = fixture.replies?.[ordinal++]; expect(reply).toBeDefined();
      const before = { sourceWord: Buffer.from(raw(source, 2)).toString('hex'), outputWord: Buffer.from(raw(output, 2)).toString('hex') };
      apply(reply?.writes ?? []); const value = u64(BigInt(reply?.value ?? '0x1'));
      const call = { arguments: [hex(BigInt(informationType)), hex(source), hex(BigInt(count)), hex(output)], before, value: hex(value), writes: reply?.writes ?? [] }; calls.push(call); trace.push('c:' + JSON.stringify(call));
      if (fixture.missing?.includes(ordinal)) delete services.getStringTypeW;
      return value;
    } } };
    if (fixture.missing?.includes(0)) delete services.getStringTypeW;
    active = true; const port = new NativeCharacterClasses(memory, services), results: unknown[] = [];
    for (const operation of fixture.operations) {
      const result = operation.method === 'whitespace' ? port.whitespace(BigInt(operation.character), ENTRY) : port.classify(BigInt(operation.character), BigInt(operation.mask), ENTRY);
      results.push(result.kind === 'returned' ? result : { ...result, nativeAddress: hex(result.nativeAddress), callSite: hex(result.callSite) }); if (result.kind !== 'returned') break;
    }
    const snapshots = fixture.expected.snapshots.map(d => ({ address: d.address, bytes: Buffer.from(raw(BigInt(d.address), d.bytes.length / 2)).toString('hex') }));
    expect({ results, calls, snapshots, traceSha256: createHash('sha256').update(trace.join('\n') + '\n').digest('hex'), traceCount: trace.length }).toEqual(fixture.expected);
  });
});
