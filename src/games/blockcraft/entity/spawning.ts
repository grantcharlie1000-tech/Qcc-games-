// Natural spawning and despawning (Java 1.20 NaturalSpawner, simplified to a fixed number of attempts per tick).
// Everything is off while settings.mobSpawning is false; peaceful removes hostile mobs and stops their spawning.
//  - Animals (spawn.light 'grass'): packs when a chunk is generated for the first time (chunkLoaded fresh: each chunk rolls
//    0.1 per pack, vanilla creature probability) and a rare respawn attempt every 400 ticks in daylight; on grass (snowy
//    grass too: the snow layer has no collision), on the biome's top block (sand rabbits in deserts, mycelium mooshrooms)
//    or on podzol, coarse dirt and snow blocks, light ≥ 9, weighted by the biome's `animals` unless a kind lists
//    `spawn.biomes`. Cap 20 within 128 blocks of the player.
//  - Monsters (spawn.light 'dark'): every tick a few random positions (random column of a lit chunk, random height up to
//    the surface) start up to three packs of the kind's group size, walking ±5 blocks; 24 to 64 blocks from the player,
//    on an opaque floor (not bedrock) with room for the box, vanilla darkness (sky light ≤ random 0..31, block light 0,
//    brightness ≤ random 0..7). Weights from spawn.weight (default 100), `biomes` restrict and weigh, `replaces` takes
//    its weight from the kind it replaces in its biomes (husk for zombie in deserts, stray for skeleton in snowy biomes).
//    No monsters in mushroom fields unless a kind lists them. Aquatic monsters (drowned) spawn in water. Cap 40.
//  - spawn.check(game, x, y, z) (the feet cell) is the kind's own light and placement rule, like vanilla's per-type
//    checkSpawnRules: it replaces the light test (darkness for 'dark' kinds, light ≥ 9 for 'grass' kinds) while the
//    floor, room, water, distance and cap rules still apply. Husk and stray add open sky to the monster darkness,
//    drowned add the water rules, slime chunks below y 40 need no darkness. isDarkEnoughToSpawn is the darkness rule.
//  - Water mobs (spawn.light 'water'): in water columns of oceans and rivers (or the kind's biomes) between y 50 and sea
//    level. Cap 8.
//  - Despawning (kinds with `despawns`, default hostile and water mobs; a predicate decides per entity, e.g. endermen
//    holding a block never despawn): beyond 128 blocks at once; beyond 32 blocks 1/800 per tick after 600 idle ticks;
//    idle time resets within 32 blocks or when hurt.
import {AIR,BLOCK_BY_NAME,COLLISION_BOXES,LIQUID,OPAQUE,SOLID,blockId,isWater} from '../data/blocks';
import {BIOMES,biomeDef,type BiomeDef} from '../data/biomes';
import {CS,CH,SEA_LEVEL,chunkKey,keyX,keyZ} from '../engine/constants';
import {collidesAt} from '../engine/physics';
import type {Entity,EntityCategory,EntityKind,Game,SpawnReason} from '../engine/contracts';

export const PASSIVE_CAP=20,HOSTILE_CAP=40,WATER_CAP=8;
/** Horizontal radius around the player in which caps count mobs. */
export const SPAWN_RADIUS=128;
/** Natural spawns happen between these distances from the player (vanilla minimum 24; the brief's 64 keeps them in view). */
export const MIN_SPAWN_DISTANCE=24,MAX_SPAWN_DISTANCE=64;
export const DESPAWN_FAR=128,DESPAWN_NEAR=32;
/** Vanilla creature spawn probability per chunk generation pack. */
export const CREATURE_PROBABILITY=.1;
/** Monster position attempts per tick, water attempts per tick, ticks between animal respawn attempts. */
export const HOSTILE_ATTEMPTS=3,WATER_ATTEMPTS=1,PASSIVE_INTERVAL=400;
/** Largest pack from one position (vanilla maxSpawnClusterSize). */
const CLUSTER=4;

type Light='dark'|'grass'|'water';
const BEDROCK=blockId('bedrock');
/** Ground animals spawn on anywhere: grass (vanilla animals_spawnable_on), and the podzol, coarse dirt and snow blocks of
 *  wolves and rabbits. Each biome's top block is accepted too (BIOME_TOP: sand in deserts, mycelium in mushroom fields). */
