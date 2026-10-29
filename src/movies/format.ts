// Runtime and clock text for the Movies pages. Minutes come from title metadata; seconds come from saved positions.

// "2h 49m", "2h" or "49m". A count that is not a positive number of minutes gives no text.
export function formatRuntime(minutes:number):string {
 const total=Number.isFinite(minutes)?Math.round(minutes):0;
 if(total<=0)return '';
 const hours=Math.floor(total/60),rest=total%60;
 if(!hours)return `${rest}m`;
 return rest?`${hours}h ${rest}m`:`${hours}h`;
}

// "m:ss", or "h:mm:ss" from one hour on. Whole seconds only, and a missing or negative position reads as the start.
export function formatClock(seconds:number):string {
 const total=Number.isFinite(seconds)&&seconds>0?Math.floor(seconds):0;
 const hours=Math.floor(total/3600),minutes=Math.floor(total%3600/60),rest=total%60;
 const pad=(value:number)=>String(value).padStart(2,'0');
 return hours?`${hours}:${pad(minutes)}:${pad(rest)}`:`${minutes}:${pad(rest)}`;
}
