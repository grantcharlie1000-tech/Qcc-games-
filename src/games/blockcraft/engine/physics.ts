// Shared voxel collision for the player and entities, block raycasting and fluid flow.
import {AIR,COLLISION_BOXES,FULL_CUBE,LIQUID,blockDef,isLiquid} from '../data/blocks';
import type {BlockSource,RayHit,Vec3} from './contracts';

const EPS=1e-4,MAX_STEP=.45;

/** Does the box intersect any solid block's collision shape? Unloaded chunks (-1) are solid. */
export function boxCollides(world:BlockSource,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):boolean{
  const x1=Math.floor(maxX-EPS),y1=Math.floor(maxY-EPS),z1=Math.floor(maxZ-EPS);
  for(let y=Math.floor(minY);y<=y1;y++)for(let z=Math.floor(minZ);z<=z1;z++)for(let x=Math.floor(minX);x<=x1;x++){
    const id=world.get(x,y,z);
    if(id<0||FULL_CUBE[id])return true;
    const b=COLLISION_BOXES[id];
    for(let i=0;i<b.length;i+=6)
      if(minX<x+b[i+3]-EPS&&maxX>x+b[i]+EPS&&minY<y+b[i+4]-EPS&&maxY>y+b[i+1]+EPS&&minZ<z+b[i+5]-EPS&&maxZ>z+b[i+2]+EPS)return true;
  }
  return false;
}
/** Highest collision top under the box footprint within [minY,maxY), or -Infinity. */
function topWithin(world:BlockSource,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):number{
  let top=-Infinity;const x1=Math.floor(maxX-EPS),y1=Math.floor(maxY-EPS),z1=Math.floor(maxZ-EPS);
  for(let y=Math.floor(minY);y<=y1;y++)for(let z=Math.floor(minZ);z<=z1;z++)for(let x=Math.floor(minX);x<=x1;x++){
    const id=world.get(x,y,z);
    if(id<0){top=Math.max(top,y+1);continue;}
    const b=COLLISION_BOXES[id];
    for(let i=0;i<b.length;i+=6)
      if(minX<x+b[i+3]-EPS&&maxX>x+b[i]+EPS&&minZ<z+b[i+5]-EPS&&maxZ>z+b[i+2]+EPS&&minY<y+b[i+4]-EPS&&maxY>y+b[i+1]+EPS)top=Math.max(top,y+b[i+4]);
  }
  return top;
}
/** Lowest collision bottom over the box footprint within [minY,maxY), or +Infinity. */
function bottomWithin(world:BlockSource,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):number{
  let bottom=Infinity;const x1=Math.floor(maxX-EPS),y1=Math.floor(maxY-EPS),z1=Math.floor(maxZ-EPS);
  for(let y=Math.floor(minY);y<=y1;y++)for(let z=Math.floor(minZ);z<=z1;z++)for(let x=Math.floor(minX);x<=x1;x++){
    const id=world.get(x,y,z);
    if(id<0){bottom=Math.min(bottom,y);continue;}
    const b=COLLISION_BOXES[id];
    for(let i=0;i<b.length;i+=6)
      if(minX<x+b[i+3]-EPS&&maxX>x+b[i]+EPS&&minZ<z+b[i+5]-EPS&&maxZ>z+b[i+2]+EPS&&minY<y+b[i+4]-EPS&&maxY>y+b[i+1]+EPS)bottom=Math.min(bottom,y+b[i+1]);
  }
  return bottom;
}
/** A box positioned by its feet centre. Velocities in blocks/second. */
export interface Body{x:number;y:number;z:number;vx:number;vy:number;vz:number;onGround:boolean}
export const bodyCollides=(world:BlockSource,b:{x:number;y:number;z:number},halfWidth:number,height:number)=>
  boxCollides(world,b.x-halfWidth,b.y,b.z-halfWidth,b.x+halfWidth,b.y+height,b.z+halfWidth);
