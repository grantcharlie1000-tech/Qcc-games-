// Shared behaviour of the hostile mobs (entity/hostile-*.ts), after the Java 1.20 goals: vanilla movement speeds,
// player and revenge targeting with cached line of sight (NearestAttackableTargetGoal, HurtByTargetGoal with
// alertOthers, TargetGoal's 60-tick unseen memory), MeleeAttackGoal chasing and 20-tick hits with the 1.20.5 attack box,
// FloatGoal swimming, hazard braking, idle looking, peaceful removal and the natural spawn rules (monster darkness,
// open sky). Steering goes through game.entities.ai; this module only sets moveX/moveZ/jump/yaw/headYaw (and velocity
// for leaps and swimming). Burning in daylight, fire and drowning (the undead never drown) are applied by the entity
// service from the kind flags. Shields are survival's: a blocked hit on the player returns 0 from survival.damage,
// which also wears the shield and pushes a melee attacker back.
import {SOLID,blockDef,isLava} from '../data/blocks';
import type {DamageSource,Difficulty,Entity,Game} from '../engine/contracts';
import {isDarkEnoughToSpawn} from './spawning';

export const DIFFICULTY_ID:Readonly<Record<Difficulty,number>>={peaceful:0,easy:1,normal:2,hard:3};
/** Vanilla knockback strength 0.4 blocks/tick, in blocks/second. */
export const KNOCKBACK=8;
/** Melee reach added around the attacker's box (vanilla 1.20.5 DEFAULT_ATTACK_REACH = √2.04 − 0.6). */
export const MELEE_REACH=Math.sqrt(2.04)-.6;
/** Ticks between melee hits (MeleeAttackGoal). */
export const ATTACK_INTERVAL=20;
/** Ticks a target may stay out of sight before it is forgotten (TargetGoal unseenMemoryTicks). */
export const UNSEEN_MEMORY=60;
/** Ticks of the attack swing animation (data.swing counts down from it; the renderer reads it). */
export const SWING_TICKS=10;

/** Ground speed in blocks/second of an AI-driven vanilla mob with movement attribute `attribute` and goal speed
 *  `modifier`: Mob.setSpeed also sets the forward input, so the acceleration per tick is (attribute × modifier)², and
 *  the speed settles at that over (1 − 0.6 × 0.91) per tick on normal ground. Zombie 0.23 → 2.33, spider 0.3 → 3.96. */
export function mobSpeed(attribute:number,modifier=1):number{const s=attribute*modifier;return s*s/(1-.6*.91)*20;}
/** Vanilla RandomSource.triangle: centre + deviation × (r1 − r2). */
export const triangle=(random:()=>number,centre:number,deviation:number)=>centre+deviation*(random()-random());
export const difficultyId=(game:Game)=>DIFFICULTY_ID[game.settings.difficulty]??2;
/** Base regional difficulty (DifficultyInstance without moon phase and inhabited time): easy 0.75, normal 1.5, hard 2.25. */
export const localDifficulty=(game:Game)=>difficultyId(game)*.75;
/** The difficulty-scaled amount survival applies to mob damage: easy min(a, a/2+1), hard ×1.5. */
export function difficultyScaled(game:Game,amount:number):number{
  switch(game.settings.difficulty){
    case 'peaceful':return 0;
    case 'easy':return Math.min(amount,amount/2+1);
    case 'hard':return amount*1.5;
    default:return amount;
  }
}
/** Vanilla Level.isDay(): the sky is darkened by fewer than 4 levels. */
export const isDay=(game:Game)=>game.time.skyDarkening<4;
/** Vanilla brightness → "light level dependent magic value" (0..1): f / (4 − 3f) with f = level / 15. */
export function lightValue(level:number){const f=level/15;return f/(4-3*f);}
/** Brightness at an entity's eyes (spiders' daylight check). */
export const eyeBrightness=(game:Game,e:Entity)=>game.world.brightnessAt(Math.floor(e.x),Math.floor(e.y+e.height*.85),Math.floor(e.z));

