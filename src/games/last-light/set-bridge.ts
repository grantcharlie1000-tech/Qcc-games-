import type {Level,Platform,Station} from './levels';
import {platformAt,type Run} from './model';
import {box,hash,masonry,panel,sprite,stroke,visible,wall,type C,type Work} from './quarter-kit';
import {MID,MID_SCALE,farRoof,headTowers,lotEdge,moon,nightSky,townHouse,type Scale,type Tone} from './quarter-distance';
import type {QuarterSet} from './quarter-sets';
import {hull,moonPath,quayTile,ripples,shadowOnWater,sheet,weed} from './set-canal';

/** Level 8 · the old bridge to the garden bank, seen from the river. Its
 * arches have gone; what stands is what you cross. A length of roadway is
 * the top of the pier under it, with the broken haunch of an arch either
 * side. A higher roof is a bridge house standing on its pier. A low ledge
 * is a pier's cutwater, a cracked plank is a builders' trestle in the river,
 * a punt runs on a rope between two stumps, iron landings are a scaffold or
 * the gatehouse stair. The river is under all of it, and runs back from
 * it to the next bridge upstream, which still has its arches: the Quarter's
 * embankment on one side of that, the terraces of the garden bank on the
 * other. */
const DECK=560;
const stack=()=>masonry('roofs/stack',32,16,16,8,{mortar:'#1a1415',stones:['#4a3330','#503733','#563b35'],lip:'#644640',chip:'#6e4e46'});
/** Built work, laid per wall: a bridge house's render over rubble, the gatehouse's ashlar, and the hoist tower's brick. */
const HOUSE:Work={course:12,short:30,long:62,mortar:'#22221f',stones:['#3a3a34','#3d3d37','#40403a','#37372f'],lip:'#49493f',shade:'#2f2f29',chip:'#515146'};
const ASHLAR:Work={course:16,short:24,long:56,mortar:'#151d26',stones:['#2c3742','#303b46','#343f4a','#29343f'],lip:'#3e4a56',shade:'#24303a',chip:'#475460'};
const TOWER:Work={course:8,short:10,long:18,mortar:'#1b1719',stones:['#40312f','#453432','#4a3835','#3d2f2d'],lip:'#59453f',shade:'#33282a',chip:'#634e47'};
type Role='road'|'house'|'stack'|'cutwater'|'plank'|'punt'|'iron'|'gate'|'stair';
function role(p:Platform,l:Level):Role{
 if(p.kind==='moving')return 'punt';if(p.kind==='grate')return p.x>=gate(l)?'stair':'iron';if(p.kind==='crumble')return 'plank';if(p.h>28)return 'stack';
 if(p.x>=gate(l))return 'gate';
 return p.y>DECK+40?'cutwater':p.y<DECK-20?'house':'road';
}
/** The last six landings are the gatehouse on the garden bank and what stands behind it: its wall walk, the two
 * lifts of the scaffold on that walk, the tower top, the tool house against its garden side, and the bank path. */
const GATE_PARTS=6;
const gate=(l:Level)=>l.platforms[l.mainCount-GATE_PARTS].x;
function gateParts(l:Level){const n=l.mainCount;return {fore:l.platforms[n-6],top:l.platforms[n-3],bothy:l.platforms[n-2],path:l.platforms[n-1],lifts:l.platforms.filter(p=>p.kind==='grate'&&p.x>=gate(l)).sort((a,b)=>b.y-a.y)};}
function pier(c:C,x:number,w:number,top:number,water:number,haunch:boolean){
 // The pier, then on each side the stump of the arch it used to carry.
 const mid=x+w/2,half=Math.min(30,w/2);
 if(haunch)for(let i=0;i<w/2-half;i+=4){const depth=Math.round(12+62*(1-i/(w/2-half))**2);for(const s of [-1,1]){const xx=s<0?mid-half-i-4:mid+half+i;wall(c,'canal/quay',quayTile,xx,top,4,depth);box(c,'#55616d',xx,top+depth-4,4,4);box(c,'#10171e',xx,top+depth-1,4,1);}}
 wall(c,'canal/quay',quayTile,mid-half,top,half*2,water+40-top);box(c,'#0f161d',mid-half,top,2,water+40-top);box(c,'#0f161d',mid+half-2,top,2,water+40-top);
 // A pointed cutwater at the waterline.
 wall(c,'canal/quay',quayTile,mid-half-10,water-26,half*2+20,66);box(c,'#55616d',mid-half-10,water-26,half*2+20,3);weed(c,mid-half-10,half*2+20,water,Math.round(x));
}
const falls=new WeakMap<Level,{x:number;w:number}[]>();
/** Where an arch stood between two piers and no longer does. */
function fallen(l:Level){
 let made=falls.get(l);if(made)return made;made=[];
 const stone=l.platforms.slice(0,l.mainCount).filter(p=>{const k=role(p,l);return k==='road'||k==='house'||k==='cutwater'||k==='gate';}).sort((a,b)=>a.x-b.x);
 for(let i=1;i<stone.length;i++){const a=stone[i-1],b=stone[i],left=a.x+a.w,gap=b.x-left;if(gap<80||gap>420||l.platforms.some(p=>p.kind==='moving'&&p.x<b.x&&p.x+p.w>left))continue;const w=Math.min(120,Math.round(gap*.55));made.push({x:Math.round(left+(gap-w)/2),w});}
 falls.set(l,made);return made;
}
/** The arch lies where it fell: its stones in a heap that breaks the surface. */
function rubble(c:C,x:number,w:number,water:number){
 for(let i=0;i*11<w-8;i++){
  const v=hash(i,x,87),mid=1-Math.abs((i*11+6)/w*2-1),high=Math.round(3+mid*12*(.5+v*.5)),bx=x+i*11+Math.floor(v*4),bw=8+Math.floor(hash(i,x,89)*6);
  box(c,'#1a222b',bx,water-high,bw,high+6);box(c,v>.5?'#333e49':'#2f3a45',bx+1,water-high+1,bw-2,high+4);box(c,'#414d59',bx+1,water-high+1,bw-3,1);
  if(v>.6){box(c,'#1a222b',bx+3,water-high-5,bw-5,5);box(c,'#37424d',bx+4,water-high-4,bw-7,4);box(c,'#4b5763',bx+4,water-high-4,bw-8,1);}
  box(c,'#0a141a73',bx,water-3,bw,3);
 }
}
function trestle(c:C,p:Platform,water:number){
 const pole='#2a231d',lit='#5d4f40';
 for(const x of [p.x+8,p.x+p.w-12]){box(c,pole,x,p.y+20,4,water+30-p.y);box(c,lit,x,p.y+20,1,water+30-p.y);}
 for(let y=p.y+52,i=0;y<water-10;y+=56,i++){box(c,pole,p.x+8,y,p.w-16,3);if(y+56<water)stroke(c,pole,i%2?p.x+10:p.x+p.w-12,y+3,i%2?p.x+p.w-12:p.x+10,y+56,2);}
 box(c,pole,p.x+2,p.y+20,p.w-4,4);box(c,lit,p.x+2,p.y+20,p.w-4,1);
}
/** A window with a frame: a stone surround, a sill that throws water off, glazing bars, and a lamp behind some. */
function framed(c:C,x:number,y:number,w:number,h:number,lit:boolean){
 box(c,'#1a222b',x-5,y-6,w+10,h+11);box(c,'#56626e',x-4,y-5,w+8,4);box(c,'#7a8690',x-4,y-5,w+8,1);box(c,'#46525f',x-4,y-1,4,h);box(c,'#46525f',x+w,y-1,4,h);
 box(c,lit?'#8f6a3c':'#141e2b',x,y-1,w,h);if(lit){box(c,'#c99a55',x+2,y+1,w-4,h-6);box(c,'#e3b160',x+3,y+h-12,w-6,6);}
 box(c,'#0d1218',x+Math.floor(w/2)-1,y-1,2,h);box(c,'#0d1218',x,y+Math.floor(h/2)-1,w,2);
 box(c,'#56626e',x-6,y+h-1,w+12,4);box(c,'#7a8690',x-6,y+h-1,w+12,1);box(c,'#1a222b',x-6,y+h+3,w+12,1);
}
/** Quoins down a corner of the gatehouse: long and short by turns, proud of the face. */
function quoins(c:C,x:number,from:number,to:number,dir:number){
 for(let y=from,k=0;y<to;y+=16,k++){const wide=k%2?16:9,at=dir>0?x:x-wide;box(c,'#3a4652',at,y+1,wide,14);box(c,'#4c5864',at,y+1,wide,1);box(c,'#1c242d',at,y+15,wide,1);}
}
/** The gatehouse on the garden bank is one building in one stone: a lower range whose roof is the wall walk, and
 * the gate tower at its east end, standing on one plinth in the river with the bridge's last arch under the range.
 * The same string course runs round both at the roadway's level. The builders' scaffold stands on the wall walk
 * against the tower's west face and is tied into it at every lift. East of the tower is the garden bank: a tool
 * house against the tower, the bank path on its river wall, and the garden wall along the back of the path. */
