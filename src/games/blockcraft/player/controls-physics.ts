// Player movement constants and world probes. Vanilla Java Edition moves the player 20 times a second with
// per-tick velocity factors; Blockcraft integrates at PHYSICS_HZ (60). Every vanilla rule of the form "add an
// acceleration, move, multiply by a factor" is a first-order system whose per-tick displacement d follows
// d' = A·d + B. Its terminal rate B/(1-A) and its per-tick retention A are kept exactly: each 60 Hz step
// retains A^(1/3) and approaches the same terminal speed, so walking still settles at 4.317 m/s with the
// vanilla response time and a jump still peaks at vanilla's 1.252 blocks.
import {AIR,CLIMBABLE,COLLISION_BOXES,LIQUID,SLIPPERINESS,blockDef} from '../data/blocks';
import {PHYSICS_HZ,TPS} from '../engine/constants';
import {liquidHeight} from '../engine/physics';
import type {BlockSource,Vec3} from '../engine/contracts';

/** Physics steps per game tick, and the step length in seconds. */
export const STEPS_PER_TICK=PHYSICS_HZ/TPS,STEP=1/PHYSICS_HZ;
/** Per-step retention for a vanilla per-tick velocity factor. */
export const perStep=(perTick:number)=>Math.pow(perTick,1/STEPS_PER_TICK);
/** Terminal speed (blocks/second) of a vanilla per-tick system d' = retain·d + accel (accel in blocks/tick). */
export const terminal=(accel:number,retain:number)=>TPS*accel/(1-retain);

// ---- Vanilla numbers (blocks per tick unless noted) ----------------------------------------------
/** Movement speed attribute of a player; sprinting multiplies it by 1.3, Speed adds 20% per level, Slowness removes 15%. */
export const BASE_SPEED=.1,SPRINT_MULTIPLIER=1.3,SPEED_PER_LEVEL=.2,SLOWNESS_PER_LEVEL=.15;
/** Input impulses are scaled by 0.98 every tick (LivingEntity.aiStep). */
export const INPUT_SCALE=.98;
/** Sneaking and crawling multiply the input by 0.3 (sneaking speed attribute); using an item by 0.2. */
export const SNEAK_INPUT=.3,USE_INPUT=.2;
/** Ground acceleration factor: speed × 0.216 / slipperiness³ (0.216 = 0.6³, so normal ground uses the bare attribute). */
export const GROUND_FACTOR=.21600002;
export const AIR_RETAIN=.91,AIR_ACCEL=.02,AIR_ACCEL_SPRINT=.026;
/** Creative flight: horizontal acceleration (doubled when sprinting), vertical impulse per tick and its retention. */
export const FLY_ACCEL=.05,FLY_VERTICAL=.15,FLY_VERTICAL_RETAIN=.6;
export const WATER_RETAIN=.8,WATER_RETAIN_SPRINT=.9,LIQUID_ACCEL=.02,LAVA_RETAIN=.5,LIQUID_VERTICAL_RETAIN=.8;
/** Swimming up in a liquid (per tick while jump is held), diving while sneaking in water (goDownInWater) and
 *  sinking (gravity/16 in water, gravity/4 extra in lava). */
export const LIQUID_JUMP=.04,WATER_DIVE=.04,WATER_SINK=.005,LAVA_SINK=.02;
/** Current push per tick: water flow 0.014, lava 0.0023333 (overworld). */
export const WATER_PUSH=.014,LAVA_PUSH=.0023333333;
/** Fluid depth above the feet that still counts as wading (jumps work), vanilla getFluidJumpThreshold. */
export const FLUID_JUMP_THRESHOLD=.4;
export const GRAVITY=.08,VERTICAL_DRAG=.98;
/** Ladder limits: ±0.15 blocks/tick sideways and downward. Climbing sets 0.2, i.e. 0.1176 blocks/tick after gravity. */
export const LADDER_LIMIT=.15*TPS,LADDER_CLIMB=(.2-GRAVITY)*VERTICAL_DRAG*TPS;
/** Climbing a ladder while in water: 0.2 then the water factor 0.8. */
export const LADDER_CLIMB_WATER=.2*LIQUID_VERTICAL_RETAIN*TPS;
/** Leaving a liquid against a ledge: 0.3 blocks/tick upward. */
export const LEDGE_HOP=.3*TPS;
/** Sprint-jump boost along the facing direction (0.2 blocks/tick). */
export const SPRINT_JUMP_BOOST=.2*TPS;
/** Vanilla jump impulse (blocks/tick) and the ticks between jumps while jump is held. */
export const JUMP_POWER=.42,JUMP_DELAY_TICKS=10;
/** Player step-up height (slabs, stairs, paths). */
export const STEP_HEIGHT=.6;
/** Swimming: vertical velocity follows the look direction at 0.085 (diving steeply) or 0.06 per tick. */
export const SWIM_FOLLOW_STEEP=.085,SWIM_FOLLOW=.06;
/** Ticks within which a second jump press toggles creative flight. */
export const FLIGHT_TOGGLE_TICKS=7;

