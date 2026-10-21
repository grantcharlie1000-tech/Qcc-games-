// The wolf, after vanilla Java 1.20.5/1.21 (Wolf, TamableAnimal, NeutralMob and their goals):
//  - Wild: 8 health, strolls, neutral. A hit (by the player or a mob) makes it angry at the attacker for 20-39 s and alerts
//    every wild wolf without a target within 16 blocks (HurtByTargetGoal.setAlertOthers); angry wild wolves show red eyes
//    and hunt the player down again when they see them. Wild wolves also hunt sheep and rabbits, and every wolf attacks
//    skeletons and strays (1 in 10 per tick looks for a visible one within 16 blocks).
//  - Taming: a bone (not when angry) tames with chance 1/3 (hearts, `entityTamed`, the wolf sits down, 40 health, red
//    collar), else smoke. The owner is stored in data.owner ('player').
//  - Tamed: follows the owner when 10+ blocks away until within 2, teleporting next to them (a safe dry cell 2-3 blocks
//    off, never onto leaves) when 12+ blocks away; right click (anything it does not use) toggles sitting; attacks what
//    hurts the owner and what the owner hits (never creepers or the owner's wolves); meat heals 2 × its food value;
//    dyes recolour the collar; tail height shows health; whines below half health; a hit makes it stand up.
//  - Breeding: meat at full health puts tamed wolves in love (wild ones too, but they cannot mate); two tamed wolves in love
//    within 8 blocks meet and after 3 s have a tamed puppy (parents rest 5 minutes, 1-7 experience, `animalBred`).
//    Puppies grow up in 20 minutes; meat speeds that by 10%.
//  - Melee: 4 damage every second, a 0.4 blocks/tick leap from 2-4 blocks. A tamed wolf's kills count as the owner's.
//  - Wet wolves shake themselves dry (2 s, splashes) once on dry ground; panics on fire, lava, cacti and lightning.
//  - Sounds: bark, pant, growl (angry), whine (tamed, hurt) at vanilla volume 0.4, plus the shake.
// Persistent state is in entity.data (variant, owner, sitting, collar, growth, love, anger, angerAt); transient AI state
// lives in a per-entity brain.
import {AIR,COLLISION_BOXES,SOLID,WOOL_COLOURS,blockDef,isLava,isWater} from '../data/blocks';
import {biomeDef} from '../data/biomes';
import {itemDef} from '../data/items';
import {boxCollides} from '../engine/physics';
import type {DamageKind,DamageSource,Entity,EntityKind,Game,ItemStack,SpawnReason,Vec3} from '../engine/contracts';
import {WOLF_VARIANTS,wolfModel,type WolfLook,type WolfVariant} from './companions-art';

// ---- Vanilla numbers ---------------------------------------------------------------------------------
export const WOLF_WIDTH=.6,WOLF_HEIGHT=.85,WILD_HEALTH=8,TAME_HEALTH=40,WOLF_DAMAGE=4;
/** Wolves track targets up to this far (FOLLOW_RANGE attribute) and alert pack mates this far around. */
export const FOLLOW_RANGE=16;
/** FollowOwnerGoal(1.0, start 10, stop 2) and the 12-block teleport. */
export const FOLLOW_START=10,FOLLOW_STOP=2,TELEPORT_DISTANCE=12;
export const TAME_CHANCE=1/3;
export const LOVE_TICKS=600,BABY_TICKS=24000,BREED_COOLDOWN=6000,BREED_TICKS=60,PARTNER_RANGE=8;
/** NeutralMob anger: 20 to 39 seconds. */
export const ANGER_MIN=400,ANGER_MAX=780;
export const ATTACK_INTERVAL=20,KNOCKBACK=8;
/** 1.20.5 melee reach around the attacker's box (√2.04 − 0.6). */
export const MELEE_REACH=Math.sqrt(2.04)-.6;
/** Ground speed in blocks/second of a vanilla mob with movement attribute `attribute` under goal speed `modifier`
 *  (acceleration 0.98 × (attribute × modifier)² per tick against ground friction 0.546). */
export const mobSpeed=(attribute:number,modifier:number)=>.98*(attribute*modifier)**2*20/(1-.6*.91);
export const WOLF_SPEED=mobSpeed(.3,1),PANIC_SPEED=mobSpeed(.3,1.5);
/** #minecraft:meat, the wolf food tag. */
export const WOLF_FOOD:ReadonlySet<string>=new Set(['beef','cooked_beef','porkchop','cooked_porkchop','chicken','cooked_chicken','mutton','cooked_mutton',
  'rabbit','cooked_rabbit','rotten_flesh']);
/** Damage that sends a wolf running (vanilla #panic_environmental_causes). */
export const PANIC_CAUSES:ReadonlySet<DamageKind>=new Set<DamageKind>(['fire','lava','cactus','lightning']);
const PREY=new Set(['sheep','rabbit']),SKELETONS=new Set(['skeleton','stray']);
/** Target goal priorities (lower wins): owner hurt by, owner hurt, revenge, angry at the player, prey, skeletons. */
export const PRIORITY={ownerHurtBy:1,ownerHurt:2,revenge:3,angryPlayer:4,prey:5,skeleton:7} as const;
const LEAP_SPEED=8,LEAP_UP=8;

