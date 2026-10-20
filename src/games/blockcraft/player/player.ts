// STUB player controller (owned by the player & controls agent: sneaking edges, ladders, flight,
// swimming, view bobbing, fall tracking). This version: walking, sprinting, jumping, swimming
// and creative flight at 60 Hz with voxel collision.
import {isWater,isLava,CLIMBABLE} from '../data/blocks';
import {CH,PHYSICS_HZ} from '../engine/constants';
import {moveBody,bodyCollides} from '../engine/physics';
import type {Game,PlayerService,PlayerState,Vec3} from '../engine/contracts';

export const HALF_WIDTH=.3,HEIGHT=1.8,EYE=1.62,SNEAK_EYE=1.27;
export const WALK=4.317,SPRINT=5.612,SNEAK=1.31,SWIM=2.2,FLY=10.9,GRAVITY=32,JUMP=9,TERMINAL=78;
const STEP=1/PHYSICS_HZ;

export function createPlayerState(x=.5,y=CH,z=.5):PlayerState{
  return{x,y,z,vx:0,vy:0,vz:0,yaw:0,pitch:-.25,onGround:false,inWater:false,inLava:false,headInWater:false,onLadder:false,
    sneaking:false,sprinting:false,flying:false,fallDistance:0,spawn:{x,y,z},bedSpawn:null};
}
export function createPlayer(game:Game):PlayerService{
  const p=createPlayerState();let acc=0,lastSpace=0,peakY=0;
  function step(){
    const w=game.world,input=game.input,creative=game.settings.mode==='creative';
    for(let i=0;i<4&&bodyCollides(w,p,HALF_WIDTH,HEIGHT);i++)p.y=Math.floor(p.y)+1;
    const fx=Math.floor(p.x),fz=Math.floor(p.z);
    p.inWater=isWater(w.get(fx,Math.floor(p.y+.4),fz));p.inLava=isLava(w.get(fx,Math.floor(p.y+.4),fz));
    p.headInWater=isWater(w.get(fx,Math.floor(p.y+service.eyeHeight()),fz));
    p.onLadder=CLIMBABLE[Math.max(0,w.get(fx,Math.floor(p.y),fz))]===1;
    if(input.pressed('jump')&&creative){const now=performance.now();if(now-lastSpace<300){p.flying=!p.flying;p.vy=0;}lastSpace=now;}
    if(!creative)p.flying=false;
    p.sneaking=input.down('sneak')&&!p.flying;
    const move=input.move();p.sprinting=(input.down('sprint')||p.sprinting&&move.forward>0)&&move.forward>0&&!p.sneaking;
    const sin=Math.sin(p.yaw),cos=Math.cos(p.yaw);
    let wx=-sin*move.forward+cos*move.strafe,wz=-cos*move.forward-sin*move.strafe;const len=Math.hypot(wx,wz);if(len>1){wx/=len;wz/=len;}
    const speed=p.flying?FLY*(p.sprinting?2:1):p.inWater||p.inLava?SWIM:p.sneaking?SNEAK:p.sprinting?SPRINT:WALK;
    const control=p.onGround||p.inWater||p.flying?18:5,blend=Math.min(1,control*STEP);
    p.vx+=(wx*speed-p.vx)*blend;p.vz+=(wz*speed-p.vz)*blend;
    const jump=input.down('jump');
    if(p.flying){p.vy+=((jump?8:0)-(input.down('sneak')?8:0)-p.vy)*Math.min(1,10*STEP);}
    else if(p.inWater||p.inLava){p.vy-=8*STEP;p.vy*=Math.pow(.1,STEP);if(jump)p.vy=Math.min(p.vy+24*STEP,3.4);}
    else if(p.onLadder){p.vy=jump||Math.hypot(p.vx,p.vz)>.5&&move.forward>0?2.4:p.sneaking?0:Math.max(p.vy-GRAVITY*STEP,-2.4);}
    else{p.vy=Math.max(-TERMINAL,p.vy-GRAVITY*STEP);if(jump&&p.onGround)p.vy=JUMP;}
    const wasGround=p.onGround;
    moveBody(w,p,HALF_WIDTH,HEIGHT,STEP);
    if(p.onGround||p.inWater||p.onLadder||p.flying){
      if(!wasGround&&p.onGround&&!p.inWater&&!p.flying)game.survival.land(Math.max(0,peakY-p.y));
      peakY=p.y;p.fallDistance=0;
    }else{peakY=Math.max(peakY,p.y);p.fallDistance=Math.max(0,peakY-p.y);}
    if(p.y<-64)game.survival.damage(4,{kind:'void'});
  }
  const service:PlayerService={
    state:p,width:HALF_WIDTH*2,height:HEIGHT,
    eyeHeight:()=>p.sneaking?SNEAK_EYE:EYE,
    eye:()=>({x:p.x,y:p.y+service.eyeHeight(),z:p.z}),
    look(){const c=Math.cos(p.pitch);return{x:-Math.sin(p.yaw)*c,y:Math.sin(p.pitch),z:-Math.cos(p.yaw)*c};},
    teleport(x,y,z){p.x=x;p.y=y;p.z=z;p.vx=p.vy=p.vz=0;peakY=y;p.fallDistance=0;},
    push(vx,vy,vz){p.vx+=vx;p.vy+=vy;p.vz+=vz;},
    rotate(dy,dp){p.yaw+=dy;p.pitch=Math.max(-1.55,Math.min(1.55,p.pitch+dp));},
    frame(dt){
      if(game.state!=='playing'&&game.state!=='screen'){acc=0;return;}
      acc+=dt;while(acc>=STEP){step();acc-=STEP;}
      game.render.setFovScale(p.sprinting?1.12:p.flying?1.06:1);
    },
    reset(){Object.assign(p,createPlayerState());acc=0;},
    serialize:()=>({x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch,flying:p.flying,spawn:p.spawn,bedSpawn:p.bedSpawn}),
    restore(v){
      if(!v||typeof v!=='object')return;
      const d=v as Record<string,unknown>,num=(k:string)=>typeof d[k]==='number'&&Number.isFinite(d[k] as number)?d[k] as number:null;
      const x=num('x'),y=num('y'),z=num('z');
      if(x!==null&&y!==null&&z!==null&&Math.abs(x)<1e6&&Math.abs(z)<1e6&&y>-64&&y<CH+64)service.teleport(x,y,z);
      const yaw=num('yaw'),pitch=num('pitch');if(yaw!==null)p.yaw=yaw;if(pitch!==null)p.pitch=Math.max(-1.55,Math.min(1.55,pitch));
      p.flying=d.flying===true;
      const vec=(o:unknown):Vec3|null=>o&&typeof o==='object'&&['x','y','z'].every(k=>Number.isFinite((o as Record<string,number>)[k]))?{...(o as Vec3)}:null;
      p.spawn=vec(d.spawn)??p.spawn;p.bedSpawn=vec(d.bedSpawn);
    }
  };
  return service;
}
