// Lightning, after vanilla Java ServerLevel.tickChunk / findLightningTargetAround and LightningBolt.tick:
// during a thunderstorm every ticking chunk (centre within 128 blocks of the player) has a 1/100000 chance per tick
// of a strike at a random column (or at a living entity under open sky within 3 blocks of it). A bolt lives 2 ticks plus 1-3 re-flashes; while visible it
// hurts every living entity in a box 3 blocks around it (6 up) for 5 'lightning' damage and sets it on fire for
// 8 seconds; creepers become charged, pigs are left alone, and dropped items and experience orbs burn up. Fire starts
// at the strike on normal and hard, wherever vanilla fire can stay (a sturdy top below or a flammable neighbour).
import {AIR,BLOCKS,OPAQUE,blockId} from '../data/blocks';
import {CS} from '../engine/constants';
import type {Entity,Game,Vec3} from '../engine/contracts';
import {isTickingChunk,precipitationHeight,TICKING_RANGE} from './weather-columns';

/** Strike chance per ticking chunk per tick. */
export const LIGHTNING_CHANCE=1/100000;
/** Chunks around the player's chunk that may tick lightning: the square holding the TICKING_RANGE circle. */
const LIGHTNING_RADIUS=Math.ceil(TICKING_RANGE/CS);
export const LIGHTNING_DAMAGE=5;
export const LIGHTNING_FIRE_SECONDS=8;
/** Thunder travels at 40 blocks per second (vanilla distance-delayed sounds). */
export const THUNDER_SPEED=40;
const FIRE=blockId('fire');
const LIVING=new Set(['passive','hostile','water']);
/** Dropped items and experience orbs have 5 health in vanilla, so one strike destroys them. */
const FRAGILE=new Set(['item','xp']);

export interface Bolt{
  /** Block position of the strike (the bolt stands on its bottom centre). */
  readonly x:number;readonly y:number;readonly z:number;
  /** Ticks: 2 when it strikes; drawn and harmful while >= 0; re-flashes reset it to 1. */
  life:number;
  /** Re-flashes remaining. */
  flashes:number;
  /** Shape seed, changed by each re-flash. */
  seed:number;
}

export function createBolt(x:number,y:number,z:number,random:()=>number):Bolt{
  return{x,y,z,life:2,flashes:1+Math.floor(random()*3),seed:Math.floor(random()*0x7fffffff)};
}

/** Strike target for a random column: the precipitation height of the column, or a random living entity (or the
 *  player) under open sky whose box touches the column inflated by 3 blocks. Null when the column is unloaded. */
export function findStrikeTarget(game:Game,x:number,z:number,random:()=>number,scratch:Entity[]):Vec3|null{
  const h=precipitationHeight(game.world,x,z);
  if(h<0)return null;
  const candidates=scratch;candidates.length=0;
  const minX=x-3,maxX=x+4,minZ=z-3,maxZ=z+4,minY=h-3;
  for(const e of game.entities.all()){
    if(!LIVING.has(e.category)||e.removed||e.deathTime>0||e.health<=0)continue;
    const hw=e.width/2;
    if(e.x+hw<minX||e.x-hw>maxX||e.z+hw<minZ||e.z-hw>maxZ||e.y+e.height<minY)continue;
    if(Math.floor(e.y)<precipitationHeight(game.world,Math.floor(e.x),Math.floor(e.z)))continue;
    candidates.push(e);
  }
  const p=game.player.state,hw=game.player.width/2;
  const playerIn=!game.survival.dead&&p.x+hw>=minX&&p.x-hw<=maxX&&p.z+hw>=minZ&&p.z-hw<=maxZ&&p.y+game.player.height>=minY
    &&Math.floor(p.y)>=precipitationHeight(game.world,Math.floor(p.x),Math.floor(p.z));
  const total=candidates.length+(playerIn?1:0);
  if(total){
    const pick=Math.min(total-1,Math.floor(random()*total));
    const t=pick<candidates.length?candidates[pick]:p;
    candidates.length=0;
    return{x:Math.floor(t.x),y:Math.floor(t.y),z:Math.floor(t.z)};
  }
  return{x,y:h,z};
}

/** Random column for this tick's strike roll, or null (no strike). Each ticking chunk has LIGHTNING_CHANCE: one roll
 *  for the square of chunks around the player picks a chunk, which only strikes when it is ticking. */
export function rollStrikeColumn(px:number,pz:number,random:()=>number):{x:number;z:number}|null{
  const side=LIGHTNING_RADIUS*2+1,area=side*side;
  if(random()>=area*LIGHTNING_CHANCE)return null;
  const cell=Math.min(area-1,Math.floor(random()*area));
  const cx=Math.floor(px/CS)+cell%side-LIGHTNING_RADIUS,cz=Math.floor(pz/CS)+Math.floor(cell/side)-LIGHTNING_RADIUS;
  if(!isTickingChunk(cx,cz,px,pz))return null;
  return{x:cx*CS+Math.floor(random()*CS),z:cz*CS+Math.floor(random()*CS)};
}

