import {BIRD_X,FLOOR,GATE_WIDTH,FIRST,SPACING,speedOf,distanceOf,gateAt,type Flight} from './model';
import {christmas} from '../../festive/festive';
import {drawScenery} from './scenery';
import {flightSprite} from './pixel-sprites';

export interface FlightView {width:number;time:number;tilt:number;flapAge:number;scoreAge:number;reducedMotion:boolean}

// Sprites use a two-unit pixel grid and nearest-neighbour sampling.
const pixel=(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,color:string)=>{
  ctx.fillStyle=color;ctx.fillRect(Math.round(x/2)*2,Math.round(y/2)*2,Math.ceil(w/2)*2,Math.ceil(h/2)*2);
};
const hash=(n:number)=>{let h=Math.imul(n^(n>>>16),0x21f0aaad);h=Math.imul(h^(h>>>15),0x735a2d97);return ((h^(h>>>15))>>>0)/0xffffffff;};
const wrap=(n:number,size:number)=>((n%size)+size)%size;
const WINGBEAT=[3,4,3,2,1,2] as const;
const GROUND_TILE=1024;
const CAP_H=84;
interface ArtCache {
  shafts:HTMLCanvasElement[];
  capTop:HTMLCanvasElement;
  capBottom:HTMLCanvasElement;
  ground:HTMLCanvasElement;
}
const artCache=new Map<boolean,ArtCache>();

function makeSurface(w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void):HTMLCanvasElement{
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');if(ctx)draw(ctx);return canvas;
}

