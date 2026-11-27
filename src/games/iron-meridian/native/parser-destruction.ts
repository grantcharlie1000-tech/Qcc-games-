import type { InputObjectMemory,InputObjectServices } from './input-object';
import type { ParserConstantsServices } from './parser-constants';
import type { TechnologyFieldResult } from './technology-fields';
import { NativeInputLifetime } from './input-lifetime';
import { NativeDatabasePrimitives,DatabasePrimitiveStop } from './database-primitives';
const u64=(v:bigint)=>BigInt.asUintN(64,v);

/** Actual1425419A0 and its variable/name/list ownership closure. */
export class NativeParserDestruction {
  constructor(private readonly memory:InputObjectMemory,private readonly services:InputObjectServices & ParserConstantsServices,private readonly budget=1_000_000){}
  private q(a:bigint){return u64(this.memory.readQword(u64(a)));}
  private d(a:bigint){return this.memory.readDword(u64(a))>>>0;}
  private b(a:bigint){return this.memory.readByte(u64(a))&255;}
  private wq(a:bigint,v:bigint){this.memory.writeQword(u64(a),u64(v));}
  private wd(a:bigint,v:number){this.memory.writeDword(u64(a),v>>>0);}
  private wb(a:bigint,v:number){this.memory.writeByte(u64(a),v&255);}
  private primitive(){return new NativeDatabasePrimitives(this.memory,this.services,this.budget);}
  private stop(boundary:string,nativeAddress:bigint,callSite:bigint):never{throw new DatabasePrimitiveStop({kind:'runtime-required',boundary,nativeAddress,callSite});}
  private variable(at:bigint){
    const p=this.primitive(),pointer=this.q(at+0x30n);
    if(pointer!==0n){this.wd(at+0x3cn,0);p.release(this.q(at+0x40n),pointer,0x140158a42n);this.wq(at+0x30n,0n);this.wd(at+0x38n,0);}
    p.stringFree(at,0x140158a9cn);this.wq(at+16n,0n);this.wq(at+24n,15n);this.wb(at,0);
  }
  /**142541930 captures the positive count; it reloads the backing pointer per entry. */
  private variables(vector:bigint){
    if(this.q(vector)===0n)return;
    const count=this.d(vector+12n)|0;
    for(let i=0;i<count;i++){if(i>=this.budget)this.stop('parser-variable-destruction-budget',0x142541954n,0x142541967n);this.variable(this.q(vector)+BigInt(i)*112n);}
    const allocator=this.q(vector+16n),pointer=this.q(vector);this.wd(vector+12n,0);this.primitive().release(allocator,pointer,0x142541984n);this.wq(vector,0n);this.wd(vector+8n,0);
  }
  /**1403E8250 destroys40-byte name records before releasing their vector. */
  private names(vector:bigint){
    if(this.q(vector)===0n)return;
    const count=this.d(vector+12n)|0,p=this.primitive();
    for(let i=0;i<count;i++){if(i>=this.budget)this.stop('parser-name-destruction-budget',0x1403e8290n,0x1403e82e7n);const at=this.q(vector)+BigInt(i)*40n;p.stringFree(at,0x1403e8320n);this.wq(at+16n,0n);this.wq(at+24n,15n);this.wb(at,0);}
    const allocator=this.q(vector+16n),pointer=this.q(vector);this.wd(vector+12n,0);p.release(allocator,pointer,0x1403e82f7n);this.wq(vector,0n);this.wd(vector+8n,0);
  }
  private diagnosticNode(at:bigint){
    const p=this.primitive();p.stringFree(at+0x28n,0x140a0afd3n);this.wq(at+0x38n,0n);this.wq(at+0x40n,15n);this.wb(at+0x28n,0);
    p.stringFree(at,0x140a0afd3n);this.wq(at+0x10n,0n);this.wq(at+0x18n,15n);this.wb(at,0);
  }
  destroy(parser:bigint):TechnologyFieldResult {
    parser=u64(parser);const p=this.primitive();
    try{
      this.wq(parser,0x142c05150n);
      if(this.b(parser+0x120n)!==0){const input=this.q(parser+0x28n);if(input!==0n){const target=this.q(this.q(input));if(target!==0x14253de50n)this.stop('parser-owned-input-destructor',target,0x1425419dbn);const result=new NativeInputLifetime(this.memory,this.services).destroy(input,1);if(result.kind!=='returned')throw new DatabasePrimitiveStop(result);}}
      if(this.d(parser+0x18n)!==0)this.stop('parser-destruction-diagnostic',0x142542b00n,0x1425419f3n);
      if(this.b(parser+0x14cn)!==0){this.wb(parser+0x148n,0xaa);this.wb(parser+0x14cn,0);}
      this.variables(parser+0x130n);this.names(parser+0x108n);
      for(const [offset,site] of [[0xc0n,0x142541a45n],[0x78n,0x142541a71n],[0x30n,0x142541a94n]] as const){const token=parser+offset,pointer=this.q(token+8n);if(pointer!==0n){this.wd(token+20n,0);p.release(this.q(token+24n),pointer,site);this.wq(token+8n,0n);this.wd(token+16n,0);}}
      let node=this.q(parser+8n),steps=0;
      while(node!==0n){if(++steps>this.budget)this.stop('parser-diagnostic-list-budget',0x142541ab0n,0x142541acfn);const next=this.q(node+0x50n);this.diagnosticNode(node);p.free(node);node=next;}
      this.wq(parser+8n,0n);this.wq(parser+16n,0n);this.wd(parser+24n,0);return{kind:'complete'};
    }catch(error){
      if(error instanceof DatabasePrimitiveStop){if(error.result.kind!=='runtime-required')return error.result;const aliases:Record<string,string>={'crt-free':'crtFree','crt-copy':'copy','crt-allocate':'crtAllocate'};return{...error.result,boundary:aliases[error.result.boundary]??error.result.boundary};}
      throw error;
    }
  }
}
