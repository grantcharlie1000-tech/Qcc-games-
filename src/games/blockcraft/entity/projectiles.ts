// Projectile kinds (registered with the hostile mobs): 'arrow', 'snowball', 'egg' and 'ender_pearl', after Java 1.20
// AbstractArrow and ThrowableProjectile. Each moves itself (physics 'none') once per tick in vanilla order: sweep the
// move vector against block collision shapes and against pickable entities (boxes grown by 0.3, the owner ignored until
// the projectile has left it), react to the first hit, then move, then drag (0.99 in air; arrows 0.6, thrown items 0.8
// in water) and gravity (arrows 0.05, thrown 0.03 blocks/tick²).
//  - Arrows deal ceil(speed in blocks/tick × base damage) (+ random(n/2 + 2) when critical), knock back along their
//    flight, carry potion effects (stray Slowness) and fire, and stick 0.05 blocks out of the face they hit, quivering
//    for 7 ticks; they fall again when the block goes, despawn after 1200 ticks in the ground, and the player picks up
//    their own (`pickup`) arrows. A failed hit (shield, invulnerability, creative) bounces them back at a tenth of the
//    speed; a mob that dodged out of the way (endermen) lets them fly on. A raised shield facing the arrow blocks it.
//  - Snowballs and eggs break on impact with item particles and knock mobs back without damage; an egg hatches a baby
//    chicken one time in eight (four chicks one time in 32 of those). Ender pearls teleport the player who threw them to
//    the impact, with 5 'fall' damage, portal particles and the teleport sound.
// Data contracts (engine/contracts shared entity kinds): arrow {owner:'player'|'mob', ownerId?, damage, pickup, crit,
// inGround} plus optional {effect, effectSeconds}; thrown {owner, ownerId?}. Velocities are set after spawning.
import {COLLISION_BOXES,blockDef,isLava,isWater} from '../data/blocks';
import {stack} from '../data/items';
import {boxCollides,collidesAt,rayBox} from '../engine/physics';
import type {BlockSource,DamageSource,EffectName,Entity,EntityKind,Game,ItemStack} from '../engine/contracts';
import {KNOCKBACK,difficultyScaled,knockEntity,shieldBlocks,triangle,wearShield} from './hostile-ai';
import {arrowModel} from './hostile-models';

/** Per-tick motion constants in blocks/tick (multiply velocities by 1/20 to use them). */
export const ARROW_PHYSICS={gravity:.05,drag:.99,waterDrag:.6} as const;
export const THROWN_PHYSICS={gravity:.03,drag:.99,waterDrag:.8} as const;
/** Ticks an arrow stays in the ground before despawning (AbstractArrow.tickDespawn). */
export const ARROW_DESPAWN=1200;
/** Ticks a freshly stuck arrow quivers and cannot be picked up. */
export const ARROW_SHAKE=7;
/** Vanilla Projectile.shoot spread per unit of inaccuracy. */
export const SPREAD=.0172275;
export const PROJECTILE_KINDS=['arrow','snowball','egg','ender_pearl'] as const;
const TICK=1/20;
const EFFECTS:readonly EffectName[]=['regeneration','absorption','hunger','poison','saturation','speed','slowness','night_vision','fire_resistance'];

/** Arrow damage (AbstractArrow.onHitEntity): ceil(speed × base), plus random(n/2 + 2) for a critical arrow. */
export function arrowDamage(speed:number,base:number,crit:boolean,random:()=>number):number{
  let n=Math.ceil(Math.max(0,Math.min(2147483647,speed*base)));
  if(crit)n+=Math.floor(random()*(Math.floor(n/2)+2));
  return n;
}

// ---- Block sweep ------------------------------------------------------------------------------------
export interface TraceHit{x:number;y:number;z:number;nx:number;ny:number;nz:number;
  /** Block id hit, -1 for an unloaded chunk. */
  id?:number}