// ---- Persistent data ---------------------------------------------------------------------------------
export interface WolfData{
  variant:WolfVariant;
  /** 'player' when tamed. */
  owner?:'player';
  /** Ordered to sit (tamed only). */
  sitting?:boolean;
  /** Collar dye colour (tamed only). */
  collar?:typeof WOOL_COLOURS[number];
  /** Vanilla Age: < 0 baby ticks to adulthood, > 0 breeding cool-down. */
  growth:number;
  /** Love-mode ticks left. */
  love:number;
  /** NeutralMob anger ticks left (red eyes, raised tail). */
  anger:number;
  /** Persistent anger target: the player. */
  angerAt?:'player';
}
const isInt=(v:unknown,min:number,max:number):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=min&&v<=max;
const isColour=(v:unknown):v is typeof WOOL_COLOURS[number]=>(WOOL_COLOURS as readonly unknown[]).includes(v);
const isVariant=(v:unknown):v is WolfVariant=>(WOLF_VARIANTS as readonly unknown[]).includes(v);
const data=(e:Entity)=>e.data as unknown as WolfData;
export const isTame=(e:Entity)=>e.kind==='wolf'&&e.data.owner==='player';
export const growthOf=(e:Entity)=>isInt(e.data.growth,-BABY_TICKS,BREED_COOLDOWN)?e.data.growth:0;
export const loveOf=(e:Entity)=>isInt(e.data.love,0,LOVE_TICKS)?e.data.love:0;
export const angerOf=(e:Entity)=>isInt(e.data.anger,0,ANGER_MAX)?e.data.anger:0;
export const isSitting=(e:Entity)=>isTame(e)&&e.data.sitting===true;
/** Validated wolf data of an untrusted save. */
export function restoreWolfData(raw:Record<string,unknown>):Record<string,unknown>{
  const out:Record<string,unknown>={variant:isVariant(raw.variant)?raw.variant:'pale'};
  if(isInt(raw.growth,-BABY_TICKS,BREED_COOLDOWN))out.growth=raw.growth;
  if(isInt(raw.love,0,LOVE_TICKS))out.love=raw.love;
  if(isInt(raw.anger,0,ANGER_MAX))out.anger=raw.anger;
  if(raw.angerAt==='player')out.angerAt='player';
  if(raw.owner==='player'){out.owner='player';out.sitting=raw.sitting===true;out.collar=isColour(raw.collar)?raw.collar:'red';}
  return out;
}
/** Vanilla 1.20.5 spawn variants: woods in forests, ashen in snowy taigas, pale anywhere else. */
export function variantForBiome(name:string):WolfVariant{return name==='forest'?'woods':name==='snowy_taiga'?'ashen':'pale';}
/** Vanilla getTailAngle: raised when angry, lower the more a tamed wolf is hurt, else 36°. */
export function tailAngle(e:Entity):number{
  if(angerOf(e)>0)return 1.5393804;
  if(isTame(e)){const max=e.maxHealth>0?e.maxHealth:TAME_HEALTH;return(.55-(max-Math.max(0,e.health))/max*.4)*Math.PI;}
  return Math.PI/5;
}

// ---- Brain (transient) --------------------------------------------------------------------------------
export interface WolfBrain{
  /** Attack target: an entity, or the player (targetPlayer). */
  target:Entity|null;targetPlayer:boolean;priority:number;unseen:number;
  /** Anger target key: -1 the player, an entity id, 0 none. */
  angerKey:number;
  cooldown:number;leap:number;
  panic:number;panicX:number;panicZ:number;
  ambient:number;
  /** Idle look: ticks left, 1 at the player / 2 at a random point. */
  look:number;lookMode:number;lookX:number;lookY:number;lookZ:number;
  /** Begging (BegGoal): ticks left and the head tilt (interestedAngle) now and one tick ago. */
  beg:number;interest:number;interestO:number;
  following:boolean;recalc:number;
  wet:boolean;shaking:boolean;shake:number;shakeO:number;
  partner:number;loveTime:number;
  /** Fed-baby sparkle ticks (vanilla forcedAgeTimer). */
  happy:number;
  /** Drawn sitting this tick (ordered to sit, on the ground, out of water). */
  sitPose:boolean;
}
const BRAINS=new WeakMap<Entity,WolfBrain>();
export function wolfBrain(e:Entity):WolfBrain{
  let b=BRAINS.get(e);
  if(!b){
    b={target:null,targetPlayer:false,priority:99,unseen:0,angerKey:e.data.angerAt==='player'&&angerOf(e)>0?-1:0,cooldown:0,leap:0,
      panic:0,panicX:0,panicZ:0,ambient:-80,look:0,lookMode:0,lookX:0,lookY:0,lookZ:0,beg:0,interest:0,interestO:0,following:false,recalc:0,
      wet:false,shaking:false,shake:0,shakeO:0,partner:0,loveTime:0,happy:0,sitPose:isSitting(e)};
    BRAINS.set(e,b);
  }
  return b;
}
const hasTarget=(b:WolfBrain)=>b.targetPlayer||!!b.target;

// ---- Small helpers -------------------------------------------------------------------------------------
const between=(game:Game,min:number,max:number)=>min+Math.floor(game.random()*(max-min+1));
const voice=(game:Game,e:Entity)=>(game.random()-game.random())*.2+(e.baby?1.5:1);
const centre=(e:Entity):Vec3=>({x:e.x,y:e.y+e.height/2,z:e.z});
function particles(game:Game,e:Entity,kind:'heart'|'smoke'|'happy',count:number){
  game.render.spawnParticles(kind,e.x,e.y+e.height/2+.5,e.z,{count,spread:Math.max(.3,e.width)});
}
export function setBaby(e:Entity,baby:boolean){e.baby=baby;const k=baby?.5:1;e.width=WOLF_WIDTH*k;e.height=WOLF_HEIGHT*k;}
const SCRATCH:Entity[]=[];
/** Hostile to this target when the owner fights it (vanilla Wolf.wantsToAttack): never creepers or the owner's wolves. */
export function wantsToAttack(target:Entity):boolean{
  if(target.removed||target.deathTime>0||target.kind==='creeper')return false;
  if(target.kind==='wolf'&&isTame(target))return false;
  return target.category==='passive'||target.category==='hostile'||target.category==='water';
}
function playerTargetable(game:Game){return !game.survival.dead&&game.settings.mode==='survival';}

