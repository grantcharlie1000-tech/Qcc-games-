// Water and lava after vanilla Java 1.20 FlowingFluid / LiquidBlock, on the registry's liquid states:
// a source (level 0, amount 8), flowing levels 1..7 (amount 8 - level) and one falling state (amount 8).
//  - Scheduled ticks (KIND_FLUID): water every 5 ticks, lava every 30 (×4 at random when a lava level rises).
//  - A non-source recomputes itself from its neighbours (getNewLiquid): falling under the same liquid, a new water source
//    between two sources over solid ground or a source, else the strongest horizontal neighbour minus the drop-off
//    (water 1, lava 2); nothing left means it drains to air.
//  - Spreading: down first; sideways from sources, from flows that cannot fall, and from falling liquid landing (amount 7),
//    only toward the nearest drop within the slope distance (water 4, lava 2), or every way when there is none.
//  - Water washes away the non-solid blocks it enters and pops their loot; lava burns them with a fizz.
//  - Reactions (LiquidBlock.shouldSpreadLiquid): lava with water above or beside it becomes obsidian (source) or cobblestone;
//    lava flowing down into water turns that water to stone.
import {AIR,B,BLOCKS,LIQUID,SOLID,type BlockId} from '../data/blocks';
import {KIND_FLUID,type Sim} from './ticks-core';

export const WATER=1,LAVA=2;
/** Ticks between updates, level drop per block and the reach of the search for a drop, by liquid (index 1 water, 2 lava). */
export const TICK_DELAY=[0,5,30],DROP_OFF=[0,1,2],SLOPE_DISTANCE=[0,4,2];

const AMOUNT=new Uint8Array(256),SOURCE=new Uint8Array(256),FALLING=new Uint8Array(256);
/** Blocks a liquid can never enter: anything solid, plus doors, ladders and sugar cane (vanilla canHoldFluid). */
const BLOCKS_FLUID=new Uint8Array(256);
const SOURCE_ID=[0,0,0],FALLING_ID=[0,0,0],FLOWING_ID=[new Int16Array(9),new Int16Array(9),new Int16Array(9)];
for(const d of BLOCKS){
  BLOCKS_FLUID[d.id]=+(d.solid||d.family==='oak_door'||d.family==='ladder'||d.family==='sugar_cane');
  const l=d.liquid;if(!l)continue;
  const kind=l.kind==='water'?WATER:LAVA;
  AMOUNT[d.id]=l.falling||l.level===0?8:8-l.level;SOURCE[d.id]=+(l.level===0&&!l.falling);FALLING[d.id]=+l.falling;
  if(l.falling)FALLING_ID[kind]=d.id;else if(l.level===0)SOURCE_ID[kind]=d.id;else FLOWING_ID[kind][8-l.level]=d.id;
}
export const canHoldFluid=(id:number)=>id>=0&&BLOCKS_FLUID[id]===0;

// A fluid state is packed in a small integer: amount (1..8) | FALL | SRC; 0 = empty.
const FALL=16,SRC=32;
export function fluidState(id:number,kind:number):number{
  if(id<0||LIQUID[id]!==kind)return 0;
  return AMOUNT[id]|(FALLING[id]?FALL:0)|(SOURCE[id]?SRC:0);
}
export function fluidBlock(kind:number,state:number):BlockId{
  if(!state)return AIR;
  if(state&SRC)return SOURCE_ID[kind];
  if(state&FALL)return FALLING_ID[kind];
  return FLOWING_ID[kind][Math.min(7,state&15)]||FLOWING_ID[kind][7];
}

