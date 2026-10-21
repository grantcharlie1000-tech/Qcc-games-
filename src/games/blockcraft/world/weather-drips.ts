// Leaves dripping in the rain, after vanilla LeavesBlock.animateTick: a leaf block that rain falls on (the top of its
// column under open sky, in a biome where it rains at that height) now and then drips water from its underside, unless
// an opaque full block lies right below it. The vanilla client rolls random blocks around the camera every tick; here a
// few random columns within DRIP_RANGE of the player per tick give about the same rate (roughly one drip per exposed
// leaf column every 550 ticks). Visual only: it uses the caller's ambience random, never game.random().
import {BLOCKS,OPAQUE} from '../data/blocks';
import type {World} from '../engine/contracts';
import {precipitationHeight,precipitationKind} from './weather-columns';

/** Horizontal and vertical reach of dripping leaves around the player (vanilla animateTick radius). */
export const DRIP_RANGE=16;
/** Random columns tried per tick. */
export const DRIP_COLUMNS_PER_TICK=2;
/** Drips start just under the leaf block (vanilla spawnParticleBelow: y - 0.05). */
const DRIP_DROP=.05;

const LEAVES=new Uint8Array(256);
for(const def of BLOCKS)if(def.family.endsWith('_leaves'))LEAVES[def.id]=1;

/** Writes where a column drips into `out` and returns true: its top rain-blocking block is leaves that rain falls on,
 *  with no opaque block below. `rx`, `rz` (0..1) place the drip inside the block. */
export function dripAt(world:World,x:number,z:number,rx:number,rz:number,out:{x:number;y:number;z:number}):boolean{
  const h=precipitationHeight(world,x,z);
  if(h<=1||!LEAVES[world.get(x,h-1,z)])return false;
  const below=world.get(x,h-2,z);
  if(below<0||OPAQUE[below]===1||precipitationKind(world,x,z,h)!=='rain')return false;
  out.x=x+rx;out.y=h-1-DRIP_DROP;out.z=z+rz;
  return true;
}

/** One tick of dripping around (px,py,pz): tries DRIP_COLUMNS_PER_TICK random columns and calls `drip` for each that
 *  drips within DRIP_RANGE blocks vertically. Call only while it rains (vanilla isRaining). */
export function dripTick(world:World,px:number,py:number,pz:number,random:()=>number,drip:(x:number,y:number,z:number)=>void,
  scratch:{x:number;y:number;z:number}):void{
  const span=DRIP_RANGE*2+1,bx=Math.floor(px)-DRIP_RANGE,bz=Math.floor(pz)-DRIP_RANGE;
  for(let i=0;i<DRIP_COLUMNS_PER_TICK;i++){
    const x=bx+Math.floor(random()*span),z=bz+Math.floor(random()*span);
    if(dripAt(world,x,z,random(),random(),scratch)&&Math.abs(scratch.y-py)<=DRIP_RANGE)drip(scratch.x,scratch.y,scratch.z);
  }
}
