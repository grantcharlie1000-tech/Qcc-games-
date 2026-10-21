// Block shapes other than cubes and liquids, modelled on the vanilla Java block models (pixel units, 16 = one block).
// Every emitter writes through the shared MeshBuilder; positions stay on the 1/16 grid of the MeshPart layout.
import * as blocks from '../data/blocks';
import * as constants from '../engine/constants';
import type {MeshBuilder} from './mesher-builder';
import * as builder from './mesher-builder';
import * as tables from './mesher-tables';
import * as liquidModule from './shapes-liquid';
// Module-local aliases: hot loops read plain constants rather than live import bindings.
const {FACE_TILE,LAYER}=blocks;
const {CS}=constants;
const {M_KEEP,M_MIRROR,M_NOCULL,M_ROT,M_SHADE,M_SOLID,M_UV}=builder;
const {DOOR_BOX,DOOR_FRONT,DOOR_UPPER,EMISSIVE,FACE_DX,FACE_DZ,FACING_FACE,FLAG_EMISSIVE,FLAG_SWAY,N_AXIS,N_SIGN,OPPOSITE_FACE,PLANT_OFFSET,SH_BED,SH_CACTUS,SH_CROP,SH_CROSS,SH_DOOR,SH_FARMLAND,SH_FIRE,SH_FLAT,SH_LADDER,SH_LANTERN,SH_LIQUID,SH_SLAB,SH_SNOW,SH_STAIRS,SH_TORCH,SLAB_TOP,STAIRS_BACK,SWAY,TINT_KIND}=tables;
const {liquid}=liquidModule;

/** Deterministic 32-bit hash of a world column (plant offsets, lily pad rotation). */
export function positionHash(x:number,z:number):number{
  let h=Math.imul(x|0,3129871)^Math.imul(z|0,116129781);
  h=Math.imul(h^(h>>>15),0x2c1b3c6d);h=Math.imul(h^(h>>>12),0x297a2d39);
  return (h^(h>>>15))>>>0;
}
/** Vanilla-style random model offset of flowers (horizontal) and short grass / ferns (horizontal and down), in pixels:
 *  x and z within ±4 (a quarter block), y within -3..0. Zero for every other block. Pure, so the outline can follow it. */
export function plantOffset(id:number,x:number,z:number,out:{x:number;y:number;z:number}):{x:number;y:number;z:number}{
  const kind=PLANT_OFFSET[id];out.x=out.y=out.z=0;
  if(!kind)return out;
  const h=positionHash(x,z);
  out.x=Math.round(((h&15)/15-.5)*8);out.z=Math.round((((h>>>8)&15)/15-.5)*8);
  if(kind===2)out.y=Math.round((((h>>>4)&15)/15-1)*3.2);
  return out;
}
const offset={x:0,y:0,z:0};

/** Emits the block at padded index p, chunk cell (x,y,z), for every shape except cubes. */
export function emitShape(b:MeshBuilder,shape:number,p:number,x:number,y:number,z:number,id:number){
  switch(shape){
    case SH_CROSS:return cross(b,p,x,y,z,id);
    case SH_CROP:return crop(b,p,x,y,z,id);
    case SH_TORCH:return torch(b,p,x,y,z,id);
    case SH_LIQUID:return liquid(b,p,x,y,z,id);
    case SH_SLAB:return slab(b,p,x,y,z,id,SLAB_TOP[id]?8:0,SLAB_TOP[id]?16:8);
    case SH_SNOW:return slab(b,p,x,y,z,id,0,2);
    case SH_FARMLAND:return slab(b,p,x,y,z,id,0,15);
    case SH_CACTUS:return cactus(b,p,x,y,z,id);
    case SH_LADDER:return ladder(b,p,x,y,z,id);
    case SH_DOOR:return door(b,p,x,y,z,id);
    case SH_BED:return bed(b,p,x,y,z,id);
    case SH_FLAT:return flat(b,p,x,y,z,id);
    case SH_STAIRS:return stairs(b,p,x,y,z,id);
    case SH_LANTERN:return lantern(b,p,x,y,z,id);
    case SH_FIRE:return fire(b,p,x,y,z,id);
  }
}

/** A vertical plane from (ax,az) to (bx,bz) (chunk pixels), y0..y0+h, uv covering the whole tile (stretched when h ≠ 16).
 *  Flat light, no directional shade (vanilla `shade: false`). Sway applies to the top vertices only. */
