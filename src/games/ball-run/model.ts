import {sweepSphereBox} from '../../core/collision';
export {sweepSphereBox} from '../../core/collision';
/** Pure course and kinematics. Distance is positive; render z is negative.
 * Height is world elevation in v2, so launch momentum and landing use the same geometry. */
export const RADIUS=.38, LENGTH=24, SLOPE=.12;
export interface Run { version:3; course:1|2; seed:number; run:number; phase:'ready'|'running'|'over'; distance:number; x:number; vx:number; height:number; vy:number; grounded:boolean; elapsed:number; best:number; reason:string }
export function createRun(seed=0x42524e,run=1,best=0):Run {return {version:3,course:2,seed,run,phase:'ready',distance:0,x:0,vx:0,height:RADIUS,vy:0,grounded:true,elapsed:0,best,reason:''};}
export interface Obstacle { local:number; x:number; width:number; height:number; depth:number }
function hash(seed:number,index:number){let h=(seed^Math.imul(index+1,0x9e3779b9))>>>0;h=Math.imul(h^(h>>>16),0x21f0aaad);h=Math.imul(h^(h>>>15),0x735a2d97);return (h^(h>>>15))>>>0;}
/** Two introductory sections, isolated ramps, and at least a .22m clearance
 * beyond the ball on the center line. No hazards on launches or speed gates. */
