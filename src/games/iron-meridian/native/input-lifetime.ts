import { NativeReaderLifetime } from './reader-lifetime';
import type { ReaderLifetimeMemory, ReaderLifetimeResult, ReaderLifetimeServices } from './reader-lifetime';

type RuntimeStop=Exclude<ReaderLifetimeResult<never>,{kind:'returned'}>;
class Stop {constructor(readonly result:RuntimeStop){}}
const u64=(value:bigint)=>BigInt.asUintN(64,value);
/** Actual14253DE50 deleting input destructor and concrete reader/allocator closure. */
export class NativeInputLifetime {
  constructor(private readonly memory:ReaderLifetimeMemory,private readonly services:ReaderLifetimeServices={}){}
  private q(address:bigint){return u64(this.memory.readQword(u64(address)));}
  private stop(boundary:string,nativeAddress:bigint,callSite:bigint):never{throw new Stop({kind:'runtime-required',boundary,nativeAddress,callSite});}
  private free(pointer:bigint){
    if(!this.services.crtFree)this.stop('crt-free',0x1425cec00n,0x14222f060n);
    this.services.crtFree(pointer);
  }
  private backing(allocator:bigint){
    const target=this.q(this.q(allocator)+0x38n);
    if(target===0x1401693c0n)return this.q(allocator+0x20n);
    if(!this.services.allocatorGetter)this.stop('allocator-getter',target,0x140122515n);
    return u64(this.services.allocatorGetter(target,allocator));
  }
  private release(allocator:bigint,pointer:bigint,site:bigint):void{
    const target=this.q(this.q(allocator)+0x10n);
    if(target===0x140122500n){if(pointer!==u64(allocator+8n))this.release(this.backing(allocator),pointer,0x140122526n);return;}
    if(target===0x14011d560n){if(pointer!==0n)this.free(pointer);return;}
    if(!this.services.release)this.stop('allocator-release',target,site);
    this.services.release(target,allocator,pointer);
  }
  destroy(input:bigint,flags:number):ReaderLifetimeResult<bigint>{
    input=u64(input);flags>>>=0;
    try{
      // CMP precedes the vtable store, and the original branch consumes its flags.
      const ownsReader=(this.memory.readByte(u64(input+0x65n))&255)!==0;
      this.memory.writeQword(input,0x142c04d80n);
      if(ownsReader){
        const reader=this.q(input+8n);
        if(reader!==0n){
          const target=this.q(this.q(reader));
          if(target!==0x142573600n)this.stop('input-reader-destructor',target,0x14253de80n);
          const result=new NativeReaderLifetime(this.memory,this.services).destroyReader(reader,1);
          if(result.kind!=='returned')throw new Stop(result);
        }
      }
      const pointer=this.q(input+0x20n);
      if(pointer!==0n){
        const allocator=this.q(input+0x30n);
        this.memory.writeDword(u64(input+0x2cn),0);
        this.release(allocator,pointer,0x14253de99n);
        this.memory.writeQword(u64(input+0x20n),0n);
        this.memory.writeDword(u64(input+0x28n),0);
      }
      if((flags&1)!==0)this.free(input);
      return {kind:'returned',value:input};
    }catch(error){if(error instanceof Stop)return error.result;throw error;}
  }
}
