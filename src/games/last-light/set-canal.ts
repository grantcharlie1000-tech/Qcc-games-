import {WORLDS,type Level,type Platform} from './levels';
import type {Run} from './model';
import {platformAt} from './model';
import {goalComposition} from './composition';
import {departureOffset,departureVisibility} from './departure';
import {ferry} from './props';
import {box,hash,masonry,panel,sprite,stroke,visible,wall,type C,type Work} from './quarter-kit';
import {formSpikes} from './hazard-art';
import {bondedStore,chandlers,customHouse,gantry,goodsShed,granaryRoom,postCrane,tipHouse,weighHouse} from './canal-houses';
import {MID,MID_SCALE,drawRow,farRoof,headTowers,lotEdge,moon,nightSky,row,townHouse,windowColumns,windowLit,windowX,type Scale,type Tone} from './quarter-distance';
import type {QuarterSet} from './quarter-sets';

/** Level 3 · one canal, seen from its near quay. Across a width of water
 * stands the far bank: a terrace of houses on their own quay, no two alike,
 * with the next street's roofs and the towers behind them, and all of it
 * lying broken on the water in front. Everything you stand on is in or beside that water: a
 * granite quay built down into it, a cluster of mooring piles, a timber
 * staging, a moored lighter, a barge on its rope, a raft on a chain. */
