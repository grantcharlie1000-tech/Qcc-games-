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

function gate(ctx:CanvasRenderingContext2D,x:number,top:number,bottom:number,index:number,night:boolean){
  x=Math.round(x/2)*2;top=Math.round(top/2)*2;bottom=Math.round(bottom/2)*2;
  const outline=night?'#2b2945':'#293e3f',body=night?'#804c63':'#61755f';
  const light=night?'#b4777a':'#b09e76',shade=night?'#4f374f':'#3e554e';
  const stones=night?['#9d5d70','#925168','#ae6d7a','#854a60']:['#6f8065','#7c876b','#687961','#839071'];
  for(const [y,h,cap,hanging] of [[0,top,top-16,true],[bottom,FLOOR-bottom,bottom,false]] as const){
    pixel(ctx,x,y,GATE_WIDTH,h,outline);
    pixel(ctx,x+4,y,GATE_WIDTH-8,h,body);
    ctx.save();ctx.beginPath();ctx.rect(x+4,y,GATE_WIDTH-8,h);ctx.clip();
    for(let row=Math.floor(y/14);row*14<y+h;row++)for(let col=-1;col<3;col++){
      const bx=x+4+col*28+(row%2)*14,by=row*14;
      const shadeIndex=Math.floor(hash(index*193+row*13+col+3)*stones.length);
      pixel(ctx,bx+2,by+2,26,12,stones[shadeIndex]!);
      pixel(ctx,bx+4,by+2,22,2,light);pixel(ctx,bx+2,by+4,2,8,light);
      pixel(ctx,bx+2,by+12,26,2,shade);pixel(ctx,bx+26,by+4,2,10,shade);
      if(hash(row*31+col+index)>.5)pixel(ctx,bx+8,by+6,4,2,body);
    }
    ctx.restore();pixel(ctx,x+4,y,4,h,light);pixel(ctx,x+GATE_WIDTH-12,y,8,h,shade);
    if(!night)for(let vy=y+8;vy<y+h-10;vy+=12){
      const vx=x+8+Math.round(hash(index+Math.floor(vy/12))*8);
      pixel(ctx,vx,vy,2,10,'#3f6850');pixel(ctx,vx-2,vy+2,6,4,'#88a363');
    }
    pixel(ctx,x-2,cap,GATE_WIDTH+4,16,outline);
    pixel(ctx,x,cap+2,GATE_WIDTH,10,light);
    pixel(ctx,x+4,cap+4,GATE_WIDTH-8,4,night?'#b4b4bf':'#b4be8e');
    pixel(ctx,x+2,cap+12,GATE_WIDTH-4,2,shade);
    if(night){
      pixel(ctx,x,cap+2,GATE_WIDTH,4,'#eceddf');pixel(ctx,x+6,cap+6,18,2,'#becfda');
      for(let k=0;k<5;k++)pixel(ctx,x+4+k*12,cap+4,8,4+k%2*2,'#eceddf');
      if(hanging)for(let i=0;i<5;i++)pixel(ctx,x+8+i*10,cap+10,2,4,'#d7e5e8');
      // A warm window inset, entirely inside the collision geometry.
      const wy=hanging?cap-30:cap+26;
      pixel(ctx,x+24,wy,16,20,outline);pixel(ctx,x+28,wy+4,8,12,'#ffcf86');
      pixel(ctx,x+30,wy+4,2,12,'#b67d79');pixel(ctx,x+28,wy+10,8,2,'#b67d79');
      // Garland and red ribbon remain inside the gate silhouette.
      const gy=hanging?cap-60:cap+62;
      pixel(ctx,x+10,gy,44,4,'#2c514b');pixel(ctx,x+16,gy+4,32,2,'#2c514b');
      for(let k=0;k<5;k++)pixel(ctx,x+12+k*8,gy+2,2,2,k%2?'#ffce81':'#df727b');
      pixel(ctx,x+28,gy+2,8,6,'#c94d65');pixel(ctx,x+30,gy+8,4,4,'#e2737e');
    }else{
      pixel(ctx,x,cap+2,GATE_WIDTH,4,'#a7bd7e');
      for(let i=0;i<5;i++)pixel(ctx,x+4+i*12,cap+(hanging?8:4),4,4+hash(index*7+i)*6,'#83a76d');
      const markY=hanging?cap-28:cap+26;
      pixel(ctx,x+28,markY,8,12,shade);pixel(ctx,x+30,markY+2,4,6,'#c5c68c');
    }
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
function foreground(ctx:CanvasRenderingContext2D,width:number,distance:number,night:boolean){
  pixel(ctx,0,FLOOR,width,40,night?'#66394f':'#283e3f');
  pixel(ctx,0,FLOOR,width,4,night?'#f4ebed':'#a7a86a');
  pixel(ctx,0,FLOOR+4,width,4,night?'#a5b7de':'#667b4f');
  for(let x=-wrap(distance,32);x<width;x+=32){
    pixel(ctx,x,FLOOR+10,28,2,night?'#a36073':'#42605a');
    pixel(ctx,x+8,FLOOR+12,2,14,night?'#392e48':'#344f50');
    if(night){
      pixel(ctx,x+2,FLOOR+2,12,6,'#f4ebed');pixel(ctx,x+6,FLOOR+8,6,2,'#d5d9ed');
      pixel(ctx,x+18,FLOOR+24,12,2,'#a36073');pixel(ctx,x+22,FLOOR+26,2,12,'#392e48');
      pixel(ctx,x+2,FLOOR+14,4,4,'#ffd282');pixel(ctx,x+18,FLOOR+16,4,4,'#de7483');
    }
    else{pixel(ctx,x+20,FLOOR-8,2,8,'#9eac73');pixel(ctx,x+16,FLOOR-6,4,2,'#9eac73');}
  }
}

/** The camera reveals more world without stretching the artwork or hitboxes. */
export function drawFlight(ctx:CanvasRenderingContext2D,s:Flight,view:FlightView){
  const night=christmas();
  const residual=s.phase==='running'?s.accumulator:0;
  const distance=distanceOf(s)+residual*speedOf(s);
  const camera=Math.round((BIRD_X-view.width*.24)/2)*2;
  drawScenery(ctx,view.width,distance,view.time,night,view.reducedMotion);
  ctx.save();ctx.translate(-camera,0);
  const first=Math.max(0,Math.floor((distance+camera-FIRST-GATE_WIDTH)/SPACING));
  const last=Math.ceil((distance+camera+view.width-FIRST)/SPACING);
  for(let index=first;index<=last;index++){
    const g=gateAt(s.seed,index);gate(ctx,g.distance-distance,g.top,g.bottom,index,night);
  }
  const y=s.y+s.vy*residual+450*residual*residual;
  bird(ctx,y,view,night,s.phase==='ready');
  if(!view.reducedMotion&&view.scoreAge<.5)for(let i=0;i<6;i++){
    const angle=i*Math.PI/3,r=22+view.scoreAge*44;
    pixel(ctx,BIRD_X+Math.cos(angle)*r,y+Math.sin(angle)*r,4,4,'#ffe5a3');
  }
  ctx.restore();
  foreground(ctx,view.width,distance,night);
  if(!view.reducedMotion){
    for(let i=0;i<Math.ceil(view.width/(night?18:42));i++){
      const x=wrap(hash(i+402)*view.width-distance*.3+Math.sin(view.time+i)*5,view.width);
      const y=night?wrap(hash(i+751)*FLOOR+view.time*(10+hash(i)*14),FLOOR):376+hash(i+90)*104+Math.sin(view.time*2+i)*6;
      pixel(ctx,x,y,2,2,night?'#c6d8e5':'#f5d694');
    }
  }
}
