import {WORLDS,type Level,type Platform} from './levels';
import type {Run} from './model';
import {platformAt} from './model';
import {goalComposition} from './composition';
import {departureOffset,departureVisibility} from './departure';
import {ferry} from './props';
import {box,hash,masonry,panel,sprite,stroke,visible,wall,type C,type Work} from './quarter-kit';
import {MID,MID_SCALE,drawRow,farRoof,headTowers,lotEdge,moon,nightSky,row,townHouse,windowColumns,windowLit,windowX,type Scale,type Tone} from './quarter-distance';
import type {QuarterSet} from './quarter-sets';

/** Level 3 · one canal, seen from its near quay. Across a width of water
 * stands the far bank: a terrace of houses on their own quay, no two alike,
 * with the next street's roofs and the towers behind them, and all of it
 * lying broken on the water in front. Everything you stand on is in or beside that water: a
 * granite quay built down into it, a cluster of mooring piles, a timber
 * staging, a moored lighter, a barge on its rope, a raft on a chain. */
export const FAR=72;
type Role='quay'|'piles'|'staging'|'boat'|'barge'|'stage'|'spar'|'bridge'|'tower';
/** Level 3 opens on the bell tower that level 2 climbed: it stands with its
 * foot in the canal at the head of the quay. Everything before the first
 * quay is on it, or (standing clear of it in the water) the dolphin at its foot. */
const TX0=24,TX1=352,FOOT_X=400,TOP=4,GALLERY=96;
const towerEnds=new WeakMap<Level,number>();
function towerEnd(l:Level){
 let x=towerEnds.get(l);
 if(x===undefined){const quay=l.platforms.slice(0,l.mainCount).find(p=>p.kind!=='moving'&&l.water!-p.y>=44&&l.water!-p.y<60);x=quay?.x??0;towerEnds.set(l,x);}
 return x;
}
function role(p:Platform,l:Level):Role{
 if(p.x<towerEnd(l)&&!p.branch)return p.x+p.w<=FOOT_X?'tower':'piles';
 if(p.kind==='moving')return 'barge';
 if(p.kind==='grate')return 'spar';
 if(p.id===l.mainCount-1)return 'stage';
 const lift=l.water!-p.y;
 return lift>=60?'bridge':lift>=44?'quay':lift<=24?'boat':p.w<=64?'piles':'staging';
}
export const quayTile=()=>masonry('canal/quay',96,48,32,12,{mortar:'#141c24',stones:['#2f3a45','#333e49','#37424d'],lip:'#414d59',chip:'#4b5763'});
/** One sheet of water from the far bank to the bottom of the view: the same
 * colour function is used behind the quay and in front of the hulls. */
const DEPTH=['#1d3947','#1a3542','#17303d','#152c38','#132833','#11252f','#10222c','#0f2029'];
export function sheet(c:C,x:number,w:number,from:number,to:number,far:number){
 for(let y=from;y<to;){const band=Math.max(0,Math.min(DEPTH.length-1,Math.floor((y-far)/14))),end=band===DEPTH.length-1?to:Math.min(to,far+(band+1)*14);box(c,DEPTH[band],x,y,w,end-y);y=end;}
}
/** Ripples are short dashes on rows that widen toward the viewer. */
export function ripples(c:C,left:number,right:number,from:number,to:number,far:number,t:number,pan:(y:number)=>number=()=>0){
 for(let row=0;row<26;row++){
  const y=Math.round(far+3+row*row*.5+row*6);if(y<from)continue;if(y>=to)break;
  // `pan` carries a far row along with the bank it lies under, so distant water never slides past the houses.
  const step=30+row*7,drift=Math.sin(t*.55+row*1.3)*4+Math.round(pan(y)),length=4+row*1.4;
  for(let i=Math.floor((left-drift)/step)-1;i*step<right-drift+step;i++){
   const v=hash(i,row,17),x=i*step+v*step*.8+drift;if(x+length*1.6<left||x>right)continue;
   box(c,v>.8?'#4f7a85':v>.45?'#335865':'#264754',x,y,Math.round(length*(.6+v)),1);
  }
 }
}
/** What stands in the water lies on it: a dark length under a wall or a hull, torn by the ripples. */
export function shadowOnWater(c:C,x:number,w:number,water:number,t:number){
 box(c,'#0a161d99',x+1,water+1,w-2,5);
 for(let k=0;k<4;k++){const len=Math.round(w*(.82-k*.17));box(c,'#0a161d80',x+Math.round((w-len)*hash(Math.round(x),k,73))+Math.round(Math.sin(t*1.2+k*1.7+x*.05)*(1+k)),water+7+k*4,len,k<2?2:1);}
}
const BANK:Tone={walls:['#1a2330','#1d2734','#202b39','#211f2a','#1c242b'],edge:'#2a3647',shade:'#121924',roof:'#263447',course:'#1f2b3c',ridge:'#384962',glass:'#0f1621',pane:'#1b2a3c',lit:'#a8763f',glow:'#e0ab5c'};
const BANK_SCALE:Scale={unit:17,ww:6,wh:9,pitch:13,lit:.09};
const LOT=50,BANK_SEED=21,QUAY=8,BANK_H=160+QUAY,BEHIND_H=190,BEHIND='#222e44';
const seedOf=(i:number)=>i*13+5,tallOf=(i:number)=>54+Math.floor(hash(i,1,53)*62);
const lotWide=(i:number)=>lotEdge(i+1,LOT,BANK_SEED)-lotEdge(i,LOT,BANK_SEED);
/** Now and then a side canal runs back between two houses, and the quay street crosses it on a bridge of its own. A lot too narrow or too wide for one is a house. */
const canalLot=(i:number)=>hash(i,7,3)>.9&&lotWide(i)>=50&&lotWide(i)<=78;
const sideCanal=(i:number)=>canalLot(i)&&!canalLot(i-1)&&!canalLot(i-2)&&!canalLot(i-3);
/** The far quay wall under a lot: coursed stone from the street down to the water. */
function quayWall(c:C,x:number,w:number,h:number,i:number){
 box(c,'#18212c',x,h-QUAY,w,QUAY);box(c,'#2c394a',x,h-QUAY,w,1);box(c,'#10171f',x,h-1,w,1);for(let j=x+7+((i%5)+5)%5;j<x+w-2;j+=16)box(c,'#10171f',j,h-6,1,4);
}
/** The street bridge over a side canal, at the far bank's size: abutments in
 * the quay wall, one low arch with its ring, a road that humps over it, and
 * a parapet with a pier and a dead lamp at each end. Under it the side canal
 * goes back into the dark. */
