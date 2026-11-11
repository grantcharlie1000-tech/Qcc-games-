import type {Level,Platform} from './levels';
import type {Run} from './model';
import {lantern} from './props';
import {box,hash,lay,sprite,stroke,visible,type C,type Work} from './quarter-kit';
import type {QuarterSet} from './quarter-sets';
import {BARREL,BELFRY,CHASE0,CHASE1,DIAL,EAST,FOOT_DOOR,GROUND,JIB,OUT_E,OUT_W,RISE,WATER,WELL0,WELL1,WEST,floorLine} from './tower-02';
import {
 B0,B1,B2,B3,B4,BIG,BLOCK,BRASS,BRASS2,BRICK,CHASE,COURSED,CUT,DIAL_ART,FOOT,I0,I1,I2,I3,I4,I5,I6,LEAD,LINING,N0,N1,N2,N3,N5,P0,P1,P2,P4,ROPE,ROPE_DARK,ROPE_LIT,
 S0,S1,S2,S3,S4,SHADE,SHADE2,SKY,SKY_LIT,T1,T2,T3,T5,TK,
 bell,blockArt,deckDepth,dialArt,disc,galleryDoor,gear,hoistRope,paintDeck,ring,stone,
} from './pieces/level-02';

/** Level 2 · the inside of the Quarter's bell tower, seen in section and exactly as wide as the screen.
 * The two cut side walls are the screen's edges; the far wall is whole. One well runs up the middle from
 * the flooded pit to the belfry floor, with the two bell ropes down it. Every storey is one room, in its
 * own work, with the fixed things that make it that room.
 *
 * Everything that stands still is painted once, a storey at a time, into a band the height of a storey:
 * the far wall laid from that storey's floor, the well's lining, the room, the ropes, the two side walls.
 * A frame draws the two or three bands in view, each landing's own tile, and the few things that move:
 * the weights' lines, the hoist's fall, the rain and the water in the pit. */
const F=floorLine;
/** A band runs from under one floor's joists to under the next: storey k's room, and the floor it stands on. */
const bandTop=(k:number)=>F(k+1)+24;
const tagged=(l:Level,tag:string)=>l.platforms.filter(p=>p.tag===tag);
const tone=(hex:string,d:number)=>'#'+[1,3,5].map(i=>Math.max(0,Math.min(255,parseInt(hex.slice(i,i+2),16)+d)).toString(16).padStart(2,'0')).join('');
const vary=(k:Work,d:number,over:Partial<Work>={}):Work=>({...k,stones:k.stones.map(s=>tone(s,d)),lip:tone(k.lip,d),chip:tone(k.chip,d),...over});
/** The far wall, storey by storey: big ashlar at the foot, coursed stone, brick for the middle storeys, stone again for the belfry. No two storeys are laid alike. */
const WORKS:readonly Work[]=[
 BIG,COURSED,vary(COURSED,-3,{course:14,short:14,long:34}),vary(COURSED,3,{course:18,short:26,long:54}),
 vary(BRICK,2),vary(BRICK,-3,{short:8,long:13}),vary(BRICK,0,{course:9,short:14,long:20}),vary(BRICK,3),vary(BRICK,-2,{short:16,long:20}),vary(BRICK,1,{course:7,short:10,long:16}),vary(BRICK,-1,{course:9}),
 vary(COURSED,1,{course:14,short:20,long:40}),vary(COURSED,2),vary(COURSED,0,{course:18,short:24,long:50}),vary(COURSED,3,{course:14}),vary(COURSED,1,{short:30,long:60}),
];
/** The head of the walls, the tie beam that lies on them, and the point of the spire. */
const PLATE=F(16),TIE=PLATE-22,APEX=TIE-560;
const CHASE_TOP=F(8)+8,CHASE_FOOT=F(5)+24,LINE='#878c8e';
/** Windows in the far wall, seen from inside: the night and the rain. [x, head]. */
const SLITS:readonly (readonly [number,number])[]=[[540,F(1)-134],[520,F(3)-140],[520,F(5)-136],[560,F(7)-142],[100,F(10)-132],[470,F(11)-134]];
/** Windows through the side walls, where the section cuts them: [west, head, sill]. */
const SLOTS:readonly (readonly [boolean,number,number])[]=[
 [true,F(1)-150,F(1)-112],[true,F(4)-150,F(4)-112],[true,F(8)-150,F(8)-112],[true,F(10)-140,F(10)-102],
 [false,F(2)-150,F(2)-112],[false,F(5)-130,F(5)-92],[false,F(7)-150,F(7)-112],[false,F(11)-150,F(11)-112],
];
/** Landings that are a stretch of floor, or stand on one. */
const FLOORED=new Set(['floor','landing','loft','gallery','box','chest','press','clockcase','rubble']);

// Timber, iron and poles in the dark behind the landings.
const post=(c:C,x:number,y0:number,y1:number,w=8)=>{box(c,B0,x-1,y0,w+2,y1-y0);box(c,B2,x,y0,w,y1-y0);box(c,B4,x,y0,2,y1-y0);box(c,B1,x+w-2,y0,2,y1-y0);};
const rail=(c:C,x0:number,x1:number,y:number,d=12)=>{box(c,B0,x0,y-1,x1-x0,d+2);box(c,B2,x0,y,x1-x0,d);box(c,B4,x0,y,x1-x0,2);box(c,B1,x0,y+d-3,x1-x0,3);};
const endOn=(c:C,x:number,y:number,w:number,h:number)=>{box(c,B0,x-1,y-1,w+2,h+2);box(c,B2,x,y,w,h);box(c,B4,x,y,w,1);box(c,B1,x+2,y+3,w-4,h-5);box(c,B0,x+Math.floor(w/2)-1,y+Math.floor(h/2),2,2);};
const brace=(c:C,x0:number,y0:number,x1:number,y1:number,t=3)=>{stroke(c,B0,x0-1,y0-1,x1-1,y1-1,t+2);stroke(c,B2,x0,y0,x1,y1,t);stroke(c,B4,x0,y0,x1,y1,1);};
const pole=(c:C,x:number,y0:number,y1:number)=>{box(c,P0,x-1,y0,7,y1-y0);box(c,P2,x,y0,5,y1-y0);box(c,P4,x,y0,1,y1-y0);box(c,P1,x+3,y0,2,y1-y0);};
const ledger=(c:C,x0:number,x1:number,y:number)=>{box(c,P0,x0,y-1,x1-x0,6);box(c,P2,x0,y,x1-x0,4);box(c,P4,x0,y,x1-x0,1);};
const lash=(c:C,x:number,y:number)=>{box(c,ROPE_DARK,x-1,y-1,7,7);stroke(c,ROPE_LIT,x-1,y-1,x+5,y+5);stroke(c,ROPE,x+5,y-1,x-1,y+5);};
const hole=(c:C,x:number,y:number,w=8,h=8)=>{box(c,'#05070a',x,y,w,h);box(c,S3,x-1,y+h,w+2,1);box(c,S0,x-1,y-1,w+2,1);};
const iron=(c:C,x:number,y:number,w:number,h:number)=>{box(c,I0,x-1,y-1,w+2,h+2);box(c,I3,x,y,w,h);box(c,I5,x,y,w>h?w:1,w>h?1:h);};

