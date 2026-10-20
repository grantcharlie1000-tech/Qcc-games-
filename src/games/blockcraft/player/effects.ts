// Status effects: the active list with vanilla (Java 1.20/1.21) MobEffectInstance rules. A stronger effect replaces a
// weaker one, a longer one of the same level extends it, and a weaker but longer effect waits "hidden" underneath and
// resumes when the stronger one runs out (hidden effects count down too). Levels are 1-based (Regeneration II = 2).
// What each effect does is applied by the survival service through the `apply` callback of tick().
import type {EffectName,StatusEffect} from '../engine/contracts';

export const EFFECT_NAMES=['regeneration','absorption','hunger','poison','saturation','speed','slowness','night_vision','fire_resistance'] as const satisfies readonly EffectName[];
type MissingEffect=Exclude<EffectName,typeof EFFECT_NAMES[number]>;
/** Fails to compile when data/items.ts gains an EffectName this module does not handle. */
export const EFFECTS_COMPLETE:[MissingEffect] extends [never]?true:never=true;
const NAMES=new Set<string>(EFFECT_NAMES);
export const isEffectName=(name:unknown):name is EffectName=>typeof name==='string'&&NAMES.has(name);

/** Display data (vanilla colours since 1.19.4) for the HUD and inventory. */
export const EFFECT_INFO:Record<EffectName,{readonly displayName:string;readonly beneficial:boolean;readonly color:number}>={
  regeneration:{displayName:'Regeneration',beneficial:true,color:0xcd5cab},
  absorption:{displayName:'Absorption',beneficial:true,color:0x2552a5},
  hunger:{displayName:'Hunger',beneficial:false,color:0x587653},
  poison:{displayName:'Poison',beneficial:false,color:0x87a363},
  saturation:{displayName:'Saturation',beneficial:true,color:0xf82423},
  speed:{displayName:'Speed',beneficial:true,color:0x33ebff},
  slowness:{displayName:'Slowness',beneficial:false,color:0x8bafe0},
  night_vision:{displayName:'Night Vision',beneficial:true,color:0xc2ff66},
  fire_resistance:{displayName:'Fire Resistance',beneficial:true,color:0xff9900}};
/** Highest level accepted (vanilla amplifier 0..254). */
export const MAX_EFFECT_LEVEL=255;
/** Longest duration accepted, in ticks (about 14 hours). */
export const MAX_EFFECT_TICKS=1_000_000;

/** MobEffect.isDurationEffectTick: does the effect act on this tick, given the ticks remaining before it counts down?
 *  Regeneration every 50 >> amplifier ticks, poison every 25 >> amplifier, hunger and saturation every tick. */
export function effectFires(name:EffectName,level:number,ticks:number):boolean{
  const amplifier=level-1;
  switch(name){
    case 'regeneration':{const k=50>>amplifier;return k>0?ticks%k===0:true;}
    case 'poison':{const k=25>>amplifier;return k>0?ticks%k===0:true;}
    case 'hunger':case 'saturation':return true;
    default:return false;
  }
}

/** Movement speed factor from Speed (+20 % per level) and Slowness (−15 % per level), vanilla MULTIPLY_TOTAL modifiers.
 *  For the player controller (walking speed and FOV). */
export function movementMultiplier(effects:readonly StatusEffect[]):number{
  let factor=1;
  for(const e of effects){
    if(e.name==='speed')factor*=1+.2*e.level;
    else if(e.name==='slowness')factor*=1-.15*e.level;
  }
  return Math.max(0,factor);
}

interface Hidden{level:number;ticks:number;hidden:Hidden|null}
/** MobEffectInstance.update on a level/ticks/hidden record; true when the visible level or duration changed. */
function update(current:Hidden,level:number,ticks:number):boolean{
  if(level>current.level){
    if(ticks<current.ticks)current.hidden={level:current.level,ticks:current.ticks,hidden:current.hidden};
    current.level=level;current.ticks=ticks;return true;
  }
  if(current.ticks<ticks){
    if(level===current.level){current.ticks=ticks;return true;}
    if(!current.hidden)current.hidden={level,ticks,hidden:null};else update(current.hidden,level,ticks);
  }
  return false;
}
function countDown(chain:Hidden|null):Hidden|null{
  // Hidden effects count down with the visible one; finished ones drop out of the chain.
  let head=chain,prev:Hidden|null=null;
  for(let h=chain;h;h=h.hidden){
    h.ticks--;
    if(h.ticks<=0){if(prev)prev.hidden=h.hidden;else head=h.hidden;}else prev=h;
  }
  return head;
}
const validLevel=(v:unknown):v is number=>Number.isInteger(v)&&(v as number)>=1&&(v as number)<=MAX_EFFECT_LEVEL;
const validTicks=(v:unknown):v is number=>Number.isInteger(v)&&(v as number)>=1&&(v as number)<=MAX_EFFECT_TICKS;