export function section(seed:number,index:number,course:1|2=2){
  const classic=(Math.imul(index+1,1664525)^seed)>>>0,h=hash(seed,index);
  const gap=index>=2&&index%4===2?3:0,acceleration=index%4===1;
  const obstacles:Obstacle[]=[];
  if(course===1){if(index>=3&&index%4===3)obstacles.push({local:12,x:classic%2?1.05:-1.05,width:.9,height:1,depth:.9});}
  else if(index>=3&&!gap&&!acceleration){
    // Keep the first block familiar; subsequent sections vary size, location,
    // side and paired gates. The seed and section alone determine every shape.
    const tutorial=index===3,x=tutorial?1.05:1.25,width=tutorial?.9:.7+((h>>>5)%30)/100;
    const local=tutorial?12:8+((h>>>10)%801)/100;
    const block={local,x:((tutorial?classic:h)&1?1:-1)*x,width,height:tutorial?1:.8+((h>>>19)%51)/100,depth:tutorial?.9:.7+((h>>>24)%61)/100};
    obstacles.push(block);
    if(!tutorial&&(h&6)===2)obstacles.push({...block,x:-block.x});
  }
  return {length:LENGTH,gap,obstacle:obstacles[0]?.x??0,obstacles,acceleration};
}
export function trackAt(seed:number,distance:number){
  const index=Math.max(0,Math.floor(distance/LENGTH)),local=distance-index*LENGTH,s=section(seed,index);
  const phase=(seed%19)/19;
  const center=.65*(Math.sin(distance*.034+phase)-Math.sin(phase))+.3*Math.sin(distance*.061);
  // Each chunk meets its neighbours at zero offset and full width. A launch ramp
  // rises 1.5m before the 3m gap; the landing is lower, never an impossible wall.
  let rise=0,gradient=0;
  if(s.gap){
    if(local>=12&&local<17){rise=(local-12)*.3;gradient=.3;}
    else if(local>=17&&local<20){rise=1.5;}
    else if(local>=20){rise=(24-local)*.05;gradient=-.05;}
  }else{rise=.45*Math.sin(Math.PI*local/LENGTH)**2;gradient=.45*Math.PI/LENGTH*Math.sin(2*Math.PI*local/LENGTH);}
  const narrow=index%4===3?1.5*Math.sin(Math.PI*local/LENGTH)**2:0;
  return {center,width:5.4-narrow,elevation:-distance*SLOPE+rise,gradient:gradient-SLOPE,ground:!(s.gap&&local>=17&&local<20),boost:s.acceleration&&local>=4&&local<=12,index,local,...s};
}
export function speedAt(distance:number){
  const index=Math.floor(distance/LENGTH),local=distance-index*LENGTH;
  const boost=index%4===1&&local>=4&&local<=12?1+.4*Math.sin((local-4)*Math.PI/8):1;
  return Math.min(22,12+distance*.012)*boost;
}
export function steer(body:{x:number;vx:number},input:number,dt:number){
  const target=Math.max(-1,Math.min(1,input))*6,decay=Math.exp(-10*dt),old=body.vx;
  body.vx=target+(old-target)*decay;body.x+=target*dt+(old-target)*(1-decay)/10;
}
export function step(s:Run,input:number,dt:number){
  if(s.phase!=='running'||dt<=0||dt>.05||!Number.isFinite(dt)||!Number.isFinite(input))return;
  const oldDistance=s.distance,oldHeight=s.height,oldX=s.x,oldTrack=trackAt(s.seed,oldDistance),speed=speedAt(oldDistance);
  steer(s,input,dt);s.distance+=speed*dt;s.elapsed+=dt;
  const track=trackAt(s.seed,s.distance),supported=track.ground&&Math.abs(s.x-track.center)<=track.width/2-RADIUS*.35;
  if(s.grounded){
    if(supported){s.height=track.elevation+RADIUS;s.vy=0;}
    else{s.grounded=false;s.vy=oldTrack.gradient*speed;}
  }
  if(!s.grounded){
    s.height+=s.vy*dt-10*dt*dt;s.vy-=20*dt;
    // Require an actual downward crossing of the surface, so coming back under
    // a road after an edge fall cannot teleport the ball onto it.
    if(supported&&s.vy<=track.gradient*speed&&oldHeight>=oldTrack.elevation+RADIUS-.025&&s.height<=track.elevation+RADIUS){s.height=track.elevation+RADIUS;s.vy=0;s.grounded=true;}
  }
  // Collider dimensions and positions are the same data the renderer consumes.
  const first=Math.max(0,Math.floor((oldDistance-RADIUS)/LENGTH)),last=Math.floor((s.distance+RADIUS)/LENGTH);
  for(let index=first;index<=last;index++)for(const obstacle of section(s.seed,index,s.course).obstacles){
    const d=index*LENGTH+obstacle.local,t=trackAt(s.seed,d);
    if(sweepSphereBox([oldX,oldHeight,oldDistance],[s.x,s.height,s.distance],
      [t.center+obstacle.x,t.elevation+obstacle.height/2,d],[obstacle.width/2,obstacle.height/2,obstacle.depth/2],RADIUS)){
      s.phase='over';s.reason='You hit a block';
    }
  }
  if(s.height< -s.distance*SLOPE-8){s.phase='over';s.reason='You fell off the track';}
  s.best=Math.max(s.best,Math.floor(s.distance));
}
export function restoreRun(value:unknown):Run|null{
  if(!value||typeof value!=='object')return null;
  const s=value as Omit<Run,'version'>&{version:number};
  if(![1,2,3].includes(s.version)||!['ready','running','over'].includes(s.phase)||typeof s.grounded!=='boolean'||typeof s.reason!=='string'||s.reason.length>80)return null;
  for(const k of ['seed','run','distance','x','vx','height','vy','elapsed','best'] as const)if(typeof s[k]!=='number'||!Number.isFinite(s[k]))return null;
  if(!Number.isInteger(s.seed)||s.seed<1||s.seed>0xffffffff||!Number.isInteger(s.run)||s.run<1||s.run>1e8||s.distance<0||s.distance>1e8||Math.abs(s.x)>1e5||Math.abs(s.vx)>6.01||Math.abs(s.vy)>40||s.elapsed<0||s.best<Math.floor(s.distance)||s.best>1e8)return null;
  if(s.version===3&&s.course!==1&&s.course!==2)return null;
  const track=trackAt(s.seed,s.distance);
  if(s.version===1){
    if(s.height< -8||s.height>3||(s.grounded&&(Math.abs(s.height-RADIUS)>.001||s.vy!==0)))return null;
    // Old course geometry is incompatible: preserve progress/seed, rebase height
    // onto this terrain. Legacy airborne runs retain their relative altitude.
    return {...s,version:3,course:1,height:track.elevation+s.height,grounded:s.grounded&&track.ground,vy:s.grounded?(track.ground?0:track.gradient*speedAt(s.distance)):s.vy};
  }
  if(s.height< -s.distance*SLOPE-9||s.height> -s.distance*SLOPE+6)return null;
  if(s.grounded&&(!track.ground||Math.abs(s.height-track.elevation-RADIUS)>.001||s.vy!==0))return null;
  return {version:3,course:s.version===3?s.course:1,seed:s.seed,run:s.run,phase:s.phase,distance:s.distance,x:s.x,vx:s.vx,height:s.height,vy:s.vy,grounded:s.grounded,elapsed:s.elapsed,best:s.best,reason:s.reason};
}
