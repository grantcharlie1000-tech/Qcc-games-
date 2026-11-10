import {enemyBounds} from './enemies';
import type {Level,Rect} from './levels';

type DressingKind='resident'|'washing'|'tree'|'cat'|'lantern';
export interface WorldDressing {readonly kind:DressingKind;readonly platform:number;readonly x:number;readonly y:number;readonly bounds:Readonly<Rect>}
// One authored domestic moment per chapter. Empty chapters leave room for the
// chase, isolation or finale. The location is a preference, never permission to
// occupy an interaction, a pickup's approach, or the underside of another ledge.
const HABITATS:readonly ([DressingKind,number,boolean]|null)[]=[
 ['washing',.46,true],null,['cat',.245,false],null,null,null,null,null,
 ['tree',.73,false],['resident',.5,true],['tree',.63,true],['cat',.71,true],null,['resident',.56,true],null,['tree',.43,true],
 ['resident',.58,true],null,['resident',.45,true],null,['lantern',.65,true],['cat',.51,true],null,null,
 ['resident',.57,true],null,null,null,['resident',.48,true],['tree',.6,true],null,null,
 ['resident',.53,true],null,['cat',.65,true],null,['resident',.66,true],['lantern',.55,true],null,null,
];
const dressingCache=new WeakMap<Level,readonly WorldDressing[]>();
const overlaps=(a:Readonly<Rect>,b:Readonly<Rect>)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
/** Conservative swept envelopes, including the visible platform foundations. */
function dressingClear(l:Level,b:Readonly<Rect>,support:number):boolean{
 if((l.enemies??[]).some(e=>overlaps(b,enemyBounds(e))))return false;
 if(l.platforms.some(p=>{if(p.id===support)return false;const dx=p.kind==='moving'&&p.axis!=='y'?p.travel??0:0,dy=p.kind==='moving'&&p.axis==='y'?p.travel??0:0;return overlaps(b,{x:p.x-dx-8,y:p.y-dy-9,w:p.w+dx*2+16,h:p.h+dy*2+49});}))return false;
 const e=l.exit;if(overlaps(b,{x:e.x-74,y:e.y-56,w:e.w+148,h:e.h+76}))return false;
 if(overlaps(b,{x:l.spawn.x-44,y:l.spawn.y-44,w:104,h:88})||overlaps(b,{x:124,y:l.platforms[0].y-62,w:82,h:64}))return false;
 if((l.checkpoints??[l.checkpoint]).some(cp=>overlaps(b,{x:cp.x-24,y:cp.y-66,w:72,h:70})))return false;
 if(l.pickups.some(p=>overlaps(b,{x:p.x-30,y:p.y-31,w:60,h:62})))return false;
 if(l.stations.some(s=>{const p=l.platforms.find(p=>p.id===s.platform),dx=p?.kind==='moving'&&p.axis!=='y'?p.travel??0:0,dy=p?.kind==='moving'&&p.axis==='y'?p.travel??0:0;return overlaps(b,{x:s.x-dx-62,y:s.y-dy-115,w:124+dx*2,h:130+dy*2});}))return false;
 return !l.hazards.some(h=>{const travel=h.travel??0;return overlaps(b,{x:h.x-travel-30,y:h.y-30,w:h.w+travel*2+60,h:h.h+(h.kind==='crusher'?(h.travel??94):0)+60});});
}
/** Stable, cached scene dressing; rendering never changes the run or level. */
export function worldDressing(l:Level):readonly WorldDressing[]{
 const cached=dressingCache.get(l);if(cached)return cached;
 const preferred=HABITATS[l.id],result:WorldDressing[]=[];
 if(preferred){
  const [kind,position,branch]=preferred;
  const width=kind==='washing'?112:kind==='tree'?66:kind==='resident'?56:kind==='cat'?52:42;
  const height=kind==='washing'?68:kind==='tree'?77:kind==='lantern'?65:kind==='cat'?29:46;
  const platforms=l.platforms.filter(p=>p.id!==0&&p.kind==='stone'&&p.h>12&&p.w>=width+40).sort((a,b)=>{
   const score=(p:typeof a)=>Math.abs(p.x+p.w*.5-l.width*position)+(p.branch===branch?0:240);
   return score(a)-score(b)||a.id-b.id;
  });
  for(const p of platforms){
   // Stay back from takeoff edges. The outer third opposite the next main
   // landing gets first refusal; dressing never spans an entire landing.
   const next=l.platforms.find(q=>q.id===p.id+1&&!q.branch),away=next&&next.x<p.x?.68:.32;
   for(const fraction of [away,1-away,.5]){
    const x=Math.round(p.x+p.w*fraction),bounds=Object.freeze({x:x-width/2,y:p.y-height,w:width,h:height});
    if(bounds.x<p.x+20||bounds.x+bounds.w>p.x+p.w-20||!dressingClear(l,bounds,p.id))continue;
    result.push(Object.freeze({kind,platform:p.id,x,y:p.y,bounds}));break;
   }
   if(result.length)break;
  }
 }
 const plan=Object.freeze(result);dressingCache.set(l,plan);return plan;
}

/** Only grounded, stationary couriers can reach a cat on their own ledge. */
export function nearbyAnimal(l:Level,s:{x:number;y:number;grounded:boolean;ground:number;vx:number;respawn:number}) {
 if(!s.grounded||s.respawn>0||Math.abs(s.vx)>24)return undefined;
 return worldDressing(l).find(a=>a.kind==='cat'&&a.platform===s.ground&&Math.abs(s.y+24-a.y)<3&&Math.abs(s.x+8-a.x)>=19&&Math.abs(s.x+8-a.x)<=35);
}
