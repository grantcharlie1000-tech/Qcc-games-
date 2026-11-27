import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { NativeKeywordRegistry } from '../../../src/games/iron-meridian/native/keyword-registry';
import type { KeywordRegistryMemory, KeywordRegistryServices } from '../../../src/games/iron-meridian/native/keyword-registry';
import { NativeKeywordInitialization } from '../../../src/games/iron-meridian/native/keyword-initialization';
import type { GeneratedKeywordPlan } from '../../../src/games/iron-meridian/native/keyword-initialization';

const HERE = fileURLToPath(new URL('../../../work/iron-meridian/native-keyword-registry/', import.meta.url));
type Section = { address: string; bytes: string; virtualBytes: number };
type Allocation = { address: string; bytes: number; live: boolean; phase: string; contents: string };
type Call = { role: string; ordinal: number; arguments: string[]; value: string };
type Query = { queryHex: string; expected: { kind: string; id?: number; exit: string; normalizedHex: string; lockWords: string } };
type State = { phases: { phase: string; result: unknown }[]; hashHeader: string; hashBuckets: { address: string; bytes: string }; reverseHeader: string; reverseStrings: string[]; records: string; globals: string; allocations: Allocation[]; queries: Query[]; calls: Call[] };
type Write = { address: string; bytes: string };
type Probe = { name: string; operation: string; changes: Write[]; hash?: number; queryHex?: string; initialAllocation?: boolean; suppliedAllocations?: Allocation[]; captureAtService?: { role: string; ordinal: number; ranges: { address: string; bytes: number }[] }; missing?: [string, number][]; responses?: { role: string; ordinal: number; writes?: Write[]; value?: string }[]; expected: { result: unknown; calls: Call[]; allocations: Allocation[]; snapshots: Write[]; serviceCaptures: Write[]; trace: (['w', string, string, string] | ['c', Call])[] } };
const hex = (v: bigint) => '0x' + BigInt.asUintN(64, v).toString(16);
class Memory implements KeywordRegistryMemory {
  readonly pages = new Map<number, Uint8Array>();
  active = false; trace: (string | Call)[] = []; readonly digest = createHash('sha256'); eventCount = 0;
  constructor(readonly retainTrace = false) {}
  event(value: string | Call) { this.digest.update((typeof value === 'string' ? value : 'c:' + JSON.stringify(value)) + '\n'); this.eventCount++; if (this.retainTrace) this.trace.push(value); }
  map(a: bigint, n: number, fill = 0) {
    const first = Math.floor(Number(a) / 4096), last = Math.ceil((Number(a) + n) / 4096);
    for (let p = first; p < last; p++) if (!this.pages.has(p)) this.pages.set(p, new Uint8Array(4096).fill(fill));
  }
  readByte(a: bigint) { const n = Number(BigInt.asUintN(64, a)), page = this.pages.get(Math.floor(n / 4096)); if (!page) throw Error(`Unmapped ${hex(a)}`); return page[n % 4096]; }
  read(a: bigint, n: number) { return Uint8Array.from({ length: n }, (_, i) => this.readByte(a + BigInt(i))); }
  scalar(a: bigint, n: number) { let v = 0n; for (let i = n - 1; i >= 0; i--) v = v << 8n | BigInt(this.readByte(a + BigInt(i))); return v; }
  readDword(a: bigint) { return Number(this.scalar(a, 4)); } readQword(a: bigint) { return this.scalar(a, 8); }
  write(a: bigint, payload: Uint8Array) {
    for (let i = 0; i < payload.length; i++) {
      const address = a + BigInt(i), n = Number(address), page = this.pages.get(Math.floor(n / 4096)); if (!page) throw Error(`Unmapped write ${hex(address)}`); page[n % 4096] = payload[i];
      if (this.active && !(address >= 0x700000n && address < 0x740000n)) this.event(`w:${address.toString(16)}:${payload[i].toString(16).padStart(2, '0')}`);
    }
  }
  store(a: bigint, v: bigint, n: number) { this.write(a, Uint8Array.from({ length: n }, (_, i) => Number(v >> BigInt(i * 8) & 255n))); }
  writeByte(a: bigint, v: number) { this.store(a, BigInt(v & 255), 1); } writeDword(a: bigint, v: number) { this.store(a, BigInt(v >>> 0), 4); } writeQword(a: bigint, v: bigint) { this.store(a, BigInt.asUintN(64, v), 8); }
  stringObject(a: bigint) { const n = Number(this.readQword(a + 16n)), pointer = this.readQword(a + 24n) > 15n ? this.readQword(a) : a; if (n >= 0x100000) throw Error('String bound'); return Buffer.from(this.read(pointer, n)).toString('hex'); }
}