/** Dressed stones up an edge, long and short by turns, toothed into the wall beside them. */
function quoins(c:C,x:number,from:number,to:number,right:boolean,wide=10){
 for(let y=from-((from%16)+16)%16;y<to;y+=16){
  const a=Math.max(from,y+1),b=Math.min(to,y+15);if(b<=a)continue;
  const w=(y/16&1)?wide:wide-4,v=hash(y,x,41),at=right?x:x+wide-w;
  box(c,v>.5?'#27313c':'#29333e',at,a,w,b-a);if(a===y+1)box(c,'#333e4a',at,a,w,1);box(c,'#1b232c',at,b-1,w,1);
 }
}
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

/** Which floor lines carry a bearer into the west and east walls. Every storey has its pocket; a floor that is still there has its bearer in it. */
function bearings(l:Level){
 const lines=new Map<number,[boolean,boolean]>();
 for(let k=1;k<15;k++)lines.set(F(k),[false,false]);
 for(const p of l.platforms){
  if(p.kind!=='stone'||!FLOORED.has(p.tag??''))continue;
  const y=p.y+p.h-28,west=p.x<=WEST,east=p.x+p.w>=EAST;if(!west&&!east)continue;
  const at=lines.get(y)??[false,false];at[0]||=west;at[1]||=east;lines.set(y,at);
 }
 return lines;
}
/** A window through a side wall, cut by the section: a lintel the courses stop under, the far reveal, a sill that falls to the outside. */
function slot(c:C,west:boolean,y0:number,y1:number){
 const x=west?OUT_W:EAST,out=west?x:x+26,h=y1-y0;
 box(c,'#131b26',x,y0,40,h);box(c,'#1c2940',out,y0,14,h);box(c,SKY,west?x:x+36,y0,4,h);box(c,'#0b0f14',west?x+37:x,y0,3,h);
 for(let i=0;i<3;i++)box(c,'#b9c9d944',out+2+i*4,y0+3+Math.floor(hash(i,y0,1)*(h-10)),1,5);
 box(c,'#1d252e',x,y0-10,40,10);box(c,'#4c5864',x+1,y0-9,38,8);box(c,'#6b7782',x+1,y0-9,38,1);box(c,'#2c353f',x+1,y0-2,38,1);box(c,'#1d252e',x+20,y0-9,1,8);
 for(let i=0;i<40;i++){const d=west?39-i:i,fall=Math.round(d*.15);box(c,'#1d252e',x+i,y1+fall-1,1,8);box(c,'#4c5864',x+i,y1+fall,1,6);box(c,d>26?'#4d6a7a':'#7a8690',x+i,y1+fall,1,1);}
}
/** The door at the foot, the one you came in by: an opening through the west wall under its lintel, and the oak leaf shut in it, barred. */
function footDoor(c:C){
 const {x,y,w,h}=FOOT_DOOR,g=y+h,lx=x+4,lw=w-8,bar=y+34;
 box(c,'#0b0f14',x,y,w,h);box(c,'#232c36',x,y,3,h);box(c,'#1a222b',x+w-3,y,3,h);
 box(c,'#1d252e',x,y-12,w,12);box(c,'#4c5864',x+1,y-11,w-2,10);box(c,'#6b7782',x+1,y-11,w-2,1);box(c,'#2c353f',x+1,y-2,w-2,1);box(c,'#1d252e',x+13,y-11,1,10);box(c,'#1d252e',x+27,y-11,1,10);
 // Seven oak planks on three ledges, studded, hung on two strap hinges from the outer jamb.
 box(c,TK,lx-1,y+1,lw+2,h-5);
 for(let px=lx,i=0;px<lx+lw;px+=5,i++){const wide=Math.min(4,lx+lw-px);box(c,i%2?T2:'#4d3a2a',px,y+2,wide,h-7);box(c,T1,px+wide,y+2,1,h-7);box(c,i%2?T3:T2,px,y+2,wide,1);}
 for(const ly of [y+8,y+52]){box(c,TK,lx,ly-1,lw,7);box(c,T3,lx,ly,lw,5);box(c,T5,lx,ly,lw,1);for(let px=lx+3;px<lx+lw-2;px+=5)box(c,I5,px,ly+2,1,1);}
 for(const ly of [y+14,y+46]){box(c,I0,lx-2,ly-1,lw-6,5);box(c,I3,lx-1,ly,lw-8,3);box(c,I6,lx-1,ly,lw-8,1);box(c,I0,lx-3,ly-3,4,9);box(c,I4,lx-2,ly-2,2,7);}
 // The drawbar across it in two staples, and the ring you pulled it shut by.
 box(c,TK,lx-3,bar-1,lw+6,8);box(c,T3,lx-2,bar,lw+4,6);box(c,T5,lx-2,bar,lw+4,1);box(c,T1,lx-2,bar+5,lw+4,1);
 for(const sx of [lx+2,lx+lw-7]){box(c,I0,sx-1,bar-3,6,12);box(c,I3,sx,bar-2,4,10);box(c,I6,sx,bar-2,4,1);}
 ring(c,I0,lx+lw-8,y+26,2,4);ring(c,I5,lx+lw-8,y+26,3,3);
 // The rain comes in under it onto the threshold.
 box(c,N0,x,g-5,w,5);box(c,N2,x,g-4,w,4);box(c,N5,x,g-4,w,1);box(c,'#4d6a7a',x+3,g-5,26,1);box(c,'#6f8fb466',x+20,g-3,14,1);
}
/** The two side walls for one band, where the section cuts them, and everything that is let into them. */
function sides(c:C,l:Level,k:number,top:number){
 for(const west of [true,false]){
  const x=west?OUT_W:EAST,seed=(west?3:7)*101+k*13;
  c.save();c.translate(x,top);
  if(k<0)lay(c,WEST-OUT_W,RISE,FOOT,seed);
  else{
   core(c,WEST-OUT_W,RISE,seed);skin(c,west?WEST:0,RISE,7,11,west,seed,true);skin(c,west?0:WEST,RISE,6,10,!west,seed+1,false);
   box(c,'#8a949b',west?WEST-1:0,0,1,RISE);box(c,'#141b23',west?0:WEST-1,0,1,RISE);
  }
  c.restore();
 }
 for(const [y,bears] of bearings(l))for(const west of [true,false]){
  // A pocket the courses stop round, a padstone under it, and the bearer's tail if the floor is still there.
  const face=west?WEST:EAST,px=west?face-13:face,held=bears[west?0:1];
  box(c,'#0b0f14',px,y+4,13,21);stone(c,west?face-15:face,y+25,15,6,'#6b7782','#8a949b');
  if(held){box(c,TK,px+(west?1:0),y+6,12,19);box(c,T1,px+(west?2:0),y+7,11,17);box(c,T3,px+(west?2:0),y+7,11,1);for(let i=0;i<3;i++)box(c,TK,px+3,y+11+i*4,7-i,1);}
  else{box(c,'#1d252e',px+(west?1:8),y+19,4,6);box(c,B2,px+(west?7:2),y+21,4,4);}
 }
 for(const [west,y0,y1] of SLOTS)slot(c,west,y0,y1);
 for(const p of l.platforms){
  if(p.x+p.w<EAST&&p.x>WEST)continue;
  if(p.tag==='tiebar')for(const x of [OUT_W,EAST]){
   // The tie bar runs through a sleeve in each wall to a pattress plate and a nut on the outside.
   const outer=x===OUT_W?x:x+35;box(c,'#0b0f14',x,p.y-1,40,8);box(c,I3,x,p.y+1,40,3);box(c,I5,x,p.y+1,40,1);box(c,I1,x,p.y+4,40,1);
   iron(c,outer+1,p.y-10,3,26);box(c,I6,outer+(x===OUT_W?3:1),p.y-10,1,26);iron(c,x===OUT_W?outer+5:outer-4,p.y-1,3,8);
  }else if(p.tag==='ladder'){box(c,'#0b0f14',EAST,p.y-1,17,8);box(c,I3,EAST,p.y+1,15,3);box(c,I5,EAST,p.y+1,15,1);box(c,LEAD,EAST,p.y-1,3,8);}
  // A stone corbel or stair tread at the east wall is a through-stone: its tail is in the wall.
  else if((p.tag==='corbel'||p.tag==='step')&&p.x+p.w>=EAST)stone(c,EAST,p.y+1,16,p.h-4,'#56626d','#8a949b');
 }
 if(top+RISE>FOOT_DOOR.y-12&&top<GROUND)footDoor(c);
}

