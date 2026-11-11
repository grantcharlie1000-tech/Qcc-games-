import {WORLDS,type Level,type Platform} from './levels';
import type {Run} from './model';
import {box,enginesArt,fill,hash,lay,masonry,noise,panel,seamless,sprite,stroke,visible,type C,type Courses,type Work} from './quarter-kit';
import {quarterSet} from './quarter-sets';
import {drawLaneHouse,housePiece,laneBack,laneBuilds,laneDeck,laneHouses} from './set-lane';
import {HOUSE_PIECES,door,gutter,laps,renderAt,ridgeCap,slates,win,type Look,type Tri} from './pieces/level-01';

/** The Old Quarter is drawn as one built place. Every landing continues into
 * the structure it belongs to: a roof into its house and the street, a tower
 * landing into the wall it is corbelled from, a quay into the water, a barge
 * into its hull. Repeating art comes only from small cached tiles whose
 * opposite edges are the same pixels, filled through cached patterns. What
 * stands where is worked out once per level; drawing allocates nothing. */

const HOUSE:readonly Courses[]=[
 {mortar:'#1b232d',stones:['#29333f','#2d3844','#313c48'],lip:'#3b4753',chip:'#45525d'},
 {mortar:'#211b1f',stones:['#352a2d','#3b2e30','#40322f'],lip:'#4b3b38',chip:'#574640'},
 {mortar:'#1e2329',stones:['#30363c','#343a41','#383f45'],lip:'#424a50',chip:'#4c545a'},
];
const HOUSE_KEYS=['house/0','house/1','house/2'] as const;
const HOUSE_TILES=[0,1,2].map(style=>()=>masonry(HOUSE_KEYS[style],96,48,style===1?16:24,style===1?8:12,HOUSE[style]));
const towerWall=()=>masonry('tower',128,64,32,16,{mortar:'#161d25',stones:['#212a34','#242e38','#28323d'],lip:'#303b47',chip:'#384350'});
const vaultBrick=()=>masonry('vault',64,32,16,8,{mortar:'#1a1617',stones:['#2b2324','#2f2627','#33292a'],lip:'#3d3130',chip:'#463836'});
const quayStone=()=>masonry('quay',96,64,32,16,{mortar:'#18212a',stones:['#2a3540','#2e3945','#323e4a'],lip:'#3c4956',chip:'#465461'});
const alleyBack=()=>masonry('alley',96,48,24,12,{mortar:'#10151c',stones:['#161d26','#182029','#1a222c'],lip:'#1f2833',chip:'#232d38'});
const ALLEY:Work={course:12,short:20,long:46,mortar:'#121820',stones:['#1e2834','#24303c','#283644','#1a2430'],lip:'#31404e',shade:'#16202a',chip:'#3a4a5a'};
const cobbles=()=>seamless('cobbles',64,16,rect=>{rect('#161c23',0,0,64,16);for(let r=0;r<2;r++)for(let i=0;i<4;i++){const x=i*16+r*8,v=hash(i,r,7);rect(v>.5?'#262e37':'#222a33',x+1,r*8+1,14,6);rect('#313b45',x+2,r*8+1,11,1);}});
const planks=()=>seamless('planks',32,32,rect=>{rect('#241c17',0,0,32,32);for(let i=0;i<4;i++){const v=hash(i,3,11);rect(v>.5?'#33281f':'#2f251d',i*8+1,0,6,32);rect('#3d3026',i*8+1,0,1,32);rect('#1d1612',i*8+2,8+Math.floor(v*14),4,1);}});

/** Windows hold a candle behind a curtain, a dark pane, or closed shutters. */
const WINDOWS:HTMLCanvasElement[]=[];
function windowArt(kind:number){
 return WINDOWS[kind]??=sprite(`window/${kind}`,16,26,c=>{
  box(c,'#121820',0,0,16,24);box(c,'#3e4950',1,0,14,1);
  if(kind===2){for(let y=2;y<22;y+=3){box(c,'#2c2a2a',2,y,12,2);box(c,'#3a3634',2,y,12,1);}box(c,'#121820',7,2,1,20);}
  else{
   box(c,kind===1?'#5a3d27':'#1a2633',2,2,12,20);
   if(kind===1){box(c,'#a8763f',4,3,8,18);box(c,'#d9a453',6,9,4,9);box(c,'#f3c77a',7,12,2,4);box(c,'#6b4a33',2,2,2,20);box(c,'#6b4a33',12,2,2,20);}
   else{box(c,'#26384a',3,3,4,8);box(c,'#2c3f52',9,13,3,6);}
   box(c,'#121820',7,2,2,20);box(c,'#121820',2,11,12,2);
  }
  box(c,'#4a5459',0,24,16,2);box(c,'#262d33',1,25,15,1);
 });
}
const DOORS:HTMLCanvasElement[]=[];
function doorArt(lit:boolean){
 return DOORS[+lit]??=sprite(`door/${lit}`,20,32,c=>{
  box(c,'#121820',0,0,20,32);box(c,'#3e4950',1,0,18,2);box(c,'#2b211b',3,4,14,28);
  for(const x of [5,9,13])box(c,'#3a2d23',x,5,2,26);
  box(c,lit?'#e1b064':'#5b4a3a',3,4,14,4);box(c,lit?'#f3c77a':'#6d5b48',8,5,4,2);box(c,'#a9905f',13,18,2,2);
 });
}
/** The canal's opposite bank: warehouse fronts on a quay wall. Seamless. */
function farBank(){
 return seamless('farbank',256,120,rect=>{
  for(let i=0;i<4;i++){const x=i*64,top=30+Math.floor(hash(i,1,5)*22);
   rect('#1a222d',x,top,64,120-top);rect('#222c38',x+1,top,62,2);rect('#141a22',x,top,1,120-top);
   for(let k=0;k<3;k++){const wx=x+8+k*18,lit=hash(i,k,9)>.62;for(let y=top+12;y<96;y+=22){rect('#10151c',wx,y,9,12);rect(lit&&y===top+12?'#b0813f':'#18222d',wx+1,y+1,7,10);}}
   rect('#14191f',x+26,92,12,16);
  }
  rect('#1f2832',0,104,256,16);rect('#2c3741',0,104,256,1);
 });
}

