import {SIZE,type SnakeState} from './model';
import {pendingEat,buildSpine,bulge,bulgePositions,blink,chompScale,deathFx,EAT_FX_MS,foodScale,mouth,taper,tongue,easeOutCubic,type Spine,type SnakeView} from './presentation';
import {christmas} from '../../festive/festive';
import {drawBauble,drawSantaHat,drawSnowflake,XMAS} from '../../festive/art';
const FESTIVE_FOOD=[XMAS.red,XMAS.gold,XMAS.green,'#2f7fd1'] as const;
const BOARD=480, CELL=BOARD/SIZE, HALF=CELL/2;
export const TUBE=.8*CELL, HEAD_R=.46*CELL, FOOD_R=.33*CELL;
const px=(n:number)=>n*CELL+HALF;
const festiveFood=(c:{x:number;y:number})=>FESTIVE_FOOD[(c.x+c.y*SIZE)%FESTIVE_FOOD.length]!;

/** Strokes the spine with a per-sample width; constant-width runs are drawn as single paths. */
function strokeSpine(g:CanvasRenderingContext2D,spine:Spine,widths:number[],extra:number,style:string|CanvasGradient,base:number){
 const p=spine.points;if(p.length<2){g.fillStyle=style;g.beginPath();g.arc(px(p[0].x),px(p[0].y),(widths[0]+extra)/2,0,Math.PI*2);g.fill();return;}
 g.strokeStyle=style;g.lineCap='round';g.lineJoin='round';
 let i=0;
 while(i<p.length-1){
  if(Math.abs(widths[i]-base)<.05&&Math.abs(widths[i+1]-base)<.05){
   g.lineWidth=base+extra;g.beginPath();g.moveTo(px(p[i].x),px(p[i].y));
   while(i<p.length-1&&Math.abs(widths[i+1]-base)<.05){i++;g.lineTo(px(p[i].x),px(p[i].y));}
   g.stroke();
  }else{
   g.lineWidth=Math.max(widths[i],widths[i+1])+extra;g.beginPath();g.moveTo(px(p[i].x),px(p[i].y));g.lineTo(px(p[i+1].x),px(p[i+1].y));g.stroke();i++;
  }
 }
}

