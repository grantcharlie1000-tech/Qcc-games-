import type {Level,Platform} from './levels';
import type {Run} from './model';
import {box,hash,masonry,sprite,stroke,visible,wall,type C} from './quarter-kit';
import {MID,MID_SCALE,drawRow,farRoof,headTowers,moon,nightSky,row,townHouse,type Scale,type Tone} from './quarter-distance';
import type {QuarterSet} from './quarter-sets';

/** Levels 4 and 5 · the roofs of the Quarter. Every building stands on its
 * own ground from its own roof line down to the street, so no house is ever
 * painted behind another's roof. A roof is the top of its building; a
 * chimney stack is a solid at the gable end of the roof it belongs to; iron
 * landings are a fire escape bolted to the wall behind them; a lone grating
 * is a gantry on legs; a cracked span is old slate on builders' shoring over
 * an alley. Between buildings there is only the street, a long way down. */
interface Building {x0:number;x1:number;top:number;style:number}
const BUILDINGS:Readonly<Record<number,readonly Building[]>>={
 3:[{x0:0,x1:324,top:1124,style:0},{x0:372,x1:880,top:740,style:1},{x0:1016,x1:1312,top:772,style:2},{x0:1312,x1:1632,top:644,style:0},{x0:1840,x1:2200,top:612,style:1},{x0:2272,x1:2560,top:676,style:2},{x0:2712,x1:3144,top:356,style:0}],
 4:[{x0:0,x1:324,top:620,style:1},{x0:428,x1:608,top:620,style:2},{x0:892,x1:1110,top:588,style:0},{x0:1340,x1:1490,top:572,style:1},{x0:1560,x1:1776,top:668,style:2},{x0:1776,x1:2036,top:540,style:0},{x0:2452,x1:2660,top:476,style:1},{x0:2990,x1:3130,top:476,style:2},{x0:3430,x1:3800,top:412,style:0}],
};
const STYLES=[
 {key:'roofs/brick',mortar:'#1c1719',stones:['#33282a','#382b2c','#3c2f2e'],lip:'#463735',chip:'#4f3f3b',block:16,row:8,trim:'#5b4a44',trimLit:'#7d6a5e',shade:'#201a1c'},
 {key:'roofs/stone',mortar:'#182028',stones:['#2c3640','#303a45','#343f4a'],lip:'#3e4a56',chip:'#475460',block:32,row:16,trim:'#55626d',trimLit:'#7a8791',shade:'#161d25'},
 {key:'roofs/render',mortar:'#22221f',stones:['#3a3a34','#3d3d37','#40403a'],lip:'#49493f',chip:'#515146',block:48,row:24,trim:'#625f52',trimLit:'#8a8674',shade:'#1c1c19'},
] as const;
const tiles=STYLES.map(s=>()=>masonry(s.key,96,48,s.block,s.row,s));
const stackTile=()=>masonry('roofs/stack',32,16,16,8,{mortar:'#1a1415',stones:['#4a3330','#503733','#563b35'],lip:'#644640',chip:'#6e4e46'});
const cobbles=()=>masonry('roofs/cobbles',64,16,16,8,{mortar:'#11161c',stones:['#222a33','#252d36','#272f38'],lip:'#303a44',chip:'#333d47'});
const windows:HTMLCanvasElement[]=[];
/** A sash window: dark, shuttered, or with a lamp lit behind the curtain. */
function sash(kind:number){
 return windows[kind]??=sprite(`roofs/sash/${kind}`,18,28,c=>{
  box(c,'#0f141b',0,0,18,26);box(c,'#4a545c',0,0,18,1);
  if(kind===2){for(let y=2;y<24;y+=3){box(c,'#2a2826',2,y,14,2);box(c,'#3b3835',2,y,14,1);}box(c,'#0f141b',8,2,2,22);}
  else{
   box(c,kind===1?'#6b4728':'#18232f',2,2,14,22);
   if(kind===1){box(c,'#b98443',4,3,10,20);box(c,'#e3b160',6,8,6,12);box(c,'#f7d489',7,12,4,5);box(c,'#7a5434',2,2,2,22);box(c,'#7a5434',14,2,2,22);}
   else{box(c,'#243445',3,3,5,9);box(c,'#2a3c4f',10,14,4,7);}
   box(c,'#0f141b',8,2,2,22);box(c,'#0f141b',2,12,14,2);
  }
  box(c,'#566068',-1,26,20,2);box(c,'#2a3138',0,27,18,1);
 });
}
/** The cornice that finishes a roof line. Drawn along the whole building and
 * again, identically, in each roof tile, so the two can never disagree. */
