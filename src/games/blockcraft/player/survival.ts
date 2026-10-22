// Survival systems (vanilla Java 1.20/1.21): health and absorption, hunger, saturation and exhaustion, natural regeneration
// and starvation by difficulty, the damage pipeline (difficulty scaling, creative and spawn immunity, shields, hurt
// cooldown where a bigger hit replaces a smaller one, armour and toughness, absorption, knockback), environmental damage
// (fall, void, drowning, suffocation, lava, burning, fire blocks, cactus), status effects, experience, death drops and
// messages, respawn, persistence, and the screen overlay set every frame.
import {BLOCKS,COLLISION_BOXES,FULL_CUBE,OPAQUE,SOLID,isLava} from '../data/blocks';
import {itemDef,type FoodStats} from '../data/items';
import {liquidHeight} from '../engine/physics';
import type {DamageSource,EffectName,Entity,Game,StatusEffect,SurvivalService,System} from '../engine/contracts';
import {StatusEffects,isEffectName,MAX_EFFECT_LEVEL,MAX_EFFECT_TICKS} from './effects';
import {AIR_REFILL,BURN_DAMAGE,CACTUS_DAMAGE,COMBAT_MEMORY_ENTITY_TICKS,COMBAT_MEMORY_TICKS,DAMAGE_TYPES,DROWN_AIR,DROWN_DAMAGE,
  EXHAUSTION_PER_POINT,FAST_REGEN_TICKS,FIRE_BLOCK_DAMAGE,FIRE_BLOCK_SECONDS,FIRE_IMMUNE_TICKS,INVULNERABLE_TICKS,KILL_CREDIT_TICKS,
  LAVA_DAMAGE,LAVA_FIRE_SECONDS,MAX_AIR,MAX_EXHAUSTION,MAX_FOOD,MAX_HEALTH,REGEN_EXHAUSTION,SHIELD_READY_TICKS,SLOW_REGEN_TICKS,
  SPAWN_PROTECTION_TICKS,START_SATURATION,STARVE_DAMAGE,STARVE_TICKS,SUFFOCATION_DAMAGE,VOID_DAMAGE,VOID_Y,damageAfterArmor,damageTypeOf,deathMessage,
  deathXp,entityName,fallDamage,isLiving,scaleForDifficulty,scalesWithDifficulty,shieldWear,xpToNextLevel,type DamageType} from './survival-rules';

/** Internal state exposed for tests and the debug overlay (not part of the SurvivalService contract). */
export interface SurvivalDebug{
  /** 0..40; every 4 costs a saturation point, then a food point. */
  readonly exhaustion:number;
  /** Hurt cooldown ticks left. */
  readonly invulnerableTicks:number;
  /** Damage-free ticks left after respawning or joining a world. */
  readonly spawnProtection:number;
  /** The death message while dead ('' while alive): what the death screen shows after loading a world saved on it. */
  readonly deathMessage:string;
  /** 0..1 red hurt flash, 1 on a fresh hit and fading over the 10-tick hurt animation (also sent as the 'hurt' overlay). */
  readonly hurtFlash:number;
}
/** The service with every lifecycle hook it implements. */
export type SurvivalSystem=SurvivalService&SurvivalDebug&Required<Pick<System,'init'|'tick'|'frame'|'reset'|'serialize'|'restore'|'dispose'>>;
type Overlay='water'|'lava'|'hurt'|'fire'|'portal'|null;
/** The latest damage (CombatTracker); `combat` once a mob took part, which keeps the memory for 300 ticks instead of 100. */
interface CombatEntry{type:DamageType;attacker:string|null;age:number;combat:boolean}

/** Seconds the red hurt flash takes to fade (the 10-tick hurt animation). */
const HURT_FLASH_SECONDS=.5;
/** Seconds of portal shimmer after an ender pearl teleport. */
const PORTAL_SECONDS=1;
/** Vertical knockback cap (vanilla 0.4 blocks per tick) and the attacker push when a shield blocks (0.5 per tick), blocks/second. */
const KNOCKBACK_LIFT=8,SHIELD_REPEL=10;
/** LivingEntity.hurt's base knockback (0.4 blocks per tick) away from an attacker whose source gave no knockback, blocks/second. */
const BASE_KNOCKBACK=8;
/** Knockback kept when a shield blocks the hit (vanilla keeps the base push, not the attacker's bonus). */
const SHIELD_KNOCKBACK=.5;
const EPS=1e-4,MAX_XP=0x7fffffff,MAX_LEVEL=1_000_000;
/** Largest single hit accepted (an infinite /kill-style hit becomes this). */
const MAX_HIT=1e9;
const TOUCH_FIRE=1,TOUCH_CACTUS=2;

