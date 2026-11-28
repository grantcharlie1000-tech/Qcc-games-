import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { NativeStreamConstruction } from '../../../src/games/iron-meridian/native/engine-construction';
import { NativeContentStream } from '../../../src/games/iron-meridian/native/content-stream';
import type { NativeStreamConstructionDependencies, NativeStreamConstructionMemory } from '../../../src/games/iron-meridian/native/engine-construction';
type Write = { address: string; bytes: string };
type Reply = { value?: string; type?: number; data?: string; writes?: Write[] };
interface Reference {
  metadata: { cases: number };
  cases: { id: string; input: { memoryWrites: Write[]; gsBase: string; method: string; mode: number; buffer: number; output: string; path: string; record: string; entryStack: string; engineEntryStack: string; missing: string[]; after: string[]; workspace: { stackHeader: string; pathPointer: string; stat: string }; responses: Record<string, Reply[]> }; expected: { result: unknown; calls: unknown[]; snapshots: Write[]; allocations: { address: string; size: number; bytes: string }[]; traceSha256: string; afterResults: unknown[] } }[];
}
const reference = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-stream-construction/reference.json', import.meta.url), 'utf8')) as Reference;
const identity = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-stream-construction/instructions.json', import.meta.url), 'utf8')) as { data: { start: string; bytes: string }[] };
describe('original owning-stream and engine construction', () => {
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const storage = new Map<bigint, number>(), trace: string[] = [], calls: unknown[] = [], allocations: { address: string; size: number }[] = [];
    const hex = (value: bigint) => `0x${BigInt.asUintN(64, value).toString(16)}`;
    const encode = (payload: Uint8Array) => [...payload].map(value => value.toString(16).padStart(2, '0')).join('');
    const entry = BigInt(input.entryStack), engineEntry = BigInt(input.engineEntryStack);
    const stack = [[engineEntry - 0x178n, engineEntry - 0x128n], ...(input.method === 'constructStream' ? [[entry + 8n, entry + 16n], [entry - 0x48n, entry - 0x20n], [entry - 0x158n, entry - 0x138n], [entry - 0xd0n, entry - 0xb0n]] : [])];
    let active = false;
    let phase = 'constructor';
    const semantic = (address: bigint) => address >= 0x100000n && address < 0x150000n || address >= 0x200000n && address < 0x300000n || address >= 0x143690000n && address < 0x1436a0000n || phase === 'constructor' && stack.some(([begin, end]) => address >= begin! && address < end!);
    const mapped = (address: bigint) => [[0x100000n, 0x150000n], [0x200000n, 0x300000n], [0x400000n, 0x420000n], [0x143690000n, 0x1436a0000n], [0x14368f000n, 0x143690000n]].some(([begin, end]) => address >= begin! && address < end!)
      || identity.data.some(item => address >= (BigInt(item.start) & ~4095n) && address < ((BigInt(item.start) + BigInt(item.bytes.length / 2) + 4095n) & ~4095n));
    const memory: NativeStreamConstructionMemory = {
      readByte(address) { if (!mapped(address)) throw new Error(`Unmapped read ${hex(address)}`); return storage.get(address) ?? (address >= 0x400000n && address < 0x420000n ? 0xa7 : 0); },
      readDword(address) { let value = 0; for (let i = 0; i < 4; i++) value += this.readByte(address + BigInt(i)) * 2 ** (i * 8); return value >>> 0; },
      readQword(address) { let value = 0n; for (let i = 0; i < 8; i++) value |= BigInt(this.readByte(address + BigInt(i))) << BigInt(i * 8); return value; },
      writeByte(address, value) { if (!mapped(address)) throw new Error(`Unmapped write ${hex(address)}`); storage.set(address, value & 255); if (active && semantic(address)) trace.push(`w:${address.toString(16)}:${(value & 255).toString(16).padStart(2, '0')}`); },
      writeDword(address, value) { for (let i = 0; i < 4; i++) this.writeByte(address + BigInt(i), value >>> (i * 8)); },
      writeQword(address, value) { for (let i = 0; i < 8; i++) this.writeByte(address + BigInt(i), Number(BigInt.asUintN(64, value) >> BigInt(i * 8) & 255n)); },
      writeBytes(address, payload) { payload.forEach((value, i) => this.writeByte(address + BigInt(i), value)); },
    };
    const raw = (address: bigint, size: number) => Uint8Array.from({ length: size }, (_, i) => memory.readByte(address + BigInt(i)));
    const apply = (writes: readonly Write[]) => { for (const write of writes) memory.writeBytes(BigInt(write.address), Uint8Array.from(write.bytes.match(/../g) ?? [], byte => Number.parseInt(byte, 16))); };
    for (const item of identity.data) apply([{ address: item.start, bytes: item.bytes }]);
    apply(input.memoryWrites);
    const cstring = (address: bigint) => { const bytes: number[] = []; while (memory.readByte(address) !== 0) { bytes.push(memory.readByte(address++)); if (bytes.length > 16384) throw new Error('Unterminated fixture'); } return encode(Uint8Array.from(bytes)); };
    const counts = new Map<string, number>(); let heap = 0x2b0000n;
    function leaf(role: string, target: bigint, args: bigint[]) {
      const index = counts.get(role) ?? 0; counts.set(role, index + 1); const reply = input.responses[role]?.[index] ?? {};
      let value = BigInt(reply.value ?? '0'); const effects: Write[] = [];
      const pathBytes = role === 'open' || role === 'stat' ? cstring(args[1]!) : undefined;
      if (role === 'copy') { value = args[0]!; effects.push({ address: hex(args[0]!), bytes: encode(raw(args[1]!, Number(args[2]!))) }); }
      else if (role === 'compare') { value = 0n; for (let i = 0n; i < args[2]!; i++) { const a = memory.readByte(args[0]! + i), b = memory.readByte(args[1]! + i); if (a !== b) { value = BigInt(a - b); break; } if (a === 0) break; } }
      else if (role === 'find-slash') { const text = cstring(args[0]!); const index = text.match(/../g)?.findIndex(byte => Number.parseInt(byte, 16) === Number(args[1]! & 255n)) ?? -1; value = index < 0 ? 0n : args[0]! + BigInt(index); }
      else if (role === 'probe') value = args[0]!;
      else {
        expect(input.responses[role]?.[index], `${role} reply ${index}`).toBeDefined();
        if (role === 'crt-allocate' && reply.value === undefined) { const size = args[0]!; expect(size).toBeLessThan(0x10000n); value = heap; heap += size + 31n & ~31n; memory.writeBytes(value, new Uint8Array(Number(size)).fill(0xb3)); allocations.push({ address: hex(value), size: Number(size) }); }
        if (role === 'stat' && reply.type !== undefined) { const view = new DataView(new ArrayBuffer(4)); view.setUint32(0, reply.type, true); effects.push({ address: hex(args[2]! + 0x20n), bytes: encode(new Uint8Array(view.buffer)) }); }
        if (role === 'read' && reply.data) effects.push({ address: hex(args[1]!), bytes: reply.data });
      }
      effects.push(...reply.writes ?? []); apply(effects);
      const call = { role, target: hex(target), arguments: args.map(hex), value: String(value), writes: effects, ...(pathBytes === undefined ? {} : { pathBytes }) }; calls.push(call); trace.push(`c:${JSON.stringify(call)}`); return value;
    }
    const missing = (role: string) => input.missing.includes(role);
    const dependencies: NativeStreamConstructionDependencies = {
      allocate: missing('allocate') ? undefined : (target, size) => leaf('allocate', target, [size]),
      openRead: missing('open') ? undefined : (target, opaque, path) => leaf('open', target, [opaque, path]),
      stat: missing('stat') ? undefined : (target, opaque, path, output) => Number(leaf('stat', target, [opaque, path, output])),
      comparePrefix1425ceb80: missing('compare') ? undefined : (left, right, size) => Number(leaf('compare', 0x1425ceb80n, [left, right, size])),
      findSlash1425c3c70: missing('find-slash') ? undefined : (path, byte) => leaf('find-slash', 0x1425c3c70n, [path, BigInt(byte)]),
      probeStack1425a07d0: missing('probe') ? undefined : size => { leaf('probe', 0x1425a07d0n, [size]); },
      lock1425a3b80: missing('lock') ? undefined : mutex => Number(leaf('lock', 0x1425a3b80n, [mutex])),
      unlock1425a3b88: missing('unlock') ? undefined : mutex => { leaf('unlock', 0x1425a3b88n, [mutex]); },
      free: missing('free') ? undefined : (target, pointer) => { leaf('free', target, [pointer]); },
      reallocate: missing('reallocate') ? undefined : (target, pointer, size) => leaf('reallocate', target, [pointer, size]),
      tell: missing('tell') ? undefined : (target, io) => leaf('tell', target, [io]),
      read: missing('read') ? undefined : (target, io, destination, size) => leaf('read', target, [io, destination, size]),
      seek: missing('seek') ? undefined : (target, io, offset) => Number(leaf('seek', target, [io, offset])),
      destroy: missing('destroy') ? undefined : (target, io) => { leaf('destroy', target, [io]); },
      copy1426079d0: missing('copy') ? undefined : (destination, source, size) => { leaf('copy', 0x1426079d0n, [destination, source, size]); },
      crtAllocate: missing('crt-allocate') ? undefined : size => leaf('crt-allocate', 0x1425a01dcn, [size]),
      crtFree: missing('crt-free') ? undefined : (pointer, size) => { leaf('crt-free', 0x1425a0218n, [pointer, size]); },
    };
    const construction = new NativeStreamConstruction(memory, dependencies, BigInt(input.gsBase));
    const workspace = { stackHeader: BigInt(input.workspace.stackHeader), pathPointer: BigInt(input.workspace.pathPointer), stat: BigInt(input.workspace.stat) };
    active = true;
    const result = input.method === 'createEngine' ? construction.createEngine(BigInt(input.output), BigInt(input.path), input.mode, input.buffer, entry, workspace)
      : construction.constructStream(BigInt(input.output), BigInt(input.record), input.mode, input.buffer, entry, workspace);
    expect(result.kind === 'returned' ? { kind: result.kind, value: String(result.value) } : result.kind === 'runtime-required' ? { ...result, nativeAddress: hex(result.nativeAddress), callSite: hex(result.callSite) } : { ...result, nativeAddress: hex(result.nativeAddress), ...(result.kind === 'native-memory-fault' ? { address: hex(result.address) } : {}) }).toEqual(expected.result);
    const afterResults = [];
    if (result.kind === 'returned') {
      const stream = new NativeContentStream(memory, { io: dependencies, crtAllocate: dependencies.crtAllocate, crtFree: dependencies.crtFree, copy: dependencies.copy1426079d0 }, BigInt(input.gsBase), entry);
      for (const method of input.after) {
        phase = method;
        const next = method === 'readInto' ? stream.readInto(0x2a1000n, 0x270000n, 4n) : stream.destroyStream(0x2a1000n);
        afterResults.push(next.kind === 'returned' ? next : next.kind === 'runtime-required' ? { ...next, nativeAddress: hex(next.nativeAddress), callSite: hex(next.callSite) } : { ...next, nativeAddress: hex(next.nativeAddress) });
        if (next.kind !== 'returned') break;
      }
    }
    expect(afterResults).toEqual(expected.afterResults);
    expect(calls).toEqual(expected.calls);
    for (const item of expected.snapshots) expect(encode(raw(BigInt(item.address), item.bytes.length / 2)), item.address).toBe(item.bytes);
    expect(allocations).toEqual(expected.allocations.map(({ address, size }) => ({ address, size })));
    for (const item of expected.allocations) expect(encode(raw(BigInt(item.address), item.size))).toBe(item.bytes);
    expect(createHash('sha256').update(`${trace.join('\n')}\n`).digest('hex')).toBe(expected.traceSha256);
  });
});
