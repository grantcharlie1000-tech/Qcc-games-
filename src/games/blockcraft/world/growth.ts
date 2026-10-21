// Random-tick behaviour of plants and other changing blocks, after vanilla Java 1.20:
//  - crops (CropBlock): at raw light ≥ 9 grow one age with chance 1 / (floor(25 / speed) + 1), speed from the 3×3 farmland
//    below (wet counts 3, dry 1, the sides a quarter) halved beside the same crop in a row or diagonal. Carrots and potatoes
//    draw 4 of vanilla's 8 ages, so each drawn stage takes the 2, 2 and 3 vanilla steps it stands for.
//  - saplings: at light ≥ 9 above, 1 in 7 advances a hidden stage, the next success grows the tree (game.terrain.growTree);
//    without a stage state that is 1 in 14 per random tick.
//  - grass and mycelium (SpreadingSnowyDirtBlock): turn to dirt when covered (a full cube, slab or stairs above, or a liquid
//    source or fall); at light ≥ 9 above try four random spots in x±1, y-3..+1, z±1 and convert uncovered dirt not under water.
//  - farmland (FarmBlock): moist within 4 blocks of water (same level or one above) or in rain; otherwise it dries over about
//    seven random ticks (1 in 7 here), and dry farmland with no crop on it turns back to dirt.
//  - sugar cane and cactus: grow one block into air above while the column is under 3 tall, after 16 random ticks (1 in 16).
//  - ice melts to water and snow layers vanish (with their no-tool loot) at block light ≥ 12.
//  - leaves: decay once marked orphaned (no log within LEAF_DECAY_DISTANCE steps through leaves), re-checked first.
//  - copper (WeatheringCopper): with chance 0.0569 per random tick, unless a less weathered copper block is within 4 taxicab
//    blocks, ages one stage with chance ((older + 1) / (older + same + 1))², × 0.75 for unweathered copper.
import {AIR,B,BLOCKS,LIQUID,OPAQUE,blockDef,blockId,stateFor,type BlockId} from '../data/blocks';
import {CH,LEAF_DECAY_DISTANCE} from '../engine/constants';
import type {BlockSource,TreeKind} from '../engine/contracts';
import {NEIGHBOURS,KIND_LEAF,posKey,type Sim} from './ticks-core';

const FARMLAND=blockId('farmland'),FARMLAND_WET=blockId('farmland_wet'),MYCELIUM=blockId('mycelium');
const SUGAR_CANE=blockId('sugar_cane'),CACTUS=blockId('cactus');
export const IS_LOG=new Uint8Array(256),IS_LEAVES=new Uint8Array(256);
const IS_CROP=new Uint8Array(256);
/** Handler of each block's random tick (0 = none). Only these blocks count toward a section being worth ticking. */
export const RT_CROP=1,RT_SAPLING=2,RT_GRASS=3,RT_FARMLAND=4,RT_COLUMN=5,RT_ICE=6,RT_SNOW=7,RT_LEAVES=8,RT_COPPER=9,RT_LAVA=10,RT_FIRE=11;
export const RANDOM_TICK=new Uint8Array(256);
const COPPER=['copper_block','exposed_copper','weathered_copper','oxidized_copper'].map(blockId);
const COPPER_AGE=new Int8Array(256).fill(-1);
COPPER.forEach((id,i)=>{COPPER_AGE[id]=i;});
for(const d of BLOCKS){
  const f=d.family;
  if(f.endsWith('_log'))IS_LOG[d.id]=1;
  if(f.endsWith('_leaves'))IS_LEAVES[d.id]=1;
  if(d.shape==='crop')IS_CROP[d.id]=1;
  RANDOM_TICK[d.id]=d.shape==='crop'?(d.age!<d.maxAge!?RT_CROP:0):f.endsWith('_sapling')?RT_SAPLING:d.id===B.grass||d.id===MYCELIUM?RT_GRASS:
    f==='farmland'?RT_FARMLAND:d.id===SUGAR_CANE||d.id===CACTUS?RT_COLUMN:d.id===B.ice?RT_ICE:d.id===B.snow?RT_SNOW:
    IS_LEAVES[d.id]&&!d.persistent?RT_LEAVES:COPPER_AGE[d.id]>=0&&COPPER_AGE[d.id]<3?RT_COPPER:d.liquid?.kind==='lava'?RT_LAVA:f==='fire'?RT_FIRE:0;
}

// ---- Light --------------------------------------------------------------------------------------------
/** Raw light (sky not darkened by night) at a cell, as crops see it; before a chunk is lit, the cell above. */
export function rawLight(sim:Sim,x:number,y:number,z:number):number{
  const w=sim.game.world,c=w.chunk(x>>4,z>>4);
  const l=c&&!c.light&&y<CH-1?w.lightAt(x,y+1,z):w.lightAt(x,y,z);
  return Math.max(l>>4,l&15);
}
const blockLight=(sim:Sim,x:number,y:number,z:number)=>sim.game.world.lightAt(x,y,z)&15;

