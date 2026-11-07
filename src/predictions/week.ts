/**
 * Pacific/Auckland calendar weeks for the weekly allowance. A week starts on Monday at 00:00 local time, so its
 * length is 167, 168 or 169 hours across daylight-saving changes; weeks are never computed by adding 604,800 seconds.
 * The database computes the authoritative grant weeks with the same rule; these helpers display them and are tested
 * to agree with it.
 */
export const GRANT_ZONE='Pacific/Auckland';
const DAY=86_400_000;
const parts=new Intl.DateTimeFormat('en-NZ',{timeZone:GRANT_ZONE,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
function local(ms:number){
 const p=Object.fromEntries(parts.formatToParts(new Date(ms)).map(x=>[x.type,x.value]));
 return {y:Number(p.year),m:Number(p.month),d:Number(p.day),h:Number(p.hour),min:Number(p.minute),s:Number(p.second)};
}
/** Offset of Auckland local time from UTC at an instant, in milliseconds. */
function offset(ms:number):number {
 const l=local(ms);
 return Date.UTC(l.y,l.m-1,l.d,l.h,l.min,l.s)-Math.floor(ms/1000)*1000;
}
const iso=(utcMidnight:number)=>new Date(utcMidnight).toISOString().slice(0,10);
/** The local Monday (YYYY-MM-DD) of the Auckland week containing `ms`. */
export function weekStartDate(ms:number):string {
 const l=local(ms),day=Date.UTC(l.y,l.m-1,l.d);
 const weekday=(new Date(day).getUTCDay()+6)%7;// Monday = 0
 return iso(day-weekday*DAY);
}
/** The UTC instant of 00:00 Auckland time on a local date. */
export function localMidnight(date:string):number {
 const [y,m,d]=date.split('-').map(Number) as [number,number,number];
 const guess=Date.UTC(y,m-1,d);
 // Two passes settle the offset even when midnight sits next to a transition (NZ changes at 02:00/03:00, never midnight).
 let ms=guess-offset(guess);ms=guess-offset(ms);return ms;
}
/** Next Monday 00:00 Auckland strictly after `ms`, as a UTC instant. */
export function nextGrantAt(ms:number):number {
 const start=weekStartDate(ms),[y,m,d]=start.split('-').map(Number) as [number,number,number];
 return localMidnight(iso(Date.UTC(y,m-1,d)+7*DAY));
}
