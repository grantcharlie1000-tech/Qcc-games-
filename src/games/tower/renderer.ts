import { movingBlock } from './model';
import type { Block, TowerState } from './model';
const W=400,H=470,UNIT=19;
type Point=[number,number];
function project(x:number,z:number,level:number,camera:number):Point{return [200+(x-z)*.82,359+(x+z)*.32-level*UNIT+camera];}
function path(ctx:CanvasRenderingContext2D,points:Point[],fill:string,stroke='#38435c'){
  ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=1.2;ctx.lineJoin='round';ctx.stroke();
}
function slab(ctx:CanvasRenderingContext2D,b:Block,level:number,camera:number,lift=0,alpha=1){
  const hue=(184+level*9)%360;
  const a=project(b.x,b.z,level,camera),c=project(b.x+b.w,b.z+b.d,level,camera);
  const back=project(b.x+b.w,b.z,level,camera),front=project(b.x,b.z+b.d,level,camera);
  for(const p of [a,back,c,front])p[1]-=lift;
  const low=(p:Point):Point=>[p[0],p[1]+UNIT];
  ctx.save();ctx.globalAlpha=alpha;
  path(ctx,[front,c,low(c),low(front)],`hsl(${hue} 37% 42%)`);
  path(ctx,[back,c,low(c),low(back)],`hsl(${hue} 43% 30%)`);
  path(ctx,[a,back,c,front],`hsl(${hue} 52% ${level===0?69:73}%)`);
  // Fine inset on the top face gives the slab a readable edge at every scale.
  const center:Point=[(a[0]+c[0])/2,(a[1]+c[1])/2];
  ctx.beginPath();[a,back,c,front,a].forEach((p,i)=>{const x=p[0]*.94+center[0]*.06,y=p[1]*.94+center[1]*.06;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});
  ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1;ctx.stroke();
  ctx.restore();
}
export function renderTower(canvas:HTMLCanvasElement,s:TowerState,reduced:boolean,paused:boolean){
  const ctx=canvas.getContext('2d');if(!ctx)return;
  ctx.setTransform(canvas.width/W,0,0,canvas.height/H,0,0);ctx.clearRect(0,0,W,H);
  const height=s.blocks.length-1;
  const progress=s.phase==='settling'?Math.min(1,s.phaseElapsed/.2):1;
  const camera=Math.max(0,height-5)*UNIT-(height>5&&s.phase==='settling'&&!reduced?UNIT*(1-progress)**3:0);
  ctx.fillStyle='rgba(60,42,88,.15)';ctx.beginPath();ctx.ellipse(200,425+camera,108,25,0,0,Math.PI*2);ctx.fill();
  // Original floating stone plinth.
  const a=project(-68,-68,0,camera),b=project(68,-68,0,camera),c=project(68,68,0,camera),d=project(-68,68,0,camera);
  for(const p of [a,b,c,d])p[1]+=UNIT+2;
  path(ctx,[d,c,[c[0],c[1]+20],[d[0],d[1]+20]],'#665b84');
  path(ctx,[b,c,[c[0],c[1]+20],[b[0],b[1]+20]],'#514e73');path(ctx,[a,b,c,d],'#c1b9d6');
  for(let i=Math.max(0,height-22);i<=height;i++){
    const lift=i===height&&s.phase==='settling'&&!reduced?22*(1-progress)**3:0;
    slab(ctx,s.blocks[i],i,camera,lift);
  }
  if(s.last){
    const age=s.time-s.last.time;
    if(s.last.cut&&age<1.2&&!reduced){
      const cut={...s.last.cut};const axis=s.last.height%2===1?'x':'z';
      cut[axis]+=s.last.side*age*45;
      slab(ctx,cut,s.last.height,camera,-age*age*480,Math.max(0,1-age/1.1));
    }
    if(s.last.kind==='perfect'&&age<.55&&!reduced){
      const top=s.blocks[height];const center=project(top.x+top.w/2,top.z+top.d/2,height,camera);
      ctx.save();ctx.strokeStyle=`rgba(255,246,197,${(1-age/.55)*.85})`;ctx.lineWidth=3;ctx.beginPath();ctx.ellipse(center[0],center[1],55+age*70,21+age*26,0,0,Math.PI*2);ctx.stroke();ctx.restore();
    }
  }
  if(s.phase==='sliding'){
    // The white top rim distinguishes the moving slab without depending on colour.
    const moving=movingBlock(s);slab(ctx,moving,height+1,camera,22);
    const point=project(moving.x,moving.z,height+1,camera);ctx.fillStyle='#fff6dc';ctx.beginPath();ctx.arc(point[0],point[1]-22,3,0,Math.PI*2);ctx.fill();
  }
  ctx.font='800 12px Arcade, sans-serif';ctx.textAlign='left';ctx.fillStyle='#4f496e';
  ctx.fillText('PRECISION BUILDS HEIGHT',21,30);
  ctx.font='12px system-ui, sans-serif';ctx.fillStyle='#534a6a';
  ctx.fillText(paused?'PAUSED':s.phase==='over'?'YOUR TOWER':s.phase==='settling'?'NICE LANDING':s.motion.axis==='x'?'NEXT SLAB  ↗':'NEXT SLAB  ↖',21,49);
}