function cornice(c:C,x:number,y:number,w:number,style:number,phase:number){
 const k=STYLES[style];
 box(c,k.shade,x,y,w,28);box(c,k.trim,x,y,w,9);box(c,k.trimLit,x,y,w,2);box(c,k.shade,x,y+9,w,3);
 box(c,k.trim,x,y+12,w,5);box(c,k.trimLit,x,y+12,w,1);
 for(let i=Math.ceil(phase/10)*10-phase;i<w-4;i+=10)box(c,k.trim,x+i,y+19,5,5);
 box(c,k.shade,x,y+26,w,2);
}
const plans=new WeakMap<Level,{street:number;stacks:{x:number;w:number;ys:number[]}[];gantries:Platform[];byPlatform:Map<number,Building>}>();
function plan(l:Level){
 let made=plans.get(l);if(made)return made;
 const stacks:{x:number;w:number;ys:number[]}[]=[],gantries:Platform[]=[],byPlatform=new Map<number,Building>(),buildings=BUILDINGS[l.id]??[];
 for(const p of l.platforms){
  const b=buildings.find(b=>p.x>=b.x0-2&&p.x+p.w<=b.x1+2);if(b)byPlatform.set(p.id,b);
  if(p.kind!=='grate')continue;
  // A grating on a building's front, at or below its roof line, is fire escape; above a roof it is a gantry on legs.
  if(b&&p.y<b.top){gantries.push(p);continue;}
  const stack=stacks.find(s=>s.x===p.x&&s.w===p.w);if(stack)stack.ys.push(p.y);else stacks.push({x:p.x,w:p.w,ys:[p.y]});
 }
 for(const s of stacks)s.ys.sort((a,b)=>a-b);
 made={street:l.height-20,stacks,gantries,byPlatform};plans.set(l,made);return made;
}
function facade(c:C,b:Building,street:number,lit:boolean,cx:number,cy:number,vw:number,vh:number){
 if(!visible(b.x0,b.top,b.x1-b.x0,street-b.top,cx,cy,vw,vh))return;
 const w=b.x1-b.x0,k=STYLES[b.style];
 wall(c,k.key,tiles[b.style],b.x0,b.top+28,w,street-b.top-28);cornice(c,b.x0,b.top,w,b.style,0);
 box(c,'#0b0f1466',b.x0,b.top+28,w,6);box(c,'#0d1117',b.x0,b.top+2,2,street-b.top-2);box(c,'#0d1117',b.x1-2,b.top+2,2,street-b.top-2);
 // Storeys of sash windows; the street door and a shop window stand at the bottom.
 const cols=Math.max(1,Math.floor((w-24)/44)),gap=(w-cols*18)/(cols+1);
 for(let y=b.top+46,row=0;y+28<street-66;y+=58,row++){
  if(y>cy+vh||y+28<cy)continue;
  box(c,k.shade,b.x0+2,y+38,w-4,2);
  for(let i=0;i<cols;i++){const v=hash(b.x0+i,row,11);c.drawImage(sash(lit?(v<.62?1:v<.85?0:2):(v<.07?1:v<.7?0:2)),Math.round(b.x0+gap+i*(18+gap)),y);}
 }
 if(street-b.top>120&&street-64<cy+vh){
  const door=b.x0+Math.round(w*.5)-10;box(c,'#0f141b',door-2,street-40,24,40);box(c,'#2b211b',door,street-37,20,37);box(c,lit?'#e1b064':'#4d4034',door,street-37,20,5);box(c,'#a9905f',door+15,street-20,2,2);
  if(w>=200){for(const x of [b.x0+18,b.x1-18-56]){box(c,'#0f141b',x,street-46,56,34);box(c,lit?'#8f6a3c':'#1a2530',x+2,street-44,52,30);box(c,k.trim,x-3,street-50,62,4);box(c,k.shade,x,street-12,56,3);}}
 }
 // A downpipe from the gutter to the street on one corner.
 const pipe=b.style===1?b.x0+6:b.x1-10;box(c,'#131a20',pipe,b.top+28,4,street-b.top-28);box(c,'#3d4950',pipe+1,b.top+28,1,street-b.top-28);for(let y=b.top+60;y<street;y+=58)box(c,'#263038',pipe-1,y,6,3);
}
/** Iron fire escape: railed landings on brackets, a ladder between each pair,
 * and a drop ladder hung below the lowest one. */
