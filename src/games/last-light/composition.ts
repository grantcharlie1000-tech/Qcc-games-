import {enemyBounds} from './enemies';
import type {Level,Platform,Rect,Station} from './levels';
import {quarterSet} from './quarter-sets';

/** Visible silhouettes, measured from the authored one-pixel art. Anchors are
 * always the interaction's real centre/floor; presentation never moves a goal. */
export const GOAL_FOOTPRINTS={
 doorway:{x:-48,y:-72,w:82,h:78},escape:{x:-48,y:-77,w:111,h:83},
 ferry:{x:-62,y:-61,w:125,h:78},airship:{x:-62,y:-107,w:125,h:124},
 engine:{x:-28,y:-98,w:56,h:100},signal:{x:-32,y:-70,w:65,h:72},
 lifeTree:{x:-74,y:-139,w:148,h:142},relay:{x:-26,y:-67,w:52,h:69},
 gardenRelay:{x:-24,y:-61,w:48,h:63},dawn:{x:-17,y:-64,w:34,h:66},
 smallDoor:{x:-21,y:-48,w:42,h:50},smallEngine:{x:-23,y:-50,w:46,h:52},
 smallSignal:{x:-23,y:-30,w:46,h:32},smallRelay:{x:-23,y:-39,w:46,h:41},
 beacon:{x:-12,y:-24,w:24,h:26},
} as const satisfies Record<string,Rect>;
export type GoalArt=keyof typeof GOAL_FOOTPRINTS;
export type StationArt='lamp'|'valve'|'bell'|'survivor'|'smallLamp'|'smallValve'|'smallBell';
const STATION_FOOTPRINTS:Record<StationArt,Rect>={
 lamp:{x:-10,y:-58,w:21,h:59},valve:{x:-23,y:-54,w:48,h:56},
 bell:{x:-26,y:-51,w:53,h:54},survivor:{x:-12,y:-38,w:24,h:39},
 smallLamp:{x:-10,y:-39,w:21,h:40},smallValve:{x:-18,y:-36,w:36,h:37},
 smallBell:{x:-14,y:-34,w:28,h:36},
};
export interface PropComposition {x:number;y:number;bounds:Rect;marker:Rect|null;support:number;clear:boolean}
export interface GoalComposition extends PropComposition {art:GoalArt}
export interface StationComposition extends PropComposition {art:StationArt}
const goalCache=new WeakMap<Level,GoalComposition>();
const stationCache=new WeakMap<Level,Map<number,StationComposition>>();
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const translate=(r:Rect,x:number,y:number):Rect=>({x:r.x+x,y:r.y+y,w:r.w,h:r.h});
const expand=(r:Rect,n:number):Rect=>({x:r.x-n,y:r.y-n,w:r.w+n*2,h:r.h+n*2});

/** The complete moving-platform sweep, including the material lip and a small
 * underside. Deep architectural supports separately reserve these prop bounds. */
export function platformArtEnvelope(p:Platform):Rect {
 const dx=p.kind==='moving'&&p.axis!=='y'?(p.travel??0):0,dy=p.kind==='moving'&&p.axis==='y'?(p.travel??0):0;
 return {x:p.x-4-dx,y:p.y-8-dy,w:p.w+8+dx*2,h:p.h+20+dy*2};
}
function supportAt(l:Level,x:number,y:number){return l.platforms.find(p=>x>=p.x&&x<=p.x+p.w&&Math.abs(p.y-y)<2)?.id??-1;}
function movingBounds(l:Level,support:number,r:Rect):Rect {
 const p=l.platforms.find(p=>p.id===support);if(!p||p.kind!=='moving')return r;
 const travel=p.travel??0;return p.axis==='y'?{...r,y:r.y-travel,h:r.h+travel*2}:{...r,x:r.x-travel,w:r.w+travel*2};
}

/** Clearance is checked against the complete art rectangle, never only its
 * trunk or anchor. Gameplay targets keep a quiet margin around their silhouette. */