function buildArt(night:boolean):ArtCache{
  const outline=night?'#2b2945':'#293e3f',body=night?'#804c63':'#61755f';
  const light=night?'#b4777a':'#b09e76',shade=night?'#4f374f':'#3e554e';
  const stones=night?['#9d5d70','#925168','#ae6d7a','#854a60']:['#6f8065','#7c876b','#687961','#839071'];
  const shafts=[0,1,2,3].map(variant=>makeSurface(GATE_WIDTH,FLOOR,ctx=>{
    pixel(ctx,0,0,GATE_WIDTH,FLOOR,outline);
    pixel(ctx,4,0,GATE_WIDTH-8,FLOOR,body);
    ctx.save();ctx.beginPath();ctx.rect(4,0,GATE_WIDTH-8,FLOOR);ctx.clip();
    for(let row=0;row*14<FLOOR;row++)for(let col=-1;col<3;col++){
      const bx=4+col*28+(row%2)*14,by=row*14;
      const shadeIndex=Math.floor(hash(variant*193+row*13+col+3)*stones.length);
      pixel(ctx,bx+2,by+2,26,12,stones[shadeIndex]!);
      pixel(ctx,bx+4,by+2,22,2,light);pixel(ctx,bx+2,by+4,2,8,light);
      pixel(ctx,bx+2,by+12,26,2,shade);pixel(ctx,bx+26,by+4,2,10,shade);
      if(hash(row*31+col+variant)>.5)pixel(ctx,bx+8,by+6,4,2,body);
    }
    ctx.restore();pixel(ctx,4,0,4,FLOOR,light);pixel(ctx,GATE_WIDTH-12,0,8,FLOOR,shade);
    if(!night)for(let vy=8;vy<FLOOR-10;vy+=12){
      const vx=8+Math.round(hash(variant+Math.floor(vy/12))*8);
      pixel(ctx,vx,vy,2,10,'#3f6850');pixel(ctx,vx-2,vy+2,6,4,'#88a363');
    }
  }));
  const drawCap=(hanging:boolean)=>makeSurface(GATE_WIDTH+4,CAP_H,ctx=>{
    const cap=hanging?CAP_H-16:0;
    pixel(ctx,0,cap,GATE_WIDTH+4,16,outline);
    pixel(ctx,2,cap+2,GATE_WIDTH,10,light);
    pixel(ctx,6,cap+4,GATE_WIDTH-8,4,night?'#b4b4bf':'#b4be8e');
    pixel(ctx,4,cap+12,GATE_WIDTH-4,2,shade);
    if(night){
      pixel(ctx,2,cap+2,GATE_WIDTH,4,'#eceddf');pixel(ctx,8,cap+6,18,2,'#becfda');
      for(let k=0;k<5;k++)pixel(ctx,6+k*12,cap+4,8,4+k%2*2,'#eceddf');
      if(hanging)for(let i=0;i<5;i++)pixel(ctx,10+i*10,cap+10,2,4,'#d7e5e8');
      const wy=hanging?cap-30:cap+26;
      pixel(ctx,26,wy,16,20,outline);pixel(ctx,30,wy+4,8,12,'#ffcf86');
      pixel(ctx,32,wy+4,2,12,'#b67d79');pixel(ctx,30,wy+10,8,2,'#b67d79');
      const gy=hanging?cap-60:cap+62;
      pixel(ctx,12,gy,44,4,'#2c514b');pixel(ctx,18,gy+4,32,2,'#2c514b');
      for(let k=0;k<5;k++)pixel(ctx,14+k*8,gy+2,2,2,k%2?'#ffce81':'#df727b');
      pixel(ctx,30,gy+2,8,6,'#c94d65');pixel(ctx,32,gy+8,4,4,'#e2737e');
    }else{
      pixel(ctx,2,cap+2,GATE_WIDTH,4,'#a7bd7e');
      for(let i=0;i<5;i++)pixel(ctx,6+i*12,cap+(hanging?8:4),4,4+hash(i*7+1)*6,'#83a76d');
      const markY=hanging?cap-28:cap+26;
      pixel(ctx,30,markY,8,12,shade);pixel(ctx,32,markY+2,4,6,'#c5c68c');
    }
  });
  const ground=makeSurface(GROUND_TILE,48,ctx=>{
    const base=8;
    pixel(ctx,0,base,GROUND_TILE,40,night?'#66394f':'#283e3f');
    pixel(ctx,0,base,GROUND_TILE,4,night?'#f4ebed':'#a7a86a');
    pixel(ctx,0,base+4,GROUND_TILE,4,night?'#a5b7de':'#667b4f');
    for(let x=0;x<GROUND_TILE;x+=32){
      pixel(ctx,x,base+10,28,2,night?'#a36073':'#42605a');
      pixel(ctx,x+8,base+12,2,14,night?'#392e48':'#344f50');
      if(night){
        pixel(ctx,x+2,base+2,12,6,'#f4ebed');pixel(ctx,x+6,base+8,6,2,'#d5d9ed');
        pixel(ctx,x+18,base+24,12,2,'#a36073');pixel(ctx,x+22,base+26,2,12,'#392e48');
        pixel(ctx,x+2,base+14,4,4,'#ffd282');pixel(ctx,x+18,base+16,4,4,'#de7483');
      }else{
        pixel(ctx,x+20,base-8,2,8,'#9eac73');pixel(ctx,x+16,base-6,4,2,'#9eac73');
      }
    }
  });
  return {shafts,capTop:drawCap(true),capBottom:drawCap(false),ground};
}

