/** Safe text helpers: no innerHTML anywhere; links are only ever http(s). */
export {codePoints} from '../social/shared';
const ESCAPES:Record<string,string>={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
export const escapeHtml=(s:string):string=>s.replace(/[&<>"']/g,c=>ESCAPES[c]!);

export type Token={type:'text';text:string}|{type:'link'|'mention'|'tag';text:string;href:string};
const TOKEN=/(https?:\/\/\S+)|(?<!\S)(@[A-Za-z0-9_.-]{3,24})|(?<!\S)(#[\p{L}\p{N}_]{1,50})/giu;
const TRAILING=/[.,!?:;)\]'"]+$/;
function safeHttp(url:string):boolean {
 try{const parsed=new URL(url);return (parsed.protocol==='https:'||parsed.protocol==='http:')&&parsed.hostname!=='';}catch{return false;}
}
export function tokenizeRichText(text:string):Token[] {
 const tokens:Token[]=[];
 const push=(token:Token)=>{
  const last=tokens[tokens.length-1];
  if(token.type==='text'){if(!token.text)return;if(last?.type==='text'){last.text+=token.text;return;}}
  tokens.push(token);
 };
 let index=0;
 for(const match of text.matchAll(TOKEN)){
  const start=match.index!;let raw=match[0];
  if(start<index)continue;
  if(match[1]){
   const trimmed=raw.replace(TRAILING,'');
   if(!safeHttp(trimmed)){continue;}
   push({type:'text',text:text.slice(index,start)});
   push({type:'link',text:trimmed,href:trimmed});
   push({type:'text',text:raw.slice(trimmed.length)});
  }else if(match[2]){
   push({type:'text',text:text.slice(index,start)});
   push({type:'mention',text:raw,href:`#/social/u/${raw.slice(1)}`});
  }else{
   push({type:'text',text:text.slice(index,start)});
   push({type:'tag',text:raw,href:`#/social/search?q=${encodeURIComponent(raw)}`});
  }
  index=start+raw.length;raw='';
 }
 push({type:'text',text:text.slice(index)});
 return tokens;
}
/** Builds DOM nodes only: user text goes through createTextNode, never innerHTML. */
export function renderRichText(text:string):DocumentFragment {
 const fragment=document.createDocumentFragment();
 for(const token of tokenizeRichText(text)){
  if(token.type==='text'){fragment.append(document.createTextNode(token.text));continue;}
  const a=document.createElement('a');
  a.href=token.href;a.textContent=token.text;
  if(token.type==='link'){a.className='apps-link';a.target='_blank';a.rel='noopener noreferrer nofollow ugc';}
  else a.className=token.type==='mention'?'apps-mention':'apps-tag';
  fragment.append(a);
 }
 return fragment;
}

const MONTHS=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
export function relativeTime(iso:string,now:number=Date.now()):string {
 const at=Date.parse(iso);if(Number.isNaN(at))return '';
 const seconds=Math.max(0,(now-at)/1000);
 if(seconds<45)return 'now';
 if(seconds<3600)return `${Math.max(1,Math.floor(seconds/60))}m`;
 if(seconds<86400)return `${Math.floor(seconds/3600)}h`;
 if(seconds<604800)return `${Math.floor(seconds/86400)}d`;
 const date=new Date(at),year=date.getFullYear()===new Date(now).getFullYear()?'':` ${date.getFullYear()}`;
 return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}`;
}
export function clockTime(iso:string):string {
 const at=Date.parse(iso);if(Number.isNaN(at))return '';
 const date=new Date(at),hours=date.getHours();
 return `${hours%12||12}:${String(date.getMinutes()).padStart(2,'0')} ${hours<12?'am':'pm'}`;
}
const dayStart=(time:number)=>{const d=new Date(time);return new Date(d.getFullYear(),d.getMonth(),d.getDate()).getTime();};
export function dayLabel(iso:string,now:number=Date.now()):string {
 const at=Date.parse(iso);if(Number.isNaN(at))return '';
 const days=Math.round((dayStart(now)-dayStart(at))/86400000);
 if(days===0)return 'Today';
 if(days===1)return 'Yesterday';
 const date=new Date(at);
 return `${DAYS[date.getDay()]} ${date.getDate()} ${MONTHS[date.getMonth()]}`;
}