/** Environmental damage sources, shared so ticking allocates nothing. Event listeners must treat them as read-only. */
const SOURCES={
  burn:Object.freeze<DamageSource>({kind:'fire'}),lava:Object.freeze<DamageSource>({kind:'lava'}),
  void:Object.freeze<DamageSource>({kind:'void'}),wall:Object.freeze<DamageSource>({kind:'suffocate'}),
  drown:Object.freeze<DamageSource>({kind:'drown'}),starve:Object.freeze<DamageSource>({kind:'starve'}),
  cactus:Object.freeze<DamageSource>({kind:'cactus'}),poison:Object.freeze<DamageSource>({kind:'magic'}),
  fall:Object.freeze<DamageSource>({kind:'fall'})};

const FIRE=new Uint8Array(256),CACTUS=new Uint8Array(256),BED=new Uint8Array(256),SUFFOCATES=new Uint8Array(256);
for(const d of BLOCKS){
  FIRE[d.id]=+(d.family==='fire');CACTUS[d.id]=+(d.family==='cactus');BED[d.id]=+(d.family==='bed');
  // Vanilla isSuffocating: full, collidable, opaque cubes (not glass, leaves or ice).
  SUFFOCATES[d.id]=+(OPAQUE[d.id]===1&&SOLID[d.id]===1&&FULL_CUBE[d.id]===1);
}

