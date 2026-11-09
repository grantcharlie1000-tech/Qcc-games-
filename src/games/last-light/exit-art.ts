import {architectureMasonry} from './architecture';
import type {Level} from './levels';
import type {Run} from './model';
import {goalComposition,serviceDoor} from './composition';
import {clearDuration,departureOffset,departureVisibility,type DepartureView} from './departure';
type C=CanvasRenderingContext2D;
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
function px(c:C,color:string,x:number,y:number,w:number,h:number){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
export function drawServiceDoor(c:C,l:Level,s:Run,color:string,front=false){
 const door=serviceDoor(l);if(!door){if(front&&s.phase!=='playing'&&['shelter','rescue','escape'].includes(l.goal)){const a=goalComposition(l);px(c,'#304650',a.x+13,a.y-44,5,44);px(c,'#8fa08e',a.x+14,a.y-43,1,40);}return;}const {x,y,side}=door,elapsed=clearDuration(l)-s.cinematic,open=s.phase!=='playing'&&elapsed>.22;
 c.save();
 if(!front){
  // A rooftop stairwell surrounds the door, so it belongs to the building.
  px(c,'#192c37',x-26,y-56,52,57);px(c,l.world===2?'#615549':'#536b6c',x-25,y-54,50,53);
  px(c,'#829486',x-25,y-54,2,51);px(c,'#2c4651',x+22,y-54,3,51);
  for(let row=0;row<5;row++){const yy=y-49+row*10;px(c,'#304951',x-24,yy,48,1);for(const xx of [-23,19]){px(c,'#8c9b86',x+xx,yy+2,4,1);px(c,'#314952',x+xx+2,yy+4,1,5);}}
  px(c,'#1b2d37',x-28,y-58,56,5);px(c,'#a6ad91',x-27,y-58,54,1);px(c,'#697e77',x-26,y-56,52,2);
  if(goalComposition(l).art==='lifeTree'){for(const side of [-1,1])for(let j=0;j<5;j++){const xx=x+side*(22+(j%2)*3),yy=y-52+j*10;px(c,'#264c40',xx-3,yy,7,5);px(c,'#799c66',xx-2,yy,4,2);px(c,'#b4bf83',xx-1,yy,2,1);}}
  px(c,'#1b2a35',x-18,y-48,36,50);px(c,'#829187',x-17,y-48,34,3);px(c,'#4a6269',x-16,y-45,5,45);px(c,'#a8b5a2',x-16,y-44,1,42);
  px(c,'#243944',x-11,y-44,24,44);px(c,open?'#f2cd8d':'#765d49',x-10,y-43,22,43);px(c,open?'#fff0c3':'#997d56',x-9,y-42,4,41);
  if(open){px(c,'#c49862',x+3,y-40,8,39);px(c,'#715d4d',x+8,y-39,3,38);}else{for(const xx of [-3,4,10])px(c,'#4a453d',x+xx,y-40,1,39);px(c,color,x+7,y-22,2,3);}
  px(c,'#263e47',x-19,y-2,38,4);px(c,'#b5b49a',x-18,y-2,36,1);
 }else if(s.phase!=='playing'){
  // Foreground jamb occludes the courier as they cross the threshold.
  px(c,'#2b414b',x+(side>0?12:-17),y-45,5,45);px(c,'#91a394',x+(side>0?13:-16),y-44,1,41);
  const close=clamp((elapsed-1.27)/.24);if(close){px(c,'#6b5544',x-10,y-43,Math.round(22*close),43);px(c,'#a68861',x-9,y-42,Math.round(20*close),2);}
 }
 c.restore();
}
/** Native-pixel lift cage. Front rails are drawn after the passenger. */
export function drawLift(c:C,l:Level,s:Run,color:string,reduced:boolean,view:DepartureView,front=false){
 const art=goalComposition(l),x=art.x,y=art.y,compact=art.art!=='engine',half=compact?20:25,elapsed=clearDuration(l)-s.cinematic,offset=departureOffset(l,s,reduced,view),floor=y-8+offset.y,distance=Math.max(280,view.height*.75),upper=y-8-distance;
 c.save();
 if(!front){
  {
   // The lift is a building service, with two occupied landings and a real
   // upper destination. Its tower uses the same masonry as the level.
   c.fillStyle=c.createPattern(architectureMasonry(l.world,l.setting==='factory'||l.setting==='tower'),'repeat')!;
   c.fillRect(x-38,upper-62,176,y-upper+66);px(c,'#172c37',x-40,upper-64,180,5);px(c,'#879a88',x-39,upper-64,178,1);
   for(const dx of [-38,132]){px(c,'#273f49',x+dx,upper-59,6,y-upper+62);px(c,'#7d9183',x+dx,upper-59,1,y-upper+60);}
   px(c,'#182e39',x-half-5,upper-52,half*2+10,y-upper+55);
   for(let yy=y-50;yy>upper-50;yy-=88){px(c,'#4a6268',x-half-3,yy,half*2+6,3);px(c,'#889889',x-half-3,yy,half*2+6,1);
    px(c,'#142b36',x+42,yy-35,72,26);px(c,'#617e7d',x+44,yy-34,68,2);for(let i=0;i<5;i++){px(c,'#3d5964',x+48+i*13,yy-30,3,17);px(c,'#769080',x+48+i*13,yy-30,1,6);}}
   for(const dx of [-half-3,half+1]){px(c,'#5f797c',x+dx,upper-50,2,y-upper+52);px(c,'#a0af9b',x+dx,upper-50,1,y-upper+52);}
   // Upper walkway and doorway are visible before the car arrives.
   px(c,'#203541',x-half-7,upper,half+146,10);px(c,'#b1b497',x-half-6,upper,half+144,2);px(c,'#617c7a',x-half-4,upper+3,half+140,4);
   const door=x+96,open=s.phase!=='playing'&&elapsed>1.42;
   px(c,'#172b36',door-18,upper-48,36,49);px(c,'#879b8c',door-17,upper-48,34,3);px(c,'#4e6b71',door-16,upper-44,5,43);px(c,'#aab69e',door-16,upper-43,1,40);
   px(c,open?'#efce92':'#6c5947',door-10,upper-43,22,43);px(c,open?'#fff0bd':'#ae9060',door-9,upper-42,3,40);px(c,'#b9aa7e',door+7,upper-22,2,3);
   px(c,'#b4af8b',door-19,upper-2,38,3);c.globalAlpha=1;
  }
  for(const dx of [-half-3,half]){px(c,'#203741',x+dx,y-48,3,49);px(c,'#90a092',x+dx,y-48,1,47);}
  px(c,'#263e49',x-half-3,y-50,half*2+6,5);px(c,'#b5ac87',x-half-2,y-50,half*2+4,1);
  if(s.phase!=='playing'&&!reduced)for(const dx of [-10,10]){px(c,'#233b46',x+dx-1,upper-53,3,Math.max(0,floor-43-upper+53));px(c,'#a5af97',x+dx,upper-53,1,Math.max(0,floor-43-upper+53));}
  c.globalAlpha*=departureVisibility(s,reduced);
  px(c,'#172c37',x-half,floor-43,half*2,44);px(c,'#40565d',x-half+2,floor-41,half*2-4,40);px(c,'#223a46',x-half+5,floor-38,half*2-10,36);
  for(const dx of [-half+2,half-4]){px(c,'#8da098',x+dx,floor-40,2,40);px(c,'#c2c2a0',x+dx,floor-40,1,36);}
  px(c,'#a99d78',x-half,floor-43,half*2,3);px(c,color,x-7,floor-40,14,2);
  px(c,'#263e48',x-half-2,floor,half*2+4,9);px(c,'#b8b99b',x-half-1,floor,half*2+2,2);px(c,'#657e7c',x-half+1,floor+3,half*2-2,3);
 }else{
  c.globalAlpha*=departureVisibility(s,reduced);
  const closed=s.phase==='playing'?0:reduced?1:clamp((elapsed-.28)/.24)*(1-clamp((elapsed-1.44)/.16)),spread=half*(1-closed);
  if(closed>0)for(const side of [-1,1]){const edge=x+side*spread;px(c,'#b29f78',edge-1,floor-38,2,37);for(let yy=0;yy<35;yy+=7)px(c,'#788f87',Math.min(edge,x+side*half),floor-35+yy,Math.abs(edge-x-side*half)+1,1);}
  px(c,'#a4b29d',x-half+2,floor-7,half*2-4,2);
  if(s.phase!=='playing'){
   c.globalAlpha=1;px(c,'#2b434d',x+108,upper-45,5,45);px(c,'#99a892',x+109,upper-44,1,40);
   const close=clamp((elapsed-2.08)/.1);if(close){px(c,'#6c5947',x+86,upper-43,22*close,43);px(c,'#b1996e',x+87,upper-42,20*close,2);}
  }
 }
 c.restore();
}
/** The machinery visibly hands the courier onward before the door opens. */
export function drawExitConnection(c:C,l:Level,s:Run,color:string,cy:number,reduced:boolean){
 if(s.phase==='playing')return;const a=goalComposition(l),door=serviceDoor(l),elapsed=clearDuration(l)-s.cinematic,p=clamp(elapsed/.5);
 c.save();
 if(l.goal==='signal'&&elapsed<.65){
  const strength=reduced?.35:Math.sin(clamp(elapsed/.65)*Math.PI)*.65,top=cy-12,antenna=a.y-(a.art==='signal'?60:24);
  for(let y=antenna;y>top;y-=8){c.globalAlpha=strength*Math.max(.12,1-(antenna-y)/Math.max(1,antenna-top));px(c,color,a.x+6,y,2,5);}
  c.globalAlpha=strength;for(let i=0;i<3;i++){const r=5+i*6+p*14;c.strokeStyle=color;c.lineWidth=1;c.beginPath();c.arc(a.x+7,antenna,r,-2.15,-.99);c.stroke();}
 }
 if(door&&l.goal!=='dawn'){
  const from=a.x+18,to=door.x-door.side*18,distance=to-from;c.globalAlpha=.55;px(c,color,from,a.y-7,distance*p,1);
  if(p>.8){px(c,color,to,a.y-7-(p-.8)*180,1,(p-.8)*180);px(c,'#fff0c0',door.x-5,door.y-46,10,2);}
 }
 c.restore();
}
