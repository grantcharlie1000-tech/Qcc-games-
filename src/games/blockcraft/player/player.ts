// Player controller, simulated at PHYSICS_HZ (60) with vanilla Java Edition rules (see controls-physics.ts for
// the numbers): walking 4.317, sprinting 5.612 and sneaking 1.295 m/s, 1.25-block jumps with the sprint-jump boost,
// weak air control, ground friction (ice), sneaking that never walks off edges, 0.6 step-up, standing/crouching/
// swimming poses (also crawling under 1-block gaps), buoyancy and look-directed swimming, water currents, lava,
// ladders, creative flight and the Speed/Slowness effects, bed bounces and Bedrock's touch auto-jump. It tracks fall
// distance (survival.land and the playerLanded event on landing, leaving out the landing tick like vanilla), keeps the liquid and ladder flags
// current, plays footsteps (silent while sneaking), falls, splashes and swim strokes, kicks up sprint dust, charges food
// exhaustion and sets the field-of-view scale. The camera position (eye()) is interpolated between physics steps.
import {LIQUID,blockDef} from '../data/blocks';
import {CH,TPS} from '../engine/constants';
import {boxCollides,collidesAt,moveBody,type MoveResult} from '../engine/physics';
import type {Game,ParticleOptions,PlayerService,PlayerState,Vec3} from '../engine/contracts';
import {
  AIR_ACCEL,AIR_ACCEL_SPRINT,AIR_RETAIN,BASE_SPEED,FALL_RETAIN,FALL_STEP,FLIGHT_TOGGLE_TICKS,FLUID_JUMP_THRESHOLD,FLY_ACCEL,
  FLY_VERTICAL,FLY_VERTICAL_RETAIN,GROUND_FACTOR,INPUT_SCALE,JUMP_DELAY_TICKS,JUMP_VELOCITY,LADDER_CLIMB,LADDER_CLIMB_WATER,
  LADDER_LIMIT,LAVA_PUSH,LAVA_RETAIN,LAVA_SINK,LEDGE_HOP,LIQUID_ACCEL,LIQUID_JUMP,LIQUID_VERTICAL_RETAIN,SNEAK_INPUT,SPRINT_JUMP_BOOST,
  SPRINT_MULTIPLIER,STEP,STEPS_PER_TICK,STEP_HEIGHT,SWIM_FOLLOW,SWIM_FOLLOW_STEEP,USE_INPUT,WATER_DIVE,WATER_PUSH,WATER_RETAIN,
  WATER_RETAIN_SPRINT,WATER_SINK,boxHasLiquid,climbableAt,createFluidSample,effectSpeedFactor,eyeLiquid,liquidAt,perStep,sampleFluids,
  slipperinessAt,stepSoundBlock,supportBlock
} from './controls-physics';

export const HALF_WIDTH=.3,HEIGHT=1.8;
/** Hitbox and eye heights per pose: standing, crouching, swimming (the swimming pose also crawls under 1-block gaps). */
export const POSE_HEIGHT=[1.8,1.5,.6] as const,POSE_EYE=[1.62,1.27,.4] as const;
const STAND=0,CROUCH=1,SWIM=2;
type Pose=0|1|2;
/** Below this height the void hurts (4 per tick, even in creative). */
export const VOID_Y=-64;
/** Distance walked (blocks × 0.6) between footsteps: one every 1.67 blocks. */
const STEP_DISTANCE_SCALE=.6;
const FLIGHT_TOGGLE_STEPS=FLIGHT_TOGGLE_TICKS*STEPS_PER_TICK,JUMP_DELAY_STEPS=JUMP_DELAY_TICKS*STEPS_PER_TICK;
/** Camera eye height eases toward the pose (vanilla halves the gap every tick). */
const EYE_RETAIN=perStep(.5);
/** Fall distance kept per step in lava (halved every tick). */
const LAVA_FALL_RETAIN=perStep(.5);
/** Back-off increment of the sneaking edge check (vanilla 0.05 per tick of movement). */
const EDGE_INCREMENT=.05/STEPS_PER_TICK;
/** Vanilla isHorizontalCollisionMinor: glancing collisions under 8° keep the sprint. */
const MINOR_COLLISION_ANGLE=.13962634;
/** Most physics steps run in one frame (frames are capped at 0.1 s by the engine). */
const MAX_LAG=.12;
const ESCAPE_DIRS=[[1,0,0],[-1,0,0],[0,0,1],[0,0,-1],[0,1,0]] as const;
/** Beds bounce a landing player back up with 0.66 of the speed (BedBlock.bounceUp) unless sneaking. */
const BED_BOUNCE=.66;
/** Touch auto-jump looks this far ahead (blocks) along the movement input for a 1-block step. */
const AUTO_JUMP_REACH=.25;
const isBed=(id:number)=>id>0&&blockDef(id).shape==='bed';
const clampPitch=(v:number)=>Math.max(-1.55,Math.min(1.55,v));

