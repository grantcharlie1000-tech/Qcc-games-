// The entity service (game.entities): registry, lifecycle, the 20 Hz simulation of every entity, combat, persistence,
// natural spawning (entity/spawning.ts), shared steering (entity/ai.ts), dropped items and orbs (entity/items.ts) and
// batched rendering (entity/model-render.ts). Behaviour follows Java 1.20:
//  - Tick (per entity, skipped while its chunk is unloaded; saved kinds then wait in the store, see Persistence):
//    despawn check, age, hurt timer, environment (fire ticks with 1 damage per second, lava 4 and 15 s of fire, fire
//    blocks, cacti, burning in daylight, drowning / drying out, suffocation, the void), the kind's tick (AI), body rotation toward the movement intent (head within 75°), physics
//    (entity/entities-physics.ts), fall damage ceil(distance − 3) (ceil(distance / 2 − 3) on beds, which also bounce;
//    none when the mob lands in water, re-checked at landing like vanilla checkFallDamage), sounds. Then mobs push each
//    other and the player (vanilla 0.05 blocks/tick), and the spawner runs.
//  - Breathing (vanilla canBreatheUnderwater): aquatic kinds and undead (EntityKind.undead) never drown. A kind that leaves
//    `undead` unset is inferred as before: undead when it burns in daylight or replaces such a kind (husk).
//  - Non-finite positions, angles, velocities and intents set by a kind or another area are reset before physics
//    (positions to the last tick's, the rest to 0) and velocities are clamped to ±MAX_SPEED, so a NaN never reaches
//    the collision loop.
//  - damage(): the kind's hurt hook may cancel; 10 ticks of hurt flash and invulnerability during which only a bigger
//    hit lands (for the difference, without knockback); knockback halves the velocity and adds the push (vertical
//    min(8, vy / 2 + strength) on the ground); death tips the body over for 20 ticks, then 20 `poof` particles and removal.
//    Amount 0 is a valid hit (snowballs, eggs, pearls): flash, invulnerability (lastHurt 0), knockback, the hurt hook and
//    the hurt sound, but no health lost. Loot always drops, experience only when the player hit it within the last 100
//    ticks (or the killing blow); entityDied reports that memory as source.byPlayer.
//  - entityRemoved is emitted once whenever an entity leaves the world: the end of the death animation, despawning and
//    remove() (not for reset(), a new world).
//  - Persistence (hostiles and kinds with persist:false are not saved): `list` holds up to 200 simulated entities, the
//    player's own (data.owner 'player') first, then the nearest to the player or the world spawn. The rest of them and
//    the entities of unloaded chunks (which leave the simulation and wait in a per-chunk store until their chunk loads)
//    are saved as `far`, up to 2000 in the same order. restore validates every field and the kind's restoreData; an
//    entry whose chunk is not loaded waits in the store.
import {OPAQUE,SOLID,blockDef,blockId} from '../data/blocks';
import {itemDef,stack as makeStack,type ItemStack} from '../data/items';
import {CH,CHUNK_LIMIT,CS,chunkKey} from '../engine/constants';
import {rayBox} from '../engine/physics';
import type {DamageSource,Entity,EntityCategory,EntityKind,EntityRay,EntityService,Game,SpawnReason,Vec3} from '../engine/contracts';
import {createEntityAI,rotateTowards,wrapAngle} from './ai';
import {bodyType,newFluidState,newMotion,resolvePhysics,sampleFluids,stepItem,stepLiving,stepOrb,stepSimple,
  type BodyType,type FluidState,type Motion,type ResolvedPhysics} from './entities-physics';
import {createItemKinds,splitXp} from './items';
import {createEntityRenderer,type EntityRenderer,type RenderRec,type RenderStats} from './model-render';
import {SPAWN_RADIUS,createSpawner,despawnsNow} from './spawning';

export const HURT_TICKS=10,DEATH_TICKS=20,MAX_SAVED=200,AIR_SUPPLY=300;
/** Entities kept with unloaded chunks (and saved as `far`); beyond it the player's own and those nearest the player or
 *  the world spawn stay. */
export const MAX_STORED=2000;
/** Ticks after a player hit during which a death still counts as a player kill (vanilla lastHurtByPlayerTime). */
export const PLAYER_KILL_MEMORY=100;
/** Vanilla knockback 0.4 blocks/tick (blocks/second here), also the cap of the vertical part. */
export const KNOCKBACK=8;
/** Largest velocity component the integrator accepts, blocks/second (vanilla arrows fly at about 60). */
export const MAX_SPEED=100;
const SAVE_VERSION=1;
const DEG=Math.PI/180,MAX_HEAD=75*DEG;
const CACTUS=blockId('cactus'),FIRE=blockId('fire');
const BED_FAMILY='bed';

interface Rec extends RenderRec{
  type:BodyType;living:boolean;phys:ResolvedPhysics|null;
  motion:Motion;fluids:FluidState;
  /** Invulnerability bookkeeping: the last hit's amount. */
  lastHurt:number;
  /** Tick of the last hit by the player. */
  playerHit:number;
  /** Ticks without being near the player or hurt (despawning). */
  idle:number;
  /** entityRemoved was emitted for it. */
  gone:boolean;
  ambient:number;stepDist:number;nextStep:number;air:number;
  headStable:number;stableHead:number;lastYaw:number;
}
interface Preset{id?:number;vx:number;vy:number;vz:number;health:number;age:number;fire:number;headYaw:number;pitch:number}
type SpawnOptions={data?:Record<string,unknown>;baby?:boolean;reason?:SpawnReason;yaw?:number};

