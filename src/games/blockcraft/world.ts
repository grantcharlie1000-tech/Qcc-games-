import {AIR,BEDROCK,BLOCK_COUNT} from './blocks';
import {CS,CH,LAYER,CHUNK_VOLUME} from './terrain';

export const chunkKey=(cx:number,cz:number)=>((cx+0x8000)&0xffff)*0x10000+((cz+0x8000)&0xffff);
export interface Chunk{cx:number;cz:number;key:number;data:Uint8Array}
export const MAX_EDITS=60000;

/** Voxel storage for loaded chunks plus every player edit (kept while chunks unload). */
export class VoxelWorld{
  readonly chunks=new Map<number,Chunk>();
  readonly edits=new Map<number,Map<number,number>>();
  private editTotal=0;
  get editCount(){return this.editTotal;}
  chunk(cx:number,cz:number){return this.chunks.get(chunkKey(cx,cz));}
  /** Block id, or -1 when the chunk is not loaded. Below the world is bedrock, above is air. */
  get(wx:number,wy:number,wz:number):number{
    if(wy<0)return BEDROCK;if(wy>=CH)return AIR;
    const cx=Math.floor(wx/CS),cz=Math.floor(wz/CS),chunk=this.chunks.get(chunkKey(cx,cz));
    if(!chunk)return -1;
    return chunk.data[(wx-cx*CS)+(wz-cz*CS)*CS+wy*LAYER];
  }
  /** Changes a loaded block and records it. Returns the changed chunk or undefined. */
  set(wx:number,wy:number,wz:number,id:number):Chunk|undefined{
    if(wy<0||wy>=CH||id<0||id>=BLOCK_COUNT)return;
    const cx=Math.floor(wx/CS),cz=Math.floor(wz/CS),chunk=this.chunks.get(chunkKey(cx,cz));
    if(!chunk)return;
    const index=(wx-cx*CS)+(wz-cz*CS)*CS+wy*LAYER;
    if(chunk.data[index]===id)return;
    let edits=this.edits.get(chunk.key);
    if(!edits){edits=new Map();this.edits.set(chunk.key,edits);}
    if(!edits.has(index)){if(this.editTotal>=MAX_EDITS)return;this.editTotal++;}
    edits.set(index,id);chunk.data[index]=id;
    return chunk;
  }
  /** Adds generated chunk contents, replaying any edits recorded for it. */
  insert(cx:number,cz:number,data:Uint8Array):Chunk{
    const key=chunkKey(cx,cz),chunk={cx,cz,key,data};
    const edits=this.edits.get(key);
    if(edits)for(const [index,id] of edits)data[index]=id;
    this.chunks.set(key,chunk);return chunk;
  }
  remove(key:number){this.chunks.delete(key);}
  clear(){this.chunks.clear();this.edits.clear();this.editTotal=0;}
  /** Flat list: cx, cz, count, then index/id pairs. */
  serializeEdits():number[]{
    const out:number[]=[];
    for(const [key,edits] of this.edits){
      if(!edits.size)continue;
      out.push(Math.floor(key/0x10000)-0x8000,(key&0xffff)-0x8000,edits.size);
      for(const [index,id] of edits)out.push(index,id);
    }
    return out;
  }
  /** Validates the whole list before replacing current edits. */
  restoreEdits(list:unknown):boolean{
    if(!Array.isArray(list))return false;
    const parsed=new Map<number,Map<number,number>>();let total=0;
    for(let i=0;i<list.length;){
      const cx=list[i++],cz=list[i++],count=list[i++];
      if(!Number.isInteger(cx)||!Number.isInteger(cz)||!Number.isInteger(count)||count<0||Math.abs(cx)>=0x8000||Math.abs(cz)>=0x8000)return false;
      if(i+count*2>list.length)return false;
      const edits=new Map<number,number>();
      for(let n=0;n<count;n++){
        const index=list[i++],id=list[i++];
        if(!Number.isInteger(index)||index<0||index>=CHUNK_VOLUME||!Number.isInteger(id)||id<0||id>=BLOCK_COUNT)return false;
        edits.set(index,id);
      }
      total+=edits.size;if(total>MAX_EDITS)return false;
      parsed.set(chunkKey(cx,cz),edits);
    }
    this.edits.clear();for(const [key,edits] of parsed)this.edits.set(key,edits);this.editTotal=total;
    return true;
  }
}
