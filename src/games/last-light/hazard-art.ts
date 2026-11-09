import type {Hazard,Rect} from './levels';
type C=CanvasRenderingContext2D;
const box=(c:C,k:string,x:number,y:number,w:number,h:number)=>{c.fillStyle=k;c.fillRect(Math.round(x),Math.round(y),w,h);};
/** Emitters share the deck's iron, brass and occlusion palette. Vapor has no
 * horizontal shelves: its moving, ragged contour reads as a jet from a grate. */
export function drawEmitter(c:C,h:Hazard,r:Rect,on:boolean,warning:boolean,stopped:boolean,time:number,reduced:boolean){
 const floor=r.y+r.h,mid=r.x+r.w/2,t=reduced?0:time;
 c.save();
 // A flanged pipe enters the deck, with fasteners and a recessed mouth.
 box(c,'#182b35',r.x-5,floor-4,r.w+10,9);box(c,'#6d7b78',r.x-4,floor-3,r.w+8,2);
 box(c,'#3e555d',r.x-3,floor-1,r.w+6,5);box(c,'#b39b75',r.x-2,floor-2,2,2);box(c,'#b39b75',r.x+r.w-1,floor-2,2,2);
 box(c,'#142933',r.x+2,floor-4,r.w-4,4);
 const lamp=stopped?'#b8dc9e':on?'#f2a878':warning?'#ffd181':'#6b8b83';
 box(c,lamp,r.x-3,floor+1,3,2);
 if(h.kind==='steam'){
  for(let x=r.x+3;x<r.x+r.w-2;x+=4)box(c,'#8e9a8a',x,floor-4,1,3);
  const period=h.period??3,cycle=((t+(h.offset??0))%period+period)%period,offAge=cycle-period*(h.duty??.55),tail=!on&&!stopped&&offAge>=0&&offAge<.32?1-offAge/.32:0;
  if(on||tail>0){
   // Scanline wisps retain the full dangerous height. Core width follows the
   // collision volume; translucent curls extend a few pixels beyond it.
   for(let y=0;y<r.h;y+=2){
    const age=y/r.h;if(!on&&age<(1-tail)*.9)continue;const end=Math.max(0,Math.min(1,(1-age)/.3)),feather=end*end*(3-2*end)*(on?1:tail);const swirl=Math.sin(y*.16-t*9)*(.5+age*3),width=r.w*(.55+age*.45);
    c.globalAlpha=(.36+Math.sin(y*.09-t*7)*.1)*feather;
    box(c,'#d4d8ca',mid-width/2+swirl,floor-y-5,Math.ceil(width),2);
    c.globalAlpha=.15*(1-age*.5)*feather;
    box(c,'#f2e6ca',mid-width/2-3+Math.sin(y*.21-t*6)*4,floor-y-5,Math.ceil(width+6),2);
   }
   for(let i=0;i<9;i++){
    const a=(t*1.4+i/9)%1,y=floor-6-a*(r.h-8),x=mid+Math.sin(a*9+i)*r.w*.3;
    if(!on&&a<(1-tail)*.9)continue;c.globalAlpha=(1-a)*.42*(on?1:tail);c.strokeStyle='#fff0cf';c.lineWidth=1;
    c.beginPath();c.moveTo(x-2,y+5);c.lineTo(x-4,y+2);c.lineTo(x-3,y-2);c.lineTo(x+1,y-4);c.stroke();
   }
  }else if(warning){
   c.globalAlpha=.45;box(c,'#ffd181',r.x+3,floor-6,r.w-6,2);
   // Small leak remains near the nozzle, never a fake platform in the air.
   c.strokeStyle='#c5caba';c.beginPath();c.moveTo(mid-2,floor-6);c.lineTo(mid-4,floor-12);c.lineTo(mid+1,floor-19);c.stroke();
  }
 }else{
  // A physical return arm carries the upper electrode. A dim rear cable
  // connects both contacts and explains the gate's extent when it is off.
  c.globalAlpha=.65;box(c,'#344c58',r.x+r.w+3,r.y-5,3,r.h+9);
  box(c,'#81958c',r.x+r.w+3,r.y-4,1,r.h+6);c.globalAlpha=1;
  box(c,'#172c36',r.x-2,r.y-6,r.w+9,6);box(c,'#8c9b8c',r.x-1,r.y-6,r.w+7,1);
  box(c,'#b19b74',r.x+3,r.y-4,r.w-6,3);box(c,'#b19b74',r.x+3,floor-5,r.w-6,3);
  if(on){
   c.globalAlpha=.15;box(c,'#f7bd8d',r.x,r.y,r.w,r.h);c.globalAlpha=1;
   c.strokeStyle='#ffd6aa';c.lineWidth=2;c.beginPath();c.moveTo(mid,r.y);
   for(let y=5;y<r.h;y+=5)c.lineTo(mid+Math.sin(y*1.7+Math.floor(t*16))*(r.w*.32),r.y+y);
   c.lineTo(mid,floor-4);c.stroke();
   box(c,'#fff1ce',mid-2,r.y,4,3);box(c,'#fff1ce',mid-2,floor-8,4,3);
  }else if(warning){box(c,'#ffd181',mid-2,r.y-2,4,3);box(c,'#ffd181',mid-2,floor-6,4,3);}
 }
 c.restore();
}

export function drawSpikes(c:C,r:Rect){
 c.fillStyle='#252936';c.fillRect(r.x-2,r.y+r.h-2,r.w+4,5);
 for(let x=r.x;x<r.x+r.w;x+=8){c.fillStyle='#d4b3a5';c.beginPath();c.moveTo(x,r.y+r.h);c.lineTo(x+4,r.y);c.lineTo(x+8,r.y+r.h);c.fill();c.fillStyle='#906f73';c.fillRect(x+4,r.y+5,2,r.h-5);}
}