const SLAB={t:0,axis:-1};
/** Ray (unit direction) against one box; fills SLAB with the entry distance and axis. A ray lying in a face plane misses. */
function boxEntry(ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number):boolean{
  let tmin=-Infinity,tmax=Infinity,axis=-1;
  if(dx===0){if(ox<=x0||ox>=x1)return false;}
  else{let a=(x0-ox)/dx,b=(x1-ox)/dx;if(a>b){const t=a;a=b;b=t;}if(a>tmin){tmin=a;axis=0;}if(b<tmax)tmax=b;}
  if(dy===0){if(oy<=y0||oy>=y1)return false;}
  else{let a=(y0-oy)/dy,b=(y1-oy)/dy;if(a>b){const t=a;a=b;b=t;}if(a>tmin){tmin=a;axis=1;}if(b<tmax)tmax=b;}
  if(dz===0){if(oz<=z0||oz>=z1)return false;}
  else{let a=(z0-oz)/dz,b=(z1-oz)/dz;if(a>b){const t=a;a=b;b=t;}if(a>tmin){tmin=a;axis=2;}if(b<tmax)tmax=b;}
  if(tmin>tmax||tmax<=0)return false;
  SLAB.t=tmin;SLAB.axis=axis;return true;
}
/** Distance along a unit ray to the first block collision shape (vanilla ClipContext.Block.COLLIDER, fluids ignored),
 *  or Infinity within `max`; fills `hit` with the block and the face normal. Unloaded chunks stop the ray (id -1).
 *  A ray starting inside a shape hits it at distance 0, on the face facing the motion. */
export function traceBlocks(world:BlockSource,ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,max:number,hit:TraceHit):number{
  let x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz);
  const sx=Math.sign(dx),sy=Math.sign(dy),sz=Math.sign(dz);
  const tdx=dx?Math.abs(1/dx):Infinity,tdy=dy?Math.abs(1/dy):Infinity,tdz=dz?Math.abs(1/dz):Infinity;
  let tx=dx?(sx>0?x+1-ox:ox-x)*tdx:Infinity,ty=dy?(sy>0?y+1-oy:oy-y)*tdy:Infinity,tz=dz?(sz>0?z+1-oz:oz-z)*tdz:Infinity;
  let nx=0,ny=0,nz=0,t=0;
  for(let guard=0;guard<1024&&t<=max;guard++){
    const id=world.get(x,y,z);
    if(id<0){hit.x=x;hit.y=y;hit.z=z;hit.nx=nx;hit.ny=ny;hit.nz=nz;hit.id=-1;return t;}
    if(id>0){
      const b=COLLISION_BOXES[id];
      let best=Infinity,axis=-1;
      for(let i=0;i<b.length;i+=6)
        if(boxEntry(ox,oy,oz,dx,dy,dz,x+b[i],y+b[i+1],z+b[i+2],x+b[i+3],y+b[i+4],z+b[i+5])&&SLAB.t<best){best=SLAB.t;axis=SLAB.axis;}
      if(best<=max){
        if(best<0){best=0;const ax=Math.abs(dx),ay=Math.abs(dy),az=Math.abs(dz);axis=ax>=ay&&ax>=az?0:ay>=az?1:2;}
        hit.x=x;hit.y=y;hit.z=z;hit.id=id;
        hit.nx=axis===0?-sx:0;hit.ny=axis===1?-sy:0;hit.nz=axis===2?-sz:0;
        return best;
      }
    }
    if(tx<ty&&tx<tz){x+=sx;t=tx;tx+=tdx;nx=-sx;ny=0;nz=0;}
    else if(ty<tz){y+=sy;t=ty;ty+=tdy;nx=0;ny=-sy;nz=0;}
    else{z+=sz;t=tz;tz+=tdz;nx=0;ny=0;nz=-sz;}
  }
  return Infinity;
}

// ---- State ----------------------------------------------------------------------------------------------
interface ArrowData{owner:'player'|'mob';ownerId?:number;damage:number;pickup:boolean;crit:boolean;inGround:boolean;
  effect?:EffectName;effectSeconds?:number;shake?:number}
