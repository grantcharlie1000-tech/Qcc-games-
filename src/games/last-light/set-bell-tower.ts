import type {Level,Platform} from './levels';
import type {Run} from './model';
import {lantern} from './props';
import {box,hash,masonry,sprite,stroke,visible,wall,type C} from './quarter-kit';
import type {QuarterSet} from './quarter-sets';

/** Level 2 · the inside of the Quarter's bell tower, seen in section.
 * Two cut stone walls stand either side of one shaft. Timber floors are let
 * into those walls; the stair between them has lost most of its treads, so
 * the ones left are what you climb. Bell ropes and the clock weights hang
 * down an open well through every floor into a pit the rain has flooded.
 * The clock room and the belfry are rooms you pass through on the way up. */
const L=24,R=624,OUT=664,WELL0=264,WELL1=384,GROUND=1400,PIT=1500;
const backTile=()=>masonry('belltower/back',128,64,32,16,{mortar:'#19212b',stones:['#1d2631','#1f2934','#222c37'],lip:'#27323e',chip:'#2b3643'});
const cutTile=()=>masonry('belltower/cut',48,32,24,16,{mortar:'#222a33',stones:['#39444f','#3e4954','#434e59'],lip:'#56626d',chip:'#606c77'});
const footTile=()=>masonry('belltower/foot',64,32,32,16,{mortar:'#0f141a',stones:['#171d25','#191f28','#1b222b'],lip:'#1f2731',chip:'#222b36'});
const SKY='#31425d',SKY_LIT='#42587a';
/** Each flight is one string board from a floor to the wall it lands on. */
const FLIGHTS:readonly (readonly [number,number,number,number])[]=[
 [228,1400,26,1249],[429,1400,622,1269],[428,1224,622,1079],[208,1048,26,912],[490,872,622,731],[228,696,26,545],
];
const SLITS:readonly (readonly [number,number])[]=[[212,1262],[440,1098],[206,920],[474,740],[216,572],[544,560],[496,228]];
const ROPES=[300,314,328,342],FLOORS=[1224,1048,872,696,520];

