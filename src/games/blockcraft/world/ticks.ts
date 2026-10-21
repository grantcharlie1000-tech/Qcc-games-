// World simulation (game.ticks): random ticks, scheduled ticks, reactions to block changes and explosions.
//  - Random ticks (vanilla randomTickSpeed 3): each tick, 3 random cells of every 16×16×16 section that holds a
//    random-ticking block, in loaded chunks within 8 chunks of the player whose eight neighbours are loaded too.
//    Handlers: growth.ts (crops, saplings, grass, mycelium, farmland, sugar cane, cactus, melting, leaf decay, copper)
//    and fire.ts (lava setting fires, fire fallback).
//  - Scheduled ticks (a priority queue, one pending tick per position and kind, persisted): fluids (fluids.ts), falling
//    blocks (ticks-entities.ts), support pop-offs, farmland under solid blocks, fire (fire.ts) and leaf decay checks.
//    A tick runs only when every chunk within 8 blocks is loaded; otherwise it waits for the missing chunk.
//  - Explosions: explosion.ts. Entity kinds 'primed_tnt' and 'falling_block': ticks-entities.ts.
//  - blockChanged: the changed block and its six neighbours get a reaction on the next tick (vanilla onPlace /
//    neighborChanged / updateShape): liquids schedule a flow update or harden, gravity blocks over free space schedule a
//    fall, blocks that lost their support pop off with their no-tool loot (cactus and sugar cane one tick later), fire that
//    lost its footing goes out, farmland under a solid block turns to dirt. Removing a log or leaves starts leaf checks.
//  - Budget: work per tick is capped by counts (never by time, so the world stays deterministic): fluid updates, all
//    scheduled ticks, reactions, section scans and TNT explosions. Measured cost is in stats().
//  - Ambient effects near the player (fire crackle and smoke, lava pops) use a separate random so they never change the world.
import {AIR,B,FACING_VECTOR,LIQUID,SOLID,blockDef,blockId,type BlockId} from '../data/blocks';
import {CH,CS,LAYER,chunkKey} from '../engine/constants';
import {canSurvive} from '../engine/support';
import {mulberry32} from './noise';
import type {BlockTickService,Game,GameEvents,ItemStack} from '../engine/contracts';
import {FastBlocks,KIND_BLOCK,KIND_FIRE,KIND_LEAF,NEIGHBOURS,TICK_KINDS,TickQueue,keyX,keyY,keyZ,posKey,validKey,type Sim,type TickEntry} from './ticks-core';
import {fluidNeighbourChanged,fluidTick} from './fluids';
import {IS_LEAVES,IS_LOG,MAX_ORPHANS,RANDOM_TICK,RT_FIRE,RT_LAVA,growthRandomTick,leafCheck} from './growth';
import {FIRE,fireCanSurvive,fireDelay,fireTick,lavaRandomTick} from './fire';
import {explode as runExplosion} from './explosion';
import {EXPLOSION_BUDGET,PRIMED_TNT_KIND,isFree,landFallingBlock,registerWorldEntities} from './ticks-entities';

export {registerWorldEntities};

export interface TickLimits{
  /** Liquid updates per tick. */
  fluidUpdates:number;
  /** Fire ticks and leaf decay checks per tick (the costlier kinds). */
  fireTicks:number;leafChecks:number;
  /** Scheduled ticks of every kind per tick. */
  scheduled:number;
  /** Positions reacting to block changes per tick. */
  reactions:number;
  /** 16³ sections counted for random-ticking blocks per tick (once per section after a chunk loads). */
  sectionScans:number;
  /** Explosions started by primed TNT per tick (the rest wait a tick). */
  explosions:number;
  /** Ambient effect samples around the player per tick. */
  ambient:number;
}
export interface TickStats{
  /** Milliseconds spent in the last tick() and its running average. */
  ms:number;averageMs:number;
  /** Random cells picked, and those holding a block with random-tick behaviour, in the last tick. */
  randomTicks:number;randomHits:number;
  scheduled:number;fluidUpdates:number;reactions:number;pending:number;
}
export interface TickOptions{
  /** Random ticks per section per tick (vanilla gamerule randomTickSpeed, default 3). */
  randomTickSpeed?:number;
  /** Chunk radius around the player that gets random ticks (default 8). */
  randomTickRadius?:number;
}
/** The tick service with the extra hooks used by tests and the debug overlay. */
export interface BlockTicks extends BlockTickService{
  init():void;tick():void;reset():void;serialize():unknown;restore(data:unknown):void;dispose():void;
  /** Runs one block's random-tick behaviour now. */
  randomTickAt(x:number,y:number,z:number):void;
  /** Number of pending scheduled ticks (including those waiting for unloaded chunks). */
  pending():number;
  stats():TickStats;
  readonly limits:TickLimits;
}