// ---- Derived 60 Hz values (blocks per second) ------------------------------------------------------
/** Terminal fall speed (78.4 m/s) and the per-step retention that reaches it with vanilla's 0.08 gravity. */
export const TERMINAL_FALL=GRAVITY*VERTICAL_DRAG/(1-VERTICAL_DRAG)*TPS;
export const FALL_RETAIN=perStep(VERTICAL_DRAG);
/** Velocity lost to gravity in one step (the fall speed approaches -TERMINAL_FALL). */
export const FALL_STEP=(1-FALL_RETAIN)*TERMINAL_FALL;
/** Peak height of vanilla's jump: 0.42 blocks/tick, then (v - 0.08) × 0.98 per tick (1.2522 blocks). */
export function vanillaJumpPeak(){let v=JUMP_POWER,y=0;while(v>0){y+=v;v=(v-GRAVITY)*VERTICAL_DRAG;}return y;}
/** Peak of a jump launched at v0 blocks/second under the player's 60 Hz integration (move first, then gravity). */
export function jumpPeak(v0:number){
  let v=v0,y=v*STEP;
  for(let i=0;i<600;i++){v=v*FALL_RETAIN-FALL_STEP;if(v<=0)break;y+=v*STEP;}
  return y;
}
/** Take-off speed whose 60 Hz arc peaks exactly at vanilla's height. */
export const JUMP_VELOCITY=(()=>{
  const target=vanillaJumpPeak();let lo=4,hi=16;
  for(let i=0;i<60;i++){const mid=(lo+hi)/2;if(jumpPeak(mid)<target)lo=mid;else hi=mid;}
  return (lo+hi)/2;
})();
/** Ground target speed (blocks/second per unit input) for a movement attribute on a block of this slipperiness. */
export function groundTarget(attribute:number,slipperiness:number){
  const s=slipperiness;return terminal(attribute*INPUT_SCALE*(GROUND_FACTOR/(s*s*s)),s*AIR_RETAIN);
}
/** Walking, sprinting and sneaking speeds on normal ground (blocks/second): 4.317, 5.612, 1.295. */
export const WALK_SPEED=groundTarget(BASE_SPEED,.6),SPRINT_SPEED=groundTarget(BASE_SPEED*SPRINT_MULTIPLIER,.6),SNEAK_SPEED=WALK_SPEED*SNEAK_INPUT;
/** Creative flight speed (10.89 m/s, 21.78 sprinting) and vertical speed (7.5 m/s). */
export const FLY_SPEED=terminal(FLY_ACCEL*INPUT_SCALE,AIR_RETAIN),FLY_VERTICAL_SPEED=terminal(FLY_VERTICAL,FLY_VERTICAL_RETAIN);
/** Movement speed multiplier of the Speed and Slowness effect levels (attribute modifiers multiply). */
export function effectSpeedFactor(speedLevel:number,slownessLevel:number){
  return (1+SPEED_PER_LEVEL*Math.max(0,speedLevel))*Math.max(0,1-SLOWNESS_PER_LEVEL*Math.max(0,slownessLevel));
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
  /** Averaged unit flow of the water and lava cells touched, each scaled down where the liquid is shallower than 0.4. */
  waterFlowX:number;waterFlowZ:number;lavaFlowX:number;lavaFlowZ:number;
}
export const createFluidSample=():FluidSample=>({water:false,lava:false,waterDepth:0,lavaDepth:0,waterFlowX:0,waterFlowZ:0,lavaFlowX:0,lavaFlowZ:0});
const flow:Vec3={x:0,y:0,z:0},SIDE_X=[1,-1,0,0],SIDE_Z=[0,0,1,-1];
/** Normalised horizontal flow of the liquid at a voxel, toward lower levels and drops: the rule of engine/physics flowAt,
 *  without its per-call allocations (the player samples it every step while in a liquid). */