/** Transient flight state: has the projectile cleared its owner, ticks stuck in the ground. */
interface Flight{left:boolean;life:number}
const flights=new WeakMap<Entity,Flight>();
function flight(e:Entity):Flight{let f=flights.get(e);if(!f){f={left:false,life:0};flights.set(e,f);}return f;}
const isPlayerOwned=(e:Entity)=>e.data.owner==='player';
/** The mob that shot or threw it, if it still exists. */
function ownerOf(game:Game,e:Entity):Entity|null{
  const id=e.data.ownerId;if(typeof id!=='number')return null;
  const o=game.entities.byId(id);return o&&!o.removed?o:null;
}
function cleanOwner(d:Record<string,unknown>){
  d.owner=d.owner==='player'?'player':'mob';
  if(!(Number.isInteger(d.ownerId)&&(d.ownerId as number)>0))delete d.ownerId;
}
function cleanArrow(d:Record<string,unknown>){
  cleanOwner(d);
  d.damage=typeof d.damage==='number'&&Number.isFinite(d.damage)&&d.damage>=0&&d.damage<=1000?d.damage:2;
  d.pickup=d.pickup===true;d.crit=d.crit===true;d.inGround=d.inGround===true;
  if(!EFFECTS.includes(d.effect as EffectName))delete d.effect;
  if(!(Number.isInteger(d.effectSeconds)&&(d.effectSeconds as number)>=1&&(d.effectSeconds as number)<=600))delete d.effectSeconds;
  if(!(Number.isInteger(d.shake)&&(d.shake as number)>0&&(d.shake as number)<=ARROW_SHAKE))delete d.shake;
}
/** Faces the body along a velocity (yaw 0 looks -z; pitch up-positive). */
function orient(e:Entity,vx:number,vy:number,vz:number){
  const h=Math.hypot(vx,vz);
  if(h>1e-9){e.yaw=Math.atan2(-vx,-vz);e.headYaw=e.yaw;}
  if(h>1e-9||Math.abs(vy)>1e-9)e.pitch=Math.atan2(vy,h);
}
/** Vanilla Projectile.shoot: sets the velocity (`speed` blocks/tick) along (dx,dy,dz) with triangular spread
 *  0.0172275 × inaccuracy per axis, and faces the projectile along it. */
export function shoot(e:Entity,dx:number,dy:number,dz:number,speed:number,inaccuracy:number,random:()=>number):void{
  const len=Math.hypot(dx,dy,dz)||1,s=SPREAD*inaccuracy;
  const x=dx/len+triangle(random,0,s),y=dy/len+triangle(random,0,s),z=dz/len+triangle(random,0,s);
  e.vx=x*speed*20;e.vy=y*speed*20;e.vz=z*speed*20;orient(e,x,y,z);
}