// ---- Targets and anger ----------------------------------------------------------------------------------
function stopBeingAngry(e:Entity,b:WolfBrain){
  const d=data(e);d.anger=0;delete d.angerAt;b.angerKey=0;clearTarget(b);
}
function clearTarget(b:WolfBrain){b.target=null;b.targetPlayer=false;b.priority=99;b.unseen=0;b.leap=0;}
/** Sets an attack target if no target of a higher priority is being chased; starts a new anger timer for a new target. */
export function setTarget(e:Entity,game:Game,target:Entity|'player',priority:number):boolean{
  const b=wolfBrain(e),d=data(e);
  if(e.removed||e.deathTime>0)return false;
  if(hasTarget(b)&&priority>b.priority)return false;
  if(target==='player'){if(isTame(e)||!playerTargetable(game))return false;b.target=null;b.targetPlayer=true;}
  else{if(target===e||target.removed||target.deathTime>0||target.kind==='creeper')return false;b.target=target;b.targetPlayer=false;}
  b.priority=priority;b.unseen=0;b.following=false;
  const key=target==='player'?-1:target.id;
  if(b.angerKey!==key){
    b.angerKey=key;d.anger=between(game,ANGER_MIN,ANGER_MAX);
    if(key===-1)d.angerAt='player';else delete d.angerAt;
  }
  return true;
}
/** The attacker behind a damage source: the hitting entity, or the player for player hits, arrows and TNT. */
export function attackerOf(e:Entity,source:DamageSource):Entity|'player'|null{
  const a=source.attacker;
  if(a&&a!==e&&!a.removed)return a;
  if(source.kind==='player'||source.byPlayer)return 'player';
  return null;
}
/** HurtByTargetGoal with alertOthers: revenge on the attacker, and wolves of the same owner (wild ones: other wild wolves)
 *  without a target within 16 blocks (10 up and down) join in. */
function revenge(e:Entity,game:Game,attacker:Entity|'player'){
  if(attacker==='player'){if(isTame(e)||!playerTargetable(game))return;}
  else if(attacker.kind==='creeper'||isTame(e)&&attacker.kind==='wolf'&&isTame(attacker))return;
  if(!setTarget(e,game,attacker,PRIORITY.revenge))return;
  const tame=isTame(e);
  game.entities.near(e.x,e.y,e.z,FOLLOW_RANGE*1.5,undefined,SCRATCH);
  for(let i=0;i<SCRATCH.length;i++){
    const o=SCRATCH[i];
    if(o===e||o.kind!=='wolf'||o.deathTime>0||isTame(o)!==tame||isSitting(o)||o===attacker)continue;
    if(Math.abs(o.x-e.x)>FOLLOW_RANGE+.5||Math.abs(o.z-e.z)>FOLLOW_RANGE+.5||Math.abs(o.y-e.y)>10)continue;
    if(hasTarget(wolfBrain(o)))continue;
    setTarget(o,game,attacker,PRIORITY.revenge);
  }
  SCRATCH.length=0;
}
/** Drops a target that died, left the follow range, is the owner, or (for the player, when it must be seen) stayed out of
 *  sight for 3 seconds. Then vanilla NeutralMob.updatePersistentAnger. */
function maintainTargets(e:Entity,game:Game,b:WolfBrain){
  const d=data(e);
  if(b.targetPlayer){
    const p=game.player.state;
    if(isTame(e)||!playerTargetable(game)||(p.x-e.x)**2+(p.y-e.y)**2+(p.z-e.z)**2>FOLLOW_RANGE*FOLLOW_RANGE)clearTarget(b);
    else if(!game.entities.ai.canSee(e,p.x,p.y+game.player.eyeHeight(),p.z)){if(++b.unseen>60)clearTarget(b);}
    else b.unseen=0;
  }else if(b.target){
    const t=b.target;
    if(t.removed||t.deathTime>0||t.health<=0||(t.x-e.x)**2+(t.y-e.y)**2+(t.z-e.z)**2>FOLLOW_RANGE*FOLLOW_RANGE||isTame(e)&&!wantsToAttack(t))clearTarget(b);
  }
  if(!hasTarget(b)&&b.angerKey>0){stopBeingAngry(e,b);return;}
  if(d.anger>0&&!b.targetPlayer){d.anger--;if(d.anger===0)stopBeingAngry(e,b);}
}
let filterWolf:Entity|null=null,filterKinds:ReadonlySet<string>=PREY;
const huntFilter=(o:Entity)=>filterKinds.has(o.kind)&&o.deathTime===0&&Math.abs(o.x-filterWolf!.x)<=FOLLOW_RANGE&&Math.abs(o.z-filterWolf!.z)<=FOLLOW_RANGE&&
  Math.abs(o.y-filterWolf!.y)<=4;
