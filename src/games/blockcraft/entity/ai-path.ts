// Bounded A* over standable cells (vanilla WalkNodeEvaluator rules, simplified) for game.entities.ai.navigate.
//
// A node is the feet cell of a mob. For mobs up to one block wide the footprint is that one column; wider mobs use
// floor(width + 1) columns starting at the node (vanilla entityWidth), and stand at node + footprint / 2.
//  - A cell blocks the feet when its collision reaches above 0.6 of the cell (bottom slabs, beds and carpets are walked
//    over by step-up); any collision blocks the cells above the feet. Unloaded cells (-1) block.
//  - A node is standable when its body cells are clear and the cell below has a collision top above 0.6 (a floor), or
//    the feet are in water (swimming).
//  - Moves: the 8 neighbours at the same level (diagonals only without cutting corners), one block up (a jump, with
//    headroom above the mob), or down by up to MAX_DROP blocks; deeper drops are cliffs and are never taken.
//  - Lava, fire and cacti are never entered nor stood on; cells next to them cost 8 more (vanilla DANGER malus),
//    water costs 8 more for land mobs (vanilla WATER malus).
// Pure and allocation-free per search (shared scratch arrays), worker-safe: imports only data/.
import {BLOCKS,COLLISION_BOXES,LIQUID} from '../data/blocks';
import type {BlockSource} from '../engine/contracts';

/** Nodes expanded per search at most (the brief's bound). */
export const MAX_NODES=200;
/** Highest drop a path may take, in blocks (vanilla maxFallDistance 3). */
export const MAX_DROP=3;
/** Waypoints kept per path (longer paths keep the part nearest the mob; paths are re-planned as it goes). */
export const MAX_PATH=64;

/** Per block id: collision top within the cell (0 = no collision). */
const TOP=new Float32Array(256);
/** 1 = never enter or stand on (lava, fire, cactus). */
export const DANGER=new Uint8Array(256);
for(const d of BLOCKS){
  const b=COLLISION_BOXES[d.id];let top=0;for(let i=4;i<b.length;i+=6)top=Math.max(top,b[i]);
  TOP[d.id]=top;
  if(LIQUID[d.id]===2||d.family==='fire'||d.family==='cactus')DANGER[d.id]=1;
}
const LOW=.6+1e-6;
/** Collision top of a block inside its cell (0 when it has no collision). */
export const cellTop=(id:number)=>id<0?1:TOP[id];
/** Blocks the feet cell (collision taller than a step). */
const blocksFeet=(id:number)=>id<0||TOP[id]>LOW||DANGER[id]===1;
/** Blocks a cell above the feet (any collision). */
const blocksBody=(id:number)=>id<0||TOP[id]>0||DANGER[id]===1;
/** Supports feet in the cell above. */
const isFloor=(id:number)=>id>=0&&TOP[id]>LOW&&DANGER[id]===0;
const isWaterId=(id:number)=>id>=0&&LIQUID[id]===1;

export interface PathRequest{
  /** Mob box, blocks. */
  width:number;height:number;
  /** Water mobs: no water malus. */
  aquatic?:boolean;
  maxNodes?:number;maxDrop?:number;
}
export interface PathResult{
  /** Waypoints written to `out` (x,y,z cell triples), 0 when no useful path exists. */
  length:number;
  /** The path ends at (or next to) the goal; false for a partial path toward the closest reachable node. */
  complete:boolean;
  /** Nodes expanded by the search. */
  expanded:number;
}

/** Footprint columns of a mob: 1 up to one block wide, else floor(width + 1). */
export const footprint=(width:number)=>width<=1?1:Math.floor(width+1);
/** Feet cell height in cells. */
const cellsHigh=(height:number)=>Math.max(1,Math.ceil(height-1e-6));

