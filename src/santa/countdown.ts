/** Pure countdown arithmetic. Everything is UTC epoch milliseconds; no local calendar is involved. */
export interface Remaining {days:number;hours:number;minutes:number;seconds:number;totalSeconds:number}
export type SantaPhase='countdown'|'flying'|'home';

/** How long the simulated journey lasts; must match the last stop in tracker/route.ts. */
export const JOURNEY_MS=26*60*60*1000;

/**
 * Whole seconds left, rounded up, so the display reads 0 exactly at departure and
 * never shows "0 seconds" while time is still left.
 */
export function remaining(nowMs:number,targetMs:number):Remaining{
  const totalSeconds=Math.max(0,Math.ceil((targetMs-nowMs)/1000));
  return {
    days:Math.floor(totalSeconds/86400),
    hours:Math.floor(totalSeconds%86400/3600),
    minutes:Math.floor(totalSeconds%3600/60),
    seconds:totalSeconds%60,
    totalSeconds,
  };
}

export function phase(nowMs:number,departureMs:number):SantaPhase{
  if(nowMs<departureMs)return 'countdown';
  return nowMs<departureMs+JOURNEY_MS?'flying':'home';
}

/**
 * Milliseconds until the displayed second next changes, plus a small margin so the timer
 * fires just after the boundary (browsers may fire timers a little early).
 */
export function msToNextTick(nowMs:number,targetMs:number):number{
  const left=targetMs-nowMs;
  if(left<=0)return 1000;
  const into=left%1000;
  return (into===0?1000:into)+15;
}

export const pad=(value:number)=>String(value).padStart(2,'0');

/** Short spoken form for screen readers, e.g. "48 days, 3 hours and 2 minutes". */
export function spoken(r:Remaining):string{
  const parts:string[]=[];
  const add=(n:number,unit:string)=>{if(n)parts.push(`${n} ${unit}${n===1?'':'s'}`);};
  add(r.days,'day');add(r.hours,'hour');add(r.minutes,'minute');
  if(!r.days&&!r.hours)add(r.seconds,'second');
  if(!parts.length)return 'less than a second';
  return parts.length===1?parts[0]:`${parts.slice(0,-1).join(', ')} and ${parts.at(-1)}`;
}