export function createSurvival(game:Game):SurvivalSystem{
  let health=MAX_HEALTH,food=MAX_FOOD,saturation=START_SATURATION,exhaustion=0,foodTimer=0,air=MAX_AIR,absorption=0;
  let xpLevel=0,xpPoints=0,xpTotal=0;
  /** Vanilla remainingFireTicks: > 0 burning; ≤ 0 counts up while standing in fire and ignites at 0. */
  let fireTicks=-FIRE_IMMUNE_TICKS;
  let dead=false,lastMessage='';
  /** Ticks the shield has been raised, up to SHIELD_READY_TICKS. */
  let shieldTicks=0;
  let invul=0,lastHurt=0,spawnProtection=0,age=0,lastLevelUp=-1000,hurtFlash=0,portalFlash=0;
  /** The mob that last hurt the player (LivingEntity.lastHurtByMob), credited for environmental deaths for 100 ticks. */
  let lastAttacker:{name:string;entity:Entity;age:number}|null=null,lastEntry:CombatEntry|null=null;
  /** LivingEntity.lastClimbablePos: climbed a ladder since last standing on the ground ("fell off a ladder"). */
  let climbed=false;
  const effects=new StatusEffects();
  let offRestored:(()=>void)|null=null,offWorldReset:(()=>void)|null=null;

  const creative=()=>game.settings.mode==='creative';
  const state=()=>game.player.state;

  // ---- Food --------------------------------------------------------------------------------
  function addExhaustion(amount:number){
    if(!(amount>0)||!Number.isFinite(amount)||creative()||game.settings.difficulty==='peaceful')return;
    exhaustion=Math.min(MAX_EXHAUSTION,exhaustion+amount);
  }
  /** FoodData.eat with an absolute saturation amount (the registry stores hunger × modifier × 2). */
  function feed(hunger:number,sat:number){
    food=Math.min(MAX_FOOD,food+hunger);
    saturation=Math.min(saturation+sat,food);
  }
  function heal(amount:number){
    if(dead||!(amount>0)||!Number.isFinite(amount))return;
    health=Math.min(MAX_HEALTH,health+amount);
  }
  /** FoodData.tick: one exhaustion step, then saturated or slow regeneration, or starvation. */
  function foodTick(){
    const difficulty=game.settings.difficulty;
    if(exhaustion>EXHAUSTION_PER_POINT){
      exhaustion-=EXHAUSTION_PER_POINT;
      if(saturation>0)saturation=Math.max(0,saturation-1);
      else if(difficulty!=='peaceful')food=Math.max(0,food-1);
    }
    const hurtNow=health>0&&health<MAX_HEALTH;
    if(saturation>0&&hurtNow&&food>=MAX_FOOD){
      if(++foodTimer>=FAST_REGEN_TICKS){const f=Math.min(saturation,6);heal(f/6);addExhaustion(f);foodTimer=0;}
    }else if(food>=18&&hurtNow){
      if(++foodTimer>=SLOW_REGEN_TICKS){heal(1);addExhaustion(REGEN_EXHAUSTION);foodTimer=0;}
    }else if(food<=0){
      if(++foodTimer>=STARVE_TICKS){
        if(health>10||difficulty==='hard'||health>1&&difficulty==='normal')hurt(STARVE_DAMAGE,SOURCES.starve,'starve');
        foodTimer=0;
      }
    }else foodTimer=0;
  }

  // ---- Armour and shields ----------------------------------------------------------------------
  function armorPoints(){
    let points=0;for(const s of game.inventory.armor)if(s)points+=itemDef(s.id)?.armor?.points??0;
    return Math.min(20,points);
  }
  function armorToughness(){
    let t=0;for(const s of game.inventory.armor)if(s)t+=itemDef(s.id)?.armor?.toughness??0;
    return t;
  }
  /** LivingEntity.isDamageSourceBlocked: a raised shield and the source (projectile, else attacker) in the front half. */
  function shieldFacing(source:DamageSource):boolean{
    if(game.interaction.using?.item!=='shield'||shieldTicks<SHIELD_READY_TICKS)return false;
    const from=source.projectile??source.attacker;if(!from)return false;
    const p=state(),dx=p.x-from.x,dz=p.z-from.z;
    if(Math.hypot(dx,dz)<1e-9)return false;
    return dx*-Math.sin(p.yaw)+dz*-Math.cos(p.yaw)<0;
  }
  /** Wears the raised shield (main hand first, as vanilla uses it); an offhand shield breaks with tool_break through
   *  inventory.damageOffhand. */
  function wearShield(amount:number){
    if(amount<=0)return;
    const inv=game.inventory;
    if(inv.held()?.id==='shield'){inv.damageHeld(amount);return;}
    const off=inv.offhand;if(off?.id!=='shield')return;
    if(inv.damageOffhand){inv.damageOffhand(amount);return;}
    // An inventory without damageOffhand (optional in the contract): rewrite the stack, breaking it silently.
    const wear=(off.damage??0)+amount,max=itemDef('shield')?.durability??336;
    inv.setOffhand(wear>=max?null:{...off,damage:wear});
  }
  /** LivingEntity.knockback scaled from blocks/second: halves the current velocity, then pushes away (and up when grounded).
   *  Uses the source's knockback; without one, a mob (or a mob's projectile) pushes 0.4 blocks/tick away from the attacker. */
  function knockback(source:DamageSource,factor:number){
    const k=source.knockback,p=state();
    let x:number,z:number,strength:number;
    if(k){
      if(!(k.strength>0)||!Number.isFinite(k.strength)||!Number.isFinite(k.x)||!Number.isFinite(k.z))return;
      x=k.x;z=k.z;strength=k.strength;
    }else{
      const from=source.attacker;
      if(!from||!(source.kind==='mob'||source.kind==='player'||source.kind==='projectile')||!Number.isFinite(from.x)||!Number.isFinite(from.z))return;
      x=p.x-from.x;z=p.z-from.z;strength=BASE_KNOCKBACK;
      // Vanilla picks a random direction when the attacker stands right on the player.
      if(x*x+z*z<1e-4){const a=game.random()*Math.PI*2;x=Math.cos(a);z=Math.sin(a);}
    }
    const len=Math.hypot(x,z);if(len<1e-9)return;
    const s=strength*factor,vy=p.onGround?Math.min(KNOCKBACK_LIFT,p.vy/2+s):p.vy;
    game.player.push(x/len*s-p.vx/2,vy-p.vy,z/len*s-p.vz/2);
  }
  /** A blocked melee attacker is pushed back (LivingEntity.blockUsingShield). */
  function repel(attacker:Entity){
    const p=state(),dx=attacker.x-p.x,dz=attacker.z-p.z,len=Math.hypot(dx,dz);if(len<1e-9)return;
    attacker.vx=attacker.vx/2+dx/len*SHIELD_REPEL;attacker.vz=attacker.vz/2+dz/len*SHIELD_REPEL;
    if(attacker.onGround)attacker.vy=Math.min(KNOCKBACK_LIFT,attacker.vy/2+SHIELD_REPEL);
  }

  // ---- Damage ------------------------------------------------------------------------------
  function hurt(amount:number,source:DamageSource,type:DamageType,fallDistance=state().fallDistance):number{
    if(dead||Number.isNaN(amount)||amount<0)return 0;
    amount=Math.min(amount,MAX_HIT);
    const info=DAMAGE_TYPES[type];
    if(type==='fall'&&source.projectile?.kind==='ender_pearl')portalFlash=PORTAL_SECONDS;
    if(!info.bypassCreative&&(creative()||spawnProtection>0))return 0;
    if(info.fire&&effects.has('fire_resistance'))return 0;
    if(amount>0&&scalesWithDifficulty(source))amount=scaleForDifficulty(amount,game.settings.difficulty);
    // Player.hurt: a hit worth nothing (peaceful mobs, snowballs, eggs) does nothing at all, not even knockback.
    if(!(amount>0))return 0;
    if(info.blockable&&shieldFacing(source)){
      wearShield(shieldWear(amount));
      if((type==='mob'||type==='player')&&isLiving(source.attacker))repel(source.attacker);
      // A fresh block (not during the hurt cooldown) plays item.shield.block at 0.8..1.2 pitch (vanilla entity event 29).
      if(invul===0){invul=INVULNERABLE_TICKS;lastHurt=0;knockback(source,SHIELD_KNOCKBACK);game.sounds.play('shield_block',null,{pitch:.8+game.random()*.4});}
      return 0;
    }
    let applied:number,fresh:boolean;
    if(invul>0){if(amount<=lastHurt)return 0;applied=amount-lastHurt;lastHurt=amount;fresh=false;}
    else{lastHurt=amount;invul=INVULNERABLE_TICKS;applied=amount;fresh=true;}
    if(!info.bypassArmor){
      const defense=armorPoints();
      if(defense>0){const toughness=armorToughness();game.inventory.damageArmor(applied);applied=damageAfterArmor(applied,defense,toughness);}
    }
    const absorbed=Math.min(absorption,applied);absorption-=absorbed;
    const toHealth=applied-absorbed;
    if(toHealth>0)addExhaustion(info.exhaustion);
    const before=health;health=Math.max(0,health-toHealth);
    const lost=before-health+absorbed;
    // Combat tracking for death messages.
    const prev=lastEntry&&age-lastEntry.age<=(lastEntry.combat?COMBAT_MEMORY_ENTITY_TICKS:COMBAT_MEMORY_TICKS)?lastEntry:null;
    const credit=creditName();
    const attacker=isLiving(source.attacker)?entityName(source.attacker):null;
    lastEntry={type,attacker,age,combat:!!attacker||!!prev?.combat};
    if(attacker)lastAttacker={name:attacker,entity:source.attacker!,age};
    if(fresh){knockback(source,1);hurtFlash=1;}
    game.events.emit('playerDamaged',{amount:lost,source});
    if(health<=0){
      kill(deathMessage({type,attacker,credit:attacker?null:credit,fallDistance,
        projectile:source.projectile?entityName(source.projectile):null,
        fallAssist:type==='fall'&&prev&&prev.type!=='fall'?{attacker:prev.attacker}:null,
        fallLocation:type==='fall'&&climbed?'ladder':null}),source);
    }else if(fresh)game.sounds.play('hurt');
    return lost;
  }
  /** LivingEntity.getKillCredit: the last mob to hurt the player, while it lives and for 100 ticks. */
  function creditName():string|null{
    const a=lastAttacker;
    if(!a||age-a.age>KILL_CREDIT_TICKS||a.entity.removed||a.entity.deathTime>0||!(a.entity.health>0))return null;
    return a.name;
  }
  /** `source`: the damage that killed the player, sent with playerDied (none for a direct kill such as a command). */
  function kill(message:string,source?:DamageSource){
    if(dead)return;
    dead=true;health=0;absorption=0;fireTicks=-FIRE_IMMUNE_TICKS;invul=0;
    lastMessage=typeof message==='string'&&message.trim()?message.trim().slice(0,200):'You died';
    if(!game.settings.keepInventory){
      game.inventory.dropAll();
      const xp=deathXp(xpLevel),p=state();
      if(xp>0)game.entities.dropXp(xp,p.x,p.y+.5,p.z);
    }
    game.sounds.play('death');
    game.events.emit('playerDied',source?{message:lastMessage,source}:{message:lastMessage});
  }

  // ---- Status effects ----------------------------------------------------------------------
  const maxAbsorption=()=>4*effects.level('absorption');
  const clampAbsorption=()=>{absorption=Math.max(0,Math.min(absorption,maxAbsorption()));};
  function applyEffect(e:StatusEffect){
    switch(e.name){
      case 'regeneration':if(health<MAX_HEALTH)heal(1);break;
      case 'poison':if(health>1)hurt(1,SOURCES.poison,'magic');break;
      // AbsorptionMobEffect.applyEffectTick (1.20.2+): the effect ends once its extra hearts are used up.
      case 'absorption':if(absorption<=0)effects.remove('absorption');break;
      case 'hunger':addExhaustion(.005*e.level);break;
      case 'saturation':feed(e.level,e.level*2);break;
      default:break;// speed and slowness (player movement), night vision (renderer) and fire resistance (damage) are passive
    }
  }
  function addEffect(name:EffectName,seconds:number,level=1){
    if(dead||!isEffectName(name)||!(seconds>0)||!Number.isFinite(seconds))return;
    const lv=Math.round(level);if(!(lv>=1&&lv<=MAX_EFFECT_LEVEL))return;
    effects.add(name,Math.min(MAX_EFFECT_TICKS,Math.max(1,Math.round(seconds*20))),lv);
    // AbsorptionMobEffect.onEffectStarted (every application), capped by the active level.
    if(name==='absorption'){absorption=Math.max(absorption,4*lv);clampAbsorption();}
  }

  // ---- Fire --------------------------------------------------------------------------------
  /** Entity.setSecondsOnFire: never shortens the current burn. */
  function setOnFire(seconds:number){const ticks=Math.round(seconds*20);if(fireTicks<ticks)fireTicks=ticks;}
  function rainingOnPlayer(){
    const p=state(),x=Math.floor(p.x),z=Math.floor(p.z);
    return game.weather.isRainingOn(x,Math.floor(p.y),z)||game.weather.isRainingOn(x,Math.floor(p.y+game.player.height),z);
  }

  // ---- Block contact -------------------------------------------------------------------------
  function eyesInWall(){
    const p=state(),y=Math.floor(p.y+game.player.eyeHeight()),hw=game.player.width*.4,w=game.world;
    for(let z=Math.floor(p.z-hw);z<=Math.floor(p.z+hw);z++)for(let x=Math.floor(p.x-hw);x<=Math.floor(p.x+hw);x++){
      const id=w.get(x,y,z);if(id>0&&SUFFOCATES[id])return true;
    }
    return false;
  }
  function eyesInLava(){
    const p=state(),w=game.world,ey=p.y+game.player.eyeHeight(),x=Math.floor(p.x),y=Math.floor(ey),z=Math.floor(p.z),id=w.get(x,y,z);
    if(id<=0||!isLava(id))return false;
    const above=w.get(x,y+1,z),height=above>0&&isLava(above)?1:liquidHeight(id);
    return ey<y+height;
  }
  /** The player's inLava flag, confirmed by lava near the body. The player re-senses fluids in its next physics step (a
   *  frame) after a teleport, which can come after survival's tick: a flag left over from a death in lava must not set the
   *  respawned player alight. The box is generous so that real contact is never missed. */
  function lavaContact(){
    const p=state();if(!p.inLava)return false;
    const w=game.world,hw=game.player.width/2+.1,y0=Math.floor(p.y-.1),y1=Math.floor(p.y+game.player.height+.1);
    for(let y=y0;y<=y1;y++)for(let z=Math.floor(p.z-hw);z<=Math.floor(p.z+hw);z++)for(let x=Math.floor(p.x-hw);x<=Math.floor(p.x+hw);x++){
      const id=w.get(x,y,z);if(id>0&&isLava(id))return true;
    }
    return false;
  }
  /** Fire and cactus cells the player's box is inside (Entity.checkInsideBlocks), plus standing on a cactus alone. */
  function touching(){
    const p=state(),w=game.world,hw=game.player.width/2,h=game.player.height;
    const minX=p.x-hw,maxX=p.x+hw,minZ=p.z-hw,maxZ=p.z+hw;
    const x0=Math.floor(minX+EPS),x1=Math.floor(maxX-EPS),z0=Math.floor(minZ+EPS),z1=Math.floor(maxZ-EPS);
    let flags=0;
    for(let y=Math.floor(p.y+EPS);y<=Math.floor(p.y+h-EPS);y++)for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
      const id=w.get(x,y,z);if(id<=0)continue;
      if(FIRE[id])flags|=TOUCH_FIRE;else if(CACTUS[id])flags|=TOUCH_CACTUS;
    }
    if(!(flags&TOUCH_CACTUS)&&p.onGround){
      // A vanilla cactus is 15/16 high, so the player sinks into it unless another block holds them up.
      const y=Math.floor(p.y-.01);let cactus=false,other=false;
      for(let z=z0;z<=z1;z++)for(let x=x0;x<=x1;x++){
        const id=w.get(x,y,z);if(id===0)continue;
        if(id<0){other=true;continue;}
        const b=COLLISION_BOXES[id];
        for(let i=0;i<b.length;i+=6){
          if(minX+EPS<x+b[i+3]&&maxX-EPS>x+b[i]&&minZ+EPS<z+b[i+5]&&maxZ-EPS>z+b[i+2]&&Math.abs(y+b[i+4]-p.y)<.02){
            if(CACTUS[id])cactus=true;else other=true;
          }
        }
      }
      if(cactus&&!other)flags|=TOUCH_CACTUS;
    }
    return flags;
  }

  // ---- Experience --------------------------------------------------------------------------
  function addXp(points:number){
    if(dead||!Number.isFinite(points)||points===0)return;
    let n=points>0?Math.floor(points):Math.ceil(points);
    const fraction=Math.abs(points-n);
    // Fractions (furnace rewards) become a whole point by chance, like ExperienceOrb.award.
    if(fraction>0&&game.random()<fraction)n+=Math.sign(points);
    if(n===0)return;
    xpTotal=Math.max(0,Math.min(MAX_XP,xpTotal+n));
    xpPoints+=n;
    while(xpPoints>=xpToNextLevel(xpLevel)&&xpLevel<MAX_LEVEL){
      xpPoints-=xpToNextLevel(xpLevel);xpLevel++;
      // Player.giveExperienceLevels: the level-up chime marks every fifth level, at most every 5 seconds.
      if(xpLevel%5===0&&lastLevelUp<age-100){game.sounds.play('levelup',null,{volume:(xpLevel>30?1:xpLevel/30)*.75});lastLevelUp=age;}
    }
    if(xpLevel>=MAX_LEVEL)xpPoints=Math.min(xpPoints,xpToNextLevel(xpLevel)-1);
    while(xpPoints<0){
      if(xpLevel>0){xpLevel--;xpPoints+=xpToNextLevel(xpLevel);}
      else{xpPoints=0;xpTotal=0;}
    }
    if(n>0)game.sounds.play('orb',null,{pitch:(game.random()-game.random())*.35+.9});
  }

  // ---- Lifecycle ---------------------------------------------------------------------------
  function fresh(){
    health=MAX_HEALTH;food=MAX_FOOD;saturation=START_SATURATION;exhaustion=0;foodTimer=0;air=MAX_AIR;absorption=0;
    fireTicks=-FIRE_IMMUNE_TICKS;effects.clear();dead=false;lastMessage='';invul=0;lastHurt=0;hurtFlash=0;portalFlash=0;
    lastAttacker=null;lastEntry=null;climbed=false;shieldTicks=0;
  }
  /** Where game.respawn() puts the player: the bed while it is still a bed (an unloaded one is trusted), else world spawn. */
  function respawnPoint(){
    const p=state(),bed=p.bedSpawn;
    if(bed){const id=game.world.get(bed.x,bed.y,bed.z);if(id<0||BED[id])return{x:bed.x+.5,y:bed.y+1,z:bed.z+.5};}
    return p.spawn;
  }
  function tick(){
    if(dead)return;
    age++;
    if(invul>0)invul--;
    if(spawnProtection>0)spawnProtection--;
    const p=state(),isCreative=creative(),lava=lavaContact();
    shieldTicks=game.interaction.using?.item==='shield'?Math.min(SHIELD_READY_TICKS,shieldTicks+1):0;
    if(p.onLadder)climbed=true;else if(p.onGround||p.inWater||p.flying)climbed=false;
    // Water puts out fire; burning hurts once a second (not while in lava, which hurts more).
    if(p.inWater&&fireTicks>0)fireTicks=0;
    if(isCreative){if(fireTicks>0)fireTicks=0;}
    else if(fireTicks>0){
      if(fireTicks%20===0&&!lava)hurt(BURN_DAMAGE,SOURCES.burn,'on_fire');
      fireTicks--;
      if(dead)return;
    }
    if(lava&&!isCreative){setOnFire(LAVA_FIRE_SECONDS);hurt(LAVA_DAMAGE,SOURCES.lava,'lava');if(dead)return;}
    if(p.y<VOID_Y){hurt(VOID_DAMAGE,SOURCES.void,'void');if(dead)return;}
    if(!isCreative&&eyesInWall()){hurt(SUFFOCATION_DAMAGE,SOURCES.wall,'suffocate');if(dead)return;}
    // Air: 300 ticks underwater, then 2 damage each time it reaches -20; refills 4 per tick.
    if(p.headInWater&&!isCreative){
      air--;
      if(air<=DROWN_AIR){
        air=0;
        game.render.spawnParticles('bubble',p.x,p.y+game.player.eyeHeight(),p.z,{count:8,spread:.3});
        hurt(DROWN_DAMAGE,SOURCES.drown,'drown');if(dead)return;
      }
    }else if(air<MAX_AIR)air=Math.min(MAX_AIR,air+AIR_REFILL);
    effects.tick(applyEffect,clampAbsorption,clampAbsorption);
    if(dead)return;
    clampAbsorption();
    const touch=touching();
    if(touch&TOUCH_FIRE&&!isCreative){
      // BaseFireBlock.entityInside: catches fire after FIRE_IMMUNE_TICKS in the flames, 1 damage per hit.
      fireTicks++;if(fireTicks===0)setOnFire(FIRE_BLOCK_SECONDS);
      hurt(FIRE_BLOCK_DAMAGE,SOURCES.burn,'in_fire');if(dead)return;
    }
    if(touch&TOUCH_CACTUS){hurt(CACTUS_DAMAGE,SOURCES.cactus,'cactus');if(dead)return;}
    if(!(touch&TOUCH_FIRE)&&!lava&&fireTicks<=0)fireTicks=-FIRE_IMMUNE_TICKS;
    if(fireTicks>0&&(p.inWater||rainingOnPlayer()))fireTicks=-FIRE_IMMUNE_TICKS;
    // Peaceful (Player.aiStep): 1 health and 1 saturation every 20 ticks, 1 food every 10 ticks. Saturation never exceeds food.
    if(game.settings.difficulty==='peaceful'){
      if(health<MAX_HEALTH&&age%20===0)heal(1);
      if(saturation<MAX_FOOD&&age%20===0)saturation=Math.max(saturation,Math.min(saturation+1,food));
      if(food<MAX_FOOD&&age%10===0)food++;
    }
    foodTick();
  }
  function frame(dt:number){
    const d=Number.isFinite(dt)&&dt>0?dt:0;
    hurtFlash=Math.max(0,hurtFlash-d/HURT_FLASH_SECONDS);portalFlash=Math.max(0,portalFlash-d);
    // One overlay at a time: lasting states first. Fire and lava hurt every 10 ticks, the length of the hurt flash, so a
    // flash ahead of the flames would hide them for as long as the player burns (vanilla always shows them when on fire).
    let kind:Overlay=null,strength=0;
    if(eyesInLava()){kind='lava';strength=1;}
    else if(portalFlash>0){kind='portal';strength=Math.min(1,portalFlash/PORTAL_SECONDS);}
    else if(fireTicks>0&&!dead){kind='fire';strength=effects.has('fire_resistance')?.5:1;}
    else if(hurtFlash>0){kind='hurt';strength=hurtFlash;}
    else if(state().headInWater){kind='water';strength=1;}
    game.render.setOverlay(kind,strength);
  }
  function restore(data:unknown){
    if(!data||typeof data!=='object'||Array.isArray(data))return;
    const d=data as Record<string,unknown>;
    const num=(k:string,min:number,max:number)=>{const v=d[k];return typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max?v:null;};
    const int=(k:string,min:number,max:number)=>{const v=num(k,min,max);return v!==null&&Number.isInteger(v)?v:null;};
    if('effects' in d)effects.restore(d.effects);
    if(d.dead===true){
      dead=true;health=0;
      lastMessage=typeof d.deathMessage==='string'&&d.deathMessage.trim()?d.deathMessage.trim().slice(0,200):'You died';
    }else{const h=num('health',0,MAX_HEALTH);if(h!==null&&h>0){health=h;dead=false;}}
    const f=int('food',0,MAX_FOOD);if(f!==null)food=f;
    const s=num('saturation',0,MAX_FOOD);if(s!==null)saturation=Math.min(s,food);
    const e=num('exhaustion',0,MAX_EXHAUSTION);if(e!==null)exhaustion=e;
    const t=int('foodTimer',0,SLOW_REGEN_TICKS);if(t!==null)foodTimer=t;
    const a=int('air',DROWN_AIR,MAX_AIR);if(a!==null)air=a;
    const level=int('xpLevel',0,MAX_LEVEL);if(level!==null){xpLevel=level;xpPoints=0;}
    const points=int('xpPoints',0,xpToNextLevel(xpLevel)-1);if(points!==null)xpPoints=points;
    const total=int('xpTotal',0,MAX_XP);if(total!==null)xpTotal=total;
    const fire=int('fire',-FIRE_IMMUNE_TICKS,MAX_EFFECT_TICKS);if(fire!==null)fireTicks=fire;
    const ab=num('absorption',0,4*MAX_EFFECT_LEVEL);if(ab!==null)absorption=ab;
    saturation=Math.min(saturation,food);clampAbsorption();
  }

  const service:SurvivalSystem={
    get health(){return health;},maxHealth:MAX_HEALTH,get food(){return food;},get saturation(){return saturation;},
    get air(){return Math.max(0,air);},maxAir:MAX_AIR,get absorption(){return absorption;},
    get xpLevel(){return xpLevel;},get xpProgress(){return xpPoints/xpToNextLevel(xpLevel);},get xpTotal(){return xpTotal;},
    get dead(){return dead;},get burning(){return Math.max(0,fireTicks);},
    get exhaustion(){return exhaustion;},get invulnerableTicks(){return invul;},get spawnProtection(){return spawnProtection;},
    get deathMessage(){return dead?lastMessage||'You died':'';},get hurtFlash(){return hurtFlash;},
    armorPoints,
    damage(amount,source){
      if(!source||typeof source!=='object')return 0;
      const type=damageTypeOf(source);
      // An unknown kind from a caller outside the contract counts as generic (armour-bypassing) damage.
      return hurt(amount,source,type in DAMAGE_TYPES?type:'magic');
    },
    heal,addExhaustion,
    eat(stats:FoodStats){
      if(dead||!stats)return;
      const hunger=Number.isFinite(stats.hunger)&&stats.hunger>0?Math.round(stats.hunger):0;
      const sat=Number.isFinite(stats.saturation)&&stats.saturation>0?stats.saturation:0;
      if(stats.clearsEffects)service.clearEffects();
      if(hunger>0||sat>0)feed(hunger,sat);
      for(const [name,seconds,chance,level] of stats.effects??[])if(game.random()<chance)addEffect(name,seconds,level??1);
      if(hunger>0)game.sounds.play('burp',null,{volume:.5,pitch:game.random()*.1+.9});
      else game.sounds.play('drink');
    },
    canEat(stats:FoodStats){return !dead&&!!stats&&(creative()||!!stats.always||food<MAX_FOOD);},
    addXp,addEffect,
    removeEffect(name){if(effects.remove(name))clampAbsorption();},
    clearEffects(){effects.clear();clampAbsorption();},
    effects:()=>effects.list,
    hasEffect:name=>effects.has(name),
    ignite(seconds){if(!dead&&!creative()&&seconds>0&&Number.isFinite(seconds))setOnFire(Math.min(seconds,MAX_EFFECT_TICKS/20));},
    extinguish(){if(fireTicks>0)fireTicks=0;},
    land(distance){
      if(dead||!(distance>0)||!Number.isFinite(distance))return;
      const p=state();if(creative()||p.inWater||p.flying)return;
      // BedBlock.fallOn halves the fall.
      const below=game.world.get(Math.floor(p.x),Math.floor(p.y-.2),Math.floor(p.z));
      const damage=fallDamage(below>0&&BED[below]?distance*.5:distance);
      if(damage>0)hurt(damage,SOURCES.fall,'fall',distance);
    },
    respawn(){
      const keep=game.settings.keepInventory;
      fresh();
      if(!keep){xpLevel=0;xpPoints=0;xpTotal=0;}
      spawnProtection=SPAWN_PROTECTION_TICKS;
    },
    kill:message=>kill(message),
    init(){
      // Joining a world (ServerPlayer.spawnInvulnerableTime) protects for 3 seconds of play, like respawning.
      offRestored=game.events.on('restored',()=>{
        if(!dead){spawnProtection=SPAWN_PROTECTION_TICKS;return;}
        // A world saved on the death screen: the death was counted and its drops made before saving, so playerDied is not
        // sent again (every listener would count a second death). The engine emits this event while still 'loading' and
        // enters 'dead' (the death screen, from survival.dead and deathMessage) once the player's chunks are in.
        if(game.state==='dead'||game.state==='loading')return;
        // An engine that resumes the world without the death screen would leave a dead player in play: respawn instead.
        service.respawn();
        const at=respawnPoint();game.player.teleport(at.x,at.y,at.z);
      });
      offWorldReset=game.events.on('worldReset',()=>{if(!dead)spawnProtection=SPAWN_PROTECTION_TICKS;});
    },
    tick,frame,
    reset(){fresh();xpLevel=0;xpPoints=0;xpTotal=0;spawnProtection=0;age=0;lastLevelUp=-1000;},
    serialize:()=>({health,food,saturation,exhaustion,foodTimer,air,absorption,xpLevel,xpPoints,xpTotal,fire:fireTicks,
      effects:effects.serialize(),dead,...(dead?{deathMessage:lastMessage}:{})}),
    restore,
    dispose(){offRestored?.();offWorldReset?.();offRestored=offWorldReset=null;}
  };
  return service;
}