// ---- Entity sweep ------------------------------------------------------------------------------------
const CANDIDATES:Entity[]=[];
interface EntityHit{entity:Entity|null;player:boolean;t:number}
const EHIT:EntityHit={entity:null,player:false,t:Infinity};
/** The sweep's projectile and game, read by the reusable candidate filter (no closure per tick). */
let sweeping:Entity|null=null,sweepGame:Game|null=null;
const candidate=(o:Entity)=>{
  if(o===sweeping||o.removed||o.deathTime>0)return false;
  const k=sweepGame!.entities.kind(o.kind);
  return k?.pickable??(o.category==='passive'||o.category==='hostile'||o.category==='water');
};
/** Projectile.checkLeftOwner: the owner no longer touches the projectile's swept box grown by 1. */
function clearedOwner(game:Game,e:Entity,f:Flight,mx:number,my:number,mz:number):boolean{
  if(f.left)return true;
  let x0:number,y0:number,z0:number,x1:number,y1:number,z1:number;
  if(isPlayerOwned(e)){
    const p=game.player.state,hw=game.player.width/2;x0=p.x-hw;y0=p.y;z0=p.z-hw;x1=p.x+hw;y1=p.y+game.player.height;z1=p.z+hw;
  }else{
    const o=ownerOf(game,e);if(!o){f.left=true;return true;}
    const hw=o.width/2;x0=o.x-hw;y0=o.y;z0=o.z-hw;x1=o.x+hw;y1=o.y+o.height;z1=o.z+hw;
  }
  const hw=e.width/2;
  const ax0=Math.min(e.x,e.x+mx)-hw-1,ax1=Math.max(e.x,e.x+mx)+hw+1,ay0=Math.min(e.y,e.y+my)-1,ay1=Math.max(e.y,e.y+my)+e.height+1;
  const az0=Math.min(e.z,e.z+mz)-hw-1,az1=Math.max(e.z,e.z+mz)+hw+1;
  if(ax0<x1&&ax1>x0&&ay0<y1&&ay1>y0&&az0<z1&&az1>z0)return false;
  f.left=true;return true;
}
/** The nearest pickable entity (or the player) whose box grown by 0.3 the ray crosses within `max`. */
function sweepEntities(game:Game,e:Entity,dx:number,dy:number,dz:number,max:number,left:boolean):EntityHit{
  EHIT.entity=null;EHIT.player=false;EHIT.t=Infinity;
  const ox=e.x,oy=e.y,oz=e.z,ownerId=e.data.ownerId;
  sweeping=e;sweepGame=game;
  const list=game.entities.near(ox+dx*max/2,oy+dy*max/2,oz+dz*max/2,max/2+2,candidate,CANDIDATES);
  sweeping=null;sweepGame=null;
  for(const o of list){
    if(!left&&o.id===ownerId)continue;
    const hw=o.width/2+.3,t=rayBox(ox,oy,oz,dx,dy,dz,o.x-hw,o.y-.3,o.z-hw,o.x+hw,o.y+o.height+.3,o.z+hw);
    if(t>=0&&t<=max&&t<EHIT.t){EHIT.t=t;EHIT.entity=o;}
  }
  CANDIDATES.length=0;
  if(!game.survival.dead&&(left||!isPlayerOwned(e))){
    const p=game.player.state,hw=game.player.width/2+.3;
    const t=rayBox(ox,oy,oz,dx,dy,dz,p.x-hw,p.y-.3,p.z-hw,p.x+hw,p.y+game.player.height+.3,p.z+hw);
    if(t>=0&&t<=max&&t<EHIT.t){EHIT.t=t;EHIT.entity=null;EHIT.player=true;}
  }
  return EHIT;
}

// ---- Shared flight -----------------------------------------------------------------------------------
const HIT:TraceHit={x:0,y:0,z:0,nx:0,ny:0,nz:0};
const at=(x:number,y:number,z:number)=>({x,y,z});
const waterAt=(game:Game,e:Entity)=>{const id=game.world.get(Math.floor(e.x),Math.floor(e.y+e.height/2),Math.floor(e.z));return id>0&&isWater(id);};
type Impact={kind:'block';x:number;y:number;z:number;nx:number;ny:number;nz:number}|{kind:'entity';x:number;y:number;z:number;entity:Entity|null;player:boolean};
/** Reaction to the first block or entity in the way; returns true when the projectile is done (removed or stuck). */
type HitHandler=(game:Game,e:Entity,hit:Impact,ux:number,uy:number,uz:number,speed:number)=>boolean;
/** One flight step. `onHit` reacts to an impact; when it returns false the projectile moves on with its (possibly
 *  changed) velocity. */