function plane(b:MeshBuilder,ax:number,az:number,bx:number,bz:number,y0:number,h:number,light:number,flags:number,topFlags:number,layer:number,tile:number,rgb:number){
  const qx=b.qx,qy=b.qy,qz=b.qz,qu=b.qu,qv=b.qv;
  qx[0]=qx[1]=ax;qz[0]=qz[1]=az;qx[2]=qx[3]=bx;qz[2]=qz[3]=bz;
  qy[0]=qy[2]=y0+h;qy[1]=qy[3]=y0;
  qu[0]=qu[1]=0;qu[2]=qu[3]=16;qv[0]=qv[2]=16;qv[1]=qv[3]=0;
  for(let c=0;c<4;c++){b.ql[c]=light;b.qs[c]=255;b.qf[c]=flags|(c===0||c===2?topFlags:0);}
  b.emit(layer,tile,rgb,false);
}
const plantLight=(b:MeshBuilder,p:number,id:number)=>EMISSIVE[id]&&!b.iso?0xff:b.light[p];
const plantFlags=(id:number)=>EMISSIVE[id]?FLAG_EMISSIVE:0;
const plantSway=(id:number)=>SWAY[id]?FLAG_SWAY:0;
const SIDES=[0,1,4,5],CROP_PLANES=[4,12],FIRE_DIAGONALS=[0,0,16,16,0,16,16,0];
/** cross: two diagonal planes corner to corner (vanilla 0.8..15.2 rounded to the pixel grid), with the vanilla random
 *  offset for flowers and grass. The cutout layer is drawn without back-face culling, so one quad per plane. */
function cross(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  if(b.iso)offset.x=offset.y=offset.z=0;else plantOffset(id,b.wx+x,b.wz+z,offset);
  const light=plantLight(b,p,id),flags=plantFlags(id),top=plantSway(id),rgb=b.tintColour(TINT_KIND[id*6],x+z*CS),tile=FACE_TILE[id*6],layer=LAYER[id];
  const ox=x*16+offset.x,oy=y*16+offset.y,oz=z*16+offset.z;
  plane(b,ox+1,oz+1,ox+15,oz+15,oy,16,light,flags,top,layer,tile,rgb);
  plane(b,ox+1,oz+15,ox+15,oz+1,oy,16,light,flags,top,layer,tile,rgb);
}
/** crop: four planes in a # pattern at 4 and 12 px, sunk 1 px into the farmland like vanilla (y -1..15). */
function crop(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  const light=plantLight(b,p,id),flags=plantFlags(id),top=plantSway(id),rgb=b.tintColour(TINT_KIND[id*6],x+z*CS),tile=FACE_TILE[id*6],layer=LAYER[id];
  const ox=x*16,oy=y*16-1,oz=z*16;
  for(let i=0;i<2;i++){
    const k=CROP_PLANES[i];
    plane(b,ox+k,oz,ox+k,oz+16,oy,16,light,flags,top,layer,tile,rgb);
    plane(b,ox,oz+k,ox+16,oz+k,oy,16,light,flags,top,layer,tile,rgb);
  }
}
/** torch: the vanilla 2×10 px stick (tile columns 7-8, rows 6-15) with its flame top and bottom cap. A wall torch
 *  (facing = out of the wall) stands 3 px up with its base against the wall and leans toward +facing by 4 px over its
 *  10 px height (atan 0.4 ≈ 22°, the closest the pixel grid gets to vanilla's 22.5°). */
