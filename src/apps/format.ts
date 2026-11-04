import {clockTime} from './text';
const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
/** 1.2k, 12k, 1.2m; the exact number belongs in a title. */
export function compactCount(n:number):string {
 if(n<1000)return String(n);
 const scale=(value:number,suffix:string)=>{const v=Math.floor(value*10)/10;return (v>=10?String(Math.floor(v)):String(v))+suffix;};
 return n<1_000_000?scale(n/1000,'k'):scale(n/1_000_000,'m');
}
/** "4:12 pm · 3 Nov 2026" */
export function fullTime(iso:string):string {
 const at=Date.parse(iso);if(Number.isNaN(at))return '';
 const d=new Date(at);return `${clockTime(iso)} · ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function memberSince(iso:string):string {
 const at=Date.parse(iso);if(Number.isNaN(at))return '';
 try{return 'Member since '+new Intl.DateTimeFormat('en-NZ',{month:'long',year:'numeric'}).format(at);}catch{return '';}
}
/** Dev builds only: tests shorten poll intervals with window.__QCC_POLL_SCALE__ (0 to 1), as the launcher does. */
const SCALE=(()=>{
 if(!import.meta.env.DEV)return 1;
 const value=Number((window as unknown as {__QCC_POLL_SCALE__?:number}).__QCC_POLL_SCALE__);return value>0&&value<=1?value:1;
})();
export const pollMs=(ms:number):number=>Math.max(50,ms*SCALE);
