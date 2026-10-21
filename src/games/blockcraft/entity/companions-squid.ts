// The squid, after vanilla Java 1.20/1.21 (Squid, WaterAnimal and its two goals):
//  - Category 'water', aquatic (it dries out on land: the entity service's air rule for water mobs), 10 health, 0.8 × 0.8.
//  - In water it has no gravity: each tick its velocity is its movement vector times a pulse speed. The tentacles beat
//    (tentacleMovement advances by 0.1-0.2 rad a tick); late in each stroke the speed jumps to 1, then decays by 0.9 a tick,
//    so the squid glides in spurts. SquidRandomMovementGoal picks a new vector (0.2 blocks/tick horizontally, ±0.1 up or
//    down) 1 in 50 ticks, and stops when no player has been within 32 blocks for 5 s. The body turns toward its motion,
//    pitches mantle-first and spins about its long axis.
//  - Out of water it falls (0.08 blocks/tick², 0.98 drag), loses horizontal speed and lies on its side.
//  - Hurt by a player or mob it squirts 30 black ink particles from its tentacle end, then flees (SquidFleeGoal, while the
//    attacker is within 10 blocks for 5 s; vanilla's unnormalised flee vector: faster the further it gets), trailing
//    bubbles.
//  - Drops 1-3 ink sacs; 1-3 experience.
import {AIR,isWater} from '../data/blocks';
import {stack} from '../data/items';
import type {DamageSource,Entity,EntityKind,Game} from '../engine/contracts';
import {squidModel,type SquidLook} from './companions-art';

export const SQUID_SIZE=.8,SQUID_HEALTH=10;
/** Ticks a hit keeps the squid fleeing (vanilla lastHurtByMob memory) and the flee range. */
export const FLEE_MEMORY=100,FLEE_RANGE=10;
const TWO_PI=Math.PI*2,DEG=Math.PI/180,GRAVITY=.08,TICK=1/20;
/** Ink colour (vanilla squid ink is black). */
export const INK_COLOUR=0x0c0c12;

export interface SquidBrain{
  /** Movement vector, blocks per tick at full speed. */
  tx:number;ty:number;tz:number;hasVector:boolean;
  speed:number;rotateSpeed:number;tentacleSpeed:number;
  tentacleMovement:number;tentacleAngle:number;oldTentacleAngle:number;
  /** Body pitch and spin (radians), now and one tick ago. */
  pitch:number;pitchO:number;spin:number;spinO:number;
  /** Ticks since a player was within 32 blocks (vanilla noActionTime). */
  idle:number;
  /** The last attacker (an entity, or the player) and the tick of that hit. */
  attacker:Entity|'player'|null;hurtTick:number;fleeTicks:number;
  wasInWater:boolean;
}
const BRAINS=new WeakMap<Entity,SquidBrain>();
export function squidBrain(e:Entity,game:Game):SquidBrain{
  let b=BRAINS.get(e);
  if(!b){
    b={tx:0,ty:0,tz:0,hasVector:false,speed:0,rotateSpeed:0,tentacleSpeed:1/(game.random()+1)*.2,tentacleMovement:0,tentacleAngle:0,oldTentacleAngle:0,
      pitch:0,pitchO:0,spin:0,spinO:0,idle:0,attacker:null,hurtTick:-1e9,fleeTicks:0,wasInWater:e.inWater};
    BRAINS.set(e,b);
  }
  return b;
}
const wrap=(a:number)=>{a%=TWO_PI;if(a>Math.PI)a-=TWO_PI;else if(a<-Math.PI)a+=TWO_PI;return a;};

