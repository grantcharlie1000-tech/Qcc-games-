/** Pure view helpers for Predictions: routes, chart geometry and time copy. Unit tested; no DOM. */
import type {HistoryPoint,MarketState} from './shared';

export type Route=
 |{kind:'explore';view:string;category:string;q:string}
 |{kind:'market';id:string;side:'yes'|'no'|null}
 |{kind:'calls'}
 |{kind:'rankings'}
 |{kind:'ask';id:string|null}
 |{kind:'review'}
 |{kind:'missing'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const VIEWS=[['all','All open'],['closing','Closing this week'],['new','Recently added'],['school','Your school'],['waiting','Waiting for result'],['resolved','Resolved']] as const;
export function parseRoute(hash:string):Route {
 const [path='',query='']=hash.replace(/^#\/predictions\/?/,'').split('?');
 const parts=path.split('/').filter(Boolean),params=new URLSearchParams(query);
 const [head,second]=parts;
 if(!head){
  const view=params.get('view')??'all';
  return {kind:'explore',view:VIEWS.some(([v])=>v===view)?view:'all',category:params.get('category')??'',q:(params.get('q')??'').slice(0,60)};
 }
 if(head==='m'&&second&&UUID.test(second)&&parts.length===2){const side=params.get('side');return {kind:'market',id:second.toLowerCase(),side:side==='yes'||side==='no'?side:null};}
 if(head==='calls'&&parts.length===1)return {kind:'calls'};
 if(head==='rankings'&&parts.length===1)return {kind:'rankings'};
 if(head==='ask'&&parts.length===1)return {kind:'ask',id:null};
 if(head==='ask'&&second&&UUID.test(second)&&parts.length===2)return {kind:'ask',id:second.toLowerCase()};
 if(head==='review'&&parts.length===1)return {kind:'review'};
 return {kind:'missing'};
}
export function exploreHash(view:string,category:string,q:string):string {
 const params=new URLSearchParams();
 if(view&&view!=='all')params.set('view',view);if(category)params.set('category',category);if(q)params.set('q',q);
 const text=params.toString();return '#/predictions'+(text?'?'+text:'');
}

export interface ChartGeometry {line:string;area:string;last:{x:number;y:number};flat:boolean;ticks:{y:number;label:string}[]}
/**
 * Step chart of the YES price on a fixed 0-100% axis (never rescaled to exaggerate small moves). Starts at 50% at
 * publication and holds each executed price until the next trade. No points are invented between trades.
 */
export function chartGeometry(history:HistoryPoint[],start:number,end:number,width:number,height:number):ChartGeometry {
 const span=Math.max(1,end-start);
 const x=(ms:number)=>Math.round(Math.min(width,Math.max(0,(ms-start)/span*width))*10)/10;
 const y=(ppm:number)=>Math.round((1-ppm/1e6)*height*10)/10;
 const points:[number,number][]=[[0,y(500000)]];
 for(const point of history){
  const px=x(Date.parse(point.at)),last=points[points.length-1]!;
  points.push([px,last[1]],[px,y(point.yesPpm)]);
 }
 const final=points[points.length-1]!;
 points.push([width,final[1]]);
 const line=points.map(([px,py],i)=>`${i?'L':'M'}${px} ${py}`).join('');
 return {line,area:`${line}L${width} ${height}L0 ${height}Z`,last:{x:width,y:final[1]},flat:history.length===0,
  ticks:[0,25,50,75,100].map(p=>({y:Math.round((1-p/100)*height*10)/10,label:`${p}%`}))};
}

const dateFormat=new Intl.DateTimeFormat('en-NZ',{weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
// Allowance days are Auckland calendar days wherever the device is.
const dayFormat=new Intl.DateTimeFormat('en-NZ',{weekday:'long',day:'numeric',month:'long',timeZone:'Pacific/Auckland'});
export const formatWhen=(iso:string)=>dateFormat.format(new Date(iso));
export const formatDay=(iso:string)=>dayFormat.format(new Date(iso));
/** "Closes in 3 days", "Closes in 4 h", "Closed": short, honest and computed from server-supplied instants. */
export function closingText(state:MarketState,closeAt:string,now:number):string {
 if(state==='resolved'||state==='void')return 'Settled';
 if(state!=='open')return 'Trading closed';
 const ms=Date.parse(closeAt)-now;
 if(ms<=0)return 'Trading closed';
 const hours=ms/3_600_000;
 if(hours<1)return `Closes in ${Math.max(1,Math.round(ms/60_000))} min`;
 if(hours<36)return `Closes in ${Math.round(hours)} h`;
 return `Closes in ${Math.round(hours/24)} days`;
}
/** `<input type="datetime-local">` value for an instant, in the device's local time. */
export function toLocalInput(iso:string):string {
 const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';
 const p=(n:number)=>String(n).padStart(2,'0');
 return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
export function fromLocalInput(value:string):string {const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toISOString();}
