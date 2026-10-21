// Lighting engine: vanilla-style (Java 1.20) flood-fill sky and block light for one chunk's
// padded volume. Pure and allocation-free per call; engine/streaming.ts runs it for every chunk
// build with the 3×3 neighbourhood and keeps the centre as chunk.light.
//
// Rules
//  - Sky light is 15 straight down each column until the first block with light opacity (leaves,
//    water, ice, lava, opaque cubes) or a face that occludes vertically (bottom slab, stairs, snow
//    layer, farmland; see light-shapes.ts). From there it spreads in all six directions, losing
//    max(1, LIGHT_OPACITY) per step, so it fades into caves and under overhangs, trees and water.
//  - Block light starts at LIGHT_EMISSION (torch 14, glowstone/lava/lantern/fire 15, lit furnace 13)
//    and spreads by the same rule. Emitting cubes (glowstone, lit furnace) shine out of their faces.
//  - Opaque cubes and missing chunks stop all light and read 0. Above the world (y = CH) is open sky;
//    below it (y = -1) is dark.
//
// Method
//  The 3×3 neighbourhood maps onto a 48×48 working volume (centre-local x,z in -16..31, plus a floor
//  and a ceiling sentinel layer). The outermost ring (x or z = -16 or 31) is an opaque bounds
//  sentinel: light from there needs at least 15 steps to reach the padded rim (x,z in -1..16), so
//  the padded border equals what each neighbour computes for itself. Cells start unknown and are
//  decoded from the chunk only when the sky scan or the flood reaches them, so solid rock costs
//  nothing. Emitters are found by a word-wise scan (a 32-bit view of each chunk's block array, made
//  the first time that array is seen and cached in a WeakMap, so calls on known chunks allocate
//  nothing; every other buffer is created once per engine). Emitters and sky columns seed a bucket queue:
//  one list per light level, threaded through one reused typed pool (Int32Array cell + next).
//  The fill runs from level 15 down; a step's cost depends only on the cell entered, so a voxel's
//  first push during the fill already carries its final level. Each voxel is therefore queued at
//  most once per channel, plus once more as an emitter seed, and the pool is reset per call; the
//  block channel reuses the sky channel's entries, so a call never needs more than QUEUE_BOUND.
import {LIGHT_EMISSION,LIGHT_OPACITY,OPAQUE} from '../data/blocks';
import * as constants from '../engine/constants';
import type {ChunkData,LightEngine,Vec3} from '../engine/contracts';
import * as shapes from './light-shapes';

// Module-local copies, so hot loops read plain constants rather than import bindings (which the
// test runner's module transform turns into property reads).
const {CS,CH,LAYER,CHUNK_VOLUME,PAD_X,PAD_LAYER}=constants;
const {CLASS_FACES,LIGHT_CLASS,OPAQUE_CLASS}=shapes;

type Neighbours=readonly (ChunkData|null|undefined)[];

/** Working region width (three chunks) and cells per layer. Index x' + z'*R + layer*RL with x' = x + 16. */
const R=3*CS,RL=R*R;
/** Layers: floor sentinel, y = 0..CH-1, open air above the world (y = CH), ceiling sentinel. */
const MAX_LAYERS=CH+3,VOLUME=RL*MAX_LAYERS;
/** Light travels at most 14 steps from a level-15 source before reaching 0 (each step costs at least 1). */
export const LIGHT_REACH=14;
/** Working cell byte: low nibble = cost of entering (max(1, opacity); 15 blocks light), high nibble = light class.
 *  0 = not decoded yet. */