/** NearestAttackableTargetGoal: the nearest visible mob of `kinds` in the 16×4×16 search box. */
function nearestVisible(e:Entity,game:Game,kinds:ReadonlySet<string>):Entity|null{
  filterWolf=e;filterKinds=kinds;
  game.entities.near(e.x,e.y,e.z,FOLLOW_RANGE*1.5,huntFilter,SCRATCH);
  let best:Entity|null=null,bd=Infinity;
  for(let i=0;i<SCRATCH.length;i++){
    const o=SCRATCH[i],dd=(o.x-e.x)**2+(o.y-e.y)**2+(o.z-e.z)**2;
    if(dd<bd&&dd<=FOLLOW_RANGE*FOLLOW_RANGE&&game.entities.ai.canSee(e,o.x,o.y+o.height*.85,o.z)){bd=dd;best=o;}
  }
  SCRATCH.length=0;filterWolf=null;
  return best;
}
/** Target goals that look for something when idle (each 1 in 10 per tick, vanilla randomInterval 10). */
function findTarget(e:Entity,game:Game,b:WolfBrain){
  const d=data(e),tame=isTame(e);
  if(!tame){
    if(d.angerAt==='player'&&d.anger>0&&game.random()<.1&&playerTargetable(game)){
      const p=game.player.state;
      if((p.x-e.x)**2+(p.y-e.y)**2+(p.z-e.z)**2<=FOLLOW_RANGE*FOLLOW_RANGE&&game.entities.ai.canSee(e,p.x,p.y+game.player.eyeHeight(),p.z)){
        setTarget(e,game,'player',PRIORITY.angryPlayer);return;
      }
    }
    if(game.random()<.1){const prey=nearestVisible(e,game,PREY);if(prey){setTarget(e,game,prey,PRIORITY.prey);return;}}
  }
  if(game.random()<.1){const s=nearestVisible(e,game,SKELETONS);if(s)setTarget(e,game,s,PRIORITY.skeleton);}
}

// ---- Owner -------------------------------------------------------------------------------------------
/** OwnerHurtByTargetGoal / OwnerHurtTargetGoal for every tamed wolf that is not sitting. */
export function defendOwner(game:Game,target:Entity,priority:number):void{
  if(!wantsToAttack(target)||target.health<=0)return;
  const list=game.entities.all();
  for(let i=0;i<list.length;i++){
    const w=list[i];
    if(w.kind!=='wolf'||w.removed||w.deathTime>0||w===target||!isTame(w)||isSitting(w))continue;
    if((target.x-w.x)**2+(target.y-w.y)**2+(target.z-w.z)**2>FOLLOW_RANGE*FOLLOW_RANGE)continue;
    setTarget(w,game,target,priority);
  }
}
/** Can a wolf (box `width` × `height`) be teleported with its feet in cell (x, y, z)? Vanilla canTeleportTo: a walkable cell
 *  (solid floor that is not leaves, lava, fire, a cactus or magma; the cell and the one above free of liquid and danger) and
 *  no collision for the box. */
export function canTeleportTo(game:Game,x:number,y:number,z:number,width:number,height:number):boolean{
  const w=game.world,below=w.get(x,y-1,z);
  if(below<=0||!SOLID[below])return false;
  const fam=blockDef(below).family;
  if(fam.endsWith('_leaves')||fam==='cactus'||fam==='magma_block'||isLava(below))return false;
  for(let dy=0;dy<2;dy++){
    const id=w.get(x,y+dy,z);
    if(id<0||id!==AIR&&(SOLID[id]||isWater(id)||isLava(id)||blockDef(id).family==='fire'||blockDef(id).family==='cactus'))return false;
  }
  // The floor may be lower than a full block (slabs): stand on its surface.
  const hw=width/2,cx=x+.5,cz=z+.5,fy=y-1+topOf(below);
  return !boxCollides(w,cx-hw,fy+1e-3,cz-hw,cx+hw,fy+height,cz+hw);
}
function topOf(id:number){let top=0;const b=COLLISION_BOXES[id];for(let i=4;i<b.length;i+=6)top=Math.max(top,b[i]);return top;}
/** Vanilla tryToTeleportToOwner: ten tries at a random cell 2-3 blocks (±1 up/down) around the owner. */
export function teleportToOwner(e:Entity,game:Game):boolean{
  const p=game.player.state,px=Math.floor(p.x),py=Math.floor(p.y+1e-3),pz=Math.floor(p.z);
  for(let i=0;i<10;i++){
    const dx=between(game,-3,3),dz=between(game,-3,3);
    if(Math.abs(dx)<2&&Math.abs(dz)<2)continue;
    const dy=between(game,-1,1),x=px+dx,y=py+dy,z=pz+dz;
    if(!canTeleportTo(game,x,y,z,e.width,e.height))continue;
    e.x=x+.5;e.y=y-1+topOf(game.world.get(x,y-1,z));e.z=z+.5;e.vx=e.vy=e.vz=0;
    game.entities.ai.stop(e);
    return true;
  }
  return false;
}