function fireEscape(c:C,s:{x:number;w:number;ys:number[]},street:number){
 const iron='#1a2228',lit='#56646b',low=s.ys.at(-1)!;
 for(const [i,y] of s.ys.entries()){
  for(const x of [s.x+2,s.x+s.w-5]){box(c,iron,x,y+12,3,4);stroke(c,iron,x+(x===s.x+2?1:1),y+15,x+(x===s.x+2?14:-12),y+12,2);}
  // Rail: a top bar and standards behind whoever stands on the landing.
  box(c,iron,s.x,y-17,s.w,2);box(c,lit,s.x,y-17,s.w,1);for(let x=s.x+1;x<s.x+s.w;x+=10)box(c,iron,x,y-15,1,15);box(c,iron,s.x,y-9,s.w,1);
  if(i){const below=s.ys[i],above=s.ys[i-1],x=i%2?s.x+16:s.x+s.w-28;if(below-above<=80){box(c,iron,x,above-14,2,below-above+14);box(c,iron,x+10,above-14,2,below-above+14);box(c,lit,x,above-14,1,below-above+14);for(let yy=above+18;yy<below;yy+=7)box(c,'#3a464d',x+2,yy,8,1);}}
 }
 const x=s.x+Math.round(s.w/2)-6,end=Math.min(low+12+84,street-44);
 box(c,iron,x,low+12,2,end-low-12);box(c,iron,x+10,low+12,2,end-low-12);box(c,lit,x,low+12,1,end-low-12);for(let yy=low+18;yy<end;yy+=7)box(c,'#3a464d',x+2,yy,8,1);
}
function gantry(c:C,p:Platform,l:Level){
 let foot=l.height-20;for(const q of l.platforms)if(q!==p&&q.kind!=='grate'&&q.x<p.x+p.w&&q.x+q.w>p.x&&q.y>p.y&&q.y<foot)foot=q.y;
 const iron='#1a2228';
 for(const x of [p.x+6,p.x+p.w-9]){box(c,iron,x,p.y+12,3,foot-p.y-12);box(c,'#56646b',x,p.y+12,1,foot-p.y-12);}
 stroke(c,iron,p.x+8,p.y+14,p.x+p.w-8,foot-2,1);stroke(c,iron,p.x+p.w-8,p.y+14,p.x+8,foot-2,1);
 box(c,iron,p.x,p.y-15,p.w,2);box(c,'#56646b',p.x,p.y-15,p.w,1);for(let x=p.x+1;x<p.x+p.w;x+=12)box(c,iron,x,p.y-13,1,13);
}
/** Builders' shoring under a cracked span: poles to the street, tied and braced. */
function shoring(c:C,p:Platform,street:number){
 const pole='#2a231d',lit='#5d4f40';
 for(const x of [p.x+8,p.x+p.w-12]){box(c,pole,x,p.y+20,4,street-p.y-20);box(c,lit,x,p.y+20,1,street-p.y-20);box(c,pole,x-3,street-3,10,3);}
 for(let y=p.y+52,i=0;y<street-20;y+=64,i++){box(c,pole,p.x+8,y,p.w-16,3);box(c,lit,p.x+8,y,p.w-16,1);if(y+64<street-10)stroke(c,pole,i%2?p.x+10:p.x+p.w-12,y+3,i%2?p.x+p.w-12:p.x+10,y+64,2);}
 box(c,pole,p.x+2,p.y+20,p.w-4,4);box(c,lit,p.x+2,p.y+20,p.w-4,1);
}
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number,clock:number,s?:Run){
 const pl=plan(l),street=pl.street,buildings=BUILDINGS[l.id]??[],courier=s?s.x:-1;
 if(street<cy+vh+24){
  wall(c,'roofs/cobbles',cobbles,cx-24,street,vw+48,cy+vh+24-street);box(c,'#3a444d',cx-24,street,vw+48,1);
  // A street lamp stands in every street. With the engine holding the light, none burns.
  for(let i=1;i<buildings.length;i++){const a=buildings[i-1],b=buildings[i],gap=b.x0-a.x1;if(gap<100)continue;const x=Math.round(a.x1+gap/2);if(x<cx-30||x>cx+vw+30)continue;box(c,'#141b21',x-1,street-70,3,70);box(c,'#3d4a51',x,street-70,1,70);box(c,'#141b21',x-5,street-84,11,14);box(c,'#232e37',x-3,street-82,7,10);box(c,'#3d4a51',x-5,street-86,11,2);box(c,'#141b21',x-4,street-4,9,4);}
 }
 // A house you have carried the lantern past lights its own windows.
 for(const b of buildings)facade(c,b,street,courier>b.x1-20,cx,cy,vw,vh);
 for(const p of l.platforms){
  if(!visible(p.x-10,p.y-20,p.w+20,street-p.y+20,cx,cy,vw,vh))continue;
  if(p.kind==='crumble')shoring(c,p,street);
 }
 for(const p of pl.gantries)if(visible(p.x-10,p.y-20,p.w+20,120,cx,cy,vw,vh))gantry(c,p,l);
 for(const stack of pl.stacks)if(visible(stack.x,stack.ys[0]-20,stack.w,street-stack.ys[0],cx,cy,vw,vh))fireEscape(c,stack,street);
 // The light wires: one sagging run from roof to roof across every street, toward the towers.
 for(let i=1;i<buildings.length;i++){const a=buildings[i-1],b=buildings[i];if(b.x0-a.x1<40||!visible(a.x1,Math.min(a.top,b.top)-20,b.x0-a.x1,Math.abs(a.top-b.top)+60,cx,cy,vw,vh))continue;
  const steps=Math.round((b.x0-a.x1)/4);for(let k=0;k<=steps;k++){const u=k/steps;box(c,'#0f141a',a.x1+(b.x0-a.x1)*u,a.top+30+(b.top-a.top)*u+Math.sin(u*Math.PI)*12,2,1);}}
}
function deck(c:C,p:Platform,l:Level){
 const w=p.w,b=plan(l).byPlatform.get(p.id);
 if(p.kind==='grate'){
  // An iron landing: flat bar treads you can come up through.
  box(c,'#12191e',-2,0,w+4,12);box(c,'#aab3ae',0,0,w,1);box(c,'#5d6b70',0,1,w,2);
  for(let x=3;x<w-3;x+=8){box(c,'#1c272d',x,3,3,7);box(c,'#6d7d80',x,3,1,6);}
  box(c,'#2f3d43',0,10,w,2);return;
 }
 if(p.kind==='crumble'){
  // Old slate on rotten battens: courses slipped, a few already gone.
  box(c,'#15110e',0,0,w,28);box(c,'#3a2d23',0,14,w,12);box(c,'#4a3828',0,14,w,1);
  for(let x=6;x<w-4;x+=22){box(c,'#241b15',x,16,5,10);box(c,'#57432f',x+1,16,1,10);}
  for(let row=0;row<2;row++)for(let x=-((row*7+p.id*3)%14);x<w;x+=14){const v=hash(x,row,p.id);if(v>.86)continue;box(c,v>.5?'#55606b':'#4b5661',Math.max(0,x),row*7,Math.min(13,w-Math.max(0,x)),7);box(c,'#6f7b86',Math.max(0,x),row*7,Math.min(13,w-Math.max(0,x)),1);box(c,'#2c343c',Math.max(0,x)+Math.min(12,w-Math.max(0,x)-1),row*7,1,7);if(v<.2)stroke(c,'#2c343c',x+3,row*7+1,x+8,row*7+6);}
  box(c,'#98a3ab',0,0,w,1);box(c,'#15110e',0,26,w,2);return;
 }
 if(p.h>28){
  // A brick stack on the gable: oversailing courses and a cement flaunching.
  wall(c,'roofs/stack',stackTile,0,10,w,p.h-10);box(c,'#120e0f',0,10,2,p.h-10);box(c,'#120e0f',w-2,10,2,p.h-10);
  box(c,'#1a1415',-3,3,w+6,8);box(c,'#5e423c',-3,3,w+6,6);box(c,'#7a5a50',-3,3,w+6,1);box(c,'#1a1415',-2,9,w+4,2);
  box(c,'#6c7378',-1,0,w+2,4);box(c,'#9aa2a4',-1,0,w+2,2);
  if(w>=60){box(c,'#120e0f',Math.round(w/2)-9,26,18,p.h-26);for(let y=30;y<p.h-4;y+=5)box(c,'#3a2d2b',Math.round(w/2)-7,y,14,2);}
  return;
 }
 cornice(c,0,0,w,b?.style??0,b?p.x-b.x0:0);
 // The walked edge of a roof is its coping, paler than the cornice below it.
 box(c,'#aab3b3',0,0,w,1);
}
function exit(c:C,l:Level,s:Run,t:number,front:boolean){
 if(front)return;
 const x=Math.round(l.exit.x+l.exit.w/2),y=l.exit.y+l.exit.h,end=l.platforms[l.mainCount-1],open=s.phase!=='playing';let right=end.x+end.w;
 // The roof stair-house: brick walls under a flat lead cap, and its door standing open on a lit stair.
 const west=x-end.x<end.w/2,left=west?end.x:x-34,width=(west?x+34:right)-left,top=y-84;right=left+width;
 wall(c,'roofs/stack',stackTile,left,top+8,width,76);box(c,'#120e0f',left,top+8,2,76);box(c,'#120e0f',right-2,top+8,2,76);
 box(c,'#1a1415',left-4,top,width+8,9);box(c,'#6c7378',left-4,top,width+8,5);box(c,'#9aa2a4',left-4,top,width+8,2);
 box(c,'#f3c77a12',x-36,y-76,72,76);
 box(c,'#120e0f',x-21,y-62,42,62);box(c,'#7a5a50',x-21,y-62,42,3);box(c,'#3a2826',x-19,y-59,3,59);box(c,'#3a2826',x+16,y-59,3,59);
 box(c,'#c98f4b',x-16,y-58,32,58);box(c,'#f0c47a',x-10,y-56,20,56);box(c,'#fff0c4',x-5,y-48,10,48);
 // Stair treads going down into the house, and the leaf folded back.
 for(let i=0;i<4;i++)box(c,'#a8743c',x-10+i*2,y-10-i*9,20-i*4,2);
 box(c,'#3b2a1d',x-16,y-58,7,58);box(c,'#5d4129',x-15,y-57,5,57);box(c,'#262d33',x-16,y-44,7,2);box(c,'#262d33',x-16,y-16,7,2);
 if(open)box(c,'#fff0c466',x-10,y-56,20,56);
 box(c,'#f3c77a44',x-22,y-1,44,1);
 // A small window and a vent on the rest of the wall.
 const side=west?-1:1;if(width>110){c.drawImage(sash(1),x+side*49-9,y-56);if(width>170){box(c,'#120e0f',x+side*95-11,y-50,22,16);for(let yy=y-48;yy<y-36;yy+=4)box(c,'#3a2d2b',x+side*95-9,yy,18,2);}}
}
/** Past the roofs you walk are the roofs you do not: the row across the
 * street, whose eaves stay below your own; the next streets' roofs behind
 * them; and the ridge of the far city under the towers. Each row follows the
 * climb of the roofs in front of it, so the Quarter rises as you do. */
