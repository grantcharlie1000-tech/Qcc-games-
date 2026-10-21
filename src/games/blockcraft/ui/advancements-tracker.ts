// Advancement and statistics tracking (DOM-free). Unlocks come only from game.events and from polling services:
// the inventory (slots, worn armour, offhand) every tick, and the player state for distance statistics.
import type {AdvancementView,DamageSource,Entity,Game,GameEvents,ItemStack} from '../engine/contracts';
import {blockDef,familyStates} from '../data/blocks';
import {ITEMS,MOB_KINDS} from '../data/items';
import {DAY_TICKS} from '../engine/constants';
import {ADVANCEMENTS,ADVANCEMENT_BY_ID,HUNTED_MOBS,type AdvancementDef,type CountedEvent,type Criterion} from './advancements-data';
import {COUNTER_KEYS,createCounters,daysSurvived,type Counters,type Statistics} from './advancements-stats';

type EventCriterion=Extract<Criterion,{kind:'event'}>['event'];
function index<K>(pick:(c:Criterion)=>readonly K[]|undefined):Map<K,AdvancementDef[]>{
  const map=new Map<K,AdvancementDef[]>();
  for(const a of ADVANCEMENTS)for(const c of a.criteria)for(const key of pick(c)??[]){const list=map.get(key)??[];list.push(a);map.set(key,list);}
  return map;
}
const BY_ITEM=index(c=>c.kind==='item'?c.items:undefined);
const BY_CRAFTED=index(c=>c.kind==='crafted'?c.items:undefined);
const BY_MINED=index(c=>c.kind==='mined'?c.families:undefined);
const BY_PLACED=index(c=>c.kind==='placed'?c.families:undefined);
const BY_EVENT=index<EventCriterion>(c=>c.kind==='event'?[c.event]:undefined);
const COUNTED=new Map<CountedEvent,{def:AdvancementDef;keys:ReadonlySet<string>}[]>();
for(const a of ADVANCEMENTS)if(a.count){
  const list=COUNTED.get(a.count.event)??[];list.push({def:a,keys:new Set(a.count.keys)});COUNTED.set(a.count.event,list);
}
const HOSTILE=new Set(HUNTED_MOBS);
/** Categories that count as mobs for kills (not items, xp orbs, projectiles). */
const MOB_CATEGORIES=new Set(['passive','hostile','water']);
const MOB_KIND_SET=new Set<string>(MOB_KINDS);
/** The damage came from a mob (directly or through its projectile), not primed TNT or another non-living entity. */
const byMob=(source:DamageSource|undefined)=>!!source?.attacker&&MOB_CATEGORIES.has(source.attacker.category);
/** Vanilla credits a kill to the player for 100 ticks after their last hit. */
export const PLAYER_KILL_MEMORY=100;
/** Movement beyond this many blocks in one tick is a teleport (respawn, ender pearl), not travel. */
const TELEPORT_DISTANCE=10;
/** Upper bound on per-id statistic maps restored from a save. */
const MAX_MAP_ENTRIES=512;

const isCount=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=0&&v<=Number.MAX_SAFE_INTEGER;
const isRecord=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const validFamily=(f:string)=>familyStates(f).length>0;
const validItem=(id:string)=>ITEMS.has(id);
const validMob=(k:string)=>MOB_KIND_SET.has(k);
const bump=(map:Record<string,number>,key:string,by:number)=>{map[key]=(map[key]??0)+by;};
const cm=(blocks:number)=>Math.round(blocks*100);

export interface TrackerHooks{
  /** A new advancement was earned in play (not restored): show its toast. */
  granted(def:AdvancementDef):void;
  /** Advancements or progress changed (refresh an open screen). */
  changed():void;
}
export class AdvancementTracker{
  /** Earned advancements → the in-game day they were earned on. */
  private readonly done=new Map<string,number>();
  /** Keys collected by counted goals (foods eaten, kinds killed, animals bred). */
  private readonly collected=new Map<string,Set<string>>();
  private counters:Counters=createCounters();
  private minedBy:Record<string,number>={};private craftedBy:Record<string,number>={};private killedBy:Record<string,number>={};
  /** Entity id → tick the player last hurt it. */
  private readonly recentHits=new Map<number,number>();
  private lastHurtByMob=-Infinity;
  private prevX=0;private prevY=0;private prevZ=0;private hasPrev=false;private airFall=0;
  private offs:(()=>void)[]=[];
  constructor(private readonly game:Game,private readonly hooks:TrackerHooks){}

