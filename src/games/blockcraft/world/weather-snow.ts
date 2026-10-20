// Snow layers and ice while it snows (vanilla ServerLevel.tickPrecipitation with Biome.shouldFreeze / shouldSnow):
// each tick, every loaded chunk within PRECIPITATION_RADIUS of the player has a 1/16 chance to pick one random
// column. Its top water source freezes when cold, dim and at the edge of the water; its first open cell gets a
// snow layer when cold, dim and resting on an opaque block (or leaves).
import {AIR,B,blockDef,isWater} from '../data/blocks';
import {biomeDef,coldAt} from '../data/biomes';
import {CH,CS} from '../engine/constants';
import {canSurvive} from '../engine/support';
import type {World} from '../engine/contracts';
import {precipitationHeight} from './weather-columns';

/** Chance per chunk per tick of a precipitation update (vanilla random.nextInt(16) == 0). */
export const PRECIPITATION_CHANCE=1/16;
/** Chunks (Chebyshev distance from the player's chunk) that receive updates, like random ticks. */
export const PRECIPITATION_RADIUS=8;
/** Snow and ice only form where block light is below this (vanilla). */
const MAX_BLOCK_LIGHT=10;

const blockLight=(world:World,x:number,y:number,z:number)=>world.lightAt(x,y,z)&15;
const isSource=(id:number)=>id>=0&&isWater(id)&&!!blockDef(id).liquid&&blockDef(id).liquid!.level===0&&!blockDef(id).liquid!.falling;

/** Water source at (x,y,z) that should freeze: cold there, block light below 10 and not surrounded by water on all
 *  four sides (ice grows inward from the edges). Unloaded neighbours postpone freezing. */
export function shouldFreeze(world:World,x:number,y:number,z:number):boolean{
  if(y<0||y>=CH||!isSource(world.get(x,y,z)))return false;
  const biome=biomeDef(world.biomeAt(x,z));
  if(biome.precipitation==='none'||!coldAt(biome,y)||blockLight(world,x,y,z)>=MAX_BLOCK_LIGHT)return false;
  let water=0;
  for(const [dx,dz] of SIDES){const n=world.get(x+dx,y,z+dz);if(n<0)return false;if(isWater(n))water++;}
  return water<4;
}
/** Open cell at (x,y,z) that should get a snow layer: air, cold there, dim, and the layer can stay (support rule). */
export function shouldSnow(world:World,x:number,y:number,z:number):boolean{
  if(y<=0||y>=CH||world.get(x,y,z)!==AIR)return false;
  const biome=biomeDef(world.biomeAt(x,z));
  if(biome.precipitation==='none'||!coldAt(biome,y)||blockLight(world,x,y,z)>=MAX_BLOCK_LIGHT)return false;
  return canSurvive(world,B.snow,x,y,z);
}
const SIDES=[[1,0],[-1,0],[0,1],[0,-1]] as const;

/** One precipitation update of a column while it snows: freezes its top water or lays snow on it.
 *  Writes with cause 'tick'; returns what changed. */
export function precipitateColumn(world:World,x:number,z:number):'ice'|'snow'|null{
  const h=precipitationHeight(world,x,z);
  if(h<=0||h>=CH)return null;
  if(shouldFreeze(world,x,h-1,z)&&world.set(x,h-1,z,B.ice,'tick'))return 'ice';
  if(shouldSnow(world,x,h,z)&&world.set(x,h,z,B.snow,'tick'))return 'snow';
  return null;
}

/** The per-tick pass over loaded chunks near (px,pz): each gets a 1/16 chance of one random column update. */
export function precipitationTick(world:World,px:number,pz:number,random:()=>number):void{
  const pcx=Math.floor(px/CS),pcz=Math.floor(pz/CS);
  for(const chunk of world.chunks.values()){
    if(Math.abs(chunk.cx-pcx)>PRECIPITATION_RADIUS||Math.abs(chunk.cz-pcz)>PRECIPITATION_RADIUS)continue;
    if(random()>=PRECIPITATION_CHANCE)continue;
    const r=random(),x=chunk.cx*CS+Math.floor(r*CS)%CS,z=chunk.cz*CS+Math.floor(r*CS*CS)%CS;
    precipitateColumn(world,x,z);
  }
}
