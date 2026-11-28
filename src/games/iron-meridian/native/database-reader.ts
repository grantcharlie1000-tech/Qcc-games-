import type { InputObjectMemory, InputObjectServices } from './input-object';
import { NativeKeywordRecord } from './keyword-record';
import type { NativeTokenizer } from './tokenizer';
import type { NativeParserConstants, ParserConstantsServices } from './parser-constants';
import type { NativeParserExtended } from './parser-extended';
import { NativeTechnologyConstructor } from './technology-constructor';
import { NativeTechnologyCategories } from './categories';
import type { TechnologyFieldResult } from './technology-fields';
import { DatabasePrimitiveStop, NativeDatabasePrimitives } from './database-primitives';
type Failure = Exclude<TechnologyFieldResult, { kind: 'complete' }>;
const u64 = (v: bigint) => BigInt.asUintN(64,v);

/** Actual 140B1EAD0 technologies path over an explicitly supplied database. */
export class NativeTechnologyDatabaseReader {
  private readonly primitives: NativeDatabasePrimitives;
  private readonly constructorBody: NativeTechnologyConstructor;
  private readonly properties: NativeTechnologyCategories;
  constructor(private readonly memory: InputObjectMemory, private readonly services: ParserConstantsServices & InputObjectServices,
    private readonly tokenizer: NativeTokenizer, private readonly constants: NativeParserConstants,
    private readonly parser: NativeParserExtended, private readonly gsBase: bigint, private readonly budget = 1_000_000) {
    this.primitives = new NativeDatabasePrimitives(memory,services);
    this.constructorBody = new NativeTechnologyConstructor(memory,services,gsBase);
    this.properties = new NativeTechnologyCategories(memory,services,tokenizer,constants,parser,gsBase);
  }
  private q(a: bigint) { return u64(this.memory.readQword(u64(a))); }
  private d(a: bigint) { return this.memory.readDword(u64(a)) >>> 0; }
  private int(a: bigint) { return this.d(a) | 0; }
  private b(a: bigint) { return this.memory.readByte(u64(a)) & 255; }
  private wb(a: bigint,v: number) { this.memory.writeByte(u64(a),v & 255); }
  private wd(a: bigint,v: number) { this.memory.writeDword(u64(a),v >>> 0); }
  private wq(a: bigint,v: bigint) { this.memory.writeQword(u64(a),u64(v)); }
  private stop(boundary: string,nativeAddress: bigint,callSite: bigint): never { throw new DatabasePrimitiveStop({kind:'runtime-required',boundary,nativeAddress,callSite}); }
  private accept(result: {kind:string}) { if (result.kind !== 'returned' && result.kind !== 'complete') throw new DatabasePrimitiveStop(result as Failure); }
  private next(input: bigint,entry: bigint,site: bigint) {
    const target = this.q(this.q(input)+8n); if (target !== 0x14253f460n) this.stop('input-next-token',target,site);
    const result = this.tokenizer.next(input,entry); this.accept(result);
    if (result.kind !== 'returned') throw Error('Tokenizer returned no value'); return result.value >>> 0;
  }
  private look(input: bigint,child: bigint,site: bigint) {
    if (this.b(input+0x64n) === 0) { const available=this.next(input,child,site);this.wd(input+0x10n,available);if(available===0)this.wd(input+0x18n,19);this.wb(input+0x64n,1); }
  }
  private current(parser: bigint) { return u64(this.q(parser+0x28n)+0x18n); }
  private token(dst: bigint,src: bigint) {
    this.wd(dst,this.d(src));this.wb(dst+4n,this.b(src+4n));const n=this.int(src+20n),pointer=this.q(src+8n);
    this.accept(new NativeKeywordRecord(this.memory,this.services,this.gsBase).initializeVector(dst+8n));
    this.accept(this.constants.insertBytes(dst+8n,this.int(dst+20n),pointer,n));
  }
  private cleanToken(token: bigint,site: bigint) {
    const pointer=this.q(token+8n);if(pointer!==0n){this.wd(token+20n,0);this.primitives.release(this.q(token+24n),pointer,site);}
  }
  private appendObject(vector: bigint,value: bigint,factor: number) {
    const count=this.int(vector+12n),capacity=this.int(vector+8n);
    if(count!==capacity){this.wq(this.q(vector)+BigInt(count)*8n,value);this.wd(vector+12n,this.d(vector+12n)+1);return;}
    const next=this.primitives.growth(capacity,(count+1)|0,factor),pointer=this.primitives.allocate(this.q(vector+16n),BigInt(next>>>0)*8n,8,0x140b1fb7dn);
    this.wq(pointer+BigInt(this.int(vector+12n))*8n,value);this.primitives.copy(pointer,this.q(vector),BigInt(this.int(vector+12n))*8n,0x140b1fb9an);
    const length=(this.int(vector+12n)+1)|0;this.wd(vector+12n,0);this.primitives.release(this.q(vector+16n),this.q(vector),0x140b1fbb8n);
    this.wq(vector,pointer);this.wd(vector+8n,next);this.wd(vector+12n,length);
  }
  read(database: bigint,parser: bigint,entryStack: bigint): TechnologyFieldResult {
    database=u64(database);parser=u64(parser);const entry=u64(entryStack),sp=entry-0x248n,fp=entry-0x148n,child=entry-0x250n,record=sp+0x20n;
    const view=new DataView(new ArrayBuffer(4));view.setUint32(0,this.d(0x142795988n),true);const factor=view.getFloat32(0,true);let steps=0;
    try {
      while(true){
        if(++steps>this.budget)this.stop('technology-database-loop-budget',0x140b1eb10n,0x140b1eb10n);
        let input=this.q(parser+0x28n);this.look(input,child,0x140b1eb20n);if(this.d(input+0x18n)===19)return{kind:'complete'};
        this.accept(this.parser.consume(parser,1,child));const identifier=this.d(parser+0x30n);
        if(identifier===0x2e5e)this.stop('technology-database-group-untranslated',0x140b1f581n,0x140b1eb5cn);
        if(identifier===0x2e5f)this.stop('technology-database-group-untranslated',0x140b1eb74n,0x140b1eb65n);
        if(identifier!==0x2e5d)this.stop('technology-database-unknown-diagnostic',0x142544af0n,0x140b1eb6an);
        while(true){
          if(++steps>this.budget)this.stop('technology-definition-loop-budget',0x140b1fa20n,0x140b1fa20n);
          input=this.q(parser+0x28n);this.look(input,child,0x140b1fa34n);this.token(record,input+0x18n);
          const kind=this.d(record),ended=kind===4||kind===19;this.cleanToken(record,0x140b1faa6n);if(ended)break;
          this.accept(this.parser.consume(parser,1,child));const text=this.int(parser+0x44n)===0?0x14279471dn:this.q(parser+0x38n);
          this.wq(fp+0xf0n,text);let n=0n;while(this.b(text+n)!==0)n++;this.wq(fp+0xf8n,n);
          const a=this.q(fp+0xf0n),b=this.q(fp+0xf8n);this.wq(fp+0xb0n,a);this.wq(fp+0xb8n,b);this.primitives.hashRecord(record,fp+0xb0n);
          // 14066C960's observed disabled branch has only excluded callee/ABI writes.
          if(this.b(0x1433dd099n)!==0)this.stop('technology-name-validation-enabled',0x14066c99fn,0x14066c999n);
          const allocated=this.primitives.malloc(0x590n,0x140b1fb23n);this.wq(fp+0xb0n,allocated);let technology=0n;
          if(allocated!==0n){const result=this.constructorBody.construct(allocated,record,this.d(database+0x54n),child);this.accept(result);if(result.kind!=='returned')throw Error('Constructor returned no value');technology=result.value;}
          this.appendObject(database+0x48n,technology,factor);this.primitives.appendRecord(database+0x60n,record,factor);
          const target=this.q(this.q(technology)+0x18n);if(target!==0x140b25980n)this.stop('technology-definition-reader',target,0x140b1fcc4n);
          this.accept(this.properties.begin(technology,parser,child));this.primitives.stringFree(record,0x140b1fe2an);
        }
        this.next(this.q(parser+0x28n),child,0x140b1fd1bn);this.token(record,this.current(parser));
        const pointer=this.q(record+8n);
        if(this.int(record+20n)!==0&&this.b(pointer)===64){
          const temporary=fp-0x58n,resolved=this.constants.resolve(parser,temporary,child);this.accept(resolved);if(resolved.kind!=='returned')throw Error('Resolver returned no value');
          this.wd(record,this.d(resolved.value));this.wb(record+4n,this.b(resolved.value+4n));this.accept(this.constants.moveBytes(record+8n,resolved.value+8n,child));this.cleanToken(temporary,0x140b1fdaan);
          this.accept(this.parser.assignToken(this.current(parser),record));
        }
        this.cleanToken(record,0x140b1fddan);if(this.d(parser+0x18n)!==0)this.stop('technology-database-parser-diagnostic',0x142542b00n,0x140b1fdfdn);
      }
    }catch(error){
      if(error instanceof DatabasePrimitiveStop){
        if(error.result.kind!=='runtime-required')return error.result;
        const aliases: Record<string,string> = {'crt-copy':'copy','crt-allocate':'crtAllocate','crt-free':'crtFree'};
        return {...error.result,boundary:aliases[error.result.boundary]??error.result.boundary};
      }
      throw error;
    }
  }
}
