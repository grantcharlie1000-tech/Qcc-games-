// Shared plumbing of the world simulation (world/ticks.ts): packed block positions, a fast block reader
// with a one-chunk cache, the scheduled-tick priority queue, and the context handed to the handlers in
// fluids.ts, growth.ts, fire.ts and explosion.ts.
import {AIR,B} from '../data/blocks';
import {CH} from '../engine/constants';
import type {BlockId,BlockSource,ChangeCause,Entity,Game,World} from '../engine/contracts';

// ---- Positions ----------------------------------------------------------------------------------
// x and z fit in 20 bits each (chunk coordinates are limited to ±0x7fff), y in 7 bits: the key is an
// exact integer below 2^47, safe in JSON and as a Map key.
const OFFSET=1<<19,SPAN=1<<20;
export const MAX_KEY=SPAN*SPAN*CH;
export const posKey=(x:number,y:number,z:number)=>((x+OFFSET)*SPAN+(z+OFFSET))*CH+y;
export const keyY=(key:number)=>key%CH;
export const keyZ=(key:number)=>((key-key%CH)/CH)%SPAN-OFFSET;
export const keyX=(key:number)=>Math.floor((key-key%CH)/CH/SPAN)-OFFSET;
export function keyPos(key:number):{x:number;y:number;z:number}{return{x:keyX(key),y:keyY(key),z:keyZ(key)};}
export const validKey=(key:unknown):key is number=>typeof key==='number'&&Number.isInteger(key)&&key>=0&&key<MAX_KEY;
/** The six face neighbours, in face order (+x, -x, +y, -y, +z, -z). */
export const NEIGHBOURS:readonly (readonly [number,number,number])[]=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

/** World reads for hot loops: caches the last chunk touched. Same results as World.get (bedrock below 0,
 *  air above the top, -1 when unloaded). Call invalidate() when chunks load or unload. */
export class FastBlocks implements BlockSource{
  private cx=NaN;private cz=NaN;private blocks:Uint8Array|null=null;
  constructor(private readonly world:World){}
  invalidate(){this.cx=NaN;this.cz=NaN;this.blocks=null;}
  get(x:number,y:number,z:number):number{
    if(y<0)return B.bedrock;
    if(y>=CH)return AIR;
    const cx=x>>4,cz=z>>4;
    if(cx!==this.cx||cz!==this.cz){this.cx=cx;this.cz=cz;this.blocks=this.world.chunk(cx,cz)?.blocks??null;}
    const b=this.blocks;
    return b?b[(x&15)+((z&15)<<4)+(y<<8)]:-1;
  }
}

// ---- Scheduled ticks ----------------------------------------------------------------------------
/** What a scheduled tick does: a block update (falling blocks, support; a liquid found there flows too), a fire tick,
 *  a leaf decay check, or a liquid flow update. Each kind has its own queue and per-tick cap (like vanilla's separate
 *  block and fluid tick lists), so a backlog of one kind never holds back the others. */
export const KIND_BLOCK=0,KIND_FIRE=1,KIND_LEAF=2,KIND_FLUID=3;
export const TICK_KINDS=4;
export interface TickEntry{key:number;kind:number;due:number}

/** Binary min-heap ordered by (due tick, scheduling order), stored in parallel arrays (no allocation per entry).
 *  Like vanilla, a position holds at most one pending tick per kind: scheduling again keeps the first. */