/** The attacker's position, or null when it is gone, forgotten (100 ticks) or out of the flee range. */
function threat(e:Entity,game:Game,b:SquidBrain,out:{x:number;y:number;z:number}):boolean{
  const a=b.attacker;
  if(!a||game.time.tick-b.hurtTick>FLEE_MEMORY){b.attacker=null;return false;}
  if(a==='player'){
    if(game.survival.dead){b.attacker=null;return false;}
    const p=game.player.state;out.x=p.x;out.y=p.y;out.z=p.z;
  }else{
    if(a.removed||a.deathTime>0){b.attacker=null;return false;}
    out.x=a.x;out.y=a.y;out.z=a.z;
  }
  return (e.x-out.x)**2+(e.y-out.y)**2+(e.z-out.z)**2<FLEE_RANGE*FLEE_RANGE;
}
const THREAT={x:0,y:0,z:0};
/** SquidFleeGoal.tick: away from the attacker, scaled by 3 − (d − 5)/5 beyond 5 blocks (the vector is not normalised in
 *  vanilla), level when the cell ahead is air; a bubble every 10 ticks. */
function flee(e:Entity,game:Game,b:SquidBrain){
  b.fleeTicks++;
  let vx=e.x-THREAT.x,vy=e.y-THREAT.y,vz=e.z-THREAT.z;
  const ahead=game.world.get(Math.floor(e.x+vx),Math.floor(e.y+vy),Math.floor(e.z+vz));
  if(ahead>=0&&(isWater(ahead)||ahead===AIR)){
    const d=Math.hypot(vx,vy,vz);
    if(d>0){let k=3;if(d>5)k-=(d-5)/5;if(k>0){vx*=k;vy*=k;vz*=k;}}
    if(ahead===AIR)vy=0;
    b.tx=vx/20;b.ty=vy/20;b.tz=vz/20;b.hasVector=b.tx!==0||b.ty!==0||b.tz!==0;
  }
  if(b.fleeTicks%10===5)game.render.spawnParticles('bubble',e.x,e.y+e.height/2,e.z,{count:1,spread:.1});
}
/** SquidRandomMovementGoal. */
function wander(e:Entity,game:Game,b:SquidBrain){
  if(b.idle>100){b.tx=b.ty=b.tz=0;b.hasVector=false;return;}
  if(game.random()<1/50||!b.wasInWater||!b.hasVector){
    const f=game.random()*TWO_PI;
    b.tx=Math.cos(f)*.2;b.ty=-.1+game.random()*.2;b.tz=Math.sin(f)*.2;b.hasVector=true;
  }
}
export function tickSquid(e:Entity,game:Game):void{
  if(e.removed||e.deathTime>0)return;
  const b=squidBrain(e,game),p=game.player.state;
  b.idle=(p.x-e.x)**2+(p.y-e.y)**2+(p.z-e.z)**2<32*32?0:b.idle+1;
  e.moveX=e.moveZ=0;e.jump=false;
  if(e.inWater&&threat(e,game,b,THREAT))flee(e,game,b);
  else{b.fleeTicks=0;wander(e,game,b);}
  // Squid.aiStep: the tentacle stroke and the swimming pulse.
  b.pitchO=b.pitch;b.spinO=b.spin;b.oldTentacleAngle=b.tentacleAngle;
  b.tentacleMovement+=b.tentacleSpeed;
  if(b.tentacleMovement>TWO_PI){
    b.tentacleMovement-=TWO_PI;
    if(game.random()<.1)b.tentacleSpeed=1/(game.random()+1)*.2;
  }
  if(e.inWater){
    if(b.tentacleMovement<Math.PI){
      const f=b.tentacleMovement/Math.PI;
      b.tentacleAngle=Math.sin(f*f*Math.PI)*Math.PI*.25;
      if(f>.75){b.speed=1;b.rotateSpeed=1;}else b.rotateSpeed*=.8;
    }else{b.tentacleAngle=0;b.speed*=.9;b.rotateSpeed*=.99;}
    // No gravity in water: the velocity is exactly the movement vector times the pulse (blocks/second).
    e.vx=b.tx*b.speed/TICK;e.vy=b.ty*b.speed/TICK;e.vz=b.tz*b.speed/TICK;
    const h=Math.hypot(e.vx,e.vz);
    if(h>1e-6)e.yaw=wrap(e.yaw+wrap(Math.atan2(-e.vx,-e.vz)-e.yaw)*.1);
    e.headYaw=e.yaw;
    b.spin+=Math.PI*b.rotateSpeed*1.5*DEG;
    if(b.spin>TWO_PI*64){b.spin-=TWO_PI*64;b.spinO-=TWO_PI*64;}
    b.pitch+=(-Math.atan2(h,e.vy)-b.pitch)*.1;
  }else{
    b.tentacleAngle=Math.abs(Math.sin(b.tentacleMovement))*Math.PI*.25;
    // Out of water: falls (the kind has no gravity of its own), no horizontal drive, slowly tips onto its side.
    e.vx=0;e.vz=0;e.vy-=GRAVITY/TICK;
    b.pitch+=(-Math.PI/2-b.pitch)*.02;
  }
  b.wasInWater=e.inWater;
}
/** Squid.spawnInk: 30 ink puffs from the tentacle end (one block "below" the body in its own frame). */
export function spawnInk(e:Entity,game:Game,b:SquidBrain){
  // SoundEvents.SQUID_SQUIRT at the squid's volume (0.4) and voice pitch.
  game.sounds.play('mob:squid_squirt:ambient',{x:e.x,y:e.y+e.height/2,z:e.z},{volume:.4,pitch:(game.random()-game.random())*.2+1});
  // Body frame → world: Ry(yaw) · Rx(pitch), as the model is drawn.
  const cp=Math.cos(b.pitch),sp=Math.sin(b.pitch),cy=Math.cos(e.yaw),sy=Math.sin(e.yaw);
  const rotate=(x:number,y:number,z:number,out:number[])=>{
    const y1=y*cp-z*sp,z1=y*sp+z*cp;
    out[0]=x*cy+z1*sy;out[1]=y1;out[2]=-x*sy+z1*cy;
  };
  const base=[0,0,0],v=[0,0,0];
  rotate(0,-1,0,base);
  const ox=e.x+base[0],oy=e.y+base[1]+.5,oz=e.z+base[2];
  for(let i=0;i<6;i++){
    rotate(game.random()*.6-.3,-1,game.random()*.6-.3,v);
    // 0.3..2.3 × 0.1 blocks/tick, in blocks/second.
    const s=(.3+game.random()*2)*.1/TICK;
    game.render.spawnParticles('large_smoke',ox,oy,oz,{count:5,spread:.15,velocity:{x:v[0]*s,y:v[1]*s,z:v[2]*s},color:INK_COLOUR});
  }
}
export function hurtSquid(e:Entity,game:Game,source:DamageSource):void{
  const b=squidBrain(e,game);
  const attacker:Entity|'player'|null=source.attacker&&source.attacker!==e&&!source.attacker.removed?source.attacker:
    source.kind==='player'||source.byPlayer?'player':null;
  if(!attacker)return;
  b.attacker=attacker;b.hurtTick=game.time.tick;b.fleeTicks=0;
  spawnInk(e,game,b);
}
export function lookOfSquid(e:Entity,partial:number,out:SquidLook):void{
  const b=BRAINS.get(e);
  if(!b){out.pitch=0;out.spin=0;out.tentacles=0;return;}
  out.pitch=b.pitchO+(b.pitch-b.pitchO)*partial;
  out.spin=b.spinO+(b.spin-b.spinO)*partial;
  out.tentacles=b.oldTentacleAngle+(b.tentacleAngle-b.oldTentacleAngle)*partial;
}
export function squidKind(game:Game):EntityKind{
  return{
    kind:'squid',category:'water',width:SQUID_SIZE,height:SQUID_SIZE,maxHealth:SQUID_HEALTH,aquatic:true,
    // Gravity 0: in water the squid sets its own velocity; out of water tick() adds the fall.
    physics:{gravity:0},
    model:squidModel(lookOfSquid),
    tick:tickSquid,
    hurt(e,g,source){hurtSquid(e,g,source);},
    drops:()=>[stack('ink_sac',1+Math.floor(game.random()*3))],
    // WaterAnimal experience: 1-3.
    xp:()=>1+Math.floor(game.random()*3),
    restoreData:()=>({}),
    sounds:{name:'squid',ambient:true,step:false},
    // Vanilla: groups of 1-4 in oceans and rivers.
    spawn:{light:'water',group:[1,4]}
  };
}
