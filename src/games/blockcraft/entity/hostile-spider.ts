// Spider (Java 1.20 Spider). 16 health, movement 0.3 (fast), 1.4 × 0.9 box, follow range 16, 2 damage per hit.
//  - Climbs: while pushing against a wall it rises 0.12 blocks/tick (Spider.onClimbable = horizontal collision).
//  - Pounces (LeapAtTargetGoal 0.4) at a target 2 to 4 blocks away.
//  - Neutral where it is bright (light-dependent value ≥ 0.5, i.e. brightness ≥ 12 at its eyes): it does not pick
//    targets there and drops one with a 1% chance per tick; being attacked still makes it fight back.
//  - Swims up in water (FloatGoal). Glowing red eyes. Drops 0–2 string, and a spider eye one time in three for player
//    kills; 5 xp.
import {stack} from '../data/items';
import type {Entity,EntityKind,Game,ItemStack} from '../engine/contracts';
import {avoidHazards,brain,chase,cleanData,eyeBrightness,floatInLiquid,forget,hasTarget,idle,lightValue,mobSpeed,newTarget,peacefulRemove,
  retaliate,setAggressive,tickTimers,tryMelee,updateTarget,type Brain,type TargetPos} from './hostile-ai';
import {spiderModel} from './hostile-models';

export const SPIDER_FOLLOW=16,SPIDER_MOVEMENT=.3,SPIDER_DAMAGE=2;
/** Climbing: velocity 0.2 blocks/tick up after a blocked move, less one tick of gravity and drag, in blocks/second. */
export const CLIMB_SPEED=(.2-.08)*.98*20;
/** Horizontal speed cap while climbing (LivingEntity.handleOnClimbable 0.15 blocks/tick). */
const CLIMB_CAP=.15*20;
/** LeapAtTargetGoal(0.4): horizontal 0.4 blocks/tick toward the target plus 20% of the current velocity, 0.4 up. */
export const LEAP=.4*20;
const T:TargetPos=newTarget();
const chaseSpeed=mobSpeed(SPIDER_MOVEMENT),strollSpeed=mobSpeed(SPIDER_MOVEMENT,.8);

/** Bright enough that spiders are neutral (getLightLevelDependentMagicValue ≥ 0.5). */
export const spiderCalm=(game:Game,e:Entity)=>lightValue(eyeBrightness(game,e))>=.5;
function climb(e:Entity){
  if(!e.collidedH||!(e.moveX||e.moveZ))return;
  e.vy=Math.max(e.vy,CLIMB_SPEED);
  e.vx=Math.max(-CLIMB_CAP,Math.min(CLIMB_CAP,e.vx));e.vz=Math.max(-CLIMB_CAP,Math.min(CLIMB_CAP,e.vz));
}
/** LeapAtTargetGoal: on the ground, 2 to 4 blocks away, a 1-in-5 chance per tick. Returns true while airborne from it. */
function leap(game:Game,e:Entity,b:Brain,t:TargetPos):boolean{
  if(b.leaping){if(e.onGround&&e.age>0)b.leaping=false;else return true;}
  const d2=(t.x-e.x)**2+(t.y-e.y)**2+(t.z-e.z)**2;
  if(d2<4||d2>16||!e.onGround||game.random()>=.2)return false;
  const dx=t.x-e.x,dz=t.z-e.z,h=Math.hypot(dx,dz);
  if(h>1e-6){e.vx=dx/h*LEAP+e.vx*.2;e.vz=dz/h*LEAP+e.vz*.2;}
  e.vy=LEAP;e.moveX=0;e.moveZ=0;e.jump=false;b.leaping=true;
  return true;
}
function tickSpider(e:Entity,game:Game){
  if(peacefulRemove(game,e))return;
  const b=brain(e);
  tickTimers(e,b);
  const calm=spiderCalm(game,e);
  // SpiderAttackGoal.canContinueToUse: in bright light a target is dropped 1% of ticks.
  if(calm&&hasTarget(b)&&game.random()<.01)forget(b);
  const has=updateTarget(game,e,b,SPIDER_FOLLOW,T,()=>!calm);
  setAggressive(e,has);
  if(has){
    if(leap(game,e,b,T)){game.entities.ai.lookAt(e,T.x,T.y+T.eye,T.z);tryMelee(game,e,b,T,SPIDER_DAMAGE);return;}
    chase(game,e,b,T,chaseSpeed);
    tryMelee(game,e,b,T,SPIDER_DAMAGE);
  }else{b.leaping=false;idle(game,e,b,strollSpeed);}
  floatInLiquid(game,e);
  avoidHazards(game,e);
  climb(e);
}
function spiderDrops(game:Game,byPlayer:boolean):ItemStack[]{
  const out:ItemStack[]=[],string=Math.floor(game.random()*3);
  if(string>0)out.push(stack('string',string));
  // Spider eye: uniform −1..1 per player kill, so one time in three.
  if(byPlayer&&Math.floor(game.random()*3)-1>0)out.push(stack('spider_eye',1));
  return out;
}
export function spiderKind():EntityKind{
  return{
    kind:'spider',category:'hostile',width:1.4,height:.9,maxHealth:16,model:spiderModel(),
    sounds:{name:'spider'},despawns:true,xp:5,
    spawn:{light:'dark',group:[4,4],weight:100},
    init(e,_game,reason){if(reason==='restore'){for(const k of Object.keys(e.data))delete e.data[k];}},
    tick:tickSpider,
    hurt(e,game,source){retaliate(e,game,source);},
    drops:(_e,game,byPlayer)=>spiderDrops(game,byPlayer),
    restoreData:data=>cleanData(data,{})
  };
}