const ANIMAL_GROUND=new Uint8Array(256);
for(const n of ['grass_block','podzol','coarse_dirt','snow_block'])ANIMAL_GROUND[BLOCK_BY_NAME.get(n)!.id]=1;
/** Top block id per biome id. */
const BIOME_TOP=Int16Array.from(BIOMES,b=>BLOCK_BY_NAME.get(b.top)?.id??-1);
/** Can an animal stand on `below` in this biome? */
export function animalGround(below:number,biome:BiomeDef):boolean{
  return below>0&&(ANIMAL_GROUND[below]===1||below===BIOME_TOP[biome.id]);
}
/** Vanilla Monster.isDarkEnoughToSpawn at a feet cell: sky light ≤ a random 0..31, no block light, brightness ≤ a random
 *  0..7. Kinds with their own spawn.check call it to keep the monster darkness rule. */
export function isDarkEnoughToSpawn(game:Game,x:number,y:number,z:number):boolean{
  const l=game.world.lightAt(x,y,z);
  if((l>>4)>Math.floor(game.random()*32))return false;
  if((l&15)>0)return false;
  return game.world.brightnessAt(x,y,z)<=Math.floor(game.random()*8);
}
/** The despawn flag of a kind for one entity (a predicate decides per entity; default: hostile and water mobs). */
export function despawnsNow(kind:EntityKind,e:Entity):boolean{
  const d=kind.despawns;
  if(typeof d==='function'){try{return d(e)===true;}catch{return e.category==='hostile'||e.category==='water';}}
  return d??(e.category==='hostile'||e.category==='water');
}

/** The aquatic kind that replaces `kind` in water in this biome (drowned for zombie), if any. */
export function waterSubstitute(kinds:readonly EntityKind[],kind:EntityKind,biome:BiomeDef):EntityKind|null{
  for(const k of kinds){
    const s=k.spawn;
    if(!k.aquatic||!s||s.light!=='dark'||s.replaces!==kind.kind)continue;
    if(!s.biomes||s.biomes.some(b=>b[0]===biome.name&&b[1]>0))return k;
  }
  return null;
}
/** Weighted kinds that may spawn in a biome for a spawn light. Pure: depends only on the kinds and the biome. */
export function spawnWeights(kinds:readonly EntityKind[],biome:BiomeDef,light:Light):[EntityKind,number][]{
  const out:[EntityKind,number][]=[];
  const listed=(k:EntityKind)=>{const e=k.spawn?.biomes?.find(b=>b[0]===biome.name);return e?Math.max(0,e[1]):0;};
  for(const k of kinds){
    const s=k.spawn;if(!s||s.light!==light)continue;
    let w:number;
    if(s.biomes)w=listed(k);
    else if(light==='grass')w=biome.animals.find(a=>a[0]===k.kind)?.[1]??0;
    else if(light==='water')w=/ocean|river/.test(biome.name)?s.weight??10:0;
    else w=biome.name==='mushroom_fields'?0:s.weight??100;
    if(w>0)out.push([k,w]);
  }
  // Replacements take their weight from the kind they replace (vanilla: husk 80 + zombie 19 in deserts). Aquatic
  // replacements (drowned for zombie) instead take over its spawns at water positions (see waterSubstitute).
  for(const [k,w] of out){
    const r=k.spawn?.replaces;if(!r||!k.spawn?.biomes||k.aquatic)continue;
    const target=out.find(o=>o[0].kind===r);if(target)target[1]=Math.max(0,target[1]-w);
  }
  return out.filter(o=>o[1]>0);
}

export interface SpawnerHost{
  spawn(kind:string,x:number,y:number,z:number,options:{reason:SpawnReason;yaw:number}):Entity|null;
  kinds():readonly EntityKind[];
  /** Living (not dying) entities of a category within SPAWN_RADIUS horizontally of the player. */
  countNear(category:EntityCategory):number;
  all():readonly Entity[];
  remove(e:Entity):void;
}
export interface Spawner{
  chunkLoaded(cx:number,cz:number,fresh:boolean):void;
  chunkUnloaded(cx:number,cz:number):void;
  tick():void;
  /** Despawn rule for one entity: 'remove', 'near' (within 32 blocks: idle time resets) or 'keep'. */
  despawn(e:Entity,kind:EntityKind,idleTicks:number):'remove'|'near'|'keep';
  /** Kinds were registered: drop cached weights. */
  invalidate():void;
  reset():void;
}

