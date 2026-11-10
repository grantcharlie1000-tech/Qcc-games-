import {box,hash,lay,sprite,stroke,type C,type Work} from '../quarter-kit';

/** 02 · A Bell Above the Rain: the pieces of the bell tower's inside, seen in section.
 *
 * The section cuts the tower in front of the courier. The far wall is whole and
 * everything you stand on is carried by it or by the two cut side walls:
 *  - a timber floor is boards on joists that run back onto a wall plate, which
 *    lies along the far wall on stone corbels. The cut shows the joists end-on;
 *  - stone (stair treads, sills, corbels) is let into the far wall on corbels;
 *  - iron and single treads sit on brackets leaded into the far wall;
 *  - across the well, timber bears on the well's two trimmers.
 * A landing's own tile carries its support; the wall panels carry what is
 * built into the tower at fixed places (the dial, the vault's scars, the bell). */
export type Piece=(c:C,x:number,y:number,w:number,h:number)=>void;
/** A piece that moves: `t` is seconds, and 0 when motion is reduced. */
export type Moving=(c:C,x:number,y:number,w:number,h:number,t?:number)=>void;

// The tower, in world pixels (authored/level-02.ts).
const WEST=24,EAST=1176,WELL0=536,WELL1=672,GROUND=2400,WATER=2468;
/** Every timber floor line, and the ones the well is trimmed through. */
const LINES=[2208,2016,1824,1632,1440,1248,1056,864,672,480,304] as const;
const WELL_LINES:readonly number[]=[2208,2016,1824,1632,1056,864,672,480];
/** Floors that still run into a side wall: their bearer's tail is in its pocket. */
const BEARS_WEST:readonly number[]=[2208,1824,1440],BEARS_EAST:readonly number[]=[2016,1632,1248,864,304];
/** The clock dial: an iron wheel in a ring of stone, centred on the floor line of the room behind it. */
const DIAL_X=580,DIAL_Y=1445,DIAL_LINE=1440;
/** The tie bar's rod, and where the frame's lower rail hangs the hoist block over the well. */
const TIE=608;
export const HOIST_TOP=436;
/** Openings the landings ask for: a slit over each sill, a louvred belfry opening behind each louvre board. */
export const openings:readonly (readonly [number,number,number,number])[]=[
 [1140,1876,16,76],[44,1684,16,76],[1060,164,16,76],[580,104,48,184],[676,104,48,184],[772,104,48,184],
];
/** The leaf of the door at the foot, in the far wall by the west corner. */
export const doorAt:readonly [number,number,number,number]=[48,2330,44,70];
const AUMBRIES:readonly (readonly [number,number,number])[]=[[216,2144,56],[904,1376,56]];

// Timber, rotten timber, iron, the far wall's dressed stone, and the stone you stand on.
const TK='#15100c',T0='#2c2119',T1='#3d2e22',T2='#57432f',T3='#6b523a',T4='#8d704f',T5='#b3946a',TD='#231a14';
const R0='#2c2620',R1='#57493a',R2='#6a5b48',R3='#8a7a62',MOSS='#4a5a44',MOSS2='#5d6b4f';
const I0='#10161d',I1='#1a1f25',I2='#262d33',I3='#39424a',I4='#4a545b',I5='#5d6a6e',I6='#7f8c90',RUST='#5a3a2a',LEAD='#8a949b';
const S0='#141b23',S1='#252f3b',S2='#2c3743',S3='#3a4653',S4='#4d5a67';
const N0='#1a2028',N1='#333c45',N2='#3f4953',N3='#454f59',N4='#57626d',N5='#6b757d',N6='#8a949b';
const SHADE='#05080c8c',SHADE2='#05080c40',SKY='#31425d',SKY_LIT='#42587a',BRASS='#8c7648',BRASS2='#b79a5c';

const BIG:Work={course:24,short:34,long:66,mortar:'#131a22',stones:['#1b242e','#1d2731','#202a35','#1a232d'],lip:'#27323e',shade:'#161d26',chip:'#2b3643'};
const COURSED:Work={course:16,short:22,long:46,mortar:'#19212b',stones:['#1d2631','#1f2934','#222c37','#1c2530'],lip:'#27323e',shade:'#18202a',chip:'#2b3643'};
const BRICK:Work={course:8,short:12,long:18,mortar:'#15181f',stones:['#221e25','#252027','#28222a','#201c23'],lip:'#2f282e',shade:'#1c181e',chip:'#342c32'};
const CUT:Work={course:14,short:10,long:30,mortar:'#1d252e',stones:['#39444f','#3e4954','#434e59','#353f49'],lip:'#56626d',shade:'#2c353f',chip:'#606c77'};
const FOOT:Work={course:16,short:26,long:52,mortar:'#0f141a',stones:['#171d25','#191f28','#1b222b'],lip:'#1f2731',shade:'#141a21',chip:'#222b36'};
/** The two piers that flank the well up the far wall, in the same stone or brick as their storey but standing proud of it. */
const PIER_BIG:Work={...BIG,short:28,long:28,stones:['#1f2933','#222c37','#24303b'],lip:'#2c3844'};
const PIER_STONE:Work={...COURSED,short:11,long:19,stones:['#222c37','#24303b','#27323e'],lip:'#2e3a47'};
const PIER_BRICK:Work={...BRICK,short:9,long:14,stones:['#28222a','#2b242c','#2e262f'],lip:'#372e35'};
const PIER=28;
const LINING:Work={course:12,short:16,long:34,mortar:'#0b0f14',stones:['#131920','#151b23','#161d26'],lip:'#1b232c',shade:'#10151b',chip:'#1e2731'};

function disc(c:C,color:string,cx:number,cy:number,r:number){for(let y=-r;y<=r;y++){const o=Math.round(Math.sqrt(r*r-y*y));box(c,color,cx-o,cy+y,o*2+1,1);}}
function ring(c:C,color:string,cx:number,cy:number,r0:number,r1:number){
 for(let y=-r1;y<=r1;y++){
  const o=Math.round(Math.sqrt(r1*r1-y*y));
  if(Math.abs(y)>=r0){box(c,color,cx-o,cy+y,o*2+1,1);continue;}
  const i=Math.round(Math.sqrt(r0*r0-y*y));box(c,color,cx-o,cy+y,o-i+1,1);box(c,color,cx+i,cy+y,o-i+1,1);
 }
}
/** A stone built out of the far wall, seen from the front. */
function stone(c:C,x:number,y:number,w:number,h:number,face=S2,lip=S4){box(c,S0,x-1,y,w+2,h+1);box(c,face,x,y,w,h);box(c,lip,x,y,w,1);}
/** Oak boards along the cut edge of a floor. */
function planks(c:C,x0:number,x1:number,y:number,s:number){
 box(c,TK,x0,y,x1-x0,7);box(c,T3,x0,y,x1-x0,6);box(c,T5,x0,y,x1-x0,2);box(c,T4,x0,y+2,x1-x0,1);
 for(let x=x0+12+Math.floor(hash(s,1,5)*18),i=0;x<x1-8;x+=28+Math.floor(hash(i++,s,6)*36)){box(c,T1,x,y,1,6);box(c,T0,x-3,y+3,1,1);box(c,T0,x+3,y+3,1,1);}
}
/** A stretch of timber floor in section, 28 deep: boards, the joists end-on, the wall plate behind them on its corbels. */
function stub(c:C,w:number,y:number,s:number){
 box(c,'#07090c',0,y+6,w,8);
 box(c,TK,0,y+13,w,9);box(c,TD,0,y+14,w,7);box(c,T0,0,y+14,w,1);
 for(let x=5+Math.floor(hash(s,2,2)*9);x<w-8;x+=17)box(c,TK,x,y+16+x%3,6,1);
 box(c,'#0a0d11',0,y+22,w,6);
 const bays=Math.max(1,Math.round((w-10)/26));
 for(let i=0;i<=bays;i++){
  const end=i===0||i===bays,x=Math.round(i*(w-10)/bays)+(end?0:1),wide=end?10:8;
  if(end||i%2===0)stone(c,x,y+22,wide,5,S2,S4);
  box(c,TK,x,y+6,wide,16);box(c,T1,x+1,y+6,wide-2,15);box(c,T2,x+1,y+7,wide-2,1);
  box(c,T0,x+2,y+10,wide-4,9);box(c,T1,x+3,y+12,wide-6,5);if(end)box(c,T2,x+4,y+13,2,2);
 }
 planks(c,0,w,y,s);
}
const under=(c:C,x:number,y:number,w:number)=>{box(c,SHADE,x,y,w,3);box(c,SHADE2,x,y+3,w,3);};
/** A toothed brass or iron wheel. */
function wheel(c:C,cx:number,cy:number,r:number,body:string,light:string){
 for(let i=0;i<r*2;i++){const a=i*Math.PI/r;box(c,body,Math.round(cx+Math.cos(a)*(r+1))-1,Math.round(cy+Math.sin(a)*(r+1))-1,2,2);}
 ring(c,body,cx,cy,Math.max(1,r-3),r);box(c,body,cx,cy-r,1,r*2);box(c,body,cx-r,cy,r*2,1);box(c,light,cx-1,cy-1,3,3);box(c,light,cx-Math.round(r*.7),cy-Math.round(r*.7),2,1);
}

