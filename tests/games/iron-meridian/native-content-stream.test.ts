import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { NativeContentStream } from '../../../src/games/iron-meridian/native/content-stream';
import type { NativeContentDependencies, NativeContentMemory, NativeContentResult } from '../../../src/games/iron-meridian/native/content-stream';
import reference from '../../../work/iron-meridian/native-content-stream/reference.json';

describe('native engine stream and false-mode bytes against original instructions', () => {
  // Wrong negative-result clamp, CR tail handling, partial writes, reload or lifetime order must fail.
  it.each(reference.cases)('$id', ({ input, expected }) => {
    const bytes = new Map<bigint, number>();
    const trace: string[] = [];
    let active: string | undefined;
    const entryStack = BigInt(reference.metadata.entryStack);
    const semantic = (address: bigint) => address >= 0x100000n && address < 0x140000n || address >= 0x200000n && address < 0x300000n || address >= 0x143690000n && address < 0x1436a0000n
      || active === 'convertFalse' && (address >= entryStack - 0x80n && address < entryStack - 0x48n || address >= entryStack + 0x10n && address < entryStack + 0x28n);
    const mapped = (address: bigint) => [
      [0x100000n, 0x140000n], [0x200000n, 0x300000n], [0x300000n, 0x340000n],
      [0x143690000n, 0x1436a0000n], [0x1433dd000n, 0x1433de000n], [0x142795000n, 0x142796000n],
      [0x1430fd000n, 0x1430fe000n], [0x14368f000n, 0x143690000n], [0x142c05000n, 0x142c07000n],
    ].some(([begin, end]) => address >= begin! && address < end!);
    const hex = (value: bigint) => `0x${BigInt.asUintN(64, value).toString(16)}`;
    const encode = (payload: Uint8Array) => [...payload].map(value => value.toString(16).padStart(2, '0')).join('');
    const apply = (writes: readonly { address: string; bytes: string }[]) => {
      for (const item of writes) for (let offset = 0; offset < item.bytes.length; offset += 2) memory.writeByte(BigInt(item.address) + BigInt(offset / 2), Number.parseInt(item.bytes.slice(offset, offset + 2), 16));
    };
    const memory: NativeContentMemory = {
      readByte(address) { if (!mapped(address)) throw new Error(`Unmapped read ${hex(address)}`); return bytes.get(address) ?? (address >= 0x300000n && address < 0x340000n ? 0xa7 : 0); },
      readDword(address) { let value = 0; for (let index = 0; index < 4; index++) value += this.readByte(address + BigInt(index)) * 2 ** (8 * index); return value >>> 0; },
      readQword(address) { let value = 0n; for (let index = 0; index < 8; index++) value |= BigInt(this.readByte(address + BigInt(index))) << BigInt(index * 8); return value; },
      writeByte(address, value) { if (!mapped(address)) throw new Error(`Unmapped write ${hex(address)}`); bytes.set(address, value & 255); if (active && semantic(address)) trace.push(`w:${address.toString(16)}:${(value & 255).toString(16).padStart(2, '0')}`); },
      writeDword(address, value) { for (let index = 0; index < 4; index++) this.writeByte(address + BigInt(index), value >>> (index * 8)); },
      writeQword(address, value) { for (let index = 0; index < 8; index++) this.writeByte(address + BigInt(index), Number(BigInt.asUintN(64, value) >> BigInt(index * 8) & 255n)); },
      writeBytes(address, payload) { payload.forEach((value, index) => this.writeByte(address + BigInt(index), value)); },
    };
    const raw = (address: bigint, count: number) => Uint8Array.from({ length: count }, (_, index) => memory.readByte(address + BigInt(index)));
    // Concrete engine vtable bytes are original supplied readonly data.
    for (const [slot, target] of [[0, 0x14255e820n], [8, 0x14255fe10n], [0x20, 0x14255f580n]] as const) memory.writeQword(0x142c05ff8n + BigInt(slot), target);
    apply(input.memoryWrites);
    type Reply = { value?: string; data?: string; writes?: { address: string; bytes: string }[] };
    const replies: Readonly<Record<string, readonly Reply[] | undefined>> = input.responses;
    const calls: { role: string; target: string; arguments: string[]; value: string; writes: { address: string; bytes: string }[] }[] = [];
    const counts = new Map<string, number>(), allocations: { address: string; size: number }[] = [];
    const missing: readonly string[] = input.missing;
    let heap = 0x280000n;
    function leaf(role: string, target: bigint, args: bigint[]) {
      const index = counts.get(role) ?? 0; counts.set(role, index + 1);
      const effects: { address: string; bytes: string }[] = [];
      const reply = replies[role]?.[index];
      let value = 0n;
      if (role === 'copy') { memory.writeBytes(args[0]!, raw(args[1]!, Number(args[2]!))); value = args[0]!; }
      else if (role === 'zero') { memory.writeBytes(args[0]!, new Uint8Array(Number(args[2]!)).fill(Number(args[1]!))); value = args[0]!; }
      else {
        expect(reply, `${role} reply ${index}`).toBeDefined();
        value = BigInt(reply?.value ?? '0');
        if ((role === 'allocate' || role === 'crt-allocate') && reply?.value === undefined) {
          const size = role === 'allocate' ? args[1]! : args[0]!; expect(size).toBeLessThan(0x10000n);
          value = heap; heap += (size + 31n) & ~31n; memory.writeBytes(value, new Uint8Array(Number(size)).fill(0xb3)); allocations.push({ address: hex(value), size: Number(size) });
        }
        if (role === 'read' && reply?.data) effects.push({ address: hex(args[1]!), bytes: reply.data });
      }
      effects.push(...reply?.writes ?? []); apply(effects);
      calls.push({ role, target: hex(target), arguments: args.map(hex), value: String(value), writes: effects }); trace.push(`c:${JSON.stringify(calls.at(-1))}`); return value;
    }
    const io = {
      read: missing.includes('read') ? undefined : (target: bigint, handle: bigint, destination: bigint, size: bigint) => leaf('read', target, [handle, destination, size]),
      length: missing.includes('length') ? undefined : (target: bigint, handle: bigint) => leaf('length', target, [handle]),
      destroy: missing.includes('destroy') ? undefined : (target: bigint, handle: bigint) => { leaf('destroy', target, [handle]); },
      free: missing.includes('free') ? undefined : (target: bigint, pointer: bigint) => { leaf('free', target, [pointer]); },
      copy1426079d0: missing.includes('copy') ? undefined : (destination: bigint, source: bigint, size: bigint) => { leaf('copy', 0x1426079d0n, [destination, source, size]); },
      lock1425a3b80: missing.includes('lock') ? undefined : (mutex: bigint) => Number(leaf('lock', 0x1425a3b80n, [mutex])),
      unlock1425a3b88: missing.includes('unlock') ? undefined : (mutex: bigint) => { leaf('unlock', 0x1425a3b88n, [mutex]); },
    };
    const dependencies: NativeContentDependencies = { io,
      allocate: missing.includes('allocate') ? undefined : (target, allocator, size, alignment) => leaf('allocate', target, [allocator, size, BigInt(alignment)]),
      release: missing.includes('release') ? undefined : (target, allocator, pointer) => { leaf('release', target, [allocator, pointer]); },
      crtAllocate: missing.includes('crt-allocate') ? undefined : size => leaf('crt-allocate', 0x1425a01dcn, [size]),
      crtFree: missing.includes('crt-free') ? undefined : (pointer, size) => { leaf('crt-free', 0x1425a0218n, [pointer, size]); },
      copy: io.copy1426079d0,
      zero: missing.includes('zero') ? undefined : (destination, value, size) => { leaf('zero', 0x142608070n, [destination, BigInt(value), size]); },
    };
    const stream = new NativeContentStream(memory, dependencies, BigInt(input.gsBase), BigInt(reference.metadata.entryStack));
    const results: NativeContentResult<bigint | number | null>[] = [];
    for (const operation of input.operations) {
      const args = operation.arguments.map(BigInt), method = operation.method;
      active = method;
      const result = method === 'readAll' ? stream.readAll(args[0]!, args[1]!) : method === 'readInto' ? stream.readInto(args[0]!, args[1]!, args[2]!)
        : method === 'streamLength' ? stream.streamLength(args[0]!) : method === 'convertFalse' ? stream.convertFalse(args[0]!, args[1]!)
          : method === 'resize' ? stream.resize(args[0]!, Number(BigInt.asIntN(32, args[1]!))) : method === 'reserve' ? stream.reserve(args[0]!, Number(BigInt.asIntN(32, args[1]!))) : stream.destroyStream(args[0]!);
      results.push(result); if (result.kind !== 'returned') break;
    }
    expect(results.map(result => result.kind === 'returned' ? { kind: result.kind, value: result.value === null ? null : String(result.value) }
      : result.kind === 'runtime-required' ? { ...result, nativeAddress: hex(result.nativeAddress), callSite: hex(result.callSite) } : { ...result, nativeAddress: hex(result.nativeAddress) })).toEqual(expected.results);
    expect(calls).toEqual(expected.calls);
    for (const item of expected.snapshots) expect(encode(raw(BigInt(item.address), item.bytes.length / 2)), item.address).toBe(item.bytes);
    expect(allocations).toEqual(expected.allocations.map(({ address, size }) => ({ address, size })));
    for (const item of expected.allocations) expect(encode(raw(BigInt(item.address), item.size))).toBe(item.bytes);
    expect(createHash('sha256').update(`${trace.join('\n')}\n`).digest('hex')).toBe(expected.traceSha256);
  });
});