/** A JSON-safe deep copy of untrusted data (finite numbers, short strings, small arrays and plain objects), or undefined. */
export function cleanJson(v:unknown,depth=0):unknown{
  if(v===null||typeof v==='boolean')return v;
  if(typeof v==='number')return Number.isFinite(v)?v:undefined;
  if(typeof v==='string')return v.length<=4096?v:undefined;
  if(depth>6||typeof v!=='object')return undefined;
  if(Array.isArray(v)){if(v.length>1024)return undefined;return v.map(x=>{const c=cleanJson(x,depth+1);return c===undefined?null:c;});}
  const proto=Object.getPrototypeOf(v);if(proto!==Object.prototype&&proto!==null)return undefined;
  const keys=Object.keys(v);if(keys.length>256)return undefined;
  const out:Record<string,unknown>={};
  for(const k of keys){if(k==='__proto__')continue;const c=cleanJson((v as Record<string,unknown>)[k],depth+1);if(c!==undefined)out[k]=c;}
  return out;
}
/** Overworld light-dependent brightness of a 0..15 light level (vanilla DimensionType.getBrightness: f / (4 − 3f)). */
export function sunBrightness(level:number):number{const f=level/15;return f/(4-3*f);}
const isObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const r3=(v:number)=>Math.round(v*1000)/1000;
const finiteIn=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
/** Saved x and z must name a chunk with a key of its own (the world border keeps every entity well inside). */
const XZ_MIN=-CHUNK_LIMIT*CS,XZ_MAX=CHUNK_LIMIT*CS-1;
const isLivingCategory=(c:EntityCategory)=>c==='passive'||c==='hostile'||c==='water';
const CATEGORIES:readonly EntityCategory[]=['passive','hostile','water','item','projectile','xp','misc'];

export interface EntityDebug{readonly render:RenderStats|null;readonly frozen:number;readonly searches:number;
  /** A* nodes expanded so far. */
  readonly nodes:number;
  /** Entities waiting with unloaded chunks. */
  readonly stored:number}