type Paint=(c:C,w:number,h:number,s:number)=>void;
const PAINT:Record<string,Paint>={
 // Worn flags, cut by the section, bedded on two courses of footing.
 ground(c,w,h,s){
  box(c,N0,0,0,w,h);
  for(let r=0;r<2;r++){
   const y=10+r*9;let x=-Math.floor(hash(r,s,4)*20);
   for(let i=0;x<w;i++){const len=24+Math.floor(hash(i,r,s)*28),x0=Math.max(0,x),x1=Math.min(w,x+len);if(x1-x0>2){box(c,r?'#232b34':'#29323c',x0+1,y,x1-x0-1,8);box(c,r?'#2b343e':'#333d48',x0+1,y,x1-x0-1,1);}x+=len;}
  }
  for(let x=0,i=0;x<w;i++){
   const v=hash(i,s,3),wide=Math.min(w-x,20+Math.floor(v*24)),a=x+(i?1:0),b=x+wide-a;
   box(c,v>.6?N3:v>.3?'#414b55':N2,a,0,b,9);box(c,N6,a,0,b,2);box(c,N5,a,2,b,1);box(c,N1,a,8,b,1);
   // A flag worn hollow where everyone has walked, or cracked across.
   if(v>.72&&wide>18)box(c,N5,a+4,1,b-8,1);else if(v<.12&&wide>14)box(c,N1,a+Math.floor(wide/2),2,1,6);
   x+=wide;
  }
 },
 // The kerb round the pit's mouth: a coping stone, cramped at its joint, on two courses of wall.
 wellhead(c,w,h,s){
  box(c,N0,0,9,w,h-9);
  const half=Math.round(w*(.4+hash(s,1,1)*.2)),third=Math.round(w*.3);
  for(const [x0,x1,y0,y1] of [[0,half,9,24],[half,w,9,24],[0,third,24,h],[third,third+Math.round(w*.42),24,h],[third+Math.round(w*.42),w,24,h]] as const){
   box(c,hash(x0,y0,s)>.5?N2:'#3a444e',x0+1,y0+1,x1-x0-1,y1-y0-1);box(c,N4,x0+1,y0+1,x1-x0-1,1);box(c,N1,x0+1,y1-1,x1-x0-1,1);
  }
  box(c,'#0b1a2255',w-12,10,12,h-10);box(c,'#0b1a2255',w-5,10,5,h-10);
  box(c,N0,-2,0,w+4,10);box(c,N3,-2,1,w+4,8);box(c,N6,-1,0,w+2,2);box(c,N5,-2,2,w+4,1);box(c,N1,-2,8,w+4,1);
  const j=Math.round(w*.55);box(c,N1,j,2,1,6);box(c,I2,j-4,4,9,2);box(c,I5,j-4,4,9,1);
  // An iron ring for the bucket rope, let into the kerb's face.
  box(c,I1,13,14,6,6);box(c,N2,15,16,2,3);box(c,I5,14,13,4,1);
 },
 // A stone tread cantilevered from the far wall: let into a socket, its tail pinned under two corbels.
 step(c,w,h,s){
  box(c,'#0b0f14',-3,-1,3,12);box(c,'#0b0f14',w,-1,3,12);
  box(c,SHADE,0,10,w,6);box(c,SHADE2,0,16,w,8);
  for(const x of [Math.round(w*.2)-6,Math.round(w*.8)-6]){stone(c,x,10,12,6,S3,S4);stone(c,x+2,16,8,5,S2,S3);}
  box(c,N0,0,0,w,11);box(c,N3,0,1,w,9);box(c,N6,0,0,w,2);box(c,N5,0,2,w,1);box(c,N1,0,9,w,1);
  // Worn down in the middle by two hundred years of ringers, tooled on the riser, one corner spalled.
  box(c,N5,Math.round(w*.32),1,Math.round(w*.36),1);
  for(let x=5+Math.floor(hash(s,3,3)*5);x<w-4;x+=7+Math.floor(hash(x,s,4)*6))box(c,N2,x,4+Math.floor(hash(x,s,5)*2),1,3);
  if(hash(s,6,6)>.5){box(c,N1,w-5,7,5,2);box(c,N0,w-2,8,2,2);}else{box(c,N1,0,7,4,2);box(c,N0,0,8,2,2);}
 },
 // Oak boards on joists. The cut shows the joists end-on; the ends are broken back to the last joist.
 floor(c,w,h,s){
  stub(c,w,0,s);
  const a=1+Math.floor(hash(s,3,1)*3),b=1+Math.floor(hash(s,3,2)*3);
  c.clearRect(0,0,a,3);c.clearRect(w-b,0,b,3);box(c,T4,0,3,a,1);box(c,T4,w-b,3,b,1);
  under(c,0,28,w);
 },
 // A ringer's box: a framed and panelled stand, on a stub of the ringing floor.
 box(c,w,h,s){
  const H=h-28;stub(c,w,H,s);under(c,0,h,w);
  box(c,TK,1,3,w-2,H-3);
  // Upright boards nailed to a frame of two ledges, corner posts, a brace: carpenter's work, not joinery.
  for(let x=2,i=0;x<w-2;x+=7,i++){const wide=Math.min(6,w-2-x);box(c,hash(i,s,4)>.5?T2:'#4d3a2a',x,4,wide,H-4);box(c,T1,x+wide,4,1,H-4);if(hash(i,s,5)>.6)box(c,T1,x+2,8+Math.floor(hash(i,s,6)*(H-16)),1,4);}
  for(const x of [2,w-7]){box(c,T3,x,4,5,H-4);box(c,T4,x,4,1,H-4);box(c,T1,x+4,4,1,H-4);}
  for(const ly of [7,H-9]){box(c,TK,7,ly-1,w-14,6);box(c,T3,7,ly,w-14,4);box(c,T4,7,ly,w-14,1);for(let x=10;x<w-10;x+=7)box(c,I2,x,ly+2,1,1);}
  stroke(c,T3,9,H-11,w-11,12,2);stroke(c,T1,9,H-10,w-11,13,1);
  // The bell's number on a brass plate, and the foot of it scuffed by boots.
  const mid=Math.round(w/2);box(c,BRASS,mid-3,8,5,3);box(c,BRASS2,mid-3,8,5,1);
  box(c,TK,1,H-2,w-2,2);box(c,T0,2,H-2,w-4,1);
  box(c,TK,-2,0,w+4,5);box(c,T3,-1,0,w+2,4);box(c,T5,-1,0,w+2,2);box(c,T4,-1,2,w+2,1);
  box(c,T4,Math.round(w*.3),0,Math.round(w*.4),1);
 },
 // An oak tread on two iron brackets leaded into the far wall.
 tread(c,w,h,s){
  for(const [x,d] of [[11,1],[w-12,-1]] as const){
   box(c,I0,x-2,8,5,18);box(c,I3,x-1,8,3,17);box(c,I5,x-1,8,1,17);
   box(c,LEAD,x-2,12,5,2);box(c,LEAD,x-2,21,5,2);box(c,N4,x-2,13,5,1);box(c,N4,x-2,22,5,1);
   stroke(c,I2,x+d,23,x+d*12,9,2);stroke(c,I4,x+d,22,x+d*12,8,1);
  }
  box(c,I0,5,8,w-10,3);box(c,I3,6,8,w-12,2);
  box(c,TK,-1,0,w+2,9);box(c,T3,0,0,w,8);box(c,T5,0,0,w,2);box(c,T4,0,2,w,1);
  box(c,T2,0,3,2,5);box(c,T2,w-2,3,2,5);
  for(let x=7+s%5;x<w-9;x+=13+Math.floor(hash(x,s,1)*8))box(c,T1,x,4+Math.floor(hash(x,s,2)*2),4+Math.floor(hash(x,s,3)*5),1);
  for(const x of [11,w-12]){box(c,I2,x-1,3,3,6);box(c,I5,x-1,3,3,1);}
 },
 // A rotten length of joist, the boards gone off it, still lying on two of the wall's corbels.
 joist(c,w,h,s){
  box(c,SHADE,2,12,w-4,4);box(c,SHADE2,2,16,w-4,5);
  for(const x of [6,w-18]){stone(c,x,12,12,5,S3,S4);stone(c,x+2,17,8,4,S2,S3);}
  box(c,TK,0,0,w,12);box(c,R1,0,0,w,11);box(c,R3,0,0,w,2);box(c,R2,0,2,w,2);box(c,R0,0,8,w,3);
  // Splintered at both ends, the board nails still standing in it, the notches where joists crossed it.
  for(let y=1;y<12;y++){const a=Math.floor(hash(y,s,1)*4),b=Math.floor(hash(y,s,2)*4);c.clearRect(0,y,a,1);c.clearRect(w-b,y,b,1);}
  for(let x=9+s%4;x<w-8;x+=11)box(c,R0,x,3+Math.floor(hash(x,s,3)*4),2+Math.floor(hash(x,s,4)*7),1);
  box(c,TK,Math.round(w*.42),5,6,4);box(c,R0,Math.round(w*.42)+1,6,4,2);
  box(c,MOSS,3,0,8,1);box(c,MOSS2,5,0,3,1);box(c,MOSS,w-16,9,9,2);
  for(const x of [Math.round(w*.3),Math.round(w*.7)])box(c,I3,x,-2,1,3);
 },
 // The rotten beam across the well, hung in an iron stirrup off each trimmer.
 beam(c,w,h,s){
  box(c,TK,0,0,w,12);box(c,R1,0,0,w,11);box(c,R3,0,0,w,2);box(c,R2,0,2,w,2);box(c,R0,0,8,w,3);
  // Eaten away underneath at mid-span, shaken along the grain, a bracket fungus on the wet side.
  for(let x=Math.round(w*.28);x<w*.74;x+=2){const k=Math.sin((x/w-.28)/.46*Math.PI),d=Math.round(k*(2+hash(x,s,3)*3));if(d>0){c.clearRect(x,12-d,2,d);box(c,TK,x,11-d,2,1);}}
  for(let x=10;x<w-20;x+=23+Math.floor(hash(x,s,5)*14))box(c,R0,x,3+Math.floor(hash(x,s,6)*3),9+Math.floor(hash(x,s,7)*14),1);
  box(c,'#9a8f76',Math.round(w*.2),11,7,2);box(c,'#b5aa8d',Math.round(w*.2),11,7,1);box(c,'#9a8f76',Math.round(w*.2)+2,13,4,1);
  box(c,MOSS,Math.round(w*.62),0,13,1);box(c,MOSS2,Math.round(w*.62)+3,0,5,1);
  for(const x of [-4,w-3]){box(c,I0,x,-3,7,17);box(c,I3,x+1,-2,5,15);box(c,I5,x+1,-2,5,1);box(c,I5,x+1,-2,1,15);box(c,I6,x+3,3,1,1);box(c,I6,x+3,8,1,1);}
 },
 // A window's sill: a weathered slab bedded in the wall on its apron stone and two brackets.
 sill(c,w,h,s){
  box(c,SHADE,2,8,w-4,5);box(c,SHADE2,2,13,w-4,7);
  stone(c,4,7,w-8,5,S2,S3);
  for(const x of [7,w-15]){stone(c,x,12,8,5,S3,S4);box(c,S2,x+1,17,6,2);}
  box(c,N0,-2,0,w+4,8);box(c,N3,-2,1,w+4,6);box(c,N6,-2,0,w+4,2);box(c,N5,-2,2,w+4,1);box(c,N1,-1,6,w+2,1);
  // Rain has run off its nose for years: a green stain under the drip.
  box(c,'#3c5a5033',Math.round(w*.3),3,Math.round(w*.2),3);box(c,N4,6+s%9,4,5,1);
 },
 // A corbel: three courses of stone built out of the far wall, each oversailing the one under it.
 corbel(c,w,h,s){
  box(c,SHADE2,3,16,w-6,12);
  const rows=[[0,0,7,N3,N6],[4,7,9,N2,N4],[9,16,6,'#343d47','#434d58'],[13,22,5,'#2b333d','#39434e']] as const;
  for(const [inset,y,high,face,lip] of rows){
   const wide=w-inset*2;if(wide<4)continue;
   box(c,S0,inset,y,wide,high+1);box(c,face,inset,y,wide,high);box(c,lip,inset,y,wide,y?1:2);
   if(wide>20){const j=inset+Math.round(wide*(.4+hash(y,s,2)*.2));box(c,S0,j,y+(y?1:2),1,high-(y?1:2));}
  }
  box(c,N5,0,2,w,1);box(c,N1,1,6,w-2,1);
 },
 // Stones of the fallen rib vault heaped on a stub of floor: a boss or a web slab on top, voussoirs and rib lengths under it.
 rubble(c,w,h,s){
  const H=h-28;stub(c,w,H,s);under(c,0,h,w);
  // Thrown down, not laid: every stone lies where it fell, the lower ones in front, the heap spreading at its foot.
  const tones=['#39444f','#3e4954','#434e59','#353f49','#303a44'],count=Math.round(w*(H-8)/38);
  for(let i=0;i<count;i++){
   const k=i/count,cy=9+Math.round(k*(H-16))+Math.floor(hash(i,s,1)*5),spread=Math.round(k*4)-1;
   const sw=8+Math.floor(hash(i,s,2)*13),sh=6+Math.floor(hash(i,s,3)*7),sx=-spread+Math.floor(hash(i,s,4)*(w+spread*2-sw+1)),v=hash(i,s,5);
   const y1=Math.min(H,cy+sh),half=Math.round(sw/2),tilt=v>.66?1:v<.33?-1:0;
   box(c,'#10161d',sx-1,cy-1,sw+2,y1-cy+2);
   box(c,tones[Math.floor(v*tones.length)],sx,cy+(tilt>0?1:0),half,y1-cy-(tilt>0?1:0));box(c,tones[Math.floor(v*tones.length)],sx+half,cy+(tilt<0?1:0),sw-half,y1-cy-(tilt<0?1:0));
   box(c,'#5a6671',sx,cy+(tilt>0?1:0),half,1);box(c,'#5a6671',sx+half,cy+(tilt<0?1:0),sw-half-1,1);box(c,'#2c353f',sx,y1-1,sw,1);box(c,'#2c353f',sx+sw-1,cy+1,1,y1-cy-1);
   // Some are lengths of rib, with the roll moulding still on them.
   if(sw>14&&sh>7&&hash(i,s,6)>.5){box(c,'#6b7782',sx+2,cy+3,sw-4,1);box(c,'#2c353f',sx+2,cy+5,sw-4,1);}
  }
  // The top stone lies flat: you stand on its bed.
  box(c,N0,0,0,w,11);box(c,N3,0,1,w,9);box(c,N6,0,0,w,2);box(c,N5,0,2,w,1);box(c,N1,0,9,w,1);
  if(hash(s,9,9)>.5){box(c,N5,3,5,w-6,1);box(c,N1,3,7,w-6,1);}else{const m=Math.round(w/2);box(c,N1,m-7,3,14,5);box(c,N4,m-6,4,12,3);box(c,N1,m-2,4,4,3);}
  c.clearRect(0,7,2,4);c.clearRect(w-3,8,3,3);
  // What rolled off the heap lies on the boards.
  box(c,'#39444f',-3,H-4,5,4);box(c,'#56626d',-3,H-4,4,1);box(c,'#3e4954',w-1,H-3,4,3);box(c,'#56626d',w-1,H-3,3,1);
 },
 // The clock's movement in its glazed oak case, standing on a stub of the clock room floor.
 clockcase(c,w,h,s){
  const H=h-28;stub(c,w,H,s);under(c,0,h,w);
  box(c,TK,1,H-6,w-2,6);box(c,T2,2,H-6,w-4,5);box(c,T4,2,H-6,w-4,1);
  box(c,TK,3,4,w-6,H-10);box(c,T1,4,4,w-8,H-10);
  for(const x of [4,w-9]){box(c,T2,x,4,5,H-10);box(c,T4,x,4,1,H-10);}
  box(c,T2,9,5,w-18,3);box(c,T2,9,H-10,w-18,3);
  const gx=10,gy=9,gw=w-20,gh=H-20;
  box(c,TK,gx-1,gy-1,gw+2,gh+2);box(c,'#0c1014',gx,gy,gw,gh);
  // Two iron plates carry the train: the great wheel on its barrel, the second wheel, the escape wheel under its pallets.
  box(c,I3,gx+3,gy,2,gh);box(c,I3,gx+gw-5,gy,2,gh);box(c,I2,gx+3,gy+gh-3,gw-6,2);
  wheel(c,gx+14,gy+gh-11,8,'#6d5a36',BRASS2);wheel(c,gx+28,gy+9,5,BRASS,BRASS2);wheel(c,gx+gw-9,gy+gh-8,3,BRASS,BRASS2);
  box(c,I4,gx+gw-12,gy+3,7,1);box(c,I4,gx+gw-9,gy+3,1,5);
  box(c,'#6f8fb433',gx+1,gy+1,1,gh-2);stroke(c,'#6f8fb42e',gx+3,gy+12,gx+13,gy+2,1);
  box(c,BRASS,w-7,Math.round(H/2),2,3);
  box(c,TK,-1,0,w+2,5);box(c,T3,0,0,w,4);box(c,T5,0,0,w,2);box(c,T4,0,2,w,1);box(c,T1,1,4,w-2,1);
 },
 // An iron shelf: a pierced plate on two brackets leaded into the far wall.
 bracket(c,w,h,s){
  for(const [x,d] of [[9,1],[w-10,-1]] as const){
   box(c,I0,x-2,7,5,20);box(c,I3,x-1,7,3,19);box(c,I5,x-1,7,1,19);
   box(c,LEAD,x-2,10,5,2);box(c,LEAD,x-2,22,5,2);
   stroke(c,I2,x+d,25,x+d*15,8,2);stroke(c,I4,x+d,24,x+d*15,7,1);
   box(c,I2,x+d*3-1,24,3,3);box(c,'#4a2f2488',x-1,27,2,5);
  }
  box(c,I0,-1,0,w+2,8);box(c,I3,0,0,w,4);box(c,I6,0,0,w,1);box(c,I5,0,1,w,1);
  box(c,I2,0,4,w,3);for(let x=3;x<w-4;x+=6)box(c,I0,x,4,3,2);
  for(let x=2;x<w-2;x+=10)box(c,I6,x,2,1,1);
  box(c,RUST,Math.round(w*.4)+s%7,2,6,1);
 },
 // A foot-iron on the dial: a chequered plate held to the wheel's ring by two U-bolts.
 dial(c,w,h,s){
  for(const x of [6,w-12]){
   box(c,I0,x-1,4,8,16);box(c,I3,x,4,6,15);box(c,I5,x,4,1,15);box(c,I0,x+2,8,2,8);
   box(c,I6,x+1,5,4,2);box(c,I5,x+1,17,4,2);
  }
  box(c,I0,-1,0,w+2,6);box(c,I3,0,0,w,5);box(c,I6,0,0,w,1);box(c,I5,0,1,w,1);box(c,I1,0,4,w,1);
  for(let x=3;x<w-3;x+=6)box(c,I2,x,2,2,2);
  box(c,RUST,Math.round(w*.5)+s%5-3,3,5,1);
 },
 // A rung of the iron wall ladder: two flat stiles stood off the wall on leaded stays, a round bar and a toe bar between them.
 rung(c,w,h,s){
  const end=h+52;
  for(const x of [2,w-5]){
   for(const y of [0,32]){box(c,I0,x-3,y,9,8);box(c,I2,x-2,y+1,7,6);box(c,LEAD,x-1,y+2,5,2);box(c,N4,x-1,y+4,5,1);box(c,'#4a2f2499',x,y+8,2,10);}
   box(c,I0,x-1,-8,5,end+8);box(c,I3,x,-8,3,end+8);box(c,I5,x,-8,1,end+8);box(c,I6,x,-8,3,1);
   for(let y=14;y<end-4;y+=17)box(c,RUST,x+1,y+Math.floor(hash(x,y,s)*5),2,2);
  }
  box(c,I0,3,-1,w-6,7);box(c,I3,4,0,w-8,5);box(c,I6,4,0,w-8,1);box(c,I5,4,1,w-8,1);box(c,I1,4,4,w-8,1);
  box(c,I0,5,7,w-10,4);box(c,I3,5,8,w-10,2);box(c,I4,5,8,w-10,1);
  box(c,RUST,Math.round(w*.3),2,7,1);
 },
 // A rung of the timber ladder: pole stiles held to the wall by an iron holdfast, a squared rung wedged through them and lashed.
 ladder(c,w,h,s){
  const end=h+52;
  for(const x of [1,w-7]){
   box(c,TK,x-1,-8,8,end+8);box(c,T2,x,-8,6,end+8);box(c,T4,x,-8,2,end+8);box(c,T0,x+5,-8,1,end+8);
   for(let y=12;y<end-8;y+=21)box(c,T0,x+2,y+Math.floor(hash(x,y,s)*8),2,3);
   box(c,I0,x-3,28,12,4);box(c,I3,x-2,29,10,2);box(c,I6,x-2,29,10,1);box(c,I0,x-3,32,2,4);box(c,I0,x+7,32,2,4);
  }
  box(c,TK,-3,0,w+6,8);box(c,T3,-2,0,w+4,7);box(c,T5,-2,0,w+4,2);box(c,T4,-2,2,w+4,1);box(c,T1,-2,6,w+4,1);
  for(const x of [1,w-7]){stroke(c,'#a08f6a',x,-3,x+5,9,1);stroke(c,'#a08f6a',x+5,-3,x,9,1);box(c,'#7d7052',x+2,2,2,2);}
 },
 // A tread of the ringers' old stair on what is left of its string, coach-bolted to the wall and gone soft.
 stair(c,w,h,s){
  box(c,SHADE2,3,17,w-6,6);
  box(c,TK,3,6,w-6,11);box(c,'#3a3229',4,6,w-8,10);box(c,'#4a4136',4,7,w-8,1);
  // The string's lower edge has rotted to a fringe; two rough brackets still wedge the tread.
  for(let x=4;x<w-4;x+=2){const d=Math.floor(hash(x,s,1)*4);c.clearRect(x,17-d,2,d);box(c,TK,x,16-d,2,1);}
  for(const [x,d] of [[5,1],[w-6,-1]] as const)for(let i=0;i<7;i++)box(c,R1,x+d*i-(d<0?1:0),7,1,7-i);
  for(const x of [15,w-18]){box(c,I0,x-1,8,5,5);box(c,I4,x,9,3,3);box(c,I6,x,9,1,1);box(c,'#4a2f2499',x+1,13,1,7);}
  box(c,TK,-2,0,w+4,7);box(c,R1,-1,0,w+2,6);box(c,R3,-1,0,w+2,2);box(c,R2,-1,2,w+2,1);
  for(let x=5+s%6;x<w-8;x+=10+Math.floor(hash(x,s,2)*7))box(c,R0,x,3+Math.floor(hash(x,s,3)*2),3+Math.floor(hash(x,s,4)*8),1);
  box(c,MOSS,Math.round(w*.55),0,10,1);box(c,MOSS2,Math.round(w*.55)+2,0,4,1);box(c,MOSS,4,4,6,1);
  c.clearRect(w-1,3,2,3);
 },
 // The bell hoist's pallet: new oak boards on two bearers, an eye bolt at each end for the slings.
 pallet(c,w,h,s){
  box(c,TK,-1,0,w+2,12);box(c,T3,0,0,w,7);box(c,T5,0,0,w,2);box(c,T4,0,2,w,1);
  for(let x=11;x<w-4;x+=12)box(c,T1,x,0,1,7);
  box(c,T0,0,7,w,5);for(const x of [5,w-17]){box(c,TK,x,7,12,5);box(c,T1,x+1,7,10,4);box(c,T2,x+1,7,10,1);}
  for(const x of [1,w-4]){box(c,I2,x,-3,3,5);box(c,I6,x,-3,3,1);box(c,I0,x+1,-2,1,2);}
 },
 // The tie bar: flat wrought iron from wall to wall, forged in lengths that lap and are hooped together, drawn tight at a turnbuckle.
 tiebar(c,w,h,s){
  const bar=(x0:number,x1:number,y:number)=>{box(c,I0,x0,y+4,x1-x0,1);box(c,I2,x0,y+1,x1-x0,3);box(c,y?I4:I6,x0,y,x1-x0,1);};
  bar(-4,w+4,0);
  // Hammer marks and rust along it: no two feet of a forged bar are the same.
  for(let x=9+s%9;x<w-9;x+=13+Math.floor(hash(x,s,1)*22)){const v=hash(x,s,2);if(v>.55)box(c,RUST,x,1+Math.floor(v*3)%3,3+Math.floor(v*9),1);else if(v<.3)box(c,I3,x,2,2+Math.floor(v*20),1);else box(c,I5,x,0,3,1);}
  for(const k of [.14,.34,.7,.9]){
   // A scarf: one length laps under the next for a foot and a half, with a hoop driven on at each end.
   const x=Math.round(w*k);bar(x,x+26,4);box(c,I0,x-1,4,1,5);box(c,I0,x+26,0,1,9);
   for(const hx of [x+2,x+20]){box(c,I0,hx-1,-2,6,13);box(c,I3,hx,-1,4,11);box(c,I6,hx,-1,4,1);box(c,I5,hx,0,1,9);}
  }
  // The turnbuckle: an open forged frame, the two screwed ends meeting inside it.
  const m=Math.round(w/2)-52;
  box(c,I0,m-1,-1,42,11);box(c,I2,m,0,40,9);box(c,I6,m,0,40,1);box(c,I4,m,1,40,1);box(c,I0,m,8,40,1);
  box(c,'#0b0f14',m+4,3,32,3);for(let x=m+4;x<m+17;x+=2)box(c,I4,x,3,1,3);for(let x=m+23;x<m+36;x+=2)box(c,I4,x,3,1,3);
  for(const x of [m-6,m+41]){box(c,I0,x-1,-2,7,10);box(c,I3,x,-1,5,8);box(c,I6,x,-1,5,1);}
  // A collar where the bar goes into each wall; the wall carries it on through to its anchor plate.
  for(const x of [-4,w]){box(c,I0,x,-5,4,16);box(c,I3,x,-4,4,14);box(c,I6,x,-4,4,1);box(c,I5,x+(x<0?3:0),-4,1,14);}
 },
 // A rail of the iron bell frame, cleated down onto two girders that run back into the far wall on padstones.
 frame(c,w,h,s){
  for(const x of [0,w-14]){
   box(c,SHADE,x-1,12,16,16);stone(c,x,28,14,5,S3,S4);
   box(c,I0,x,12,14,4);box(c,I3,x+1,12,12,3);box(c,I5,x+1,12,12,1);
   box(c,I0,x+4,15,6,10);box(c,I2,x+5,15,4,10);box(c,I4,x+5,15,1,10);
   box(c,I0,x,24,14,4);box(c,I3,x+1,24,12,3);box(c,I5,x+1,24,12,1);
  }
  box(c,I0,-1,0,w+2,12);box(c,I3,0,0,w,4);box(c,I6,0,0,w,1);box(c,I5,0,1,w,1);
  box(c,I2,0,4,w,5);for(let x=19;x<w-16;x+=12)box(c,I4,x,6,2,2);
  box(c,I3,0,9,w,3);box(c,I1,0,11,w,1);
  for(const x of [0,w-14]){box(c,I3,x,3,14,7);box(c,I5,x,3,14,1);for(const dx of [3,9])for(const dy of [5,8])box(c,I6,x+dx,dy,1,1);}
  box(c,RUST,Math.round(w*.45)+s%9,5,8,1);
 },
 // A louvre board, housed at each end in the stiles of its belfry opening and wet with the rain.
 louvre(c,w,h,s){
  for(const x of [-4,w]){box(c,TK,x,-8,4,h+16);box(c,T1,x+(x<0?0:1),-8,3,h+16);box(c,T2,x<0?x:x+1,-8,1,h+16);}
  box(c,TK,-2,0,w+4,9);box(c,T3,-1,0,w+2,8);box(c,T5,-1,0,w+2,2);box(c,T4,-1,2,w+2,1);box(c,T2,-1,5,w+2,2);box(c,T1,-1,7,w+2,1);
  for(let x=4+s%5;x<w-6;x+=9+Math.floor(hash(x,s,1)*6))box(c,'#9fb7c8',x,0,2+Math.floor(hash(x,s,2)*3),1);
  box(c,'#6f8fb455',Math.round(w*.6),8,1,3);
 },
 // The gallery floor: stone slabs carried out from the far wall on a table of corbels.
 gallery(c,w,h,s){
  box(c,'#0a0d11',0,12,w,16);
  for(let x=6;x<w-10;x+=26){stone(c,x,12,10,9,N2,N4);stone(c,x+1,21,8,4,'#333c45','#414b55');box(c,S1,x+2,26,6,2);}
  box(c,N0,0,0,w,13);
  for(let x=0,i=0;x<w;i++){
   const v=hash(i,s,3),wide=Math.min(w-x,34+Math.floor(v*32)),a=x+(i?1:0),b=x+wide-a;
   box(c,v>.5?N3:N2,a,0,b,10);box(c,N6,a,0,b,2);box(c,N5,a,2,b,1);
   if(v>.75)box(c,N5,a+6,1,b-12,1);
   x+=wide;
  }
  box(c,N1,0,10,w,1);box(c,'#2a323b',0,11,w,2);box(c,N4,0,11,w,1);
  under(c,0,28,w);
 },
 // The shelf of an aumbry: a thin slab on a chamfered stop, between the feet of the recess's jambs.
 aumbry(c,w,h,s){
  for(const x of [0,w-6]){box(c,S0,x,-8,6,8);box(c,x?S2:S3,x+1,-8,4,8);}
  box(c,SHADE,3,7,w-6,5);box(c,SHADE2,3,12,w-6,5);
  stone(c,5,6,w-10,5,S2,S3);stone(c,10,11,w-20,4,S1,S2);
  box(c,N0,0,0,w,7);box(c,N2,0,1,w,5);box(c,N6,1,0,w-2,2);box(c,N5,0,2,w,1);box(c,N1,0,5,w,1);
  box(c,N4,8+s%11,3,6,1);
 },
};
/** One painter per platform tag. (x,y,w,h) is the landing's collision box; the tile is painted once
 * as fn(c,0,0,w,h) on a canvas of (w+8, h+8+depth[tag]) translated by (4,8). Passing the landing's
 * world x,y instead (with the canvas translated back by it) only changes the seed, so two landings
 * of one size need not be twins. */
