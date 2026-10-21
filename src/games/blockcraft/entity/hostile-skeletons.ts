// Skeleton and stray (Java 1.20 AbstractSkeleton with RangedBowAttackGoal).
//  - 20 health, movement 0.25, follow range 16. With a target it walks up until within 15 blocks and seen for a second,
//    then strafes (sideways at a quarter speed, forward beyond 13 blocks, backward inside 7.5) facing the target. It draws
//    the bow for 20 ticks while it can see the target and looses an arrow (base damage 2 + a small difficulty-dependent
//    bonus, 1.6 blocks/tick aimed at a third of the target's height, rising by 0.2 per block of distance, spread
//    14 − 4 × difficulty), then waits 40 ticks (20 on hard): one arrow every 3 s, 2 s on hard.
//  - Runs from wolves within 6 blocks; when burning in daylight without a target it looks for shade (FleeSunGoal).
//  - Stray: the snowy-biome skeleton (replaces 80 of 100 skeletons in snowy plains); its arrows add Slowness for 30 s.
// Drops: 0–2 bones and 0–2 arrows; 5 xp.
import {stack} from '../data/items';
import type {Difficulty,Entity,EntityKind,Game,ItemStack} from '../engine/contracts';
import {DIFFICULTY_ID,avoidHazards,brain,cleanData,difficultyId,idle,isDay,mobSpeed,newTarget,peacefulRemove,pickSpot,retaliate,
  setAggressive,tickTimers,triangle,underSky,updateTarget,walkToSpot,type Brain,type TargetPos} from './hostile-ai';
import {skeletonModels} from './hostile-models';
import {shoot} from './projectiles';

export type SkeletonKind='skeleton'|'stray';
export const SKELETON_FOLLOW=16,SKELETON_MOVEMENT=.25,ATTACK_RADIUS=15,DRAW_TICKS=20;
/** Arrows leave 0.1 below the eyes (vanilla eye height 1.74). */
export const SKELETON_EYE=1.74;
/** Arrow speed in blocks/tick (Skeleton.performRangedAttack). */
export const SKELETON_ARROW_SPEED=1.6;
/** Strafing (MoveControl.strafe): input ±0.5 forward and sideways at speed 0.25 × 0.25, settled over 1 − 0.546 per tick. */
export const STRAFE_SPEED=.25*.25*Math.SQRT1_2/(1-.6*.91)*20;
/** A blocked strafe walks straight at the target at the strafe speed with full forward input. */
const STRAFE_FORWARD=.25*.25/(1-.6*.91)*20;
export const WOLF_RANGE=6;
/** Vanilla spread of skeleton arrows: 14 − 4 × difficulty id. */
export const skeletonInaccuracy=(d:Difficulty)=>14-DIFFICULTY_ID[d]*4;
/** Ticks between the end of one draw and the start of the next (Skeleton.reassessWeaponGoal). */
export const bowInterval=(d:Difficulty)=>d==='hard'?20:40;
/** BowItem.getPowerForTime. */
export function bowPower(ticks:number){const f=ticks/20,p=(f*f+f*2)/3;return Math.min(1,p);}
const T:TargetPos=newTarget();
const walk=mobSpeed(SKELETON_MOVEMENT);

/** Faces the body toward a point. The tiny alternating offset marks the yaw as set by the AI this tick, so the entity
 *  service does not turn the body toward the (sideways) movement as it does for mobs that let their walk steer them. */
function faceToward(e:Entity,x:number,z:number){
  const dx=x-e.x,dz=z-e.z;if(dx*dx+dz*dz<1e-8)return;
  e.yaw=Math.atan2(-dx,-dz)+(e.age&1?1e-5:-1e-5);
}
/** MoveControl.strafe: forward/sideways input relative to the facing toward the target; when the step ahead is not
 *  walkable, walk forward instead. */