/** Vanilla getNewLiquid: what a cell should hold given its neighbours. */
export function newLiquid(sim:Sim,kind:number,x:number,y:number,z:number):number{
  const w=sim.blocks;let max=0,sources=0;
  for(let d=0;d<4;d++){
    const n=w.get(x+DX[d],y,z+DZ[d]);
    if(n>=0&&LIQUID[n]===kind){if(SOURCE[n])sources++;if(AMOUNT[n]>max)max=AMOUNT[n];}
  }
  if(kind===WATER&&sources>=2){
    const b=w.get(x,y-1,z);
    if(b>=0&&(SOLID[b]===1||LIQUID[b]===kind&&SOURCE[b]===1))return 8|SRC;
  }
  const a=w.get(x,y+1,z);
  if(a>=0&&LIQUID[a]===kind)return 8|FALL;
  const k=max-DROP_OFF[kind];
  return k<=0?0:k;
}

/** Scheduled tick of a liquid block (FlowingFluid.tick). */
export function fluidTick(sim:Sim,x:number,y:number,z:number):void{
  const id=sim.blocks.get(x,y,z);if(id<=0)return;
  const kind=LIQUID[id];if(!kind)return;
  let state=fluidState(id,kind);
  if(!(state&SRC)){
    const next=newLiquid(sim,kind,x,y,z);
    const delay=spreadDelay(sim,kind,state,next);
    if(!next){sim.set(x,y,z,AIR,'fluid');return;}
    if(next!==state){state=next;sim.set(x,y,z,fluidBlock(kind,next),'fluid');sim.schedule(x,y,z,delay,KIND_FLUID);}
  }
  spread(sim,kind,x,y,z,state);
}
function spreadDelay(sim:Sim,kind:number,old:number,next:number){
  let d=TICK_DELAY[kind];
  if(kind===LAVA&&old&&next&&!(old&FALL)&&!(next&FALL)&&(next&15)>(old&15)&&sim.randInt(4)!==0)d*=4;
  return d;
}

/** Reaction to a neighbour change (LiquidBlock.neighborChanged / onPlace): lava meeting water hardens, otherwise
 *  the liquid schedules its next update. */
export function fluidNeighbourChanged(sim:Sim,x:number,y:number,z:number,id:BlockId):void{
  const kind=LIQUID[id];if(!kind)return;
  if(kind===LAVA){
    const w=sim.blocks;
    if(isWater(w.get(x,y+1,z))||isWater(w.get(x,y,z-1))||isWater(w.get(x,y,z+1))||isWater(w.get(x+1,y,z))||isWater(w.get(x-1,y,z))){
      sim.set(x,y,z,SOURCE[id]?B.obsidian:B.cobblestone,'fluid');sim.fizz(x,y,z);
      return;
    }
  }
  sim.schedule(x,y,z,TICK_DELAY[kind],KIND_FLUID);
}
const isWater=(id:number)=>id>=0&&LIQUID[id]===WATER;

const DOWN=true;
function spread(sim:Sim,kind:number,x:number,y:number,z:number,state:number){
  if(!state)return;
  const below=sim.blocks.get(x,y-1,z);
  if(canSpreadTo(kind,below,DOWN)){
    spreadTo(sim,kind,x,y-1,z,below,DOWN,newLiquid(sim,kind,x,y-1,z));
    if(sourceNeighbours(sim,kind,x,y,z)>=3)spreadToSides(sim,kind,x,y,z,state);
  }else if(state&SRC||!isHole(kind,below))spreadToSides(sim,kind,x,y,z,state);
}
/** canBeReplacedWith + canHoldFluid: empty cells and non-solid blocks; water only by lava from above; lava (at least
 *  4/9 full) only by water. */