// ---- Interaction ----------------------------------------------------------------------------------------
/** Taming roll (vanilla tryToTame): 1 in 3 per bone. */
export function tame(e:Entity,game:Game){
  const d=data(e),b=wolfBrain(e);
  d.owner='player';d.sitting=true;d.collar='red';d.anger=0;delete d.angerAt;
  b.angerKey=0;clearTarget(b);b.following=false;
  e.maxHealth=TAME_HEALTH;e.health=TAME_HEALTH;
  game.entities.ai.stop(e);
  particles(game,e,'heart',7);
  game.events.emit('entityTamed',{entity:e});
}
const consume=(game:Game)=>game.inventory.consumeHeld(1);
/** Animal.mobInteract: food puts an adult in love or speeds a baby's growth by 10%. */
function feedAnimal(e:Entity,game:Game,held:ItemStack|null):boolean{
  if(!held||!WOLF_FOOD.has(held.id))return false;
  const d=data(e),g=growthOf(e);
  if(g===0&&loveOf(e)<=0){consume(game);d.love=LOVE_TICKS;particles(game,e,'heart',7);return true;}
  if(g<0){
    consume(game);
    d.growth=Math.min(0,g+Math.floor(Math.floor(-g/20)*.1)*20);
    wolfBrain(e).happy=40;
    if(d.growth===0)setBaby(e,false);
    return true;
  }
  return false;
}
export function interactWolf(e:Entity,game:Game,held:ItemStack|null):boolean{
  if(e.removed||e.deathTime>0)return false;
  const d=data(e),b=wolfBrain(e),id=held?.id;
  if(isTame(e)){
    const food=id&&WOLF_FOOD.has(id)?itemDef(id)?.food:undefined;
    if(food&&e.health<e.maxHealth){
      e.health=Math.min(e.maxHealth,e.health+2*food.hunger);
      consume(game);game.sounds.play('eat',centre(e),{pitch:voice(game,e)});
      return true;
    }
    if(id&&id.endsWith('_dye')){
      const colour=id.slice(0,-4);
      if(isColour(colour)&&colour!==d.collar){d.collar=colour;consume(game);return true;}
      if(isColour(colour))return false;
    }
    if(id==='wolf_spawn_egg'){
      const pup=spawnPuppy(game,e,e,'egg');
      if(pup){consume(game);return true;}
      return false;
    }
    if(feedAnimal(e,game,held))return true;
    d.sitting=!d.sitting;e.jump=false;
    game.entities.ai.stop(e);clearTarget(b);b.following=false;
    return true;
  }
  if(id==='bone'&&angerOf(e)<=0){
    consume(game);
    if(game.random()<TAME_CHANCE)tame(e,game);
    else particles(game,e,'smoke',7);
    return true;
  }
  return feedAnimal(e,game,held);
}

// ---- Breeding --------------------------------------------------------------------------------------------
/** A baby of two wolves (or one, for a spawn egg): tamed by the same owner when the first parent is tamed, collar and coat
 *  from a random parent (vanilla getBreedOffspring). */
export function spawnPuppy(game:Game,a:Entity,b:Entity,reason:SpawnReason):Entity|null{
  const pick=game.random()<.5?a:b,other=pick===a?b:a;
  const variant=isVariant(pick.data.variant)?pick.data.variant:'pale';
  const extra:Record<string,unknown>={variant,growth:-BABY_TICKS};
  if(isTame(a)){
    extra.owner='player';extra.sitting=false;
    const c=game.random()<.5?a.data.collar:other.data.collar;
    extra.collar=isColour(c)?c:'red';
  }
  return game.entities.spawn('wolf',a.x,a.y,a.z,{data:extra,baby:true,reason,yaw:game.random()*Math.PI*2});
}
let partnerOf:Entity|null=null;
const partnerFilter=(o:Entity)=>o!==partnerOf&&o.kind==='wolf'&&o.deathTime===0&&canMate(partnerOf!,o);
/** Vanilla Wolf.canMate: both tamed, in love, adult and not sitting. */
export function canMate(a:Entity,b:Entity):boolean{
  return a!==b&&isTame(a)&&isTame(b)&&loveOf(a)>0&&loveOf(b)>0&&growthOf(a)===0&&growthOf(b)===0&&!isSitting(a)&&!isSitting(b);
}
function findPartner(e:Entity,game:Game,b:WolfBrain):Entity|null{
  if(b.partner){
    const p=game.entities.byId(b.partner);
    if(p&&!p.removed&&canMate(e,p)&&(p.x-e.x)**2+(p.y-e.y)**2+(p.z-e.z)**2<=PARTNER_RANGE*PARTNER_RANGE*3)return p;
    b.partner=0;b.loveTime=0;
  }
  partnerOf=e;
  game.entities.near(e.x,e.y,e.z,PARTNER_RANGE,partnerFilter,SCRATCH);
  partnerOf=null;
  let best:Entity|null=null,bd=Infinity;
  for(let i=0;i<SCRATCH.length;i++){const o=SCRATCH[i],dd=(o.x-e.x)**2+(o.y-e.y)**2+(o.z-e.z)**2;if(dd<bd){bd=dd;best=o;}}
  SCRATCH.length=0;
  if(best){b.partner=best.id;b.loveTime=0;}
  return best;
}
/** Animal.spawnChildFromBreeding. */
function breed(e:Entity,partner:Entity,game:Game){
  const pup=spawnPuppy(game,e,partner,'breed');
  for(const w of [e,partner]){const d=data(w);d.growth=BREED_COOLDOWN;d.love=0;const wb=wolfBrain(w);wb.loveTime=0;wb.partner=0;}
  if(!pup)return;
  particles(game,pup,'heart',7);
  game.entities.dropXp(between(game,1,7),e.x,e.y,e.z);
  game.events.emit('animalBred',{kind:'wolf',x:pup.x,y:pup.y,z:pup.z});
}