export class TickQueue{
  private due:number[]=[];private seq:number[]=[];private keys:number[]=[];private kinds:number[]=[];
  private counter=0;
  /** key × 4 + kind → due tick of the pending entry. */
  private readonly pendingMap=new Map<number,number>();
  get size(){return this.pendingMap.size;}
  has(key:number,kind:number){return this.pendingMap.has(key*4+kind);}
  schedule(key:number,kind:number,due:number):boolean{
    const id=key*4+kind;
    if(this.pendingMap.has(id))return false;
    this.pendingMap.set(id,due);
    let i=this.due.length;
    this.due.push(due);this.seq.push(this.counter++);this.keys.push(key);this.kinds.push(kind);
    while(i>0){const p=(i-1)>>1;if(!this.less(i,p))break;this.swap(i,p);i=p;}
    return true;
  }
  /** Due tick of the earliest entry (Infinity when empty). */
  peekDue(){return this.due.length?this.due[0]:Infinity;}
  /** Removes the earliest entry into `out`; false when empty. */
  pop(out:TickEntry):boolean{
    while(this.due.length){
      out.due=this.due[0];out.key=this.keys[0];out.kind=this.kinds[0];
      this.removeTop();
      const id=out.key*4+out.kind;
      if(this.pendingMap.get(id)===out.due){this.pendingMap.delete(id);return true;}
    }
    return false;
  }
  clear(){this.due.length=this.seq.length=this.keys.length=this.kinds.length=0;this.pendingMap.clear();this.counter=0;}
  /** Pending entries in execution order, at most `limit`. */
  entries(limit:number):TickEntry[]{
    const order:number[]=[];
    for(let i=0;i<this.due.length;i++)if(this.pendingMap.get(this.keys[i]*4+this.kinds[i])===this.due[i])order.push(i);
    order.sort((a,b)=>this.due[a]-this.due[b]||this.seq[a]-this.seq[b]);
    return order.slice(0,limit).map(i=>({key:this.keys[i],kind:this.kinds[i],due:this.due[i]}));
  }
  private less(a:number,b:number){return this.due[a]<this.due[b]||this.due[a]===this.due[b]&&this.seq[a]<this.seq[b];}
  private swap(a:number,b:number){
    let t=this.due[a];this.due[a]=this.due[b];this.due[b]=t;t=this.seq[a];this.seq[a]=this.seq[b];this.seq[b]=t;
    t=this.keys[a];this.keys[a]=this.keys[b];this.keys[b]=t;t=this.kinds[a];this.kinds[a]=this.kinds[b];this.kinds[b]=t;
  }
  private removeTop(){
    const last=this.due.length-1;
    if(last>0)this.swap(0,last);
    this.due.pop();this.seq.pop();this.keys.pop();this.kinds.pop();
    let i=0;const n=this.due.length;
    for(;;){
      const l=i*2+1,r=l+1;let m=i;
      if(l<n&&this.less(l,m))m=l;
      if(r<n&&this.less(r,m))m=r;
      if(m===i)break;
      this.swap(i,m);i=m;
    }
  }
}

// ---- Handler context ------------------------------------------------------------------------------
/** What the simulation handlers may do. All gameplay randomness goes through rand()/randInt() (game.random);
 *  cosmetic() is a separate generator for sounds and particles so effects never change the world. */
export interface Sim{
  readonly game:Game;
  readonly blocks:FastBlocks;
  rand():number;
  /** Uniform integer in [0, n). */
  randInt(n:number):number;
  cosmetic():number;
  /** Schedules a tick of `kind` (default KIND_BLOCK) after `delay` ticks; a pending one is kept. */
  schedule(x:number,y:number,z:number,delay:number,kind?:number):void;
  set(x:number,y:number,z:number,id:BlockId,cause:ChangeCause):boolean;
  /** Pops the no-tool loot of a block (interaction.blockDrops(id, null)) at its centre. */
  dropLoot(id:BlockId,x:number,y:number,z:number):void;
  /** Breaks a block in place: block particles (unless `particles` is false), its loot (unless `loot` is false), then air. */
  destroy(x:number,y:number,z:number,id:BlockId,cause:ChangeCause,particles?:boolean,loot?:boolean):void;
  /** Fire age (0..15) by position; missing = 0. */
  readonly fireAge:Map<number,number>;
  /** Leaves found with no log within LEAF_DECAY_DISTANCE; non-persistent ones decay on their next random tick. */
  readonly orphans:Set<number>;
  /** Places fire with an age. */
  placeFire(x:number,y:number,z:number,age:number):boolean;
  /** Spawns a primed_tnt at a block position (the block is already gone). */
  primeTnt(x:number,y:number,z:number,fuse:number,byPlayer:boolean,source?:Entity|null):Entity|null;
  /** Lava meeting water: hiss and smoke. */
  fizz(x:number,y:number,z:number):void;
}
