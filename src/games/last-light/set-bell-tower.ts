import type {Level,Platform} from './levels';
import type {Run} from './model';
import {lantern} from './props';
import {box,hash,lay,panel,sprite,stroke,visible,type C,type Work} from './quarter-kit';
import type {QuarterSet} from './quarter-sets';

/** Level 2 · the inside of the Quarter's bell tower, seen in section.
 * Two cut stone walls stand either side of one shaft. Timber floors are let
 * into those walls; the stair between them has lost most of its treads, so
 * the ones left are what you climb. Bell ropes and the clock weights hang
 * down an open well through every floor into a pit the rain has flooded.
 * The clock room and the belfry are rooms you pass through on the way up. */
const L=24,R=624,OUT=664,WELL0=264,WELL1=384,GROUND=1400,PIT=1500;
/** The far wall is built in three kinds of work: big ashlar at the foot, coursed
 * stone above it and at the belfry, and brick for the storeys between. The
 * side walls are seen end-on in the corners and cut through at the edges of
 * the section, and the well is lined in brick. Every stretch of wall is laid
 * course by course between the floors, corners and openings that bound it. */
const BIG:Work={course:24,short:34,long:66,mortar:'#131a22',stones:['#1b242e','#1d2731','#202a35','#1a232d'],lip:'#27323e',shade:'#161d26',chip:'#2b3643'};
const COURSED:Work={course:16,short:22,long:46,mortar:'#19212b',stones:['#1d2631','#1f2934','#222c37','#1c2530'],lip:'#27323e',shade:'#18202a',chip:'#2b3643'};
const BRICK:Work={course:8,short:12,long:18,mortar:'#15181f',stones:['#221e25','#252027','#28222a','#201c23'],lip:'#2f282e',shade:'#1c181e',chip:'#342c32'};
const BAY:Work={course:8,short:12,long:18,mortar:'#101319',stones:['#1a181e','#1c1a20','#1f1c22'],lip:'#242026',shade:'#161419',chip:'#28242a'};
const SIDE:Work={course:16,short:5,long:11,mortar:'#0d1218',stones:['#151b24','#161d26','#181f29'],lip:'#1c2430',shade:'#121820',chip:'#1f2733'};
const CHASE:Work={course:8,short:12,long:18,mortar:'#0e1015',stones:['#141318','#151419','#16151b'],lip:'#19181e',shade:'#111015',chip:'#1c1a20'};
/** Where the section cuts a wall: the rubble core between two dressed faces. */
const CUT:Work={course:14,short:10,long:30,mortar:'#1d252e',stones:['#39444f','#3e4954','#434e59','#353f49'],lip:'#56626d',shade:'#2c353f',chip:'#606c77'};
const FOOT:Work={course:16,short:26,long:52,mortar:'#0f141a',stones:['#171d25','#191f28','#1b222b'],lip:'#1f2731',shade:'#141a21',chip:'#222b36'};
const RETURN=26,CHASE0=273,CHASE1=377,PLATE=24,PARAPET=PLATE-30,FOOTING=GROUND+28,DEEP=1640;
/** The well's quoins: dressed stones, long and short by turns, toothed into the wall either side. */
function quoins(c:C,x:number,from:number,to:number,right:boolean){
 for(let y=from-((from%16)+16)%16,k=0;y<to;y+=16,k++){
  const a=Math.max(from,y+1),b=Math.min(to,y+15);if(b<=a)continue;
  const wide=(y/16&1)?13:8,v=hash(y,x,41),at=right?x:x+13-wide;
  box(c,v>.5?'#27313c':'#29333e',at,a,wide,b-a);if(a===y+1)box(c,'#333e4a',at,a,wide,1);box(c,'#1b232c',at,b-1,wide,1);
 }
}
/** The spire in section: its two slopes, slated outside and raftered within, rising off the wall plate to the king post. */
const APEX=PLATE-640,COLLARS=[452,326,196] as const,HOIST_Y=APEX+COLLARS[0]+9;
const spire=()=>sprite('belltower/spire',R-L+40,PLATE-APEX,c=>{
 const mid=(R-L)/2+20,h=PLATE-APEX;
 for(let y=0;y<h;y++){
  const half=Math.round((R-L)/2*y/h)+6;
  box(c,'#1a2330',mid-half-8,y,8,1);box(c,'#3a4a5e',mid-half-8,y,1,1);box(c,'#1a2330',mid+half,y,8,1);box(c,'#2c394a',mid+half+7,y,1,1);
  if(half>8){box(c,'#0a0d12',mid-half,y,half*2,1);box(c,'#17110d',mid-half,y,6,1);box(c,'#33261d',mid-half+5,y,1,1);box(c,'#17110d',mid+half-6,y,6,1);}
  if(y%9===4&&half>16)box(c,'#0e1218',mid-half+6,y,half*2-12,1);
 }
 // Collars tie the rafters from the second tier up; the king post hangs from the apex to the lowest of them.
 // The first tier was cut away to pass the bell hoist: what is left of it is the staging you stand on.
 for(const y of COLLARS){const half=Math.round((R-L)/2*y/h)+6;box(c,'#17110d',mid-half+4,y,half*2-8,9);box(c,'#3d2e22',mid-half+4,y,half*2-8,1);box(c,'#2b2018',mid-half+4,y+1,half*2-8,2);
  for(const side of [-1,1]){const x=mid+side*(half-22);stroke(c,'#17110d',x,y+9,x+side*16,y+30,3);}}
 box(c,'#17110d',mid-4,40,9,COLLARS[0]-32);box(c,'#3d2e22',mid-4,40,2,COLLARS[0]-32);
 // Purlins run the length of each slope behind the rafters, a tier apart.
 for(let y=120;y<h-20;y+=96){const half=Math.round((R-L)/2*y/h)+6;for(const side of [-1,1]){box(c,'#231a14',mid+side*(half-14)-4,y,8,6);box(c,'#3d2e22',mid+side*(half-14)-4,y,8,1);}}
});
/** A blind bay: a shallow arched recess in the far wall, its back in thinner brick. */
const bay=(w:number,h:number)=>sprite(`belltower/bay/${w}/${h}`,w,h,c=>{
 lay(c,w,h,BAY,w*7+h);
 for(let x=0;x<w;x+=2){
  const k=(x+1)/w*2-1,top=14-Math.round(14*(1-k*k));
  c.clearRect(x,0,2,top);box(c,'#2c3743',x,top,2,3);box(c,'#3a4653',x,top,2,1);box(c,'#080b10',x,top+3,2,3);
 }
 for(let x=4;x<w-4;x+=13){const k=(x+1)/w*2-1,top=14-Math.round(14*(1-k*k));box(c,'#19212b',x,top,1,3);}
 box(c,'#080b10',0,14,4,h-14);box(c,'#0c1016',4,17,2,h-17);box(c,'#28323d',w-1,14,1,h-14);
 box(c,'#2c3743',0,h-4,w,4);box(c,'#3a4653',0,h-4,w,1);box(c,'#141b23',0,h-1,w,1);
});
/** The storeys of the tower: the floor over each, the floor under it, and what the far wall is built of. */
const STOREYS:readonly (readonly [number,number,number])[]=[[-400,520,1],[520,696,2],[696,872,2],[872,1048,2],[1048,1224,1],[1224,1400,0]];
const WORK=[BIG,COURSED,BRICK] as const;
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
 // Moonlight falls a little way down the wall under the sill, and the rain that gets in runs down it.
 box(c,'#6f8fb414',x-3,y+55,16,30);box(c,'#6f8fb40c',x-6,y+85,22,26);
 box(c,'#10161d',x+2,y+55,5,26);box(c,'#10161d',x+3,y+81,3,20);box(c,'#10161d',x+4,y+101,1,12);
 const run=((t*26+x)%58+58)%58;box(c,'#8fb4c855',x+4,y+55+run,1,3);box(c,'#4d6a7a',x-4,y+51,18,1);
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
/** Where a storey's far wall starts: the course over its floor, or the wall plate in the belfry. */
const storeyTop=(over:number)=>over<520?PLATE+9:over+12;
/** The landings a side wall carries: each one's bearer runs into the wall. */
const bearings=new WeakMap<Level,{left:Platform[];right:Platform[]}>();
function bearing(l:Level){
 let made=bearings.get(l);
 if(!made){made={left:l.platforms.filter(p=>p.x<=L+1&&p.y<GROUND),right:l.platforms.filter(p=>p.x+p.w>=R-1&&p.y<GROUND)};bearings.set(l,made);}
 return made;
}
/** Window openings cut through the side walls: [side, head, sill]. */
const OPENINGS:readonly (readonly [0|1,number,number])[]=[[0,760,816],[0,1120,1176],[1,592,644],[1,936,992],[1,1180,1232]];
/** One side wall where the section cuts it: laid between the floors it carries, stopped by its openings and its parapet. */
function cutWall(c:C,l:Level,side:0|1,top:number,bottom:number){
 const x0=side?R:0,wide=side?OUT-R:L,face=side?R:L,carried=side?bearing(l).right:bearing(l).left;
 const lines=[...new Set([PARAPET,...carried.filter(p=>p.kind!=='grate').map(p=>p.y+14),FOOTING])].sort((a,b)=>a-b);
 for(let i=0;i<lines.length-1;i++){
  const a=lines[i],b=lines[i+1];if(b<top||a>bottom)continue;
  c.drawImage(panel(`belltower/cut/${side}/${a}`,wide,b-a,CUT,side*977+a),x0,a);
 }
 // The two faces of the wall: the room side catches the lantern, the outer side is weathered dark.
 box(c,'#66727d',side?R:L-1,Math.max(top,PARAPET),1,Math.min(bottom,FOOTING)-Math.max(top,PARAPET));
 box(c,'#0b0f14',side?R-2:L,Math.max(top,PLATE),2,Math.min(bottom,FOOTING)-Math.max(top,PLATE));
 if(side)box(c,'#1a2028',OUT-2,Math.max(top,PARAPET),2,Math.min(bottom,FOOTING)-Math.max(top,PARAPET));
 // The parapet: the wall stops under a coping stone that throws water clear of both faces.
 if(PARAPET-6<bottom&&PARAPET>top-6){box(c,'#2c3743',x0-3,PARAPET-5,wide+6,6);box(c,'#56626d',x0-3,PARAPET-5,wide+6,1);box(c,'#141b23',x0-3,PARAPET+1,wide+6,1);for(const x of [x0-3,x0+wide+1])box(c,'#141b23',x,PARAPET+1,2,2);}
 for(const [s,head,sill] of OPENINGS){
  if(s!==side||sill+8<top||head-8>bottom)continue;
  // Through the wall to the night: a lintel the courses stop under, a sloped sill they stop on.
  // Below the neighbour's eaves the right-hand openings look onto its gable wall, not the sky.
  const beyond=side&&head>1050;box(c,beyond?'#1a222e':'#31425d',x0,head,wide,sill-head);box(c,beyond?'#263345':'#42587a',side?x0+wide-6:x0,head,6,sill-head);box(c,'#141c2c',side?x0:x0+wide-3,head,3,sill-head);
  if(beyond)box(c,'#b07d40',x0+wide-14,head+14,6,10);
  box(c,'#1d252e',x0-1,head-7,wide+2,7);box(c,'#4c5864',x0,head-6,wide,5);box(c,'#6b7782',x0,head-6,wide,1);box(c,'#2c353f',x0,head-2,wide,1);
  box(c,'#1d252e',x0-1,sill,wide+2,6);box(c,'#4c5864',x0,sill,wide,4);box(c,'#7a8690',x0,sill,wide,1);box(c,'#2c353f',x0,sill+4,wide,1);
  box(c,side?'#7a8690':'#7a8690',side?x0+wide:x0-2,sill+1,2,2);
 }
 for(const p of carried){
  if(p.y+40<top||p.y>bottom)continue;
  if(p.kind==='grate'){
   // A tread or shelf on an iron bracket leaded into the wall.
   const bx=side?face-1:face-8;box(c,'#10161d',bx,p.y+3,9,5);box(c,'#262d33',side?face-6:face,p.y+10,6,2);stroke(c,'#262d33',side?face-1:face,p.y+20,side?face-10:face+9,p.y+11,2);
   continue;
  }
  // The floor's bearer runs into the wall on a stone corbel, in a pocket the courses stop round.
  const into=side?face:face-12;
  box(c,'#0b0f14',into-1,p.y+6,14,20);box(c,'#3d2e22',into,p.y+8,12,16);box(c,'#57432f',into,p.y+8,12,1);
  for(let k=0;k<3;k++)box(c,'#2b2018',into+2+k*3,p.y+12+k*3,6-k*2,1);
  box(c,'#1d252e',side?face-6:face-12,p.y+27,18,8);box(c,'#4c5864',side?face-5:face-11,p.y+28,16,6);box(c,'#6b7782',side?face-5:face-11,p.y+28,16,1);box(c,'#2c353f',side?face-5:face-11,p.y+33,16,1);
 }
}
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const top=cy-24,bottom=cy+vh+24;
 for(const [over,under,work] of STOREYS){
  // Each storey of the far wall in its own work, laid from its floor up to the floor over it, with a blind bay either side of the well.
  const y0=storeyTop(over),y1=under+12;if(y1<=top||y0>=bottom)continue;
  c.drawImage(panel(`belltower/storey/${under}`,R-L,y1-y0,WORK[work],under*3+work),L,y0);
  if(over<520)continue;
  const left=under===GROUND?96:70,y=over+44,high=under-26-y;
  if(y<bottom&&y+high>top){c.drawImage(bay(246-left,high),left,y);c.drawImage(bay(176,high),402,y);}
 }
 if(top<532){
  // The belfry: stone piers between its openings, a corbelled wall plate, and over that the spire.
  for(const x of [150,430]){c.drawImage(panel(`belltower/pier/${x}`,24,532-PLATE,COURSED,x),x,PLATE);box(c,'#2c3743',x,PLATE,1,532-PLATE);box(c,'#080b10',x+24,PLATE,3,532-PLATE);box(c,'#2c3743',x-3,500,30,8);box(c,'#3a4653',x-3,500,30,1);}
  box(c,'#252f3b',L+RETURN,322,R-L-RETURN*2,6);box(c,'#2e3946',L+RETURN,322,R-L-RETURN*2,1);box(c,'#141b23',L+RETURN,328,R-L-RETURN*2,1);
  if(top<PLATE+20){
   if(top<PLATE)c.drawImage(spire(),L-20,APEX);
   box(c,'#2c3743',L,PLATE,R-L,9);box(c,'#3a4653',L,PLATE,R-L,1);box(c,'#141b23',L,PLATE+9,R-L,1);
   for(let x=L+RETURN+8;x<R-RETURN-8;x+=30){box(c,'#2c3743',x,PLATE+10,10,5);box(c,'#232d38',x+2,PLATE+15,6,4);box(c,'#141b23',x,PLATE+15,2,1);}
  }
 }
 // The well's lining runs behind the ropes from the belfry floor to the pit, quoined in stone; the clock stands across it.
 for(const [from,to] of [[548,708],[884,DEEP]] as const){
  const a=Math.max(top,from),b=Math.min(bottom,to);if(b<=a)continue;
  c.drawImage(panel(`belltower/chase/${from}`,CHASE1-CHASE0,to-from,CHASE,from),CHASE0,from);box(c,'#06080c',CHASE0,a,3,b-a);box(c,'#22272f',CHASE1-1,a,1,b-a);
  quoins(c,CHASE0-13,a,b,false);quoins(c,CHASE1,a,b,true);
  if(from>top-8&&from<bottom){box(c,'#2c3743',CHASE0-14,from-6,CHASE1-CHASE0+28,7);box(c,'#3a4653',CHASE0-14,from-6,CHASE1-CHASE0+28,1);box(c,'#06080c',CHASE0,from+1,CHASE1-CHASE0,3);}
 }
 // The side walls, end-on in the corners, and the shadow each floor throws on the wall under it.
 // Each return stops under the wall plate and at every floor it carries, like the far wall between them.
 for(const [over,under] of STOREYS){
  const y0=storeyTop(over),y1=under+12;if(y1<=top||y0>=bottom)continue;
  for(const side of [0,1]){c.drawImage(panel(`belltower/return/${side}/${under}`,RETURN,y1-y0,SIDE,under+side*31),side?R-RETURN:L,y0);}
  box(c,'#070a0e',L+RETURN,y0,2,y1-y0);box(c,'#28323d',L+RETURN+2,y0,1,y1-y0);box(c,'#070a0e',R-RETURN-2,y0,2,y1-y0);
 }
 for(const p of l.platforms)if(p.kind==='stone'&&p.y<GROUND&&visible(p.x,p.y,p.w,60,cx,cy,vw,vh)){box(c,'#05080c73',p.x,p.y+p.h,p.w,9);box(c,'#05080c3d',p.x,p.y+p.h+9,p.w,16);}
 for(const y of FLOORS)if(y+34>top&&y<bottom){
  // A stone course carries every floor; empty pockets show where joists were. Across the well a trimmer holds the rope guides.
  for(const [x0,x1] of [[L,CHASE0-8],[CHASE1+8,R]] as const){box(c,'#252f3b',x0,y+8,x1-x0,7);box(c,'#2e3946',x0,y+8,x1-x0,1);box(c,'#141b23',x0,y+15,x1-x0,1);}
  for(let x=L+10;x<R-10;x+=26)if(!(x>WELL0-8&&x<WELL1))box(c,'#10161d',x,y+10,7,4);
  box(c,'#17110d',WELL0,y+8,WELL1-WELL0,10);box(c,'#3d2e22',WELL0,y+9,WELL1-WELL0,7);box(c,'#57432f',WELL0,y+9,WELL1-WELL0,1);
 }
 if(visible(L+RETURN,1230,560,170,cx,cy,vw,vh)){
  // The foot of the tower: a plinth course, and a relieving arch over the door.
  box(c,'#252f3b',L+RETURN,1384,R-L-RETURN*2,16);box(c,'#2e3946',L+RETURN,1384,R-L-RETURN*2,1);for(let x=L+RETURN+20;x<R-RETURN;x+=48)if(!(x>WELL0-12&&x<WELL1+6))box(c,'#19212b',x,1385,1,15);
  for(let x=28;x<86;x+=4){const k=(x+2-56)/30,y=1340-Math.round(12*Math.sqrt(Math.max(0,1-k*k)));box(c,'#2c3743',x,y,4,6);box(c,'#3a4653',x,y,4,1);if(x%8===0)box(c,'#19212b',x,y,1,6);}
 }
 if(visible(440,930,110,60,cx,cy,vw,vh)){
  // The ringers' peal board on the wall of the ringing chamber.
  box(c,'#120d0a',448,934,88,46);box(c,'#2a1e16',450,936,84,42);box(c,'#3b2a1e',450,936,84,1);box(c,'#8c7648',456,940,72,2);box(c,'#6d5a36',470,945,44,1);
  for(let row=0;row<5;row++)for(let col=0;col<3;col++)box(c,'#5a4a30',456+col*26,951+row*5,18-((row+col)%3)*4,1);
  box(c,'#59666b',452,932,3,3);box(c,'#59666b',529,932,3,3);
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
 // The clock's two weights hang down the well on their cables; the long one stands in the water of the pit.
 for(const x of [366,356]){const from=800,to=x===366?1296:1476;if(visible(x,from,2,to-from+44,cx,cy,vw,vh)){box(c,'#39424a',x,from,1,to-from);box(c,'#262c33',x-4,to,9,40);box(c,'#4d575e',x-4,to,2,40);box(c,'#4d575e',x-4,to,9,2);box(c,'#1a1f25',x-4,to+12,9,1);box(c,'#1a1f25',x-4,to+26,9,1);}}
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
  // Each bell rope drops through every floor's guide, past its sally, and on down the well into the pit.
  if(!visible(x-2,330,6,1190,cx,cy,vw,vh))continue;
  const sway=Math.round(Math.sin(t*.9+i*1.7)*1.5),sally=956+i*6,end=1482+i*9;
  box(c,'#7d7052',x,346,1,280);box(c,'#7d7052',x+(sway>0?1:0),626,1,330+i*6);
  for(let k=0;k<7;k++)box(c,k%2?'#b9bfb6':'#9a4a43',x-1+sway,sally+k*4,3,4);
  box(c,'#7d7052',x+sway,sally+28,1,90);box(c,'#6d6248',x,sally+118,1,end-sally-118);box(c,'#6d6248',x-1,end,3,3);
  for(const y of FLOORS)if(y>346&&y+20>top&&y<bottom){box(c,'#0b0906',x-2,y+11,5,5);box(c,'#7d7052',x,y+8,1,10);box(c,'#59666b',x-2,y+10,1,6);box(c,'#59666b',x+2,y+10,1,6);}
 }
 // The top of the belfry and the foot of the spire: what each landing up here stands on.
 for(const p of l.platforms){
  if(p.y>500||!visible(p.x-40,p.y-20,p.w+80,140,cx,cy,vw,vh))continue;
  if((p.kind==='crumble'||p.kind==='grate')&&p.y>440){
   // A frame beam under the bells: on a post down to the floor's stone course.
   const x=Math.round(p.x+p.w/2)-3;box(c,'#1c1510',x,p.y+11,7,529-p.y-11);box(c,'#57432f',x,p.y+11,2,529-p.y-11);stroke(c,'#2a2019',x+3,p.y+34,p.x+5,p.y+11,2);stroke(c,'#2a2019',x+3,p.y+34,p.x+p.w-6,p.y+11,2);
  }else if(p.kind==='crumble'){
   // The plank lies across the bell cage: two rails seen end-on, each on a post off the head beam, braced to each other.
   for(const x of [p.x+3,p.x+p.w-15]){box(c,'#15100c',x,p.y+11,12,12);box(c,'#3d2e22',x+1,p.y+12,10,10);box(c,'#57432f',x+1,p.y+12,10,1);box(c,'#2b2018',x+3,p.y+15,6,5);box(c,'#1c1510',x+3,p.y+23,6,336-p.y-23);box(c,'#57432f',x+3,p.y+23,1,336-p.y-23);}
   stroke(c,'#2a2019',p.x+8,p.y+30,p.x+p.w-10,332,2);stroke(c,'#2a2019',p.x+p.w-10,p.y+30,p.x+8,332,2);
  }else if(p.kind==='grate'&&p.y<300&&p.y>180&&p.x>120&&p.x<260){
   // The frame's west post runs on up to a rail: the tread is its cap, strutted either side.
   box(c,'#1c1510',186,p.y+10,8,336-p.y-10);box(c,'#57432f',186,p.y+10,2,336-p.y-10);
   stroke(c,'#2a2019',190,p.y+44,p.x+4,p.y+11,3);stroke(c,'#2a2019',190,p.y+44,p.x+p.w-5,p.y+11,3);box(c,'#59666b',188,p.y+42,4,4);
  }else if(p.kind==='grate'&&p.y<200&&p.x<L+RETURN+8){
   // A wall tread on an iron bracket leaded into the west wall.
   box(c,'#10161d',L+RETURN,p.y+3,6,6);box(c,'#262d33',p.x,p.y+10,p.w-8,2);stroke(c,'#262d33',L+RETURN+1,p.y+34,p.x+p.w-14,p.y+11,2);box(c,'#59666b',L+RETURN,p.y+32,4,4);
  }else if(p.kind==='stone'&&p.h<=12&&p.y>=PARAPET){
   // Staging at the wall plate: its two tie beams run back onto the far wall, each on a stone corbel under the plate.
   for(const x of [p.x+5,p.x+p.w-19]){box(c,'#141b23',x-2,p.y+20,18,10);box(c,'#3a4653',x-1,p.y+20,16,6);box(c,'#4d5a67',x-1,p.y+20,16,1);box(c,'#2c3743',x+2,p.y+26,10,4);box(c,'#05080c8c',x-1,p.y+30,16,6);}
  }else if(p.kind==='stone'&&p.h<=12&&p.y<PARAPET){
   // Staging on the stumps of the spire's first collars: each stump is tenoned into its rafter and strutted from it.
   const west=p.x<300,half=Math.round((R-L)/2*(p.y+70-APEX)/(PLATE-APEX))+6,rx=west?(L+R)/2-half+8:(L+R)/2+half-8;
   stroke(c,'#17110d',rx,p.y+70,west?p.x+p.w-12:p.x+12,p.y+18,4);stroke(c,'#3d2e22',rx,p.y+69,west?p.x+p.w-12:p.x+12,p.y+17,1);
   box(c,'#59666b',west?p.x-2:p.x+p.w-3,p.y+2,5,8);
  }
 }
 if(visible(300,HOIST_Y,50,30,cx,cy,vw,vh)){
  // The bell hoist's block hangs under the second collar, over the middle of the well.
  const mx=(L+R)/2;box(c,'#1a1f25',mx-2,HOIST_Y,4,8);for(let y=-7;y<=7;y++){const out=Math.floor(Math.sqrt(49-y*y));box(c,'#262d33',mx-out,HOIST_Y+14+y,out*2,1);}box(c,'#59666b',mx-2,HOIST_Y+12,4,4);box(c,'#4a545b',mx-7,HOIST_Y+13,1,3);
 }
 for(const p of l.platforms)if(p.x<=L+1&&p.kind==='stone'&&p.y<PLATE+260&&visible(L,p.y,p.w,80,cx,cy,vw,vh)){
  // The west loft's knee brace runs from a stone in the wall up under its outer end.
  stroke(c,'#17110d',L+RETURN+2,p.y+72,p.x+p.w-18,p.y+27,4);stroke(c,'#57432f',L+RETURN+2,p.y+71,p.x+p.w-18,p.y+26,1);box(c,'#4c5864',L+RETURN,p.y+70,10,8);box(c,'#6b7782',L+RETURN,p.y+70,10,1);
 }
 // Cut walls either side, built down into the ground the tower stands in.
 cutWall(c,l,0,top,bottom);cutWall(c,l,1,top,bottom);
 if(bottom>FOOTING){
  c.drawImage(panel('belltower/foot/0',WELL0,DEEP-FOOTING,FOOT,3),0,FOOTING);c.drawImage(panel('belltower/foot/1',OUT-WELL1,DEEP-FOOTING,FOOT,5),WELL1,FOOTING);
  // The pit: the well's lining going on down into the ground, stained to the old flood line, with rungs and a drain.
  c.drawImage(panel('belltower/pit',WELL1-WELL0,DEEP-GROUND,CHASE,9),WELL0,GROUND);box(c,'#05070a',WELL0,GROUND,WELL1-WELL0,6);box(c,'#05070a8c',WELL0,GROUND+6,WELL1-WELL0,10);
  for(let x=WELL0+6;x<WELL1-6;x+=16)box(c,'#05080c80',x,PIT-30-(hash(x,3,5)*3|0)*4,16,bottom-PIT+42);
  box(c,'#05070a',330,PIT-34,34,bottom-PIT+34);box(c,'#05070a',334,PIT-40,26,6);for(let x=328;x<366;x+=6){const k=(x+3-347)/20,y=PIT-40-Math.round(6*Math.sqrt(Math.max(0,1-k*k)));box(c,'#27313c',x,y,6,5);box(c,'#333e4a',x,y,6,1);}
  for(const x of [WELL0-6,WELL1]){c.drawImage(panel(`belltower/pitside/${x}`,6,DEEP-FOOTING,CUT,x),x,FOOTING);}
  box(c,'#0b0f14',WELL0,FOOTING,2,bottom-FOOTING);box(c,'#0b0f14',WELL1-2,FOOTING,2,bottom-FOOTING);
  for(let y=GROUND+36;y<bottom;y+=12){box(c,'#0b0f14',WELL0+4,y+1,13,2);box(c,'#4a545b',WELL0+4,y,12,1);box(c,'#39424a',WELL0+15,y,1,3);}
 }
}
function water(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 if(cy+vh<PIT)return;
 box(c,'#13303c',WELL0+2,PIT,WELL1-WELL0-4,cy+vh+24-PIT);box(c,'#0f2630',WELL0+2,PIT+14,WELL1-WELL0-4,cy+vh+10-PIT);box(c,'#4f7f8a',WELL0+2,PIT,WELL1-WELL0-4,1);
 for(let i=0;i<4;i++){const x=WELL0+10+i*27+Math.sin(t*1.3+i*2)*4;box(c,'#8fb4b866',x,PIT+2+i%2*3,10,1);}
 // The ropes and the weight's cable stand in the water as broken lines.
 for(const [i,x] of ROPES.entries())for(let k=0;k<5;k++)box(c,'#7d705266',x+Math.round(Math.sin(t*1.4+k*1.6+i)*1.5),PIT+3+k*5,1,3);
 for(let k=0;k<4;k++)box(c,'#4d575e80',352+Math.round(Math.sin(t*1.2+k)*1.5),PIT+4+k*6,9,2);
 // Drips from the floors above ring the surface.
 for(let i=0;i<3;i++){const p=((t*.7+i*.37)%1+1)%1,x=WELL0+24+i*34;box(c,'#b9c9d955',x,PIT-70+p*70,1,4);if(p>.85)box(c,'#b9c9d944',x-4,PIT+1,9,1);}
}
function deck(c:C,p:Platform,l:Level){
 const w=p.w;
 if(p.kind==='moving'){
  // The bell hoist's pallet: oak boards on two bearers, an eye bolt at each corner for its slings.
  box(c,'#15100c',-1,0,w+2,12);box(c,'#6b523a',0,0,w,7);box(c,'#b3946a',0,0,w,2);box(c,'#8d704f',0,2,w,1);for(let x=10;x<w-4;x+=13)box(c,'#4c3a29',x,3,1,4);
  box(c,'#2c2119',0,7,w,5);for(const x of [3,w-13]){box(c,'#15100c',x,7,10,5);box(c,'#3d2e22',x+1,7,8,4);}
  for(const x of [1,w-4]){box(c,'#262d33',x,-2,3,4);box(c,'#5d6a6e',x,-2,3,1);}
  return;
 }
 if(p.kind==='crumble'){
  // A rotten plank: grey oak gone soft, split along the grain, a knot fallen out of it.
  box(c,'#15100c',-1,0,w+2,12);box(c,'#57493a',0,0,w,9);box(c,'#8a7a62',0,0,w,2);box(c,'#6a5b48',0,2,w,2);
  for(let x=6+p.id%5;x<w-8;x+=11){const v=hash(x,p.id,7);box(c,'#231a14',x,3+Math.floor(v*3),3+Math.floor(v*9),1);}
  box(c,'#15100c',Math.round(w*.38),2,7,5);box(c,'#231a14',Math.round(w*.38)+1,3,5,3);box(c,'#4a5a44',Math.round(w*.7),1,9,2);box(c,'#5d6b4f',Math.round(w*.7)+2,1,4,1);box(c,'#4a5a44',5,7,11,2);
  box(c,'#2c2119',0,9,w,2);
  return;
 }
 if(p.h<=12&&p.kind==='stone'){
  // Staging: boards on a ledger across two cross beams, which run back to the far wall and are seen end-on.
  box(c,'#15100c',-1,0,w+2,12);box(c,'#6b523a',0,0,w,5);box(c,'#b3946a',0,0,w,2);box(c,'#8d704f',0,2,w,1);
  for(let x=13+p.id%7;x<w-4;x+=21)box(c,'#4c3a29',x,3,1,2);
  box(c,'#2c2119',0,5,w,7);box(c,'#3d2e22',0,6,w,5);box(c,'#4a3828',0,6,w,1);
  for(const x of [5,w-19]){box(c,'#15100c',x,4,14,16);box(c,'#3d2e22',x+1,5,12,14);box(c,'#57432f',x+1,5,12,1);box(c,'#2b2018',x+3,8,8,8);box(c,'#4a3828',x+5,10,4,4);box(c,'#2b2018',x+6,11,2,2);}
  return;
 }
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
  // Only a strip of night shows past the tower's outer wall; the tower itself covers the rest.
  // Night behind everything: over the parapet and past the outer wall.
  box(c,'#141c2c',0,0,w,h);box(c,'#1c2940',0,Math.round(h*.5),w,Math.round(h*.5));
  const x=OUT-cx;if(x>=w)return;
  // The house next door reaches a third of the way up the tower: its gable wall, its eaves and a lit window on the stair.
  const roof=1050-cy;if(roof<h){box(c,'#1a222e',x,roof,w-x,h-roof);box(c,'#263345',x-3,roof-5,w-x+3,5);box(c,'#3b4c64',x-3,roof-5,w-x+3,1);box(c,'#111822',x,roof,w-x,2);
   for(let yy=roof+26;yy<h;yy+=58){box(c,'#0e151f',x+22,yy,12,18);box(c,yy%116<58?'#b07d40':'#1c2b3d',x+24,yy+2,8,14);box(c,'#0e151f',x+27,yy+2,1,14);box(c,'#2c3848',x+21,yy+18,14,1);}}
  for(let i=0;i<12;i++){const rx=x+((hash(i,1)*(w-x)-t*30)%(w-x)+(w-x))%(w-x),y=((hash(i,2)*h+t*250)%h+h)%h;box(c,'#b9c9d93d',rx,y,1,7);}
 },
 back,deck,exit,water,
 depth:p=>p.kind==='stone'&&p.h<=12?8:0,
 mover(c,p,x,y){
  // The pallet hangs from the hoist's block on one rope, which parts into two slings above the load.
  const mx=(L+R)/2,mid=Math.round(x+p.w/2),knot=y-26;stroke(c,'#8a7a5a',mx,HOIST_Y+20,mid,knot,1);
  box(c,'#262d33',mid-2,knot-1,5,4);stroke(c,'#6d6248',mid,knot+3,x+2,y-1,1);stroke(c,'#6d6248',mid,knot+3,x+p.w-3,y-1,1);
 },
};
