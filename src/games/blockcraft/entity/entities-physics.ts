// Entity motion for one 20 Hz tick, after vanilla Java 1.20:
//  - living mobs (LivingEntity.travel): the AI's moveX/moveZ intent (blocks/second of steady ground speed) becomes the
//    vanilla input speed s (intent = s² / (1 − 0.6 × 0.91) per tick), so mobs accelerate like vanilla on any surface:
//    ground acceleration s² × 0.216 / slipperiness³ then friction slipperiness × 0.91, air 0.02 s with 0.91, water 0.02 s
//    with 0.8 and gravity / 16 (slow sinking, climbing out at ledges), lava 0.02 s with 0.5 and gravity / 4. Jumps are
//    0.42 blocks/tick (8.4 blocks/second), 0.04 upward per tick when swimming. Water mobs (aquatic) swim freely toward
//    the intent in water with 0.9 drag; aquatic mobs outside category 'water' (drowned) also climb out at a ledge like
//    land mobs when their intent points at the bank (vanilla drowned use normal water travel when they do not want to
//    swim). Ladders clamp the speed to 0.15 and climb at 0.2.
//  - dropped items (ItemEntity): gravity 0.04, buoyant in water and lava, 0.98 drag, ground friction × 0.98.
//  - experience orbs (ExperienceOrb): gravity 0.03, float up in water, hop out of lava, bounce on the ground.
//  - other bodies (falling blocks, primed TNT, thrown items): gravity, move, drag, 0.7 ground friction.
// Flowing water pushes everything by 0.014 blocks/tick along engine/physics flowAt. Collision uses moveBody with the
// entity box and the kind's step height. Beds bounce falling mobs back up at 0.66 × the landing speed and dropped items
// at 0.8 of that (vanilla BedBlock.bounceUp).
import {BLOCKS,CLIMBABLE,LIQUID,SLIPPERINESS} from '../data/blocks';
import {boxCollides,flowAt,liquidHeight,moveBody,type MoveResult} from '../engine/physics';
import type {BlockSource,Entity,EntityCategory,PhysicsOptions,Vec3} from '../engine/contracts';