function crossing(c:C,w:number,h:number,i:number){
 const abut=8,rx=(w-abut*2)/2,mid=w/2,street=h-QUAY,stone='#1f2a38',lit='#33414f',dark='#141c27';
 const road=(x:number)=>street-1-Math.round(5*(1-((x+.5-mid)/mid)**2));
 quayWall(c,0,abut,h,i);quayWall(c,w-abut,abut,h,i);
 for(let x=0;x<w;x++){
  const k=(x+.5-mid)/rx,open=Math.abs(k)<1?h-Math.round((QUAY+5)*Math.sqrt(1-k*k)):h,top=road(x);
  // Spandrel from the road down to the arch; the ring; then the canal going back under it.
  box(c,stone,x,top,1,open-top);
  if(open<h){box(c,lit,x,open-2,1,2);box(c,'#465564',x,open-2,1,1);box(c,'#08121a',x,open,1,h-open);if(Math.abs(k)<.62)box(c,'#162c38',x,h-2,1,2);}
  // The parapet stands on the road: a coping, and openings between its balusters.
  box(c,stone,x,top-6,1,6);box(c,lit,x,top-6,1,1);if(x%4===1&&x>4&&x<w-5)box(c,dark,x,top-4,2,3);
  box(c,dark,x,top,1,1);
 }
 for(let k=1;k<7;k++){const g=Math.PI*k/7,ox=mid-Math.cos(g)*rx,oy=h-Math.sin(g)*(QUAY+5);box(c,dark,ox,oy-2,1,2);}
 box(c,'#465564',mid-1,h-QUAY-8,3,4);
 for(const x of [0,w-5]){
  const top=road(x+2);box(c,'#263243',x,top-9,5,9);box(c,lit,x,top-9,5,1);box(c,dark,x+4,top-8,1,8);
  box(c,'#10171f',x+2,top-23,1,14);box(c,'#10171f',x+1,top-27,3,4);box(c,'#232f3e',x+2,top-26,1,2);
 }
}
const bankRow=row(LOT,BANK_SEED,BANK_H,(c,i,w,h)=>{
 if(sideCanal(i)){crossing(c,w,h,i);return;}
 townHouse(c,w,h-QUAY-tallOf(i),h-QUAY,seedOf(i),BANK,BANK_SCALE,true);quayWall(c,0,w,h,i);
},()=>BANK.shade);
/** The next street back: roofs over the bank's own, and now and then a church or a dome. */
const behindRow=row(44,22,BEHIND_H,(c,i,w,h)=>{const top=h-74-Math.floor(hash(i,1,57)*76);if(hash(i,2,57)>.78)farRoof(c,w,top,h,i+400,BEHIND,'#2b3a54','#b98a4a');else townHouse(c,w,top,h,i*3+2,MID,MID_SCALE);},()=>BEHIND);
let quayLine=0;
const bankBase=()=>quayLine+QUAY,behindBase=()=>quayLine;
/** A reflection breaks up the further it lies from the bank: depth below the quay, and how much of the width is left. */
const BROKEN=[[2,.9],[5,.74],[9,.5],[14,.3]] as const;
/** The far quay itself, what is moored at it, and the bank lying on the water:
 * each house's dark front, and under every lit window its own wavering light. */
function farShore(c:C,w:number,cx:number,fy:number,t:number){
 const shift=Math.round(cx*BANK_PAN);
 for(let i=Math.floor(shift/LOT)-2;;i++){
  const x0=lotEdge(i,LOT,BANK_SEED)-shift;if(x0>=w)break;const wide=lotEdge(i+1,LOT,BANK_SEED)-shift-x0;if(x0+wide<=0)continue;
  // A crossing lies on the water as dark as the arch over it, as deep as the bridge is tall.
  if(sideCanal(i)){box(c,'#12232e',x0,fy,wide,16);for(const [at,keep] of BROKEN){const len=Math.round(wide*keep),slip=Math.round(Math.sin(t*1.1+at*.9+i)*2);box(c,'#12232e',x0+Math.round((wide-len)*hash(i,at,71))+slip,fy+15+at,len,at>8?1:2);}continue;}
  // What is moored at the quay: sometimes a skiff tied up, sometimes a dead lamp on the street above.
  const v=hash(i,8,3);
  if(v>.72&&wide>34){const bx=x0+5+Math.floor(v*8);box(c,'#0f161d',bx,fy-3,24,4);box(c,'#34414f',bx-1,fy-4,26,1);box(c,'#0f161d',bx+10,fy-9,1,5);}
  else if(v<.3){const lx=x0+Math.round(wide*.5);box(c,'#10171f',lx,fy-25,1,17);box(c,'#10171f',lx-1,fy-28,3,4);box(c,'#232f3e',lx,fy-27,1,2);}
  // The house stands on its head in the water: a dark front as deep as the house is tall, breaking up below.
  const tall=tallOf(i),seed=seedOf(i),deep=Math.round(tall*.3);
  box(c,'#12232e',x0,fy,wide,deep);
  for(const [at,keep] of BROKEN){const len=Math.round(wide*keep),slip=Math.round(Math.sin(t*1.1+at*.9+i)*2);box(c,'#12232e',x0+Math.round((wide-len)*hash(i,at,71))+slip,fy+deep+at-1,len,at>8?1:2);}
  for(let col=0,cols=windowColumns(wide,BANK_SCALE);col<cols;col++)for(let r=0;5+r*17+9<tall-17;r++){
   if(!windowLit(seed,col,r,BANK_SCALE))continue;
   const x=x0+windowX(wide,BANK_SCALE,col),y=fy+Math.round((tall-5-r*17)*.3);
   for(let d=0;d<4;d++)box(c,d?'#a8763f':'#d9a25a',x+Math.round(Math.sin(t*1.5+d*1.9+col+i)*1.4),y+d*3-3,6-d,1);
  }
 }
}
/** Moonlight lies on the canal in a path of glints, narrow at the far bank and broad at your feet. */
export function moonPath(c:C,mx:number,from:number,to:number,far:number,t:number){
 for(let k=0;k<16;k++){
  const y=Math.round(far+4+k*k*.9+k*5);if(y<from)continue;if(y>=to)break;
  const wide=6+k*3,slip=Math.round(Math.sin(t*.7+k*1.9)*(1+k*.25));
  box(c,k<5?'#c5d2c98c':'#c5d2c966',mx-Math.round(wide/2)+slip,y,wide,1);
  if(k>2)box(c,'#c5d2c93d',mx-wide+slip*2+k%3*5,y+2,Math.round(wide*.6),1);
  if(k>5)box(c,'#c5d2c92e',mx+Math.round(wide*.4)-slip,y-2,Math.round(wide*.5),1);
 }
}
/** A lamp near the water lies on it too: a warm column that wavers and thins. */
export function lampOnWater(c:C,x:number,water:number,height:number,t:number){
 const reach=Math.max(3,8-Math.floor(height/14));
 for(let d=0;d<reach;d++)box(c,d<2?'#f3c77a70':'#d9a25a4d',x-3+Math.round(Math.sin(t*1.6+d*1.7+x*.1)*(1+d*.4)),water+2+d*4+Math.round(height*.1),7-Math.min(4,d),1);
}
/** How far each distant layer follows the camera. The far side of the canal
 * is a long way off: walking the quay barely moves it, the way the moon barely
 * moves. Only what you stand on is locked to the world. */