function gatehouse(c:C,l:Level,water:number,s?:Run){
 const {fore,top,bothy,path,lifts}=gateParts(l),foot=water+40,g0=fore.x,t0=top.x-8,t1=top.x+top.w+8,x1=l.width+40,lit=!!s&&s.x>top.x;
 // The garden beyond the wall: cypresses and round-headed trees on the bank, dark against the sky.
 for(let x=t1+70,k=0;x<x1;k++){const v=hash(k,5,91),foot2=path.y-40;
  if(v<.5){const tall=70+Math.floor(v*120);for(let y=0;y<tall;y++){const half=Math.max(1,Math.round(9*Math.sin(Math.PI*Math.min(1,(y+6)/tall)**.7)));box(c,y%7<3?'#1b2b2c':'#182728',x-half,foot2-tall+y,half*2,1);}box(c,'#2a3f3c',x+3,foot2-tall+14,2,tall-30);}
  else{const r=16+Math.floor(v*14);box(c,'#141d1f',x-2,foot2-r,4,r);for(let y=-r;y<=r;y++){const sx=Math.floor(Math.sqrt(r*r-y*y));box(c,(y+r)%9<4?'#1b2b2c':'#182728',x-sx,foot2-r*2+y,sx*2,1);}box(c,'#2a3f3c',x+4,foot2-r*3+6,Math.max(3,r-8),1);box(c,'#2a3f3c',x+r-6,foot2-r*2-4,3,3);}
  x+=34+Math.floor(hash(k,6,91)*44);}
 // The lower range, from under the wall walk down into the river.
 c.drawImage(panel(`bridge/gate/range/${l.id}`,t0-g0,foot-fore.y-8,ASHLAR,g0),g0,fore.y+8);
 // The gate tower, from under its parapet walk to the river.
 c.drawImage(panel(`bridge/gate/tower/${l.id}`,t1-t0,foot-top.y-8,ASHLAR,t0+7),t0,top.y+8);
 quoins(c,g0,fore.y+10,water,1);box(c,'#0f161d',g0,fore.y+8,1,foot-fore.y);
 quoins(c,t0,top.y+22,fore.y+4,1);box(c,'#0f161d',t0,top.y+8,1,fore.y-top.y);quoins(c,t1,top.y+22,path.y-4,-1);box(c,'#0f161d',t1-1,top.y+8,1,path.y-top.y);
 // Under the tower's parapet walk a corbel table carries it out over the face; the far parapet's merlons stand behind the walk.
 for(let x=t0+4;x<t1-10;x+=16){box(c,'#1a222b',x,top.y+8,10,12);box(c,'#46525f',x+1,top.y+8,8,7);box(c,'#3a4652',x+2,top.y+15,6,4);box(c,'#6b7782',x+1,top.y+8,8,1);}
 for(let x=top.x+6;x<top.x+top.w-18;x+=34){box(c,'#28323d',x,top.y-18,20,18);box(c,'#3a4653',x,top.y-18,20,2);box(c,'#1c242d',x+19,top.y-16,1,16);}
 box(c,'#28323d',top.x,top.y-6,top.w,6);box(c,'#3a4653',top.x,top.y-6,top.w,1);
 // String courses the stonework stops against: one right round both parts at the roadway, two more up the tower.
 for(const [y,a] of [[DECK,g0],[top.y+112,t0],[water-84,g0]] as const){box(c,'#1a222b',a-2,y,t1-a+4,7);box(c,'#46525f',a-2,y+1,t1-a+4,4);box(c,'#6b7782',a-2,y+1,t1-a+4,1);}
 // Windows in frames, on sills: three to the range over the roadway, two storeys to the tower, loops below.
 for(let x=g0+44;x<t0-40;x+=84)framed(c,x,fore.y+24,14,22,false);
 for(const x of [t0+52,t0+150])framed(c,x,top.y+42,18,36,lit&&x===t0+52);
 for(const x of [t0+52,t0+150])framed(c,x,top.y+142,18,40,false);
 for(const x of [t0+60,t0+158]){box(c,'#0d1218',x,DECK+30,6,26);box(c,'#46525f',x-3,DECK+26,12,4);box(c,'#46525f',x-3,DECK+56,12,3);}
 // The bridge's last arch survives under the range, and the river goes through it.
 const ax=Math.round((g0+t0)/2)-10,ar=Math.min(96,Math.round((t0-g0)/2)-40),spring=water-10;
 for(let px=ax-ar-9;px<ax+ar+9;px++){const d=px+.5-ax,outer=spring-Math.round(Math.sqrt(Math.max(0,(ar+9)**2-d*d))*.62);box(c,'#4c5864',px,outer,1,spring-outer+50);box(c,'#6b7782',px,outer,1,1);if(Math.abs(d)<ar){const inner=spring-Math.round(Math.sqrt(ar*ar-d*d)*.62);box(c,'#0a1016',px,inner,1,foot-inner);box(c,'#141d26',px,inner,1,4);}}
 for(let k=1;k<12;k++){const g=Math.PI*k/12;stroke(c,'#1a222b',ax-Math.cos(g)*ar,spring-Math.sin(g)*ar*.62,ax-Math.cos(g)*(ar+8),spring-Math.sin(g)*(ar+8)*.62);}
 box(c,'#7d8791',ax-5,spring-Math.round((ar+9)*.62)-3,10,12);box(c,'#a3adb5',ax-5,spring-Math.round((ar+9)*.62)-3,10,1);
 // One plinth under the whole building, wet to the tide line.
 box(c,'#1a222b',g0-4,water-26,t1-g0+8,6);box(c,'#46525f',g0-4,water-26,t1-g0+8,4);box(c,'#6b7782',g0-4,water-26,t1-g0+8,1);weed(c,g0,t1-g0,water,7);
 // The bridge gate is in the range's west end, across the roadway, and it is barred: its hood and a lamp bracket show at the corner.
 box(c,'#1a222b',g0-10,DECK-58,12,6);box(c,'#56626e',g0-10,DECK-58,12,2);stroke(c,'#1a222b',g0-9,DECK-52,g0,DECK-40,2);box(c,'#141b21',g0-8,DECK-52,2,10);box(c,'#141b21',g0-11,DECK-42,8,10);box(c,'#232e37',g0-10,DECK-41,6,7);
 // The scaffold: two standards off sole plates on the wall walk, a ledger and a tie into the tower at every lift, braced, with its ladders.
 if(lifts.length){
  const pole='#2a231d',edge='#5d4f40',a=lifts[0].x+3,b=lifts[0].x+lifts[0].w-7,head=lifts.at(-1)!.y-22;
  for(const x of [a,b]){box(c,pole,x,head,4,fore.y-head);box(c,edge,x,head,1,fore.y-head);box(c,pole,x-4,fore.y-3,12,3);box(c,edge,x-4,fore.y-3,12,1);}
  let below=fore.y;
  for(const [i,p] of lifts.entries()){
   box(c,pole,a,p.y+11,b-a+4,3);box(c,edge,a,p.y+11,b-a+4,1);
   // The tie: a tube from the inner standard into a ring bolt in the tower's face.
   box(c,pole,b+4,p.y+14,t0-b-4,3);box(c,edge,b+4,p.y+14,t0-b-4,1);box(c,'#59666b',t0-1,p.y+12,4,7);
   stroke(c,pole,i%2?a+2:b+2,p.y+14,i%2?b+2:a+2,below-2,2);
   box(c,pole,a,p.y-18,b-a+4,2);box(c,edge,a,p.y-18,b-a+4,1);
   const lx=i%2?b-22:a+10;box(c,pole,lx,p.y-10,2,below-p.y+10);box(c,pole,lx+9,p.y-10,2,below-p.y+10);for(let y=p.y+16;y<below-2;y+=7)box(c,edge,lx+2,y,7,1);
   below=p.y;
  }
 }
 // The garden side: the bank's river wall under the path, and the garden wall along the back of it.
 c.drawImage(panel(`bridge/gate/bank/${l.id}`,x1-t1,foot-path.y-8,ASHLAR,t1+13),t1,path.y+8);box(c,'#1a222b',t1,water-26,x1-t1,6);box(c,'#46525f',t1,water-26,x1-t1,4);weed(c,t1,x1-t1,water,11);
 const end=path.x+path.w;gardenWall(c,bothy.x+bothy.w+2,end,path.y,l.exit.x+l.exit.w/2);
 // The path stops where the garden wall turns and comes forward to the river: a tall return wall, buttressed at its corner.
 const rt=path.y-150;c.drawImage(panel(`bridge/gate/return/${l.id}`,x1-end,path.y+8-rt,GARDEN_WALL,end+3),end,rt);
 box(c,'#1a2129',end-3,rt-6,x1-end+3,7);box(c,'#6d777e',end-3,rt-6,x1-end+3,5);box(c,'#9aa3a5',end-3,rt-6,x1-end+3,1);
 for(let y=rt+2,k=0;y<path.y+8;y+=13,k++){const wide=k%2?16:10;box(c,'#46525f',end,y,wide,12);box(c,'#6b7782',end,y,wide,1);box(c,'#2c353f',end,y+12,wide,1);}
 box(c,'#0f161d',end-1,rt,1,path.y+8-rt);
 for(let px=0;px<56;px++){const d=(px+.5-28)/28,head=rt+40-Math.round(16*Math.sqrt(Math.max(0,1-d*d)));box(c,'#4d3c3a',end+30+px,head-3,1,3);box(c,'#1f181a',end+30+px,head,1,path.y-20-head);}
 box(c,'#6d777e',end+26,path.y-20,64,4);box(c,'#9aa3a5',end+26,path.y-20,64,1);
 // The tool house leans against the tower: rendered walls from its eaves to the path, a plank door, one small light.
 const b0=t1,b1=bothy.x+bothy.w;c.drawImage(panel(`bridge/gate/bothy/${l.id}`,b1-b0,path.y-bothy.y-28,HOUSE,bothy.x),b0,bothy.y+28);box(c,'#15150f',b1-2,bothy.y+28,2,path.y-bothy.y-28);
 for(let y=bothy.y-2;y>bothy.y-30;y--){const k=(bothy.y-2-y)/28,xa=b0,xb=Math.round(b1-6-k*(b1-b0-18));box(c,((y>>2)&1)?'#3c4650':'#353f49',xa,y,xb-xa,1);if(y%6===0)for(let x=xa+3+((y/6|0)%2)*5;x<xb-3;x+=10)box(c,'#2a333c',x,y,1,6);}
 box(c,'#56626d',b0,bothy.y-31,Math.round((b1-b0)*.16)+8,2);
 const dx=b0+18;box(c,'#15150f',dx-3,path.y-48,26,48);box(c,'#3b2a1d',dx,path.y-45,20,45);for(const x of [dx+6,dx+13])box(c,'#2b1e14',x,path.y-45,1,45);box(c,'#262d33',dx,path.y-34,20,2);box(c,'#262d33',dx,path.y-12,20,2);box(c,'#7d7458',dx+15,path.y-24,2,3);
 framed(c,b0+62,bothy.y+48,14,18,false);
}
/** The garden wall along the bank: brick between stone piers under a coping, and the gate's two tall piers where it opens. */
const GARDEN_WALL:Work={course:7,short:11,long:17,mortar:'#191417',stones:['#3a2d2e','#3e3031','#423334','#382b2c'],lip:'#4d3c3a',shade:'#2c2224',chip:'#564440'};
export function gardenWall(c:C,from:number,to:number,ground:number,gateX:number){
 const top=ground-58;
 for(const [a,b] of [[from,gateX-34],[gateX+34,to]] as const){
  if(b-a<8)continue;
  c.drawImage(panel(`garden/wall/${Math.round(a)}/${Math.round(b-a)}`,b-a,ground-top-6,GARDEN_WALL,Math.round(a)),a,top+6);
  box(c,'#1a2129',a-1,top,b-a+2,7);box(c,'#6d777e',a-1,top,b-a+2,5);box(c,'#9aa3a5',a-1,top,b-a+2,1);box(c,'#120e11',a,top+7,b-a,2);
  // A stone pier every few yards, and ivy over the coping here and there.
  for(let x=Math.ceil((a+60)/150)*150;x<b-20;x+=150){box(c,'#1a222b',x,top-4,14,ground-top+4);box(c,'#46525f',x+1,top-3,12,ground-top+3);box(c,'#6b7782',x+1,top-3,12,1);box(c,'#2c353f',x+12,top-2,1,ground-top+2);}
  for(let x=Math.ceil((a+20)/97)*97,k=0;x<b-30;x+=97,k++){const v=hash(x,3,77);if(v<.45)continue;for(let i=0;i<5;i++){const hang=8+Math.floor(hash(x,i,78)*30);box(c,i%2?'#2c4739':'#3a5a44',x+i*5,top,4,hang);box(c,'#52745a',x+i*5+1,top+Math.floor(hang*.5),2,2);}}
 }
}
/** The garden gate: two tall stone piers with ball caps, an iron overthrow with a green lamp, the leaves standing open. */
export function gardenGate(c:C,x:number,ground:number,open:boolean){
 box(c,'#8fd39a0c',x-46,ground-112,92,112);
 // Through the gate: the garden path going on between hedges.
 box(c,'#101a1c',x-26,ground-64,52,64);box(c,'#1b2b2c',x-26,ground-64,12,64);box(c,'#1b2b2c',x+14,ground-64,12,64);box(c,'#2a3a36',x-14,ground-18,28,18);box(c,'#34453f',x-10,ground-8,20,8);
 if(open)box(c,'#d8f0c822',x-26,ground-64,52,64);
 for(const side of [-1,1]){
  const px=side<0?x-40:x+26;box(c,'#1a222b',px-1,ground-78,16,78);box(c,'#4c5864',px,ground-77,14,77);box(c,'#6b7782',px,ground-77,1,77);box(c,'#2c353f',px+13,ground-76,1,76);
  for(let y=ground-64;y<ground;y+=13)box(c,'#2c353f',px,y,14,1);
  box(c,'#1a222b',px-3,ground-84,20,7);box(c,'#6d777e',px-3,ground-84,20,5);box(c,'#9aa3a5',px-3,ground-84,20,1);
  for(let yy=-6;yy<=6;yy++){const sx=Math.floor(Math.sqrt(36-yy*yy));box(c,yy<-2?'#7a8690':'#56626e',px+7-sx,ground-91+yy,sx*2,1);}
  // The leaf stands open against its pier: bars, a dog rail and spear heads.
  const lx=side<0?x-26:x+14;box(c,'#141b21',lx,ground-58,12,2);box(c,'#141b21',lx,ground-20,12,2);for(let k=0;k<4;k++){box(c,'#141b21',lx+k*3+1,ground-64,1,62);box(c,'#3d4a51',lx+k*3+1,ground-64,1,2);}
 }
 // The overthrow: a flat iron arch from pier to pier with the lamp hung at its crown, the only one lit on this bank.
 for(let px=x-26;px<x+26;px++){const d=(px+.5-x)/26,y=ground-86-Math.round(12*Math.sqrt(Math.max(0,1-d*d)));box(c,'#141b21',px,y,1,2);if((px-x)%6===0)box(c,'#141b21',px,y+2,1,ground-78-y-2);}
 box(c,'#141b21',x-5,ground-98,10,14);box(c,'#8fd39a',x-3,ground-96,6,10);box(c,'#d8f0c8',x-1,ground-94,2,5);box(c,'#3d4a51',x-6,ground-100,12,2);box(c,'#8fd39a18',x-18,ground-110,36,36);
}
/** The hoist tower at the bridgehead, from outside: level 7's hoist house door opens onto the approach roadway, and
 * the tower goes on down into the river. Both its corners show, under the roof the hoist house stands under. */
