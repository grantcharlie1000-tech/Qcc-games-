/** Corn Clicker state shape, fresh state, versioned serialization and tolerant restoration. */
import {Big} from './big';
import {PRODUCER_IDS,upgradeById,permById,achievementById,VARIETIES,SKINS,SCARECROW,FESTIVALS,GOLDEN,FESTIVAL,PESTS,type ProducerId,type SkinId,type VarietyId,type GoldenKind,type FestivalId,type ScarecrowBonus} from './data';

export const SAVE_VERSION=2;
export type ParticleLevel='off'|'low'|'full';
export interface RunStats {earned:Big;clicks:number;clickEarned:Big;golden:number;harvests:number;pests:number;festivals:number;producersBought:number;upgradesBought:number;playSeconds:number;offlineEarned:Big;bestCps:Big}
export interface LifeStats extends RunStats {replants:number;planted:number;mutations:number;offlineReturns:number;skinsChanged:number;bestBurst:number}
export interface Plot {v:VarietyId;age:number}
export interface ActiveEffect {remaining:number;duration:number}
export interface GoldenOnScreen {x:number;y:number;life:number;maxLife:number;kind:GoldenKind}
export interface Pest {id:number;stolen:Big;angle:number}
export interface Options {sound:boolean;volume:number;reducedMotion:boolean;particles:ParticleLevel;numbers:'short'|'long'|'scientific';ticker:boolean}
export interface State {
  rev:number;created:number;lastTick:number;rng:number;
  kernels:Big;
  producers:Record<ProducerId,number>;
  upgrades:Set<string>;
  perms:Set<string>;
  seeds:number;seedsClaimed:number;
  achievements:Set<string>;
  skin:SkinId;
  run:RunStats;life:LifeStats;
  golden:{next:number;onScreen:GoldenOnScreen|null;effects:Partial<Record<Exclude<GoldenKind,'lucky'>,ActiveEffect>>};
  garden:{plots:(Plot|null)[];discovered:Set<VarietyId>;mutationClock:number};
  festival:{next:number;active:{id:FestivalId;remaining:number}|null};
  scarecrow:{bonuses:ScarecrowBonus[];cooldown:number};
  pests:{list:Pest[];next:number;enabled:boolean;nextId:number};
  options:Options;
  tutorial:Set<string>;
  lastOffline:{seconds:number;earned:Big;capped:boolean}|null;
}

export function freshRun():RunStats {return {earned:Big.ZERO,clicks:0,clickEarned:Big.ZERO,golden:0,harvests:0,pests:0,festivals:0,producersBought:0,upgradesBought:0,playSeconds:0,offlineEarned:Big.ZERO,bestCps:Big.ZERO};}
export function freshState(now:number,seed=Math.floor(Math.random()*2**31)):State {
  return {
    rev:0,created:now,lastTick:now,rng:seed>>>0,
    kernels:Big.ZERO,
    producers:Object.fromEntries(PRODUCER_IDS.map(id=>[id,0])) as Record<ProducerId,number>,
    upgrades:new Set(),perms:new Set(),seeds:0,seedsClaimed:0,achievements:new Set(),skin:'classic',
    run:freshRun(),life:{...freshRun(),replants:0,planted:0,mutations:0,offlineReturns:0,skinsChanged:0,bestBurst:0},
    golden:{next:GOLDEN.firstDelay[0]+(GOLDEN.firstDelay[1]-GOLDEN.firstDelay[0])*0.5,onScreen:null,effects:{}},
    garden:{plots:Array(16).fill(null),discovered:new Set(['sweet']),mutationClock:0},
    festival:{next:FESTIVAL.minDelay,active:null},
    scarecrow:{bonuses:[],cooldown:0},
    pests:{list:[],next:PESTS.minDelay,enabled:true,nextId:1},
    options:{sound:false,volume:0.6,reducedMotion:false,particles:'full',numbers:'short',ticker:true},
    tutorial:new Set(),
    lastOffline:null,
  };
}

