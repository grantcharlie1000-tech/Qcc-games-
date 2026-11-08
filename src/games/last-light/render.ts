import {LEVELS,WORLDS,type Platform} from './levels';
import {platformAt,hazardAt,laserActive,type Events,type Run} from './model';
import {Courier} from './courier';
const hash=(x:number,y:number)=>Math.abs(Math.sin(x*127.1+y*311.7)*43758.5453)%1;
export class Scene {
 private ctx:CanvasRenderingContext2D;
 private readonly courier=new Courier();
 step(s:Run,events:Events,dt:number){this.courier.tick(s,events,dt);}
 width=640;height=480;cameraX=0;cameraY=0;
 constructor(readonly canvas:HTMLCanvasElement){const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw Error('Canvas 2D is unavailable.');this.ctx=ctx;}
 resize(width:number,height:number){
  const scale=height>width?Math.max(1,width/390):Math.max(1,Math.min(height/480,width/640,2.5));
  this.width=Math.max(200,Math.floor(width/scale));this.height=Math.max(240,Math.floor(height/scale));
  this.canvas.width=this.width;this.canvas.height=this.height;this.ctx.imageSmoothingEnabled=false;
 }
 draw(s:Run,reduced:boolean){
  const c=this.ctx,l=LEVELS[s.stage],theme=WORLDS[l.world],w=this.width,h=this.height;
  this.cameraX=Math.max(0,Math.min(l.width-w,s.x-w*.33));
  this.cameraY=Math.max(-Math.max(90,h-440),Math.min(Math.max(0,l.height-h),s.y-h*.6));
  const cx=Math.floor(this.cameraX),cy=Math.floor(this.cameraY),t=reduced?0:s.clock;
  c.fillStyle=theme.sky;c.fillRect(0,0,w,h);
  // Low-resolution sky: pinprick stars, a pale moon, and layered city silhouettes.
  for(let i=0;i<65;i++){const x=Math.floor(hash(i,12)*w),y=Math.floor(hash(i,3)*h*.65);c.fillStyle=i%4?'#ffffff32':theme.accent;c.fillRect(x,y,i%4?1:2,1);}
  const moonX=w*.78-cx*.015,moonY=h*.2;
  c.fillStyle=theme.accent+'0c';c.fillRect(moonX-30,moonY-30,60,60);c.fillStyle=theme.accent+'1b';c.fillRect(moonX-22,moonY-22,44,44);c.fillStyle=theme.accent;c.fillRect(moonX-13,moonY-16,26,32);c.fillRect(moonX-17,moonY-11,34,22);c.fillStyle=theme.sky;c.fillRect(moonX-7,moonY-17,24,25);
  for(let layer=0;layer<3;layer++){
   const factor=[.10,.23,.4][layer],bw=[83,68,100][layer],base=h*.68+layer*48-cy*.15;
   for(let i=Math.floor(cx*factor/bw)-1;i<Math.ceil((cx*factor+w)/bw)+1;i++){
    const x=Math.floor(i*bw-cx*factor),bh=50+Math.floor(hash(i,layer+4)*140),y=Math.floor(base-bh);
    c.fillStyle=[theme.far,theme.near,theme.far][layer];c.fillRect(x,y,bw-8,h-y);
    c.fillRect(x-4,y+5,bw,5);c.fillRect(x+bw/2-3,y-15,5,18);
    for(let row=0;row<bh/20;row++)for(let col=0;col<3;col++)if(hash(i*4+col,row+layer)>.48){c.fillStyle=hash(i+col,row)>.8?theme.glow+'88':theme.accent+'20';c.fillRect(x+12+col*18,y+15+row*20,5,8);}
    if(layer===1){c.fillStyle=theme.sky;c.fillRect(x+8,y+bh-2,6,16);}
   }
  }
  c.fillStyle=theme.sky+'99';c.fillRect(0,h*.79,w,h*.21);
  c.save();c.translate(-cx,-cy);
  for(const p of l.platforms){const r=platformAt(p,s.clock);if(r.x+r.w<cx-30||r.x>cx+w+30)continue;this.platform(p,r.x,r.y,s,theme);}
  // The flag is also an unambiguous safe landing marker.
  const cp=l.checkpoint;c.fillStyle='#d5cbb6';c.fillRect(cp.x,cp.y-48,3,48);c.fillStyle=s.checkpoint?'#c6e0a2':'#8b929a';c.fillRect(cp.x+3,cp.y-47,22,12);c.fillRect(cp.x+3,cp.y-35,15,4);c.fillStyle=theme.sky;c.fillRect(cp.x+9,cp.y-44,3,6);
  for(const hazard of l.hazards){
   const r=hazardAt(hazard,s.clock);if(r.x<cx-50||r.x>cx+w+50)continue;
   if(hazard.kind==='spikes'){
    c.fillStyle='#282a34';c.fillRect(r.x-2,r.y+r.h-2,r.w+4,5);
    for(let x=r.x;x<r.x+r.w;x+=8){c.fillStyle='#d4b3a5';c.beginPath();c.moveTo(x,r.y+r.h);c.lineTo(x+4,r.y);c.lineTo(x+8,r.y+r.h);c.fill();c.fillStyle='#906f73';c.fillRect(x+4,r.y+5,2,r.h-5);}
   }else if(hazard.kind==='saw'){
    c.strokeStyle='#8c7780';c.lineWidth=2;c.beginPath();c.moveTo(hazard.x-26,r.y+10);c.lineTo(hazard.x+48,r.y+10);c.stroke();
    c.save();c.translate(r.x+10,r.y+10);c.rotate(t*3);c.fillStyle='#c7bdba';for(let i=0;i<8;i++){c.rotate(Math.PI/4);c.fillRect(-3,-13,6,8);}c.fillRect(-8,-8,16,16);c.fillStyle='#664f59';c.fillRect(-4,-4,8,8);c.restore();
   }else{
    const on=laserActive(hazard,s.clock);c.fillStyle='#695366';c.fillRect(r.x-6,r.y-4,18,7);c.fillRect(r.x-6,r.y+r.h-3,18,7);
    c.fillStyle=on?'#ed927c55':'#d3e3ae22';c.fillRect(r.x-3,r.y,r.w+6,r.h);c.fillStyle=on?'#ffe1a6':'#b3b99c44';c.fillRect(r.x+2,r.y,2,r.h);
   }
  }
  if(l.gate&&!s.key){const g=l.gate;c.fillStyle='#30333e';c.fillRect(g.x-4,g.y-4,20,g.h+4);c.fillStyle=theme.accent;for(let y=g.y;y<g.y+g.h;y+=10)c.fillRect(g.x,y,12,4);c.fillStyle='#3c3439';c.fillRect(g.x+1,g.y+27,10,13);c.fillStyle=theme.accent;c.fillRect(g.x+5,g.y+30,2,5);}
  for(const p of l.pickups){if(s.collected.includes(p.id))continue;const y=p.y+Math.round(Math.sin(t*3+p.id)*2);
   c.fillStyle=(p.kind==='dash'?'#a9d9ef':theme.accent)+'12';c.fillRect(p.x-14,y-14,28,28);
   if(p.kind==='key'){c.fillStyle='#f3d487';c.fillRect(p.x-7,y-6,8,8);c.fillRect(p.x-5,y-4,4,4);c.fillStyle=theme.sky;c.fillRect(p.x-5,y-4,4,4);c.fillStyle='#f3d487';c.fillRect(p.x,y-3,11,3);c.fillRect(p.x+7,y,3,4);}
   else{c.fillStyle=p.kind==='dash'?'#9ed6ee':theme.accent;c.beginPath();c.moveTo(p.x,y-9);c.lineTo(p.x+6,y);c.lineTo(p.x,y+9);c.lineTo(p.x-6,y);c.fill();c.fillStyle='#fff4d1';c.fillRect(p.x-1,y-4,2,5);}
  }
  const e=l.exit;
  c.fillStyle='#282934';c.fillRect(e.x-7,e.y+e.h-6,48,12);c.fillStyle=theme.stone;c.fillRect(e.x+9,e.y+20,14,32);c.fillStyle=theme.edge;c.fillRect(e.x+6,e.y+19,20,5);
  const lit=!l.gate||s.key;c.fillStyle=lit?theme.glow+'13':'#89929a12';c.fillRect(e.x-15,e.y-12,64,64);c.fillStyle=lit?theme.glow+'26':'#89929a22';c.fillRect(e.x-5,e.y-3,44,44);c.fillStyle=lit?theme.accent:'#8b929a';c.fillRect(e.x+6,e.y+4,20,16);c.fillRect(e.x+11,e.y,10,24);c.fillStyle=lit?'#fff1c8':'#b2b9bb';c.fillRect(e.x+13,e.y+5,6,12);
  this.courier.draw(c,s,theme.accent,reduced);
  // Falling snow / embers are decorative, so reduced motion freezes them.
  for(let i=0;i<24;i++){const x=cx+(hash(i,7)*w+t*(l.world===3?8:-4))%w,y=cy+(hash(i,9)*h+t*(l.world===3?13:-7))%h;c.fillStyle=l.world===3?'#e0f0f070':theme.glow+'40';c.fillRect(Math.floor(x),Math.floor(y),1,i%3?1:2);}
  c.restore();
  // Subtle static vignette. No flashing, shaking or visual movement on UI.
  c.fillStyle='#0b11131c';c.fillRect(0,h-10,w,10);
 }
 private platform(p:Platform,x:number,y:number,s:Run,theme:typeof WORLDS[number]){
  const c=this.ctx,timer=s.crumbles[p.id];if(timer!==undefined&&timer<=0){c.fillStyle=theme.edge+'35';for(let i=0;i<p.w;i+=16)c.fillRect(x+i,y+12,7,2);return;}
  x=Math.round(x);y=Math.round(y);c.fillStyle='#101923';c.fillRect(x-2,y+3,p.w+4,p.h+3);c.fillStyle=theme.stone;c.fillRect(x,y,p.w,p.h);
  // Offset brick joints, chips and masonry highlights use a stable coordinate hash.
  for(let row=0;row<p.h/12;row++)for(let col=-1;col<p.w/24;col++){
   const xx=x+col*24+(row%2?12:0),yy=y+row*12;
   if(xx<x||xx+20>x+p.w)continue;c.fillStyle=hash(col+p.id,row)>.5?'#10172126':'#fff2d30e';c.fillRect(xx,yy+3,21,8);c.fillStyle='#14172555';c.fillRect(xx+21,yy+2,2,10);c.fillRect(xx,yy+11,24,1);
  }
  c.fillStyle=p.kind==='ice'?'#bddce4':p.kind==='belt'?'#b88b68':theme.edge;c.fillRect(x,y,p.w,3);c.fillStyle='#ffffff1a';c.fillRect(x,y+3,p.w,2);
  if(p.kind==='crumble'){
   c.strokeStyle=timer!==undefined?'#f0c77c':'#272834';c.lineWidth=2;for(let i=18;i<p.w;i+=30){c.beginPath();c.moveTo(x+i,y+2);c.lineTo(x+i-5,y+10);c.lineTo(x+i+3,y+16);c.lineTo(x+i-2,y+24);c.stroke();}
  }else if(p.kind==='spring'){c.fillStyle='#a4c7ad';c.fillRect(x+p.w/2-16,y-4,32,5);c.fillStyle='#3f5752';for(let i=0;i<3;i++)c.fillRect(x+p.w/2-10+i*7,y+5,3,12);}
  else if(p.kind==='belt'){c.fillStyle='#3b343b';for(let i=4;i<p.w;i+=16){const xx=x+i;const d=p.direction??1;c.beginPath();c.moveTo(xx+(d>0?0:7),y+7);c.lineTo(xx+(d>0?7:0),y+11);c.lineTo(xx+(d>0?0:7),y+15);c.strokeStyle='#dfbc91';c.stroke();}}
  else if(p.kind==='ice'){c.fillStyle='#e3f6f0';for(let i=8;i<p.w;i+=24)c.fillRect(x+i,y+5,10,1);}
  else if(p.kind==='moving'){c.fillStyle='#b2c6bd';c.fillRect(x+4,y+7,4,4);c.fillRect(x+p.w-8,y+7,4,4);}
  if(p.kind==='stone')for(let i=8;i<p.w;i+=19){const n=hash(i,p.id);if(n>.42){c.fillStyle=theme.flora;c.fillRect(x+i,y-2,6,3);c.fillRect(x+i+2,y-5,2,4);c.fillStyle=theme.flora+'66';c.fillRect(x+i+4,y+4,2,5);}}
  if(p.id%3===0){const lx=x+12;c.fillStyle='#272c36';c.fillRect(lx,y-25,3,25);c.fillStyle=theme.glow+'14';c.fillRect(lx-13,y-34,30,30);c.fillStyle=theme.accent;c.fillRect(lx-3,y-25,9,10);c.fillStyle='#fff1c8';c.fillRect(lx,y-23,3,6);c.fillStyle='#272c36';c.fillRect(lx-4,y-28,11,3);}
 }
}
