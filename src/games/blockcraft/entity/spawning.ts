// Natural spawning and despawning (Java 1.20 NaturalSpawner, simplified to a fixed number of attempts per tick).
// Everything is off while settings.mobSpawning is false; peaceful removes hostile mobs and stops their spawning.
//  - Animals (spawn.light 'grass'): packs when a chunk is generated for the first time (chunkLoaded fresh: each chunk rolls
//    0.1 per pack, vanilla creature probability) and a rare respawn attempt every 400 ticks in daylight; on grass (or
//    mycelium, podzol, sand, snow for the biomes that list such animals), brightness ≥ 9, weighted by the biome's
//    `animals` unless a kind lists `spawn.biomes`. Cap 20 within 128 blocks of the player.
//  - Monsters (spawn.light 'dark'): every tick a few random positions (random column of a lit chunk, random height up to
//    the surface) start up to three packs of the kind's group size, walking ±5 blocks; 24 to 128 blocks from the player,
//    on an opaque floor (not bedrock) with room for the box, vanilla darkness (sky light ≤ random 0..31, block light 0,
//    brightness ≤ random 0..7). Weights from spawn.weight (default 100), `biomes` restrict and weigh, `replaces` takes
//    its weight from the kind it replaces in its biomes (husk for zombie in deserts, stray for skeleton in snowy biomes).
//    No monsters in mushroom fields unless a kind lists them. Aquatic monsters (drowned) spawn in water. Cap 40.
//  - Water mobs (spawn.light 'water'): in water columns of oceans and rivers (or the kind's biomes) between y 50 and sea
//    level. Cap 8.
//  - Despawning (kinds with `despawns`, default hostile and water mobs): beyond 128 blocks at once; beyond 32 blocks
//    1/800 per tick after 600 idle ticks; idle time resets within 32 blocks or when hurt.
import {AIR,BLOCK_BY_NAME,COLLISION_BOXES,LIQUID,OPAQUE,SOLID,blockId,isWater} from '../data/blocks';
import {biomeDef,type BiomeDef} from '../data/biomes';
import {CS,CH,SEA_LEVEL,chunkKey,keyX,keyZ} from '../engine/constants';
import {collidesAt} from '../engine/physics';
import type {Entity,EntityCategory,EntityKind,Game,SpawnReason} from '../engine/contracts';

export const PASSIVE_CAP=20,HOSTILE_CAP=40,WATER_CAP=8;
/** Horizontal radius around the player in which caps count mobs and spawns may happen. */
export const SPAWN_RADIUS=128;
/** No natural spawns closer than this to the player (vanilla 24). */
export const MIN_SPAWN_DISTANCE=24;
export const DESPAWN_FAR=128,DESPAWN_NEAR=32;
/** Vanilla creature spawn probability per chunk generation pack. */
export const CREATURE_PROBABILITY=.1;
/** Monster position attempts per tick, water attempts per tick, ticks between animal respawn attempts. */
export const HOSTILE_ATTEMPTS=3,WATER_ATTEMPTS=1,PASSIVE_INTERVAL=400;
/** Largest pack from one position (vanilla maxSpawnClusterSize). */
const CLUSTER=4;

type Light='dark'|'grass'|'water';
const BEDROCK=blockId('bedrock');
/** Ground animals spawn on (grass for most; mooshrooms mycelium, rabbits sand and snow, wolves podzol and snow). */
const ANIMAL_GROUND=new Uint8Array(256);
for(const n of ['grass_block','mycelium','podzol','coarse_dirt','sand','red_sand','snow_block','moss_block'])ANIMAL_GROUND[BLOCK_BY_NAME.get(n)!.id]=1;

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
  // Replacements take their weight from the kind they replace (vanilla: husk 80 + zombie 19 in deserts).
  for(const [k,w] of out){
    const r=k.spawn?.replaces;if(!r||!k.spawn?.biomes)continue;
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
  function playerDistance(x:number,y:number,z:number){
    const p=game.player.state;return{d2:(x-p.x)**2+(y-p.y)**2+(z-p.z)**2,h:Math.hypot(x-p.x,z-p.z)};
  }
  function roomFor(k:EntityKind,x:number,y:number,z:number,water:boolean):boolean{
    if(collidesAt(game.world,x+.5,y,z+.5,k.width/2,k.height))return false;
    const feet=game.world.get(x,y,z),head=game.world.get(x,y+1,z);
    if(water)return isWater(feet)&&(k.height<=1||isWater(head)||head===AIR);
    return cellFree(feet)&&(k.height<=1||cellFree(head));
  }
  /** Vanilla Monster.isDarkEnoughToSpawn at a feet cell. */
  function darkEnough(x:number,y:number,z:number):boolean{
    const l=game.world.lightAt(x,y,z);
    if((l>>4)>rand(32))return false;
    if((l&15)>0)return false;
    return game.world.brightnessAt(x,y,z)<=rand(8);
  }
  function canSpawn(k:EntityKind,light:Light,x:number,y:number,z:number):boolean{
    if(y<1||y>=CH-2)return false;
    const aquatic=!!k.aquatic||light==='water';
    if(light==='water')return y>=SEA_LEVEL-12&&y<=SEA_LEVEL&&roomFor(k,x,y,z,true);
    if(light==='dark'){
      if(peaceful()||!darkEnough(x,y,z))return false;
      if(aquatic)return roomFor(k,x,y,z,true);
      const below=game.world.get(x,y-1,z);
      return below>=0&&OPAQUE[below]===1&&below!==BEDROCK&&roomFor(k,x,y,z,false);
    }
    const below=game.world.get(x,y-1,z);
    if(below<0||!ANIMAL_GROUND[below]||!roomFor(k,x,y,z,false))return false;
    const l=game.world.lightAt(x,y,z);
    return Math.max(l&15,l>>4)>8;
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
        const {d2,h}=playerDistance(x+.5,y,z+.5);
        if(d2<=MIN_SPAWN_DISTANCE*MIN_SPAWN_DISTANCE||h>SPAWN_RADIUS||!game.world.isLoaded(x,z))continue;
        if(!kind){
          kind=pick(biomeDef(game.world.biomeAt(x,z)),light);
          if(!kind)break;
          tries=groupSize(kind);
        }
        if(!canSpawn(kind,light,x,y,z))continue;
        const e=host.spawn(kind.kind,x+.5,y,z+.5,{reason:'natural',yaw:game.random()*Math.PI*2});
        if(!e)continue;
        total++;spawned++;
        if(total>=CLUSTER||full(kind.category))return;
        if(spawned>=tries)break;
      }
    }
  }
  function randomChunk():number{return keys.length?keys[rand(keys.length)]:NaN;}
  function chunkInRange(key:number){
    const p=game.player.state,x=keyX(key)*CS+8,z=keyZ(key)*CS+8;
    return Math.hypot(x-p.x,z-p.z)<=SPAWN_RADIUS+12;
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
        const {d2,h}=playerDistance(x+.5,y,z+.5);
        if(d2>MIN_SPAWN_DISTANCE*MIN_SPAWN_DISTANCE&&h<=SPAWN_RADIUS&&game.world.brightnessAt(x,y,z)>8&&canSpawn(kind,'grass',x,y,z)){
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
          if(ok)break;
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
      const despawns=kind.despawns??(e.category==='hostile'||e.category==='water');
      if(!despawns)return 'keep';
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