export function foregroundFits(l:Level,bounds:Rect,support=-1,station=-1,goal=false):boolean {
 if(bounds.x<4||bounds.x+bounds.w>l.width-4)return false;
 if(l.platforms.some(p=>p.id!==support&&overlaps(bounds,platformArtEnvelope(p))))return false;
 if((l.enemies??[]).some(e=>overlaps(bounds,expand(enemyBounds(e),5))))return false;
 if(l.hazards.some(h=>{const travel=h.kind==='saw'?(h.travel??0):0;return overlaps(bounds,{x:h.x-travel-7,y:h.y-7,w:h.w+travel*2+14,h:h.h+(h.kind==='crusher'?(h.travel??94):0)+14});}))return false;
 if(l.pickups.some(p=>overlaps(bounds,{x:p.x-14,y:p.y-19,w:28,h:38})))return false;
 if(l.stations.some(s=>s.id!==station&&overlaps(bounds,movingBounds(l,s.platform,translate(STATION_FOOTPRINTS[s.kind],s.x,s.y)))))return false;
 if((l.checkpoints??[l.checkpoint]).some(cp=>overlaps(bounds,{x:cp.x-4,y:cp.y-50,w:30,h:50})))return false;
 if(overlaps(bounds,{x:l.spawn.x-10,y:l.spawn.y-14,w:36,h:38}))return false;
 if(!goal&&overlaps(bounds,expand(l.exit,5)))return false;
 return true;
}
function markerFor(l:Level,bounds:Rect,support:number,station=-1,goal=false):Rect|null {
 // Short symbols replace long repeated instructions. Their own footprint must
 // fit too, including the swept positions of moving objectives.
 const candidates=[{x:bounds.x+bounds.w/2-9,y:bounds.y-17,w:18,h:12},
  {x:bounds.x+bounds.w+5,y:bounds.y+8,w:18,h:12},
  {x:bounds.x-23,y:bounds.y+8,w:18,h:12}];
 return candidates.find(r=>foregroundFits(l,movingBounds(l,support,r),support,station,goal))??null;
}
export function goalComposition(l:Level):GoalComposition {
 const cached=goalCache.get(l);if(cached)return cached;
 const x=l.berth?.x??l.exit.x+l.exit.w/2,y=l.berth?.y??l.exit.y+l.exit.h,support=supportAt(l,l.exit.x+l.exit.w/2,l.exit.y+l.exit.h);
 let choices:GoalArt[];
 switch(l.goal){
  case 'relay':choices=l.world===1||l.setting==='garden'?['lifeTree','gardenRelay','smallRelay','beacon']:['relay','smallRelay','beacon'];break;
  case 'ferry':choices=l.setting==='sky'?['airship','ferry','smallRelay','beacon']:['ferry','smallRelay','beacon'];break;
  case 'engine':choices=['engine','smallEngine','beacon'];break;
  case 'signal':choices=['signal','smallSignal','beacon'];break;
  case 'shelter':case 'rescue':choices=['doorway','smallDoor','beacon'];break;
  case 'escape':choices=['escape','doorway','smallDoor','beacon'];break;
  default:choices=['dawn','smallRelay','beacon'];
 }
 const art=choices.find(kind=>foregroundFits(l,translate(GOAL_FOOTPRINTS[kind],x,y),support,-1,true))??'beacon';
 const bounds=translate(GOAL_FOOTPRINTS[art],x,y),clear=foregroundFits(l,bounds,support,-1,true);
 const plan={x,y,bounds,art,support,clear,marker:l.berth?{x:l.exit.x+10,y:y-48,w:18,h:12}:markerFor(l,bounds,support,-1,true)};
 goalCache.set(l,plan);return plan;
}
export function goalArtBounds(l:Level):Rect{return goalComposition(l).bounds;}
export function stationComposition(l:Level,s:Station):StationComposition {
 let map=stationCache.get(l);if(!map){map=new Map();stationCache.set(l,map);}const cached=map.get(s.id);if(cached)return cached;
 const choices:StationArt[]=s.kind==='lamp'?['lamp','smallLamp']:s.kind==='valve'?['valve','smallValve']:s.kind==='bell'?['bell','smallBell']:['survivor'];
 const art=choices.find(kind=>foregroundFits(l,movingBounds(l,s.platform,translate(STATION_FOOTPRINTS[kind],s.x,s.y)),s.platform,s.id))??choices.at(-1)!;
 const bounds=translate(STATION_FOOTPRINTS[art],s.x,s.y),clear=foregroundFits(l,movingBounds(l,s.platform,bounds),s.platform,s.id);
 const plan={x:s.x,y:s.y,bounds,art,support:s.platform,clear,marker:markerFor(l,bounds,s.platform,s.id)};
 map.set(s.id,plan);return plan;
}
export function stationArtBounds(l:Level,s:Station):Rect{return movingBounds(l,s.platform,stationComposition(l,s).bounds);}

/** Completion travel is another visible footprint. Compact fixtures stay put;
 * full ferries/lifts move only as far as both their art and the courier fit. */
export function completionMotion(l:Level,courier:Rect):{x:number;y:number} {
 const p=goalComposition(l),boat=p.art==='ferry'||p.art==='airship',lift=p.art==='engine'||p.art==='smallEngine';
 if(!boat&&!lift)return {x:0,y:0};
 const max=boat?150:p.art==='smallEngine'?24:82;
 for(let amount=max;amount>0;amount--){
  const actor=boat?{...courier,w:courier.w+amount}:{...courier,y:courier.y-amount,h:courier.h+amount};
  if(!foregroundFits(l,actor,p.support,-1,true))continue;
  if(boat&&!foregroundFits(l,{...p.bounds,w:p.bounds.w+amount},p.support,-1,true))continue;
  return {x:boat?amount:0,y:lift?-amount:0};
 }
 return {x:0,y:0};
}

const serviceDoors=new WeakMap<Level,{x:number;y:number;side:number}|null>();
/** A real onward threshold accompanies machinery exits. It uses unused space
 * on the destination deck, with its complete silhouette checked up front. */
export function serviceDoor(l:Level):{x:number;y:number;side:number}|null {
 if(!['relay','signal','dawn'].includes(l.goal))return null;
 if(serviceDoors.has(l))return serviceDoors.get(l)!;
 const goal=goalComposition(l),p=l.platforms[l.mainCount-1];
 // An authored set builds its own door where the exit stands.
 if(quarterSet(l)){const door={x:l.exit.x+l.exit.w/2,y:p.y,side:1};serviceDoors.set(l,door);return door;}
 for(const side of [1,-1]){
  const x=side>0?p.x+p.w-24:p.x+24,bounds={x:x-28,y:p.y-58,w:56,h:60};
  if(overlaps(expand(goal.bounds,7),bounds)||!foregroundFits(l,bounds,p.id,-1,true))continue;
  const door={x,y:p.y,side};serviceDoors.set(l,door);return door;
 }
 // Compact hatch on the outgoing lip if a tall fixture occupies the back wall.
 const door={x:p.x+p.w-18,y:p.y,side:1};serviceDoors.set(l,door);return door;
}
