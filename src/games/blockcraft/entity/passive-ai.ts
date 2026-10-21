// Shared animal behaviour for the passive mobs, modelled on the vanilla goal priorities (Java 1.20/1.21):
//   float (swim) | panic | breed | tempt | avoid (rabbits) | follow parent | custom (graze, raid) | stroll | look.
// One movement behaviour runs per tick; look-at-player and swimming run alongside it. Steering goes through
// game.entities.ai (navigate, lookAt, flee, stop); target choice and the cliff/lava guard are local and pure.
//
// Persistent state lives in entity.data (JSON-safe, saved): `growth` (vanilla Age: < 0 baby ticks to adulthood,
// > 0 breeding cool-down) and `love` (love-mode ticks). Transient state (targets, timers, animation) lives in a
// per-entity Brain kept in a WeakMap.
import {SOLID,isLava,isWater,blockId} from '../data/blocks';
import {itemDef} from '../data/items';
import type {DamageKind,DamageSource,Entity,Game,ItemId,ItemStack,SpawnReason} from '../engine/contracts';

/** Vanilla timings in ticks. */
export const LOVE_TICKS=600,BABY_TICKS=24000,BREED_COOLDOWN=6000,PANIC_TICKS=100,TEMPT_CALM=100;
/** Movement speeds in blocks/second (vanilla attribute × goal modifier, squared by the mob move control, at ground friction). */
export interface AnimalSpeeds{walk:number;panic:number;tempt:number;breed:number;follow:number}
/** Steady ground speed in blocks/second of a vanilla mob with movement attribute `attribute` under goal speed `modifier`. */
export const mobSpeed=(attribute:number,modifier:number)=>Math.round(.98*(attribute*modifier)**2*20/(1-.546)*100)/100;

export type Mode='idle'|'stroll'|'panic'|'breed'|'tempt'|'avoid'|'follow'|'custom';
export interface Brain{
  mode:Mode;
  /** Movement target cell for stroll and panic. */
  hasTarget:boolean;tx:number;ty:number;tz:number;targetTicks:number;stuck:number;
  panic:number;calm:number;partner:number;loveTime:number;parent:number;
  look:number;lookPlayer:boolean;lookX:number;lookY:number;lookZ:number;
  /** Point to run from (avoid), the threat (-1 the player, else an entity id, 0 none) and ticks to its next re-check. */
  fleeX:number;fleeZ:number;threat:number;avoidCheck:number;
  /** Sheep grazing timer (40..0), the vanilla eat animation tick. */
  eat:number;
  /** Rabbit hop: ticks into the current hop (0 = not hopping), landing delay, previous ground state, launch velocity. */
  hop:number;jumpDelay:number;wasOnGround:boolean;hopX:number;hopZ:number;
  /** Rabbit garden raid: crop target and search timer. */
  hasCrop:boolean;cropX:number;cropY:number;cropZ:number;raid:number;raidTicks:number;
  /** Chicken wing flap (vanilla flap, flapSpeed and their previous values). */
  flap:number;oFlap:number;flapSpeed:number;oFlapSpeed:number;flapping:number;
}
const BRAINS=new WeakMap<Entity,Brain>();
export function brainOf(e:Entity):Brain{
  let b=BRAINS.get(e);
  if(!b){
    b={mode:'idle',hasTarget:false,tx:0,ty:0,tz:0,targetTicks:0,stuck:0,panic:0,calm:0,partner:0,loveTime:0,parent:0,
      look:0,lookPlayer:false,lookX:0,lookY:0,lookZ:0,fleeX:0,fleeZ:0,threat:0,avoidCheck:0,eat:0,hop:0,jumpDelay:0,wasOnGround:true,hopX:0,hopZ:0,
      hasCrop:false,cropX:0,cropY:0,cropZ:0,raid:0,raidTicks:0,flap:0,oFlap:0,flapSpeed:0,oFlapSpeed:0,flapping:1};
    BRAINS.set(e,b);
  }
  return b;
}

