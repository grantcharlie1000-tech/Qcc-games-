/** Presentation-only state and geometry. Nothing here affects gameplay; all clocks freeze while paused. */
import {SIZE,TICK_MS,vector,type Cell,type SnakeState} from './model';
import {easeOutStrong} from './head';

export const EAT_FX_MS=650, SPAWN_POP_MS=260, DEATH_CARD_MS=700, WIN_CARD_MS=500, BULGE_SIGMA=.6;
export interface EatEffect{at:number;cell:Cell}
export interface SnakeView{
 /** Presentation clock in ms; advances whenever the game is not paused. */
 clock:number;foodBorn:number;eats:EatEffect[];endedAt:number|null;
 /** Smoothed head angle (radians) and pupil look offset (cells, head-local). */
 angle:number;look:Cell;
}
export function createView(s?:SnakeState):SnakeView{
 const d=vector[s?.dir??'right'];
 return {clock:0,foodBorn:-SPAWN_POP_MS,eats:[],endedAt:s&&(s.phase==='lost'||s.phase==='won')?-10000:null,angle:Math.atan2(d.y,d.x),look:{x:0,y:0}};
}
export const easeOutBack=(t:number)=>{const c=1.70158,u=t-1;return 1+(c+1)*u*u*u+c*u*u;};
export const easeOutCubic=(t:number)=>1-(1-t)**3;
export const smoothstep=(t:number)=>t*t*(3-2*t);
export const easeOutQuad=(t:number)=>1-(1-t)*(1-t);
const clamp=(n:number,lo=0,hi=1)=>Math.max(lo,Math.min(hi,n));

/** Interpolation progress for the current step. Ready/held/ended snakes rest on their head cell. */
export function progress(s:SnakeState):number{return (s.phase==='running'&&s.bonk===0)||s.phase==='won'?clamp(s.elapsed/TICK_MS):1;}
export interface Spine{points:{x:number;y:number;s:number}[];length:number;head:Cell;tangent:Cell}
/**
 * Centre line from visual head to visual tail, in cell units, sampled every `spacing` cells with
 * quarter-circle corners. The head lerps body[1]→body[0], the tail lerps prevTail→last cell.
 */
export function buildSpine(s:SnakeState,spacing=.1):Spine{
 const t=progress(s),b=s.body,lerp=(a:Cell,c:Cell,k:number)=>({x:a.x+(c.x-a.x)*k,y:a.y+(c.y-a.y)*k});
 const raw:Cell[]=[t<1?lerp(b[1],b[0],t):{...b[0]},...b.slice(1)];
 if(s.prevTail&&t<1)raw.push(lerp(s.prevTail,b.at(-1)!,t));
 // Drop zero-length and collinear points.
 const pts:Cell[]=[];
 for(const p of raw){const q=pts.at(-1);if(q&&Math.abs(q.x-p.x)<1e-9&&Math.abs(q.y-p.y)<1e-9)continue;pts.push(p);}
 const corners:Cell[]=[pts[0]];
 for(let i=1;i<pts.length-1;i++){const a=corners.at(-1)!,p=pts[i],c=pts[i+1];if((p.x-a.x)*(c.y-p.y)-(p.y-a.y)*(c.x-p.x)!==0)corners.push(p);}
 if(pts.length>1)corners.push(pts.at(-1)!);
 const out:Spine['points']=[];let s0=0;
 const emit=(p:Cell)=>{const q=out.at(-1);if(q)s0+=Math.hypot(p.x-q.x,p.y-q.y);out.push({x:p.x,y:p.y,s:s0});};
 emit(corners[0]);
 for(let i=1;i<corners.length;i++){
  const a=corners[i-1],p=corners[i],c=corners[i+1];
  const r=c?Math.min(.5,Math.hypot(p.x-a.x,p.y-a.y)/(i===1?1:2),Math.hypot(c.x-p.x,c.y-p.y)/(i+1===corners.length-1?1:2)):0;
  const la=Math.hypot(p.x-a.x,p.y-a.y),ux=(p.x-a.x)/la,uy=(p.y-a.y)/la;
  const end={x:p.x-ux*r,y:p.y-uy*r},from=out.at(-1)!,run=Math.hypot(end.x-from.x,end.y-from.y);
  for(let k=1,n=Math.ceil(run/spacing);k<=n;k++)emit({x:from.x+(end.x-from.x)*k/n,y:from.y+(end.y-from.y)*k/n});
  if(c&&r>1e-6){
   const lc=Math.hypot(c.x-p.x,c.y-p.y),vx=(c.x-p.x)/lc,vy=(c.y-p.y)/lc;
   // Quadratic Bezier through the corner approximates a quarter circle closely enough at this size.
   const out0={x:p.x+vx*r,y:p.y+vy*r},n=Math.max(2,Math.ceil(r*Math.PI/2/spacing));
   for(let k=1;k<=n;k++){const q=k/n,m=1-q;emit({x:m*m*end.x+2*m*q*p.x+q*q*out0.x,y:m*m*end.y+2*m*q*p.y+q*q*out0.y});}
  }
 }
 const head=out[0],second=out.find(p=>p.s>1e-6);
 const tangent=second?{x:(head.x-second.x)/second.s,y:(head.y-second.y)/second.s}:{...vector[s.dir]};
 if(s.bonk===1||s.phase==='lost'||s.phase==='won'||s.phase==='ready')Object.assign(tangent,vector[s.dir]);
 return {points:out,length:s0,head:{x:head.x,y:head.y},tangent};
}
/** Tail taper multiplier over the last 2.5 cells: 1 → 0.5. */
export function taper(s:number,total:number):number{const from=Math.max(1,total-2.5);return s<=from?1:1-.5*clamp((s-from)/Math.max(1e-6,total-from));}
/** Swallow bulges travel from head to tail at two cells per step. */
export function bulgePositions(view:SnakeView,reduced:boolean):number[]{
 if(reduced)return [];
 return view.eats.map(e=>(view.clock-e.at)/TICK_MS*2).filter(p=>p>=0).slice(-4);
}
export function bulge(s:number,positions:number[],total:number):number{
 let k=0;for(const p of positions)if(p<total+1)k+=Math.exp(-((s-p)**2)/(2*BULGE_SIGMA*BULGE_SIGMA));
 return 1+.22*Math.min(1.4,k);
}
/** Mouth opening 0..1 from the visual head's distance to the apple, then a quick chomp after eating. */
/** An eat waiting for the drawn head to reach the apple it already consumed in the model. */
export function pendingEat(view:SnakeView):EatEffect|undefined{const e=view.eats.at(-1);return e&&e.at>view.clock?e:undefined;}
/** Delay from a model eat until the drawn head touches the apple (the apple is half inside the open mouth). */
export function eatDelay(s:SnakeState):number{return Math.max(0,TICK_MS*.55-s.elapsed);}
/**
 * Mouth opening 0..1. Opening is driven by position (the last three squares before an apple that
 * lies ahead), so it is continuous and naturally reverses if the snake turns away; after a bite the
 * jaw snaps shut in 150 ms on a strong ease-out.
 */
