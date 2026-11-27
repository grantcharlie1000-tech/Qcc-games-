import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NativeInputFactory } from '../../../src/games/iron-meridian/native/input-factory';
import type { InputFactoryServices } from '../../../src/games/iron-meridian/native/input-factory';
import { NativeStreamConstruction } from '../../../src/games/iron-meridian/native/engine-construction';
import type { NativeStreamConstructionDependencies, NativeStreamConstructionMemory } from '../../../src/games/iron-meridian/native/engine-construction';
import { NativeCharacterReader } from '../../../src/games/iron-meridian/native/character-reader';
import { NativeReaderLifetime } from '../../../src/games/iron-meridian/native/reader-lifetime';
type Write = { address: string; bytes: string };
type Reply = { value?: string; data?: string; type?: number; writes?: Write[] };
type Allocation = { address: string; size: number; live: boolean };
type Input = { memoryWrites: Write[]; responses: Record<string, Reply[]>; missing: [string, number][]; constructStream: boolean; mode: number; bom: number; buffer: number; readCount: number; destroy: boolean; workspace: { stackHeader: string; pathPointer: string; stat: string }; snapshots: { address: string; size: number }[] };
type Expected = { results: unknown[]; reader: string; calls: unknown[]; snapshots: Write[]; factoryScratch: Write[]; allocations: (Allocation & { bytes: string })[]; traceSha256: string; traceCount: number };
const reference = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-input-factory/reference.json', import.meta.url), 'utf8')) as { cases: { name: string; input: Input; expected: Expected }[] };
const identity = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-input-factory/instructions.json', import.meta.url), 'utf8')) as { data: Write[] };
const ENTRY = 0x410008n, STREAM = 0x2a1000n, RECORD = 0x2a2000n;
const u64 = (v: bigint) => BigInt.asUintN(64, v), hex = (v: bigint) => '0x' + u64(v).toString(16);
const normalized = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_, v: unknown) => typeof v === 'bigint' ? hex(v) : v));
describe('original composed stream/input-factory/reader lifetime', () => {
  for (const { name, input, expected } of reference.cases) it(name, () => {
    const bytes = new Map<bigint, number>(), trace: string[] = [], calls: unknown[] = [], allocations: Allocation[] = [];
    let active = false, heap = 0x2b0000n, phase = 'construction';
    const semantic = (a: bigint) => {
      if (a < 0x400000n || a >= 0x420000n) return true;
      const engine = ENTRY - 0x190n;
      const ranges = phase === 'construction' ? [[engine - 0x178n, engine - 0x128n], [ENTRY + 8n, ENTRY + 16n], [ENTRY - 0x48n, ENTRY - 0x20n], [ENTRY - 0x158n, ENTRY - 0x138n], [ENTRY - 0xd0n, ENTRY - 0xb0n]] : phase === 'factory' ? [[ENTRY + 8n, ENTRY + 16n], [ENTRY + 0x20n, ENTRY + 0x28n], [ENTRY - 0x88n, ENTRY - 0x68n], [ENTRY - 0x38n, ENTRY - 0x37n]] : [];
      return ranges.some(([begin, end]) => a >= begin! && a < end!);
    };
    const memory: NativeStreamConstructionMemory = {
      readByte(a) { return bytes.get(u64(a)) ?? (a >= 0x400000n && a < 0x420000n ? 0xa7 : 0); },
      readDword(a) { let v = 0; for (let i = 0; i < 4; i++) v += this.readByte(a + BigInt(i)) * 2 ** (i * 8); return v >>> 0; },
      readQword(a) { let v = 0n; for (let i = 0; i < 8; i++) v |= BigInt(this.readByte(a + BigInt(i))) << BigInt(i * 8); return v; },
      writeByte(a, v) { a = u64(a); bytes.set(a, v & 255); if (active && semantic(a)) trace.push(`w:${a.toString(16)}:${(v & 255).toString(16).padStart(2, '0')}`); },
      writeDword(a, v) { for (let i = 0; i < 4; i++) this.writeByte(a + BigInt(i), v >>> (i * 8)); },
      writeQword(a, v) { for (let i = 0; i < 8; i++) this.writeByte(a + BigInt(i), Number(u64(v) >> BigInt(i * 8) & 255n)); },
      writeBytes(a, payload) { for (let i = 0; i < payload.length; i++) this.writeByte(a + BigInt(i), payload[i]!); },
    };
    const raw = (a: bigint, n: number) => Uint8Array.from({ length: n }, (_, i) => memory.readByte(a + BigInt(i)));
    const encode = (payload: Uint8Array) => Buffer.from(payload).toString('hex');
    const apply = (writes: readonly Write[]) => { for (const w of writes) memory.writeBytes(BigInt(w.address), Uint8Array.from(Buffer.from(w.bytes, 'hex'))); };
    apply(identity.data); apply(input.memoryWrites);
    const counts = new Map<string, number>(), removals: { role: string; object: object; key: string }[] = [];
    const remove = (role: string, ordinal: number) => { if (input.missing.some(([r, n]) => r === role && (n === ordinal || n === -1))) for (const b of removals) if (b.role === role) Reflect.deleteProperty(b.object, b.key); };
    const cstring = (a: bigint) => { const result: number[] = []; while (memory.readByte(a)) { result.push(memory.readByte(a++)); if (result.length > 16384) throw Error('Fixture string bound'); } return Buffer.from(result); };
    const leaf = (role: string, target: bigint, args: bigint[]): bigint => {
      const index = counts.get(role) ?? 0; counts.set(role, index + 1); const reply = input.responses[role]?.[index] ?? {}; let value = 0n; const effects: Write[] = [];
      if (role === 'copy') { memory.writeBytes(args[0]!, raw(args[1]!, Number(args[2]!))); value = args[0]!; }
      else if (role === 'zero') { memory.writeBytes(args[0]!, new Uint8Array(Number(args[2]!)).fill(Number(args[1]! & 255n))); value = args[0]!; }
      else if (role === 'compare') { for (let i = 0n; i < args[2]!; i++) { const a = memory.readByte(args[0]! + i), b = memory.readByte(args[1]! + i); if (a !== b) { value = BigInt(a - b); break; } if (!a) break; } }
      else if (role === 'find-slash') { const index = cstring(args[0]!).indexOf(Number(args[1]! & 255n)); value = index < 0 ? 0n : args[0]! + BigInt(index); }
      else if (role === 'probe') value = args[0]!;
      else {
        expect(input.responses[role]?.[index], role + '/' + index).toBeDefined(); value = BigInt(reply.value ?? '0');
        if (role === 'crt-allocate' && reply.value === undefined) { value = heap; const n = Number(args[0]!); heap += BigInt((n + 31) & ~31); memory.writeBytes(value, new Uint8Array(n).fill(0xb3)); allocations.push({ address: hex(value), size: n, live: true }); }
        if (role === 'crt-free') { const a = allocations.find(a => a.address === hex(args[0]!) && a.live); if (a) a.live = false; }
        if (role === 'stat' && reply.type !== undefined) { const data = Buffer.alloc(4); data.writeUInt32LE(reply.type); effects.push({ address: hex(args[2]! + 0x20n), bytes: data.toString('hex') }); }
        if (role === 'read' && reply.data) effects.push({ address: hex(args[1]!), bytes: reply.data });
      }
      effects.push(...reply.writes ?? []); apply(effects); if (reply.value !== undefined) value = BigInt(reply.value);
      const call = { role, target: hex(target), arguments: args.map(hex), value: String(value), writes: effects }; calls.push(call); trace.push('c:' + JSON.stringify(call)); remove(role, index + 1); return value;
    };
    const dependencies: NativeStreamConstructionDependencies = {
      allocate: (t, n) => leaf('allocate', t, [n]), openRead: (t, opaque, p) => leaf('open', t, [opaque, p]), stat: (t, opaque, p, out) => Number(leaf('stat', t, [opaque, p, out])),
      comparePrefix1425ceb80: (a, b, n) => Number(leaf('compare', 0x1425ceb80n, [a, b, n])), findSlash1425c3c70: (p, b) => leaf('find-slash', 0x1425c3c70n, [p, BigInt(b)]), probeStack1425a07d0: n => { leaf('probe', 0x1425a07d0n, [n]); },
      lock1425a3b80: m => Number(leaf('lock', 0x1425a3b80n, [m])), unlock1425a3b88: m => { leaf('unlock', 0x1425a3b88n, [m]); }, free: (t, p) => { leaf('free', t, [p]); }, reallocate: (t, p, n) => leaf('reallocate', t, [p, n]),
      tell: (t, io) => leaf('tell', t, [io]), length: (t, io) => leaf('length', t, [io]), read: (t, io, p, n) => leaf('read', t, [io, p, n]), seek: (t, io, o) => Number(leaf('seek', t, [io, o])), destroy: (t, io) => { leaf('destroy', t, [io]); },
      copy1426079d0: (a, b, n) => { leaf('copy', 0x1426079d0n, [a, b, n]); }, crtAllocate: n => leaf('crt-allocate', 0x1425a01dcn, [n]), crtFree: p => { leaf('crt-free', 0x1425cec00n, [p]); },
    };
    const services: InputFactoryServices = { io: dependencies, crtAllocate: n => leaf('crt-allocate', 0x1425a01dcn, [n]), crtFree: p => { leaf('crt-free', 0x1425cec00n, [p]); }, copy: dependencies.copy1426079d0, zero: (p, v, n) => { leaf('zero', 0x142608070n, [p, BigInt(v), n]); } };
    const bindings: [string, object, string][] = [['crt-allocate', dependencies, 'crtAllocate'], ['crt-allocate', services, 'crtAllocate'], ['crt-free', dependencies, 'crtFree'], ['crt-free', services, 'crtFree'], ['copy', dependencies, 'copy1426079d0'], ['copy', services, 'copy'], ['zero', services, 'zero'], ...['read', 'length', 'destroy'].map(role => [role, dependencies, role] as [string, object, string])];
    removals.push(...bindings.map(([role, object, key]) => ({ role, object, key }))); for (const [role] of input.missing) remove(role, 0);
    active = true; const results: unknown[] = []; let reader = 0n, canContinue = true, scratch: Write[] = [];
    if (input.constructStream) {
      const result = new NativeStreamConstruction(memory, dependencies, 0x100000n).constructStream(STREAM, RECORD, 0, input.buffer, ENTRY, { stackHeader: BigInt(input.workspace.stackHeader), pathPointer: BigInt(input.workspace.pathPointer), stat: BigInt(input.workspace.stat) }); results.push(normalized(result)); canContinue = result.kind === 'returned';
    }
    if (canContinue) {
      phase = 'factory';
      const result = new NativeInputFactory(memory, services, 0x100000n).create(STREAM, input.mode, input.bom, ENTRY); results.push(normalized(result)); canContinue = result.kind === 'returned'; if (result.kind === 'returned') reader = result.value;
      scratch = ([[ENTRY + 8n, 8], [ENTRY + 0x20n, 8], [ENTRY - 0x38n, 1]] as const).map(([a, n]) => ({ address: hex(a), bytes: encode(raw(a, n)) }));
    }
    phase = 'reader'; const character = new NativeCharacterReader(memory, { get copy() { return services.copy; } });
    if (canContinue) for (let i = 0; i < input.readCount; i++) { const result = character.readByte(reader); results.push(normalized(result.kind === 'returned' ? { ...result, value: hex(BigInt(result.value)) } : result)); if (result.kind !== 'returned') { canContinue = false; break; } }
    if (canContinue && input.destroy) results.push(normalized(new NativeReaderLifetime(memory, { get crtFree() { return services.crtFree; } }).destroyReader(reader, 1)));
    expect(results).toEqual(expected.results); expect(hex(reader)).toBe(expected.reader); expect(calls).toEqual(expected.calls);
    expect(scratch).toEqual(expected.factoryScratch);
    for (const item of expected.snapshots) expect(encode(raw(BigInt(item.address), item.bytes.length / 2)), item.address).toBe(item.bytes);
    expect(allocations.map(a => ({ ...a, bytes: encode(raw(BigInt(a.address), a.size)) }))).toEqual(expected.allocations);
    const digest = createHash('sha256').update(trace.join('\n') + '\n').digest('hex');
    if (digest !== expected.traceSha256) writeFileSync(new URL('../../../work/iron-meridian/native-next-integration/trace-' + name + '.json', import.meta.url), JSON.stringify(trace));
    expect(trace.length).toBe(expected.traceCount); expect(digest).toBe(expected.traceSha256);
  });
});
