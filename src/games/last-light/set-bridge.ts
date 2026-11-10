import type {Level,Platform,Station} from './levels';
import {platformAt,type Run} from './model';
import {box,enginesArt,hash,masonry,moon,nightSky,stroke,visible,wall,type C} from './quarter-kit';
import type {QuarterSet} from './quarter-sets';
import {FAR,farBank,hull,quayTile,ripples,sheet,weed} from './set-canal';

/** Level 8 · the old bridge to the garden bank, seen from the river. Its
 * arches have gone; what stands is what you cross. A length of roadway is
 * the top of the pier under it, with the broken haunch of an arch either
 * side. A higher roof is a bridge house standing on its pier. A low ledge
 * is a pier's cutwater, a cracked plank is a builders' trestle in the river,
 * a punt runs on a rope between two stumps, iron landings are a scaffold or
 * the gatehouse stair. The river is under all of it. */
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
 sheet(c,cx-24,vw+48,top,bottom,top-FAR);ripples(c,cx-24,cx+vw+24,top,bottom,top-FAR,t);
 for(let x=Math.floor((cx-24)/22)*22;x<cx+vw+24;x+=22)box(c,'#5a8a94',x+3,top+Math.round(Math.sin(t*1.7+x*.21)),11,1);
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
function sky(c:C,l:Level,w:number,h:number,cx:number,cy:number,t:number,ending:boolean){
 const fy=Math.round(l.water!-FAR-cy);
 nightSky(c,w,h,ending);moon(c,Math.round(w*.76-cx*.02),Math.max(56,fy-250));
 c.drawImage(enginesArt(),Math.round(w*.34-cx*.04),fy-200,96,225);
 farBank(c,w,cx,fy,t);
 if(fy<h){sheet(c,0,w,fy+7,h,fy);c.save();c.translate(-cx,-cy);ripples(c,cx,cx+w,l.water!-FAR+3,l.water!,l.water!-FAR,t);c.restore();}
}
export const bridge:QuarterSet={sky,back,deck,exit,water,station,depth:(p,l)=>role(p,l)==='punt'?10:0};