// ───────────── Serialization ─────────────
const runToJson=(r:RunStats)=>({...r,earned:r.earned.toString(),clickEarned:r.clickEarned.toString(),offlineEarned:r.offlineEarned.toString(),bestCps:r.bestCps.toString()});
export function serialize(s:State):Record<string,unknown> {
  return {
    v:SAVE_VERSION,rev:s.rev,created:s.created,lastTick:s.lastTick,rng:s.rng,
    kernels:s.kernels.toString(),producers:{...s.producers},upgrades:[...s.upgrades],perms:[...s.perms],
    seeds:s.seeds,seedsClaimed:s.seedsClaimed,achievements:[...s.achievements],skin:s.skin,
    run:runToJson(s.run),life:{...runToJson(s.life),replants:s.life.replants,planted:s.life.planted,mutations:s.life.mutations,offlineReturns:s.life.offlineReturns,skinsChanged:s.life.skinsChanged,bestBurst:s.life.bestBurst},
    golden:{next:s.golden.next,onScreen:s.golden.onScreen,effects:s.golden.effects},
    garden:{plots:s.garden.plots,discovered:[...s.garden.discovered],mutationClock:s.garden.mutationClock},
    festival:s.festival,scarecrow:s.scarecrow,
    pests:{list:s.pests.list.map(p=>({id:p.id,stolen:p.stolen.toString(),angle:p.angle})),next:s.pests.next,enabled:s.pests.enabled,nextId:s.pests.nextId},
    options:s.options,tutorial:[...s.tutorial],
    lastOffline:s.lastOffline?{...s.lastOffline,earned:s.lastOffline.earned.toString()}:null,
  };
}

export class SaveError extends Error {}
type Obj=Record<string,unknown>;
const isObj=(v:unknown):v is Obj=>typeof v==='object'&&v!==null&&!Array.isArray(v);
const num=(v:unknown,fallback:number,min=-Infinity,max=Infinity)=>typeof v==='number'&&Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;
const int=(v:unknown,fallback=0,max=1e12)=>Math.floor(num(v,fallback,0,max));
const big=(v:unknown,fallback=Big.ZERO)=>Big.parse(v)??fallback;
const strings=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string'):[];

/**
 * Older layouts are upgraded step by step. Version 1 (the pre-release layout) stored a flat
 * `kernels` number, `buildings` instead of `producers`, and no lifetime stats.
 */
export function migrate(raw:unknown):Obj {
  if(!isObj(raw))throw new SaveError('Save data is not an object.');
  let data:Obj={...raw};
  const version=typeof data.v==='number'?data.v:1;
  if(version>SAVE_VERSION)throw new SaveError('This save comes from a newer version of Corn Clicker.');
  if(version<2){
    data={...data,v:2,producers:data.producers??data.buildings,
      life:data.life??{earned:data.totalEarned??data.kernels,clicks:data.clicks},
      run:data.run??{earned:data.totalEarned??data.kernels,clicks:data.clicks}};
  }
  return data;
}

function parseRun(v:unknown):RunStats {
  const r=isObj(v)?v:{};
  return {earned:big(r.earned),clicks:int(r.clicks),clickEarned:big(r.clickEarned),golden:int(r.golden),harvests:int(r.harvests),pests:int(r.pests),festivals:int(r.festivals),producersBought:int(r.producersBought),upgradesBought:int(r.upgradesBought),playSeconds:num(r.playSeconds,0,0),offlineEarned:big(r.offlineEarned),bestCps:big(r.bestCps)};
}
const VARIETY_IDS=new Set(VARIETIES.map(v=>v.id));
const GOLDEN_KINDS=['lucky','bumper','storm'];