function hoistTower(c:C,l:Level,water:number){
 const road=l.platforms[0],x0=14,x1=130,top=road.y-128,foot=water+40,dx=58,dy=road.y;
 c.drawImage(panel(`bridge/hoist/${l.id}`,x1-x0,foot-top,TOWER,11),x0,top);box(c,'#0f161d',x1-2,top,2,foot-top);box(c,'#0f161d',x0,top,1,foot-top);
 for(let y=top+6,k=0;y<foot;y+=12,k++){const wide=k%2?14:8;box(c,'#59453f',x1-wide,y,wide,10);box(c,'#6d5850',x1-wide,y,wide,1);box(c,'#59453f',x0,y,k%2?8:14,10);box(c,'#6d5850',x0,y,k%2?8:14,1);}
 // Its roof: slates up to a ridge, on a stone eaves course.
 for(let y=0;y<34;y++){const inset=Math.round(y*1.2);box(c,(y>>2)%2?'#202a37':'#1d2633',x0-4+inset,top-8-y,x1-x0+8-inset*2,1);box(c,'#3a4a5e',x0-4+inset,top-8-y,2,1);}
 box(c,'#2a2224',x0-6,top-8,x1-x0+12,8);box(c,'#7a665e',x0-6,top-8,x1-x0+12,1);box(c,'#120e10',x0-6,top,x1-x0+12,1);
 // A band at the hoist house floor, and one framed light over the door.
 box(c,'#2a2224',x0,dy-2,x1-x0,5);box(c,'#6d5850',x0,dy-2,x1-x0,1);framed(c,dx-8,top+18,16,20,true);
 // The door out of the hoist house, from the roadway side: the same jambs, lintel and threshold, the hoist house lamp inside.
 box(c,'#08090c',dx-30,dy-82,60,82);box(c,'#141210',dx-19,dy-70,38,70);box(c,'#f3c77a18',dx-19,dy-70,38,70);box(c,'#f3c77a',dx+6,dy-56,6,8);box(c,'#141b21',dx+8,dy-70,2,14);
 for(let k=0;k<6;k++){const yy=dy-70+k*12;box(c,k%2?'#6b625c':'#5d5550',dx-30,yy,11,11);box(c,k%2?'#5d5550':'#6b625c',dx+19,yy,11,11);box(c,'#8a817a',dx-30,yy,11,1);box(c,'#8a817a',dx+19,yy,11,1);}
 box(c,'#2a2224',dx-34,dy-84,68,14);box(c,'#6b625c',dx-33,dy-83,66,12);box(c,'#8a817a',dx-33,dy-83,66,1);box(c,'#7d746d',dx-6,dy-86,12,15);box(c,'#a39b92',dx-6,dy-86,12,1);
 box(c,'#3b2a1d',dx-19,dy-70,9,70);box(c,'#5d4129',dx-18,dy-69,7,68);
}
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number,clock:number,s?:Run){
 const water=l.water!,east=gate(l),end=l.platforms[l.mainCount-1];
 if(visible(east-10,end.y-200,l.width-east+60,water-end.y+280,cx,cy,vw,vh))gatehouse(c,l,water,s);
 if(visible(0,l.platforms[0].y-150,140,water-l.platforms[0].y+190,cx,cy,vw,vh))hoistTower(c,l,water);
 for(const f of fallen(l))if(visible(f.x,water-20,f.w,40,cx,cy,vw,vh))rubble(c,f.x,f.w,water);
 for(const p of l.platforms){
  const kind=role(p,l);if(kind==='gate'||kind==='stair'||!visible(p.x-70,p.y-80,p.w+140,water+80-p.y+80,cx,cy,vw,vh))continue;
  if(kind==='road'){
   if(p.id===0){wall(c,'canal/quay',quayTile,0,p.y+8,p.x+p.w,water+40-p.y-8);box(c,'#0f161d',p.x+p.w-2,p.y+8,2,water+40-p.y);weed(c,0,p.x+p.w,water,1);}
   else pier(c,p.x,p.w,p.y+8,water,true);
   // The parapet on the far side of the roadway.
   box(c,'#232d38',p.x,p.y-12,p.w,12);box(c,'#3a4653',p.x,p.y-12,p.w,2);for(let x=p.x+6;x<p.x+p.w-4;x+=12)box(c,'#161d26',x,p.y-8,5,6);
  }else if(kind==='house'){
   // A bridge house on its own pier, and it is a house: a slated roof rising behind its eaves to a ridge, a stack that
   // comes up through that roof at the gable and is the gable wall below it, a rendered front with framed lights and a door.
   const stack=l.platforms.find(q=>role(q,l)==='stack'&&(q.x===p.x+p.w||q.x+q.w===p.x)),x0=Math.min(p.x,stack?.x??p.x),x1=Math.max(p.x+p.w,stack?stack.x+stack.w:0),east=!stack||stack.x>p.x;
   const ridge=p.y-34;
   for(let y=ridge;y<p.y;y++){
    // The slope stops square against the gable the stack stands in, and is hipped at the other end.
    const hip=Math.round((p.y-y)*.9),a=east?p.x+hip:(stack?stack.x+stack.w:p.x),b=east?(stack?stack.x:p.x+p.w):p.x+p.w-hip;
    box(c,((y-ridge)/6|0)%2?'#3a444e':'#343e48',a,y,b-a,1);if((y-ridge)%6===0)for(let x=a+2+(((y-ridge)/6|0)%2)*5;x<b-2;x+=10)box(c,'#272f38',x,y,1,6);
    box(c,'#4b5661',east?a:b-1,y,1,1);
   }
   {const a=east?p.x+31:(stack?stack.x+stack.w:p.x),b=east?(stack?stack.x:p.x+p.w):p.x+p.w-31;box(c,'#1c242c',a,ridge-3,b-a,4);box(c,'#5a6671',a,ridge-3,b-a,1);for(let x=a+8;x<b-4;x+=14)box(c,'#1c242c',x,ridge-2,1,3);}
   // Lead flashing where the slope meets the stack.
   if(stack){const fx=east?stack.x-3:stack.x+stack.w;for(let y=ridge+2;y<p.y;y+=5){box(c,'#6c7378',fx,y,3,4);box(c,'#9aa2a4',fx,y,3,1);}}
   c.drawImage(panel(`bridge/house/${p.id}`,x1-x0,DECK-p.y-28,HOUSE,p.id*13),x0,p.y+28);
   if(stack){c.drawImage(panel(`bridge/gable/${stack.id}`,stack.w,28,HOUSE,stack.id),stack.x,p.y);box(c,'#15150f',east?stack.x:stack.x+stack.w-1,p.y,1,28);}
   box(c,'#15150f',x0,stack&&!east?p.y:p.y+28,2,DECK-p.y-(stack&&!east?0:28));box(c,'#15150f',x1-2,stack&&east?p.y:p.y+28,2,DECK-p.y-(stack&&east?0:28));
   const lit=!!s&&s.x>p.x+p.w,door=east?p.x+14:p.x+p.w-34;
   for(let x=p.x+(east?52:16),k=0;x<p.x+p.w-(east?16:54);x+=40,k++)framed(c,x,p.y+37,12,15,lit&&k%2===0);
   box(c,'#15150f',door-2,p.y+31,24,DECK-p.y-31);box(c,'#3b2a1d',door,p.y+34,20,DECK-p.y-34);box(c,'#5d4129',door+1,p.y+35,18,3);for(const x of [door+6,door+13])box(c,'#2b1e14',x,p.y+38,1,DECK-p.y-38);box(c,'#a9905f',door+15,p.y+48,2,2);
   box(c,'#232d38',x0,DECK,x1-x0,8);box(c,'#3a4653',x0,DECK,x1-x0,1);pier(c,x0,x1-x0,DECK+8,water,true);
  }else if(kind==='cutwater'){
   wall(c,'canal/quay',quayTile,p.x,p.y+8,p.w,water+40-p.y-8);box(c,'#0f161d',p.x,p.y+8,2,water+40-p.y);box(c,'#0f161d',p.x+p.w-2,p.y+8,2,water+40-p.y);weed(c,p.x,p.w,water,p.id);
  }else if(kind==='plank')trestle(c,p,water);
  else if(kind==='punt'){
   // The punt's rope runs from stump to stump across its whole crossing.
   const travel=p.travel??0,a=p.x-travel-34,b=p.x+p.w+travel+34;for(let x=a;x<b;x+=4)box(c,'#8a7a5a',x,p.y-14+Math.round(Math.sin((x-a)/(b-a)*Math.PI)*4),3,1);
   for(const x of [a,b-4]){box(c,'#17110d',x,p.y-24,5,water+30-p.y+24);box(c,'#6a5440',x+1,p.y-24,2,water+30-p.y+24);}
   const at=platformAt(p,clock).x+p.w/2;box(c,'#8a7a5a',at,p.y-13,1,13);
  }else if(kind==='iron'){
   // Scaffold or stair: a rail behind, a standard each side down to what it stands on.
   let foot=water;for(const q of l.platforms)if(q!==p&&q.kind!=='grate'&&q.x<p.x+p.w&&q.x+q.w>p.x&&q.y>p.y&&q.y<foot)foot=q.y;
   for(const x of [p.x+3,p.x+p.w-6]){box(c,'#1a2228',x,p.y-16,3,foot-p.y+16);box(c,'#56646b',x,p.y-16,1,foot-p.y+16);}
   box(c,'#1a2228',p.x,p.y-16,p.w,2);box(c,'#56646b',p.x,p.y-16,p.w,1);stroke(c,'#1a2228',p.x+5,p.y+12,p.x+p.w-5,Math.min(foot,p.y+64),1);
  }
 }
}
function water(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number){
 const top=l.water!,bottom=cy+vh+24;if(bottom<=top)return;
 sheet(c,cx-24,vw+48,top,bottom,top-200);ripples(c,cx-24,cx+vw+24,top,bottom,top-150,t);
 for(let x=Math.floor((cx-24)/22)*22;x<cx+vw+24;x+=22)box(c,'#5a8a94',x+3,top+Math.round(Math.sin(t*1.7+x*.21)),11,1);
 for(const p of l.platforms){const kind=role(p,l);if(p.x+p.w<cx-24||p.x>cx+vw+24)continue;if(kind==='road'||kind==='house'){const half=Math.min(30,p.w/2);shadowOnWater(c,p.id?p.x+p.w/2-half-10:0,p.id?half*2+20:p.x+p.w,top,t);}else if(kind==='cutwater'||kind==='gate')shadowOnWater(c,p.x,p.w,top,t);}
 moonPath(c,cx+Math.round(vw*.76-cx*.02),top,bottom,top-70,t);
}
function deck(c:C,p:Platform,l:Level){
 const w=p.w,kind=role(p,l);
 if(kind==='stair'){
  // A lift of the scaffold: three boards on putlogs, toe board behind.
  box(c,'#17110d',-1,0,w+2,12);box(c,'#6b523a',0,0,w,7);box(c,'#b2946d',0,0,w,2);for(let x=9+p.id%4;x<w-3;x+=13)box(c,'#3d2e22',x,2,1,5);
  box(c,'#2a231d',0,7,w,4);box(c,'#5d4f40',0,7,w,1);for(let x=6;x<w-6;x+=22)box(c,'#17110d',x,8,5,3);return;
 }
 if(kind==='gate'&&p===gateParts(l).bothy){
  // The tool house's eaves: slate over a timber plate, like the bridge houses'.
  box(c,'#15110e',-3,0,w+6,28);for(let row=0;row<2;row++)for(let x=-((row*7)%14);x<w;x+=14){box(c,hash(x,row,p.id)>.5?'#55606b':'#4b5661',Math.max(-3,x),row*7,13,7);box(c,'#6f7b86',Math.max(-3,x),row*7,13,1);}
  box(c,'#98a3ab',-3,0,w+6,1);box(c,'#3a2d23',-3,14,w+6,8);box(c,'#57432f',-3,14,w+6,1);for(let x=4;x<w-4;x+=16)box(c,'#241b15',x,17,6,5);box(c,'#15110e',-3,22,w+6,6);return;
 }
 if(kind==='gate'&&p===gateParts(l).path){
  // The bank path: rolled gravel between a stone kerb on the river wall and the foot of the garden wall.
  box(c,'#1a2129',-2,0,w+4,10);box(c,'#6f6a5c',-2,0,w+4,8);box(c,'#9a9482',-2,0,w+4,2);box(c,'#57534a',-2,7,w+4,1);
  for(let x=3;x<w-3;x+=7){const v=hash(x,p.id,5);box(c,v>.5?'#857f6e':'#5f5a4e',x+Math.floor(v*3),3+Math.floor(v*3),2,1);}
  return;
 }
 if(kind==='iron'){box(c,'#12191e',-2,0,w+4,12);box(c,'#aab3ae',0,0,w,1);box(c,'#5d6b70',0,1,w,2);for(let x=3;x<w-3;x+=8){box(c,'#1c272d',x,3,3,7);box(c,'#6d7d80',x,3,1,6);}box(c,'#2f3d43',0,10,w,2);return;}
 if(kind==='plank'){
  box(c,'#17110d',0,0,w,22);box(c,'#6b523a',0,0,w,8);box(c,'#b2946d',0,0,w,2);for(let x=9+p.id%4;x<w-3;x+=13)box(c,'#3d2e22',x,2,1,6);
  for(let x=14;x<w-10;x+=30)stroke(c,'#2a1f17',x,1,x+6,7);box(c,'#33261d',0,8,w,12);box(c,'#4a3828',0,8,w,1);return;
 }
 if(kind==='stack'){
  wall(c,'roofs/stack',stack,0,10,w,p.h-10);box(c,'#120e0f',0,10,2,p.h-10);box(c,'#120e0f',w-2,10,2,p.h-10);
  box(c,'#1a1415',-3,3,w+6,8);box(c,'#5e423c',-3,3,w+6,6);box(c,'#7a5a50',-3,3,w+6,1);box(c,'#6c7378',-1,0,w+2,4);box(c,'#9aa2a4',-1,0,w+2,2);return;
 }
 if(kind==='punt'){hull(c,w,36);box(c,'#3a2d23',8,3,w-16,5);for(let x=14;x<w-12;x+=14)box(c,'#57432f',x,3,10,4);return;}
 if(kind==='house'){
  // A slate roof over a timber eave.
  box(c,'#15110e',-3,0,w+6,28);for(let row=0;row<2;row++)for(let x=-((row*7)%14);x<w;x+=14){box(c,hash(x,row,p.id)>.5?'#55606b':'#4b5661',Math.max(-3,x),row*7,13,7);box(c,'#6f7b86',Math.max(-3,x),row*7,13,1);}
  box(c,'#98a3ab',-3,0,w+6,1);box(c,'#3a2d23',-3,14,w+6,8);box(c,'#57432f',-3,14,w+6,1);for(let x=4;x<w-4;x+=16)box(c,'#241b15',x,17,6,5);box(c,'#15110e',-3,22,w+6,6);return;
 }
 // Roadway, cutwater and gatehouse walks: a worn stone kerb on the masonry behind.
 box(c,'#1a2129',-2,0,w+4,10);box(c,'#7d878c',-2,0,w+4,8);box(c,'#aab3b3',-2,0,w+4,2);box(c,'#5d676e',-2,7,w+4,1);
 for(let x=38+p.id%3*9;x<w-10;x+=52)box(c,'#565f66',x,2,1,6);
}
function station(c:C,l:Level,s:Station,x:number,y:number,lit:boolean){
 // A bridge lamp: an iron standard on the parapet with a square lantern.
 x=Math.round(x);if(lit){box(c,'#f3c77a12',x-28,y-92,56,92);box(c,'#f3c77a1c',x-16,y-84,32,40);}
 box(c,'#141b21',x-2,y-62,4,62);box(c,'#3d4a51',x-1,y-62,1,62);box(c,'#141b21',x-6,y-6,12,6);box(c,'#141b21',x-7,y-80,14,18);
 box(c,lit?'#f3c77a':'#232e37',x-5,y-78,10,14);if(lit)box(c,'#fff0c4',x-2,y-75,4,8);box(c,'#3d4a51',x-8,y-83,16,3);box(c,'#141b21',x-3,y-86,6,3);
}
function exit(c:C,l:Level,s:Run,t:number,front:boolean){
 if(front)return;
 // The garden gate, in the wall along the bank.
 gardenGate(c,Math.round(l.exit.x+l.exit.w/2),l.exit.y+l.exit.h,s.phase!=='playing');
}
/** The river upstream, painted once in lengths: the far ridge on the horizon,
 * then, standing nearer in the water, the Quarter's embankment, the bridge
 * that kept its arches, and the garden bank climbing in terraces. `SHORE` is
 * the horizon in each length; what stands nearer has its foot `NEARER` lower. */
