import {WORLDS,type Level} from './levels';
import type {Run} from './model';
import {lantern} from './props';
import {noise} from './terrain';
import {speakerFor,characterColor} from './story';
import {tree,cat,washing,settingDetails} from './environment-art';
import {drawVistas} from './vista-art';
import {person} from './inhabitants';
import {landmarks,atmosphere} from './environment-landmarks';
export {person} from './inhabitants';
const TALK_LABEL=typeof matchMedia==='function'&&matchMedia('(any-pointer:coarse)').matches?'TAP · TALK':'ENTER · TALK';
export {worldDressing} from './habitats';
import {worldDressing,nearbyAnimal} from './habitats';
import {petPose} from './affection';
function gear(c:CanvasRenderingContext2D,x:number,y:number,r:number,t:number,color:string){c.save();c.translate(x,y);c.rotate(t);c.strokeStyle=color;c.lineWidth=5;c.beginPath();c.arc(0,0,r,0,Math.PI*2);c.stroke();for(let i=0;i<10;i++){c.rotate(Math.PI/5);c.fillStyle=color;c.fillRect(-3,-r-5,6,10);if(i%2===0)c.fillRect(-2,-r,4,r);}c.fillStyle='#1e2634';c.fillRect(-5,-5,10,10);c.restore();}
export function drawSky(c:CanvasRenderingContext2D,l:Level,s:Run,w:number,h:number,cx:number,cy:number,reduced:boolean){
 const theme=WORLDS[l.world],t=reduced?0:s.clock;
 const gradient=c.createLinearGradient(0,0,0,h);gradient.addColorStop(0,s.ending?'#485572':theme.sky);gradient.addColorStop(.65,s.ending?'#967b89':theme.far);gradient.addColorStop(1,s.ending?'#d4ab8b':theme.sky);c.fillStyle=gradient;c.fillRect(0,0,w,h);
 for(let i=0;i<(l.setting==='cavern'?0:28);i++){c.fillStyle=i%9===0?theme.accent+'66':'#dfe6dc36';c.fillRect(Math.floor(noise(i,12)*w),Math.floor(noise(i,3)*h*.56),1,1);}
 const mx=Math.round(w*.8-cx*.025),my=Math.round(Math.max(100,h*.24-cy*.03));
 if(l.setting!=='cavern'){
  const halo=c.createRadialGradient(mx,my,12,mx,my,83);halo.addColorStop(0,theme.accent+'13');halo.addColorStop(1,theme.accent+'00');c.fillStyle=halo;c.fillRect(mx-83,my-83,166,166);
  // Scanline silhouette gives the moon the same pixel language as the foreground.
  for(let yy=-21;yy<=21;yy++){const span=Math.floor(Math.sqrt(441-yy*yy));const cut=Math.abs(yy+5)<20?9-Math.sqrt(400-(yy+5)*(yy+5)):99;c.fillStyle=yy>10?'#bbc8c2':'#e1e5d2';const right=Math.min(span,Math.floor(cut));if(right>-span)c.fillRect(mx-span,my+yy,right+span,1);}
  c.fillStyle='#a7bbb566';c.fillRect(mx-16,my+7,3,2);c.fillRect(mx-12,my+13,2,3);c.fillRect(mx-18,my-2,2,3);
 }

 atmosphere(c,l,w,h,cx,t);
 drawVistas(c,l,w,h,cx,cy,t);
 // A location-specific midground makes a tower, canal and greenhouse read as different spaces.
 c.save();c.translate(-cx*.65,-cy*.55);c.globalAlpha=.64;
 if(l.setting==='tower'){
  const x=l.width*.43;c.fillStyle=theme.far;c.fillRect(x,-160,180,l.height+400);c.fillStyle=theme.near;c.fillRect(x+12,-160,12,l.height+400);c.fillRect(x+150,-160,12,l.height+400);
  for(let y=-100;y<l.height;y+=132){c.fillStyle=theme.sky;c.fillRect(x+55,y,64,46);c.fillStyle=theme.accent+'19';c.fillRect(x+61,y+6,52,2);}
 }
 if(l.setting==='factory')for(let i=0;i<3;i++){const x=140+i*480;if(x+170<cx*.65||x>cx*.65+w)continue;c.strokeStyle='#a87e6327';c.lineWidth=12;c.beginPath();c.moveTo(x,90);c.lineTo(x,240);c.lineTo(x+140,240);c.lineTo(x+140,640);c.stroke();if(i===1)gear(c,x+65,180,30,t*.1,theme.edge+'2b');}

 settingDetails(c,l,t,cx,cy,w,h);
 landmarks(c,l,cx,cy,w,h,t);
 c.restore();
 // Birds circle the skyline; their wingbeat and drifting cloud banks freeze when paused.
 if(l.world!==2&&l.setting!=='cavern')for(let i=0;i<3;i++){const x=((i*197+t*(7+i)-cx*.18)%(w+100)+w+100)%(w+100)-50,y=110+noise(i,l.id)*64+Math.sin(t*.5+i)*2;c.strokeStyle=theme.edge+'55';c.lineWidth=1;const wing=reduced?1:Math.sin(t*4+i)*2;c.beginPath();c.moveTo(x-3,y-wing);c.lineTo(x,y);c.lineTo(x+3,y-wing);c.stroke();}
 c.fillStyle=theme.sky+'44';c.fillRect(0,h*.86,w,h*.14);
}
export function drawLife(c:CanvasRenderingContext2D,l:Level,s:Run,cx:number,cy:number,w:number,h:number,reduced:boolean){
 const theme=WORLDS[l.world],t=reduced?0:s.clock;
 if(l.water!==null){const y=l.water,left=Math.max(0,Math.floor(cx/24)*24),right=Math.min(l.width,cx+w+24);c.fillStyle='#153440';c.fillRect(left,y,right-left,l.height-y+200);
  for(let i=left;i<right;i+=24){const wave=Math.sin(t*2+i)*1.3;c.fillStyle=theme.edge+'55';c.fillRect(i+Math.sin(t+i)*3,y+wave,15,1);
   for(let j=0;j<5;j++){const offset=Math.sin(t*1.1+j+i)*4,yy=y+6+j*j*3;c.fillStyle=j%2?theme.glow+'22':theme.edge+'22';c.fillRect(i+offset,yy,8+j*3,1);}
  }
  // Long, broken warm reflections underneath the inhabited banks.
  for(let i=Math.floor(left/135);i<right/135;i++){const xx=i*135+38;for(let j=0;j<12;j++){c.fillStyle=j%3?'#d7a96722':'#c1c3a033';c.fillRect(xx+Math.sin(t+j*.8+i)*4-j*.4,y+4+j*5,5+j,1);}}
 }

 const first=l.platforms[0];
 if(first.x+first.w>cx-30&&first.x<cx+w+30&&first.y>cy-80&&first.y<cy+h+50){
  if(s.stage===33){
   // Mira remains a radio voice here, never a second physical character.
   c.fillStyle='#172b36';c.fillRect(149,first.y-19,23,19);c.fillStyle='#778d89';c.fillRect(150,first.y-18,21,16);c.fillStyle='#aec0a5';c.fillRect(151,first.y-17,19,2);c.fillStyle='#31464a';c.fillRect(152,first.y-13,10,9);c.fillStyle='#a4b49c';for(let j=0;j<4;j++)c.fillRect(153,first.y-12+j*2,8,1);c.fillStyle='#d8bf86';c.fillRect(165,first.y-12,4,4);c.fillStyle='#172b36';c.fillRect(166,first.y-11,1,2);c.fillStyle='#b8c5b2';c.fillRect(168,first.y-31,1,13);c.fillRect(154,first.y-22,12,2);c.fillRect(154,first.y-21,2,3);c.fillRect(164,first.y-21,2,3);c.fillStyle='#d4db9b';c.fillRect(165,first.y-5,2,1);
  }else person(c,160,first.y,t,characterColor(speakerFor(s.stage),l.world),0,Math.sign(s.x-160)||1);
  if(Math.abs(s.x+8-160)<124&&Math.abs(s.y+24-first.y)<72){c.fillStyle=theme.accent;c.font='9px monospace';c.textAlign='center';c.fillText(TALK_LABEL,160,first.y-47);c.textAlign='start';}
 }
 for(const item of worldDressing(l)){
  const {kind,x,y,bounds}=item;
  if(bounds.x+bounds.w<cx-8||bounds.x>cx+w+8||bounds.y+bounds.h<cy-8||bounds.y>cy+h+8)continue;
  c.save();
  // Residents and fixtures stay present when approached. The courier is
  // drawn afterward, so their silhouette remains readable without erasing life.
  c.globalAlpha=kind==='tree'?.68:kind==='resident'?.9:.82;
  if(kind==='resident'){
   const drift=reduced?0:Math.sin(t*.3+l.id)*7,velocity=reduced?0:Math.cos(t*.3+l.id);
   person(c,x+drift,y,t,l.world===1?'#8f9c70':l.world===2?'#b79871':'#7f9daa',velocity*.3,Math.sign(velocity)||1);
  }else if(kind==='tree')tree(c,x,y,t*.45,l.id,.62,false);
  else if(kind==='washing')washing(c,x-48,y,96,t*.45);
  else if(kind==='cat'){
   const affection=s.pet?.platform===item.platform?petPose(s,reduced):null;
   cat(c,x,y,t*.7,s.x<x,affection?.contact??0,reduced);
   if(nearbyAnimal(l,s)===item&&!s.pet){c.fillStyle=theme.accent;c.font='8px monospace';c.textAlign='center';c.fillText(TALK_LABEL.startsWith('TAP')?'TAP · PET':'ENTER · PET',x,y-33);c.textAlign='start';}
   if(affection&&affection.contact>0&&!reduced){
    // Two small pixel hearts lift from the cat, then fade before the recovery.
    for(let i=0;i<2;i++){const p=Math.max(0,Math.min(1,(affection.age-.28-i*.23)/.6));if(p<=0||p>=1)continue;c.globalAlpha=(1-p)*.8;c.fillStyle='#edaa92';const hx=Math.round(x-4+i*10),hy=Math.round(y-27-p*11);c.fillRect(hx,hy,2,2);c.fillRect(hx+3,hy,2,2);c.fillRect(hx+1,hy+2,3,2);c.fillRect(hx+2,hy+4,1,1);}
   }
  }
  else{
   c.fillStyle='#233945';c.fillRect(x-2,y-43,4,43);c.fillStyle='#758b85';c.fillRect(x-1,y-38,1,35);c.fillStyle='#9f9e82';c.fillRect(x-5,y-3,10,3);lantern(c,x,y-46,theme.accent,false);
  }
  c.restore();
 }
 if(l.goal==='engine'&&s.activated.length){
  for(const station of l.stations){if(!s.activated.includes(station.id))continue;const x=station.x,y=station.y;
   c.strokeStyle=l.world===1?'#9bc5b277':'#d3c6a477';c.lineWidth=2;c.beginPath();c.moveTo(x,y-10);c.lineTo(x+45,y-10);c.lineTo(x+45,y+70);c.stroke();
   for(let i=0;i<12;i++){const drop=reduced?i/12:(t*.7+i/12)%1;c.fillStyle=l.world===1?'#bddfc780':'#d3d6c755';c.fillRect(x+43+(l.world===1?0:Math.sin(drop*7)*8),y+drop*66,2,l.world===1?5:2);}
  }
 }
 // A few distant motes carry the weather; foreground play keeps its contrast.
 const particles=l.world===3?12:l.world===1?5:l.setting==='cavern'?4:6;
 for(let i=0;i<particles;i++){
  const xx=((noise(i,7)*w+t*(l.world===3?7:2))%w+w)%w;
  const yy=((noise(i,9)*h+t*(l.world===3?10:l.world===0?12:-3))%h+h)%h;
  c.fillStyle=l.world===3?'#deeff13e':l.world===1?'#d3daa338':theme.glow+'27';
  c.fillRect(Math.floor(cx+xx),Math.floor(cy+yy),1,l.world===0?2:1);
 }
 if(l.goal==='escape'){
  const gradient=c.createLinearGradient(s.threat-100,0,s.threat+30,0);gradient.addColorStop(0,'#131625f2');gradient.addColorStop(1,'#18223500');c.fillStyle=gradient;c.fillRect(cx-200,cy,Math.max(0,s.threat+30-cx+200),h);c.strokeStyle='#bc839655';c.lineWidth=1;c.beginPath();c.moveTo(s.threat,cy);c.lineTo(s.threat+Math.sin(t*3)*8,cy+h);c.stroke();
 }
}
export function drawGear(c:CanvasRenderingContext2D,x:number,y:number,r:number,t:number,color:string){gear(c,x,y,r,t,color);}