/** What the tower is built of at every floor line: the bearing course with the pockets of joists that are gone, and round the well its two trimmers on their corbels. */
function floorAt(c:C,j:number,ropes:readonly number[]){
 const y=F(j),well=j<12;
 const spans:readonly (readonly [number,number])[]=j>12?[[WEST,EAST]]:[[j>4&&j<9?CHASE1+6:WEST,well?WELL0-12:WELL0-8],[well?WELL1+12:WELL1+8,EAST]];
 for(const [a,b] of spans){
  box(c,S0,a,y+9,b-a,1);box(c,S1,a,y+10,b-a,12);box(c,'#2e3946',a,y+10,b-a,1);box(c,S0,a,y+22,b-a,1);
  for(let x=a+8+Math.floor(hash(j,a,3)*10);x<b-10;x+=26){
   box(c,'#0b0f14',x,y+11,8,10);
   // Here and there the rotted end of a joist is still in its pocket.
   if(hash(x,j,4)>.72){box(c,B1,x+1,y+13,6,8);box(c,B3,x+1,y+13,6,1);}
  }
 }
 if(j>12)return;
 if(well)for(const tx of [WELL0-12,WELL1]){
  stone(c,tx,y+24,12,5,S2,S3);box(c,SHADE2,tx-1,y+30,14,3);
  box(c,B0,tx,y+5,12,19);box(c,B2,tx+1,y+6,10,17);box(c,B4,tx+1,y+6,10,1);box(c,B1,tx+3,y+9,6,11);box(c,B0,tx+5,y+12,2,5);
 }
 // A rope guide for each bell rope: an iron eye on a plate leaded into the well's lining. Nothing reaches across the well.
 for(const x of ropes){box(c,I0,x-5,y+9,12,12);box(c,I3,x-4,y+10,10,10);box(c,I6,x-4,y+10,10,1);box(c,'#05070a',x-1,y+12,4,6);box(c,LEAD,x-4,y+11,2,2);box(c,LEAD,x+4,y+17,2,2);}
}
/** The well's lining, the weight chase, and the dark in the corners: what the far wall is besides its storeys' work. */
function fabric(c:C,k:number,top:number,ropes:readonly number[]){
 if(k<12){
  c.save();c.translate(WELL0,top);lay(c,WELL1-WELL0,RISE,LINING,k*13+2);c.restore();
  box(c,'#05070a',WELL0,top,3,RISE);box(c,'#05070a66',WELL0+3,top,5,RISE);box(c,'#222a33',WELL1-1,top,1,RISE);
  quoins(c,WELL0-10,top,top+RISE,false);quoins(c,WELL1,top,top+RISE,true);
 }
 const a=Math.max(top,CHASE_TOP),b=Math.min(top+RISE,CHASE_FOOT);
 if(b>a){
  // The chase: a recess up the far wall by the west corner, lined in thin brick, with the two battens the weights ride between.
  c.save();c.beginPath();c.rect(CHASE0,a,CHASE1-CHASE0,b-a);c.clip();c.translate(CHASE0,top);lay(c,CHASE1-CHASE0,RISE,CHASE,k*17+1);c.restore();
  box(c,'#05070a8c',CHASE1-4,a,4,b-a);quoins(c,CHASE1,a,b,true,8);
  for(const x of [CHASE0+49,CHASE1-6]){box(c,B0,x,a,5,b-a);box(c,B2,x+1,a,3,b-a);box(c,B4,x+1,a,1,b-a);for(let y=a-(a%48)+20;y<b;y+=48)iron(c,x-1,y,7,3);}
 }
 if(k===4)stone(c,CHASE0,CHASE_FOOT,CHASE1-CHASE0+8,6,S2,S4);
 for(const j of [k,k+1])if(j>0&&j<15)floorAt(c,j,ropes);
 if(k>=0&&k<16){box(c,SHADE,WEST,top,3,RISE);box(c,SHADE2,WEST+3,top,4,RISE);box(c,SHADE,EAST-3,top,3,RISE);box(c,SHADE2,EAST-7,top,4,RISE);}
}
/** The two bell ropes: from the bells' wheels down the well, through every floor's guide, to their sallies at the ringing floor. */
function ropes(c:C,xs:readonly number[],from:number){
 const sally=F(1)-76;
 for(const [i,x] of xs.entries()){
  box(c,ROPE_DARK,x-1,from,4,sally-from);box(c,ROPE,x,from,2,sally-from);box(c,ROPE_LIT,x,from,1,sally-from);
  box(c,TK,x-2,sally-1,6,30);for(let s=0;s<7;s++)box(c,s%2?'#c9cfc6':i?'#3f5f8a':'#9a4a43',x-1,sally+s*4,4,4);
  // The tail, doubled back on itself and tied.
  box(c,ROPE,x,sally+29,2,34);box(c,ROPE_LIT,x,sally+29,1,34);box(c,ROPE_DARK,x+2,sally+44,1,18);box(c,ROPE,x-1,sally+61,5,4);box(c,ROPE_LIT,x-1,sally+61,5,1);
 }
}
/** A window in the far wall: a slit under its lintel, the night in it, the wet it lets in down the wall under its sill. */
function slit(c:C,x:number,y:number){
 box(c,'#10161d',x-6,y-4,22,60);box(c,S2,x-4,y-2,4,56);box(c,'#161d26',x+10,y-2,4,56);
 box(c,SKY,x,y,10,52);box(c,SKY_LIT,x+1,y+1,3,50);
 stone(c,x-9,y-13,28,9,S2,S4);box(c,S0,x+5,y-12,1,8);
 box(c,'#3b4753',x-6,y+52,22,3);box(c,'#4d5a67',x-6,y+52,22,1);box(c,'#4d6a7a',x-4,y+51,18,1);
 box(c,'#6f8fb414',x-3,y+55,16,30);box(c,'#6f8fb40c',x-6,y+85,22,26);
 box(c,'#10161d',x+2,y+55,5,26);box(c,'#10161d',x+3,y+81,3,20);box(c,'#10161d',x+4,y+101,1,12);
}
/** A louvred belfry opening: jambs long and short, a pointed head in small voussoirs, a board every sixteen pixels in its frame. */
function louvred(c:C,x:number,y:number,w:number,h:number){
 for(let r=0;r*16<h;r++){const b=y+h-r*16,a=Math.max(y,b-16),long=r%2===0;stone(c,long?x-10:x-6,a,long?10:6,b-a-1,S2,S3);stone(c,x+w,a,long?6:10,b-a-1,S1,S2);}
 const head=(px:number)=>y-16+Math.round(16*Math.pow(Math.abs((px+1-w/2)/(w/2)),1.5));
 for(let px=-8;px<w+8;px+=2){const t=px<0||px>=w?y:head(px);box(c,S0,x+px,t-8,2,8);box(c,S2,x+px,t-7,2,6);box(c,S4,x+px,t-7,2,1);if(((px+8)>>1)%4===0)box(c,S0,x+px,t-7,1,6);}
 for(let px=0;px<w;px+=2){const t=head(px);box(c,'#26354d',x+px,t,2,y+h-t);if(px<6)box(c,SKY,x+px,t,2,y+h-t);}
 box(c,'#2c3d58',x,y+Math.round(h*.6),w,h-Math.round(h*.6));
 for(const sx of [0,w-4]){const t=head(sx?w-3:2);box(c,B0,x+sx,t,4,y+h-t);box(c,B2,x+sx+(sx?1:0),t+1,3,y+h-t-1);}
 for(let ly=y+8;ly<y+h-3;ly+=16){box(c,'#10161d',x+4,ly,w-8,6);box(c,'#1c2530',x+4,ly,w-8,4);box(c,'#2b3643',x+4,ly,w-8,1);}
 stone(c,x-10,y+h,w+20,4,'#3b4753','#4d5a67');box(c,'#4d6a7a',x-8,y+h-1,w+16,1);
 for(const dx of [6,Math.round(w/2),w-8])box(c,'#0c111766',x+dx,y+h+5,2,6+Math.floor(hash(dx,x,3)*10));
}