export function createSpawner(game:Game,host:SpawnerHost):Spawner{
  const keys:number[]=[],slot=new Map<number,number>();
  const weights=new Map<string,[EntityKind,number][]>();
  let passiveTimer=0;
  const rand=(n:number)=>Math.floor(game.random()*n);
  const enabled=()=>game.settings.mobSpawning;
  const peaceful=()=>game.settings.difficulty==='peaceful';
  function weightsFor(biome:BiomeDef,light:Light){
    const key=light+biome.id;let w=weights.get(key);
    if(!w){w=spawnWeights(host.kinds(),biome,light);weights.set(key,w);}
    return w;
  }
  function pick(biome:BiomeDef,light:Light):EntityKind|null{
    const list=weightsFor(biome,light);let total=0;for(const [,w] of list)total+=w;
    if(total<=0)return null;
    let r=game.random()*total;
    for(const [k,w] of list){r-=w;if(r<0)return k;}
    return list[list.length-1][0];
  }
  const groupSize=(k:EntityKind)=>{const [a,b]=k.spawn!.group,min=Math.max(1,Math.floor(a)),max=Math.max(min,Math.floor(b));return min+rand(max-min+1);};
  const cellFree=(id:number)=>id>=0&&!SOLID[id]&&!LIQUID[id]&&!(COLLISION_BOXES[id].length);
  /** Feet cell above the highest solid block of a column (skipping plants and snow layers), or -1. */
  function surfaceY(x:number,z:number):number{
    let y=game.world.topY(x,z);
    while(y>=0){const id=game.world.get(x,y,z);if(id<0)return -1;if(SOLID[id]||LIQUID[id])break;y--;}
    return y<0?-1:y+1;
  }
  /** Distance to the player of a candidate spawn position (squared 3D, horizontal), written to `dist` (no allocation). */
  const dist={d2:0,h:0};
  function playerDistance(x:number,y:number,z:number){
    const p=game.player.state,dx=x-p.x,dy=y-p.y,dz=z-p.z;dist.d2=dx*dx+dy*dy+dz*dz;dist.h=Math.sqrt(dx*dx+dz*dz);
  }
  const inSpawnRing=()=>dist.d2>MIN_SPAWN_DISTANCE*MIN_SPAWN_DISTANCE&&dist.h<=MAX_SPAWN_DISTANCE;
  function roomFor(k:EntityKind,x:number,y:number,z:number,water:boolean):boolean{
    if(collidesAt(game.world,x+.5,y,z+.5,k.width/2,k.height))return false;
    const feet=game.world.get(x,y,z),head=game.world.get(x,y+1,z);
    if(water)return isWater(feet)&&(k.height<=1||isWater(head)||head===AIR);
    return cellFree(feet)&&(k.height<=1||cellFree(head));
  }
  /** Packed light at a feet cell for animal spawns. A chunk at generation has no light yet, and World.lightAt's fallback
   *  (sky only above the heightmap) reads a surface cell holding short grass, a flower or a snow layer as dark; such a cell
   *  with nothing opaque above counts as open sky here. */
  function spawnLight(x:number,y:number,z:number):number{
    const l=game.world.lightAt(x,y,z);
    if(l!==0)return l;
    const c=game.world.chunk(Math.floor(x/CS),Math.floor(z/CS));
    if(!c||c.light)return l;
    const top=game.world.topY(x,z);
    for(let cy=y;cy<=top;cy++){const id=game.world.get(x,cy,z);if(id<0||OPAQUE[id])return l;}
    return 0xf0;
  }
  /** The kind's light rule at a feet cell: its spawn.check when it has one, else monster darkness ('dark') or light ≥ 9
   *  ('grass'); water kinds have none. A throwing check refuses. */
  function lightOk(k:EntityKind,light:Light,x:number,y:number,z:number):boolean{
    const check=k.spawn?.check;
    if(check){try{return check(game,x,y,z)===true;}catch{return false;}}
    if(light==='dark')return isDarkEnoughToSpawn(game,x,y,z);
    if(light==='grass'){const l=spawnLight(x,y,z);return Math.max(l&15,l>>4)>8;}
    return true;
  }
  function canSpawn(k:EntityKind,light:Light,x:number,y:number,z:number):boolean{
    if(y<1||y>=CH-2)return false;
    const aquatic=!!k.aquatic||light==='water';
    if(light==='water')return y>=SEA_LEVEL-12&&y<=SEA_LEVEL&&roomFor(k,x,y,z,true)&&lightOk(k,light,x,y,z);
    if(light==='dark'){
      if(peaceful())return false;
      if(aquatic)return roomFor(k,x,y,z,true)&&lightOk(k,light,x,y,z);
      const below=game.world.get(x,y-1,z);
      return below>=0&&OPAQUE[below]===1&&below!==BEDROCK&&roomFor(k,x,y,z,false)&&lightOk(k,light,x,y,z);
    }
    const below=game.world.get(x,y-1,z);
    if(!animalGround(below,biomeDef(game.world.biomeAt(x,z)))||!roomFor(k,x,y,z,false))return false;
    return lightOk(k,light,x,y,z);
  }
  const cap=(c:EntityCategory)=>c==='hostile'?HOSTILE_CAP:c==='water'?WATER_CAP:PASSIVE_CAP;
  const full=(c:EntityCategory)=>host.countNear(c)>=cap(c);
  /** Up to three packs around a start position (NaturalSpawner.spawnCategoryForPosition). */
  function packsAt(light:Light,x0:number,y:number,z0:number){
    let total=0;
    for(let pack=0;pack<3;pack++){
      let x=x0,z=z0,kind:EntityKind|null=null,tries=Math.ceil(game.random()*4),spawned=0;
      for(let t=0;t<tries;t++){
        x+=rand(6)-rand(6);z+=rand(6)-rand(6);
        playerDistance(x+.5,y,z+.5);
        if(!inSpawnRing()||!game.world.isLoaded(x,z))continue;
        if(!kind){
          kind=pick(biomeDef(game.world.biomeAt(x,z)),light);
          if(!kind)break;
          tries=groupSize(kind);
        }
        let member=kind;
        if(light==='dark'&&!kind.aquatic&&isWater(game.world.get(x,y,z)))member=waterSubstitute(host.kinds(),kind,biomeDef(game.world.biomeAt(x,z)))??kind;
        if(!canSpawn(member,light,x,y,z))continue;
        const e=host.spawn(member.kind,x+.5,y,z+.5,{reason:'natural',yaw:game.random()*Math.PI*2});
        if(!e)continue;
        total++;spawned++;
        if(total>=CLUSTER||full(member.category))return;
        if(spawned>=tries)break;
      }
    }
  }
  function randomChunk():number{return keys.length?keys[rand(keys.length)]:NaN;}
  function chunkInRange(key:number){
    const p=game.player.state,x=keyX(key)*CS+8,z=keyZ(key)*CS+8;
    return Math.hypot(x-p.x,z-p.z)<=MAX_SPAWN_DISTANCE+12;
  }
  function hostileAttempt(){
    const key=randomChunk();if(Number.isNaN(key)||!chunkInRange(key))return;
    const chunk=game.world.chunks.get(key);if(!chunk||!chunk.light)return;
    const lx=rand(CS),lz=rand(CS),top=chunk.heightmap[lx+lz*CS];
    const y=rand(top+2);if(y<1)return;
    const x=chunk.cx*CS+lx,z=chunk.cz*CS+lz,id=game.world.get(x,y,z);
    if(id<0||OPAQUE[id])return;
    packsAt('dark',x,y,z);
  }
  function waterAttempt(){
    const key=randomChunk();if(Number.isNaN(key)||!chunkInRange(key))return;
    const chunk=game.world.chunks.get(key);if(!chunk)return;
    const x=chunk.cx*CS+rand(CS),z=chunk.cz*CS+rand(CS),y=SEA_LEVEL-12+rand(13);
    if(!isWater(game.world.get(x,y,z)))return;
    packsAt('water',x,y,z);
  }
  function passiveAttempt(){
    const key=randomChunk();if(Number.isNaN(key)||!chunkInRange(key))return;
    const cx=keyX(key),cz=keyZ(key),x0=cx*CS+rand(CS),z0=cz*CS+rand(CS);
    const kind=pick(biomeDef(game.world.biomeAt(x0,z0)),'grass');if(!kind)return;
    const n=groupSize(kind);let x=x0,z=z0;
    for(let i=0;i<n*2&&n>0;i++){
      const y=surfaceY(x,z);
      if(y>0){
        playerDistance(x+.5,y,z+.5);
        if(inSpawnRing()&&game.world.brightnessAt(x,y,z)>8&&canSpawn(kind,'grass',x,y,z)){
          host.spawn(kind.kind,x+.5,y,z+.5,{reason:'natural',yaw:game.random()*Math.PI*2});
          if(full('passive'))return;
        }
      }
      x+=rand(5)-rand(5);z+=rand(5)-rand(5);
    }
  }
  /** Chunk generation packs (NaturalSpawner.spawnMobsForChunkGeneration). */
  function populate(cx:number,cz:number){
    const biome=biomeDef(game.world.biomeAt(cx*CS+8,cz*CS+8));
    if(!weightsFor(biome,'grass').length)return;
    while(game.random()<CREATURE_PROBABILITY){
      if(full('passive'))return;
      const kind=pick(biome,'grass');if(!kind)return;
      const n=groupSize(kind),x0=cx*CS+rand(CS),z0=cz*CS+rand(CS);
      let x=x0,z=z0;
      for(let i=0;i<n;i++){
        for(let attempt=0;attempt<4;attempt++){
          const y=surfaceY(x,z);
          const ok=y>0&&canSpawn(kind,'grass',x,y,z)&&host.spawn(kind.kind,x+.5,y,z+.5,{reason:'chunk',yaw:game.random()*Math.PI*2});
          x+=rand(5)-rand(5);z+=rand(5)-rand(5);
          for(let guard=0;guard<8&&(x<cx*CS||x>=cx*CS+CS||z<cz*CS||z>=cz*CS+CS);guard++){x=x0+rand(5)-rand(5);z=z0+rand(5)-rand(5);}
          if(x<cx*CS||x>=cx*CS+CS||z<cz*CS||z>=cz*CS+CS){x=x0;z=z0;}
          if(ok){if(full('passive'))return;break;}
        }
      }
    }
  }
  const spawner:Spawner={
    chunkLoaded(cx,cz,fresh){
      const key=chunkKey(cx,cz);
      if(!slot.has(key)){slot.set(key,keys.length);keys.push(key);}
      if(fresh&&enabled())populate(cx,cz);
    },
    chunkUnloaded(cx,cz){
      const key=chunkKey(cx,cz),i=slot.get(key);if(i===undefined)return;
      const last=keys.pop()!;if(last!==key){keys[i]=last;slot.set(last,i);}
      slot.delete(key);
    },
    tick(){
      if(peaceful())for(const e of host.all())if(!e.removed&&e.category==='hostile')host.remove(e);
      if(!enabled())return;
      if(!peaceful())for(let i=0;i<HOSTILE_ATTEMPTS&&!full('hostile');i++)hostileAttempt();
      for(let i=0;i<WATER_ATTEMPTS&&!full('water');i++)waterAttempt();
      if(++passiveTimer>=PASSIVE_INTERVAL){passiveTimer=0;if(!full('passive'))passiveAttempt();}
    },
    despawn(e,kind,idle){
      if(!despawnsNow(kind,e))return 'keep';
      const p=game.player.state,d2=(e.x-p.x)**2+(e.y-p.y)**2+(e.z-p.z)**2;
      if(d2>DESPAWN_FAR*DESPAWN_FAR)return 'remove';
      if(d2<DESPAWN_NEAR*DESPAWN_NEAR)return 'near';
      return idle>600&&rand(800)===0?'remove':'keep';
    },
    invalidate(){weights.clear();},
    reset(){passiveTimer=0;weights.clear();}
  };
  // Chunks already loaded when the spawner is created (tests, late creation) are tracked too.
  for(const c of game.world.chunks.values())if(!slot.has(c.key)){slot.set(c.key,keys.length);keys.push(c.key);}
  return spawner;
}