  attach(){
    if(this.offs.length)return;
    const on=<K extends keyof GameEvents>(type:K,fn:(e:GameEvents[K])=>void)=>this.offs.push(this.game.events.on(type,fn));
    on('blockBroken',e=>{if(e.byPlayer)this.mined(blockDef(e.id).family);});
    on('blockPlaced',e=>{const family=blockDef(e.id).family;this.counters.placed++;this.trigger(BY_PLACED.get(family));});
    on('itemCrafted',e=>this.crafted(e.stack));
    on('itemConsumed',e=>{
      if(ITEMS.get(e.stack.id)?.food&&!ITEMS.get(e.stack.id)?.food?.clearsEffects)this.counters.eaten++;
      this.trigger(BY_EVENT.get('consumed'));this.collect('eat',e.stack.id);
    });
    on('entityDamaged',e=>this.entityDamaged(e.entity,e.amount,e.source));
    on('entityDied',e=>this.entityDied(e.entity,e.source));
    on('animalBred',e=>{this.counters.bred++;this.trigger(BY_EVENT.get('bred'));this.collect('breed',e.kind);});
    on('entityTamed',()=>this.trigger(BY_EVENT.get('tamed')));
    on('playerSlept',()=>{this.counters.slept++;this.trigger(BY_EVENT.get('slept'));});
    on('playerDamaged',e=>{
      this.counters.damageTaken+=Math.round(e.amount*10);
      if(byMob(e.source))this.lastHurtByMob=this.game.time.tick;
    });
    on('playerDied',e=>{
      this.counters.deaths++;this.counters.sinceDeath=0;this.counters.survived=0;
      // Killed by a mob (playerDied.source), or with a mob's kill credit: hurt by one within 100 ticks (a fall after a hit).
      if(byMob(e.source)||this.game.time.tick-this.lastHurtByMob<=PLAYER_KILL_MEMORY)this.trigger(BY_EVENT.get('killed_by_mob'));
      this.lastHurtByMob=-Infinity;this.changed();
    });
    on('playerRespawned',()=>{this.hasPrev=false;});
    on('restored',()=>{this.hasPrev=false;});
    // Nights slept through count for Days Survived, not for the played-time statistics.
    on('timeSkipped',e=>{if(!this.game.survival.dead)this.counters.survived+=((e.to-e.from)%DAY_TICKS+DAY_TICKS)%DAY_TICKS;});
  }
  detach(){for(const off of this.offs)off();this.offs=[];}

  /** 20 Hz: inventory polling, time and distance statistics. */
  tick(){
    const inv=this.game.inventory;
    for(let i=0;i<inv.slots.length;i++)this.holding(inv.slots[i]);
    for(let i=0;i<inv.armor.length;i++)this.holding(inv.armor[i]);
    this.holding(inv.offhand);
    const c=this.counters;c.playTime++;if(!this.game.survival.dead){c.sinceDeath++;c.survived++;}
    this.travel();
    if(this.game.time.tick%200===0)for(const [id,at] of this.recentHits)if(this.game.time.tick-at>PLAYER_KILL_MEMORY)this.recentHits.delete(id);
  }

