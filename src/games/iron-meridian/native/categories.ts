import { DatabasePrimitiveStop, NativeDatabasePrimitives } from './database-primitives';
import { NativeInputObject } from './input-object';
import { NativeTechnologyCategoryField } from './category-field';
import { NativeScalarValues } from './scalar-values';
import { NativeScalarWrappers, NativeTechnologyNumericFields } from './scalar-wrappers';
import type { InputObjectMemory, InputObjectServices } from './input-object';
import type { NativeTokenizer } from './tokenizer';
import type { NativeParserConstants, ParserConstantsServices } from './parser-constants';
import type { NativeParserExtended } from './parser-extended';
import { NativeTechnologyFields } from './technology-fields';
import type { TechnologyFieldResult } from './technology-fields';

export type PropertyIteratorResult = TechnologyFieldResult;
type RuntimeStop = Exclude<PropertyIteratorResult, { kind: 'complete' }>;
class Stop { constructor(readonly result: RuntimeStop) {} }
const u64 = (v: bigint) => BigInt.asUintN(64, v);

/** Actual 142541100 composed with reviewed Boolean and two numeric technology branches. */
export class NativeTechnologyCategories {
  private readonly categories: NativeTechnologyCategoryField;
  private readonly fields: NativeTechnologyFields;
  private readonly numeric: NativeTechnologyNumericFields;
  constructor(private readonly memory: InputObjectMemory, private readonly services: ParserConstantsServices & InputObjectServices,
    private readonly tokenizer: NativeTokenizer, private readonly constants: NativeParserConstants,
    private readonly parser: NativeParserExtended, private readonly gsBase: bigint, private readonly loopBudget = 1_000_000) {
    this.categories = new NativeTechnologyCategoryField(memory, services, tokenizer, constants, parser, gsBase);
    this.fields = new NativeTechnologyFields(memory, services, gsBase);
    this.numeric = new NativeTechnologyNumericFields(new NativeScalarWrappers(new NativeScalarValues(memory), constants));
  }
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private d(a: bigint) { return this.memory.readDword(u64(a)) >>> 0; }
  private int(a: bigint) { return this.d(a) | 0; }
  private b(a: bigint) { return this.memory.readByte(u64(a)) & 255; }
  private wb(a: bigint, v: number) { this.memory.writeByte(u64(a), v & 255); }
  private wd(a: bigint, v: number) { this.memory.writeDword(u64(a), v >>> 0); }
  private wq(a: bigint, v: bigint) { this.memory.writeQword(u64(a), u64(v)); }
  private stop(boundary: string, nativeAddress: bigint, callSite: bigint): never { throw new Stop({ kind: 'runtime-required', boundary, nativeAddress, callSite }); }
  private accept(result: { kind: string }) { if (result.kind !== 'returned' && result.kind !== 'complete') throw new Stop(result as RuntimeStop); }
  private backing(a: bigint, site: bigint) {
    const target = this.q(this.q(a) + 0x38n);
    if (target === 0x1401693c0n) return this.q(a + 0x20n);
    if (target === 0x140169400n) return this.q(a + 0x48n);
    if (!this.services.allocatorGetter) this.stop('allocator-getter', target, site);
    return u64(this.services.allocatorGetter(target, a));
  }
  private release(a: bigint, p: bigint, site: bigint): void {
    const target = this.q(this.q(a) + 0x10n);
    if (target === 0x140122500n) {
      if (p !== u64(a + 8n)) this.release(this.backing(a, 0x140122515n), p, 0x140122526n);
    } else if (target === 0x14011d560n) {
      if (p !== 0n) {
        if (!this.services.crtFree) this.stop('crt-free', 0x1425cec00n, 0x14222f060n);
        this.services.crtFree(p);
      }
    } else {
      if (!this.services.release) this.stop('allocator-release', target, site);
      this.services.release(target, a, p);
    }
  }
  private copy(dst: bigint, src: bigint, count: bigint, site: bigint) {
    if (!this.services.copy) this.stop('crt-copy', 0x1426079d0n, site);
    this.services.copy(u64(dst), u64(src), u64(count));
  }
  private guard(table: bigint, site: bigint) {
    const thread = this.q(table + BigInt(this.d(0x143693a98n)) * 8n);
    if (this.int(thread + 0x20ecn) < this.int(0x1433dd120n)) this.stop('tls-guard-acquire', 0x1425a0588n, site);
  }
  private virtual(definition: bigint, slot: bigint, expected: bigint, boundary: string, site: bigint) {
    const target = this.q(this.q(definition) + slot);
    if (target !== expected) this.stop(boundary, target, site);
  }
  private next(input: bigint, entry: bigint, site: bigint) {
    const target = this.q(this.q(input) + 8n);
    if (target !== 0x14253f460n) this.stop('input-next-token', target, site);
    const result = this.tokenizer.next(input, entry); this.accept(result);
    if (result.kind !== 'returned') throw Error('Tokenizer returned no value');
    return result.value >>> 0;
  }
  /** Actual140152EE0. Its initialization order differs from14014D6F0. */
  private token(dst: bigint, src: bigint) {
    this.wd(dst, this.d(src)); this.wb(dst + 4n, this.b(src + 4n));
    const count = this.int(src + 20n), pointer = this.q(src + 8n), table = this.q(this.gsBase + 0x58n), local = u64(dst + 32n);
    this.wq(dst + 8n, 0n); this.wq(dst + 16n, 0n); this.wq(dst + 24n, local);
    this.guard(table, 0x140152febn);
    this.wq(local, 0x142796130n); this.wq(local + 32n, 0x1430fd000n);
    const allocator = this.q(dst + 24n), oldPointer = this.q(dst + 8n);
    this.wd(dst + 20n, 0); this.release(allocator, oldPointer, 0x140152f71n);
    this.wq(dst + 8n, 0n); const vtable = this.q(local); this.wd(dst + 16n, 0);
    const target = this.q(vtable + 32n);
    if (target === 0x1401691d0n) { this.wd(dst + 16n, 21); this.wq(dst + 8n, local + 8n); }
    else {
      if (!this.services.inlineBuffer) this.stop('inline-buffer', target, 0x140152facn);
      this.services.inlineBuffer(target, local, dst + 8n, dst + 16n);
    }
    this.accept(this.constants.insertBytes(dst + 8n, this.int(dst + 20n), pointer, count));
  }
  private cleanToken(token: bigint, site: bigint) {
    const pointer = this.q(token + 8n);
    if (pointer !== 0n) { this.wd(token + 20n, 0); this.release(this.q(token + 24n), pointer, site); }
  }
  private line(parser: bigint) { return this.d(this.q(this.q(parser + 0x28n) + 8n) + 8n); }
  /** Actual140B23AA0. Constructor provenance remains outside this stage. */
  private finalize(definition: bigint) {
    if (this.d(definition + 0x520n) !== 0) {
      for (const [offset, global] of [[0x528n, 0x1433e43d8n], [0x530n, 0x1433e4488n], [0x538n, 0x1433e4588n]] as const) {
        if (BigInt.asIntN(64, this.q(definition + offset)) < 0n) this.wq(definition + offset, this.q(global));
      }
    }
  }
  private primitive() { return new NativeDatabasePrimitives(this.memory, this.services, this.loopBudget); }
  /** Actual 140B1CA40 copies a 56-byte folder record. */
  private recordCopy(dst: bigint, src: bigint) {
    const p=this.primitive();p.stringCopy(dst+8n,src+8n);this.wd(dst+0x28n,this.d(src+0x28n));this.wq(dst+0x30n,this.q(src+0x30n));this.wq(dst,0x1429c1368n);
  }
  /** Actual 140B1DF50 / non-deleting 140B1E720. */
  private recordDestroy(record: bigint) {
    this.wq(record,0x1429c1368n);this.primitive().stringFree(record+8n,0x140b1dfb4n);
    this.wq(record+0x18n,0n);this.wq(record+0x20n,15n);this.wb(record+8n,0);
  }
  private relocateFolders(first: bigint, end: bigint, dst: bigint) {
    let steps=0;
    while(first!==end){
      if(++steps>this.loopBudget)this.stop('folder-relocation-budget',0x140b25770n,0x140b257d0n);
      this.recordCopy(dst,first);
      const target=this.q(this.q(first));if(target!==0x140b1e720n)this.stop('folder-record-destructor',target,0x140b257b6n);
      this.recordDestroy(first);first+=56n;dst+=56n;
    }
  }
  private folderAppend(definition: bigint, parser: bigint, entry: bigint): PropertyIteratorResult {
    // Actual 140B25C90 pushes seven registers, reserves0x320, record atSP+0x30.
    const sp=entry-0x358n,record=sp+0x30n,vector=definition+0x380n,p=this.primitive();
    this.wq(entry+0x20n,0n);p.zero(record+8n,16);p.write(record+0x18n,p.bytes(0x142795990n,16));this.wb(record+8n,0);
    this.wd(record+0x28n,this.d(0x14285ba80n));this.wq(record+0x30n,0n);this.wq(record,0x1429c1368n);
    const count=this.int(vector+12n),cap=this.int(vector+8n);
    if(count===cap){
      const next=p.growth(cap,(count+1)|0),dst=p.allocate(this.q(vector+16n),BigInt(next>>>0)*56n,8,0x140b267bdn);
      this.recordCopy(dst+BigInt(this.int(vector+12n))*56n,record);
      const old=this.q(vector),end=old+BigInt(this.int(vector+12n))*56n;this.relocateFolders(old,end,dst);
      const length=(this.int(vector+12n)+1)|0;this.wd(vector+12n,0);
      // 140B27F50 re-enters relocation after the explicit zero-count store.
      this.relocateFolders(this.q(vector),this.q(vector)+BigInt(this.int(vector+12n))*56n,dst);
      p.release(this.q(vector+16n),this.q(vector),0x140b27f88n);this.wq(vector,dst);this.wd(vector+8n,next);this.wd(vector+12n,length);
    }else{this.recordCopy(this.q(vector)+BigInt(count)*56n,record);this.wd(vector+12n,this.d(vector+12n)+1);}
    this.recordDestroy(record);
    const output=this.q(vector)+BigInt((this.int(vector+12n)-1)|0)*56n,target=this.q(this.q(output)+0x18n);
    if(target!==0x142541100n)this.stop('folder-property-iterator',target,0x14254353cn);
    return this.iterate(output,parser,sp-8n,true);
  }
  private folderValue(record: bigint, parser: bigint, identifier: number, entry: bigint): PropertyIteratorResult {
    if(identifier===0x4c)return this.position(parser,record+0x30n,entry);
    if(identifier!==0x1b)return{kind:'runtime-required',boundary:'folder-field-untranslated',nativeAddress:0x1425416b0n,callSite:0x140b259fan};
    const p=this.primitive(),temporary=entry-0x28n,text=this.int(parser+0xd4n)===0?0x14279471dn:this.q(parser+0xc8n);
    p.zero(temporary,32);let n=0n;while(this.b(text+n)!==0)n++;p.stringConstruct(temporary,text,n);
    const result=new NativeInputObject(this.memory,this.services,this.gsBase).assignName(record+8n,p.stringPointer(temporary),this.q(temporary+16n));this.accept(result);
    let hash=0x811c9dc5,at=p.stringPointer(record+8n),count=this.int(record+0x18n);
    for(let i=0;i<count;i++){const byte=this.b(at++);hash=Math.imul(hash^(byte>=65&&byte<=90?byte+32:byte),0x1000193)>>>0;}
    this.wd(record+0x28n,hash);p.stringFree(temporary,0x140b25b15n);return{kind:'complete'};
  }
  private current(parser: bigint) { return this.q(parser+0x28n)+0x18n; }
  private coordinateResolve(parser: bigint, local: bigint, temporary: bigint, child: bigint, site: bigint) {
    const pointer=this.q(local+8n);
    if(this.int(local+20n)!==0&&this.b(pointer)===64){
      const resolved=this.constants.resolve(parser,temporary,child);this.accept(resolved);if(resolved.kind!=='returned')throw Error('Coordinate resolution returned no value');
      this.wd(local,this.d(resolved.value));this.wb(local+4n,this.b(resolved.value+4n));this.accept(this.constants.moveBytes(local+8n,resolved.value+8n,child));
      this.cleanToken(temporary,site);this.accept(this.parser.assignToken(this.current(parser),local));
    }
  }
  /** Bounded actual 1402E0960 integer coordinates, including variable resolution. */
  private position(parser: bigint, output: bigint, entry: bigint): PropertyIteratorResult {
    const sp=entry-0x218n,fp=entry-0x118n,child=sp-8n,peek=sp+0x40n,keys=fp+0x80n,p=this.primitive();
    this.wd(fp+0x120n,0);p.write(keys,p.bytes(0x1427b87e0n,16));
    if(this.d(parser+0xc0n)!==3)this.stop('folder-position-form-untranslated',0x1402e09afn,0x1402e09a9n);
    let index=0,key=keys,steps=0;this.wq(fp+0x130n,key);
    while(true){
      if(++steps>this.loopBudget)this.stop('folder-position-budget',0x1402e0a50n,0x1402e0a50n);
      const input=this.q(parser+0x28n);
      if(this.b(input+0x64n)===0){const available=this.next(input,child,0x1402e0a60n);this.wd(input+0x10n,available);if(available===0)this.wd(input+0x18n,19);this.wb(input+0x64n,1);}
      this.token(peek,input+0x18n);const kind=this.d(peek),ended=kind===4||kind===19;this.cleanToken(peek,0x1402e0aadn);
      this.next(this.q(parser+0x28n),child,0x1402e0ab7n);
      if(ended){const terminal=fp-0x70n;this.token(terminal,this.current(parser));this.coordinateResolve(parser,terminal,peek,child,0x1402e111fn);this.cleanToken(terminal,0x1402e1188n);return{kind:'complete'};}
      const local=fp-0x20n;this.token(local,this.current(parser));this.coordinateResolve(parser,local,peek,child,0x1402e0b2dn);this.cleanToken(local,0x1402e0b8en);
      let current=this.current(parser),tokenKind=this.d(current);
      if(index>=2)this.stop('folder-position-extra-untranslated',0x1402e0ba7n,0x1402e0ba1n);
      if(tokenKind!==12&&tokenKind!==13){
        if(this.d(key)!==tokenKind)this.stop('folder-position-key-lookup',0x14253ecd0n,0x1402e0fbcn);
        this.next(this.q(parser+0x28n),child,0x1402e0c74n);
        const equal=fp+0x30n;this.token(equal,this.current(parser));this.coordinateResolve(parser,equal,peek,child,0x1402e0ce2n);this.cleanToken(equal,0x1402e0d44n);
        if(this.d(this.current(parser))!==1)this.stop('folder-position-equals-lookup',0x14253ecd0n,0x1402e0d5bn);
        this.next(this.q(parser+0x28n),child,0x1402e0e4bn);
        this.token(peek,this.current(parser));this.coordinateResolve(parser,peek,fp+0x90n,child,0x1402e0ebfn);this.cleanToken(peek,0x1402e0eeen);
        current=this.current(parser);tokenKind=this.d(current);
        if(tokenKind!==12){const diagnostic=sp+0x20n;p.zero(diagnostic,32);p.stringConstruct(diagnostic,0x1427b8680n,27n);this.stop('folder-coordinate-diagnostic',0x142544980n,0x1402e0f35n);}
      }
      this.accept(new NativeScalarValues(this.memory).readInteger(current,output+BigInt(index)*4n));index++;key+=4n;this.wq(fp+0x130n,key);
    }
  }

