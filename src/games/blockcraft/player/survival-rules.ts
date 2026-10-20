// Survival rules: pure vanilla (Java 1.20/1.21) formulas shared by the survival service and its tests.
// Damage types mirror vanilla's damage_type registry (armour bypass, food exhaustion, fire tag, death messages).
import type {DamageSource,Difficulty,Entity} from '../engine/contracts';

export const MAX_HEALTH=20,MAX_FOOD=20,MAX_AIR=300;
/** Saturation after (re)spawning. */
export const START_SATURATION=5;
/** Exhaustion is capped here; every 4 removes a saturation point, then a food point. */
export const MAX_EXHAUSTION=40,EXHAUSTION_PER_POINT=4;
/** Hurt cooldown after a hit (vanilla invulnerableTime 20 compared against 10). */
export const INVULNERABLE_TICKS=10;
/** Damage-free time after respawning (ServerPlayer.spawnInvulnerableTime). */
export const SPAWN_PROTECTION_TICKS=60;
/** Feet below this y take void damage (min build height − 64). */
export const VOID_Y=-64;
/** Remaining fire ticks when not burning (Player.getFireImmuneTicks): standing in fire ignites after this long. */
export const FIRE_IMMUNE_TICKS=20;
/** Ticks a recent attacker stays credited for environmental deaths (LivingEntity.lastHurtByMob). */
export const KILL_CREDIT_TICKS=100;
/** Combat entries are forgotten after this long without damage (CombatTracker: 100, or 300 after an entity's attack). */
export const COMBAT_MEMORY_TICKS=100,COMBAT_MEMORY_ENTITY_TICKS=300;
/** Remaining air while drowning goes down to this, then 2 damage and back to 0. */
export const DROWN_AIR=-20,DROWN_DAMAGE=2,AIR_REFILL=4;
export const LAVA_DAMAGE=4,LAVA_FIRE_SECONDS=15,FIRE_BLOCK_DAMAGE=1,FIRE_BLOCK_SECONDS=8,CACTUS_DAMAGE=1,SUFFOCATION_DAMAGE=1,
  BURN_DAMAGE=1,VOID_DAMAGE=4,STARVE_DAMAGE=1;
/** Natural regeneration: slow (food ≥ 18) every 80 ticks, fast (food 20 with saturation) every 10 ticks. */
export const SLOW_REGEN_TICKS=80,FAST_REGEN_TICKS=10,STARVE_TICKS=80,REGEN_EXHAUSTION=6;

export type DamageType='mob'|'player'|'arrow'|'thrown'|'fall'|'lava'|'in_fire'|'on_fire'|'explosion'|'drown'|'starve'|'void'|
  'cactus'|'suffocate'|'magic'|'lightning';
export interface DamageTypeInfo{
  /** Ignores armour (and does not wear it). */
  readonly bypassArmor:boolean;
  /** Food exhaustion when the hit removes health. */
  readonly exhaustion:number;
  /** In vanilla's is_fire tag: fire resistance prevents it. */
  readonly fire:boolean;
  /** Hurts creative players (and ignores spawn protection). */
  readonly bypassCreative:boolean;
  /** A shield can block it when the source has a position. */
  readonly blockable:boolean;
}
const type=(bypassArmor:boolean,exhaustion:number,o:Partial<DamageTypeInfo>={}):DamageTypeInfo=>
  ({bypassArmor,exhaustion,fire:false,bypassCreative:false,blockable:false,...o});
export const DAMAGE_TYPES:Record<DamageType,DamageTypeInfo>={
  mob:type(false,.1,{blockable:true}),player:type(false,.1,{blockable:true}),arrow:type(false,.1,{blockable:true}),
  thrown:type(false,.1,{blockable:true}),explosion:type(false,.1,{blockable:true}),
  fall:type(true,0),lava:type(false,.1,{fire:true}),in_fire:type(false,.1,{fire:true}),on_fire:type(true,0,{fire:true}),
  drown:type(true,0),starve:type(true,0),void:type(true,0,{bypassCreative:true}),cactus:type(false,.1),suffocate:type(true,0),
  magic:type(true,0),lightning:type(false,.1)};
/** Projectile kinds that are "thrown" (pelted) rather than shot. */
const THROWN=new Set(['snowball','egg','ender_pearl']);

/** The vanilla damage type of a source. 'fire' from other services is burning (on_fire); survival uses 'in_fire' for fire blocks. */
export function damageTypeOf(source:DamageSource):DamageType{
  switch(source.kind){
    case 'projectile':return source.projectile&&THROWN.has(source.projectile.kind)?'thrown':'arrow';
    case 'fire':return 'on_fire';
    default:return source.kind;
  }
}
/** Mob melee and projectiles shot by a mob scale with difficulty (vanilla when_caused_by_living_non_player). */
export function scalesWithDifficulty(source:DamageSource):boolean{
  if(source.byPlayer)return false;
  return source.kind==='mob'||source.kind==='projectile'&&!!source.attacker;
}
/** Player.hurt difficulty scaling: peaceful 0, easy min(amount/2 + 1, amount), normal ×1, hard ×1.5. */
export function scaleForDifficulty(amount:number,difficulty:Difficulty):number{
  switch(difficulty){
    case 'peaceful':return 0;
    case 'easy':return Math.min(amount/2+1,amount);
    case 'hard':return amount*3/2;
    default:return amount;
  }
}
/** CombatRules.getDamageAfterAbsorb: damage × (1 − clamp(defense − damage/(2 + toughness/4), defense/5, 20)/25). */
export function damageAfterArmor(damage:number,defense:number,toughness:number):number{
  if(defense<=0)return damage;
  const f=2+toughness/4,reduction=Math.min(20,Math.max(defense/5,defense-damage/f));
  return damage*(1-reduction/25);
}
/** Shield wear for a blocked hit (LivingEntity.hurtCurrentlyUsedShield): 1 + floor(damage) when damage ≥ 3. */
export const shieldWear=(damage:number)=>damage>=3?1+Math.floor(damage):0;