interface House {x:number;w:number;top:number;id:number}
interface Shed {p:Platform;top:number;floor:number;kind:'chimney'|'crates'|'house'|'shed'}
interface Rail {x:number;w:number;top:number;bottom:number}
/** Everything the Quarter builds under a level's landings, worked out once. */
interface Plan {
 street:number;floor:number;ceiling:number;
 alleys:{x:number;w:number;top:number;n:number}[];houses:House[];sheds:Shed[];shores:Shed[];rails:Rail[];
 lookout:House|null;surfaces:Map<number,number|null>;chimneys:Set<Platform>;
}
const plans=new WeakMap<Level,Plan>();
type Front={y:number;kind:'lane'|'house'|'shed';i:number};
const fronts=new WeakMap<Level,readonly Front[]>();
/** Painter's order for level 1, cached with the plan: high roofs behind, low roofs in front. */
function frontOrder(l:Level,pl:Plan):readonly Front[]{
 const made=fronts.get(l);if(made)return made;
 const order:Front[]=[];
 laneHouses(l).forEach((b,i)=>order.push({y:b.y,kind:'lane',i}));
 pl.houses.forEach((h,i)=>{if(housePiece(l.platforms[h.id]))order.push({y:l.platforms[h.id].y,kind:'house',i});});
 pl.sheds.forEach((s,i)=>{if(s.floor>s.p.y)order.push({y:s.p.y,kind:'shed',i});});
 order.sort((a,b)=>a.y-b.y);fronts.set(l,order);return order;
}
/** Whatever a ledge stands on: the nearest surface under it, or nothing. */
function supportBelow(l:Level,p:Platform){
 let best:Platform|null=null;
 for(const q of l.platforms)if(q!==p&&q.kind!=='moving'&&q.h>10&&q.y>=p.y+p.h&&q.x<p.x+p.w-6&&q.x+q.w>p.x+6&&(!best||q.y<best.y))best=q;
 return best;
}
function plan(l:Level):Plan{
 const made=plans.get(l);if(made)return made;
 const street=l.height-20,floor=Math.max(...l.platforms.map(p=>p.y+p.h)),ceiling=Math.min(...l.platforms.map(p=>p.y))-150;
 const houses:House[]=[],sheds:Shed[]=[],shores:Shed[]=[],rails:Rail[]=[];
 const grates=l.platforms.filter(p=>p.kind==='grate');
 for(const p of l.platforms.slice(0,l.mainCount)){
  // Level 1's Bell Lane builds whatever is not a plain roof: stacks, cowls, piers, iron and timber.
  if(l.id===0&&laneBuilds(p))continue;
  if(p.kind==='stone')houses.push({x:p.x,w:p.w,top:p.y+p.h,id:p.id});
  // One wall behind a whole stack of iron balconies, a storey above the top.
  else if(p.kind==='grate'&&!grates.some(q=>q.x===p.x&&q.w===p.w&&q.y<p.y))houses.push({x:p.x-28,w:p.w+56,top:p.y-60,id:p.id});
 }
 // Level 1's lane buildings stand among the houses, so the alleys run between them too.
 const byX=[...houses,...(l.id===0?laneHouses(l).map(b=>({x:b.x,w:b.w,top:b.y+28,id:-1})):[])].sort((a,b)=>a.x-b.x),alleys:Plan['alleys']=[];
 for(let i=1;i<byX.length;i++){const a=byX[i-1],b=byX[i],left=a.x+a.w;if(b.x-left>=4){
  // A wide gap is the yard: the house across it stands a storey back. A crack between two walls stays dark.
  const yard=l.id===0&&b.x-left>=36;
  alleys.push({x:left,w:b.x-left,top:Math.max(a.top,b.top)+(yard?64:26),n:yard?alleys.filter(y=>y.w>=36).length:-1});
 }}
 // Taller houses stand further back, so lower fronts are drawn over them.
 houses.sort((a,b)=>a.top-b.top);
 for(const p of l.platforms){
  if(l.id===0&&p.tag)continue;
  if(p.kind==='crumble'){const below=supportBelow(l,p);shores.push({p,top:p.y+p.h,floor:below?below.y:street,kind:'shed'});continue;}
  if(!p.branch||p.kind!=='stone'||p.h<=10)continue;
  const below=supportBelow(l,p),bottom=below?below.y:street,top=p.y+p.h;
  // A ledge just above a walkway is a chimney cap whose stack stands behind it.
  const kind=below&&!below.branch&&bottom-top<(l.setting==='canal'?120:60)?'chimney':p.w<=84?'crates':p.w>=200?'house':'shed';
  sheds.push({p,top,floor:bottom,kind});
 }
 // Stacked grates are one iron stair; side rails tie each to the one above.
 for(const g of grates){const above=grates.find(q=>q.x===g.x&&q.w===g.w&&q.y<g.y&&g.y-q.y<=80);if(above)rails.push({x:g.x,w:g.w,top:above.y,bottom:g.y});}
 const lookout=grates.length&&l.setting==='bridge'?{x:Math.min(...grates.map(p=>p.x))-28,w:Math.max(...grates.map(p=>p.x+p.w))-Math.min(...grates.map(p=>p.x))+56,top:Math.min(...grates.map(p=>p.y))-60,id:99}:null;
 const result:Plan={street,floor,ceiling,alleys,houses,sheds,shores,rails,lookout,surfaces:new Map(),chimneys:new Set(sheds.filter(s=>s.kind==='chimney').map(s=>s.p))};
 plans.set(l,result);return result;
}

function houseFront(c:C,x:number,top:number,w:number,floor:number,id:number,cx:number,cy:number,vw:number,vh:number){
 if(floor<=top||!visible(x,top,w,floor-top,cx,cy,vw,vh))return;
 const style=id%3;c.fillStyle=fill(c,HOUSE_KEYS[style],HOUSE_TILES[style]);c.fillRect(x,top,w,floor-top);
 box(c,'#10161d',x,top,w,3);box(c,'#3f4b54',x+2,top+3,w-4,1);
 box(c,'#10161d',x,top,2,floor-top);box(c,'#10161d',x+w-2,top,2,floor-top);
 const cols=Math.max(1,Math.floor((w-16)/40)),gap=(w-cols*16)/(cols+1);
 for(let yy=top+14;yy+26<floor-42;yy+=50){if(yy>cy+vh||yy+26<cy)continue;for(let i=0;i<cols;i++){const v=hash(id,i,yy);c.drawImage(windowArt(v<.34?1:v<.78?0:2),Math.round(x+gap+i*(16+gap)),Math.round(yy));}}
 if(floor-top>=70){
  if(w>=60)c.drawImage(doorArt(hash(id,9)<.4),Math.round(id%2?x+w-30:x+10),floor-32);
  if(w>=110)c.drawImage(windowArt(hash(id,4)<.5?1:0),Math.round(id%2?x+12:x+w-28),floor-36);
 }
 // A downpipe runs from the gutter to the street on the house's far corner.
 const pipe=id%2?x+5:x+w-9;box(c,'#141b22',pipe,top+3,4,floor-top-3);box(c,'#3d4950',pipe+1,top+3,1,floor-top-3);
 for(let y=top+30;y<floor;y+=56)box(c,'#263038',pipe-1,y,6,3);
}
function chimneyBehind(c:C,p:Platform,top:number,floor:number){
 const w=Math.max(24,Math.round(p.w*.6)),x=p.x+(p.w-w)/2;c.fillStyle=fill(c,HOUSE_KEYS[1],HOUSE_TILES[1]);c.fillRect(x,top,w,floor-top);
 c.save();c.globalAlpha=.45;box(c,'#0b1016',x,top,w,floor-top);c.restore();box(c,'#10161d',x,top,w,2);
}
function shed(c:C,s:Shed,cx:number,cy:number,vw:number,vh:number){
 const {p,top,floor}=s;if(floor<=top||!visible(p.x,top,p.w,floor-top,cx,cy,vw,vh))return;
 if(s.kind==='chimney'){chimneyBehind(c,p,top,floor);return;}
 if(s.kind==='house'){houseFront(c,p.x,top,p.w,floor,p.id,cx,cy,vw,vh);return;}
 if(s.kind==='crates'){
  // Stacked crates on whatever is underneath.
  for(let y=floor;y>top;y-=24){const h=Math.min(24,y-top);c.fillStyle=fill(c,'planks',planks);c.fillRect(p.x+2,y-h,p.w-4,h);box(c,'#15100d',p.x+2,y-h,p.w-4,1);box(c,'#4b3b2d',p.x+4,y-h+2,p.w-8,1);box(c,'#15100d',p.x+2,y-h,3,h);box(c,'#15100d',p.x+p.w-5,y-h,3,h);}
  return;
 }
 // A lean-to shed: plank walls, a door if it stands on the ground.
 c.fillStyle=fill(c,'planks',planks);c.fillRect(p.x+2,top,p.w-4,floor-top);
 box(c,'#15100d',p.x+2,top,p.w-4,2);box(c,'#15100d',p.x+2,top,3,floor-top);box(c,'#15100d',p.x+p.w-5,top,3,floor-top);
 if(floor-top>=40)c.drawImage(doorArt(false),Math.round(p.x+p.w/2-10),floor-32);
}
/** Timber shoring props hold a failing roof section over the lane. */
function shores(c:C,s:Shed,cx:number,cy:number,vw:number,vh:number){
 const {p,top,floor}=s;if(!visible(p.x,top,p.w,floor-top,cx,cy,vw,vh))return;
 prop(c,p.x+10,top,floor);prop(c,p.x+p.w-16,top,floor);box(c,'#1a1410',p.x+8,top,p.w-16,4);
}
function prop(c:C,x:number,top:number,floor:number){box(c,'#1a1410',x,top,6,floor-top);box(c,'#4a3a2c',x+1,top,2,floor-top);box(c,'#1a1410',x-3,floor-4,12,4);}
function rails(c:C,list:readonly Rail[],cx:number,cy:number,vw:number,vh:number){
 for(const r of list){if(!visible(r.x,r.top,r.w,r.bottom-r.top,cx,cy,vw,vh))continue;
  for(let side=0;side<2;side++){const x=side?r.x+r.w-5:r.x+2;box(c,'#141c22',x,r.top,3,r.bottom-r.top);box(c,'#4f5d61',x+1,r.top,1,r.bottom-r.top);}
  for(let y=r.top+12;y<r.bottom;y+=10)box(c,'#29343a',r.x+4,y,r.w-8,1);
 }
}