const UNKNOWN=0,SENTINEL=0xff;
const SKY_PASS=0x100,EMIT_SHIFT=9;
/** Per block id: cell byte | SKY_PASS (opacity 0: level-15 sky light falls through unchanged) | emission << EMIT_SHIFT. */
const PACK=new Int32Array(256);
/** 1 for emitting block ids, and for each pair of ids (low byte, high byte) containing one. */
const EMITS=new Uint8Array(256),EMITS_PAIR=new Uint8Array(1<<16);
for(let id=0;id<256;id++){
  const opaque=OPAQUE[id]===1,cls=opaque?OPAQUE_CLASS:LIGHT_CLASS[id];
  const cost=opaque?15:Math.min(15,Math.max(1,LIGHT_OPACITY[id])),emission=Math.min(15,LIGHT_EMISSION[id]);
  PACK[id]=cost|cls<<4|(!opaque&&LIGHT_OPACITY[id]===0?SKY_PASS:0)|emission<<EMIT_SHIFT;
  EMITS[id]=+(emission>0);
}
for(let pair=0;pair<1<<16;pair++)EMITS_PAIR[pair]=EMITS[pair&255]|EMITS[pair>>8];
const AIR_CELL=PACK[0]&0xff;
/** Neighbour offsets in face order +x, -x, +y, -y, +z, -z (opposite face = face ^ 1). */
const OFFSET=new Int32Array([1,-1,RL,-RL,R,-R]);
const UP=2,DOWN=3;
/** Region columns: neighbour index 0..8, chunk-local column (x + z*16), inner flag; and the inverse map (-1 on the ring). */
const COLUMN_CHUNK=new Uint8Array(RL),COLUMN_LOCAL=new Uint16Array(RL),INNER=new Uint8Array(RL),CHUNK_COLUMN=new Int16Array(9*LAYER);
const INNER_COLUMNS=new Int32Array((R-2)*(R-2));
/** Template layers: unknown cells inside a sentinel ring; open air; full sky inside. */
const UNKNOWN_LAYER=new Uint8Array(RL),AIR_LAYER=new Uint8Array(RL),SKY_LAYER=new Uint8Array(RL);
for(let z=0,n=0;z<R;z++)for(let x=0;x<R;x++){
  const col=x+z*R,chunk=(z>>4)*3+(x>>4),local=(x&15)+(z&15)*CS,inner=x>0&&x<R-1&&z>0&&z<R-1;
  COLUMN_CHUNK[col]=chunk;COLUMN_LOCAL[col]=local;INNER[col]=+inner;CHUNK_COLUMN[chunk*LAYER+local]=inner?col:-1;
  UNKNOWN_LAYER[col]=inner?UNKNOWN:SENTINEL;AIR_LAYER[col]=inner?AIR_CELL:SENTINEL;SKY_LAYER[col]=inner?15:0;
  if(inner)INNER_COLUMNS[n++]=col;
}
/** Changes beyond this count are relit with a full recompute. */
export const MAX_RELIGHT_CHANGES=256;
const WORDS_PER_LAYER=LAYER>>2;
/** Initial bucket queue pool (entries, 1 MB). Generated terrain stays well below it (see light.test.ts). */
const INITIAL_QUEUE=1<<17;
/** Most entries one call can queue: every inner cell of the window (layers 0..CH) once as an emitter seed (at most one
 *  per cell) and once more in the channel being flooded. A world that overflows the initial pool (one dense with
 *  emitters) grows it once, straight to this bound (about 4.4 MB with the links), and the larger pool is then kept. */
export const QUEUE_BOUND=2*(R-2)*(R-2)*(CH+1);

/** 32-bit views of chunk block arrays for the emitter scan (one per array, made once and kept while the array lives). */
const WORDS=new WeakMap<Uint8Array,Uint32Array|null>();
function wordsOf(blocks:Uint8Array):Uint32Array|null{
  let words=WORDS.get(blocks);
  if(words===undefined){
    words=blocks.byteOffset%4===0&&blocks.length===CHUNK_VOLUME?new Uint32Array(blocks.buffer,blocks.byteOffset,CHUNK_VOLUME>>2):null;
    WORDS.set(blocks,words);
  }
  return words&&words.length?words:null;
}
const blocksVertically=(above:number,below:number)=>(CLASS_FACES[above*6+DOWN]|CLASS_FACES[below*6+UP])===15;

/** The light engine plus diagnostics for tests and the debug overlay. */
export interface LightEngineWithStats extends LightEngine{
  /** Bucket queue pool capacity in entries (it only grows when a call needs more; unchanged = no allocation). */
  readonly queueCapacity:number;
  /** Most entries the last call queued. */
  readonly queuePeak:number;
}

