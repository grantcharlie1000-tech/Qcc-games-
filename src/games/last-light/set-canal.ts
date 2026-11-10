import {WORLDS,type Level,type Platform} from './levels';
import type {Run} from './model';
import {platformAt} from './model';
import {goalComposition} from './composition';
import {departureOffset,departureVisibility} from './departure';
import {ferry} from './props';
import {box,enginesArt,hash,masonry,moon,nightSky,stroke,visible,wall,type C} from './quarter-kit';
import type {QuarterSet} from './quarter-sets';

/** Level 3 · one canal, seen from its near quay. Across the water stands the
 * far bank: an unbroken terrace of dark houses, no two alike, with the
 * towers behind them. Everything you stand on is in or beside that water: a
 * granite quay built down into it, a cluster of mooring piles, a timber
 * staging, a moored lighter, a barge on its rope, a raft on a chain. */
export const FAR=34;
type Role='quay'|'piles'|'staging'|'boat'|'barge'|'stage'|'spar'|'bridge';
function role(p:Platform,l:Level):Role{
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
export function ripples(c:C,left:number,right:number,from:number,to:number,far:number,t:number){
 for(let row=0;row<12;row++){
  const y=far+3+row*row*1.9+row*3;if(y<from)continue;if(y>=to)break;
  const step=38+row*9,drift=Math.sin(t*.55+row*1.3)*4,length=5+row*2;
  for(let i=Math.floor((left-drift)/step)-1;i*step<right+step;i++){
   const v=hash(i,row,17),x=i*step+v*step*.8+drift;if(x+length<left||x>right)continue;
   box(c,v>.55?'#3d6470':'#2a4b58',x,y,Math.round(length*(.6+v)),1);
  }
 }
}
const HOUSE_TONES=['#1a2330','#1d2734','#202b39'];
/** The far bank is built house by house from the house's own number, so it
 * never repeats and has no tile edge to show. */
export function farBank(c:C,w:number,cx:number,fy:number,t:number){
 const shift=cx*.35,cell=58,first=Math.floor(shift/cell)-1;
 for(let i=first;i*cell-shift<w;i++){
  const x=Math.round(i*cell-shift),side=hash(i,7)>.87;
  if(side){
   // A side canal runs back between two houses, under a humped footbridge.
   box(c,'#1a2330',x,fy-16,cell,3);box(c,'#1a2330',x+6,fy-19,cell-12,3);box(c,'#1a2330',x+16,fy-21,cell-32,2);
   box(c,'#243040',x+16,fy-21,cell-32,1);for(let k=4;k<cell;k+=9)box(c,'#1a2330',x+k,fy-25+Math.round(Math.abs(k-cell/2)/7),1,6);
   continue;
  }
  const tall=56+Math.floor(hash(i,1)*52),top=fy-8-tall,tone=HOUSE_TONES[Math.floor(hash(i,2)*3)],kind=Math.floor(hash(i,3)*3);
  box(c,tone,x,top,cell,tall);box(c,'#141b25',x,top,1,tall);
  if(kind===0){for(let k=0;k<5;k++)box(c,tone,x+5+k*5,top-4-k*4,cell-10-k*10,4);}
  else if(kind===1){box(c,tone,x-1,top-3,cell+2,3);box(c,'#263243',x-1,top-3,cell+2,1);box(c,tone,x+40,top-14,8,11);}
  else{box(c,tone,x+8,top-6,cell-16,6);box(c,tone,x+18,top-12,cell-36,6);box(c,'#263243',x+18,top-12,cell-36,1);}
  for(let row=0;top+10+row*17<fy-26;row++)for(let col=0;col<3;col++){
   const wx=x+9+col*15,wy=top+10+row*17,lit=hash(i*31+col,row,9)>.93;
   box(c,'#111823',wx,wy,7,10);
   if(lit){box(c,'#a8763f',wx+1,wy+1,5,8);box(c,'#e0ab5c',wx+2,wy+4,2,4);for(let k=0;k<5;k++)box(c,'#b0813f55',wx+1+Math.round(Math.sin(t*1.4+k+i)*1.2),fy+3+k*5,5-k%2*2,2);}
  }
  box(c,'#111823',x+22,fy-22,10,14);
 }
 // The far quay wall and its dark reflection lie along the whole bank.
 box(c,'#18212c',0,fy-8,w,8);box(c,'#263243',0,fy-8,w,1);box(c,'#13232e',0,fy,w,7);
}
function sky(c:C,l:Level,w:number,h:number,cx:number,cy:number,t:number,ending:boolean){
 const fy=Math.round(l.water!-FAR-cy);
 nightSky(c,w,h,ending);moon(c,Math.round(w*.78-cx*.02),Math.max(60,fy-200));
 const tx=Math.round(w*.3-cx*.05);c.drawImage(enginesArt(),tx,fy-150);
 farBank(c,w,cx,fy,t);
 if(fy<h){sheet(c,0,w,fy+7,h,fy);c.save();c.translate(-cx,-cy);ripples(c,cx,cx+w,l.water!-FAR+3,l.water!,l.water!-FAR,t);c.restore();}
}
export function weed(c:C,x:number,w:number,water:number,seed:number){
 // The wet band: darker stone, then weed in uneven tufts hanging to the water.
 box(c,'#0a141a8c',x,water-11,w,11);
 for(let i=0;i*7<w-4;i++){const v=hash(i,seed,5);if(v<.35)continue;const tall=2+Math.floor(v*7);box(c,v>.7?'#3a5a44':'#2c4739',x+2+i*7,water-tall,3+Math.floor(v*3),tall);if(v>.85)box(c,'#52745a',x+3+i*7,water-tall,1,2);}
}
function pile(c:C,x:number,top:number,water:number){
 box(c,'#17110d',x,top,10,water+40-top);box(c,'#4b3a2b',x+1,top,7,water+40-top);box(c,'#6a5440',x+2,top,2,water+40-top);
 box(c,'#0a141a80',x,water-9,10,9);box(c,'#2c4739',x,water-4,10,4);box(c,'#3a5a44',x+2,water-6,4,3);
}
const spans=new WeakMap<Level,{x0:number;x1:number;a0:number;a1:number}|null>();
/** The stepped footbridge: its landings are the treads, one arch carries them. */
function bridge(c:C,l:Level,cx:number,cy:number,vw:number,vh:number){
 let span=spans.get(l);
 if(span===undefined){const steps=l.platforms.filter(p=>role(p,l)==='bridge');span=steps.length?{x0:Math.min(...steps.map(p=>p.x)),x1:Math.max(...steps.map(p=>p.x+p.w)),a0:0,a1:0}:null;if(span){span.a0=span.x0+46;span.a1=span.x1-80;}spans.set(l,span);}
 if(!span||!visible(span.x0,300,span.x1-span.x0,320,cx,cy,vw,vh))return;
 const water=l.water!,mid=(span.a0+span.a1)/2,rx=(span.a1-span.a0)/2;
 for(const p of l.platforms){
  if(role(p,l)!=='bridge')continue;
  for(let x=p.x;x<p.x+p.w;x+=4){
   const k=(x+2-mid)/rx,soffit=Math.abs(k)<1?Math.round(water-110*Math.sqrt(1-k*k)):water+40;
   wall(c,'canal/quay',quayTile,x,p.y+8,4,soffit-p.y-8);
   if(Math.abs(k)<1){box(c,'#55616d',x,soffit-5,4,5);box(c,'#1a222b',x,soffit-6,4,1);box(c,'#10171e',x,soffit-1,4,1);}
  }
  // A low parapet on the far side of every landing.
  box(c,'#232d38',p.x,p.y-12,p.w,12);box(c,'#3a4653',p.x,p.y-12,p.w,2);for(let x=p.x+6;x<p.x+p.w-4;x+=12)box(c,'#161d26',x,p.y-8,5,6);
 }
 box(c,'#6b7782',mid-5,water-120,10,12);box(c,'#8a959d',mid-5,water-120,10,2);
 weed(c,span.x0,span.a0-span.x0,water,3);weed(c,span.a1,span.x1-span.a1,water,4);
}
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number,clock:number){
 const water=l.water!;bridge(c,l,cx,cy,vw,vh);
 for(const p of l.platforms){
  const kind=role(p,l),top=p.y+p.h;
  if(kind==='barge'){
   // A raft that crosses a basin runs on a chain between two posts.
   const travel=p.travel??0;if(travel<40||!visible(p.x-travel-40,p.y-30,p.w+travel*2+80,60,cx,cy,vw,vh))continue;
   const a=p.x-travel-30,b=p.x+p.w+travel+22;pile(c,a,p.y-26,water);pile(c,b,p.y-26,water);
   for(let x=a+10;x<b;x+=6)box(c,(x/6|0)%2?'#59666b':'#2c353b',x,p.y-12+Math.round(Math.sin((x-a)/(b-a)*Math.PI)*5),4,2);
   continue;
  }
  if(!visible(p.x-8,p.y-70,p.w+16,water+60-p.y+70,cx,cy,vw,vh))continue;
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
function water(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const top=l.water!,far=top-FAR,bottom=cy+vh+24;if(bottom<=top)return;
 sheet(c,cx-24,vw+48,top,bottom,far);
 ripples(c,cx-24,cx+vw+24,top,bottom,far,t);
 for(let x=Math.floor((cx-24)/22)*22;x<cx+vw+24;x+=22){const wave=Math.round(Math.sin(t*1.7+x*.21));box(c,'#5a8a94',x+3,top+wave,11,1);}
 // Moonlight lies on the water in a broken path under the moon.
 const mx=Math.round(cx+vw*.78-cx*.02);for(let k=0;k<9;k++){const y=top+4+k*k*1.6+k*4;if(y>bottom)break;box(c,'#c5d2c966',mx-6-k+Math.round(Math.sin(t*1.2+k*1.9)*3),y,10+k*2,1);}
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