const SHORE=210,NEARER=10,LENGTH=256,END=1800;
const RIVER:Tone={walls:['#1c2535','#1f2939','#222b3c','#221f2c'],edge:'#2b384b',shade:'#141c29',roof:'#273549',course:'#202c3e',ridge:'#374860',glass:'#111926',pane:'#1c2b3e',lit:'#a8763f',glow:'#dba659'};
const RIVER_SCALE:Scale={unit:15,ww:4,wh:7,pitch:10,lit:.08};
const TERRACES=[[1150,150,'#222f42'],[1090,124,'#212e40'],[1040,98,'#202c3e'],[985,74,'#1f2a3b'],[935,52,'#1d2838'],[892,30,'#1c2635'],[858,12,'#1a2432']] as const;
/** The upper town beyond the bend stands on rising ground. */
const rise=(x:number)=>Math.round(40+24*Math.sin(x/190+1)+12*Math.sin(x/71));
function tree(c:C,x:number,foot:number,v:number,leaf:string,lit:string){
 if(v<.45){
  // A poplar: one narrow flame of leaves.
  const tall=20+Math.floor(v*64);box(c,leaf,x,foot-tall,3,tall);box(c,leaf,x-1,foot-tall+4,5,tall-7);box(c,leaf,x+1,foot-tall-2,1,2);box(c,lit,x+3,foot-tall+5,1,tall-11);
 }else if(v<.8){
  // A round crown on a short trunk.
  const r=5+Math.floor(v*5);box(c,'#161f2b',x,foot-4,2,4);for(let y=-r;y<=r;y++){const s=Math.floor(Math.sqrt(r*r-y*y));box(c,leaf,x+1-s,foot-4-r+y,s*2,1);}box(c,lit,x+2,foot-2-r*2,Math.max(2,r-2),1);box(c,lit,x+r-1,foot-r*2+1,2,2);
 }else{box(c,leaf,x-4,foot-5,14,5);box(c,lit,x-4,foot-5,14,1);}
}
function panorama(c:C){
 const B=SHORE,foot=B+NEARER,stone='#1c2636',lit='#2b384c',dark='#131c2a';
 const at=(x:number,paint:()=>void)=>{c.save();c.translate(x,0);paint();c.restore();};
 // The upper town lies along the horizon beyond the bend, its cathedral over the middle of the river.
 const haze='#1b2639',rim='#28364f';
 for(let i=-2;lotEdge(i,30,31)<END;i++){const x0=lotEdge(i,30,31),w=lotEdge(i+1,30,31)-x0;at(x0,()=>farRoof(c,w,B-rise(x0)-6-Math.floor(hash(i,1,61)*20),B,i+900,haze,rim,'#b98a4a'));}
 const cx=640,cy=B-rise(cx)-24;box(c,haze,cx-34,cy-22,68,60);box(c,rim,cx-34,cy-22,68,1);
 for(let y=0;y<=20;y++){const s=Math.floor(Math.sqrt(400-y*y));box(c,haze,cx-s,cy-34-y,s*2,1);}box(c,haze,cx-21,cy-34,42,12);box(c,rim,cx-21,cy-34,42,1);box(c,haze,cx-3,cy-64,6,10);box(c,rim,cx-1,cy-72,2,8);
 for(const x of [cx-46,cx+36]){box(c,haze,x,cy-40,10,70);box(c,rim,x,cy-40,10,1);for(let i=0;i<18;i++)box(c,haze,x+1+Math.floor(i/5),cy-41-i,8-Math.floor(i/5)*2,1);box(c,rim,x+4,cy-62,1,4);}
 for(let x=cx-28;x<cx+30;x+=8)box(c,'#172132',x,cy-8,3,9);box(c,'#b98a4a',cx-4,cy+6,2,3);box(c,'#b98a4a',cx+12,cy-6,1,2);
 c.drawImage(headTowers(),100,B-238);
 // The Quarter's bank: the street behind, then the fronts on the embankment.
 for(let i=-2;lotEdge(i,44,32)<400;i++){const x0=lotEdge(i,44,32),w=lotEdge(i+1,44,32)-x0;at(x0,()=>townHouse(c,w,foot-96-Math.floor(hash(i,1,63)*56),foot,i*3+7,MID,MID_SCALE));}
 for(let i=-2;lotEdge(i,46,33)<384;i++){const x0=lotEdge(i,46,33),w=Math.min(392,lotEdge(i+1,46,33))-x0;at(x0,()=>townHouse(c,w,foot-8-56-Math.floor(hash(i,1,65)*62),foot-8,i*11+2,RIVER,RIVER_SCALE,true));}
 box(c,'#18212c',-40,foot-8,440,8);box(c,'#2c394a',-40,foot-8,440,1);
 for(let x=-30;x<390;x+=17)box(c,'#10171f',x,foot-6,1,5);
 for(const x of [38,150,262,340]){box(c,'#0d141c',x,foot-5,7,5);box(c,'#0d141c',x+1,foot-6,5,1);}
 for(const x of [84,206,300]){box(c,'#0f161d',x,foot-3,26,3);box(c,'#34414f',x-1,foot-4,28,1);box(c,'#0f161d',x+11,foot-10,1,6);}
 // The bridgehead: a gate tower where the upstream bridge leaves the Quarter.
 box(c,RIVER.walls[1],390,foot-78,36,78);box(c,RIVER.shade,390,foot-78,1,78);box(c,RIVER.edge,390,foot-78,36,1);
 for(let i=0;i<9;i++)box(c,RIVER.roof,390+i*2,foot-80-i*2,36-i*4,2);box(c,RIVER.ridge,407,foot-100,2,4);
 for(const y of [64,46])for(const x of [398,412])box(c,RIVER.glass,x,foot-y,4,8);box(c,RIVER.lit,412,foot-46,4,8);box(c,RIVER.glow,413,foot-44,2,5);
 // The bridge that kept its arches: five spans, a pier and a dead lamp between each pair.
 const from=426,span=71,pier=14,road=B-34;
 box(c,stone,from,road,439,6);box(c,stone,from,road-6,439,6);box(c,lit,from,road-6,439,1);box(c,dark,from,road+5,439,1);
 for(let x=from+3;x<from+436;x+=5)box(c,dark,x,road-4,2,3);
 for(let k=0;k<=5;k++){
  const px=from+k*(span+pier);box(c,stone,px,road+6,pier,foot-road-6);box(c,lit,px+pier-2,road+6,2,foot-road-10);box(c,lit,px-2,foot-6,pier+4,1);box(c,stone,px-2,foot-5,pier+4,5);
  box(c,stone,px+3,road-9,8,3);box(c,lit,px+3,road-9,8,1);box(c,dark,px+6,road-21,1,12);box(c,dark,px+5,road-24,3,3);box(c,'#263243',px+6,road-23,1,1);
  if(k===5)break;
  for(let dx=0;dx<span;dx++){const u=(dx+.5)/span*2-1,rise=Math.round(28*Math.sqrt(1-u*u)),open=foot-2-rise,x=px+pier+dx;if(open>road+6){box(c,stone,x,road+6,1,open-road-6);box(c,lit,x,open-2,1,1);box(c,dark,x,open-1,1,1);}}
 }
 // The garden bank: terraces stepping up from the river wall, each with what grows on it.
 for(const [x0,high,earth] of TERRACES){
  const top=foot-high,n=TERRACES.findIndex(q=>q[0]===x0);
  box(c,earth,x0,top,END-x0,high);box(c,'#2a384c',x0,top,END-x0,1);box(c,'#263244',x0,top+1,END-x0,5);for(let x=x0+6;x<END;x+=13)box(c,'#1a2433',x,top+2,1,4);
  box(c,'#263244',x0,top,3,high);box(c,'#2a384c',x0,top,1,high);
  if(x0===985){
   // The glasshouse: iron ribs and glass under a barrel roof, and something inside it still warm.
   const gx=1000,gw=72,gy=top-4;box(c,'#263243',gx-2,top-4,gw+4,4);box(c,'#2c4553',gx,gy-14,gw,14);
   for(let dx=0;dx<gw;dx++){const u=(dx+.5)/gw*2-1,rise=Math.round(14*Math.sqrt(1-u*u));box(c,dx%6===0?'#1a2836':'#31505c',gx+dx,gy-14-rise,1,rise);box(c,'#4b6972',gx+dx,gy-14-rise,1,1);}
   for(let x=gx;x<gx+gw;x+=4)box(c,'#1a2836',x,gy-14,1,14);box(c,'#1a2836',gx,gy-15,gw,1);box(c,'#1a2836',gx,gy-8,gw,1);
   for(const x of [gx+25,gx+29,gx+41])box(c,'#a9b377',x,gy-13,3,5);box(c,'#d9c98a',gx+29,gy-12,2,3);
   box(c,'#31505c',gx+gw/2-7,gy-36,14,9);box(c,'#4b6972',gx+gw/2-7,gy-36,14,1);box(c,'#31505c',gx+gw/2-4,gy-40,8,4);box(c,'#4b6972',gx+gw/2-1,gy-45,2,5);
  }
  if(n===0){
   // The house at the top of the garden, and a round temple on the brow beyond it.
   at(1196,()=>townHouse(c,58,top-38,top,91,RIVER,RIVER_SCALE,true,1));
   box(c,'#263244',1330,top-3,30,3);for(let x=1332;x<1358;x+=5)box(c,'#2c3a4e',x,top-19,2,16);box(c,'#263244',1329,top-22,32,3);for(let y=0;y<9;y++){const sx=Math.floor(Math.sqrt(196-y*y*2.4));box(c,'#263244',1345-sx,top-23-y,sx*2,1);}box(c,'#2c3a4e',1344,top-35,2,4);
  }
  const leaf=['#22343c','#22343c','#213239','#1f3037','#1d2d33','#1b2a30','#1a282d'][n],glint=['#2e454b','#2e454b','#2c4247','#2a4045','#283d41','#263a3e','#24373a'][n];
  for(let x=x0+9,k=0;x<END-8;k++){const v=hash(k,n,81);if(!(x0===985&&x>990&&x<1082)&&!(n===0&&(x>1188&&x<1262||x>1322&&x<1366)))tree(c,x,top,v,leaf,glint);x+=9+Math.floor(hash(k,n,83)*26);}
 }
 // The garden's river wall, its water gate and steps, and the one lamp kept burning at them.
 box(c,'#18212c',850,foot-8,END-850,8);box(c,'#2c394a',850,foot-8,END-850,1);for(let x=856;x<END;x+=17)box(c,'#10171f',x,foot-6,1,5);
 box(c,'#0d141c',902,foot-13,12,13);box(c,'#0d141c',904,foot-15,8,2);box(c,'#2c394a',900,foot-16,16,1);for(let i=0;i<3;i++)box(c,'#34414f',916+i*3,foot-6+i*2,6,1);
 box(c,'#10171f',921,foot-22,1,14);box(c,'#f3c77a',920,foot-25,3,3);box(c,'#ffb76b33',918,foot-27,7,7);
}
const lengths=new Map<number,HTMLCanvasElement>();
function length(i:number){let made=lengths.get(i);if(!made){made=sprite(`bridge/river/${i}`,LENGTH,SHORE+NEARER,c=>{c.translate(-i*LENGTH,0);panorama(c);});lengths.set(i,made);}return made;}
const DEPTH=['#213f4d','#1d3947','#1a3542','#17303d','#152c38','#132833','#11252f','#0f2029'];
/** The river between the horizon and the piers, in the perspective of someone
 * standing on the bridge: bands, ripples and the moon's path all widen and
 * part as they come nearer, and slide past at the speed of their distance. */
