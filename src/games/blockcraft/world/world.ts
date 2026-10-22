import {AIR,B,BLOCK_COUNT,LIGHT_OPACITY} from '../data/blocks';
import {changesLight} from './light-shapes';
import {CS,CH,LAYER,CHUNK_VOLUME,chunkInRange,chunkKey,keyX,keyZ} from '../engine/constants';
import type {Chunk,ChunkData,ChangeCause,World,BlockId,GameEvents} from '../engine/contracts';
import type {EventBus} from '../engine/events';

export const MAX_EDITS=200000;

/** One chunk's edits as a save segment: base64 of Int16 cx and cz, then per edit a Uint16 voxel index and a Uint8 block id
 *  (little endian). About 4 characters per edit, and a plain string costs next to nothing to stringify. */
export function encodeEdits(cx:number,cz:number,edits:ReadonlyMap<number,number>):string{
  const bytes=new Uint8Array(4+edits.size*3);
  bytes[0]=cx&255;bytes[1]=(cx>>8)&255;bytes[2]=cz&255;bytes[3]=(cz>>8)&255;
  let o=4;
  edits.forEach((id,index)=>{bytes[o]=index&255;bytes[o+1]=index>>8;bytes[o+2]=id;o+=3;});
  let text='';
  for(let i=0;i<bytes.length;i+=0x6000)text+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x6000) as unknown as number[]);
  return btoa(text);
}
/** A validated save segment, or null. */
export function decodeEdits(segment:string):{cx:number;cz:number;edits:Map<number,number>}|null{
  if(segment.length>(4+CHUNK_VOLUME*3)*4/3+4)return null;
  let text:string;try{text=atob(segment);}catch{return null;}
  if(text.length<4||(text.length-4)%3)return null;
  const cx=(text.charCodeAt(0)|text.charCodeAt(1)<<8)<<16>>16,cz=(text.charCodeAt(2)|text.charCodeAt(3)<<8)<<16>>16;
  if(!chunkInRange(cx,cz))return null;
  const edits=new Map<number,number>();
  for(let i=4;i<text.length;i+=3){
    const index=text.charCodeAt(i)|text.charCodeAt(i+1)<<8,id=text.charCodeAt(i+2);
    if(index>=CHUNK_VOLUME||id>=BLOCK_COUNT)return null;
    edits.set(index,id);
  }
  return{cx,cz,edits};
}

export function computeHeightmap(blocks:Uint8Array,out=new Int16Array(LAYER)):Int16Array{
  for(let c=0;c<LAYER;c++){let y=CH-1;while(y>=0&&blocks[c+y*LAYER]===AIR)y--;out[c]=y;}
  return out;
}