  private pathVector(at: bigint) { this.wq(at,0n);this.wq(at+8n,0n);this.guard(this.q(this.gsBase+0x58n),0x14011f740n);this.wq(at+16n,0x1430fd000n); }
  private pathConstruct(at: bigint) {
    const p=this.primitive();p.zero(at+8n,16);this.wq(at+0x18n,0n);this.wq(at+0x20n,15n);this.wb(at+8n,0);this.wd(at+0x28n,this.d(0x14285ba80n));
    this.wq(at+0x30n,100000n);this.wq(at,0x1429c1318n);p.zero(at+0x38n,16);this.wq(at+0x48n,0n);this.wq(at+0x50n,15n);this.wb(at+0x38n,0);this.wd(at+0x58n,this.d(0x14285ba80n));
    this.pathVector(at+0x60n);this.pathVector(at+0x78n);this.wb(at+0x90n,0);
  }
  /** Actual140B1D3D0, bounded to the reached empty nested vectors. */
  private pathCopy(dst: bigint,src: bigint) {
    const p=this.primitive();p.stringCopy(dst+8n,src+8n);this.wd(dst+0x28n,this.d(src+0x28n));this.wq(dst+0x30n,this.q(src+0x30n));this.wq(dst,0x1429c1318n);
    p.stringCopy(dst+0x38n,src+0x38n);this.wd(dst+0x58n,this.d(src+0x58n));
    for(const [offset,target,site] of [[0x60n,0x140b246c0n,0x140b1d44en],[0x78n,0x140b24490n,0x140b1d483n]] as const){
      p.zero(dst+offset,24);this.pathVector(dst+offset);
      if(this.int(src+offset+12n)!==0)this.stop('path-nested-vector-copy-untranslated',target,site);
      this.wd(dst+offset+12n,this.d(dst+offset+12n));
    }
    this.wb(dst+0x90n,this.b(src+0x90n));
  }
  /** Actual140B1E260; nonempty nested script ownership remains explicit. */
  private pathDestroy(at: bigint) {
    const p=this.primitive();this.wq(at,0x1429c1318n);
    if(this.int(at+0x84n)!==0)this.stop('path-nested-script-destruction-untranslated',0x140b1e29dn,0x140b1e29bn);
    this.wd(at+0x84n,0);
    if(this.q(at+0x78n)!==0n){p.release(this.q(at+0x88n),this.q(at+0x78n),0x140b1e2e9n);this.wq(at+0x78n,0n);this.wd(at+0x80n,0);}
    if(this.q(at+0x60n)!==0n){if(this.int(at+0x6cn)!==0)this.stop('path-nested-vector-destruction-untranslated',0x140b20c90n,0x140b1e306n);this.wd(at+0x6cn,0);p.release(this.q(at+0x70n),this.q(at+0x60n),0x140b1e319n);this.wq(at+0x60n,0n);this.wd(at+0x68n,0);}
    p.stringFree(at+0x38n,0x140b1e3c7n);this.wq(at+0x48n,0n);this.wq(at+0x50n,15n);this.wb(at+0x38n,0);
    p.stringFree(at+8n,0x140b1e3c7n);this.wq(at+0x18n,0n);this.wb(at+8n,0);this.wq(at+0x20n,15n);
  }
  private relocatePaths(first: bigint,end: bigint,dst: bigint) {
    let steps=0;
    while(first!==end){if(++steps>this.loopBudget)this.stop('path-relocation-budget',0x140b25810n,0x140b25830n);this.pathCopy(dst,first);const target=this.q(this.q(first));if(target!==0x140b1e7a0n)this.stop('path-record-destructor',target,0x140b25824n);this.pathDestroy(first);first+=152n;dst+=152n;}
  }
  private pathAppend(definition: bigint,parser: bigint,entry: bigint): PropertyIteratorResult {
    const sp=entry-0x358n,record=entry-0x148n,vector=definition+0x2f0n,p=this.primitive();this.pathConstruct(record);
    const count=this.int(vector+12n),cap=this.int(vector+8n);
    if(count===cap){
      const next=p.growth(cap,(count+1)|0),dst=p.allocate(this.q(vector+16n),BigInt(next>>>0)*152n,8,0x140b2610en);
      this.pathCopy(dst+BigInt(this.int(vector+12n))*152n,record);const old=this.q(vector),end=old+BigInt(this.int(vector+12n))*152n;this.relocatePaths(old,end,dst);
      const length=(this.int(vector+12n)+1)|0;this.wd(vector+12n,0);
      const second=this.q(vector);this.relocatePaths(second,second,dst);p.release(this.q(vector+16n),this.q(vector),0x140b2616bn);
      this.wq(vector,dst);this.wd(vector+8n,next);this.wd(vector+12n,length);
    }else{this.pathCopy(this.q(vector)+BigInt(count)*152n,record);this.wd(vector+12n,this.d(vector+12n)+1);}
    this.pathDestroy(record);const output=this.q(vector)+BigInt((this.int(vector+12n)-1)|0)*152n,target=this.q(this.q(output)+0x18n);
    if(target!==0x142541100n)this.stop('path-property-iterator',target,0x14254353cn);return this.iterate(output,parser,sp-8n,false,true);
  }
  private pathValue(record: bigint,parser: bigint,identifier: number,entry: bigint): PropertyIteratorResult {
    if(identifier===0x2e66){const result=new NativeScalarWrappers(new NativeScalarValues(this.memory),this.constants).readFixed(parser,record+0x30n,entry);this.accept(result);return{kind:'complete'};}
    if(identifier===0x3930)return this.fields.applyBoolean(parser,record+0x90n);
    if(identifier!==0x2e65)return{kind:'runtime-required',boundary:'path-field-untranslated',nativeAddress:0x1425416b0n,callSite:0x140b25b49n};
    const p=this.primitive(),temporary=entry-0x28n,text=this.int(parser+0xd4n)===0?0x14279471dn:this.q(parser+0xc8n);
    p.zero(temporary,32);let n=0n;while(this.b(text+n)!==0)n++;p.stringConstruct(temporary,text,n);
    const assigned=new NativeInputObject(this.memory,this.services,this.gsBase).assignName(record+8n,p.stringPointer(temporary),this.q(temporary+16n));this.accept(assigned);
    let at=p.stringPointer(record+8n),hash=0x811c9dc5;const count=this.int(record+0x18n);
    for(let i=0;i<count;i++){const byte=this.b(at++);hash=Math.imul(hash^(byte>=65&&byte<=90?byte+32:byte),0x1000193)>>>0;}
    this.wd(record+0x28n,hash);p.stringFree(temporary,0x140b25c85n);return{kind:'complete'};
  }

