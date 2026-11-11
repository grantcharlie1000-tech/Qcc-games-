import type {Level,Platform} from '../levels';
import {box,hash,sprite,stroke,type C,type Work} from '../quarter-kit';
import {DIAL,EAST,WELL0,WELL1,WEST} from '../tower-02';

/** 02 · A Bell Above the Rain: the pieces of the bell tower's inside, seen in section.
 *
 * The section cuts the tower in front of the courier. The far wall is whole and
 * everything you stand on is carried by it or by the two cut side walls:
 *  - a timber floor is boards on joists that run back onto a wall plate, which
 *    lies along the far wall on stone corbels. The cut shows the joists end-on;
 *  - stone (stair treads, sills, corbels) is let into the far wall;
 *  - iron and single treads sit on brackets leaded into the far wall;
 *  - furniture stands on the floor it was built on, and brings that floor with it.
 * A landing's own tile carries what goes with it wherever it goes. Whatever must stay
 * behind when a rotten timber falls (trimmers, stirrups, rails, the stair's string) is
 * drawn by the set, with the rooms (set-bell-tower.ts). */

// Timber you stand on, the same timber in the dark behind you, rotten timber, the masons' deal, iron, wall stone, the stone you stand on.
export const TK='#15100c',T0='#2c2119',T1='#3d2e22',T2='#57432f',T3='#6b523a',T4='#8d704f',T5='#b3946a',TD='#231a14';
export const B0='#100c09',B1='#1c1611',B2='#2a2019',B3='#382b21',B4='#4a3a2c';
export const R0='#2c2620',R1='#57493a',R2='#6a5b48',R3='#8a7a62',MOSS='#4a5a44',MOSS2='#5d6b4f';
export const P0='#2a2318',P1='#4a3d2b',P2='#6b5a40',P3='#8a7653',P4='#a8936a',P5='#c9b488';
export const I0='#10161d',I1='#1a1f25',I2='#262d33',I3='#39424a',I4='#4a545b',I5='#5d6a6e',I6='#7f8c90',RUST='#5a3a2a',LEAD='#8a949b';
export const S0='#141b23',S1='#252f3b',S2='#2c3743',S3='#3a4653',S4='#4d5a67';
export const N0='#1a2028',N1='#333c45',N2='#3f4953',N3='#454f59',N4='#57626d',N5='#6b757d',N6='#8a949b';
export const SHADE='#05080c8c',SHADE2='#05080c40',SKY='#31425d',SKY_LIT='#42587a',BRASS='#8c7648',BRASS2='#b79a5c',ROPE='#8a7a5a',ROPE_LIT='#a8976f',ROPE_DARK='#5f5340';

export const BIG:Work={course:24,short:34,long:66,mortar:'#131a22',stones:['#1b242e','#1d2731','#202a35','#1a232d'],lip:'#27323e',shade:'#161d26',chip:'#2b3643'};
export const COURSED:Work={course:16,short:22,long:46,mortar:'#19212b',stones:['#1d2631','#1f2934','#222c37','#1c2530'],lip:'#27323e',shade:'#18202a',chip:'#2b3643'};
export const BRICK:Work={course:8,short:12,long:18,mortar:'#15181f',stones:['#221e25','#252027','#28222a','#201c23'],lip:'#2f282e',shade:'#1c181e',chip:'#342c32'};
export const CUT:Work={course:14,short:10,long:30,mortar:'#1d252e',stones:['#39444f','#3e4954','#434e59','#353f49'],lip:'#56626d',shade:'#2c353f',chip:'#606c77'};
export const FOOT:Work={course:16,short:26,long:52,mortar:'#0f141a',stones:['#171d25','#191f28','#1b222b'],lip:'#1f2731',shade:'#141a21',chip:'#222b36'};
export const LINING:Work={course:12,short:16,long:34,mortar:'#0b0f14',stones:['#131920','#151b23','#161d26'],lip:'#1b232c',shade:'#10151b',chip:'#1e2731'};
export const CHASE:Work={course:8,short:12,long:18,mortar:'#0e1015',stones:['#141318','#151419','#16151b'],lip:'#19181e',shade:'#111015',chip:'#1c1a20'};