export const pieces:Record<string,Piece>=Object.fromEntries(Object.entries(PAINT).map(([tag,paint])=>[tag,((c,x,y,w,h)=>{
 c.save();c.translate(Math.round(x),Math.round(y));paint(c,Math.round(w),Math.round(h),(w*31+h*17+x*7+y*13)|0);c.restore();
}) as Piece]));
/** Extra pixels below the landing's box that the piece paints (corbel, bracket, shadow on the wall). */
export const depth:Record<string,number>={
 ground:0,wellhead:0,step:8,floor:6,box:6,tread:16,joist:10,beam:4,sill:8,corbel:12,rubble:6,clockcase:6,bracket:20,dial:8,
 rung:52,ladder:52,stair:12,pallet:0,tiebar:4,frame:22,louvre:8,gallery:6,aumbry:6,
};

/** What the far wall is built of, by the floor a stretch stands on: ashlar at the foot, coursed stone, brick, and stone again for the belfry. */
const workAt=(foot:number):Work=>foot>GROUND?FOOT:foot>2208?BIG:foot>1632?COURSED:foot>480?BRICK:COURSED;

/** The clock dial from behind: milk glass in iron cames, the wheel's two rings and eight arms, a ring of dressed stone round it. */
const dialArt=()=>sprite('l2/dial',400,400,c=>{
 const img=c.createImageData(400,400),d=img.data,glass=[[58,77,104],[63,83,112],[53,71,95],[66,88,120],[49,66,90]];
 for(let py=0;py<400;py++)for(let px=0;px<400;px++){
  const dx=px-199.5,dy=py-199.5,r=Math.hypot(dx,dy);if(r>196)continue;
  const turn=(Math.atan2(dy,dx)+Math.PI*2.5)%(Math.PI*2);let col:number[];
  if(r>180){
   // Voussoirs: forty stones, jointed radially, a lit arris on the inside.
   const at=turn/(Math.PI*2)*40,seg=Math.floor(at),f=at-seg;
   col=f<.07||r>194?[20,27,35]:r<182?[77,90,103]:hash(seg,3,1)>.5?[44,55,67]:[39,49,61];
  }else{
   const at=turn/(Math.PI/8),sect=Math.floor(at),f=at-sect,inner=r<107,pane=inner?(sect>>1)+100:sect,v=hash(pane,17,3);
   const g=glass[Math.floor(v*glass.length)],lift=dy<-70?9:dy<30?0:-9;col=[g[0]+lift,g[1]+lift,g[2]+lift];
   // Two panes are out and show the night; one was mended with boards. Grime lies along every came.
   if(pane===5||pane===103)col=[24,34,52];else if(pane===11)col=((px+py)>>2)%5?[61,46,34]:[35,26,20];
   const came=Math.min(f,1-f)*r*Math.PI/8;
   if((!inner||sect%2===0||f>.5)&&came<2.5||Math.abs(r-107)<6||r>170)col=[col[0]-13,col[1]-14,col[2]-15];
  }
  const i=(py*400+px)*4;d[i]=col[0];d[i+1]=col[1];d[i+2]=col[2];d[i+3]=255;
 }
 c.putImageData(img,0,0);
 // Cames between the arms, then the wheel itself.
 for(let i=0;i<16;i++)if(i%2){const a=i*Math.PI/8;stroke(c,'#1a2230',200+Math.cos(a)*110,200+Math.sin(a)*110,200+Math.cos(a)*170,200+Math.sin(a)*170,1);}
 for(let i=0;i<8;i++){const a=i*Math.PI/4,sx=Math.cos(a),sy=Math.sin(a);stroke(c,'#0c1116',199+sx*10,199+sy*10,199+sx*172,199+sy*172,3);stroke(c,I2,200+sx*14,199+sy*14,200+sx*170,199+sy*170,1);}
 ring(c,'#0c1116',200,200,170,177);ring(c,I2,200,200,176,177);ring(c,'#0c1116',200,200,104,109);ring(c,I2,200,200,108,109);
 for(let i=0;i<8;i++){const a=i*Math.PI/4;for(const r of [106,173]){box(c,I4,Math.round(200+Math.cos(a)*r)-1,Math.round(200+Math.sin(a)*r)-1,3,3);}}
 // The motion work on the hub: a plate, the hour wheel, the arbor the hands hang on.
 disc(c,'#0c1116',200,200,15);disc(c,I2,200,200,12);wheel(c,200,200,7,'#6d5a36',BRASS2);
});
/** A bronze bell under its headstock, strapped up to the frame's rail above it. */
function bell(c:C,x:number,y:number,w:number,h:number){
 const m=x+Math.round(w/2);
 for(const sx of [x+8,x+w-11]){box(c,I0,sx-1,y-4,5,16);box(c,I3,sx,y-4,3,15);box(c,I5,sx,y-4,1,15);}
 box(c,TK,x,y+2,w,11);box(c,T1,x+1,y+3,w-2,9);box(c,T2,x+1,y+3,w-2,1);box(c,T0,x+1,y+9,w-2,3);
 box(c,I1,m-4,y+13,8,5);
 for(let i=0;i<h;i++){
  const p=i/h,half=Math.round(w*(.2+.16*p+.12*p*p*p)+(p>.86?(p-.86)*w*.8:0));
  box(c,'#4f422a',m-half,y+18+i,half*2,1);box(c,'#75633d',m-half+2,y+18+i,Math.max(1,Math.round(half*.5)),1);box(c,'#96804e',m-half+3,y+18+i,Math.max(1,Math.round(half*.16)),1);box(c,'#352c1c',m+half-3,y+18+i,3,1);
 }
 box(c,'#352c1c',m-Math.round(w*.5),y+18+h-2,Math.round(w),2);box(c,'#8c7648',m-Math.round(w*.5)+2,y+18+h-2,Math.round(w*.35),1);
 box(c,'#2b2418',m-2,y+18+h,4,4);
 for(const dy of [Math.round(h*.3),Math.round(h*.36)])box(c,'#352c1c',m-Math.round(w*.26),y+18+dy,Math.round(w*.52),1);
}
/** What is built into the far wall at fixed places, drawn into whichever panels it falls in. */
function built(c:C,x:number,y:number,w:number,h:number){
 const hits=(a:number,b:number,ww:number,hh:number)=>a<x+w&&a+ww>x&&b<y+h&&b+hh>y;
 // Aumbries: a recess under its own lintel; the shelf is the landing.
 for(const [ax,ay,aw] of AUMBRIES)if(hits(ax-6,ay-54,aw+12,54)){
  box(c,'#080b10',ax+5,ay-40,aw-10,40);box(c,'#0d1218',ax+9,ay-36,aw-14,36);box(c,'#05070a',ax+5,ay-40,aw-10,4);
  for(let r=0;r<3;r++){const b=ay-r*14,long=r%2===0;stone(c,long?ax-4:ax,b-13,long?10:6,13,S2,S3);stone(c,ax+aw-6,b-13,long?6:10,13,S1,S2);}
  stone(c,ax-6,ay-52,aw+12,10,S2,S4);box(c,S0,ax+Math.round(aw/2),ay-51,1,9);
 }
 // The fallen vault: where its wall ribs were torn out of the wall, and the springers that stayed.
 if(hits(WEST,1660,EAST-WEST,170))for(const [x0,x1] of [[52,508],[700,1148]] as const){
  const mid=(x0+x1)/2,half=(x1-x0)/2,arc=(px:number)=>Math.round(1776-104*(1-Math.pow(Math.abs((px-mid)/half),1.8)));
  for(let px=x0;px<x1;px+=2){
   // Over the arc the wall was never faced: it stood behind the vault's haunches. Along it, the torn bed of the wall rib.
   const top=arc(px+1),v=hash(px,3,7),run=hash(px>>3,3,8),thick=5+Math.floor(run*7);box(c,'#05080c47',px,1660,2,top-1660);
   if(v>.8)box(c,'#0b0f1480',px,1664+Math.floor(hash(px,5,1)*Math.max(1,top-1672)),4+Math.floor(v*20)%7,3);
   if(run<.12)continue;
   box(c,run>.6?'#2d3742':'#343f4a',px,top+(run>.8?1:0),2,thick);box(c,'#3d4854',px,top+(run>.8?1:0),2,1);if(run>.35)box(c,'#0f141a',px,top+(run>.8?1:0)+thick,2,1);
   if(v>.5)box(c,'#3e4954',px,top+1+Math.floor(v*17)%thick,2,2);if(v<.14)box(c,'#56626d',px,top+2,2,2);if(v>.4&&v<.5)box(c,'#0b0f14',px,top+1+Math.floor(v*31)%4,2,3);
  }
  for(const [sx,dir] of [[x0,1],[x1,-1]] as const){
   // The lowest rib stones still spring from a moulded corbel; higher up they go one by one.
   stone(c,sx-10,1792,20,6,S3,S4);stone(c,sx-7,1798,14,5,S2,S3);stone(c,sx-4,1803,8,4,S1,S2);
   for(let i=0;i<9;i++){
    if(i===4||i===6||i===7)continue;
    const at=sx+dir*(i*11+6),bx=at-5,by=arc(at)+(i?0:1),lost=i===3||i===8;
    box(c,S0,bx-1,by-2,12,14);box(c,lost?'#39444f':S3,bx,by-1,10,12);box(c,lost?'#56626d':S4,bx,by-1,10,1);box(c,S1,bx,by+4,10,1);box(c,lost?'#434e59':'#56626d',bx,by+5,10,1);box(c,S0,bx,by+10,10,1);
    if(lost){c.fillStyle='#0b0f14';c.fillRect(dir>0?bx+6:bx,by-1,4,6);c.fillRect(dir>0?bx+8:bx,by+5,2,4);}
   }
  }
 }
 // Every floor line: stone corbels, the wall plate lying on them where it has not rotted out, and the well's two trimmers.
 for(const F of LINES){
  if(F+32<y||F>y+h)continue;
  for(let bx=40;bx<EAST-12;bx+=48){
   if(bx+34<x||bx-14>x+w||bx>WELL0-40&&bx<WELL1+16||F===DIAL_LINE&&bx>DIAL_X-232&&bx<DIAL_X+212)continue;
   const v=hash(bx,F,5),x1=Math.min(EAST,bx+34);
   // The plate's bed is a rebate in the wall; a rotted length of the plate still lies in some of it.
   box(c,'#0d1117',bx-14,F+13,x1-bx+14,9);box(c,'#232c36',bx-14,F+21,x1-bx+14,1);
   if(v>.62){const a=bx-14+Math.floor(v*9),b=x1-Math.floor(hash(bx,F,6)*12);box(c,'#120e0b',a,F+14,b-a,8);box(c,'#1c1612',a+1,F+15,b-a-2,6);box(c,'#120e0b',a+6+Math.floor(v*11),F+15,7,3);}
   stone(c,bx,F+22,10,5,S2,S3);box(c,SHADE2,bx-1,F+28,12,3);
  }
  if(WELL_LINES.includes(F))for(const tx of [WELL0-12,WELL1]){
   stone(c,tx,F+24,12,5,S2,S3);box(c,SHADE2,tx-1,F+30,14,3);
   // A trimmer nothing rests on any more has mostly rotted off its corbel.
   if(F!==2016&&hash(tx,F,9)<.4){box(c,'#0b0f14',tx,F+8,12,16);if(hash(tx,F,8)>.4){box(c,TK,tx+1,F+17,9,7);box(c,TD,tx+2,F+18,7,6);}continue;}
   box(c,TK,tx,F+6,12,18);box(c,T0,tx+1,F+7,10,16);box(c,T1,tx+1,F+7,10,1);box(c,TD,tx+3,F+10,6,10);box(c,T0,tx+4,F+12,4,6);
  }
 }
 // The dial, and the rod that leads off from the clock below to the motion work on its hub.
 if(hits(DIAL_X-200,DIAL_Y-200,400,400)){
  c.drawImage(dialArt(),DIAL_X-200,DIAL_Y-200);
  box(c,I0,DIAL_X-9,DIAL_Y+10,5,154);box(c,I4,DIAL_X-8,DIAL_Y+10,3,153);box(c,I6,DIAL_X-8,DIAL_Y+10,1,153);
  for(let ry=DIAL_Y+44;ry<DIAL_Y+150;ry+=46){box(c,I0,DIAL_X-10,ry,7,6);box(c,I5,DIAL_X-9,ry+1,5,4);}
  box(c,I0,WELL0,DIAL_Y+159,DIAL_X-WELL0-4,5);box(c,I4,WELL0,DIAL_Y+160,DIAL_X-WELL0-5,3);box(c,I6,WELL0,DIAL_Y+160,DIAL_X-WELL0-5,1);
  box(c,I0,DIAL_X-13,DIAL_Y+155,13,13);box(c,I3,DIAL_X-12,DIAL_Y+156,11,11);wheel(c,DIAL_X-7,DIAL_Y+161,3,BRASS,BRASS2);
 }
 // The bell, hung under the frame's upper rail over the open side of the belfry.
 if(hits(716,380,72,96))bell(c,718,382,68,66);
 // A chamfered plinth course at the foot, and the dark in the two corners where the side walls meet this one.
 if(hits(WEST,GROUND-16,EAST-WEST,16)){
  box(c,S0,WEST,GROUND-17,EAST-WEST,1);box(c,S1,WEST,GROUND-16,EAST-WEST,16);box(c,S3,WEST,GROUND-16,EAST-WEST,1);box(c,'#2e3946',WEST,GROUND-15,EAST-WEST,2);
  for(let px=WEST+30,i=0;px<EAST;px+=44+Math.floor(hash(i++,9,2)*30))box(c,S0,px,GROUND-15,1,15);
 }
 box(c,'#05080c8c',WEST,y,3,h);box(c,'#05080c40',WEST+3,y,4,h);box(c,'#05080c8c',EAST-3,y,3,h);box(c,'#05080c40',EAST-7,y,4,h);
}
/** One stretch of the far wall, between two floor lines and between corners or openings. It is laid from its own
 * foot with its own seed, in the work its storey is built of, and carries whatever is built into the wall there. */
