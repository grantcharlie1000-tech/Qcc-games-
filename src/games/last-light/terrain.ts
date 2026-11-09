import {drawCrumble} from './crumble-art';
import {type Level,type Platform,type Rect} from './levels';
import {PLAYER_H,PLAYER_W,type Run} from './model';
import {goalComposition,stationArtBounds,stationComposition} from './composition';
import {paintMaterial,paintFoundation} from './materials';
export const noise=(a:number,b:number)=>Math.abs(Math.sin(a*127.1+b*311.7)*43758.5453)%1;
const cache=new Map<string,HTMLCanvasElement>();
let boundsCache=new WeakMap<Level,WeakMap<Platform,Rect>>();
const overlaps=(a:Rect,b:Rect)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const padded=(r:Rect,n:number):Rect=>({x:r.x-n,y:r.y-n,w:r.w+n*2,h:r.h+n*2});
function swept(p:Platform,r:Rect=p):Rect {
 const dx=p.kind==='moving'&&p.axis!=='y'?(p.travel??0):0,dy=p.kind==='moving'&&p.axis==='y'?(p.travel??0):0;
 return {x:r.x-dx,y:r.y-dy,w:r.w+dx*2,h:r.h+dy*2};
}
/** A support is an occasional architectural anchor, never mandatory texture.
 * Reserve the full ordinary jump (79px) plus courier height over every lower
 * route, and the complete travel of lifts, shuttles and moving hazards. */
export function terrainArtBounds(p:Platform,l:Level):Rect {
 let levelCache=boundsCache.get(l);if(!levelCache){levelCache=new WeakMap();boundsCache.set(l,levelCache);}const cached=levelCache.get(p);if(cached)return cached;
 const body={x:p.x,y:p.y,w:p.w,h:p.h},anchor=p.id===0||p.id===l.mainCount-1||(p.id+l.id)%4===0;
 let bounds=body;
 if(p.kind==='stone'&&!p.branch&&p.w>=170&&anchor){
  const support={x:p.x,y:p.y+p.h,w:p.w,h:28},blockers:Rect[]=[];
  for(const q of l.platforms){
   if(q.id===p.id)continue;const r=swept(q),headroom=PLAYER_H+(q.kind==='spring'?172:80),margin=PLAYER_W+8;
   blockers.push({x:r.x-margin,y:r.y-headroom,w:r.w+margin*2,h:r.h+headroom+8});
  }
  // Also keep the open gaps between consecutive landings free of hanging art.
  for(let i=1;i<l.platforms.length;i++){
   const a=l.platforms[i-1],b=l.platforms[i];if(a.id===p.id||b.id===p.id||a.branch!==b.branch)continue;
   const left=a.x+a.w<=b.x?a:b.x+b.w<=a.x?b:null;if(!left)continue;
   const right=left===a?b:a,gap=right.x-left.x-left.w;if(gap>180)continue;
   const top=Math.min(a.y,b.y)-PLAYER_H-80;
   blockers.push({x:left.x+left.w,y:top,w:gap,h:Math.max(a.y,b.y)-top+8});
  }
  for(const h of l.hazards){const travel=h.kind==='saw'?(h.travel??0):0;blockers.push(padded({x:h.x-travel,y:h.y,w:h.w+travel*2,h:h.h},h.kind==='steam'?18:10));}
  for(const item of l.pickups)blockers.push({x:item.x-18,y:item.y-23,w:36,h:46});
  const goal=goalComposition(l);blockers.push(padded(goal.bounds,8));if(goal.marker)blockers.push(padded(goal.marker,8));
  for(const station of l.stations){
   blockers.push(padded(stationArtBounds(l,station),8));const marker=stationComposition(l,station).marker;
   if(marker){const platform=l.platforms.find(q=>q.id===station.platform);blockers.push(padded(platform?swept(platform,marker):marker,8));}
  }
  for(const cp of l.checkpoints??[l.checkpoint])blockers.push({x:cp.x-8,y:cp.y-58,w:40,h:66});
  if(!blockers.some(r=>overlaps(support,r)))bounds={...body,h:p.h+28};
 }
 levelCache.set(p,bounds);return bounds;
}
function tile(p:Platform,l:Level):HTMLCanvasElement {
 const bounds=terrainArtBounds(p,l),key=`${l.id}/${l.world}/${l.setting}/${p.kind}/${p.id}/${p.w}/${p.h}/${bounds.h}`;let canvas=cache.get(key);if(canvas)return canvas;
 canvas=document.createElement('canvas');canvas.width=p.w+8;canvas.height=bounds.h+8;
 const c=canvas.getContext('2d')!;c.translate(4,8);
 paintFoundation(c,p,l,bounds.h);
 paintMaterial(c,p,l);
 cache.set(key,canvas);if(cache.size>100)cache.delete(cache.keys().next().value!);return canvas;
}
export function clearTerrainCache(){cache.clear();boundsCache=new WeakMap();}
export function drawPlatform(c:CanvasRenderingContext2D,p:Platform,x:number,y:number,s:Run,l:Level,reduced:boolean){
 const timer=s.crumbles[p.id];x=Math.round(x);y=Math.round(y);
 if(p.kind==='crumble'&&timer!==undefined){drawCrumble(c,p,tile(p,l),x,y,timer,reduced);return;}
 c.drawImage(tile(p,l),x-4,y-8);
 if(p.kind==='belt'){
  c.fillStyle='#302e38';c.fillRect(x,y+3,p.w,13);const shift=reduced?0:(s.clock*35*(p.direction??1))%18;
  for(let i=-18;i<p.w+18;i+=18){const xx=x+i+shift;if(xx<x||xx+8>x+p.w)continue;c.strokeStyle='#dbc697';c.beginPath();c.moveTo(xx,y+6);c.lineTo(xx+6,y+9);c.lineTo(xx,y+12);c.stroke();}
 }
 if(p.kind==='spring'){
  const compress=s.ground===p.id?3:0;
  c.fillStyle='#183c3c';c.fillRect(x,y,p.w,13);
  for(let xx=x+9;xx<x+p.w-5;xx+=16){c.strokeStyle='#8bac91';c.lineWidth=1;c.beginPath();c.moveTo(xx,y+12);c.lineTo(xx-4,y+9);c.lineTo(xx+4,y+6+compress);c.lineTo(xx-4,y+3+compress);c.stroke();}
  c.fillStyle='#638d74';c.fillRect(x,y,p.w,4);c.fillStyle='#c4d4a0';c.fillRect(x,y,p.w,2);
  for(let xx=x+5;xx<x+p.w-4;xx+=9){c.fillStyle='#e0e2b8';c.fillRect(xx,y,3,1);c.fillStyle='#3f665d';c.fillRect(xx,y+3,2,2);}
 }
 if(p.kind==='moving'){
  // Bearings live inside the slab; decorative suspension cables used to cut
  // through overhead routes and lamps as a lift moved through its full sweep.
  for(const xx of [x+6,x+p.w-10]){c.fillStyle='#3a4e54';c.fillRect(xx-1,y+5,6,8);c.fillStyle='#a6b9b2';c.fillRect(xx,y+6,4,2);c.fillStyle='#718d8c';c.fillRect(xx+1,y+9,2,3);}
 }
}