  begin(definition: bigint, parser: bigint, entryStack: bigint): PropertyIteratorResult {
    const metadata = this.fields.begin(definition, parser);
    if (metadata.kind === 'runtime-required' && metadata.boundary === 'technology-property-iterator') return this.iterate(definition, parser, entryStack);
    return metadata;
  }
  iterate(definition: bigint, parser: bigint, entryStack: bigint, folder = false, path = false): PropertyIteratorResult {
    definition = u64(definition); parser = u64(parser); entryStack = u64(entryStack);
    const sp = u64(entryStack - 0x288n), fp = u64(entryStack - 0x188n), child = u64(sp - 8n), vector = u64(sp + 0x30n), local = u64(sp + 0x48n);
    const peek = u64(fp - 0x10n), terminating = u64(fp - 0x60n); let steps = 0;
    try {
      this.virtual(definition, 0x30n, 0x140154030n, 'property-initial-hook', 0x142541136n);
      this.wd(entryStack + 8n, this.line(parser));
      this.wq(vector, 0n); this.wq(vector + 8n, 0n); this.wq(vector + 16n, local);
      this.guard(this.q(this.gsBase + 0x58n), 0x142541675n);
      this.wq(local, 0x1429ce910n); this.wq(fp - 0x70n, 0x1430fd000n); this.wd(vector + 12n, 0);
      this.copy(0n, 0n, 0n, 0x1425411b7n);
      this.release(this.q(vector + 16n), this.q(vector), 0x1425411c9n);
      this.wq(vector, 0n); this.wd(vector + 8n, 0);
      const inline = this.q(this.q(local) + 0x20n);
      if (inline === 0x140169280n) { this.wq(vector, local + 8n); this.wd(vector + 8n, 16); }
      else {
        if (!this.services.inlineBuffer) this.stop('inline-buffer', inline, 0x14254120en);
        this.services.inlineBuffer(inline, local, vector, vector + 8n);
      }
      while (true) {
        if (++steps > this.loopBudget) this.stop('property-loop-budget', 0x142541221n, 0x142541221n);
        const input = this.q(parser + 0x28n);
        if (this.b(input + 0x64n) === 0) {
          const available = this.next(input, child, 0x142541231n); this.wd(input + 0x10n, available);
          if (available === 0) this.wd(input + 0x18n, 19);
          this.wb(input + 0x64n, 1);
        }
        this.token(peek, input + 0x18n); const kind = this.d(peek), ended = kind === 4 || kind === 19;
        this.cleanToken(peek, 0x14254127an);
        if (ended) break;
        this.accept(this.parser.consume(parser, 0, child));
        const identifier = this.d(parser + 0x30n);
        this.virtual(definition, 0x28n, 0x14011d530n, 'property-duplicate-predicate', 0x14254129cn);
        this.virtual(definition, 0x20n, folder ? 0x140b259e0n : path ? 0x140b25b20n : 0x140b25c90n, 'property-dispatcher', 0x1425414d2n);
        this.accept(folder ? this.folderValue(definition, parser, identifier, child) : path ? this.pathValue(definition, parser, identifier, child) : identifier === 0x2e61 ? this.folderAppend(definition, parser, child) : identifier === 0x174 ? this.pathAppend(definition, parser, child) : identifier === 0x2c58 ? this.categories.dispatch(definition, parser, identifier, child) : identifier === 0x2e62 || identifier === 0x2e64
          ? this.numeric.dispatch(definition, parser, identifier, child)
          : this.fields.dispatch(definition, parser, identifier));
        if (this.d(parser + 0x18n) !== 0) { if (identifier === 0x2c58) this.stop('lexer-diagnostic-context', 0x14254bce0n, 0x142542b22n); this.stop('property-parser-diagnostic', 0x142542b00n, 0x1425414f5n); }
      }
      this.next(this.q(parser + 0x28n), child, 0x142541506n);
      this.token(terminating, this.q(parser + 0x28n) + 0x18n);
      const startLine = this.d(entryStack + 8n);
      let pointer = this.q(terminating + 8n);
      if (this.int(terminating + 20n) !== 0 && this.b(pointer) === 64) {
        const resolved = this.constants.resolve(parser, peek, child); this.accept(resolved);
        if (resolved.kind !== 'returned') throw Error('Resolution returned no token');
        this.wd(terminating, this.d(resolved.value)); this.wb(terminating + 4n, this.b(resolved.value + 4n));
        this.accept(this.constants.moveBytes(terminating + 8n, resolved.value + 8n, child));
        this.cleanToken(peek, 0x142541578n);
        this.accept(this.parser.assignToken(this.q(parser + 0x28n) + 0x18n, terminating));
        pointer = this.q(terminating + 8n);
      }
      if (pointer !== 0n) { this.wd(terminating + 20n, 0); this.release(this.q(terminating + 24n), pointer, 0x1425415d5n); }
      if (this.d(parser + 0x18n) !== 0) this.stop('property-parser-diagnostic', 0x142542b00n, 0x142541628n);
      this.virtual(definition, 0x40n, folder || path ? 0x140154030n : 0x140b23aa0n, 'technology-finalizer', 0x1425415ebn); if (!folder && !path) this.finalize(definition);
      const sourceHook = this.q(this.q(definition) + 0x38n), endLine = this.line(parser), source = u64(this.q(this.q(parser + 0x28n) + 8n) + 0x18n);
      void startLine; void endLine; void source;
      if (sourceHook !== 0x140154030n) this.stop('property-source-hook', sourceHook, 0x142541614n);
      const vectorPointer = this.q(vector);
      if (vectorPointer !== 0n) { this.wd(vector + 12n, 0); this.release(this.q(vector + 16n), vectorPointer, 0x142541645n); }
      return { kind: 'complete' };
    } catch (error) { if (error instanceof Stop || error instanceof DatabasePrimitiveStop) return error.result; throw error; }
  }
}
