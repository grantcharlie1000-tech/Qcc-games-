import type {Level,Platform,Station} from './levels';
import type {Run} from './model';
import {box,hash,lay,panel,sprite,stroke,visible,type C,type Work} from './quarter-kit';
import type {QuarterSet} from './quarter-sets';
import {HOIST_RIDE,departureOffset,departureVisibility} from './departure';

/** Level 7 · the Quarter's hoist tower, seen in section. Two lift wells run
 * the height of one brick shaft. Each cage rides a pair of guide rails on a
 * cable from the winding gear at the crown; every landing is an iron floor
 * on a girder that crosses the shaft from wall to wall; ladders are iron
 * landings on the side walls; each counterweight hangs on its own chain in
 * a guide frame bolted to the girder above. Below the first landing the
 * wells go down to the pit.
 * The shaft has a far side. Every landing is a floor of chequer plate that
 * runs back from the edge you walk to the far wall; each well has a second
 * pair of guides against that wall; and the wall itself is the tower's own:
 * brick piers, a string course to every storey, and between the piers tall
 * iron-framed windows with the night behind them, or arches bricked up. */
const L=24,CROWN=250,BACK=12,RETURN=22,STOREY=180,BAY=160,PIER=20;
/** The shaft is built, not tiled: the far wall is laid cell by cell between
 * its piers and string courses, each pier and each corner return storey by
 * storey, and the cut walls between the floors whose girders they carry. */
const FAR:Work={course:6,short:10,long:16,mortar:'#0f0d12',stones:['#19151b','#1b161c','#1c181e','#18141a'],lip:'#201b21',shade:'#141116',chip:'#231d23'};
const PIERS:Work={course:8,short:10,long:18,mortar:'#131016',stones:['#231d23','#251e24','#272026','#211b21'],lip:'#2d252b',shade:'#1d181d',chip:'#31282e'};
const SIDES:Work={course:16,short:5,long:10,mortar:'#0d0b0f',stones:['#17131a','#18141b','#1a151c'],lip:'#1e181f',shade:'#131017',chip:'#211b22'};
const CUTS:Work={course:14,short:10,long:28,mortar:'#1b1719',stones:['#40312f','#453432','#4a3835','#3d2f2d'],lip:'#59453f',shade:'#33282a',chip:'#634e47'};
/** The hoist house stands one lift ride above the lift landing at the top of
 * the shaft: its floor, its roof over that, and the parapet the cut walls stop at. */
const houseFloor=(l:Level)=>l.platforms[l.mainCount-1].y-8-HOIST_RIDE;
const roofOf=(l:Level)=>houseFloor(l)-112;
/** Window openings through the cut walls: [side, head, sill]. */
const OPENINGS:readonly (readonly [0|1,number,number])[]=[[0,1196,1248],[0,676,728],[1,1036,1088],[1,316,368]];
/** A window of the far wall: a round-headed opening, iron glazing bars, and
 * the night through whatever glass is left. The third kind was bricked up. */
