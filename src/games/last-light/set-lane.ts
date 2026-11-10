import type {Level,Platform} from './levels';
import {box,hash,lay,panel,stroke,visible,type C,type Work} from './quarter-kit';

/** Level 1 · Bell Lane, between Nell's gable and the bell tower. A plain
 * roof is the top of its house and the house goes down to the lane. Every
 * other landing along the lane is the thing its tag names, drawn as that
 * thing and standing on its own footing: a chimney stack on the breast that
 * runs down the gable, a kiln's cowl on its pyramid roof, a yard wall's
 * pier, a dovecote tower, the bellcote on the chapel's gable, the cap of the
 * brewery stack. Iron and timber are hung on something: a fire escape on
 * the end wall behind it, scaffold boards on their standards, the stack's
 * landings on brackets, the sign gantry on legs, the drying rails on the
 * tannery's louvred wall, the footbridge planks on two bearers. */
const BRICK:Work={course:8,short:12,long:18,mortar:'#1a1415',stones:['#4a3330','#503733','#563b35','#46302d'],lip:'#644640',shade:'#3a2826',chip:'#6e4e46'};
const SOOT:Work={course:8,short:12,long:18,mortar:'#131112',stones:['#352828','#392b2a','#3e2e2c','#322626'],lip:'#4a3734',shade:'#281e1f',chip:'#523e3a'};
const YARD:Work={course:8,short:12,long:20,mortar:'#14181d',stones:['#30333a','#34373e','#383a40','#2d3036'],lip:'#454950',shade:'#24272d',chip:'#4e5258'};
const STONE:Work={course:12,short:18,long:40,mortar:'#151c24',stones:['#28323d','#2b3540','#2e3843','#262f39'],lip:'#3a4654',shade:'#1f2832',chip:'#46525f'};
const KILN:Work={course:8,short:12,long:18,mortar:'#171415',stones:['#3d302c','#42342f','#463732','#392d2a'],lip:'#54423b',shade:'#2e2422',chip:'#5c4a42'};
const COTE:Work={course:8,short:12,long:18,mortar:'#17191d',stones:['#3a3632','#3e3a35','#423d38','#373330'],lip:'#514b44',shade:'#2b2826',chip:'#5a534b'};
const IRON='#141c22',IRON_LIT='#4f5d61',IRON_MID='#29343a',WOOD='#1a1410',WOOD_MID='#4a3a2c',WOOD_LIT='#6e5641',WOOD_EDGE='#93745a',ROPE='#8a7a5c';
/** Landings that are plain roofs: the Quarter builds a house under each. Everything else is built here. */
const HOUSES=new Set(['nell','flues','store','tall','loft','shed','vestry','lean']);
export const laneBuilds=(p:Platform)=>!!p.tag&&!HOUSES.has(p.tag);
const cap=(c:C,w:number,stone='#6c7378',lit='#9aa2a4')=>{box(c,'#1a1415',-3,3,w+6,9);box(c,'#5e423c',-3,4,w+6,6);box(c,'#7a5a50',-3,4,w+6,1);box(c,'#1a1415',-1,10,w+2,2);box(c,stone,-1,0,w+2,4);box(c,lit,-1,0,w+2,2);};
const coping=(c:C,w:number)=>{box(c,'#161b21',-3,0,w+6,9);box(c,'#5d666c',-3,0,w+6,6);box(c,'#8b949a',-3,0,w+6,2);box(c,'#3e464c',-3,6,w+6,2);for(let x=12;x<w-4;x+=22)box(c,'#3e464c',x,2,1,4);};
const edges=(c:C,w:number,h:number,from:number,dark:string,lit:string)=>{box(c,dark,0,from,2,h-from);box(c,dark,w-2,from,2,h-from);box(c,lit,2,from,1,h-from);};
/** Paints a tagged landing's own tile; (0,0) is its top-left corner. */
export function laneDeck(c:C,p:Platform):boolean {
 const w=p.w,h=p.h,tag=p.tag;
 if(tag==='stack'||tag==='nellstack'){
  // A stack: brick laid to its oversailing courses, capped in cement, strapped in iron where it was tied after a storm.
  c.save();c.translate(0,11);lay(c,w,h-11,BRICK,31+p.id*7);c.restore();edges(c,w,h,11,'#120e0f','#644640');cap(c,w);
  if(p.id%3!==1){const y=22+p.id%4*4;box(c,'#1c2228',0,y,w,3);box(c,'#4a545b',0,y,w,1);for(const x of [6,w-9])box(c,'#59666b',x,y+1,2,1);}
  if(p.id%2){box(c,'#2c2021',w/2-5,-6,10,7);box(c,'#6e4e46',w/2-5,-6,10,1);box(c,'#0b0809',w/2-3,-5,6,2);}
  return true;
 }
 if(tag==='cowl'){
  // A kiln's cowl: a louvred timber turret under a lead cap, turned to the wind.
  box(c,WOOD,0,5,w,h-5);
  for(let y=9;y<h-6;y+=6){box(c,'#33281f',3,y,w-6,4);box(c,'#57452f',3,y,w-6,1);box(c,'#0c0907',3,y+4,w-6,2);}
  for(const x of [0,Math.round(w/2)-2,w-4]){box(c,'#2a2019',x,5,4,h-5);box(c,WOOD_LIT,x+1,5,1,h-5);}
  box(c,WOOD,-2,h-5,w+4,5);box(c,WOOD_LIT,-2,h-5,w+4,1);
  box(c,'#161b21',-3,0,w+6,6);box(c,'#59646b',-3,0,w+6,4);box(c,'#8f9aa0',-3,0,w+6,1);for(let x=6+p.id%3*4;x<w;x+=13)box(c,'#3e474d',x,1,1,3);
  return true;
 }
 if(tag==='wall'||tag==='post'){
  // A yard wall's pier, or the taller pier a washing line is made off to: brick under a stone coping.
  c.save();c.translate(0,8);lay(c,w,h-8,YARD,17+p.id*5);c.restore();edges(c,w,h,8,'#0d1014','#454950');coping(c,w);
  if(tag==='post'){box(c,IRON,w-3,14,6,3);box(c,IRON_LIT,w-3,14,6,1);box(c,IRON,-3,20,6,3);box(c,IRON_LIT,-3,20,6,1);}
  else if(p.id%2){box(c,'#2e4534',3,8,2,7+p.id%5);box(c,'#3a5540',6,8,1,4);}
  return true;
 }
 if(tag==='cote'){
  // The lead flat of a dovecote tower, with the landing board the birds use.
  box(c,'#161b21',-3,0,w+6,10);box(c,'#525d64',-3,0,w+6,6);box(c,'#8f9aa0',-3,0,w+6,1);box(c,'#39424a',-3,6,w+6,2);for(let x=9;x<w;x+=15)box(c,'#3e474d',x,1,1,5);
  c.save();c.translate(0,10);lay(c,w,h-10,COTE,p.id*11);c.restore();edges(c,w,h,10,'#0f1114','#514b44');
  for(let x=7;x<w-9;x+=12){box(c,'#08090b',x,15,5,6);box(c,'#08090b',x+1,14,3,1);}
  box(c,WOOD,2,22,w-4,3);box(c,WOOD_LIT,2,22,w-4,1);
  return true;
 }
 if(tag==='bellcote'){
  // The bellcote on the chapel's gable: dressed stone, the bell in its arch.
  c.save();c.translate(0,8);lay(c,w,h-8,STONE,41);c.restore();edges(c,w,h,8,'#10161d','#46525f');coping(c,w);
  const mx=Math.round(w/2);for(let x=-11;x<=10;x++){const top=18+Math.round(11-Math.sqrt(Math.max(0,121-x*x)));box(c,'#0b0f14',mx+x,top,1,50-top);box(c,'#56636f',mx+x,top-2,1,2);}
  box(c,'#3a4654',mx-13,50,26,3);box(c,'#56636f',mx-13,50,26,1);box(c,IRON,mx-10,22,20,2);
  box(c,'#6b5a34',mx-5,26,10,13);box(c,'#8c7648',mx-4,26,8,11);box(c,'#b79a5c',mx-4,26,2,10);box(c,'#6b5a34',mx-7,38,14,3);box(c,'#2a2419',mx-1,41,2,4);
  return true;
 }
 if(tag==='mullion'){
  // The lantern's stone pier, where two lengths of the glass roof meet.
  c.save();c.translate(0,8);lay(c,w,h-8,STONE,23+p.id);c.restore();edges(c,w,h,8,'#10161d','#46525f');coping(c,w);return true;
 }
 if(tag==='cap'){
  // The head of the brewery stack: three oversailing courses, sooted at the lip, banded in iron.
  c.save();c.translate(0,14);lay(c,w,h-14,SOOT,53);c.restore();edges(c,w,h,14,'#0b0809','#4a3734');
  box(c,'#131112',-4,0,w+8,5);box(c,'#3e2e2c',-4,1,w+8,3);box(c,'#5a433f',-4,0,w+8,1);box(c,'#0b0809',Math.round(w*.2),0,Math.round(w*.6),2);
  box(c,'#131112',-3,5,w+6,5);box(c,'#392b2a',-3,6,w+6,3);box(c,'#131112',-1,10,w+2,4);box(c,'#352828',-1,11,w+2,2);
  box(c,'#1c2228',0,24,w,4);box(c,'#4a545b',0,24,w,1);for(let x=10;x<w;x+=34)box(c,'#59666b',x,25,2,2);
  return true;
 }
 if(tag==='board'||tag==='cracked'){
  // Scaffold boards, three abreast, lashed down at the putlogs.
  box(c,WOOD,-2,0,w+4,12);
  for(let x=0,i=0;x<w;i++){const len=Math.min(w-x,22+Math.floor(hash(i,p.id,3)*14));box(c,i%2?'#5c4836':'#665040',x,1,len-1,7);box(c,WOOD_EDGE,x,0,len-1,2);box(c,'#3d3026',x+3,5,len-8,1);x+=len;}
  box(c,'#2c2219',0,8,w,3);box(c,ROPE,5,0,2,9);box(c,ROPE,w-7,0,2,9);
  if(tag==='cracked'){stroke(c,WOOD,Math.round(w*.42),0,Math.round(w*.5),8);stroke(c,WOOD,Math.round(w*.5),8,Math.round(w*.47),11);box(c,WOOD,Math.round(w*.7),3,6,1);}
  return true;
 }
 if(tag==='plank'){
  // One length of the footbridge: two planks on the bearers, the nails proud.
  box(c,WOOD,0,0,w,p.h);box(c,'#5c4836',0,1,w,3);box(c,'#665040',0,4,w,3);box(c,WOOD_EDGE,0,0,w,1);box(c,'#3d3026',0,4,w,1);
  for(let x=4;x<w;x+=24){box(c,'#1c2228',x,2,1,1);box(c,'#1c2228',x+3,5,1,1);}
  if(p.kind==='crumble'){stroke(c,WOOD,Math.round(w*.4),0,Math.round(w*.55),7);box(c,WOOD,Math.round(w*.2),3,7,1);}
  return true;
 }
 if(tag==='rack'){
  // A drying rail: a round pole in its two bracket cups.
  box(c,WOOD,0,0,w,8);box(c,'#6a5240',0,1,w,4);box(c,'#a88b67',0,0,w,2);box(c,'#3a2d23',0,5,w,2);
  for(const x of [2,w-8]){box(c,IRON,x,-1,6,10);box(c,IRON_LIT,x+1,-1,1,9);}
  return true;
 }
 if(tag==='pane'){
  // A pane of the lantern roof in its iron bars: cracked across, good for a moment.
  box(c,IRON,-2,0,w+4,12);box(c,'#26384a',1,2,w-2,7);box(c,'#3a5068',1,2,w-2,2);box(c,'#7f95ab',0,0,w,1);
  for(let x=Math.round(w/3);x<w-4;x+=Math.round(w/3)){box(c,IRON,x,1,2,10);box(c,IRON_LIT,x,1,1,9);}
  stroke(c,'#9fb3c6',6+p.id%5,2,16+p.id%7,8);stroke(c,'#9fb3c6',w-20,3,w-9,7);box(c,IRON_MID,0,10,w,2);
  return true;
 }
 if(tag==='escape'||tag==='rung'||tag==='gantry'){
  // Iron bar grating in an angle frame.
  box(c,'#12191e',-2,0,w+4,12);box(c,'#aab3ae',0,0,w,1);box(c,'#5d6b70',0,1,w,2);
  for(let x=3;x<w-3;x+=8){box(c,'#1c272d',x,3,3,7);box(c,'#6d7d80',x,3,1,6);}
  box(c,'#2f3d43',0,10,w,2);return true;
 }
 if(tag==='pier'){
  // The forecourt's gate pier: dressed stone under a weathered cap, a sunk panel in its face.
  c.save();c.translate(0,12);lay(c,w,h-12,STONE,57);c.restore();edges(c,w,h,12,'#10161d','#46525f');
  box(c,'#1a222b',12,24,w-24,h-36);box(c,'#232c36',13,25,w-26,h-38);box(c,'#3a4654',13,h-13,w-26,1);
  box(c,'#1a222b',-3,2,w+6,10);box(c,'#56626e',-3,2,w+6,7);box(c,'#3a4652',-1,9,w+2,3);box(c,'#10161d',-1,11,w+2,1);box(c,'#6d777e',-2,0,w+4,3);box(c,'#9aa3a5',-2,0,w+4,1);
  return true;
 }
 if(tag==='court'){
  // The forecourt: worn flags on the head of the retaining wall, which shows under them.
  box(c,'#1a2028',0,0,w,19);
  for(let x=0;x<w;){const wide=Math.min(w-x,26+Math.floor(hash(x,p.id,3)*18)),v=hash(x,p.id,5);box(c,v>.5?'#4b555e':'#454f58',x,2,wide-1,8);box(c,'#5d676f',x,2,wide-1,1);if(v>.7)box(c,'#363f47',x+6,6,7,1);x+=wide;}
  box(c,'#8a949b',0,0,w,2);box(c,'#6b757d',0,2,w,1);box(c,'#1a222b',0,10,w,9);box(c,'#3a4652',0,11,w,6);box(c,'#56626e',0,11,w,1);box(c,'#10161d',0,17,w,2);
  return true;
 }
 if(tag==='hoist'||tag==='sling'){
  // The hoist's pallet: a timber grid in a rope sling.
  box(c,WOOD,-2,0,w+4,p.h);for(let x=0;x<w;x+=13){box(c,'#665040',x,1,11,5);box(c,WOOD_EDGE,x,0,11,2);}box(c,'#2c2219',0,7,w,4);for(const x of [6,w-12]){box(c,'#3d3026',x,6,6,6);box(c,WOOD_LIT,x,6,6,1);}
  return true;
 }
 if(tag==='basket'){
  // The laundry's drying rack, riding its line: a slatted frame with the wash pegged under it.
  box(c,WOOD,-1,0,w+2,p.h);for(let x=1;x<w;x+=9){box(c,'#6a5240',x,1,7,4);box(c,'#a88b67',x,0,7,2);}box(c,'#2c2219',0,6,w,3);
  return true;
 }
 return false;
}
interface Group {kind:string;x0:number;x1:number;y0:number;y1:number;items:Platform[]}
interface LanePlan {towers:Platform[];groups:Group[];movers:Platform[]}
const plans=new WeakMap<Level,LanePlan>();
function plan(l:Level):LanePlan {
 let made=plans.get(l);if(made)return made;
 const towers:Platform[]=[],groups:Group[]=[],movers:Platform[]=[];
 const family=(p:Platform)=>p.tag==='board'||p.tag==='cracked'?'scaffold':p.tag==='pane'||p.tag==='mullion'?'lantern':p.tag==='escape'||p.tag==='rung'||p.tag==='gantry'||p.tag==='rack'||p.tag==='plank'?p.tag:'';
 let open:Group|null=null;
 for(const p of l.platforms){
  if(p.kind==='moving'&&p.tag){movers.push(p);open=null;continue;}
  if(['stack','nellstack','cowl','wall','post','cote','bellcote','mullion','cap'].includes(p.tag??''))towers.push(p);
  const kind=family(p);
  if(!kind){open=null;continue;}
  if(!open||open.kind!==kind||p.branch){open={kind,x0:p.x,x1:p.x+p.w,y0:p.y,y1:p.y+p.h,items:[]};groups.push(open);}
  open.items.push(p);open.x0=Math.min(open.x0,p.x);open.x1=Math.max(open.x1,p.x+p.w);open.y0=Math.min(open.y0,p.y);open.y1=Math.max(open.y1,p.y+p.h);
 }
 made={towers,groups,movers};plans.set(l,made);return made;
}
/** The wall a fire escape is bolted to and the lantern roof's building are houses like any other. */
export function laneHouses(l:Level):{x:number;w:number;top:number;id:number}[]{
 return plan(l).groups.flatMap(g=>g.kind==='escape'?[{x:g.x0-22,w:g.x1-g.x0+44,top:g.y0-70,id:g.items[0].id}]:g.kind==='lantern'?[{x:g.x0-10,w:g.x1-g.x0+20,top:g.y1,id:g.items[0].id+1}]:[]);
}
const pole=(c:C,x:number,top:number,bottom:number)=>{box(c,WOOD,x,top,5,bottom-top);box(c,WOOD_LIT,x+1,top,2,bottom-top);box(c,WOOD_EDGE,x+1,top,1,bottom-top);};
const leg=(c:C,x:number,top:number,bottom:number)=>{box(c,IRON,x,top,4,bottom-top);box(c,IRON_LIT,x+1,top,1,bottom-top);for(let y=top+18;y<bottom;y+=34)box(c,IRON_MID,x-1,y,6,3);};
/** What stands under and behind the lane's landings; `street` is the lane's cobbles. */
export function laneBack(c:C,l:Level,street:number,cx:number,cy:number,vw:number,vh:number){
 const pl=plan(l),lane=street+40,see=(x:number,y:number,w:number,h:number)=>visible(x,y,w,h,cx,cy,vw,vh);
 for(const g of pl.groups){
  if(!see(g.x0-60,g.y0-220,g.x1-g.x0+120,street-g.y0+260))continue;
  if(g.kind==='rack'){
   // The tannery's drying loft: a wall of timber louvres between brick piers, the rails bracketed out of it.
   const x0=g.x0-46,x1=g.x1+46,top=g.y0-196;
   box(c,'#120e0c',x0,top,x1-x0,lane-top);
   for(let y=top+8;y<lane;y+=7){if(y+7<cy-24||y>cy+vh+24)continue;box(c,'#2a211a',x0,y,x1-x0,4);box(c,'#3a2e24',x0,y,x1-x0,1);}
   for(let x=x0,i=0;x<x1;x+=118,i++){c.drawImage(panel(`lane/tan/${g.items[0].id}/${i}`,18,lane-top,KILN,i*13+5),x,top);box(c,'#54423b',x,top,1,lane-top);box(c,'#0b0809',x+18,top,2,lane-top);}
   c.drawImage(panel(`lane/tan/${g.items[0].id}/end`,18,lane-top,KILN,77),x1-18,top);
   box(c,'#161b21',x0-4,top-6,x1-x0+8,8);box(c,'#525d64',x0-4,top-6,x1-x0+8,4);box(c,'#8f9aa0',x0-4,top-6,x1-x0+8,1);
   for(const p of g.items){
    for(const x of [p.x+3,p.x+p.w-8]){box(c,IRON,x,p.y+8,4,22);stroke(c,IRON,x+2,p.y+28,x+(x<p.x+p.w/2?14:-10),p.y+10,2);}
    // Hides pegged over the rail, each cut to its own beast.
    for(let x=p.x+10,i=0;x<p.x+p.w-22;x+=24,i++){const v=hash(i,p.id,7),long=20+Math.floor(v*16),wide=14+Math.floor(hash(i,p.id,9)*6);box(c,v>.5?'#3d3027':'#45362b',x,p.y+8,wide,long);box(c,'#5a4838',x,p.y+8,1,long);box(c,'#2a211b',x+wide-2,p.y+10,2,long-4);box(c,v>.5?'#3d3027':'#45362b',x+2,p.y+8+long,wide-5,4);}
   }
   continue;
  }
  if(g.kind==='scaffold'){
   // Standards from the roof below to above the top lift, a ledger under every board, braces between.
   const foot=Math.min(street,Math.max(...l.platforms.filter(q=>q.kind==='stone'&&q.h>12&&q.y>g.y1-8&&q.x<g.x1&&q.x+q.w>g.x0).map(q=>q.y),g.y1+40)),head=g.y0-52;
   const xs=[...new Set(g.items.flatMap(p=>[p.x+2,p.x+p.w-7]))].sort((a,b)=>a-b);
   for(const x of xs)pole(c,x,head,foot);
   for(const p of g.items){box(c,WOOD,p.x-8,p.y+11,p.w+16,4);box(c,WOOD_LIT,p.x-8,p.y+11,p.w+16,1);box(c,WOOD,p.x-6,p.y-34,p.w+12,3);box(c,WOOD_LIT,p.x-6,p.y-34,p.w+12,1);}
   for(let i=0;i+1<xs.length;i+=2)for(let y=head+20,k=0;y+70<foot;y+=120,k++)stroke(c,'#2c2219',xs[i]+2,k%2?y:y+70,xs[i+1]+2,k%2?y+70:y,2);
   continue;
  }
  if(g.kind==='escape'){
   // Flights between the landings, and a rail round each.
   for(let i=0;i<g.items.length;i++){
    const p=g.items[i],n=g.items[i+1];
    box(c,IRON,p.x,p.y-26,p.w,2);box(c,IRON_LIT,p.x,p.y-26,p.w,1);for(let x=p.x+2;x<p.x+p.w;x+=10)box(c,IRON_MID,x,p.y-24,1,24);
    for(const x of [p.x+8,p.x+p.w-14]){box(c,IRON,x,p.y+11,6,5);stroke(c,IRON,x+3,p.y+15,x+3+(x<p.x+p.w/2?-12:12),p.y+34,2);}
    if(!n)continue;
    const down=n.y>p.y,a=down?p:n,b=down?n:p,right=b.x+b.w/2>a.x+a.w/2,ax=right?a.x+a.w-10:a.x+10,bx=right?b.x+16:b.x+b.w-16;
    stroke(c,IRON,ax,a.y+11,bx,b.y-1,2);stroke(c,IRON_LIT,ax,a.y+10,bx,b.y-2);
    for(let k=1;k<6;k++){const t=k/6;box(c,IRON_MID,Math.round(ax+(bx-ax)*t)-3,Math.round(a.y+11+(b.y-a.y-12)*t),7,1);}
   }
   continue;
  }
  if(g.kind==='rung'){
   // The stack's landings stand out from its shaft on brackets, a ladder from each to the next.
   const shaft=l.platforms.find(q=>q.tag==='cap'&&q.x>=g.x1-8&&q.x<g.x1+90);
   for(let i=0;i<g.items.length;i++){
    const p=g.items[i],n=g.items[i+1];
    if(shaft){box(c,IRON,p.x+p.w-4,p.y+10,shaft.x+10-p.x-p.w+4,3);box(c,IRON_LIT,p.x+p.w-4,p.y+10,shaft.x+10-p.x-p.w+4,1);stroke(c,IRON,p.x+p.w-10,p.y+12,shaft.x+10,p.y+40,2);}
    box(c,IRON,p.x,p.y-24,p.w,2);box(c,IRON_LIT,p.x,p.y-24,p.w,1);for(const x of [p.x,p.x+p.w-2])box(c,IRON,x,p.y-24,2,24);
    if(n){const x=Math.round((Math.max(p.x,n.x)+Math.min(p.x+p.w,n.x+n.w))/2)-6;for(const s of [0,10])box(c,IRON,x+s,n.y+12,2,p.y-n.y-12);for(let y=n.y+18;y<p.y-2;y+=8)box(c,IRON_LIT,x+2,y,8,1);}
   }
   continue;
  }
  if(g.kind==='gantry'){
   // The sign gantry over the lane: each walk on two lattice legs, the shop signs hung under it.
   for(const p of g.items){
    for(const x of [p.x+4,p.x+p.w-8]){leg(c,x,p.y+12,lane);}
    for(let y=p.y+24,k=0;y+40<lane;y+=40,k++)stroke(c,IRON_MID,p.x+6,k%2?y:y+40,p.x+p.w-6,k%2?y+40:y);
    box(c,IRON,p.x,p.y-22,p.w,2);box(c,IRON_LIT,p.x,p.y-22,p.w,1);for(const x of [p.x,p.x+p.w-2])box(c,IRON,x,p.y-22,2,22);
    if(p.id%2){const sx=p.x+p.w/2-17,sy=p.y+22;box(c,IRON,sx+4,p.y+12,1,10);box(c,IRON,sx+29,p.y+12,1,10);box(c,'#12181d',sx,sy,34,20);box(c,p.id%4===1?'#5a3d27':'#2d4350',sx+2,sy+2,30,16);box(c,p.id%4===1?'#a8763f':'#6f8fa0',sx+6,sy+6,22,2);box(c,p.id%4===1?'#a8763f':'#6f8fa0',sx+6,sy+11,14,2);}
   }
   continue;
  }
  if(g.kind==='plank'){
   // The footbridge's two bearers run house to house under what is left of its planks.
   const x0=g.x0-34,x1=g.x1+34,y=g.y0+8;
   for(const dy of [0,7]){box(c,WOOD,x0,y+dy,x1-x0,3);box(c,dy?WOOD_MID:WOOD_LIT,x0,y+dy,x1-x0,1);}
   for(let x=x0+30;x<x1-20;x+=64)box(c,WOOD,x,y,3,10);
   stroke(c,WOOD,x0+2,y+40,x0+38,y+10,3);stroke(c,WOOD,x1-4,y+40,x1-40,y+10,3);
   continue;
  }
  if(g.kind==='lantern'){
   // The lantern roof's bars go on across the gaps where panes have gone: a frame, and nothing in it.
   const y=g.y1-3;box(c,IRON,g.x0-10,y,g.x1-g.x0+20,2);box(c,IRON_LIT,g.x0-10,y,g.x1-g.x0+20,1);
   for(let x=g.x0+2;x<g.x1;x+=22)if(!g.items.some(p=>x>p.x-3&&x<p.x+p.w+3)){box(c,IRON,x,y-9,1,10);box(c,'#7f95ab',x+1,y-3-(x%3),1,3);}
  }
 }
 for(const p of pl.towers){
  const top=p.y+p.h,tag=p.tag!;if(!see(p.x-70,top,p.w+140,lane-top))continue;
  if(tag==='stack'||tag==='nellstack'){
   // The chimney breast under the stack: brick down the gable to the lane, toothed into the house wall beside it.
   c.drawImage(panel(`lane/breast/${p.id}`,p.w,lane-top,BRICK,37+p.id*3),p.x,top);box(c,'#120e0f',p.x+p.w-2,top,2,lane-top);box(c,'#644640',p.x+2,top,1,lane-top);
   for(let y=top+4,k=0;y<lane;y+=16,k++)box(c,k%2?'#3a2826':'#503733',p.x-4,y,6,7);
   const off=top+96+p.id%3*24;box(c,'#1a1415',p.x-2,off,p.w+6,6);box(c,'#644640',p.x-2,off,p.w+6,1);
  }else if(tag==='cowl'){
   // The kiln: a slated pyramid up to the cowl, and the brick kiln under it with its stoke hole at the lane.
   const rise=78,half=58;
   for(let y=0;y<rise;y+=6){const out=Math.round(half*(y+6)/rise);box(c,'#12161b',p.x-out,top+y,p.w+out*2,6);box(c,y%12?'#262d36':'#2a323c',p.x-out+1,top+y+1,p.w+out*2-2,5);box(c,'#3a4450',p.x-out+1,top+y+1,p.w+out*2-2,1);for(let x=p.x-out+5+y%12;x<p.x+p.w+out-4;x+=11)box(c,'#12161b',x,top+y+2,1,4);}
   const bx=p.x-half-2,bw=p.w+half*2+4,by=top+rise;c.drawImage(panel(`lane/kiln/${p.id}`,bw,lane-by,KILN,p.id*9),bx,by);box(c,'#0b0809',bx,by,2,lane-by);box(c,'#0b0809',bx+bw-2,by,2,lane-by);box(c,'#54423b',bx+2,by,1,lane-by);
   box(c,'#171415',bx-3,by,bw+6,5);box(c,'#5c4a42',bx-3,by,bw+6,1);box(c,'#1c2228',bx,by+70,bw,4);box(c,'#4a545b',bx,by+70,bw,1);
  }else if(tag==='cap'){
   // The brewery stack's shaft, banded every few feet.
   c.drawImage(panel(`lane/shaft/${p.id}`,p.w-12,lane-top,SOOT,59),p.x+6,top);box(c,'#0b0809',p.x+6,top,2,lane-top);box(c,'#4a3734',p.x+8,top,1,lane-top);box(c,'#0b0809',p.x+p.w-8,top,2,lane-top);box(c,'#0b080988',p.x+p.w-28,top,20,lane-top);
   for(let y=top+52;y<lane;y+=64){box(c,'#1c2228',p.x+6,y,p.w-12,4);box(c,'#4a545b',p.x+6,y,p.w-12,1);}
  }else if(tag==='cote'){
   // A dovecote tower: brick, a string course, the flight holes under the eaves.
   c.drawImage(panel(`lane/cote/${p.id}`,p.w-4,lane-top,COTE,p.id*13),p.x+2,top);box(c,'#0f1114',p.x+2,top,2,lane-top);box(c,'#514b44',p.x+4,top,1,lane-top);box(c,'#0f1114',p.x+p.w-4,top,2,lane-top);
   for(let row=0;row<2;row++)for(let x=p.x+8+row*5;x<p.x+p.w-12;x+=11){box(c,'#08090b',x,top+8+row*14,5,6);box(c,'#08090b',x+1,top+7+row*14,3,1);}
   box(c,'#17191d',p.x,top+36,p.w,4);box(c,'#5a534b',p.x,top+36,p.w,1);box(c,'#c9cfc633',p.x+10,top+40,2,26);box(c,'#c9cfc626',p.x+p.w-16,top+40,2,18);
  }else{
   // A pier of the yard wall, the bellcote's buttress or the lantern's pier, down to its own footing.
   const work=tag==='bellcote'||tag==='mullion'?STONE:YARD,lit=work===STONE?'#46525f':'#454950';
   c.drawImage(panel(`lane/pier/${p.id}`,p.w,lane-top,work,p.id*7+3),p.x,top);box(c,'#0d1014',p.x,top,2,lane-top);box(c,lit,p.x+2,top,1,lane-top);box(c,'#0d1014',p.x+p.w-2,top,2,lane-top);
   if(tag==='post'){const n=l.platforms[p.id+1];if(n?.tag==='post'){
    // The washing line to the next pier, sagging under what is pegged to it.
    const ax=p.x+p.w+2,ay=p.y+15,bx=n.x-2,by=n.y+21;for(let x=ax;x<bx;x+=2){const t=(x-ax)/(bx-ax),y=Math.round(ay+(by-ay)*t+Math.sin(t*Math.PI)*7);box(c,ROPE,x,y,2,1);}
    for(let k=1;k<4;k++){const t=k/4,x=Math.round(ax+(bx-ax)*t)-6,y=Math.round(ay+(by-ay)*t+Math.sin(t*Math.PI)*7)+1,v=hash(k,p.id,3),tall=9+Math.floor(v*9);box(c,v>.6?'#8a94a0':v>.3?'#a39a86':'#7d6a66',x,y,11,tall);box(c,'#c9cfc644',x,y,11,1);box(c,'#00000030',x+8,y+1,3,tall-1);}
   }}
  }
 }
 for(const p of pl.movers){
  const travel=p.travel??0;
  if(p.tag==='hoist'){
   // The jib the hoist hangs from: a timber out of the wall head above the top of its travel, strutted back, a sheave at its end.
   const y=p.y-travel-58,mx=p.x+p.w/2;if(!see(p.x-20,y-10,p.w+140,travel*2+90))continue;
   box(c,WOOD,mx-10,y,p.w+34,6);box(c,WOOD_LIT,mx-10,y,p.w+34,1);box(c,WOOD_EDGE,mx-10,y+1,p.w+34,1);stroke(c,WOOD,mx+16,y+6,p.x+p.w+22,y+34,3);
   box(c,IRON,mx-5,y+6,10,9);box(c,IRON_LIT,mx-3,y+8,6,5);box(c,IRON,mx-1,y+10,2,2);
  }else if(p.tag==='basket'||p.tag==='sling'){
   // The line the rack rides, from one loft's bracket to the other's.
   const y=p.y-34,x0=p.x-travel-34,x1=p.x+p.w+travel+34;if(!see(x0,y-10,x1-x0,60))continue;
   box(c,ROPE,x0,y,x1-x0,1);box(c,'#5c513d',x0,y+1,x1-x0,1);
   for(const x of [x0-4,x1]){box(c,IRON,x,y-8,4,42);box(c,IRON_LIT,x+1,y-8,1,42);stroke(c,IRON,x+2,y+30,x+(x<p.x?-14:16),y+34,2);}
  }
 }
}
/** Whatever carries a moving landing, at its live position. */
export function laneMover(c:C,p:Platform,x:number,y:number):boolean {
 const w=p.w,travel=p.travel??0;
 if(p.tag==='hoist'){
  const top=p.y-travel-44,mx=x+Math.round(w/2);
  box(c,ROPE,mx,top,1,y-22-top);box(c,'#5c513d',mx+1,top,1,y-22-top);
  box(c,IRON,mx-3,y-24,7,5);box(c,IRON_LIT,mx-2,y-23,2,2);
  stroke(c,ROPE,mx,y-19,x+5,y);stroke(c,ROPE,mx,y-19,x+w-6,y);
  return false;
 }
 if(p.tag==='sling'){
  // The coopers' sling: a trolley on the rail, a plank cradle, two casks roped under it.
  const line=p.y-34,mx=x+Math.round(w/2);
  box(c,IRON,mx-6,line-3,12,7);box(c,IRON_LIT,mx-4,line-2,3,3);box(c,IRON_LIT,mx+2,line-2,3,3);
  stroke(c,ROPE,mx-3,line+4,x+4,y);stroke(c,ROPE,mx+3,line+4,x+w-5,y);
  for(const at of [x+5,x+w-27]){box(c,WOOD,at,y+10,22,18);box(c,'#5c4836',at+1,y+11,20,16);box(c,WOOD_EDGE,at+1,y+11,20,1);for(const b of [3,9,14])box(c,'#1c2228',at+1,y+11+b,20,2);box(c,'#3d3026',at+17,y+12,4,14);box(c,ROPE,at+10,y+8,1,3);}
  return false;
 }
 if(p.tag==='basket'){
  const line=p.y-34,mx=x+Math.round(w/2);
  box(c,IRON,mx-6,line-3,12,7);box(c,IRON_LIT,mx-4,line-2,3,3);box(c,IRON_LIT,mx+2,line-2,3,3);
  stroke(c,ROPE,mx-3,line+4,x+4,y);stroke(c,ROPE,mx+3,line+4,x+w-5,y);
  // The wash under the rack hangs still: sheets, a shirt, a stocking.
  for(let i=0,at=x+4;at<x+w-10;i++){const v=hash(i,p.id,5),wide=9+Math.floor(v*8),tall=14+Math.floor(hash(i,p.id,6)*12);box(c,v>.55?'#8a94a0':v>.25?'#a39a86':'#7d6a66',at,y+9,wide,tall);box(c,'#c9cfc644',at,y+9,wide,1);box(c,'#00000030',at+wide-3,y+10,3,tall-1);at+=wide+3;}
  return false;
 }
 return false;
}