export const backWall:Piece=(c,x,y,w,h)=>{
 x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);if(w<=0||h<=0)return;
 c.drawImage(sprite(`l2/back/${x}/${y}/${w}/${h}`,w,h,g=>{
  const k=workAt(y+h);lay(g,w,h,k,x*7+y*3+w);
  // From the belfry floor down to the ground the well is a shallow chase between two piers; the vault sprang from them and the trimmers sit on them.
  if(y>=480&&y+h<=GROUND&&!(y>=1248&&y+h<=1632)){
   box(g,'#05080c38',WELL0-x,0,WELL1-WELL0,h);
   for(const px of [WELL0-PIER,WELL1]){
    const a=Math.max(px,x),b=Math.min(px+PIER,x+w);if(b<=a)continue;
    g.save();g.beginPath();g.rect(a-x,0,b-a,h);g.clip();g.translate(px-x,0);
    lay(g,PIER,h,k===BIG?PIER_BIG:k===BRICK?PIER_BRICK:PIER_STONE,px+y);box(g,k.chip,0,0,1,h);box(g,k.mortar,PIER-1,0,1,h);
    g.restore();box(g,'#05080c73',px+PIER-x,0,3,h);
   }
  }
  g.translate(-x,-y);built(g,x,y,w,h);
 }),x,y);
};