const farWindow=(kind:number)=>sprite(`hoist/window/${kind}`,64,116,c=>{
 const head=(x:number,r:number)=>32-Math.round(r*Math.sqrt(Math.max(0,1-((x+.5-32)/r)**2)));
 for(let x=0;x<64;x++){const top=head(x,32);box(c,'#2d252b',x,top,1,3);box(c,'#08090c',x,top+3,1,112-top-3);}
 for(let i=0;i<9;i++){const g=Math.PI*(i+.5)/9;box(c,'#131016',32-Math.cos(g)*31,32-Math.sin(g)*31,1,3);}
 if(kind===2){// Bricked up in later work: its own courses, set back in the opening, stopping at the reveal.
  const fill=sprite('hoist/window/infill',56,108,f=>lay(f,56,108,PIERS,91));for(let x=4;x<60;x++){const top=head(x,28)+4;c.drawImage(fill,x-4,top-2,1,110-top,x,top,1,110-top);box(c,'#08090c',x,top,1,3);}box(c,'#08090c',4,34,3,76);}
 else for(let x=4;x<60;x++){
  const top=head(x,28)+4,col=Math.floor((x-4)/8);
  for(let row=0;row<11;row++){
   const y0=Math.max(top,row*10),y1=Math.min(110,row*10+10);if(y1<=y0)continue;
   const v=hash(col,row,kind+61),lost=v<(kind?.22:.06);
   box(c,lost?'#0e1219':v>.7?'#263850':v>.4?'#213148':'#1d2c42',x,y0,1,y1-y0);
   if(!lost&&row>7)box(c,'#15202f',x,y0,1,y1-y0);
  }
  if((x-4)%8===7)box(c,'#0d1015',x,top,1,110-top);
 }
 if(kind!==2)for(let row=1;row<11;row++)box(c,'#0d1015',4,row*10,56,1);
 box(c,'#2d252b',-2,110,68,4);box(c,'#3a3036',0,110,64,1);box(c,'#08090c',0,114,64,2);
});
/** Diagonal ties between a well's far guides, one storey of them. */
const ties=(w:number)=>sprite(`hoist/ties/${w}`,w,128,c=>{stroke(c,'#151b20',2,0,w-3,127);stroke(c,'#151b20',w-3,0,2,127);box(c,'#1a2228',0,0,w,2);box(c,'#2a343a',0,0,w,1);});
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
 const ROOF=roofOf(l);
 const pl=plan(l),top=cy-24,bottom=cy+vh+24,pit=l.height-20,right=pl.right,low=Math.min(bottom,pit);
 // The far wall: small dark brick laid in a cell between each pair of piers and each pair of string courses, with its windows.
 const piers:number[]=[];for(let x=L+RETURN;x<right-RETURN;x+=BAY)piers.push(x);
 for(let y=pit-Math.ceil((pit-Math.max(top,ROOF))/STOREY)*STOREY;y<low;y+=STOREY){
  const a=Math.max(ROOF,y+9),b=Math.min(pit,y+STOREY);if(b<=a||b<top)continue;
  let x0=L;for(const x of [...piers,right]){if(x>x0)c.drawImage(panel(`hoist/far/${x0}/${a}`,x-x0,b-a,FAR,x0*7+a),x0,a);x0=x+PIER;}
  for(const x of piers){c.drawImage(panel(`hoist/pier/${x}/${a}`,PIER,b-a,PIERS,x+a*3),x,a);box(c,'#31282e',x,a,1,b-a);box(c,'#08090c',x+PIER,a,3,b-a);}
  for(const side of [0,1])c.drawImage(panel(`hoist/return/${side}/${a}`,RETURN,b-a,SIDES,a+side*13),side?right-RETURN:L,a);
 }
 for(let y=pit-Math.ceil((pit-top)/STOREY)*STOREY;y<low;y+=STOREY){
  if(y<ROOF)continue;const storey=Math.round((pit-y)/STOREY);
  for(let x=L+RETURN+PIER,bay=0;x+BAY-PIER<=right-RETURN;x+=BAY,bay++){
   const v=hash(bay,storey,71);if(v<.16||y+30>low||y+146<top||y+30<ROOF+10)continue;
   if(y+30<houseFloor(l)+40&&y+146>houseFloor(l)-12)continue;
   if(y<houseFloor(l)&&y+146>houseFloor(l)-100&&x+38<exitDoor(l)+136&&x+102>exitDoor(l)+56)continue;
   c.drawImage(farWindow(v>.62?0:v>.36?1:2),x+38,y+30);
  }
  // A string course every storey: the cells above and below stop against it, and it caps every pier.
  if(y+8>top){box(c,'#231d23',L,y,right-L,7);box(c,'#2d252b',L,y,right-L,1);box(c,'#0b090d',L,y+7,right-L,2);for(const x of piers){box(c,'#2d252b',x-2,y-2,PIER+4,10);box(c,'#3a3036',x-2,y-2,PIER+4,1);box(c,'#0b090d',x-2,y+8,PIER+4,2);}}
 }
 // The corners: each return is the side wall's inner face, in shadow, meeting the far wall in a dark arris.
 box(c,'#060709',L+RETURN,Math.max(top,ROOF),2,low-Math.max(top,ROOF));box(c,'#060709',right-RETURN-2,Math.max(top,ROOF),2,low-Math.max(top,ROOF));
 for(const well of pl.wells){
  // Against the far wall each well has its second pair of guides, tied across with diagonals.
  if(well.x+well.w+12<cx-24||well.x-12>cx+vw+24)continue;
  const a=Math.max(top,CROWN),b=low;if(b<=a)continue;
  box(c,'#050609a6',well.x+2,a,well.w-4,b-a);
  for(let y=CROWN+Math.floor((a-CROWN)/128)*128;y<b;y+=128)c.drawImage(ties(well.w-8),well.x+4,y);
  for(const x of [well.x+1,well.x+well.w-4]){box(c,'#0d1115',x,a,3,b-a);box(c,'#2a343a',x,a,1,b-a);}
 }
 // Every landing is a floor: chequer plate running back from the edge you walk to an angle iron on the far wall.
 for(const p of l.platforms)if(p.kind==='stone'&&visible(p.x,p.y-BACK-6,p.w,BACK+8,cx,cy,vw,vh)){
  box(c,'#0b0d10',p.x,p.y-BACK-5,p.w,5);box(c,'#12181d',p.x,p.y-BACK-3,p.w,3);box(c,'#3a474e',p.x,p.y-BACK-3,p.w,1);
  box(c,'#1a2227',p.x,p.y-BACK,p.w,4);box(c,'#20292f',p.x,p.y-BACK+4,p.w,4);box(c,'#273138',p.x,p.y-4,p.w,4);
  for(let x=p.x+24-p.x%24;x<p.x+p.w;x+=24)box(c,'#12181d',x,p.y-BACK,1,BACK);
  for(let row=0;row<3;row++)for(let x=p.x+3+row*3;x<p.x+p.w-3;x+=8+row*2)box(c,row===2?'#3a474e':row?'#2c373e':'#242d33',x,p.y-BACK+2+row*4,2+row,1);
 }
 // An iron girder crosses the shaft at every floor; the rails and landings are fixed to it.
 for(const y of pl.floors)if(y+40>top&&y<bottom){
  // Over the crown the winding floor's girder starts where the floor does: the west end is left open for the ladder.
  const g0=y<CROWN?Math.min(...l.platforms.filter(p=>p.y===y).map(p=>p.x)):L;
  if(g0>L){box(c,'#12181d',g0,y+6,right-g0,18);box(c,'#2c383f',g0,y+8,right-g0,12);box(c,'#4f5f66',g0,y+6,right-g0,2);box(c,'#0d1216',g0,y+22,right-g0,2);for(let x=g0+10;x<right;x+=18)box(c,'#5a686b',x,y+13,2,2);box(c,'#06070999',g0,y+24,right-g0,8);box(c,'#12181d',g0-4,y+4,8,22);continue;}
  box(c,'#12181d',L,y+6,right-L,18);box(c,'#2c383f',L,y+8,right-L,12);box(c,'#4f5f66',L,y+6,right-L,2);box(c,'#0d1216',L,y+22,right-L,2);for(let x=L+10;x<right;x+=18)box(c,'#5a686b',x,y+13,2,2);box(c,'#06070999',L,y+24,right-L,8);}
 // Two lattice stanchions stand between the wells from the pit to the crown.
 if(pl.wells.length>1){const a=pl.wells[0].x+pl.wells[0].w+10,b=pl.wells[1].x-22;for(const x of [a,b]){box(c,'#12181d',x,CROWN,12,pit-CROWN);box(c,'#3d4a51',x,CROWN,2,pit-CROWN);box(c,'#3d4a51',x+10,CROWN,2,pit-CROWN);for(let y=Math.max(CROWN,Math.floor(top/24)*24);y<Math.min(pit,bottom);y+=24)stroke(c,'#2c383f',x+2,y,x+10,y+12);}}
 // A lobby door in the far wall at every side landing, at the back of its floor.
 if(visible(L,l.platforms[0].y-100,120,100,cx,cy,vw,vh))stairwell(c,l.platforms[0]);
 for(const p of l.platforms)if(p.kind==='stone'&&p.id&&p.y>CROWN&&(p.x<=L+4||p.x+p.w>=right-4)&&visible(p.x,p.y-80,p.w,80,cx,cy,vw,vh)){const x=Math.round(p.x+p.w*(p.x<=L+4?.3:.7))-14,y=p.y-BACK-3;box(c,'#0d1014',x-3,y-50,34,50);box(c,'#231d1f',x,y-47,28,47);box(c,'#2c2527',x,y-47,13,47);box(c,'#3b3034',x-3,y-52,34,3);box(c,'#6d6248',x+10,y-24,2,4);}
 for(const well of pl.wells){
  if(well.x+well.w+12<cx-24||well.x-12>cx+vw+24)continue;
  // The near guides either side of the well, and the sheave at the crown.
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
 for(const p of l.platforms)if(p.kind==='grate'&&p.y<CROWN+160&&visible(p.x,ROOF,p.w,p.y-ROOF+20,cx,cy,vw,vh)){
  // Over the crown the gratings hang on rods: from the winding floor's girder, or west of it from the roof trusses.
  const over=l.platforms.find(q=>q.kind==='stone'&&q.y<p.y&&q.x<=p.x&&q.x+q.w>=p.x+p.w),from=over?over.y+24:houseFloor(l)+28;
  for(const x of [p.x+4,p.x+p.w-7]){box(c,'#1a2228',x,from,3,p.y-from);box(c,'#56646b',x,from,1,p.y-from);box(c,'#1a2228',x-1,p.y+8,5,4);}
 }
 for(const p of l.platforms)if(p.kind==='grate'&&p.y>=CROWN+160&&visible(p.x,p.y-20,p.w,90,cx,cy,vw,vh)){
  // A ladder landing: rail behind, bracket to the wall, the ladder down to the one below.
  box(c,'#1a2228',p.x,p.y-16,p.w,2);for(let x=p.x+1;x<p.x+p.w;x+=12)box(c,'#1a2228',x,p.y-14,1,14);
  const x=p.x+Math.round(p.w/2)-6;box(c,'#1a2228',x,p.y+12,2,52);box(c,'#1a2228',x+10,p.y+12,2,52);box(c,'#56646b',x,p.y+12,1,52);for(let y=p.y+17;y<p.y+64;y+=7)box(c,'#3a464d',x+2,y,8,1);
 }
 // The cut walls of the shaft, laid between the floors whose girders bear on them, with their windows and parapet; and the footing under the first landing.
 for(const side of [0,1] as const)cutWall(c,l,pl.floors,side,right,top,bottom);
 const first=l.platforms[0];if(bottom>first.y+28)c.drawImage(panel('hoist/footing',first.w,l.height+40-first.y-28,CUTS,5),first.x,first.y+28);
 // The winding house: its roof over the floor, two drums with their cables down to the sheaves, and its door out.
 if(top<CROWN)windingHouse(c,l,pl,right,clock,top);
 // The pit floor runs back to the far wall like every other; water has got into it.
 if(pit<bottom+BACK){box(c,'#15191d',L,pit-BACK,right-L,BACK);box(c,'#232a30',L,pit-BACK,right-L,1);for(let x=L+30;x<right-40;x+=97){const v=hash(x,3,79);box(c,'#101c20',x+Math.floor(v*30),pit-8+Math.floor(v*4),26+Math.floor(v*30),2);box(c,'#2a4046',x+4+Math.floor(v*30),pit-8+Math.floor(v*4),10,1);}box(c,'#0d1014',L,pit,right-L,bottom-pit);box(c,'#3b3034',L,pit,right-L,2);}
}
/** Where the door out of the hoist house stands on the winding floor. */
const exitDoor=(l:Level)=>Math.round(l.exit.x+l.exit.w/2);
function cutWall(c:C,l:Level,floors:readonly number[],side:0|1,right:number,top:number,bottom:number){
 const x0=side?right:0,wide=side?140:L,face=side?right:L,foot=l.height+40,ROOF=roofOf(l),PARAPET=ROOF-24;
 const lines=[PARAPET,...[...floors].sort((a,b)=>a-b).map(y=>y+14),foot];
 for(let i=0;i<lines.length-1;i++){const a=lines[i],b=lines[i+1];if(b<top||a>bottom||b<=a)continue;c.drawImage(panel(`hoist/cut/${side}/${a}`,wide,b-a,CUTS,a+side*101),x0,a);}
 const from=Math.max(top,PARAPET),to=Math.min(bottom,foot);
 box(c,'#6d5850',side?right:L-1,from,1,to-from);box(c,'#0b0d11',side?right-2:L,Math.max(top,ROOF),2,to-Math.max(top,ROOF));
 // The parapet's coping, over the roof.
 if(PARAPET>top-8&&PARAPET<bottom){box(c,'#2a2224',x0-3,PARAPET-5,wide+6,6);box(c,'#7a665e',x0-3,PARAPET-5,wide+6,1);box(c,'#120e10',x0-3,PARAPET+1,wide+6,1);}
 for(const [s2,head,sill] of OPENINGS){
  if(s2!==side||sill+8<top||head-8>bottom)continue;
  box(c,'#1a2436',x0,head,wide,sill-head);box(c,'#24324a',side?x0+wide-8:x0,head,8,sill-head);
  box(c,'#1b1719',x0-1,head-7,wide+2,7);box(c,'#6d5850',x0,head-6,wide,5);box(c,'#8a7468',x0,head-6,wide,1);
  box(c,'#1b1719',x0-1,sill,wide+2,6);box(c,'#6d5850',x0,sill,wide,4);box(c,'#8a7468',x0,sill,wide,1);
 }
 // Every floor's girder bears on the wall: its end in a pocket the courses stop round, on a padstone.
 for(const y of floors){
  if(y+40<top||y>bottom)continue;if(y<CROWN&&!side&&l.platforms.every(p=>p.y!==y||p.x>L+4))continue;
  const into=side?face:face-12;box(c,'#0b0d11',into-1,y+4,14,22);box(c,'#12181d',into,y+6,12,18);box(c,'#4f5f66',into,y+6,12,2);box(c,'#0d1216',into,y+22,12,2);box(c,'#2c383f',into+(side?0:6),y+10,6,10);
  box(c,'#1b1719',side?face-2:face-14,y+26,16,7);box(c,'#6d5850',side?face-1:face-13,y+27,14,5);box(c,'#8a7468',side?face-1:face-13,y+27,14,1);
 }
}
/** The culvert's street stair comes up into the pit through an arch in the far wall. */
function stairwell(c:C,p:Platform){
 const x=L+RETURN+34,y=p.y-BACK-3;
 box(c,'#f3c77a0c',x-40,y-84,80,84);
 box(c,'#120e11',x-28,y-64,56,64);box(c,'#120e11',x-24,y-71,48,8);box(c,'#120e11',x-16,y-76,32,6);
 for(let i=0;i<7;i++){const yy=y-62+i*9;box(c,i%2?'#4d3c3a':'#423334',x-26,yy,8,8);box(c,i%2?'#423334':'#4d3c3a',x+18,yy,8,8);}
 for(let i=0;i<5;i++)box(c,i%2?'#4d3c3a':'#423334',x-22+i*9,y-69-(i===2?5:i===1||i===3?3:0),8,7);
 // The stair coming up out of the dark from the culvert, lit from below by the lamps you left on.
 box(c,'#0b0d11',x-17,y-58,34,58);for(let i=0;i<6;i++){box(c,'#2a2226',x-17+i*5,y-6-i*9,34-i*5,6);box(c,'#57443f',x-17+i*5,y-6-i*9,34-i*5,1);}
 box(c,'#f3c77a22',x-17,y-12,34,12);
 box(c,'#57514d',x-28,y-3,56,3);box(c,'#a39b92',x-28,y-3,56,1);
 box(c,'#12181d',x-15,y-92,30,12);box(c,'#aab3ae',x-13,y-90,26,8);box(c,'#12181d',x-1,y-88,2,5);box(c,'#12181d',x-3,y-85,6,1);box(c,'#12181d',x-2,y-84,4,1);
}
function windingHouse(c:C,l:Level,pl:{wells:{x:number;w:number}[]},right:number,clock:number,top:number){
 const ROOF=roofOf(l),PARAPET=ROOF-24,floor=houseFloor(l);
 // The roof: trusses on the side walls, boarded over, under the parapet.
 if(top<ROOF+30){box(c,'#0e1216',L,PARAPET,right-L,ROOF-PARAPET+6);box(c,'#2a3036',L,ROOF+2,right-L,4);box(c,'#3d454c',L,PARAPET,right-L,1);for(let x=L+40;x<right-20;x+=120){stroke(c,'#17110d',x,ROOF+6,x+60,ROOF+30,3);stroke(c,'#17110d',x+120,ROOF+6,x+60,ROOF+30,3);box(c,'#17110d',x,ROOF+28,120,4);}}
 if(top<PARAPET)box(c,'#141c2c',L,top,right-L,PARAPET-top);
  // The hoist house floor: chequer plate on a girder from wall to wall, the lift's rails coming up through it.
 box(c,'#0b0d10',L,floor-BACK-5,right-L,5);box(c,'#1a2227',L,floor-BACK,right-L,BACK);box(c,'#273138',L,floor-4,right-L,4);
 box(c,'#0d1216',L,floor,right-L,28);box(c,'#3a474e',L,floor,right-L,6);box(c,'#aab3ae',L,floor,right-L,1);box(c,'#2c383f',L,floor+6,right-L,16);box(c,'#4f5f66',L,floor+6,right-L,2);for(let x=L+10;x<right;x+=18)box(c,'#5a686b',x,floor+13,2,2);box(c,'#06070999',L,floor+28,right-L,8);
 houseDoor(c,l,floor);
 for(const well of pl.wells){
  // The drum that winds this well's cable sits on the floor; the cable runs down through a slot to the sheave.
  const mid=well.x+Math.round(well.w/2),dx=mid+60;if(dx+30>right-RETURN||Math.abs(dx-exitDoor(l)-96)<80)continue;
  for(let yy=-22;yy<=22;yy++){const out=Math.floor(Math.sqrt(484-yy*yy));box(c,'#151b20',dx-out,floor-30+yy,out*2,1);}
  box(c,'#2c383f',dx-18,floor-48,36,36);for(let yy=floor-46;yy<floor-14;yy+=4)box(c,'#59666b',dx-17,yy,34,1);box(c,'#12181d',dx-26,floor-8,52,8);box(c,'#3d4a51',dx-26,floor-8,52,1);
  stroke(c,'#59666b',dx-18,floor-40,mid,floor+30,1);box(c,'#0b0d11',mid-6,floor,12,4);
  for(let i=0;i<4;i++){const a=clock*.4+i*Math.PI/2;stroke(c,'#3d4a51',dx,floor-30,dx+Math.cos(a)*16,floor-30+Math.sin(a)*16,2);}
 }
}
function mover(c:C,p:Platform,x:number,y:number){
 // The cage: corner posts, a head frame, a mesh back, and the cable up to its sheave.
 const mid=x+Math.round(p.w/2);box(c,'#59666b',mid-1,CROWN+12,1,y-56-CROWN-12);box(c,'#2c353b',mid,CROWN+12,1,y-56-CROWN-12);
 box(c,'#0d121699',x+4,y-50,p.w-8,50);for(let xx=x+10;xx<x+p.w-6;xx+=10)box(c,'#232d33',xx,y-48,1,48);for(let yy=y-40;yy<y;yy+=10)box(c,'#232d33',x+4,yy,p.w-8,1);
 for(const xx of [x+1,x+p.w-5]){box(c,'#151b20',xx,y-54,4,54);box(c,'#6d7d80',xx,y-54,1,54);}
 // The roof of the cage runs back to the far guides, like the floors.
 box(c,'#1a2228',x+1,y-58-BACK,p.w-2,BACK);box(c,'#34414a',x+1,y-58-BACK,p.w-2,1);for(let xx=x+8;xx<x+p.w-6;xx+=12)box(c,'#232d33',xx,y-58-BACK+2,1,BACK-2);
 box(c,'#151b20',x-1,y-58,p.w+2,6);box(c,'#aab3ae',x-1,y-58,p.w+2,1);box(c,'#151b20',mid-4,y-64-BACK+6,8,6);
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
/** The door out of the hoist house, in its far wall on the hoist house floor:
 * dressed jambs and a lintel the brickwork stops against, a stone threshold
 * on the floor the lift arrives at, and the night outside where the bridge
 * approach begins. */
function houseDoor(c:C,l:Level,floor:number){
 const x=exitDoor(l)+96,y=floor-BACK-3;
 box(c,'#08090c',x-30,y-82,60,82);
 box(c,'#141c2c',x-19,y-70,38,70);box(c,'#1c2940',x-19,y-36,38,36);box(c,'#263345',x-19,y-14,38,14);
 // Beyond the door: the approach's parapet and its first lamp, unlit.
 box(c,'#46525f',x-19,y-14,38,4);box(c,'#6b7782',x-19,y-14,38,1);box(c,'#141b21',x+8,y-46,2,32);box(c,'#141b21',x+5,y-52,8,7);box(c,'#232e37',x+6,y-51,6,5);
 for(let k=0;k<6;k++){const yy=y-70+k*12;box(c,k%2?'#6b625c':'#5d5550',x-30,yy,11,11);box(c,k%2?'#5d5550':'#6b625c',x+19,yy,11,11);box(c,'#8a817a',x-30,yy,11,1);box(c,'#8a817a',x+19,yy,11,1);}
 box(c,'#2a2224',x-34,y-84,68,14);box(c,'#6b625c',x-33,y-83,66,12);box(c,'#8a817a',x-33,y-83,66,1);box(c,'#3b3034',x-33,y-72,66,1);box(c,'#7d746d',x-6,y-86,12,15);box(c,'#a39b92',x-6,y-86,12,1);
 // The leaf stands open into the house; a lamp hangs on the wall beside it.
 box(c,'#3b2a1d',x+10,y-70,9,70);box(c,'#5d4129',x+11,y-69,7,68);box(c,'#262d33',x+10,y-54,9,2);box(c,'#262d33',x+10,y-18,9,2);
 box(c,'#57514d',x-34,y-2,68,4);box(c,'#a39b92',x-34,y-2,68,1);
 box(c,'#141b21',x-44,y-80,2,16);box(c,'#141b21',x-48,y-64,10,12);box(c,'#f3c77a',x-46,y-62,6,8);box(c,'#f3c77a10',x-62,y-82,40,40);
}
function exit(c:C,l:Level,s:Run,t:number,front:boolean,reduced:boolean,view:{width:number;height:number}){
 const x=Math.round(l.exit.x+l.exit.w/2),y=l.exit.y+l.exit.h,offset=departureOffset(l,s,reduced,view),floor=y-8+offset.y,upper=houseFloor(l);
 if(front){
  // The cage gate closes in front of the passenger for the ride.
  if(s.phase!=='playing'&&!reduced){c.save();c.globalAlpha*=departureVisibility(s,reduced);for(let xx=x-18;xx<=x+18;xx+=6)box(c,'#6d7d80',xx,floor-40,1,40);box(c,'#aab3ae',x-20,floor-22,40,1);c.restore();}
  return;
 }
 // The counterweight lift: its own rails from the lift landing up through the hoist house floor, where the door out stands in the wall.
 for(const xx of [x-28,x+25]){box(c,'#12181d',xx,upper-70,4,y-upper+70);box(c,'#5a686b',xx+1,upper-70,1,y-upper+70);}
 box(c,'#0b0d11',x-26,upper,52,6);
 box(c,'#59666b',x,upper-70,1,Math.max(0,floor-52-upper+70));
 c.save();c.globalAlpha*=departureVisibility(s,reduced);
 box(c,'#0d121699',x-22,floor-46,44,46);for(let xx=x-16;xx<x+20;xx+=8)box(c,'#232d33',xx,floor-44,1,44);
 for(const xx of [x-24,x+20]){box(c,'#151b20',xx,floor-50,4,50);box(c,'#6d7d80',xx,floor-50,1,50);}
 box(c,'#151b20',x-26,floor-54,52,6);box(c,'#f3c77a',x-8,floor-52,16,2);box(c,'#aab3ae',x-26,floor-54,52,1);
 box(c,'#151b20',x-26,floor,52,9);box(c,'#6b523a',x-25,floor,50,4);box(c,'#b3946a',x-25,floor,50,1);
 box(c,'#f3c77a22',x-18,floor-44,36,44);
 c.restore();
}

export const hoist:QuarterSet={sky(c,l,w,h){box(c,'#0b0d11',0,0,w,h);box(c,'#141c2c',0,0,w,Math.round(h*.5));},back,deck,exit,mover,station};
