// Art and geometry for the first-person hand: the player's arm skin (a classic 4×12×4 arm: skin tone with the teal
// short sleeve at the shoulder, painted here), held items as extruded 16×16 sprites (vanilla ItemModelGenerator: a front
// and a back face plus a one-pixel side wall around every opaque pixel) and held blocks from the mesher's meshBlock.
// Everything is written into one vertex buffer: position (model space, already in the item's display transform),
// uv, colour (tint × shade), part (0 main hand, 1 offhand) and texture (0 hand sheet, 1 block atlas, 2 block atlas blended:
// the translucent faces of a held block such as ice).
import * as THREE from 'three';
import {ATLAS_COLUMNS,ATLAS_ROWS} from '../data/blocks';
import type {ChunkMesh} from '../engine/contracts';

/** Hand sheet: three 16×16 slots side by side: 0 the arm skin, 1 the main-hand sprite, 2 the offhand sprite. */
export const HAND_SLOT=16,HAND_SLOTS=3,HAND_SHEET_WIDTH=HAND_SLOT*HAND_SLOTS,HAND_SHEET_HEIGHT=HAND_SLOT;
export const SLOT_ARM=0,SLOT_MAIN=1,SLOT_OFF=2;
/** Texture codes of the hand buffer's misc.y. */
export const HAND_TEX_SHEET=0,HAND_TEX_ATLAS=1,HAND_TEX_TRANSLUCENT=2;
/** Room for two extruded sprites (2 faces + up to 64 edge quads per row run) and the arm. */
export const MAX_HAND_QUADS=2400;

function hash(x:number,y:number,s:number){let h=Math.imul(x*374761393+y*668265263+s*1442695041,1274126177);h=Math.imul(h^h>>>13,1103515245);return((h^h>>>16)>>>0)/4294967296;}
/** Arm skin unwrap in a 16×16 slot (top row first): top (shoulder) at x 4..8 and bottom (hand) at 8..12 of rows 0..4;
 *  the four sides in rows 4..16: -x 0..4, front -z 4..8, +x 8..12, back +z 12..16; the sleeve covers side rows 4..8. */
export function paintArmSkin():Uint8ClampedArray{
  const out=new Uint8ClampedArray(HAND_SLOT*HAND_SLOT*4);
  const skin=[184,135,108],skinDark=[160,113,88],sleeve=[0,168,168],sleeveDark=[0,138,140];
  for(let y=0;y<HAND_SLOT;y++)for(let x=0;x<HAND_SLOT;x++){
    const i=(y*HAND_SLOT+x)*4,n=hash(x,y,3);
    let c=skin;
    if(y<4){
      if(x<4||x>=12)continue;
      c=x<8?(n<.3?sleeveDark:sleeve):(n<.25?skinDark:skin);
    }else if(y<8)c=n<.28||y===7?sleeveDark:sleeve;
    else{
      // Skin with a few darker pixels and a shaded edge column on each side, like a painted skin.
      const edge=x%4===3;c=edge||n<.18?skinDark:skin;
      if(y===15&&n<.5)c=skinDark;
    }
    const k=.94+n*.1;out[i]=Math.min(255,c[0]*k);out[i+1]=Math.min(255,c[1]*k);out[i+2]=Math.min(255,c[2]*k);out[i+3]=255;
  }
  return out;
}

export class HandBuffer{
  readonly position=new Float32Array(MAX_HAND_QUADS*4*3);readonly uv=new Float32Array(MAX_HAND_QUADS*4*2);
  readonly color=new Float32Array(MAX_HAND_QUADS*4*3);readonly misc=new Float32Array(MAX_HAND_QUADS*4*2);
  quads=0;
  private m=new THREE.Matrix4();private v=new THREE.Vector3();
  /** Transform applied to the next quads' corners (model space → display space). */
  setTransform(m:THREE.Matrix4){this.m.copy(m);}
  /** One quad; corners in the order (0,1,2),(2,1,3); uv per corner; colour rgb; part; texture. */
  quad(c:readonly number[],uv:readonly number[],r:number,g:number,b:number,part:number,tex:number){
    if(this.quads>=MAX_HAND_QUADS)return;
    const base=this.quads*4;
    for(let k=0;k<4;k++){
      const v=this.v.set(c[k*3],c[k*3+1],c[k*3+2]).applyMatrix4(this.m),o=base+k;
      this.position[o*3]=v.x;this.position[o*3+1]=v.y;this.position[o*3+2]=v.z;
      this.uv[o*2]=uv[k*2];this.uv[o*2+1]=uv[k*2+1];
      this.color[o*3]=r;this.color[o*3+1]=g;this.color[o*3+2]=b;this.misc[o*2]=part;this.misc[o*2+1]=tex;
    }
    this.quads++;
  }
}
const slotU=(slot:number,px:number)=>(slot*HAND_SLOT+px)/HAND_SHEET_WIDTH;
const slotV=(py:number)=>1-py/HAND_SHEET_HEIGHT;

/** The arm cube (vanilla right arm: box (-3,-2,-2) size 4×12×4 pixels, y down) in model pixels; the caller's transform
 *  places it (pivot, rest rotation and the 1/16 scale). */