function strafe(game:Game,e:Entity,t:TargetPos,forward:number,right:number){
  const dx=t.x-e.x,dz=t.z-e.z,d=Math.hypot(dx,dz)||1,fx=dx/d,fz=dz/d,rx=-fz,rz=fx;
  let mx=fx*forward+rx*right,mz=fz*forward+rz*right,speed=STRAFE_SPEED;
  const len=Math.hypot(mx,mz)||1;mx/=len;mz/=len;
  if(!game.entities.ai.isSafe(e.x+mx*.6,e.y,e.z+mz*.6,e.width,e.height)){mx=fx;mz=fz;speed=STRAFE_FORWARD;}
  e.moveX=mx*speed;e.moveZ=mz*speed;
}
/** Skeleton.performRangedAttack. */
export function shootArrow(game:Game,e:Entity,t:TargetPos,power:number,stray:boolean):Entity|null{
  const y=e.y+SKELETON_EYE-.1,diff=difficultyId(game);
  const data:Record<string,unknown>={owner:'mob',ownerId:e.id,damage:power*2+triangle(game.random,diff*.11,.57425),pickup:false,crit:false,inGround:false};
  if(stray){data.effect='slowness';data.effectSeconds=30;}
  const arrow=game.entities.spawn('arrow',e.x,y,e.z,{data,reason:'event',yaw:e.yaw});
  if(!arrow)return null;
  const dx=t.x-e.x,dz=t.z-e.z,dy=t.y+t.height/3-y,h=Math.hypot(dx,dz);
  shoot(arrow,dx,dy+h*.2,dz,SKELETON_ARROW_SPEED,skeletonInaccuracy(game.settings.difficulty),game.random);
  game.sounds.play('bow',{x:e.x,y,z:e.z},{pitch:1/(game.random()*.4+.8)});
  return arrow;
}
/** RangedBowAttackGoal.tick. */
function bowAttack(game:Game,e:Entity,b:Brain,t:TargetPos,stray:boolean){
  const ai=game.entities.ai,see=b.sight,d2=(t.x-e.x)**2+(t.y-e.y)**2+(t.z-e.z)**2,r2=ATTACK_RADIUS*ATTACK_RADIUS;
  if(see!==b.seeTime>0)b.seeTime=0;
  if(see)b.seeTime++;else b.seeTime--;
  if(d2<=r2&&b.seeTime>=20){ai.stop(e);b.strafeTime++;}
  else{ai.navigate(e,t.x,t.y,t.z,walk);b.strafeTime=-1;}
  if(b.strafeTime>=20){
    if(game.random()<.3)b.clockwise=!b.clockwise;
    if(game.random()<.3)b.backwards=!b.backwards;
    b.strafeTime=0;
  }
  if(b.strafeTime>-1){
    if(d2>r2*.75)b.backwards=false;else if(d2<r2*.25)b.backwards=true;
    strafe(game,e,t,b.backwards?-.5:.5,b.clockwise?.5:-.5);
    faceToward(e,t.x,t.z);
  }
  ai.lookAt(e,t.x,t.y+t.eye,t.z);
  const draw=e.data.draw;
  if(typeof draw==='number'){
    if(!see&&b.seeTime<-60)delete e.data.draw;
    else if(see&&draw+1>=DRAW_TICKS){
      delete e.data.draw;
      shootArrow(game,e,t,bowPower(draw+1),stray);
      b.attackTime=bowInterval(game.settings.difficulty);
    }else e.data.draw=draw+1;
  }else if(--b.attackTime<=0&&b.seeTime>=-60)e.data.draw=0;
}
const WOLVES:Entity[]=[];
/** AvoidEntityGoal(Wolf, 6, 1.0, 1.2): checked every 5 ticks; keeps running while a wolf is near. */
function avoidWolves(game:Game,e:Entity,b:Brain):boolean{
  if((e.age+e.id)%5===0){
    b.avoid=null;
    const list=game.entities.near(e.x,e.y,e.z,WOLF_RANGE,o=>o.kind==='wolf'&&o.deathTime===0&&!o.removed&&Math.abs(o.y-e.y)<=3,WOLVES);
    let best=Infinity;
    for(const w of list){const d=(w.x-e.x)**2+(w.z-e.z)**2;if(d<best){best=d;b.avoid=w;}}
    WOLVES.length=0;
  }
  const w=b.avoid;
  if(!w||w.removed||w.deathTime>0){b.avoid=null;return false;}
  const close=(w.x-e.x)**2+(w.y-e.y)**2+(w.z-e.z)**2<49;
  game.entities.ai.flee(e,w.x,w.z,mobSpeed(SKELETON_MOVEMENT,close?1.2:1));
  return true;
}
/** FleeSunGoal: burning in daylight under open sky without a target, walk to a shaded spot within 10 blocks. */
function fleeSun(game:Game,e:Entity,b:Brain):boolean{
  if(walkToSpot(game,e,b,walk))return true;
  if(!isDay(game)||e.fire<=0||!underSky(game,Math.floor(e.x),Math.floor(e.y+.01),Math.floor(e.z)))return false;
  return pickSpot(game,e,b,10,3,10,(x,y,z)=>!underSky(game,x,y,z)&&game.entities.ai.isSafe(x+.5,y,z+.5,e.width,e.height))&&walkToSpot(game,e,b,walk);
}
function tickSkeleton(e:Entity,game:Game,stray:boolean){
  if(peacefulRemove(game,e))return;
  const b=brain(e);
  tickTimers(e,b);
  if(avoidWolves(game,e,b)){setAggressive(e,false);delete e.data.draw;avoidHazards(game,e);return;}
  const has=updateTarget(game,e,b,SKELETON_FOLLOW,T);
  setAggressive(e,has);
  if(has){b.goTime=0;bowAttack(game,e,b,T,stray);}
  else{
    b.seeTime=0;b.strafeTime=-1;b.attackTime=-1;delete e.data.draw;
    if(!fleeSun(game,e,b))idle(game,e,b,walk);
  }
  avoidHazards(game,e);
}

function skeletonDrops(game:Game):ItemStack[]{
  const out:ItemStack[]=[],bones=Math.floor(game.random()*3),arrows=Math.floor(game.random()*3);
  if(arrows>0)out.push(stack('arrow',arrows));
  if(bones>0)out.push(stack('bone',bones));
  return out;
}
function skeletonKind(kind:SkeletonKind):EntityKind{
  const stray=kind==='stray';
  return{
    kind,category:'hostile',width:.6,height:1.99,maxHealth:20,model:skeletonModels[kind](),
    sounds:{name:kind},despawns:true,burnsInDaylight:true,xp:5,
    spawn:stray?{light:'dark',group:[4,4],biomes:[['snowy_plains',80]],replaces:'skeleton'}:{light:'dark',group:[4,4],weight:100},
    init(e,_game,reason){if(reason==='restore'){for(const k of Object.keys(e.data))delete e.data[k];}},
    tick:(e,game)=>tickSkeleton(e,game,stray),
    hurt(e,game,source){retaliate(e,game,source);},
    drops:(_e,game)=>skeletonDrops(game),
    restoreData:data=>cleanData(data,{})
  };
}
export function skeletonKinds():EntityKind[]{return[skeletonKind('skeleton'),skeletonKind('stray')];}