/** Block families fire can burn (vanilla FireBlock.bootStrap ignite odds above 0). This is the same table as the fire
 *  owner's (world/fire.ts in the ticks area): planks, logs, leaves, wool and these families. Crafting tables and barrels
 *  only catch from lava, so fire does not cling to them; a fire placed there would go out on its first fire tick. */
const BURNING_FAMILIES=new Set(['bookshelf','tnt','short_grass','fern','dead_bush','coal_block','moss_block','dandelion','poppy',
  'blue_orchid','allium','cornflower','oxeye_daisy','oak_slab','oak_stairs']);
const BURNING_SUFFIXES=['_planks','_log','_leaves','_wool'];
const BURNS=new Uint8Array(256);
/** A full top face fire can rest on: an opaque cube, or a top or double slab (the fire owner's rule). */
const STURDY=new Uint8Array(256);
for(const d of BLOCKS){
  BURNS[d.id]=+(BURNING_FAMILIES.has(d.family)||BURNING_SUFFIXES.some(s=>d.family.endsWith(s)));
  STURDY[d.id]=+(OPAQUE[d.id]===1||d.slab==='top'||d.slab==='double');
}
const SIX=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]] as const;
/** Vanilla FireBlock.canSurvive for an air cell: a sturdy block below, or a neighbour fire can burn. */
export function fireCanStay(world:Game['world'],x:number,y:number,z:number):boolean{
  const below=world.get(x,y-1,z);
  if(below>0&&STURDY[below])return true;
  for(const [dx,dy,dz] of SIX){const n=world.get(x+dx,y+dy,z+dz);if(n>0&&BURNS[n])return true;}
  return false;
}

/** Places fire at the bolt and at `extra` random cells around it (vanilla spawnFire): only into air where fire can stay. */
export function spawnFire(game:Game,bolt:Bolt,extra:number,random:()=>number):number{
  let lit=0;
  const tryAt=(x:number,y:number,z:number)=>{
    if(game.world.get(x,y,z)===AIR&&fireCanStay(game.world,x,y,z)&&game.world.set(x,y,z,FIRE,'tick'))lit++;
  };
  tryAt(bolt.x,bolt.y,bolt.z);
  for(let i=0;i<extra;i++)tryAt(bolt.x+Math.floor(random()*3)-1,bolt.y+Math.floor(random()*3)-1,bolt.z+Math.floor(random()*3)-1);
  return lit;
}

/** Hurts everything in the bolt's box (vanilla AABB ±3 around the bottom centre, 6 more up): living mobs and the player.
 *  Pigs are unaffected; creepers become charged; dropped items and experience orbs are destroyed. */
export function hitEntities(game:Game,bolt:Bolt,scratch:Entity[]):void{
  const cx=bolt.x+.5,cy=bolt.y,cz=bolt.z+.5;
  const minX=cx-3,maxX=cx+3,minY=cy-3,maxY=cy+9,minZ=cz-3,maxZ=cz+3;
  const near=game.entities.near(cx,cy+3,cz,8,undefined,scratch);
  for(let i=0;i<near.length;i++){
    const e=near[i],fragile=FRAGILE.has(e.category);
    if(e.removed||!fragile&&(!LIVING.has(e.category)||e.deathTime>0||e.kind==='pig'))continue;
    const hw=e.width/2;
    if(e.x+hw<minX||e.x-hw>maxX||e.z+hw<minZ||e.z-hw>maxZ||e.y+e.height<minY||e.y>maxY)continue;
    if(fragile){game.entities.remove(e);continue;}
    if(!game.entities.kind(e.kind)?.fireImmune)e.fire=e.fire>0?e.fire+1:LIGHTNING_FIRE_SECONDS*20;
    game.entities.damage(e,LIGHTNING_DAMAGE,{kind:'lightning'});
    if(e.kind==='creeper')e.data.charged=true;
  }
  near.length=0;
  const p=game.player.state,hw=game.player.width/2;
  if(game.survival.dead||game.settings.mode==='creative')return;
  if(p.x+hw<minX||p.x-hw>maxX||p.z+hw<minZ||p.z-hw>maxZ||p.y+game.player.height<minY||p.y>maxY)return;
  if(game.survival.burning<=0)game.survival.ignite(LIGHTNING_FIRE_SECONDS);
  game.survival.damage(LIGHTNING_DAMAGE,{kind:'lightning'});
}

export interface BoltEvents{
  /** First tick of a bolt (thunder, impact). */
  struck(bolt:Bolt):void;
}
/** One tick of a bolt (vanilla order). Returns false when the bolt is gone. */
export function tickBolt(game:Game,bolt:Bolt,random:()=>number,scratch:Entity[],events:BoltEvents):boolean{
  if(bolt.life===2){
    events.struck(bolt);
    const d=game.settings.difficulty;
    if(d==='normal'||d==='hard')spawnFire(game,bolt,4,random);
  }
  bolt.life--;
  if(bolt.life<0){
    if(bolt.flashes===0)return false;
    if(bolt.life<-Math.floor(random()*10)){
      bolt.flashes--;bolt.life=1;bolt.seed=Math.floor(random()*0x7fffffff);
      spawnFire(game,bolt,0,random);
    }
  }
  if(bolt.life>=0)hitEntities(game,bolt,scratch);
  return true;
}
