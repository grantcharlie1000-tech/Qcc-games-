// Random-tick behaviour of plants and other changing blocks, after vanilla Java 1.20:
//  - crops (CropBlock): at raw light ≥ 9 grow one age with chance 1 / (floor(25 / speed) + 1), speed from the 3×3 farmland
//    below (wet counts 3, dry 1, the sides a quarter) halved beside the same crop in a row or diagonal. Carrots and potatoes
//    draw 4 of vanilla's 8 ages, so each drawn stage takes the 2, 2 and 3 vanilla steps it stands for.
//  - saplings: at light ≥ 9 above, 1 in 7 advances a hidden stage, the next success grows the tree (game.terrain.growTree);
//    without a stage state that is 1 in 14 per random tick.
//  - grass and mycelium (SpreadingSnowyDirtBlock): turn to dirt when covered (a full cube, slab or stairs above, or a liquid
//    source or fall); at light ≥ 9 above try four random spots in x±1, y-3..+1, z±1 and convert uncovered dirt not under water.
//  - farmland (FarmBlock): moist within 4 blocks of water (same level or one above) or in rain; otherwise it dries over about
//    seven random ticks (1 in 7 here), and dry farmland with no crop on it turns back to dirt. Landing on it tramples it
//    (FarmBlock.fallOn, farmlandFallOn below).
//  - sugar cane and cactus: grow one block into air above while the column is under 3 tall, after 16 random ticks (1 in 16).
//  - ice melts to water when block light ≥ 12 reaches it (in or beside the ice: a torch up to 3 blocks away, as in vanilla)
//    and snow layers vanish (with their no-tool loot) at block light ≥ 12 in their cell.
//  - leaves: decay once marked orphaned (no log within LEAF_DECAY_DISTANCE steps through leaves), re-checked first. The checks
//    that mark them are scheduled by leafSourceRemoved when a log or leaf nearby goes away; persistent leaves never decay.
//  - copper (WeatheringCopper): with chance 0.0569 per random tick, unless a less weathered copper block is within 4 taxicab
//    blocks, ages one stage with chance ((older + 1) / (older + same + 1))², × 0.75 for unweathered copper.
import {AIR,B,BLOCKS,LIQUID,OPAQUE,blockDef,blockId,stateFor,type BlockId} from '../data/blocks';
import {CH,LEAF_DECAY_DISTANCE} from '../engine/constants';
import type {BlockSource,TreeKind} from '../engine/contracts';
import {NEIGHBOURS,KIND_LEAF,posKey,type Sim} from './ticks-core';

const FARMLAND=blockId('farmland'),FARMLAND_WET=blockId('farmland_wet'),MYCELIUM=blockId('mycelium');
const SUGAR_CANE=blockId('sugar_cane'),CACTUS=blockId('cactus');
export const IS_LOG=new Uint8Array(256),IS_LEAVES=new Uint8Array(256),PERSISTENT_LEAVES=new Uint8Array(256);
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
  if(f.endsWith('_leaves')){IS_LEAVES[d.id]=1;PERSISTENT_LEAVES[d.id]=+!!d.persistent;}
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

/** FarmBlock.fallOn: a player landing on farmland after falling `fallDistance` blocks turns it to dirt with chance
 *  fallDistance - 0.5, when their box is big enough (width² × height > 0.512: not crawling or swimming). The block landed on
 *  is the one 0.2 below the feet under the box (vanilla getOnPosLegacy with its main supporting block: the nearest to the
 *  centre). Returns true when it trampled. The crop on top pops off (it loses its farmland). */
export function farmlandFallOn(sim:Sim,fallDistance:number,x:number,y:number,z:number,width:number,height:number):boolean{
  if(!(fallDistance>.5)||!(width*width*height>.512)||!Number.isFinite(x+y+z))return false;
  const by=Math.floor(y-.2),hw=width/2;if(by<0||by>=CH)return false;
  let best=-1,bx=0,bz=0,bestD=Infinity;
  for(let cz=Math.floor(z-hw+1e-4);cz<=Math.floor(z+hw-1e-4);cz++)for(let cx=Math.floor(x-hw+1e-4);cx<=Math.floor(x+hw-1e-4);cx++){
    const id=sim.blocks.get(cx,by,cz);if(id<=0)continue;
    const d=(cx+.5-x)**2+(cz+.5-z)**2;
    if(d<bestD){bestD=d;best=id;bx=cx;bz=cz;}
  }
  if(best!==FARMLAND&&best!==FARMLAND_WET)return false;
  if(!(sim.rand()<fallDistance-.5))return false;
  return sim.set(bx,by,bz,B.dirt,'entity');
}
function columnTick(sim:Sim,x:number,y:number,z:number,id:BlockId){
  const w=sim.blocks;
  if(y+1>=CH||w.get(x,y+1,z)!==AIR)return;
  let height=1;while(height<3&&w.get(x,y-height,z)===id)height++;
  if(height>=3||sim.randInt(16)!==0)return;
  sim.set(x,y+1,z,id,'growth');
}

/** Brightest block light arriving at a cell: its own or a face neighbour's. */
function blockLightAround(sim:Sim,x:number,y:number,z:number){
  let best=blockLight(sim,x,y,z);
  for(let i=0;i<6;i++){const n=NEIGHBOURS[i],ny=y+n[1];if(ny>=0&&ny<CH)best=Math.max(best,blockLight(sim,x+n[0],ny,z+n[2]));}
  return best;
}
/** IceBlock: melts when block light 12 reaches it (vanilla tests its own cell > 11 - lightBlock 1; the light engine here dims
 *  light more inside ice, so the light beside it is used). SnowLayerBlock: block light 12 in its own cell. */
