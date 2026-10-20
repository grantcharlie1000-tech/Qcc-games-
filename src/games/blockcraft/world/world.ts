import {AIR,B,BLOCK_COUNT,OPAQUE} from '../data/blocks';
import {CS,CH,LAYER,CHUNK_VOLUME,chunkKey,keyX,keyZ} from '../engine/constants';
import type {Chunk,ChunkData,ChangeCause,World,BlockId,GameEvents} from '../engine/contracts';
import type {EventBus} from '../engine/events';

export const MAX_EDITS=200000;

export function computeHeightmap(blocks:Uint8Array,out=new Int16Array(LAYER)):Int16Array{
  for(let c=0;c<LAYER;c++){let y=CH-1;while(y>=0&&blocks[c+y*LAYER]===AIR)y--;out[c]=y;}
  return out;
}

/** Voxel storage for loaded chunks plus every edit (kept while chunks unload). */
export class VoxelWorld implements World{
  readonly chunks=new Map<number,Chunk>();
  readonly edits=new Map<number,Map<number,number>>();
  private editTotal=0;
  /** Chunks whose mesh must be rebuilt (consumed by engine/streaming.ts). */
  readonly dirty=new Set<number>();
  /** Returns the daylight darkening 0..11 (set by the engine from the time of day). */
  skyDarkening=0;
  constructor(private events?:EventBus<GameEvents>,private biomeFallback:(x:number,z:number)=>number=()=>0){}
  get editCount(){return this.editTotal;}
  chunk(cx:number,cz:number){return this.chunks.get(chunkKey(cx,cz));}
  isLoaded(x:number,z:number){return this.chunks.has(chunkKey(Math.floor(x/CS),Math.floor(z/CS)));}
  /** Block id, or -1 when the chunk is not loaded. Below the world is bedrock, above is air. */
  get(wx:number,wy:number,wz:number):number{
    if(wy<0)return B.bedrock;if(wy>=CH)return AIR;
    const cx=Math.floor(wx/CS),cz=Math.floor(wz/CS),chunk=this.chunks.get(chunkKey(cx,cz));
    if(!chunk)return -1;
    return chunk.blocks[(wx-cx*CS)+(wz-cz*CS)*CS+wy*LAYER];
  }
  set(wx:number,wy:number,wz:number,id:BlockId,cause:ChangeCause='player'):boolean{
    if(wy<0||wy>=CH||id<0||id>=BLOCK_COUNT||!Number.isInteger(wx)||!Number.isInteger(wy)||!Number.isInteger(wz))return false;
    const cx=Math.floor(wx/CS),cz=Math.floor(wz/CS),chunk=this.chunks.get(chunkKey(cx,cz));
    if(!chunk)return false;
    const lx=wx-cx*CS,lz=wz-cz*CS,index=lx+lz*CS+wy*LAYER,from=chunk.blocks[index];
    if(from===id)return false;
    let edits=this.edits.get(chunk.key);
    if(!edits){edits=new Map();this.edits.set(chunk.key,edits);}
    if(!edits.has(index)){if(this.editTotal>=MAX_EDITS)return false;this.editTotal++;}
    edits.set(index,id);chunk.blocks[index]=id;
    // Heightmap
    const column=lx+lz*CS;
    if(id!==AIR&&wy>chunk.heightmap[column])chunk.heightmap[column]=wy;
    else if(id===AIR&&wy===chunk.heightmap[column]){let y=wy;while(y>=0&&chunk.blocks[column+y*LAYER]===AIR)y--;chunk.heightmap[column]=y;}
    this.markAround(cx,cz,lx,lz,OPAQUE[from]!==OPAQUE[id]||from!==id);
    this.events?.emit('blockChanged',{x:wx,y:wy,z:wz,from,to:id,cause});
    return true;
  }
  /** Marks the chunk dirty and neighbours whose padded border, AO or light can see this voxel. */
  private markAround(cx:number,cz:number,lx:number,lz:number,lightChange:boolean){
    this.dirty.add(chunkKey(cx,cz));
    // Light can travel up to 15 blocks, so a light-affecting edit reaches every neighbour.
    const reach=lightChange?15:1;
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dz)continue;
      if(dx===-1&&lx>=reach||dx===1&&lx<CS-reach||dz===-1&&lz>=reach||dz===1&&lz<CS-reach)continue;
      const key=chunkKey(cx+dx,cz+dz);if(this.chunks.has(key))this.dirty.add(key);
    }
  }
  invalidate(x:number,_y:number,z:number){
    const cx=Math.floor(x/CS),cz=Math.floor(z/CS);this.markAround(cx,cz,x-cx*CS,z-cz*CS,true);
  }
  biomeAt(x:number,z:number){
    const cx=Math.floor(x/CS),cz=Math.floor(z/CS),chunk=this.chunks.get(chunkKey(cx,cz));
    return chunk?chunk.biomes[(x-cx*CS)+(z-cz*CS)*CS]:this.biomeFallback(x,z);
  }
  topY(x:number,z:number){
    const cx=Math.floor(x/CS),cz=Math.floor(z/CS),chunk=this.chunks.get(chunkKey(cx,cz));
    return chunk?chunk.heightmap[(x-cx*CS)+(z-cz*CS)*CS]:-1;
  }
  lightAt(x:number,y:number,z:number){
    if(y>=CH)return 0xf0;if(y<0)return 0;
    const cx=Math.floor(x/CS),cz=Math.floor(z/CS),chunk=this.chunks.get(chunkKey(cx,cz));
    if(!chunk)return 0xf0;
    const lx=x-cx*CS,lz=z-cz*CS;
    if(chunk.light)return chunk.light[lx+lz*CS+y*LAYER];
    return y>chunk.heightmap[lx+lz*CS]?0xf0:0;
  }
  brightnessAt(x:number,y:number,z:number){
    const l=this.lightAt(x,y,z);return Math.max(l&15,(l>>4)-this.skyDarkening);
  }
  /** Adds generated chunk contents, replaying any edits recorded for it. */
  insert(cx:number,cz:number,data:ChunkData):Chunk{
    const key=chunkKey(cx,cz),edits=this.edits.get(key);
    if(edits)for(const [index,id] of edits)data.blocks[index]=id;
    const chunk:Chunk={cx,cz,key,blocks:data.blocks,biomes:data.biomes,light:null,heightmap:computeHeightmap(data.blocks)};
    this.chunks.set(key,chunk);this.events?.emit('chunkLoaded',{cx,cz});
    return chunk;
  }
  remove(key:number){if(this.chunks.delete(key)){this.dirty.delete(key);this.events?.emit('chunkUnloaded',{cx:keyX(key),cz:keyZ(key)});}}
  clear(){for(const key of [...this.chunks.keys()])this.remove(key);this.edits.clear();this.editTotal=0;this.dirty.clear();}
  /** Flat list: cx, cz, count, then index/id pairs. */
  serializeEdits():number[]{
    const out:number[]=[];
    for(const [key,edits] of this.edits){
      if(!edits.size)continue;
      out.push(keyX(key),keyZ(key),edits.size);
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
      if(!Number.isInteger(cx)||!Number.isInteger(cz)||!Number.isInteger(count)||count<0||Math.abs(cx)>=0x7fff||Math.abs(cz)>=0x7fff)return false;
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