export class StatusEffects{
  /** Visible effects in the order they were added (read-only for callers). */
  readonly list:StatusEffect[]=[];
  private hidden=new Map<EffectName,Hidden|null>();
  private scratch:StatusEffect[]=[];
  get(name:EffectName):StatusEffect|undefined{for(const e of this.list)if(e.name===name)return e;return undefined;}
  has(name:EffectName):boolean{return this.get(name)!==undefined;}
  /** Level of an active effect, 0 when absent. */
  level(name:EffectName):number{return this.get(name)?.level??0;}
  /** Adds or merges an effect; returns true when it was added or the visible level/duration changed. */
  add(name:EffectName,ticks:number,level:number):boolean{
    if(!isEffectName(name)||!validTicks(ticks)||!validLevel(level))return false;
    const e=this.get(name);
    if(!e){this.list.push({name,level,ticks});this.hidden.set(name,null);return true;}
    const record:Hidden={level:e.level,ticks:e.ticks,hidden:this.hidden.get(name)??null};
    const changed=update(record,level,ticks);
    e.level=record.level;e.ticks=record.ticks;this.hidden.set(name,record.hidden);
    return changed;
  }
  remove(name:EffectName):boolean{
    const i=this.list.findIndex(e=>e.name===name);if(i<0)return false;
    this.list.splice(i,1);this.hidden.delete(name);return true;
  }
  clear(){this.list.length=0;this.hidden.clear();}
  /** One tick: `apply` runs for each effect acting this tick (before it counts down); `changed` when a hidden effect takes
   *  over; `removed` when an effect ends. Callbacks may add or remove effects. */
  tick(apply:(e:StatusEffect)=>void,changed?:(e:StatusEffect)=>void,removed?:(name:EffectName)=>void){
    const run=this.scratch;run.length=0;for(const e of this.list)run.push(e);
    for(const e of run){
      if(!this.list.includes(e))continue;
      if(effectFires(e.name,e.level,e.ticks))apply(e);
      if(!this.list.includes(e))continue;
      e.ticks--;
      let chain=countDown(this.hidden.get(e.name)??null);
      if(e.ticks<=0&&chain){e.level=chain.level;e.ticks=chain.ticks;chain=chain.hidden;this.hidden.set(e.name,chain);changed?.(e);continue;}
      this.hidden.set(e.name,chain);
      if(e.ticks<=0){this.remove(e.name);removed?.(e.name);}
    }
    run.length=0;
  }
  /** [[name, level, ticks, [[level, ticks], ...hidden]], ...] */
  serialize():unknown{
    return this.list.map(e=>{
      const hidden:[number,number][]=[];for(let h=this.hidden.get(e.name)??null;h;h=h.hidden)hidden.push([h.level,h.ticks]);
      return hidden.length?[e.name,e.level,e.ticks,hidden]:[e.name,e.level,e.ticks];
    });
  }
  /** Replaces the list with validated saved data; invalid or duplicate entries are dropped. */
  restore(data:unknown){
    this.clear();if(!Array.isArray(data))return;
    for(const entry of data.slice(0,EFFECT_NAMES.length*2)){
      if(!Array.isArray(entry))continue;
      const [name,level,ticks,hidden]=entry as unknown[];
      if(!isEffectName(name)||!validLevel(level)||!validTicks(ticks)||this.has(name))continue;
      this.list.push({name,level,ticks});
      let head:Hidden|null=null,tail:Hidden|null=null;
      if(Array.isArray(hidden))for(const h of hidden.slice(0,8)){
        if(!Array.isArray(h)||!validLevel(h[0])||!validTicks(h[1]))continue;
        const node:Hidden={level:h[0],ticks:h[1],hidden:null};
        if(tail)tail.hidden=node;else head=node;tail=node;
      }
      this.hidden.set(name,head);
    }
  }
}