/** Storey 0, the tower foot: a plinth course, the sockets of the stair's lost treads, a lamp for whoever waits by the door. */
function foot(c:C){
 const y=F(0),lx=208,ly=y-112;
 for(const [a,b] of [[WEST,WELL0-32],[WELL1+32,EAST]] as const){
  box(c,S0,a,y-17,b-a,1);box(c,S1,a,y-16,b-a,16);box(c,S3,a,y-16,b-a,1);box(c,'#2e3946',a,y-15,b-a,2);
  for(let x=a+30,i=0;x<b;x+=44+Math.floor(hash(i++,9,2)*30))box(c,S0,x,y-15,1,15);
 }
 for(const [x,dy,w] of [[398,32,18],[472,64,16],[490,80,14]] as const){box(c,'#080b10',x,y-dy,w,8);box(c,S0,x-1,y-dy+8,w+2,1);box(c,N1,x+2,y-dy+2,5,6);box(c,N3,x+2,y-dy+2,4,1);}
 iron(c,lx-16,ly-14,3,16);box(c,I0,lx-13,ly-11,15,3);box(c,I4,lx-13,ly-11,15,1);stroke(c,I3,lx-12,ly-1,lx-2,ly-9);
 lantern(c,lx,ly,'#f3c77a',true);
}
/** Storey 1, the ringing floor: the peal board. The sallies are on the ropes in the well. */
function ringing(c:C){
 const x=422,y=F(1)-120;
 box(c,'#120d0a',x,y,68,48);box(c,'#2a1e16',x+2,y+2,64,44);box(c,'#3b2a1e',x+2,y+2,64,1);box(c,BRASS,x+8,y+6,52,2);box(c,'#6d5a36',x+18,y+11,32,1);
 for(let r=0;r<5;r++)for(let k=0;k<3;k++)box(c,'#5a4a30',x+7+k*19,y+17+r*5,14-((r+k)%3)*3,1);
 for(const hx of [x+3,x+62])box(c,I5,hx,y-2,3,3);
}
/** Storey 2, the rotten floor: what is left of its joists where the boards have gone, the damp, and what the rotten timbers lie on. */
function rotten(c:C,l:Level){
 const y=F(2);
 for(const p of tagged(l,'joist'))for(const x of [p.x+2,p.x+p.w-12]){stone(c,x,p.y+12,10,5,S3,S4);stone(c,x+2,p.y+17,6,4,S2,S3);box(c,SHADE2,x+1,p.y+22,8,3);}
 for(const p of tagged(l,'beam'))for(const x of [p.x-3,p.x+p.w-4]){
  // An iron stirrup off each trimmer: the beam lies in the pair of them.
  box(c,I0,x,p.y-9,7,26);box(c,I3,x+1,p.y-8,5,24);box(c,I5,x+1,p.y-8,1,24);box(c,'#05070a',x+2,p.y,3,12);box(c,I6,x+3,p.y-5,1,1);box(c,I6,x+3,p.y+13,1,1);
 }
 for(const [x,droop] of [[150,4],[178,2],[204,6]] as const){box(c,'#080b10',x-1,y+9,10,12);box(c,B0,x-1,y+8+droop,10,13);box(c,'#3b332b',x,y+9+droop,8,11);box(c,'#4a4136',x,y+9+droop,8,1);box(c,B1,x+2,y+12+droop,4,5);}
 // One joist has dropped at its far end and hangs by the other; the boards it carried are in the pit.
 box(c,'#080b10',123,y+9,10,12);stroke(c,B0,125,y+8,138,y+36,6);stroke(c,'#3b332b',126,y+9,139,y+35,4);stroke(c,'#4a4136',126,y+9,139,y+35,1);
 for(const [x,top,len] of [[548,y-170,150],[70,y-150,120],[410,y-120,96]] as const){box(c,'#1f3a3016',x,top,22,len);box(c,'#1f3a3020',x+7,top,8,len-20);box(c,'#0c1117aa',x+10,top+10,1,len-40);}
 for(const [x,fy] of [[132,y-44],[140,y-36],[566,y-88]] as const){box(c,'#6f6753',x,fy,7,2);box(c,'#9a8f76',x,fy,7,1);box(c,'#6f6753',x+2,fy+2,4,1);}
}
/** Storey 3, the masons' scaffold: standards down to the floor under them, a ledger at every lift, and the row of putlog holes the masons left in the wall. */
function scaffold(c:C,l:Level){
 const lifts=tagged(l,'putlog');if(!lifts.length)return;
 const top=Math.min(...lifts.map(p=>p.y)),x0=WEST+2,x1=180;
 for(const p of lifts)for(const x of [200,236,392,440,488,536,578])hole(c,x,p.y+6);
 // A raking brace from the foot of one standard to the head of the other.
 stroke(c,P0,174,F(3)-10,99,top+30,5);stroke(c,P1,175,F(3)-10,100,top+30,3);
 pole(c,97,top-22,F(2));box(c,P0,92,F(2)-3,15,3);pole(c,171,top+6,F(3));box(c,P0,166,F(3)-3,15,3);
 for(const p of lifts){ledger(c,x0,x1,p.y+13);lash(c,96,p.y+11);lash(c,170,p.y+11);}
 // A gin wheel at the head of the inner standard, and the bucket it raised, left hanging.
 iron(c,177,top+10,7,3);ring(c,I0,186,top+18,3,6);ring(c,I4,186,top+18,4,5);box(c,ROPE,186,top+24,1,44);box(c,TK,180,top+68,13,12);box(c,P2,181,top+69,11,10);box(c,I4,181,top+72,11,1);box(c,I4,181,top+76,11,1);
}
/** Storey 4, the muniment room: a rack of pigeonholes for the rolls, and the aumbry in the wall over its shelf. */
function muniment(c:C,l:Level){
 const x=178,y=F(4)-140,w=78,h=88;
 box(c,B0,x-3,y-3,w+6,h+6);box(c,B2,x-2,y-2,w+4,h+4);box(c,B4,x-2,y-2,w+4,1);box(c,'#08090c',x,y,w,h);
 for(let r=0;r<4;r++)for(let k=0;k<5;k++){
  const cx=x+1+Math.round(k*15.4),cy=y+1+r*22,n=Math.floor(hash(k,r,5)*5);
  box(c,'#0d0f13',cx,cy,14,20);box(c,B3,cx-1,cy+20,16,2);box(c,B2,cx+14,cy,1,20);
  for(let i=0;i<n;i++){const v=hash(i,k*7+r,8);box(c,v>.5?'#6b6048':'#5a5140',cx+1+i*3,cy+15-(i%2)*4,3,5);box(c,'#8a7d5e',cx+1+i*3,cy+15-(i%2)*4,1,1);}
  if(hash(k,r,9)>.8){box(c,'#3d2f24',cx+2,cy+8,10,12);box(c,'#57432f',cx+2,cy+8,10,1);box(c,BRASS,cx+6,cy+13,2,2);}
 }
 for(const p of tagged(l,'aumbry')){
  const nx=p.x+4,nw=p.w-8,ny=p.y-46;
  box(c,'#080b10',nx,ny,nw,46);box(c,'#0d1218',nx+4,ny+4,nw-4,42);box(c,'#05070a',nx,ny,nw,4);
  for(let r=0;r<3;r++){const b=p.y-8-r*13,long=r%2===0;stone(c,long?p.x-4:p.x,b-12,long?10:6,12,S2,S3);stone(c,p.x+p.w-6,b-12,long?6:10,12,S1,S2);}
  stone(c,p.x-6,ny-11,p.w+12,10,S2,S4);box(c,S0,p.x+Math.round(p.w/2),ny-10,1,9);
  // In it: the deed box and a candle end.
  box(c,B0,nx+7,p.y-15,22,15);box(c,B3,nx+8,p.y-14,20,13);box(c,B4,nx+8,p.y-14,20,1);box(c,I4,nx+8,p.y-9,20,1);box(c,BRASS,nx+17,p.y-8,2,3);
  box(c,'#8f8a78',nx+nw-11,p.y-8,3,8);box(c,'#3b3a36',nx+nw-10,p.y-10,1,2);
 }
}
/** Storey 5, the weight shaft: the chase and its battens are part of the wall. Here, the spare lines for the weights, coiled on an iron rail. */
function weightShaft(c:C){
 const x=396,y=F(5)-118;
 iron(c,x,y,58,3);for(const px of [x+2,x+53]){iron(c,px,y-5,3,5);box(c,LEAD,px-1,y-7,5,2);}
 for(const [dx,r] of [[10,9],[30,11],[49,8]] as const){box(c,I4,x+dx,y+3,1,4);ring(c,'#3c4144',x+dx,y+7+r,r-4,r);ring(c,LINE,x+dx,y+7+r,r-3,r-1);ring(c,'#5a5f62',x+dx,y+7+r,r-2,r-2);box(c,'#3c4144',x+dx-2,y+5,5,4);}
}
/** Storey 6, the fallen vault: where its wall ribs were torn out of the far wall, and the springers that stayed. */
function vault(c:C){
 const ceil=F(7)+28,spring=F(6)-96,apex=F(7)+40;
 for(const [x0,x1] of [[CHASE1+10,WELL0-14],[WELL1+14,EAST-2]] as const){
  const mid=(x0+x1)/2,half=(x1-x0)/2,arc=(px:number)=>Math.round(spring-(spring-apex)*(1-Math.pow(Math.abs((px-mid)/half),1.8)));
  for(let px=x0;px<x1;px+=2){
   // Over the arc the wall was never faced: it stood behind the vault's haunches. Along it, the torn bed of the wall rib.
   const top=arc(px+1),v=hash(px,3,7),run=hash(px>>3,3,8),thick=5+Math.floor(run*7);box(c,'#05080c47',px,ceil,2,top-ceil);
   if(v>.8)box(c,'#0b0f1480',px,ceil+4+Math.floor(hash(px,5,1)*Math.max(1,top-ceil-12)),4+Math.floor(v*20)%7,3);
   if(run<.12)continue;
   box(c,run>.6?'#2d3742':'#343f4a',px,top+(run>.8?1:0),2,thick);box(c,'#3d4854',px,top+(run>.8?1:0),2,1);if(run>.35)box(c,'#0f141a',px,top+(run>.8?1:0)+thick,2,1);
   if(v>.5)box(c,'#3e4954',px,top+1+Math.floor(v*17)%thick,2,2);if(v<.14)box(c,'#56626d',px,top+2,2,2);
  }
  for(const [sx,dir] of [[x0,1],[x1,-1]] as const){
   // The lowest rib stones still spring from a moulded corbel; higher up they go one by one.
   stone(c,sx-10,spring+16,20,6,S3,S4);stone(c,sx-7,spring+22,14,5,S2,S3);stone(c,sx-4,spring+27,8,4,S1,S2);
   for(let i=0;i*11+12<half&&i<7;i++){
    if(i===4||i===6)continue;
    const at=sx+dir*(i*11+6),bx=at-5,by=arc(at)+(i?0:1),lost=i===3||i===5;
    box(c,S0,bx-1,by-2,12,14);box(c,lost?'#26303a':S1,bx,by-1,10,12);box(c,lost?'#343f4a':S3,bx,by-1,10,1);box(c,S0,bx,by+4,10,1);box(c,lost?'#2c3640':S2,bx,by+5,10,1);box(c,S0,bx,by+10,10,1);
    if(lost){box(c,'#0b0f14',dir>0?bx+6:bx,by-1,4,6);box(c,'#0b0f14',dir>0?bx+8:bx,by+5,2,4);}
   }
  }
 }
}
/** Storey 7, the clock room: the movement in its iron frame at the head of the chase. Each weight's line winds on its own
 * barrel; each barrel's great wheel drives a second wheel, and that a third. The work goes up to the dial through the wall. */
