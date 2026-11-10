import type {Level,Platform,Station} from './levels';
import type {Run} from './model';
import {departureOffset,departureVisibility} from './departure';
import {box,masonry,stroke,visible,wall,type C} from './quarter-kit';
import type {QuarterSet} from './quarter-sets';

/** Level 7 · the Quarter's hoist tower, seen in section. Two lift wells run
 * the height of one brick shaft. Each cage rides a pair of guide rails on a
 * cable from the winding gear at the crown; every landing is an iron floor
 * on a girder that crosses the shaft from wall to wall; ladders are iron
 * landings on the side walls; each counterweight hangs on its own chain in
 * a guide frame bolted to the girder above. Below the first landing the
 * wells go down to the pit. */
const L=24,CROWN=250;
const shaft=()=>masonry('hoist/shaft',64,32,16,8,{mortar:'#16131a',stones:['#261f25','#292127','#2c2329'],lip:'#33292e',chip:'#392e33'});
const cut=()=>masonry('hoist/cut',48,32,24,16,{mortar:'#1b1719',stones:['#40312f','#453432','#4a3835'],lip:'#59453f',chip:'#634e47'});
const info=new WeakMap<Level,{right:number;wells:{x:number;w:number}[];floors:number[]}>();
function plan(l:Level){
 let made=info.get(l);if(made)return made;
 const wells:{x:number;w:number}[]=[];for(const p of l.platforms)if(p.kind==='moving'&&!wells.some(w=>w.x===p.x))wells.push({x:p.x,w:p.w});
 made={right:Math.max(...l.platforms.map(p=>p.x+p.w)),wells,floors:[...new Set(l.platforms.filter(p=>p.kind==='stone').map(p=>p.y))]};info.set(l,made);return made;
}
function sheave(c:C,x:number,y:number,turn:number){
 for(let yy=-13;yy<=13;yy++){const out=Math.floor(Math.sqrt(169-yy*yy)),hole=Math.abs(yy)<10?Math.floor(Math.sqrt(100-yy*yy)):0;box(c,'#151b20',x-out,y+yy,out*2,1);if(hole)box(c,'#241d22',x-hole,y+yy,hole*2,1);}
 for(let i=0;i<4;i++){const a=turn+i*Math.PI/2;stroke(c,'#3d4a51',x,y,x+Math.cos(a)*11,y+Math.sin(a)*11,2);}
 box(c,'#7d8c8e',x-2,y-2,4,4);
}
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number,clock:number){
 const pl=plan(l),top=cy-24,bottom=cy+vh+24,pit=l.height-20,right=pl.right;
 wall(c,'hoist/shaft',shaft,0,top,right+140,bottom-top);
 box(c,'#07090d66',L,top,20,bottom-top);box(c,'#07090d66',right-20,top,20,bottom-top);
 // An iron girder crosses the shaft at every floor; the rails and landings are fixed to it.
 for(const y of pl.floors)if(y+40>top&&y<bottom){box(c,'#12181d',L,y+6,right-L,18);box(c,'#2c383f',L,y+8,right-L,12);box(c,'#4f5f66',L,y+6,right-L,2);box(c,'#0d1216',L,y+22,right-L,2);for(let x=L+10;x<right;x+=18)box(c,'#5a686b',x,y+13,2,2);}
 // Two lattice stanchions stand between the wells from the pit to the crown.
 if(pl.wells.length>1){const a=pl.wells[0].x+pl.wells[0].w+10,b=pl.wells[1].x-22;for(const x of [a,b]){box(c,'#12181d',x,CROWN,12,pit-CROWN);box(c,'#3d4a51',x,CROWN,2,pit-CROWN);box(c,'#3d4a51',x+10,CROWN,2,pit-CROWN);for(let y=Math.max(CROWN,Math.floor(top/24)*24);y<Math.min(pit,bottom);y+=24)stroke(c,'#2c383f',x+2,y,x+10,y+12);}}
 // A lobby door on the back wall at every side landing.
 for(const p of l.platforms)if(p.kind==='stone'&&(p.x<=L+4||p.x+p.w>=right-4)&&visible(p.x,p.y-60,p.w,60,cx,cy,vw,vh)){const x=Math.round(p.x+p.w*(p.x<=L+4?.3:.7))-14;box(c,'#0d1014',x-3,p.y-50,34,50);box(c,'#231d1f',x,p.y-47,28,47);box(c,'#2c2527',x,p.y-47,13,47);box(c,'#3b3034',x-3,p.y-52,34,3);box(c,'#6d6248',x+10,p.y-24,2,4);}
 for(const well of pl.wells){
  if(well.x+well.w+12<cx-24||well.x-12>cx+vw+24)continue;
  // The well: a darker slot, a guide rail either side, the sheave at the crown.
  box(c,'#0a0c1066',well.x-6,Math.max(top,CROWN),well.w+12,Math.min(bottom,pit)-Math.max(top,CROWN));
  for(const x of [well.x-8,well.x+well.w+4]){box(c,'#12181d',x,CROWN,4,pit-CROWN);box(c,'#5a686b',x+1,CROWN,1,pit-CROWN);for(let y=Math.max(CROWN,Math.floor(top/64)*64);y<Math.min(pit,bottom);y+=64)box(c,'#0d1216',x-2,y,8,4);}
  if(visible(well.x,CROWN-30,well.w,60,cx,cy,vw,vh)){box(c,'#12181d',well.x-12,CROWN-18,well.w+24,6);box(c,'#4f5f66',well.x-12,CROWN-18,well.w+24,1);sheave(c,well.x+well.w/2,CROWN,clock*1.5);}
  // Sprung buffers on the pit floor.
  if(pit<bottom+40)for(const x of [well.x+14,well.x+well.w-26]){box(c,'#12181d',x,pit-22,12,22);for(let y=pit-20;y<pit-2;y+=4)box(c,'#5a686b',x+1,y,10,1);box(c,'#3d4a51',x-2,pit-26,16,4);}
 }
 // Every counterweight hangs on a chain from a bracket on the girder above it.
 for(const h of l.hazards)if(h.kind==='crusher'){
  const x=Math.round(h.x+h.w/2);let roof=CROWN;for(const y of pl.floors)if(y+24<h.y&&y+24>roof)roof=y+24;
  if(!visible(x-30,roof,60,h.y-roof+20,cx,cy,vw,vh))continue;
  for(let y=roof+8;y<h.y-10;y+=6)box(c,(y/6|0)%2?'#59666b':'#2c353b',x-1,y,3,4);
  box(c,'#12181d',x-12,roof,24,8);box(c,'#4f5f66',x-12,roof,24,1);sheave(c,x,roof+16,0);
  for(const side of [-22,22]){box(c,'#12181d',x+side-1,roof,3,h.y-roof);box(c,'#3d4a51',x+side-1,roof,1,h.y-roof);}
 }
 for(const p of l.platforms)if(p.kind==='grate'&&visible(p.x,p.y-20,p.w,90,cx,cy,vw,vh)){
  // A ladder landing: rail behind, bracket to the wall, the ladder down to the one below.
  box(c,'#1a2228',p.x,p.y-16,p.w,2);for(let x=p.x+1;x<p.x+p.w;x+=12)box(c,'#1a2228',x,p.y-14,1,14);
  const x=p.x+Math.round(p.w/2)-6;box(c,'#1a2228',x,p.y+12,2,52);box(c,'#1a2228',x+10,p.y+12,2,52);box(c,'#56646b',x,p.y+12,1,52);for(let y=p.y+17;y<p.y+64;y+=7)box(c,'#3a464d',x+2,y,8,1);
 }
 // The cut walls of the shaft, and its footing under the first landing.
 wall(c,'hoist/cut',cut,0,top,L,bottom-top);box(c,'#6d5850',L-1,top,1,bottom-top);box(c,'#0b0d11',L,top,2,bottom-top);
 wall(c,'hoist/cut',cut,right,top,140,bottom-top);box(c,'#6d5850',right,top,1,bottom-top);box(c,'#0b0d11',right-2,top,2,bottom-top);
 const first=l.platforms[0];if(bottom>first.y+28)wall(c,'hoist/cut',cut,first.x,first.y+28,first.w,bottom-first.y-28);
 if(pit<bottom){box(c,'#0d1014',L,pit,right-L,bottom-pit);box(c,'#3b3034',L,pit,right-L,2);}
}
function mover(c:C,p:Platform,x:number,y:number){
 // The cage: corner posts, a head frame, a mesh back, and the cable up to its sheave.
 const mid=x+Math.round(p.w/2);box(c,'#59666b',mid-1,CROWN+12,1,y-56-CROWN-12);box(c,'#2c353b',mid,CROWN+12,1,y-56-CROWN-12);
 box(c,'#0d121699',x+4,y-50,p.w-8,50);for(let xx=x+10;xx<x+p.w-6;xx+=10)box(c,'#232d33',xx,y-48,1,48);for(let yy=y-40;yy<y;yy+=10)box(c,'#232d33',x+4,yy,p.w-8,1);
 for(const xx of [x+1,x+p.w-5]){box(c,'#151b20',xx,y-54,4,54);box(c,'#6d7d80',xx,y-54,1,54);}
 box(c,'#151b20',x-1,y-58,p.w+2,6);box(c,'#aab3ae',x-1,y-58,p.w+2,1);box(c,'#151b20',mid-4,y-64,8,6);
 for(const xx of [x-7,x+p.w+3]){box(c,'#3d4a51',xx,y-50,5,8);box(c,'#3d4a51',xx,y+10,5,8);}
}
function deck(c:C,p:Platform){
 const w=p.w;
 if(p.kind==='grate'){
  box(c,'#12191e',-2,0,w+4,12);box(c,'#aab3ae',0,0,w,1);box(c,'#5d6b70',0,1,w,2);
  for(let x=3;x<w-3;x+=8){box(c,'#1c272d',x,3,3,7);box(c,'#6d7d80',x,3,1,6);}
  box(c,'#2f3d43',0,10,w,2);return;
 }
 if(p.kind==='moving'){
  // The cage floor: oak boards in an iron frame, safety gear under it.
  box(c,'#0d1216',-1,0,w+2,28);box(c,'#6b523a',0,0,w,8);box(c,'#b3946a',0,0,w,2);for(let x=11;x<w-3;x+=12)box(c,'#3d2e22',x,2,1,6);
  box(c,'#26333a',0,8,w,12);box(c,'#4f5f66',0,8,w,2);for(let x=6;x<w-4;x+=14)box(c,'#7d8c8e',x,13,2,2);
  box(c,'#151b20',10,20,w-20,8);box(c,'#3d4a51',10,20,w-20,1);return;
 }
 // An iron landing: chequer plate on the girder that crosses the shaft.
 box(c,'#0d1216',0,0,w,28);box(c,'#3a474e',0,0,w,6);box(c,'#aab3ae',0,0,w,1);box(c,'#6d7d80',0,1,w,2);
 for(let x=4;x<w-4;x+=8)box(c,'#56646b',x+(x/8|0)%2*2,4,3,1);
 box(c,'#2c383f',0,6,w,16);box(c,'#4f5f66',0,6,w,2);for(let x=10;x<w-6;x+=18)box(c,'#5a686b',x,13,2,2);box(c,'#0d1216',0,22,w,2);box(c,'#26333a',0,24,w,4);
}
function station(c:C,l:Level,s:Station,x:number,y:number,lit:boolean,t:number){
 // A brake wheel on a standpipe; its line runs up the wall to the vent it shuts.
 x=Math.round(x);box(c,'#12181d',x+14,y-150,5,150);box(c,'#3f4c52',x+15,y-150,2,150);box(c,'#12181d',x+2,y-22,14,5);
 box(c,'#12181d',x-3,y-30,7,30);box(c,'#3f4c52',x-2,y-30,2,30);box(c,'#12181d',x-8,y-3,17,3);
 const turn=lit?Math.PI/5:0;for(let yy=-11;yy<=11;yy++){const out=Math.floor(Math.sqrt(121-yy*yy)),hole=Math.abs(yy)<8?Math.floor(Math.sqrt(64-yy*yy)):0;box(c,lit?'#6d7d80':'#8c7648',x-out,y-38+yy,out*2,1);if(hole)box(c,'#2c2329',x-hole,y-38+yy,hole*2,1);}
 for(let i=0;i<5;i++){const a=turn+i*Math.PI*2/5;stroke(c,lit?'#aab3ae':'#b79a5c',x,y-38,x+Math.cos(a)*9,y-38+Math.sin(a)*9,2);}
 box(c,'#12181d',x-2,y-40,4,4);box(c,lit?'#9bd39a':'#6b3a34',x+13,y-34,7,7);box(c,lit?'#d8f0c8':'#9a4a43',x+15,y-32,3,3);
}
function exit(c:C,l:Level,s:Run,t:number,front:boolean,reduced:boolean,view:{width:number;height:number}){
 const x=Math.round(l.exit.x+l.exit.w/2),y=l.exit.y+l.exit.h,offset=departureOffset(l,s,reduced,view),floor=y-8+offset.y,distance=Math.max(280,view.height*.75),upper=y-8-distance;
 if(front){
  // The cage gate closes in front of the passenger for the ride.
  if(s.phase!=='playing'&&!reduced){c.save();c.globalAlpha*=departureVisibility(s,reduced);for(let xx=x-18;xx<=x+18;xx+=6)box(c,'#6d7d80',xx,floor-40,1,40);box(c,'#aab3ae',x-20,floor-22,40,1);c.restore();}
  return;
 }
 // The counterweight lift: its own rails through the crown to the floor above, where a lit door waits.
 for(const xx of [x-28,x+25]){box(c,'#12181d',xx,upper-70,4,y-upper+70);box(c,'#5a686b',xx+1,upper-70,1,y-upper+70);}
 box(c,'#12181d',x-34,upper,180,12);box(c,'#3a474e',x-34,upper,180,5);box(c,'#aab3ae',x-34,upper,180,1);for(let xx=x-28;xx<x+140;xx+=18)box(c,'#5a686b',xx,upper+8,2,2);
 const door=x+96;box(c,'#0d1014',door-19,upper-52,38,52);box(c,'#3b3034',door-19,upper-54,38,3);box(c,'#c98f4b',door-14,upper-48,28,48);box(c,'#f0c47a',door-9,upper-46,18,46);box(c,'#fff0c4',door-4,upper-40,8,40);box(c,'#f3c77a14',door-34,upper-70,68,70);
 box(c,'#59666b',x,upper-70,1,Math.max(0,floor-52-upper+70));
 c.save();c.globalAlpha*=departureVisibility(s,reduced);
 box(c,'#0d121699',x-22,floor-46,44,46);for(let xx=x-16;xx<x+20;xx+=8)box(c,'#232d33',xx,floor-44,1,44);
 for(const xx of [x-24,x+20]){box(c,'#151b20',xx,floor-50,4,50);box(c,'#6d7d80',xx,floor-50,1,50);}
 box(c,'#151b20',x-26,floor-54,52,6);box(c,'#f3c77a',x-8,floor-52,16,2);box(c,'#aab3ae',x-26,floor-54,52,1);
 box(c,'#151b20',x-26,floor,52,9);box(c,'#6b523a',x-25,floor,50,4);box(c,'#b3946a',x-25,floor,50,1);
 box(c,'#f3c77a22',x-18,floor-44,36,44);
 c.restore();
}
export const hoist:QuarterSet={sky(c,l,w,h){box(c,'#0b0d11',0,0,w,h);},back,deck,exit,mover,station};