export function createEntities(game:Game):EntityService&{readonly debug:EntityDebug}{
  const kinds=new Map<string,EntityKind>();let kindList:EntityKind[]=[];
  const recs:Rec[]=[],list:Entity[]=[],byIdMap=new Map<number,Rec>();
  const ai=createEntityAI(game);
  let nextId=1,dirty=false,sinceTick=0,renderer:EntityRenderer|null=null;
  /** Entities of unloaded chunks in their save form, by chunk (vanilla entity chunks): a saved entity whose chunk is not
   *  loaded leaves the simulation (no entityRemoved: it is unloaded, not gone) and comes back, with its id, when the chunk
   *  loads again. Without this, everything left behind while exploring stayed frozen in memory. */
  const stored=new Map<number,Record<string,unknown>[]>();let storedCount=0;
  const unsubscribe:(()=>void)[]=[];
  const scratchPush:Rec[]=[];
  const voice=(e:Entity)=>(game.random()-game.random())*.2+(e.baby?1.5:1);
  const at=(e:Entity):Vec3=>({x:e.x,y:e.y+e.height/2,z:e.z});
  const pickable=(k:EntityKind)=>k.pickable??isLivingCategory(k.category);

  function register(kind:EntityKind){
    if(!kind||typeof kind.kind!=='string'||!kind.kind||!CATEGORIES.includes(kind.category))return;
    if(!(kind.width>0)||!(kind.height>0)||!(kind.maxHealth>0))return;
    kinds.set(kind.kind,kind);kindList=[...kinds.values()];breathing.clear();
    spawner.invalidate();renderer?.invalidate();
  }
  function create(name:string,x:number,y:number,z:number,options:SpawnOptions={},preset?:Preset):Entity|null{
    const k=kinds.get(name);if(!k)return null;
    if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))return null;
    const reason=options.reason??'event',yaw=Number.isFinite(options.yaw)?wrapAngle(options.yaw!):0;
    const data=isObject(options.data)?{...options.data}:{};
    const id=preset?.id!==undefined&&!byIdMap.has(preset.id)?preset.id:nextId;
    // Claimed before init(): an init that spawns other entities must not reuse it.
    if(id>=nextId)nextId=id+1;
    const e:Entity={id,kind:name,category:k.category,x,y,z,vx:0,vy:0,vz:0,yaw,pitch:0,headYaw:yaw,moveX:0,moveZ:0,jump:false,
      width:k.width,height:k.height,onGround:false,inWater:false,inLava:false,collidedH:false,collidedV:false,health:k.maxHealth,maxHealth:k.maxHealth,
      age:0,hurtTime:0,deathTime:0,removed:false,fire:0,baby:!!options.baby,data};
    if(preset){
      e.vx=preset.vx;e.vy=preset.vy;e.vz=preset.vz;e.health=preset.health;e.age=preset.age;e.fire=preset.fire;e.headYaw=preset.headYaw;e.pitch=preset.pitch;
    }
    try{k.init?.(e,game,reason);}catch{return null;}
    if(e.removed)return null;
    if(!(e.width>0&&e.width<64))e.width=k.width;
    if(!(e.height>0&&e.height<64))e.height=k.height;
    if(!(e.maxHealth>0)||!Number.isFinite(e.maxHealth))e.maxHealth=k.maxHealth;
    if(!Number.isFinite(e.health)||e.health<=0)e.health=e.maxHealth;
    if(e.health>e.maxHealth)e.health=e.maxHealth;
    const type=bodyType(k.category),living=type==='living';
    const rec:Rec={e,kind:k,px:x,py:y,pz:z,pyaw:e.yaw,phead:e.headYaw,ppitch:e.pitch,walkPos:0,walkSpeed:0,walkSpeedOld:0,bob:game.random()*Math.PI*2,
      frozen:false,type,living,phys:k.physics==='none'?null:resolvePhysics(type,k.physics),motion:newMotion(),fluids:newFluidState(),
      lastHurt:0,playerHit:-1e9,idle:0,gone:false,ambient:-80,stepDist:0,nextStep:1,air:AIR_SUPPLY,headStable:0,stableHead:e.headYaw,lastYaw:e.yaw};
    recs.push(rec);list.push(e);byIdMap.set(e.id,rec);
    game.events.emit('entitySpawned',{entity:e,reason});
    return e;
  }
  function remove(e:Entity){
    const r=byIdMap.get(e.id),own=r!==undefined&&r.e===e;
    if(e.removed&&!own)return;
    e.removed=true;dirty=true;ai.forget(e);
    if(own&&!r.gone){r.gone=true;game.events.emit('entityRemoved',{entity:e});}
  }
  /** Entities another area flagged removed directly (no remove() call), announced after compaction. */
  const unannounced:Entity[]=[];
  function compact(){
    if(!dirty){
      // A kind or another area may set `removed` without calling remove(): pick those up too.
      let flagged=false;for(let i=0;i<recs.length&&!flagged;i++)flagged=recs[i].e.removed;
      if(!flagged)return;
    }
    dirty=false;
    let j=0;
    for(let i=0;i<recs.length;i++){
      const r=recs[i];
      if(r.e.removed){
        if(byIdMap.get(r.e.id)===r)byIdMap.delete(r.e.id);
        if(!r.gone){r.gone=true;ai.forget(r.e);unannounced.push(r.e);}
        continue;
      }
      recs[j]=r;list[j]=r.e;j++;
    }
    recs.length=j;list.length=j;
    if(unannounced.length){
      for(const e of unannounced.splice(0))game.events.emit('entityRemoved',{entity:e});
    }
  }

  // ---- Combat ----------------------------------------------------------------------------------
  function sound(e:Entity,k:EntityKind,what:'hurt'|'death'|'ambient'){
    if(!k.sounds?.name)return;
    game.sounds.play(`mob:${k.sounds.name}:${what}`,at(e),{pitch:voice(e)});
  }
  function knockback(e:Entity,source:DamageSource){
    let x=0,z=0,strength=0;
    if(source.knockback&&Number.isFinite(source.knockback.x)&&Number.isFinite(source.knockback.z)&&Number.isFinite(source.knockback.strength)){
      ({x,z,strength}=source.knockback);
    }else if(source.kind!=='explosion'){
      const from=source.projectile??source.attacker;
      if(from){x=e.x-from.x;z=e.z-from.z;strength=KNOCKBACK;}
      else if(source.kind==='player'){const p=game.player.state;x=e.x-p.x;z=e.z-p.z;strength=KNOCKBACK;}
    }
    const len=Math.hypot(x,z);
    if(!(strength>0)||len<1e-6)return;
    e.vx=e.vx/2+x/len*strength;e.vz=e.vz/2+z/len*strength;
    if(e.onGround)e.vy=Math.min(KNOCKBACK,e.vy/2+strength);
  }
  function die(r:Rec,source:DamageSource){
    const e=r.e,k=r.kind;
    e.deathTime=1;e.health=0;e.moveX=e.moveZ=0;e.jump=false;
    sound(e,k,'death');
    const byPlayer=!!source.byPlayer||game.time.tick-r.playerHit<=PLAYER_KILL_MEMORY;
    // Listeners (kill statistics, advancements) see the player-hit memory as a player kill.
    const cause:DamageSource=byPlayer&&!source.byPlayer?{...source,byPlayer:true}:source;
    let loot:ItemStack[]=[];
    try{loot=k.drops?.(e,game,byPlayer)??[];}catch{loot=[];}
    if(Array.isArray(loot))for(const s of loot)if(s&&typeof s.id==='string'&&Number.isInteger(s.count)&&s.count>0)service.dropItem(s,e.x,e.y+.1,e.z);
    if(byPlayer){
      let xp=0;
      try{xp=typeof k.xp==='function'?k.xp(e):k.xp??0;}catch{xp=0;}
      if(Number.isFinite(xp)&&xp>=1)service.dropXp(Math.floor(xp),e.x,e.y+.25,e.z);
    }
    game.events.emit('entityDied',{entity:e,source:cause});
  }
  function damage(e:Entity,amount:number,source:DamageSource):boolean{
    const r=byIdMap.get(e.id);
    // Amount 0 is a valid hit for living entities (snowballs, eggs, pearls); negative or non-finite amounts are not.
    if(!r||r.e!==e||e.removed||e.deathTime>0||!(amount>=0)||!Number.isFinite(amount)||!source)return false;
    const k=r.kind;
    const fireKind=source.kind==='fire'||source.kind==='lava';
    if(fireKind&&k.fireImmune)return false;
    if(source.kind==='fall'&&k.noFallDamage)return false;
    if(!r.living){
      if(r.type!=='item'&&r.type!=='orb'){try{return k.hurt?.(e,game,source,amount)!==false&&!!k.hurt;}catch{return false;}}
      if(amount===0)return false;
      try{if(k.hurt?.(e,game,source,amount)===false)return false;}catch{return false;}
      e.health-=amount;
      game.events.emit('entityDamaged',{entity:e,amount,source});
      if(e.health<=0)remove(e);
      return true;
    }
    // Invulnerability frames: during the hurt time only a bigger hit lands, for the difference.
    let dealt=amount,fresh=true;
    if(e.hurtTime>0){if(amount<=r.lastHurt)return false;dealt=amount-r.lastHurt;fresh=false;}
    try{if(k.hurt?.(e,game,source,amount)===false)return false;}catch{/* a broken hook does not block damage */}
    if(e.removed||e.deathTime>0)return false;
    r.lastHurt=amount;r.idle=0;
    if(source.byPlayer||source.kind==='player')r.playerHit=game.time.tick;
    e.health-=dealt;
    if(fresh){e.hurtTime=HURT_TICKS;knockback(e,source);}
    game.events.emit('entityDamaged',{entity:e,amount:dealt,source});
    if(e.health<=0)die(r,source);
    else if(fresh){sound(e,k,'hurt');r.ambient=-80;}
    return true;
  }

  // ---- Environment -----------------------------------------------------------------------------
  const FIRE_SOURCE:DamageSource={kind:'fire'},LAVA_SOURCE:DamageSource={kind:'lava'},CACTUS_SOURCE:DamageSource={kind:'cactus'};
  const DROWN_SOURCE:DamageSource={kind:'drown'},WALL_SOURCE:DamageSource={kind:'suffocate'},VOID_SOURCE:DamageSource={kind:'void'},FALL_SOURCE:DamageSource={kind:'fall'};
  /** Fire and cactus cells touched by the box (vanilla checkInsideBlocks). Bit 1 fire, bit 2 cactus. */
  function contacts(e:Entity):number{
    const hw=e.width/2-1e-4,w=game.world;let found=0;
    for(let y=Math.floor(e.y+1e-4);y<=Math.floor(e.y+e.height-1e-4);y++)for(let z=Math.floor(e.z-hw);z<=Math.floor(e.z+hw);z++)for(let x=Math.floor(e.x-hw);x<=Math.floor(e.x+hw);x++){
      const id=w.get(x,y,z);if(id===FIRE)found|=1;else if(id===CACTUS)found|=2;
    }
    // Cactus sides are inset 1/16: touching one from the side also counts.
    if(!(found&2)){
      const g=1/16+1e-3;
      for(let y=Math.floor(e.y+1e-4);y<=Math.floor(e.y+e.height-1e-4)&&!(found&2);y++)for(let z=Math.floor(e.z-hw-g);z<=Math.floor(e.z+hw+g);z++)for(let x=Math.floor(e.x-hw-g);x<=Math.floor(e.x+hw+g);x++)
        if(w.get(x,y,z)===CACTUS){found|=2;break;}
    }
    return found;
  }
  /** Vanilla Mob.isSunBurnTick; the light curve is the overworld's DimensionType.getBrightness, f / (4 − 3f). */
  function sunBurns(e:Entity,f:FluidState):boolean{
    if(game.time.skyDarkening>=4)return false;
    const x=Math.floor(e.x),y=Math.min(CH-1,Math.max(0,Math.floor(e.y+e.height*.85))),z=Math.floor(e.z);
    const magic=sunBrightness(game.world.brightnessAt(x,y,z));
    if(magic<=.5||game.random()*30>=(magic-.4)*2)return false;
    if(f.water||game.weather.isRainingOn(x,y,z))return false;
    return(game.world.lightAt(x,y,z)>>4)>=15;
  }
  function environment(r:Rec){
    const e=r.e,k=r.kind,f=r.fluids;
    const raining=e.fire>0&&game.weather.isRainingOn(Math.floor(e.x),Math.floor(e.y+e.height),Math.floor(e.z));
    if(e.fire>0&&(f.water||raining))e.fire=0;
    if(e.fire>0){
      if(k.fireImmune)e.fire=Math.max(0,e.fire-4);
      else{if(e.fire%20===0&&!f.lava)damage(e,1,FIRE_SOURCE);e.fire=Math.max(0,e.fire-1);}
    }
    if(f.lava&&!k.fireImmune){e.fire=Math.max(e.fire,300);damage(e,4,LAVA_SOURCE);r.motion.fallDistance*=.5;}
    const touch=contacts(e);
    if(touch&1&&!k.fireImmune){e.fire=e.fire===0?160:e.fire+1;damage(e,1,FIRE_SOURCE);}
    if(touch&2)damage(e,1,CACTUS_SOURCE);
    if(k.burnsInDaylight&&!k.fireImmune&&e.deathTime===0&&sunBurns(e,f))e.fire=Math.max(e.fire,160);
    // Air: water mobs dry out on land; other aquatic mobs and undead never drown; the rest drown with the eyes under water.
    if(k.aquatic&&e.category==='water'){if(f.water)r.air=AIR_SUPPLY;else if(--r.air<=-20){r.air=0;damage(e,2,DROWN_SOURCE);}}
    else if(f.eyeInWater&&!breathes(k)){if(--r.air<=-20){r.air=0;damage(e,2,DROWN_SOURCE);}}
    else r.air=Math.min(AIR_SUPPLY,r.air+4);
    const eye=game.world.get(Math.floor(e.x),Math.floor(e.y+e.height*.85),Math.floor(e.z));
    if(eye>0&&OPAQUE[eye]&&SOLID[eye])damage(e,1,WALL_SOURCE);
    if(e.y<-64)damage(e,4,VOID_SOURCE);
  }
  /** Never drowns (vanilla canBreatheUnderwater): aquatic or undead. Kinds that do not set `undead` fall back to the old
   *  inference: undead when they burn in daylight or replace such a kind (husk). */
  const breathing=new Map<string,boolean>();
  function breathes(k:EntityKind,depth=0):boolean{
    const known=breathing.get(k.kind);if(known!==undefined)return known;
    let v=!!k.aquatic||k.undead===true;
    if(!v&&k.undead===undefined){
      v=!!k.burnsInDaylight;
      const replaced=k.spawn?.replaces;
      if(!v&&depth<4&&typeof replaced==='string'){const t=kinds.get(replaced);if(t&&t!==k)v=breathes(t,depth+1);}
    }
    breathing.set(k.kind,v);return v;
  }
  function itemEnvironment(r:Rec){
    const e=r.e;
    if(r.fluids.lava){
      game.render.spawnParticles('smoke',e.x,e.y+e.height/2,e.z,{count:4,spread:.2});
      remove(e);return;
    }
    const touch=contacts(e);
    if(touch)damage(e,1,touch&1?FIRE_SOURCE:CACTUS_SOURCE);
    if(e.y<-64)remove(e);
  }

  // ---- Body rotation (vanilla MoveControl + BodyRotationControl) ---------------------------------
  function turnBody(r:Rec){
    const e=r.e,moving=Math.hypot(e.moveX,e.moveZ)>.01;
    const aiTurned=Math.abs(wrapAngle(e.yaw-r.lastYaw))>1e-6;
    if(moving&&!aiTurned)e.yaw=rotateTowards(e.yaw,Math.atan2(-e.moveX,-e.moveZ),90*DEG);
    if(!ai.lookedAt(e)){
      if(moving)e.headYaw=rotateTowards(e.headYaw,e.yaw,10*DEG);
      e.pitch=rotateTowards(e.pitch,0,10*DEG);
    }
    const diff=wrapAngle(e.headYaw-e.yaw);
    if(moving){
      if(diff>MAX_HEAD)e.headYaw=e.yaw+MAX_HEAD;else if(diff<-MAX_HEAD)e.headYaw=e.yaw-MAX_HEAD;
      r.headStable=0;r.stableHead=e.headYaw;
    }else{
      let allowed=MAX_HEAD;
      if(Math.abs(wrapAngle(e.headYaw-r.stableHead))>15*DEG){r.headStable=0;r.stableHead=e.headYaw;}
      else if(++r.headStable>10)allowed=MAX_HEAD*(1-Math.min(1,(r.headStable-10)/10));
      if(diff>allowed)e.yaw=e.headYaw-allowed;else if(diff<-allowed)e.yaw=e.headYaw+allowed;
    }
    e.yaw=wrapAngle(e.yaw);e.headYaw=wrapAngle(e.headYaw);
  }

  // ---- Per-tick -------------------------------------------------------------------------------
  const speed=(v:number)=>Number.isFinite(v)?(v>MAX_SPEED?MAX_SPEED:v<-MAX_SPEED?-MAX_SPEED:v):0;
  /** Position and angles back to the last tick's when a kind or another area made them non-finite. */
  function saneTransform(r:Rec){
    const e=r.e;
    if(!Number.isFinite(e.x)||!Number.isFinite(e.y)||!Number.isFinite(e.z)){e.x=r.px;e.y=r.py;e.z=r.pz;e.vx=e.vy=e.vz=0;}
    if(!Number.isFinite(e.yaw))e.yaw=r.pyaw;
    if(!Number.isFinite(e.headYaw))e.headYaw=r.phead;
    if(!Number.isFinite(e.pitch))e.pitch=r.ppitch;
  }
  /** Everything physics reads: finite, bounded velocities and intents, a valid box. */
  function sane(r:Rec){
    const e=r.e,k=r.kind;
    saneTransform(r);
    e.vx=speed(e.vx);e.vy=speed(e.vy);e.vz=speed(e.vz);e.moveX=speed(e.moveX);e.moveZ=speed(e.moveZ);
    if(!(e.width>0&&e.width<64))e.width=k.width;
    if(!(e.height>0&&e.height<64))e.height=k.height;
  }
  const ORB_TARGET:Vec3={x:0,y:0,z:0};
  function physics(r:Rec){
    const e=r.e,p=r.phys,f=r.fluids,m=r.motion,w=game.world;
    if(!p){m.moved=Math.hypot(e.x-r.px,e.z-r.pz);m.landed=0;return;}
    if(r.type==='living')stepLiving(w,e,p,f,!!r.kind.aquatic,m);
    else if(r.type==='item')stepItem(w,e,p,f,m);
    else if(r.type==='orb'){
      const pl=game.player.state,alive=!game.survival.dead;
      ORB_TARGET.x=pl.x;ORB_TARGET.y=pl.y+game.player.eyeHeight()/2;ORB_TARGET.z=pl.z;
      stepOrb(w,e,p,f,m,alive?ORB_TARGET:null,game.random);
    }else stepSimple(w,e,p,f,m);
  }
  function sounds(r:Rec){
    const e=r.e,k=r.kind,s=k.sounds;
    if(s?.name&&s.ambient!==false&&e.deathTime===0&&game.random()*1000<r.ambient++){r.ambient=-80;sound(e,k,'ambient');}
    if(!e.onGround&&!r.fluids.water||r.motion.moved<=0)return;
    r.stepDist+=r.motion.moved*.6;
    if(r.stepDist<=r.nextStep)return;
    r.nextStep=r.stepDist+1;
    if(r.fluids.water){game.sounds.play('swim',at(e),{volume:Math.min(1,Math.hypot(e.vx,e.vy,e.vz)/20*.35)});return;}
    if(s?.name){if(s.step!==false)game.sounds.play(`mob:${s.name}:step`,at(e),{volume:.15});return;}
    const below=game.world.get(Math.floor(e.x),Math.floor(e.y-.2),Math.floor(e.z));
    if(below>0)game.sounds.play(`step:${blockDef(below).sound}`,at(e),{volume:.15});
  }
  function land(r:Rec){
    const e=r.e,m=r.motion,fall=m.landed;
    if(fall<=0)return;
    // Vanilla LivingEntity.checkFallDamage updates the water state first: landing in water (even a one-deep pool
    // entered during this tick) deals no damage.
    if(!e.inWater){sampleFluids(game.world,e,e.height*.85,r.fluids);e.inWater=r.fluids.water;e.inLava=r.fluids.lava;}
    if(e.inWater){m.landed=0;m.fallDistance=0;return;}
    const below=game.world.get(Math.floor(e.x),Math.floor(e.y-.2),Math.floor(e.z));
    const bed=below>0&&blockDef(below).family===BED_FAMILY;
    // BedBlock.fallOn halves the distance before the 3-block allowance.
    const amount=Math.ceil((bed?fall*.5:fall)-3);
    if(amount<=0||r.kind.noFallDamage)return;
    if(below>0)game.sounds.play(`fall:${blockDef(below).sound}`,at(e));
    damage(e,amount,FALL_SOURCE);
  }
  function splash(r:Rec){
    const e=r.e,m=r.motion;
    if(e.inWater&&!m.wasInWater&&e.age>1){
      const v=Math.min(1,Math.hypot(e.vx*Math.SQRT1_2,e.vy,e.vz*Math.SQRT1_2)/20*.2*(r.living?1:.9));
      if(v>.02){
        game.sounds.play('splash',at(e),{volume:v});
        game.render.spawnParticles('splash',e.x,Math.floor(e.y)+1,e.z,{count:Math.round(4+e.width*20),spread:e.width/2+.2});
      }
    }
    m.wasInWater=e.inWater;
  }
  function walkAnimation(r:Rec){
    const target=Math.min(r.motion.moved*4,1);
    r.walkSpeed+=(target-r.walkSpeed)*.4;r.walkPos+=r.walkSpeed;
  }
  function tickLiving(r:Rec){
    const e=r.e,k=r.kind;
    if(e.deathTime>0){
      e.moveX=e.moveZ=0;e.jump=false;
      sampleFluids(game.world,e,e.height*.85,r.fluids);e.inWater=r.fluids.water;e.inLava=r.fluids.lava;
      sane(r);physics(r);walkAnimation(r);
      if(++e.deathTime>=DEATH_TICKS){
        game.render.spawnParticles('poof',e.x,e.y+e.height/2,e.z,{count:20,spread:Math.max(.25,e.width/2)});
        remove(e);
      }
      return;
    }
    r.idle++;
    sampleFluids(game.world,e,e.height*.85,r.fluids);e.inWater=r.fluids.water;e.inLava=r.fluids.lava;
    environment(r);
    if(e.removed)return;
    if(e.deathTime===0){try{k.tick?.(e,game);}catch{/* a failing AI tick must not stop the world */}}
    if(e.removed)return;
    sane(r);
    if(r.phys)turnBody(r);
    physics(r);
    r.lastYaw=e.yaw;
    if(e.removed)return;
    land(r);splash(r);walkAnimation(r);sounds(r);
  }
  function tickOther(r:Rec){
    const e=r.e,k=r.kind;
    sampleFluids(game.world,e,e.height*.85,r.fluids);e.inWater=r.fluids.water;e.inLava=r.fluids.lava;
    if(r.type==='item'||r.type==='orb'){itemEnvironment(r);if(e.removed)return;}
    else if(e.y<-64){remove(e);return;}
    try{k.tick?.(e,game);}catch{/* keep ticking the others */}
    if(e.removed)return;
    sane(r);
    physics(r);
    if(e.removed)return;
    splash(r);
  }
  /** Mobs push each other and the player (vanilla Entity.push: 0.05 blocks/tick, stronger when closer). */
  function pushing(){
    const a=scratchPush;a.length=0;let maxW=0;
    for(const r of recs)if(r.living&&r.phys&&!r.frozen&&!r.e.removed&&r.e.deathTime===0){a.push(r);if(r.e.width>maxW)maxW=r.e.width;}
    for(let i=1;i<a.length;i++){const v=a[i];let j=i-1;while(j>=0&&a[j].e.x>v.e.x){a[j+1]=a[j];j--;}a[j+1]=v;}
    for(let i=0;i<a.length;i++){
      const A=a[i].e;
      for(let j=i+1;j<a.length;j++){
        const B=a[j].e;if(B.x-A.x>=(A.width+maxW)/2)break;
        if(Math.abs(B.x-A.x)<(A.width+B.width)/2&&Math.abs(B.z-A.z)<(A.width+B.width)/2&&B.y<A.y+A.height&&B.y+B.height>A.y)pushPair(A,B,null);
      }
    }
    const p=game.player.state;
    if(game.survival.dead)return;
    const pw=game.player.width,ph=game.player.height;
    for(const r of a){
      const e=r.e;
      if(Math.abs(e.x-p.x)<(e.width+pw)/2&&Math.abs(e.z-p.z)<(e.width+pw)/2&&e.y<p.y+ph&&e.y+e.height>p.y)pushPair(e,null,p);
    }
  }
  function pushPair(A:Entity,B:Entity|null,player:Vec3|null){
    const bx=B?B.x:player!.x,bz=B?B.z:player!.z;
    let dx=bx-A.x,dz=bz-A.z,d=Math.max(Math.abs(dx),Math.abs(dz));
    if(d<.01)return;
    d=Math.sqrt(d);dx/=d;dz/=d;const k=Math.min(1,1/d)*.05*20;dx*=k;dz*=k;
    A.vx-=dx;A.vz-=dz;
    if(B){B.vx+=dx;B.vz+=dz;}else game.player.push(dx,0,dz);
  }

  // ---- Persistence ------------------------------------------------------------------------------
  /** `list` holds up to MAX_SAVED simulated entities, the player's own and the nearest first; the rest of them join the
   *  entities of unloaded chunks in `far` (up to MAX_STORED), so a farm bigger than MAX_SAVED is not cut on reload. */
  function serialize():unknown{
    const keep:Record<string,unknown>[]=[];
    for(const r of recs){
      const e=r.e,k=r.kind;
      if(e.removed||e.deathTime>0||k.persist===false||k.category==='hostile')continue;
      keep.push(pack(e));
    }
    if(keep.length<=MAX_SAVED)return{v:SAVE_VERSION,list:keep,far:storedForSave()};
    byKeepOrder(keep);
    const far=keep.splice(MAX_SAVED);
    for(const at of stored.values())for(const v of at)far.push(v);
    return{v:SAVE_VERSION,list:keep,far:far.length>MAX_STORED?byKeepOrder(far).slice(0,MAX_STORED):far};
  }
  /** The save form of an entity. */
  function pack(e:Entity):Record<string,unknown>{
    return{k:e.kind,i:e.id,x:r3(e.x),y:r3(e.y),z:r3(e.z),vx:r3(e.vx),vy:r3(e.vy),vz:r3(e.vz),
      yw:r3(e.yaw),hy:r3(e.headYaw),pt:r3(e.pitch),h:r3(e.health),a:e.age,f:e.fire,b:e.baby?1:0,d:cleanJson(e.data)??{}};
  }

  // ---- Entities of unloaded chunks ----------------------------------------------------------------
  /** Waits with its chunk while that chunk is unloaded: what the save keeps and would not despawn anyway. */
  const storable=(r:Rec)=>!r.e.removed&&r.e.deathTime===0&&r.kind.persist!==false&&r.kind.category!=='hostile'&&!despawnsNow(r.kind,r.e);
  function addStored(entry:Record<string,unknown>,x:number,z:number){
    const key=chunkKey(Math.floor(x/CS),Math.floor(z/CS));
    let at=stored.get(key);if(!at){at=[];stored.set(key,at);}
    at.push(entry);storedCount++;
  }
  /** Keeps a save entry until its chunk loads. Its id stays reserved, so the entity comes back with it. */
  function stash(raw:unknown){
    const entry=cleanJson(raw);
    if(!isObject(entry)||typeof entry.k!=='string'||!finiteIn(entry.x,XZ_MIN,XZ_MAX)||!finiteIn(entry.z,XZ_MIN,XZ_MAX))return;
    const k=kinds.get(entry.k);if(!k||k.persist===false||k.category==='hostile')return;
    const id=entry.i;if(Number.isInteger(id)&&(id as number)>=nextId&&(id as number)<2**31)nextId=(id as number)+1;
    addStored(entry,entry.x,entry.z);
    if(storedCount>MAX_STORED*1.25)trimStored();
  }
  /** The player's own animals first, then the nearest to the player or the world spawn (where farms usually are). */
  function byKeepOrder(entries:Record<string,unknown>[]){
    const p=game.player.state,s=p.spawn;
    const d=(v:Record<string,unknown>)=>{const x=v.x as number,z=v.z as number;return Math.min((x-p.x)**2+(z-p.z)**2,(x-s.x)**2+(z-s.z)**2);};
    const own=(v:Record<string,unknown>)=>isObject(v.d)&&v.d.owner==='player'?0:1;
    return entries.sort((a,b)=>own(a)-own(b)||d(a)-d(b));
  }
  function storedEntries(){const out:Record<string,unknown>[]=[];for(const at of stored.values())for(const v of at)out.push(v);return out;}
  function storedForSave(){const all=storedEntries();return all.length>MAX_STORED?byKeepOrder(all).slice(0,MAX_STORED):all;}
  function trimStored(){
    const keep=byKeepOrder(storedEntries()).slice(0,MAX_STORED);
    stored.clear();storedCount=0;
    for(const v of keep)addStored(v,v.x as number,v.z as number);
  }
  /** A saved entity whose chunk is not loaded leaves the simulation for the store. */
  function unload(r:Rec){
    stash(pack(r.e));
    const e=r.e;e.removed=true;r.gone=true;dirty=true;ai.forget(e);
    if(byIdMap.get(e.id)===r)byIdMap.delete(e.id);
  }
  /** A chunk loaded: its stored entities come back. */
  function reload(cx:number,cz:number){
    const key=chunkKey(cx,cz),at=stored.get(key);if(!at)return;
    stored.delete(key);storedCount-=at.length;
    for(const raw of at){try{restoreOne(raw);}catch{/* skip a broken entry */}}
  }
  function restoreOne(raw:unknown){
    if(!isObject(raw)||typeof raw.k!=='string')return;
    const k=kinds.get(raw.k);if(!k||k.persist===false||k.category==='hostile')return;
    const {x,y,z}=raw;
    if(!finiteIn(x,XZ_MIN,XZ_MAX)||!finiteIn(y,-64,CH+64)||!finiteIn(z,XZ_MIN,XZ_MAX))return;
    const v=(n:unknown)=>finiteIn(n,-100,100)?n:0,ang=(n:unknown)=>finiteIn(n,-1e3,1e3)?wrapAngle(n):0;
    let data:Record<string,unknown>|null=null;
    const clean=cleanJson(raw.d);data=isObject(clean)?clean:{};
    if(k.restoreData){
      try{data=k.restoreData(data);}catch{data=null;}
      if(!isObject(data))return;
    }
    const id=Number.isInteger(raw.i)&&(raw.i as number)>0&&(raw.i as number)<2**31&&!byIdMap.has(raw.i as number)?raw.i as number:undefined;
    const health=finiteIn(raw.h,1e-3,1e6)?raw.h:k.maxHealth;
    const e=create(k.kind,x,y,z,{data,baby:raw.b===1||raw.b===true,reason:'restore',yaw:ang(raw.yw)},
      {id,vx:v(raw.vx),vy:v(raw.vy),vz:v(raw.vz),health,age:Number.isInteger(raw.a)&&(raw.a as number)>=0&&(raw.a as number)<=1e9?raw.a as number:0,
        fire:Number.isInteger(raw.f)&&(raw.f as number)>=0&&(raw.f as number)<=32767?raw.f as number:0,headYaw:ang(raw.hy),pitch:finiteIn(raw.pt,-1.6,1.6)?raw.pt:0});
    if(e&&e.health>e.maxHealth)e.health=e.maxHealth;
  }

  const spawner=createSpawner(game,{
    spawn:(kind,x,y,z,o)=>create(kind,x,y,z,o),
    kinds:()=>kindList,
    countNear(category){
      const p=game.player.state;let n=0;
      for(const r of recs){const e=r.e;if(!e.removed&&e.deathTime===0&&e.category===category&&Math.hypot(e.x-p.x,e.z-p.z)<=SPAWN_RADIUS)n++;}
      return n;
    },
    all:()=>list,remove
  });

  const service:EntityService&{readonly debug:EntityDebug}={
    ai,register,
    kinds:()=>kindList,
    kind:name=>kinds.get(name),
    spawn:(kind,x,y,z,options)=>create(kind,x,y,z,options??{}),
    remove,
    byId(id){const r=byIdMap.get(id);return r&&!r.e.removed?r.e:undefined;},
    all:()=>list,
    near(x,y,z,radius,filter,out){
      const res=out??[];res.length=0;const r2=radius*radius;
      for(let i=0;i<recs.length;i++){
        const e=recs[i].e;if(e.removed||e.deathTime>0)continue;
        const hw=e.width/2,dx=Math.max(0,Math.abs(x-e.x)-hw),dz=Math.max(0,Math.abs(z-e.z)-hw);
        const dy=y<e.y?e.y-y:y>e.y+e.height?y-e.y-e.height:0;
        if(dx*dx+dy*dy+dz*dz<=r2&&(!filter||filter(e)))res.push(e);
      }
      return res;
    },
    raycast(o,d,max,ignore):EntityRay|null{
      let best:Entity|null=null,bestT=Infinity;
      for(let i=0;i<recs.length;i++){
        const r=recs[i],e=r.e;
        if(e.removed||e===ignore||e.deathTime>0||!pickable(r.kind))continue;
        const hw=e.width/2,t=rayBox(o.x,o.y,o.z,d.x,d.y,d.z,e.x-hw,e.y,e.z-hw,e.x+hw,e.y+e.height,e.z+hw);
        if(t>=0&&t<=max&&t<bestT){best=e;bestT=t;}
      }
      return best?{entity:best,distance:bestT}:null;
    },
    damage,
    dropItem(s,x,y,z,velocity,pickupDelay=10){
      if(!s||typeof s.id!=='string'||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))return;
      const def=itemDef(s.id);if(!def||!Number.isFinite(s.count))return;
      let left=Math.floor(s.count);
      const delay=Number.isInteger(pickupDelay)&&pickupDelay>=0?Math.min(pickupDelay,32767):10;
      for(let guard=0;left>0&&guard<64;guard++){
        const n=Math.min(left,def.maxStack);left-=n;
        const e=create('item',x,y,z,{data:{stack:makeStack(s.id,n,s.damage),pickup:delay},reason:'event',yaw:game.random()*Math.PI*2});
        if(!e)return;
        if(velocity&&Number.isFinite(velocity.x)&&Number.isFinite(velocity.y)&&Number.isFinite(velocity.z)){e.vx=velocity.x;e.vy=velocity.y;e.vz=velocity.z;}
        else{e.vx=(game.random()*.2-.1)*20;e.vy=4;e.vz=(game.random()*.2-.1)*20;}
      }
    },
    dropXp(points,x,y,z){
      if(!(points>=1)||!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(z))return;
      for(const value of splitXp(Math.min(points,1e6))){
        const e=create('xp_orb',x,y,z,{data:{points:value},reason:'event',yaw:game.random()*Math.PI*2});
        if(!e)return;
        e.vx=(game.random()*.2-.1)*40;e.vy=game.random()*.2*40;e.vz=(game.random()*.2-.1)*40;
      }
    },
    count(category){let n=0;for(const r of recs){const e=r.e;if(!e.removed&&e.deathTime===0&&e.category===category)n++;}return n;},
    get debug():EntityDebug{
      let frozen=0;for(const r of recs)if(r.frozen&&!r.e.removed)frozen++;
      return{render:renderer?{...renderer.stats}:null,frozen,searches:ai.searches,nodes:ai.nodes,stored:storedCount};
    },
    init(){
      unsubscribe.push(game.events.on('chunkLoaded',({cx,cz,fresh})=>{reload(cx,cz);spawner.chunkLoaded(cx,cz,fresh);}));
      unsubscribe.push(game.events.on('chunkUnloaded',({cx,cz})=>spawner.chunkUnloaded(cx,cz)));
      const render=game.render as Partial<typeof game.render>;
      if(render&&render.scene&&render.camera&&render.uniforms&&!renderer){
        try{renderer=createEntityRenderer(game);}catch{renderer=null;}
      }
    },
    tick(){
      sinceTick=0;
      const n=recs.length;
      for(let i=0;i<n;i++){
        const r=recs[i],e=r.e;
        if(e.removed)continue;
        if(r.living){
          const verdict=spawner.despawn(e,r.kind,r.idle);
          if(verdict==='remove'){remove(e);continue;}
          if(verdict==='near')r.idle=0;
        }
        saneTransform(r);
        r.frozen=!game.world.isLoaded(e.x,e.z);
        if(r.frozen&&storable(r)){unload(r);continue;}
        r.px=e.x;r.py=e.y;r.pz=e.z;r.pyaw=e.yaw;r.phead=e.headYaw;r.ppitch=e.pitch;r.walkSpeedOld=r.walkSpeed;
        if(r.frozen)continue;
        e.age++;
        if(e.hurtTime>0)e.hurtTime--;
        if(r.living)tickLiving(r);else tickOther(r);
      }
      pushing();
      compact();
      spawner.tick();
      compact();
    },
    frame(dt){
      const partial=Math.min(1,sinceTick*20);
      sinceTick+=dt;
      compact();
      if(renderer)renderer.frame(dt,partial,recs);
    },
    serialize,
    restore(data){
      if(!isObject(data)||data.v!==SAVE_VERSION||!Array.isArray(data.list))return;
      for(const raw of data.list.slice(0,MAX_SAVED)){
        // Entities of chunks that are not loaded yet wait for them (the world loads after a restore).
        if(isObject(raw)&&finiteIn(raw.x,XZ_MIN,XZ_MAX)&&finiteIn(raw.z,XZ_MIN,XZ_MAX)&&!game.world.isLoaded(raw.x,raw.z)){stash(raw);continue;}
        try{restoreOne(raw);}catch{/* skip a broken entry */}
      }
      if(Array.isArray(data.far))for(const raw of data.far.slice(0,MAX_STORED))stash(raw);
    },
    reset(){
      for(const r of recs){r.e.removed=true;ai.forget(r.e);}
      recs.length=0;list.length=0;byIdMap.clear();nextId=1;dirty=false;sinceTick=0;stored.clear();storedCount=0;
      spawner.reset();ai.reset();
    },
    dispose(){
      for(const u of unsubscribe.splice(0))u();
      service.reset?.();
      renderer?.dispose();renderer=null;
    }
  };
  const items=createItemKinds(game,()=>service);
  register(items.item);register(items.xp);
  return service;
}
