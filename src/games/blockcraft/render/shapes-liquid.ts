// Liquids, after vanilla LiquidBlockRenderer: per-corner surface heights averaged with the neighbours, the still tile on
// a level surface and the flowing tile turned along the flow elsewhere, faces only toward air or non-liquid
// transparent blocks, and the liquid-surface vertex flag on the top.
import * as blocks from '../data/blocks';
import * as constants from '../engine/constants';
import type {MeshBuilder} from './mesher-builder';
import * as builder from './mesher-builder';
import * as tables from './mesher-tables';
// Module-local aliases: hot loops read plain constants rather than live import bindings.
const {LAYER,LIQUID,OPAQUE,SOLID}=blocks;
const {CS,PAD_LAYER,PAD_X}=constants;
const {M_NOCULL,M_SHADE,M_SMOOTH}=builder;
const {CU,CV,EMISSIVE,FACE_DX,FACE_DZ,FACE_SHADE,FLAG_EMISSIVE,FLAG_LIQUID,LIQUID_FLOW_TILE,LIQUID_HEIGHT,LIQUID_STILL_TILE,N_AXIS,N_SIGN,PAD_NB,TINT_KIND,TRANSLUCENT_CUBE,U_AXIS,U_SIGN}=tables;

/** Vanilla getHeight for a neighbour cell: 1 under the same liquid, its own height, 0 for a non-solid cell (pulls the
 *  surface down) and -1 for a solid one (ignored). */
function heightAt(B:Uint8Array,q:number,kind:number):number{
  const n=B[q];
  if(LIQUID[n]===kind)return LIQUID[B[q+PAD_LAYER]]===kind?1:LIQUID_HEIGHT[n];
  return SOLID[n]?-1:0;
}
/** Vanilla calculateAverageHeight: heights of 0.8 and more weigh 10×, solid cells are skipped, and a full neighbour
 *  (liquid above it) lifts the corner to the top. */
function cornerHeight(B:Uint8Array,kind:number,h0:number,h1:number,h2:number,corner:number):number{
  if(h1>=1||h2>=1)return 1;
  let sum=0,weight=0;
  if(h1>0||h2>0){
    const h=heightAt(B,corner,kind);
    if(h>=1)return 1;
    if(h>=.8){sum+=h*10;weight+=10;}else if(h>=0){sum+=h;weight++;}
  }
  for(let k=0;k<3;k++){
    const h=k===0?h0:k===1?h2:h1;
    if(h>=.8){sum+=h*10;weight+=10;}else if(h>=0){sum+=h;weight++;}
  }
  return sum/weight;
}
const SIDES=[0,1,4,5];
/** Vanilla FlowingFluid.getFlow (horizontal part): toward lower neighbours and toward drops beside the liquid. */
const flow={x:0,z:0};
function flowAt(B:Uint8Array,p:number,kind:number,own:number){
  let fx=0,fz=0;
  for(let k=0;k<4;k++){
    const f=SIDES[k],q=p+PAD_NB[f],n=B[q],nk=LIQUID[n];
    if(nk!==0&&nk!==kind)continue;
    const h=nk===kind?LIQUID_HEIGHT[n]:0;let d=0;
    if(h===0){
      if(!SOLID[n]){const below=B[q-PAD_LAYER];if(LIQUID[below]===kind)d=own-(LIQUID_HEIGHT[below]-8/9);}
    }else d=own-h;
    fx+=FACE_DX[f]*d;fz+=FACE_DZ[f]*d;
  }
  const len=Math.hypot(fx,fz);
  if(len<1e-6){flow.x=flow.z=0;}else{flow.x=fx/len;flow.z=fz/len;}
}
/** Corner heights in pixels, indexed (x>0) + (z>0)*2: north-west, north-east, south-west, south-east. */
const H=new Float64Array(4);
const px=(h:number)=>h>=1?16:Math.max(1,Math.round(h*16));