/** Transient per-entity AI state (not saved: hostile mobs are not persisted). */
export interface Brain{
  /** Current target: another entity, or the player when targetPlayer. */
  target:Entity|null;targetPlayer:boolean;
  /** The target hurt this mob or one of its kin (HurtByTargetGoal). */
  revenge:boolean;
  /** Cached line of sight to the target and the tick it was checked; ticks unseen. */
  sight:boolean;sightAge:number;unseen:number;
  /** Where the target was last seen (MeleeAttackGoal only re-paths toward a visible target). */
  lastX:number;lastY:number;lastZ:number;hasLast:boolean;
  /** Ticks until the next melee hit. */
  cooldown:number;
  /** Idle look-at-player ticks. */
  look:number;
  // Ranged attack (RangedBowAttackGoal).
  seeTime:number;strafeTime:number;clockwise:boolean;backwards:boolean;attackTime:number;
  // Spiders: a leap is in progress.
  leaping:boolean;
  // A destination being walked to (skeletons fleeing the sun, drowned heading for water), and ticks left.
  goX:number;goY:number;goZ:number;goTime:number;
  // Skeletons: the wolf being run from.
  avoid:Entity|null;
  // Zombies: ticks with the eyes under water (−1 when out); creepers: swell direction and the fall in progress.
  wet:number;swellDir:number;fall:number;prevY:number;
}
const brains=new WeakMap<Entity,Brain>();
export function brain(e:Entity):Brain{
  let b=brains.get(e);
  if(!b){
    b={target:null,targetPlayer:false,revenge:false,sight:false,sightAge:-1,unseen:0,lastX:0,lastY:0,lastZ:0,hasLast:false,cooldown:0,look:0,
      seeTime:0,strafeTime:-1,clockwise:false,backwards:false,attackTime:-1,leaping:false,goX:0,goY:0,goZ:0,goTime:0,avoid:null,wet:-1,swellDir:-1,fall:0,prevY:e.y};
    brains.set(e,b);
  }
  return b;
}
export function forget(b:Brain){b.target=null;b.targetPlayer=false;b.revenge=false;b.unseen=0;b.sightAge=-1;b.sight=false;b.hasLast=false;}
/** Writes data.aggressive only when it changes (models raise arms / aim bows from it). */
export function setAggressive(e:Entity,on:boolean){if((e.data.aggressive===true)!==on){if(on)e.data.aggressive=true;else delete e.data.aggressive;}}
export function hasTarget(b:Brain){return b.targetPlayer||b.target!==null;}

/** Position and size of the current target, filled by `resolveTarget`. */
export interface TargetPos{x:number;y:number;z:number;width:number;height:number;eye:number;inWater:boolean}
export const newTarget=():TargetPos=>({x:0,y:0,z:0,width:.6,height:1.8,eye:1.62,inWater:false});

/** Creative, dead or peaceful players are never targeted. */
export function playerTargetable(game:Game):boolean{
  return game.settings.mode==='survival'&&!game.survival.dead&&game.settings.difficulty!=='peaceful'&&game.state!=='dead';
}
function fillPlayer(game:Game,out:TargetPos){
  const p=game.player.state;
  out.x=p.x;out.y=p.y;out.z=p.z;out.width=game.player.width;out.height=game.player.height;out.eye=game.player.eyeHeight();out.inWater=p.inWater;
}
/** Fills `out` with the brain's target, clearing targets that are gone. Returns false without a target. */
export function resolveTarget(game:Game,b:Brain,out:TargetPos):boolean{
  if(b.targetPlayer){
    if(!playerTargetable(game)){forget(b);return false;}
    fillPlayer(game,out);return true;
  }
  const t=b.target;
  if(!t)return false;
  if(t.removed||t.deathTime>0||t.health<=0){forget(b);return false;}
  out.x=t.x;out.y=t.y;out.z=t.z;out.width=t.width;out.height=t.height;out.eye=t.height*.85;out.inWater=t.inWater;
  return true;
}
const distTo=(e:Entity,t:TargetPos)=>Math.hypot(t.x-e.x,t.y-e.y,t.z-e.z);
/** Line of sight to the target's eyes, checked every third tick (staggered by id) and cached. */
export function seesTarget(game:Game,e:Entity,b:Brain,t:TargetPos):boolean{
  if(b.sightAge<0||e.age-b.sightAge>=3||(e.age+e.id)%3===0){b.sight=game.entities.ai.canSee(e,t.x,t.y+t.eye,t.z);b.sightAge=e.age;}
  if(b.sight){b.lastX=t.x;b.lastY=t.y;b.lastZ=t.z;b.hasLast=true;}
  return b.sight;
}
/** NearestAttackableTargetGoal for the player: a 1-in-10 chance per tick to look, within `range` blocks (80% when the
 *  player sneaks), needing line of sight. `allow` adds kind rules (spider light, drowned water). */