function slit(c:C,x:number,y:number,t:number){
 box(c,'#10161d',x-6,y-4,22,60);box(c,'#2c3743',x-4,y-2,4,56);box(c,'#161d26',x+10,y-2,4,56);
 box(c,SKY,x,y,10,52);box(c,SKY_LIT,x+1,y+1,3,50);
 // Rain crosses the opening; it is the only thing moving on this wall.
 for(let i=0;i<3;i++){const fall=((t*70+i*19+x)%46+46)%46;box(c,'#b9c9d966',x+2+i*3,y+1+fall,1,5);}
 box(c,'#3b4753',x-6,y+52,22,3);box(c,'#4d5a67',x-6,y+52,22,1);
 // Moonlight falls a little way down the wall under the sill.
 box(c,'#6f8fb414',x-3,y+55,16,30);box(c,'#6f8fb40c',x-6,y+85,22,26);
}
function louvre(c:C,x:number,y:number,w:number,h:number){
 box(c,'#0f141a',x-4,y+6,w+8,h-6);box(c,'#0f141a',x,y,w,8);box(c,'#0f141a',x+6,y-5,w-12,6);
 box(c,SKY,x,y+8,w,h-8);box(c,SKY,x+4,y+3,w-8,6);box(c,SKY,x+10,y-2,w-20,6);
 for(let yy=y+10;yy<y+h-3;yy+=9){box(c,'#1a222c',x,yy,w,4);box(c,'#33404d',x,yy,w,1);}
 box(c,'#1a222c',x+Math.floor(w/2)-2,y-2,4,h+2);
 box(c,'#3b4753',x-6,y+h,w+12,4);box(c,'#4d5a67',x-6,y+h,w+12,1);
}
/** The clock face from behind: milk glass in a ring of stone, hands stopped. */
const dial=()=>sprite('belltower/dial',128,128,c=>{
 for(let y=-62;y<=62;y++){const out=Math.floor(Math.sqrt(62*62-y*y)),glass=Math.abs(y)<=54?Math.floor(Math.sqrt(54*54-y*y)):-1;
  box(c,'#11171e',64-out,64+y,out*2,1);
  if(glass>=0){box(c,y<-18?'#526a8c':y<16?'#485e7e':'#3f5370',64-glass,64+y,glass*2,1);if(y<-18)box(c,'#5f7899',64-glass,64+y,Math.round(glass*.7),1);}
 }
 // Twelve iron cames, then the hands, seen as shadows on the glass.
 for(let i=0;i<12;i++){const a=i*Math.PI/6,sx=Math.cos(a),sy=Math.sin(a);stroke(c,'#1a2230',64+sx*42,64+sy*42,64+sx*53,64+sy*53,i%3?1:2);}
 stroke(c,'#141b26',64,64,64-14,64-38,2);stroke(c,'#141b26',64,64,64-30,64+6,3);box(c,'#141b26',60,60,8,8);
});
const gear=(r:number)=>sprite(`belltower/gear/${r}`,r*2+8,r*2+8,c=>{
 const m=r+4;for(let y=-r;y<=r;y++){const out=Math.floor(Math.sqrt(r*r-y*y)),hole=Math.abs(y)<r-4?Math.floor(Math.sqrt((r-4)*(r-4)-y*y)):0;box(c,'#3d362b',m-out,m+y,out*2,1);if(hole)box(c,'#161c24',m-hole,m+y,hole*2,1);}
 for(let i=0;i<8;i++){const a=i*Math.PI/4;box(c,'#3d362b',m+Math.cos(a)*(r+1)-2,m+Math.sin(a)*(r+1)-2,4,4);}
 box(c,'#3d362b',m-1,m-r,2,r*2);box(c,'#3d362b',m-r,m-1,r*2,2);box(c,'#6d6248',m-2,m-2,4,4);box(c,'#6d6248',m-r+1,m-r+3,3,1);
});
/** A bronze bell under its timber headstock. */
const bell=(w:number,h:number)=>sprite(`belltower/bell/${w}`,w+8,h+14,c=>{
 const m=(w+8)/2;box(c,'#2a2019',m-w/2+2,0,w-4,8);box(c,'#57432f',m-w/2+2,0,w-4,2);box(c,'#1b1f24',m-3,8,6,5);
 for(let y=0;y<h;y++){const p=y/h,half=Math.round(w*(.2+.18*p+.14*p*p*p)+(p>.86?(p-.86)*w*.9:0));
  box(c,'#5f4f31',m-half,13+y,half*2,1);box(c,'#8c7648',m-half+2,13+y,Math.max(1,Math.round(half*.5)),1);box(c,'#b79a5c',m-half+3,13+y,Math.max(1,Math.round(half*.16)),1);box(c,'#3f3421',m+half-3,13+y,3,1);}
 box(c,'#3a2f1e',2,13+h-2,w+4,2);box(c,'#a48a52',4,13+h-2,Math.round(w*.4),1);box(c,'#3f3421',m-2,13+h,4,3);
});
function flight(c:C,x0:number,y0:number,x1:number,y1:number,l:Level){
 // A closed string board against the back wall, with the wall string above it.
 const dir=Math.sign(x1-x0),rise=y0-y1,run=Math.abs(x1-x0);
 for(let i=0;i<=run;i++){const x=x0+dir*i,y=Math.round(y0-rise*i/run);box(c,'#2b2018',x,y-9,1,9);box(c,'#6a523a',x,y-9,1,1);box(c,'#17110d',x,y-1,1,1);}
 stroke(c,'#1c1510',x0+dir*10,y0-30,x1,y1-30,2);
 // Most treads are gone: each leaves a pale socket in the string and a stub.
 for(let d=12;d<rise-4;d+=15){
  const x=x0+(x1-x0)*d/rise,y=y0-d;box(c,'#4a3828',x-3,y-7,6,3);
  if(l.platforms.some(p=>p.kind==='grate'&&Math.abs(p.y-y)<24&&p.x-16<x&&p.x+p.w+16>x))continue;
  box(c,'#17110d',x-(dir>0?10:0),y-9,10,3);box(c,'#3d2f22',x-(dir>0?10:0),y-9,10,1);
  if(d%30===12)box(c,'#1c1510',x,y-30,2,21);
 }
}
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const top=cy-24,bottom=cy+vh+24,height=bottom-top;
 wall(c,'belltower/back',backTile,0,top,OUT,height);
 // The corners of the shaft are darker than its middle; so is the wall under a floor.
 box(c,'#070b1066',L,top,22,height);box(c,'#070b1038',L+22,top,30,height);box(c,'#070b1066',R-22,top,22,height);box(c,'#070b1038',R-52,top,30,height);
 for(const p of l.platforms)if(p.kind==='stone'&&p.y<GROUND&&visible(p.x,p.y,p.w,60,cx,cy,vw,vh)){box(c,'#05080c73',p.x,p.y+p.h,p.w,9);box(c,'#05080c3d',p.x,p.y+p.h+9,p.w,16);}
 for(const y of FLOORS)if(y+34>top&&y<bottom){
  // A stone course carries every floor; empty pockets show where joists were.
  box(c,'#252f3b',L,y+8,R-L,7);box(c,'#2e3946',L,y+8,R-L,1);box(c,'#141b23',L,y+15,R-L,1);
  for(let x=L+10;x<R-10;x+=26)if(!(x>WELL0-8&&x<WELL1))box(c,'#10161d',x,y+10,7,4);
 }
 for(const [x,y] of SLITS)if(visible(x-6,y-4,22,120,cx,cy,vw,vh))slit(c,x,y,t);
 // The belfry: a louvred opening behind the bell frame and one over the stair.
 if(visible(40,180,400,300,cx,cy,vw,vh)){louvre(c,268,196,104,120);louvre(c,64,356,56,112);}
 // The clock room: its face from behind, the going train and the weights' cables.
 if(visible(250,700,220,190,cx,cy,vw,vh)){
  c.drawImage(dial(),260,720);
  box(c,'#2a2f33',386,782,34,3);box(c,'#555e60',386,782,34,1);
  box(c,'#1c2228',404,756,44,60);box(c,'#39434a',404,756,44,2);box(c,'#39434a',404,756,2,60);
  c.drawImage(gear(14),407,762);c.drawImage(gear(8),428,788);
  const swing=Math.sin(t*1.6)*13;stroke(c,'#5a5648',426,816,426+swing,864,1);box(c,'#8c7648',423+swing,862,7,7);box(c,'#b79a5c',424+swing,863,2,2);
 }
 for(const x of [366,374]){const from=800,to=x===366?1296:1442;if(visible(x,from,2,to-from+44,cx,cy,vw,vh)){box(c,'#39424a',x,from,1,to-from);box(c,'#262c33',x-4,to,9,40);box(c,'#4d575e',x-4,to,2,40);box(c,'#4d575e',x-4,to,9,2);}}
 // The door you came in by, shut against the rain.
 if(visible(30,1340,60,60,cx,cy,vw,vh)){
  box(c,'#0d1218',34,1352,44,48);box(c,'#0d1218',38,1346,36,8);box(c,'#3b4753',34,1352,2,48);box(c,'#3b4753',38,1346,36,1);
  box(c,'#2a2019',38,1354,36,46);box(c,'#2a2019',42,1349,28,6);for(const x of [46,55,64])box(c,'#1a1410',x,1350,1,50);
  box(c,'#3c444a',38,1364,36,3);box(c,'#3c444a',38,1386,36,3);box(c,'#7d7458',68,1376,3,4);
 }
 for(const [x0,y0,x1,y1] of FLIGHTS)if(visible(Math.min(x0,x1),y1,Math.abs(x1-x0),y0-y1,cx,cy,vw,vh))flight(c,x0,y0,x1,y1,l);
 // Short ladder from Ivo's landing to the belfry floor.
 if(visible(400,300,110,130,cx,cy,vw,vh)){for(const x of [470,484]){box(c,'#1c1510',x,332,3,92);box(c,'#4f3d2c',x,332,1,92);}for(let y=344;y<420;y+=12)box(c,'#33261d',472,y,13,2);}
 // The bell frame: a head beam on two posts, the bells and their ropes.
 if(visible(170,330,350,200,cx,cy,vw,vh)){
  box(c,'#1c1510',180,336,330,10);box(c,'#57432f',180,336,330,2);box(c,'#3a2c20',180,338,330,3);
  for(const x of [186,500]){const foot=x===186?520:424;box(c,'#1c1510',x,346,8,foot-346);box(c,'#57432f',x,346,2,foot-346);stroke(c,'#2a2019',x+(x===186?8:0),372,x+(x===186?34:-26),346,3);}
  c.drawImage(bell(64,84),288,346);c.drawImage(bell(40,52),208,346);
 }
 for(const [i,x] of ROPES.entries()){
  if(!visible(x-2,330,6,700,cx,cy,vw,vh))continue;
  const sway=Math.round(Math.sin(t*.9+i*1.7)*1.5);
  box(c,'#7d7052',x,346,1,280);box(c,'#7d7052',x+(sway>0?1:0),626,1,330+i*6);
  const sally=956+i*6;for(let k=0;k<7;k++)box(c,k%2?'#b9bfb6':'#9a4a43',x-1+sway,sally+k*4,3,4);
  box(c,'#7d7052',x+sway,sally+28,1,34);box(c,'#7d7052',x-1+sway,sally+62,3,3);
 }
 // Cut walls either side, built down into the ground the tower stands in.
 wall(c,'belltower/cut',cutTile,0,top,L,height);box(c,'#66727d',L-1,top,1,height);box(c,'#0b0f14',L,top,2,height);
 wall(c,'belltower/cut',cutTile,R,top,OUT-R,height);box(c,'#66727d',R,top,1,height);box(c,'#0b0f14',R-2,top,2,height);box(c,'#1a2028',OUT-2,top,2,height);
 if(bottom>GROUND+28){
  wall(c,'belltower/foot',footTile,0,GROUND+28,WELL0,bottom-GROUND-28);wall(c,'belltower/foot',footTile,WELL1,GROUND+28,OUT-WELL1,bottom-GROUND-28);
  // The pit: a lined shaft the ropes once reached, standing in rainwater.
  box(c,'#090d12',WELL0,GROUND,WELL1-WELL0,bottom-GROUND);
  wall(c,'belltower/cut',cutTile,WELL0-6,GROUND+28,6,bottom-GROUND-28);wall(c,'belltower/cut',cutTile,WELL1,GROUND+28,6,bottom-GROUND-28);
  box(c,'#0b0f14',WELL0,GROUND+28,2,bottom-GROUND-28);box(c,'#0b0f14',WELL1-2,GROUND+28,2,bottom-GROUND-28);
 }
}
function water(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 if(cy+vh<PIT)return;
 box(c,'#13303c',WELL0+2,PIT,WELL1-WELL0-4,cy+vh+24-PIT);box(c,'#4f7f8a',WELL0+2,PIT,WELL1-WELL0-4,1);
 for(let i=0;i<4;i++){const x=WELL0+10+i*27+Math.sin(t*1.3+i*2)*4;box(c,'#8fb4b866',x,PIT+2+i%2*3,10,1);}
 // Drips from the floors above ring the surface.
 for(let i=0;i<3;i++){const p=((t*.7+i*.37)%1+1)%1,x=WELL0+24+i*34;box(c,'#b9c9d955',x,PIT-70+p*70,1,4);if(p>.85)box(c,'#b9c9d944',x-4,PIT+1,9,1);}
}
function deck(c:C,p:Platform,l:Level){
 const w=p.w;
 if(p.kind==='grate'){
  // A surviving stair tread or frame beam: one oak plank you can come up through.
  box(c,'#15100c',-1,0,w+2,12);box(c,'#735a40',0,0,w,9);box(c,'#b3946a',0,0,w,2);box(c,'#8d704f',0,2,w,2);
  for(let x=9+p.id%5;x<w-6;x+=19)box(c,'#523f2d',x,4,1,5);
  box(c,'#3a2c20',0,9,w,2);for(const x of [1,w-4]){box(c,'#262d33',x,2,3,8);box(c,'#5d6a6e',x,2,1,2);}
  return;
 }
 if(p.y>=GROUND){
  // The tower's ground floor: worn flags on the footing.
  box(c,'#1a2028',0,0,w,28);
  for(let x=0;x<w;x+=30){const wide=Math.min(29,w-x),v=hash(x,p.id,3);box(c,v>.5?'#454f59':'#3f4953',x,2,wide,26);box(c,'#57626d',x,2,wide,1);if(v>.6)box(c,'#333c45',x+8,12,9,1);}
  box(c,'#8a949b',0,0,w,2);box(c,'#6b757d',0,2,w,1);return;
 }
 // An oak floor: boards on a trimmer, joist ends showing along the edge.
 box(c,'#15100c',0,0,w,28);box(c,'#6b523a',0,0,w,8);box(c,'#b3946a',0,0,w,2);box(c,'#8d704f',0,2,w,1);
 for(let x=13+p.id%7;x<w-4;x+=23)box(c,'#4c3a29',x,3,1,5);
 box(c,'#2c2119',0,8,w,20);box(c,'#3d2e22',0,10,w,14);box(c,'#4a3828',0,10,w,1);
 for(let x=6;x<w-12;x+=26){box(c,'#1c1510',x,12,10,11);box(c,'#57432f',x+1,13,8,9);box(c,'#735a40',x+1,13,8,1);box(c,'#3d2e22',x+4,16,2,3);}
 box(c,'#15100c',0,26,w,2);
}
function exit(c:C,l:Level,s:Run,t:number,front:boolean){
 if(front)return;
 const x=Math.round(l.exit.x+l.exit.w/2),y=l.exit.y+l.exit.h,open=s.phase!=='playing';
 // The door to the belfry gallery, set into the wall: dressed jambs, a
 // stepped arch, and lamplight from the passage behind it.
 box(c,'#f3c77a0f',x-46,y-92,92,92);box(c,'#f3c77a12',x-34,y-78,68,78);
 box(c,'#0d1218',x-27,y-64,54,64);box(c,'#0d1218',x-23,y-70,46,8);box(c,'#0d1218',x-16,y-75,32,6);
 box(c,'#3e4954',x-25,y-62,8,62);box(c,'#3e4954',x+17,y-62,8,62);box(c,'#3e4954',x-21,y-68,42,8);box(c,'#3e4954',x-14,y-73,28,6);
 box(c,'#5a6671',x-25,y-62,1,62);box(c,'#5a6671',x-14,y-73,28,1);box(c,'#5a6671',x-21,y-68,7,1);box(c,'#5a6671',x+14,y-68,7,1);
 for(let yy=y-50;yy<y;yy+=13){box(c,'#222a33',x-25,yy,8,1);box(c,'#222a33',x+17,yy,8,1);}
 for(const xx of [-8,0,8])box(c,'#222a33',x+xx,y-73,1,9);
 box(c,'#2b1e14',x-17,y-58,34,58);box(c,'#2b1e14',x-13,y-63,26,6);
 box(c,'#c98f4b',x-15,y-56,30,56);box(c,'#c98f4b',x-11,y-61,22,6);box(c,'#f0c47a',x-9,y-54,18,54);box(c,'#fff0c4',x-4,y-46,8,46);
 // The oak leaf stands open against the jamb.
 box(c,'#4a3423',x-17,y-58,7,58);box(c,'#6b4a2e',x-16,y-57,5,57);box(c,'#262d33',x-17,y-44,7,2);box(c,'#262d33',x-17,y-16,7,2);
 if(open)box(c,'#fff0c466',x-9,y-54,18,54);
 box(c,'#56626d',x-27,y-3,54,3);box(c,'#78848e',x-27,y-3,54,1);box(c,'#f3c77a44',x-22,y-1,44,1);
 // A lamp on an iron bracket beside the arch.
 box(c,'#262d33',x+27,y-70,14,2);box(c,'#262d33',x+39,y-70,2,6);lantern(c,x+40,y-64,'#f3c77a',true);
}
export const bellTower:QuarterSet={
 sky(c,l,w,h,cx,cy,t){
  box(c,'#1b2638',0,0,w,h);box(c,'#22304a',0,Math.round(h*.55),w,Math.round(h*.45));
  // The house next door reaches a third of the way up the tower.
  const roof=1050-cy,x=OUT-cx;if(roof<h){box(c,'#141b25',x,roof,w-x,h-roof);box(c,'#1d2733',x,roof,w-x,3);for(let yy=roof+26;yy<h;yy+=58){box(c,'#0d1219',x+22,yy,12,18);box(c,yy%116<58?'#a8763f':'#1a2633',x+24,yy+2,8,14);}}
  for(let i=0;i<40;i++){const x=((hash(i,1)*w-t*30)%w+w)%w,y=((hash(i,2)*h+t*250)%h+h)%h;box(c,'#b9c9d93d',x,y,1,7);}
 },
 back,deck,exit,water,
};