let world:BlockSource,cw=1,chh=2;
function bodyClear(x:number,y:number,z:number):boolean{
  for(let dz=0;dz<cw;dz++)for(let dx=0;dx<cw;dx++){
    if(blocksFeet(world.get(x+dx,y,z+dz)))return false;
    for(let c=1;c<chh;c++)if(blocksBody(world.get(x+dx,y+c,z+dz)))return false;
  }
  return true;
}
function hasFloor(x:number,y:number,z:number):boolean{
  let floor=false;
  for(let dz=0;dz<cw;dz++)for(let dx=0;dx<cw;dx++){
    const id=world.get(x+dx,y-1,z+dz);
    if(id>=0&&DANGER[id])return false;
    if(isFloor(id))floor=true;
  }
  return floor;
}
function inWater(x:number,y:number,z:number):boolean{return isWaterId(world.get(x,y,z));}
function standable(x:number,y:number,z:number):boolean{return bodyClear(x,y,z)&&(hasFloor(x,y,z)||inWater(x,y,z));}
function nearDanger(x:number,y:number,z:number):boolean{
  for(let dz=-1;dz<=cw;dz++)for(let dx=-1;dx<=cw;dx++){
    const a=world.get(x+dx,y,z+dz),b=world.get(x+dx,y-1,z+dz);
    if(a>=0&&DANGER[a]||b>=0&&DANGER[b])return true;
  }
  return false;
}

/** Can a mob of this size stand with its feet in cell (x,y,z) without harm (floor or water, clear body, no hazard)? */
export function standableCell(source:BlockSource,x:number,y:number,z:number,width=.6,height=1.8):boolean{
  world=source;cw=footprint(width);chh=cellsHigh(height);
  return standable(x,y,z);
}