  has(id:string){return this.done.has(id);}
  /** Earns an advancement; `silent` skips the toast and reward (restoring a save). Returns false if unknown or already earned. */
  grant(id:string,silent=false):boolean{
    const def=ADVANCEMENT_BY_ID.get(id);
    if(!def||this.done.has(id))return false;
    this.done.set(id,this.game.time.day);
    if(!silent){if(def.xp)this.game.survival.addXp(def.xp);this.hooks.granted(def);}
    this.changed();
    return true;
  }
  /** Day an advancement was earned on, or undefined. */
  earnedOn(id:string){return this.done.get(id);}
  /** [done, total] for counted goals. */
  progress(id:string):[number,number]|undefined{
    const def=ADVANCEMENT_BY_ID.get(id);if(!def?.count)return undefined;
    const need=def.count.required;
    return[this.done.has(id)?need:Math.min(need,this.collected.get(id)?.size??0),need];
  }
  /** Keys collected so far by a counted goal, in collection order. */
  collectedKeys(id:string):readonly string[]{return[...this.collected.get(id)??[]];}
  list():AdvancementView[]{
    return ADVANCEMENTS.map(a=>{
      const view:AdvancementView={id:a.id,title:a.title,description:a.description,icon:a.icon,parent:a.parent,done:this.done.has(a.id)};
      const p=this.progress(a.id);if(p)view.progress=p;
      return view;
    });
  }
  statistics():Statistics{
    return{...this.counters,minedBy:{...this.minedBy},craftedBy:{...this.craftedBy},killedBy:{...this.killedBy},
      daysSurvived:daysSurvived(this.counters.survived)};
  }

  reset(){
    this.done.clear();this.collected.clear();this.counters=createCounters();this.minedBy={};this.craftedBy={};this.killedBy={};
    this.recentHits.clear();this.lastHurtByMob=-Infinity;this.hasPrev=false;this.airFall=0;this.changed();
  }
  serialize():unknown{
    const progress:Record<string,string[]>={};
    for(const [id,keys] of this.collected)if(keys.size&&!this.done.has(id))progress[id]=[...keys];
    return{v:1,done:Object.fromEntries(this.done),progress,stats:{...this.counters},minedBy:{...this.minedBy},craftedBy:{...this.craftedBy},
      killedBy:{...this.killedBy}};
  }
  /** Validates untrusted save data; anything invalid is ignored. Restored advancements never toast. */
  restore(data:unknown){
    if(!isRecord(data)||(data.v!==undefined&&data.v!==1))return;
    if(isRecord(data.done))for(const [id,day] of Object.entries(data.done))if(ADVANCEMENT_BY_ID.has(id)&&isCount(day))this.done.set(id,day);
    if(isRecord(data.progress))for(const [id,keys] of Object.entries(data.progress)){
      const def=ADVANCEMENT_BY_ID.get(id);if(!def?.count||!Array.isArray(keys))continue;
      const valid=new Set(def.count.keys),set=new Set<string>();
      for(const k of keys)if(typeof k==='string'&&valid.has(k))set.add(k);
      if(set.size)this.collected.set(id,set);
      if(set.size>=def.count.required)this.grant(id,true);
    }
    if(isRecord(data.stats)){
      for(const k of COUNTER_KEYS)if(isCount(data.stats[k]))this.counters[k]=data.stats[k] as number;
      // Saves from before the survived counter: the time since the last death is the best estimate.
      if(!isCount(data.stats.survived))this.counters.survived=Math.max(this.counters.survived,this.counters.sinceDeath);
    }
    this.minedBy=restoreMap(data.minedBy,validFamily);this.craftedBy=restoreMap(data.craftedBy,validItem);this.killedBy=restoreMap(data.killedBy,validMob);
    this.hasPrev=false;this.changed();
  }