const NEAR:Tone={walls:['#1a222e','#1d2531','#201f28','#1c2228'],edge:'#2c3848',shade:'#111822',roof:'#263345',course:'#1f2a3a',ridge:'#3b4c64',glass:'#0e151f',pane:'#1c2b3d',lit:'#b07d40',glow:'#eab968'};
const NEAR_SCALE:Scale={unit:26,ww:8,wh:12,pitch:17,lit:.1};
const NEAR_HEAD=58,MID_HEAD=32,FAR_HEAD=36,FAR_WALL='#243148';
const nearRow=row(104,11,NEAR_HEAD+230,(c,i,w,h)=>townHouse(c,w,NEAR_HEAD,h,i*7+3,NEAR,NEAR_SCALE),i=>NEAR.walls[Math.floor(hash(i*7+3,2,5)*NEAR.walls.length)]);
const midRow=row(58,12,MID_HEAD+150,(c,i,w,h)=>townHouse(c,w,MID_HEAD,h,i*5+1,MID,MID_SCALE),i=>MID.walls[Math.floor(hash(i*5+1,2,5)*MID.walls.length)]);
const farRow=row(30,13,FAR_HEAD+60,(c,i,w,h)=>farRoof(c,w,FAR_HEAD,h,i,FAR_WALL,'#2d3c56','#b98a4a'),()=>FAR_WALL);
const profiles=new WeakMap<Level,{low:Float32Array;wide:Float32Array}>();
/** The height of the walked roofs along the level: the lowest roof within a street, and within a district. */
function profile(l:Level){
 let made=profiles.get(l);if(made)return made;
 const buildings=BUILDINGS[l.id]??[],n=Math.ceil(l.width/50)+1,raw=new Float32Array(n),low=new Float32Array(n),wide=new Float32Array(n);
 for(let k=0;k<n;k++){const x=k*50;let top=0,before=-1e9,after=1e9,a=l.height,b=l.height;
  for(const q of buildings){if(x>=q.x0&&x<=q.x1)top=q.top;if(q.x1<x&&q.x1>before){before=q.x1;a=q.top;}if(q.x0>x&&q.x0<after){after=q.x0;b=q.top;}}
  raw[k]=top||Math.max(before>-1e9?a:b,after<1e9?b:a);}
 for(let k=0;k<n;k++){let a=0,b=0;for(let d=-8;d<=8;d++){const v=raw[Math.max(0,Math.min(n-1,k+d))];if(Math.abs(d)<=4)a=Math.max(a,v);b=Math.max(b,v);}low[k]=a;wide[k]=b;}
 made={low,wide};profiles.set(l,made);return made;
}
const view:{l:Level|null;w:number;h:number;cy:number;low:Float32Array;wide:Float32Array}={l:null,w:0,h:0,cy:0,low:new Float32Array(1),wide:new Float32Array(1)};
/** Where a roof line `rise` above the walked roofs sits on screen, for a house at layer position `u` and depth `p`. */
function place(u:number,p:number,env:Float32Array){
 const {l,w,h,cy}=view,roof=env[Math.max(0,Math.min(env.length-1,Math.round(((u-w/2)/p+w/2)/50)))],follow=Math.max(-170,Math.min(Math.max(0,l!.height-h),roof-24-h*.57));
 return roof-follow+(follow-cy)*p;
}
const farBase=(i:number,x:number,wide:number)=>place(x+wide/2,.08,view.wide)-72-Math.floor(hash(i,1,41)*30)-FAR_HEAD+farRow.height;
const midBase=(i:number,x:number,wide:number)=>place(x+wide/2,.24,view.wide)-8-Math.floor(hash(i,1,43)*50)-MID_HEAD+midRow.height;
const nearBase=(i:number,x:number,wide:number)=>place(x+wide/2,.5,view.low)+34+Math.floor(hash(i,1,47)*56)-NEAR_HEAD+nearRow.height;
function sky(c:C,l:Level,w:number,h:number,cx:number,cy:number,t:number,ending:boolean){
 nightSky(c,w,h,ending,cx,t);moon(c,Math.round(w*.8-cx*.02),Math.round(Math.max(56,h*.2-cy*.02)));
 const pr=profile(l);view.l=l;view.w=w;view.h=h;view.cy=cy;view.low=pr.low;view.wide=pr.wide;
 // The towers stand at the head of the city; their shafts go down behind its far ridge.
 c.drawImage(headTowers(),Math.round(w*.42-cx*.04),Math.round(place(w*.42+cx*.04,.08,pr.wide))-262);
 drawRow(c,farRow,w,cx*.08,farBase,h);
 drawRow(c,midRow,w,cx*.24,midBase,h);
 drawRow(c,nearRow,w,cx*.5,nearBase,h);
}
export const roofs:QuarterSet={sky,back,deck,exit};