// ---- Search scratch -----------------------------------------------------------------------------
const CAP=4096;
const NX=new Int32Array(CAP),NY=new Int32Array(CAP),NZ=new Int32Array(CAP),PARENT=new Int32Array(CAP);
const G=new Float32Array(CAP),H=new Float32Array(CAP),F=new Float32Array(CAP),CLOSED=new Uint8Array(CAP);
const HEAP=new Int32Array(CAP);
const INDEX=new Map<number,number>();
let count=0,heapSize=0,ox=0,oz=0;
const DIRS=[[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const;
const key=(x:number,y:number,z:number)=>((x-ox+1024)*2048+(z-oz+1024))*512+(y+128);

function heapPush(n:number){
  let i=heapSize++;HEAP[i]=n;
  while(i>0){const p=(i-1)>>1;if(F[HEAP[p]]<=F[n])break;HEAP[i]=HEAP[p];HEAP[p]=n;i=p;}
}
function heapPop():number{
  const top=HEAP[0],last=HEAP[--heapSize];
  if(heapSize>0){
    let i=0;HEAP[0]=last;
    for(;;){
      const l=i*2+1,r=l+1;let m=i;
      if(l<heapSize&&F[HEAP[l]]<F[HEAP[m]])m=l;
      if(r<heapSize&&F[HEAP[r]]<F[HEAP[m]])m=r;
      if(m===i)break;
      const t=HEAP[m];HEAP[m]=HEAP[i];HEAP[i]=t;i=m;
    }
  }
  return top;
}
function heapUpdate(n:number){
  // Decrease-key: find n and sift up (heaps here are small).
  for(let i=0;i<heapSize;i++)if(HEAP[i]===n){
    while(i>0){const p=(i-1)>>1;if(F[HEAP[p]]<=F[n])break;HEAP[i]=HEAP[p];HEAP[p]=n;i=p;}
    return;
  }
  heapPush(n);
}
let gx=0,gy=0,gz=0;
const dist=(x:number,y:number,z:number)=>Math.hypot(x-gx,y-gy,z-gz);
function visit(parent:number,x:number,y:number,z:number,cost:number){
  const k=key(x,y,z),g=G[parent]+cost;let n=INDEX.get(k);
  if(n===undefined){
    if(count>=CAP)return;
    n=count++;INDEX.set(k,n);NX[n]=x;NY[n]=y;NZ[n]=z;PARENT[n]=parent;G[n]=g;H[n]=dist(x,y,z);F[n]=g+H[n];CLOSED[n]=0;heapPush(n);
  }else if(!CLOSED[n]&&g<G[n]){PARENT[n]=parent;G[n]=g;F[n]=g+H[n];heapUpdate(n);}
}

const SCRATCH_RESULT:PathResult={length:0,complete:false,expanded:0};
/** Finds a path of feet cells from (sx,sy,sz) to (tx,ty,tz). Writes waypoints (excluding the start) into `out` as x,y,z
 *  triples, at most out.length/3 of them. A goal that cannot be reached yields a partial path to the reachable node
 *  closest to it when that node is nearer than the start; otherwise length 0. */
export function findPath(source:BlockSource,sx:number,sy:number,sz:number,tx:number,ty:number,tz:number,req:PathRequest,out:Int32Array,
  result:PathResult=SCRATCH_RESULT):PathResult{
  world=source;cw=footprint(req.width);chh=cellsHigh(req.height);
  const maxNodes=req.maxNodes??MAX_NODES,maxDrop=req.maxDrop??MAX_DROP,waterCost=req.aquatic?0:8;
  INDEX.clear();count=0;heapSize=0;ox=sx;oz=sz;gx=tx;gy=ty;gz=tz;
  result.length=0;result.complete=false;result.expanded=0;
  const start=count++;INDEX.set(key(sx,sy,sz),start);
  NX[start]=sx;NY[start]=sy;NZ[start]=sz;PARENT[start]=-1;G[start]=0;H[start]=dist(sx,sy,sz);F[start]=H[start];CLOSED[start]=0;heapPush(start);
  let best=start,end=-1;
  // An unreachable goal cell (inside a block, mid-air) counts as reached from any neighbour.
  const near=standable(tx,ty,tz)?1e-6:1.001;
  while(heapSize>0&&result.expanded<maxNodes){
    const n=heapPop();if(CLOSED[n])continue;
    CLOSED[n]=1;result.expanded++;
    if(H[n]<H[best])best=n;
    if(H[n]<=near){end=n;break;}
    const x=NX[n],y=NY[n],z=NZ[n];
    // Room to jump: the cells right above the body at the current column.
    let headroom=true;for(let dz=0;dz<cw&&headroom;dz++)for(let dx=0;dx<cw;dx++)if(blocksBody(world.get(x+dx,y+chh,z+dz))){headroom=false;break;}
    for(let d=0;d<8;d++){
      const dx=DIRS[d][0],dz=DIRS[d][1],nx=x+dx,nz=z+dz,diagonal=d>=4;
      let ny:number;
      if(diagonal){
        if(!bodyClear(x+dx,y,z)||!bodyClear(x,y,z+dz)||!standable(nx,y,nz))continue;
        ny=y;
      }else if(standable(nx,y,nz))ny=y;
      else if(headroom&&!bodyClear(nx,y,nz)&&standable(nx,y+1,nz))ny=y+1;
      else if(bodyClear(nx,y,nz)){
        ny=NaN;
        for(let k=1;k<=maxDrop+1;k++){
          if(!bodyClear(nx,y-k,nz))break;
          if(hasFloor(nx,y-k,nz)||inWater(nx,y-k,nz)){if(k<=maxDrop)ny=y-k;break;}
        }
        if(Number.isNaN(ny))continue;
      }else continue;
      let cost=diagonal?Math.SQRT2:1;
      if(ny>y)cost+=.5;else if(ny<y)cost+=.25*(y-ny);
      if(inWater(nx,ny,nz))cost+=waterCost;
      if(nearDanger(nx,ny,nz))cost+=8;
      visit(n,nx,ny,nz,cost);
    }
  }
  if(end<0){
    // Partial path toward the closest node, when it brings the mob nearer.
    if(best===start||H[best]>=H[start]-.5)return result;
    end=best;
  }else result.complete=true;
  // Walk back from the end; keep the first MAX waypoints after the start.
  let steps=0;for(let n=end;n!==start&&n>=0;n=PARENT[n])steps++;
  const max=Math.floor(out.length/3),keep=Math.min(steps,max);
  let skip=steps-keep,n=end;
  while(skip-->0)n=PARENT[n];
  for(let i=keep-1;i>=0;i--){out[i*3]=NX[n];out[i*3+1]=NY[n];out[i*3+2]=NZ[n];n=PARENT[n];}
  result.length=keep;
  if(keep<steps)result.complete=false;
  return result;
}