// ---- Per-tick behaviour ------------------------------------------------------------------------------------
function ageing(e:Entity,game:Game,b:WolfBrain){
  const d=data(e);
  let g=growthOf(e);
  if(g<0){g++;if(g===0)setBaby(e,false);}else if(g>0)g--;
  d.growth=g;
  let love=loveOf(e);
  if(love>0){love--;if(love%10===0)particles(game,e,'heart',1);}
  d.love=love;
  if(b.happy>0){if(b.happy%4===0)particles(game,e,'happy',1);b.happy--;}
}
/** Wolf.tick/aiStep: wet in water or rain; on dry ground (not walking) it shakes for 2 s, flinging splashes. */
function shaking(e:Entity,game:Game,b:WolfBrain){
  const raining=!e.inWater&&game.weather.isRainingOn(Math.floor(e.x),Math.floor(e.y+e.height),Math.floor(e.z));
  if(e.inWater||raining){b.wet=true;if(b.shaking){b.shaking=false;b.shake=b.shakeO=0;}return;}
  if(b.wet&&!b.shaking&&e.onGround&&!e.moveX&&!e.moveZ){b.shaking=true;b.shake=b.shakeO=0;}
  if(!b.shaking)return;
  if(b.shake===0)game.sounds.play('mob:wolf_shake:ambient',centre(e),{volume:.4,pitch:voice(game,e)});
  b.shakeO=b.shake;b.shake+=.05;
  if(b.shakeO>=2){b.wet=false;b.shaking=false;b.shake=b.shakeO=0;return;}
  if(b.shake>.4){
    const n=Math.floor(Math.sin((b.shake-.4)*Math.PI)*7);
    if(n>0)game.render.spawnParticles('splash',e.x,e.y+.8,e.z,{count:n,spread:e.width/2});
  }
}
/** Mob ambient sound timer (1 in 1000 rising each tick, reset to -80): growl when angry; else a third of the time a pant
 *  (a whine for a tamed wolf below half health), otherwise a bark. */
function ambientSound(e:Entity,game:Game,b:WolfBrain){
  if(game.random()*1000>=b.ambient++)return;
  b.ambient=-80;
  let name:'mob:wolf:ambient'|'mob:wolf_growl:ambient'|'mob:wolf_whine:ambient'|'mob:wolf_pant:ambient'='mob:wolf:ambient';
  if(angerOf(e)>0)name='mob:wolf_growl:ambient';
  else if(game.random()<1/3)name=isTame(e)&&e.health<e.maxHealth/2?'mob:wolf_whine:ambient':'mob:wolf_pant:ambient';
  game.sounds.play(name,centre(e),{volume:.4,pitch:voice(game,e)});
}
/** Is the player within 8 blocks holding something the wolf begs for (a bone if wild, meat)? */
function begTarget(e:Entity,game:Game):boolean{
  if(game.survival.dead)return false;
  const p=game.player.state;
  if((p.x-e.x)**2+(p.y-e.y)**2+(p.z-e.z)**2>64)return false;
  const tame=isTame(e),inv=game.inventory;
  const wants=(s:ItemStack|null)=>!!s&&(WOLF_FOOD.has(s.id)||!tame&&s.id==='bone');
  return wants(inv.held())||wants(inv.offhand);
}
/** BegGoal, LookAtPlayerGoal (8 blocks) and RandomLookAroundGoal. */
function looking(e:Entity,game:Game,b:WolfBrain){
  const ai=game.entities.ai,p=game.player.state,eye=p.y+game.player.eyeHeight();
  if(begTarget(e,game)){
    if(b.beg<=0)b.beg=40+Math.floor(game.random()*40);
    b.beg--;ai.lookAt(e,p.x,eye,p.z);return;
  }
  b.beg=0;
  if(b.look>0){
    b.look--;
    if(b.lookMode===1)ai.lookAt(e,p.x,eye,p.z);else ai.lookAt(e,b.lookX,b.lookY,b.lookZ);
    return;
  }
  if(game.random()<.01&&!game.survival.dead&&(p.x-e.x)**2+(p.y-e.y)**2+(p.z-e.z)**2<=64){b.lookMode=1;b.look=40+Math.floor(game.random()*40);return;}
  if(game.random()<.01){
    const a=game.random()*Math.PI*2;
    b.lookMode=2;b.look=20+Math.floor(game.random()*20);b.lookX=e.x+Math.cos(a);b.lookY=e.y+e.height*.85;b.lookZ=e.z+Math.sin(a);
  }
}
/** PanicGoal: run (1.5×) from where it got hurt; a burning wolf heads for water within 5 blocks. */
function panic(e:Entity,game:Game,b:WolfBrain){
  b.panic--;
  const ai=game.entities.ai;
  if(e.fire>0){
    const w=game.world,fx=Math.floor(e.x),fy=Math.floor(e.y),fz=Math.floor(e.z);
    for(let r=1;r<=5;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
      if(Math.max(Math.abs(dx),Math.abs(dz))!==r)continue;
      for(let dy=-1;dy<=1;dy++)if(isWater(Math.max(0,w.get(fx+dx,fy+dy,fz+dz)))){ai.navigate(e,fx+dx+.5,fy+dy,fz+dz+.5,PANIC_SPEED);return;}
    }
  }
  ai.flee(e,b.panicX,b.panicZ,PANIC_SPEED);
}
/** MeleeAttackGoal (speed 1.0, following unseen targets) with LeapAtTargetGoal(0.4). */
function fight(e:Entity,game:Game,b:WolfBrain){
  const ai=game.entities.ai;
  let tx:number,ty:number,tz:number,tw:number,th:number;
  if(b.targetPlayer){const p=game.player.state;tx=p.x;ty=p.y;tz=p.z;tw=game.player.width;th=game.player.height;}
  else{const t=b.target!;tx=t.x;ty=t.y;tz=t.z;tw=t.width;th=t.height;}
  ai.lookAt(e,tx,ty+th*.85,tz);
  const dx=tx-e.x,dy=ty-e.y,dz=tz-e.z,d2=dx*dx+dy*dy+dz*dz,seen=ai.canSee(e,tx,ty+th*.85,tz);
  if(b.leap>0){
    // In the air after a leap: no steering or bites until it lands.
    b.leap++;
    if(e.onGround&&b.leap>2||b.leap>60)b.leap=0;
    else return;
  }
  if(e.onGround&&d2>=4&&d2<=16&&game.random()<1/6){
    const h=Math.hypot(dx,dz);
    if(h>1e-4){e.vx=dx/h*LEAP_SPEED+e.vx*.2;e.vz=dz/h*LEAP_SPEED+e.vz*.2;}
    e.vy=LEAP_UP;b.leap=1;ai.stop(e);
    return;
  }
  if(seen&&d2<9)ai.moveToward(e,tx,ty,tz,WOLF_SPEED);else ai.navigate(e,tx,ty,tz,WOLF_SPEED);
  const reach=e.width/2+MELEE_REACH+tw/2;
  if(b.cooldown<=0&&seen&&Math.abs(dx)<=reach&&Math.abs(dz)<=reach&&ty<e.y+e.height&&ty+th>e.y){
    b.cooldown=ATTACK_INTERVAL;
    bite(e,game,b,dx,dz);
  }
}
/** Mob.doHurtTarget: 4 damage with the base knockback. A tamed wolf's bite counts as its owner's (vanilla lastHurtByPlayer). */
export function bite(e:Entity,game:Game,b:WolfBrain,dx:number,dz:number):boolean{
  const source:DamageSource={kind:'mob',attacker:e,knockback:{x:dx,z:dz,strength:KNOCKBACK}};
  if(isTame(e))source.byPlayer=true;
  if(b.targetPlayer)return game.survival.damage(WOLF_DAMAGE,source)>0;
  return !!b.target&&game.entities.damage(b.target,WOLF_DAMAGE,source);
}
/** FollowOwnerGoal: start at 10 blocks, stop within 2; every 10 ticks teleport when 12+ blocks away. */
function followOwner(e:Entity,game:Game,b:WolfBrain):boolean{
  if(game.survival.dead){b.following=false;return false;}
  const ai=game.entities.ai,p=game.player.state,d2=(p.x-e.x)**2+(p.y-e.y)**2+(p.z-e.z)**2;
  if(!b.following){
    if(d2<FOLLOW_START*FOLLOW_START)return false;
    b.following=true;b.recalc=0;
  }
  if(d2<=FOLLOW_STOP*FOLLOW_STOP){b.following=false;ai.stop(e);return false;}
  ai.lookAt(e,p.x,p.y+game.player.eyeHeight(),p.z);
  if(--b.recalc<=0){
    b.recalc=10;
    if(d2>=TELEPORT_DISTANCE*TELEPORT_DISTANCE&&teleportToOwner(e,game))return true;
  }
  ai.navigate(e,p.x,ownerGround(game),p.z,WOLF_SPEED);
  return true;
}
/** The floor under an airborne owner (jumping, flying, falling: up to 6 blocks down) so the path goal is reachable. */
export function ownerGround(game:Game):number{
  const p=game.player.state,w=game.world,x=Math.floor(p.x),z=Math.floor(p.z),y0=Math.floor(p.y+1e-3);
  for(let y=y0;y>y0-6;y--){const below=w.get(x,y-1,z);if(below<0)break;if(SOLID[below])return y;}
  return p.y;
}
/** BreedGoal for tamed wolves in love. */
function breeding(e:Entity,game:Game,b:WolfBrain):boolean{
  if(loveOf(e)<=0||!isTame(e)||growthOf(e)!==0){b.partner=0;b.loveTime=0;return false;}
  const partner=findPartner(e,game,b);
  if(!partner)return false;
  const ai=game.entities.ai;
  ai.lookAt(e,partner.x,partner.y+partner.height*.85,partner.z);
  ai.navigate(e,partner.x,partner.y,partner.z,WOLF_SPEED);
  b.loveTime++;
  if(b.loveTime>=BREED_TICKS&&(partner.x-e.x)**2+(partner.y-e.y)**2+(partner.z-e.z)**2<9)breed(e,partner,game);
  return true;
}

