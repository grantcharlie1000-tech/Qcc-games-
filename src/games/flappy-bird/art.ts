import {WIDTH,HEIGHT,FLOOR,BIRD_X,GATE_WIDTH,visibleGates,distanceOf,type Flight} from './model';
/** Original vector artwork: a teal marsh swift, copper reed gates and a peach wetland. */
export function drawFlight(ctx:CanvasRenderingContext2D,s:Flight,reducedMotion:boolean){
  ctx.clearRect(0,0,WIDTH,HEIGHT);ctx.fillStyle='#f9d9a7';ctx.fillRect(0,0,WIDTH,HEIGHT);
  ctx.fillStyle='#fff0cc';ctx.beginPath();ctx.arc(284,96,46,0,Math.PI*2);ctx.fill();
  const drift=reducedMotion?0:distanceOf(s)*.14;
  ctx.fillStyle='#fff2d9';
  for(let i=-1;i<4;i++){const x=((i*170-drift)%680+680)%680-170,y=72+(i%2)*65;ctx.beginPath();ctx.ellipse(x,y,42,11,0,0,Math.PI*2);ctx.ellipse(x-13,y-8,22,15,0,0,Math.PI*2);ctx.fill();}
  for(const [color,base,amp] of [['#d9c790',385,28],['#8dbba8',425,21],['#569e93',470,16]] as const){
    ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,HEIGHT);
    for(let x=0;x<=WIDTH;x+=4)ctx.lineTo(x,base+amp*Math.sin(x*.015+(reducedMotion?0:distanceOf(s)*.001)));
    ctx.lineTo(WIDTH,HEIGHT);ctx.closePath();ctx.fill();
  }
  for(const gate of visibleGates(s)){
    if(gate.x>WIDTH+10||gate.x+GATE_WIDTH< -10)continue;
    for(const [y,h,cap] of [[0,gate.top,gate.top-17],[gate.bottom,FLOOR-gate.bottom,gate.bottom]] as const){
      ctx.fillStyle='#b75f47';ctx.strokeStyle='#613f38';ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(gate.x,y,GATE_WIDTH,h,3);ctx.fill();ctx.stroke();
      ctx.fillStyle='#e39b67';ctx.fillRect(gate.x+6,y+2,12,Math.max(0,h-4));
      ctx.strokeStyle='#814936';ctx.lineWidth=2;
      for(let line=y+30;line<y+h-7;line+=34){ctx.beginPath();ctx.moveTo(gate.x+21,line);ctx.lineTo(gate.x+GATE_WIDTH-7,line-8);ctx.stroke();}
      ctx.fillStyle='#e6b478';ctx.strokeStyle='#613f38';ctx.beginPath();ctx.roundRect(gate.x-3,cap,GATE_WIDTH+6,17,4);ctx.fill();ctx.stroke();
      ctx.fillStyle='#fff1be';ctx.fillRect(gate.x+3,cap+4,GATE_WIDTH-6,3);
    }
  }
  ctx.fillStyle='#326d70';ctx.fillRect(0,FLOOR,WIDTH,40);ctx.fillStyle='#b7d6b3';ctx.fillRect(0,FLOOR,WIDTH,5);
  ctx.strokeStyle='#77aba3';ctx.lineWidth=2;
  for(let x=15;x<WIDTH;x+=46){ctx.beginPath();ctx.moveTo(x,519);ctx.lineTo(x+20,519);ctx.stroke();}
  ctx.save();ctx.translate(BIRD_X,s.y);ctx.rotate(reducedMotion?0:Math.max(-.3,Math.min(.8,s.vy/650)));
  ctx.strokeStyle='#224b50';ctx.lineWidth=2.5;ctx.fillStyle='#f3b359';ctx.beginPath();ctx.moveTo(-14,0);ctx.lineTo(-27,-8);ctx.lineTo(-24,8);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#258b8b';ctx.beginPath();ctx.ellipse(0,0,18,14,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#fff0c8';ctx.beginPath();ctx.ellipse(5,5,10,7,-.25,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#126f75';ctx.beginPath();ctx.ellipse(-6,2,10,6,reducedMotion?-.35:Math.sin(s.tick*.12)*.4-.35,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#f6b448';ctx.beginPath();ctx.moveTo(15,-2);ctx.lineTo(26,2);ctx.lineTo(16,6);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#fff8dc';ctx.beginPath();ctx.arc(10,-5,5,0,Math.PI*2);ctx.fill();ctx.fillStyle='#224b50';ctx.beginPath();ctx.arc(12,-5,2.5,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