/** Voxel storage for loaded chunks plus every edit (kept while chunks unload). */
export class VoxelWorld implements World{
  readonly chunks=new Map<number,Chunk>();
  readonly edits=new Map<number,Map<number,number>>();
  /** Generated ids of edited voxels in loaded chunks: an edit that restores its original is dropped. */
  private originals=new Map<number,Map<number,number>>();
  /** Chunks that have been generated at least once in this world (entity packs, structures). */
  readonly populated=new Set<number>();
  private editTotal=0;
  /** Encoded save segment of each chunk's edits, kept until those edits change (the shell saves every 5 s). */
  private segments=new Map<number,string>();
  /** Chunks whose mesh must be rebuilt now: the edited chunk and neighbours sharing its border (AO, culling, tint). */
  readonly dirty=new Set<number>();
  /** Neighbours that only need relighting (light reaches 15 blocks); rebuilt when `dirty` is empty. */
  readonly lightDirty=new Set<number>();
  /** Sky darkening 0..15 from time of day and weather (set by the engine every tick). */
  skyDarkening=0;
  constructor(private events?:EventBus<GameEvents>,private biomeFallback:(x:number,z:number)=>number=()=>0){}
  get editCount(){return this.editTotal;}
  get editsFull(){return this.editTotal>=MAX_EDITS;}
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
    let edits=this.edits.get(chunk.key),originals=this.originals.get(chunk.key);
    if(!edits){edits=new Map();this.edits.set(chunk.key,edits);}
    if(!originals){originals=new Map();this.originals.set(chunk.key,originals);}
    if(!edits.has(index)){
      if(this.editTotal>=MAX_EDITS)return false;
      this.editTotal++;if(!originals.has(index))originals.set(index,from);
    }
    if(originals.get(index)===id){edits.delete(index);originals.delete(index);this.editTotal--;}
    else edits.set(index,id);
    this.segments.delete(chunk.key);
    chunk.blocks[index]=id;
    const column=lx+lz*CS;
    if(id!==AIR&&wy>chunk.heightmap[column])chunk.heightmap[column]=wy;
    else if(id===AIR&&wy===chunk.heightmap[column]){let y=wy;while(y>=0&&chunk.blocks[column+y*LAYER]===AIR)y--;chunk.heightmap[column]=y;}
    // Shapes count too: slabs, stairs, snow layers and farmland block light through their full faces.
    this.markAround(cx,cz,lx,lz,changesLight(from,id));
    this.events?.emit('blockChanged',{x:wx,y:wy,z:wz,from,to:id,cause});
    return true;
  }
  private markAround(cx:number,cz:number,lx:number,lz:number,lightChange:boolean){
    this.dirty.add(chunkKey(cx,cz));
    for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dz)continue;
      const key=chunkKey(cx+dx,cz+dz);if(!this.chunks.has(key))continue;
      const border=!(dx===-1&&lx!==0||dx===1&&lx!==CS-1||dz===-1&&lz!==0||dz===1&&lz!==CS-1);
      if(border)this.dirty.add(key);
      // Light reaches 15 blocks, so a light change can alter any neighbour's border light.
      else if(lightChange)this.lightDirty.add(key);
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
    // Not lit yet: full sky when nothing from this cell up blocks sky light (short grass, flowers, snow layers).
    const column=lx+lz*CS,top=chunk.heightmap[column];
    for(let yy=y;yy<=top;yy++)if(LIGHT_OPACITY[chunk.blocks[column+yy*LAYER]])return 0;
    return 0xf0;
  }
  brightnessAt(x:number,y:number,z:number){
    const l=this.lightAt(x,y,z);return Math.max(l&15,(l>>4)-this.skyDarkening);
  }
  /** Adds generated chunk contents, replaying edits (and dropping edits that equal the generated block). */
  insert(cx:number,cz:number,data:ChunkData):Chunk{
    const key=chunkKey(cx,cz),edits=this.edits.get(key),originals=new Map<number,number>();
    if(edits)for(const [index,id] of edits){
      const generated=data.blocks[index];
      if(generated===id){edits.delete(index);this.editTotal--;this.segments.delete(key);continue;}
      originals.set(index,generated);data.blocks[index]=id;
    }
    this.originals.set(key,originals);
    const fresh=!this.populated.has(key);this.populated.add(key);
    const chunk:Chunk={cx,cz,key,blocks:data.blocks,biomes:data.biomes,light:null,heightmap:computeHeightmap(data.blocks)};
    this.chunks.set(key,chunk);this.events?.emit('chunkLoaded',{cx,cz,fresh});
    return chunk;
  }
  remove(key:number){
    if(this.chunks.delete(key)){this.dirty.delete(key);this.lightDirty.delete(key);this.originals.delete(key);this.events?.emit('chunkUnloaded',{cx:keyX(key),cz:keyZ(key)});}
  }
  clear(){for(const key of [...this.chunks.keys()])this.remove(key);this.edits.clear();this.segments.clear();this.originals.clear();this.populated.clear();this.editTotal=0;this.dirty.clear();this.lightDirty.clear();}
  /** One encoded segment per edited chunk (encodeEdits). Unchanged chunks reuse their segment, so an autosave costs about
   *  nothing until edits change, however many there are. */
  serializeEdits():string[]{
    const out:string[]=[];
    this.edits.forEach((edits,key)=>{
      if(!edits.size)return;
      let segment=this.segments.get(key);
      if(segment===undefined){segment=encodeEdits(keyX(key),keyZ(key),edits);this.segments.set(key,segment);}
      out.push(segment);
    });
    return out;
  }
  /** Flat list of populated chunk coordinates: cx, cz, cx, cz... */
  serializePopulated():number[]{const out:number[]=[];for(const key of this.populated)out.push(keyX(key),keyZ(key));return out;}
  restorePopulated(list:unknown){
    if(!Array.isArray(list)||list.length%2||list.length>2e5)return;
    this.populated.clear();
    for(let i=0;i<list.length;i+=2){const x=list[i],z=list[i+1];if(Number.isInteger(x)&&Number.isInteger(z)&&chunkInRange(x,z))this.populated.add(chunkKey(x,z));}
  }
  /** Validates the whole list before replacing current edits: segments (serializeEdits), or the flat list of older saves
   *  (cx, cz, count, then index/id pairs). */
  restoreEdits(list:unknown):boolean{
    if(!Array.isArray(list))return false;
    const parsed=new Map<number,Map<number,number>>();let total=0;
    if(typeof list[0]==='string'){
      for(const segment of list){
        const s=typeof segment==='string'?decodeEdits(segment):null;if(!s)return false;
        const key=chunkKey(s.cx,s.cz);if(parsed.has(key))return false;
        total+=s.edits.size;if(total>MAX_EDITS)return false;
        if(s.edits.size)parsed.set(key,s.edits);
      }
      this.edits.clear();this.segments.clear();for(const [key,edits] of parsed)this.edits.set(key,edits);this.editTotal=total;
      return true;
    }
    for(let i=0;i<list.length;){
      const cx=list[i++],cz=list[i++],count=list[i++];
      if(!Number.isInteger(cx)||!Number.isInteger(cz)||!Number.isInteger(count)||count<0||!chunkInRange(cx,cz))return false;
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
    this.edits.clear();this.segments.clear();for(const [key,edits] of parsed)this.edits.set(key,edits);this.editTotal=total;
    return true;
  }
}
