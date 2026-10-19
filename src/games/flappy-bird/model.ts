import {sweepSphereBox} from '../../core/collision';
/** Logical pixels; the adapter advances this fixed 120Hz simulation at any display rate. */
export const WIDTH=360,HEIGHT=540,FLOOR=500,BIRD_X=104,RADIUS=12,GATE_WIDTH=64,STEP=1/120,SPEED=135;
const SPACING=224,FIRST=420,GRAVITY=900,LIFT=-300;
export interface Flight {version:1;seed:number;run:number;phase:'ready'|'running'|'over';tick:number;accumulator:number;y:number;vy:number;score:number;best:number;reason:string}
export function createFlight(seed=0x464c4150,run=1,best=0):Flight{return {version:1,seed,run,phase:'ready',tick:0,accumulator:0,y:260,vy:0,score:0,best,reason:''};}
export function gateAt(seed:number,index:number){
  let mixed=Math.imul(seed^(seed>>>16),0x21f0aaad);mixed=Math.imul(mixed^(mixed>>>15),0x735a2d97);
  const phase=((mixed^(mixed>>>15))>>>0)/0xffffffff*Math.PI*2;
  const center=260+44*Math.sin(index*.72+phase)+20*Math.sin(index*.31+phase*3);
  const gap=182-Math.min(32,index*1.5);
  return {index,distance:FIRST+index*SPACING,center,top:center-gap/2,bottom:center+gap/2};
}
export const distanceOf=(s:Flight)=>s.tick*STEP*SPEED;
export function visibleGates(s:Flight){
  const distance=distanceOf(s),first=Math.max(0,Math.floor((distance-FIRST-GATE_WIDTH)/SPACING));
  return Array.from({length:4},(_,i)=>{const g=gateAt(s.seed,first+i);return {...g,x:g.distance-distance};});
}
export function flap(s:Flight){if(s.phase==='over')return;s.phase='running';s.vy=LIFT;}
function cleared(tick:number){return Math.max(0,Math.ceil((tick*STEP*SPEED+BIRD_X-RADIUS-FIRST-GATE_WIDTH)/SPACING));}
function step(s:Flight){
  const oldY=s.y,oldDistance=distanceOf(s);s.tick++;s.y+=s.vy*STEP+GRAVITY*STEP*STEP/2;s.vy+=GRAVITY*STEP;
  if(s.y-RADIUS<=0||s.y+RADIUS>=FLOOR){s.phase='over';s.reason=s.y<100?'Too high!':'A splash landing!';}
  for(const g of visibleGates(s)){
    const from=[BIRD_X+oldDistance,oldY],to=[BIRD_X+distanceOf(s),s.y],centerX=g.distance+GATE_WIDTH/2;
    if(sweepSphereBox(from,to,[centerX,g.top/2],[GATE_WIDTH/2,g.top/2],RADIUS)||
      sweepSphereBox(from,to,[centerX,(g.bottom+FLOOR)/2],[GATE_WIDTH/2,(FLOOR-g.bottom)/2],RADIUS)){
      s.phase='over';s.reason='Mind the reeds!';
    }
  }
  if(s.phase==='running')s.score=cleared(s.tick);
  s.best=Math.max(s.best,s.score);
}
export function advance(s:Flight,seconds:number){
  if(s.phase!=='running'||!Number.isFinite(seconds)||seconds<=0||seconds>10)return;
  s.accumulator+=seconds;
  while(s.accumulator+1e-10>=STEP&&s.phase==='running'){s.accumulator-=STEP;step(s);}
  s.accumulator=(s.phase as Flight['phase'])==='over'?0:Math.max(0,Math.round(s.accumulator*1e12)/1e12);
}
export function restoreFlight(value:unknown):Flight|null{
  if(!value||typeof value!=='object')return null;const s=value as Flight;
  if(s.version!==1||!['ready','running','over'].includes(s.phase)||typeof s.reason!=='string'||s.reason.length>60)return null;
  for(const key of ['seed','run','tick','accumulator','y','vy','score','best'] as const)if(typeof s[key]!=='number'||!Number.isFinite(s[key]))return null;
  if(!Number.isInteger(s.seed)||s.seed<1||s.seed>0xffffffff||!Number.isInteger(s.run)||s.run<1||s.run>1e8||!Number.isInteger(s.tick)||s.tick<0||s.tick>1e9||s.accumulator<0||s.accumulator>=STEP||s.y<-20||s.y>FLOOR+20||s.vy<LIFT||s.vy>1200||!Number.isInteger(s.score)||s.score<0||!Number.isInteger(s.best)||s.best<s.score||s.best>1e9)return null;
  if(s.phase==='ready'&&(s.tick!==0||s.score!==0||s.y!==260||s.vy!==0||s.accumulator!==0))return null;
  if(s.score>cleared(s.tick)||s.score<Math.max(0,cleared(s.tick)-1))return null;
  if(s.phase==='running'&&(s.y<=RADIUS||s.y>=FLOOR-RADIUS))return null;
  return {version:1,seed:s.seed,run:s.run,phase:s.phase,tick:s.tick,accumulator:s.accumulator,y:s.y,vy:s.vy,score:s.score,best:s.best,reason:s.reason};
}