it('constructs the complete original registry and resolves every original record through the bounded lookup', async () => {
  const state = JSON.parse(gunzipSync(readFileSync(HERE + 'state.json.gz')).toString()) as State;
  const image = JSON.parse(gunzipSync(readFileSync(HERE + 'image-inputs.json.gz')).toString()) as Section[];
  const identity = JSON.parse(readFileSync(HERE + 'instructions.json', 'utf8')) as { data: { address: string; bytes: string }[] };
  const plan = JSON.parse(readFileSync(HERE + '../native-keyword-initialization/plan.json', 'utf8')) as GeneratedKeywordPlan;
  const memory = new Memory();
  for (const section of image) { memory.map(BigInt(section.address), section.virtualBytes); memory.write(BigInt(section.address), Buffer.from(section.bytes, 'hex')); }
  for (const item of identity.data) { memory.map(BigInt(item.address), item.bytes.length / 2); memory.write(BigInt(item.address), Buffer.from(item.bytes, 'hex')); }
  for (const [address, count, fill] of [[0x700000n, 0x40000, 0xa7], [0x100000n, 4096, 0], [0x110000n, 4096, 0], [0x120000n, 0x3000, 0], [0x20000000n, 0x1000000, 0xb3], [0x680000n, 0x10000, 0]] as const) memory.map(address, count, fill);
  memory.writeQword(0x100058n, 0x110000n); memory.writeQword(0x110000n, 0x120000n); memory.writeDword(0x1220ecn, 0); memory.writeDword(0x143693a98n, 0); memory.writeDword(0x1433dd120n, 0); memory.writeDword(0x143694cccn, 0);
  let heap = 0x20000000n, phase = 'record-array-allocator';
  const calls: Call[] = [], allocations: Allocation[] = [], counts = new Map<string, number>();
  const call = (role: string, args: bigint[]) => {
    const ordinal = counts.get(role) ?? 0; counts.set(role, ordinal + 1); let value = 0n;
    if (role === 'stackProbe') value = args[0];
    else if (role === 'crtAllocate') { const n = Number(args[0]); if (n <= 0 || n >= 0x800000 || heap + args[0] >= 0x21000000n) throw Error('Allocation bound'); value = heap; heap += BigInt((n + 31) & ~31); allocations.push({ address: hex(value), bytes: n, live: true, phase, contents: '' }); }
    else if (role === 'crtFree') { const row = allocations.find(a => a.address === hex(args[0]) && a.live); if (!row) throw Error(`Unknown free ${hex(args[0])}`); row.live = false; }
    else if (role === 'copy') { if (args[2] >= 0x800000n) throw Error('Copy bound'); memory.write(args[0], memory.read(args[1], Number(args[2]))); value = args[0]; }
    const row = { role, ordinal, arguments: args.map(hex), value: hex(value) }; calls.push(row); if (memory.active) memory.event(row); return value;
  };
  const services: KeywordRegistryServices & { stackProbe(bytes: bigint): void } = { crtAllocate: n => call('crtAllocate', [n]), crtFree: p => { call('crtFree', [p]); }, copy: (a, b, n) => { call('copy', [a, b, n]); }, registerExit: p => call('registerExit', [p]), stackProbe: n => { call('stackProbe', [n]); } };
  const registry = new NativeKeywordRegistry(memory, services, 0x100000n);
  memory.active = true;
  expect(registry.initializeRecordArrayAllocator()).toEqual({ kind: 'returned', value: 0n }); phase = 'reverse-array-allocator';
  expect(registry.initializeReverseArrayAllocator()).toEqual({ kind: 'returned', value: 0n }); phase = 'generated-records';
  expect(new NativeKeywordInitialization(memory, services, 0x100000n, plan).run(0x73f008n)).toEqual({ kind: 'returned', value: 0n, enteredRecords: 10767, completedRecords: 10767 }); phase = 'registry-population';
  expect(registry.populate(0x73f008n)).toEqual({ kind: 'complete' }); phase = 'once-guard';
  expect(registry.populate(0x73f008n)).toEqual({ kind: 'complete' });
  const summary = JSON.parse(readFileSync(HERE + 'trace-summary.json', 'utf8')) as { nonStackByteEvents: number; orderedNonStackSha256: string };
  expect(memory.eventCount).toBe(summary.nonStackByteEvents); expect(memory.digest.digest('hex')).toBe(summary.orderedNonStackSha256);
  await new Promise(resolve => setTimeout(resolve, 0));
  memory.active = false; memory.trace = [];
  for (const [queryIndex, query] of state.queries.entries()) {
    if (queryIndex % 1000 === 0) await new Promise(resolve => setTimeout(resolve, 0));
    phase = 'lookup'; memory.write(0x680000n, Buffer.concat([Buffer.from(query.queryHex, 'hex'), Buffer.from([0])]));
    const result = registry.lookupCString(0x680000n, 0x720000n, 0x720100n);
    const expected = query.expected.kind === 'matched' ? { kind: 'matched', id: query.expected.id, exit: BigInt(query.expected.exit) } : { kind: 'miss', exit: BigInt(query.expected.exit) };
    expect(result, query.queryHex).toEqual(expected);
    expect(memory.stringObject(0x720030n)).toBe(query.expected.normalizedHex); expect(Buffer.from(memory.read(0x14368f598n, 8)).toString('hex')).toBe(query.expected.lockWords);
    phase = 'query-string-cleanup'; expect(registry.destroyLookupString(0x720000n)).toEqual({ kind: 'complete' });
  }
  expect(calls).toEqual(state.calls);
  for (const allocation of allocations) allocation.contents = Buffer.from(memory.read(BigInt(allocation.address), allocation.bytes)).toString('hex');
  expect(allocations).toEqual(state.allocations);
  const raw = (a: bigint, n: number) => Buffer.from(memory.read(a, n)).toString('hex');
  expect(raw(0x14313f738n, 40)).toBe(state.hashHeader); expect(raw(BigInt(state.hashBuckets.address), state.hashBuckets.bytes.length / 2)).toBe(state.hashBuckets.bytes);
  expect(raw(0x14368f5a0n, 24)).toBe(state.reverseHeader); expect(raw(0x14343af20n, 10767 * 72)).toBe(state.records); expect(raw(0x14368f570n, 0x50)).toBe(state.globals);
  const reverse = memory.readQword(0x14368f5a0n); expect(state.reverseStrings.map((_, i) => memory.stringObject(reverse + BigInt(i) * 32n))).toEqual(state.reverseStrings);
  writeFileSync(new URL('../../../work/iron-meridian/native-parser-integration/registry-actual-summary.json', import.meta.url), JSON.stringify({ queries: state.queries.length, allocations: allocations.length, liveAllocations: allocations.filter(a => a.live).length, callCount: calls.length, nonStackTraceEvents: summary.nonStackByteEvents, sourceSha256: createHash('sha256').update(readFileSync(HERE + 'keyword-registry.ts')).digest('hex') }, null, 2) + '\n');
}, 120000);

