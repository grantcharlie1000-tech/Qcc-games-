// The weather clock, a port of vanilla Java ServerLevel.advanceWeatherCycle (1.19.3+ ranges):
// independent rain and thunder flags with countdowns, an optional commanded clear spell, and rain and
// thunder levels that ease by 0.01 per tick toward their flags. Pure: randomness is passed in.
import type {WeatherState} from '../engine/contracts';

/** Inclusive tick ranges sampled uniformly (vanilla UniformInt). */
export type TickRange=readonly [number,number];
/** Clear spell before rain: 0.5 to 7.5 days. */
export const RAIN_DELAY:TickRange=[12000,180000];
/** Rain spell: 0.5 to 1 day. */
export const RAIN_DURATION:TickRange=[12000,24000];
/** Time before the thunder flag turns on. */
export const THUNDER_DELAY:TickRange=[12000,180000];
/** Thunder flag duration (a storm only while it also rains). */
export const THUNDER_DURATION:TickRange=[3600,15600];
/** Rain and thunder levels move this much per tick (5 seconds from clear to full rain). */
export const LEVEL_STEP=.01;
/** Longest duration accepted by set() (vanilla /weather limit). */
export const MAX_WEATHER_TICKS=1000000;
/** Vanilla Level.isRaining(): rain level above this counts as raining for gameplay. */
export const RAINING_LEVEL=.2;
/** Vanilla Level.isThundering(): effective thunder level above this lets lightning strike. */
export const THUNDERING_LEVEL=.9;

export interface WeatherCycle{
  raining:boolean;thundering:boolean;
  /** Commanded clear spell remaining (set('clear', ticks)); counters wait while it runs. */
  clearTime:number;rainTime:number;thunderTime:number;
  /** 0..1 eased levels. */
  rainLevel:number;thunderLevel:number;
}

export const sampleRange=(range:TickRange,random:()=>number)=>range[0]+Math.min(range[1]-range[0],Math.floor(random()*(range[1]-range[0]+1)));
/** A new world: every counter at zero, so the first tick samples a clear spell of 0.5..7.5 days. */
export function newCycle():WeatherCycle{return{raining:false,thundering:false,clearTime:0,rainTime:0,thunderTime:0,rainLevel:0,thunderLevel:0};}

/** One tick. `enabled` = settings.weatherCycle: when false the counters freeze but the levels still ease. */
export function advanceCycle(c:WeatherCycle,random:()=>number,enabled:boolean):void{
  if(enabled){
    if(c.clearTime>0){
      c.clearTime--;
      c.thunderTime=c.thundering?0:1;c.rainTime=c.raining?0:1;
      c.thundering=false;c.raining=false;
    }else{
      if(c.thunderTime>0){if(--c.thunderTime===0)c.thundering=!c.thundering;}
      else c.thunderTime=sampleRange(c.thundering?THUNDER_DURATION:THUNDER_DELAY,random);
      if(c.rainTime>0){if(--c.rainTime===0)c.raining=!c.raining;}
      else c.rainTime=sampleRange(c.raining?RAIN_DURATION:RAIN_DELAY,random);
    }
  }
  c.thunderLevel=stepLevel(c.thunderLevel,c.thundering);
  c.rainLevel=stepLevel(c.rainLevel,c.raining);
}
/** Snapped to hundredths so repeated steps stay exact (0.2 after 20 ticks is not 0.20000000000000004). */
const stepLevel=(level:number,up:boolean)=>Math.max(0,Math.min(1,Math.round((level+(up?LEVEL_STEP:-LEVEL_STEP))*100)/100));

const validTicks=(ticks:number|undefined)=>typeof ticks==='number'&&Number.isFinite(ticks)&&ticks>=1?Math.min(MAX_WEATHER_TICKS,Math.floor(ticks)):0;
/** Commands a weather like vanilla /weather (setWeatherParameters). Without a duration: rain 0.5..1 day, a thunderstorm
 *  3600..15600 ticks; clear without a duration resets the cycle (vanilla resetWeatherCycle after sleeping), so a normal
 *  clear spell of 0.5..7.5 days follows. */
export function setCycle(c:WeatherCycle,state:WeatherState,ticks:number|undefined,random:()=>number):void{
  const fixed=validTicks(ticks);
  if(state==='clear'){
    c.raining=false;c.thundering=false;
    if(fixed){c.clearTime=fixed;c.rainTime=0;c.thunderTime=0;}
    else{c.clearTime=0;c.rainTime=sampleRange(RAIN_DELAY,random);c.thunderTime=sampleRange(THUNDER_DELAY,random);}
    return;
  }
  const duration=fixed||sampleRange(state==='thunder'?THUNDER_DURATION:RAIN_DURATION,random);
  c.clearTime=0;c.rainTime=duration;c.thunderTime=duration;c.raining=true;c.thundering=state==='thunder';
}

/** The commanded state: thunder only while it also rains (a thunder flag in clear weather has no effect). */
export function cycleState(c:WeatherCycle):WeatherState{return c.raining?c.thundering?'thunder':'rain':'clear';}

export function serializeCycle(c:WeatherCycle){
  return{r:c.raining,t:c.thundering,ct:c.clearTime,rt:c.rainTime,tt:c.thunderTime,rl:c.rainLevel,tl:c.thunderLevel};
}
/** Validates untrusted saved data; null when anything is wrong. */
export function parseCycle(data:unknown):WeatherCycle|null{
  if(!data||typeof data!=='object')return null;
  const d=data as Record<string,unknown>;
  const count=(v:unknown)=>Number.isInteger(v)&&(v as number)>=0&&(v as number)<=MAX_WEATHER_TICKS;
  const level=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0&&v<=1;
  if(typeof d.r!=='boolean'||typeof d.t!=='boolean'||!count(d.ct)||!count(d.rt)||!count(d.tt)||!level(d.rl)||!level(d.tl))return null;
  return{raining:d.r,thundering:d.t,clearTime:d.ct as number,rainTime:d.rt as number,thunderTime:d.tt as number,rainLevel:d.rl as number,thunderLevel:d.tl as number};
}