export const collidesAt=(world:BlockSource,x:number,y:number,z:number,hw:number,h:number)=>boxCollides(world,x-hw,y,z-hw,x+hw,y+h,z+hw);

export interface MoveResult{hitX:boolean;hitY:boolean;hitZ:boolean;stepped:boolean}
const SCRATCH:MoveResult={hitX:false,hitY:false,hitZ:false,stepped:false};
/** Moves a body by velocity × dt in short swept steps, stopping flush against collision boxes (order y, x, z).
 *  A grounded body blocked horizontally retries the move raised by up to `stepHeight` (0.6 for walkers).
 *  Sets onGround when stopped moving down. The result object is reused unless one is passed. */
export function moveBody(world:BlockSource,b:Body,halfWidth:number,height:number,dt:number,result:MoveResult=SCRATCH,stepHeight=0):MoveResult{
  result.hitX=result.hitY=result.hitZ=result.stepped=false;
  const wasGround=b.onGround;b.onGround=false;
  result.hitY=moveVertical(world,b,halfWidth,height,b.vy*dt);
  const dx=b.vx*dt,dz=b.vz*dt,sx=b.x,sz=b.z,svx=b.vx,svz=b.vz;
  result.hitX=moveHorizontal(world,b,halfWidth,height,0,dx);
  result.hitZ=moveHorizontal(world,b,halfWidth,height,2,dz);
  if(stepHeight>0&&(result.hitX||result.hitZ)&&(wasGround||b.onGround)){
    // Step-up: from the start position, rise by the needed height (≤ stepHeight), move, then settle down.
    const ex=b.x,ez=b.z,ey=b.y,top=topWithin(world,sx+dx-halfWidth,b.y,sz+dz-halfWidth,sx+dx+halfWidth,b.y+stepHeight+EPS,sz+dz+halfWidth);
    const rise=top-b.y;
    if(rise>0&&rise<=stepHeight+EPS&&!collidesAt(world,sx,b.y+rise+EPS,sz,halfWidth,height)){
      const probe={x:sx,y:b.y+rise+EPS,z:sz,vx:svx,vy:0,vz:svz,onGround:false};
      const hx=moveHorizontal(world,probe,halfWidth,height,0,dx),hz=moveHorizontal(world,probe,halfWidth,height,2,dz);
      if(Math.hypot(probe.x-sx,probe.z-sz)>Math.hypot(ex-sx,ez-sz)+1e-3){
        b.x=probe.x;b.z=probe.z;b.y=probe.y;b.vx=probe.vx;b.vz=probe.vz;result.hitX=hx;result.hitZ=hz;result.stepped=true;b.onGround=true;
      }else{b.x=ex;b.z=ez;b.y=ey;}
    }
  }
  if(!b.onGround&&b.vy<=0&&boxCollides(world,b.x-halfWidth,b.y-.02,b.z-halfWidth,b.x+halfWidth,b.y,b.z+halfWidth))b.onGround=true;
  return result;
}
function moveVertical(world:BlockSource,b:Body,hw:number,h:number,delta:number):boolean{
  if(!Number.isFinite(delta))return false;// NaN or infinite motion would never finish
  while(delta!==0){
    const step=Math.max(-MAX_STEP,Math.min(MAX_STEP,delta));delta-=step;b.y+=step;
    if(!bodyCollides(world,b,hw,h))continue;
    if(step<0){
      const top=topWithin(world,b.x-hw,b.y,b.z-hw,b.x+hw,b.y-step,b.z+hw);
      b.y=top>-Infinity?top:Math.floor(b.y)+1;b.onGround=true;
    }else{
      const bottom=bottomWithin(world,b.x-hw,b.y+h-step,b.z-hw,b.x+hw,b.y+h,b.z+hw);
      b.y=(bottom<Infinity?bottom:Math.floor(b.y+h))-h-EPS;
    }
    b.vy=0;return true;
  }
  return false;
}
function moveHorizontal(world:BlockSource,b:Body,hw:number,h:number,axis:0|2,delta:number):boolean{
  if(!Number.isFinite(delta))return false;// NaN or infinite motion would never finish
  while(delta!==0){
    const step=Math.max(-MAX_STEP,Math.min(MAX_STEP,delta));delta-=step;
    if(axis===0)b.x+=step;else b.z+=step;
    if(!bodyCollides(world,b,hw,h))continue;
    // Back off in small increments to rest flush against partial shapes too.
    const back=-Math.sign(step);let i=0;
    if(axis===0){b.x-=step;while(i++<16&&!collidesAt(world,b.x+step/16,b.y,b.z,hw,h))b.x+=step/16;b.x+=back*EPS;b.vx=0;}
    else{b.z-=step;while(i++<16&&!collidesAt(world,b.x,b.y,b.z+step/16,hw,h))b.z+=step/16;b.z+=back*EPS;b.vz=0;}
    return true;
  }
  return false;
}

