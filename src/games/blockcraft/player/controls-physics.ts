// Player movement constants and world probes. Vanilla Java Edition runs movement at 20 ticks per second
// with per-tick velocity factors; Blockcraft integrates at PHYSICS_HZ (60). Every vanilla rule of the form
// "add an acceleration, move, multiply by a factor" is a first-order system v ← R·v + (1-R)·T whose
// terminal displacement rate T and per-tick retention R are kept exactly: each 60 Hz step retains R^(1/3).
// So walking still settles at 4.317 m/s with the same response time, a jump still peaks at 1.25 blocks.
import {CLIMBABLE,COLLISION_BOXES,LIQUID,SLIPPERINESS,blockDef} from '../data/blocks';
import {PHYSICS_HZ,TPS} from '../engine/constants';
import {flowAt,liquidHeight} from '../engine/physics';
import type {BlockSource,Vec3} from '../engine/contracts';

/** Physics steps per game tick. */
export const STEPS_PER_TICK=PHYSICS_HZ/TPS;
/** Per-step retention for a vanilla per-tick velocity factor. */
export const perStep=(perTick:number)=>Math.pow(perTick,1/STEPS_PER_TICK);
/** Displacement rate (blocks/second) of a vanilla per-tick system: add `accel` (blocks/tick) each tick, keep `retain`. */
export const terminal=(accel:number,retain:number)=>TPS*accel/(1-retain);

// ---- Vanilla numbers (blocks per tick unless noted) ----------------------------------------------
/** Movement speed attribute of a player; sprinting multiplies it by 1.3, Speed +20%/level, Slowness -15%/level. */
export const BASE_SPEED=.1,SPRINT_MULTIPLIER=1.3,SPEED_PER_LEVEL=.2,SLOWNESS_PER_LEVEL=.15;
/** Input impulses are scaled by 0.98 every tick (LivingEntity.aiStep). */
export const INPUT_SCALE=.98;
/** Sneaking (and crawling) multiplies the input by 0.3, using an item by 0.2. */
export const SNEAK_INPUT=.3,USE_INPUT=.2;
export const AIR_RETAIN=.91,AIR_ACCEL=.02,AIR_ACCEL_SPRINT=.026;
export const FLY_ACCEL=.05,FLY_VERTICAL=.15,FLY_VERTICAL_RETAIN=.6;
export const WATER_RETAIN=.8,WATER_RETAIN_SPRINT=.9,LIQUID_ACCEL=.02,LAVA_RETAIN=.5;
export const LIQUID_JUMP=.04,WATER_SINK=.005,LAVA_SINK=.02;
export const WATER_PUSH=.014,LAVA_PUSH=.0023333333;
export const GRAVITY=.08,VERTICAL_DRAG=.98;
/** Ladder limits: ±0.15 blocks/tick sideways and downward, climbing at 0.1176 blocks/tick. */
export const LADDER_LIMIT=.15*TPS,LADDER_CLIMB=(.2-GRAVITY)*VERTICAL_DRAG*TPS;
/** Leaving a liquid against a ledge: 0.3 blocks/tick upward. */
export const LEDGE_HOP=.3*TPS;
/** Sprint-jump boost along the facing direction. */
export const SPRINT_JUMP_BOOST=.2*TPS;

// ---- Derived 60 Hz values (blocks per second) ------------------------------------------------------
/** Terminal fall speed (78.4 m/s) and the per-step drag that reaches it. */
export const TERMINAL_FALL=GRAVITY*VERTICAL_DRAG/(1-VERTICAL_DRAG)*TPS;
export const FALL_RETAIN=perStep(VERTICAL_DRAG);
/** Take-off speed calibrated so the 60 Hz arc peaks at vanilla's 1.2522 blocks (0.42 blocks/tick jump). */
export const JUMP_VELOCITY=8.95618;
/** Walking, sprinting and sneaking speeds on normal ground (blocks/second) for reference: 4.317, 5.612, 1.295. */
export const WALK_SPEED=groundTarget(BASE_SPEED,.6),SPRINT_SPEED=groundTarget(BASE_SPEED*SPRINT_MULTIPLIER,.6),SNEAK_SPEED=WALK_SPEED*SNEAK_INPUT;
/** Ground target speed (blocks/second per unit input) for a movement attribute on a block of this slipperiness. */
export function groundTarget(attribute:number,slipperiness:number){
  const s=slipperiness;return terminal(attribute*INPUT_SCALE*(.21600002/(s*s*s)),s*AIR_RETAIN);
}