function meltTick(sim:Sim,x:number,y:number,z:number,id:BlockId,code:number){
  if(code===RT_ICE){if(blockLightAround(sim,x,y,z)>=12)sim.set(x,y,z,B.water,'tick');return;}
  if(blockLight(sim,x,y,z)>=12)sim.destroy(x,y,z,id,'tick',false);
}

// ---- Leaves -----------------------------------------------------------------------------------------------
// Vanilla keeps each leaf's distance to the nearest log (1..7) in its state and re-checks every leaf whose distance changes.
// Without that state: when a log or leaf goes away, every leaf whose shortest path to a log may have run through it gets a
// check. Such a leaf lies within LEAF_DECAY_DISTANCE - d steps (through leaves) of the removed cell, d being the removed
// cell's own distance to a log (0 for a log), so a bounded flood from the removed cell reaches all of them.
const LR=LEAF_DECAY_DISTANCE,LG=LR*2+1,CENTRE=LR+LR*LG+LR*LG*LG;
const visited=new Uint32Array(LG*LG*LG),queue=new Int32Array(LG*LG*LG),qDepth=new Int8Array(LG*LG*LG);
let stamp=0;
const nextStamp=()=>{if(++stamp===0xffffffff){visited.fill(0);stamp=1;}return stamp;};
/** Taxicab steps (1..LEAF_DECAY_DISTANCE) from a cell to the nearest log, walking through leaves of any wood (persistent
 *  ones too); 0 when none is that close. Unloaded blocks count as logs. The cell's own block is not looked at. */
export function logDistance(world:BlockSource,x:number,y:number,z:number):number{
  const s=nextStamp();
  let head=0,tail=0;
  visited[CENTRE]=s;queue[tail]=CENTRE;qDepth[tail++]=0;
  while(head<tail){
    const c=queue[head],k=qDepth[head++];
    const ox=c%LG-LR,oy=((c/LG)|0)%LG-LR,oz=((c/(LG*LG))|0)-LR;
    for(let i=0;i<6;i++){
      const nb=NEIGHBOURS[i],dx=nb[0],dy=nb[1],dz=nb[2];
      const id=world.get(x+ox+dx,y+oy+dy,z+oz+dz);
      if(id<0||IS_LOG[id])return k+1;
      if(!IS_LEAVES[id]||k+1>=LR)continue;
      const n=c+dx+dy*LG+dz*LG*LG;
      if(visited[n]===s)continue;
      visited[n]=s;queue[tail]=n;qDepth[tail++]=k+1;
    }
  }
  return 0;
}
/** Is a log within LEAF_DECAY_DISTANCE taxicab steps, walking through leaves? */
export const hasLogWithin=(world:BlockSource,x:number,y:number,z:number):boolean=>logDistance(world,x,y,z)>0;
/** A log or leaf at (x,y,z) went away (the cell already holds its new block): schedules a decay check for every natural
 *  leaf that may have lost its link to a log through it. Returns the number of leaves scheduled. */
export function leafSourceRemoved(sim:Sim,x:number,y:number,z:number,wasLog:boolean):number{
  const w=sim.blocks;
  let reach=LR;
  // A removed leaf with no log in reach carried nobody's link (an orphan decaying, for one).
  if(!wasLog){const d=logDistance(w,x,y,z);if(!d)return 0;reach=LR-d;}
  if(reach<=0)return 0;
  const s=nextStamp();
  let head=0,tail=0,scheduled=0;
  visited[CENTRE]=s;queue[tail]=CENTRE;qDepth[tail++]=0;
  while(head<tail){
    const c=queue[head],k=qDepth[head++];
    const ox=c%LG-LR,oy=((c/LG)|0)%LG-LR,oz=((c/(LG*LG))|0)-LR;
    for(let i=0;i<6;i++){
      const nb=NEIGHBOURS[i],dx=nb[0],dy=nb[1],dz=nb[2];
      const n=c+dx+dy*LG+dz*LG*LG;
      if(visited[n]===s)continue;
      visited[n]=s;
      const tx=x+ox+dx,ty=y+oy+dy,tz=z+oz+dz,id=w.get(tx,ty,tz);
      if(id<=0||!IS_LEAVES[id])continue;
      // Persistent leaves pass the link on (vanilla keeps their distance too) but never decay.
      if(!PERSISTENT_LEAVES[id]&&!sim.orphans.has(posKey(tx,ty,tz))){sim.schedule(tx,ty,tz,1,KIND_LEAF);scheduled++;}
      if(k+1<reach){queue[tail]=n;qDepth[tail++]=k+1;}
    }
  }
  return scheduled;
}
/** Scheduled leaf check: a natural leaf with no log within LEAF_DECAY_DISTANCE is marked to decay on its next random tick. */
export function leafCheck(sim:Sim,x:number,y:number,z:number):void{
  const id=sim.blocks.get(x,y,z);
  if(id<0||!IS_LEAVES[id]||PERSISTENT_LEAVES[id])return;
  const key=posKey(x,y,z);
  // Already orphaned: its decay re-checks for a log anyway.
  if(sim.orphans.has(key)||sim.orphans.size>=MAX_ORPHANS||hasLogWithin(sim.blocks,x,y,z))return;
  sim.orphans.add(key);
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