/** The core of a cut wall: rubble thrown in between the two faces and grouted, no two stones alike and no course kept. */
function core(c:C,w:number,h:number,seed:number){
 box(c,'#1b222a',0,0,w,h);
 for(let y=h,r=0;y>0;r++){
  const high=7+Math.floor(hash(r,seed,1)*7);
  for(let x=-Math.floor(hash(r,seed,2)*10),i=0;x<w;i++){
   const len=6+Math.floor(hash(i,r,seed)*15),drop=Math.floor(hash(i,r,seed+3)*4),v=hash(i,r,seed+5),x0=Math.max(0,x),x1=Math.min(w,x+len-1),top=y-high+drop,tall=high-drop-1-(v>.8?1:0);
   if(x1-x0>1&&tall>1){
    box(c,CUT.stones[Math.floor(v*CUT.stones.length)],x0,top,x1-x0,tall);box(c,v>.5?'#4c5864':'#465260',x0,top,x1-x0,1);box(c,'#2c353f',x0,top+tall-1,x1-x0,1);
    box(c,'#1b222a',x0,top,1,1);box(c,'#1b222a',x1-1,top,1,1);box(c,'#1b222a',x0,top+tall-1,1,1);box(c,'#1b222a',x1-1,top+tall-1,1,1);
    if(v<.1)box(c,'#56626d',x0+1,top+1,2,1);
   }
   x+=len;
  }
  y-=high;
 }
}
/** A dressed face of a cut wall: stones long and short by turns, tailing into the core. */
function skin(c:C,x:number,h:number,short:number,long:number,right:boolean,seed:number,lit:boolean){
 for(let r=0;r*16<h;r++){
  const y=h-(r+1)*16,top=Math.max(0,y),wide=(r+seed)%2?short:long,x0=right?x-wide:x,v=hash(r,seed,7);
  box(c,'#1d252e',right?x0-1:x0,top,wide+1,y+16-top);
  box(c,lit?(v>.5?'#56626d':'#515d68'):(v>.5?'#333d47':'#2f3842'),x0,top,wide,y+15-top);
  if(y>=0)box(c,lit?'#7a8690':'#4c5864',x0,y,wide,1);box(c,lit?'#3e4954':'#232b34',x0,y+14,wide,1);
 }
}
/** The west or east wall for one storey band, where the section cuts it: a rubble core between two dressed faces,
 * laid from the band's own foot. Floor bearers and the tie bar go into it at their own heights. */
