import type {Level,Platform,Station} from './levels';
import type {Run} from './model';
import {box,hash,masonry,stroke,visible,wall,type C} from './quarter-kit';
import type {QuarterSet} from './quarter-sets';

/** Level 6 · the service culvert under the street. One brick vault, flooded
 * to the springing. What you stand on is what a culvert has: a brick bench
 * built up out of the water, a length of iron main between two elbows that
 * go down into it, or a grating hung from the vault on rods. Steam comes
 * from a joint on a main, fed by the pipe run on the wall behind it. */
const vault=()=>masonry('culvert/vault',64,32,16,8,{mortar:'#17131a',stones:['#272026','#2a2228','#2d242a'],lip:'#352b30',chip:'#3b3035'});
const bench=()=>masonry('culvert/bench',64,32,16,8,{mortar:'#191417',stones:['#3a2d2e','#3e3031','#423334'],lip:'#4d3c3a',chip:'#564440'});
type Role='bench'|'main'|'grating';
const role=(p:Platform,l:Level):Role=>p.kind==='grate'?'grating':p.w>=170&&l.water!-p.y<=48||p.id===l.mainCount-1?'bench':'main';
/** The soffit of the vault: one height along the tunnel, opening into the stair shaft at the far end. */
const soffit=(l:Level,x:number)=>x>l.platforms[l.mainCount-1].x-190?l.platforms[l.mainCount-1].y-170:l.water!-300;
function pump(c:C,x:number,water:number,t:number){
 // A beam pump on a brick plinth: cylinder, flywheel, and a rocking beam that has stopped.
 wall(c,'culvert/bench',bench,x-10,water-36,150,60);box(c,'#5a4744',x-12,water-40,154,5);
 box(c,'#151b20',x,water-110,44,70);box(c,'#2a343b',x+3,water-108,10,66);box(c,'#3d4a51',x+3,water-108,3,66);box(c,'#151b20',x-4,water-116,52,8);box(c,'#3d4a51',x-4,water-116,52,2);
 for(let y=-36;y<=36;y++){const out=Math.floor(Math.sqrt(36*36-y*y)),hole=Math.abs(y)<29?Math.floor(Math.sqrt(29*29-y*y)):0;box(c,'#1a2127',x+96-out,water-78+y,out*2,1);if(hole)box(c,'#201a1f',x+96-hole,water-78+y,hole*2,1);}
 for(let i=0;i<6;i++){const a=i*Math.PI/3;stroke(c,'#1a2127',x+96,water-78,x+96+Math.cos(a)*30,water-78+Math.sin(a)*30,2);}
 box(c,'#3d4a51',x+92,water-82,8,8);stroke(c,'#151b20',x+22,water-128,x+96,water-136,4);box(c,'#151b20',x+56,water-150,6,110);box(c,'#3d4a51',x+56,water-150,2,110);
}
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const water=l.water!,left=cx-24,right=cx+vw+24,top=cy-24,bottom=cy+vh+24;
 wall(c,'culvert/vault',vault,left,top,right-left,bottom-top);
 // Brick ribs and their piers stand at fixed places along the tunnel.
 for(let x=Math.floor(left/352)*352+96;x<right;x+=352){const s=soffit(l,x);box(c,'#1d181c',x,s,26,water+60-s);box(c,'#3b3034',x+2,s,2,water+60-s);box(c,'#120e11',x+24,s,2,water+60-s);box(c,'#3b3034',x-4,s+34,34,5);}
 // Two service mains run the length of the back wall, with a flange every few yards.
 for(let k=0;k<2;k++){const y=water-262+k*22;for(let x=Math.floor(left/96)*96;x<right;x+=96){if(y<soffit(l,x)+8)continue;box(c,'#12181d',x,y,96,9);box(c,'#3f4c52',x,y+1,96,2);box(c,'#0d1216',x+90,y-2,6,13);box(c,'#5a686b',x+91,y-1,1,11);}}
 // The stopped pumps of the pump passage.
 for(const x of [1300,1560])if(visible(x-20,water-160,180,200,cx,cy,vw,vh))pump(c,x,water,t);
 // The ground over the vault, and the dark side walls of the stair shaft.
 for(let x=Math.floor(left/32)*32;x<right;x+=32){const s=soffit(l,x);if(s>top){box(c,'#0b0d11',x,top,32,s-top);box(c,'#3b3034',x,s-4,32,4);box(c,'#120e11',x,s,32,3);}}
 // A street grating every so often lets a little moonlight down.
 for(let x=Math.floor(left/448)*448+250;x<right;x+=448){const s=soffit(l,x);if(s>water-290)box(c,'#6f8fb410',x,s,40,water-s);if(s>top){box(c,'#1c2228',x-2,s-12,44,12);for(let i=0;i<5;i++)box(c,'#31425d',x+2+i*8,s-11,4,9);}}
 for(const h of l.hazards)if(h.kind==='steam'){
  // Every vent is fed from the run on the wall.
  const x=Math.round(h.x+h.w/2)-3,from=water-232,base=h.y+h.h;if(!visible(x,from,8,base-from,cx,cy,vw,vh))continue;
  box(c,'#12181d',x,from,7,base-from);box(c,'#3f4c52',x+1,from,2,base-from);box(c,'#0d1216',x-2,from+12,11,4);box(c,'#0d1216',x-2,base-22,11,4);
 }
 for(const p of l.platforms){
  const kind=role(p,l);if(!visible(p.x-16,p.y-320,p.w+32,water+380-p.y,cx,cy,vw,vh))continue;
  if(kind==='bench'){
   wall(c,'culvert/bench',bench,p.x,p.y+8,p.w,water+60-p.y-8);box(c,'#120e11',p.x,p.y+8,2,water+60-p.y);box(c,'#120e11',p.x+p.w-2,p.y+8,2,water+60-p.y);
   box(c,'#0b0d1180',p.x,water-10,p.w,10);for(let i=0;i*9<p.w-6;i++){const v=hash(i,p.id,3);if(v>.4)box(c,v>.75?'#3f5a43':'#2e4534',p.x+3+i*9,water-2-Math.floor(v*6),4,2+Math.floor(v*6));}
  }else if(kind==='main'){
   // Each length of main turns down into the water at both ends and sits in a wall cradle.
   for(const x of [p.x+2,p.x+p.w-24]){box(c,'#11171c',x,p.y+14,22,water+50-p.y);box(c,'#34424a',x+3,p.y+14,6,water+50-p.y);box(c,'#4f5f66',x+3,p.y+14,2,water+50-p.y);box(c,'#0d1216',x-2,p.y+34,26,6);box(c,'#5a686b',x-2,p.y+34,26,1);}
   for(let x=p.x+46;x<p.x+p.w-46;x+=74){box(c,'#151b20',x,p.y+24,10,14);box(c,'#151b20',x-6,p.y+36,22,4);}
  }else{
   for(const x of [p.x+5,p.x+p.w-7]){const s=soffit(l,x);box(c,'#151b20',x,s,2,p.y-s);box(c,'#4f5f66',x,s,1,p.y-s);box(c,'#151b20',x-2,s,6,4);}
   box(c,'#1a2228',p.x,p.y-15,p.w,2);for(let x=p.x+1;x<p.x+p.w;x+=12)box(c,'#1a2228',x,p.y-13,1,13);
  }
 }
}
function water(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const top=l.water!,bottom=cy+vh+24;if(bottom<=top)return;
 box(c,'#0d1a1c',cx-24,top,vw+48,bottom-top);box(c,'#0a1416',cx-24,top+18,vw+48,bottom-top-18);
 // The culvert runs: streaks slide along the surface toward the outfall.
 for(let row=0;row<5;row++){const y=top+2+row*row*2+row*3,step=46+row*12,slide=t*(26-row*3);
  for(let i=Math.floor((cx-24+slide)/step)-1;i*step-slide<cx+vw+24;i++){const v=hash(i,row,41);box(c,v>.5?'#2e4f4c':'#1d3836',i*step-slide+v*20,y,8+Math.floor(v*14),1);}}
 for(let x=Math.floor((cx-24)/26)*26;x<cx+vw+24;x+=26)box(c,'#3f6660',x+4+Math.round(Math.sin(t*2+x*.3)*2),top,12,1);
}
function deck(c:C,p:Platform,l:Level){
 const w=p.w,kind=role(p,l);
 if(kind==='grating'){
  box(c,'#12191e',-2,0,w+4,12);box(c,'#aab3ae',0,0,w,1);box(c,'#5d6b70',0,1,w,2);
  for(let x=3;x<w-3;x+=8){box(c,'#1c272d',x,3,3,7);box(c,'#6d7d80',x,3,1,6);}
  box(c,'#2f3d43',0,10,w,2);return;
 }
 if(kind==='bench'){
  // A bullnosed stone kerb on brick.
  box(c,'#191417',-2,0,w+4,10);box(c,'#77706b',-2,0,w+4,8);box(c,'#a39b92',-2,0,w+4,2);box(c,'#57514d',-2,7,w+4,1);
  for(let x=30+p.id%3*8;x<w-8;x+=44)box(c,'#57514d',x,2,1,6);
  return;
 }
 // A riveted iron main: lit along the top, dark under the belly, a flange at each end.
 box(c,'#0d1216',0,0,w,28);box(c,'#26333a',0,2,w,22);box(c,'#34424a',0,3,w,10);box(c,'#4f5f66',0,3,w,4);box(c,'#7d8c8e',0,1,w,2);box(c,'#161d22',0,20,w,6);
 for(let x=36;x<w-30;x+=40){box(c,'#161d22',x,2,3,24);box(c,'#5a686b',x+3,3,1,20);for(const y of [6,12,18])box(c,'#7d8c8e',x+1,y,1,1);}
 for(const x of [-2,w-6]){box(c,'#0d1216',x,-2,8,32);box(c,'#3f4c52',x+1,-1,6,30);box(c,'#7d8c8e',x+1,-1,6,2);box(c,'#5a686b',x+2,0,1,28);}
}
function station(c:C,l:Level,s:Station,x:number,y:number,lit:boolean){
 // A caged bulkhead lamp on the wall, on its own conduit from the vault.
 const top=soffit(l,x);x=Math.round(x);
 box(c,'#12181d',x-1,top,2,y-64-top);box(c,'#12181d',x-8,y-66,16,5);box(c,'#3f4c52',x-8,y-66,16,1);
 if(lit){box(c,'#f3c77a12',x-30,y-74,60,74);box(c,'#f3c77a1c',x-18,y-64,36,48);}
 box(c,'#12181d',x-7,y-61,14,20);box(c,lit?'#f3c77a':'#2a343b',x-5,y-59,10,16);if(lit)box(c,'#fff0c4',x-2,y-56,4,9);
 for(const xx of [-5,-1,3])box(c,'#12181d',x+xx,y-59,1,16);box(c,'#12181d',x-5,y-52,10,1);
 // The gas tap you turn to light it.
 box(c,'#12181d',x-1,y-41,2,18);box(c,'#8c7648',x-4,y-25,8,3);box(c,'#b79a5c',x-4,y-25,8,1);
}
function exit(c:C,l:Level,s:Run,t:number,front:boolean){
 if(front)return;
 const x=Math.round(l.exit.x+l.exit.w/2),y=l.exit.y+l.exit.h,open=s.phase!=='playing';
 // The street stairwell: a brick arch in the wall of the shaft, with the stair going up inside it.
 box(c,'#f3c77a10',x-44,y-92,88,92);
 box(c,'#120e11',x-28,y-64,56,64);box(c,'#120e11',x-24,y-71,48,8);box(c,'#120e11',x-16,y-76,32,6);
 for(let i=0;i<7;i++){const yy=y-62+i*9;box(c,i%2?'#4d3c3a':'#423334',x-26,yy,8,8);box(c,i%2?'#423334':'#4d3c3a',x+18,yy,8,8);}
 for(let i=0;i<5;i++)box(c,i%2?'#4d3c3a':'#423334',x-22+i*9,y-69-(i===2?5:i===1||i===3?3:0),8,7);
 box(c,'#c98f4b',x-17,y-58,34,58);box(c,'#c98f4b',x-12,y-63,24,6);box(c,'#f0c47a',x-10,y-56,20,56);
 for(let i=0;i<6;i++){box(c,'#8f6a3c',x-17,y-8-i*9,34-i*4,2);box(c,'#fff0c4',x-17+34-i*4,y-56,i?0:0,0);}
 box(c,'#fff0c4',x+2,y-54,8,30);
 if(open)box(c,'#fff0c455',x-12,y-56,24,56);
 box(c,'#57514d',x-28,y-3,56,3);box(c,'#a39b92',x-28,y-3,56,1);box(c,'#f3c77a44',x-22,y-1,44,1);
 // An enamel plate over the arch points up to the street.
 box(c,'#12181d',x-15,y-92,30,12);box(c,'#aab3ae',x-13,y-90,26,8);box(c,'#12181d',x-1,y-88,2,5);box(c,'#12181d',x-3,y-87,6,1);box(c,'#12181d',x-2,y-88,4,1);
}
export const culvert:QuarterSet={sky(c,l,w,h){box(c,'#0b0d11',0,0,w,h);},back,deck,exit,water,station};
