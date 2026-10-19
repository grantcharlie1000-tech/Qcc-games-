/** Controlled 2D vector liquid, not a fluid/particle simulation. Volumes are
 * polygon areas. Horizontal half-plane intersections keep gravity in scene
 * coordinates even while the glass rotates. No game state is changed here. */
export interface Point {x:number;y:number}
export interface Liquid {colour:number;units:number}
export function rotatePoint(p:Point,angle:number):Point {
  const a=angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
  return {x:40+(p.x-40)*c-(p.y-24)*s,y:24+(p.x-40)*s+(p.y-24)*c};
}
export function polygonArea(points:readonly Point[]):number {
  return Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-q.x*p.y;},0))/2;
}
const interior:Point[]=[{x:19,y:34},{x:61,y:34},...Array.from({length:33},(_,i)=>({x:40+21*Math.cos(i*Math.PI/32),y:215+21*Math.sin(i*Math.PI/32)}))];
function clip(points:readonly Point[],height:number,below:boolean):Point[] {
  const result:Point[]=[];
  for(let i=0;i<points.length;i++) {
    const a=points[i],b=points[(i+1)%points.length];
    const keepA=below?a.y>=height:a.y<=height,keepB=below?b.y>=height:b.y<=height;
    if(keepA)result.push(a);
    if(keepA!==keepB) {const t=(height-a.y)/(b.y-a.y);result.push({x:a.x+t*(b.x-a.x),y:height});}
  }
  return result;
}
const unitArea=polygonArea(clip(interior,52,true))/4;
function surfaceFor(points:readonly Point[],units:number):number {
  let low=Math.min(...points.map(p=>p.y))-1,high=Math.max(...points.map(p=>p.y))+1;
  for(let i=0;i<34;i++) {const mid=(low+high)/2;if(polygonArea(clip(points,mid,true))>units*unitArea)low=mid;else high=mid;}
  return (low+high)/2;
}
export function liquidLayers(bands:readonly Liquid[],angle:number):{colour:number;points:Point[];surface:number}[] {
  const world=interior.map(p=>rotatePoint(p,angle));
  let total=0;
  return bands.filter(b=>b.units>.000001).map(b=>{
    const bottom=surfaceFor(world,total);total+=b.units;
    const surface=surfaceFor(world,total);
    return {colour:b.colour,surface,points:clip(clip(world,surface,true),bottom,false).map(p=>rotatePoint(p,-angle))};
  });
}
/** Angle at which the remaining liquid reaches the low edge of the lip. */
export function spillAngle(units:number):number {
  let low=0,high=90;
  for(let i=0;i<24;i++) {
    const angle=(low+high)/2,world=interior.map(p=>rotatePoint(p,angle));
    const lip=rotatePoint({x:61,y:26},angle);
    if(polygonArea(clip(world,lip.y,true))>Math.max(0,units)*unitArea)low=angle;else high=angle;
  }
  return (low+high)/2;
}
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
// Installed animate skill's on-screen movement curve: cubic-bezier(.77,0,.175,1).
// Solve x(t) so this matches the CSS timing function; transfer remains linear.
const ease=(n:number)=>{
  const x=clamp(n);if(x===0||x===1)return x;
  let low=0,high=1;
  for(let i=0;i<16;i++) {const t=(low+high)/2,u=1-t,at=3*u*u*t*.77+3*u*t*t*.175+t*t*t;if(at<x)low=t;else high=t;}
  const t=(low+high)/2;return 3*(1-t)*t*t+t*t*t;
};
export function pourFrame(progress:number) {
  const p=clamp(progress);
  return {phase:p<.18?'travel':p<.3?'tip':p<.75?'flow':p<.87?'upright':'return',
    transfer:clamp((p-.3)/.45),travel:p<.18?ease(p/.18):p<.87?1:1-ease((p-.87)/.13),
    tilt:p<.18?0:p<.3?ease((p-.18)/.12):p<.75?1:p<.87?1-ease((p-.75)/.12):0};
}
