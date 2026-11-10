import {drawCrumble} from './crumble-art';
import {type Level,type Platform,type Rect} from './levels';
import {PLAYER_H,PLAYER_W,type Run} from './model';
import {goalComposition,stationArtBounds,stationComposition} from './composition';
import {paintMaterial,paintFoundation} from './materials';
import {drawBarge,paintQuarterDeck} from './quarter-place';
import {quarterSet,setDeckTile} from './quarter-sets';
import {laneMover} from './set-lane';
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
 if(quarterSet(l))return setDeckTile(p,l);
 const bounds=terrainArtBounds(p,l),key=`${l.id}/${l.world}/${l.setting}/${p.kind}/${p.id}/${p.w}/${p.h}/${bounds.h}`;let canvas=cache.get(key);if(canvas)return canvas;
 canvas=document.createElement('canvas');canvas.width=p.w+8;canvas.height=bounds.h+8;
 const c=canvas.getContext('2d',{willReadFrequently:true})!;c.translate(4,8);
 if(!paintQuarterDeck(c,p,l)){paintFoundation(c,p,l,bounds.h);paintMaterial(c,p,l);}
 cache.set(key,canvas);if(cache.size>100)cache.delete(cache.keys().next().value!);return canvas;
}
export function clearTerrainCache(){cache.clear();boundsCache=new WeakMap();}
/** A thin eave is a porch canopy, frame head beam or footbridge. Each end
 * stands on the nearest static main-route deck within one storey below it;
 * over a canal, an end that no barge sweeps under gets a pier into the water.
 * Looked up once per level and drawn behind every actor. */
const postCache=new WeakMap<Platform,{x:number;y:number;support:number}[]>();
function eavePosts(p:Platform,l:Level){
 let posts=postCache.get(p);
 if(!posts){
  posts=[];let deck:{x:number;y:number;support:number}|null=null;
  for(const end of [p.x+8,p.x+p.w-8])for(const q of l.platforms)if(q!==p&&!q.branch&&q.kind!=='moving'&&q.x<=end&&q.x+q.w>=end&&q.y>p.y+p.h&&q.y-p.y<=120&&(!deck||q.y<deck.y))deck={x:end,y:q.y,support:q.id};
  if(deck)posts.push(deck);
  else if(l.water!==null)for(const end of [p.x+8,p.x+p.w-8])if(!l.platforms.some(q=>q!==p&&q.y>p.y&&q.x-(q.kind==='moving'?q.travel??0:0)-8<=end&&q.x+q.w+(q.kind==='moving'?q.travel??0:0)+8>=end))posts.push({x:end,y:l.water,support:-1});
  postCache.set(p,posts);
 }
 return posts;
}
export function drawPlatform(c:CanvasRenderingContext2D,p:Platform,x:number,y:number,s:Run,l:Level,reduced:boolean){
 const timer=s.crumbles[p.id];x=Math.round(x);y=Math.round(y);
 const set=quarterSet(l);
 if(set){
  // A set's landings are parts of its building: the tile is the floor, tread,
  // roof or hull itself, and anything that travels with it is drawn first.
  if(p.kind==='moving')set.mover?.(c,p,x,y,l,s.clock,reduced);
  if(p.kind==='crumble'&&timer!==undefined){drawCrumble(c,p,tile(p,l),x,y,timer,reduced);return;}
  c.drawImage(tile(p,l),x-4,y-8);return;
 }
 if(p.kind==='grate'&&!(l.id===0&&p.tag)){
  c.fillStyle='#162c37';c.fillRect(x-2,y-2,p.w+4,4);c.fillStyle='#b5b7a0';c.fillRect(x,y,p.w,1);c.fillStyle='#697f7c';c.fillRect(x,y+1,p.w,2);
  for(let xx=x+3;xx<x+p.w-3;xx+=8){c.fillStyle='#1a303b';c.fillRect(xx,y+3,3,8);c.fillStyle='#78928a';c.fillRect(xx,y+3,1,7);c.fillStyle='#b2b49a';c.fillRect(xx,y+4,1,2);}
  c.fillStyle='#334f55';c.fillRect(x,y+10,p.w,2);return;
 }
 if(p.kind==='crumble'&&timer!==undefined){drawCrumble(c,p,tile(p,l),x,y,timer,reduced);return;}
 if(p.h<=10&&p.kind==='stone'&&!(l.id===0&&p.tag))for(const post of eavePosts(p,l)){
  // A post rides on its deck: while a cracked tile is down, so is the post.
  if((s.crumbles[post.support]??1)<=0)continue;
  const dir=post.x<p.x+p.w/2?1:-1,px=x+post.x-p.x-2,top=y+p.h,bottom=Math.round(y+post.y-p.y);
  c.fillStyle='#2b2a2c';c.fillRect(px-1,top,7,bottom-top);c.fillStyle='#6e5641';c.fillRect(px,top,5,bottom-top);c.fillStyle='#93745a';c.fillRect(px+1,top,1,bottom-top);
  // Knee brace into the beam's underside, then a stone pad on the deck.
  for(let i=0;i<18;i++){c.fillStyle=i%6===0?'#93745a':'#6e5641';c.fillRect(dir>0?px+5+i:px-2-i,top+16-Math.round(i*.85),3,2);}
  c.fillStyle='#3d3b3a';c.fillRect(px-3,bottom-3,11,3);
 }
 // Bell Lane's hoist pallets and its drying rack hang from what carries them.
 if(l.id===0&&p.tag&&p.kind!=='crumble'){if(p.kind==='moving')laneMover(c,p,x,y);c.drawImage(tile(p,l),x-4,y-8);return;}
 // Old Quarter barges are boats, not slabs: hull and gunwale replace the tile.
 if(p.kind==='moving'&&l.world===0&&l.setting==='canal'){drawBarge(c,p,x,y,l);return;}
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
