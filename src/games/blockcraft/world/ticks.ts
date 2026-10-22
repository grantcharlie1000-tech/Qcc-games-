// World simulation (game.ticks): random ticks, scheduled ticks, reactions to block changes and explosions.
//  - Random ticks (vanilla randomTickSpeed 3): each tick, 3 random cells of every 16×16×16 section that holds a
//    random-ticking block, in loaded chunks within 8 chunks of the player whose eight neighbours are loaded too.
//    Handlers: growth.ts (crops, saplings, grass, mycelium, farmland, sugar cane, cactus, melting, leaf decay, copper)
//    and fire.ts (lava setting fires, fire fallback).
//  - Scheduled ticks (one priority queue per kind, one pending tick per position and kind, persisted): block updates
//    (falling blocks in ticks-entities.ts, support pop-offs, farmland under solid blocks), fluids (fluids.ts), fire (fire.ts)
//    and leaf decay checks (growth.ts). Each kind has its own cap per tick, so a flood or a felled canopy never holds back
//    the other kinds. A tick runs only when every chunk within 8 blocks is loaded; otherwise it waits for the missing chunk.
//  - Explosions: explosion.ts. Entity kinds 'primed_tnt' and 'falling_block': ticks-entities.ts.
//  - blockChanged: the changed block and its six neighbours get a reaction on the next tick (vanilla onPlace /
//    neighborChanged / updateShape): liquids schedule a flow update or harden, gravity blocks over free space schedule a
//    fall, blocks that lost their support pop off with their no-tool loot (cactus and sugar cane one tick later), fire that
//    lost its footing goes out, farmland under a solid block turns to dirt. In creative, the other half of a door or bed the
//    player broke goes without drops (vanilla preventCreativeDropFromBottomPart). Removing a log or leaves schedules leaf
//    checks for every leaf that may have lost its link to a log (growth.ts leafSourceRemoved).
//  - Budget: work per tick is capped by counts (never by time, so the world stays deterministic): each scheduled kind, all
//    scheduled ticks, reactions, section scans and TNT explosions. Measured cost is in stats().
//  - Ambient effects near the player (fire crackle and smoke, lava pops) sample like vanilla ClientLevel.animateTick and use
//    a separate random so they never change the world.
import {hasAuthority} from '../engine/players';
import {playersOf} from '../engine/players';
import {AIR,B,FACING_VECTOR,LIQUID,SOLID,blockDef,blockId,type BlockId} from '../data/blocks';
import {CH,CS,LAYER,chunkKey} from '../engine/constants';
import {canSurvive} from '../engine/support';
import {mulberry32} from './noise';
import type {BlockTickService,Game,GameEvents,ItemStack} from '../engine/contracts';
import {FastBlocks,KIND_BLOCK,KIND_FIRE,KIND_FLUID,KIND_LEAF,NEIGHBOURS,TICK_KINDS,TickQueue,keyX,keyY,keyZ,posKey,validKey,type Sim,type TickEntry} from './ticks-core';
import {fluidNeighbourChanged,fluidTick} from './fluids';
import {IS_LEAVES,IS_LOG,MAX_ORPHANS,RANDOM_TICK,RT_FIRE,RT_LAVA,farmlandFallOn,growthRandomTick,leafCheck,leafSourceRemoved} from './growth';
import {FIRE,fireCanSurvive,fireDelay,fireTick,lavaRandomTick} from './fire';
import {explode as runExplosion} from './explosion';
import {EXPLOSION_BUDGET,PRIMED_TNT_KIND,isFree,landFallingBlock,registerWorldEntities} from './ticks-entities';

export {registerWorldEntities};