export function mouth(s:SnakeState,view:SnakeView,head:Cell,reduced:boolean,angle=view.angle):number{
 if(reduced||s.phase==='lost')return 0;
 const pending=pendingEat(view),last=view.eats.at(-1),age=last&&!pending?view.clock-last.at:Infinity;
 if(age<150)return 1-easeOutStrong(age/150);
 const target=pending?.cell??s.food;
 if(!target||(s.phase!=='running'&&!pending))return 0;
 const dx=target.x-head.x,dy=target.y-head.y,d=Math.hypot(dx,dy);
 const facing=d<1e-6?1:clamp(((dx*Math.cos(angle)+dy*Math.sin(angle))/d-.3)/.5);
 return smoothstep(clamp((3-d)/1.6))*facing;
}
export function chompScale(view:SnakeView,reduced:boolean):number{
 const last=view.eats.at(-1);if(reduced||!last||last.at>view.clock)return 1;
 const age=view.clock-last.at;return age<0||age>160?1:1+.1*(1-easeOutCubic(age/160));
}
/** Deterministic blinking: one 140 ms blink in each 2.5–5.5 s window. Returns lid openness 0.1..1. */
export function blink(view:SnakeView,s:SnakeState,reduced:boolean):number{
 if(reduced||s.phase==='lost'||s.phase==='won')return 1;
 const last=view.eats.at(-1);if(last&&view.clock-last.at<200)return 1;
 let start=0,i=0;
 while(i<1e5){const gap=2500+((Math.imul(i+1,2654435761)>>>0)%3000);if(start+gap>view.clock)break;start+=gap;i++;}
 const into=view.clock-start;if(into>140||start===0)return 1;
 return 1-.9*Math.sin(Math.PI*into/140);
}
/** Ready-screen tongue flick: 220 ms in every 1.6 s. */
export function tongue(view:SnakeView,s:SnakeState,reduced:boolean):number{
 if(reduced||s.phase!=='ready')return 0;
 const t=view.clock%1600;return t<220?Math.sin(Math.PI*t/220):0;
}
export function foodScale(view:SnakeView,reduced:boolean):number{
 if(reduced)return 1;const t=clamp((view.clock-view.foodBorn)/SPAWN_POP_MS);return Math.max(0,easeOutBack(t));
}
/** Death: decaying shake and flash. Returns board offset in board units and flash alpha. */
export function deathFx(view:SnakeView,s:SnakeState,reduced:boolean):{dx:number;dy:number;flash:number;fade:number}{
 if(s.phase!=='lost'||view.endedAt===null)return {dx:0,dy:0,flash:0,fade:1};
 const t=view.clock-view.endedAt;
 const fade=t<250?1:1-.25*clamp((t-250)/400);
 if(reduced)return {dx:0,dy:0,flash:0,fade};
 const amp=t<280?4*Math.exp(-t/90):0;
 return {dx:amp*Math.sin(t/1000*30*2*Math.PI),dy:amp*Math.cos(t/1000*23*2*Math.PI),flash:t<120?.3*(1-t/120):0,fade};
}
/** Advance the presentation clock and smooth the head heading and pupils. */
export function tickView(view:SnakeView,s:SnakeState,head:Cell,tangent:Cell,dt:number,reduced:boolean):void{
 view.clock+=dt;
 const heading=Math.atan2(tangent.y,tangent.x);
 let diff=heading-view.angle;diff=Math.atan2(Math.sin(diff),Math.cos(diff));
 view.angle=reduced?heading:view.angle+diff*(1-Math.exp(-dt/35));
 let look={x:0,y:0};
 const target=pendingEat(view)?.cell??s.food;
 if(target&&s.phase!=='lost'){
  const a=Math.atan2(target.y-head.y,target.x-head.x)-view.angle;
  look={x:Math.cos(a)*.05,y:Math.sin(a)*.05};
 }
 const k=reduced?1:1-Math.exp(-dt/80);
 view.look={x:view.look.x+(look.x-view.look.x)*k,y:view.look.y+(look.y-view.look.y)*k};
 view.eats=view.eats.filter(e=>view.clock-e.at<Math.max(EAT_FX_MS,(SIZE*SIZE+2)/2*TICK_MS));
}