function clock(c:C,l:Level){
 const lines=tagged(l,'weight').map(p=>p.x+p.w/2).sort((a,b)=>a-b);if(lines.length<2)return;
 const y=BARREL.y,x0=lines[0]-14,x1=lines[1]+14,y0=CHASE_TOP,y1=y+20,mid=Math.round((x0+x1)/2),up=DIAL.y-2;
 for(const [bx,d] of [[x0+7,1],[x1-11,-1]] as const){iron(c,bx,y1,4,15);stroke(c,I2,bx+2,y1+13,bx+2+d*12,y1+2,2);box(c,LEAD,bx-1,y1+10,6,2);}
 box(c,'#090b0f',x0+3,y0+3,x1-x0-6,y1-y0-6);box(c,I1,x0,y-1,x1-x0,3);
 for(const [line,d] of [[lines[0],1],[lines[1],-1]] as const){
  const bx=line+d*12,sx=bx-d*14,sy=y-17,tx=sx+d*8,ty=sy-9;
  gear(c,tx,ty,4,BRASS,BRASS2);gear(c,sx,sy,7,BRASS,BRASS2,.5);gear(c,bx,y,14,'#6d5a36',BRASS2);
  // The barrel, with the line wound on it.
  disc(c,I0,bx,y,11);ring(c,LINE,bx,y,8,10);ring(c,'#5a5f62',bx,y,9,9);disc(c,I2,bx,y,7);disc(c,I4,bx,y,3);box(c,I6,bx-1,y-1,2,2);
 }
 for(const x of [x0,x1-4])iron(c,x,y0,4,y1-y0);
 for(const fy of [y0,y1-4]){iron(c,x0,fy,x1-x0,4);for(const x of [x0+2,x1-4])box(c,I6,x,fy+1,2,2);}
 // The lead-off: a rod up from the movement to a bevel box at the dial's height, and from there into the wall.
 iron(c,mid-1,up,3,y0-up);iron(c,mid-6,up-7,13,10);box(c,I6,mid-5,up-6,11,1);iron(c,mid+8,up-4,22,3);hole(c,mid+30,up-8,6,10);
 // The winding crank, hung up by the east wall.
 for(const px of [436,450])box(c,I5,px,F(7)-96,3,3);iron(c,432,F(7)-93,24,3);iron(c,453,F(7)-92,3,16);box(c,TK,450,F(7)-77,9,6);box(c,B3,451,F(7)-76,7,4);
}
/** Storey 8, behind the dial: the iron wheel let into the far wall, the milk glass behind it, and four holdfasts round its rim. */
function behindDial(c:C){
 c.drawImage(dialArt(),DIAL.x-DIAL_ART,DIAL.y-DIAL_ART);
 for(const a of [.39,2.75,3.53,5.89]){const x=Math.round(DIAL.x+Math.cos(a)*(DIAL.r+7)),y=Math.round(DIAL.y+Math.sin(a)*(DIAL.r+7));iron(c,x-3,y-3,6,6);box(c,I6,x-1,y-1,2,2);}
}
/** Storey 9, the old stair: its wall string from the floor across the well to the half-landing, trenched for twelve treads. Five are left. */
function oldStair(c:C,l:Level){
 const treads=tagged(l,'stair'),landing=tagged(l,'landing').find(p=>p.x<=WEST);if(!treads.length||!landing)return;
 const first=treads.reduce((a,b)=>a.x>b.x?a:b),x0=landing.x+landing.w,x1=first.x+first.w+24;
 // The nosing line passes through every tread's outer top corner: twelve up for thirty-two across.
 const nose=(x:number)=>first.y+(x-first.x-first.w)*.375;
 for(let x=x0;x<x1;x++){const y=Math.round(nose(x))-5;box(c,B0,x,y-1,1,26);box(c,B2,x,y,1,24);box(c,B4,x,y,1,2);box(c,B3,x,y+2,1,1);box(c,B1,x,y+19,1,5);}
 for(let x=x0+14;x<x1-10;x+=34){const y=Math.round(nose(x))+6;if(x<WELL0-6||x>WELL1+6){iron(c,x,y,4,6);box(c,I6,x+1,y+1,1,1);}}
 for(let j=1;j<12;j++){
  // Each tread was housed in a trench with its riser's under it. Where a tread is left its tile covers its own.
  const right=first.x+first.w+64-32*j,y=first.y+24-12*j;
  box(c,'#07090c',right-36,y+1,34,3);box(c,'#07090c',right-36,y+4,2,9);box(c,B3,right-36,y+4,34,1);
 }
 // The newel at the half-landing, snapped off above the handrail's mortise.
 post(c,x0-8,landing.y-26,landing.y,6);box(c,'#07090c',x0-7,landing.y-20,4,5);box(c,B0,x0-9,landing.y-28,3,3);box(c,B0,x0-4,landing.y-29,3,4);
}
/** Storey 10, the corbel table: the corbels that have broken off short, the table of small ones under the floor above, and the iron ladder's stile. */
function corbelTable(c:C,l:Level){
 const y=F(10),ty=F(11)+24,rungs=tagged(l,'ladder');
 for(const [x,dy] of [[92,14],[142,18],[572,30]] as const){
  stone(c,x,y-dy,16,9,'#2b333d','#39434e');stone(c,x+3,y-dy+9,10,5,'#252d36','#333c46');box(c,'#10161d',x+10,y-dy,6,3);box(c,'#10161d',x+13,y-dy+3,3,3);box(c,SHADE2,x+2,y-dy+15,12,4);
 }
 for(const [a,b] of [[WEST,WELL0-12],[WELL1+12,EAST]] as const){
  box(c,S0,a,ty-1,b-a,6);box(c,S2,a,ty,b-a,4);box(c,S4,a,ty,b-a,1);
  for(let x=a+6;x<b-10;x+=22){stone(c,x,ty+5,10,6,S2,S4);stone(c,x+2,ty+11,6,4,S1,S3);}
 }
 if(!rungs.length)return;
 const x=rungs[0].x+1,top=F(11)-18,bottom=Math.max(...rungs.map(p=>p.y))+58;
 box(c,I0,x,top,6,bottom-top);box(c,I4,x+1,top,4,bottom-top);box(c,I6,x+1,top,1,bottom-top);
 // It hooks over to the wall at its head; between the rungs you can stand on are the thin ones you cannot.
 iron(c,x+1,top,EAST-x-1,3);
 for(let ry=top+22;ry<bottom-6;ry+=24)if(!rungs.some(p=>Math.abs(p.y-ry)<10)){box(c,I0,x+6,ry,EAST-x-6,3);box(c,I2,x+6,ry,EAST-x-6,1);}
}
/** Storey 11, the bell hoist: the beams the belfry floor lies on, and the hoist's spare tackle on its pegs. */
function hoistRoom(c:C){
 const y=F(12)+28,cx=566,cy=F(11)-112;
 for(const x of [58,150,240,388]){endOn(c,x,y-4,14,20);stone(c,x+1,y+17,12,5,S2,S4);stone(c,x+3,y+22,8,4,S1,S3);}
 box(c,I5,cx-1,cy-14,3,4);ring(c,ROPE_DARK,cx,cy,6,12);ring(c,ROPE,cx,cy,7,11);ring(c,ROPE_LIT,cx,cy,10,10);box(c,ROPE_DARK,cx-2,cy-12,5,4);
 box(c,I5,cx-25,cy-14,3,4);box(c,ROPE,cx-24,cy-11,1,12);c.drawImage(blockArt(),cx-34,cy);
}
/** Storeys 12 and 13, the belfry: the bell frame standing on the floor, the tenor under its headstock and the treble beside it, each with its wheel
 * and its rope, and the hoist: a windlass on the floor, a jib off the frame's east post over the trap, the block. */