export type BodyType='living'|'item'|'orb'|'simple';
export const TICK=1/20;
export interface ResolvedPhysics{gravity:number;drag:number;stepHeight:number;maxFallSpeed:number}
const DEFAULTS:Record<BodyType,ResolvedPhysics>={
  living:{gravity:32,drag:.98,stepHeight:.6,maxFallSpeed:Infinity},
  item:{gravity:16,drag:.98,stepHeight:0,maxFallSpeed:Infinity},
  orb:{gravity:12,drag:.98,stepHeight:0,maxFallSpeed:Infinity},
  simple:{gravity:32,drag:.98,stepHeight:0,maxFallSpeed:Infinity}
};
export function bodyType(category:EntityCategory):BodyType{
  return category==='passive'||category==='hostile'||category==='water'?'living':category==='item'?'item':category==='xp'?'orb':'simple';
}
const num=(v:unknown,fallback:number,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback;
/** Kind options over the defaults of its body type. */
export function resolvePhysics(type:BodyType,options?:PhysicsOptions):ResolvedPhysics{
  const d=DEFAULTS[type];
  return{gravity:num(options?.gravity,d.gravity,-200,200),drag:num(options?.drag,d.drag,0,1),stepHeight:num(options?.stepHeight,d.stepHeight,0,2),
    maxFallSpeed:num(options?.maxFallSpeed,d.maxFallSpeed,0,Infinity)};
}

/** Fluids touching an entity box, from the cells it overlaps (vanilla updateFluidHeightAndDoFluidPushing). */
export interface FluidState{
  water:boolean;lava:boolean;
  /** Fluid surface above the feet, blocks. */
  waterHeight:number;lavaHeight:number;
  /** The eye cell is under the water surface. */
  eyeInWater:boolean;
  /** Mean flow direction of the touched water (not normalised). */
  flowX:number;flowZ:number;
  /** Standing in a ladder cell. */
  climbable:boolean;
}
export const newFluidState=():FluidState=>({water:false,lava:false,waterHeight:0,lavaHeight:0,eyeInWater:false,flowX:0,flowZ:0,climbable:false});
const FLOW:Vec3={x:0,y:0,z:0};
/** Fluid surface height of a liquid cell (full when the same liquid is above). */
export function surfaceIn(world:BlockSource,x:number,y:number,z:number,id:number):number{
  const above=world.get(x,y+1,z);
  return above>=0&&LIQUID[above]===LIQUID[id]?1:liquidHeight(id);
}
export function sampleFluids(world:BlockSource,e:Entity,eyeHeight:number,out:FluidState):FluidState{
  out.water=out.lava=out.eyeInWater=out.climbable=false;out.waterHeight=out.lavaHeight=out.flowX=out.flowZ=0;
  const hw=e.width/2,minY=e.y+.001,maxY=e.y+e.height-.001;
  const x0=Math.floor(e.x-hw+.001),x1=Math.floor(e.x+hw-.001),z0=Math.floor(e.z-hw+.001),z1=Math.floor(e.z+hw-.001),y0=Math.floor(minY),y1=Math.floor(maxY);
  let flows=0;
  for(let y=y0;y<=y1;y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
    const id=world.get(x,y,z);if(id<=0)continue;
    const liquid=LIQUID[id];if(!liquid)continue;
    const top=y+surfaceIn(world,x,y,z,id);
    if(top<minY)continue;
    const h=top-e.y;
    if(liquid===1){
      out.water=true;if(h>out.waterHeight)out.waterHeight=h;
      flowAt(world,x,y,z,FLOW);
      const k=h<.4?h:1;out.flowX+=FLOW.x*k;out.flowZ+=FLOW.z*k;flows++;
    }else{out.lava=true;if(h>out.lavaHeight)out.lavaHeight=h;}
  }
  if(flows>0){out.flowX/=flows;out.flowZ/=flows;}
  const fx=Math.floor(e.x),fz=Math.floor(e.z),ey=e.y+eyeHeight,eyeCell=Math.floor(ey),eid=world.get(fx,eyeCell,fz);
  out.eyeInWater=eid>0&&LIQUID[eid]===1&&ey<eyeCell+surfaceIn(world,fx,eyeCell,fz,eid);
  const feet=world.get(fx,Math.floor(e.y+.001),fz);out.climbable=feet>0&&CLIMBABLE[feet]===1;
  return out;
}

/** Per-entity physics memory. */
export interface Motion{
  /** Blocks fallen since last on the ground. */
  fallDistance:number;
  /** Set by a step: fall distance when the entity landed this tick (else 0). */
  landed:number;
  /** Horizontal distance moved this tick (walk animation, step sounds). */
  moved:number;
  wasInWater:boolean;
}
export const newMotion=():Motion=>({fallDistance:0,landed:0,moved:0,wasInWater:false});
const RESULT:MoveResult={hitX:false,hitY:false,hitZ:false,stepped:false};
/** 1 for blocks that bounce what falls on them (beds). */
const BOUNCY=new Uint8Array(256);
for(const d of BLOCKS)if(d.family==='bed')BOUNCY[d.id]=1;
/** Bounce factors (vanilla: 1 for living entities, 0.8 for others). */
const LIVING_BOUNCE=1,ITEM_BOUNCE=.8;
/** Vanilla steady ground speed fraction: speed per tick = s² / (1 − 0.6 × 0.91). */
const GROUND_KEEP=.6*.91;

/** Block slipperiness under the feet (vanilla getBlockPosBelowThatAffectsMyMovement: 0.5 below). */
function slipperinessBelow(world:BlockSource,e:Entity):number{
  const id=world.get(Math.floor(e.x),Math.floor(e.y-.5000001),Math.floor(e.z));
  return id>=0?SLIPPERINESS[id]:.6;
}
function liquidIn(world:BlockSource,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):boolean{
  for(let y=Math.floor(minY);y<=Math.floor(maxY-1e-4);y++)for(let z=Math.floor(minZ);z<=Math.floor(maxZ-1e-4);z++)for(let x=Math.floor(minX);x<=Math.floor(maxX-1e-4);x++){
    const id=world.get(x,y,z);if(id>0&&LIQUID[id])return true;
  }
  return false;
}
/** Moves by (ux,uy,uz) blocks this tick; returns the new per-tick velocity components via the entity (blocks/second).
 *  `bounce` > 0: landing on a bed sends the entity back up at -uy × 0.66 × bounce (Block.updateEntityAfterFallOn). */
function move(world:BlockSource,e:Entity,ux:number,uy:number,uz:number,stepHeight:number,m:Motion,bounce=0):MoveResult{
  const sx=e.x,sy=e.y,sz=e.z;
  e.vx=ux/TICK;e.vy=uy/TICK;e.vz=uz/TICK;
  moveBody(world,e,e.width/2,e.height,TICK,RESULT,stepHeight);
  e.collidedH=RESULT.hitX||RESULT.hitZ;e.collidedV=RESULT.hitY;
  if(bounce>0&&RESULT.hitY&&uy<0&&e.onGround){
    const below=world.get(Math.floor(e.x),Math.floor(e.y-.2),Math.floor(e.z));
    if(below>=0&&BOUNCY[below])e.vy=-uy*.66*bounce/TICK;
  }
  m.moved=Math.hypot(e.x-sx,e.z-sz);
  const dy=e.y-sy;
  if(e.onGround){m.landed=m.fallDistance;m.fallDistance=0;}
  else{m.landed=0;if(dy<0)m.fallDistance-=dy;}
  return RESULT;
}
/** Flow push (blocks/tick), vanilla 0.014 along the normalised mean flow; written to PUSH (no allocation). */
const PUSH={x:0,z:0};
function push(f:FluidState){
  const len=Math.hypot(f.flowX,f.flowZ);
  if(len>1e-6){PUSH.x=f.flowX/len*.014;PUSH.z=f.flowZ/len*.014;}else PUSH.x=PUSH.z=0;
}

/** Vanilla LivingEntity.travel climb-out: after a blocked move in a liquid, the box raised 0.6 above the start (and moved
 *  by the remaining motion) is free of blocks and liquid. */
function canClimbOut(world:BlockSource,e:Entity,ux:number,uy:number,uz:number,y0:number):boolean{
  const hw=e.width/2,ny=e.y+uy+.6-(e.y-y0);
  const minX=e.x+ux-hw,minZ=e.z+uz-hw,maxX=e.x+ux+hw,maxZ=e.z+uz+hw;
  return !boxCollides(world,minX,ny,minZ,maxX,ny+e.height,maxZ)&&!liquidIn(world,minX,ny,minZ,maxX,ny+e.height,maxZ);
}
/** The move was blocked along an axis the movement intent pushes into (the mob wants to go that way). */
function intentBlocked(r:MoveResult,dirX:number,dirZ:number):boolean{
  return r.hitX&&Math.abs(dirX)>.1||r.hitZ&&Math.abs(dirZ)>.1;
}

/** One tick of a living mob's motion. */
export function stepLiving(world:BlockSource,e:Entity,p:ResolvedPhysics,f:FluidState,aquatic:boolean,m:Motion):void{
  let ux=e.vx*TICK,uy=e.vy*TICK,uz=e.vz*TICK;
  if(f.water){push(f);ux+=PUSH.x;uz+=PUSH.z;}
  const g=p.gravity/400,threshold=e.height*.85<.4?0:.4;
  if(e.jump){
    const swim=f.water&&(f.waterHeight>threshold||!e.onGround)||f.lava&&(f.lavaHeight>threshold||!e.onGround);
    if(swim)uy+=.04;else if(e.onGround)uy=.42;
    e.jump=false;
  }
  const target=Math.hypot(e.moveX,e.moveZ)*TICK;
  const dirX=target>1e-9?e.moveX*TICK/target:0,dirZ=target>1e-9?e.moveZ*TICK/target:0;
  const s=Math.sqrt(target*(1-GROUND_KEEP));
  const y0=e.y;
  if(f.water&&aquatic){
    const a=target*.1;ux+=dirX*a;uz+=dirZ*a;
    const hit=move(world,e,ux,uy,uz,p.stepHeight,m,LIVING_BOUNCE);
    ux=e.vx*TICK*.9;uz=e.vz*TICK*.9;uy=(e.vy*TICK-g/16)*.9;
    // Aquatic land-dwellers (drowned) heading for the bank climb out like any mob in water.
    if(e.category!=='water'&&e.collidedH&&target>1e-9&&intentBlocked(hit,dirX,dirZ)&&canClimbOut(world,e,ux,uy,uz,y0))uy=.3;
  }else if(f.water||f.lava){
    const a=.02*s;ux+=dirX*a;uz+=dirZ*a;
    move(world,e,ux,uy,uz,p.stepHeight,m,LIVING_BOUNCE);
    ux=e.vx*TICK;uy=e.vy*TICK;uz=e.vz*TICK;
    if(f.climbable&&e.collidedH)uy=.2;
    if(f.water){
      ux*=.8;uy*=.8;uz*=.8;
      if(g>0){const falling=uy<=0;uy=falling&&Math.abs(uy-.005)>=.003&&Math.abs(uy-g/16)<.003?-.003:uy-g/16;}
    }else{
      if(f.lavaHeight<=threshold){ux*=.5;uy*=.8;uz*=.5;}else{ux*=.5;uy*=.5;uz*=.5;}
      if(g>0)uy-=g/4;
    }
    // Climb out at a ledge (vanilla: the box raised 0.6 above the start is free of blocks and liquid).
    if(e.collidedH&&canClimbOut(world,e,ux,uy,uz,y0))uy=.3;
    m.fallDistance=0;
  }else{
    const f2=slipperinessBelow(world,e),f3=e.onGround?f2*.91:.91;
    const a=e.onGround?s*s*(.21600002/(f2*f2*f2)):.02*s;
    ux+=dirX*a;uz+=dirZ*a;
    if(f.climbable){
      m.fallDistance=0;ux=Math.max(-.15,Math.min(.15,ux));uz=Math.max(-.15,Math.min(.15,uz));uy=Math.max(uy,-.15);
    }
    move(world,e,ux,uy,uz,p.stepHeight,m,LIVING_BOUNCE);
    ux=e.vx*TICK;uy=e.vy*TICK;uz=e.vz*TICK;
    if(f.climbable&&e.collidedH)uy=.2;
    uy=(uy-g)*p.drag;ux*=f3;uz*=f3;
  }
  if(-uy*20>p.maxFallSpeed)uy=-p.maxFallSpeed*TICK;
  e.vx=ux/TICK;e.vy=uy/TICK;e.vz=uz/TICK;
}

/** One tick of a dropped item. */
export function stepItem(world:BlockSource,e:Entity,p:ResolvedPhysics,f:FluidState,m:Motion):void{
  let ux=e.vx*TICK,uy=e.vy*TICK,uz=e.vz*TICK;
  if(f.water){push(f);ux+=PUSH.x;uz+=PUSH.z;}
  if(f.water&&f.waterHeight>.1){ux*=.99;uz*=.99;if(uy<.06)uy+=5e-4;}
  else if(f.lava&&f.lavaHeight>.1){ux*=.95;uz*=.95;if(uy<.06)uy+=5e-4;}
  else uy-=p.gravity/400;
  e.jump=false;
  move(world,e,ux,uy,uz,p.stepHeight,m,ITEM_BOUNCE);
  ux=e.vx*TICK;uy=e.vy*TICK;uz=e.vz*TICK;
  const fr=e.onGround?slipperinessBelow(world,e)*.98:p.drag;
  ux*=fr;uz*=fr;uy*=p.drag;
  if(e.onGround&&uy<0)uy*=-.5;
  if(f.water)m.fallDistance=0;
  e.vx=ux/TICK;e.vy=uy/TICK;e.vz=uz/TICK;
}

/** One tick of an experience orb; `target` (the player's body centre) attracts it within 8 blocks. */
export function stepOrb(world:BlockSource,e:Entity,p:ResolvedPhysics,f:FluidState,m:Motion,target:Vec3|null,random:()=>number):void{
  let ux=e.vx*TICK,uy=e.vy*TICK,uz=e.vz*TICK;
  if(f.water){push(f);ux+=PUSH.x;uz+=PUSH.z;}
  if(f.eyeInWater){ux*=.99;uz*=.99;uy=Math.min(uy+5e-4,.06);}
  else uy-=p.gravity/400;
  if(f.lava){ux=(random()-random())*.2;uy=.2;uz=(random()-random())*.2;}
  if(target){
    const dx=target.x-e.x,dy=target.y-(e.y+e.height/2),dz=target.z-e.z,d2=dx*dx+dy*dy+dz*dz;
    if(d2<64&&d2>1e-6){const d=Math.sqrt(d2),k=1-d/8,a=k*k*.1/d;ux+=dx*a;uy+=dy*a;uz+=dz*a;}
  }
  e.jump=false;
  move(world,e,ux,uy,uz,0,m);
  ux=e.vx*TICK;uy=e.vy*TICK;uz=e.vz*TICK;
  const fr=e.onGround?slipperinessBelow(world,e)*.98:p.drag;
  ux*=fr;uz*=fr;uy*=p.drag;
  if(e.onGround)uy*=-.9;
  e.vx=ux/TICK;e.vy=uy/TICK;e.vz=uz/TICK;
}

/** One tick of any other body (falling blocks, primed TNT, thrown items with physics options). */
export function stepSimple(world:BlockSource,e:Entity,p:ResolvedPhysics,f:FluidState,m:Motion):void{
  let ux=e.vx*TICK,uy=e.vy*TICK,uz=e.vz*TICK;
  if(f.water){push(f);ux+=PUSH.x;uz+=PUSH.z;ux*=.8;uy*=.8;uz*=.8;}
  uy-=p.gravity/400;
  e.jump=false;
  move(world,e,ux,uy,uz,p.stepHeight,m);
  ux=e.vx*TICK*p.drag;uy=e.vy*TICK*p.drag;uz=e.vz*TICK*p.drag;
  if(e.onGround){ux*=.7;uz*=.7;if(uy<0)uy*=-.5;}
  if(-uy*20>p.maxFallSpeed)uy=-p.maxFallSpeed*TICK;
  e.vx=ux/TICK;e.vy=uy/TICK;e.vz=uz/TICK;
}