function roofs(c:C,l:Level,pl:Plan,cx:number,cy:number,vw:number,vh:number){
 const street=pl.street;
 if(street<cy+vh+24){c.fillStyle=fill(c,'cobbles',cobbles);c.fillRect(cx-24,street,vw+48,cy+vh+24-street);box(c,'#3a444d',cx-24,street,vw+48,1);box(c,'#0f141a',cx-24,street+1,vw+48,2);}
 // Each alley shows the dark back of the house behind it, never another city.
 for(const a of pl.alleys)if(a.top<street&&visible(a.x,a.top-REAR_ROOF,a.w,street-a.top+REAR_ROOF,cx,cy,vw,vh)){
  if(l.id!==0){c.fillStyle=fill(c,'alley',alleyBack);c.fillRect(a.x,a.top,a.w,street-a.top);continue;}
  // A wide gap shows the house across the yard, a storey back: its own height, walls, openings and roof.
  // A crack between two walls stays a dark slot.
  const h=street-a.top;
  if(a.w>=36){c.drawImage(sprite(`yard/rear/${a.x}/${a.w}/${h}`,a.w,h+REAR_ROOF,k=>rearHouse(k,a.w,h+REAR_ROOF,a.x,a.n)),a.x,a.top-REAR_ROOF);continue;}
  c.drawImage(panel(`alley/v3/${a.x}`,a.w,h,ALLEY,a.x,k=>box(k,'#0b0f14',0,0,a.w,4)),a.x,a.top);
 }
 if(l.id===0){
  // Higher roofs first, lower roofs last. A later house used to be painted
  // straight over the one before it and cut through its courses.
  for(const d of frontOrder(l,pl)){
   if(d.kind==='lane')drawLaneHouse(c,l,d.i,cx,cy,vw,vh);
   else if(d.kind==='house'){
    const h=pl.houses[d.i],p=l.platforms[h.id],piece=housePiece(p),gable=l.platforms.find(q=>(q.tag==='stairhead'||q.tag==='bellcote')&&q.x===p.x+p.w&&q.y+q.h===p.y),w=p.w+(gable?.w??0);
    if(piece&&visible(p.x-24,p.y-88,w+48,street-p.y+88,cx,cy,vw,vh))piece(c,p.x,p.y,w,street-p.y);
   }else{const s=pl.sheds[d.i],p=s.p;if(s.floor>p.y&&visible(p.x-24,p.y-88,p.w+48,s.floor-p.y+88,cx,cy,vw,vh))(s.kind==='house'?HOUSE_PIECES.terrace:HOUSE_PIECES.leanTo)(c,p.x,p.y,p.w,s.floor-p.y);}
  }
 }else{
  for(const h of pl.houses)houseFront(c,h.x,h.top,h.w,street,h.id,cx,cy,vw,vh);
  for(const s of pl.sheds)shed(c,s,cx,cy,vw,vh);
 }
 for(const s of pl.shores)shores(c,s,cx,cy,vw,vh);
 rails(c,pl.rails,cx,cy,vw,vh);
 if(l.id===0){laneBack(c,l,street,cx,cy,vw,vh);nellsWindow(c,l,cx,cy,vw,vh);bellLane(c,l,pl,cx,cy,vw,vh);}
}
/** Head room over a yard's plot for the rear house's roof and stacks. */
const REAR_ROOF=40;
/** The rear houses' walls: each in shade, a storey back, none the street's own. */
const REAR_WORKS:readonly Work[]=[
 ALLEY,
 {course:8,short:12,long:18,mortar:'#151216',stones:['#33282b','#382c2e','#3c3032','#2f2528'],lip:'#463638',shade:'#2a2124',chip:'#4c3b3c'},
 {course:10,short:16,long:30,mortar:'#11151a',stones:['#2b3036','#2f343a','#33383e','#282c32'],lip:'#3c4248',shade:'#24282d',chip:'#454b51'},
 {course:9,short:7,long:21,mortar:'#121510',stones:['#2c2e27','#30322a','#34362e','#292b24'],lip:'#3b3d34',shade:'#25271f',chip:'#44463c'},
];
const REAR_RENDER:Tri=['#2f363c','#363d44','#252b31'],REAR_BOARDS=['#1c1f22','#202326','#24272a','#191b1e'];
const REAR_SLATES=[['#1f2731','#232c36','#27303a','#1c232c'],['#262330','#2a2734','#2e2b38','#221f2b'],['#21282a','#252c2e','#293032','#1e2527']];
const REAR_RIDGE:Tri=['#3a434b','#4a545c','#20272e'],REAR_FRAME='#2e363d';
const REAR_DOORS:readonly Tri[]=[['#0e1012','#22262a','#2e3338'],['#120e0c','#2a2019','#3a2d22'],['#0d1110','#1d2622','#28332e']];
/** The back of the house across a yard, painted once into its own canvas. (0,REAR_ROOF) is the plot's top;
 * the eave sits up to a few courses either side of it and the roof rises from there. Everything is drawn
 * from the gap's own seed, so no two yards show the same house. */