export function createLightEngine():LightEngineWithStats{
  // Scratch state reused by every call.
  const cell=new Uint8Array(VOLUME),sky=new Uint8Array(VOLUME),block=new Uint8Array(VOLUME);
  const aboveClass=new Uint8Array(RL),skyTop=new Int16Array(RL),openColumns=new Int32Array(RL);
  const skyHead=new Int32Array(16),blockHead=new Int32Array(16);
  const chunks:(Uint8Array|null)[]=new Array(9).fill(null);
  const marks=new Uint8Array(CH);
  /** Bucket queue pool: voxel index and next entry of each pushed item. */
  let queueCell=new Int32Array(INITIAL_QUEUE),queueNext=new Int32Array(INITIAL_QUEUE),queued=0,peak=0;
  /** The current window: layers lo..hi of the world (see run). */
  let lo=0,hi=CH;

  function push(head:Int32Array,i:number,level:number){
    if(queued===queueCell.length){
      // Only a world dense with emitters gets here. QUEUE_BOUND is never exceeded; doubling beyond it is a safety net.
      const size=Math.max(QUEUE_BOUND,queued*2),cells=new Int32Array(size),next=new Int32Array(size);
      cells.set(queueCell);next.set(queueNext);queueCell=cells;queueNext=next;
    }
    queueCell[queued]=i;queueNext[queued]=head[level];head[level]=queued++;
  }

  /** Decodes an unknown cell from its chunk. Only called inside the window, below the world's top. */
  function decode(i:number):number{
    const layer=(i/RL)|0,col=i-layer*RL,blocks=chunks[COLUMN_CHUNK[col]];
    const value=blocks===null?SENTINEL:PACK[blocks[COLUMN_LOCAL[col]+(layer-1+lo)*LAYER]]&0xff;
    cell[i]=value;
    return value;
  }

  /** Clears the volume for layers lo..hi: unknown cells, sentinel ring and layers, open air above the world. */
  function reset(neighbours:Neighbours){
    const layers=hi-lo+3;
    for(let k=0;k<9;k++)chunks[k]=neighbours[k]?.blocks??null;
    cell.fill(SENTINEL,0,RL);cell.fill(SENTINEL,(layers-1)*RL,layers*RL);
    for(let l=1;l<layers-1;l++)cell.set(UNKNOWN_LAYER,l*RL);
    sky.fill(0,0,layers*RL);block.fill(0,0,layers*RL);
    if(hi===CH){cell.set(AIR_LAYER,(layers-2)*RL);sky.set(SKY_LAYER,(layers-2)*RL);}
    aboveClass.fill(0);
    skyHead.fill(-1);blockHead.fill(-1);queued=0;
  }

  function addEmitter(chunk:number,blocks:Uint8Array,s:number){
    const col=CHUNK_COLUMN[chunk*LAYER+(s&(LAYER-1))];
    if(col<0)return;
    const p=PACK[blocks[s]],i=((s>>8)-lo+1)*RL+col,e=p>>EMIT_SHIFT;
    cell[i]=p;block[i]=e;
    if(e>1)push(blockHead,i,e);
  }

  /** Queues every emitter in the window's layers; returns the highest layer holding any block (-1 if none). */
  function scanEmitters():number{
    const yHi=Math.min(hi,CH-1);
    let highest=-1;
    for(let c=0;c<9;c++){
      const blocks=chunks[c];
      if(!blocks)continue;
      const words=wordsOf(blocks);
      if(words){
        for(let k=(yHi+1)*WORDS_PER_LAYER-1,end=lo*WORDS_PER_LAYER;k>=end;k--){
          const w=words[k];
          if(w===0)continue;
          if((k>>6)>highest)highest=k>>6;
          if((EMITS_PAIR[w&0xffff]|EMITS_PAIR[w>>>16])===0)continue;
          for(let s=k*4;s<k*4+4;s++)if(EMITS[blocks[s]])addEmitter(c,blocks,s);
        }
      }else{
        for(let s=(yHi+1)*LAYER-1,end=lo*LAYER;s>=end;s--){
          const id=blocks[s];
          if(id===0)continue;
          if(s>>8>highest)highest=s>>8;
          if(EMITS[id])addEmitter(c,blocks,s);
        }
      }
    }
    return highest;
  }

  /** Fills sky light 15 down every open column and records each column's lowest level-15 layer in skyTop. */
  function skyColumns(highest:number){
    let open=0,allPresent=true;
    for(let k=0;k<INNER_COLUMNS.length;k++){
      const col=INNER_COLUMNS[k],blocks=chunks[COLUMN_CHUNK[col]];
      // A missing chunk: only the open air above the world is known to see the sky.
      if(!blocks){skyTop[col]=Math.min(hi+1,CH);allPresent=false;continue;}
      if(hi<CH){
        // Columns above a partial window.
        const local=COLUMN_LOCAL[col];
        let above=0,closed=false;
        for(let y=CH-1;y>hi;y--){
          const p=PACK[blocks[local+y*LAYER]],cls=(p>>4)&15;
          if(!(p&SKY_PASS)||((above|cls)!==0&&blocksVertically(above,cls))){closed=true;break;}
          above=cls;
        }
        if(closed){skyTop[col]=hi+1;continue;}
        aboveClass[col]=above;
      }
      skyTop[col]=lo;openColumns[open++]=col;
    }
    let y=Math.min(hi,CH-1);
    // Layers of open air above every chunk.
    if(hi===CH&&allPresent)for(;y>highest&&y>=lo;y--){const layer=(y-lo+1)*RL;cell.set(AIR_LAYER,layer);sky.set(SKY_LAYER,layer);}
    for(;y>=lo&&open>0;y--){
      const layer=(y-lo+1)*RL,offset=y*LAYER;
      for(let k=0;k<open;){
        const col=openColumns[k],p=PACK[chunks[COLUMN_CHUNK[col]]![COLUMN_LOCAL[col]+offset]],cls=(p>>4)&15,above=aboveClass[col],i=layer+col;
        cell[i]=p;
        if((p&SKY_PASS)&&((above|cls)===0||!blocksVertically(above,cls))){sky[i]=15;aboveClass[col]=cls;k++;}
        else{skyTop[col]=y+1;openColumns[k]=openColumns[--open];}
      }
    }
  }

  /** Sky light 15 entering neighbour `n` of a level-15 cell `i` through `face`. */
  function seedSky(i:number,n:number,face:number){
    if(sky[n]>=14)return;
    let to=cell[n];
    if(to===UNKNOWN)to=decode(n);
    const next=15-(to&15);
    if(next<=sky[n])return;
    const from=cell[i];
    if((from|to)>=16&&(CLASS_FACES[(from>>4)*6+face]|CLASS_FACES[(to>>4)*6+(face^1)])===15)return;
    sky[n]=next;
    if(next>1)push(skyHead,n,next);
  }

  /** Seeds sky light from the lowest level-15 cell of each column: down, and sideways into columns that stop higher. */
  function seedSkyColumns(){
    for(let k=0;k<INNER_COLUMNS.length;k++){
      const col=INNER_COLUMNS[k],top=skyTop[col];
      if(top>hi)continue;
      const bottom=(top-lo+1)*RL+col;
      if(top>lo)seedSky(bottom,bottom-RL,DOWN);
      for(let face=0;face<6;face++){
        if(face===UP||face===DOWN)continue;
        const offset=OFFSET[face],ncol=col+offset;
        if(!INNER[ncol])continue;
        const end=Math.min(skyTop[ncol],hi+1);
        for(let y=top,i=bottom;y<end;y++,i+=RL)seedSky(i,i+offset,face);
      }
    }
  }

  /** Floods one channel from its queued voxels, highest level first. */
  function flood(level:Uint8Array,head:Int32Array){
    for(let l=15;l>=2;l--){
      let k=head[l];head[l]=-1;
      while(k>=0){
        const i=queueCell[k];k=queueNext[k];
        if(level[i]!==l)continue; // a superseded seed: an emitter lit brighter by another source
        const from=cell[i],fromFaces=(from>>4)*6;
        for(let face=0;face<6;face++){
          const n=i+OFFSET[face];
          if(level[n]>=l-1)continue;
          let to=cell[n];
          if(to===UNKNOWN)to=decode(n);
          const next=l-(to&15);
          if(next<=level[n])continue;
          if((from|to)>=16&&(CLASS_FACES[fromFaces+face]|CLASS_FACES[(to>>4)*6+(face^1)])===15)continue;
          level[n]=next;
          if(next>1)push(head,n,next);
        }
      }
    }
  }

  function writeOut(out:Uint8Array,writeLo:number,writeHi:number){
    for(let y=writeLo;y<=writeHi;y++){
      const layer=(y-lo+1)*RL;
      for(let pz=0;pz<PAD_X;pz++){
        let i=layer+(CS-1)+(pz+CS-1)*R,o=pz*PAD_X+(y+1)*PAD_LAYER;
        for(let px=0;px<PAD_X;px++,i++,o++)out[o]=cell[i]>=0xf0?0:sky[i]<<4|block[i];
      }
    }
  }

  /** Lights world layers from..to (0 ≤ from ≤ to ≤ CH; sentinels outside) and writes padded rows writeLo..writeHi.
   *  Values are exact for rows at least LIGHT_REACH inside the window, or at the world's floor and ceiling. */
  function run(neighbours:Neighbours,out:Uint8Array,from:number,to:number,writeLo:number,writeHi:number){
    lo=from;hi=to;
    reset(neighbours);
    const highest=scanEmitters(),emitterEntries=queued;
    skyColumns(highest);
    seedSkyColumns();
    flood(sky,skyHead);
    // Sky entries are spent: the block channel reuses the pool after its emitter seeds.
    peak=queued;queued=emitterEntries;
    flood(block,blockHead);
    if(queued>peak)peak=queued;
    writeOut(out,writeLo,writeHi);
    for(let k=0;k<9;k++)chunks[k]=null;
  }

  /** Lowest y lit 15 by the sky in a column if every changed voxel in it were open air: a bound for its old and new top. */
  function lowestSkyTop(neighbours:Neighbours,x:number,z:number,changed:readonly Vec3[]):number{
    const blocks=neighbours[(Math.floor(z/CS)+1)*3+Math.floor(x/CS)+1]?.blocks;
    if(!blocks)return CH;
    for(let k=0;k<changed.length;k++){
      const c=changed[k];
      if(Math.floor(c.x)===x&&Math.floor(c.z)===z){const y=Math.floor(c.y);if(y>=0&&y<CH)marks[y]=1;}
    }
    const local=(x&15)+(z&15)*CS;
    let above=0,y=CH-1;
    for(;y>=0;y--){
      if(marks[y]){above=0;continue;}
      const p=PACK[blocks[local+y*LAYER]],cls=(p>>4)&15;
      if(!(p&SKY_PASS)||((above|cls)!==0&&blocksVertically(above,cls)))break;
      above=cls;
    }
    marks.fill(0);
    return y+1;
  }

  return{
    get queueCapacity(){return queueCell.length;},
    get queuePeak(){return peak;},
    computePadded(neighbours,out){run(neighbours,out,0,CH,-1,CH);},
    /** `changed` lists every voxel edited since `out` was computed for this same neighbourhood, in centre-chunk local
     *  coordinates (x,z in -16..31, laid out like the 3×3 neighbourhood; world x - 16*cx). Recomputes only the band of
     *  layers those edits can reach, including sky light falling further down a column that was opened or closed.
     *  An edit outside that frame or outside the world (a caller passing world coordinates) cannot be placed, so the
     *  whole volume is recomputed: slower, but never stale. */
    relightPadded(neighbours,out,changed){
      if(changed.length>MAX_RELIGHT_CHANGES){run(neighbours,out,0,CH,-1,CH);return;}
      let writeLo=CH+1,writeHi=-1;
      for(let k=0;k<changed.length;k++){
        const c=changed[k],x=Math.floor(c.x),y=Math.floor(c.y),z=Math.floor(c.z);
        if(!(x>=-CS&&x<2*CS&&z>=-CS&&z<2*CS&&y>=0&&y<CH)){run(neighbours,out,0,CH,-1,CH);return;}
        // Horizontal steps to the padded volume (x,z in -1..CS): edits further away cannot reach it.
        if(Math.max(0,-1-x,x-CS)+Math.max(0,-1-z,z-CS)>LIGHT_REACH)continue;
        writeLo=Math.min(writeLo,Math.min(y,lowestSkyTop(neighbours,x,z,changed))-LIGHT_REACH);
        writeHi=Math.max(writeHi,y+LIGHT_REACH);
      }
      if(writeLo>writeHi)return;
      writeLo=Math.max(0,writeLo);writeHi=Math.min(CH,writeHi);
      run(neighbours,out,Math.max(0,writeLo-LIGHT_REACH),Math.min(CH,writeHi+LIGHT_REACH),writeLo,writeHi);
    }
  };
}
