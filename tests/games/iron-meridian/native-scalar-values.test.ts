import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NativeScalarValues } from '../../../src/games/iron-meridian/native/scalar-values';
import type { ScalarMemory } from '../../../src/games/iron-meridian/native/scalar-values';
type Write = { address: string; bytes: string };
type Case = { name: string; input: { entry: string; supplied: Write[] }; result: { kind: string; al?: number; boundary?: string; nativeAddress?: string; callSite?: string }; outputHex: string; rawWrites: ['w', string, string, string][] };
const reference = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-technology-scalars/original-reference.json', import.meta.url), 'utf8')) as { target: { path: string }; cases: Case[] };
const image = readFileSync(reference.target.path), pe = image.readUInt32LE(60), optional = pe + 24, table = optional + image.readUInt16LE(pe + 20);
const sections = Array.from({ length: image.readUInt16LE(pe + 6) }, (_, i) => {
  const at = table + i * 40;
  return { virtual: image.readUInt32LE(at + 8), rva: image.readUInt32LE(at + 12), count: image.readUInt32LE(at + 16), offset: image.readUInt32LE(at + 20) };
});
const u64 = (value: bigint) => BigInt.asUintN(64, value);
const semantic = (address: bigint) => address < 0x700000n || address >= 0x740000n;
class Memory implements ScalarMemory {
  readonly bytes = new Map<bigint, number>();
  readonly trace: string[] = [];
  active = false;
  readByte(address: bigint): number {
    address = u64(address); const value = this.bytes.get(address); if (value !== undefined) return value;
    if (address >= 0x700000n && address < 0x740000n) return 0xa7;
    if (address >= 0x800000n && address < 0xa00000n || address >= 0x100000n && address < 0x104000n) return 0;
    const rva = Number(address - 0x140000000n), section = sections.find(s => s.rva <= rva && rva < s.rva + Math.max(s.virtual, s.count));
    if (section) return rva - section.rva < section.count ? image[section.offset + rva - section.rva]! : 0;
    throw Error('Unmapped candidate read ' + address.toString(16));
  }
  readDword(address: bigint) { let value = 0; for (let i = 0; i < 4; i++) value += this.readByte(address + BigInt(i)) * 2 ** (i * 8); return value >>> 0; }
  readQword(address: bigint) { let value = 0n; for (let i = 0; i < 8; i++) value |= BigInt(this.readByte(address + BigInt(i))) << BigInt(i * 8); return value; }
  writeByte(address: bigint, value: number) { address = u64(address); value &= 255; this.bytes.set(address, value); if (this.active && semantic(address)) this.trace.push(`w:${address.toString(16)}:${value.toString(16).padStart(2, '0')}`); }
  writeDword(address: bigint, value: number) { for (let i = 0; i < 4; i++) this.writeByte(address + BigInt(i), value >>> (i * 8)); }
  writeQword(address: bigint, value: bigint) { for (let i = 0; i < 8; i++) this.writeByte(address + BigInt(i), Number(u64(value) >> BigInt(i * 8) & 255n)); }
  initialize(address: bigint, raw: Uint8Array) { for (let i = 0; i < raw.length; i++) this.writeByte(address + BigInt(i), raw[i]!); }
  read(address: bigint, count: number) { return Buffer.from(Array.from({ length: count }, (_, i) => this.readByte(address + BigInt(i)))); }
}
describe('original bounded scalar values with actual integer scanner semantics', () => {
  for (const row of reference.cases) it(row.name, () => {
    expect(['returned', 'runtime-required']).toContain(row.result.kind);
    const memory = new Memory();
    memory.initialize(0x830000n, new Uint8Array(0x30).fill(0xa7)); memory.initialize(0x860000n, new Uint8Array(32).fill(0xb3));
    for (const write of row.input.supplied) memory.initialize(BigInt(write.address), Buffer.from(write.bytes, 'hex'));
    memory.active = true;
    const scalar = new NativeScalarValues(memory);
    const actual = row.input.entry === '0x142547ce0' ? scalar.readInteger(0x830000n, 0x860000n) : scalar.readFixed(0x830000n, 0x860000n, 0x73f008n);
    const observed = JSON.parse(JSON.stringify(actual, (_, value: unknown) => typeof value === 'bigint' ? '0x' + value.toString(16) : value)) as unknown;
    expect(observed).toEqual(row.result.kind === 'returned' ? { kind: 'returned', value: row.result.al !== 0 } : row.result);
    expect(memory.read(0x860000n, 32).toString('hex')).toBe(row.outputHex);
    const expected: string[] = [];
    for (const [, , address, payload] of row.rawWrites) {
      const at = BigInt(address), raw = Buffer.from(payload, 'hex');
      for (let i = 0; i < raw.length; i++) if (semantic(at + BigInt(i))) expected.push(`w:${(at + BigInt(i)).toString(16)}:${raw[i]!.toString(16).padStart(2, '0')}`);
    }
    expect(memory.trace).toEqual(expected);
  });
});