export const sideWall:Piece=(c,x,y,w,h)=>{
 x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);if(w<=0||h<=0)return;
 c.drawImage(sprite(`l2/side/${x}/${y}/${w}/${h}`,w,h,g=>{
  const west=x<WELL0,thick=w>60,seed=x*5+y;
  core(g,w,h,seed);
  // The room face is on the right of the west wall and the left of the east one.
  skin(g,west?w:0,h,thick?10:7,thick?16:10,west,seed,true);skin(g,west?0:w,h,thick?12:4,thick?19:6,!west,seed+1,false);
  box(g,'#8a949b',west?w-1:0,0,1,h);box(g,'#141b23',west?0:w-1,0,1,h);box(g,'#232b34',west?1:w-2,0,1,h);
  g.translate(-x,-y);
  const face=west?x+w:x,bears=west?BEARS_WEST:BEARS_EAST;
  for(const F of LINES){
   if(F+34<y||F>y+h)continue;
   // A pocket the courses stop round, a padstone under it, and the bearer's tail if the floor is still there.
   const px=west?face-13:face;
   box(g,'#0b0f14',px,F+4,13,21);stone(g,west?face-15:face,F+25,15,6,'#6b7782','#8a949b');
   if(bears.includes(F)){box(g,TK,px+(west?1:0),F+6,12,19);box(g,T1,px+(west?2:0),F+7,11,17);box(g,T3,px+(west?2:0),F+7,11,1);for(let k=0;k<3;k++)box(g,T0,px+3,F+11+k*4,7-k,1);}
   else{box(g,'#1d252e',px+(west?1:8),F+19,4,6);box(g,T0,px+(west?7:2),F+21,4,4);}
  }
  if(TIE+16>y&&TIE-12<y+h){
   // The tie rod runs through a sleeve in the wall to a pattress plate and a nut on the outside.
   box(g,'#0b0f14',x,TIE-1,w,8);box(g,I3,x,TIE+1,w,3);box(g,I5,x,TIE+1,w,1);box(g,I1,x,TIE+4,w,1);
   const ox=west?x:x+w-5;box(g,I0,ox,TIE-11,5,28);box(g,I3,west?ox:ox+1,TIE-10,4,26);box(g,I6,west?ox+3:ox+1,TIE-10,1,26);
   box(g,I0,west?ox+4:ox-3,TIE-2,4,10);box(g,I4,west?ox+4:ox-2,TIE-1,3,8);box(g,I6,west?ox+4:ox-2,TIE-1,3,1);
  }
 }),x,y);
};