function torch(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  const ff=FACING_FACE[id],tile=FACE_TILE[id*6],layer=LAYER[id],flags=FLAG_EMISSIVE;
  const ox=x*16,oy=y*16,oz=z*16;
  b.setBox(7,0,7,9,10,9);
  for(let f=0;f<6;f++){
    if(f===2)b.setUV(7,8,9,10);else if(f===3)b.setUV(7,1,9,3);
    // The floor torch's base may be culled by its support; a wall torch's model base is not on its cell floor.
    if(!b.boxFace(p,0,0,0,id,f,tile,layer,0xffffff,flags,(ff===255?0:M_NOCULL)|(f===2||f===3?M_UV:0)|M_KEEP))continue;
    const qx=b.qx,qy=b.qy,qz=b.qz;
    for(let c=0;c<4;c++){
      if(ff===255){qx[c]+=ox;qy[c]+=oy;qz[c]+=oz;continue;}
      const fx=FACE_DX[ff],fz=FACE_DZ[ff],dx=qx[c]-8,dz=qz[c]-8,out=-7+qy[c]*.4;
      qx[c]=ox+8+out*fx+dx*fx-dz*fz;qz[c]=oz+8+out*fz+dx*fz+dz*fx;qy[c]=oy+qy[c]+3;
    }
    b.emit(layer,tile,0xffffff,false);
  }
}
/** Full-width boxes from y0 to y1 px: slabs (bottom 0..8, top 8..16), snow layers (0..2) and farmland (0..15). */
function slab(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number,y0:number,y1:number){
  const col=x+z*CS,layer=LAYER[id];
  b.setBox(0,y0,0,16,y1,16);
  for(let f=0;f<6;f++)b.boxFace(p,x,y,z,id,f,FACE_TILE[id*6+f],layer,b.tintColour(TINT_KIND[id*6+f],col),0,M_SOLID);
}
/** cactus: full top and bottom, sides inset 1 px (vanilla). */
function cactus(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  const layer=LAYER[id],col=x+z*CS;
  for(let f=0;f<6;f++){
    if(f===0)b.setBox(0,0,0,15,16,16);else if(f===1)b.setBox(1,0,0,16,16,16);
    else if(f===4)b.setBox(0,0,0,16,16,15);else if(f===5)b.setBox(0,0,1,16,16,16);else b.setBox(0,0,0,16,16,16);
    b.boxFace(p,x,y,z,id,f,FACE_TILE[id*6+f],layer,b.tintColour(TINT_KIND[id*6+f],col),0,M_SOLID);
  }
}
/** ladder: one quad 1 px in front of the supporting wall (at -facing), facing out of it. */
function ladder(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  const ff=FACING_FACE[id];if(ff===255)return;
  const k=N_SIGN[ff]>0?1:15,axis=N_AXIS[ff];
  b.setBox(axis===0?k:0,0,axis===2?k:0,axis===0?k:16,16,axis===2?k:16);
  b.boxFace(p,x,y,z,id,ff,FACE_TILE[id*6+ff],LAYER[id],b.tintColour(TINT_KIND[id*6+ff],x+z*CS),0,M_NOCULL);
}
/** door: the 3/16 panel of doorPanelBox; the lower half has no top face and the upper half no bottom face. The face
 *  opposite the front is mirrored so the painted panel lines up through the door, like vanilla. */
function door(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  const o=id*6,upper=DOOR_UPPER[id],back=OPPOSITE_FACE[DOOR_FRONT[id]],layer=LAYER[id];
  b.setBox(DOOR_BOX[o],DOOR_BOX[o+1],DOOR_BOX[o+2],DOOR_BOX[o+3],DOOR_BOX[o+4],DOOR_BOX[o+5]);
  for(let f=0;f<6;f++){
    if((f===2&&!upper)||(f===3&&upper))continue;
    b.boxFace(p,x,y,z,id,f,FACE_TILE[o+f],layer,0xffffff,0,M_SOLID|(f===back?M_MIRROR:0));
  }
}
/** bed: a 9 px box; the top tile is turned so its row 0 points to the head (-facing), and the halves hide the faces
 *  they share through the bed profile. */
function bed(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  const ff=FACING_FACE[id],layer=LAYER[id];
  b.rotX=ff===255?0:FACE_DX[ff];b.rotZ=ff===255?1:FACE_DZ[ff];
  b.setBox(0,0,0,16,9,16);
  for(let f=0;f<6;f++)b.boxFace(p,x,y,z,id,f,FACE_TILE[id*6+f],layer,0xffffff,0,M_SOLID|(f===2?M_ROT:0));
}
const ROTATIONS=[[0,1],[1,0],[0,-1],[-1,0]];
/** flat (lily pad): one up-facing quad 1 px above the cell floor, randomly turned per position like vanilla's variants. */
function flat(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  const r=b.iso?ROTATIONS[0]:ROTATIONS[(positionHash(b.wx+x,b.wz+z)>>>12)&3];
  b.rotX=r[0];b.rotZ=r[1];b.setBox(0,1,0,16,1,16);
  b.boxFace(p,x,y,z,id,2,FACE_TILE[id*6+2],LAYER[id],b.tintColour(TINT_KIND[id*6+2],x+z*CS),0,M_NOCULL|M_ROT|M_SHADE);
}
/** stairs: the bottom slab plus the upper back half of stairsBoxes(facing) as ten non-overlapping quads (bottom, front
 *  riser, full back, two L-shaped sides, the step top, the upper top and the inset upper riser). Hidden internal faces are
 *  never emitted; boundary faces are culled against opaque neighbours and matching stairs/slab faces. */