function rearHouse(k:C,w:number,h:number,s:number,n:number){
 const v=(n:number)=>hash(s,n,77);
 // The roof and the walls step on from one yard to the next, so two neighbours never share either.
 const eave=REAR_ROOF+Math.round(v(1)*30)-6,roof=(n*2+Math.floor(v(2)*2))%5,face=(n*3+Math.floor(v(3)*2))%6;
 const tones=REAR_SLATES[Math.floor(v(4)*3)];
 // The walls: brick, stone, rubble, render or tarred boards, each its own.
 if(face<4){k.save();k.translate(0,eave);lay(k,w,h-eave,REAR_WORKS[face],s);k.restore();}
 else if(face===4)renderAt(k,REAR_RENDER,s,0,eave,w,h-eave);
 else laps(k,REAR_BOARDS,'#0f1114','#2a2e33',s,0,eave,w,h-eave,6);
 const wallPaint=(y0:number,y1:number)=>{if(face<4){k.save();k.translate(0,y0);lay(k,w,y1-y0,REAR_WORKS[face],s+3);k.restore();}else if(face===4)box(k,REAR_RENDER[0],0,y0,w,y1-y0);else laps(k,REAR_BOARDS,'#0f1114','#2a2e33',s+3,0,y0,w,y1-y0,6);};
 // A stack, where the house has one, stands on its own roof.
 const stack=(x:number,base:number,tall:number,wide:number)=>{
  box(k,'#120f11',x-1,base-tall-1,wide+2,tall+1);k.save();k.translate(x,base-tall);lay(k,wide,tall,REAR_WORKS[1],s+9);k.restore();
  box(k,'#2a2c30',x-2,base-tall-3,wide+4,3);box(k,'#3a3e42',x-2,base-tall-3,wide+4,1);
  for(let i=0,n=Math.max(1,Math.floor(wide/6));i<n;i++){const px=x+1+i*6;box(k,'#3a2a24',px,base-tall-8,4,5);box(k,'#4a3a32',px,base-tall-8,1,5);}
 };
 const sx=Math.round(6+v(5)*(w-24)),hasStack=v(6)>.35;
 if(roof===0){
  // A slated slope, the long side to the yard, its ridge in its own shadow.
  const rh=14+Math.round(v(7)*12);if(hasStack)stack(sx,eave-rh+6,12+Math.round(v(8)*10),10+Math.round(v(9)*6));
  slates(k,tones,'#0f141a',s,0,eave-rh+5,w,rh-5,5,8);ridgeCap(k,0,eave-rh,w,REAR_RIDGE,s,'#0f141a');gutter(k,-2,eave-4,w+4,s);
 }else if(roof===1){
  // The gable end to the yard: the wall goes up to the apex, coped in dark stone, a small light in it.
  const cx=Math.round(w*(.3+v(7)*.4)),rise=Math.min(REAR_ROOF-6,12+Math.round(v(8)*18)),run=Math.max(cx,w-cx)+6;
  wallPaint(eave-rise,eave);
  k.save();k.globalCompositeOperation='destination-out';k.beginPath();k.moveTo(-1,eave-rise-1);k.lineTo(cx-run,eave);k.lineTo(cx,eave-rise);k.lineTo(cx+run,eave);k.lineTo(w+1,eave-rise-1);k.closePath();k.fill();
  // Slope from the apex down each way, cleared above it.
  k.beginPath();k.moveTo(-1,-1);k.lineTo(w+1,-1);k.lineTo(w+1,eave-1);for(let x=w;x>=0;x--){const y=eave-rise+Math.round(Math.abs(x-cx)*rise/run);k.lineTo(x,y);}k.lineTo(-1,eave);k.closePath();k.fill();k.restore();
  for(let x=0;x<w;x++){const y=eave-rise+Math.round(Math.abs(x-cx)*rise/run);box(k,'#141a21',x,y-1,1,4);box(k,REAR_RIDGE[0],x,y-1,1,1);}
  if(hasStack)stack(cx-5,eave-rise+2,10+Math.round(v(9)*8),10);
  if(rise>18){const lw=8,ly=eave-Math.round(rise*.55);win(k,cx-lw/2,ly,lw,10,{look:v(10)>.8?'dim':'dark',cols:1,rows:2,frame:REAR_FRAME,s});}
 }else if(roof===2){
  // A parapet with a dark coping; the slates behind it only just show.
  const up=8+Math.round(v(7)*6);if(hasStack)stack(sx,eave-up-4,14+Math.round(v(8)*10),12+Math.round(v(9)*8));
  slates(k,tones,'#0f141a',s,2,eave-up-10,w-4,8,4,8);box(k,'#10151a',0,eave-up-10,w,1);
  wallPaint(eave-up,eave);box(k,'#141a21',-1,eave-up-3,w+2,4);box(k,REAR_RIDGE[0],-1,eave-up-3,w+2,1);
 }else if(roof===3){
  // A catslide falling one way across the yard, its verge on the slope.
  const left=v(7)>.5,rise=10+Math.round(v(8)*18),y=(x:number)=>eave-Math.round((left?w-x:x)*rise/w);
  if(hasStack)stack(sx,y(sx)+6,10+Math.round(v(9)*10),10);
  for(let x=0;x<w;x++){const t=y(x);slates(k,tones,'#0f141a',s+x,x,t+3,1,eave-t-3,5,1);box(k,'#141a21',x,t,1,3);box(k,REAR_RIDGE[0],x,t,1,1);}
  gutter(k,-2,eave-4,w+4,s);
 }else{
  // A mansard: a steep slated storey with a dormer, under a dark lead flat.
  const rh=18+Math.round(v(7)*6),dx=Math.round(w*(.25+v(8)*.5))-8;if(hasStack)stack(sx,eave-rh+2,12+Math.round(v(9)*8),12);
  slates(k,tones,'#0f141a',s,0,eave-rh+3,w,rh-3,4,7);box(k,'#141a21',0,eave-rh,w,3);box(k,REAR_RIDGE[0],0,eave-rh,w,1);
  if(w>=48){box(k,'#141a21',dx-2,eave-rh-4,20,rh);box(k,'#262d33',dx-1,eave-rh-3,18,2);win(k,dx+2,eave-rh+1,12,rh-6,{look:v(10)>.75?'drawn':'dark',cols:2,rows:1,frame:REAR_FRAME,s});}
  gutter(k,-2,eave-4,w+4,s);
 }
 // Openings: each house its own storey height, light size and spacing; what is in each light is its own.
 const storey=42+Math.round(v(11)*18),lw=9+Math.round(v(12)*7),lh=14+Math.round(v(13)*10),span=lw+14+Math.round(v(14)*16);
 const cols=Math.max(1,Math.floor((w-12)/span)),x0=Math.round((w-(cols-1)*span-lw)/2+(v(15)-.5)*6),lintel=Math.floor(v(16)*3);
 const LOOKS:readonly Look[]=['dark','dark','drawn','dark','shut','dim','board','dark','lit','blind','dark','drawn'];
 for(let y=eave+12+Math.round(v(17)*8),r=0;y+lh<h-44;y+=storey,r++)for(let i=0;i<cols;i++){
  const pick=hash(s,i*7+r,78);if(pick<.18)continue;const x=x0+i*span,look=LOOKS[Math.floor(hash(s,i,r+90)*LOOKS.length)];
  if(lintel===0){box(k,'#0b0f14',x-1,y-3,lw+2,3);box(k,'#2c353d',x-1,y-3,lw+2,1);}else if(lintel===1){for(let px=x-1;px<x+lw+1;px+=2)box(k,px%4?'#3a2c2a':'#30252a',px,y-4,2,4);}
  win(k,x,y,lw,lh,{look,cols:lw>12?2:1,rows:lh>20?3:2,frame:REAR_FRAME,tint:'#24302a',s:s+i*13+r});
  box(k,'#262d33',x-2,y+lh,lw+4,2);
 }
 // At the yard: a back door, and a privy, a coal hatch or a pump against the wall.
 const dx=Math.round(6+v(18)*Math.max(1,w-34)),dw=14+Math.round(v(19)*4),dh=26+Math.round(v(20)*6);
 door(k,dx,h-dh,dw,dh,{tone:REAR_DOORS[Math.floor(v(21)*3)],style:'plank',knob:''});
 const extra=Math.floor(v(22)*4),ex=dx+dw+6<w-20?dx+dw+6:Math.max(2,dx-24);
 if(extra===0&&w>=60){box(k,'#121518',ex,h-22,18,22);box(k,'#2a2e33',ex,h-24,18,3);box(k,'#1c2024',ex+4,h-18,10,18);}
 else if(extra===1){box(k,'#0b0f14',ex,h-14,14,10);box(k,'#1c2228',ex+1,h-13,12,8);box(k,'#2c353d',ex,h-15,14,1);}
 else if(extra===2&&w>=56){box(k,'#151b20',ex+4,h-26,4,26);box(k,'#2e383f',ex+4,h-26,1,26);box(k,'#151b20',ex+8,h-22,6,2);box(k,'#1c2228',ex,h-6,14,6);}
}
/** Nell's dormer on her roof, where level 1 used to end: the casement open, the lamp lit, Nell at it. */
function nellsWindow(c:C,l:Level,cx:number,cy:number,vw:number,vh:number){
 const roof=l.platforms.find(p=>p.tag==='nell')!,x=Math.round(roof.x+roof.w*.55),y=roof.y;if(!visible(x-6,y-52,48,52,cx,cy,vw,vh))return;
 box(c,'#10161d',x-4,y-38,44,38);box(c,'#3b2e30',x-2,y-36,40,36);
 for(let k=0;k<12;k++){box(c,'#10161d',x-6+k*2,y-40-k,48-k*4,2);box(c,'#4a3b38',x-5+k*2,y-40-k,46-k*4,1);}
 box(c,'#0d1218',x+6,y-30,24,26);box(c,'#f0c47a',x+8,y-28,20,22);box(c,'#fff0c4',x+12,y-24,8,14);
 box(c,'#2a2019',x+17,y-28,2,22);box(c,'#2a2019',x+8,y-18,20,2);
 // Nell at the glass, and the casement swung out.
 box(c,'#2b2522',x+18,y-24,8,18);box(c,'#3b3330',x+19,y-27,6,5);box(c,'#4a3423',x+30,y-30,6,26);box(c,'#6b4a2e',x+31,y-29,4,24);
 box(c,'#56626d',x+4,y-4,28,3);box(c,'#78848e',x+4,y-4,28,1);
}
/** Bell Lane, between Nell's house and the bell tower. Her gable stack is
 * the top of a chimney breast that runs down her gable to the lane; the
 * forecourt is the top of a retaining wall with a gate pier at its corner and
 * steps down beside it; the tower stands on the forecourt, its door in its
 * west face. Every wall is laid once, between its own corners, and goes down
 * to the lane. */
