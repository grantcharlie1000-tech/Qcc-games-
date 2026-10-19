/** Pure course and kinematics. Distance is positive; render z is negative.
 * Height is world elevation in v2, so launch momentum and landing use the same geometry. */
export const RADIUS=.38, LENGTH=24, SLOPE=.12;
export interface Run { version:2; seed:number; run:number; phase:'ready'|'running'|'over'; distance:number; x:number; vx:number; height:number; vy:number; grounded:boolean; elapsed:number; best:number; reason:string }
export function createRun(seed=0x42524e,run=1,best=0):Run {return {version:2,seed,run,phase:'ready',distance:0,x:0,vx:0,height:RADIUS,vy:0,grounded:true,elapsed:0,best,reason:''};}
export function section(seed:number,index:number){
  const hash=(Math.imul(index+1,1664525)^seed)>>>0;
  return {length:LENGTH,gap:index>=2&&index%4===2?3:0,obstacle:index>=3&&index%4===3?(hash%2?1.05:-1.05):0,acceleration:index%4===1};
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
  if(s.phase!=='running'||dt<=0||dt>.05||!Number.isFinite(dt))return;
  const oldDistance=s.distance,oldHeight=s.height,oldTrack=trackAt(s.seed,oldDistance),speed=speedAt(oldDistance);
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
  // Fixed 120Hz swept longitudinal sphere/box test. Hazards live away from seams.
  const first=Math.floor(oldDistance/LENGTH),last=Math.floor(s.distance/LENGTH);
  for(let index=first;index<=last;index++){
    const obstacle=section(s.seed,index).obstacle;if(!obstacle)continue;
    const d=index*LENGTH+12,t=trackAt(s.seed,d);
    const dx=Math.max(0,Math.abs(s.x-(t.center+obstacle))-.45);
    const dy=Math.max(0,Math.abs(s.height-(t.elevation+.5))-.5);
    const dz=Math.max(0,Math.max(oldDistance-d,d-s.distance)-.45);
    if(dx*dx+dy*dy+dz*dz<RADIUS*RADIUS){s.phase='over';s.reason='You hit a block';}
  }
  if(s.height< -s.distance*SLOPE-8){s.phase='over';s.reason='You fell off the track';}
  s.best=Math.max(s.best,Math.floor(s.distance));
}
export function restoreRun(value:unknown):Run|null{
  if(!value||typeof value!=='object')return null;
  const s=value as Omit<Run,'version'>&{version:number};
  if(![1,2].includes(s.version)||!['ready','running','over'].includes(s.phase)||typeof s.grounded!=='boolean'||typeof s.reason!=='string'||s.reason.length>80)return null;
  for(const k of ['seed','run','distance','x','vx','height','vy','elapsed','best'] as const)if(typeof s[k]!=='number'||!Number.isFinite(s[k]))return null;
  if(!Number.isInteger(s.seed)||s.seed<1||s.seed>0xffffffff||!Number.isInteger(s.run)||s.run<1||s.run>1e8||s.distance<0||s.distance>1e8||Math.abs(s.x)>1e5||Math.abs(s.vx)>6.01||Math.abs(s.vy)>40||s.elapsed<0||s.best<Math.floor(s.distance)||s.best>1e8)return null;
  const track=trackAt(s.seed,s.distance);
  if(s.version===1){
    if(s.height< -8||s.height>3||(s.grounded&&(Math.abs(s.height-RADIUS)>.001||s.vy!==0)))return null;
    // Old course geometry is incompatible: preserve progress/seed, rebase height
    // onto this terrain. Legacy airborne runs retain their relative altitude.
    return {...s,version:2,height:track.elevation+s.height,grounded:s.grounded&&track.ground,vy:s.grounded?(track.ground?0:track.gradient*speedAt(s.distance)):s.vy};
  }
  if(s.height< -s.distance*SLOPE-9||s.height> -s.distance*SLOPE+6)return null;
  if(s.grounded&&(!track.ground||Math.abs(s.height-track.elevation-RADIUS)>.001||s.vy!==0))return null;
  return {version:2,seed:s.seed,run:s.run,phase:s.phase,distance:s.distance,x:s.x,vx:s.vx,height:s.height,vy:s.vy,grounded:s.grounded,elapsed:s.elapsed,best:s.best,reason:s.reason};
}