export interface CustomBehaviour{
  /** True while the behaviour wants control this tick (may start it). */
  can(e:Entity,game:Game,b:Brain):boolean;
  run(e:Entity,game:Game,b:Brain):void;
  stop?(e:Entity,game:Game,b:Brain):void;
}
export interface AnimalConfig{
  kind:string;width:number;height:number;speeds:AnimalSpeeds;
  /** Breeding food; holding it tempts the animal. */
  isFood(id:ItemId):boolean;
  /** Babies walk after adults of their kind (vanilla FollowParentGoal; rabbits have none). */
  followParent:boolean;
  /** Looks at players within this many blocks (vanilla 6, rabbits 10). */
  lookRange:number;
  /** Breeding group check beyond the kind (cow variants). */
  sameGroup?(a:Entity,b:Entity):boolean;
  /** Data for a baby of two parents (wool colour, coat, variant). */
  offspring?(a:Entity,b:Entity,game:Game):Record<string,unknown>;
  /** Rabbits: run from players, wolves and monsters (between tempt and follow-parent). Returns true to flee from brain.fleeX/Z. */
  avoid?(e:Entity,game:Game,b:Brain):boolean;
  custom?:CustomBehaviour;
  /** Movement post-processing after steering and the cliff guard (rabbit hops). */
  move?(e:Entity,game:Game,b:Brain):void;
}

// ---- Persistent data ----------------------------------------------------------------------------
const isInt=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
export const growthOf=(e:Entity)=>isInt(e.data.growth,-BABY_TICKS,BREED_COOLDOWN)?e.data.growth:0;
export const loveOf=(e:Entity)=>isInt(e.data.love,0,LOVE_TICKS)?e.data.love:0;
/** Validated shared animal fields (growth, love) of untrusted saved data. */
export function restoreAnimalData(data:Record<string,unknown>,out:Record<string,unknown>):void{
  if(isInt(data.growth,-BABY_TICKS,BREED_COOLDOWN))out.growth=data.growth;
  if(isInt(data.love,0,LOVE_TICKS))out.love=data.love;
}
export function setBaby(e:Entity,baby:boolean,cfg:AnimalConfig):void{
  e.baby=baby;const f=baby?.5:1;e.width=cfg.width*f;e.height=cfg.height*f;
}
/** Kind init: growth and love defaults, 5% babies among natural spawns (vanilla group spawns), hitbox size. */
export function initAnimal(e:Entity,game:Game,reason:SpawnReason,cfg:AnimalConfig):void{
  if(!isInt(e.data.growth,-BABY_TICKS,BREED_COOLDOWN)){
    const naturalBaby=(reason==='natural'||reason==='chunk')&&game.random()<.05;
    e.data.growth=e.baby||naturalBaby?-BABY_TICKS:0;
  }
  if(!isInt(e.data.love,0,LOVE_TICKS))e.data.love=0;
  setBaby(e,(e.data.growth as number)<0,cfg);
}

// ---- Particles ----------------------------------------------------------------------------------
export function particlesAt(e:Entity,game:Game,kind:'heart'|'happy'|'angry',count:number):void{
  game.render.spawnParticles(kind,e.x,e.y+e.height+.3,e.z,{count,spread:Math.max(.2,e.width/2)});
}

// ---- Terrain checks (pure) -----------------------------------------------------------------------
const FIRE=blockId('fire'),CACTUS=blockId('cactus');
/** Blocks animals refuse to walk into or onto. */
export const harmful=(id:number)=>id===FIRE||id===CACTUS||isLava(id);
/** Can an animal `height` tall stand with its feet in cell (x,y,z)? Solid, harmless ground (or water when allowed) and free cells. */
export function standable(world:Game['world'],x:number,y:number,z:number,height:number,avoidWater=false):boolean{
  const below=world.get(x,y-1,z);
  if(below<0||harmful(below)||!SOLID[below]&&(avoidWater||!isWater(below)))return false;
  for(let i=0,n=Math.max(1,Math.ceil(height));i<n;i++){
    const id=world.get(x,y+i,z);
    if(id<0||SOLID[id]||harmful(id)||avoidWater&&isWater(id))return false;
  }
  return true;
}
/** Is the column at (x, z) dangerous to walk into from feet level fy: lava, fire or a cactus at or just above the feet, a
 *  drop of more than 3 blocks, or an unloaded cell? Water below counts as a safe landing. */
function columnDanger(world:Game['world'],x:number,fy:number,z:number):boolean{
  const feet=world.get(x,fy,z);
  if(feet<0||harmful(feet))return true;
  if(SOLID[feet])return harmful(world.get(x,fy+1,z));
  for(let d=1;d<=4;d++){
    const id=world.get(x,fy-d,z);
    if(id<0||harmful(id))return true;
    if(isWater(id)||SOLID[id])return false;
  }
  return true;
}
/** Would moving `distance` blocks in direction (dx,dz) take a mob of half width `halfWidth` at feet (x,y,z) over a drop of
 *  more than 3 blocks, into lava or fire, or against a cactus? Checks the column under its leading edge, then every half
 *  block up to `distance` beyond it (one step by default; rabbits check a whole hop). */