// ---- Crops ------------------------------------------------------------------------------------------------
const family=(id:number)=>id<0?'':blockDef(id).family;
/** Vanilla CropBlock.getGrowthSpeed. */
export function cropGrowthSpeed(world:BlockSource,id:BlockId,x:number,y:number,z:number):number{
  const own=blockDef(id).family;let speed=1;
  for(let dx=-1;dx<=1;dx++)for(let dz=-1;dz<=1;dz++){
    const below=world.get(x+dx,y-1,z+dz);
    let s=below===FARMLAND_WET?3:below===FARMLAND?1:0;
    if(dx||dz)s/=4;
    speed+=s;
  }
  const same=(bx:number,bz:number)=>family(world.get(bx,y,bz))===own;
  const row=(same(x-1,z)||same(x+1,z))&&(same(x,z-1)||same(x,z+1));
  if(row||same(x-1,z-1)||same(x+1,z-1)||same(x+1,z+1)||same(x-1,z+1))speed/=2;
  return speed;
}
const DRAWN_STAGE_STEPS=[2,2,3];
function cropTick(sim:Sim,x:number,y:number,z:number,id:BlockId){
  const d=blockDef(id);if(d.age===undefined||d.maxAge===undefined||d.age>=d.maxAge)return;
  if(rawLight(sim,x,y,z)<9)return;
  const speed=cropGrowthSpeed(sim.blocks,id,x,y,z);
  if(sim.randInt(Math.floor(25/speed)+1)!==0)return;
  if(d.maxAge===3&&sim.randInt(DRAWN_STAGE_STEPS[d.age])!==0)return;
  const next=stateFor(d.family,{age:d.age+1});
  if(next)sim.set(x,y,z,next.id,'growth');
}

function saplingTick(sim:Sim,x:number,y:number,z:number,id:BlockId){
  if(sim.game.world.brightnessAt(x,y+1,z)<9||sim.randInt(7)!==0||sim.randInt(2)!==0)return;
  const wood=blockDef(id).family.replace(/_sapling$/,'') as TreeKind;
  sim.game.terrain.growTree(sim.game.world,x,y,z,wood,()=>sim.rand());
}

// ---- Grass ----------------------------------------------------------------------------------------------
/** Blocks that smother grass below them (vanilla canBeGrass: light-blocking faces or a full liquid). */
export function coversGrass(id:number):boolean{
  if(id<=0)return false;
  if(OPAQUE[id])return true;
  const d=blockDef(id);
  if(d.shape==='stairs'||d.shape==='slab'&&d.slab==='bottom')return true;
  return !!d.liquid&&(d.liquid.level===0||d.liquid.falling);
}
function grassTick(sim:Sim,x:number,y:number,z:number,id:BlockId){
  const w=sim.blocks;
  if(coversGrass(w.get(x,y+1,z))){sim.set(x,y,z,B.dirt,'tick');return;}
  if(sim.game.world.brightnessAt(x,y+1,z)<9)return;
  for(let i=0;i<4;i++){
    const tx=x+sim.randInt(3)-1,ty=y+sim.randInt(5)-3,tz=z+sim.randInt(3)-1;
    if(w.get(tx,ty,tz)!==B.dirt)continue;
    const above=w.get(tx,ty+1,tz);
    if(above<0||coversGrass(above)||LIQUID[above]===1)continue;
    sim.set(tx,ty,tz,id,'growth');
  }
}

// ---- Farmland ---------------------------------------------------------------------------------------------
function nearWater(sim:Sim,x:number,y:number,z:number){
  const w=sim.blocks;
  for(let dy=0;dy<=1;dy++)for(let dx=-4;dx<=4;dx++)for(let dz=-4;dz<=4;dz++){const id=w.get(x+dx,y+dy,z+dz);if(id>0&&LIQUID[id]===1)return true;}
  return false;
}
function farmlandTick(sim:Sim,x:number,y:number,z:number,id:BlockId){
  if(nearWater(sim,x,y,z)||sim.game.weather.isRainingOn(x,y+1,z)){if(id!==FARMLAND_WET)sim.set(x,y,z,FARMLAND_WET,'tick');return;}
  if(id===FARMLAND_WET){if(sim.randInt(7)===0)sim.set(x,y,z,FARMLAND,'tick');return;}
  const above=sim.blocks.get(x,y+1,z);
  if(above>=0&&!IS_CROP[above])sim.set(x,y,z,B.dirt,'tick');
}

function columnTick(sim:Sim,x:number,y:number,z:number,id:BlockId){
  const w=sim.blocks;
  if(y+1>=CH||w.get(x,y+1,z)!==AIR)return;
  let height=1;while(height<3&&w.get(x,y-height,z)===id)height++;
  if(height>=3||sim.randInt(16)!==0)return;
  sim.set(x,y+1,z,id,'growth');
}

function meltTick(sim:Sim,x:number,y:number,z:number,id:BlockId,code:number){
  if(blockLight(sim,x,y,z)<=11)return;
  if(code===RT_ICE)sim.set(x,y,z,B.water,'tick');
  else sim.destroy(x,y,z,id,'tick',false);
}