const TOWER_OUT:Work={course:16,short:22,long:54,mortar:'#19212a',stones:['#29333f','#2c3642','#2f3946','#27313c'],lip:'#3a4654',shade:'#212a34',chip:'#46525f'};
const FORECOURT:Work={course:12,short:18,long:40,mortar:'#151c24',stones:['#28323d','#2b3540','#2e3843','#262f39'],lip:'#3a4654',shade:'#1f2832',chip:'#46525f'};
/** Tiles for level 1's landings. A roof's tile is empty: its house piece draws it. */
export function paintQuarterDeck(c:C,p:Platform,l:Level):boolean{return l.id===0&&laneDeck(c,p);}
function bellLane(c:C,l:Level,pl:Plan,cx:number,cy:number,vw:number,vh:number){
 const pier=l.platforms.find(p=>p.tag==='pier')!,court=l.platforms.find(p=>p.tag==='court')!,lean=l.platforms.find(p=>p.tag==='lean')!,lane=pl.street+40;
 const x0=pier.x,x1=l.width+40,top=court.y;
 // The tower stands on the forecourt: its west face, corner and door storey.
 const tx=court.x+78,roof=-260;
 if(visible(tx-20,roof,x1-tx+20,top-roof,cx,cy,vw,vh)){
  c.drawImage(panel('lane/tower/belfry',x1-tx,top-190-roof,TOWER_OUT,71),tx,roof);
  c.drawImage(panel('lane/tower/door',x1-tx,176,TOWER_OUT,79),tx,top-182);
  // The corner: quoins long and short by turns, standing proud of the face.
  for(let y=roof+2,k=0;y<top-14;y+=16,k++){if(y>top-196&&y<top-178)continue;const wide=k%2?18:10;box(c,'#36414c',tx,y+1,wide,14);box(c,'#4a5662',tx,y+1,wide,1);box(c,'#1c242d',tx,y+15,wide,1);box(c,'#4a5662',tx,y+1,1,14);}
  box(c,'#10161d',tx-2,roof,2,top-roof);
  // A string course over the door storey: the courses above and below stop against it.
  box(c,'#1a222b',tx-3,top-190,x1-tx+3,8);box(c,'#4c5864',tx-3,top-189,x1-tx+3,5);box(c,'#6b7782',tx-3,top-189,x1-tx+3,1);box(c,'#10161d',tx-3,top-183,x1-tx+3,1);
  // The plinth course the tower stands on, on the forecourt's flags.
  box(c,'#1a222b',tx-6,top-14,x1-tx+6,14);box(c,'#46525f',tx-5,top-13,x1-tx+5,12);box(c,'#6b7782',tx-5,top-13,x1-tx+5,1);for(let x=tx+30;x<x1;x+=46)box(c,'#2c353f',x,top-12,1,11);
  // Slit windows of the stair inside, each with its lintel and sill.
  for(const [x,y] of [[tx+176,top-150],[tx+150,top-330],[tx+176,top-500]] as const){box(c,'#0d1116',x,y,10,44);box(c,'#3e4a57',x-4,y-6,18,6);box(c,'#56636f',x-4,y-6,18,1);box(c,'#46525f',x-5,y+44,20,4);box(c,'#6b7782',x-5,y+44,20,1);box(c,'#141c2c',x+2,y+2,6,40);}
 }
 if(visible(x0-90,pier.y,x1-x0+90,lane-pier.y,cx,cy,vw,vh)){
  // The forecourt's retaining wall, from under its flags down to the lane; the pier's own corner runs down it in quoins.
  c.drawImage(panel('lane/court',x1-x0,lane-top,FORECOURT,73),x0,top);
  for(let y=top+2,k=0;y<lane;y+=12,k++){const wide=k%2?16:9;box(c,'#343f4a',x0,y,wide,11);box(c,'#465260',x0,y,wide,1);box(c,'#1a222b',x0,y+11,wide,1);}
  box(c,'#10161d',x0-1,top,1,lane-top);
  // A weep hole and its stain every few yards, and a blind arch under the tower where the wall carries it.
  for(let x=x0+70;x<x1-20;x+=96){box(c,'#0b0f14',x,top+92,4,5);box(c,'#1a222b88',x,top+97,4,40);}
  const ax=tx+70,ar=44;for(let px=ax-ar;px<ax+ar;px+=2){const d=px+1-ax,y=top+150-Math.round(Math.sqrt(Math.max(0,ar*ar-d*d))*.6);box(c,'#3a4654',px,y,2,4);box(c,'#4c5864',px,y,2,1);box(c,'#1c242d',px,y+4,2,lane-y-4);}
  // The forecourt steps: a stone flight down the wall's west end into the lane, with its iron rail.
  const stop=lean.x+lean.w+2;
  for(let k=0;x0-8*(k+1)>=stop;k++){const sx=x0-8*(k+1),sy=top+16*k;box(c,'#141b23',sx,sy,8,lane-sy);box(c,'#3a4652',sx,sy,8,3);box(c,'#56626e',sx,sy,8,1);box(c,'#232c36',sx,sy+3,7,13);}
  stroke(c,'#141b21',x0-3,top-24,stop,top-24+(x0-3-stop)*2,2);for(let x=x0-4;x>stop+6;x-=16)box(c,'#141b21',x,top-24+(x0-3-x)*2,2,24);
  // The forecourt stops against the tower's stair turret, which stands out from the face on its own footing.
  const past=court.x+court.w,tt=top-132;
  c.drawImage(panel('lane/turret',x1-past,lane-tt,TOWER_OUT,83),past,tt);box(c,'#10161d',past-1,tt,1,lane-tt);
  for(let y=tt+2,k=0;y<lane;y+=16,k++){const wide=k%2?18:10;box(c,'#3a4652',past,y+1,wide,14);box(c,'#4f5b67',past,y+1,wide,1);box(c,'#1c242d',past,y+15,wide,1);}
  box(c,'#1a222b',past-4,tt-8,x1-past+4,9);box(c,'#56626e',past-4,tt-8,x1-past+4,6);box(c,'#7a8690',past-4,tt-8,x1-past+4,1);
  box(c,'#1a222b',past-3,top-14,x1-past+3,14);box(c,'#46525f',past-2,top-13,x1-past+2,12);box(c,'#6b7782',past-2,top-13,x1-past+2,1);
  {const x=past+52,y=top-96;box(c,'#0d1116',x,y,10,44);box(c,'#3e4a57',x-4,y-6,18,6);box(c,'#56636f',x-4,y-6,18,1);box(c,'#46525f',x-5,y+44,20,4);box(c,'#6b7782',x-5,y+44,20,1);box(c,'#141c2c',x+2,y+2,6,40);}
  // One street lamp on the forecourt, dark like every lamp in the Quarter tonight.
  const lx=court.x+36;box(c,'#141b21',lx-1,top-62,3,62);box(c,'#3d4a51',lx,top-62,1,62);box(c,'#141b21',lx-4,top-4,9,4);box(c,'#141b21',lx-5,top-76,11,14);box(c,'#232e37',lx-3,top-74,7,10);box(c,'#3d4a51',lx-5,top-78,11,2);
 }
}