export function dangerAhead(world:Game['world'],x:number,y:number,z:number,dx:number,dz:number,halfWidth:number,distance=.45):boolean{
  const len=Math.hypot(dx,dz);if(len<1e-6)return false;
  const ux=dx/len,uz=dz/len,fy=Math.floor(y+.5),edge=halfWidth-1e-3;
  for(let d=0;;d=Math.min(distance,d+.5)){
    const r=edge+d;
    if(columnDanger(world,Math.floor(x+ux*r),fy,Math.floor(z+uz*r)))return true;
    if(d>=distance)return false;
  }
}

// ---- Steering helpers -----------------------------------------------------------------------------
const SCRATCH:Entity[]=[];
const dist2=(e:Entity,x:number,y:number,z:number)=>(e.x-x)**2+(e.y-y)**2+(e.z-z)**2;
/** Vanilla RandomPos: ten random standable cells within range; the best "walk target value" wins (grass 10, else light). */
export function pickTarget(e:Entity,game:Game,b:Brain,range:number,vertical:number,avoidWater:boolean):boolean{
  const w=game.world,fx=Math.floor(e.x),fy=Math.floor(e.y+.5),fz=Math.floor(e.z),grass=GRASS;
  let best=-Infinity;
  for(let attempt=0;attempt<10;attempt++){
    const x=fx+Math.floor(game.random()*(2*range+1))-range,z=fz+Math.floor(game.random()*(2*range+1))-range;
    for(let k=0;k<=2*vertical;k++){
      const y=fy+(k&1?(k+1)>>1:-(k>>1));
      if(!standable(w,x,y,z,e.height,avoidWater))continue;
      const value=w.get(x,y-1,z)===grass?10:w.brightnessAt(x,y,z)/15;
      if(value>best){best=value;b.tx=x;b.ty=y;b.tz=z;}
      break;
    }
  }
  b.hasTarget=best>-Infinity;b.targetTicks=0;b.stuck=0;
  return b.hasTarget;
}
const GRASS=blockId('grass_block');
function trackStuck(e:Entity,b:Brain){
  if(e.collidedH&&e.onGround&&Math.hypot(e.vx,e.vz)<.3)b.stuck++;else if(b.stuck>0)b.stuck--;
}
const arrived=(e:Entity,b:Brain,r:number)=>(e.x-(b.tx+.5))**2+(e.z-(b.tz+.5))**2<r*r;
const playerEye=(game:Game)=>game.player.state.y+game.player.eyeHeight();

// ---- Behaviours -----------------------------------------------------------------------------------
/** Damage kinds that make animals panic (vanilla panic_causes: attacks, projectiles, explosions, fire, lava, cacti, lightning).
 *  Falls, drowning and starving do not. */
export const PANIC_CAUSES:ReadonlySet<DamageKind>=new Set<DamageKind>(['player','mob','projectile','explosion','fire','lava','cactus','lightning']);
/** Kind `hurt` hook: panic for 5 seconds and lose love mode (vanilla Animal.hurt resets love). */
export function hurtAnimal(e:Entity,source:DamageSource):void{
  const b=brainOf(e);if(PANIC_CAUSES.has(source.kind))b.panic=PANIC_TICKS;
  e.data.love=0;b.eat=0;
}
function tempted(e:Entity,game:Game,cfg:AnimalConfig):boolean{
  if(game.survival.dead)return false;
  const p=game.player.state;
  if(dist2(e,p.x,p.y,p.z)>100)return false;
  const held=game.inventory.held(),off=game.inventory.offhand;
  return !!held&&cfg.isFood(held.id)||!!off&&cfg.isFood(off.id);
}
let filterSelf:Entity|null=null,filterCfg:AnimalConfig|null=null;
const partnerFilter=(o:Entity)=>o!==filterSelf&&o.kind===filterCfg!.kind&&!o.removed&&o.deathTime===0&&loveOf(o)>0&&growthOf(o)===0&&
  (filterCfg!.sameGroup?.(filterSelf!,o)??true);