function fly(game:Game,e:Entity,physics:{gravity:number;drag:number;waterDrag:number},onHit:HitHandler):void{
  const f=flight(e);
  let vx=e.vx*TICK,vy=e.vy*TICK,vz=e.vz*TICK;
  const water=waterAt(game,e);
  if(water)e.fire=0;
  const len=Math.hypot(vx,vy,vz);
  if(len>1e-9){
    const ux=vx/len,uy=vy/len,uz=vz/len;
    const block=traceBlocks(game.world,e.x,e.y,e.z,ux,uy,uz,len,HIT);
    if(HIT.id===-1&&block<=len){HIT.id=undefined;return;}// unloaded ahead: wait for the chunk
    const left=clearedOwner(game,e,f,vx,vy,vz);
    const hitE=sweepEntities(game,e,ux,uy,uz,Math.min(block,len),left);
    let impact:Impact|null=null;
    if(hitE.entity||hitE.player)impact={kind:'entity',x:e.x+ux*hitE.t,y:e.y+uy*hitE.t,z:e.z+uz*hitE.t,entity:hitE.entity,player:hitE.player};
    else if(block<=len)impact={kind:'block',x:e.x+ux*block,y:e.y+uy*block,z:e.z+uz*block,nx:HIT.nx,ny:HIT.ny,nz:HIT.nz};
    HIT.id=undefined;
    if(impact&&onHit(game,e,impact,ux,uy,uz,len))return;
    if(e.removed)return;
    vx=e.vx*TICK;vy=e.vy*TICK;vz=e.vz*TICK;
  }
  e.x+=vx;e.y+=vy;e.z+=vz;
  orient(e,vx,vy,vz);
  const drag=water?physics.waterDrag:physics.drag;
  vx*=drag;vy*=drag;vz*=drag;vy-=physics.gravity;
  e.vx=vx/TICK;e.vy=vy/TICK;e.vz=vz/TICK;
  if(water)game.render.spawnParticles('bubble',e.x,e.y+e.height/2,e.z,{count:2,spread:.1});
  // Lava and fire set the projectile alight (Entity.lavaHurt 15 s, fire blocks 8 s).
  const id=game.world.get(Math.floor(e.x),Math.floor(e.y+e.height/2),Math.floor(e.z));
  if(id>0&&!water){if(isLava(id))e.fire=Math.max(e.fire,300);else if(blockDef(id).family==='fire')e.fire=Math.max(e.fire,160);}
}
/** A thrown item's or arrow's zero-damage hit (snowballs, eggs, pearls): knockback and the hurt reaction, no damage. */
function nudge(game:Game,e:Entity,target:Entity|null,player:boolean,ux:number,uz:number){
  const owner=ownerOf(game,e),source:DamageSource={kind:'projectile',attacker:owner,projectile:e,byPlayer:isPlayerOwned(e),
    knockback:{x:ux,z:uz,strength:KNOCKBACK}};
  if(player){game.survival.damage(0,source);return;}
  if(!target||game.entities.damage(target,0,source))return;
  // The entity service applies no zero-damage hits: knock the mob back and let it react (panic, retaliate) here.
  if(target.hurtTime>0||target.deathTime>0)return;
  let cancelled=false;
  try{cancelled=game.entities.kind(target.kind)?.hurt?.(target,game,source,0)===false;}catch{cancelled=false;}
  if(!cancelled)knockEntity(target,ux,uz,KNOCKBACK);
}