export function createPlayerState(x=.5,y=CH,z=.5):PlayerState{
  return{x,y,z,vx:0,vy:0,vz:0,yaw:0,pitch:-.25,onGround:false,inWater:false,inLava:false,headInWater:false,onLadder:false,
    sneaking:false,sprinting:false,flying:false,swimming:false,fallDistance:0,spawn:{x,y,z},bedSpawn:null};
}

export function createPlayer(game:Game):PlayerService{
  const p=createPlayerState();
  const fluid=createFluidSample(),move:MoveResult={hitX:false,hitY:false,hitZ:false,stepped:false};
  let pose:Pose=STAND;
  /** Vanilla isSwimming(): sprinting through water (the swimming pose without the crawl). */
  let swimming=false;
  let acc=0,alpha=1,prevX=p.x,prevY=p.y,prevZ=p.z,eyeSmooth:number=POSE_EYE[STAND],prevEye=eyeSmooth;
  let flyTimer=0,jumpDelay=0,collidedH=false,collidedHard=false;
  /** A jump press counts as holding jump until the next tick's input sample, even when the key went up before the step
   *  ran (taps shorter than a frame at low frame rates, quick touch taps): vanilla samples held keys once per tick. */
  let jumpTap=false;
  /** Vanilla decides jumps, ground/air/liquid physics and friction once per 20 Hz tick. The velocity here is vanilla's
   *  per-tick displacement d, which follows d' = A(previous tick)·d + accel(this tick): friction lags acceleration by one
   *  tick (the source of the sprint-jump speed and the landing boost). These hold the current tick's choices. */
  let tickStep=0,tickAccel=0,tickRetain=.6*AIR_RETAIN,lastRetain=.6*AIR_RETAIN,boostX=0,boostZ=0;
  let moveDist=0,nextStep=1,exhaust=0,speedFactor=1,sensed=false;
  /** p.fallDistance when the current 20 Hz tick began: what landing reports. */
  let fallAtTick=0;
  const off:(()=>void)[]=[];

  const fits=(q:Pose)=>!collidesAt(game.world,p.x,p.y,p.z,HALF_WIDTH,POSE_HEIGHT[q]);
  function setPose(want:Pose){
    // Vanilla updatePlayerPose: keep the pose when even swimming does not fit; else crouch, then crawl, where needed.
    if(fits(SWIM))pose=fits(want)?want:fits(CROUCH)?CROUCH:SWIM;
    p.swimming=pose===SWIM;
  }
  function syncPrev(){prevX=p.x;prevY=p.y;prevZ=p.z;prevEye=eyeSmooth;alpha=1;}
  /** Liquids touching the body (after each move, like vanilla's tick-start fluid update); splashes on entering water. */
  function senseFluids(splashing:boolean){
    const w=game.world,was=p.inWater,h=POSE_HEIGHT[pose];
    sampleFluids(w,p.x,p.y,p.z,HALF_WIDTH,h,fluid);
    p.inWater=fluid.water;p.inLava=fluid.lava;
    p.headInWater=eyeLiquid(w,p.x,p.y+POSE_EYE[pose],p.z)===1;
    if(splashing&&p.inWater&&!was)splash();
    sensed=true;
  }
  let splashVx=0,splashVy=0,splashVz=0;
  function splash(){
    // Vanilla doWaterSplashEffect: loudness from the entry speed (blocks/tick), bubbles and splash particles at the surface.
    const t=1/TPS,speed=Math.min(1,Math.sqrt(splashVx*splashVx*t*t*.2+splashVy*splashVy*t*t+splashVz*splashVz*t*t*.2)*.2);
    game.sounds.play('splash',null,{volume:Math.min(1,.3+speed*2.5),pitch:1+(game.random()-game.random())*.4});
    const surface=p.y+fluid.waterDepth;
    game.render.spawnParticles('bubble',p.x,surface-.3,p.z,{count:13,spread:HALF_WIDTH*2,velocity:{x:0,y:-splashVy*.1,z:0}});
    game.render.spawnParticles('splash',p.x,surface,p.z,{count:13,spread:HALF_WIDTH*2});
  }
  /** Liquid and ladder flags for the current position and pose, at once (teleports, respawns): survival ticks before the
   *  player's next physics step and must not see the flags of the old position. Waits for the next step when the
   *  column is not loaded yet. */
  function resense(){
    senseFluids(false);
    p.onLadder=!p.flying&&climbableAt(game.world,p.x,p.y,p.z);
    sensed=game.world.isLoaded(p.x,p.z);
  }
  /** Pushes a body stuck inside blocks to the nearest free spot within a block (sideways first, then up). */
  function escape(h:number){
    const w=game.world;
    for(let d=1/16;d<=1+1e-9;d+=1/16)for(const [dx,dy,dz] of ESCAPE_DIRS)
      if(!collidesAt(w,p.x+dx*d,p.y+dy*d,p.z+dz*d,HALF_WIDTH,h)){p.x+=dx*d;p.y+=dy*d;p.z+=dz*d;return;}
  }
  /** Would the box moved by (dx, -STEP_HEIGHT, dz) rest on something? (Player.maybeBackOffFromEdge) */
  const supported=(dx:number,dz:number,h:number)=>boxCollides(game.world,p.x+dx-HALF_WIDTH,p.y-STEP_HEIGHT,p.z+dz-HALF_WIDTH,p.x+dx+HALF_WIDTH,p.y+h-STEP_HEIGHT,p.z+dz+HALF_WIDTH);
  function aboveGround(h:number){
    if(p.onGround)return true;
    const f=p.fallDistance-STEP_HEIGHT;
    return p.fallDistance<STEP_HEIGHT&&boxCollides(game.world,p.x-HALF_WIDTH,p.y+f,p.z-HALF_WIDTH,p.x+HALF_WIDTH,p.y+h+f,p.z+HALF_WIDTH);
  }
  function minorCollision(ix:number,iz:number,mx:number,mz:number){
    const i2=ix*ix+iz*iz,m2=mx*mx+mz*mz;
    if(i2<1e-5||m2<1e-5/(STEPS_PER_TICK*STEPS_PER_TICK))return false;
    return Math.acos(Math.max(-1,Math.min(1,(ix*mx+iz*mz)/Math.sqrt(i2*m2))))<MINOR_COLLISION_ANGLE;
  }
  /** One step of a vanilla per-tick affine velocity rule v' = A·v + B (B in blocks/tick): approach B/(1-A) at A per tick. */
  function approach(v:number,retain:number,perTick:number){const r=perStep(retain);return v*r+(1-r)*TPS*perTick/(1-retain);}
  function jump(){
    p.vy=JUMP_VELOCITY;
    if(p.sprinting){boostX=-Math.sin(p.yaw)*SPRINT_JUMP_BOOST/TPS;boostZ=-Math.cos(p.yaw)*SPRINT_JUMP_BOOST/TPS;exhaust+=.2;}
    else exhaust+=.05;
    jumpDelay=JUMP_DELAY_STEPS;
  }
  function landed(distance:number){
    // Block.fallOn order: the block landed on reacts first (farmland trampling, world ticks), then fall damage.
    game.events.emit('playerLanded',{fallDistance:distance,x:p.x,y:p.y,z:p.z});
    game.survival.land(distance);
    if(distance<=3||game.settings.mode==='creative')return;
    const id=supportBlock(game.world,p.x,p.y,p.z,HALF_WIDTH,.2);if(id<=0)return;
    // The fall sound comes with fall damage, which a bed halves (survival applies the same rule); the dust does not.
    if((isBed(id)?distance*.5:distance)>3)game.sounds.play(`fall:${blockDef(id).sound}`,null,{volume:.5,pitch:.75});
    game.render.spawnParticles('block',p.x,p.y+.05,p.z,{block:id,count:Math.min(40,Math.round(6+distance*2)),spread:.4});
  }
  const dust:ParticleOptions&{velocity:Vec3}={block:0,count:1,spread:.2,velocity:{x:0,y:30,z:0}};
  /** Vanilla spawnSprintParticle: a fleck of the block underfoot kicked up behind a sprinting player every tick. */
  function sprintDust(){
    const id=supportBlock(game.world,p.x,p.y,p.z,HALF_WIDTH,.2);if(id<=0||LIQUID[id])return;
    dust.block=id;dust.velocity.x=-4*p.vx;dust.velocity.z=-4*p.vz;
    game.render.spawnParticles('block',p.x,p.y+.25,p.z,dust);
  }
  /** Bedrock's touch auto-jump: moving into a step one block high (too high to step up) with room on top hops onto it. */
  function autoJumpAhead(dirX:number,dirZ:number,h:number){
    const len=Math.hypot(dirX,dirZ);if(len<1e-4)return false;
    const w=game.world,ax=p.x+dirX/len*AUTO_JUMP_REACH,az=p.z+dirZ/len*AUTO_JUMP_REACH,top=p.y+1+1e-3;
    return collidesAt(w,ax,p.y+STEP_HEIGHT,az,HALF_WIDTH,h)&&!collidesAt(w,ax,top,az,HALF_WIDTH,h)&&!collidesAt(w,p.x,top,p.z,HALF_WIDTH,h);
  }
  function sounds(my:number,horizontal:number){
    // Vanilla Player.getMovementEmission: flying, or sneaking on the ground, is silent and walks no step distance.
    if(p.flying||p.sneaking&&p.onGround)return;
    // Vanilla Entity.move: distance × 0.6 per step sound; ladders count vertical movement; sounds wait for a block underfoot.
    moveDist+=Math.sqrt(horizontal*horizontal+(p.onLadder?my*my:0))*STEP_DISTANCE_SCALE;
    if(moveDist<=nextStep)return;
    // Footsteps on the ground or a ladder (not in the swimming pose), in water too; otherwise strokes while in water.
    if((p.onGround||p.onLadder)&&!swimming){
      const id=stepSoundBlock(game.world,p.x,p.y,p.z,HALF_WIDTH,p.onLadder);
      if(id>0){nextStep=Math.floor(moveDist)+1;game.sounds.play(`step:${blockDef(id).sound}`,null);return;}
    }
    if(!p.inWater)return;
    nextStep=Math.floor(moveDist)+1;
    const t=1/TPS,v=Math.min(1,Math.sqrt(p.vx*p.vx*t*t*.2+p.vy*p.vy*t*t+p.vz*p.vz*t*t*.2)*.35);
    game.sounds.play('swim',null,{volume:Math.min(1,.25+v*2),pitch:1+(game.random()-game.random())*.4});
  }

  function step(){
    const w=game.world,input=game.input,creative=game.settings.mode==='creative';
    prevX=p.x;prevY=p.y;prevZ=p.z;prevEye=eyeSmooth;
    // Never move into chunks that are not loaded: freeze until the column exists.
    if(!w.isLoaded(p.x,p.z)){p.vx=p.vy=p.vz=0;return;}
    if(p.flying&&!creative)p.flying=false;
    if(!sensed)senseFluids(false);

    // ---- Input ------------------------------------------------------------------------------
    const jumpPressed=input.pressed('jump');if(jumpPressed)jumpTap=true;
    const mv=input.move(),jumpHeld=input.down('jump')||jumpTap,sneakKey=input.down('sneak'),sprintKey=input.down('sprint');
    if(flyTimer>0)flyTimer--;
    // Double-tapping jump within 7 ticks toggles creative flight (LocalPlayer.aiStep jumpTriggerTime).
    if(jumpPressed&&creative){if(flyTimer===0)flyTimer=FLIGHT_TOGGLE_STEPS;else if(!swimming){p.flying=!p.flying;flyTimer=0;}}
    p.sneaking=sneakKey&&!p.flying;

    // ---- Swimming flag (updateSwimming) and pose (updatePlayerPose) ------------------------------
    if(swimming)swimming=p.sprinting&&p.inWater&&!p.flying;
    else swimming=p.sprinting&&p.headInWater&&!p.flying&&liquidAt(w,p.x,p.y,p.z)===1;
    setPose(swimming?SWIM:p.sneaking?CROUCH:STAND);
    const h=POSE_HEIGHT[pose];
    if(collidesAt(w,p.x,p.y,p.z,HALF_WIDTH,h))escape(h);
    p.onLadder=!p.flying&&climbableAt(w,p.x,p.y,p.z);

    // ---- Sprinting (LocalPlayer.aiStep) --------------------------------------------------------
    const using=game.interaction.using!==null,slow=pose===CROUCH||pose===SWIM&&!swimming;
    const impulse=mv.forward*(using?USE_INPUT:1)*(slow?SNEAK_INPUT:1),underwater=p.headInWater;
    const enoughFood=creative||game.survival.food>6,hasForward=impulse>1e-5;
    if(!p.sprinting){
      if(sprintKey&&(!p.inWater||underwater)&&(underwater?hasForward:impulse>=.8)&&enoughFood&&!using&&!slow)p.sprinting=true;
    }else if(swimming){
      if(!p.onGround&&!sneakKey&&(!hasForward||!enoughFood)||!p.inWater)p.sprinting=false;
    }else if(!hasForward||!enoughFood||collidedHard||p.inWater&&!underwater||slow||using)p.sprinting=false;
    const attribute=BASE_SPEED*speedFactor*(p.sprinting?SPRINT_MULTIPLIER:1);

    // Input vector: impulses × 0.98 (× 0.2 using an item, × 0.3 sneaking or crawling), normalised above length 1.
    const k=INPUT_SCALE*(using?USE_INPUT:1)*(slow?SNEAK_INPUT:1);
    let is=mv.strafe*k,iz=mv.forward*k;const l2=is*is+iz*iz;if(l2>1){const l=Math.sqrt(l2);is/=l;iz/=l;}
    const sin=Math.sin(p.yaw),cos=Math.cos(p.yaw),dirX=-sin*iz+cos*is,dirZ=-cos*iz-sin*is;

    // ---- Jumping (LivingEntity.aiStep) ----------------------------------------------------------
    const tickStart=tickStep===0;tickStep=(tickStep+1)%STEPS_PER_TICK;
    if(tickStart)jumpTap=false;
    if(tickStart){
      boostX=boostZ=0;fallAtTick=p.fallDistance;
      if(p.sprinting&&p.onGround&&!p.inWater&&!p.inLava&&!p.sneaking)sprintDust();
    }
    if(jumpDelay>0)jumpDelay--;
    const threshold=POSE_EYE[pose]<FLUID_JUMP_THRESHOLD?0:FLUID_JUMP_THRESHOLD;
    let swimUp=0,jumped=false;
    if(jumpHeld&&!p.flying){
      const depth=p.inLava?fluid.lavaDepth:fluid.waterDepth,wet=p.inWater&&depth>0,wading=p.onGround&&!(depth>threshold);
      if(wet&&!wading||p.inLava&&!wading)swimUp=LIQUID_JUMP;
      else if(tickStart&&(p.onGround||wet&&depth<=threshold)&&jumpDelay===0){jump();jumped=true;}
    }else{
      jumpDelay=0;
      if(tickStart&&input.touch&&p.onGround&&!p.sneaking&&!p.flying&&!p.inWater&&!p.inLava&&autoJumpAhead(dirX,dirZ,h)){jump();jumped=true;}
    }

    // ---- Horizontal travel ---------------------------------------------------------------------
    if(tickStart){
      let retain:number;
      if(p.flying){retain=AIR_RETAIN;tickAccel=FLY_ACCEL*(p.sprinting?2:1);}
      else if(p.inWater){retain=p.sprinting?WATER_RETAIN_SPRINT:WATER_RETAIN;tickAccel=LIQUID_ACCEL;}
      else if(p.inLava){retain=LAVA_RETAIN;tickAccel=LIQUID_ACCEL;}
      else if(p.onGround){const s=slipperinessAt(w,p.x,p.y,p.z,HALF_WIDTH);retain=s*AIR_RETAIN;tickAccel=attribute*GROUND_FACTOR/(s*s*s);}
      else{retain=AIR_RETAIN;tickAccel=p.sprinting?AIR_ACCEL_SPRINT:AIR_ACCEL;}
      tickRetain=lastRetain;lastRetain=retain;
    }
    let pushX=0,pushZ=0;
    if(!p.flying){
      // Currents (updateFluidHeightAndDoFluidPushing): water 0.014, lava 0.0023 blocks/tick², at least 0.0045 when nearly still.
      if(fluid.water){pushX+=fluid.waterFlowX*WATER_PUSH;pushZ+=fluid.waterFlowZ*WATER_PUSH;}
      if(fluid.lava){pushX+=fluid.lavaFlowX*LAVA_PUSH;pushZ+=fluid.lavaFlowZ*LAVA_PUSH;}
      const push=Math.hypot(pushX,pushZ),still=.003*TPS;
      if(push>0&&push<.0045&&Math.abs(p.vx)<still&&Math.abs(p.vz)<still){pushX*=.0045/push;pushZ*=.0045/push;}
    }
    p.vx=approach(p.vx,tickRetain,tickAccel*dirX+pushX+boostX);p.vz=approach(p.vz,tickRetain,tickAccel*dirZ+pushZ+boostZ);
    if(p.onLadder){p.vx=Math.max(-LADDER_LIMIT,Math.min(LADDER_LIMIT,p.vx));p.vz=Math.max(-LADDER_LIMIT,Math.min(LADDER_LIMIT,p.vz));}

    // ---- Vertical travel -------------------------------------------------------------------------
    if(jumped){/* take-off speed set by jump() */}
    else if(p.flying){
      // aiStep adds ±0.15 per tick (jump up, sneak down), travel keeps 0.6 of it: 7.5 m/s.
      p.vy=approach(p.vy,FLY_VERTICAL_RETAIN,((jumpHeld?1:0)-(sneakKey?1:0))*FLY_VERTICAL);
    }else if(p.inWater){
      // d' = 0.8·d + swimUp − dive (sneaking) − 0.005 (not when sprinting); swimming pulls toward the look direction first.
      let a=LIQUID_VERTICAL_RETAIN,b=swimUp-(sneakKey?WATER_DIVE:0)-(p.sprinting?0:WATER_SINK);
      if(swimming){
        const ly=Math.sin(p.pitch),f=ly<-.2?SWIM_FOLLOW_STEEP:SWIM_FOLLOW;
        if(ly<=0||jumpHeld||liquidAt(w,p.x,p.y+.9,p.z)!==0){a*=1-f;b=b*(1-f)+f*ly;}
      }
      p.vy=approach(p.vy,a,b);
      if(p.onLadder&&collidedH)p.vy=LADDER_CLIMB_WATER;
    }else if(p.inLava){
      const deep=fluid.lavaDepth>threshold;
      p.vy=approach(p.vy,deep?LAVA_RETAIN:LIQUID_VERTICAL_RETAIN,swimUp-LAVA_SINK-(deep||p.sprinting?0:WATER_SINK));
    }else if(p.onLadder&&(collidedH||jumpHeld))p.vy=LADDER_CLIMB;
    else{
      p.vy=p.vy*FALL_RETAIN-FALL_STEP;
      // Ladders cap the fall at 3 m/s; sneaking holds on.
      if(p.onLadder){if(p.vy<-LADDER_LIMIT)p.vy=-LADDER_LIMIT;if(p.sneaking&&p.vy<0)p.vy=0;}
    }

    // ---- Move ----------------------------------------------------------------------------------
    let dx=p.vx*STEP,dz=p.vz*STEP;const svx=p.vx,svz=p.vz;
    if(p.sneaking&&p.vy<=0&&(dx!==0||dz!==0)&&aboveGround(h)){
      // Sneaking never walks off an edge: shorten the move until a 0.6 drop still finds ground.
      if(dx!==0){const s=Math.sign(dx)*EDGE_INCREMENT;while(dx!==0&&!supported(dx,0,h)){if(Math.abs(dx)<=EDGE_INCREMENT){dx=0;break;}dx-=s;}}
      if(dz!==0){const s=Math.sign(dz)*EDGE_INCREMENT;while(dz!==0&&!supported(0,dz,h)){if(Math.abs(dz)<=EDGE_INCREMENT){dz=0;break;}dz-=s;}}
      if(dx!==0&&dz!==0){
        const sx=Math.sign(dx)*EDGE_INCREMENT,sz=Math.sign(dz)*EDGE_INCREMENT;
        while(dx!==0&&dz!==0&&!supported(dx,dz,h)){dx=Math.abs(dx)<=EDGE_INCREMENT?0:dx-sx;dz=Math.abs(dz)<=EDGE_INCREMENT?0:dz-sz;}
      }
      p.vx=dx/STEP;p.vz=dz/STEP;
    }
    const x0=p.x,y0=p.y,z0=p.z,vy0=p.vy;splashVx=svx;splashVy=p.vy;splashVz=svz;
    moveBody(w,p,HALF_WIDTH,h,STEP,move,STEP_HEIGHT);
    // Landing on a bed bounces (BedBlock.updateEntityAfterFallOn); sneaking suppresses it.
    if(move.hitY&&vy0<0&&p.onGround&&!p.sneaking&&isBed(supportBlock(w,p.x,p.y,p.z,HALF_WIDTH,.2)))p.vy=-vy0*BED_BOUNCE;
    // Holding back at an edge is not a collision: the velocity stays.
    p.vx=move.hitX?0:svx;p.vz=move.hitZ?0:svz;
    const mx=p.x-x0,my=p.y-y0,mz=p.z-z0,horizontal=Math.sqrt(mx*mx+mz*mz);
    collidedH=move.hitX||move.hitZ;collidedHard=collidedH&&!minorCollision(dirX,dirZ,mx,mz);
    // Against a ledge in a liquid, hop out (0.3 blocks/tick) when the box 0.6 higher is free: no block and no liquid
    // (vanilla isFree), so only at the surface. Walls under water or lava are not ladders.
    if(collidedH&&(p.inWater||p.inLava)&&!p.flying){
      const hx=p.x+p.vx/TPS,hy=y0+p.vy/TPS+.6,hz=p.z+p.vz/TPS;
      if(!collidesAt(w,hx,hy,hz,HALF_WIDTH,h)&&!boxHasLiquid(w,hx-HALF_WIDTH,hy,hz-HALF_WIDTH,hx+HALF_WIDTH,hy+h,hz+HALF_WIDTH))p.vy=LEDGE_HOP;
    }
    if(p.flying&&p.onGround)p.flying=false;
    eyeSmooth+=(POSE_EYE[pose]-eyeSmooth)*(1-EYE_RETAIN);

    // ---- After the move: liquids, fall distance, landing, sounds, exhaustion ----------------------
    senseFluids(true);
    // Water, flight and ladders reset the fall; lava halves it every tick. Vanilla checkFallDamage adds the drop only on
    // ticks that do not end on the ground, so landing reports the distance fallen before the landing tick began.
    if(p.inWater||p.flying||p.onLadder)p.fallDistance=fallAtTick=0;
    else{if(p.inLava){p.fallDistance*=LAVA_FALL_RETAIN;fallAtTick*=LAVA_FALL_RETAIN;}if(my<0)p.fallDistance-=my;}
    if(p.onGround){if(fallAtTick>0)landed(fallAtTick);p.fallDistance=fallAtTick=0;}
    sounds(my,horizontal);
    if(!creative){
      if(swimming||p.headInWater)exhaust+=.01*Math.sqrt(horizontal*horizontal+my*my);
      else if(p.inWater)exhaust+=.01*horizontal;
      else if(p.onGround&&!p.onLadder&&p.sprinting)exhaust+=.1*horizontal;
    }
  }

  function readEffects(){
    let speed=0,slowness=0;
    for(const e of game.survival.effects()){if(e.name==='speed')speed=Math.max(speed,e.level);else if(e.name==='slowness')slowness=Math.max(slowness,e.level);}
    speedFactor=effectSpeedFactor(speed,slowness);
  }
  /** Vanilla getFieldOfViewModifier: flying ×1.1, (speed attribute / walking speed + 1) / 2, drawing a bow up to −15%. */
  function fovScale(){
    if(game.reducedMotion)return 1;
    let f=p.flying?1.1:1;
    f*=(speedFactor*(p.sprinting?SPRINT_MULTIPLIER:1)+1)/2;
    const using=game.interaction.using;
    if(using&&using.item==='bow'){const t=Math.max(0,Math.min(1,using.progress));f*=1-(t>=1?1:t*t)*.15;}
    return f;
  }

  const service:PlayerService={
    state:p,width:HALF_WIDTH*2,
    get height(){return POSE_HEIGHT[pose];},
    eyeHeight:()=>POSE_EYE[pose],
    eye(){
      const a=alpha;
      return{x:prevX+(p.x-prevX)*a,y:prevY+(p.y-prevY)*a+prevEye+(eyeSmooth-prevEye)*a,z:prevZ+(p.z-prevZ)*a};
    },
    look(){const c=Math.cos(p.pitch);return{x:-Math.sin(p.yaw)*c,y:Math.sin(p.pitch),z:-Math.cos(p.yaw)*c};},
    teleport(x,y,z){
      p.x=x;p.y=y;p.z=z;p.vx=p.vy=p.vz=0;p.fallDistance=fallAtTick=0;
      p.onGround=boxCollides(game.world,x-HALF_WIDTH,y-.02,z-HALF_WIDTH,x+HALF_WIDTH,y,z+HALF_WIDTH);
      tickStep=0;boostX=boostZ=0;collidedH=collidedHard=false;moveDist=0;nextStep=1;
      eyeSmooth=POSE_EYE[pose];syncPrev();resense();
    },
    push(vx,vy,vz){if(p.flying)return;p.vx+=vx;p.vy+=vy;p.vz+=vz;},
    rotate(dyaw,dpitch){if(!Number.isFinite(dyaw)||!Number.isFinite(dpitch))return;p.yaw+=dyaw;p.pitch=clampPitch(p.pitch+dpitch);},
    init(){
      off.push(game.events.on('modeChanged',({mode})=>{if(mode!=='creative')p.flying=false;}));
      off.push(game.events.on('playerRespawned',()=>{p.sprinting=p.flying=false;swimming=false;setPose(STAND);eyeSmooth=POSE_EYE[pose];syncPrev();resense();}));
    },
    tick(){if(p.y<VOID_Y)game.survival.damage(4,{kind:'void'});},
    frame(dt){
      if(game.state!=='playing'&&game.state!=='screen'){acc=0;jumpTap=false;syncPrev();return;}
      readEffects();
      acc=Math.min(acc+dt,MAX_LAG);
      while(acc>=STEP-1e-9){acc-=STEP;step();}
      if(acc<0)acc=0;
      alpha=acc/STEP;
      if(exhaust>0){if(game.settings.mode!=='creative')game.survival.addExhaustion(exhaust);exhaust=0;}
      game.render.setFovScale(fovScale());
    },
    reset(){
      Object.assign(p,createPlayerState());pose=STAND;swimming=false;acc=0;flyTimer=jumpDelay=tickStep=0;jumpTap=false;tickAccel=boostX=boostZ=0;tickRetain=lastRetain=.6*AIR_RETAIN;
      collidedH=collidedHard=false;moveDist=0;nextStep=1;exhaust=0;speedFactor=1;sensed=false;fallAtTick=0;eyeSmooth=POSE_EYE[STAND];syncPrev();
    },
    serialize:()=>({x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,flying:p.flying,spawn:{...p.spawn},bedSpawn:p.bedSpawn?{...p.bedSpawn}:null}),
    restore(v){
      if(!v||typeof v!=='object'||Array.isArray(v))return;
      const d=v as Record<string,unknown>,num=(k:string)=>typeof d[k]==='number'&&Number.isFinite(d[k])?d[k] as number:null;
      const x=num('x'),y=num('y'),z=num('z');
      if(x!==null&&y!==null&&z!==null&&Math.abs(x)<5e5&&Math.abs(z)<5e5&&y>VOID_Y&&y<CH+64)service.teleport(x,y,z);
      const yaw=num('yaw'),pitch=num('pitch');
      if(yaw!==null&&Math.abs(yaw)<1e6)p.yaw=yaw;
      if(pitch!==null)p.pitch=clampPitch(pitch);
      p.flying=d.flying===true&&game.settings.mode==='creative';
      // Respawning teleports straight to these, so their height must be inside the world: a spawn in the void would
      // kill the player again after every respawn.
      const vec=(o:unknown,integer:boolean,maxY:number):Vec3|null=>{
        if(!o||typeof o!=='object')return null;
        const r=o as Record<string,unknown>,ok=(k:string)=>typeof r[k]==='number'&&(integer?Number.isInteger(r[k]):Number.isFinite(r[k]))&&Math.abs(r[k] as number)<5e5;
        return ok('x')&&ok('y')&&ok('z')&&(r.y as number)>=0&&(r.y as number)<=maxY?{x:r.x as number,y:r.y as number,z:r.z as number}:null;
      };
      p.spawn=vec(d.spawn,false,CH)??p.spawn;p.bedSpawn=vec(d.bedSpawn,true,CH-1);
    },
    dispose(){for(const f of off.splice(0))f();}
  };
  return service;
}