export interface TickLimits{
  /** Scheduled ticks per tick of each kind: block updates (falling blocks, support), liquid updates, fire ticks and leaf
   *  decay checks. A kind at its cap waits for the next tick without holding back the others. */
  blockTicks:number;fluidUpdates:number;fireTicks:number;leafChecks:number;
  /** Scheduled ticks of every kind together per tick. */
  scheduled:number;
  /** Positions reacting to block changes per tick. */
  reactions:number;
  /** 16³ sections counted for random-ticking blocks per tick (once per section after a chunk loads). */
  sectionScans:number;
  /** Explosions started by primed TNT per tick (the rest wait a tick). */
  explosions:number;
  /** Ambient effect samples around the player per tick and range (vanilla animateTick: 667 within 16 and 667 within 32 blocks). */
  ambient:number;
}
export interface TickStats{
  /** Milliseconds spent in the last tick() and its running average. */
  ms:number;averageMs:number;
  /** Random cells picked, and those holding a block with random-tick behaviour, in the last tick. */
  randomTicks:number;randomHits:number;
  /** Scheduled ticks run in the last tick: all of them, liquid updates, fire ticks and leaf checks. */
  scheduled:number;fluidUpdates:number;fireTicks:number;leafChecks:number;
  reactions:number;pending:number;
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
/** GRAVITY: falls; SUPPORT: pops off without support; AMBIENT: has ambient effects (fire, lava). */
const GRAVITY=new Uint8Array(256),SUPPORT=new Uint8Array(256),AMBIENT=new Uint8Array(256);
const CACTUS=blockId('cactus'),SUGAR_CANE=blockId('sugar_cane'),FARMLAND=blockId('farmland'),FARMLAND_WET=blockId('farmland_wet');
for(let id=0;id<256;id++){
  const d=blockDef(id);if(d.id!==id)continue;
  GRAVITY[id]=+d.gravity;SUPPORT[id]=+(d.needsSupport&&id!==FIRE);AMBIENT[id]=+(id===FIRE||LIQUID[id]===2);
}
/** Ambient sampling reaches 31 blocks from the player: a 5×5 chunk window, flagged per 16³ section. */
const AMBIENT_REACH=31,AMBIENT_SPAN=5,ambientSections=new Uint8Array(AMBIENT_SPAN*AMBIENT_SPAN*SECTIONS);
const ambientChunks:(Uint8Array|null)[]=new Array(AMBIENT_SPAN*AMBIENT_SPAN).fill(null);
const MAX_SAVED=40000,MAX_PARKED=40000,MAX_DELAY=1e6;
const READY_DX=[0,-8,8,-8,8],READY_DZ=[0,-8,-8,8,8];

export function createBlockTicks(game:Game,options:TickOptions={}):BlockTicks{
  const limits:TickLimits={blockTicks:256,fluidUpdates:160,fireTicks:64,leafChecks:32,scheduled:512,reactions:4096,sectionScans:48,explosions:6,ambient:667};
  const randomTickSpeed=Math.max(0,Math.floor(options.randomTickSpeed??3)),radius=Math.max(0,Math.floor(options.randomTickRadius??8));
  const blocks=new FastBlocks(game.world);
  /** One queue per tick kind (KIND_BLOCK, KIND_FIRE, KIND_LEAF, KIND_FLUID). */
  const queues=Array.from({length:TICK_KINDS},()=>new TickQueue());
  const queued=()=>{let n=0;for(const q of queues)n+=q.size;return n;};
  /** Partners of door halves and bed parts the player broke in creative: they go without drops. */
  const noLoot=new Set<number>();
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
  const stats:TickStats={ms:0,averageMs:0,randomTicks:0,randomHits:0,scheduled:0,fluidUpdates:0,fireTicks:0,leafChecks:0,reactions:0,pending:0};
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
    dropLoot(id,x,y,z,cause){
      let drops:readonly ItemStack[];try{drops=game.interaction.blockDrops(id,null,cause);}catch{drops=[];}
      for(const s of drops)game.entities.dropItem(s,x+.25+game.random()*.5,y+.25+game.random()*.5,z+.25+game.random()*.5,
        {x:(game.random()-.5)*2,y:4,z:(game.random()-.5)*2});
    },
    destroy(x,y,z,id,cause,particles=true,loot=true){
      if(!game.world.set(x,y,z,AIR,cause))return;
      if(particles){
        // Level.destroyBlock's level event 2001: break particles and the block's break sound.
        game.render.spawnParticles('block',x+.5,y+.5,z+.5,{block:id,count:12,spread:.4});
        game.sounds.play(`break:${blockDef(id).sound}`,{x:x+.5,y:y+.5,z:z+.5},{pitch:.8});
      }
      if(loot)sim.dropLoot(id,x,y,z,cause);
    },
    placeFire(x,y,z,age){
      if(!fireCanSurvive(blocks,x,y,z))return false;
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
    queues[kind].schedule(posKey(x,y,z),kind,now()+Math.max(1,Math.min(MAX_DELAY,Math.floor(delay))));
  }
  function park(key:number,kind:number,ck=chunkKey(keyX(key)>>4,keyZ(key)>>4)){
    if(parkedCount>=MAX_PARKED)return;
    let list=parked.get(ck);if(!list){list=[];parked.set(ck,list);}
    list.push(key,kind);parkedCount++;
  }
  function unpark(ck:number){
    const list=parked.get(ck);if(!list)return;
    parked.delete(ck);parkedCount-=list.length/2;
    for(let i=0;i<list.length;i+=2)queues[list[i+1]].schedule(list[i],list[i+1],now()+1);
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
  function onBlockChanged({x,y,z,from,to,cause}:GameEvents['blockChanged']){
    // An online guest does not simulate blocks (the host does): nothing to schedule.
    if(!hasAuthority(game))return;
    const counts=sections.get(chunkKey(x>>4,z>>4));
    if(counts){const s=y>>4;if(counts[s]>=0){counts[s]+=(RANDOM_TICK[to]?1:0)-(RANDOM_TICK[from]?1:0);counts[SECTIONS+s]+=AMBIENT[to]-AMBIENT[from];}}
    const key=posKey(x,y,z);
    if(from===FIRE&&to!==FIRE)fireAge.delete(key);
    if(IS_LEAVES[from]&&!IS_LEAVES[to])orphans.delete(key);
    // A log or leaf went away: leaves that may have lost their link to a log through it get a check (vanilla leaf distance
    // updates). This runs now, while the rest of the canopy is as it was.
    if((IS_LOG[from]||IS_LEAVES[from])&&!IS_LOG[to]&&!IS_LEAVES[to])leafSourceRemoved(sim,x,y,z,IS_LOG[from]===1);
    if(cause==='player'&&game.settings.mode==='creative'){const p=partnerKey(x,y,z,from);if(p>=0)noLoot.add(p);}
    markDirty(key);
    for(let i=0;i<6;i++){
      const n=NEIGHBOURS[i],ny=y+n[1];
      if(ny<0||ny>=CH)continue;
      markDirty(posKey(x+n[0],ny,z+n[2]));
    }
  }
  /** Position key of the other half of a door or bed part, or -1. */
  function partnerKey(x:number,y:number,z:number,id:BlockId){
    const d=blockDef(id);
    if(d.door){const py=y+(d.door.half==='lower'?1:-1);return py>=0&&py<CH?posKey(x,py,z):-1;}
    if(d.bed&&d.facing){const v=FACING_VECTOR[d.facing],s=d.bed.part==='foot'?-1:1;return posKey(x+v[0]*s,y,z+v[1]*s);}
    return -1;
  }
  function processReactions(){
    let n=0;
    while(dirtyHead<dirtyTail&&n<limits.reactions){
      const key=dirty[dirtyHead++];dirtySet.delete(key);n++;
      react(keyX(key),keyY(key),keyZ(key),key);
    }
    if(dirtyHead===dirtyTail){dirtyHead=dirtyTail=0;noLoot.clear();}
    stats.reactions+=n;
  }
  function react(x:number,y:number,z:number,key:number){
    const id=blocks.get(x,y,z);if(id<=0)return;
    if(LIQUID[id]){fluidNeighbourChanged(sim,x,y,z,id);return;}
    if(GRAVITY[id]){if(isFree(blocks.get(x,y-1,z)))schedule(x,y,z,2,KIND_BLOCK);return;}
    if(id===FIRE){
      if(!fireCanSurvive(blocks,x,y,z)){game.world.set(x,y,z,AIR,'tick');return;}
      if(!queues[KIND_FIRE].has(key,KIND_FIRE))schedule(x,y,z,fireDelay(sim),KIND_FIRE);
      return;
    }
    if(id===FARMLAND||id===FARMLAND_WET){if(SOLID[Math.max(0,blocks.get(x,y+1,z))])schedule(x,y,z,1,KIND_BLOCK);return;}
    if(SUPPORT[id]&&!supported(x,y,z,id)){
      if(id===CACTUS||id===SUGAR_CANE)schedule(x,y,z,1,KIND_BLOCK);
      else sim.destroy(x,y,z,id,'tick',true,!(noLoot.size&&noLoot.delete(key)));
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
  /** Each kind runs its due ticks up to its own cap (blocks first, then liquids, like vanilla's block and fluid tick lists),
   *  all of them together up to limits.scheduled; what is left waits for the next tick at the front of its queue. */
  const KIND_ORDER=[KIND_BLOCK,KIND_FLUID,KIND_FIRE,KIND_LEAF];
  const kindCap=(kind:number)=>kind===KIND_FLUID?limits.fluidUpdates:kind===KIND_FIRE?limits.fireTicks:kind===KIND_LEAF?limits.leafChecks:limits.blockTicks;
  function runScheduled(){
    const t=now();let n=0,fluids=0;
    stats.fireTicks=stats.leafChecks=0;
    for(const kind of KIND_ORDER){
      const q=queues[kind],cap=kindCap(kind);let done=0;
      while(done<cap&&n<limits.scheduled&&q.peekDue()<=t){
        if(!q.pop(entry))break;
        const x=keyX(entry.key),y=keyY(entry.key),z=keyZ(entry.key),missing=missingChunk(x,z);
        if(missing>=0){park(entry.key,kind,missing);continue;}
        n++;done++;
        if(kind===KIND_FIRE)fireTick(sim,x,y,z);
        else if(kind===KIND_LEAF)leafCheck(sim,x,y,z);
        else if(kind===KIND_FLUID){fluids++;fluidTick(sim,x,y,z);}
        else{
          const id=blocks.get(x,y,z);
          if(id<=0)continue;
          // A block update that finds a liquid (game.ticks.schedule, older saves) runs its flow.
          if(LIQUID[id]){fluids++;fluidTick(sim,x,y,z);}
          else blockTick(x,y,z,id);
        }
      }
      if(kind===KIND_FIRE)stats.fireTicks=done;else if(kind===KIND_LEAF)stats.leafChecks=done;
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
  /** Counts a section's random-ticking blocks (counts[s]) and its fire and lava (counts[SECTIONS + s], for ambient effects). */
  function countSection(blocksArray:Uint8Array,heightmap:Int16Array,s:number,counts:Int16Array){
    let top=-1;for(let i=0;i<heightmap.length;i++)if(heightmap[i]>top)top=heightmap[i];
    let n=0,a=0;
    if(s*16<=top){
      const end=(s+1)*16*LAYER;
      for(let i=s*16*LAYER;i<end;i++){const id=blocksArray[i];if(RANDOM_TICK[id])n++;a+=AMBIENT[id];}
    }
    counts[s]=n;counts[SECTIONS+s]=a;
  }
  function randomTicks(){
    let count=0,picks=0;
    stats.randomTicks=stats.randomHits=0;
    if(randomTickSpeed<=0)return;
    // Chunks near any player tick (online guests keep their surroundings alive on the host).
    const players=playersOf(game);
    const near=(cx:number,cz:number)=>{for(const p of players)if(Math.abs(cx-(Math.floor(p.x)>>4))<=radius&&Math.abs(cz-(Math.floor(p.z)>>4))<=radius)return true;return false;};
    let scans=0;
    for(const chunk of game.world.chunks.values()){
      if(!near(chunk.cx,chunk.cz)||!chunkReady(chunk.cx,chunk.cz,chunk.key))continue;
      let counts=sections.get(chunk.key);
      if(!counts){counts=new Int16Array(SECTIONS*2).fill(-1);sections.set(chunk.key,counts);}
      const b=chunk.blocks,x0=chunk.cx*CS,z0=chunk.cz*CS;
      for(let s=0;s<SECTIONS;s++){
        if(counts[s]<0){if(scans>=limits.sectionScans)continue;countSection(b,chunk.heightmap,s,counts);scans++;}
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
    else if(code===RT_FIRE&&!queues[KIND_FIRE].has(posKey(x,y,z),KIND_FIRE))schedule(x,y,z,fireDelay(sim),KIND_FIRE);
  }

  // ---- Ambient effects ----------------------------------------------------------------------------------
  /** ClientLevel.animateTick: per tick, `limits.ambient` cells at rand(16) - rand(16) and as many at rand(32) - rand(32) blocks
   *  from the player on each axis (so cells near the player are sampled most); fire and lava there show their effects.
   *  Samples in 16³ sections known to hold no fire or lava are skipped without reading the world. */
  function ambient(){
    const p=game.player.state,bx=Math.floor(p.x),by=Math.floor(p.y),bz=Math.floor(p.z),c=cosmetic;
    const cx0=(bx-AMBIENT_REACH)>>4,cz0=(bz-AMBIENT_REACH)>>4;
    let any=false;
    for(let dz=0;dz<AMBIENT_SPAN;dz++)for(let dx=0;dx<AMBIENT_SPAN;dx++){
      const w=dz*AMBIENT_SPAN+dx,o=w*SECTIONS,counts=sections.get(chunkKey(cx0+dx,cz0+dz)),chunk=game.world.chunk(cx0+dx,cz0+dz);
      ambientChunks[w]=chunk?chunk.blocks:null;
      for(let s=0;s<SECTIONS;s++){const f=+(!!chunk&&(!counts||counts[s]<0||counts[SECTIONS+s]>0));ambientSections[o+s]=f;if(f)any=true;}
    }
    if(any)for(let i=0;i<limits.ambient;i++){
      // One 32-bit draw gives the six offsets (4 bits each within 16, 5 bits each within 32).
      let r=(c()*4294967296)>>>0;
      ambientAt(bx+(r&15)-(r>>>4&15),by+(r>>>8&15)-(r>>>12&15),bz+(r>>>16&15)-(r>>>20&15),cx0,cz0);
      r=(c()*4294967296)>>>0;
      ambientAt(bx+(r&31)-(r>>>5&31),by+(r>>>10&31)-(r>>>15&31),bz+(r>>>20&31)-(r>>>25&31),cx0,cz0);
    }
    ambientChunks.fill(null);
  }
  function ambientAt(x:number,y:number,z:number,cx0:number,cz0:number){
    if(y<0||y>=CH)return;
    const w=((z>>4)-cz0)*AMBIENT_SPAN+(x>>4)-cx0;
    if(!ambientSections[w*SECTIONS+(y>>4)])return;
    const b=ambientChunks[w]!,index=(x&15)+((z&15)<<4)+(y<<8),id=b[index],c=cosmetic;
    if(id===FIRE){
      // FireBlock.animateTick: a crackle one time in 24, and three puffs of large smoke.
      if(c()<1/24)game.sounds.play('fire',{x:x+.5,y:y+.5,z:z+.5},{volume:.5+c()*.5,pitch:c()*.7+.3});
      game.render.spawnParticles('large_smoke',x+.5,y+.75,z+.5,{count:3,spread:.5});
    }else if(LIQUID[id]===2&&(y+1>=CH||b[index+LAYER]===AIR)){
      // LavaFluid.animateTick: a pop with a lava particle one time in 100, the ambient sound one time in 200.
      if(c()<.01){game.render.spawnParticles('lava',x+.5,y+1,z+.5,{count:1});game.sounds.play('lava',{x:x+.5,y:y+1,z:z+.5},{volume:.2+c()*.2,pitch:.9+c()*.15});}
      if(c()<.005)game.sounds.play('lava',{x:x+.5,y:y+.5,z:z+.5},{volume:.2+c()*.2,pitch:.9+c()*.15});
    }
  }

  // ---- Persistence --------------------------------------------------------------------------------------
  function serialize(){
    const ticks:number[]=[],t=now();
    const pending=queues.flatMap(q=>q.entries(MAX_SAVED)).sort((a,b)=>a.due-b.due).slice(0,MAX_SAVED);
    for(const e of pending)ticks.push(Math.max(1,e.due-t),e.key,e.kind);
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
      queues[kind].schedule(key,kind,t+delay);
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
    for(const q of queues)q.clear();
    parked.clear();parkedCount=0;dirtyHead=dirtyTail=0;dirtySet.clear();noLoot.clear();sections.clear();ready.clear();fireAge.clear();orphans.clear();
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
        game.events.on('chunkUnloaded',({cx,cz})=>{blocks.invalidate();ready.clear();sections.delete(chunkKey(cx,cz));}),
        // Landing on farmland tramples it (FarmBlock.fallOn).
        game.events.on('playerLanded',e=>{
          if(!e)return;
          blocks.invalidate();farmlandFallOn(sim,e.fallDistance,e.x,e.y,e.z,game.player.width,game.player.height);
        })
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
      stats.ms=ms;stats.averageMs+=(ms-stats.averageMs)*.05;stats.pending=queued()+parkedCount;
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
    pending:()=>queued()+parkedCount,
    stats:()=>stats,
    reset(){clearAll();},
    serialize,
    restore(data){try{restore(data);}catch{/* invalid saves are ignored */}},
    dispose(){for(const off of unsubscribe)off();unsubscribe=[];clearAll();EXPLOSION_BUDGET.delete(game);}
  };
  return service;
}