// ---- Arrows ------------------------------------------------------------------------------------------
/** Vanilla shouldFall: nothing solid within 0.06 blocks of the arrow's tip. */
const loose=(game:Game,e:Entity)=>!boxCollides(game.world,e.x-.06,e.y-.06,e.z-.06,e.x+.06,e.y+.06,e.z+.06);
function arrowHitEntity(game:Game,e:Entity,d:ArrowData,hit:{x:number;y:number;z:number;entity:Entity|null;player:boolean},ux:number,uy:number,uz:number,speed:number):boolean{
  const damage=arrowDamage(speed,d.damage,d.crit,game.random);
  const owner=ownerOf(game,e),byPlayer=d.owner==='player';
  const source:DamageSource={kind:'projectile',attacker:owner,projectile:e,byPlayer,knockback:{x:ux,z:uz,strength:KNOCKBACK}};
  let landed=false,dodged=false;
  if(hit.player){
    // A raised shield facing the arrow blocks it (vanilla isDamageSourceBlocked uses the arrow's position).
    if(shieldBlocks(game,hit.x,hit.z))wearShield(game,difficultyScaled(game,damage));
    else{
      landed=game.survival.damage(damage,source)>0;
      if(landed&&d.effect)game.survival.addEffect(d.effect,d.effectSeconds??30,1);
      if(landed&&e.fire>0)game.survival.ignite(5);
    }
  }else if(hit.entity){
    const t=hit.entity;
    landed=game.entities.damage(t,damage,source);
    if(landed&&e.fire>0&&t.kind!=='enderman')t.fire=Math.max(t.fire,100);
    if(!landed){
      // Endermen dodge by teleporting: the arrow flies on when its path no longer meets the mob.
      const hw=t.width/2+.3;
      dodged=rayBox(e.x,e.y,e.z,ux,uy,uz,t.x-hw,t.y-.3,t.z-hw,t.x+hw,t.y+t.height+.3,t.z+hw)<0;
    }
  }
  if(landed){
    game.sounds.play('arrow_hit',at(hit.x,hit.y,hit.z),{pitch:1.2/(game.random()*.2+.9)});
    game.entities.remove(e);return true;
  }
  if(dodged)return false;
  // Bounce back at a tenth of the speed; one too slow to matter drops as an item (or vanishes).
  e.vx*=-.1;e.vy*=-.1;e.vz*=-.1;
  if((speed*.1)**2<1e-7){
    if(d.pickup&&d.owner==='player')game.entities.dropItem(stack('arrow',1),e.x,e.y,e.z);
    game.entities.remove(e);return true;
  }
  return false;
}
function stick(game:Game,e:Entity,d:ArrowData,hit:{x:number;y:number;z:number},ux:number,uy:number,uz:number){
  e.x=hit.x-ux*.05;e.y=hit.y-uy*.05;e.z=hit.z-uz*.05;
  e.vx=e.vy=e.vz=0;orient(e,ux,uy,uz);
  d.inGround=true;d.crit=false;d.shake=ARROW_SHAKE;flight(e).life=0;
  game.sounds.play('arrow_hit',at(hit.x,hit.y,hit.z),{pitch:1.2/(game.random()*.2+.9)});
}
/** The player touching a stuck arrow (box grown by 1, 0.5, 1) picks it up when allowed. */
function pickup(game:Game,e:Entity,d:ArrowData){
  if(d.shake||d.owner!=='player'||game.survival.dead)return;
  const p=game.player.state,reach=game.player.width/2+1+e.width/2;
  if(Math.abs(p.x-e.x)>reach||Math.abs(p.z-e.z)>reach||e.y+e.height<p.y-.5||e.y>p.y+game.player.height+.5)return;
  if(!d.pickup){if(game.settings.mode==='creative')game.entities.remove(e);return;}
  if(game.inventory.add(stack('arrow',1))>0)return;
  game.events.emit('itemPickedUp',{stack:stack('arrow',1)});
  game.sounds.play('pop',at(e.x,e.y,e.z),{volume:.2,pitch:((game.random()-game.random())*.7+1)*2});
  game.entities.remove(e);
}
function tickArrow(e:Entity,game:Game){
  const d=e.data as unknown as ArrowData,f=flight(e);
  if(e.fire>0)e.fire--;
  if(d.inGround){
    e.vx=e.vy=e.vz=0;
    if(!loose(game,e)){
      if(d.shake!==undefined){if(d.shake>1)d.shake--;else delete d.shake;}
      if(++f.life>=ARROW_DESPAWN){game.entities.remove(e);return;}
      pickup(game,e,d);
      return;
    }
    // The block went: fall (AbstractArrow.startFalling).
    d.inGround=false;f.life=0;delete d.shake;
  }
  if(d.crit)game.render.spawnParticles('crit',e.x,e.y+e.height/2,e.z,{count:2,spread:.1});
  fly(game,e,ARROW_PHYSICS,arrowImpact);
}
const arrowImpact:HitHandler=(game,e,hit,ux,uy,uz,speed)=>{
  const d=e.data as unknown as ArrowData;
  if(hit.kind==='entity')return arrowHitEntity(game,e,d,hit,ux,uy,uz,speed);
  stick(game,e,d,hit,ux,uy,uz);return true;
};