export const FAR=72;
type Role='quay'|'piles'|'staging'|'boat'|'barge'|'raft'|'skiff'|'stage'|'spar'|'bridge'|'tower'|'pontoon'|'wreck'|'cabin'|'mast'|'beacon'|'steps'|'crates'|'gantry'|'sill';
/** What each tag names. A loading dock is a raised length of the quay itself. */
const ROLES:Readonly<Record<string,Role>>={quay:'quay',dock:'quay',piles:'piles',staging:'staging',boat:'boat',barge:'barge',raft:'raft',skiff:'skiff',stage:'stage',spar:'spar',bridge:'bridge',tower:'tower',pontoon:'pontoon',wreck:'wreck',cabin:'cabin',mast:'mast',beacon:'beacon',steps:'steps',crates:'crates',gantry:'gantry',sill:'sill'};
/** What a boat carries, or what has happened to a staging or a pile cap: the part of the tag after the dot. */
const load=(p:Platform)=>p.tag?.split('.')[1]??'';
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
/** The lighter sunk by the head in the long reach: its wheelhouse is the one tall solid on the canal. */
const cabins=new WeakMap<Level,Platform|null>();
function cabinOf(l:Level){
 let made=cabins.get(l);
 if(made===undefined){made=l.platforms.find(p=>p.tag==='cabin')??l.platforms.slice(0,l.mainCount).find(p=>!p.tag&&p.kind==='stone'&&p.h>28&&p.x>towerEnd(l))??null;cabins.set(l,made);}
 return made;
}
const WRECK_W=340;
function role(p:Platform,l:Level):Role{
 const named=p.tag?ROLES[p.tag.split('.')[0]]:undefined;if(named)return named;
 if(p.x<towerEnd(l)&&!p.branch)return p.x+p.w<=FOOT_X?'tower':'piles';
 if(p.kind==='crumble')return 'pontoon';
 const cabin=cabinOf(l);
 if(cabin&&!p.branch){
  if(p===cabin)return 'cabin';
  if(p.kind==='stone'&&p.x+p.w===cabin.x)return 'wreck';
  if(p.kind==='grate'&&p.x>cabin.x&&p.x<cabin.x+WRECK_W-80)return 'mast';
  if(p.kind==='stone'&&l.water!-p.y>=60&&p.x>cabin.x&&p.x<cabin.x+560)return 'beacon';
 }
 if(p.kind==='moving')return (p.travel??0)>=40?'raft':'barge';
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
const MOON_PAN=.01,TOWER_PAN=.012,BEHIND_PAN=.016,BANK_PAN=.02;
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
/** A wharf is one length of the near quay: landings that abut, its wall
 * from the coping down into the canal and on down past the foot of the view.
 * Each end is cut by what lies in the water there (a side canal's mouth, a
 * breach, a basin), and each wharf is built its own way: its own stone, its
 * own repairs and fittings, and the building that uses it. */
const WHARF=new Set<Role>(['quay','steps','crates']);
interface Wharf {name:string;x0:number;x1:number;steps:readonly Platform[];data:Readonly<Record<string,number>>;before:string;after:string;face:number;seed:number}
const NEAR=[
 {key:'canal/quay',tile:quayTile},
 {key:'canal/near/rubble',tile:()=>masonry('canal/near/rubble',80,40,20,10,{mortar:'#121820',stones:['#2b343e','#2e3842','#323c46','#28313a'],lip:'#3a4652',chip:'#46525e'})},
 {key:'canal/near/ashlar',tile:()=>masonry('canal/near/ashlar',120,40,40,20,{mortar:'#151c24',stones:['#323d48','#36414c','#2f3944'],lip:'#46525e',chip:'#525e6a'})},
 {key:'canal/near/brick',tile:()=>masonry('canal/near/brick',48,24,12,6,{mortar:'#1a1416',stones:['#3a2622','#41291f','#36231f','#452d26'],lip:'#4f342b',chip:'#5a3d32'})},
] as const;
const wharfCache=new WeakMap<Level,readonly Wharf[]>();
function wharves(l:Level):readonly Wharf[]{
 const made=wharfCache.get(l);if(made)return made;
 const places=l.places??[],list:Wharf[]=[];
 places.forEach((place,i)=>{
  if(place.kind!=='wharf')return;
  const steps=l.platforms.slice(place.from,place.to+1).filter(p=>WHARF.has(role(p,l))).sort((a,b)=>a.x-b.x);if(!steps.length)return;
  const data=place.data??{};
  list.push({name:place.name,x0:steps[0].x,x1:Math.max(...steps.map(p=>p.x+p.w)),steps,data,before:places[i-1]?.kind??'tower',after:places[i+1]?.kind??'end',face:(data.face??list.length)%NEAR.length,seed:i*7+3});
 });
 wharfCache.set(l,list);return list;
}
const wharfOf=(p:Platform,l:Level)=>wharves(l).find(w=>w.steps.includes(p));
/** Where a wharf landing's wall starts: under its coping, or under the quay coping a stack of crates stands on. */
const faceTop=(p:Platform,l:Level)=>p.tag==='quay.grain'?p.y+p.h+10:role(p,l)==='crates'?p.y+p.h+10:p.y+10;
const topAt=(w:Wharf,x:number,l:Level)=>{const p=w.steps.find(q=>x>=q.x&&x<q.x+q.w)??w.steps[0];return faceTop(p,l);};
/** The wall of one wharf, in front of the canal: coursed from the coping down,
 * dark and weeded below the tide line, with its own fittings and its ends. */
function nearFace(c:C,l:Level,w:Wharf,bottom:number){
 const water=l.water!,{key,tile}=NEAR[w.face],span=w.x1-w.x0,v=(k:number)=>hash(w.seed,k,83);
 if(w.data.pier){
  // Coal is tipped from a timber pier, not an island of masonry.
  for(const p of w.steps){
   box(c,'#17110d',p.x,p.y+8,p.w,12);box(c,'#5b4835',p.x,p.y+9,p.w,5);
   for(let x=p.x+9;x<p.x+p.w-9;x+=48){pile(c,x,p.y+16,water+16);stroke(c,'#4b3a2b',x+5,p.y+20,Math.min(x+47,p.x+p.w-4),water+8,3);}
  }
  return;
 }
 // Finished returns recede from the canal edge into the solid near bank.
 // Their widening face keeps land on the landward side right to the frame foot.
 for(const [x,side] of [[w.x0,-1],[w.x1,1]] as const){
  if((side<0?w.before:w.after)==='bridge')continue;
  const top=topAt(w,side<0?x:x-1,l);
  for(let y=top;y<bottom;y++){
   const spread=Math.round((y-top)*.22),left=side<0?x-spread:x;
   box(c,y<l.water!?'#303c45':'#202a31',left,y,spread,1);
   if(y%12===0)box(c,'#56616a',left,y,spread,1);
   if(y%12===11)box(c,'#10181f',left,y,spread,1);
   for(let xx=left+((Math.floor(y/12)%2)*14);xx<left+spread;xx+=28)box(c,'#10181f',xx,y,1,1);
   box(c,'#10171e',side<0?left:x+spread,y,2,1);
  }
 }

 for(const p of w.steps){const top=faceTop(p,l);if(bottom>top)wall(c,key,tile,p.x,top,p.w,bottom-top);box(c,'#0b11178c',p.x,top,p.w,3);}
 if(w.data.house===5){
  for(const p of w.steps)if(p.tag==='quay.grain'){
   // The foreground canal pass follows the deck pass: close the backs of
   // the stacks here too, so water cannot show through their lower tiers.
   for(let yy=0;yy<p.h;yy+=14)for(let xx=0;xx<p.w;xx+=16){
    const hh=Math.min(14,p.h-yy);
    box(c,'#463725',p.x+xx,p.y+yy,16,hh);box(c,'#a18b64',p.x+xx+1,p.y+yy+1,14,hh-1);
    box(c,'#c2ad83',p.x+xx+2,p.y+yy+1,12,2);box(c,'#6c583d',p.x+xx+7,p.y+yy+4,1,Math.max(1,hh-5));
   }
   wall(c,key,tile,p.x,744,p.w,10);
  }
  // The hoist well is inside solid foundations, never open sky or water.
  wall(c,key,tile,4950,754,60,bottom-754);
  box(c,'#101419',4950,744,60,72);
  for(const x of [4950,5002]){box(c,'#514b40',x,744,8,72);for(let yy=752;yy<816;yy+=12)box(c,'#242329',x,yy,8,1);}
 }
 // Where the quay steps up, the higher wall's end is a riser with its own arris.
 for(let i=1;i<w.steps.length;i++){
  const a=w.steps[i-1],b=w.steps[i],ta=faceTop(a,l),tb=faceTop(b,l);if(ta===tb)continue;
  const x=ta<tb?b.x-2:b.x;box(c,'#0f161d',x,Math.min(ta,tb),2,Math.abs(ta-tb));box(c,'#56626e',ta<tb?x-1:x+2,Math.min(ta,tb),1,Math.abs(ta-tb));
 }
 if(w.data.customs){
  // Iron-strapped rubbing timbers protect the customs landing.
  for(const x of [w.x0+42,w.x1-48]){
   const y=topAt(w,x,l)+8;
   box(c,'#17110d',x,y,13,bottom-y);box(c,'#57432f',x+2,y,9,bottom-y);box(c,'#927551',x+2,y,2,bottom-y);
   for(let yy=y+16;yy<bottom;yy+=52){box(c,'#1c2830',x-2,yy,17,5);box(c,'#8b9a9d',x-2,yy,17,1);}
  }
  const x=w.x1-104,y=water-28;
  box(c,'#858d89',x-4,y-12,8,54);for(let k=0;k<9;k++)box(c,'#1a252b',x-4,y-9+k*5,k%2?4:7,1);
  // A grilled discharge, masonry cut away within its stone surround.
  box(c,'#77817d',w.x0+94,water-34,34,28);box(c,'#090f14',w.x0+98,water-29,26,23);
  for(let dx=0;dx<24;dx+=6)box(c,'#65777b',w.x0+100+dx,water-28,2,22);
 }
 // A relaid course, lighter than the old stone round it, along part of the wall.
 if(w.data.house!==5&&!w.data.customs&&w.face!==3){const from=w.x0+Math.round(span*(.1+v(1)*.3)),to=Math.min(w.x1-8,from+90+Math.round(v(2)*140));for(let x=from;x<to;x+=26){const y=topAt(w,x,l)+22;box(c,'#141c24',x,y,26,10);box(c,'#3f4a56',x+1,y+1,24,8);box(c,'#4e5a66',x+1,y+1,24,1);}}
 // Customs repairs are individual stones toothed into three existing courses,
 // at one world height: no band following the stepped platform silhouette.
 if(w.data.customs)for(let row=0;row<3;row++){
  const y=water-60+row*12,from=Math.floor((w.x0+288)/32)*32+(row%2)*16,to=from+(3-row)*32;
  for(let x=from;x<to;x+=32)if(y>topAt(w,x,l)+12){
   box(c,'#172029',x,y,32,12);box(c,row===1?'#414b54':'#35414c',x+1,y+1,30,10);
   box(c,'#505c64',x+1,y+1,30,1);
  }
 }
 // A mend in brick where the face fell out, its edge stepped course by course.
 if(w.data.house!==5&&w.face!==3&&span>200){
  const px=w.x0+Math.round(span*(.55+v(3)*.3))-30,py=topAt(w,px,l)+16+Math.round(v(8)*8),pw=30+Math.round(v(4)*22),ph=Math.min(Math.max(12,water-py-8),18+Math.round(v(9)*12));
  for(let r=0;r*6<ph;r++){const cut=Math.round(hash(r,w.seed,85)*8),wide=pw-cut-Math.round(hash(r,w.seed,86)*8);wall(c,'canal/near/brick',NEAR[3].tile,px+cut,py+r*6,wide,6);box(c,'#0b111766',px+cut,py+r*6,wide,6);}
 }
 // Timber fenders where boats lie against it, or iron rings to make fast to.
 if(w.data.fender)for(let x=w.x0+26;x<w.x1-14;x+=64){const top=topAt(w,x,l)+2;box(c,'#17110d',x-1,top,9,bottom-top);box(c,'#2c2119',x,top,7,bottom-top);box(c,'#4b3a2b',x,top,1,bottom-top);for(let y=top+10;y<bottom;y+=34){box(c,'#232c33',x-1,y,9,3);box(c,'#59666b',x-1,y,9,1);}}
 else if(w.data.house!==5)for(let x=w.x0+38+Math.round(v(5)*30);x<w.x1-26;x+=104+Math.round(v(6)*40)){const y=topAt(w,x,l)+12;box(c,'#59666b',x-4,y,8,7);box(c,'#1b2228',x-3,y+1,6,5);box(c,'#1b2228',x-2,y+6,4,5);box(c,'#59666b',x-3,y+10,6,1);}
 // A drain comes out through the wall above the tide, its stain running down.
 if(w.data.house!==5&&span>180){const x=w.x0+Math.round(span*(.3+v(7)*.4)),y=water-16;box(c,'#46525f',x-7,y-3,14,13);box(c,'#06090c',x-4,y,8,8);box(c,'#06090c',x-3,y-1,6,1);box(c,'#2c4739',x-1,y+8,3,water-y-8);box(c,'#1c2e26',x-2,y+8,1,water-y-6);}
 // The foundations belong to the building above, rather than a single
 // extruded wall texture. All remain solid masonry to the frame foot.
 if(w.data.house===1){
  for(let x=w.x0+30;x<w.x1-20;x+=116){
   wall(c,'canal/near/ashlar',NEAR[2].tile,x,water-12,28,bottom-water+12);
   box(c,'#53606a',x-3,water-14,34,3);box(c,'#101820',x+27,water-10,3,bottom-water+10);
  }
 }else if(w.data.house===2){
  wall(c,'canal/near/rubble',NEAR[1].tile,w.x0,water+14,span,bottom-water-14);
  box(c,'#414c53',w.x0,water+12,span,3);
  const x=w.x0+96;
  box(c,'#455059',x-6,water-16,52,52);box(c,'#10181c',x,water-10,40,40);
  for(let dx=2;dx<40;dx+=8)box(c,'#514b3c',x+dx,water-10,5,40);
  box(c,'#788084',x-5,water-18,50,3);box(c,'#364138',x,water+30,40,bottom-water-30);
 }else if(w.data.house===4){
  // Brick warehouse on a battered stone plinth with bonded corner piers.
  wall(c,'canal/near/ashlar',NEAR[2].tile,w.x0,water+32,span,bottom-water-32);
  for(let x=w.x0+66;x<w.x1-24;x+=132){
   for(let y=water-20,k=0;y<bottom;y+=12,k++){
    const width=k%2?30:22;box(c,'#493932',x,y,width,11);box(c,'#655047',x,y,width,1);
   }
  }
  box(c,'#535c61',w.x0,water+30,span,3);
 }
 // The tide line: weeded and dark at the water, and below it the wall is wet all the way down.
 weed(c,w.x0+2,span-4,water,w.seed);
 if(bottom>water){box(c,'#08101580',w.x0,water,span,bottom-water);if(bottom>water+40)box(c,'#03070a40',w.x0,water+40,span,bottom-water-40);}
 if(w.before!=='bridge')wharfEnd(c,l,w,w.x0,faceTop(w.steps[0],l),bottom,-1,w.before);
 if(w.after!=='bridge')wharfEnd(c,l,w,w.x1,faceTop(w.steps.at(-1)!,l),bottom,1,w.after);
}
/** A wharf's end where the water cuts it. A side canal or a basin was built
 * there, so the end is dressed: quoins down into the water. A breach was not:
 * the wall is torn there, its stones stepping out and down into the canal. */
function wharfEnd(c:C,l:Level,w:Wharf,x:number,top:number,bottom:number,side:-1|1,kind:string){
 const water=l.water!;
 if(kind==='breach'){
  // The wall's end is a torn face: courses broken off short, the lower ones standing further out.
  for(let y=top-2,k=0;y<water+4;y+=7,k++){
   const out=Math.min(22,3+Math.round(hash(k,x,41)*6+(y-top)*.3)),at=side>0?x:x-out;
   box(c,'#141c24',at,y,out,7);box(c,k%2?'#2f3a45':'#3a4652',side>0?at:at+1,y+1,out-1,5);box(c,'#4c5864',side>0?at:at+1,y+1,out-1,1);
   if(k%2)box(c,'#0b0f14',side>0?at+out-3:at,y+2,3,4);
  }
  // A coping stone that went over with it lies tipped against the foot.
  const cx0=side>0?x+14:x-36;for(let k=0;k<6;k++){box(c,'#1a2129',cx0+k*4,water-12+k*2,6,8);box(c,'#7d878c',cx0+k*4+1,water-12+k*2,4,2);}
  box(c,'#0f161d',side<0?x:x-2,top,2,bottom-top);return;
 }
 for(let y=top,k=0;y<bottom;y+=12,k++){const wide=k%2?18:10,at=side<0?x:x-wide;box(c,y<water?'#3a4552':'#232b33',at,y+1,wide,11);box(c,y<water?'#4a5662':'#2c353f',at,y+1,wide,1);box(c,'#1c242d',at,y+11,wide,1);}
 box(c,'#0f161d',side<0?x:x-2,top,2,bottom-top);box(c,'#56626e',side<0?x+2:x-3,top,1,Math.max(0,water-top));
}
/** The near bank above the coping: the building that uses each wharf, its crane or gantry, its bollards and lamp. */
function nearBank(c:C,l:Level,cx:number,cy:number,vw:number,vh:number){
 for(const w of wharves(l)){
  if(w.x1<cx-260||w.x0>cx+vw+260)continue;
  const first=w.steps[0],ground=first.y,at=(art:HTMLCanvasElement,x:number,foot:number)=>{const y=foot+4-art.height;if(visible(x,y,art.width,art.height,cx,cy,vw,vh))c.drawImage(art,x,y);};
  switch(w.data.house){
   case 1:{const sill=l.platforms.find(p=>p.tag==='sill'),x=first.x+22,top=ground+4-200;at(bondedStore(330,200,{x:(sill?sill.x+6:x+234)-x,sill:(sill?sill.y:ground-96)-top}),x,ground);break;}
   case 2:at(goodsShed(260,112),first.x+30,ground);break;
   case 3:at(weighHouse(200,96),first.x+10,ground);break;
   case 4:{const dock=w.steps.find(p=>p.tag==='dock'),x=first.x+6,top=ground+4-190;at(chandlers(334,190,dock?{x:dock.x-x,w:dock.w,y:dock.y-top}:{x:220,w:110,y:180}),x,ground);break;}
   case 5:{
    granaryRoom(c,4174,568,1396);
    break;
   }
   case 6:at(customHouse(190,180),first.x+5,ground);break;
   case 7:at(tipHouse(206,132),first.x+8,ground);break;
  }
  if(w.data.crane){const hi=w.steps.at(-1)!;postCrane(c,hi.x+hi.w-26,hi.y+4,70,1);}
  if(w.data.gantry){const deck=l.platforms.find(p=>p.tag==='gantry'&&p.x>=w.x0&&p.x<w.x1),legs=deck?[deck.x+30,deck.x+120]:[],under=w.steps.find(p=>p.x<=legs[0]-16&&p.x+p.w>=legs[1]+16)??first;if(deck)gantry(c,deck.x,deck.x+deck.w,deck.y,under.y+2,legs);}
  // Iron bollards at each end hold the mooring ropes; a lamp stands where no building lights the quay.
  for(const p of [first,w.steps.at(-1)!])if(role(p,l)==='quay')for(const x of p===first?[p.x+12]:[p.x+p.w-18]){box(c,'#141b21',x,p.y-9,6,9);box(c,'#141b21',x-2,p.y-11,10,3);box(c,'#4a585f',x-1,p.y-11,8,1);}
  if(w.data.lamp){const x=Math.round(first.x+first.w*w.data.lamp/10),lit=!!w.data.lit;box(c,'#141b21',x-1,ground-58,3,58);box(c,'#3d4a51',x,ground-58,1,58);box(c,'#141b21',x-4,ground-4,9,4);box(c,'#141b21',x-5,ground-72,11,14);box(c,lit?'#f0c47a':'#232e37',x-3,ground-70,7,10);if(lit){box(c,'#fff1c4',x-1,ground-68,3,5);box(c,'#f3c77a26',x-14,ground-80,29,29);}box(c,'#3d4a51',x-5,ground-74,11,2);}
  if(w.data.cart)handcart(c,w.x1-90,ground);
  if(w.data.rope){const x=w.steps[0].x+40;box(c,'#17110d',x,ground-14,12,14);box(c,'#4b3a2b',x+1,ground-13,10,12);box(c,'#232c33',x,ground-11,12,2);box(c,'#232c33',x,ground-5,12,2);for(let k=0;k<3;k++)box(c,'#8a7a5a',x+16+k,ground-6+k*2,14-k*2,2);box(c,'#6a5a3e',x+18,ground-4,8,1);}
 }
}
/** A handcart left by the shed: two tall wheels, a bed of sacks, its shafts down on the stones. */
function handcart(c:C,x:number,ground:number){
 for(const wx of [x+6,x+30]){for(let a=0;a<16;a++){const g=a/16*Math.PI*2;box(c,'#17110d',Math.round(wx+Math.cos(g)*9),Math.round(ground-10+Math.sin(g)*9),2,2);}box(c,'#3a2d23',wx-1,ground-11,3,3);stroke(c,'#2c2119',wx-7,ground-10,wx+7,ground-10,1);stroke(c,'#2c2119',wx,ground-17,wx,ground-3,1);}
 box(c,'#17110d',x-2,ground-22,44,4);box(c,'#4b3a2b',x-1,ground-22,42,2);stroke(c,'#2c2119',x+40,ground-20,x+64,ground-1,2);
 for(const [sx,sy] of [[0,-30],[12,-30],[24,-30],[6,-36]] as const){box(c,'#5a4a36',x+sx,ground+sy,12,8);box(c,'#8a7656',x+sx+1,ground+sy,10,6);box(c,'#a89272',x+sx+1,ground+sy,10,1);}
}
/** What hurts on the canal is what the canal broke: on a dolphin's cap, the
 * iron stub of a mooring bolt sheared off with its plate; on the builders'
 * staging, the splintered ends of planks torn up out of the deck. */
function snappedBolt(c:C,r:{x:number;y:number;w:number;h:number}){
 const x=Math.round(r.x),y=Math.round(r.y),w=Math.round(r.w),h=Math.round(r.h);
 // Cold iron against oak: the complete damaging silhouette stays in r.
 box(c,'#0b0d0f',x,y+h-4,w,4);box(c,'#71838d',x+1,y+h-3,w-2,2);
 box(c,'#0b0d0f',x+3,y+2,w-6,h-5);box(c,'#526976',x+4,y+2,w-8,h-6);
 box(c,'#b5cbd0',x+4,y+2,2,h-7);box(c,'#263640',x+w-5,y+3,1,h-7);
 for(const [dx,dy] of [[3,1],[6,0],[10,1]] as const){box(c,'#0b0d0f',x+dx,y+dy,3,3);box(c,'#d8e5e6',x+dx+1,y+dy,2,1);}
 box(c,'#d8e5e6',x+1,y+h-3,2,1);box(c,'#d8e5e6',x+w-3,y+h-3,2,1);
}
function tornPlanks(c:C,r:{x:number;y:number;w:number;h:number}){
 const x=Math.round(r.x),y=Math.round(r.y),h=Math.round(r.h),foot=y+h;
 box(c,'#0b0d0f',x,foot-2,Math.round(r.w),2);
 for(const [at,lean,len,tip] of [[1,5,h,'#d6bd92'],[9,2,h-2,'#c9b08a'],[15,-3,h,'#d6bd92'],[22,4,h-3,'#c9b08a']] as const){
  for(let k=0;k<len;k++){const px=x+at+Math.round(lean*k/len);box(c,'#17110d',px-1,foot-1-k,5,1);box(c,k>len-3?tip:'#6b523a',px,foot-1-k,3,1);}
  box(c,'#8c989d',x+at+Math.round(lean/2),foot-Math.round(len/2),1,1);
 }
}
const formed=new WeakSet<Level>();
function formHazards(l:Level){
 if(formed.has(l))return;formed.add(l);
 for(const h of l.hazards){const p=h.platform===undefined?undefined:l.platforms[h.platform];if(p?.tag==='piles.bolt')formSpikes(h,snappedBolt);else if(p?.tag==='staging.torn')formSpikes(h,tornPlanks);}
}
/** The wheelhouse of the sunk lighter is racked toward her bow: its foot has gone with the deck, its roof is where you stand. */
const wheelhouse=(w:number,h:number)=>sprite(`canal/wheelhouse/${w}/${h}`,w,h,c=>{
 box(c,'#17110d',0,0,w,h);
 for(let x=1;x<w-1;x+=7){box(c,hash(x,3,5)>.5?'#3f3227':'#3a2d23',x,7,6,h-7);box(c,'#4d3d2f',x,7,1,h-7);}
 box(c,'#14100d',10,16,30,22);box(c,'#1a2633',12,18,12,18);box(c,'#0b1016',26,18,12,18);box(c,'#26384a',13,19,4,7);box(c,'#1a2633',26,30,5,6);box(c,'#4d3d2f',9,38,32,2);
 box(c,'#14100d',52,14,26,h-14);box(c,'#33261d',54,16,22,h-16);box(c,'#4a3828',54,16,22,1);box(c,'#33261d',64,16,1,h-16);box(c,'#a9905f',57,40,2,3);
 box(c,'#0a141a73',0,h-9,w,9);box(c,'#2c4739',3,h-5,5,5);
});
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number,clock:number){
 const water=l.water!;formHazards(l);bridge(c,l,cx,cy,vw,vh);
 if(towerEnd(l)>0&&cx<FOOT_X+40){spireOut(c,cx,cy,vw,vh);if(visible(0,TOP,FOOT_X+16,water+40-TOP,cx,cy,vw,vh))c.drawImage(towerArt(l),0,TOP);}
 nearBank(c,l,cx,cy,vw,vh);
 for(const p of l.platforms){
  const kind=role(p,l),top=p.y+p.h;
  if(kind==='raft'){
   // A raft that crosses a basin runs on a chain between two posts.
   const travel=p.travel??0;if(!visible(p.x-travel-40,p.y-30,p.w+travel*2+80,60,cx,cy,vw,vh))continue;
   const a=p.x-travel-30,b=p.x+p.w+travel+22;pile(c,a,p.y-26,water);pile(c,b,p.y-26,water);
   for(let x=a+10;x<b;x+=6)box(c,(x/6|0)%2?'#59666b':'#2c353b',x,p.y-12+Math.round(Math.sin((x-a)/(b-a)*Math.PI)*5),4,2);
   continue;
  }
  if(kind==='tower'||kind==='barge'||!visible(p.x-40,p.y-70,p.w+80,water+60-p.y+70,cx,cy,vw,vh))continue;
  if(kind==='piles'&&load(p)!=='bolt'&&p.tag?.includes('.mooring')){
   canalMooring(c,p,water);
  }else if(kind==='piles'){
   const offsets=p.w<60?[5,p.w-15]:[3,Math.round(p.w*.6)-5,p.w-13];
   for(const x of offsets)pile(c,p.x+x,top-4,water);
   if(p.w<60){
    const crossed=p.id%2===0;
    stroke(c,'#6a5440',p.x+10,top+3,p.x+p.w-10,water-3,3);
    if(crossed)stroke(c,'#4b3a2b',p.x+p.w-10,top+3,p.x+10,water-3,2);
    else for(let y=top+5;y<water-2;y+=6)box(c,'#9c8861',p.x+3,y,12,2);
   }
  }
  else if(kind==='staging'){
   const a=p.x+8,b=p.x+p.w-18;pile(c,a,p.y+10,water);pile(c,b,p.y+10,water);if(p.w>100)pile(c,p.x+p.w/2-5,p.y+10,water);
   stroke(c,'#2a2119',a+5,p.y+14,b+5,water-5,2);stroke(c,'#2a2119',b+5,p.y+14,a+5,water-5,2);
  }else if(kind==='stage'){
   // The ferry stage floats between two guide piles, under a gangway from the quay.
   for(const x of [p.x+6,p.x+p.w-16]){pile(c,x,p.y-34,water);box(c,'#59666b',x-1,p.y-30,12,2);}
  }else if(kind==='pontoon'){
   // A section of the old pontoon: chained to whatever stands either side of it, the chain hanging into the water.
   for(const side of [-1,1]){
    let edge:number|null=null;
    for(const q of l.platforms)if(q!==p&&q.kind!=='moving'&&!q.branch&&water-q.y<60){const at=side<0?q.x+q.w:q.x,gap=side<0?p.x-at:at-p.x-p.w;if(gap>0&&gap<=110&&(edge===null||gap<Math.abs((side<0?p.x:p.x+p.w)-edge)))edge=at;}
    if(edge===null)continue;
    const from=side<0?p.x:p.x+p.w,steps=Math.max(4,Math.round(Math.abs(edge-from)/5));
    for(let i=0;i<=steps;i++){const k=i/steps;box(c,i%2?'#59666b':'#2c353b',from+(edge-from)*k,p.y+5+Math.sin(k*Math.PI)*5,3,2);}
   }
  }else if(kind==='cabin'){
   // The lighter lies sunk by the head: her back broke at the wheelhouse, her
   // stern sits on the bottom with its rudder clear, and her fore deck runs
   // down into the canal. The wheelhouse is racked toward the bow.
   const x0=p.x-80,y0=p.y+p.h-2;c.drawImage(wreckHull(),x0,y0-14);
   const art=wheelhouse(p.w,p.h);for(let y=8;y<art.height;y++){const lean=-Math.round(7*(y-8)/(art.height-8));c.drawImage(art,0,y,art.width,1,p.x+lean,p.y+y,art.width,1);}
   const mast=l.platforms.filter(q=>role(q,l)==='mast').sort((a,b)=>a.y-b.y);
   if(mast.length){
    // Her derrick mast still stands, stepped through the fore deck, with the two crosstrees left on it and its stays.
    const mx=Math.round(mast[0].x+mast[0].w/2),head=mast[0].y-34,foot=y0+sheer(mx-x0)+2;
    stroke(c,'#3a3027',mx,head+6,p.x+p.w-4,p.y+2,1);stroke(c,'#3a3027',mx,head+6,Math.min(x0+WRECK_W-30,mx+96),Math.min(water,y0+sheer(Math.min(WRECK_W-30,mx+96-x0))),1);
    // She has gone down by the head, so the mast leans toward the bow; it still passes through both crosstrees.
    const pivot=(mast[0].y+mast.at(-1)!.y)/2+12,at=(y:number)=>mx+Math.round((pivot-y)*.035);
    for(let y=head;y<foot;y++){const x=at(y);box(c,'#17110d',x-4,y,8,1);box(c,'#4b3a2b',x-3,y,5,1);box(c,'#6a5440',x-2,y,2,1);}
    box(c,'#17110d',at(head)-5,head-3,10,4);
    for(let y=head+24;y<foot;y+=44){box(c,'#232c33',at(y)-4,y,8,3);box(c,'#59666b',at(y)-4,y,8,1);}
    for(const q of mast){stroke(c,'#2a2119',mx,q.y+30,q.x+4,q.y+11,2);stroke(c,'#2a2119',mx,q.y+30,q.x+q.w-5,q.y+11,2);}
    // The derrick boom came down across the fore deck when she settled, its end in the water.
    stroke(c,'#17110d',mx+6,foot-30,mx+110,water+2,4);stroke(c,'#6a5440',mx+6,foot-31,mx+110,water+1,1);
   }
  }else if(kind==='beacon'){
   // A channel beacon: three long piles hooped and cross-braced, a stage on their heads, and its lamp burning.
   for(const x of [p.x+3,Math.round(p.x+p.w/2)-5,p.x+p.w-13])pile(c,x,top-4,water);
   for(let y=p.y+40,k=0;y<water-30;y+=52,k++){stroke(c,'#2a2119',p.x+8,y,p.x+p.w-8,y+40,2);stroke(c,'#2a2119',p.x+p.w-8,y,p.x+8,y+40,2);box(c,'#232c33',p.x+2,y-6,p.w-4,4);box(c,'#59666b',p.x+2,y-6,p.w-4,1);}
   beaconLamp(c,p.x+5,p.y,t);
  }else if(kind==='spar'){
   // A channel marker: one tall post, a cross-spar and a dark lamp.
   const x=Math.round(p.x+p.w/2)-4;pile(c,x,p.y-6,water);box(c,'#141b21',x-2,p.y-22,13,16);box(c,'#232e37',x,p.y-20,9,12);box(c,'#3d4a51',x-3,p.y-24,15,2);
  }else if(kind==='boat'){
   // A moored lighter's rudder hangs on her stern post, the tiller lashed amidships.
   rudder(c,p.x,p.y,load(p)==='coal');
  }else if(kind==='skiff'){
   // The skiff's painter runs up to the nearest ring; her oars lie across the thwarts.
   stroke(c,'#8a7a5a',p.x+p.w,p.y-2,p.x+p.w+14,p.y-18,1);
  }
 }
 // Every barge on a short rope is made fast to the nearest quay bollard.
 for(const p of l.platforms){
  if(role(p,l)!=='barge')continue;const tie=mooring(p,l);if(!tie)continue;
  const at=platformAt(p,clock),end=tie.x<p.x?at.x+4:at.x+p.w-4,sag=Math.max(4,10-Math.abs(end-tie.x)*.08);
  if(!visible(Math.min(end,tie.x),tie.y-4,Math.abs(end-tie.x),40,cx,cy,vw,vh))continue;
  const steps=Math.max(4,Math.round(Math.abs(end-tie.x)/3));for(let i=0;i<=steps;i++){const k=i/steps;box(c,'#8a7a5a',tie.x+(end-tie.x)*k,tie.y+(at.y-2-tie.y)*k+Math.sin(k*Math.PI)*sag,2,1);}
 }
}
/** Three existing dolphins, rebuilt for their different jobs. Bolt art is untouched. */
function canalMooring(c:C,p:Platform,water:number){
 const variant=load(p),x=p.x,y=p.y,w=p.w;
 const offsets=variant==='mooringA'?[2,w-12]:variant==='mooringB'?[10,w-12]:[0,18,w-10];
 for(const dx of offsets){pile(c,x+dx,y+5,water+24);box(c,'#293943',x+dx-1,y+18,12,4);box(c,'#8a989b',x+dx,y+18,10,1);}
 if(variant==='mooringA'){
  stroke(c,'#806447',x+7,y+15,x+w-7,water+14,4);
  box(c,'#413124',x,y+8,w,8);for(const dx of [4,w-9])box(c,'#a6ada6',x+dx,y+9,3,3);
 }else if(variant==='mooringB'){
  stroke(c,'#423428',x+14,y+12,x+w-8,water+20,4);
  stroke(c,'#6b5843',x+w-8,y+12,x+14,water+20,3);
  for(let yy=y+12;yy<y+32;yy+=4)box(c,'#a28c64',x+8,yy,14,2);
 }else{
  box(c,'#2a3338',x-1,y+10,w+2,6);box(c,'#718084',x,y+10,w,1);
  stroke(c,'#63503c',x+4,water+20,x+w-6,y+20,4);
  box(c,'#71624e',x+20,y+18,3,water-y+6);
 }
}
/** The beacon's lamp: a lantern on its post, lit for the ferry, its light thrown round it on the dark. */
function beaconLamp(c:C,x:number,y:number,t:number){
 const flicker=Math.round(Math.sin(t*5.3)+Math.sin(t*8.1));
 for(const [r,a] of [[34,'#f3c77a0c'],[24,'#f3c77a14'],[15,'#f3c77a22'],[8,'#ffe2a033']] as const)for(let dy=-r;dy<=r;dy++){const half=Math.round(Math.sqrt(r*r-dy*dy));box(c,a,x-half,y-38+dy,half*2+1,1);}
 box(c,'#141b21',x-1,y-30,3,30);box(c,'#3d4a51',x,y-30,1,30);
 box(c,'#141b21',x-5,y-46,11,16);box(c,'#f0c47a',x-3,y-44,7,12);box(c,'#fff1c4',x-1,y-42+Math.max(0,flicker),3,6);
 box(c,'#141b21',x-5,y-38,11,1);box(c,'#141b21',x,y-44,1,12);
 box(c,'#3d4a51',x-6,y-48,13,2);box(c,'#141b21',x-3,y-51,7,3);box(c,'#141b21',x-1,y-53,3,2);
}
/** A rudder on the stern post, and its tiller: on a coal lighter a long sweep lashed down, otherwise a short bar cocked up. */
function rudder(c:C,x:number,y:number,sweep:boolean){
 box(c,'#14100d',x-9,y+2,7,24);box(c,'#3a2d23',x-8,y+3,5,22);box(c,'#4b3a2b',x-8,y+3,1,22);box(c,'#232c33',x-9,y+8,7,2);box(c,'#232c33',x-9,y+18,7,2);
 if(sweep){stroke(c,'#14100d',x-6,y+2,x+22,y-3,2);stroke(c,'#6a5440',x-6,y+1,x+22,y-4,1);}
 else{stroke(c,'#14100d',x-6,y+2,x-24,y-9,2);stroke(c,'#6a5440',x-6,y+1,x-24,y-10,1);box(c,'#14100d',x-26,y-12,4,4);}
}
/** Cargo stands above the tile's eight-pixel margin, so paint it in world space. */
function bargeCargo(c:C,p:Platform,x:number,y:number){
 const w=p.w,what=load(p);c.save();c.translate(x,y);
 if(what==='tiller'){
  // A rope coil and a shipping crate: cargo silhouettes above the gunwale.
  const cx=Math.round(w*.34);
  for(let r=15;r>=3;r-=3){c.strokeStyle=r%2?'#baa47b':'#756044';c.lineWidth=2;c.beginPath();c.ellipse(cx,-5,r,Math.max(2,r*.35),0,0,Math.PI*2);c.stroke();}
  stroke(c,'#baa47b',cx+14,-5,cx+23,-1,2);
  box(c,'#17110d',w-34,-22,25,23);box(c,'#8d704f',w-33,-21,23,20);
  box(c,'#c0a078',w-33,-21,23,2);box(c,'#4b3929',w-30,-18,17,14);
  stroke(c,'#b2946d',w-30,-18,w-14,-5,2);box(c,'#dad0ab',w-25,-14,7,4);
 }else if(what==='hatch'){
  // A full raised hatch cover, with a locking iron athwart it.
  box(c,'#14191c',12,-15,w-24,17);box(c,'#657164',14,-14,w-28,14);
  for(let x=20;x<w-14;x+=10)box(c,'#39483f',x,-13,1,13);
  box(c,'#a4aa8e',14,-14,w-28,2);box(c,'#131e26',10,-7,w-20,5);
  box(c,'#97a9ae',10,-7,w-20,1);box(c,'#c4d0cf',w/2-2,-8,4,7);
 }
 c.restore();
}
function mover(c:C,p:Platform,x:number,y:number,l:Level){
 if(role(p,l)!=='barge')return;
 bargeCargo(c,p,x,y);
 if(load(p)==='tiller')rudder(c,x,y,false);
 // A rope fender hangs off the bow of every barge.
 box(c,'#5a4a36',x+p.w+2,y+6,4,8);box(c,'#8a7656',x+p.w+2,y+6,4,1);stroke(c,'#8a7a5a',x+p.w-2,y+1,x+p.w+3,y+6,1);
}
/** How far the wreck's deck has gone down, along her length from the stern: level to where her back broke, then down by the head into the canal. */
const BREAK=196;
const sheer=(x:number)=>x<BREAK?2:2+Math.round((x-BREAK)*.42);
/** The hull is drawn 14 px higher than her deck line so the stern, lifted clear, shows its run and its rudder. */
const wreckHull=()=>sprite('canal/wreck/sunk',WRECK_W,104,c=>{
 const lift=14,keel=(x:number)=>Math.min(100,lift+8+Math.round(x*.2));
 for(let x=0;x<WRECK_W;x++){
  const top=lift+sheer(x)+(x<8?(8-x)*2:0),bottom=Math.max(top+6,keel(x));
  box(c,'#2c2119',x,top,1,bottom-top);box(c,'#14100d',x,bottom-1,1,1);
  for(let k=1;k<12;k++){const y=lift+sheer(x)+k*6+3;if(y<bottom-1)box(c,'#1c1511',x,y,1,1);}
  if(x>=8){box(c,'#14100d',x,lift+sheer(x)+2,1,1);box(c,'#7a6048',x,lift+sheer(x),1,2);box(c,'#b2946d',x,lift+sheer(x),1,1);}
 }
 // Butts in the planking, the rubbing strake, and the plank she was stove in by.
 for(let x=14;x<WRECK_W-6;x+=37)for(let k=0;k<9;k++)if((x/37+k)%3<1&&lift+sheer(x)+k*6+9<keel(x))box(c,'#1c1511',x+k*5%23,lift+sheer(x)+k*6+4,1,5);
 for(let x=10;x<WRECK_W;x++)box(c,'#3d2e22',x,lift+sheer(x)+9,1,2);
 // Where her back broke: the planking split open across her, splinters standing out of the seam.
 for(let k=0;k<26;k++){const x=BREAK-2+(k%3)-1,y=lift+4+k;box(c,'#0b0d0f',x,y,3,1);}
 for(const [dx,dy] of [[-4,6],[3,10],[-3,15],[4,19]] as const){box(c,'#7a6048',BREAK+dx,lift+dy,3,1);box(c,'#b2946d',BREAK+dx+(dx>0?2:0),lift+dy,1,1);}
 box(c,'#0b0d0f',236,lift+sheer(236)+12,22,9);box(c,'#14100d',240,lift+sheer(240)+10,12,3);
 // The rudder, hung clear of the water on her lifted stern.
 box(c,'#14100d',0,lift+4,7,40);box(c,'#3a2d23',1,lift+6,5,36);box(c,'#4b3a2b',1,lift+6,1,36);box(c,'#232c33',0,lift+14,7,2);box(c,'#232c33',0,lift+28,7,2);
 box(c,'#14100d',2,lift-12,5,16);box(c,'#6a5440',3,lift-12,2,14);box(c,'#14100d',4,lift-14,30,4);box(c,'#7a6048',5,lift-14,28,1);
});
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
 const top=l.water!,far=top-FAR,bottom=cy+vh+24;
 if(bottom>top){
  sheet(c,cx-24,vw+48,top,bottom,far);
  ripples(c,cx-24,cx+vw+24,top,bottom,far,t);
  for(let x=Math.floor((cx-24)/22)*22;x<cx+vw+24;x+=22){const wave=Math.round(Math.sin(t*1.7+x*.21));box(c,'#5a8a94',x+3,top+wave,11,1);}
  for(const p of l.platforms){const kind=role(p,l);if(p.x+p.w<cx-24||p.x>cx+vw+24)continue;if(kind==='stage'||kind==='beacon')shadowOnWater(c,p.x,p.w,top,t);else if(kind==='cabin')shadowOnWater(c,p.x-80,BREAK+40,top,t);}
  // The tower stands in the canal and lies on it, dark, with its water gate a deeper dark.
  if(towerEnd(l)>0&&cx<FOOT_X+24){shadowOnWater(c,TX0,TX1-TX0,top,t);shadowOnWater(c,TX1,FOOT_X-TX1,top,t);}
  // The footbridge lies on the water pier by pier; under its arches the canal is open.
  const sp=span(l);if(sp&&sp.x1>cx-24&&sp.x0<cx+vw+24)for(const [a,b] of sp.solid)shadowOnWater(c,a-3,b-a+6,top,t);
  // The canal washes over the wreck's fore deck where it goes under.
  const cabin=cabinOf(l);if(cabin&&cabin.x>cx-400&&cabin.x<cx+vw+100){const x=cabin.x-80+BREAK+Math.round((top-cabin.y-cabin.h)/.42)+2;for(let k=0;k<6;k++)box(c,k%2?'#8fb3b8':'#5a8a94',x-8+k*5+Math.round(Math.sin(t*2+k)*1.5),top-1+(k%3?0:1),3,1);}
  // A wharf's dressed end lies on the water beside it; a breach has its fallen stones in it.
  for(const w of wharves(l))for(const [x,side,kind] of [[w.x0,-1,w.before],[w.x1,1,w.after]] as const){
   if(kind==='bridge'||x<cx-60||x>cx+vw+60)continue;
   for(let k=0;k<5;k++){const len=10-k*2,slip=Math.round(Math.sin(t*1.3+k+x*.03)*(1+k*.4));box(c,'#0a161d99',(side<0?x-len:x)+slip,top+2+k*4,len,k<2?2:1);}
   if(kind==='breach')for(let k=0;k<5;k++){const bw=10+Math.round(hash(k,x,48)*9),bx=side>0?x+44+k*14+Math.round(hash(k,x,47)*6):x-44-k*14-bw,rise=2+Math.round(hash(k,x,49)*4);box(c,'#141c24',bx,top-rise,bw,rise+3);box(c,'#3a4652',bx+1,top-rise+1,bw-2,rise);box(c,'#4c5864',bx+1,top-rise,bw-2,1);box(c,'#2c4739',bx+1,top+1,bw-2,1);}
  }
  moonPath(c,cx+Math.round(vw*.78-cx*MOON_PAN),top,bottom,far,t);
  // The beacon and the lamps on the quay lie on the water.
  for(const p of l.platforms)if(role(p,l)==='beacon'&&p.x>cx-40&&p.x<cx+vw+40)lampOnWater(c,p.x+5,top,top-p.y+40,t);
  if(s){
   // The lantern you carry and every jar still burning lie on the water under them.
   if(top-s.y<150&&s.y<top)lampOnWater(c,Math.round(s.x+8+s.facing*7),top,top-s.y-24,t);
   for(const p of l.pickups)if(p.kind==='spark'&&p.x>cx-20&&p.x<cx+vw+20&&top-p.y<150&&!s.collected.includes(p.id))lampOnWater(c,Math.round(p.x),top,top-p.y,t);
  }
 }
 // The near quay stands in front of all of it, from its coping down past the foot of the view.
 for(const w of wharves(l))if(w.x1>cx-24&&w.x0<cx+vw+24)nearFace(c,l,w,Math.max(bottom,top+40));
}
export function hull(c:C,w:number,deep:number){
 // A timber hull seen side on: sheer strake, planked sides, the turn of the bilge.
 for(let y=0;y<deep;y++){const inset=y<3?-3:Math.round((y-3)*(y-3)*.018);box(c,y%5===4?'#1c1511':'#2c2119',inset,y,w-inset*2,1);}
 box(c,'#14100d',-4,0,w+8,3);box(c,'#7a6048',-3,0,w+6,2);box(c,'#b2946d',-3,0,w+6,1);
}
function deck(c:C,p:Platform,l:Level){
 const w=p.w,kind=role(p,l),what=load(p);
 if(p.tag==='quay.floor'){
  box(c,'#211810',0,0,w,14);box(c,'#897053',0,0,w,3);box(c,'#513e2c',0,3,w,9);
  for(let x=12;x<w;x+=23){box(c,'#241b14',x,3,1,9);box(c,'#a1977e',x-3,5,2,1);}return;
 }
 if(p.tag==='quay.grain'){
  for(let y=0;y<p.h;y+=14)for(let x=0;x<w;x+=16){
   box(c,'#463725',x,y,16,14);box(c,'#a18b64',x+1,y+1,14,12);box(c,'#c2ad83',x+2,y+1,12,2);
   box(c,'#6c583d',x+7,y+4,1,8);
  }return;
 }
 if(p.tag?.includes('.mooring')){
  const v=load(p);box(c,'#211910',0,0,w,10);
  if(v==='mooringA'){box(c,'#9b805b',0,0,w,3);box(c,'#695039',0,3,w,7);box(c,'#39464b',5,0,5,10);box(c,'#8e9da0',6,0,2,9);}
  else if(v==='mooringB'){for(let x=0;x<w;x+=8){box(c,'#80654a',x,0,7,7);box(c,'#b29770',x,0,7,1);}box(c,'#382a20',0,7,w,4);}
  else{box(c,'#667477',0,0,w,4);box(c,'#343e43',0,4,w,6);for(let x=4;x<w;x+=11)box(c,'#a8afaa',x,2,2,2);}return;
 }

 if(kind==='pontoon'){
  // Rotten deck boards on a rail, across two cask floats. A board has gone already.
  box(c,'#15100c',-1,0,w+2,6);box(c,'#57493a',0,0,w,5);box(c,'#8a7a62',0,0,w,2);box(c,'#6a5b48',0,2,w,1);
  for(let x=5+p.id%4;x<w-3;x+=8)box(c,'#231a14',x,2,1,3);
  box(c,'#15100c',Math.round(w*.52),0,7,5);box(c,'#4a5a44',6,1,9,1);
  box(c,'#2c2119',0,5,w,5);box(c,'#3d2e22',0,5,w,1);
  for(const x of [4,w-24]){box(c,'#17110d',x,9,20,13);box(c,'#4b3a2b',x+1,10,18,11);box(c,'#6a5440',x+1,10,18,2);box(c,'#232c33',x+4,9,2,13);box(c,'#232c33',x+14,9,2,13);}
  return;
 }
 if(kind==='raft'){
  // The chain raft: sawn planks across a bed of logs, a ring at each end for the chain.
  for(let y=6;y<20;y+=7){box(c,'#17110d',-1,y,w+2,7);box(c,'#3d2e22',0,y+1,w,5);box(c,'#4b3a2b',0,y+1,w,1);box(c,'#1c1511',-2,y+1,3,5);box(c,'#1c1511',w-1,y+1,3,5);}
  box(c,'#15100c',-1,0,w+2,7);box(c,'#6b523a',0,0,w,5);box(c,'#b2946d',0,0,w,1);for(let x=9;x<w-2;x+=10)box(c,'#3d2e22',x,1,1,4);
  for(const x of [2,w-8]){box(c,'#232c33',x,-3,6,4);box(c,'#59666b',x+1,-3,4,1);}
  return;
 }
 if(kind==='wreck'){
  // The lighter's stern deck: the hull under it is drawn with the rest of her.
  box(c,'#14100d',-2,0,w+2,4);box(c,'#6b523a',-1,0,w+1,3);box(c,'#b2946d',-1,0,w+1,1);for(let x=9;x<w-2;x+=11)box(c,'#3d2e22',x,1,1,2);
  for(const x of [10,26]){box(c,'#14100d',x,-6,6,6);box(c,'#7a6048',x+1,-6,4,1);}
  return;
 }
 if(kind==='cabin'){
  // The wheelhouse roof: tarred boards under a lead edge. Its walls, racked, are drawn with the hull.
  box(c,'#14100d',-3,0,w+6,8);box(c,'#3d444a',-3,0,w+6,6);box(c,'#7d878c',-3,0,w+6,1);box(c,'#262d33',-3,6,w+6,2);
  return;
 }
 if(kind==='mast'||kind==='gantry'){
  box(c,'#17110d',-1,0,w+2,12);box(c,'#6b523a',0,0,w,8);box(c,'#b2946d',0,0,w,2);box(c,'#33261d',0,8,w,3);
  if(kind==='mast')for(const x of [3,w-6]){box(c,'#232c33',x,0,3,11);box(c,'#59666b',x,0,1,11);}
  else for(let x=13;x<w-3;x+=14)box(c,'#3d2e22',x,2,1,6);
  return;
 }
 if(kind==='quay'||kind==='bridge'||kind==='steps'){
  // A granite coping on coursed stone; the wall under it is drawn in front of the canal.
  const wharf=kind==='bridge'?undefined:wharfOf(p,l),tone=wharf?.face===3?['#6f777b','#9aa1a0']:wharf?.face===1?['#737d82','#a2abab']:['#7d878c','#aab3b3'];
  box(c,'#1a2129',-2,0,w+4,10);box(c,tone[0],-2,0,w+4,8);box(c,tone[1],-2,0,w+4,2);box(c,'#5d676e',-2,7,w+4,1);
  if(wharf?.data.pier){box(c,'#17110d',-1,0,w+2,9);box(c,'#8d704f',0,0,w,7);box(c,'#b2946d',0,0,w,2);for(let x=8;x<w;x+=9)box(c,'#493828',x,2,1,5);return;}
  const joint=kind==='steps'?w+1:wharf?.face===2?72:wharf?.face===1?38:52;
  for(let x=Math.round(joint*.7)+p.id%3*9;x<w-10;x+=joint)box(c,'#565f66',x,2,1,6);
  // Worn hollows where carts turned, and a chipped arris; at a breach the coping's end has gone with the wall.
  if(w>120)for(let i=0;i<3;i++){const x=Math.round(hash(p.id,i,91)*(w-30))+10;box(c,'#6b757a',x,2,8+i*3,1);}
  if(wharf&&kind==='quay'){
   const breachEnd=wharf.after==='breach'&&p.x+p.w===wharf.x1?w:wharf.before==='breach'&&p.x===wharf.x0?0:-1;
   if(breachEnd>=0){const side=breachEnd?-1:1;for(let k=0;k<4;k++){const x=breachEnd+side*(k*3+1)-(side<0?3:0);box(c,'#1a2129',x,4+k,3,6-k);}box(c,'#565f66',breachEnd+side*14-(side<0?1:0),1,1,7);}
  }
  return;
 }
 if(kind==='crates'){
  // Crates stacked on the quay coping: two tiers, stencilled and roped. The coping runs on under them.
  for(const [x,y,cw,ch] of [[0,0,26,20],[26,0,22,20],[0,20,22,20],[22,20,26,20]] as const){
   box(c,'#17110d',x,y,cw,ch);box(c,'#5a4632',x+1,y+1,cw-2,ch-2);box(c,'#7a6048',x+1,y+1,cw-2,1);
   box(c,'#3d2e22',x+1,y+Math.round(ch/2),cw-2,1);stroke(c,'#3d2e22',x+2,y+2,x+cw-3,y+ch-3,1);
   box(c,'#8a8070',x+Math.round(cw/2)-3,y+5,6,3);
  }
  box(c,'#b2946d',0,0,w,1);stroke(c,'#8a7a5a',w-6,0,w-2,p.h,1);
  box(c,'#1a2129',-2,p.h,w+4,10);box(c,'#7d878c',-2,p.h,w+4,8);box(c,'#aab3b3',-2,p.h,w+4,2);box(c,'#5d676e',-2,p.h+7,w+4,1);
  return;
 }
 if(kind==='sill'){
  // The sill of a taking-in door: one long stone on two corbels out of the warehouse wall.
  box(c,'#1a2129',-2,0,w+4,8);box(c,'#7d878c',-2,0,w+4,6);box(c,'#aab3b3',-2,0,w+4,1);box(c,'#5d676e',-2,5,w+4,1);
  for(const x of [4,w-14]){box(c,'#1a2129',x,8,10,12);box(c,'#4c5864',x+1,8,8,9);box(c,'#6b7782',x+1,8,8,1);box(c,'#3a4652',x+3,17,4,3);}
  return;
 }
 if(kind==='piles'||kind==='beacon'){
  // Pile heads bound with an iron hoop; narrow dolphins use two posts.
  for(const x of (kind==='piles'&&w<60?[5,w-15]:[3,Math.round(w/2)-5,w-13])){box(c,'#17110d',x,0,10,28);box(c,'#4b3a2b',x+1,2,7,26);box(c,'#6a5440',x+2,2,2,26);box(c,'#9a7f5f',x,0,10,2);box(c,'#7a6048',x+1,2,8,1);}
  box(c,'#17110d',0,3,w,7);box(c,'#6b523a',0,3,w,5);box(c,p.w<60?(p.id%2?'#8d9a9e':'#ae9064'):'#b2946d',0,0,w,2);box(c,'#8d704f',0,2,w,1);
  box(c,'#232c33',0,13,w,4);box(c,'#59666b',0,13,w,1);
  // The bolted dolphin's rail is gone: a bent stanchion at one end, the stubs of its brackets along the cap.
  if(what==='bolt')for(const x of [12,w-30]){box(c,'#3a2a22',x,0,5,2);box(c,'#7a4426',x+1,0,1,1);}
  return;
 }
 if(kind==='staging'||kind==='stage'){
  // Deck planks on a bearer; the piles under it are drawn behind.
  box(c,'#17110d',0,0,w,13);box(c,'#6b523a',0,0,w,8);box(c,'#b2946d',0,0,w,2);box(c,'#8d704f',0,2,w,1);
  for(let x=11;x<w-3;x+=12)box(c,'#3d2e22',x,2,1,6);
  box(c,'#33261d',0,8,w,5);box(c,'#4a3828',0,8,w,1);
  if(kind==='stage')for(let x=6;x<w-28;x+=40){box(c,'#17110d',x,13,28,15);box(c,'#3f3227',x+1,13,26,13);box(c,'#59666b',x+5,13,2,13);box(c,'#59666b',x+21,13,2,13);}
  // Where the planks were torn up, the bearer shows through the hole under their ends.
  if(what==='torn'){const h=l.hazards.find(z=>z.platform===p.id);if(h){const x=Math.round(h.x-p.x)-1;box(c,'#0b0d0f',x,0,Math.round(h.w)+2,8);box(c,'#33261d',x+1,5,Math.round(h.w),3);}}
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
 if(kind==='skiff'){
  // A skiff: thwarts across her, a pair of oars shipped along them.
  hull(c,w,18);box(c,'#3d2e22',4,3,w-8,3);for(const x of [8,w-14])box(c,'#57432f',x,2,6,3);stroke(c,'#8a7a5a',2,1,w-3,4,1);box(c,'#6a5440',w-6,0,6,2);
  return;
 }
 // Boats. The deck you land on is the top of what each one carries.
 if(what==='hatch'){
  // A bluff-ended covered lighter, deeper than the rope boat beside her.
  box(c,'#151b20',-2,0,w+4,29);box(c,'#344048',0,3,w,23);
  for(let y=8;y<28;y+=7)box(c,'#1c272f',1,y,w-2,1);
  box(c,'#98a5a7',-2,0,w+4,2);box(c,'#151b20',4,28,w-8,3);
 }else hull(c,w,what==='tiller'?26:36);
 if(what==='sacks'){
  // Sacks of corn stowed level in the hold, their necks tied.
  for(let row=0;row<2;row++)for(let x=8+row*5;x<w-12;x+=10){const y=row?-1:2;box(c,'#4a3c2c',x,y,10,6);box(c,'#8a7656',x+1,y,8,5);box(c,'#a89272',x+1,y,8,1);box(c,'#5a4a36',x+4,y-1,2,2);}
 }else if(what==='tarp'){
  // A tarpaulin over the hold, lashed down to the rubbing strake over battens.
  box(c,'#1f2620',6,0,w-12,7);box(c,'#3f4a3e',7,0,w-14,6);box(c,'#56614f',7,0,w-14,1);
  for(let x=12;x<w-10;x+=16){box(c,'#2c3529',x,2,8,3);box(c,'#56614f',x+8,0,2,6);stroke(c,'#8a7a5a',x+9,1,x+5,9,1);}
 }else if(what==='coal'){
  // Coal trimmed level with the coamings, the lumps catching the moon.
  box(c,'#3a2d23',5,-1,4,7);box(c,'#3a2d23',w-9,-1,4,7);box(c,'#0d0f12',9,0,w-18,7);
  for(let k=0;k<Math.round(w/2);k++){const x=10+Math.floor(hash(k,p.id,64)*(w-21)),y=Math.floor(hash(k,p.id,65)*5);box(c,hash(k,p.id,66)>.75?'#5b6470':'#262a30',x,y,hash(k,p.id,67)>.6?2:1,1);}
  box(c,'#0d0f12',12,-1,w-24,1);
 }else if(what==='deals'){
  // Sawn deals stacked flat, end grain to the bow, a rope round the stack.
  for(let y=0;y<7;y+=2){box(c,'#17110d',6,y,w-12,2);box(c,y%4?'#7a6048':'#8d704f',7,y,w-14,1);}
  for(let y=0;y<7;y+=2)box(c,'#a88a62',w-8,y,2,1);stroke(c,'#8a7a5a',Math.round(w*.3),0,Math.round(w*.3)+3,8,1);stroke(c,'#8a7a5a',Math.round(w*.7),0,Math.round(w*.7)+3,8,1);
 }
 for(const x of [3,w-9]){box(c,'#14100d',x,-5,6,5);box(c,'#7a6048',x+1,-5,4,1);}
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
export const canalQuay:QuarterSet={sky,back,deck,exit,water,mover,depth:(p,l)=>{const kind=role(p,l);return kind==='boat'||kind==='barge'||kind==='raft'||kind==='skiff'||kind==='pontoon'||kind==='crates'?10:0;}};
