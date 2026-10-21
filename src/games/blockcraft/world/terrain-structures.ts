// Small decorative surface structures: desert wells (the vanilla layout) and ruined portals (a broken obsidian
// frame on a patch of cobblestone and stone bricks, decorative only). Each fits inside its own chunk, so it never
// needs neighbouring chunks; terrain.ts decides where one goes (structureIn) and keeps trees and plants clear of it.
import {AIR,B,blockId} from '../data/blocks';
import {CS,CH,LAYER} from '../engine/constants';
import {hash3} from './noise';

export type StructureKind='desert_well'|'ruined_portal';
export interface Structure{
  kind:StructureKind;
  /** Anchor: the well's water centre at ground level, or the portal frame's -x/-z bottom corner on the ground. */
  x:number;y:number;z:number;
  /** Portal frame orientation: along x (true) or z. */
  alongX:boolean;
  /** Inclusive world-space footprint (kept free of trees and plants). */
  minX:number;maxX:number;minZ:number;maxZ:number;
  seed:number;
}

const SANDSTONE=blockId('sandstone'),SANDSTONE_SLAB=blockId('sandstone_slab');
const COBBLE=B.cobblestone,MOSSY=blockId('mossy_cobblestone'),BRICKS=blockId('stone_bricks'),MOSSY_BRICKS=blockId('mossy_stone_bricks');

export function desertWell(x:number,y:number,z:number,seed:number):Structure{
  return{kind:'desert_well',x,y,z,alongX:true,minX:x-2,maxX:x+2,minZ:z-2,maxZ:z+2,seed};
}
/** Frame 4 wide; the rubble patch extends 2 beyond the frame ends and 2 to each side. */
export function ruinedPortal(x:number,y:number,z:number,alongX:boolean,seed:number):Structure{
  return alongX?{kind:'ruined_portal',x,y,z,alongX,minX:x-2,maxX:x+5,minZ:z-2,maxZ:z+2,seed}
    :{kind:'ruined_portal',x,y,z,alongX,minX:x-2,maxX:x+2,minZ:z-2,maxZ:z+5,seed};
}

/** Writes the structure into chunk (cx,cz). `heights` gives each footprint column's terrain height. */
export function placeStructure(s:Structure,blocks:Uint8Array,cx:number,cz:number,heights:(x:number,z:number)=>number){
  const x0=cx*CS,z0=cz*CS;
  const set=(x:number,y:number,z:number,id:number)=>{
    const lx=x-x0,lz=z-z0;if(lx<0||lz<0||lx>=CS||lz>=CS||y<1||y>=CH)return;
    blocks[lx+lz*CS+y*LAYER]=id;
  };
  // Clear terrain sticking up into the structure's space.
  for(let z=s.minZ;z<=s.maxZ;z++)for(let x=s.minX;x<=s.maxX;x++)for(let y=s.y+1;y<=heights(x,z);y++)set(x,y,z,AIR);
  if(s.kind==='desert_well')placeWell(s,set);else placePortal(s,set,heights);
}

function placeWell(s:Structure,set:(x:number,y:number,z:number,id:number)=>void){
  const {x,y,z}=s;
  for(let dy=-2;dy<=0;dy++)for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)set(x+dx,y+dy,z+dz,SANDSTONE);
  set(x,y,z,B.water);for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]])set(x+dx,y,z+dz,B.water);
  for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++)if(Math.abs(dx)===2||Math.abs(dz)===2)set(x+dx,y+1,z+dz,SANDSTONE);
  for(const [dx,dz] of [[2,0],[-2,0],[0,2],[0,-2]])set(x+dx,y+1,z+dz,SANDSTONE_SLAB);
  for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++)set(x+dx,y+4,z+dz,dx===0&&dz===0?SANDSTONE:SANDSTONE_SLAB);
  for(let dy=1;dy<=3;dy++)for(const [dx,dz] of [[-1,-1],[-1,1],[1,-1],[1,1]])set(x+dx,y+dy,z+dz,SANDSTONE);
}

function placePortal(s:Structure,set:(x:number,y:number,z:number,id:number)=>void,heights:(x:number,z:number)=>number){
  const {y,seed}=s,r=(a:number,b:number,c:number)=>hash3(a,b,c,seed);
  // Rubble patch on the ground, ragged at the edges; one block thick, also filling dips below it.
  for(let z=s.minZ;z<=s.maxZ;z++)for(let x=s.minX;x<=s.maxX;x++){
    const edge=x===s.minX||x===s.maxX||z===s.minZ||z===s.maxZ;
    if(edge&&r(x,1,z)<.45)continue;
    const v=r(x,2,z),block=v<.4?COBBLE:v<.7?MOSSY:v<.88?BRICKS:MOSSY_BRICKS;
    for(let yy=Math.min(y,heights(x,z)+1);yy<=y;yy++)set(x,yy,z,block);
  }
  // The frame: 4 wide, 5 tall. The bottom row stays; the rest crumbles.
  const fx=s.alongX?1:0,fz=s.alongX?0:1;
  for(let i=0;i<4;i++)for(let j=1;j<=5;j++){
    const rim=i===0||i===3||j===1||j===5;if(!rim)continue;
    if(j>1&&r(i,j+10,7)<.35)continue;
    set(s.x+fx*i,y+j,s.z+fz*i,B.obsidian);
  }
  // A few fallen frame blocks beside it.
  for(let k=0;k<3;k++){
    const along=-1+Math.floor(r(k,20,1)*6),side=r(k,21,2)<.5?-2:2;
    if(r(k,22,3)<.3)continue;
    set(s.x+fx*along+fz*side,y+1,s.z+fz*along+fx*side,B.obsidian);
  }
}
