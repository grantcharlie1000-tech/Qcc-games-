// Statistics (DOM-free): counters kept by the advancement tracker and the vanilla Java statistics formatting.
import {DAY_TICKS} from '../engine/constants';

/** Plain counters. Distances are centimetres, times ticks and damage tenths of a health point, like vanilla.
 *  sinceDeath counts played ticks only (vanilla Time Since Last Death); survived also adds the nights skipped by sleeping
 *  and drives Days Survived. */
export const COUNTER_KEYS=['playTime','sinceDeath','survived','walk','sprint','crouch','walkOnWater','walkUnderWater','swim','climb','fall','fly',
  'mined','placed','crafted','eaten','kills','bred','slept','damageDealt','damageTaken','deaths'] as const;
export type CounterKey=typeof COUNTER_KEYS[number];
export type Counters=Record<CounterKey,number>;
export interface Statistics extends Counters{
  /** Blocks mined per block family, items crafted per item id, mobs killed per kind. */
  minedBy:Record<string,number>;craftedBy:Record<string,number>;killedBy:Record<string,number>;
  /** Whole in-game days lived since the last death (nights slept through count). */
  readonly daysSurvived:number;
}
export function createCounters():Counters{
  const c={} as Counters;for(const k of COUNTER_KEYS)c[k]=0;return c;
}
export const daysSurvived=(survivedTicks:number)=>Math.floor(survivedTicks/DAY_TICKS);

/** Java's "########0.00" decimal format. */
const decimal=(v:number)=>(Math.round(v*100)/100).toFixed(2);
/** Vanilla distance formatting: centimetres, metres with two decimals above half a metre, kilometres above half a kilometre. */
export function formatDistance(cm:number):string{
  const m=cm/100,km=m/1000;
  return km>.5?`${decimal(km)} km`:m>.5?`${decimal(m)} m`:`${Math.round(cm)} cm`;
}
/** Vanilla time formatting from ticks: seconds, minutes, hours, days or years. */
export function formatTime(ticks:number):string{
  const s=ticks/20,min=s/60,h=min/60,d=h/24,y=d/365;
  if(y>.5)return`${decimal(y)} y`;
  if(d>.5)return`${decimal(d)} d`;
  if(h>.5)return`${decimal(h)} h`;
  if(min>.5)return`${decimal(min)} min`;
  return`${Number.isInteger(s)?s.toFixed(1):String(Math.round(s*100)/100)} s`;
}
const count=(n:number)=>Math.round(n).toLocaleString('en-US');
const hearts=(tenths:number)=>{const v=tenths/20;return`${v.toFixed(1)} ${v===1?'heart':'hearts'}`;};
export interface StatRow{key:string;label:string;value:string}
/** The general statistics list shown on the Statistics tab, in display order. */
export function statRows(s:Readonly<Statistics>):StatRow[]{
  const rows:[string,string,string][]=[
    ['daysSurvived','Days Survived',count(s.daysSurvived)],['playTime','Play Time',formatTime(s.playTime)],
    ['sinceDeath','Time Since Last Death',formatTime(s.sinceDeath)],
    ['walk','Distance Walked',formatDistance(s.walk)],['sprint','Distance Sprinted',formatDistance(s.sprint)],
    ['crouch','Distance Crouched',formatDistance(s.crouch)],['walkOnWater','Distance Walked on Water',formatDistance(s.walkOnWater)],
    ['walkUnderWater','Distance Walked under Water',formatDistance(s.walkUnderWater)],['swim','Distance Swum',formatDistance(s.swim)],
    ['climb','Distance Climbed',formatDistance(s.climb)],['fall','Distance Fallen',formatDistance(s.fall)],
    ['fly','Distance Flown',formatDistance(s.fly)],
    ['mined','Blocks Mined',count(s.mined)],['placed','Blocks Placed',count(s.placed)],['crafted','Items Crafted',count(s.crafted)],
    ['eaten','Food Eaten',count(s.eaten)],['kills','Mobs Killed',count(s.kills)],['bred','Animals Bred',count(s.bred)],
    ['slept','Times Slept in a Bed',count(s.slept)],['damageDealt','Damage Dealt',hearts(s.damageDealt)],
    ['damageTaken','Damage Taken',hearts(s.damageTaken)],['deaths','Deaths',count(s.deaths)]];
  return rows.map(([key,label,value])=>({key,label,value}));
}
/** Highest entries of a per-id counter (ties by id), for the "most mined / crafted / killed" lists. */
export function topEntries(map:Readonly<Record<string,number>>,limit:number):[string,number][]{
  return Object.entries(map).sort((a,b)=>b[1]-a[1]||(a[0]<b[0]?-1:1)).slice(0,limit);
}