function tower(c:C,l:Level,pl:Plan,clock:number,cx:number,cy:number,vw:number,vh:number){
 c.fillStyle=fill(c,'tower',towerWall);c.fillRect(cx-24,cy-24,vw+48,vh+48);
 // Ribs and slit windows belong to the wall itself, at fixed places in it.
 for(let x=Math.floor((cx-160)/384)*384+120;x<cx+vw+24;x+=384){box(c,'#171e27',x,cy-24,24,vh+48);box(c,'#2c3743',x+2,cy-24,2,vh+48);
  const slit=x+190;for(let y=Math.floor((cy-120)/200)*200+60;y<cy+vh+24;y+=200){box(c,'#10151c',slit-2,y-2,12,44);box(c,'#24324a',slit,y,8,40);box(c,'#3a4c66',slit+1,y+1,2,10);box(c,'#b8c6c044',slit+5,y+14,1,1);}}
 if(pl.floor<cy+vh+24)box(c,'#0f141a',cx-24,pl.floor,vw+48,cy+vh+24-pl.floor);
 for(const p of l.platforms){
  if(p.kind==='moving'&&p.axis==='y'){
   // A lift cage rides between two guide rails running its whole travel.
   const travel=p.travel??0,top=p.y-travel-24,bottom=p.y+travel+p.h+24;if(!visible(p.x-8,top,p.w+16,bottom-top,cx,cy,vw,vh))continue;
   box(c,'#0d1218',p.x+4,top,p.w-8,bottom-top);
   for(let side=0;side<2;side++){const x=side?p.x+p.w+2:p.x-6;box(c,'#151c23',x,top,4,bottom-top);box(c,'#56656b',x+1,top,1,bottom-top);}
   box(c,'#151c23',p.x-8,top-6,p.w+16,6);box(c,'#56656b',p.x-8,top-6,p.w+16,1);
   const at=p.y+Math.sin(clock*(p.speed??1)+p.id)*travel;box(c,'#1c2328',p.x+p.w/2-1,top,2,at-top);
   continue;
  }
  if(p.kind==='moving'||p.h<=10||p.kind==='grate'||p.y+p.h>=pl.floor)continue;
  corbels(c,p,cx,cy,vw,vh);
 }
 rails(c,pl.rails,cx,cy,vw,vh);
}
/** A landing in a tower is carried by stepped stones set into the wall. */
function corbels(c:C,p:Platform,cx:number,cy:number,vw:number,vh:number){
 const bottom=p.y+p.h;if(!visible(p.x,bottom,p.w,16,cx,cy,vw,vh))return;
 if(p.w<120){corbel(c,p.x+p.w/2-6,bottom);return;}
 corbel(c,p.x+6,bottom);corbel(c,p.x+p.w-18,bottom);for(let x=p.x+120;x<p.x+p.w-120;x+=120)corbel(c,x,bottom);
}
function corbel(c:C,x:number,bottom:number){box(c,'#151b22',x,bottom,12,5);box(c,'#36414d',x,bottom,12,1);box(c,'#151b22',x+2,bottom+5,8,4);box(c,'#2f3a45',x+2,bottom+5,8,1);box(c,'#151b22',x+4,bottom+9,4,4);}