// ---- World probes ------------------------------------------------------------------------------
/** Surface height (0..1 in the cell) of a liquid voxel: full when the same liquid lies above. */
export function liquidSurface(world:BlockSource,x:number,y:number,z:number,id:number):number{
  const above=world.get(x,y+1,z);return above>=0&&LIQUID[above]===LIQUID[id]?1:liquidHeight(id);
}
export interface FluidSample{
  water:boolean;lava:boolean;
  /** Depth of each liquid above the box bottom (vanilla fluidHeight), 0 when not touching. */
  waterDepth:number;lavaDepth:number;
  /** Averaged flow (blocks/tick push before scaling): x,z of water and of lava. */
  waterFlowX:number;waterFlowZ:number;lavaFlowX:number;lavaFlowZ:number;
}
export const createFluidSample=():FluidSample=>({water:false,lava:false,waterDepth:0,lavaDepth:0,waterFlowX:0,waterFlowZ:0,lavaFlowX:0,lavaFlowZ:0});
const flow:Vec3={x:0,y:0,z:0};
/** Liquids touching a feet-centred box (deflated by 0.001 like vanilla), with depth and averaged flow. */
export function sampleFluids(world:BlockSource,x:number,y:number,z:number,halfWidth:number,height:number,out:FluidSample):FluidSample{
  out.water=out.lava=false;out.waterDepth=out.lavaDepth=0;out.waterFlowX=out.waterFlowZ=out.lavaFlowX=out.lavaFlowZ=0;
  const minX=x-halfWidth+.001,maxX=x+halfWidth-.001,minY=y+.001,maxY=y+height-.001,minZ=z-halfWidth+.001,maxZ=z+halfWidth-.001;
  let waterCells=0,lavaCells=0;
  for(let cy=Math.floor(minY),y1=Math.ceil(maxY);cy<y1;cy++)for(let cz=Math.floor(minZ),z1=Math.ceil(maxZ);cz<z1;cz++)
    for(let cx=Math.floor(minX),x1=Math.ceil(maxX);cx<x1;cx++){
      const id=world.get(cx,cy,cz);if(id<0)continue;const kind=LIQUID[id];if(!kind)continue;
      const top=cy+liquidSurface(world,cx,cy,cz,id);if(top<minY)continue;
      const depth=top-minY;flowAt(world,cx,cy,cz,flow);
      // Shallow liquid pushes less (vanilla scales the flow by the depth below 0.4).
      const k=depth<.4?depth:1;
      if(kind===1){out.water=true;out.waterDepth=Math.max(out.waterDepth,depth);out.waterFlowX+=flow.x*k;out.waterFlowZ+=flow.z*k;waterCells++;}
      else{out.lava=true;out.lavaDepth=Math.max(out.lavaDepth,depth);out.lavaFlowX+=flow.x*k;out.lavaFlowZ+=flow.z*k;lavaCells++;}
    }
  if(waterCells){out.waterFlowX/=waterCells;out.waterFlowZ/=waterCells;}
  if(lavaCells){out.lavaFlowX/=lavaCells;out.lavaFlowZ/=lavaCells;}
  return out;
}
/** Liquid kind covering an eye at height eyeY (0 none, 1 water, 2 lava), with vanilla's 1/9 margin. */
export function eyeLiquid(world:BlockSource,x:number,eyeY:number,z:number):number{
  const ey=eyeY-1/9,bx=Math.floor(x),by=Math.floor(ey),bz=Math.floor(z),id=world.get(bx,by,bz);
  if(id<0||!LIQUID[id])return 0;
  return by+liquidSurface(world,bx,by,bz,id)>ey?LIQUID[id]:0;
}
/** Block id supporting the feet `depth` below them: the cell under the centre, else a footprint corner with a
 *  collision shape (standing on an edge). -1 when nothing solid is there. */
export function supportBlock(world:BlockSource,x:number,y:number,z:number,halfWidth:number,depth:number):number{
  const by=Math.floor(y-depth),centre=world.get(Math.floor(x),by,Math.floor(z));
  if(centre>0&&COLLISION_BOXES[centre].length)return centre;
  const r=halfWidth-1e-4;
  for(let i=0;i<4;i++){
    const id=world.get(Math.floor(i&1?x+r:x-r),by,Math.floor(i&2?z+r:z-r));
    if(id>0&&COLLISION_BOXES[id].length)return id;
  }
  return centre>0?centre:-1;
}
/** Ground slipperiness under the feet (0.6 normal, 0.98 ice). */
export function slipperinessAt(world:BlockSource,x:number,y:number,z:number,halfWidth:number){
  const id=supportBlock(world,x,y,z,halfWidth,.5000001);return id>0?SLIPPERINESS[id]:.6;
}
export const climbableAt=(world:BlockSource,x:number,y:number,z:number)=>{const id=world.get(Math.floor(x),Math.floor(y),Math.floor(z));return id>0&&CLIMBABLE[id]===1;};
/** Block whose step sound plays: a ladder being climbed, a snow layer the feet sink into, else the block below. */
export function stepSoundBlock(world:BlockSource,x:number,y:number,z:number,halfWidth:number,onLadder:boolean):number{
  const feet=world.get(Math.floor(x),Math.floor(y),Math.floor(z));
  if(onLadder&&feet>0&&CLIMBABLE[feet])return feet;
  if(feet>0&&blockDef(feet).shape==='snow_layer')return feet;
  const id=supportBlock(world,x,y,z,halfWidth,.2);
  return id>0&&!LIQUID[id]?id:-1;
}