const MOON_PAN=.01,TOWER_PAN=.015,BEHIND_PAN=.02,BANK_PAN=.03;
/** The canal between the banks: a row at the far bank moves with the bank, a row at your feet with the quay. */
const waterPan=(y:number,far:number,near:number)=>{const k=Math.max(0,Math.min(1,(y-far)/(near-far)));return BANK_PAN+(1-BANK_PAN)*k*k*k;};
function sky(c:C,l:Level,w:number,h:number,cx:number,cy:number,t:number,ending:boolean){
 const fy=Math.round(l.water!-FAR-cy);quayLine=fy-8;
 nightSky(c,w,h,ending,cx,t);moon(c,Math.round(w*.78-cx*MOON_PAN),Math.max(46,Math.min(Math.round(h*.24),fy-178)));
 c.drawImage(headTowers(),Math.round(w*.28-cx*TOWER_PAN),fy-232);
 drawRow(c,behindRow,w,cx*BEHIND_PAN,behindBase,quayLine);
 drawRow(c,bankRow,w,cx*BANK_PAN,bankBase,quayLine+QUAY);
 if(fy>=h)return;
 const far=l.water!-FAR,near=l.water!;
 sheet(c,0,w,fy,h,fy);farShore(c,w,cx,fy,t);
 c.save();c.translate(-cx,-cy);ripples(c,cx,cx+w,far+3,near,far,t,y=>cx*(1-waterPan(y,far,near)));moonPath(c,cx+Math.round(w*.78-cx*MOON_PAN),far,near,far,t);c.restore();
}
export function weed(c:C,x:number,w:number,water:number,seed:number){
 // The tide has left the bottom courses dark, a stone at a time. Weed hangs
 // from a joint here and there in tufts, never in a row.
 for(let i=0;i*16<w;i++){const deep=5+Math.floor(hash(i,seed,5)*4)*2;box(c,'#0a141a73',x+i*16,water-deep,Math.min(16,w-i*16),deep);}
 for(let i=0;i*23<w-10;i++){
  const v=hash(i,seed,6);if(v<.6)continue;
  const at=x+3+i*23+Math.floor(hash(i,seed,8)*12),strands=2+Math.floor(v*3);
  for(let k=0;k<strands;k++){const hang=3+Math.floor(hash(i*5+k,seed,9)*8);box(c,k%2?'#2c4739':'#35543f',at+k*2,water-hang,1+k%2,hang);}
  box(c,'#4c6c52',at+1,water-5,1,2);
 }
}
function pile(c:C,x:number,top:number,water:number){
 box(c,'#17110d',x,top,10,water+40-top);box(c,'#4b3a2b',x+1,top,7,water+40-top);box(c,'#6a5440',x+2,top,2,water+40-top);
 // Wet to the tide line, with a rag of weed on the side the current leaves alone.
 box(c,'#0a141a80',x,water-9-x%3*2,10,9+x%3*2);if(x%4<2){box(c,'#2c4739',x+6,water-5-x%3,2,5+x%3);box(c,'#35543f',x+8,water-3,1,3);}
}
/** The stepped footbridge is one stone bridge. A tall round arch on upright
 * jambs carries the top landing high enough for a lighter to pass under; the
 * lower treads either side are the tops of its two abutments, the longer of
 * which is pierced by a flood arch. Each tread's coping is the top of the
 * bridge's own parapet: a panelled course above a string course in the face
 * you see, with a newel where one tread steps down to the next. Nothing
 * stands above a tread. Every pier comes down onto a plinth in the water. */
