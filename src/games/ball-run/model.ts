/** Pure course and kinematics. Forward distance is positive, render z is negative. */
export const RADIUS = .38;
export const LENGTH = 24;
export const SLOPE = .16;
export interface Run { version:1; seed:number; run:number; phase:'ready'|'running'|'over'; distance:number; x:number; vx:number; height:number; vy:number; grounded:boolean; elapsed:number; best:number; reason:string }
export function createRun(seed=0x42524e,run=1,best=0):Run { return {version:1,seed,run,phase:'ready',distance:0,x:0,vx:0,height:RADIUS,vy:0,grounded:true,elapsed:0,best,reason:''}; }
export function section(seed:number,index:number) {
  const hash=((Math.imul(index+1,1664525)^seed)>>>0);
  return {length:LENGTH,gap:index>=2&&index%4===2?3:0,obstacle:index>=4&&index%4===0?(hash%2?1.5:-1.5):0};
}
export function trackAt(seed:number,distance:number) {
  const index=Math.max(0,Math.floor(distance/LENGTH)); const local=distance-index*LENGTH; const s=section(seed,index);
  // Smooth curve starts centered; derivatives bounded by .046 world units per meter.
  const phase=(seed%19)/19;
  const center=.65*(Math.sin(distance*.034+phase)-Math.sin(phase))+.3*Math.sin(distance*.061);
  return {center,width:Math.max(4.8,6-distance*.0015),ground:!(s.gap>0&&local>=17&&local<17+s.gap),index,local,...s};
}
export function steer(body:{x:number;vx:number},input:number,dt:number) {
  const target=Math.max(-1,Math.min(1,input))*6; const decay=Math.exp(-10*dt); const old=body.vx;
  body.vx=target+(old-target)*decay; body.x+=target*dt+(old-target)*(1-decay)/10;
}
export function speedAt(distance:number){return Math.min(22,12+distance*.012);}
export function step(s:Run,input:number,jump:boolean,dt:number) {
  if(s.phase!=='running'||dt<=0||dt>.05)return;
  const previous=s.height; const oldDistance=s.distance;
  if(jump&&s.grounded){s.vy=7.6;s.grounded=false;}
  steer(s,input,dt); s.distance+=speedAt(s.distance)*dt; s.elapsed+=dt;
  const track=trackAt(s.seed,s.distance);
  const supported=track.ground&&Math.abs(s.x-track.center)<=track.width/2-RADIUS*.35;
  if(s.grounded&&!supported)s.grounded=false;
  if(!s.grounded){s.height+=s.vy*dt-10*dt*dt;s.vy-=20*dt;
    if(supported&&s.vy<=0&&previous>=RADIUS-.02&&s.height<=RADIUS){s.height=RADIUS;s.vy=0;s.grounded=true;}
  }
  // Sphere vs box, using a swept longitudinal interval at fixed 120 Hz.
  if(track.obstacle!==0){
    const centerDistance=track.index*LENGTH+12;
    const dx=Math.max(0,Math.abs(s.x-(trackAt(s.seed,centerDistance).center+track.obstacle))-.48);
    const dy=Math.max(0,s.height-.95);
    const dz=Math.max(0,Math.max(oldDistance-centerDistance,centerDistance-s.distance)-.48);
    if(dx*dx+dy*dy+dz*dz<RADIUS*RADIUS){s.phase='over';s.reason='You hit a block';}
  }
  if(s.height< -7){s.phase='over';s.reason='You fell off the track';}
  s.best=Math.max(s.best,Math.floor(s.distance));
}
export function restoreRun(value:unknown):Run|null {
  if(!value||typeof value!=='object')return null;
  const s=value as Run;
  if(s.version!==1||!['ready','running','over'].includes(s.phase)||typeof s.grounded!=='boolean'||typeof s.reason!=='string'||s.reason.length>80)return null;
  for(const k of ['seed','run','distance','x','vx','height','vy','elapsed','best'] as const)if(typeof s[k]!=='number'||!Number.isFinite(s[k]))return null;
  if(!Number.isInteger(s.seed)||s.seed<1||s.seed>0xffffffff||!Number.isInteger(s.run)||s.run<1||s.run>1e8||s.distance<0||s.distance>1e8||Math.abs(s.x)>1e5||Math.abs(s.vx)>6.01||s.height< -8||s.height>3||Math.abs(s.vy)>30||s.elapsed<0||s.best<Math.floor(s.distance)||s.best>1e8)return null;
  if(s.grounded&&(Math.abs(s.height-RADIUS)>.001||s.vy!==0))return null;
  return {version:1,seed:s.seed,run:s.run,phase:s.phase,distance:s.distance,x:s.x,vx:s.vx,height:s.height,vy:s.vy,grounded:s.grounded,elapsed:s.elapsed,best:s.best,reason:s.reason};
}
