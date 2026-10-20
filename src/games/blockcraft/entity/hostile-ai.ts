// Shared behaviour of the hostile mobs (entity/hostile*.ts): vanilla movement speeds, player and
// revenge targeting with cached line of sight, melee with shields, daylight burning, hazard
// avoidance and idle looking. Steering goes through game.entities.ai; only moveX/moveZ/jump/yaw
// (and velocity for leaps and swimming) are touched here.
import {SOLID,blockDef,isLava,isWater} from '../data/blocks';
import {itemDef} from '../data/items';
import type {DamageSource,Difficulty,Entity,Game,PartPose} from '../engine/contracts';

export const DIFFICULTY_ID:Readonly<Record<Difficulty,number>>={peaceful:0,easy:1,normal:2,hard:3};
/** Vanilla knockback strength 0.4 blocks/tick, in blocks/second. */
export const KNOCKBACK=8;
/** Melee reach added around the attacker's box (vanilla DEFAULT_ATTACK_REACH = √2.04 − 0.6). */
export const MELEE_REACH=Math.sqrt(2.04)-.6;
/** Ticks between melee hits (MeleeAttackGoal). */
export const ATTACK_INTERVAL=20;
/** Ticks a target may stay out of sight before it is forgotten (TargetGoal unseenMemoryTicks). */
export const UNSEEN_MEMORY=60;
/** Ticks to burn when the sun catches an undead mob (setSecondsOnFire(8)). */
export const SUN_FIRE=160;

/** Ground speed in blocks/second of an AI-driven vanilla mob with movement attribute `attribute` and goal speed
 *  `modifier`: Mob.setSpeed also sets the forward input, so acceleration per tick is (attribute × modifier)², and the
 *  speed settles at that over (1 − 0.6 × 0.91) per tick on normal ground. Zombie 0.23 → 2.33, spider 0.3 → 3.96. */
export function mobSpeed(attribute:number,modifier=1):number{const s=attribute*modifier;return s*s/(1-.6*.91)*20;}
/** Vanilla RandomSource.triangle: centre + deviation × (r1 − r2). */
export const triangle=(random:()=>number,centre:number,deviation:number)=>centre+deviation*(random()-random());
export const difficultyId=(game:Game)=>DIFFICULTY_ID[game.settings.difficulty]??2;
/** The difficulty-scaled amount survival applies to mob damage (used for shield wear): easy min(a, a/2+1), hard ×1.5. */
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

/** Transient per-entity AI state (not saved; hostile mobs are not persisted and re-acquire targets after a load). */
export interface Brain{
  /** Current target: another entity, or the player when targetPlayer. */
  target:Entity|null;targetPlayer:boolean;
  /** The target hurt this mob (HurtByTargetGoal): spiders keep such targets in daylight. */
  revenge:boolean;
  /** Cached line of sight to the target and when it was checked. */
  sight:boolean;sightAge:number;unseen:number;
  /** Ticks until the next melee hit. */
  cooldown:number;
  /** Idle look-at-player ticks. */
  look:number;
  // Ranged attack (skeletons).
  seeTime:number;strafeTime:number;clockwise:boolean;backwards:boolean;attackTime:number;draw:number;
  // Spiders: a leap is in progress.
  leaping:boolean;
  // Skeletons fleeing the sun.
  hideX:number;hideY:number;hideZ:number;hideTime:number;
  // Creepers: current swell direction.
  swellDir:number;
}
const brains=new WeakMap<Entity,Brain>();
export function brain(e:Entity):Brain{
  let b=brains.get(e);
  if(!b){
    b={target:null,targetPlayer:false,revenge:false,sight:false,sightAge:-1,unseen:0,cooldown:0,look:0,
      seeTime:0,strafeTime:-1,clockwise:false,backwards:false,attackTime:-1,draw:-1,leaping:false,hideX:0,hideY:0,hideZ:0,hideTime:0,swellDir:-1};
    brains.set(e,b);
  }
  return b;
}
export function forget(b:Brain){b.target=null;b.targetPlayer=false;b.revenge=false;b.unseen=0;b.sightAge=-1;b.sight=false;}

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
  return b.sight;
}
/** NearestAttackableTargetGoal for the player: a 1-in-10 chance per tick to look, within `range` blocks (80% when the
 *  player sneaks), needing line of sight. `allow` adds kind rules (spider light, drowned water). */