export function disc(c:C,color:string,cx:number,cy:number,r:number){for(let y=-r;y<=r;y++){const o=Math.round(Math.sqrt(r*r-y*y));box(c,color,cx-o,cy+y,o*2+1,1);}}
export function ring(c:C,color:string,cx:number,cy:number,r0:number,r1:number){
 for(let y=-r1;y<=r1;y++){
  const o=Math.round(Math.sqrt(r1*r1-y*y));
  if(Math.abs(y)>=r0){box(c,color,cx-o,cy+y,o*2+1,1);continue;}
  const i=Math.round(Math.sqrt(r0*r0-y*y));box(c,color,cx-o,cy+y,o-i+1,1);box(c,color,cx+i,cy+y,o-i+1,1);
 }
}
/** A stone built out of the far wall, seen from the front. */
export function stone(c:C,x:number,y:number,w:number,h:number,face=S2,lip=S4){box(c,S0,x-1,y,w+2,h+1);box(c,face,x,y,w,h);box(c,lip,x,y,w,1);}
/** A toothed wheel. Two of them mesh when their centres are their two radii and a tooth apart. */
export function gear(c:C,cx:number,cy:number,r:number,body:string,light:string,turn=0){
 const teeth=Math.max(6,Math.round(r*1.1)),size=r>9?3:2;
 for(let i=0;i<teeth;i++){const a=(i+turn)*Math.PI*2/teeth;box(c,body,Math.round(cx+Math.cos(a)*(r+1)-size/2),Math.round(cy+Math.sin(a)*(r+1)-size/2),size,size);}
 ring(c,body,cx,cy,Math.max(1,r-3),r);box(c,body,cx,cy-r,1,r*2);box(c,body,cx-r,cy,r*2,1);
 if(r>9){stroke(c,body,cx-r*.7,cy-r*.7,cx+r*.7,cy+r*.7);stroke(c,body,cx-r*.7,cy+r*.7,cx+r*.7,cy-r*.7);}
 box(c,light,cx-1,cy-1,3,3);box(c,light,cx-Math.round(r*.7),cy-Math.round(r*.7),2,1);
}
const under=(c:C,x:number,y:number,w:number)=>{box(c,SHADE,x,y,w,3);box(c,SHADE2,x,y+3,w,3);};
/** Oak boards along the cut edge of a floor. */
function planks(c:C,x0:number,x1:number,y:number,s:number){
 box(c,TK,x0,y,x1-x0,7);box(c,T3,x0,y,x1-x0,6);box(c,T5,x0,y,x1-x0,2);box(c,T4,x0,y+2,x1-x0,1);
 for(let x=x0+12+Math.floor(hash(s,1,5)*18),i=0;x<x1-8;x+=28+Math.floor(hash(i++,s,6)*36)){box(c,T1,x,y,1,6);box(c,T0,x-3,y+3,1,1);box(c,T0,x+3,y+3,1,1);}
}
/** How a stretch of floor ends: in a side wall's pocket, against the next piece of the same floor, at a trimmer, or broken back. */
type End='wall'|'join'|'trim'|'broken';
/** A stretch of timber floor in section, 28 deep: boards, the joists end-on, the wall plate behind them on its corbels. */
function floorSection(c:C,w:number,y:number,s:number,left:End='broken',right:End='broken'){
 const x0=left==='wall'?-4:0,x1=right==='wall'?w+4:w;
 box(c,'#07090c',x0,y+6,x1-x0,8);
 box(c,TK,x0,y+13,x1-x0,9);box(c,TD,x0,y+14,x1-x0,7);box(c,T0,x0,y+14,x1-x0,1);
 for(let x=5+Math.floor(hash(s,2,2)*9);x<w-8;x+=17)box(c,TK,x,y+16+x%3,6,1);
 box(c,'#0a0d11',x0,y+22,x1-x0,6);
 const bays=Math.max(1,Math.round((w-10)/26));
 for(let i=0;i<=bays;i++){
  const kind=i===0?left:i===bays?right:'join',end=i===0||i===bays,heavy=end&&kind==='trim';
  // The last joist stands back from a break; a trimmer is the heavier timber the floor was framed round.
  const wide=heavy?12:end?10:8,x=Math.round(i*(w-10)/bays)+(end?0:1)+(end&&kind==='broken'?(i?-6:6):0)-(heavy&&i?2:0);
  if(end||i%2===0)stone(c,x,y+22,wide,5,S2,S4);
  box(c,TK,x,y+6-(heavy?2:0),wide,16+(heavy?2:0));box(c,heavy?T2:T1,x+1,y+6-(heavy?2:0),wide-2,15+(heavy?2:0));box(c,heavy?T4:T2,x+1,y+7-(heavy?2:0),wide-2,1);
  box(c,T0,x+2,y+10,wide-4,9);box(c,T1,x+3,y+12,wide-6,5);if(end)box(c,T2,x+4,y+13,2,2);
  if(heavy)for(const py of [y+8,y+18])box(c,I5,x+Math.round(wide/2)-1,py,2,2);
 }
 planks(c,x0,x1,y,s);
 for(const [kind,at,dir] of [[left,0,1],[right,w,-1]] as const){
  if(kind!=='broken')continue;
  // Broken back: the boards snapped off unevenly past the last joist, the plate's end split and hanging.
  const a=2+Math.floor(hash(s,at,1)*4),b=1+Math.floor(hash(s,at,2)*3),px=(n:number)=>dir>0?at:at-n;
  c.clearRect(px(a),y,a,3);c.clearRect(px(b),y+3,b,4);box(c,T4,px(a)+(dir>0?a:-1),y,1,3);box(c,TK,px(b)+(dir>0?b:-1),y+3,1,3);
  c.clearRect(px(3),y+6,3,8);c.clearRect(px(5),y+13,5,3);c.clearRect(px(2),y+16,2,6);c.clearRect(px(4),y+22,4,6);
  box(c,T2,px(5)+(dir>0?5:-1),y+13,1,3);box(c,T1,dir>0?at+2:at-4,y+19,2,4);
 }
}
/** Seven planks on ledges: one leaf of a door or a cupboard. */
function leaf(c:C,x:number,y:number,w:number,h:number,s:number){
 box(c,TK,x-1,y-1,w+2,h+2);
 for(let px=x,i=0;px<x+w;px+=6,i++){const wide=Math.min(5,x+w-px);box(c,hash(i,s,4)>.5?T2:'#4d3a2a',px,y,wide,h);box(c,T1,px+wide,y,1,h);}
 box(c,T3,x,y,w,1);
}