function belfry(c:C,l:Level,ropeXs:readonly number[]){
 const hs=tagged(l,'headstock')[0],frames=tagged(l,'frame');if(!hs)return;
 const axis=hs.y+10,head=hs.y+24,west=frames.find(p=>p.y<hs.y),wx=west?west.x+Math.round(west.w/2)-4:hs.x-68,ex=WELL1+8,mid=hs.x+Math.round(hs.w/2);
 for(const p of frames){
  if(p===west)continue;
  for(const x of [p.x+8,p.x+p.w-14]){
   // A lower rail's posts stand on the belfry floor, or where it is gone on a padstone built out of the wall.
   post(c,x,p.y+12,BELFRY,6);
   if(!l.platforms.some(q=>q.kind==='stone'&&q.y===BELFRY&&q.x<=x&&q.x+q.w>=x+6)){stone(c,x-4,BELFRY,14,6,S3,S4);stone(c,x-2,BELFRY+6,10,5,S2,S3);box(c,SHADE2,x-1,BELFRY+11,8,4);}
  }
 }
 for(const p of tagged(l,'plank')){
  // The plank lies on two cross rails of the cage: one on the east post's head, one on a post up from the rail below it.
  const under=frames.find(q=>q.y>p.y&&q.x<p.x+p.w&&q.x+q.w>p.x+p.w-30),px=under?under.x+under.w-14:p.x+p.w-20;
  if(under)post(c,px,p.y+24,under.y,6);
  endOn(c,p.x+2,p.y+12,12,12);endOn(c,px-3,p.y+12,12,12);
 }
 if(west){post(c,wx,west.y+12,BELFRY);brace(c,wx+3,west.y+44,west.x+5,west.y+12);brace(c,wx+4,west.y+44,west.x+west.w-6,west.y+12);rail(c,wx-14,wx+22,BELFRY-7,7);}
 post(c,ex,head,BELFRY);rail(c,ex-6,ex+18,BELFRY-7,7);
 // The frame's long rail, from post to post behind the bells.
 rail(c,wx+8,ex,head);brace(c,wx+8,head+46,wx+42,head+12);for(const x of [wx+2,ex+2]){box(c,I5,x,head+3,2,2);box(c,I5,x+3,head+7,2,2);}
 // The jib: an arm off the east post over the trap, strutted from below, strapped to the post.
 rail(c,JIB.x,ex,JIB.y,8);brace(c,ex,JIB.y+56,JIB.x+JIB.reach-46,JIB.y+8);iron(c,ex-2,JIB.y-2,12,3);iron(c,ex-2,JIB.y+7,12,3);
 const bx=JIB.x+Math.round(JIB.reach/2),wind=110,drum=BELFRY-28;
 // The windlass on the floor: two cheeks, the drum between them, four handspikes. Its rope runs up to the block.
 stroke(c,ROPE_DARK,bx-3,JIB.y+27,wind+8,drum-9,2);stroke(c,ROPE,bx-3,JIB.y+26,wind+8,drum-10);
 brace(c,wind-17,BELFRY-7,wind-2,BELFRY-46,4);brace(c,wind+17,BELFRY-7,wind+2,BELFRY-46,4);rail(c,wind-24,wind+24,BELFRY-7,7);
 stroke(c,B3,wind-19,drum-13,wind+19,drum+13,2);stroke(c,B3,wind-13,drum+19,wind+13,drum-19,2);
 disc(c,B0,wind,drum,12);disc(c,B3,wind,drum,11);ring(c,ROPE,wind,drum,7,10);ring(c,ROPE_DARK,wind,drum,8,8);disc(c,I3,wind,drum,3);box(c,I6,wind-1,drum-1,2,2);
 c.drawImage(blockArt(),bx-10,JIB.y+6);
 // The tenor: its gudgeons lie on two frame heads seen end-on, its wheel stands edge-on at its east end, the bell hangs under it.
 for(const x of [hs.x-13,hs.x+hs.w+7]){endOn(c,x,axis,12,head-axis);iron(c,x+1,axis-3,10,3);}
 const wheel=ropeXs[0]-2;box(c,B0,wheel-1,axis-41,7,82);box(c,B3,wheel,axis-40,5,80);box(c,B4,wheel,axis-40,1,80);for(const dy of [-30,-16,14,28])box(c,B1,wheel,axis+dy,5,2);box(c,ROPE,wheel+2,axis-40,1,40);
 bell(c,mid,hs.y+hs.h,58,60);
 // The treble swings the other way: its wheel is seen whole, its headstock end-on on the long rail.
 const tx=ropeXs[1]+22;
 ring(c,B0,tx,axis,19,23);ring(c,B3,tx,axis,20,22);ring(c,B4,tx,axis,22,22);
 for(let i=0;i<4;i++){const a=i*Math.PI/4+.3,dx=Math.cos(a)*20,dy=Math.sin(a)*20;stroke(c,B2,tx-dx,axis-dy,tx+dx,axis+dy,2);}
 box(c,ROPE,tx-22,axis-8,1,10);
 iron(c,tx-9,axis+8,18,head-axis-8);endOn(c,tx-6,axis-8,12,16);box(c,I5,tx-1,axis-1,3,3);
 bell(c,tx,axis+8,34,36);
}
/** Storey 14, the tie bar: the louvred belfry openings in the far wall. Three of their boards are the way up. */
function belfryOpenings(c:C,l:Level){
 const boards=tagged(l,'louvre');if(!boards.length)return;
 const top=Math.min(...boards.map(p=>p.y))-24,sill=Math.max(...boards.map(p=>p.y))+24,width=boards[0].w+8;
 for(const x of new Set([76,156,...boards.map(p=>p.x-4)]))louvred(c,x,top,width,sill-top);
}
/** Above the gallery: the head of the far wall under its plate, the tie beam across the tower, and the spire's underside. */
function roof(c:C,top:number){
 c.save();c.translate(WEST,PLATE);lay(c,EAST-WEST,24,COURSED,91);c.restore();
 for(let x=WEST+8;x<EAST-12;x+=28){stone(c,x,PLATE+2,12,6,S2,S4);stone(c,x+2,PLATE+8,8,5,S1,S3);}
 for(let y=Math.max(top,APEX);y<Math.min(top+RISE,TIE+12);y++){
  // Slates outside, rafters and their boarding inside, the dark of the spire between the two slopes.
  const half=Math.round(320*(y-APEX)/(TIE-APEX)),lap=(y-APEX)%9===4;
  box(c,lap?'#111823':'#1a2330',320-half,y,9,1);box(c,'#3a4a5e',320-half,y,1,1);box(c,lap?'#111823':'#1a2330',320+half-9,y,9,1);box(c,'#2c394a',320+half-1,y,1,1);
  if(half>9){box(c,'#090c11',320-half+9,y,half*2-18,1);box(c,B1,320-half+9,y,6,1);box(c,B3,320-half+14,y,1,1);box(c,B1,320+half-15,y,6,1);box(c,B3,320+half-15,y,1,1);}
  if(lap&&half>18)box(c,'#0e1218',320-half+15,y,half*2-30,1);
 }
 for(const cy of [TIE-130,TIE-270,TIE-400]){
  const half=Math.round(320*(cy-APEX)/(TIE-APEX));rail(c,320-half+13,320+half-13,cy,9);
  for(const d of [-1,1])brace(c,320+d*(half-34),cy+9,320+d*(half-16),cy+34);
 }
 for(let y=TIE-64;y>APEX+60;y-=96){const half=Math.round(320*(y-APEX)/(TIE-APEX));for(const d of [-1,1])endOn(c,320+d*(half-21)-4,y,8,7);}
 post(c,316,APEX+40,TIE);for(const d of [-1,1])brace(c,320+d*5,TIE-40,320+d*120,TIE-2,4);
 // The tie beam lies on the plates along the two side walls, which are seen end-on on the walls' heads.
 for(const x of [WEST-20,EAST+6])endOn(c,x,TIE+12,14,PLATE-TIE-12);
 rail(c,OUT_W+4,OUT_E-4,TIE,12);for(const x of [WEST-16,EAST+10]){iron(c,x,TIE+2,3,8);}
 box(c,B0,WEST,PLATE-11,EAST-WEST,12);box(c,B2,WEST,PLATE-10,EAST-WEST,10);box(c,B4,WEST,PLATE-10,EAST-WEST,1);box(c,B1,WEST,PLATE-3,EAST-WEST,3);
}
/** Under the ground floor: the pit's shaft going down through the tower's footing. */
function pit(c:C,top:number){
 for(const y of [WATER-10,WATER+34])if(y>top)box(c,'#3a465340',WELL0+3,y,WELL1-WELL0-4,1);
 box(c,'#2f55461c',WELL0+3,Math.max(top,WATER-9),WELL1-WELL0-4,60);
 // Rungs let into the lining, for whoever has to go down and clear the drain.
 for(let y=Math.max(GROUND+34,top+6);y<top+RISE;y+=14){box(c,'#05070a',WELL0+8,y+1,15,2);box(c,I4,WELL0+8,y,14,1);box(c,I2,WELL0+21,y,1,4);}
}

