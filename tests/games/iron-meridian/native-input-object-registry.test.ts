import { gunzipSync } from 'node:zlib';
import { NativeKeywordRegistry } from '../../../src/games/iron-meridian/native/keyword-registry';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NativeInputObject } from '../../../src/games/iron-meridian/native/input-object';
import type { InputObjectServices } from '../../../src/games/iron-meridian/native/input-object';
import type { NativeStreamConstructionDependencies, NativeStreamConstructionMemory } from '../../../src/games/iron-meridian/native/engine-construction';
import { NativeCharacterReader } from '../../../src/games/iron-meridian/native/character-reader';
import { NativeReaderLifetime } from '../../../src/games/iron-meridian/native/reader-lifetime';
type Write = { address: string; bytes: string };
type Reply = { value?: string; data?: string; type?: number; writes?: Write[] };
type Allocation = { address: string; size: number; live: boolean };
type Input = { memoryWrites: Write[]; responses: Record<string, Reply[]>; missing: [string, number][]; constructStream: boolean; mode: number; bom: number; buffer: number; readCount: number; destroy: boolean; workspace: { stackHeader: string; pathPointer: string; stat: string }; snapshots: { address: string; size: number }[] };
type Expected = { results: unknown[]; reader: string; calls: unknown[]; snapshots: Write[]; allocations: (Allocation & { bytes: string })[]; traceSha256: string; traceCount: number };
const reference = JSON.parse(gunzipSync(readFileSync(new URL('../../../work/iron-meridian/native-input-object/registry-reference.json.gz', import.meta.url))).toString('utf8')) as { cases: { name: string; input: Input; expected: Expected }[] };
const identity = JSON.parse(readFileSync(new URL('../../../work/iron-meridian/native-input-object/instructions-registry.json', import.meta.url), 'utf8')) as { data: Write[] };
const ENTRY=0x410008n, OBJECT=0x2d0000n, CHILD=ENTRY-0x90n, STREAM=ENTRY-0x58n, RECORD=0x2a2000n;
const u64 = (v: bigint) => BigInt.asUintN(64, v), hex = (v: bigint) => '0x' + u64(v).toString(16);
const normalized = (value: unknown): unknown => JSON.parse(JSON.stringify(value, (_, v: unknown) => typeof v === 'bigint' ? hex(v) : v));
describe('original input object first registry population with10767constructed records', () => {
  for (const { name, input, expected } of reference.cases) it(name, () => {
    const pages=new Map<number,Uint8Array>(),calls:unknown[]=[],allocations:Allocation[]=[];
    const expectedTrace=gunzipSync(readFileSync(new URL('../../../work/iron-meridian/native-input-object/registry-trace.jsonl.gz',import.meta.url)));let tracePosition=0,traceCount=0;const traceHash=createHash('sha256');let traceBuffer='';
    const emit=(event:string)=>{const end=expectedTrace.indexOf(10,tracePosition);const nativeEvent=expectedTrace.subarray(tracePosition,end).toString('utf8');if(event!==nativeEvent)throw Error('First original event mismatch '+traceCount+' expected '+nativeEvent+' got '+event);tracePosition=end+1;traceCount++;traceBuffer+=event+'\n';if(traceBuffer.length>=1048576){traceHash.update(traceBuffer);traceBuffer='';}};

    let active = false, heap = 0x21000000n, phase = 'object', streamHomes=0;
    const semantic = (a: bigint) => {
      if (a < 0x3e0000n || a >= 0x420000n) return true;
      if(phase!=='reader'&&phase!=='registry'&&a>=STREAM&&a<ENTRY-0x20n)return true;
      if(phase==='object')return a>=ENTRY+8n&&a<ENTRY+16n||a===ENTRY-0x68n;
      const engine = CHILD - 0x190n;
      const ranges = phase === 'construction' ? [[engine - 0x178n, engine - 0x128n], [CHILD + 8n, CHILD + 16n], [CHILD - 0x48n, CHILD - 0x20n], [CHILD - 0x158n, CHILD - 0x138n], [CHILD - 0xd0n, CHILD - 0xb0n]] : phase === 'factory' ? [[CHILD + 8n, CHILD + 16n], [CHILD + 0x20n, CHILD + 0x28n], [CHILD - 0x88n, CHILD - 0x68n], [CHILD - 0x38n, CHILD - 0x37n]] : [];
      return ranges.some(([begin, end]) => a >= begin! && a < end!);
    };
    const getPage=(pointer:number)=>{const start=Math.floor(pointer/4096)*4096;let page=pages.get(start);if(!page){page=new Uint8Array(4096);if(start>=0x3e0000&&start<0x420000)page.fill(0xa7);pages.set(start,page);}return page;};
    const memory: NativeStreamConstructionMemory = {
      readByte(a){const pointer=Number(u64(a));return getPage(pointer)[pointer%4096]!;},
      readDword(a){let v=0;for(let i=0;i<4;i++)v+=this.readByte(a+BigInt(i))*2**(8*i);return v>>>0;},
      readQword(a){let v=0n;for(let i=0;i<8;i++)v|=BigInt(this.readByte(a+BigInt(i)))<<BigInt(8*i);return v;},
      writeByte(a,v){a=u64(a);if(active&&a===CHILD+8n){streamHomes++;if(streamHomes===2)phase='factory';}if(active&&a===OBJECT+8n)phase='object';const pointer=Number(a);getPage(pointer)[pointer%4096]=v&255;if(active&&semantic(a))emit(`w:${a.toString(16)}:${(v&255).toString(16).padStart(2,'0')}`);if(active&&a===ENTRY-0x68n)phase='construction';},
      writeDword(a,v){for(let i=0;i<4;i++)this.writeByte(a+BigInt(i),v>>>(8*i));},
      writeQword(a,v){for(let i=0;i<8;i++)this.writeByte(a+BigInt(i),Number(u64(v)>>BigInt(8*i)&255n));},
      writeBytes(a,payload){if(active){for(let i=0;i<payload.length;i++)this.writeByte(a+BigInt(i),payload[i]!);return;}let offset=0,pointer=Number(u64(a));while(offset<payload.length){const count=Math.min(4096-pointer%4096,payload.length-offset);getPage(pointer).set(payload.subarray(offset,offset+count),pointer%4096);pointer+=count;offset+=count;}},
    };
    const raw=(a:bigint,n:number)=>{const output=new Uint8Array(n);let offset=0,pointer=Number(u64(a));while(offset<n){const count=Math.min(4096-pointer%4096,n-offset);output.set(getPage(pointer).subarray(pointer%4096,pointer%4096+count),offset);offset+=count;pointer+=count;}return output;};
    const encode = (payload: Uint8Array) => Buffer.from(payload).toString('hex');
    const apply = (writes: readonly Write[]) => { for (const w of writes) memory.writeBytes(BigInt(w.address), Uint8Array.from(Buffer.from(w.bytes, 'hex'))); };
    const imageInputs=JSON.parse(gunzipSync(readFileSync(new URL('../../../work/iron-meridian/native-keyword-registry/image-inputs.json.gz',import.meta.url))).toString('utf8')) as Write[];const prestate=JSON.parse(gunzipSync(readFileSync(new URL('../../../work/iron-meridian/native-input-object/prepopulation.json.gz',import.meta.url))).toString('utf8')) as {regions:Write[]};apply(imageInputs);apply(identity.data);apply(prestate.regions);apply(input.memoryWrites);
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
      const call = { role, target: hex(target), arguments: args.map(hex), value: String(value), writes: effects }; calls.push(call); emit('c:' + JSON.stringify(call)); remove(role, index + 1); return value;
    };
    const dependencies: NativeStreamConstructionDependencies = {
      allocate: (t, n) => leaf('allocate', t, [n]), openRead: (t, opaque, p) => leaf('open', t, [opaque, p]), stat: (t, opaque, p, out) => Number(leaf('stat', t, [opaque, p, out])),
      comparePrefix1425ceb80: (a, b, n) => Number(leaf('compare', 0x1425ceb80n, [a, b, n])), findSlash1425c3c70: (p, b) => leaf('find-slash', 0x1425c3c70n, [p, BigInt(b)]), probeStack1425a07d0: n => { leaf('probe', 0x1425a07d0n, [n]); },
      lock1425a3b80: m => Number(leaf('lock', 0x1425a3b80n, [m])), unlock1425a3b88: m => { leaf('unlock', 0x1425a3b88n, [m]); }, free: (t, p) => { leaf('free', t, [p]); }, reallocate: (t, p, n) => leaf('reallocate', t, [p, n]),
      tell: (t, io) => leaf('tell', t, [io]), length: (t, io) => leaf('length', t, [io]), read: (t, io, p, n) => leaf('read', t, [io, p, n]), seek: (t, io, o) => Number(leaf('seek', t, [io, o])), destroy: (t, io) => { leaf('destroy', t, [io]); },
      copy1426079d0: (a, b, n) => { leaf('copy', 0x1426079d0n, [a, b, n]); }, crtAllocate: n => leaf('crt-allocate', 0x1425a01dcn, [n]), crtFree: p => { leaf('crt-free', 0x1425cec00n, [p]); },
    };
    const services: InputObjectServices = { file: dependencies, crtAllocate: n => leaf('crt-allocate', 0x1425a01dcn, [n]), crtFree: p => { leaf('crt-free', 0x1425cec00n, [p]); }, copy: dependencies.copy1426079d0, zero: (p, v, n) => { leaf('zero', 0x142608070n, [p, BigInt(v), n]); } };
    const bindings: [string, object, string][] = [['crt-allocate', dependencies, 'crtAllocate'], ['crt-allocate', services, 'crtAllocate'], ['crt-free', dependencies, 'crtFree'], ['crt-free', services, 'crtFree'], ['copy', dependencies, 'copy1426079d0'], ['copy', services, 'copy'], ['zero', services, 'zero'], ...['read', 'length', 'destroy','reallocate'].map(role => [role, dependencies, role] as [string, object, string])];
    removals.push(...bindings.map(([role, object, key]) => ({ role, object, key }))); for (const [role] of input.missing) remove(role, 0);
    active = true; const results: unknown[] = []; let reader = 0n, canContinue = true;
    class ObservedRegistry extends NativeKeywordRegistry{override populate(stack:bigint){phase='registry';const result=super.populate(stack);phase='object';return result;}}
    const registry=new ObservedRegistry(memory,{...services,registerExit:destructor=>leaf('register-exit',0x1425a0450n,[destructor])},0x100000n);
    const result=new NativeInputObject(memory,services,0x100000n,registry).construct(OBJECT,RECORD,input.mode,input.bom,ENTRY,{stackHeader:BigInt(input.workspace.stackHeader),pathPointer:BigInt(input.workspace.pathPointer),stat:BigInt(input.workspace.stat)});
    results.push(normalized(result));canContinue=result.kind==='returned';if(result.kind==='returned')reader=memory.readQword(OBJECT+8n);
    phase = 'reader'; const character = new NativeCharacterReader(memory, { get copy() { return services.copy; } });
    if (canContinue) for (let i = 0; i < input.readCount; i++) { const result = character.readByte(reader); results.push(normalized(result.kind === 'returned' ? { ...result, value: hex(BigInt(result.value)) } : result)); if (result.kind !== 'returned') { canContinue = false; break; } }
    if (canContinue && input.destroy) results.push(normalized(new NativeReaderLifetime(memory, { get crtFree() { return services.crtFree; } }).destroyReader(reader, 1)));
    expect(results).toEqual(expected.results); expect(hex(reader)).toBe(expected.reader); expect(calls).toEqual(expected.calls);
    for (const item of expected.snapshots) expect(encode(raw(BigInt(item.address), item.bytes.length / 2)), item.address).toBe(item.bytes);
    expect(allocations.map(a => ({ ...a, bytes: encode(raw(BigInt(a.address), a.size)) }))).toEqual(expected.allocations);
    traceHash.update(traceBuffer);const digest=traceHash.digest('hex');expect(tracePosition).toBe(expectedTrace.length);expect(traceCount).toBe(expected.traceCount);expect(digest).toBe(expected.traceSha256);
  },180000);
});