/** Voxel traversal (Amanatides & Woo). `pass(id)` returns true for blocks the ray passes through
 *  (default: air and liquids). Blocks are hit as full cells. */
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
/** Ray / axis-aligned box intersection distance, or -1. No allocation. */
export function rayBox(ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,minX:number,minY:number,minZ:number,maxX:number,maxY:number,maxZ:number):number{
  let t0=0,t1=Infinity;
  if(Math.abs(dx)<1e-9){if(ox<minX||ox>maxX)return -1;}else{let n=(minX-ox)/dx,f=(maxX-ox)/dx;if(n>f){const t=n;n=f;f=t;}if(n>t0)t0=n;if(f<t1)t1=f;if(t0>t1)return -1;}
  if(Math.abs(dy)<1e-9){if(oy<minY||oy>maxY)return -1;}else{let n=(minY-oy)/dy,f=(maxY-oy)/dy;if(n>f){const t=n;n=f;f=t;}if(n>t0)t0=n;if(f<t1)t1=f;if(t0>t1)return -1;}
  if(Math.abs(dz)<1e-9){if(oz<minZ||oz>maxZ)return -1;}else{let n=(minZ-oz)/dz,f=(maxZ-oz)/dz;if(n>f){const t=n;n=f;f=t;}if(n>t0)t0=n;if(f<t1)t1=f;if(t0>t1)return -1;}
  return t0;
}
/** Liquid surface height (0..1 within the cell) from its level: sources and falling liquid are full. */
export function liquidHeight(id:number):number{
  const l=blockDef(id).liquid;if(!l)return 0;
  return l.falling||l.level===0?8/9:(8-l.level)/9;
}
/** Normalised horizontal flow of the liquid at a voxel (vanilla rule: toward lower levels / drops), or zero. */
const FLOW_DX=[1,-1,0,0],FLOW_DZ=[0,0,1,-1];
export function flowAt(world:BlockSource,x:number,y:number,z:number,out:Vec3={x:0,y:0,z:0}):Vec3{
  out.x=out.y=out.z=0;const id=world.get(x,y,z);if(id<0||!LIQUID[id])return out;
  const kind=LIQUID[id],level=blockDef(id).liquid!.falling?0:blockDef(id).liquid!.level;
  for(let i=0;i<4;i++){
    const dx=FLOW_DX[i],dz=FLOW_DZ[i],n=world.get(x+dx,y,z+dz);
    if(n===AIR){const below=world.get(x+dx,y-1,z+dz);if(below===AIR||LIQUID[below]===kind){out.x+=dx*8;out.z+=dz*8;continue;}}
    if(n<0||LIQUID[n]!==kind)continue;
    const nl=blockDef(n).liquid!.falling?0:blockDef(n).liquid!.level;const diff=nl-level;out.x+=dx*diff;out.z+=dz*diff;
  }
  const len=Math.hypot(out.x,out.z);if(len>0){out.x/=len;out.z/=len;}
  return out;
}