function basement(c:C,l:Level,pl:Plan,cx:number,cy:number,vw:number,vh:number){
 c.fillStyle=fill(c,'vault',vaultBrick);c.fillRect(cx-24,cy-24,vw+48,vh+48);
 const {ceiling,floor}=pl;
 // The street slab overhead, with grates where lamplight falls through.
 if(ceiling>cy-24){box(c,'#0e1216',cx-24,cy-24,vw+48,ceiling-cy+24);box(c,'#2a3036',cx-24,ceiling-3,vw+48,3);
  for(let x=Math.floor((cx-80)/288)*288+150;x<cx+vw+24;x+=288){box(c,'#1c2228',x,ceiling-10,44,10);for(let i=0;i<5;i++)box(c,'#5c5240',x+4+i*8,ceiling-9,4,8);c.save();c.globalAlpha=.06;box(c,'#f3c77a',x+4,ceiling,36,floor-ceiling);c.restore();}}
 // Brick piers and the vault arch between them.
 for(let x=Math.floor((cx-80)/288)*288;x<cx+vw+24;x+=288){box(c,'#1d1819',x,ceiling,28,floor-ceiling);box(c,'#3a2f2e',x+2,ceiling,2,floor-ceiling);
  c.strokeStyle='#1d1819';c.lineWidth=8;c.beginPath();c.arc(x+144,ceiling+12,118,Math.PI*.08,Math.PI*.92);c.stroke();}
 // Two pipe runs along the wall, flanged; every vent is fed from them.
 const run=ceiling+46;
 for(let k=0;k<2;k++){const y=run+k*16;box(c,'#131a1f',cx-24,y,vw+48,8);box(c,'#4b5b5f',cx-24,y+1,vw+48,2);for(let x=Math.floor((cx-24)/96)*96;x<cx+vw+24;x+=96){box(c,'#0f1418',x,y-2,6,12);box(c,'#6b7a74',x+1,y-1,1,10);}}
 for(const h of l.hazards)if(h.kind==='steam'){const x=Math.round(h.x+h.w/2)-3,base=h.y+h.h;if(!visible(x,run,6,base-run,cx,cy,vw,vh))continue;box(c,'#131a1f',x,run+8,7,base-run-8);box(c,'#4b5b5f',x+1,run+8,2,base-run-8);box(c,'#0f1418',x-2,run+14,11,4);}
 // Floors stand on brick piers down to the sub-basement.
 for(const p of l.platforms){if(p.kind!=='stone'||p.h<=10)continue;const top=p.y+p.h;if(!visible(p.x,top,p.w,floor+60-top,cx,cy,vw,vh))continue;
  if(p.w<150)pier(c,p.x+p.w/2-10,top,floor+60);else{pier(c,p.x+12,top,floor+60);pier(c,p.x+p.w-32,top,floor+60);}}
 rails(c,pl.rails,cx,cy,vw,vh);
}
function pier(c:C,x:number,top:number,bottom:number){c.fillStyle=fill(c,'vault',vaultBrick);c.fillRect(x,top,20,bottom-top);c.save();c.globalAlpha=.5;box(c,'#0a0809',x,top,20,bottom-top);c.restore();box(c,'#120f10',x,top,2,bottom-top);box(c,'#3d3130',x+2,top,1,bottom-top);box(c,'#120f10',x+18,top,2,bottom-top);}

function canal(c:C,l:Level,pl:Plan,cx:number,cy:number,vw:number,vh:number){
 const water=l.water??pl.street;
 for(const s of pl.sheds)if(s.kind==='chimney'&&visible(s.p.x,s.top,s.p.w,s.floor-s.top,cx,cy,vw,vh))chimneyBehind(c,s.p,s.top,s.floor);
 for(const p of l.platforms){
  if(p.kind==='moving'||p.h<=10||pl.chimneys.has(p))continue;const top=p.y+p.h;if(!visible(p.x,top,p.w,water+12-top,cx,cy,vw,vh))continue;
  // The ferry terminal and its high stair are a building down to the water.
  if(p.kind==='stone'&&p.w>=150&&water-p.y>=80){houseFront(c,p.x,top,p.w,water+12,p.id,cx,cy,vw,vh);box(c,'#253a33',p.x+2,water-10,p.w-4,10);continue;}
  if(p.kind==='stone'&&p.w>=150){
   // A quay wall down into the water, weed at the tide line, an iron ring.
   c.fillStyle=fill(c,'quay',quayStone);c.fillRect(p.x,top,p.w,water+12-top);
   box(c,'#11181f',p.x,top,p.w,2);box(c,'#11181f',p.x,top,2,water-top);box(c,'#11181f',p.x+p.w-2,top,2,water-top);
   box(c,'#253a33',p.x+2,water-10,p.w-4,10);box(c,'#36503f',p.x+2,water-10,p.w-4,1);
   c.strokeStyle='#6b7a74';c.lineWidth=1;for(let x=p.x+40;x<p.x+p.w-30;x+=150){c.beginPath();c.arc(x,water-24,4,0,Math.PI*2);c.stroke();}
  }else if(p.w<90)pile(c,p.x+p.w/2-5,top,water);
  else{
   // Narrow decks are timber pile caps and fenders standing in the canal.
   const a=p.x+8,b=p.x+p.w-18;pile(c,a,top,water);pile(c,b,top,water);
   c.strokeStyle='#2a2119';c.lineWidth=3;for(let y=top+18;y<water-16;y+=36){c.beginPath();c.moveTo(a+5,y);c.lineTo(b+5,y+28);c.stroke();}
  }
 }
}
function pile(c:C,x:number,top:number,water:number){box(c,'#1a1410',x,top,10,water+12-top);box(c,'#4a3a2c',x+2,top,2,water+12-top);box(c,'#253a33',x,water-8,10,8);}
/** A barge is a timber hull riding in the canal: its gunwale is the edge
 * you land on, and the waterline drawn afterwards hides the rest of it. */
export function drawBarge(c:C,p:Platform,x:number,y:number,l:Level){
 const water=l.water??y+28,bottom=water+10;x=Math.round(x);y=Math.round(y);
 c.fillStyle='#1d1612';c.beginPath();c.moveTo(x-6,y+2);c.lineTo(x+p.w+6,y+2);c.lineTo(x+p.w-4,bottom);c.lineTo(x+4,bottom);c.closePath();c.fill();
 for(let yy=y+8;yy<bottom;yy+=5)box(c,'#2b211a',x+1,yy,p.w-2,1);
 box(c,'#14100d',x-6,y+2,p.w+12,3);box(c,'#6a5240',x-5,y,p.w+10,2);box(c,'#a88b67',x-4,y,p.w+8,1);
 box(c,'#14100d',x+6,y-5,6,5);box(c,'#6a5240',x+7,y-5,4,1);box(c,'#14100d',x+p.w-12,y-5,6,5);box(c,'#6a5240',x+p.w-11,y-5,4,1);
 box(c,'#3a2d23',x+p.w/2-14,y+5,28,2);
}

function bridge(c:C,l:Level,pl:Plan,cx:number,cy:number,vw:number,vh:number){
 const river=l.height-56;
 if(river<cy+vh+24){box(c,'#132a35',cx-24,river,vw+48,cy+vh+24-river);for(let x=Math.floor((cx-24)/48)*48;x<cx+vw+24;x+=48){box(c,'#3f5a63',x+hash(x,3)*20,river+2,14,1);box(c,'#f3c77a22',x+hash(x,5)*30,river+9,8,1);}}
 for(const p of l.platforms){
  if(p.kind==='moving'||p.h<=10||p.kind==='grate')continue;const top=p.y+p.h;if(!visible(p.x,top,p.w,river-top,cx,cy,vw,vh))continue;
  if(p.kind==='crumble'){for(let side=0;side<2;side++){const x=side?p.x+p.w-20:p.x+12;box(c,'#1a1410',x,top,8,river-top);box(c,'#4a3a2c',x+2,top,2,river-top);}continue;}
  // Stone piers stand in the river under each span.
  if(p.w<200)bridgePier(c,p.x+p.w/2-22,top,river);else{bridgePier(c,p.x+p.w*.25-22,top,river);bridgePier(c,p.x+p.w*.75-22,top,river);}
  box(c,'#11181f',p.x,top,p.w,4);
 }
 if(pl.lookout)houseFront(c,pl.lookout.x,pl.lookout.top,pl.lookout.w,river,pl.lookout.id,cx,cy,vw,vh);
 rails(c,pl.rails,cx,cy,vw,vh);
}
function bridgePier(c:C,x:number,top:number,river:number){c.fillStyle=fill(c,'quay',quayStone);c.fillRect(Math.round(x),top,44,river-top+20);box(c,'#11181f',x,top,2,river-top);box(c,'#11181f',x+42,top,2,river-top);box(c,'#1c2a30',x-4,river-14,52,14);}