type Paint=(c:C,w:number,h:number,s:number,ends:readonly [End,End],p:Platform)=>void;
const PAINT:Record<string,Paint>={
 // Worn flags, cut by the section, bedded on two courses of footing.
 ground(c,w,h,s){
  box(c,N0,0,0,w,h);
  for(let r=0;r<2;r++){
   const y=10+r*9;let x=-Math.floor(hash(r,s,4)*20);
   for(let i=0;x<w;i++){const len=24+Math.floor(hash(i,r,s)*28),a=Math.max(0,x),b=Math.min(w,x+len);if(b-a>2){box(c,r?'#232b34':'#29323c',a+1,y,b-a-1,8);box(c,r?'#2b343e':'#333d48',a+1,y,b-a-1,1);}x+=len;}
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
 wellhead(c,w,h,s,ends,p){
  box(c,N0,0,9,w,h-9);
  const half=Math.round(w*(.4+hash(s,1,1)*.2)),third=Math.round(w*.3);
  for(const [a,b,y0,y1] of [[0,half,9,24],[half,w,9,24],[0,third,24,h],[third,third+Math.round(w*.42),24,h],[third+Math.round(w*.42),w,24,h]] as const){
   box(c,hash(a,y0,s)>.5?N2:'#3a444e',a+1,y0+1,b-a-1,y1-y0-1);box(c,N4,a+1,y0+1,b-a-1,1);box(c,N1,a+1,y1-1,b-a-1,1);
  }
  // The side that faces the pit is wet and dark.
  const pit=p.x<WELL0?w-8:0;box(c,'#0b1a2255',pit,10,8,h-10);box(c,'#0b1a2255',pit+(p.x<WELL0?4:0),10,4,h-10);
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
 // Oak boards on joists. The cut shows the joists end-on.
 floor(c,w,h,s,ends){floorSection(c,w,0,s,ends[0],ends[1]);under(c,0,28,w);},
 // A ringer's box: a framed and boarded stand, on the ringing floor.
 box(c,w,h,s,ends){
  const H=h-28;floorSection(c,w,H,s,ends[0],ends[1]);under(c,0,h,w);
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
 // The parish chest: oak boards bound in iron, three hasps for three keys, standing on its feet on the floor.
 chest(c,w,h,s,ends){
  const H=h-28,mid=Math.round(w/2);floorSection(c,w,H,s,ends[0],ends[1]);under(c,0,h,w);
  for(const x of [3,w-9]){box(c,TK,x,H-4,6,4);box(c,T1,x+1,H-4,4,3);}
  box(c,TK,0,7,w,H-10);box(c,T2,1,8,w-2,H-12);box(c,T3,1,8,w-2,1);box(c,T1,1,H-6,w-2,2);
  for(const y of [17,27])box(c,T1,1,y,w-2,1);
  for(let x=9;x<w-6;x+=11)box(c,T1,x,19+Math.floor(hash(x,s,1)*5),3+Math.floor(hash(x,s,2)*5),1);
  for(const x of [6,mid-2,w-10]){
   box(c,I0,x-1,2,6,H-5);box(c,I3,x,2,4,H-6);box(c,I5,x,2,1,H-6);for(let y=18;y<H-6;y+=6)box(c,I6,x+1,y,1,1);
   box(c,I0,x-2,9,8,8);box(c,I4,x-1,10,6,6);box(c,I6,x-1,10,6,1);box(c,I0,x+1,12,2,3);
  }
  box(c,RUST,mid+5,H-9,6,1);
  // The lid is flat and overhangs: you stand on it.
  box(c,TK,-2,0,w+4,8);box(c,T3,-1,0,w+2,7);box(c,T5,-1,0,w+2,2);box(c,T4,-1,2,w+2,1);box(c,T1,-1,6,w+2,1);
  for(const x of [6,mid-2,w-10])box(c,I4,x,0,4,7);
 },
 // The muniment press: a tall oak cupboard under a flat cornice, its doors on strap hinges, locked.
 press(c,w,h,s,ends){
  const H=h-28,half=Math.floor((w-6)/2),m=3+half,lock=Math.round(H*.52);floorSection(c,w,H,s,ends[0],ends[1]);under(c,0,h,w);
  box(c,TK,0,5,w,H-5);box(c,T1,1,6,w-2,H-7);
  for(const dx of [3,m]){
   leaf(c,dx,9,half-1,H-18,s+dx);
   for(const ly of [13,H-17]){box(c,TK,dx,ly-1,half-1,5);box(c,T3,dx,ly,half-1,3);box(c,T4,dx,ly,half-1,1);}
  }
  for(const ly of [14,H-16]){box(c,I0,1,ly-1,9,4);box(c,I4,2,ly,7,2);box(c,I6,2,ly,7,1);box(c,I0,w-10,ly-1,9,4);box(c,I4,w-9,ly,7,2);box(c,I6,w-9,ly,7,1);}
  box(c,I0,m-4,lock-1,7,9);box(c,BRASS,m-3,lock,5,7);box(c,BRASS2,m-3,lock,5,1);box(c,I0,m-1,lock+3,1,3);
  box(c,TK,-1,H-7,w+2,7);box(c,T2,0,H-6,w,5);box(c,T4,0,H-6,w,1);
  box(c,TK,-2,0,w+4,8);box(c,T3,-1,0,w+2,7);box(c,T5,-1,0,w+2,2);box(c,T4,-1,2,w+2,1);box(c,T2,0,5,w,1);box(c,T1,0,6,w,1);
 },
 // The clock case: an oak trunk the two weight lines drop through, with a glazed door on the stopped pendulum.
 clockcase(c,w,h,s,ends){
  const H=h-28,gx=13,gy=10,gw=w-26,gh=H-22,mid=Math.round(w/2);floorSection(c,w,H,s,ends[0],ends[1]);under(c,0,h,w);
  box(c,TK,1,H-6,w-2,6);box(c,T2,2,H-6,w-4,5);box(c,T4,2,H-6,w-4,1);
  box(c,TK,3,4,w-6,H-10);box(c,T1,4,4,w-8,H-10);
  for(const x of [4,w-12]){box(c,T2,x,4,8,H-10);box(c,T4,x,4,1,H-10);box(c,T0,x+7,4,1,H-10);}
  box(c,T2,12,5,w-24,4);box(c,T2,12,H-11,w-24,4);
  box(c,TK,gx-1,gy-1,gw+2,gh+2);box(c,'#0c1014',gx,gy,gw,gh);
  // The pendulum hangs still behind the glass; the lines pass down either side of it to the weights below.
  box(c,I4,mid,gy,1,gh-13);disc(c,'#6d5a36',mid,gy+gh-9,6);ring(c,BRASS,mid,gy+gh-9,4,6);box(c,BRASS2,mid-3,gy+gh-12,2,1);box(c,I4,mid-1,gy+gh-2,3,2);
  box(c,I3,gx+3,gy,1,gh);box(c,I3,gx+gw-4,gy,1,gh);
  box(c,'#6f8fb433',gx+1,gy+1,1,gh-2);stroke(c,'#6f8fb42e',gx+5,gy+14,gx+15,gy+4,1);
  box(c,T1,gx-1,gy+Math.round(gh/2),gw+2,1);box(c,BRASS,w-10,Math.round(H/2),2,3);
  box(c,TK,-1,0,w+2,5);box(c,T3,0,0,w,4);box(c,T5,0,0,w,2);box(c,T4,0,2,w,1);box(c,T1,1,4,w-2,1);
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
 // A rotten length of joist, the boards gone off it. The corbels it lies on stay in the wall.
 joist(c,w,h,s){
  box(c,TK,0,0,w,12);box(c,R1,0,0,w,11);box(c,R3,0,0,w,2);box(c,R2,0,2,w,2);box(c,R0,0,8,w,3);
  // Splintered at both ends, the board nails still standing in it.
  for(let y=1;y<12;y++){const a=Math.floor(hash(y,s,1)*4),b=Math.floor(hash(y,s,2)*4);c.clearRect(0,y,a,1);c.clearRect(w-b,y,b,1);}
  for(let x=9+s%4;x<w-8;x+=11)box(c,R0,x,3+Math.floor(hash(x,s,3)*4),2+Math.floor(hash(x,s,4)*7),1);
  box(c,TK,Math.round(w*.42),5,6,4);box(c,R0,Math.round(w*.42)+1,6,4,2);
  box(c,MOSS,3,0,8,1);box(c,MOSS2,5,0,3,1);box(c,MOSS,w-16,9,9,2);
  for(const x of [Math.round(w*.3),Math.round(w*.7)])box(c,I3,x,-2,1,3);
 },
 // The rotten beam across the well. The stirrups it hangs in stay on the trimmers.
 beam(c,w,h,s){
  box(c,TK,0,0,w,12);box(c,R1,0,0,w,11);box(c,R3,0,0,w,2);box(c,R2,0,2,w,2);box(c,R0,0,8,w,3);
  // Eaten away underneath at mid-span, shaken along the grain, a bracket fungus on the wet side.
  for(let x=Math.round(w*.28);x<w*.74;x+=2){const k=Math.sin((x/w-.28)/.46*Math.PI),d=Math.round(k*(2+hash(x,s,3)*3));if(d>0){c.clearRect(x,12-d,2,d);box(c,TK,x,11-d,2,1);}}
  for(let x=10;x<w-20;x+=23+Math.floor(hash(x,s,5)*14))box(c,R0,x,3+Math.floor(hash(x,s,6)*3),9+Math.floor(hash(x,s,7)*14),1);
  box(c,'#9a8f76',Math.round(w*.2),11,7,1);box(c,'#b5aa8d',Math.round(w*.2),10,7,1);
  box(c,MOSS,Math.round(w*.62),0,13,1);box(c,MOSS2,Math.round(w*.62)+3,0,5,1);
 },
 // A soft tread of the old stair. Its housing stays in the string.
 stair(c,w,h,s){
  box(c,TK,-1,0,w+2,10);box(c,R1,0,0,w,9);box(c,R3,0,0,w,2);box(c,R2,0,2,w,1);box(c,R0,0,7,w,2);
  // The nosing is worn round and the back edge has gone to pulp.
  c.clearRect(w-1,0,2,1);c.clearRect(w,1,1,2);
  for(let x=0;x<8;x+=2)c.clearRect(x,9-Math.floor(hash(x,s,1)*3),2,3);
  for(let x=5+s%6;x<w-8;x+=10+Math.floor(hash(x,s,2)*7))box(c,R0,x,3+Math.floor(hash(x,s,3)*2),3+Math.floor(hash(x,s,4)*8),1);
  box(c,MOSS,Math.round(w*.55),0,10,1);box(c,MOSS2,Math.round(w*.55)+2,0,4,1);box(c,MOSS,4,4,6,1);
  box(c,TK,Math.round(w*.3),4,5,3);box(c,R0,Math.round(w*.3)+1,5,3,1);
 },
 // A rotten plank laid across the bell cage. The rails it lies on stay.
 plank(c,w,h,s){
  box(c,TK,-1,0,w+2,10);box(c,R1,0,0,w,9);box(c,R3,0,0,w,2);box(c,R2,0,2,w,2);box(c,R0,0,7,w,2);
  for(let x=6+s%5;x<w-8;x+=11){const v=hash(x,s,7);box(c,R0,x,3+Math.floor(v*3),3+Math.floor(v*9),1);}
  // Split along the grain from one end, a knot fallen out of it, green where the louvres let the rain in.
  box(c,TK,0,4,Math.round(w*.3),1);box(c,TK,Math.round(w*.38),2,7,5);box(c,R0,Math.round(w*.38)+1,3,5,3);
  box(c,MOSS,Math.round(w*.7),0,9,1);box(c,MOSS2,Math.round(w*.7)+2,0,4,1);box(c,MOSS,5,6,11,2);
  c.clearRect(w-2,6,2,4);c.clearRect(0,8,3,2);
 },
 // Scaffold boards on two putlogs: the putlogs' ends are in their holes in the far wall.
 putlog(c,w,h,s){
  for(const x of [7,w-15]){
   box(c,'#05070a',x-2,3,12,12);box(c,TK,x,5,8,8);box(c,P2,x+1,6,6,6);box(c,P4,x+1,6,6,1);box(c,P0,x+3,8,2,3);
   // Lashed to the ledger under it.
   stroke(c,ROPE_LIT,x-1,10,x+8,15);stroke(c,ROPE,x+8,10,x-1,15);
  }
  box(c,TK,-2,0,w+4,6);box(c,P3,-1,0,w+2,5);box(c,P5,-1,0,w+2,2);box(c,P4,-1,2,w+2,1);
  const j=Math.round(w*(.4+hash(s,1,1)*.2));box(c,TK,j,0,1,5);box(c,P1,j-9,3,7,1);box(c,P1,j+6,3,9,1);
  // Lime off the masons' boards.
  for(let x=3+s%7;x<w-6;x+=9+Math.floor(hash(x,s,2)*9))box(c,'#b9bdb6',x,Math.floor(hash(x,s,3)*2),2+Math.floor(hash(x,s,4)*3),1);
 },
 // One of the clock's weights: cast-iron cheeses dropped onto a rod, an eye on top for the line.
 weight(c,w,h,s){
  const m=Math.round(w/2);
  box(c,I0,-1,0,w+2,h);box(c,I3,0,0,w,7);box(c,I6,0,0,w,1);box(c,I5,0,1,w,1);box(c,I2,0,6,w,1);
  box(c,I2,1,8,w-2,h-9);box(c,I4,1,8,w-2,1);box(c,I1,1,h-2,w-2,1);
  for(const x of [5,w-11]){box(c,I0,x,2,6,3);box(c,I4,x+1,3,4,1);}
  box(c,I0,m-2,1,5,h-2);box(c,I5,m-1,1,2,h-2);
  box(c,RUST,7+s%9,10,8,1);box(c,RUST,w-18,4,6,1);box(c,RUST,m+6,12,5,1);
  box(c,I0,m-4,-8,9,9);box(c,I4,m-3,-7,7,7);box(c,I6,m-3,-7,7,1);box(c,I0,m-1,-5,3,4);
 },
 // Corbels: three courses of stone built out of the far wall, each oversailing the one under it.
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
 // Stones of the fallen rib vault heaped on what is left of the floor: voussoirs and rib lengths under a web slab.
 rubble(c,w,h,s,ends){
  const H=h-28;floorSection(c,w,H,s,ends[0],ends[1]);under(c,0,h,w);
  // Thrown down, not laid: every stone lies where it fell, the lower ones in front, the heap spreading at its foot.
  const tones=['#39444f','#3e4954','#434e59','#353f49','#303a44'],count=Math.round(w*(H-8)/38);
  for(let i=0;i<count;i++){
   const k=i/count,cy=9+Math.round(k*(H-16))+Math.floor(hash(i,s,1)*5),spread=Math.round(k*4)-1;
   const sw=8+Math.floor(hash(i,s,2)*13),sh=6+Math.floor(hash(i,s,3)*7),sx=-spread+Math.floor(hash(i,s,4)*(w+spread*2-sw+1)),v=hash(i,s,5);
   const y1=Math.min(H,cy+sh),half=Math.round(sw/2),tilt=v>.66?1:v<.33?-1:0,tone=tones[Math.floor(v*tones.length)];
   box(c,'#10161d',sx-1,cy-1,sw+2,y1-cy+2);
   box(c,tone,sx,cy+(tilt>0?1:0),half,y1-cy-(tilt>0?1:0));box(c,tone,sx+half,cy+(tilt<0?1:0),sw-half,y1-cy-(tilt<0?1:0));
   box(c,'#5a6671',sx,cy+(tilt>0?1:0),half,1);box(c,'#5a6671',sx+half,cy+(tilt<0?1:0),sw-half-1,1);box(c,'#2c353f',sx,y1-1,sw,1);box(c,'#2c353f',sx+sw-1,cy+1,1,y1-cy-1);
   // Some are lengths of rib, with the roll moulding still on them.
   if(sw>14&&sh>7&&hash(i,s,6)>.5){box(c,'#6b7782',sx+2,cy+3,sw-4,1);box(c,'#2c353f',sx+2,cy+5,sw-4,1);}
  }
  // The top stone lies flat: you stand on its bed.
  box(c,N0,0,0,w,11);box(c,N3,0,1,w,9);box(c,N6,0,0,w,2);box(c,N5,0,2,w,1);box(c,N1,0,9,w,1);
  if(hash(s,9,9)>.5){box(c,N5,3,5,w-6,1);box(c,N1,3,7,w-6,1);}else{const m=Math.round(w/2);box(c,N1,m-7,3,14,5);box(c,N4,m-6,4,12,3);box(c,N1,m-2,4,4,3);}
  c.clearRect(0,7,2,4);c.clearRect(w-3,8,3,3);
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
 // A foot-iron on the dial: a chequered plate clamped across one of the wheel's arms by two U-bolts.
 dial(c,w,h,s){
  for(const x of [6,w-12]){
   box(c,I0,x-1,4,8,16);box(c,I3,x,4,6,15);box(c,I5,x,4,1,15);box(c,I0,x+2,8,2,8);
   box(c,I6,x+1,5,4,2);box(c,I5,x+1,17,4,2);
  }
  box(c,I0,-1,0,w+2,6);box(c,I3,0,0,w,5);box(c,I6,0,0,w,1);box(c,I5,0,1,w,1);box(c,I1,0,4,w,1);
  for(let x=3;x<w-3;x+=6)box(c,I2,x,2,2,2);
  box(c,RUST,Math.round(w*.5)+s%5-3,3,5,1);
 },
 // A rung of the iron ladder: a flat bar let into the east wall, a stay under it back to the wall, the ladder's stile through its free end.
 ladder(c,w,h,s){
  stroke(c,I0,4,5,w,27,3);stroke(c,I3,4,5,w,26,2);stroke(c,I5,4,5,w-1,25,1);
  box(c,I0,w-3,-3,7,34);box(c,I3,w-2,-2,5,32);box(c,I6,w-2,-2,5,1);box(c,LEAD,w-1,1,3,2);box(c,LEAD,w-1,25,3,2);
  box(c,I0,-1,0,w+2,7);box(c,I3,0,0,w,5);box(c,I6,0,0,w,1);box(c,I5,0,1,w,1);box(c,I1,0,5,w,1);
  for(let x=4;x<w-4;x+=6)box(c,I2,x,2,2,2);
  box(c,I0,1,-3,6,13);box(c,I4,2,-2,4,11);box(c,I6,2,-2,1,11);
  box(c,RUST,Math.round(w*.3)+s%9,3,7,1);box(c,'#4a2f2488',w-1,29,2,6);
 },
 // The bell hoist's pallet: new oak boards on two bearers, an eye bolt at each end for the slings.
 pallet(c,w){
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
  // A collar where the bar goes into each wall; the wall carries it on through to its pattress plate.
  for(const x of [-4,w]){box(c,I0,x,-5,4,16);box(c,I3,x,-4,4,14);box(c,I6,x,-4,4,1);box(c,I5,x+(x<0?3:0),-4,1,14);}
 },
 // A rail of the bell frame: an oak beam strapped in iron where its posts are tenoned up into it.
 frame(c,w,h,s){
  box(c,TK,-1,0,w+2,12);box(c,T2,0,0,w,11);box(c,T5,0,0,w,2);box(c,T4,0,2,w,1);box(c,T1,0,8,w,3);
  for(let x=8+s%6;x<w-10;x+=13+Math.floor(hash(x,s,1)*8))box(c,T1,x,4+Math.floor(hash(x,s,2)*2),4+Math.floor(hash(x,s,3)*6),1);
  for(const x of w<50?[Math.round(w/2)-7]:[4,w-18]){box(c,I0,x,-1,14,13);box(c,I3,x+1,0,12,11);box(c,I6,x+1,0,12,1);for(const dx of [3,10])for(const dy of [3,8])box(c,I6,x+dx,dy,1,1);}
  box(c,TK,-1,3,2,6);box(c,TK,w-1,3,2,6);
 },
 // The tenor's headstock: an elm beam, the bell's straps bolted up through it, a gudgeon in an iron plate at each end.
 headstock(c,w,h,s){
  const m=Math.round(w/2);
  box(c,TK,-1,0,w+2,h);box(c,T2,0,0,w,h-1);box(c,T5,0,0,w,2);box(c,T4,0,2,w,1);box(c,T1,0,h-6,w,5);box(c,T0,0,h-2,w,1);
  for(let x=12+s%7;x<w-14;x+=15+Math.floor(hash(x,s,1)*9))box(c,T1,x,5+Math.floor(hash(x,s,2)*5),5+Math.floor(hash(x,s,3)*8),1);
  for(const x of [m-15,m-6,m+4,m+13]){box(c,I0,x-1,2,4,h-2);box(c,I3,x,2,2,h-2);box(c,I0,x-2,-1,6,4);box(c,I5,x-1,-1,4,2);box(c,I6,x-1,-1,4,1);}
  for(const x of [0,w-10]){box(c,I0,x,4,10,12);box(c,I3,x+1,5,8,10);box(c,I6,x+1,5,8,1);box(c,I0,x+4,8,2,4);}
  box(c,I0,-4,7,4,6);box(c,I5,-4,8,4,2);box(c,I0,w,7,4,6);box(c,I5,w,8,4,2);
 },
 // A louvre board, housed at each end in the stiles of its belfry opening and wet with the rain.
 louvre(c,w,h,s){
  for(const x of [-4,w]){box(c,TK,x,-8,4,h+16);box(c,T1,x+(x<0?0:1),-8,3,h+16);box(c,T2,x<0?x:x+1,-8,1,h+16);}
  box(c,TK,-2,0,w+4,9);box(c,T3,-1,0,w+2,8);box(c,T5,-1,0,w+2,2);box(c,T4,-1,2,w+2,1);box(c,T2,-1,5,w+2,2);box(c,T1,-1,7,w+2,1);
  for(let x=4+s%5;x<w-6;x+=9+Math.floor(hash(x,s,1)*6))box(c,'#9fb7c8',x,0,2+Math.floor(hash(x,s,2)*3),1);
  box(c,'#6f8fb455',Math.round(w*.6),8,1,3);
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
PAINT.landing=PAINT.loft=PAINT.gallery=PAINT.floor;
/** Extra pixels below a landing's box that its tile paints: a corbel, a bracket, its shadow on the wall. */
const DEPTH:Record<string,number>={
 step:8,floor:6,landing:6,loft:6,gallery:6,box:6,chest:6,press:6,clockcase:6,rubble:6,tread:16,putlog:6,corbel:12,bracket:20,dial:8,ladder:24,tiebar:4,louvre:8,aumbry:6,
};
export const deckDepth=(p:Platform)=>DEPTH[p.tag??'']??0;
/** How each end of a landing's floor finishes, from what stands next to it. */
function ends(p:Platform,l:Level):readonly [End,End]{
 const foot=p.y+p.h,a=p.x,b=p.x+p.w,joins=(x:number)=>l.platforms.some(q=>q!==p&&q.kind==='stone'&&q.y+q.h===foot&&(q.x===x||q.x+q.w===x));
 return [a<=WEST?'wall':joins(a)?'join':a>=WELL1&&a<=WELL1+24?'trim':'broken',b>=EAST?'wall':joins(b)?'join':b<=WELL0&&b>=WELL0-16?'trim':'broken'];
}
/** Paints one landing as the thing its tag names; (0,0) is its top-left corner. Its place in the tower seeds it, so two landings of one size are not twins. */
export function paintDeck(c:C,p:Platform,l:Level){(PAINT[p.tag??'floor']??PAINT.floor)(c,p.w,p.h,(p.w*31+p.h*17+p.x*7+p.y*13)|0,ends(p,l),p);}

/** A bronze bell hung by its canons: `top` is the underside of its headstock, (w,h) the bell itself. */
export function bell(c:C,cx:number,top:number,w:number,h:number){
 box(c,I0,cx-6,top,12,7);box(c,I3,cx-5,top,10,6);box(c,I5,cx-5,top,2,6);box(c,I0,cx-2,top+1,4,4);
 const y0=top+6;
 for(let i=0;i<h;i++){
  const p=i/h,half=Math.round(w/2*(Math.min(.36,.2+i*.05)+.26*p+.2*p*p*p+(p>.86?(p-.86)*1.3:0)));
  box(c,'#4f422a',cx-half,y0+i,half*2,1);box(c,'#75633d',cx-half+2,y0+i,Math.max(1,Math.round(half*.5)),1);box(c,'#96804e',cx-half+3,y0+i,Math.max(1,Math.round(half*.16)),1);box(c,'#352c1c',cx+half-3,y0+i,3,1);
 }
 box(c,'#352c1c',cx-Math.round(w/2),y0+h-2,w,2);box(c,'#8c7648',cx-Math.round(w/2)+2,y0+h-2,Math.round(w*.35),1);
 for(const dy of [Math.round(h*.3),Math.round(h*.36)])box(c,'#352c1c',cx-Math.round(w*.25),y0+dy,Math.round(w*.5),1);
 box(c,'#2b2418',cx-2,y0+h,4,4);
}
/** The clock dial from behind: milk glass in iron cames, the wheel's rim, ring and eight arms, a ring of dressed stone where it is let into the wall. */
export const DIAL_ART=DIAL.r+14;
export const dialArt=()=>sprite('l2/dial',DIAL_ART*2,DIAL_ART*2,c=>{
 const size=DIAL_ART*2,m=DIAL_ART-.5,R=DIAL.r,img=c.createImageData(size,size),d=img.data,glass=[[58,77,104],[63,83,112],[53,71,95],[66,88,120],[49,66,90]];
 for(let py=0;py<size;py++)for(let px=0;px<size;px++){
  const dx=px-m,dy=py-m,r=Math.hypot(dx,dy);if(r>R+12)continue;
  const turn=(Math.atan2(dy,dx)+Math.PI*2.5)%(Math.PI*2);let col:number[];
  if(r>R){
   // Voussoirs: twenty-eight stones, jointed radially, a lit arris on the inside.
   const at=turn/(Math.PI*2)*28,f=at-Math.floor(at);
   col=f<.08||r>R+11?[20,27,35]:r<R+2?[77,90,103]:hash(Math.floor(at),3,1)>.5?[44,55,67]:[39,49,61];
  }else{
   const at=turn/(Math.PI/8),sect=Math.floor(at),f=at-sect,inner=r<R*.68,pane=inner?(sect>>1)+100:sect,v=hash(pane,17,3);
   const g=glass[Math.floor(v*glass.length)],lift=dy<-R*.35?9:dy<R*.15?0:-9;col=[g[0]+lift,g[1]+lift,g[2]+lift];
   // One pane is out and shows the night; one was mended with boards. Grime lies along every came.
   if(pane===5)col=[24,34,52];else if(pane===11)col=((px+py)>>1)%4?[61,46,34]:[35,26,20];
   const came=Math.min(f,1-f)*r*Math.PI/8;
   if((!inner||sect%2===0||f>.5)&&came<1.5||r>R-8)col=[col[0]-13,col[1]-14,col[2]-15];
  }
  const i=(py*size+px)*4;d[i]=col[0];d[i+1]=col[1];d[i+2]=col[2];d[i+3]=255;
 }
 c.putImageData(img,0,0);
 const o=DIAL_ART,arm=(a:number,r0:number,r1:number,color:string,thick:number)=>stroke(c,color,o+Math.cos(a)*r0-thick/2,o+Math.sin(a)*r0-thick/2,o+Math.cos(a)*r1-thick/2,o+Math.sin(a)*r1-thick/2,thick);
 // The hands, stopped, seen through the glass as shadows.
 arm(-2.2,0,R*.74,'#1b2638',3);arm(.35,0,R*.5,'#1b2638',4);
 for(let i=0;i<16;i++)if(i%2)arm(i*Math.PI/8,R*.7,R-5,'#1a2230',1);
 for(let i=0;i<8;i++){arm(i*Math.PI/4,9,R-3,'#0c1116',5);arm(i*Math.PI/4,11,R-4,I2,3);arm(i*Math.PI/4,11,R-4,I4,1);}
 ring(c,'#0c1116',o,o,R-6,R);ring(c,I2,o,o,R-4,R-1);ring(c,I4,o,o,R-2,R-1);ring(c,'#0c1116',o,o,Math.round(R*.68)-2,Math.round(R*.68)+2);ring(c,I3,o,o,Math.round(R*.68)-1,Math.round(R*.68));
 for(let i=0;i<8;i++){const a=i*Math.PI/4;for(const r of [Math.round(R*.68),R-3]){box(c,I5,Math.round(o+Math.cos(a)*r)-1,Math.round(o+Math.sin(a)*r)-1,3,3);}}
 // The hub: a boss on the arbor the hands hang on. The clock's work comes to it through the wall.
 disc(c,'#0c1116',o,o,11);disc(c,I2,o,o,9);disc(c,I4,o,o,5);box(c,I6,o-3,o-4,3,2);box(c,I0,o-1,o-1,3,3);
});

/** The gallery door at the top, the way out: (x,y,w,h) is the doorway. It stands open on the night and the gallery's parapet,
 * its leaf back against the west jamb, a lamp on a bracket beside it. */
export function galleryDoor(c:C,x:number,y:number,w:number,h:number){
 x=Math.round(x);y=Math.round(y);w=Math.round(w);h=Math.round(h);
 c.drawImage(sprite(`l2/exit/${w}/${h}`,w+84,h+38,g=>{
  g.translate(30,34);
  // The lamp's light on the wall, then the stonework.
  disc(g,'#f3c77a0a',w+25,-2,26);disc(g,'#f3c77a0d',w+25,-2,18);disc(g,'#f3c77a14',w+25,-2,11);
  for(let r=0;r*14<h;r++){const b=h-r*14,a=Math.max(0,b-14),long=r%2===0;stone(g,long?-13:-9,a,long?13:9,b-a-1,S3,S4);stone(g,w,a,long?9:13,b-a-1,S3,S4);}
  const top=(px:number)=>-12+Math.round(12*Math.pow(Math.abs((px+1-w/2)/(w/2)),1.6));
  for(let px=-12;px<w+12;px+=2){const t=px<0||px>=w?0:top(px),k=(px+12)>>1;box(g,S0,px,t-11,2,11);box(g,S3,px,t-10,2,9);box(g,'#5a6671',px,t-10,2,1);if(k%4===0)box(g,S0,px,t-10,1,9);}
  // Through it: the night, the rain, and the gallery's parapet.
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
}

const ropeArt=()=>sprite('l2/rope',3,128,c=>{box(c,ROPE,0,0,3,128);box(c,ROPE_LIT,0,0,1,128);box(c,ROPE_DARK,2,0,1,128);for(let y=0;y<128;y+=4){box(c,ROPE_DARK,0,y+2,1,1);box(c,'#6d6248',1,y+1,1,1);box(c,ROPE_LIT,2,y,1,1);}});
const slingArt=(w:number)=>sprite(`l2/slings/${w}`,w,30,c=>{
 const m=Math.round(w/2);
 for(const end of [2,w-3]){stroke(c,ROPE_DARK,m,5,end,28,2);stroke(c,ROPE_LIT,m,5,end,28,1);}
 box(c,I0,m-3,0,7,7);box(c,I4,m-2,1,5,5);box(c,I0,m-1,2,3,3);box(c,I6,m-2,1,5,1);
});
/** The hoist's block: a shackle hooked over the jib, two iron cheeks and the sheave between them. It hangs 36 below the jib. */
export const BLOCK={w:21,h:36};
export const blockArt=()=>sprite('l2/block',BLOCK.w,BLOCK.h,c=>{
 box(c,I0,7,0,7,10);box(c,I4,8,0,5,9);box(c,I0,9,2,3,5);box(c,I6,8,0,5,1);
 box(c,I0,2,9,17,22);box(c,I3,3,10,15,20);box(c,I5,3,10,1,20);box(c,I5,3,10,15,1);
 disc(c,I0,10,20,7);disc(c,'#6d5a36',10,20,6);ring(c,BRASS,10,20,4,6);box(c,I6,9,19,3,3);box(c,BRASS2,6,16,2,1);
 box(c,I0,7,30,7,5);box(c,I4,8,30,5,4);
});
/** The hoist's fall, at the pallet's live place: (x,y,w) is the pallet's top-left and width, `top` the underside of the block.
 * Two slings rise from the pallet's eye bolts to a ring; the rope's lay travels with the pallet. Nothing is painted here but cached pieces. */
export function hoistRope(c:C,x:number,y:number,w:number,top:number){
 x=Math.round(x);y=Math.round(y);
 const m=x+Math.round(w/2),ring0=y-31,rope=ropeArt();
 for(let b=ring0;b>top;b-=128){const a=Math.max(top,b-128);c.drawImage(rope,0,128-(b-a),3,b-a,m-1,a,3,b-a);}
 c.drawImage(slingArt(w),x,ring0);
}