function stairs(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  const front=FACING_FACE[id];if(front===255)return;
  const rear=OPPOSITE_FACE[front],o=id*6,sideA=N_AXIS[front]===0?4:0,sideB=sideA+1;
  b.setBox(0,0,0,16,8,16);solidFace(b,p,x,y,z,id,3);solidFace(b,p,x,y,z,id,front);solidFace(b,p,x,y,z,id,sideA);solidFace(b,p,x,y,z,id,sideB);
  b.setBox(0,0,0,16,16,16);solidFace(b,p,x,y,z,id,rear);
  b.setBox(STAIRS_BACK[o],STAIRS_BACK[o+1],STAIRS_BACK[o+2],STAIRS_BACK[o+3],STAIRS_BACK[o+4],STAIRS_BACK[o+5]);
  solidFace(b,p,x,y,z,id,2);solidFace(b,p,x,y,z,id,sideA);solidFace(b,p,x,y,z,id,sideB);solidFace(b,p,x,y,z,id,front);
  // The step: the front half of the slab top.
  b.setBox(rear===1?8:0,0,rear===5?8:0,rear===0?8:16,8,rear===4?8:16);solidFace(b,p,x,y,z,id,2);
}
function solidFace(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number,f:number){
  b.boxFace(p,x,y,z,id,f,FACE_TILE[id*6+f],LAYER[id],b.tintColour(TINT_KIND[id*6+f],x+z*CS),0,M_SOLID);
}
/** lantern: vanilla model and tile layout (6×7 px body, 4×2 px cap, crossed 3×2 px handle), emissive. */
function lantern(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  const tile=FACE_TILE[id*6],layer=LAYER[id],flags=FLAG_EMISSIVE;
  b.setBox(5,0,5,11,7,11);
  for(let f=0;f<6;f++){
    if(f===2||f===3)b.setUV(0,1,6,7);else b.setUV(0,7,6,14);
    b.boxFace(p,x,y,z,id,f,tile,layer,0xffffff,flags,M_UV|M_SHADE);
  }
  b.setBox(6,7,6,10,9,10);
  for(let f=0;f<6;f++){
    if(f===3)continue;
    if(f===2)b.setUV(1,2,5,6);else b.setUV(1,14,5,16);
    b.boxFace(p,x,y,z,id,f,tile,layer,0xffffff,flags,M_UV|M_SHADE);
  }
  const light=b.iso?b.light[p]:0xff,ox=x*16,oy=y*16,oz=z*16;
  handle(b,ox+7,oz+7,ox+9,oz+9,oy+9,13,light,layer,tile);
  handle(b,ox+7,oz+9,ox+9,oz+7,oy+9,4,light,layer,tile);
}
function handle(b:MeshBuilder,ax:number,az:number,bx:number,bz:number,y0:number,v0:number,light:number,layer:number,tile:number){
  const qx=b.qx,qy=b.qy,qz=b.qz,qu=b.qu,qv=b.qv;
  qx[0]=qx[1]=ax;qz[0]=qz[1]=az;qx[2]=qx[3]=bx;qz[2]=qz[3]=bz;qy[0]=qy[2]=y0+2;qy[1]=qy[3]=y0;
  qu[0]=qu[1]=11;qu[2]=qu[3]=14;qv[0]=qv[2]=v0+2;qv[1]=qv[3]=v0;
  for(let c=0;c<4;c++){b.ql[c]=light;b.qs[c]=255;b.qf[c]=FLAG_EMISSIVE;}
  b.emit(layer,tile,0xffffff,false);
}
/** Fire height in pixels (vanilla flames stand 22.4 px tall). */
export const FIRE_HEIGHT=22;
/** fire: four planes rising from the block sides and leaning 4 px inward, plus two crossed diagonal planes; emissive.
 *  The renderer animates the tile. */
function fire(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  const tile=FACE_TILE[id*6],layer=LAYER[id],light=b.iso?b.light[p]:0xff,ox=x*16,oy=y*16,oz=z*16,h=FIRE_HEIGHT;
  const qx=b.qx,qy=b.qy,qz=b.qz,qu=b.qu,qv=b.qv;
  for(let i=0;i<4;i++){
    const f=SIDES[i],base=N_SIGN[f]>0?16:0,top=base-N_SIGN[f]*4,alongX=N_AXIS[f]===2;
    for(let c=0;c<4;c++){
      const end=c>=2?16:0,up=c===0||c===2,depth=up?top:base;
      qx[c]=ox+(alongX?end:depth);qz[c]=oz+(alongX?depth:end);qy[c]=oy+(up?h:0);
      qu[c]=end;qv[c]=up?16:0;b.ql[c]=light;b.qs[c]=255;b.qf[c]=FLAG_EMISSIVE;
    }
    b.emit(layer,tile,0xffffff,false);
  }
  for(let i=0;i<8;i+=4){
    const d=FIRE_DIAGONALS;
    plane(b,ox+d[i],oz+d[i+1],ox+d[i+2],oz+d[i+3],oy,h,light,FLAG_EMISSIVE,0,layer,tile,0xffffff);
  }
}