export function tickWolf(e:Entity,game:Game):void{
  if(e.removed||e.deathTime>0)return;
  const b=wolfBrain(e),d=data(e),ai=game.entities.ai,tame=isTame(e);
  ageing(e,game,b);
  if(b.cooldown>0)b.cooldown--;
  shaking(e,game,b);
  b.interestO=b.interest;b.interest+=((b.beg>0?1:0)-b.interest)*.4;
  ambientSound(e,game,b);
  maintainTargets(e,game,b);
  // FloatGoal.
  if((e.inWater||e.inLava)&&game.random()<.8)e.jump=true;
  b.sitPose=false;
  if(b.panic>0){panic(e,game,b);return;}
  if(tame&&d.sitting===true){
    // SitWhenOrderedToGoal: stays put (and drops any target); only sits down on dry ground.
    if(hasTarget(b))clearTarget(b);
    b.following=false;ai.stop(e);
    b.sitPose=e.onGround&&!e.inWater&&!e.inLava;
    looking(e,game,b);
    return;
  }
  if(!hasTarget(b))findTarget(e,game,b);
  if(hasTarget(b)){b.following=false;fight(e,game,b);return;}
  if(tame&&followOwner(e,game,b))return;
  if(breeding(e,game,b))return;
  ai.wander(e,WOLF_SPEED);
  looking(e,game,b);
}