export function acquirePlayer(game:Game,e:Entity,b:Brain,range:number,scratch:TargetPos,allow?:()=>boolean):void{
  if(b.target||b.targetPlayer||game.random()>=.1||!playerTargetable(game))return;
  const p=game.player.state,r=range*(p.sneaking?.8:1);
  if(Math.hypot(p.x-e.x,p.y-e.y,p.z-e.z)>r)return;
  if(allow&&!allow())return;
  fillPlayer(game,scratch);
  if(!game.entities.ai.canSee(e,scratch.x,scratch.y+scratch.eye,scratch.z))return;
  b.targetPlayer=true;b.target=null;b.revenge=false;b.unseen=0;b.sight=true;b.sightAge=e.age;
}
/** TargetGoal.canContinueToUse: drops a target beyond the follow range or unseen for 3 seconds. Returns true while kept. */
export function keepTarget(game:Game,e:Entity,b:Brain,range:number,t:TargetPos):boolean{
  if(distTo(e,t)>range){forget(b);return false;}
  if(seesTarget(game,e,b,t))b.unseen=0;
  else if(++b.unseen>UNSEEN_MEMORY){forget(b);return false;}
  return true;
}
/** HurtByTargetGoal: turn on whatever hurt us (the shooter for projectiles), or the survival player. */
export function retaliate(e:Entity,game:Game,source:DamageSource):void{
  const b=brain(e),a=source.attacker;
  if(a&&a!==e&&!a.removed&&a.category!=='projectile'){b.target=a;b.targetPlayer=false;b.revenge=true;b.unseen=0;b.sightAge=-1;return;}
  if((source.kind==='player'||source.byPlayer)&&playerTargetable(game)){b.target=null;b.targetPlayer=true;b.revenge=true;b.unseen=0;b.sightAge=-1;}
}

/** Is the target's box within melee reach of the attacker (vanilla 1.20.5 attack box: the mob's box grown horizontally)? */
export function inMeleeRange(e:Entity,t:TargetPos):boolean{
  const r=e.width/2+MELEE_REACH+t.width/2;
  return Math.abs(t.x-e.x)<=r&&Math.abs(t.z-e.z)<=r&&t.y<e.y+e.height&&t.y+t.height>e.y;
}

/** A raised shield blocks a hit coming from (x,z) when that point is in front of the player (vanilla
 *  isDamageSourceBlocked: the horizontal vector from the source to the player opposes the view direction). */
export function shieldBlocks(game:Game,fromX:number,fromZ:number):boolean{
  if(game.interaction.using?.item!=='shield')return false;
  const p=game.player.state;
  return (p.x-fromX)*-Math.sin(p.yaw)+(p.z-fromZ)*-Math.cos(p.yaw)<0;
}
/** Shield wear after blocking `damage` (vanilla: 1 + floor(damage) when the hit is at least 3). */
export function wearShield(game:Game,damage:number):void{
  if(damage<3)return;
  const n=1+Math.floor(damage),inv=game.inventory;
  if(inv.held()?.id==='shield'){inv.damageHeld(n);return;}
  const off=inv.offhand;
  if(off?.id==='shield'){
    const wear=(off.damage??0)+n,max=itemDef('shield')?.durability??336;
    inv.setOffhand(wear>=max?null:{...off,damage:wear});
  }
}
/** Vanilla LivingEntity.knockback applied to an entity: halve the velocity and add `strength` along (dx,dz). */
export function knockEntity(e:Entity,dx:number,dz:number,strength:number){
  const len=Math.hypot(dx,dz);if(len<1e-7)return;
  e.vx=e.vx/2+dx/len*strength;e.vz=e.vz/2+dz/len*strength;
  if(e.onGround)e.vy=Math.min(strength,e.vy/2+strength);
}
/** The same knockback for the player, through player.push (it only adds velocity). */
export function knockPlayer(game:Game,dx:number,dz:number,strength:number){
  const len=Math.hypot(dx,dz);if(len<1e-7)return;
  const p=game.player.state,nvx=p.vx/2+dx/len*strength,nvz=p.vz/2+dz/len*strength,nvy=p.onGround?Math.min(strength,p.vy/2+strength):p.vy;
  game.player.push(nvx-p.vx,nvy-p.vy,nvz-p.vz);
}

/** One melee swing at the target: base (normal difficulty) damage to the player through survival (which scales it by
 *  difficulty) or to another entity. A raised shield facing the attacker blocks it, wears the shield and pushes the
 *  attacker back. Returns the health the player lost (or 1 when an entity was hurt), 0 when nothing landed. */