interface Arch {x:number;r:number;spring:number;ring:number}
interface Span {x0:number;x1:number;top:number;steps:Platform[];arches:Arch[];solid:(readonly [number,number])[];art:HTMLCanvasElement|null}
const spans=new WeakMap<Level,Span|null>();
function span(l:Level){
 let made=spans.get(l);if(made!==undefined)return made;
 const steps=l.platforms.filter(p=>role(p,l)==='bridge').sort((a,b)=>a.x-b.x);
 if(!steps.length){spans.set(l,null);return null;}
 const water=l.water!,x0=steps[0].x,x1=steps.at(-1)!.x+steps.at(-1)!.w,high=steps.reduce((a,b)=>b.y<a.y?b:a);
 // The great arch stands under the top landing: its crown close under the parapet, its springing well above the water.
 const r=Math.round(high.w/2)+2,main:Arch={x:high.x+high.w/2,r,spring:Math.min(water-14,high.y+40+r),ring:10},arches=[main];
 // An abutment long enough to want it gets a flood arch under the tread next to the great one.
 for(const [from,to] of [[x0,main.x-r-main.ring],[main.x+r+main.ring,x1]] as const)if(to-from>=110){
  const x=from<main.x?to-30:from+30,over=steps.find(p=>p.x<=x&&p.x+p.w>=x)??high;arches.push({x,r:16,spring:Math.max(over.y+36,water-52)+16,ring:6});
 }
 const cuts=arches.map(a=>[a.x-a.r,a.x+a.r] as const).sort((a,b)=>a[0]-b[0]),solid:(readonly [number,number])[]=[];
 let at=x0;for(const [a,b] of cuts){solid.push([at,a]);at=b;}solid.push([at,x1]);
 made={x0,x1,top:high.y,steps,arches,solid,art:null};spans.set(l,made);return made;
}
function footbridge(l:Level,sp:Span){
 const water=l.water!,foot=water+40,{x0,x1,steps}=sp;
 return sp.art??=sprite(`canal/footbridge/${l.id}`,x1-x0+16,foot-sp.top+4,c=>{
  c.translate(8-x0,2-sp.top);
  // The face: coursed stone from under each tread's coping down into the water, and the riser where one tread meets the next.
  for(const p of steps)wall(c,'canal/quay',quayTile,p.x,p.y+8,p.w,foot-p.y-8);
  for(let i=1;i<steps.length;i++){const a=steps[i-1],b=steps[i],hi=a.y<b.y?a:b,lo=hi===a?b:a;box(c,'#0f161d',hi===a?b.x-2:b.x,hi.y+8,2,lo.y-hi.y);}
  box(c,'#0f161d',x0,steps[0].y+8,2,foot-steps[0].y);box(c,'#0f161d',x1-2,steps.at(-1)!.y+8,2,foot-steps.at(-1)!.y);
  for(const a of sp.arches){
   const {x,r,spring,ring}=a,out=r+ring;
   // The opening is cut clean through: the canal and the far bank show under the bridge.
   for(let px=Math.ceil(x-r);px<x+r;px++){const d=px+.5-x,y=Math.round(spring-Math.sqrt(r*r-d*d));c.clearRect(px,y,1,foot-y+4);}
   // The arch ring: dressed voussoirs round the head, and the same stones as quoins down each jamb.
   for(let px=Math.floor(x-out);px<x+out;px++){const d=px+.5-x,top=Math.round(spring-Math.sqrt(Math.max(0,out*out-d*d))),inner=Math.abs(d)<r?Math.round(spring-Math.sqrt(r*r-d*d)):foot;box(c,'#4c5864',px,top,1,inner-top);box(c,'#6b7782',px,top,1,1);}
   const stones=Math.max(7,Math.round(Math.PI*r/13)|1);
   for(let k=0;k<=stones;k++){const g=Math.PI*k/stones;stroke(c,'#1a222b',x-Math.cos(g)*r,spring-Math.sin(g)*r,x-Math.cos(g)*(out-1),spring-Math.sin(g)*(out-1));}
   for(let y=spring+11,k=0;y<foot;y+=12,k++){box(c,'#1a222b',x-out,y,ring,1);box(c,'#1a222b',x+r,y,ring,1);if(k%2){box(c,'#4c5864',x-out-4,y-11,4,11);box(c,'#4c5864',x+out,y-11,4,11);}}
   box(c,'#10171e',x-out-1,spring,1,foot-spring);box(c,'#10171e',x+out,spring,1,foot-spring);
   // Imposts where the head springs from the jambs, and the keystone locked into the ring.
   for(const ix of [x-out-3,x+r-1]){box(c,'#6b7782',ix,spring-3,ring+4,5);box(c,'#8a959d',ix,spring-3,ring+4,1);box(c,'#10171e',ix+1,spring+2,ring+2,1);}
   const key=Math.round(ring*.9);box(c,'#1a222b',x-key/2-1,spring-out-2,key+2,ring+3);box(c,'#7d8791',x-key/2,spring-out-2,key,ring+2);box(c,'#a3adb5',x-key/2,spring-out-2,key,1);
   // Under the arch the vault runs back to the far face: dark along the head and down the jamb the moon does not reach.
   for(let px=Math.ceil(x-r);px<x+r;px++){const d=px+.5-x,y=Math.round(spring-Math.sqrt(r*r-d*d)),deep=Math.max(2,Math.round(ring*.6));box(c,'#0c1218',px,y,1,deep);box(c,'#1a2530',px,y+deep,1,Math.round(deep/2));}
   box(c,'#0c1218',Math.ceil(x-r),spring,Math.round(ring*.5),foot-spring);box(c,'#1a2530',Math.ceil(x-r)+Math.round(ring*.5),spring,2,foot-spring);
  }
  for(const p of steps){
   // The parapet belongs to the face: a panelled course under the coping, on a string course.
   box(c,'#3a4652',p.x,p.y+8,p.w,13);for(let x=p.x+10;x+16<=p.x+p.w-8;x+=24){box(c,'#2f3a46',x,p.y+12,16,6);box(c,'#232d38',x,p.y+12,16,1);box(c,'#465260',x,p.y+18,16,1);}
   box(c,'#56626e',p.x-1,p.y+21,p.w+2,3);box(c,'#7a8690',p.x-1,p.y+21,p.w+2,1);box(c,'#10171e',p.x,p.y+24,p.w,2);
  }
  // A newel closes each parapet where the tread steps down, and stands at both ends of the bridge.
  const newel=(x:number,from:number,to:number)=>{box(c,'#4c5864',x,from,8,to-from);box(c,'#6b7782',x,from,1,to-from);box(c,'#1a222b',x+7,from,1,to-from);for(let y=from+11;y<to;y+=12)box(c,'#1a222b',x,y,8,1);};
  for(let i=1;i<steps.length;i++){const a=steps[i-1],b=steps[i];if(a.y<b.y)newel(b.x-8,a.y+8,b.y+24);else if(b.y<a.y)newel(b.x,b.y+8,a.y+24);}
  newel(x0,steps[0].y+8,steps[0].y+24);newel(x1-8,steps.at(-1)!.y+8,steps.at(-1)!.y+24);
  for(const [a,b] of sp.solid){
   // Each pier stands on a plinth that goes down into the canal, wet to the tide line.
   box(c,'#2a3540',a-3,water-13,b-a+6,foot-water+13);box(c,'#56626e',a-3,water-13,b-a+6,2);box(c,'#10171e',a-3,water-11,b-a+6,1);
   for(let x=a+9;x<b-3;x+=22)box(c,'#1a222b',x,water-10,1,foot-water+10);
   weed(c,a-3,b-a+6,water,Math.round(a));
  }
 });
}
function bridge(c:C,l:Level,cx:number,cy:number,vw:number,vh:number){
 const sp=span(l);if(!sp||!visible(sp.x0-8,sp.top-2,sp.x1-sp.x0+16,l.water!+44-sp.top,cx,cy,vw,vh))return;
 c.drawImage(footbridge(l,sp),sp.x0-8,sp.top-2);
}
/** The tower's face is weathered stone, laid stage by stage between its string courses. */
const FACE:Work={course:16,short:22,long:54,mortar:'#19212a',stones:['#29333f','#2c3642','#2f3946','#27313c'],lip:'#3a4654',shade:'#212a34',chip:'#46525f'};
const FOOTING:Work={course:20,short:28,long:60,mortar:'#141c24',stones:['#2b3641','#2f3a45','#333e49'],lip:'#414d59',shade:'#232d37',chip:'#4b5763'};
const STAGES=[[TOP,300],[300,560],[560,0]] as const;
function louvreOut(c:C,x:number,y:number,w:number,h:number){
 // A belfry opening from outside: a pointed head on dressed jambs, slatted against the weather.
 const mid=x+w/2;
 for(let yy=0;yy<16;yy++){const half=Math.round(w/2*Math.sqrt(1-((16-yy)/16)**2));box(c,'#0d1116',mid-half-4,y+yy,half*2+8,1);box(c,'#3e4a57',mid-half-4,y+yy,4,1);box(c,'#3e4a57',mid+half,y+yy,4,1);}
 box(c,'#0d1116',x,y+16,w,h-16);box(c,'#3e4a57',x-4,y+16,4,h-16);box(c,'#3e4a57',x+w,y+16,4,h-16);box(c,'#56636f',x-4,y+16,1,h-16);
 for(let yy=y+12;yy<y+h-4;yy+=8){box(c,'#2a333d',x+1,yy,w-2,4);box(c,'#46525e',x+1,yy,w-2,1);}
 box(c,'#46525f',x-7,y+h,w+14,5);box(c,'#6b7782',x-7,y+h,w+14,1);box(c,'#1a222b',x-7,y+h+5,w+14,1);
}
function dialOut(c:C,x:number,y:number,r:number){
 // The clock you climbed past inside, from the street: a stone ring, a pale face, its hands stopped.
 for(let yy=-r;yy<=r;yy++){const out=Math.floor(Math.sqrt(r*r-yy*yy)),face=Math.abs(yy)<=r-7?Math.floor(Math.sqrt((r-7)*(r-7)-yy*yy)):-1;box(c,'#46525f',x-out,y+yy,out*2,1);if(yy<-r+3)box(c,'#6b7782',x-out,y+yy,out*2,1);if(face>=0)box(c,yy<0?'#b9bfae':'#a5ab9a',x-face,y+yy,face*2,1);}
 for(let i=0;i<12;i++){const a=i*Math.PI/6;box(c,'#2a2f33',Math.round(x+Math.cos(a)*(r-12))-1,Math.round(y+Math.sin(a)*(r-12))-1,i%3?2:3,i%3?2:3);}
 stroke(c,'#1d2226',x,y,x-12,y-32,2);stroke(c,'#1d2226',x,y,x-26,y+5,3);box(c,'#1d2226',x-3,y-3,7,7);
}
const towerFace=new WeakMap<Level,HTMLCanvasElement>();
function towerArt(l:Level){
 let art=towerFace.get(l);if(art)return art;
 const water=l.water!,foot=water+40,stair=l.platforms.slice(0,l.mainCount).filter(p=>role(p,l)==='tower');
 art=sprite(`canal/tower/${l.id}`,FOOT_X+16,foot-TOP+8,c=>{
  c.translate(0,-TOP);
  for(const [a,b0] of STAGES){const b=b0||foot;c.drawImage(panel(`canal/tower/${a}`,TX1-TX0,b-a,FACE,a+17),TX0,a);}
  // String courses where the stages meet; the courses above and below stop against them.
  for(const y of [300,560]){box(c,'#1a222b',TX0-3,y-1,TX1-TX0+6,8);box(c,'#4c5864',TX0-3,y,TX1-TX0+6,5);box(c,'#6b7782',TX0-3,y,TX1-TX0+6,1);}
  // The parapet over the gallery door, and its coping.
  box(c,'#1a222b',TX0-4,TOP-2,TX1-TX0+8,8);box(c,'#56626e',TX0-4,TOP-2,TX1-TX0+8,5);box(c,'#7a8690',TX0-4,TOP-2,TX1-TX0+8,1);
  // Quoins at both corners: long and short stones by turns, standing proud of the face.
  for(let y=TOP+6,k=0;y<foot;y+=16,k++)for(const [x,dir] of [[TX0,1],[TX1,-1]] as const){const wide=k%2?18:10,at=dir>0?x:x-wide;box(c,'#36414c',at,y+1,wide,14);box(c,'#4a5662',at,y+1,wide,1);box(c,'#1c242d',at,y+15,wide,1);box(c,dir>0?'#4a5662':'#1c242d',dir>0?x:x-1,y+1,1,14);}
  louvreOut(c,64,150,56,112);louvreOut(c,236,150,56,112);
  dialOut(c,108,364,52);
  // Slit windows light the stair inside, staggered as the stair is.
  for(const [x,y] of [[290,460],[80,612],[300,700]] as const){box(c,'#0d1116',x,y,10,40);box(c,'#3e4a57',x-4,y-6,18,6);box(c,'#56636f',x-4,y-6,18,1);box(c,'#46525f',x-4,y+40,18,4);box(c,'#141c2c',x+2,y+2,6,36);}
  // The water gate: the flooded pit you looked down into from the bell stair opens here onto the canal.
  const gx=56,gw=96,gs=water-34;
  for(let px=gx-10;px<gx+gw+10;px++){const k=(px+.5-gx-gw/2)/(gw/2+10),y=gs-Math.round((gw/2+10)*Math.sqrt(Math.max(0,1-k*k)));box(c,'#46525f',px,y,1,foot-y);box(c,'#5d6975',px,y,1,1);}
  for(let px=gx;px<gx+gw;px++){const k=(px+.5-gx-gw/2)/(gw/2),y=gs-Math.round(gw/2*Math.sqrt(Math.max(0,1-k*k)));box(c,'#05080b',px,y,1,foot-y);}
  for(let k=1;k<9;k++){const g=Math.PI*k/9;stroke(c,'#1a222b',gx+gw/2-Math.cos(g)*gw/2,gs-Math.sin(g)*gw/2,gx+gw/2-Math.cos(g)*(gw/2+9),gs-Math.sin(g)*(gw/2+9));}
  for(let x=gx+6;x<gx+gw-4;x+=10){box(c,'#1c2228',x,gs-30,3,foot-gs+30);box(c,'#3a444b',x,gs-30,1,foot-gs+30);}
  // The cutwater: a buttress foot standing out of the canal at the corner, wet to the tide line.
  const pier=stair.find(p=>p.x+p.w>TX1);
  if(pier){c.drawImage(panel('canal/tower/cutwater',pier.x+pier.w-pier.x,foot-pier.y-8,FOOTING,pier.x),pier.x,pier.y+8);box(c,'#10171e',pier.x+pier.w-2,pier.y+8,2,foot-pier.y-8);box(c,'#10171e',pier.x,pier.y+8,2,foot-pier.y-8);weed(c,pier.x,pier.w,water,7);}
  weed(c,TX0,TX1-TX0,water,3);
  // The gallery walk runs the whole top of the face on a corbel table; its rail stands at the walk's edge.
  const gallery=stair[0];
  for(let x=TX0+4;x<TX1-8;x+=20){box(c,'#1a222b',x,GALLERY+26,12,14);box(c,'#4c5864',x+1,GALLERY+27,10,10);box(c,'#6b7782',x+1,GALLERY+27,10,1);box(c,'#3a4652',x+3,GALLERY+37,6,4);}
  box(c,'#3a4652',TX0,GALLERY+20,TX1-TX0,6);box(c,'#56626e',TX0,GALLERY+20,TX1-TX0,1);
  const railEnd=gallery.x+gallery.w-4;
  for(let x=TX0+6;x<railEnd;x+=22){box(c,'#141b21',x,GALLERY-22,3,22);box(c,'#3d4a51',x,GALLERY-22,1,22);}
  box(c,'#141b21',railEnd-3,GALLERY-22,3,22);
  box(c,'#141b21',TX0+4,GALLERY-24,railEnd-TX0-4,3);box(c,'#4a585f',TX0+4,GALLERY-24,railEnd-TX0-4,1);box(c,'#141b21',TX0+4,GALLERY-12,railEnd-TX0-4,2);
  // The gallery door: the same door, from the gallery side. Its leaf stands open into the belfry.
  const dx=44,dy=GALLERY;
  box(c,'#1a222b',dx-4,dy-78,64,78);box(c,'#4c5864',dx-2,dy-74,10,74);box(c,'#4c5864',dx+46,dy-74,10,74);box(c,'#4c5864',dx+2,dy-80,52,8);box(c,'#4c5864',dx+10,dy-86,36,6);
  box(c,'#6b7782',dx-2,dy-74,1,74);box(c,'#6b7782',dx+10,dy-86,36,1);box(c,'#6b7782',dx+2,dy-80,8,1);box(c,'#6b7782',dx+46,dy-80,8,1);
  for(let y=dy-62;y<dy;y+=13){box(c,'#2c353f',dx-2,y,10,1);box(c,'#2c353f',dx+46,y,10,1);}
  box(c,'#0b0f14',dx+8,dy-72,38,72);box(c,'#0b0f14',dx+12,dy-77,30,6);box(c,'#3a2a1c',dx+10,dy-70,34,70);box(c,'#c98f4b55',dx+14,dy-66,26,66);box(c,'#f0c47a33',dx+20,dy-60,14,60);
  box(c,'#4a3423',dx+38,dy-70,8,70);box(c,'#6b4a2e',dx+39,dy-69,6,69);box(c,'#262d33',dx+38,dy-54,8,2);box(c,'#262d33',dx+38,dy-18,8,2);
  box(c,'#56626d',dx-4,dy-3,64,3);box(c,'#78848e',dx-4,dy-3,64,1);
  // The iron stair: a string bolted to the face from each landing to the next, most treads gone.
  for(let i=0;i<stair.length-1;i++){
   const a=stair[i],b=stair[i+1];if(b.x+b.w>TX1||b.y-a.y>72)continue;
   const right=b.x>a.x,x0=right?a.x+a.w-4:a.x+4,x1=right?b.x+4:b.x+b.w-4,y0=a.y+(a.kind==='grate'?8:10),y1=b.y+8,broken=Math.abs(x1-x0)>60;
   const run=Math.abs(x1-x0),dir=Math.sign(x1-x0);
   for(let k=0;k<=run;k++){if(broken&&k>run*.34&&k<run*.7)continue;const x=x0+dir*k,y=Math.round(y0+(y1-y0)*k/run);box(c,'#141b21',x,y,1,4);box(c,'#4a585f',x,y,1,1);if(k%14===7&&!broken)box(c,'#262d33',x-3,y-1,7,2);}
   if(!broken)for(let k=0;k<=run;k++){const x=x0+dir*k,y=Math.round(y0+(y1-y0)*k/run)-20;box(c,'#262d33',x,y,1,1);if(k%28===0)box(c,'#141b21',x,y,1,20);}
   // A bracket leaded into the face carries each end.
   for(const [x,y] of [[x0,y0],[x1,y1]] as const){stroke(c,'#141b21',x,y+3,x+(right?1:-1)*(x===x0?-10:10),y+18,2);box(c,'#59666b',x-1,y+17,3,3);}
  }
  for(const p of stair){
   if(p.kind==='grate'){for(const x of [p.x+6,p.x+p.w-8]){stroke(c,'#141b21',x,p.y+12,x+(x<p.x+p.w/2?8:-8),p.y+30,2);box(c,'#141b21',x-1,p.y+12,3,20);box(c,'#59666b',x-1,p.y+30,3,3);}}
   else if(p!==gallery&&p!==pier)for(let x=p.x+6;x<p.x+p.w-10;x+=26){box(c,'#1a222b',x,p.y+26,14,14);box(c,'#4c5864',x+1,p.y+27,12,6);box(c,'#3a4652',x+3,p.y+33,8,5);box(c,'#6b7782',x+1,p.y+27,12,1);}
  }
 });
 towerFace.set(l,art);return art;
}
/** The spire over the parapet, slated, its two slopes running up out of sight. */
function spireOut(c:C,cx:number,cy:number,vw:number,vh:number){
 const base=TOP-2,apex=base-620,mid=(TX0+TX1)/2,half0=(TX1-TX0)/2-14;
 const from=Math.max(apex,cy-24),to=Math.min(base,cy+vh+24);
 for(let y=from;y<to;y++){
  const half=Math.round(half0*(y-apex)/(base-apex));if(half<1)continue;
  box(c,(y>>2)%2?'#202a37':'#1d2633',mid-half,y,half*2,1);box(c,'#3a4a5e',mid-half,y,2,1);box(c,'#111821',mid+half-2,y,2,1);
  if(y%6===0)for(let x=mid-half+3+(y%12?5:0);x<mid+half-4;x+=10)box(c,'#161e29',x,y,1,6);
 }
}
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number,clock:number){
 const water=l.water!;bridge(c,l,cx,cy,vw,vh);
 if(towerEnd(l)>0&&cx<FOOT_X+40){spireOut(c,cx,cy,vw,vh);if(visible(0,TOP,FOOT_X+16,water+40-TOP,cx,cy,vw,vh))c.drawImage(towerArt(l),0,TOP);}
 for(const p of l.platforms){
  const kind=role(p,l),top=p.y+p.h;
  if(kind==='barge'){
   // A raft that crosses a basin runs on a chain between two posts.
   const travel=p.travel??0;if(travel<40||!visible(p.x-travel-40,p.y-30,p.w+travel*2+80,60,cx,cy,vw,vh))continue;
   const a=p.x-travel-30,b=p.x+p.w+travel+22;pile(c,a,p.y-26,water);pile(c,b,p.y-26,water);
   for(let x=a+10;x<b;x+=6)box(c,(x/6|0)%2?'#59666b':'#2c353b',x,p.y-12+Math.round(Math.sin((x-a)/(b-a)*Math.PI)*5),4,2);
   continue;
  }
  if(kind==='tower'||!visible(p.x-8,p.y-70,p.w+16,water+60-p.y+70,cx,cy,vw,vh))continue;
  if(kind==='quay'){
   wall(c,'canal/quay',quayTile,p.x,p.y+8,p.w,water+40-p.y-8);
   box(c,'#0f161d',p.x,p.y+8,2,water+40-p.y);box(c,'#0f161d',p.x+p.w-2,p.y+8,2,water+40-p.y);box(c,'#0b11178c',p.x,p.y+10,p.w,4);
   for(let x=p.x+46;x<p.x+p.w-30;x+=132){box(c,'#1b2228',x-2,water-30,4,4);box(c,'#59666b',x-4,water-27,8,7);box(c,'#2f3a45',x-2,water-25,4,4);}
   weed(c,p.x+2,p.w-4,water,p.id);
   // A street lamp stands on every long quay. None of them is lit tonight.
   if(p.w>=220){const x=Math.round(p.x+p.w*.6);box(c,'#141b21',x-1,p.y-58,3,58);box(c,'#3d4a51',x,p.y-58,1,58);box(c,'#141b21',x-4,p.y-4,9,4);box(c,'#141b21',x-5,p.y-72,11,14);box(c,'#232e37',x-3,p.y-70,7,10);box(c,'#3d4a51',x-5,p.y-74,11,2);}
   // Iron bollards hold the mooring ropes.
   for(const x of [p.x+12,p.x+p.w-18]){box(c,'#141b21',x,p.y-9,6,9);box(c,'#141b21',x-2,p.y-11,10,3);box(c,'#4a585f',x-1,p.y-11,8,1);}
  }else if(kind==='piles'){pile(c,p.x+3,top-4,water);pile(c,p.x+p.w/2-5,top-4,water);pile(c,p.x+p.w-13,top-4,water);}
  else if(kind==='staging'){
   const a=p.x+8,b=p.x+p.w-18;pile(c,a,p.y+10,water);pile(c,b,p.y+10,water);if(p.w>100)pile(c,p.x+p.w/2-5,p.y+10,water);
   stroke(c,'#2a2119',a+5,p.y+14,b+5,water-5,2);stroke(c,'#2a2119',b+5,p.y+14,a+5,water-5,2);
  }else if(kind==='stage'){
   // The ferry stage floats between two guide piles, under a gangway from the quay.
   for(const x of [p.x+6,p.x+p.w-16]){pile(c,x,p.y-34,water);box(c,'#59666b',x-1,p.y-30,12,2);}
  }else if(kind==='spar'){
   // A channel marker: one tall post, a cross-spar and a dark lamp.
   const x=Math.round(p.x+p.w/2)-4;pile(c,x,p.y-6,water);box(c,'#141b21',x-2,p.y-22,13,16);box(c,'#232e37',x,p.y-20,9,12);box(c,'#3d4a51',x-3,p.y-24,15,2);
  }
 }
 // Every barge on a short rope is made fast to the nearest quay bollard.
 for(const p of l.platforms){
  if(p.kind!=='moving'||(p.travel??0)>=40)continue;const tie=mooring(p,l);if(!tie)continue;
  const at=platformAt(p,clock),end=tie.x<p.x?at.x+4:at.x+p.w-4,sag=Math.max(4,10-Math.abs(end-tie.x)*.08);
  if(!visible(Math.min(end,tie.x),tie.y-4,Math.abs(end-tie.x),40,cx,cy,vw,vh))continue;
  const steps=Math.max(4,Math.round(Math.abs(end-tie.x)/3));for(let i=0;i<=steps;i++){const k=i/steps;box(c,'#8a7a5a',tie.x+(end-tie.x)*k,tie.y+(at.y-2-tie.y)*k+Math.sin(k*Math.PI)*sag,2,1);}
 }
}
const moorings=new WeakMap<Platform,{x:number;y:number}|null>();
function mooring(p:Platform,l:Level){
 let tie=moorings.get(p);
 if(tie===undefined){
  tie=null;let best=140;
  for(const q of l.platforms)if(role(q,l)==='quay')for(const x of [q.x+15,q.x+q.w-15]){const d=Math.min(Math.abs(x-p.x),Math.abs(x-p.x-p.w));if(d<best){best=d;tie={x,y:q.y-8};}}
  moorings.set(p,tie);
 }
 return tie;
}
function water(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number,s?:Run){
 const top=l.water!,far=top-FAR,bottom=cy+vh+24;if(bottom<=top)return;
 sheet(c,cx-24,vw+48,top,bottom,far);
 ripples(c,cx-24,cx+vw+24,top,bottom,far,t);
 for(let x=Math.floor((cx-24)/22)*22;x<cx+vw+24;x+=22){const wave=Math.round(Math.sin(t*1.7+x*.21));box(c,'#5a8a94',x+3,top+wave,11,1);}
 for(const p of l.platforms){const kind=role(p,l);if(p.x+p.w<cx-24||p.x>cx+vw+24)continue;if(kind==='quay'||kind==='stage')shadowOnWater(c,p.x,p.w,top,t);}
 // The tower stands in the canal and lies on it, dark, with its water gate a deeper dark.
 if(towerEnd(l)>0&&cx<FOOT_X+24){shadowOnWater(c,TX0,TX1-TX0,top,t);shadowOnWater(c,TX1,FOOT_X-TX1,top,t);}
 // The footbridge lies on the water pier by pier; under its arches the canal is open.
 const sp=span(l);if(sp&&sp.x1>cx-24&&sp.x0<cx+vw+24)for(const [a,b] of sp.solid)shadowOnWater(c,a-3,b-a+6,top,t);
 moonPath(c,cx+Math.round(vw*.78-cx*MOON_PAN),top,bottom,far,t);
 if(!s)return;
 // The lantern you carry and every jar still burning lie on the water under them.
 if(top-s.y<150&&s.y<top)lampOnWater(c,Math.round(s.x+8+s.facing*7),top,top-s.y-24,t);
 for(const p of l.pickups)if(p.kind==='spark'&&p.x>cx-20&&p.x<cx+vw+20&&top-p.y<150&&!s.collected.includes(p.id))lampOnWater(c,Math.round(p.x),top,top-p.y,t);
}
export function hull(c:C,w:number,deep:number){
 // A timber hull seen side on: sheer strake, planked sides, the turn of the bilge.
 for(let y=0;y<deep;y++){const inset=y<3?-3:Math.round((y-3)*(y-3)*.018);box(c,y%5===4?'#1c1511':'#2c2119',inset,y,w-inset*2,1);}
 box(c,'#14100d',-4,0,w+8,3);box(c,'#7a6048',-3,0,w+6,2);box(c,'#b2946d',-3,0,w+6,1);
}
function deck(c:C,p:Platform,l:Level){
 const w=p.w,kind=role(p,l);
 if(kind==='quay'||kind==='bridge'){
  // A granite coping on coursed stone; the rest of the wall is drawn behind.
  box(c,'#1a2129',-2,0,w+4,10);box(c,'#7d878c',-2,0,w+4,8);box(c,'#aab3b3',-2,0,w+4,2);box(c,'#5d676e',-2,7,w+4,1);
  for(let x=38+p.id%3*9;x<w-10;x+=52)box(c,'#565f66',x,2,1,6);
  return;
 }
 if(kind==='piles'){
  // Three pile heads bound with an iron hoop.
  for(const x of [3,Math.round(w/2)-5,w-13]){box(c,'#17110d',x,0,10,28);box(c,'#4b3a2b',x+1,2,7,26);box(c,'#6a5440',x+2,2,2,26);box(c,'#9a7f5f',x,0,10,2);box(c,'#7a6048',x+1,2,8,1);}
  box(c,'#17110d',0,3,w,7);box(c,'#6b523a',0,3,w,5);box(c,'#b2946d',0,0,w,2);box(c,'#8d704f',0,2,w,1);
  box(c,'#232c33',0,13,w,4);box(c,'#59666b',0,13,w,1);
  return;
 }
 if(kind==='staging'||kind==='stage'){
  // Deck planks on a bearer; the piles under it are drawn behind.
  box(c,'#17110d',0,0,w,13);box(c,'#6b523a',0,0,w,8);box(c,'#b2946d',0,0,w,2);box(c,'#8d704f',0,2,w,1);
  for(let x=11;x<w-3;x+=12)box(c,'#3d2e22',x,2,1,6);
  box(c,'#33261d',0,8,w,5);box(c,'#4a3828',0,8,w,1);
  if(kind==='stage')for(let x=6;x<w-28;x+=40){box(c,'#17110d',x,13,28,15);box(c,'#3f3227',x+1,13,26,13);box(c,'#59666b',x+5,13,2,13);box(c,'#59666b',x+21,13,2,13);}
  return;
 }
 if(kind==='tower'){
  if(p.kind==='grate'){
   // An iron landing of the outside stair: chequer plate on an angle frame.
   box(c,'#0f1418',-1,0,w+2,12);box(c,'#3d4a51',0,0,w,9);box(c,'#7d8a8f',0,0,w,2);box(c,'#59666b',0,2,w,1);
   for(let x=3+(p.id%2)*3;x<w-2;x+=6)box(c,'#2c353b',x,4,2,2);
   box(c,'#1c2228',0,9,w,3);return;
  }
  // A dressed stone walk: the gallery, the clock hood, the landing over the water gate, the cutwater's top.
  box(c,'#1a2129',-2,0,w+4,12);box(c,'#6d777e',-2,0,w+4,9);box(c,'#9aa3a5',-2,0,w+4,2);box(c,'#4d575e',-2,9,w+4,2);
  for(let x=30+p.id%3*7;x<w-8;x+=44)box(c,'#4d575e',x,2,1,7);
  return;
 }
 if(kind==='spar'){box(c,'#17110d',-1,0,w+2,12);box(c,'#6b523a',0,0,w,8);box(c,'#b2946d',0,0,w,2);box(c,'#33261d',0,8,w,3);return;}
 // Boats. The deck you land on is the hull's own: thwarts on a skiff, hatch
 // boards on a lighter or a barge, and a pair of bitts for the rope.
 hull(c,w,36);
 if(w<64){box(c,'#3d2e22',6,3,w-12,4);box(c,'#6b523a',Math.round(w/2)-5,2,10,3);}
 else{
  box(c,'#3a2d23',8,3,w-16,5);for(let x=14;x<w-12;x+=14)box(c,'#57432f',x,3,10,4);
  for(const x of [5,w-11]){box(c,'#14100d',x,-5,6,5);box(c,'#7a6048',x+1,-5,4,1);}
 }
}
function exit(c:C,l:Level,s:Run,t:number,front:boolean,reduced:boolean,view:{width:number;height:number}){
 if(front)return;
 const art=goalComposition(l),x=art.x,y=art.y,top=l.water!,offset=departureOffset(l,s,reduced,view);
 // The mooring post and rope on the stage, then Ada's ferry lying alongside.
 const post=l.exit.x+l.exit.w+1;box(c,'#17110d',post,y-17,5,20);box(c,'#6a5440',post+1,y-16,2,18);box(c,'#9a7f5f',post,y-17,5,2);
 if(s.phase==='playing')for(let i=0;i<=10;i++){const k=i/10;box(c,'#8a7a5a',post+3+(x-52-post-3)*k,y-10+k*6+Math.sin(k*Math.PI)*5,2,1);}
 c.save();c.translate(offset.x,0);c.globalAlpha*=departureVisibility(s,reduced);
 ferry(c,x,y-3-Math.sin(t*2)*2,WORLDS[0].accent,false);
 c.restore();
 // The canal closes over the hull below the waterline.
 const left=x-70+offset.x;sheet(c,left,140,top,top+26,top-FAR);ripples(c,left,left+140,top,top+26,top-FAR,t);
 for(let i=0;i<6;i++)box(c,'#5a8a94',left+6+i*22,top+Math.round(Math.sin(t*1.7+i)),11,1);
 for(let k=0;k<4;k++)box(c,'#f3c77a44',x+24+offset.x+Math.round(Math.sin(t*1.3+k)*2),top+4+k*5,6-k,1);
}
export const canalQuay:QuarterSet={sky,back,deck,exit,water,depth:(p,l)=>role(p,l)==='boat'||role(p,l)==='barge'?10:0};