export function hurtWolf(e:Entity,game:Game,source:DamageSource):void{
  const d=data(e),b=wolfBrain(e);
  // Wolf.hurt: a hurt wolf stands up; Animal.hurt: love mode ends.
  if(isTame(e))d.sitting=false;
  d.love=0;
  if(PANIC_CAUSES.has(source.kind)&&b.panic<=0){
    b.panic=40;b.panicX=e.x+(game.random()-.5)*.2;b.panicZ=e.z+(game.random()-.5)*.2;
  }
  const attacker=attackerOf(e,source);
  if(attacker)revenge(e,game,attacker);
}

// ---- Kind ----------------------------------------------------------------------------------------------
function initWolf(e:Entity,game:Game,reason:SpawnReason){
  const d=e.data;
  if(!isVariant(d.variant))d.variant=variantForBiome(biomeDef(game.world.biomeAt(Math.floor(e.x),Math.floor(e.z))).name);
  if(!isInt(d.growth,-BABY_TICKS,BREED_COOLDOWN)){
    const natural=(reason==='natural'||reason==='chunk')&&game.random()<.05;
    d.growth=e.baby||natural?-BABY_TICKS:0;
  }
  if(!isInt(d.love,0,LOVE_TICKS))d.love=0;
  if(!isInt(d.anger,0,ANGER_MAX))d.anger=0;
  if(d.angerAt!=='player')delete d.angerAt;
  if(d.owner==='player'){
    if(!isColour(d.collar))d.collar='red';
    if(typeof d.sitting!=='boolean')d.sitting=false;
    e.maxHealth=TAME_HEALTH;
    if(reason!=='restore')e.health=TAME_HEALTH;
    d.anger=0;delete d.angerAt;
  }else{delete d.owner;delete d.sitting;delete d.collar;}
  setBaby(e,(d.growth as number)<0);
}
/** Fills the model's per-frame state (no allocation). */
export function lookOfWolf(e:Entity,partial:number,out:WolfLook):void{
  const b=BRAINS.get(e),tame=isTame(e);
  out.variant=Math.max(0,WOLF_VARIANTS.indexOf(e.data.variant as WolfVariant));
  out.tamed=tame;out.angry=angerOf(e)>0;
  out.sitting=b?b.sitPose:isSitting(e);
  out.tail=tailAngle(e);
  out.headRoll=b?(b.interestO+(b.interest-b.interestO)*partial)*.15*Math.PI:0;
  out.shake=b&&b.shaking?b.shakeO+(b.shake-b.shakeO)*partial:0;
}
export function wolfKind(game:Game):EntityKind{
  return{
    kind:'wolf',category:'passive',width:WOLF_WIDTH,height:WOLF_HEIGHT,maxHealth:WILD_HEALTH,
    model:wolfModel(lookOfWolf),
    init:initWolf,
    tick:tickWolf,
    interact:interactWolf,
    hurt(e,g,source){hurtWolf(e,g,source);},
    drops:()=>[],
    // Animal experience: 1-3 for adults.
    xp:e=>e.baby?0:between(game,1,3),
    restoreData:restoreWolfData,
    sounds:{name:'wolf',ambient:false,step:true},
    // Packs of four in forests, taigas and snowy taigas (the biome `animals` lists).
    spawn:{light:'grass',group:[4,4]}
  };
}
/** Event wiring: owner defence (what hurts the player, what the player hits in melee or with arrows), forgetting a dead
 *  player as a target, and the pet death message. Returns the unsubscribers. */
export function wireOwnerEvents(game:Game):(()=>void)[]{
  return[
    game.events.on('playerDamaged',({source})=>{
      const a=source.attacker;
      if(a&&!a.removed&&a.deathTime===0)defendOwner(game,a,PRIORITY.ownerHurtBy);
    }),
    game.events.on('entityDamaged',({entity,source})=>{
      if(!source.byPlayer||source.kind!=='player'&&source.kind!=='projectile')return;
      defendOwner(game,entity,PRIORITY.ownerHurt);
    }),
    game.events.on('playerDied',()=>{
      for(const e of game.entities.all())if(e.kind==='wolf'){const b=BRAINS.get(e);if(b?.targetPlayer)clearTarget(b);}
    }),
    // TamableAnimal.die: the owner is told how their wolf died (vanilla chat message; here the action bar).
    game.events.on('entityDied',({entity,source})=>{if(entity.kind==='wolf'&&isTame(entity))game.ui.toast(wolfDeathMessage(source));})
  ];
}
const nameOf=(e:Entity|null|undefined)=>e?e.kind.split('_').map(w=>w[0].toUpperCase()+w.slice(1)).join(' '):'';
/** Vanilla death messages for a pet wolf. */
export function wolfDeathMessage(source:DamageSource):string{
  const by=source.attacker?nameOf(source.attacker):source.byPlayer||source.kind==='player'?'Player':'';
  switch(source.kind){
    case 'player':case 'mob':return by?`Wolf was slain by ${by}`:'Wolf died';
    case 'projectile':return by?`Wolf was shot by ${by}`:'Wolf was shot';
    case 'explosion':return by?`Wolf was blown up by ${by}`:'Wolf blew up';
    case 'fall':return 'Wolf hit the ground too hard';
    case 'lava':return 'Wolf tried to swim in lava';
    case 'fire':return 'Wolf burned to death';
    case 'drown':return 'Wolf drowned';
    case 'cactus':return 'Wolf was pricked to death';
    case 'suffocate':return 'Wolf suffocated in a wall';
    case 'void':return 'Wolf fell out of the world';
    case 'lightning':return 'Wolf was struck by lightning';
    case 'magic':return 'Wolf was killed by magic';
    case 'starve':return 'Wolf starved to death';
  }
  return 'Wolf died';
}
