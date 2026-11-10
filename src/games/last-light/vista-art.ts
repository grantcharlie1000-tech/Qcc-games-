import {WORLDS,type Level} from './levels';
import {drawDistrictVistas} from './district-vistas';
import {drawQuarterDistance} from './quarter-place';
type C=CanvasRenderingContext2D;
const WIDTH=960,HEIGHT=432;
const cache=new Map<string,HTMLCanvasElement>();
const hash=(a:number,b:number)=>Math.abs(Math.sin(a*73.17+b*191.9)*17364.732)%1;
function px(c:C,color:string,x:number,y:number,w:number,h:number){c.fillStyle=color;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h));}
function poly(c:C,color:string,points:number[]){c.fillStyle=color;c.beginPath();for(let i=0;i<points.length;i+=2)i?c.lineTo(Math.round(points[i]),Math.round(points[i+1])):c.moveTo(Math.round(points[i]),Math.round(points[i+1]));c.closePath();c.fill();}
function arch(c:C,x:number,y:number,w:number,h:number,color:string){c.fillStyle=color;c.beginPath();c.moveTo(x,y+h);c.lineTo(x,y+w/2);c.arc(x+w/2,y+w/2,w/2,Math.PI,0);c.lineTo(x+w,y+h);c.closePath();c.fill();}
function windows(c:C,x:number,y:number,w:number,h:number,world:number,seed:number,arched=false){
 const a=WORLDS[world];for(let row=0;row<h/25;row++)for(let col=0;col<w/21-1;col++){
  const xx=x+9+col*21,yy=y+11+row*25,lit=hash(col+seed,row)>.57;
  if(arched)arch(c,xx-1,yy-3,9,13,a.sky);else px(c,a.sky,xx-1,yy-1,9,13);
  px(c,lit?a.accent+'77':a.edge+'15',xx,yy+1,6,9);px(c,a.near,xx+3,yy+1,1,9);px(c,a.edge+'35',xx-2,yy+11,11,1);
  if(lit){px(c,a.glow+'12',xx-4,yy-3,14,19);px(c,a.accent+'b0',xx,yy+1,2,7);}
 }
}
function house(c:C,x:number,y:number,w:number,h:number,world:number,seed:number){
 const a=WORLDS[world];px(c,a.far,x,y,w,h);px(c,a.near,x,y,4,h);px(c,a.sky+'77',x+w-10,y,10,h);
 const peak=y-14-(seed%3)*7;poly(c,a.near,[x-5,y,x+w*.48,peak,x+w+4,y]);poly(c,a.edge+'3a',[x-4,y,x+w*.48,peak,x+w*.48+4,peak+3,x+1,y+2]);
 px(c,a.near,x+w*.7,peak-14,8,22);px(c,a.edge+'45',x+w*.7-2,peak-14,12,2);windows(c,x,y,w,h,world,seed);
 for(let yy=y+39;yy<y+h;yy+=50){px(c,a.near,x+2,yy,w-3,3);px(c,a.edge+'24',x+2,yy,w-3,1);}
}
function bellTower(c:C,x:number,y:number,world:number){
 const a=WORLDS[world];px(c,a.far,x-23,y+34,46,300);px(c,a.near,x-28,y+18,56,22);px(c,a.edge+'55',x-28,y+18,56,2);
 for(const side of [-1,1]){px(c,a.near,x+side*23-3,y+35,6,276);px(c,a.edge+'35',x+side*23-3,y+35,1,270);}
 poly(c,a.near,[x-34,y+18,x,y-25,x+34,y+18]);poly(c,a.edge+'44',[x-34,y+18,x,y-25,x+3,y-19,x-26,y+18]);px(c,a.accent+'90',x,y-36,1,13);
 arch(c,x-13,y+38,26,36,a.sky);px(c,a.accent+'42',x-7,y+48,14,18);px(c,a.near,x-9,y+64,18,4);
 c.strokeStyle=a.edge+'65';c.lineWidth=2;c.beginPath();c.arc(x,y+106,17,0,Math.PI*2);c.stroke();c.fillStyle=a.sky;c.beginPath();c.arc(x,y+106,14,0,Math.PI*2);c.fill();
 px(c,a.accent+'88',x-1,y+95,2,12);px(c,a.accent+'88',x,y+105,10,2);windows(c,x-22,y+145,44,110,world,9,true);
}
function dome(c:C,x:number,y:number,w:number,world:number){
 const a=WORLDS[world];poly(c,a.near,[x-w/2,y+35,x-w/2+7,y+10,x-w*.3,y-13,x,y-28,x+w*.3,y-13,x+w/2-7,y+10,x+w/2,y+35]);
 for(let i=-2;i<=2;i++){const xx=x+i*w/7;px(c,a.edge+'3d',xx,y-18+Math.abs(i)*9,2,53-Math.abs(i)*9);}
 px(c,a.far,x-w/2,y+35,w,125);px(c,a.edge+'45',x-w/2-5,y+34,w+10,3);windows(c,x-w/2,y+45,w,105,world,15,true);
}
function bridge(c:C,y:number,world:number){
 const a=WORLDS[world];px(c,a.near,0,y,WIDTH,10);px(c,a.edge+'35',0,y,WIDTH,2);
 for(let x=-20;x<WIDTH;x+=114){px(c,a.far,x,y+10,34,160);px(c,a.near,x,y+10,4,160);px(c,a.edge+'24',x,y+10,1,160);
  c.strokeStyle=a.far;c.lineWidth=12;c.beginPath();c.arc(x+73,y+61,42,Math.PI,0);c.stroke();c.strokeStyle=a.edge+'20';c.lineWidth=1;c.stroke();}
}
function bake(world:number,layer:number,cavern:boolean){
 const key=`${world}/${layer}/${cavern}`,old=cache.get(key);if(old)return old;
 const canvas=document.createElement('canvas');canvas.width=WIDTH;canvas.height=HEIGHT;const c=canvas.getContext('2d',{willReadFrequently:true})!,a=WORLDS[world];c.imageSmoothingEnabled=false;
 if(cavern){
  for(let i=0;i<8;i++){const x=i*145-40,tip=45+hash(i,world)*150;poly(c,a.far,[x-50,0,x+118,0,x+91,tip-37,x+61,tip+12,x+39,tip-18,x+14,tip+31]);poly(c,a.edge+'18',[x+39,0,x+41,tip-20,x+54,tip+2,x+49,0]);}
  for(let i=0;i<6;i++){const x=i*194-30,y=175+hash(i,12)*80;poly(c,a.far,[x-67,HEIGHT,x-33,y+35,x-8,y-24,x+17,y-78,x+43,y+11,x+81,HEIGHT]);poly(c,a.near,[x+17,y-78,x+11,y+44,x+40,HEIGHT,x+81,HEIGHT,x+43,y+11]);}
  for(let i=0;i<10;i++){const x=30+i*97,y=255+hash(i,world)*95;px(c,a.accent+'1d',x-8,y-3,16,4);px(c,a.glow+'37',x-3,y-5,6,3);px(c,a.glow+'18',x-12,y+2,25,1);}
  bridge(c,348,world);
 }else if(world!==2){
  for(let i=-1;i<11;i++)house(c,i*104+7,220+hash(i,layer)*75,84+(i%3)*4,220,world,i+layer*7);
  bellTower(c,layer?190:680,130,world);dome(c,layer?670:330,186,115,world);bridge(c,339,world);
  for(let i=0;i<4;i++){const x=80+i*240;px(c,a.near,x,212,2,38);px(c,a.accent+'66',x-4,249,10,5);}
 }else if(world===2){
  for(let i=-1;i<8;i++){const x=i*145+10,y=228+hash(i,layer)*48;px(c,a.far,x,y,132,220);poly(c,a.near,[x,y,x+22,y-24,x+42,y,x+65,y-24,x+86,y,x+109,y-24,x+132,y]);windows(c,x,y,126,160,world,i+8);
   const height=85+hash(i,world)*65;px(c,a.far,x+15,y-height,23,height);px(c,a.near,x+16,y-height,5,height);for(let j=0;j<5;j++)px(c,a.edge+'35',x+13,y-height+j*25,27,3);}
  const x=layer?590:270;px(c,a.near,x-5,96,10,290);px(c,a.edge+'35',x-5,96,2,290);px(c,a.near,x-115,95,256,8);
  for(let i=0;i<8;i++){const xx=x-109+i*30;poly(c,a.edge+'29',[xx,96,xx+15,75,xx+30,96]);}px(c,a.near,x+96,102,2,83);px(c,a.accent+'55',x+91,184,12,10);
  for(let i=0;i<4;i++){const xx=55+i*252;px(c,a.far,xx,302,64,72);arch(c,xx+12,309,40,49,a.sky);arch(c,xx+15,312,34,44,a.glow+'38');px(c,a.accent+'48',xx+19,339,26,2);}
 }
 cache.set(key,canvas);if(cache.size>10)cache.delete(cache.keys().next().value!);return canvas;
}
/** Cached native-resolution vistas use different silhouettes, light and scale
 * on two parallax planes. There is no per-frame pixel processing or blur. */
export function drawVistas(c:C,l:Level,w:number,h:number,cx:number,cy:number,time=0){
 if(l.world===0){drawQuarterDistance(c,l,w,h,cx,cy);return;}
 if(drawDistrictVistas(c,l,w,h,cx,cy,time))return;
 const cavern=l.setting==='cavern';
 for(let layer=0;layer<2;layer++){
  const art=bake(l.world,layer,cavern),factor=layer?.25:.1,shift=Math.floor(cx*factor),y=Math.round(h*(layer?.82:.68)-HEIGHT+42-cy*(layer?.15:.07)),first=Math.floor(shift/WIDTH);
  c.save();c.globalAlpha=layer?.64:.42;
  for(let i=first;i*WIDTH-shift<w;i++)c.drawImage(art,i*WIDTH-shift,y);
  c.restore();
 }
}
