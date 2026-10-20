import {SIZE, type SnakeState} from './model';
import {projectSnake, type SnakePresentation} from './presentation';
const BOARD = 480, CELL = BOARD / SIZE;

/** Original Canvas artwork. Geometry stays in board units; backing pixels follow the actual display. */
export function drawGarden(canvas: HTMLCanvasElement, state: SnakeState, view: SnakePresentation, reducedMotion: boolean) {
  const g = canvas.getContext('2d')!;
  const display = canvas.getBoundingClientRect().width || BOARD;
  const pixels = Math.max(1, Math.round(display * (window.devicePixelRatio || 1)));
  if (canvas.width !== pixels || canvas.height !== pixels) canvas.width = canvas.height = pixels;
  g.setTransform(pixels / BOARD, 0, 0, pixels / BOARD, 0, 0);
  const circle = (x:number,y:number,r:number,color:string) => {
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
    const age=view.time-view.foodAt;
    // A single restrained settling motion, never an idle pulse.
    const spawn=reducedMotion?1:Math.min(1,Math.max(0,age/200));
    const scale=.94+.06*spawn;
    g.save();g.translate(state.food.x*CELL+15,state.food.y*CELL+15);g.scale(scale,scale);
    g.fillStyle='#25472425';g.beginPath();g.ellipse(0,11,11,4,0,0,Math.PI*2);g.fill();
    g.strokeStyle='#70462e';g.lineWidth=2.8;g.beginPath();g.moveTo(0,-7);g.quadraticCurveTo(-2,-14,2,-16);g.stroke();
    g.fillStyle='#36783e';g.beginPath();g.ellipse(6,-12,6,3,-.5,0,Math.PI*2);g.fill();
    const red=g.createRadialGradient(-5,-6,1,0,1,17);red.addColorStop(0,'#ffb386');red.addColorStop(.4,'#ef6552');red.addColorStop(1,'#c43842');
    g.fillStyle=red;g.beginPath();g.moveTo(0,-8);g.bezierCurveTo(-15,-15,-17,3,-8,12);
    g.quadraticCurveTo(-3,15,0,12);g.quadraticCurveTo(5,15,10,9);g.bezierCurveTo(18,-2,11,-15,0,-8);g.fill();
    g.strokeStyle='#ffe4c8c0';g.lineWidth=2;g.beginPath();g.moveTo(-7,-6);g.quadraticCurveTo(-11,-3,-9,1);g.stroke();g.restore();
  }
  const pose=projectSnake(state,view,reducedMotion);
  const path=()=>{g.beginPath();pose.path.forEach((p,i)=>i?g.lineTo(p.x*CELL+15,p.y*CELL+15):g.moveTo(p.x*CELL+15,p.y*CELL+15));};
  g.lineJoin='round';g.lineCap='round';
  g.save();g.translate(0,2.5);path();g.strokeStyle='#31552e40';g.lineWidth=25;g.stroke();g.restore();
  path();g.strokeStyle='#36733d';g.lineWidth=26;g.stroke();
  const body=g.createLinearGradient(0,0,BOARD,BOARD);body.addColorStop(0,'#92ce69');body.addColorStop(1,'#68ae53');
  path();g.strokeStyle=body;g.lineWidth=22;g.stroke();
  // Continuous inset highlight follows the same corners as the body, without bead-like seams.
  g.save();g.translate(-1,-3);path();g.strokeStyle='#c5e99545';g.lineWidth=10;g.stroke();g.restore();
  const hx=pose.head.x*CELL+15,hy=pose.head.y*CELL+15;
  g.save();g.translate(hx,hy);g.rotate(Math.atan2(pose.tangent.y,pose.tangent.x));
  const eatAge=view.time-view.ateAt;
  const appetite=reducedMotion?0:Math.max(0,1-eatAge/200);
  const head=g.createRadialGradient(-3,-5,1,1,0,18);head.addColorStop(0,'#c8e98a');head.addColorStop(.65,'#9bd367');head.addColorStop(1,'#66a94e');
  g.fillStyle=head;g.beginPath();g.ellipse(1,0,14+appetite,13,0,0,Math.PI*2);g.fill();
  const lost=state.phase==='lost';
  if(lost) {
    // A calm facial change communicates collision without a flash or screen shake.
    g.strokeStyle='#274d32';g.lineWidth=2;
    for(const y of [-8,8]){g.beginPath();g.moveTo(3,y-2);g.lineTo(9,y+2);g.moveTo(3,y+2);g.lineTo(9,y-2);g.stroke();}
  } else {
    for(const y of [-8.5,8.5]) {
      circle(6,y,5.8,'#fbffe8');circle(8,y,2.8,'#244734');circle(8.6,y-1,1,'#fff');
    }
  }
  g.strokeStyle='#396137';g.lineWidth=1.6;g.beginPath();
  if(lost){g.moveTo(10,-2);g.lineTo(10,2);}else {g.arc(8,0,3.8,-.7,.7);}g.stroke();g.restore();
  if(!reducedMotion && view.eaten && eatAge>=0 && eatAge<200) {
    // Opacity-only feedback at the consumed cell; no particles or repeated pulsing.
    g.globalAlpha=(1-eatAge/200)*.35;g.strokeStyle='#fff4c0';g.lineWidth=2;g.beginPath();
    g.arc(view.eaten.x*CELL+15,view.eaten.y*CELL+15,17,0,Math.PI*2);g.stroke();g.globalAlpha=1;
  }
}
