import {mediaUrl} from '../media/client';
export interface AvatarSource {username:string;displayName?:string;avatar:string|null}
const TINTS=['#4c3a8f','#1f5c55','#6b4420','#6a2b45','#2f4a6b','#4a5320'];
export const monogram=(who:AvatarSource):string=>(Array.from((who.displayName||who.username||'?').trim())[0]??'?').toUpperCase();
export const tintOf=(username:string):string=>{let sum=0;for(const c of username)sum+=c.charCodeAt(0);return TINTS[sum%TINTS.length]!;};
/** DESIGN 3.2: round avatar, thumb image or a monogram on a stable tint. The name beside it is the label, so the image is decorative. */
export function avatar(who:AvatarSource,size=44):HTMLSpanElement {
 const el=document.createElement('span');
 el.className='apps-avatar';el.style.setProperty('--avatar',`${size}px`);
 const letter=()=>{el.replaceChildren(document.createTextNode(monogram(who)));el.classList.add('is-letter');el.style.background=tintOf(who.username);};
 if(who.avatar){
  const img=document.createElement('img');
  img.alt='';img.loading='lazy';img.decoding='async';img.src=mediaUrl(who.avatar,'thumb');
  img.addEventListener('error',letter,{once:true});
  el.append(img);
 }else letter();
 return el;
}