/** Validates and normalises any stored snapshot. Throws SaveError when it is unusable. */
export function deserialize(raw:unknown,now:number):State {
  const d=migrate(raw);
  if(!('kernels' in d)||Big.parse(d.kernels)===undefined)throw new SaveError('Save data has no valid kernel balance.');
  const s=freshState(now,int(d.rng,1,2**32-1)||1);
  s.rev=int(d.rev);s.created=num(d.created,now,0);s.lastTick=num(d.lastTick,now,0);
  s.kernels=big(d.kernels);
  const producers=isObj(d.producers)?d.producers:{};
  for(const id of PRODUCER_IDS)s.producers[id]=int(producers[id],0,1e6);
  s.upgrades=new Set(strings(d.upgrades).filter(id=>upgradeById.has(id)));
  s.perms=new Set(strings(d.perms).filter(id=>permById.has(id)));
  s.seeds=int(d.seeds,0,1e15);s.seedsClaimed=Math.max(int(d.seedsClaimed,0,1e15),s.seeds);
  s.achievements=new Set(strings(d.achievements).filter(id=>achievementById.has(id)));
  s.skin=SKINS.some(k=>k.id===d.skin)?d.skin as SkinId:'classic';
  s.run=parseRun(d.run);
  const life=isObj(d.life)?d.life:{};
  s.life={...parseRun(life),replants:int(life.replants),planted:int(life.planted),mutations:int(life.mutations),offlineReturns:int(life.offlineReturns),skinsChanged:int(life.skinsChanged),bestBurst:int(life.bestBurst)};
  // Lifetime totals can never trail the current run.
  if(s.life.earned.lt(s.run.earned))s.life.earned=s.run.earned;
  if(s.life.clicks<s.run.clicks)s.life.clicks=s.run.clicks;
  const golden=isObj(d.golden)?d.golden:{};
  s.golden.next=num(golden.next,s.golden.next,0,3600);
  const screen=isObj(golden.onScreen)?golden.onScreen:null;
  s.golden.onScreen=screen&&GOLDEN_KINDS.includes(screen.kind as string)?{x:num(screen.x,0.5,0,1),y:num(screen.y,0.5,0,1),life:num(screen.life,0,0,120),maxLife:num(screen.maxLife,GOLDEN.lifetime,1,120),kind:screen.kind as GoldenKind}:null;
  const effects=isObj(golden.effects)?golden.effects:{};
  for(const kind of ['bumper','storm'] as const){
    const e=effects[kind];
    if(isObj(e)){const duration=num(e.duration,0,0,3600);const remaining=num(e.remaining,0,0,duration);if(remaining>0)s.golden.effects[kind]={remaining,duration};}
  }
  const garden=isObj(d.garden)?d.garden:{};
  const plots=Array.isArray(garden.plots)?garden.plots:[];
  s.garden.plots=Array.from({length:16},(_,i)=>{const p=plots[i];return isObj(p)&&VARIETY_IDS.has(p.v as VarietyId)?{v:p.v as VarietyId,age:num(p.age,0,0,1e9)}:null;});
  s.garden.discovered=new Set(['sweet',...strings(garden.discovered).filter(v=>VARIETY_IDS.has(v as VarietyId))] as VarietyId[]);
  s.garden.mutationClock=num(garden.mutationClock,0,0,600);
  const festival=isObj(d.festival)?d.festival:{};
  s.festival.next=num(festival.next,s.festival.next,0,1e5);
  const active=isObj(festival.active)?festival.active:null;
  s.festival.active=active&&typeof active.id==='string'&&active.id in FESTIVALS?{id:active.id as FestivalId,remaining:num(active.remaining,0,0,FESTIVAL.duration)}:null;
  const scarecrow=isObj(d.scarecrow)?d.scarecrow:{};
  s.scarecrow={bonuses:[...new Set(strings(scarecrow.bonuses).filter(b=>b in SCARECROW))].slice(0,2) as ScarecrowBonus[],cooldown:num(scarecrow.cooldown,0,0,600)};
  const pests=isObj(d.pests)?d.pests:{};
  s.pests={list:(Array.isArray(pests.list)?pests.list:[]).filter(isObj).slice(0,PESTS.max).map((p,i)=>({id:int(p.id,i+1),stolen:big(p.stolen),angle:num(p.angle,0,0,360)})),next:num(pests.next,PESTS.minDelay,0,3600),enabled:pests.enabled!==false,nextId:int(pests.nextId,1)};
  const options=isObj(d.options)?d.options:{};
  s.options={sound:options.sound===true,volume:num(options.volume,0.6,0,1),reducedMotion:options.reducedMotion===true,
    particles:(['off','low','full'] as const).find(v=>v===options.particles)??'full',
    numbers:(['short','long','scientific'] as const).find(v=>v===options.numbers)??'short',ticker:options.ticker!==false};
  s.tutorial=new Set(strings(d.tutorial));
  const off=isObj(d.lastOffline)?d.lastOffline:null;
  s.lastOffline=off?{seconds:num(off.seconds,0,0),earned:big(off.earned),capped:off.capped===true}:null;
  return s;
}

// ───────────── Export strings ─────────────
const EXPORT_PREFIX='CORNCLICKER';
function checksum(text:string):string {let h=2166136261;for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return (h>>>0).toString(36);}
function toBase64(text:string):string {const bytes=new TextEncoder().encode(text);let bin='';for(const b of bytes)bin+=String.fromCharCode(b);return btoa(bin);}
function fromBase64(text:string):string {const bin=atob(text);return new TextDecoder().decode(Uint8Array.from(bin,c=>c.charCodeAt(0)));}
export function exportString(data:unknown):string {const json=JSON.stringify(data);return `${EXPORT_PREFIX}.${toBase64(json)}.${checksum(json)}`;}
export function importString(text:string):unknown {
  const parts=text.trim().replace(/\s+/g,'').split('.');
  if(parts.length!==3||parts[0]!==EXPORT_PREFIX)throw new SaveError('That is not a Corn Clicker save code.');
  let json:string;
  try{json=fromBase64(parts[1]);}catch{throw new SaveError('The save code is damaged (it could not be decoded).');}
  if(checksum(json)!==parts[2])throw new SaveError('The save code is incomplete or was changed. Copy the whole code and try again.');
  try{return JSON.parse(json);}catch{throw new SaveError('The save code is damaged.');}
}
