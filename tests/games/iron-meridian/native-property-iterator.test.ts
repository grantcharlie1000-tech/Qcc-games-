import { NativePropertyIterator } from '../../../src/games/iron-meridian/native/property-iterator';
import type { InputObjectServices } from '../../../src/games/iron-meridian/native/input-object';
import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { NativeParserExtended } from '../../../src/games/iron-meridian/native/parser-extended';
import { NativeParserConstants } from '../../../src/games/iron-meridian/native/parser-constants';
import { NativeParserState } from '../../../src/games/iron-meridian/native/parser-state';
import { NativeTokenizer } from '../../../src/games/iron-meridian/native/tokenizer';
import type { TokenizerServices } from '../../../src/games/iron-meridian/native/tokenizer';
import { NativeKeywordRegistry } from '../../../src/games/iron-meridian/native/keyword-registry';
import type { CharacterReaderMemory } from '../../../src/games/iron-meridian/native/character-reader';

type Write = { address: string; bytes: string };
type Allocation = { address: string; bytes: number; live: boolean; phase: string; contents?: string };
type Call = { role: string; ordinal: number; arguments: string[]; value: string; before?: { sourceWord: string; outputWord: string } };
type Fixture = { name: string; input: { payload: string; strict: number; operations: number; capacity?: number; sourceAddress?: string; changes?: Write[]; parserChanges?: Write[]; missing?: [string, number][]; iterationChanges?: Write[]; responses?: { role: string; ordinal: number; writes?: Write[]; value?: string }[]; wideReplies?: { output?: number; value?: string; writes?: Write[] }[] }; result: {kind: string}; initial: Write[]; snapshots: Write[]; allocations: Allocation[]; definition: string; parser: string; calls: Call[]; rawOperations: (['w', string, string, string] | ['c', Call] | ['frame', ...string[]])[] };
const reference = JSON.parse(gunzipSync(readFileSync(new URL('../../../work/iron-meridian/native-property-iterator/original-reference.json.gz', import.meta.url))).toString()) as { cases: Fixture[] };

const identity = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-tokenizer/instructions.json', import.meta.url), 'utf8')) as { data: Write[] };
const image = JSON.parse(gunzipSync(readFileSync(new URL('../../../work/iron-meridian/native-keyword-registry/image-inputs.json.gz', import.meta.url))).toString()) as { address: string; bytes: string; virtualBytes: number }[];
const warm = JSON.parse(gunzipSync(readFileSync(new URL('../../../work/iron-meridian/native-keyword-registry/warm-state.json.gz', import.meta.url))).toString()) as { metadata: { heapNext: string }; regions: Write[]; allocationLedger: Allocation[] };
const u64 = (v: bigint) => BigInt.asUintN(64, v), hex = (v: bigint) => '0x' + u64(v).toString(16);
const INPUT = 0x800100n, READER = 0x800300n, VECTOR = 0x800400n, SOURCE = 0x810000n, TOKEN_BYTES = 0x820000n, API = 0x6000100n;
const ENTRY = 0x73f008n;
const PARSER = 0x830000n, OTHER = 0x840000n;
class Memory implements CharacterReaderMemory {
  readonly pages: Map<number, Uint8Array>; private readonly owned = new Set<number>();
  active = false; trace: string[] = [];
  constructor(base?: Memory) { this.pages = base ? new Map(base.pages) : new Map(); }
  map(address: bigint, count: number, fill = 0) { const first = Math.floor(Number(address) / 4096), end = Math.ceil((Number(address) + count) / 4096); for (let p = first; p < end; p++) if (!this.pages.has(p)) { this.pages.set(p, new Uint8Array(4096).fill(fill)); this.owned.add(p); } }
  readByte(address: bigint) { const a = Number(u64(address)), page = this.pages.get(Math.floor(a / 4096)); if (!page) throw Error('Unmapped read ' + hex(address)); return page[a % 4096]!; }
  read(address: bigint, count: number) { return Uint8Array.from({ length: count }, (_, i) => this.readByte(address + BigInt(i))); }
  readDword(address: bigint) { let v = 0; for (let i = 0; i < 4; i++) v |= this.readByte(address + BigInt(i)) << (i * 8); return v >>> 0; }
  readQword(address: bigint) { let v = 0n; for (let i = 0; i < 8; i++) v |= BigInt(this.readByte(address + BigInt(i))) << BigInt(i * 8); return v; }
  semantic(a: bigint) { const sp = ENTRY - 0x288n; return a < 0x700000n || a >= 0x740000n || (a >= sp + 0x30n && a < sp + 0x98n) || (a >= sp + 0xa0n && a < sp + 0xe8n) || (a >= sp + 0xf0n && a < sp + 0x138n); }
  writeByte(address: bigint, value: number) {
    address = u64(address); const a = Number(address), p = Math.floor(a / 4096); let page = this.pages.get(p); if (!page) throw Error('Unmapped write ' + hex(address));
    if (!this.owned.has(p)) { page = page.slice(); this.pages.set(p, page); this.owned.add(p); }
    page[a % 4096] = value & 255;
    if (this.active && this.semantic(address)) this.trace.push(`w:${address.toString(16)}:${(value & 255).toString(16).padStart(2, '0')}`);
  }
  writeDword(address: bigint, value: number) { for (let i = 0; i < 4; i++) this.writeByte(address + BigInt(i), value >>> (i * 8)); }
  writeQword(address: bigint, value: bigint) { for (let i = 0; i < 8; i++) this.writeByte(address + BigInt(i), Number(u64(value) >> BigInt(i * 8) & 255n)); }
  writeBytes(address: bigint, bytes: Uint8Array) { for (let i = 0; i < bytes.length; i++) this.writeByte(address + BigInt(i), bytes[i]!); }
  apply(writes: readonly Write[]) { for (const w of writes) this.writeBytes(BigInt(w.address), Buffer.from(w.bytes, 'hex')); }
}
const base = new Memory();
for (const section of image) { base.map(BigInt(section.address), section.virtualBytes); base.writeBytes(BigInt(section.address), Buffer.from(section.bytes, 'hex')); }
for (const [a, n, fill] of [[0x700000n, 0x40000, 0xa7], [0x800000n, 0x200000, 0xa7], [0x20000000n, 0x1000000, 0xb3], [0x100000n, 4096, 0], [0x110000n, 4096, 0], [0x120000n, 0x3000, 0]] as const) base.map(a, n, fill);
for (const write of [...identity.data, ...warm.regions]) { base.map(BigInt(write.address), write.bytes.length / 2); base.apply([write]); }
const readerVtable = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-reader-lifetime/instructions.json', import.meta.url), 'utf8')) as { data: Write[] };
base.apply(readerVtable.data.filter(w => w.address === '0x142c06c80'));
const q = (address: bigint, value: bigint): Write => { const raw = Buffer.alloc(8); raw.writeBigUInt64LE(u64(value)); return { address: hex(address), bytes: raw.toString('hex') }; };
const d = (address: bigint, value: number): Write => { const raw = Buffer.alloc(4); raw.writeUInt32LE(value >>> 0); return { address: hex(address), bytes: raw.toString('hex') }; };

