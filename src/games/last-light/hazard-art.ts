import type {Hazard,Rect} from './levels';
type C=CanvasRenderingContext2D;
const box=(c:C,k:string,x:number,y:number,w:number,h:number)=>{c.fillStyle=k;c.fillRect(Math.round(x),Math.round(y),w,h);};
/** Emitters share the deck's iron, brass and occlusion palette. Vapor has no
 * horizontal shelves: its moving, ragged contour reads as a jet from a grate. */
export function drawEmitter(c:C,h:Hazard,r:Rect,on:boolean,warning:boolean,stopped:boolean,time:number,reduced:boolean,fade=0){
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
  // While winding down, r is the shrinking collision volume, so the plume
  // visibly sinks to the grate and thins before the vent shuts off.
  const strength=1-fade*.45;
  if(on&&r.h>1){
   // Scanline wisps retain the full dangerous height. Core width follows the
   // collision volume; translucent curls extend a few pixels beyond it.
   for(let y=0;y<r.h;y+=2){
    const age=y/r.h;const end=Math.max(0,Math.min(1,(1-age)/.3)),feather=end*end*(3-2*end)*strength;const swirl=Math.sin(y*.16-t*9)*(.5+age*3),width=r.w*(.55+age*.45);
    c.globalAlpha=(.36+Math.sin(y*.09-t*7)*.1)*feather;
    box(c,'#d4d8ca',mid-width/2+swirl,floor-y-5,Math.ceil(width),2);
    c.globalAlpha=.15*(1-age*.5)*feather;
    box(c,'#f2e6ca',mid-width/2-3+Math.sin(y*.21-t*6)*4,floor-y-5,Math.ceil(width+6),2);
   }
   for(let i=0;i<9;i++){
    const a=(t*1.4+i/9)%1,y=floor-6-a*(r.h-8),x=mid+Math.sin(a*9+i)*r.w*.3;
    c.globalAlpha=(1-a)*.42*strength;c.strokeStyle='#fff0cf';c.lineWidth=1;
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
   // Near the end of a burst the beam stutters, dropping out more often as
   // shut-off approaches. Reduced motion dims it steadily instead.
   const beam=fade<=0?1:reduced?1-fade*.6:((time*(11+fade*9)+h.x*.013)%1)<fade*.75?.18:1-fade*.25;
   c.globalAlpha=.15*beam;box(c,'#f7bd8d',r.x,r.y,r.w,r.h);c.globalAlpha=beam;
   c.strokeStyle='#ffd6aa';c.lineWidth=2;c.beginPath();c.moveTo(mid,r.y);
   for(let y=5;y<r.h;y+=5)c.lineTo(mid+Math.sin(y*1.7+Math.floor(t*16))*(r.w*.32),r.y+y);
   c.lineTo(mid,floor-4);c.stroke();
   box(c,'#fff1ce',mid-2,r.y,4,3);box(c,'#fff1ce',mid-2,floor-8,4,3);c.globalAlpha=1;
  }else if(warning){box(c,'#ffd181',mid-2,r.y-2,4,3);box(c,'#ffd181',mid-2,floor-6,4,3);}
 }
 c.restore();
}

/** A set can say what a row of teeth is where it stands: on the canal it is
 * a sheared mooring bolt or torn-up planking, painted to the same box. Keyed
 * by the hazard's own rectangle, so a level that registers nothing keeps the
 * plain teeth. */
const forms=new Map<string,(c:C,r:Rect)=>void>();
const formOf=(r:Rect)=>`${r.x},${r.y},${r.w},${r.h}`;
export function formSpikes(r:Rect,draw:(c:C,r:Rect)=>void){forms.set(formOf(r),draw);}
export function drawSpikes(c:C,r:Rect){
 const form=forms.get(formOf(r));if(form){form(c,r);return;}
 c.fillStyle='#252936';c.fillRect(r.x-2,r.y+r.h-2,r.w+4,5);
 for(let x=r.x;x<r.x+r.w;x+=8){c.fillStyle='#d4b3a5';c.beginPath();c.moveTo(x,r.y+r.h);c.lineTo(x+4,r.y);c.lineTo(x+8,r.y+r.h);c.fill();c.fillStyle='#906f73';c.fillRect(x+4,r.y+5,2,r.h-5);}
}
/** Bell Lane's teeth: a run of iron cresting leaded into the gutter of the roof
 * it stands on. Its standards are spiked, its rails are bolted to the gutter at
 * both ends, and its points fill the hazard's whole box, so what hurts is what
 * is drawn. The points catch the moon, so the run reads against slate and sky.
 * Each run is wrought its own way, from where it stands. */
export function drawCresting(c:C,r:Rect,seed:number){
 const x0=Math.round(r.x),top=Math.round(r.y),foot=Math.round(r.y+r.h),w=Math.round(r.w);
 const INK='#0b0f13',IRON='#2a333a',LIT='#8c989d',TIP='#e4e0d4',EDGE='#b7c0c3',style=Math.floor(Math.abs(Math.sin(seed*12.9898)*43758.5453)%1*3);
 // Lugs leaded into the gutter at each end.
 for(const lx of [x0-1,x0+w-2]){box(c,INK,lx,foot-2,3,4);box(c,LIT,lx,foot-2,1,2);}
 // The bottom rail and a lighter top rail, the standards run through both.
 box(c,INK,x0-1,foot-4,w+2,3);box(c,IRON,x0-1,foot-3,w+2,1);box(c,LIT,x0-1,foot-4,w+2,1);
 box(c,INK,x0,top+5,w,2);box(c,LIT,x0,top+5,w,1);
 const n=Math.max(3,Math.round(w/6)),step=(w-2)/(n-1);
 for(let i=0;i<n;i++){
  const x=Math.round(x0+i*step);
  box(c,INK,x-1,top+3,4,foot-4-top-3);box(c,IRON,x,top+3,2,foot-4-top-3);box(c,LIT,x,top+3,1,foot-4-top-3);
  if(style===0){
   // Spear heads.
   box(c,TIP,x,top,2,1);box(c,EDGE,x-1,top+1,4,1);box(c,INK,x-1,top+2,4,1);box(c,LIT,x,top+2,1,1);
  }else if(style===1){
   // Fleurs: a point and two curled leaves.
   box(c,TIP,x,top,2,2);box(c,INK,x-2,top+2,6,1);box(c,EDGE,x-2,top+1,1,1);box(c,EDGE,x+3,top+1,1,1);box(c,INK,x-2,top+3,1,1);box(c,INK,x+3,top+3,1,1);
  }else{
   // Barbed spikes, the end standards ringed.
   box(c,TIP,x,top,2,1);box(c,EDGE,x,top+1,2,1);box(c,INK,x-1,top+2,1,2);box(c,INK,x+2,top+2,1,2);box(c,EDGE,x-1,top+2,1,1);box(c,EDGE,x+2,top+2,1,1);
  }
 }
 // A scroll in each bay, between the rails.
 for(let i=0;i<n-1;i++){const x=Math.round(x0+i*step+step/2)+1;box(c,INK,x-1,foot-6,3,1);box(c,LIT,x-1,foot-7,1,1);box(c,LIT,x+1,foot-7,1,1);}
}