function river(c:C,w:number,h:number,cx:number,far:number,near:number,t:number,mx:number){
 const span=near-far,end=Math.min(near,h);
 for(let b=0,y=far;b<8&&y<end;b++){const next=b===7?near:far+Math.round(span*((b+1)/8)**1.5);box(c,DEPTH[b],0,y,w,Math.min(end,next)-y);y=next;}
 for(let row=1;row<18;row++){
  const f=(row/18)**1.7,y=far+Math.round(span*f);if(y>=end)break;
  const step=22+f*70,slide=cx*(.18+.82*f)-Math.sin(t*.55+row*1.3)*(1+f*4),length=3+f*14;
  for(let i=Math.floor(slide/step)-1;i*step-slide<w;i++){const v=hash(i,row,19),x=i*step+v*step*.8-slide;if(x+length*1.6<0)continue;box(c,v>.8?'#4f7a85':v>.45?'#335865':'#264754',x,y,Math.round(length*(.6+v)),1);}
 }
 for(let k=0;k<14;k++){const f=(k/14)**1.5,y=far+2+Math.round(span*f);if(y>=end)break;const wide=5+Math.round(f*34),slip=Math.round(Math.sin(t*1.2+k*1.9)*(1+f*4));box(c,k<5?'#c5d2c98c':'#c5d2c966',mx-Math.round(wide/2)+slip,y,wide,1);if(k>3)box(c,'#c5d2c938',mx-wide+slip*2+k%3*6,y+2,Math.round(wide*.6),1);}
}
function sky(c:C,l:Level,w:number,h:number,cx:number,cy:number,t:number,ending:boolean){
 // The horizon sits a little under the eye of someone on the roadway, and moves less than the bridge does.
 const near=l.water!-cy,far=Math.min(near-24,Math.round(h*.57+60+(DECK-24-h*.57-cy)*.15)),mx=Math.round(w*.76-cx*.02),shift=Math.round(cx*.18);
 nightSky(c,w,h,ending,cx,t);moon(c,mx,Math.max(50,far-218));
 if(far<h)river(c,w,h,cx,far,near,t,mx);
 for(let i=Math.floor(shift/LENGTH);i*LENGTH-shift<w;i++){
  const art=length(i),x=i*LENGTH-shift;c.drawImage(art,x,far-SHORE);
  // Everything on the far water stands on its head in it, short and dim.
  if(far+NEARER<h){c.save();c.globalAlpha=.42;c.translate(x,far+NEARER);c.scale(1,-.3);c.drawImage(art,0,-SHORE-NEARER);c.restore();}
 }
}
export const bridge:QuarterSet={sky,back,deck,exit,water,station,depth:(p,l)=>role(p,l)==='punt'?10:0};