/** The rooms, each with the stretch of the tower it paints in, so a band paints only what can show in it. */
const ROOMS:readonly (readonly [number,number,(c:C,l:Level,ropes:readonly number[])=>void])[]=[
 [F(1),F(0)+24,foot],[F(2),F(1),ringing],[F(3),F(2)+48,rotten],[F(4)-32,F(2),scaffold],[F(5),F(4),muniment],[F(6),F(5),weightShaft],[F(7),F(6),vault],[F(8)-110,F(7),clock],
 [DIAL.y-DIAL_ART,DIAL.y+DIAL_ART,behindDial],[F(10),F(9)+16,oldStair],[F(11)-32,F(10)+24,corbelTable],[F(12),F(11),hoistRoom],[F(14),F(12)+24,belfry],[F(15)-8,F(14),belfryOpenings],
];
/** One band of the tower, painted once: its far wall, the well and the chase, the rooms, the ropes, the side walls. */
function band(l:Level,k:number){
 return sprite(`l2/band/${k}`,OUT_E-OUT_W,RISE,c=>{
  const top=bandTop(k),hs=tagged(l,'headstock')[0],ropeXs=hs?[hs.x+hs.w+3,hs.x+hs.w+29]:[WELL0+31,WELL1-31];
  c.translate(0,-top);
  if(k>15){
   if(k===16){c.save();c.beginPath();c.rect(OUT_W,TIE+12,OUT_E-OUT_W,RISE);c.clip();sides(c,l,k,top);c.restore();}
   roof(c,top);return;
  }
  c.save();c.translate(WEST,top);lay(c,EAST-WEST,RISE,k<0?FOOT:WORKS[k],k*37+5);c.restore();
  fabric(c,k,top,ropeXs);
  if(k<1)pit(c,top);
  for(const [from,to,room] of ROOMS)if(from<top+RISE&&to>top)room(c,l,ropeXs);
  for(const [x,y] of SLITS)slit(c,x,y);
  ropes(c,ropeXs,hs?hs.y+10:BELFRY);
  sides(c,l,k,top);
 });
}
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 for(let k=-1;k<19;k++){const top=bandTop(k);if(top<cy+vh&&top+RISE>cy)c.drawImage(band(l,k),OUT_W,top);}
 // Rain crosses each window in the far wall, and runs down the wall under its sill.
 for(const [x,y] of SLITS)if(visible(x,y,10,112,cx,cy,vw,vh)){
  for(let i=0;i<3;i++){const fall=((t*70+i*19+x)%46+46)%46;box(c,'#b9c9d966',x+2+i*3,y+1+fall,1,5);}
  box(c,'#8fb4c855',x+4,y+55+((t*26+x)%58+58)%58,1,3);
 }
 // Past the east wall's outer face there is only the ground the tower stands in, and the night over it.
 const right=cx+vw+24,under=GROUND+6;
 if(right>OUT_E&&cy+vh>under){
  box(c,'#0c1116',OUT_E,under,right-OUT_E,cy+vh+24-under);box(c,'#1c2630',OUT_E,under,right-OUT_E,1);box(c,'#232c36',OUT_E,under-10,3,10);
  for(let x=OUT_E+9;x<right;x+=23){const v=hash(x,7,3);box(c,'#141a21',x,under+8+Math.floor(v*40),5+Math.floor(v*7),3);if(v>.6)box(c,'#4d6a7a55',x+3,under,6,1);}
 }
}
function water(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const bottom=cy+vh+24,w=WELL1-WELL0;if(bottom<=WATER-80)return;
 // Drips from the floors above ring the surface.
 for(let i=0;i<2;i++){const p=((t*.7+i*.37)%1+1)%1,x=WELL0+22+i*40;if(t)box(c,'#b9c9d955',x,WATER-76+p*76,1,4);if(t&&p>.85)box(c,'#b9c9d944',x-4,WATER+1,9,1);}
 if(bottom<=WATER)return;
 box(c,'#0b2029',WELL0,WATER,w,bottom-WATER);box(c,'#07141b',WELL0,WATER+12,w,bottom-WATER-12);box(c,'#04080c',WELL0,WATER+34,w,bottom-WATER-34);
 box(c,'#3e6a75',WELL0,WATER,w,1);box(c,'#1e434d',WELL0,WATER+1,w,1);
 for(let i=0;i<4;i++)box(c,'#8fb4b855',WELL0+8+i*20+Math.round(Math.sin(t*1.3+i*2)*4),WATER+3+i%2*4,9,1);
}
function exit(c:C,l:Level,s:Run,t:number,front:boolean){
 if(front)return;
 galleryDoor(c,l.exit.x,l.exit.y,l.exit.w,l.exit.h);
 if(s.phase!=='playing')box(c,'#fff0c433',l.exit.x+9,l.exit.y,l.exit.w-9,l.exit.h);
}
export const bellTower:QuarterSet={
 sky(c,l,w,h,cx,cy,t){
  // The tower covers the screen. The night shows only past its east face in a wide view, and round the spire at the very top.
  box(c,'#0d131d',0,0,w,h);
  const x=Math.max(0,OUT_E-cx);
  if(x<w){
   box(c,'#111a28',x,0,w-x,h);box(c,'#152133',x,Math.round(h*.55),w-x,h-Math.round(h*.55));
   for(let i=0;i<14;i++){const rx=x+((hash(i,1)*(w-x)-t*30)%(w-x)+(w-x))%(w-x),y=((hash(i,2)*h+t*250)%h+h)%h;box(c,'#b9c9d93d',rx,y,1,7);}
  }
  const eaves=PLATE-cy;
  if(eaves>0){box(c,'#111a28',0,0,Math.min(x,w),eaves);for(let i=0;i<18;i++){const rx=((hash(i,3)*w-t*30)%w+w)%w,y=((hash(i,4)*eaves+t*250)%eaves+eaves)%eaves;box(c,'#b9c9d93d',rx,y,1,7);}}
 },
 back,exit,water,
 deck:(c,p,l)=>paintDeck(c,p,l),
 depth:(p:Platform)=>deckDepth(p),
 mover(c,p,x,y){
  // Each weight hangs on its line from its barrel in the clock room; the pallet on its fall from the block on the jib.
  if(p.tag==='weight'){const top=Math.round(y)-8;if(top>BARREL.y)box(c,LINE,Math.round(x+p.w/2),BARREL.y,1,top-BARREL.y);}
  else if(p.tag==='pallet')hoistRope(c,x,y,p.w,JIB.y+6+BLOCK.h);
 },
};