  // ---- Criteria -------------------------------------------------------------------------------
  private trigger(defs:readonly AdvancementDef[]|undefined){if(defs)for(const d of defs)if(!this.done.has(d.id))this.grant(d.id);}
  private holding(stack:ItemStack|null){if(stack)this.trigger(BY_ITEM.get(stack.id));}
  private collect(event:CountedEvent,key:string){
    for(const {def,keys} of COUNTED.get(event)??[]){
      if(!keys.has(key)||this.done.has(def.id))continue;
      let set=this.collected.get(def.id);if(!set)this.collected.set(def.id,set=new Set());
      if(set.has(key))continue;
      set.add(key);
      if(set.size>=def.count!.required)this.grant(def.id);else this.changed();
    }
  }
  private mined(family:string){
    this.counters.mined++;bump(this.minedBy,family,1);this.trigger(BY_MINED.get(family));
  }
  private crafted(stack:ItemStack){
    if(!ITEMS.has(stack.id)||!(stack.count>0))return;
    this.counters.crafted+=stack.count;bump(this.craftedBy,stack.id,stack.count);this.trigger(BY_CRAFTED.get(stack.id));
  }
  /** Player-caused damage to a mob: kill credit, Take Aim and (vanilla Player.attack) Damage Dealt for melee hits only,
   *  counting no more than the health the mob had. Items, xp orbs and other non-living entities never count. */
  private entityDamaged(entity:Entity,amount:number,source:DamageSource){
    if(!source.byPlayer&&source.kind!=='player')return;
    if(!MOB_CATEGORIES.has(entity.category))return;
    this.recentHits.set(entity.id,this.game.time.tick);
    if(source.kind==='player'&&Number.isFinite(amount)&&amount>0){
      const lost=Math.min(amount,Number.isFinite(entity.health)?Math.max(0,entity.health+amount):amount);
      this.counters.damageDealt+=Math.round(lost*10);
    }
    if(source.kind==='projectile'&&source.projectile?.kind==='arrow')this.trigger(BY_EVENT.get('arrow_hit'));
  }
  private entityDied(entity:Entity,source:DamageSource){
    const hit=this.recentHits.get(entity.id);this.recentHits.delete(entity.id);
    const byPlayer=!!source.byPlayer||source.kind==='player'||(hit!==undefined&&this.game.time.tick-hit<=PLAYER_KILL_MEMORY);
    if(!byPlayer||!MOB_CATEGORIES.has(entity.category))return;
    this.counters.kills++;bump(this.killedBy,entity.kind,1);
    this.trigger(BY_EVENT.get('kill_any'));
    if(entity.category==='hostile'||HOSTILE.has(entity.kind))this.trigger(BY_EVENT.get('kill_hostile'));
    this.collect('kill',entity.kind);
  }
  private changed(){this.hooks.changed();}

  /** Vanilla Player.checkMovementStatistics: the first matching state wins. Swimming pose → swum (3D); eyes in water →
   *  walked under water (3D); feet in water → walked on water (horizontal); on a ladder → climbed (upward only); on the
   *  ground → sprinted, crouched or walked (horizontal); otherwise airborne travel (creative flight, sprint jumps) above
   *  25 cm a tick → flown. Falls of 2 blocks or more count on landing, except for players who can fly (creative). */
  private travel(){
    const p=this.game.player.state,c=this.counters;
    if(this.hasPrev){
      const dx=p.x-this.prevX,dy=p.y-this.prevY,dz=p.z-this.prevZ,h=Math.hypot(dx,dz),d=Math.hypot(dx,dy,dz);
      if(d<=TELEPORT_DISTANCE){
        if(p.swimming)c.swim+=cm(d);
        else if(p.headInWater)c.walkUnderWater+=cm(d);
        else if(p.inWater)c.walkOnWater+=cm(h);
        else if(p.onLadder){if(dy>0)c.climb+=cm(dy);}
        else if(p.onGround){const n=cm(h);if(p.sprinting)c.sprint+=n;else if(p.sneaking)c.crouch+=n;else c.walk+=n;}
        else if(cm(h)>25)c.fly+=cm(h);
      }
    }
    if(p.onGround){if(this.airFall>=2&&this.game.settings.mode!=='creative')c.fall+=cm(this.airFall);this.airFall=0;}
    else if(p.inWater||p.flying||p.onLadder)this.airFall=0;
    else this.airFall=p.fallDistance;
    this.prevX=p.x;this.prevY=p.y;this.prevZ=p.z;this.hasPrev=true;
  }
}
function restoreMap(value:unknown,valid:(key:string)=>boolean):Record<string,number>{
  const out:Record<string,number>={};if(!isRecord(value))return out;
  let n=0;
  for(const [k,v] of Object.entries(value)){if(n>=MAX_MAP_ENTRIES)break;if(valid(k)&&isCount(v)&&v>0){out[k]=v;n++;}}
  return out;
}
