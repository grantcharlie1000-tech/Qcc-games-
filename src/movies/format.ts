// Display text for the Movies pages: runtimes and clocks from title metadata and saved positions, and the initials a person without a photo shows.

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

// The initials a person without a photo shows: the first letter of the first and the last name, letters only, so "(Adam) West" gives AW.
// A name with no letters gives "?". Two characters at most, and a letter outside Basic Latin stays whole.
export function initials(name:string):string {
 const letters=name.split(/\s+/).map(word=>word.match(/\p{L}/u)?.[0]??'').filter(Boolean);
 const picked=letters.length>1?[letters[0],letters[letters.length-1]]:letters;
 return picked.length?Array.from(picked.join('').toUpperCase()).slice(0,2).join(''):'?';
}