/** Depth haze sits behind every collision deck, hazard and actor. Structural
 * columns continue below the view, so fog conceals distance rather than a cut. */
export function drawDepthFog(c:CanvasRenderingContext2D,l:Level,s:Run,cx:number,cy:number,w:number,h:number,reduced:boolean){
 if(l.water!==null)return;
 const color=l.world===3?'#acc5d1':l.world===1?'#6b8b84':l.world===2?'#696677':l.world===4?'#8c849e':'#7d929e',start=cy+h*.64;
 const fade=c.createLinearGradient(0,start,0,cy+h);fade.addColorStop(0,color+'00');fade.addColorStop(.46,color+'26');fade.addColorStop(1,color+'a3');
 c.save();c.fillStyle=fade;c.fillRect(cx,start,w,cy+h-start);
 // Quiet broad wisps break up the horizon. No moving haze covers gameplay.
 const t=reduced?0:s.clock;
 for(let i=0;i<4;i++){const yy=cy+h*(.76+i*.065),drift=reduced?0:Math.sin(t*.2+i)*9,xx=cx-w*.2+(i%2)*w*.14+drift;c.globalAlpha=.025;c.fillStyle=color;c.fillRect(Math.round(xx),Math.round(yy),Math.round(w*1.2),3+i*2);}
 c.restore();
}