function canSpreadTo(kind:number,target:number,down:boolean):boolean{
  if(!canHoldFluid(target))return false;
  const t=LIQUID[target];
  if(!t)return true;
  if(t===WATER)return down&&kind===LAVA;
  return kind===WATER&&AMOUNT[target]>=4;
}
function spreadTo(sim:Sim,kind:number,x:number,y:number,z:number,target:number,down:boolean,state:number){
  if(kind===LAVA&&down&&LIQUID[target]===WATER){sim.set(x,y,z,B.stone,'fluid');sim.fizz(x,y,z);return;}
  if(!state||!sim.set(x,y,z,fluidBlock(kind,state),'fluid'))return;
  // beforeDestroyingBlock: water pops what it washes away, lava burns it.
  if(target!==AIR&&!LIQUID[target]){
    if(kind===WATER)sim.dropLoot(target,x,y,z,'fluid');else sim.fizz(x,y,z);
  }
}
function sourceNeighbours(sim:Sim,kind:number,x:number,y:number,z:number){
  let n=0;
  for(let d=0;d<4;d++){const id=sim.blocks.get(x+DX[d],y,z+DZ[d]);if(id>=0&&LIQUID[id]===kind&&SOURCE[id])n++;}
  return n;
}
/** A cell the liquid can fall out of: the cell below holds the same liquid or could. */
const isHole=(kind:number,below:number)=>below>=0&&(LIQUID[below]===kind||canHoldFluid(below));
const passable=(kind:number,id:number)=>canHoldFluid(id)&&!(LIQUID[id]===kind&&SOURCE[id]===1);

function spreadToSides(sim:Sim,kind:number,x:number,y:number,z:number,state:number){
  const amount=state&FALL?7:(state&15)-DROP_OFF[kind];
  if(amount<=0)return;
  const dirs=flowDirections(sim,kind,x,y,z);
  for(let d=0;d<4;d++){
    if(!(dirs&1<<d))continue;
    const tx=x+DX[d],tz=z+DZ[d],target=sim.blocks.get(tx,y,tz);
    if(!canSpreadTo(kind,target,false))continue;
    spreadTo(sim,kind,tx,y,tz,target,false,newLiquid(sim,kind,tx,y,tz));
  }
}

// ---- Direction choice (FlowingFluid.getSpread / getSlopeDistance) ------------------------------------------
// Vanilla searches, for each open horizontal neighbour, the shortest path through open cells to a cell above a
// drop, up to the slope distance, and flows only along the directions with the shortest path (all of them when no drop
// is in reach). One breadth-first search from the four neighbours at once gives the same directions: each visited cell
// carries the set of first steps that reach it in the fewest steps.
const DX=[0,1,0,-1],DZ=[-1,0,1,0];
const R=6,G=R*2+1;
const depth=new Int8Array(G*G),firstSteps=new Uint8Array(G*G),cells=new Int16Array(G*G);
/** Bit mask of the directions (bit d = DX[d], DZ[d]) the liquid at (x,y,z) spreads toward. */
export function flowDirections(sim:Sim,kind:number,x:number,y:number,z:number):number{
  const w=sim.blocks,limit=SLOPE_DISTANCE[kind];
  depth.fill(-1);
  const origin=R+R*G;depth[origin]=0x7f;
  let head=0,tail=0,open=0,best=1000,result=0;
  for(let d=0;d<4;d++){
    const c=origin+DX[d]+DZ[d]*G;
    if(!passable(kind,w.get(x+DX[d],y,z+DZ[d])))continue;
    open|=1<<d;depth[c]=0;firstSteps[c]=1<<d;cells[tail++]=c;
  }
  while(head<tail){
    const c=cells[head++],k=depth[c];
    if(k>best)break;
    const cx=x+(c%G)-R,cz=z+((c/G)|0)-R;
    if(isHole(kind,w.get(cx,y-1,cz))){
      if(k<best){best=k;result=firstSteps[c];}else result|=firstSteps[c];
      continue;
    }
    if(k>=limit)continue;
    for(let d=0;d<4;d++){
      const n=c+DX[d]+DZ[d]*G,nd=depth[n];
      if(nd===-1){
        if(!passable(kind,w.get(cx+DX[d],y,cz+DZ[d]))){depth[n]=0x7e;continue;}
        depth[n]=k+1;firstSteps[n]=firstSteps[c];cells[tail++]=n;
      }else if(nd===k+1)firstSteps[n]|=firstSteps[c];
    }
  }
  return best<1000?result:open;
}
