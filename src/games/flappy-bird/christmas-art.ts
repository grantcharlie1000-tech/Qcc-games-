import {WIDTH,HEIGHT,FLOOR,BIRD_X,GATE_WIDTH,visibleGates,distanceOf,type Flight} from './model';
import {XMAS,drawSantaHat,drawSnowCap,drawSnowflake,hash} from '../../festive/art';

/**
 * Christmas artwork for the same flight: a winter afternoon sky, snowy dunes,
 * a snow-covered roof for the ground strip and brick chimneys for the gates.
 * Every chimney body fills exactly the gate rectangle the model collides with
 * and every crown sits exactly where the original reed cap sat; snow and frost
 * stay inside those crown rectangles. The bird keeps its shape and gets a hat.
 * Motion is the original's: clouds and dunes drift by the same amounts and are
 * still under reduced motion.
 */
let bricks:CanvasPattern|null|undefined;
/** A 2x brick tile (32x20 logical px), built once and reused every frame. */
function brickPattern(ctx:CanvasRenderingContext2D):CanvasPattern|null{
  if(bricks!==undefined)return bricks;
  const tile=document.createElement('canvas');tile.width=64;tile.height=40;
  const t=tile.getContext('2d');
  if(!t)return bricks=null;
  t.scale(2,2);t.fillStyle=XMAS.mortar;t.fillRect(0,0,32,20);
  const shades=[XMAS.brick,'#a9432f','#8f3426','#a03d2b'];
  for(let row=0;row<2;row++)for(let col=-1;col<2;col++){
    const x=col*16+(row?8:0),y=row*10;
    t.fillStyle=shades[(row*3+col+4)%shades.length]!;t.fillRect(x+1,y+1,14,8);
    t.fillStyle='rgba(255,220,200,.18)';t.fillRect(x+1,y+1,14,1.5);
  }
  return bricks=ctx.createPattern(tile,'repeat');
}

const DUNES=[['#b6cfe6',385,28],['#d6e5f3',425,21],['#f3f8fd',470,16]] as const;

