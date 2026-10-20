// Shared voxel collision for the player and entities, and block raycasting.
import {SOLID,isLiquid,AIR} from '../data/blocks';
import type {BlockSource,RayHit} from './contracts';

const EPS=1e-4,MAX_STEP=.45;
/** Unloaded chunks (-1) are solid so nothing falls into ungenerated space. */
export const blocked=(id:number)=>id<0||SOLID[id]===1;

export function boxCollides(world:BlockSource,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):boolean{
  const x1=Math.floor(maxX-EPS),y1=Math.floor(maxY-EPS),z1=Math.floor(maxZ-EPS);
  for(let y=Math.floor(minY);y<=y1;y++)for(let z=Math.floor(minZ);z<=z1;z++)for(let x=Math.floor(minX);x<=x1;x++)
    if(blocked(world.get(x,y,z)))return true;
  return false;
}
/** A box positioned by its feet centre. */
export interface Body{x:number;y:number;z:number;vx:number;vy:number;vz:number;onGround:boolean}
export const bodyCollides=(world:BlockSource,b:{x:number;y:number;z:number},halfWidth:number,height:number)=>
  boxCollides(world,b.x-halfWidth,b.y,b.z-halfWidth,b.x+halfWidth,b.y+height,b.z+halfWidth);

export interface MoveResult{hitX:boolean;hitY:boolean;hitZ:boolean}
/** Moves a body by its velocity × dt in short swept steps, stopping flush against solid blocks.
 *  Order y, x, z. Sets onGround when stopped while moving down. */
export function moveBody(world:BlockSource,b:Body,halfWidth:number,height:number,dt:number,result:MoveResult={hitX:false,hitY:false,hitZ:false}):MoveResult{
  result.hitX=result.hitY=result.hitZ=false;b.onGround=false;
  result.hitY=moveAxis(world,b,halfWidth,height,1,b.vy*dt);
  result.hitX=moveAxis(world,b,halfWidth,height,0,b.vx*dt);
  result.hitZ=moveAxis(world,b,halfWidth,height,2,b.vz*dt);
  if(!b.onGround&&b.vy<=0&&boxCollides(world,b.x-halfWidth,b.y-.02,b.z-halfWidth,b.x+halfWidth,b.y,b.z+halfWidth))b.onGround=true;
  return result;
}
function moveAxis(world:BlockSource,b:Body,hw:number,h:number,axis:0|1|2,delta:number):boolean{
  while(delta!==0){
    const step=Math.max(-MAX_STEP,Math.min(MAX_STEP,delta));delta-=step;
    if(axis===0)b.x+=step;else if(axis===1)b.y+=step;else b.z+=step;
    if(!bodyCollides(world,b,hw,h))continue;
    if(axis===0){b.x=step>0?Math.floor(b.x+hw)-hw-EPS:Math.floor(b.x-hw)+1+hw+EPS;b.vx=0;}
    else if(axis===2){b.z=step>0?Math.floor(b.z+hw)-hw-EPS:Math.floor(b.z-hw)+1+hw+EPS;b.vz=0;}
    else{
      if(step<0){b.y=Math.floor(b.y)+1;b.onGround=true;}else b.y=Math.floor(b.y+h)-h-EPS;
      b.vy=0;
    }
    return true;
  }
  return false;
}
/** Would the body collide if moved to (x,y,z)? */
export const collidesAt=(world:BlockSource,x:number,y:number,z:number,hw:number,h:number)=>boxCollides(world,x-hw,y,z-hw,x+hw,y+h,z+hw);

/** Voxel traversal (Amanatides & Woo). `pass(id)` returns true for blocks the ray passes through
 *  (default: air and liquids). */
export function raycast(world:BlockSource,ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,max:number,pass:(id:number)=>boolean=id=>id===AIR||isLiquid(id)):RayHit|null{
  let x=Math.floor(ox),y=Math.floor(oy),z=Math.floor(oz);
  const sx=Math.sign(dx),sy=Math.sign(dy),sz=Math.sign(dz);
  const tdx=dx?Math.abs(1/dx):Infinity,tdy=dy?Math.abs(1/dy):Infinity,tdz=dz?Math.abs(1/dz):Infinity;
  let tx=dx?(sx>0?x+1-ox:ox-x)*tdx:Infinity,ty=dy?(sy>0?y+1-oy:oy-y)*tdy:Infinity,tz=dz?(sz>0?z+1-oz:oz-z)*tdz:Infinity;
  let nx=0,ny=0,nz=0,t=0;
  while(t<=max){
    const id=world.get(x,y,z);
    if(id>0&&!pass(id))return{x,y,z,nx,ny,nz,id,distance:t};
    if(tx<ty&&tx<tz){x+=sx;t=tx;tx+=tdx;nx=-sx;ny=0;nz=0;}
    else if(ty<tz){y+=sy;t=ty;ty+=tdy;nx=0;ny=-sy;nz=0;}
    else{z+=sz;t=tz;tz+=tdz;nx=0;ny=0;nz=-sz;}
  }
  return null;
}
/** Ray / axis-aligned box intersection distance, or -1. */
export function rayBox(ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):number{
  let t0=0,t1=Infinity;
  const o=[ox,oy,oz],d=[dx,dy,dz],mn=[minX,minY,minZ],mx=[maxX,maxY,maxZ];
  for(let a=0;a<3;a++){
    if(Math.abs(d[a])<1e-9){if(o[a]<mn[a]||o[a]>mx[a])return -1;continue;}
    let n=(mn[a]-o[a])/d[a],f=(mx[a]-o[a])/d[a];if(n>f){const t=n;n=f;f=t;}
    t0=Math.max(t0,n);t1=Math.min(t1,f);if(t0>t1)return -1;
  }
  return t0;
}