export function liquid(b:MeshBuilder,p:number,x:number,y:number,z:number,id:number){
  const B=b.blocks,kind=LIQUID[id],above=B[p+PAD_LAYER],layer=LAYER[id],own=LIQUID_HEIGHT[id],col=x+z*CS;
  const emissive=EMISSIVE[id]?FLAG_EMISSIVE:0;
  const h0=LIQUID[above]===kind?1:own;
  if(h0>=1)H[0]=H[1]=H[2]=H[3]=16;
  else{
    const hN=heightAt(B,p-PAD_X,kind),hS=heightAt(B,p+PAD_X,kind),hE=heightAt(B,p+1,kind),hW=heightAt(B,p-1,kind);
    H[0]=px(cornerHeight(B,kind,h0,hN,hW,p-PAD_X-1));H[1]=px(cornerHeight(B,kind,h0,hN,hE,p-PAD_X+1));
    H[2]=px(cornerHeight(B,kind,h0,hS,hW,p+PAD_X-1));H[3]=px(cornerHeight(B,kind,h0,hS,hE,p+PAD_X+1));
  }
  const ox=x*16,oy=y*16,oz=z*16,qx=b.qx,qy=b.qy,qz=b.qz,qu=b.qu,qv=b.qv;
  // Top: drawn unless the same (or another) liquid is above; under an opaque block only when it sits below the top.
  const low=Math.min(H[0],H[1],H[2],H[3]);
  if(!LIQUID[above]&&(!OPAQUE[above]||low<16)){
    flowAt(B,p,kind,own);
    const still=flow.x===0&&flow.z===0,tile=still?LIQUID_STILL_TILE[kind]:LIQUID_FLOW_TILE[kind];
    const anchor=OPAQUE[above]?p:p+PAD_LAYER;
    if(!emissive||b.iso)b.corners(anchor,2,false);
    const rgb=b.tintColour(TINT_KIND[id*6+2],col);
    for(let c=0;c<4;c++){
      // Top face frame: U = +x, V = -z, so c0 is north-west and c3 south-east.
      const lx=CU[c]*16,lz=CV[c]?0:16;
      qx[c]=ox+lx;qz[c]=oz+lz;qy[c]=oy+H[(lx>0?1:0)+(lz>0?2:0)];
      if(still){qu[c]=lx;qv[c]=16-lz;}
      else{
        // Flowing tile turned so its downward direction follows the flow (vanilla angle atan2(z,x) - 90°).
        const dx=lx-8,dz=lz-8;qu[c]=32+8+dx*flow.z-dz*flow.x;qv[c]=32+8-dx*flow.x-dz*flow.z;
      }
      b.ql[c]=emissive&&!b.iso?0xff:b.lightAt(CU[c],CV[c]);b.qs[c]=255;b.qf[c]=FLAG_LIQUID|emissive;
    }
    // Vanilla splits the surface along the north-west / south-east diagonal.
    b.emit(layer,tile,rgb,true);
  }
  const below=B[p-PAD_LAYER];
  if(b.iso||(!LIQUID[below]&&!OPAQUE[below])){
    b.setBox(0,0,0,16,16,16);
    b.boxFace(p,x,y,z,id,3,LIQUID_STILL_TILE[kind],layer,b.tintColour(TINT_KIND[id*6+3],col),emissive,M_SMOOTH|M_SHADE|M_NOCULL);
  }
  for(let k=0;k<4;k++){
    const f=SIDES[k],q=p+PAD_NB[f],n=B[q];
    if(!b.iso&&(LIQUID[n]||OPAQUE[n]||TRANSLUCENT_CUBE[n]))continue;
    if(!emissive||b.iso)b.corners(q,f,false);
    const na=N_AXIS[f],ua=U_AXIS[f],shade=Math.round(255*FACE_SHADE[f]);
    for(let c=0;c<4;c++){
      const n0=N_SIGN[f]>0?16:0,u0=(U_SIGN[f]>0)===(CU[c]===1)?16:0;
      const lx=na===0?n0:u0,lz=na===2?n0:u0,top=CV[c]===1,ly=top?H[(lx>0?1:0)+(lz>0?2:0)]:0;
      const gu=U_SIGN[f]>0?(ua===0?lx:lz):16-(ua===0?lx:lz);
      qx[c]=ox+lx;qy[c]=oy+ly;qz[c]=oz+lz;qu[c]=gu;qv[c]=ly;
      b.ql[c]=emissive&&!b.iso?0xff:b.lightAt(gu/16,ly/16);b.qs[c]=shade;b.qf[c]=emissive;
    }
    b.emit(layer,LIQUID_FLOW_TILE[kind],b.tintColour(TINT_KIND[id*6+f],col),!emissive&&b.flipFor());
  }
}