describe('actual property iterator composed with reviewed parser and technology fields', () => {
  for (const fixture of reference.cases) it(fixture.name, () => {
    const row = fixture.input, memory = new Memory(base), payload = Buffer.from(row.payload, 'hex'), sourceAddress = BigInt(row.sourceAddress ?? hex(SOURCE));
    const initial = [{ address: hex(INPUT), bytes: '00'.repeat(104) }, q(INPUT, 0x142c04da0n), q(INPUT + 8n, READER), q(INPUT + 0x20n, TOKEN_BYTES), d(INPUT + 0x28n, row.capacity ?? 256), d(INPUT + 0x2cn, 0), q(INPUT + 0x30n, 0x1430fd000n), { address: hex(READER), bytes: '00'.repeat(88) }, q(READER, 0x142c06c80n), d(READER + 8n, 1), q(READER + 0x38n, VECTOR), q(VECTOR, sourceAddress), d(VECTOR + 8n, payload.length), d(VECTOR + 12n, payload.length), { address: hex(sourceAddress), bytes: row.payload }, q(0x142785228n, API)];
    memory.apply(initial); memory.apply(row.changes ?? []); memory.writeQword(INPUT, 0x142c04da0n);
    let heap = BigInt(warm.metadata.heapNext), apiOrdinal = 0;
    const allocations = warm.allocationLedger.map(a => ({ ...a })), calls: Call[] = [], counters = new Map<string, number>();
    allocations.push({ address: hex(TOKEN_BYTES), bytes: 320, live: true, phase: 'supplied-token-buffer' });
    const invoke = (role: string, args: bigint[]) => {
      const ordinal = counters.get(role) ?? 0; counters.set(role, ordinal + 1); let value = 0n;
      if (role === 'crtAllocate') { const count = args[0]!; expect(count).toBeGreaterThan(0n); expect(count).toBeLessThan(0x800000n); value = heap; heap += BigInt((Number(count) + 31) & ~31); allocations.push({ address: hex(value), bytes: Number(count), live: true, phase: 'technology-property-iteration' }); }
      if (role === 'crtFree') { const allocation = allocations.find(a => a.address === hex(args[0]!) && a.live); if (!allocation) throw Error('Unknown free ' + hex(args[0]!)); allocation.live = false; }
      if (role === 'copy') { expect(args[2]!).toBeLessThan(0x800000n); memory.writeBytes(args[0]!, memory.read(args[1]!, Number(args[2]!))); value = args[0]!; }
      for (const response of row.responses ?? []) if (response.role === role && response.ordinal === ordinal) { memory.apply(response.writes ?? []); if (response.value !== undefined) value = BigInt(response.value); }
      const call = { role, ordinal, arguments: args.map(hex), value: hex(value) }; calls.push(call); memory.trace.push('c:' + JSON.stringify(call)); return value;
    };
    const missing = (role: string) => row.missing?.some(([r, index]) => r === role && index === (counters.get(role) ?? 0));
    const services: TokenizerServices & InputObjectServices = { file: {},
      get crtAllocate() { return missing('crtAllocate') ? undefined : (count: bigint) => invoke('crtAllocate', [count]); },
      get crtFree() { return missing('crtFree') ? undefined : (pointer: bigint) => { invoke('crtFree', [pointer]); }; },
      get copy() { return missing('copy') ? undefined : (destination: bigint, source: bigint, count: bigint) => { invoke('copy', [destination, source, count]); }; },
      get getStringTypeW() {
        if (row.missing?.some(([role, index]) => role === 'getStringTypeW' && index === apiOrdinal)) return undefined;
        return { address: API, call(informationType: number, source: bigint, count: number, output: bigint) {
          const ordinal = apiOrdinal++, reply = row.wideReplies?.[ordinal]; if (!reply) throw Error('Missing declared wide reply');
          const before = { sourceWord: Buffer.from(memory.read(source, 2)).toString('hex'), outputWord: Buffer.from(memory.read(output, 2)).toString('hex') };
          memory.writeByte(output, (reply.output ?? 0) & 255); memory.writeByte(output + 1n, (reply.output ?? 0) >>> 8); memory.apply(reply.writes ?? []);
          const value = BigInt(reply.value ?? '0x1'), call = { role: 'getStringTypeW', ordinal, arguments: [BigInt(informationType), source, BigInt(count), output].map(hex), value: hex(value), before }; calls.push(call); memory.trace.push('c:' + JSON.stringify(call)); return value;
        } };
      },
    };
    const state = new NativeParserState(memory, services, 0x100000n); expect(state.construct(PARSER, INPUT).kind).toBe('returned');
    memory.writeBytes(OTHER, memory.read(INPUT, 104)); memory.writeBytes(OTHER + 0x300n, memory.read(READER, 88)); memory.writeQword(OTHER + 8n, OTHER + 0x300n); memory.apply(row.parserChanges ?? []);
    const DEFINITION = 0x850000n;
    memory.writeBytes(DEFINITION, new Uint8Array(0x600)); memory.writeQword(DEFINITION, 0x1429b9f10n); memory.writeQword(DEFINITION + 0x580n, 15n);
    memory.writeBytes(READER + 0x18n, Buffer.from('fixture.txt\0')); memory.writeQword(READER + 0x28n, 11n); memory.writeQword(READER + 0x30n, 15n); memory.writeDword(READER + 8n, 27);
    memory.apply(row.iterationChanges ?? []);
    calls.length = 0; counters.clear(); memory.trace.length = 0; const initialCount = allocations.length;
    const registry = new NativeKeywordRegistry(memory, services, 0x100000n), tokenizer = new NativeTokenizer(memory, services, registry), constants = new NativeParserConstants(memory, services, tokenizer, 0x100000n), parser = new NativeParserExtended(memory, services, tokenizer, constants);
    const iterator = new NativePropertyIterator(memory, services, tokenizer, constants, parser, 0x100000n);
    expect(fixture.initial.map(w => ({ address: w.address, bytes: Buffer.from(memory.read(BigInt(w.address), w.bytes.length / 2)).toString('hex') }))).toEqual(fixture.initial);
    memory.active = true; const rawResult = iterator.begin(DEFINITION, PARSER, ENTRY);
    const result = JSON.parse(JSON.stringify(rawResult, (_key, value: unknown) => typeof value === 'bigint' ? hex(value) : value)) as unknown;
    const expectedTrace: string[] = [];
    for (const event of fixture.rawOperations) {
      if (event[0] === 'c') expectedTrace.push('c:' + JSON.stringify(event[1]));
      if (event[0] === 'w') {
        const address = BigInt(event[2]), bytes = Buffer.from(event[3], 'hex');
        for (let i = 0; i < bytes.length; i++) if (memory.semantic(address + BigInt(i))) expectedTrace.push(`w:${(address + BigInt(i)).toString(16)}:${bytes[i]!.toString(16).padStart(2, '0')}`);
      }
    }
    const snapshots = fixture.snapshots.map(w => ({ address: w.address, bytes: Buffer.from(memory.read(BigInt(w.address), w.bytes.length / 2)).toString('hex') }));
    const newAllocations = allocations.slice(initialCount).map(a => ({ ...a, contents: Buffer.from(memory.read(BigInt(a.address), a.bytes)).toString('hex') }));
    const actual = { result, definition: Buffer.from(memory.read(DEFINITION, 0x600)).toString('hex'), parser: Buffer.from(memory.read(PARSER, 0x150)).toString('hex'), calls, trace: memory.trace, snapshots, allocations: newAllocations };
    const expected = { result: fixture.result, definition: fixture.definition, parser: fixture.parser, calls: fixture.calls, trace: expectedTrace, snapshots: fixture.snapshots, allocations: fixture.allocations };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) writeFileSync(new URL('../../../work/iron-meridian/native-iteration-integration/draft-' + fixture.name + '.json', import.meta.url), JSON.stringify({actual, expected}, null, 2));
    expect(actual).toEqual(expected);
  }, 120000);
});