/** World-space construction for the Old Quarter (drawn behind every landing). */
export function drawQuarterPlace(c:C,l:Level,clock:number,cx:number,cy:number,vw:number,vh:number,reduced=false,run?:Run){
 const set=quarterSet(l);if(set){c.save();set.back(c,l,reduced?0:clock,cx,cy,vw,vh,clock,run);c.restore();return;}
 const pl=plan(l);c.save();
 if(l.setting==='roofs')roofs(c,l,pl,cx,cy,vw,vh);
 else if(l.setting==='tower')tower(c,l,pl,clock,cx,cy,vw,vh);
 else if(l.setting==='cavern')basement(c,l,pl,cx,cy,vw,vh);
 else if(l.setting==='canal')canal(c,l,pl,cx,cy,vw,vh);
 else if(l.setting==='bridge')bridge(c,l,pl,cx,cy,vw,vh);
 c.restore();
}

const BIRD=WORLDS[0].edge+'55';
const skies=new WeakMap<C,{h:number;ending:boolean;g:CanvasGradient}>();
/** The sky gradient is rebuilt only when the view height or ending changes. */
function skyGradient(c:C,h:number,ending:boolean){
 const old=skies.get(c);if(old&&old.h===h&&old.ending===ending)return old.g;
 const theme=WORLDS[0],g=c.createLinearGradient(0,0,0,h);g.addColorStop(0,ending?'#485572':theme.sky);g.addColorStop(.7,ending?'#967b89':theme.far);g.addColorStop(1,ending?'#d4ab8b':'#26354a');
 skies.set(c,{h,ending,g});return g;
}
/** Sky for the Old Quarter. Outdoors: one gradient, stars, the moon and the
 * towers at the head of the city. Indoors the wall itself is the backdrop. */
export function drawQuarterSky(c:C,l:Level,w:number,h:number,cx:number,cy:number,clock:number,reduced:boolean,ending=false){
 const theme=WORLDS[0],set=quarterSet(l);
 if(set){set.sky(c,l,w,h,cx,cy,reduced?0:clock,ending);return;}
 if(l.setting==='tower'||l.setting==='cavern'){c.fillStyle='#0f141a';c.fillRect(0,0,w,h);return;}
 c.fillStyle=skyGradient(c,h,ending);c.fillRect(0,0,w,h);
 for(let i=0;i<28;i++){c.fillStyle=i%9===0?theme.accent+'66':'#dfe6dc36';c.fillRect(Math.floor(noise(i,12)*w),Math.floor(noise(i,3)*h*.5),1,1);}
 const mx=Math.round(w*.8-cx*.025),my=Math.round(Math.max(90,h*.22-cy*.03));
 for(let yy=-21;yy<=21;yy++){const span=Math.floor(Math.sqrt(441-yy*yy)),cut=Math.abs(yy+5)<20?9-Math.sqrt(400-(yy+5)*(yy+5)):99,right=Math.min(span,Math.floor(cut));c.fillStyle=yy>10?'#bbc8c2':'#e1e5d2';if(right>-span)c.fillRect(mx-span,my+yy,right+span,1);}
 drawQuarterDistance(c,l,w,h,cx,cy);
 const t=reduced?0:clock;c.strokeStyle=BIRD;c.lineWidth=1;
 for(let i=0;i<3;i++){const x=((i*197+t*(7+i)-cx*.18)%(w+100)+w+100)%(w+100)-50,y=100+noise(i,l.id)*60+Math.sin(t*.5+i)*2,wing=reduced?1:Math.sin(t*4+i)*2;c.beginPath();c.moveTo(x-3,y-wing);c.lineTo(x,y);c.lineTo(x+3,y-wing);c.stroke();}
}
/** Distance layer: the towers once, and the canal's far bank where there is
 * a canal. Shared by the sky and by the vista API used in tests. */
export function drawQuarterDistance(c:C,l:Level,w:number,h:number,cx:number,cy:number){
 if(l.setting==='tower'||l.setting==='cavern'||quarterSet(l))return;
 // Their shafts continue down behind the houses, so the towers never float. Bell Lane has no engine
 // house to stand them on, so level 1 does not draw them over its roofs.
 if(l.id!==0){
  const tx=Math.round(w*.64-cx*.03),ty=Math.round(h*.34-cy*.02);c.drawImage(enginesArt(),tx,ty);
  if(ty+150<h){box(c,'#1c2637',tx+10,ty+150,14,h-ty-150);box(c,'#1c2637',tx+38,ty+150,18,h-ty-150);}
 }
 if(l.setting==='canal'&&l.water!==null){
  const bank=farBank(),y=Math.round(l.water-cy-104),shift=Math.floor(cx*.6),first=Math.floor(shift/256);
  for(let i=first;i*256-shift<w;i++)c.drawImage(bank,i*256-shift,y);
  if(y+120<h){c.fillStyle='#132a35';c.fillRect(0,y+120,w,h-y-120);}
 }
}

/** Pickups in the Quarter are things in the place. A memory is a lit jar on
 * the ledge it belongs to; the dash glint is a lamp on an iron post. Their
 * collision boxes are unchanged: only the drawing finds its support. */
export function drawQuarterPickup(c:C,l:Level,kind:'spark'|'dash'|'key',x:number,y:number,clock:number,reduced:boolean){
 const surfaces=plan(l).surfaces,key=Math.round(x)*8192+Math.round(y);
 let surface=surfaces.get(key);
 if(surface===undefined){surface=null;for(const p of l.platforms)if(p.kind!=='moving'&&p.x<=x&&p.x+p.w>=x&&p.y>=y&&p.y-y<=56&&(surface===null||p.y<surface))surface=p.y;surfaces.set(key,surface);}
 if(surface===null)return false;
 const flicker=reduced?0:Math.round(Math.sin(clock*5+x));x=Math.round(x);
 if(kind==='dash'){
  box(c,'#141b21',x-1,y+6,3,surface-y-6);box(c,'#4f5d61',x,y+6,1,surface-y-6);box(c,'#141b21',x-4,surface-3,9,3);
  box(c,'#9ed6ee22',x-9,y-9,18,18);box(c,'#1c2a32',x-4,y-6,9,12);box(c,'#9ed6ee',x-3,y-4+flicker,7,7);box(c,'#e8f6fb',x-1,y-2+flicker,2,3);box(c,'#4f5d61',x-5,y-8,11,2);
  return true;
 }
 box(c,'#f3c77a14',x-11,surface-26,22,26);box(c,'#f3c77a22',x-7,surface-20,14,20);
 box(c,'#1a2228',x-5,surface-14,10,14);box(c,'#3f4c52',x-4,surface-13,8,12);box(c,'#f3c77a',x-2,surface-10+flicker,4,6);box(c,'#fff0c4',x-1,surface-9+flicker,2,3);box(c,'#6b5a44',x-5,surface-16,10,2);
 return true;
}