/** A window in the far wall, (x,y,w,h) being the daylight of it. Jamb stones long and short, a lintel or a pointed head,
 * a sill. Narrow ones are slits; from 40 wide they are belfry openings with louvres in a timber frame, whose boards
 * line up with the louvre landings (every 14 px, on y ≡ 10 mod 14). */
export const opening:Piece=(c,x,y,w,h)=>{
 x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);
 c.drawImage(sprite(`l2/opening/${x}/${y}/${w}/${h}`,w+24,h+64,g=>{
  g.translate(12,20);const belfry=w>=40,rise=belfry?14:0;
  for(let r=0;r*16<h;r++){
   const b=h-r*16,a=Math.max(0,b-16),long=(r+(x&1))%2===0;
   stone(g,long?-10:-6,a,long?10:6,b-a-1,S2,S3);stone(g,w,a,long?6:10,b-a-1,S1,S2);
  }
  if(belfry){
   // A pointed head turned in small voussoirs.
   const top=(px:number)=>-rise+Math.round(rise*Math.pow(Math.abs((px+1-w/2)/(w/2)),1.5));
   for(let px=-8;px<w+8;px+=2){const t=px<0?0:px>=w?0:top(px);box(g,S0,px,t-8,2,8-Math.min(0,t)+(px<0||px>=w?0:0));box(g,S2,px,t-7,2,6);box(g,S4,px,t-7,2,1);if(((px+8)>>1)%4===0)box(g,S0,px,t-7,1,6);}
   for(let px=0;px<w;px+=2){const t=top(px);box(g,SKY,px,t,2,h-t);if(px<6)box(g,SKY_LIT,px,t,2,h-t);}
   box(g,'#3b4f6e',0,Math.round(h*.6),w,h-Math.round(h*.6));
   // The louvre frame: two stiles and a board every 14 px, each one sloped to shed the rain outward.
   for(const sx of [0,w-4]){box(g,TK,sx,top(sx?w-3:2),4,h-top(sx?w-3:2));box(g,T1,sx+(sx?1:0),top(sx?w-3:2)+1,3,h-top(sx?w-3:2)-1);}
   for(let wy=Math.ceil((y-rise-10)/14)*14+10;wy<y+h-3;wy+=14){const ly=wy-y;if(ly<top(8)+3)continue;box(g,'#10161d',4,ly,w-8,5);box(g,'#1c2530',4,ly,w-8,3);box(g,'#2b3643',4,ly,w-8,1);}
  }else{
   // A slit: a lintel the courses stop under, splayed reveals, the night and the rain.
   stone(g,-11,-10,w+22,9,S2,S4);box(g,S1,-11,-3,w+22,2);
   box(g,'#080b10',0,0,w,h);box(g,'#161d26',0,0,3,h);box(g,S2,w-3,0,3,h);box(g,S3,w-1,0,1,h);
   box(g,SKY,3,0,w-6,h);box(g,SKY_LIT,3,0,Math.max(2,Math.round((w-6)*.3)),h);
   for(let i=0;i<4;i++)box(g,'#b9c9d966',4+Math.floor(hash(i,x,1)*(w-9)),4+Math.floor(hash(i,y,2)*(h-12)),1,5);
  }
  // A sloped sill that throws the water clear, and what the moon and the rain leave on the wall under it.
  stone(g,-10,h,w+20,4,'#3b4753','#4d5a67');box(g,'#4d6a7a',-8,h-1,w+16,1);
  const m=Math.round(w/2);
  if(!belfry){box(g,'#6f8fb40f',-2,h+5,w+4,18);box(g,'#6f8fb409',-4,h+23,w+8,12);box(g,'#0c111780',m-1,h+5,3,16);box(g,'#0c111780',m,h+21,1,12);}
  else for(const dx of [6,m,w-8])box(g,'#0c111766',dx,h+5,2,6+Math.floor(hash(dx,x,3)*10));
 }),x-12,y-20);
};

/** The flooded pit under the ground floor: (x,y,w,h) is its void, from the ground line down. Its lining is laid from the
 * bottom; the kerb's wall stands at its west end and a dressed return at its east. The water stands at the level's water line. */
export const pit:Moving=(c,x,y,w,h,t=0)=>{
 x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);if(w<=0||h<=0)return;
 c.drawImage(sprite(`l2/pit/${x}/${y}/${w}/${h}`,w,h,g=>{
  lay(g,w,h,LINING,x+y*3);
  // The wall under the kerb, battered out as it goes down, and the dressed return under the east flags.
  const kerb=56;
  g.save();g.beginPath();g.rect(0,0,kerb,h);g.clip();lay(g,kerb,h,FOOT,x+11);g.restore();
  for(let r=0;r*16<h;r++){const b=h-r*16,a=Math.max(0,b-16),long=r%2===0;stone(g,kerb-(long?12:7),a,long?12:7,b-a-1,S2,S3);stone(g,w-(long?9:14),a,long?9:14,b-a-1,S1,S2);}
  box(g,'#05070a',kerb,0,3,h);box(g,'#05070a66',kerb+3,0,5,h);
  // A culvert that used to drain it, choked: its arch stands half out of the water.
  const dx=Math.round(w*.62),dy=Math.min(h-20,WATER-y-14);
  box(g,'#05070a',dx,dy+6,40,h-dy-6);
  for(let px=0;px<40;px+=2){const k=(px+1-20)/20,top=dy+8-Math.round(10*Math.sqrt(Math.max(0,1-k*k)));box(g,'#05070a',dx+px,top+5,2,dy+8-top);box(g,S1,dx+px,top,2,5);box(g,S3,dx+px,top,2,1);if((px>>1)%4===0)box(g,S0,dx+px,top,1,5);}
  // Dark gathers under the floor and down the pit; a pale line shows where the water stood before the rain.
  box(g,'#05070acc',0,0,w,4);box(g,'#05070a73',0,4,w,8);box(g,'#05070a33',0,12,w,12);
  const line=WATER-y-9;box(g,'#3a465355',kerb,line,w-kerb,1);box(g,'#05080c40',kerb,line+1,w-kerb,h-line);
  box(g,'#2f55462e',kerb,line+1,w-kerb,3);
  for(let px=kerb+14;px<w-16;px+=37+Math.floor(hash(px,3,1)*40)){const top=4+Math.floor(hash(px,3,5)*10);box(g,'#05080c40',px,top,2+Math.floor(hash(px,3,6)*3),line-top-Math.floor(hash(px,3,7)*20));}
 }),x,y);
 const top=Math.max(y,WATER);if(top>=y+h)return;
 // The water covers the kerb wall's foot too. Only its glints move.
 box(c,'#12303bd9',x+56,top,w-56,y+h-top);box(c,'#0b212a99',x+56,top+14,w-56,y+h-top-14);box(c,'#4f7f8a',x+56,top,w-56,1);box(c,'#2c5560',x+56,top+1,w-56,1);
 for(let i=0;i<7;i++){const span=w-56-36,gx=x+62+(i*97+Math.round(Math.sin(t*1.1+i*2.1)*5)+span)%span;box(c,'#8fb4b866',gx,top+3+i%3*4,8+i%3*5,1);}
 for(let i=0;i<3;i++){const p=((t*.6+i*.37)%1+1)%1;if(t&&p>.82)box(c,'#b9c9d944',x+120+i*150-4,top+1,9+Math.round((p-.82)*40),1);}
};