const adultFilter=(o:Entity)=>o!==filterSelf&&o.kind===filterCfg!.kind&&!o.removed&&o.deathTime===0&&!o.baby&&(filterCfg!.sameGroup?.(filterSelf!,o)??true);
function nearest(e:Entity,list:Entity[]):Entity|null{
  let best:Entity|null=null,bd=Infinity;
  for(const o of list){const d=dist2(e,o.x,o.y,o.z);if(d<bd){bd=d;best=o;}}
  return best;
}
function findPartner(e:Entity,game:Game,cfg:AnimalConfig,b:Brain):Entity|null{
  if(b.partner){
    const p=game.entities.byId(b.partner);
    filterSelf=e;filterCfg=cfg;
    if(p&&partnerFilter(p)&&dist2(e,p.x,p.y,p.z)<=100)return p;
    b.partner=0;
  }
  filterSelf=e;filterCfg=cfg;
  const p=nearest(e,game.entities.near(e.x,e.y,e.z,8,partnerFilter,SCRATCH));
  b.partner=p?.id??0;SCRATCH.length=0;
  return p;
}
function findParent(e:Entity,game:Game,cfg:AnimalConfig,b:Brain):Entity|null{
  if(b.mode==='follow'&&b.parent){
    const p=game.entities.byId(b.parent);
    if(p&&!p.removed&&p.deathTime===0&&!p.baby){const d=dist2(e,p.x,p.y,p.z);if(d>=9&&d<=256)return p;}
    b.parent=0;return null;
  }
  if((e.age+e.id)%10!==0)return null;
  filterSelf=e;filterCfg=cfg;
  const list=game.entities.near(e.x,e.y,e.z,8,adultFilter,SCRATCH);
  let best:Entity|null=null,bd=Infinity;
  for(const o of list){if(Math.abs(o.y-e.y)>4)continue;const d=dist2(e,o.x,o.y,o.z);if(d<bd){bd=d;best=o;}}
  SCRATCH.length=0;
  if(!best||bd<9)return null;
  b.parent=best.id;return best;
}
/** Breeds two animals in love: baby at the first parent, 5-minute cool-down for both, hearts, 1-7 xp and `animalBred`. */
export function breed(a:Entity,p:Entity,game:Game,cfg:AnimalConfig):Entity|null{
  const data=cfg.offspring?.(a,p,game)??{};
  const baby=game.entities.spawn(cfg.kind,a.x,a.y,a.z,{baby:true,reason:'breed',data,yaw:game.random()*Math.PI*2});
  for(const parent of [a,p]){parent.data.growth=BREED_COOLDOWN;parent.data.love=0;const pb=brainOf(parent);pb.loveTime=0;pb.partner=0;}
  particlesAt(a,game,'heart',7);
  game.entities.dropXp(1+Math.floor(game.random()*7),a.x,a.y,a.z);
  game.events.emit('animalBred',{kind:cfg.kind,x:a.x,y:a.y,z:a.z});
  return baby;
}

/** Right click with the breeding food: love mode for an idle adult, a 10% growth boost for a baby. Consumes one. */
export function feedAnimal(e:Entity,game:Game,cfg:AnimalConfig,held:ItemStack|null):boolean{
  if(!held||!cfg.isFood(held.id))return false;
  const growth=growthOf(e);
  if(growth===0&&loveOf(e)<=0){
    game.inventory.consumeHeld(1);e.data.love=LOVE_TICKS;particlesAt(e,game,'heart',7);return true;
  }
  if(growth<0){
    game.inventory.consumeHeld(1);
    const seconds=Math.floor(Math.floor(-growth/20)*.1);
    ageUp(e,seconds,cfg);particlesAt(e,game,'happy',7);return true;
  }
  return false;
}
/** Vanilla ageUp: moves a baby `seconds` closer to adulthood. */
export function ageUp(e:Entity,seconds:number,cfg:AnimalConfig):void{
  const growth=growthOf(e);if(growth>=0)return;
  const next=Math.min(0,growth+seconds*20);e.data.growth=next;
  if(next===0)setBaby(e,false,cfg);
}
/** A spawn egg of this kind used on the animal spawns a baby next to it (vanilla offspring from spawn eggs). */
export function spawnEggOnAnimal(e:Entity,game:Game,cfg:AnimalConfig,held:ItemStack|null):boolean{
  if(!held||itemDef(held.id)?.spawns!==cfg.kind)return false;
  const baby=game.entities.spawn(cfg.kind,e.x,e.y,e.z,{baby:true,reason:'egg',data:cfg.offspring?.(e,e,game)??{},yaw:game.random()*Math.PI*2});
  if(!baby)return false;
  game.inventory.consumeHeld(1);return true;
}

