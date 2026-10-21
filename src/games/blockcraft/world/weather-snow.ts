// Snow layers and ice (vanilla ServerLevel.tickPrecipitation with Biome.shouldFreeze / shouldSnow): each tick, every
// loaded chunk within TICKING_RANGE of the player has a 1/16 chance to pick one random column. While it snows (the
// WeatherService contract; vanilla also freezes in clear weather), its top water source freezes when cold, dim and at
// the edge of the water, and its first open cell gets a snow layer when cold, dim and resting on an opaque block (or leaves).
import {AIR,B,blockDef,isWater} from '../data/blocks';
import {biomeDef,coldAt} from '../data/biomes';
import {CH,CS} from '../engine/constants';
import {canSurvive} from '../engine/support';
import type {World} from '../engine/contracts';
import {MAX_EDITS} from './world';
import {isTickingChunk,precipitationHeight} from './weather-columns';

/** Chance per chunk per tick of a precipitation update (vanilla random.nextInt(16) == 0). */
export const PRECIPITATION_CHANCE=1/16;
/** Natural snow and ice stop once this share of the world's edit budget is used, keeping the rest for the player. */
export const WEATHER_EDIT_SHARE=.75;
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

/** One precipitation update of a column while `snowing`: freezes its top water or lays snow on it; nothing otherwise.
 *  Writes with cause 'tick'; returns what changed. */
export function precipitateColumn(world:World,x:number,z:number,snowing=true):'ice'|'snow'|null{
  if(!snowing)return null;
  const h=precipitationHeight(world,x,z);
  if(h<=0||h>=CH)return null;
  if(shouldFreeze(world,x,h-1,z)&&world.set(x,h-1,z,B.ice,'tick'))return 'ice';
  if(shouldSnow(world,x,h,z)&&world.set(x,h,z,B.snow,'tick'))return 'snow';
  return null;
}

/** Voxels edited in the world, when the world tells (VoxelWorld.editCount; the World contract has only editsFull). */
function editCount(world:World):number{
  const count=(world as Partial<{editCount:unknown}>).editCount;
  return typeof count==='number'&&Number.isFinite(count)?count:0;
}

/** The per-tick pass over loaded chunks near (px,pz): each ticking chunk gets a 1/16 chance of one random column
 *  update. `snowing` = it is raining (vanilla isRaining); cold columns then get snow and ice, nothing changes otherwise. */
export function precipitationTick(world:World,px:number,pz:number,random:()=>number,snowing:boolean):void{
  if(!snowing||world.editsFull||editCount(world)>=MAX_EDITS*WEATHER_EDIT_SHARE)return;
  for(const chunk of world.chunks.values()){
    if(!isTickingChunk(chunk.cx,chunk.cz,px,pz))continue;
    if(random()>=PRECIPITATION_CHANCE)continue;
    const r=random(),x=chunk.cx*CS+Math.floor(r*CS)%CS,z=chunk.cz*CS+Math.floor(r*CS*CS)%CS;
    precipitateColumn(world,x,z,snowing);
  }
}
