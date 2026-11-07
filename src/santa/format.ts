/**
 * Shows a UTC instant in the visitor's own time zone. Intl works out the zone's offset for
 * that instant itself, including daylight saving, so a visitor in Sydney (summer) and one in
 * London (winter) each see the correct local wall time for the same moment.
 */
const make=(options:Intl.DateTimeFormatOptions,timeZone?:string)=>{
  try{return new Intl.DateTimeFormat(undefined,{...options,...(timeZone?{timeZone}:{})});}
  catch{return new Intl.DateTimeFormat('en-GB',{...options,...(timeZone?{timeZone}:{})});}
};
const localDay=make({weekday:'long',day:'numeric',month:'long'});
const localTime=make({hour:'numeric',minute:'2-digit'});
const localZone=make({timeZoneName:'short'});
const utcTime=make({hour:'2-digit',minute:'2-digit',hourCycle:'h23'},'UTC');
const utcDay=make({day:'numeric',month:'long'},'UTC');

export function visitorZone():string{
  try{return Intl.DateTimeFormat().resolvedOptions().timeZone||'your time zone';}catch{return 'your time zone';}
}
function zoneName(ms:number):string{
  const part=localZone.formatToParts(ms).find(p=>p.type==='timeZoneName');
  return part?.value??'';
}
/** "Thursday 24 December at 11:00 pm (GMT+13)". */
export function localWhen(ms:number):string{
  const zone=zoneName(ms);
  return `${localDay.format(ms)} at ${localTime.format(ms)}${zone?` (${zone})`:''}`;
}
const shortWhen=make({weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
/** "Thu 24 Dec, 10:00 pm": compact, but keeps the day because it can differ from Santa's. */
export function localShort(ms:number):string{return shortWhen.format(ms);}
export function localClock(ms:number):string{return localTime.format(ms);}
/** "10:00 UTC on 24 December". */
export function utcWhen(ms:number):string{return `${utcTime.format(ms)} UTC on ${utcDay.format(ms)}`;}

export function offsetText(ms:number):string{
  const abs=Math.abs(ms),minutes=Math.round(abs/60000);
  const amount=minutes>=120?`${Math.round(minutes/60)} hours`:minutes>=1?`${minutes} minute${minutes===1?'':'s'}`:`${Math.round(abs/1000)} seconds`;
  return `${amount} ${ms>0?'behind':'ahead'}`;
}