/** Original Canvas artwork. Geometry stays in board units; backing pixels follow the actual display. */
export function drawGarden(canvas:HTMLCanvasElement,state:SnakeState,view:SnakeView,reduced:boolean,spine=buildSpine(state)){
 const g=canvas.getContext('2d')!;
 const display=canvas.getBoundingClientRect().width||BOARD;
 const pixels=Math.max(1,Math.round(display*Math.min(2,window.devicePixelRatio||1)));
 if(canvas.width!==pixels||canvas.height!==pixels)canvas.width=canvas.height=pixels;
 const fx=deathFx(view,state,reduced);
 g.setTransform(pixels/BOARD,0,0,pixels/BOARD,0,0);
 g.translate(fx.dx,fx.dy);
 const circle=(x:number,y:number,r:number,color:string|CanvasGradient)=>{g.fillStyle=color;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();};
 const xmas=christmas();
 // Grass, extended past the edges so a shake never exposes blank pixels.
 const grass=g.createLinearGradient(0,0,BOARD,BOARD);
 grass.addColorStop(0,xmas?'#f7fafd':'#c8de94');grass.addColorStop(1,xmas?'#dbe7f2':'#a4c976');
 g.fillStyle=grass;g.fillRect(-8,-8,BOARD+16,BOARD+16);
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){g.fillStyle=(x+y)%2?(xmas?'#ffffff40':'#ffffff0b'):(xmas?'#5b86b014':'#3664260a');g.fillRect(x*CELL,y*CELL,CELL,CELL);}
 if(xmas){for(let y=18;y<BOARD;y+=90)for(let x=20;x<BOARD;x+=90)drawSnowflake(g,x,y,5,'#8fb3cf',.45);}
 else{
  g.strokeStyle='#5b843a29';g.lineWidth=1.4;g.lineCap='round';
  for(let y=18;y<BOARD;y+=90)for(let x=20;x<BOARD;x+=90){g.beginPath();g.moveTo(x,y+4);g.quadraticCurveTo(x-5,y,x-3,y-4);g.moveTo(x,y+4);g.quadraticCurveTo(x+3,y+1,x+4,y-2);g.stroke();}
 }
 // Apple (or bauble) with a springy pop-in.
 // Until the drawn head reaches an apple the model already ate, keep showing that apple.
 const pending=pendingEat(view),apple=pending?.cell??state.food;
 if(apple){
  const k=pending?1:foodScale(view,reduced),r=FOOD_R;
  if(k>0){
   g.save();g.translate(px(apple.x),px(apple.y));
   g.fillStyle=xmas?'#27466a2e':'#25472425';g.beginPath();g.ellipse(0,r+2,r*Math.min(1,k),2,0,0,Math.PI*2);g.fill();
   g.scale(k,k);
   if(xmas)drawBauble(g,0,0,r,festiveFood(apple));
   else{
    g.strokeStyle='#70462e';g.lineWidth=1.8;g.lineCap='round';g.beginPath();g.moveTo(0,-r+1);g.lineTo(1,-r-4);g.stroke();
    g.fillStyle='#36783e';g.beginPath();g.ellipse(4,-r-2,3,1.8,-.4,0,Math.PI*2);g.fill();
    const red=g.createRadialGradient(-r*.3,-r*.4,0,0,0,r);red.addColorStop(0,'#ffb386');red.addColorStop(.4,'#ef6552');red.addColorStop(1,'#bd303c');
    circle(0,0,r,red);circle(-r*.35,-r*.35,1.4,'#ffe4c8');
   }
   g.restore();
  }
 }
 // Body: shadow, outline, gradient fill, highlight; widths taper to the tail and bulge after a swallow.
 const bulges=bulgePositions(view,reduced),total=spine.length;
 const widths=spine.points.map(p=>TUBE*taper(p.s,total)*bulge(p.s,bulges,total));
 g.save();g.globalAlpha=fx.fade;
 g.save();g.translate(0,2.5);strokeSpine(g,spine,widths,0,xmas?'#2a456840':'#31552e40',TUBE);g.restore();
 strokeSpine(g,spine,widths,0,xmas?XMAS.redDark:'#36733d',TUBE);
 const body=g.createLinearGradient(0,0,BOARD,BOARD);body.addColorStop(0,xmas?'#e8414f':'#92ce69');body.addColorStop(1,xmas?XMAS.redDeep:'#68ae53');
 strokeSpine(g,spine,widths,-2,body,TUBE);
 const pts=spine.points;
 const trace=()=>{g.beginPath();pts.forEach((p,i)=>i?g.lineTo(px(p.x),px(p.y)):g.moveTo(px(p.x),px(p.y)));};
 if(xmas&&pts.length>1){
  // Stocking stripes travel with the body rather than sliding along it.
  g.save();g.lineCap='butt';g.lineJoin='round';g.setLineDash([CELL*.42,CELL*.58]);g.lineDashOffset=-(state.ticks+(state.phase==='running'&&state.bonk===0?state.elapsed/135:0))*CELL;
  trace();g.strokeStyle=XMAS.green;g.lineWidth=TUBE*.6;g.stroke();g.restore();
 }
 if(pts.length>1){g.save();g.translate(-.5,-1.5);trace();g.strokeStyle='#c5e99545';g.lineWidth=5;g.lineCap='round';g.lineJoin='round';g.stroke();g.restore();}
 // Head rig.
 const hx=px(spine.head.x),hy=px(spine.head.y),lost=state.phase==='lost';
 const open=mouth(state,view,spine.head,reduced),scale=chompScale(view,reduced),lid=blink(view,state,reduced),flick=tongue(view,state,reduced);
 let push=0;
 if(state.bonk===1&&state.phase==='running'&&!reduced)push=.12*Math.sin(Math.PI*Math.min(1,state.elapsed/135));
 if(lost&&!reduced)push=.08;
 g.save();g.translate(hx+Math.cos(view.angle)*push*CELL,hy+Math.sin(view.angle)*push*CELL);g.rotate(view.angle);g.scale(scale,scale);
 const R=HEAD_R;
 const head=g.createRadialGradient(-2,-3,1,0,0,R);head.addColorStop(0,xmas?'#8fdc9f':'#c8e98a');head.addColorStop(.65,xmas?'#3aa760':'#9bd367');head.addColorStop(1,xmas?XMAS.greenDeep:'#66a94e');
 // Seen from above, the snout hinges open into a D-shaped jaw wider than the head:
 // a coloured rim around a dark inside, with two small fangs at the hinge corners.
 const outline=xmas?XMAS.greenDeep:'#36733d',hinge=R*.3;
 g.save();
 if(open>.02){g.beginPath();g.rect(-R-4,-R-4,hinge+(R+4-hinge)*(1-open)+R+4,R*2+8);g.clip();}
 g.fillStyle=outline;g.beginPath();g.arc(0,0,R+1,0,Math.PI*2);g.fill();
 g.fillStyle=head;g.beginPath();g.arc(0,0,R,0,Math.PI*2);g.fill();
 g.restore();
 if(open>.02){
  const rx=R*1.05*open,ry=R*(1+.3*open);
  const half=(x:number,a:number,b:number,color:string|CanvasGradient)=>{g.fillStyle=color;g.beginPath();g.ellipse(x,0,a,b,0,-Math.PI/2,Math.PI/2);g.closePath();g.fill();};
  half(hinge,rx+1.5,ry+1.5,outline);
  half(hinge,rx,ry,head);
  half(hinge,rx*.68,ry*.78,'#244734');
  g.fillStyle='#fbffe8';const f=3.2*open,fy=ry*.78;
  for(const s of [-1,1]){g.beginPath();g.moveTo(hinge,s*fy);g.lineTo(hinge+f*1.1,s*fy);g.lineTo(hinge+.3,s*(fy-f*1.3));g.closePath();g.fill();}
 }
 if(flick>0){
  g.strokeStyle='#bd303c';g.lineWidth=1.6;g.lineCap='round';const L=R+.25*CELL*flick;
  g.beginPath();g.moveTo(R*.8,0);g.lineTo(L,0);g.moveTo(L,0);g.lineTo(L+3*flick,-2.5*flick);g.moveTo(L,0);g.lineTo(L+3*flick,2.5*flick);g.stroke();
 }
 if(xmas){g.save();g.translate(-R*.2,0);g.rotate(-Math.PI/2);drawSantaHat(g,0,0,R*1.15,0,.5);g.restore();}
 const ex=.1*CELL,ey=.22*CELL,sr=.17*CELL;
 if(lost){
  g.strokeStyle='#274d32';g.lineWidth=2.2;g.lineCap='round';
  for(const y of [-ey,ey]){g.beginPath();g.moveTo(ex-3.5,y-3.5);g.lineTo(ex+3.5,y+3.5);g.moveTo(ex-3.5,y+3.5);g.lineTo(ex+3.5,y-3.5);g.stroke();}
 }else{
  const lx=view.look.x*CELL,ly=view.look.y*CELL;
  for(const y of [-ey,ey]){
   g.save();g.translate(ex,y);g.scale(1,lid);
   circle(0,0,sr,'#fbffe8');circle(lx+1,ly,.085*CELL,'#244734');circle(lx+1.6,ly-1,.9,'#fff');
   g.restore();
   if(lid<.95){g.strokeStyle='#36733d';g.lineWidth=1.2;g.beginPath();g.ellipse(ex,y,sr,sr*lid,0,0,Math.PI*2);g.stroke();}
  }
 }
 g.restore();
 g.restore();
 // Eating feedback: flecks of fruit and a rising "+10".
 if(!reduced)for(const e of view.eats){
  const age=view.clock-e.at;if(age<0||age>EAT_FX_MS)continue;
  const cx=px(e.cell.x),cy=px(e.cell.y),colors=xmas?[festiveFood(e.cell),XMAS.gold,XMAS.green]:['#ef6552','#ffb386','#36783e'];
  if(age<320){
   g.globalAlpha=1-age/320;
   for(let i=0;i<6;i++){const a=i/6*Math.PI*2+.4,d=(60+i%3*25)*age/1000+FOOD_R*.6;circle(cx+Math.cos(a)*d,cy+Math.sin(a)*d,2.5-i%2,colors[i%3]);}
  }
  if(age<600){
   const t=age/600;g.globalAlpha=age<350?1:1-(age-350)/250;
   g.font='15px Arcade, system-ui, sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=3;g.lineJoin='round';
   const y=cy-12-18*easeOutCubic(t);g.strokeStyle='#36733d';g.strokeText('+10',cx,y);g.fillStyle='#fff4c0';g.fillText('+10',cx,y);
  }
  g.globalAlpha=1;
 }
 if(fx.flash>0){g.fillStyle='#fff4c0';g.globalAlpha=fx.flash;g.fillRect(-8,-8,BOARD+16,BOARD+16);g.globalAlpha=1;}
}