export function liquidFlow(world:BlockSource,x:number,y:number,z:number,out:Vec3):Vec3{
  out.x=out.y=out.z=0;const id=world.get(x,y,z);if(id<0||!LIQUID[id])return out;
  const kind=LIQUID[id],own=blockDef(id).liquid!,level=own.falling?0:own.level;
  for(let i=0;i<4;i++){
    const dx=SIDE_X[i],dz=SIDE_Z[i],n=world.get(x+dx,y,z+dz);
    if(n===AIR){const below=world.get(x+dx,y-1,z+dz);if(below===AIR||LIQUID[below]===kind){out.x+=dx*8;out.z+=dz*8;continue;}}
    if(n<0||LIQUID[n]!==kind)continue;
    const other=blockDef(n).liquid!,diff=(other.falling?0:other.level)-level;out.x+=dx*diff;out.z+=dz*diff;
  }
  const len=Math.hypot(out.x,out.z);if(len>0){out.x/=len;out.z/=len;}
  return out;
}
/** Liquids touching a feet-centred box (deflated by 0.001 like vanilla), with depth and averaged flow. */
export function sampleFluids(world:BlockSource,x:number,y:number,z:number,halfWidth:number,height:number,out:FluidSample):FluidSample{
  out.water=out.lava=false;out.waterDepth=out.lavaDepth=0;out.waterFlowX=out.waterFlowZ=out.lavaFlowX=out.lavaFlowZ=0;
  const minX=x-halfWidth+.001,maxX=x+halfWidth-.001,minY=y+.001,maxY=y+height-.001,minZ=z-halfWidth+.001,maxZ=z+halfWidth-.001;
  let waterCells=0,lavaCells=0;
  for(let cy=Math.floor(minY),y1=Math.ceil(maxY);cy<y1;cy++)for(let cz=Math.floor(minZ),z1=Math.ceil(maxZ);cz<z1;cz++)
    for(let cx=Math.floor(minX),x1=Math.ceil(maxX);cx<x1;cx++){
      const id=world.get(cx,cy,cz);if(id<0)continue;const kind=LIQUID[id];if(!kind)continue;
      const top=cy+liquidSurface(world,cx,cy,cz,id);if(top<minY)continue;
      const depth=top-minY;liquidFlow(world,cx,cy,cz,flow);
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
/** Does a box overlap any liquid cell, whatever its level (vanilla Level.containsAnyLiquid)? Unloaded cells are dry. */
export function boxHasLiquid(world:BlockSource,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):boolean{
  for(let y=Math.floor(minY),y1=Math.ceil(maxY);y<y1;y++)for(let z=Math.floor(minZ),z1=Math.ceil(maxZ);z<z1;z++)
    for(let x=Math.floor(minX),x1=Math.ceil(maxX);x<x1;x++){const id=world.get(x,y,z);if(id>0&&LIQUID[id])return true;}
  return false;
}
/** Liquid kind (0 none, 1 water, 2 lava) of the voxel containing a point. */
export function liquidAt(world:BlockSource,x:number,y:number,z:number):number{
  const id=world.get(Math.floor(x),Math.floor(y),Math.floor(z));return id>0?LIQUID[id]:0;
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
/** Ground slipperiness under the feet (0.6 normal, 0.98 ice), from the block 0.5 below like vanilla. */
export function slipperinessAt(world:BlockSource,x:number,y:number,z:number,halfWidth:number){
  const id=supportBlock(world,x,y,z,halfWidth,.5000001);return id>0?SLIPPERINESS[id]:.6;
}
export const climbableAt=(world:BlockSource,x:number,y:number,z:number)=>{const id=world.get(Math.floor(x),Math.floor(y),Math.floor(z));return id>0&&CLIMBABLE[id]===1;};
/** Block whose step sound plays: a ladder being climbed, a snow layer the feet sink into, else the block below. -1 = none. */
export function stepSoundBlock(world:BlockSource,x:number,y:number,z:number,halfWidth:number,onLadder:boolean):number{
  const feet=world.get(Math.floor(x),Math.floor(y),Math.floor(z));
  if(onLadder&&feet>0&&CLIMBABLE[feet])return feet;
  if(feet>0&&blockDef(feet).shape==='snow_layer')return feet;
  const id=supportBlock(world,x,y,z,halfWidth,.2);
  return id>0&&!LIQUID[id]?id:-1;
}