export function meleeHit(game:Game,e:Entity,b:Brain,base:number):number{
  e.data.swing=e.age;
  if(b.targetPlayer){
    const p=game.player.state;
    if(shieldBlocks(game,e.x,e.z)){wearShield(game,difficultyScaled(game,base));knockEntity(e,e.x-p.x,e.z-p.z,10);return 0;}
    return game.survival.damage(base,{kind:'mob',attacker:e,knockback:{x:p.x-e.x,z:p.z-e.z,strength:KNOCKBACK}});
  }
  const t=b.target;
  if(!t)return 0;
  return game.entities.damage(t,base,{kind:'mob',attacker:e,knockback:{x:t.x-e.x,z:t.z-e.z,strength:KNOCKBACK}})?1:0;
}

/** Vanilla brightness → "light level dependent magic value" (0..1): f / (4 − 3f) with f = level / 15. */
export function lightValue(level:number){const f=level/15;return f/(4-3*f);}
/** Vanilla isSunBurnTick: by day, out of water and rain, under open sky and bright light, a mob catches fire with
 *  chance (value − 0.4) × 2 / 30 per tick (4% in full sun). Cheap random rejection first. */
export function sunBurns(game:Game,e:Entity,eyeHeight:number):boolean{
  if(!isDay(game)||e.inWater||e.fire>0)return false;
  const roll=game.random()*30;
  if(roll>=1.2)return false;
  const w=game.world,x=Math.floor(e.x),y=Math.floor(e.y+eyeHeight),z=Math.floor(e.z);
  if(roll>=(lightValue(w.brightnessAt(x,y,z))-.4)*2)return false;
  if((w.lightAt(x,y,z)>>4)<15)return false;
  const feet=w.get(x,Math.floor(e.y+.1),z);
  if(feet>0&&isWater(feet))return false;
  return !game.weather.isRainingOn(x,y,z);
}
export function ignite(e:Entity,ticks:number){e.fire=Math.max(e.fire,ticks);}

const hazard=(id:number)=>id>0&&(isLava(id)||blockDef(id).family==='fire');
/** Cancels the movement intent when the next step would enter lava or fire, or walk off onto lava below. */
export function avoidHazards(game:Game,e:Entity):void{
  if(!e.moveX&&!e.moveZ)return;
  const sp=Math.hypot(e.moveX,e.moveZ),ahead=e.width/2+.4,w=game.world;
  const x=Math.floor(e.x+e.moveX/sp*ahead),z=Math.floor(e.z+e.moveZ/sp*ahead),y=Math.floor(e.y+.01);
  const cell=w.get(x,y,z),below=w.get(x,y-1,z);
  if(hazard(cell)||hazard(w.get(x,y+1,z))||cell>=0&&!SOLID[cell]&&hazard(below))game.entities.ai.stop(e);
}
/** LookAtPlayerGoal: an idle mob sometimes watches a player within 8 blocks for 2-4 seconds. */
export function idleLook(game:Game,e:Entity,b:Brain):void{
  const p=game.player.state;
  if(b.look>0){b.look--;game.entities.ai.lookAt(e,p.x,p.y+game.player.eyeHeight(),p.z);return;}
  if(game.random()<.02&&!game.survival.dead&&Math.hypot(p.x-e.x,p.y-e.y,p.z-e.z)<8)b.look=40+Math.floor(game.random()*40);
}
/** Peaceful difficulty removes hostile mobs. Returns true when the mob was removed. */
export function peacefulRemove(game:Game,e:Entity):boolean{
  if(game.settings.difficulty!=='peaceful')return false;
  game.entities.remove(e);return true;
}

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

// ---- Model posing ------------------------------------------------------------------------------
/** Sets a part's pose in place (reusing the record's object when present), with no offsets. */
export function setPose(pose:Record<string,PartPose>,name:string,x:number,y:number,z:number,visible=true):PartPose{
  let p=pose[name];
  if(!p){p={x,y,z};pose[name]=p;}
  else{p.x=x;p.y=y;p.z=z;}
  p.px=0;p.py=0;p.pz=0;p.visible=visible;
  return p;
}
/** 0..1 progress of the mob's last melee swing (6 ticks), from data.swing, or the framework's attack value. */
export function swingProgress(e:Entity,partial:number,fallback:number):number{
  const s=e.data.swing;
  if(typeof s!=='number')return fallback;
  const t=(e.age-s+partial)/6;
  return t>=0&&t<1?t:fallback;
}