function ageing(e:Entity,game:Game,cfg:AnimalConfig):void{
  let growth=growthOf(e);
  // Someone else grew the baby up (the entity service's own baby timer): adopt it.
  if(growth<0&&!e.baby){growth=0;e.data.growth=0;setBaby(e,false,cfg);}
  if(growth<0){e.data.growth=growth+1;if(growth+1===0)setBaby(e,false,cfg);}
  else if(growth>0)e.data.growth=growth-1;
  const love=loveOf(e);
  if(love>0){
    if(growth!==0)e.data.love=0;
    else{e.data.love=love-1;if((love-1)%10===0&&love>1)particlesAt(e,game,'heart',1);}
  }
}

function choose(e:Entity,game:Game,cfg:AnimalConfig,b:Brain):Mode{
  if(b.panic>0)b.panic--;
  if(b.panic>0||e.fire>0)return 'panic';
  if(loveOf(e)>0&&growthOf(e)===0&&findPartner(e,game,cfg,b))return 'breed';
  if(b.calm>0)b.calm--;
  if(b.calm===0&&tempted(e,game,cfg))return 'tempt';
  if(cfg.avoid?.(e,game,b))return 'avoid';
  if(cfg.followParent&&e.baby&&findParent(e,game,cfg,b))return 'follow';
  if(cfg.custom?.can(e,game,b))return 'custom';
  if(b.mode==='stroll'&&b.hasTarget)return 'stroll';
  // Vanilla WaterAvoidingRandomStrollGoal: interval 120 ticks.
  return game.random()<1/120||e.inWater?'stroll':'idle';
}
function leave(e:Entity,game:Game,cfg:AnimalConfig,b:Brain,mode:Mode){
  if(mode==='tempt')b.calm=TEMPT_CALM;
  else if(mode==='breed'){b.loveTime=0;b.partner=0;}
  else if(mode==='custom')cfg.custom?.stop?.(e,game,b);
  b.hasTarget=false;b.targetTicks=0;b.stuck=0;
}

function runPanic(e:Entity,game:Game,cfg:AnimalConfig,b:Brain){
  if(!b.hasTarget||arrived(e,b,1)||b.stuck>20||++b.targetTicks>100)panicTarget(e,game,b);
  game.entities.ai.navigate(e,b.tx+.5,b.ty,b.tz+.5,cfg.speeds.panic);
  trackStuck(e,b);
}
/** Burning animals run for water within 5 blocks (vanilla PanicGoal.lookForWater), others to a random spot within 5. */
function panicTarget(e:Entity,game:Game,b:Brain){
  b.targetTicks=0;b.stuck=0;
  if(e.fire>0&&!e.inWater){
    const w=game.world,fx=Math.floor(e.x),fy=Math.floor(e.y+.5),fz=Math.floor(e.z);let bd=Infinity;
    for(let dy=-1;dy<=1;dy++)for(let dz=-5;dz<=5;dz++)for(let dx=-5;dx<=5;dx++){
      if(!isWater(w.get(fx+dx,fy+dy,fz+dz)))continue;
      const d=dx*dx+dy*dy+dz*dz;if(d<bd){bd=d;b.tx=fx+dx;b.ty=fy+dy;b.tz=fz+dz;}
    }
    if(bd<Infinity){b.hasTarget=true;return;}
  }
  if(pickTarget(e,game,b,5,4,false))return;
  const a=game.random()*Math.PI*2;
  b.tx=Math.floor(e.x+Math.cos(a)*5);b.ty=Math.floor(e.y+.5);b.tz=Math.floor(e.z+Math.sin(a)*5);b.hasTarget=true;
}
function runStroll(e:Entity,game:Game,cfg:AnimalConfig,b:Brain){
  if(!b.hasTarget&&!pickTarget(e,game,b,e.inWater?15:10,7,true))return;
  if(arrived(e,b,1)||b.stuck>40||++b.targetTicks>400){b.hasTarget=false;game.entities.ai.stop(e);return;}
  game.entities.ai.navigate(e,b.tx+.5,b.ty,b.tz+.5,cfg.speeds.walk);
  trackStuck(e,b);
}
function runBreed(e:Entity,game:Game,cfg:AnimalConfig,b:Brain){
  const p=game.entities.byId(b.partner);if(!p)return;
  const ai=game.entities.ai;
  ai.navigate(e,p.x,p.y,p.z,cfg.speeds.breed);ai.lookAt(e,p.x,p.y+p.height*.85,p.z);
  b.loveTime++;
  if(b.loveTime>=60){
    if(dist2(e,p.x,p.y,p.z)<9)breed(e,p,game,cfg);
    else b.loveTime=0;
  }
}
/** Vanilla TemptGoal: walk to the player, stop within 2.5 blocks, keep looking at them. */
function runTempt(e:Entity,game:Game,cfg:AnimalConfig){
  const p=game.player.state,ai=game.entities.ai;
  if(dist2(e,p.x,p.y,p.z)<6.25)ai.stop(e);
  else ai.navigate(e,p.x,p.y,p.z,cfg.speeds.tempt);
  ai.lookAt(e,p.x,playerEye(game),p.z);
}
function runFollow(e:Entity,game:Game,cfg:AnimalConfig,b:Brain){
  const p=game.entities.byId(b.parent);if(!p)return;
  game.entities.ai.navigate(e,p.x,p.y,p.z,cfg.speeds.follow);
}