const SECTIONS=CH/16;
const GRAVITY=new Uint8Array(256),SUPPORT=new Uint8Array(256);
const CACTUS=blockId('cactus'),SUGAR_CANE=blockId('sugar_cane'),FARMLAND=blockId('farmland'),FARMLAND_WET=blockId('farmland_wet');
for(let id=0;id<256;id++){const d=blockDef(id);if(d.id!==id)continue;GRAVITY[id]=+d.gravity;SUPPORT[id]=+(d.needsSupport&&id!==FIRE);}
const MAX_SAVED=40000,MAX_PARKED=40000,MAX_DELAY=1e6;
const READY_DX=[0,-8,8,-8,8],READY_DZ=[0,-8,-8,8,8];

export function createBlockTicks(game:Game,options:TickOptions={}):BlockTicks{
  const limits:TickLimits={fluidUpdates:160,fireTicks:64,leafChecks:24,scheduled:512,reactions:4096,sectionScans:48,explosions:6,ambient:200};
  const randomTickSpeed=Math.max(0,Math.floor(options.randomTickSpeed??3)),radius=Math.max(0,Math.floor(options.randomTickRadius??8));
  const blocks=new FastBlocks(game.world);
  const queue=new TickQueue();
  /** Ticks that came due in unloaded chunks: chunk key → flat [position key, kind, ...]. */
  const parked=new Map<number,number[]>();let parkedCount=0;
  /** Positions waiting for their reaction to a block change (FIFO, deduplicated). */
  let dirty=new Float64Array(1024),dirtyHead=0,dirtyTail=0;const dirtySet=new Set<number>();
  /** Random-ticking blocks per 16³ section of each loaded chunk; -1 = not counted yet. */
  const sections=new Map<number,Int16Array>();
  /** Chunks whose eight neighbours are loaded (random ticks run only there); cleared when chunks load or unload. */
  const ready=new Map<number,boolean>();
  function chunkReady(cx:number,cz:number,key:number){
    let r=ready.get(key);
    if(r===undefined){
      r=true;
      for(let dz=-1;dz<=1&&r;dz++)for(let dx=-1;dx<=1;dx++)if(!game.world.chunk(cx+dx,cz+dz)){r=false;break;}
      ready.set(key,r);
    }
    return r;
  }
  const fireAge=new Map<number,number>(),orphans=new Set<number>();
  const cosmetic=mulberry32(0x5eed1e55);
  const stats:TickStats={ms:0,averageMs:0,randomTicks:0,randomHits:0,scheduled:0,fluidUpdates:0,reactions:0,pending:0};
  let explosionsLeft=limits.explosions,unsubscribe:(()=>void)[]=[];
  const entry:TickEntry={key:0,kind:0,due:0};
  const now=()=>game.time.tick;

  const sim:Sim={
    game,blocks,fireAge,orphans,
    rand:()=>game.random(),
    randInt:n=>Math.floor(game.random()*n),
    cosmetic,
    schedule:(x,y,z,delay,kind=KIND_BLOCK)=>schedule(x,y,z,delay,kind),
    set:(x,y,z,id,cause)=>game.world.set(x,y,z,id,cause),
    dropLoot(id,x,y,z){
      let drops:readonly ItemStack[];try{drops=game.interaction.blockDrops(id,null);}catch{drops=[];}
      for(const s of drops)game.entities.dropItem(s,x+.25+game.random()*.5,y+.25+game.random()*.5,z+.25+game.random()*.5,
        {x:(game.random()-.5)*2,y:4,z:(game.random()-.5)*2});
    },
    destroy(x,y,z,id,cause,particles=true){
      if(!game.world.set(x,y,z,AIR,cause))return;
      if(particles)game.render.spawnParticles('block',x+.5,y+.5,z+.5,{block:id,count:12,spread:.4});
      sim.dropLoot(id,x,y,z);
    },
    placeFire(x,y,z,age){
      const key=posKey(x,y,z),had=fireAge.get(key);
      fireAge.set(key,age);
      if(game.world.set(x,y,z,FIRE,'tick'))return true;
      if(had===undefined&&blocks.get(x,y,z)!==FIRE)fireAge.delete(key);
      return false;
    },
    primeTnt(x,y,z,fuse,byPlayer){
      const e=game.entities.spawn(PRIMED_TNT_KIND.kind,x+.5,y,z+.5,{data:{fuse,byPlayer},reason:'event'});
      if(e){const a=game.random()*Math.PI*2;e.vx=-Math.sin(a)*.4;e.vy=4;e.vz=-Math.cos(a)*.4;}
      return e;
    },
    fizz(x,y,z){
      const c=cosmetic;
      game.sounds.play('fizz',{x:x+.5,y:y+.5,z:z+.5},{volume:.5,pitch:2.6+(c()-c())*.8});
      game.render.spawnParticles('large_smoke',x+.5,y+1,z+.5,{count:8,spread:.4});
    }
  };

  // ---- Scheduling --------------------------------------------------------------------------------------
  function schedule(x:number,y:number,z:number,delay:number,kind:number){
    if(!Number.isFinite(x+y+z+delay)||y<0||y>=CH)return;
    x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);
    queue.schedule(posKey(x,y,z),kind,now()+Math.max(1,Math.min(MAX_DELAY,Math.floor(delay))));
  }
  function park(key:number,kind:number,ck=chunkKey(keyX(key)>>4,keyZ(key)>>4)){
    if(parkedCount>=MAX_PARKED)return;
    let list=parked.get(ck);if(!list){list=[];parked.set(ck,list);}
    list.push(key,kind);parkedCount++;
  }
  function unpark(ck:number){
    const list=parked.get(ck);if(!list)return;
    parked.delete(ck);parkedCount-=list.length/2;
    for(let i=0;i<list.length;i+=2)queue.schedule(list[i],list[i+1],now()+1);
  }

  // ---- Reactions to block changes ----------------------------------------------------------------------
  function markDirty(key:number){
    if(dirtySet.has(key))return;
    dirtySet.add(key);
    if(dirtyTail===dirty.length){
      if(dirtyHead>0){dirty.copyWithin(0,dirtyHead,dirtyTail);dirtyTail-=dirtyHead;dirtyHead=0;}
      else{const grown=new Float64Array(dirty.length*2);grown.set(dirty);dirty=grown;}
    }
    dirty[dirtyTail++]=key;
  }
  function onBlockChanged({x,y,z,from,to}:GameEvents['blockChanged']){
    const counts=sections.get(chunkKey(x>>4,z>>4));
    if(counts){const s=y>>4;if(counts[s]>=0)counts[s]+=(RANDOM_TICK[to]?1:0)-(RANDOM_TICK[from]?1:0);}
    const key=posKey(x,y,z);
    if(from===FIRE&&to!==FIRE)fireAge.delete(key);
    if(IS_LEAVES[from]&&!IS_LEAVES[to])orphans.delete(key);
    // A log or leaf went away: the leaves around it may have lost their link to a log (vanilla leaf distance updates).
    const leafCheck=(IS_LOG[from]||IS_LEAVES[from])&&!IS_LOG[to]&&!IS_LEAVES[to];
    markDirty(key);
    for(let i=0;i<6;i++){
      const n=NEIGHBOURS[i],nx=x+n[0],ny=y+n[1],nz=z+n[2];
      if(ny<0||ny>=CH)continue;
      markDirty(posKey(nx,ny,nz));
      if(leafCheck){const id=blocks.get(nx,ny,nz);if(id>0&&IS_LEAVES[id])schedule(nx,ny,nz,1,KIND_LEAF);}
    }
  }
  function processReactions(){
    let n=0;
    while(dirtyHead<dirtyTail&&n<limits.reactions){
      const key=dirty[dirtyHead++];dirtySet.delete(key);n++;
      react(keyX(key),keyY(key),keyZ(key));
    }
    if(dirtyHead===dirtyTail)dirtyHead=dirtyTail=0;
    stats.reactions+=n;
  }
  function react(x:number,y:number,z:number){
    const id=blocks.get(x,y,z);if(id<=0)return;
    if(LIQUID[id]){fluidNeighbourChanged(sim,x,y,z,id);return;}
    if(GRAVITY[id]){if(isFree(blocks.get(x,y-1,z)))schedule(x,y,z,2,KIND_BLOCK);return;}
    if(id===FIRE){
      if(!fireCanSurvive(blocks,x,y,z)){game.world.set(x,y,z,AIR,'tick');return;}
      if(!queue.has(posKey(x,y,z),KIND_FIRE))schedule(x,y,z,fireDelay(sim),KIND_FIRE);
      return;
    }
    if(id===FARMLAND||id===FARMLAND_WET){if(SOLID[Math.max(0,blocks.get(x,y+1,z))])schedule(x,y,z,1,KIND_BLOCK);return;}
    if(SUPPORT[id]&&!supported(x,y,z,id)){
      if(id===CACTUS||id===SUGAR_CANE)schedule(x,y,z,1,KIND_BLOCK);
      else sim.destroy(x,y,z,id,'tick');
    }
  }
  /** canSurvive, plus the other half of a door or bed still being there (vanilla DoorBlock / BedBlock updateShape). */
  function supported(x:number,y:number,z:number,id:BlockId){
    if(!canSurvive(blocks,id,x,y,z))return false;
    const d=blockDef(id);
    if(d.door?.half==='lower'){
      const u=blocks.get(x,y+1,z);
      return u<0||blockDef(u).family===d.family&&blockDef(u).door?.half==='upper';
    }
    if(d.bed&&d.facing){
      // The head lies at foot - FACING_VECTOR[facing].
      const v=FACING_VECTOR[d.facing],s=d.bed.part==='foot'?-1:1,o=blocks.get(x+v[0]*s,y,z+v[1]*s);
      return o<0||blockDef(o).family==='bed'&&blockDef(o).bed?.part!==d.bed.part&&blockDef(o).facing===d.facing;
    }
    return true;
  }

  // ---- Scheduled ticks -----------------------------------------------------------------------------------
  /** Like vanilla's block-ticking chunks: a tick runs only when every chunk within 8 blocks is loaded, so flows,
   *  fire and leaf checks never misread unloaded neighbours. Returns the key of a missing chunk, or -1. */
  function missingChunk(x:number,z:number):number{
    const w=game.world;
    for(let i=0;i<5;i++){
      const cx=(x+READY_DX[i])>>4,cz=(z+READY_DZ[i])>>4;
      if(!w.chunk(cx,cz))return chunkKey(cx,cz);
    }
    return -1;
  }
  function runScheduled(){
    const t=now();let n=0,fluids=0,fires=0,leaves=0;
    while(queue.peekDue()<=t&&n<limits.scheduled&&fluids<limits.fluidUpdates&&fires<limits.fireTicks&&leaves<limits.leafChecks){
      if(!queue.pop(entry))break;
      const x=keyX(entry.key),y=keyY(entry.key),z=keyZ(entry.key),missing=missingChunk(x,z);
      if(missing>=0){park(entry.key,entry.kind,missing);continue;}
      n++;
      if(entry.kind===KIND_FIRE){fires++;fireTick(sim,x,y,z);continue;}
      if(entry.kind===KIND_LEAF){leaves++;leafCheck(sim,x,y,z);continue;}
      const id=blocks.get(x,y,z);
      if(id<=0)continue;
      if(LIQUID[id]){fluids++;fluidTick(sim,x,y,z);continue;}
      blockTick(x,y,z,id);
    }
    stats.scheduled=n;stats.fluidUpdates=fluids;
  }
  function blockTick(x:number,y:number,z:number,id:BlockId){
    if(GRAVITY[id]){if(isFree(blocks.get(x,y-1,z)))startFall(x,y,z,id);return;}
    if(id===FIRE){if(!fireCanSurvive(blocks,x,y,z))game.world.set(x,y,z,AIR,'tick');return;}
    if(id===FARMLAND||id===FARMLAND_WET){if(SOLID[Math.max(0,blocks.get(x,y+1,z))])game.world.set(x,y,z,B.dirt,'tick');return;}
    if(SUPPORT[id]&&!supported(x,y,z,id))sim.destroy(x,y,z,id,'tick');
  }
  /** FallingBlock.tick: the block becomes a falling_block entity (or, with no entity, lands at once). */
  function startFall(x:number,y:number,z:number,id:BlockId){
    const e=game.entities.spawn('falling_block',x+.5,y,z+.5,{data:{block:id,time:0},reason:'event'});
    if(!game.world.set(x,y,z,AIR,'tick')){if(e)game.entities.remove(e);return;}
    if(e)return;
    let ty=y;while(ty>0&&isFree(blocks.get(x,ty-1,z)))ty--;
    landFallingBlock(game,id,x+.5,ty,z+.5);
  }

  // ---- Random ticks --------------------------------------------------------------------------------------
  function countSection(blocksArray:Uint8Array,heightmap:Int16Array,s:number){
    let top=-1;for(let i=0;i<heightmap.length;i++)if(heightmap[i]>top)top=heightmap[i];
    if(s*16>top)return 0;
    let n=0;const end=(s+1)*16*LAYER;
    for(let i=s*16*LAYER;i<end;i++)if(RANDOM_TICK[blocksArray[i]])n++;
    return n;
  }
  function randomTicks(){
    let count=0,picks=0;
    stats.randomTicks=stats.randomHits=0;
    if(randomTickSpeed<=0)return;
    const p=game.player.state,pcx=Math.floor(p.x)>>4,pcz=Math.floor(p.z)>>4;
    let scans=0;
    for(const chunk of game.world.chunks.values()){
      if(Math.abs(chunk.cx-pcx)>radius||Math.abs(chunk.cz-pcz)>radius||!chunkReady(chunk.cx,chunk.cz,chunk.key))continue;
      let counts=sections.get(chunk.key);
      if(!counts){counts=new Int16Array(SECTIONS).fill(-1);sections.set(chunk.key,counts);}
      const b=chunk.blocks,x0=chunk.cx*CS,z0=chunk.cz*CS;
      for(let s=0;s<SECTIONS;s++){
        if(counts[s]<0){if(scans>=limits.sectionScans)continue;counts[s]=countSection(b,chunk.heightmap,s);scans++;}
        if(counts[s]<=0)continue;
        picks+=randomTickSpeed;
        for(let i=0;i<randomTickSpeed;i++){
          const r=(game.random()*4096)|0,y=s*16+(r>>8),index=(r&255)+y*LAYER,id=b[index];
          const code=RANDOM_TICK[id];if(!code)continue;
          count++;
          randomTickBlock(code,x0+(r&15),y,z0+((r>>4)&15),id);
        }
      }
    }
    stats.randomTicks=picks;stats.randomHits=count;
  }
  function randomTickBlock(code:number,x:number,y:number,z:number,id:BlockId){
    if(growthRandomTick(sim,code,x,y,z,id))return;
    if(code===RT_LAVA)lavaRandomTick(sim,x,y,z);
    else if(code===RT_FIRE&&!queue.has(posKey(x,y,z),KIND_FIRE))schedule(x,y,z,fireDelay(sim),KIND_FIRE);
  }

  // ---- Ambient effects ----------------------------------------------------------------------------------
  function ambient(){
    const p=game.player.state,bx=Math.floor(p.x),by=Math.floor(p.y),bz=Math.floor(p.z),c=cosmetic;
    for(let i=0;i<limits.ambient;i++){
      const x=bx+((c()*33)|0)-16,y=by+((c()*33)|0)-16,z=bz+((c()*33)|0)-16;
      const id=blocks.get(x,y,z);
      if(id===FIRE){
        if(c()<1/24)game.sounds.play('fire',{x:x+.5,y:y+.5,z:z+.5},{volume:.5+c()*.5,pitch:c()*.7+.3});
        game.render.spawnParticles('smoke',x+.5,y+.7,z+.5,{count:2,spread:.3});
      }else if(id>0&&LIQUID[id]===2&&blocks.get(x,y+1,z)===AIR){
        if(c()<.01){game.render.spawnParticles('lava',x+.5,y+1,z+.5,{count:1});game.sounds.play('lava',{x:x+.5,y:y+1,z:z+.5},{volume:.2+c()*.2,pitch:.9+c()*.15});}
        if(c()<.005)game.sounds.play('lava',{x:x+.5,y:y+.5,z:z+.5},{volume:.2+c()*.2,pitch:.9+c()*.15});
      }
    }
  }

  // ---- Persistence --------------------------------------------------------------------------------------
  function serialize(){
    const ticks:number[]=[],t=now();
    for(const e of queue.entries(MAX_SAVED))ticks.push(Math.max(1,e.due-t),e.key,e.kind);
    const waiting:number[]=[];
    for(const list of parked.values())for(let i=0;i<list.length&&waiting.length<MAX_PARKED*2;i++)waiting.push(list[i]);
    const reactions=Array.from(dirty.subarray(dirtyHead,Math.min(dirtyTail,dirtyHead+MAX_SAVED)));
    const fire:number[]=[];for(const [k,a] of fireAge)if(a>0)fire.push(k,a);
    return{v:1,ticks,parked:waiting,dirty:reactions,orphans:[...orphans].slice(0,MAX_ORPHANS),fire};
  }
  function restore(data:unknown){
    if(!data||typeof data!=='object')return;
    const d=data as Record<string,unknown>;if(d.v!==1)return;
    const kindOk=(k:unknown):k is number=>typeof k==='number'&&Number.isInteger(k)&&k>=0&&k<TICK_KINDS;
    const t=now();
    if(Array.isArray(d.ticks))for(let i=0;i+2<d.ticks.length&&i<MAX_SAVED*3;i+=3){
      const delay=d.ticks[i],key=d.ticks[i+1],kind=d.ticks[i+2];
      if(typeof delay!=='number'||!Number.isInteger(delay)||delay<1||delay>MAX_DELAY||!validKey(key)||!kindOk(kind))continue;
      queue.schedule(key,kind,t+delay);
    }
    if(Array.isArray(d.parked))for(let i=0;i+1<d.parked.length&&i<MAX_PARKED*2;i+=2){
      const key=d.parked[i],kind=d.parked[i+1];
      if(validKey(key)&&kindOk(kind))park(key,kind);
    }
    if(Array.isArray(d.dirty))for(const k of d.dirty.slice(0,MAX_SAVED))if(validKey(k))markDirty(k);
    if(Array.isArray(d.orphans))for(const k of d.orphans.slice(0,MAX_ORPHANS))if(validKey(k))orphans.add(k);
    if(Array.isArray(d.fire))for(let i=0;i+1<d.fire.length&&i<MAX_SAVED*2;i+=2){
      const k=d.fire[i],a=d.fire[i+1];
      if(validKey(k)&&typeof a==='number'&&Number.isInteger(a)&&a>=0&&a<=15)fireAge.set(k,a);
    }
    // Ticks waiting in chunks that are loaded already go back in the queue.
    for(const ck of [...parked.keys()])if(game.world.chunks.has(ck))unpark(ck);
  }
  function clearAll(){
    queue.clear();parked.clear();parkedCount=0;dirtyHead=dirtyTail=0;dirtySet.clear();sections.clear();ready.clear();fireAge.clear();orphans.clear();
    blocks.invalidate();explosionsLeft=limits.explosions;
  }

  const service:BlockTicks={
    limits,
    init(){
      if(unsubscribe.length)return;
      EXPLOSION_BUDGET.set(game,{take:()=>explosionsLeft-->0});
      unsubscribe=[
        game.events.on('blockChanged',onBlockChanged),
        game.events.on('chunkLoaded',({cx,cz})=>{blocks.invalidate();ready.clear();const k=chunkKey(cx,cz);sections.delete(k);unpark(k);}),
        game.events.on('chunkUnloaded',({cx,cz})=>{blocks.invalidate();ready.clear();sections.delete(chunkKey(cx,cz));})
      ];
    },
    tick(){
      const t0=performance.now();
      blocks.invalidate();
      stats.reactions=0;
      processReactions();
      runScheduled();
      randomTicks();
      processReactions();
      if(limits.ambient>0)ambient();
      explosionsLeft=limits.explosions;
      const ms=performance.now()-t0;
      stats.ms=ms;stats.averageMs+=(ms-stats.averageMs)*.05;stats.pending=queue.size+parkedCount;
    },
    schedule(x,y,z,delay){schedule(x,y,z,delay,KIND_BLOCK);},
    explode(x,y,z,power,source=null,byPlayer=false,fire=false){
      runExplosion(sim,x,y,z,power,source??null,!!byPlayer,!!fire);
    },
    randomTickAt(x,y,z){
      x=Math.floor(x);y=Math.floor(y);z=Math.floor(z);
      const id=blocks.get(x,y,z);if(id<=0)return;
      const code=RANDOM_TICK[id];if(code)randomTickBlock(code,x,y,z,id);
    },
    pending:()=>queue.size+parkedCount,
    stats:()=>stats,
    reset(){clearAll();},
    serialize,
    restore(data){try{restore(data);}catch{/* invalid saves are ignored */}},
    dispose(){for(const off of unsubscribe)off();unsubscribe=[];clearAll();EXPLOSION_BUDGET.delete(game);}
  };
  return service;
}