export function addArm(buf:HandBuffer,part:number){
  const x0=-3,x1=1,y0=-2,y1=10,z0=-2,z1=2;
  // [corners TL, BL, TR, BR as seen from outside], uv rect [u0,v0 (top), u1, v1] in slot pixels, shade.
  const faces:[number[],number[],number][]=[
    [[x0,y0,z1, x0,y1,z1, x0,y0,z0, x0,y1,z0],[0,4,4,16],.8],
    [[x0,y0,z0, x0,y1,z0, x1,y0,z0, x1,y1,z0],[4,4,8,16],1],
    [[x1,y0,z0, x1,y1,z0, x1,y0,z1, x1,y1,z1],[8,4,12,16],.8],
    [[x1,y0,z1, x1,y1,z1, x0,y0,z1, x0,y1,z1],[12,4,16,16],.9],
    [[x0,y0,z1, x0,y0,z0, x1,y0,z1, x1,y0,z0],[4,0,8,4],.7],
    [[x0,y1,z0, x0,y1,z1, x1,y1,z0, x1,y1,z1],[8,0,12,4],.6]
  ];
  for(const [c,[u0,v0,u1,v1],s] of faces)
    buf.quad(c,[slotU(SLOT_ARM,u0),slotV(v0),slotU(SLOT_ARM,u0),slotV(v1),slotU(SLOT_ARM,u1),slotV(v0),slotU(SLOT_ARM,u1),slotV(v1)],s,s,s,part,0);
}
/** Extruded sprite (vanilla item/generated): pixels top row first, 16×16, model space 0..1 with the front face (+z) at
 *  8.5/16 and the back at 7.5/16. `slot` is the hand-sheet slot holding the same pixels. Returns quads added. */
export function addSprite(buf:HandBuffer,pixels:Uint8ClampedArray,slot:number,part:number,tint=0xffffff):number{
  const before=buf.quads,S=HAND_SLOT,z0=7.5/16,z1=8.5/16;
  const r=(tint>>16&255)/255,g=(tint>>8&255)/255,b=(tint&255)/255;
  const solid=(x:number,y:number)=>x>=0&&y>=0&&x<S&&y<S&&pixels[(y*S+x)*4+3]>25;
  // Front (south, toward the viewer at rest) and back.
  buf.quad([0,1,z1, 0,0,z1, 1,1,z1, 1,0,z1],[slotU(slot,0),slotV(0),slotU(slot,0),slotV(S),slotU(slot,S),slotV(0),slotU(slot,S),slotV(S)],r,g,b,part,0);
  buf.quad([1,1,z0, 1,0,z0, 0,1,z0, 0,0,z0],[slotU(slot,S),slotV(0),slotU(slot,S),slotV(S),slotU(slot,0),slotV(0),slotU(slot,0),slotV(S)],r,g,b,part,0);
  for(let y=0;y<S;y++)for(let x=0;x<S;x++){
    if(!solid(x,y))continue;
    const X0=x/S,X1=(x+1)/S,Y1=1-y/S,Y0=1-(y+1)/S;
    // The side walls sample the middle of their own pixel.
    const u=slotU(slot,x+.5),v=slotV(y+.5),uv=[u,v,u,v,u,v,u,v];
    if(!solid(x,y-1))buf.quad([X0,Y1,z0, X0,Y1,z1, X1,Y1,z0, X1,Y1,z1],uv,r,g,b,part,0);
    if(!solid(x,y+1))buf.quad([X0,Y0,z1, X0,Y0,z0, X1,Y0,z1, X1,Y0,z0],uv,r*.5,g*.5,b*.5,part,0);
    if(!solid(x-1,y))buf.quad([X0,Y1,z0, X0,Y0,z0, X0,Y1,z1, X0,Y0,z1],uv,r*.6,g*.6,b*.6,part,0);
    if(!solid(x+1,y))buf.quad([X1,Y1,z1, X1,Y0,z1, X1,Y1,z0, X1,Y0,z0],uv,r*.6,g*.6,b*.6,part,0);
  }
  return buf.quads-before;
}
/** A meshBlock result (positions 0..16 per block, tile UVs) into the buffer, sampling the block atlas; the translucent
 *  layer's quads are marked to blend (vanilla draws translucent block items with the translucent sheet). */
export function addBlockMesh(buf:HandBuffer,mesh:ChunkMesh,part:number):number{
  const before=buf.quads,corner=[0,0,0,0,0,0,0,0,0,0,0,0],uv=[0,0,0,0,0,0,0,0],e=.0005;
  for(const p of [mesh.opaque,mesh.cutout,mesh.translucent]){
    for(let q=0;q<p.quads;q++){
      let shade=0,r=0,g=0,b=0;
      for(let k=0;k<4;k++){
        const o=(q*4+k)*4;
        corner[k*3]=p.position[o]/16;corner[k*3+1]=p.position[o+1]/16;corner[k*3+2]=p.position[o+2]/16;
        const tile=p.uvt[o+2],col=tile%ATLAS_COLUMNS,row=Math.floor(tile/ATLAS_COLUMNS);
        const fu=Math.min(1-e,Math.max(e,p.uvt[o]/16)),fv=Math.min(1-e,Math.max(e,p.uvt[o+1]/16));
        uv[k*2]=(col+fu)/ATLAS_COLUMNS;uv[k*2+1]=1-(row+1-fv)/ATLAS_ROWS;
        shade+=p.uvt[o+3]/255/4;r=p.tint[o]/255;g=p.tint[o+1]/255;b=p.tint[o+2]/255;
      }
      buf.quad(corner,uv,r*shade,g*shade,b*shade,part,p===mesh.translucent?HAND_TEX_TRANSLUCENT:HAND_TEX_ATLAS);
    }
  }
  return buf.quads-before;
}