export function acquirePlayer(game:Game,e:Entity,b:Brain,range:number,scratch:TargetPos,allow?:(game:Game,e:Entity)=>boolean):void{
  if(hasTarget(b)||game.random()>=.1||!playerTargetable(game))return;
  const p=game.player.state,r=range*(p.sneaking?.8:1);
  if((p.x-e.x)**2+(p.y-e.y)**2+(p.z-e.z)**2>r*r)return;
  if(allow&&!allow(game,e))return;
  fillPlayer(game,scratch);
  if(!game.entities.ai.canSee(e,scratch.x,scratch.y+scratch.eye,scratch.z))return;
  b.targetPlayer=true;b.target=null;b.revenge=false;b.unseen=0;b.sight=true;b.sightAge=e.age;
  b.lastX=p.x;b.lastY=p.y;b.lastZ=p.z;b.hasLast=true;
}
/** TargetGoal.canContinueToUse: drops a target beyond the follow range or unseen for 3 seconds. Returns true while kept. */
export function keepTarget(game:Game,e:Entity,b:Brain,range:number,t:TargetPos):boolean{
  if(distTo(e,t)>range){forget(b);return false;}
  if(seesTarget(game,e,b,t))b.unseen=0;
  else if(++b.unseen>UNSEEN_MEMORY){forget(b);return false;}
  return true;
}
/** Target selection for a tick: keep the current target or look for the player. Returns true with a target in `t`. */
export function updateTarget(game:Game,e:Entity,b:Brain,range:number,t:TargetPos,allow?:(game:Game,e:Entity)=>boolean):boolean{
  if(resolveTarget(game,b,t)&&keepTarget(game,e,b,range,t))return true;
  acquirePlayer(game,e,b,range,t,allow);
  return resolveTarget(game,b,t);
}
/** HurtByTargetGoal: turn on whatever hurt us (the shooter for projectiles), or the survival player. */
export function retaliate(e:Entity,game:Game,source:DamageSource):boolean{
  const b=brain(e),a=source.attacker;
  if(a&&a!==e&&!a.removed&&a.deathTime===0&&(a.category==='hostile'||a.category==='passive'||a.category==='water')){
    b.target=a;b.targetPlayer=false;b.revenge=true;b.unseen=0;b.sightAge=-1;b.cooldown=0;return true;
  }
  if((source.kind==='player'||source.byPlayer)&&playerTargetable(game)){
    b.target=null;b.targetPlayer=true;b.revenge=true;b.unseen=0;b.sightAge=-1;
    const p=game.player.state;b.lastX=p.x;b.lastY=p.y;b.lastZ=p.z;b.hasLast=true;
    return true;
  }
  return false;
}
const NEAR:Entity[]=[];
/** HurtByTargetGoal.alertOthers: kin within `range` blocks (10 vertically) without a target take up ours. */
export function alertOthers(game:Game,e:Entity,range:number,kin:(o:Entity)=>boolean):void{
  const b=brain(e);if(!hasTarget(b))return;
  const list=game.entities.near(e.x,e.y,e.z,range,o=>o!==e&&o.deathTime===0&&!o.removed&&kin(o)&&Math.abs(o.y-e.y)<=10,NEAR);
  for(const o of list){
    const ob=brain(o);if(hasTarget(ob)||o===b.target)continue;
    ob.target=b.target;ob.targetPlayer=b.targetPlayer;ob.revenge=true;ob.unseen=0;ob.sightAge=-1;
    ob.lastX=b.lastX;ob.lastY=b.lastY;ob.lastZ=b.lastZ;ob.hasLast=b.hasLast;
  }
  NEAR.length=0;
}

