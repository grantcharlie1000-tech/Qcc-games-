// Column queries shared by the weather logic (exposure, snow, lightning) and the precipitation renderer.
// The precipitation height plays the role of vanilla's MOTION_BLOCKING heightmap: rain and snow stop at the
// highest solid block or liquid; plants, torches, fire, ladders and snow layers let them through.
import {COLLISION_BOXES,LIQUID,SOLID} from '../data/blocks';
import {biomeDef,coldAt} from '../data/biomes';
import {liquidHeight} from '../engine/physics';
import {SEA_LEVEL} from '../engine/constants';
import type {World} from '../engine/contracts';

/** Rain and snow cannot fall through this block (solid blocks such as stone, glass and leaves, and liquids). */
export const blocksPrecipitation=(id:number)=>id>0&&(SOLID[id]===1||LIQUID[id]!==0);

/** Lowest y that precipitation reaches in a column: one above the highest blocking block (0 for an empty
 *  column), or -1 when the column is not loaded. */
export function precipitationHeight(world:World,x:number,z:number):number{
  if(!world.isLoaded(x,z))return -1;
  for(let y=world.topY(x,z);y>=0;y--)if(blocksPrecipitation(world.get(x,y,z)))return y+1;
  return 0;
}

/** What falls on a column at height y while it rains, from its biome alone: none in dry biomes (deserts, savannas,
 *  badlands), snow where coldAt holds (height-adjusted temperature below 0.15), rain elsewhere. */
export function precipitationKind(world:World,x:number,z:number,y:number):'rain'|'snow'|null{
  const biome=biomeDef(world.biomeAt(x,z));
  if(biome.precipitation==='none')return null;
  return coldAt(biome,y)?'snow':'rain';
}

/** Height used when a caller gives none: the column's precipitation height, or just above sea level when unloaded. */
export function surfaceY(world:World,x:number,z:number):number{
  const h=precipitationHeight(world,x,z);
  return h<0?SEA_LEVEL+1:h;
}

/** Top of the visible surface inside a blocking block, 0..1 (slabs 0.5, farmland 15/16, liquids by level). */
export function surfaceTop(id:number):number{
  if(LIQUID[id])return liquidHeight(id);
  const box=COLLISION_BOXES[id];
  if(!box||!box.length)return 1;
  let top=0;for(let i=4;i<box.length;i+=6)top=Math.max(top,box[i]);
  return top;
}