const probeReference = JSON.parse(gunzipSync(readFileSync(HERE + 'probes.json.gz')).toString()) as { metadata: { baseInputs: Write[] }; cases: Probe[] };
for (const fixture of probeReference.cases) it(fixture.name, () => {
  const memory = new Memory(true), calls: Call[] = [], allocations: Allocation[] = [], counters = new Map<string, number>(), captures: Write[] = []; let heap = 0x20000000n;
  for (const [a, n, fill] of [[0x700000n, 0x40000, 0xa7], [0x100000n, 4096, 0], [0x110000n, 4096, 0], [0x120000n, 0x3000, 0], [0x20000000n, 0x1000000, 0xb3], [0x680000n, 0x10000, 0], [0x690000n, 0x10000, 0], [0x143693000n, 0x3000, 0], [0x1433dd000n, 4096, 0], [0x14368f000n, 4096, 0]] as const) memory.map(a, n, fill);
  const apply = (rows: readonly Write[]) => { for (const row of rows) { const p = BigInt(row.address), payload = Buffer.from(row.bytes, 'hex'); memory.map(p, payload.length); memory.write(p, payload); } };
  apply(probeReference.metadata.baseInputs); memory.writeQword(0x100058n, 0x110000n); memory.writeQword(0x110000n, 0x120000n); apply(fixture.changes);
  if (fixture.initialAllocation) allocations.push({ address: '0x690000', bytes: 14 * 48, live: true, phase: 'supplied-initial-state', contents: '' });
  allocations.push(...(fixture.suppliedAllocations ?? []).map(row => ({ ...row, contents: '' })));
  const services: KeywordRegistryServices = {};
  const service = (role: string, args: bigint[]) => {
    const ordinal = counters.get(role) ?? 0; counters.set(role, ordinal + 1); let value = 0n;
    if (fixture.captureAtService?.role === role && fixture.captureAtService.ordinal === ordinal) for (const range of fixture.captureAtService.ranges) captures.push({ address: range.address, bytes: Buffer.from(memory.read(BigInt(range.address), range.bytes)).toString('hex') });
    if (role === 'crtAllocate') { value = heap; heap += BigInt((Number(args[0]) + 31) & ~31); allocations.push({ address: hex(value), bytes: Number(args[0]), live: true, phase: fixture.operation, contents: '' }); }
    else if (role === 'copy') { memory.write(args[0], memory.read(args[1], Number(args[2]))); value = args[0]; }
    else if (role === 'crtFree') { const row = allocations.find(x => x.address === hex(args[0]) && x.live); if (!row) throw Error('Unknown free'); row.live = false; }
    for (const response of fixture.responses ?? []) if (response.role === role && response.ordinal === ordinal) { apply(response.writes ?? []); if (response.value !== undefined) value = BigInt(response.value); }
    const row = { role, ordinal, arguments: args.map(hex), value: hex(value) }; calls.push(row); memory.event(row);
    if ((fixture.missing ?? []).some(([r, n]) => r === role && n === ordinal + 1)) delete services[role as keyof KeywordRegistryServices];
    return value;
  };
  Object.assign(services, { crtAllocate: (n: bigint) => service('crtAllocate', [n]), crtFree: (p: bigint) => { service('crtFree', [p]); }, copy: (a: bigint, b: bigint, n: bigint) => { service('copy', [a, b, n]); }, registerExit: (p: bigint) => service('registerExit', [p]) });
  for (const [role, ordinal] of fixture.missing ?? []) if (ordinal === 0) delete services[role as keyof KeywordRegistryServices];
  const registry = new NativeKeywordRegistry(memory, services, 0x100000n); let result: unknown;
  if (fixture.operation === 'lookup') memory.write(0x680000n, Buffer.concat([Buffer.from(fixture.queryHex!, 'hex'), Buffer.from([0])]));
  if (fixture.operation === 'insert' || fixture.operation === 'move-insert') memory.writeQword(0x73f030n, 0x690b00n);
  memory.active = true;
  switch (fixture.operation) {
    case 'normalize': result = registry.normalize(0x690800n); break;
    case 'compare': result = registry.compare(0x690800n, 0x690820n); break;
    case 'lookup': result = registry.lookupCString(0x680000n, 0x720000n, 0x720100n); break;
    case 'lookup-normalized': result = registry.lookupNormalized(0x720000n, 0x720100n); break;
    case 'insert': result = registry.insert(0x14313f738n, 0x690a00n, fixture.hash!, 0x690800n, 0x73f008n); break;
    case 'move-insert': result = registry.insertMoved(0x14313f738n, 0x690a00n, fixture.hash!, 0x690800n, 0x73f008n); break;
    case 'record-array': result = registry.initializeRecordArrayAllocator(); break;
    case 'reverse-array': result = registry.initializeReverseArrayAllocator(); break;
    case 'populate': result = registry.populate(0x73f008n); break;
    case 'destroy': result = registry.destroyLookupString(0x720000n); break;
    default: throw Error('Unknown operation');
  }
  const comparable = JSON.parse(JSON.stringify(result, (_key, value: unknown) => typeof value === 'bigint' ? hex(value) : value));
  expect(comparable).toEqual(fixture.expected.result); expect(calls).toEqual(fixture.expected.calls);
  const trace: (string | Call)[] = [];
  for (const row of fixture.expected.trace) if (row[0] === 'c') trace.push(row[1]); else for (const [i, byte] of Buffer.from(row[3], 'hex').entries()) trace.push(`w:${(BigInt(row[2]) + BigInt(i)).toString(16)}:${byte.toString(16).padStart(2, '0')}`);
  expect(memory.trace).toEqual(trace);
  for (const row of allocations) row.contents = Buffer.from(memory.read(BigInt(row.address), row.bytes)).toString('hex');
  expect(allocations).toEqual(fixture.expected.allocations); expect(captures).toEqual(fixture.expected.serviceCaptures);
  for (const row of fixture.expected.snapshots) expect(Buffer.from(memory.read(BigInt(row.address), row.bytes.length / 2)).toString('hex'), row.address).toBe(row.bytes);
});