export function drawChristmasFlight(ctx:CanvasRenderingContext2D,s:Flight,reducedMotion:boolean){
  ctx.clearRect(0,0,WIDTH,HEIGHT);
  const sky=ctx.createLinearGradient(0,0,0,FLOOR);
  sky.addColorStop(0,'#7fb0dc');sky.addColorStop(.62,'#cfe2f3');sky.addColorStop(1,'#eef4fa');
  ctx.fillStyle=sky;ctx.fillRect(0,0,WIDTH,HEIGHT);
  // Low winter sun where the original sun sat.
  ctx.fillStyle='rgba(255,247,226,.3)';ctx.beginPath();ctx.arc(284,96,53,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#fff6df';ctx.beginPath();ctx.arc(284,96,46,0,Math.PI*2);ctx.fill();
  const drift=reducedMotion?0:distanceOf(s)*.14;
  ctx.fillStyle='#f7faff';
  for(let i=-1;i<4;i++){const x=((i*170-drift)%680+680)%680-170,y=72+(i%2)*65;ctx.beginPath();ctx.ellipse(x,y,42,11,0,0,Math.PI*2);ctx.ellipse(x-13,y-8,22,15,0,0,Math.PI*2);ctx.fill();}
  // A few still snowflakes riding with the clouds (no falling snow).
  for(let i=0;i<12;i++){
    const x=((hash(i*7+1)*680-drift*.8)%680+680)%680-160,y=30+hash(i*7+2)*300;
    drawSnowflake(ctx,x,y,3+hash(i*7+3)*3,'#ffffff',.75);
  }
  const wave=reducedMotion?0:distanceOf(s)*.001;
  DUNES.forEach(([color,base,amp],band)=>{
    const crest=(x:number)=>base+amp*Math.sin(x*.015+wave);
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,HEIGHT);
    for(let x=0;x<=WIDTH;x+=4)ctx.lineTo(x,crest(x));
    ctx.lineTo(WIDTH,HEIGHT);ctx.closePath();ctx.fill();
    // Snowy edge line so the white dunes stay distinct from each other.
    ctx.strokeStyle=band===2?'#c9dbee':'#ffffffb0';ctx.lineWidth=2;ctx.beginPath();
    for(let x=0;x<=WIDTH;x+=4){const y=crest(x)+1;if(x)ctx.lineTo(x,y);else ctx.moveTo(x,y);}
    ctx.stroke();
    if(band<2){
      // Snow-dusted firs standing on the far and middle dunes.
      const shade=band?XMAS.greenDeep:'#5f8fb3';
      for(let i=0;i<7;i++){
        const x=18+i*52+hash(band*19+i)*26,y=crest(x)+3,h=(band?22:15)+hash(band*31+i)*10;
        ctx.fillStyle=shade;ctx.beginPath();ctx.moveTo(x,y-h);ctx.lineTo(x+h*.38,y);ctx.lineTo(x-h*.38,y);ctx.closePath();ctx.fill();
        ctx.fillStyle='#ffffffd0';ctx.beginPath();ctx.moveTo(x,y-h);ctx.lineTo(x+h*.16,y-h*.58);ctx.lineTo(x,y-h*.66);ctx.lineTo(x-h*.16,y-h*.58);ctx.closePath();ctx.fill();
      }
    }
  });
  const pattern=brickPattern(ctx);
  for(const gate of visibleGates(s)){
    if(gate.x>WIDTH+10||gate.x+GATE_WIDTH< -10)continue;
    for(const [y,h,cap,hanging] of [[0,gate.top,gate.top-17,true],[gate.bottom,FLOOR-gate.bottom,gate.bottom,false]] as const){
      // Chimney stack: exactly the gate rectangle.
      if(pattern){pattern.setTransform(new DOMMatrix([.5,0,0,.5,gate.x,hanging?gate.top:y]));ctx.fillStyle=pattern;}
      else ctx.fillStyle=XMAS.brick;
      ctx.beginPath();ctx.roundRect(gate.x,y,GATE_WIDTH,h,3);ctx.fill();
      ctx.fillStyle='rgba(255,214,190,.16)';ctx.fillRect(gate.x+3,y,10,h);
      ctx.fillStyle='rgba(60,14,8,.28)';ctx.fillRect(gate.x+GATE_WIDTH-14,y,11,h);
      ctx.strokeStyle='#4a1d15';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(gate.x,y,GATE_WIDTH,h,3);ctx.stroke();
      // Stone crown: exactly the original cap rectangle.
      ctx.fillStyle='#d3c6b7';ctx.strokeStyle='#4a1d15';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(gate.x-3,cap,GATE_WIDTH+6,17,4);ctx.fill();ctx.stroke();
      ctx.fillStyle='#a8998a';ctx.fillRect(gate.x-1,cap+12,GATE_WIDTH+2,3);
      // Snow resting on the crown, kept inside the crown rectangle.
      drawSnowCap(ctx,gate.x-1,cap+6.5,GATE_WIDTH+2,5.5,gate.index*2+(hanging?1:0));
      if(hanging){
        // Frost fringe along the hanging crown's lower edge, still inside it.
        ctx.fillStyle='#e8f4fd';
        for(let k=0;k<7;k++){const ix=gate.x+3+k*9.5;ctx.beginPath();ctx.moveTo(ix,cap+13);ctx.lineTo(ix+5,cap+13);ctx.lineTo(ix+2.5,cap+15.5);ctx.closePath();ctx.fill();}
      }
    }
  }
  // Ground strip: a snowy rooftop of red tiles.
  ctx.fillStyle=XMAS.redDeep;ctx.fillRect(0,FLOOR,WIDTH,HEIGHT-FLOOR);
  ctx.strokeStyle=XMAS.redDark;ctx.lineWidth=1.5;
  for(let row=0;row<3;row++){
    const y=FLOOR+14+row*9;ctx.beginPath();
    for(let x=(row%2)*9-9;x<WIDTH+18;x+=18){ctx.moveTo(x,y);ctx.arc(x+9,y,9,Math.PI,0,true);}
    ctx.stroke();
  }
  ctx.fillStyle=XMAS.snow;ctx.fillRect(0,FLOOR,WIDTH,10);
  drawSnowCap(ctx,-6,FLOOR+11,WIDTH+12,6,7);
  // The original bird, unchanged in shape and size, plus a Santa hat.
  ctx.save();ctx.translate(BIRD_X,s.y);ctx.rotate(reducedMotion?0:Math.max(-.3,Math.min(.8,s.vy/650)));
  ctx.strokeStyle='#224b50';ctx.lineWidth=2.5;ctx.fillStyle='#f3b359';ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(-27,-8);ctx.lineTo(-24,8);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#258b8b';ctx.beginPath();ctx.ellipse(0,0,18,14,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#fff0c8';ctx.beginPath();ctx.ellipse(5,5,10,7,-.25,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#126f75';ctx.beginPath();ctx.ellipse(-6,2,10,6,reducedMotion?-.35:Math.sin(s.tick*.12)*.4-.35,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#f6b448';ctx.beginPath();ctx.moveTo(15,-2);ctx.lineTo(26,2);ctx.lineTo(16,6);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#fff8dc';ctx.beginPath();ctx.arc(10,-5,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#224b50';ctx.beginPath();ctx.arc(12,-5,2.5,0,Math.PI*2);ctx.fill();
  drawSantaHat(ctx,4,-12,20,.18,-1);
  ctx.restore();
}