// ---- Thrown items --------------------------------------------------------------------------------------
/** Where a body of half width `hw` and height `h` fits at an impact point, nudged out of the face it hit. */
function landing(game:Game,x:number,y:number,z:number,nx:number,ny:number,nz:number,hw:number,h:number){
  const px=x+nx*(hw+.01),pz=z+nz*(hw+.01);
  let py=ny<0?y-h-.01:y;
  for(let i=0;i<5&&collidesAt(game.world,px,py,pz,hw,h);i++)py=Math.floor(py)+1;
  return at(px,py,pz);
}
function impactPoint(hit:Impact,ux:number,uy:number,uz:number,hw:number,h:number,game:Game){
  if(hit.kind==='block')return landing(game,hit.x,hit.y,hit.z,hit.nx,hit.ny,hit.nz,hw,h);
  return at(hit.x-ux*.1,hit.y-uy*.1,hit.z-uz*.1);
}
function breakParticles(game:Game,e:Entity,item:string,x:number,y:number,z:number){
  game.render.spawnParticles('item',x,y+e.height/2,z,{item,count:8,spread:.1});
}
function thrownKind(kind:'snowball'|'egg'|'ender_pearl',effect:(game:Game,e:Entity,hit:Impact,ux:number,uy:number,uz:number)=>void):EntityKind{
  const icon:ItemStack=Object.freeze(stack(kind,1)) as ItemStack;
  const impact:HitHandler=(game,e,hit,ux,uy,uz)=>{
    if(hit.kind==='entity')nudge(game,e,hit.entity,hit.player,ux,uz);
    effect(game,e,hit,ux,uy,uz);
    game.entities.remove(e);return true;
  };
  return{kind,category:'projectile',width:.25,height:.25,maxHealth:1,render:'item',item:()=>icon,physics:'none',persist:false,pickable:false,
    init(e){cleanOwner(e.data);},
    tick(e,game){
      if(e.fire>0)e.fire--;
      fly(game,e,THROWN_PHYSICS,impact);
    }};
}
/** Egg hatching (ThrownEgg.onHit): 1/8 a baby chicken, 1/32 of those four. */
function hatch(game:Game,e:Entity,hit:Impact,ux:number,uy:number,uz:number){
  const p=impactPoint(hit,ux,uy,uz,.2,.35,game);
  if(game.random()<1/8){
    const n=game.random()<1/32?4:1;
    for(let i=0;i<n;i++)game.entities.spawn('chicken',p.x,p.y,p.z,{baby:true,reason:'egg',yaw:e.yaw});
  }
  breakParticles(game,e,'egg',p.x,p.y,p.z);
}
/** Ender pearl landing (ThrownEnderpearl.onHit): portal particles; the thrower is teleported with 5 fall damage. */
function teleport(game:Game,e:Entity,hit:Impact,ux:number,uy:number,uz:number){
  const hw=game.player.width/2,h=game.player.height,p=impactPoint(hit,ux,uy,uz,hw,h,game);
  game.render.spawnParticles('portal',p.x,p.y+1,p.z,{count:32,spread:.5});
  if(!isPlayerOwned(e)||game.survival.dead)return;
  game.player.teleport(p.x,p.y,p.z);
  game.sounds.play('teleport',at(p.x,p.y,p.z));
  game.survival.damage(5,{kind:'fall',projectile:e});
}

// ---- Registration --------------------------------------------------------------------------------------
export function projectileKinds():EntityKind[]{
  return[
    {kind:'arrow',category:'projectile',width:.5,height:.5,maxHealth:1,render:'model',model:arrowModel(),physics:'none',persist:false,pickable:false,
      init(e){cleanArrow(e.data);},tick:tickArrow,
      restoreData(data){cleanArrow(data);return data;}},
    thrownKind('snowball',(game,e,hit,ux,uy,uz)=>{const p=impactPoint(hit,ux,uy,uz,.125,.25,game);breakParticles(game,e,'snowball',p.x,p.y,p.z);}),
    thrownKind('egg',hatch),
    thrownKind('ender_pearl',teleport)
  ];
}
export function registerProjectiles(game:Game):void{for(const k of projectileKinds())game.entities.register(k);}
