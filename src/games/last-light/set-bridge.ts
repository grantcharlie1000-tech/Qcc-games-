import type {Level,Platform,Station} from './levels';
import {platformAt,type Run} from './model';
import {box,hash,masonry,sprite,stroke,visible,wall,type C} from './quarter-kit';
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
const house=()=>masonry('bridge/house',96,48,48,24,{mortar:'#22221f',stones:['#3a3a34','#3d3d37','#40403a'],lip:'#49493f',chip:'#515146'});
type Role='road'|'house'|'stack'|'cutwater'|'plank'|'punt'|'iron'|'gate';
function role(p:Platform,l:Level):Role{
 if(p.kind==='moving')return 'punt';if(p.kind==='grate')return 'iron';if(p.kind==='crumble')return 'plank';if(p.h>28)return 'stack';
 if(p.x>=gate(l))return 'gate';
 return p.y>DECK+40?'cutwater':p.y<DECK-20?'house':'road';
}
/** The last four landings are the gatehouse on the garden bank: its wall walk, its stair and its lookout. */
const gate=(l:Level)=>l.platforms[l.mainCount-4].x;
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
function back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number,clock:number,s?:Run){
 const water=l.water!,east=gate(l),end=l.platforms[l.mainCount-1];
 // The gatehouse on the garden bank: one wall from its lookout down into the river.
 if(visible(east-10,end.y-120,l.width-east+20,water-end.y+200,cx,cy,vw,vh)){
  for(const p of l.platforms)if(role(p,l)==='gate'){wall(c,'canal/quay',quayTile,p.x,p.y+8,p.x===east?l.width-p.x+40:p.w+60,water+40-p.y-8);box(c,'#0f161d',p.x,p.y+8,2,water+40-p.y);}
  for(let y=end.y+60;y<water-60;y+=70)for(let x=end.x+30;x<end.x+end.w;x+=70){box(c,'#0d1218',x,y,10,26);box(c,'#1a2633',x+2,y+2,6,22);}
  weed(c,east,l.width-east+40,water,7);
 }
 for(const f of fallen(l))if(visible(f.x,water-20,f.w,40,cx,cy,vw,vh))rubble(c,f.x,f.w,water);
 for(const p of l.platforms){
  const kind=role(p,l);if(kind==='gate'||!visible(p.x-70,p.y-80,p.w+140,water+80-p.y+80,cx,cy,vw,vh))continue;
  if(kind==='road'){
   if(p.id===0){wall(c,'canal/quay',quayTile,0,p.y+8,p.x+p.w,water+40-p.y-8);box(c,'#0f161d',p.x+p.w-2,p.y+8,2,water+40-p.y);weed(c,0,p.x+p.w,water,1);}
   else pier(c,p.x,p.w,p.y+8,water,true);
   // The parapet on the far side of the roadway.
   box(c,'#232d38',p.x,p.y-12,p.w,12);box(c,'#3a4653',p.x,p.y-12,p.w,2);for(let x=p.x+6;x<p.x+p.w-4;x+=12)box(c,'#161d26',x,p.y-8,5,6);
  }else if(kind==='house'){
   // A bridge house on its own pier: a rendered front, shuttered windows, the roadway arch under it.
   wall(c,'bridge/house',house,p.x,p.y+28,p.w,DECK-p.y-28);box(c,'#15150f',p.x,p.y+28,2,DECK-p.y-28);box(c,'#15150f',p.x+p.w-2,p.y+28,2,DECK-p.y-28);
   const lit=!!s&&s.x>p.x+p.w;for(let x=p.x+22;x<p.x+p.w-30;x+=46){box(c,'#0f141b',x,p.y+38,16,20);box(c,lit?'#b98443':'#18232f',x+2,p.y+40,12,16);box(c,'#0f141b',x+7,p.y+40,2,16);box(c,'#566068',x-1,p.y+58,18,2);}
   box(c,'#232d38',p.x,DECK,p.w,8);pier(c,p.x,p.w,DECK+8,water,true);
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
 const x=Math.round(l.exit.x+l.exit.w/2),y=l.exit.y+l.exit.h,end=l.platforms[l.mainCount-1],right=end.x+end.w,open=s.phase!=='playing';
 // The garden gate: a round-headed door in the gatehouse turret, a green lamp over it.
 const left=x-44;wall(c,'canal/quay',quayTile,left,y-104,right-left+60,104);box(c,'#0f161d',left,y-104,2,104);
 for(let xx=left;xx<right+60;xx+=24){box(c,'#2f3a45',xx,y-116,14,12);box(c,'#414d59',xx,y-116,14,2);}
 box(c,'#f3c77a10',x-40,y-84,80,84);
 box(c,'#0f161d',x-24,y-62,48,62);box(c,'#0f161d',x-19,y-69,38,8);box(c,'#0f161d',x-12,y-74,24,6);
 box(c,'#55616d',x-22,y-60,5,60);box(c,'#55616d',x+17,y-60,5,60);box(c,'#55616d',x-17,y-67,34,6);box(c,'#55616d',x-10,y-72,20,5);
 box(c,'#c98f4b',x-17,y-58,34,58);box(c,'#c98f4b',x-12,y-63,24,6);box(c,'#f0c47a',x-10,y-56,20,56);box(c,'#fff0c4',x-4,y-48,8,48);
 box(c,'#2d4a35',x-17,y-58,7,58);box(c,'#3f6247',x-16,y-57,5,57);box(c,'#1a2228',x-17,y-42,7,2);box(c,'#1a2228',x-17,y-16,7,2);
 if(open)box(c,'#fff0c466',x-10,y-56,20,56);
 box(c,'#7d878c',x-26,y-3,52,3);box(c,'#f3c77a44',x-22,y-1,44,1);
 box(c,'#141b21',x-5,y-92,10,14);box(c,'#8fd39a',x-3,y-90,6,10);box(c,'#d8f0c8',x-1,y-88,2,5);box(c,'#8fd39a18',x-16,y-102,32,32);
 // Ivy from the garden side has come over the wall.
 for(let i=0;i<9;i++){const v=hash(i,3,77),xx=x+34+i*9;if(xx>right+50)break;box(c,v>.5?'#3a5a44':'#2c4739',xx,y-104,5,10+Math.floor(v*38));box(c,'#52745a',xx+1,y-104+Math.floor(v*20),2,3);}
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