/** The door at the foot, from inside: (x,y,w,h) is its leaf. Ledged and braced oak under a segmental arch, barred against the rain. */
export const towerDoor:Piece=(c,x,y,w,h)=>{
 x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);
 c.drawImage(sprite(`l2/door/${w}/${h}`,w+32,h+26,g=>{
  g.translate(16,22);
  for(let r=0;r*18<h;r++){const b=h-r*18,a=Math.max(0,b-18),long=r%2===0;stone(g,long?-13:-9,a,long?13:9,b-a-1,S2,S4);stone(g,w,a,long?9:13,b-a-1,S2,S3);}
  // The arch: voussoirs over a head cut to its curve.
  const top=(px:number)=>-Math.round(9*Math.sqrt(Math.max(0,1-Math.pow((px+1-w/2)/(w/2),2))));
  for(let px=-12;px<w+12;px+=2){const t=px<0||px>=w?0:top(px),k=(px+12)>>1;box(g,S0,px,t-11,2,11);box(g,S2,px,t-10,2,9);box(g,S4,px,t-10,2,1);if(k%4===0)box(g,S0,px,t-10,1,9);}
  for(let px=0;px<w;px+=2){const t=top(px);box(g,'#0a0d11',px,t,2,h-t);}
  // Seven planks, three ledges, two braces; strap hinges on pintles in the west jamb.
  for(let px=2;px<w-2;px+=2){const t=top(px)+2,plank=Math.floor((px-2)/6);box(g,plank%2?T1:'#43342a',px,t,2,h-t);if((px-2)%6===0)box(g,TK,px,t,1,h-t);}
  for(const ly of [8,Math.round(h/2)-2,h-12]){box(g,TK,2,ly-1,w-4,8);box(g,T2,2,ly,w-4,6);box(g,T3,2,ly,w-4,1);}
  stroke(g,T2,5,Math.round(h/2)-4,w-8,14,2);stroke(g,T2,5,h-14,w-8,Math.round(h/2)+4,2);
  for(const ly of [10,h-10]){box(g,I0,0,ly-1,Math.round(w*.6),5);box(g,I3,1,ly,Math.round(w*.6)-2,3);box(g,I5,1,ly,Math.round(w*.6)-2,1);box(g,I0,-2,ly-3,5,9);box(g,I4,-1,ly-2,3,7);}
  // The drawbar across it in two iron staples, and the rain coming in under.
  const by=Math.round(h*.56);box(g,TK,-6,by-1,w+12,8);box(g,T3,-5,by,w+10,6);box(g,T5,-5,by,w+10,1);box(g,T1,-5,by+5,w+10,1);
  for(const sx of [3,w-8]){box(g,I0,sx-1,by-3,6,12);box(g,I3,sx,by-2,4,10);box(g,I6,sx,by-2,4,1);}
  box(g,N1,-2,h-3,w+4,3);box(g,N4,-2,h-3,w+4,1);box(g,'#4d6a7a',6,h-3,w-16,1);box(g,'#6f8fb466',10,h-2,9,1);
 }),x-16,y-22);
};

/** The gallery door at the top, the way out: (x,y,w,h) is the doorway. It stands open on the night and the gallery's parapet,
 * its leaf back against the west jamb, a lamp on a bracket beside it. */
export const galleryDoor:Piece=(c,x,y,w,h)=>{
 x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);
 c.drawImage(sprite(`l2/exit/${w}/${h}`,w+84,h+38,g=>{
  g.translate(30,34);
  // The lamp's light on the wall, then the stonework.
  disc(g,'#f3c77a0a',w+25,-2,26);disc(g,'#f3c77a0d',w+25,-2,18);disc(g,'#f3c77a14',w+25,-2,11);
  for(let r=0;r*14<h;r++){const b=h-r*14,a=Math.max(0,b-14),long=r%2===0;stone(g,long?-13:-9,a,long?13:9,b-a-1,S3,S4);stone(g,w,a,long?9:13,b-a-1,S3,S4);}
  const top=(px:number)=>-12+Math.round(12*Math.pow(Math.abs((px+1-w/2)/(w/2)),1.6));
  for(let px=-12;px<w+12;px+=2){const t=px<0||px>=w?0:top(px),k=(px+12)>>1;box(g,S0,px,t-11,2,11);box(g,S3,px,t-10,2,9);box(g,'#5a6671',px,t-10,2,1);if(k%4===0)box(g,S0,px,t-10,1,9);}
  // Through it: the night sky, rain, and the gallery's parapet with the dark Quarter beyond.
  for(let px=0;px<w;px+=2){const t=top(px);box(g,SKY,px,t,2,h-t);box(g,'#3b4f6e',px,Math.round(h*.45),2,h-Math.round(h*.45));}
  box(g,SKY_LIT,0,-4,3,h+4);
  for(let i=0;i<6;i++)box(g,'#b9c9d977',8+Math.floor(hash(i,5,1)*(w-12)),Math.floor(hash(i,5,2)*(h-28))-4,1,6);
  const py=h-22;box(g,'#141c2c',0,py+4,w,18);box(g,'#1a2330',0,py,w,5);box(g,'#34435a',0,py,w,1);
  for(let px=7;px<w-2;px+=7){box(g,'#1a2330',px,py+5,3,14);box(g,'#27344a',px,py+5,1,14);}
  // The oak leaf stands open against the jamb on its strap hinges.
  box(g,TK,0,top(4),9,h-top(4));box(g,T2,1,top(4)+1,7,h-top(4)-1);box(g,T4,1,top(4)+1,1,h-top(4)-1);box(g,T0,5,top(4)+1,1,h-top(4)-1);
  for(const ly of [8,h-16]){box(g,I0,0,ly-1,9,4);box(g,I4,0,ly,8,2);}
  box(g,N1,-2,h-3,w+4,3);box(g,N5,-2,h-3,w+4,1);box(g,'#9fb7c855',9,h-2,w-12,1);
  // A lamp on an iron bracket.
  box(g,I0,w+12,-15,15,3);box(g,I4,w+12,-15,15,1);box(g,I0,w+24,-13,3,6);stroke(g,I3,w+13,-6,w+22,-13,1);
  box(g,I0,w+20,-8,11,14);box(g,'#c98f4b',w+21,-6,9,10);box(g,'#f3c77a',w+22,-5,7,8);box(g,'#fff0c4',w+24,-3,3,5);box(g,I2,w+20,-9,11,2);box(g,I2,w+20,5,11,2);box(g,I0,w+25,-6,1,10);
 }),x-30,y-34);
};

const ropeArt=()=>sprite('l2/rope',3,128,c=>{box(c,'#8a7a5a',0,0,3,128);box(c,'#a8976f',0,0,1,128);box(c,'#5f5340',2,0,1,128);for(let y=0;y<128;y+=4){box(c,'#5f5340',0,y+2,1,1);box(c,'#6d6248',1,y+1,1,1);box(c,'#a8976f',2,y,1,1);}});
const slingArt=(w:number)=>sprite(`l2/slings/${w}`,w,30,c=>{
 const m=Math.round(w/2);
 for(const end of [2,w-3]){stroke(c,'#5f5340',m,5,end,28,2);stroke(c,'#a8976f',m,5,end,28,1);}
 box(c,I0,m-3,0,7,7);box(c,I4,m-2,1,5,5);box(c,I0,m-1,2,3,3);box(c,I6,m-2,1,5,1);
});
const blockArt=()=>sprite('l2/block',21,36,c=>{
 // A shackle hooked over the rail, the block's two iron cheeks and its sheave.
 box(c,I0,7,0,7,10);box(c,I4,8,0,5,9);box(c,I0,9,2,3,5);box(c,I6,8,0,5,1);
 box(c,I0,2,9,17,22);box(c,I3,3,10,15,20);box(c,I5,3,10,1,20);box(c,I5,3,10,15,1);
 disc(c,I0,10,20,7);disc(c,'#6d5a36',10,20,6);ring(c,BRASS,10,20,4,6);box(c,I6,9,19,3,3);box(c,BRASS2,6,16,2,1);
 box(c,I0,7,30,7,5);box(c,I4,8,30,5,4);
});
/** The hoist's rope: (x,y,w) is the pallet's live top-left and width, h the rope's length up from the pallet to the eye
 * of the hoist block (HOIST_TOP, under the bell frame's lower rail). Two slings rise from the pallet's eye bolts to a
 * ring; the rope's lay travels with the pallet. Its free end hangs from the block and sways with `t`. */
export const hoistRope:Moving=(c,x,y,w,h,t=0)=>{
 x=Math.round(x);y=Math.round(y);w=Math.round(w);
 const m=x+Math.round(w/2),top=Math.round(y-h),ring0=y-31;
 c.drawImage(blockArt(),m-10,top);
 const rope=ropeArt();
 for(let b=ring0;b>top+30;b-=128){const a=Math.max(top+30,b-128);c.drawImage(rope,0,128-(b-a),3,b-a,m-1,a,3,b-a);}
 c.drawImage(slingArt(w),x,ring0);
 // The fall: the free end, made off short, hanging from the block's other side.
 const sway=Math.round(Math.sin(t*1.3)*1.5);
 c.drawImage(rope,0,0,3,34,m+6,top+26,3,34);c.drawImage(rope,0,0,3,22,m+6+sway,top+60,3,22);box(c,'#5f5340',m+5+sway,top+82,5,4);box(c,'#a8976f',m+5+sway,top+82,1,4);
};