/** Fall damage ceil(distance − 3); a tiny epsilon absorbs floating point noise in the measured distance. */
export function fallDamage(distance:number):number{
  if(!(distance>3))return 0;
  return Math.max(0,Math.ceil(distance-3-1e-6));
}

/** Experience points from `level` to the next (Player.getXpNeededForNextLevel). */
export function xpToNextLevel(level:number):number{
  return level>=30?112+(level-30)*9:level>=15?37+(level-15)*5:7+level*2;
}
/** Total experience points to reach `level` from zero. */
export function totalXpForLevel(level:number):number{
  if(level<=16)return level*level+6*level;
  if(level<=31)return 2.5*level*level-40.5*level+360;
  return 4.5*level*level-162.5*level+2220;
}
/** Experience dropped on death (Player.getExperienceReward): 7 per level, at most 100. */
export const deathXp=(level:number)=>Math.min(100,Math.max(0,Math.floor(level))*7);

const title=(id:string)=>id.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
/** Display name of an entity for messages ("Zombie", "Mooshroom", "Ender Pearl"). */
export function entityName(entity:Entity):string{
  if(entity.kind==='cow'&&entity.data?.variant==='mooshroom')return 'Mooshroom';
  return title(entity.kind);
}
/** Kinds whose attacks are credited by name (living mobs, not items, TNT or falling blocks). */
export const isLiving=(entity:Entity|null|undefined):entity is Entity=>
  !!entity&&(entity.category==='hostile'||entity.category==='passive'||entity.category==='water');

export interface DeathInfo{
  type:DamageType;
  /** Name of the entity that caused the killing blow (the shooter for projectiles). */
  attacker?:string|null;
  /** Name of the projectile when it had no shooter. */
  projectile?:string|null;
  /** A mob that hurt the player recently (environmental deaths "whilst trying to escape"). */
  credit?:string|null;
  /** Fall distance when the killing blow landed. */
  fallDistance?:number;
  /** The hit before a deadly fall more than 5 blocks high (vanilla CombatTracker "doomed to fall"); attacker null for blocks. */
  fallAssist?:{attacker:string|null}|null;
}
/** Vanilla en_us death message, e.g. "You were slain by Zombie". The subject defaults to "You" ("was" becomes "were"). */
export function deathMessage(info:DeathInfo,subject='You'):string{
  const by=info.attacker??null,credit=info.credit??null;
  const pick=(alone:string,withCredit:string)=>credit?withCredit.replace('%2',credit):alone;
  let text:string;
  switch(info.type){
    case 'mob':case 'player':text=by?`was slain by ${by}`:'died';break;
    case 'arrow':{const who=by??info.projectile??null;text=who?`was shot by ${who}`:'was shot';break;}
    case 'thrown':{const who=by??info.projectile??null;text=who?`was pelted by ${who}`:'was pelted';break;}
    case 'explosion':text=by?`was blown up by ${by}`:pick('blew up','was blown up by %2');break;
    case 'magic':text=by?`was killed by ${by} using magic`:pick('was killed by magic','was killed by magic whilst trying to escape %2');break;
    case 'fall':{
      const distance=info.fallDistance??0;
      if(distance>5&&info.fallAssist)text=info.fallAssist.attacker?`was doomed to fall by ${info.fallAssist.attacker}`:'was doomed to fall';
      else if(distance>5)text='fell from a high place';
      else text=pick('hit the ground too hard','hit the ground too hard whilst trying to escape %2');
      break;
    }
    case 'lava':text=pick('tried to swim in lava','tried to swim in lava to escape %2');break;
    case 'in_fire':text=pick('went up in flames','walked into fire whilst fighting %2');break;
    case 'on_fire':text=pick('burned to death','was burnt to a crisp whilst fighting %2');break;
    case 'drown':text=pick('drowned','drowned whilst trying to escape %2');break;
    case 'starve':text=pick('starved to death','starved to death whilst fighting %2');break;
    case 'void':text=pick('fell out of the world',"didn't want to live in the same world as %2");break;
    case 'cactus':text=pick('was pricked to death','walked into a cactus whilst trying to escape %2');break;
    case 'suffocate':text=pick('suffocated in a wall','suffocated in a wall whilst fighting %2');break;
    case 'lightning':text=pick('was struck by lightning','was struck by lightning whilst fighting %2');break;
    default:text='died';
  }
  if(subject==='You'&&text.startsWith('was '))text=`were ${text.slice(4)}`;
  return `${subject} ${text}`;
}