/** Vanilla LookAtPlayerGoal (2% per tick, 2-4 s) and RandomLookAroundGoal (idle only, 1-2 s). */
function look(e:Entity,game:Game,cfg:AnimalConfig,b:Brain,mode:Mode){
  if(mode==='panic'||mode==='tempt'||mode==='breed'||mode==='custom'){b.look=0;return;}
  const p=game.player.state,ai=game.entities.ai,range2=cfg.lookRange*cfg.lookRange;
  if(b.look>0){
    b.look--;
    if(b.lookPlayer){if(game.survival.dead||dist2(e,p.x,p.y,p.z)>range2)b.look=0;else ai.lookAt(e,p.x,playerEye(game),p.z);}
    else if(mode==='idle')ai.lookAt(e,b.lookX,b.lookY,b.lookZ);
    else b.look=0;
    return;
  }
  if(game.random()>=.02)return;
  if(!game.survival.dead&&dist2(e,p.x,p.y,p.z)<=range2){b.lookPlayer=true;b.look=40+Math.floor(game.random()*40);}
  else if(mode==='idle'){
    const a=game.random()*Math.PI*2;
    b.lookPlayer=false;b.look=20+Math.floor(game.random()*20);
    b.lookX=e.x-Math.sin(a)*2;b.lookY=e.y+e.height*.85;b.lookZ=e.z-Math.cos(a)*2;
  }
}

/** One AI tick for a passive animal: growth and love timers, one movement behaviour, look, swim, cliff guard, hops. */
export function tickAnimal(e:Entity,game:Game,cfg:AnimalConfig):void{
  if(e.deathTime>0||e.removed)return;
  const b=brainOf(e),ai=game.entities.ai;
  ageing(e,game,cfg);
  const mode=choose(e,game,cfg,b);
  if(mode!==b.mode){const prev=b.mode;b.mode=mode;leave(e,game,cfg,b,prev);ai.stop(e);}
  switch(mode){
    case 'panic':runPanic(e,game,cfg,b);break;
    case 'breed':runBreed(e,game,cfg,b);break;
    case 'tempt':runTempt(e,game,cfg);break;
    case 'avoid':ai.flee(e,b.fleeX,b.fleeZ,cfg.speeds.panic);break;
    case 'follow':runFollow(e,game,cfg,b);break;
    case 'custom':cfg.custom!.run(e,game,b);break;
    case 'stroll':runStroll(e,game,cfg,b);break;
    default:break;
  }
  look(e,game,cfg,b,mode);
  // Vanilla FloatGoal: jump (swim up) 80% of ticks in water or lava; grazing sheep hold still.
  if((e.inWater||e.inLava)&&b.eat<=0&&game.random()<.8)e.jump=true;
  // Cliff, lava, fire and cactus guard: stop dead at the edge (also cancelling the run-up, which would slide it over).
  if(e.onGround&&!e.inWater&&(e.moveX||e.moveZ)&&dangerAhead(game.world,e.x,e.y,e.z,e.moveX,e.moveZ,e.width/2)){
    ai.stop(e);e.vx=0;e.vz=0;b.hasTarget=false;
  }
  cfg.move?.(e,game,b);
}