// ---- Leaves -----------------------------------------------------------------------------------------------
const LR=LEAF_DECAY_DISTANCE,LG=LR*2+1;
const visited=new Uint32Array(LG*LG*LG),queue=new Int32Array(LG*LG*LG),qDepth=new Int8Array(LG*LG*LG);
let stamp=0;
/** Is a log within LEAF_DECAY_DISTANCE taxicab steps, walking through leaves of any wood? Unloaded blocks count as logs. */
export function hasLogWithin(world:BlockSource,x:number,y:number,z:number):boolean{
  if(++stamp===0xffffffff){visited.fill(0);stamp=1;}
  const centre=LR+LR*LG+LR*LG*LG;
  let head=0,tail=0;
  visited[centre]=stamp;queue[tail]=centre;qDepth[tail++]=0;
  while(head<tail){
    const c=queue[head],k=qDepth[head++];
    const ox=c%LG-LR,oy=((c/LG)|0)%LG-LR,oz=((c/(LG*LG))|0)-LR;
    for(let i=0;i<6;i++){
      const nb=NEIGHBOURS[i],dx=nb[0],dy=nb[1],dz=nb[2];
      const id=world.get(x+ox+dx,y+oy+dy,z+oz+dz);
      if(id<0||IS_LOG[id])return true;
      if(!IS_LEAVES[id]||k+1>=LR)continue;
      const n=c+dx+dy*LG+dz*LG*LG;
      if(visited[n]===stamp)continue;
      visited[n]=stamp;queue[tail]=n;qDepth[tail++]=k+1;
    }
  }
  return false;
}
/** Scheduled leaf check after a log or leaf nearby went away: an orphaned leaf is marked and passes the check on. */
export function leafCheck(sim:Sim,x:number,y:number,z:number):void{
  const w=sim.blocks,id=w.get(x,y,z);
  if(id<0||!IS_LEAVES[id])return;
  // Already orphaned: its decay re-checks for a log anyway.
  const key=posKey(x,y,z);
  if(sim.orphans.has(key)||hasLogWithin(w,x,y,z)||sim.orphans.size>=MAX_ORPHANS)return;
  sim.orphans.add(key);
  for(let i=0;i<6;i++){
    const nb=NEIGHBOURS[i],nx=x+nb[0],ny=y+nb[1],nz=z+nb[2],n=w.get(nx,ny,nz);
    if(n>=0&&IS_LEAVES[n]&&!sim.orphans.has(posKey(nx,ny,nz)))sim.schedule(nx,ny,nz,1,KIND_LEAF);
  }
}
export const MAX_ORPHANS=65536;
function leavesTick(sim:Sim,x:number,y:number,z:number,id:BlockId){
  if(!sim.orphans.size)return;
  const key=posKey(x,y,z);
  if(!sim.orphans.has(key))return;
  sim.orphans.delete(key);
  if(hasLogWithin(sim.blocks,x,y,z))return;
  sim.destroy(x,y,z,id,'tick',false);
}

// ---- Copper ---------------------------------------------------------------------------------------------
/** WeatheringCopper.getNextState: the next stage, or -1 (held back by a less weathered neighbour, or the roll failed). */
export function nextCopper(world:BlockSource,id:BlockId,x:number,y:number,z:number,random:()=>number):BlockId{
  const age=id>=0?COPPER_AGE[id]:-1;if(age<0||age>=3)return -1;
  let older=0,same=0;
  for(let dx=-4;dx<=4;dx++)for(let dy=-4;dy<=4;dy++){
    const rest=4-Math.abs(dx)-Math.abs(dy);if(rest<0)continue;
    for(let dz=-rest;dz<=rest;dz++){
      if(!dx&&!dy&&!dz)continue;
      const n=world.get(x+dx,y+dy,z+dz);if(n<0)continue;
      const a=COPPER_AGE[n];if(a<0)continue;
      if(a<age)return -1;
      if(a>age)older++;else same++;
    }
  }
  const f=(older+1)/(older+same+1),chance=f*f*(age===0?.75:1);
  return random()<chance?COPPER[age+1]:-1;
}
function copperTick(sim:Sim,x:number,y:number,z:number,id:BlockId){
  if(sim.rand()>=.05688889)return;
  const next=nextCopper(sim.blocks,id,x,y,z,()=>sim.rand());
  if(next>=0)sim.set(x,y,z,next,'tick');
}

/** Random tick of one block by its handler code (lava and fire are handled in fire.ts). Returns false for codes it does not own. */
export function growthRandomTick(sim:Sim,code:number,x:number,y:number,z:number,id:BlockId):boolean{
  switch(code){
    case RT_CROP:cropTick(sim,x,y,z,id);return true;
    case RT_SAPLING:saplingTick(sim,x,y,z,id);return true;
    case RT_GRASS:grassTick(sim,x,y,z,id);return true;
    case RT_FARMLAND:farmlandTick(sim,x,y,z,id);return true;
    case RT_COLUMN:columnTick(sim,x,y,z,id);return true;
    case RT_ICE:case RT_SNOW:meltTick(sim,x,y,z,id,code);return true;
    case RT_LEAVES:leavesTick(sim,x,y,z,id);return true;
    case RT_COPPER:copperTick(sim,x,y,z,id);return true;
  }
  return false;
}
