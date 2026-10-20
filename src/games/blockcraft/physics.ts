import {SOLID,WATER,AIR} from './blocks';

export interface BlockSource{get(x:number,y:number,z:number):number}
export interface PlayerState{x:number;y:number;z:number;vx:number;vy:number;vz:number;yaw:number;pitch:number;onGround:boolean;inWater:boolean}
export interface MoveInput{forward:number;right:number;jump:boolean;sprint:boolean}

export const HALF_WIDTH=.3,HEIGHT=1.8,EYE=1.62;
export const WALK=4.3,SPRINT=5.8,SWIM=2.6,GRAVITY=28,JUMP=8.6,TERMINAL=40;
const EPS=1e-4,MAX_STEP=.45;

export function createPlayer(x:number,y:number,z:number):PlayerState{return{x,y,z,vx:0,vy:0,vz:0,yaw:0,pitch:-.25,onGround:false,inWater:false};}

/** Unloaded chunks (-1) are solid so the player never falls into ungenerated space. */
const blocked=(id:number)=>id<0||SOLID[id]===1;

export function boxCollides(world:BlockSource,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):boolean{
  const x1=Math.floor(maxX-EPS),y1=Math.floor(maxY-EPS),z1=Math.floor(maxZ-EPS);
  for(let y=Math.floor(minY);y<=y1;y++)for(let z=Math.floor(minZ);z<=z1;z++)for(let x=Math.floor(minX);x<=x1;x++)
    if(blocked(world.get(x,y,z)))return true;
  return false;
}
export const playerCollides=(world:BlockSource,p:{x:number;y:number;z:number})=>
  boxCollides(world,p.x-HALF_WIDTH,p.y,p.z-HALF_WIDTH,p.x+HALF_WIDTH,p.y+HEIGHT,p.z+HALF_WIDTH);

/** Moves along one axis in short sweeps and stops flush against the first solid block. */
function moveAxis(world:BlockSource,p:PlayerState,axis:0|1|2,delta:number){
  while(delta!==0){
    const step=Math.max(-MAX_STEP,Math.min(MAX_STEP,delta));delta-=step;
    if(axis===0)p.x+=step;else if(axis===1)p.y+=step;else p.z+=step;
    if(!playerCollides(world,p))continue;
    if(axis===0){p.x=step>0?Math.floor(p.x+HALF_WIDTH)-HALF_WIDTH-EPS:Math.floor(p.x-HALF_WIDTH)+1+HALF_WIDTH+EPS;p.vx=0;}
    else if(axis===2){p.z=step>0?Math.floor(p.z+HALF_WIDTH)-HALF_WIDTH-EPS:Math.floor(p.z-HALF_WIDTH)+1+HALF_WIDTH+EPS;p.vz=0;}
    else{
      if(step<0){p.y=Math.floor(p.y)+1;p.onGround=true;}else p.y=Math.floor(p.y+HEIGHT)-HEIGHT-EPS;
      p.vy=0;
    }
    return;
  }
}

export function stepPlayer(p:PlayerState,input:MoveInput,world:BlockSource,dt:number){
  // Recover from being embedded (for example after a chunk loads around the player).
  for(let i=0;i<4&&playerCollides(world,p);i++)p.y=Math.floor(p.y)+1;
  p.inWater=world.get(Math.floor(p.x),Math.floor(p.y+.4),Math.floor(p.z))===WATER;
  const sin=Math.sin(p.yaw),cos=Math.cos(p.yaw);
  let wx=-sin*input.forward+cos*input.right,wz=-cos*input.forward-sin*input.right;
  const length=Math.hypot(wx,wz);if(length>1){wx/=length;wz/=length;}
  const speed=p.inWater?SWIM:input.sprint?SPRINT:WALK,control=p.onGround||p.inWater?18:6,blend=Math.min(1,control*dt);
  p.vx+=(wx*speed-p.vx)*blend;p.vz+=(wz*speed-p.vz)*blend;
  if(p.inWater){
    p.vy-=7*dt;p.vy*=Math.pow(.15,dt);
    if(input.jump)p.vy=Math.min(p.vy+22*dt,3.6);
  }else{
    p.vy=Math.max(-TERMINAL,p.vy-GRAVITY*dt);
    if(input.jump&&p.onGround)p.vy=JUMP;
  }
  p.onGround=false;
  moveAxis(world,p,1,p.vy*dt);moveAxis(world,p,0,p.vx*dt);moveAxis(world,p,2,p.vz*dt);
  // Ground contact persists while standing still.
  if(!p.onGround&&p.vy<=0&&boxCollides(world,p.x-HALF_WIDTH,p.y-.02,p.z-HALF_WIDTH,p.x+HALF_WIDTH,p.y,p.z+HALF_WIDTH))p.onGround=true;
}

export interface RayHit{x:number;y:number;z:number;nx:number;ny:number;nz:number;id:number;distance:number}
/** Voxel traversal (Amanatides & Woo). Water and air are transparent to the ray. */
export function raycast(world:BlockSource,ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,max:number):RayHit|null{
  let x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz);
  const sx=Math.sign(dx),sy=Math.sign(dy),sz=Math.sign(dz);
  const tdx=dx?Math.abs(1/dx):Infinity,tdy=dy?Math.abs(1/dy):Infinity,tdz=dz?Math.abs(1/dz):Infinity;
  let tx=dx?(sx>0?x+1-ox:ox-x)*tdx:Infinity,ty=dy?(sy>0?y+1-oy:oy-y)*tdy:Infinity,tz=dz?(sz>0?z+1-oz:oz-z)*tdz:Infinity;
  let nx=0,ny=0,nz=0,t=0;
  while(t<=max){
    const id=world.get(x,y,z);
    if(id>AIR&&id!==WATER)return{x,y,z,nx,ny,nz,id,distance:t};
    if(tx<ty&&tx<tz){x+=sx;t=tx;tx+=tdx;nx=-sx;ny=0;nz=0;}
    else if(ty<tz){y+=sy;t=ty;ty+=tdy;nx=0;ny=-sy;nz=0;}
    else{z+=sz;t=tz;tz+=tdz;nx=0;ny=0;nz=-sz;}
  }
  return null;
}