/** Is the target's box within melee reach of the attacker (vanilla 1.20.5 attack box: the mob's box grown horizontally)? */
export function inMeleeRange(e:Entity,t:TargetPos):boolean{
  const r=e.width/2+MELEE_REACH+t.width/2;
  return Math.abs(t.x-e.x)<=r&&Math.abs(t.z-e.z)<=r&&t.y<e.y+e.height&&t.y+t.height>e.y;
}
/** MeleeAttackGoal movement: path to where the target was last seen, straight at it once close and visible. */
export function chase(game:Game,e:Entity,b:Brain,t:TargetPos,speed:number):void{
  const ai=game.entities.ai;
  ai.lookAt(e,t.x,t.y+t.eye,t.z);
  if(!b.hasLast){ai.stop(e);return;}
  const dx=b.lastX-e.x,dz=b.lastZ-e.z;
  if(b.sight&&dx*dx+dz*dz<9&&Math.abs(t.y-e.y)<1.2)ai.moveToward(e,t.x,t.y,t.z,speed);
  else if(dx*dx+dz*dz<.25&&Math.abs(b.lastY-e.y)<1.5){e.moveX=0;e.moveZ=0;}
  else ai.navigate(e,b.lastX,b.lastY,b.lastZ,speed);
}

/** One melee swing at the target: base (normal difficulty) damage to the player through survival (which scales it by
 *  difficulty and armour, and lets a raised shield block it: 0 lost, shield worn, attacker pushed back) or to another
 *  entity. Returns true when the hit landed. */
export function meleeHit(game:Game,e:Entity,b:Brain,base:number):boolean{
  e.data.swing=SWING_TICKS;
  if(b.targetPlayer){
    const p=game.player.state;
    return game.survival.damage(base,{kind:'mob',attacker:e,knockback:{x:p.x-e.x,z:p.z-e.z,strength:KNOCKBACK}})>0;
  }
  const t=b.target;
  if(!t)return false;
  return game.entities.damage(t,base,{kind:'mob',attacker:e,knockback:{x:t.x-e.x,z:t.z-e.z,strength:KNOCKBACK}});
}
/** Counts down the attack swing and the melee cooldown. */
export function tickTimers(e:Entity,b:Brain){
  const s=e.data.swing;
  if(typeof s==='number'){if(s>1)e.data.swing=s-1;else delete e.data.swing;}
  if(b.cooldown>0)b.cooldown--;
}
/** Melee once the target is in reach, visible and the cooldown is over (MeleeAttackGoal.checkAndPerformAttack). */
export function tryMelee(game:Game,e:Entity,b:Brain,t:TargetPos,base:number):boolean{
  if(b.cooldown>0||!b.sight||!inMeleeRange(e,t))return false;
  b.cooldown=ATTACK_INTERVAL;
  return meleeHit(game,e,b,base);
}
export function ignite(e:Entity,ticks:number){e.fire=Math.max(e.fire,ticks);}