function gate(ctx:CanvasRenderingContext2D,x:number,top:number,bottom:number,index:number,art:ArtCache){
  x=Math.round(x/2)*2;top=Math.round(top/2)*2;bottom=Math.round(bottom/2)*2;
  const shaft=art.shafts[((index%4)+4)%4]!;
  if(top>0){
    ctx.drawImage(shaft,0,0,GATE_WIDTH,top,x,0,GATE_WIDTH,top);
    const clipTop=Math.min(CAP_H,top);
    ctx.drawImage(art.capTop,0,CAP_H-clipTop,GATE_WIDTH+4,clipTop,x-2,top-clipTop,GATE_WIDTH+4,clipTop);
  }
  const bottomH=FLOOR-bottom;
  if(bottomH>0){
    ctx.drawImage(shaft,0,bottom,GATE_WIDTH,bottomH,x,bottom,GATE_WIDTH,bottomH);
    const clipBot=Math.min(CAP_H,bottomH);
    ctx.drawImage(art.capBottom,0,0,GATE_WIDTH+4,clipBot,x-2,bottom,GATE_WIDTH+4,clipBot);
  }
}
function bird(ctx:CanvasRenderingContext2D,y:number,view:FlightView,night:boolean,idle:boolean){
  const reduced=view.reducedMotion,bob=reduced||!idle?0:Math.sin(view.time*3)*4;
  ctx.save();ctx.translate(BIRD_X,y+bob);ctx.rotate(reduced?0:view.tilt);
  if(!reduced){const kick=Math.exp(-view.flapAge*14);ctx.scale(1+kick*.06,1-kick*.05);}
  // Each input plays one downstroke and recovery, then holds the glide pose.
  const beat=reduced?2:WINGBEAT[Math.min(5,Math.floor(view.flapAge*20))]!;
  ctx.imageSmoothingEnabled=false;ctx.drawImage(flightSprite(beat,night),-32,-32);
  ctx.restore();
}
function foreground(ctx:CanvasRenderingContext2D,width:number,distance:number,art:ArtCache){
  const offset=Math.round(wrap(distance,GROUND_TILE)/2)*2;
  for(let x=-offset;x<width;x+=GROUND_TILE)ctx.drawImage(art.ground,x,FLOOR-8);
}

/** The camera reveals more world without stretching the artwork or hitboxes. */
export function drawFlight(ctx:CanvasRenderingContext2D,s:Flight,view:FlightView){
  const night=christmas();
  let art=artCache.get(night);if(!art){art=buildArt(night);artCache.set(night,art);}
  const residual=s.phase==='running'?s.accumulator:0;
  const distance=distanceOf(s)+residual*speedOf(s);
  const camera=Math.round((BIRD_X-view.width*.24)/2)*2;
  drawScenery(ctx,view.width,distance,view.time,night,view.reducedMotion);
  ctx.save();ctx.translate(-camera,0);
  const first=Math.max(0,Math.floor((distance+camera-FIRST-GATE_WIDTH)/SPACING));
  const last=Math.ceil((distance+camera+view.width-FIRST)/SPACING);
  for(let index=first;index<=last;index++){
    const g=gateAt(s.seed,index);gate(ctx,g.distance-distance,g.top,g.bottom,index,art);
  }
  const y=s.y+s.vy*residual+450*residual*residual;
  bird(ctx,y,view,night,s.phase==='ready');
  if(!view.reducedMotion&&view.scoreAge<.5){
    ctx.fillStyle='#ffe5a3';ctx.beginPath();
    for(let i=0;i<6;i++){
      const angle=i*Math.PI/3,r=22+view.scoreAge*44;
      ctx.rect(Math.round((BIRD_X+Math.cos(angle)*r)/2)*2,Math.round((y+Math.sin(angle)*r)/2)*2,4,4);
    }
    ctx.fill();
  }
  ctx.restore();
  foreground(ctx,view.width,distance,art);
  if(!view.reducedMotion){
    ctx.fillStyle=night?'#c6d8e5':'#f5d694';ctx.beginPath();
    for(let i=0;i<Math.ceil(view.width/(night?18:42));i++){
      const x=wrap(hash(i+402)*view.width-distance*.3+Math.sin(view.time+i)*5,view.width);
      const my=night?wrap(hash(i+751)*FLOOR+view.time*(10+hash(i)*14),FLOOR):376+hash(i+90)*104+Math.sin(view.time*2+i)*6;
      ctx.rect(Math.round(x/2)*2,Math.round(my/2)*2,2,2);
    }
    ctx.fill();
  }
}
