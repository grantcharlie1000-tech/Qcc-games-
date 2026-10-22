import {SIZE,HEAD_RADIUS,BODY_RADIUS,FOOD_RADIUS, type SnakeState} from './model';
import {projectSnake, type SnakePresentation} from './presentation';
const BOARD = 480, CELL = BOARD / SIZE;

/** Original Canvas artwork. Geometry stays in board units; backing pixels follow the actual display. */
export function drawGarden(canvas: HTMLCanvasElement, state: SnakeState, view: SnakePresentation, reducedMotion: boolean) {
  const g = canvas.getContext('2d')!;
  const display = canvas.getBoundingClientRect().width || BOARD;
  const pixels = Math.max(1, Math.round(display * (window.devicePixelRatio || 1)));
  if (canvas.width !== pixels || canvas.height !== pixels) canvas.width = canvas.height = pixels;
  g.setTransform(pixels / BOARD, 0, 0, pixels / BOARD, 0, 0);
  const circle = (x:number,y:number,r:number,color:string|CanvasGradient) => {
    g.fillStyle=color;g.beginPath();g.arc(x,y,r,0,Math.PI*2);g.fill();
  };
  const grass = g.createLinearGradient(0,0,BOARD,BOARD);
  grass.addColorStop(0,'#c8de94');grass.addColorStop(1,'#a4c976');
  g.fillStyle=grass;g.fillRect(0,0,BOARD,BOARD);
  for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++) {
    g.fillStyle=(x+y)%2?'#ffffff0b':'#3664260a';g.fillRect(x*CELL,y*CELL,CELL,CELL);
  }
  // Quiet, stationary tufts leave the travel lanes readable.
  g.strokeStyle='#5b843a29';g.lineWidth=1.4;g.lineCap='round';
  for(let y=18;y<BOARD;y+=90)for(let x=20;x<BOARD;x+=90) {
    g.beginPath();g.moveTo(x,y+4);g.quadraticCurveTo(x-5,y,x-3,y-4);
    g.moveTo(x,y+4);g.quadraticCurveTo(x+3,y+1,x+4,y-2);g.stroke();
  }
  if(state.food) {
    const r=FOOD_RADIUS*CELL;
    g.save();g.globalAlpha=reducedMotion?1:.85+.15*Math.min(1,Math.max(0,(view.time-view.foodAt)/200));g.translate(state.food.x*CELL+15,state.food.y*CELL+15);
    g.fillStyle='#25472425';g.beginPath();g.ellipse(0,r+2,r,2,0,0,Math.PI*2);g.fill();
    // Stem/leaf and shadow are decorative; the solid fruit disk is exactly FOOD_RADIUS.
    g.strokeStyle='#70462e';g.lineWidth=1.8;g.beginPath();g.moveTo(0,-r+1);g.lineTo(1,-r-4);g.stroke();
    g.fillStyle='#36783e';g.beginPath();g.ellipse(4,-r-2,3,1.8,-.4,0,Math.PI*2);g.fill();
    const red=g.createRadialGradient(-r*.3,-r*.4,0,0,0,r);red.addColorStop(0,'#ffb386');red.addColorStop(.4,'#ef6552');red.addColorStop(1,'#bd303c');
    circle(0,0,r,red);circle(-r*.35,-r*.35,1,'#ffe4c8');g.restore();
  }
  const pose=projectSnake(state,view,reducedMotion);
  const path=()=>{g.beginPath();pose.path.forEach((p,i)=>i?g.lineTo(p.x*CELL+15,p.y*CELL+15):g.moveTo(p.x*CELL+15,p.y*CELL+15));};
  g.lineJoin='round';g.lineCap='round';
  g.save();g.translate(0,2.5);path();g.strokeStyle='#31552e40';g.lineWidth=BODY_RADIUS*CELL*2;g.stroke();g.restore();
  path();g.strokeStyle='#36733d';g.lineWidth=BODY_RADIUS*CELL*2;g.stroke();
  const body=g.createLinearGradient(0,0,BOARD,BOARD);body.addColorStop(0,'#92ce69');body.addColorStop(1,'#68ae53');
  path();g.strokeStyle=body;g.lineWidth=BODY_RADIUS*CELL*2-2;g.stroke();
  // Continuous inset highlight follows the same corners as the body, without bead-like seams.
  g.save();g.translate(-.5,-1.5);path();g.strokeStyle='#c5e99545';g.lineWidth=5;g.stroke();g.restore();
  const hx=pose.head.x*CELL+15,hy=pose.head.y*CELL+15;
  g.save();g.translate(hx,hy);g.rotate(Math.atan2(pose.tangent.y,pose.tangent.x));
  const eatAge=view.time-view.ateAt;
  const appetite=reducedMotion?0:Math.max(0,1-eatAge/200);
  const head=g.createRadialGradient(-2,-3,1,0,0,HEAD_RADIUS*CELL);head.addColorStop(0,'#c8e98a');head.addColorStop(.65,'#9bd367');head.addColorStop(1,'#66a94e');
  g.fillStyle=head;g.beginPath();g.arc(0,0,HEAD_RADIUS*CELL,0,Math.PI*2);g.fill();
  const lost=state.phase==='lost';
  if(lost) {
    // A calm facial change communicates collision without a flash or screen shake.
    g.strokeStyle='#274d32';g.lineWidth=2;
    for(const y of [-6,6]){g.beginPath();g.moveTo(1,y-1.5);g.lineTo(6,y+1.5);g.moveTo(1,y+1.5);g.lineTo(6,y-1.5);g.stroke();}
  } else {
    for(const y of [-6,6]) {
      circle(4,y,4.5,'#fbffe8');circle(6,y,2.2,'#244734');circle(6.5,y-.8,.8,'#fff');
    }
  }
  g.strokeStyle='#396137';g.lineWidth=1.6;g.beginPath();
  if(lost){g.moveTo(7,-1.5);g.lineTo(7,1.5);}else {g.arc(5,0,2.8+appetite*.5,-.7,.7);}g.stroke();g.restore();
  if(!reducedMotion && view.eaten && eatAge>=0 && eatAge<200) {
    // Opacity-only feedback at the consumed cell; no particles or repeated pulsing.
    g.globalAlpha=(1-eatAge/200)*.35;g.strokeStyle='#fff4c0';g.lineWidth=2;g.beginPath();
    g.arc(view.eaten.x*CELL+15,view.eaten.y*CELL+15,FOOD_RADIUS*CELL+3,0,Math.PI*2);g.stroke();g.globalAlpha=1;
  }
}