const hazard=(id:number)=>id>0&&(isLava(id)||blockDef(id).family==='fire'||blockDef(id).family==='cactus');
/** Cancels the movement intent when the next step would enter lava, fire or a cactus, or walk off onto lava below. */
export function avoidHazards(game:Game,e:Entity):void{
  if(!e.moveX&&!e.moveZ)return;
  const sp=Math.hypot(e.moveX,e.moveZ),ahead=e.width/2+.4,w=game.world;
  const x=Math.floor(e.x+e.moveX/sp*ahead),z=Math.floor(e.z+e.moveZ/sp*ahead),y=Math.floor(e.y+.01);
  if(x===Math.floor(e.x)&&z===Math.floor(e.z))return;
  const cell=w.get(x,y,z),below=w.get(x,y-1,z);
  if(hazard(cell)||hazard(w.get(x,y+1,z))||cell>=0&&!SOLID[cell]&&hazard(below)){e.moveX=0;e.moveZ=0;}
}
/** FloatGoal: swim up (jump) while in water or lava, 80% of ticks. */
export function floatInLiquid(game:Game,e:Entity){if((e.inWater||e.inLava)&&game.random()<.8)e.jump=true;}
/** LookAtPlayerGoal: an idle mob sometimes watches a player within 8 blocks for 2-4 seconds. */
export function idleLook(game:Game,e:Entity,b:Brain):void{
  const p=game.player.state;
  if(b.look>0){b.look--;game.entities.ai.lookAt(e,p.x,p.y+game.player.eyeHeight(),p.z);return;}
  if(game.random()<.02&&!game.survival.dead&&(p.x-e.x)**2+(p.y-e.y)**2+(p.z-e.z)**2<64)b.look=40+Math.floor(game.random()*40);
}
/** RandomStrollGoal and LookAtPlayerGoal for a mob without a target. */
export function idle(game:Game,e:Entity,b:Brain,speed:number){
  idleLook(game,e,b);
  game.entities.ai.wander(e,speed);
}
/** Peaceful difficulty removes hostile mobs (Monster.tick). Returns true when the mob was removed. */
export function peacefulRemove(game:Game,e:Entity):boolean{
  if(game.settings.difficulty!=='peaceful')return false;
  game.entities.remove(e);return true;
}
/** Up to `tries` random cells within ±range (±dy vertically) accepted by `ok`, written to the brain's destination. */
export function pickSpot(game:Game,e:Entity,b:Brain,range:number,dy:number,tries:number,ok:(game:Game,e:Entity,x:number,y:number,z:number)=>boolean):boolean{
  const fx=Math.floor(e.x),fy=Math.floor(e.y+.01),fz=Math.floor(e.z);
  for(let i=0;i<tries;i++){
    const x=fx+Math.floor(game.random()*(range*2+1))-range,y=fy+Math.floor(game.random()*(dy*2+1))-dy,z=fz+Math.floor(game.random()*(range*2+1))-range;
    if(ok(game,e,x,y,z)){b.goX=x+.5;b.goY=y;b.goZ=z+.5;b.goTime=200;return true;}
  }
  return false;
}
/** Walks to the brain's destination; returns false once there (or given up). */
export function walkToSpot(game:Game,e:Entity,b:Brain,speed:number):boolean{
  if(b.goTime<=0)return false;
  b.goTime--;
  if(Math.hypot(b.goX-e.x,b.goZ-e.z)<.8){b.goTime=0;game.entities.ai.stop(e);return false;}
  game.entities.ai.navigate(e,b.goX,b.goY,b.goZ,speed);
  return true;
}
/** Can the sky be seen from this cell (no block above it)? */
export const underSky=(game:Game,x:number,y:number,z:number)=>game.world.topY(x,z)<y;

// ---- Natural spawn rules (EntityKind.spawn.check) --------------------------------------------------
/** Vanilla Level.canSeeSky for a spawn cell: full sky light (snow layers, plants and torches let it through). */
export const seesSky=(game:Game,x:number,y:number,z:number)=>(game.world.lightAt(x,y,z)>>4)>=15;
/** Husk and stray spawn rule (checkHuskSpawnRules, checkStraySpawnRules): monster darkness and open sky. A kind's
 *  spawn.check replaces the framework's default darkness test, so it calls the framework's rule (isDarkEnoughToSpawn). */
export const darkUnderOpenSky=(game:Game,x:number,y:number,z:number)=>isDarkEnoughToSpawn(game,x,y,z)&&seesSky(game,x,y,z);

// ---- Validation ------------------------------------------------------------------------------
const isInt=(v:unknown,min:number,max:number):v is number=>Number.isInteger(v)&&(v as number)>=min&&(v as number)<=max;
/** Keeps only the listed fields of restored mob data, each validated: 'bool', or an integer range [min,max]. */
export function cleanData(data:Record<string,unknown>,fields:Record<string,'bool'|readonly [number,number]>):Record<string,unknown>{
  const out:Record<string,unknown>={};
  for(const [key,rule] of Object.entries(fields)){
    const v=data[key];
    if(rule==='bool'){if(typeof v==='boolean')out[key]=v;}
    else if(isInt(v,rule[0],rule[1]))out[key]=v;
  }
  return out;
}
