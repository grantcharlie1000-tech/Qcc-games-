// Mesh builder: the padded block volume, light, biome tints, the three growable layer buffers and the quad writers
// shared by the cube path (mesher.ts) and the shape emitters (shapes*.ts). One instance is reused for every chunk.
import * as blocks from '../data/blocks';
import * as constants from '../engine/constants';
import type {ChunkMesh,MeshPart} from '../engine/contracts';
import * as tables from './mesher-tables';
// Module-local aliases: hot loops read plain constants rather than live import bindings.
const {OPAQUE}=blocks;
const {CS,LAYER,CHUNK_VOLUME,PAD_VOLUME,MAX_PART_QUADS}=constants;
const {AO_CURVE,AO_OFF,CU,CV,FACE_SHADE,FLAG_EMISSIVE,FLIP_ORDER,N_AXIS,N_SIGN,OPPOSITE_FACE,PAD_NB,PROFILE,U_AXIS,U_SIGN,V_AXIS,V_FLIP,V_SIGN}=tables;

const INITIAL_QUADS=4096;
/** One render layer's vertex data; grows by doubling up to MAX_PART_QUADS, after which further quads are dropped. */
export class LayerBuffer{
  quads=0;cap=INITIAL_QUADS;
  position=new Uint16Array(INITIAL_QUADS*16);uvt=new Uint16Array(INITIAL_QUADS*16);tint=new Uint8Array(INITIAL_QUADS*16);
  /** Room for one more quad (grows when needed); false once MAX_PART_QUADS quads are written. */
  reserve():boolean{
    if(this.quads<this.cap)return true;
    if(this.cap>=MAX_PART_QUADS)return false;
    const cap=Math.min(MAX_PART_QUADS,this.cap*2),grow=<T extends Uint16Array|Uint8Array>(a:T,b:T)=>{b.set(a);return b;};
    this.position=grow(this.position,new Uint16Array(cap*16));this.uvt=grow(this.uvt,new Uint16Array(cap*16));this.tint=grow(this.tint,new Uint8Array(cap*16));
    this.cap=cap;return true;
  }
  copy():MeshPart{const n=this.quads*16;return{position:this.position.slice(0,n),uvt:this.uvt.slice(0,n),tint:this.tint.slice(0,n),quads:this.quads};}
}

/** Box face modes for MeshBuilder.boxFace. */
export const M_SMOOTH=1,M_AO=2,M_SHADE=4,M_NOCULL=8,M_MIRROR=16,M_UV=32,M_ROT=64,
  /** Fill the scratch quad without emitting it (the caller transforms and emits). */
  M_KEEP=128;
export const M_SOLID=M_SMOOTH|M_AO|M_SHADE;

export class MeshBuilder{
  /** Padded block ids of the chunk being meshed (padIndex), or the isolated volume while meshing one block. */
  blocks:Uint8Array;
  /** Padded light (sky<<4|block) for `blocks`. */
  light:Uint8Array;
  /** Meshing a lone block (meshBlock): nothing is culled, full light, no AO, no random offsets. */
  iso=false;
  /** World block coordinates of the chunk origin (per-position randomness: plant offsets, lily pad rotation). */
  wx=0;wz=0;
  readonly chunkBlocks=new Uint8Array(PAD_VOLUME);
  readonly isoBlocks=new Uint8Array(PAD_VOLUME);
  readonly isoLight=new Uint8Array(PAD_VOLUME).fill(0xf0);
  /** Palette index per tint kind (1 grass, 2 foliage, 3 water) and column: tintIndex[(kind-1)*256 + x + z*16]. */
  readonly tintIndex=new Uint16Array(3*LAYER);
  /** Blended 0xRRGGBB colours; index 0 is white (untinted). */
  readonly palette=new Uint32Array(1024);
  paletteSize=1;
  readonly layers=[new LayerBuffer(),new LayerBuffer(),new LayerBuffer()];
  /** Greedy face keys (0 = no mergeable face), keys[f*CHUNK_VOLUME + voxelIndex]. */
  readonly keys=new Uint32Array(6*CHUNK_VOLUME);
  keyMinY=CS*16;keyMaxY=-1;
  /** Vertical extent of everything written, in 1/16 blocks. */
  minPy=Infinity;maxPy=-Infinity;
  // Scratch quad (corner order c0..c3, see mesher-tables): positions in 1/16 blocks, uv in pixels, light byte, shade, flags.
  readonly qx=new Float64Array(4);readonly qy=new Float64Array(4);readonly qz=new Float64Array(4);
  readonly qu=new Float64Array(4);readonly qv=new Float64Array(4);
  readonly ql=new Uint8Array(4);readonly qs=new Uint8Array(4);readonly qf=new Uint8Array(4);
  // Smooth light at the four cell corners of a face (fractional levels) and AO level 0..3 per corner.
  readonly cs=new Float64Array(4);readonly cb=new Float64Array(4);readonly ca=new Uint8Array(4);
  // Current box for boxFace (block-local pixels, min and max corner) and a vertex scratch.
  readonly lo=new Float64Array(3);readonly hi=new Float64Array([16,16,16]);readonly pos=new Float64Array(3);
  // Explicit uv rectangle (pixels, v up) for M_UV, and the tile-down direction for M_ROT.
  u0=0;v0=0;u1=16;v1=16;rotX=0;rotZ=1;
  constructor(){this.blocks=this.chunkBlocks;this.light=this.isoLight;}

  begin(blocks:Uint8Array,light:Uint8Array,iso:boolean){
    this.blocks=blocks;this.light=light;this.iso=iso;
    for(const l of this.layers)l.quads=0;
    this.minPy=Infinity;this.maxPy=-Infinity;this.keyMinY=CS*16;this.keyMaxY=-1;
  }
  finish():ChunkMesh{
    const [o,c,t]=this.layers,empty=this.maxPy<this.minPy;
    return{opaque:o.copy(),cutout:c.copy(),translucent:t.copy(),
      minY:empty?0:Math.max(0,Math.floor(this.minPy/16)),maxY:empty?0:Math.ceil(this.maxPy/16)};
  }
  /** Colour for tint kind 1..3 at a chunk column, 0xffffff when kind is 0. */
  tintColour(kind:number,col:number):number{return kind?this.palette[this.tintIndex[(kind-1)*LAYER+col]]:0xffffff;}

  /** Smooth light and AO at the four cell corners of face `f`, sampled around the light cell `anchor` (in front of the
   *  face, or the block's own cell for inset faces): each corner averages the anchor, the two side cells and the diagonal
   *  cell, skipping opaque cells (the diagonal too when both sides are opaque). Fills cs/cb/ca. */
  corners(anchor:number,f:number,ao:boolean){
    const cs=this.cs,cb=this.cb,ca=this.ca;
    if(this.iso){for(let k=0;k<4;k++){cs[k]=15;cb[k]=0;ca[k]=3;}return;}
    const B=this.blocks,L=this.light,c=L[anchor],s0=c>>4,b0=c&15;
    for(let k=0;k<4;k++){
      const o=(f*4+k)*3,a=anchor+AO_OFF[o],b=anchor+AO_OFF[o+1],oa=OPAQUE[B[a]],ob=OPAQUE[B[b]];
      let s=s0,bl=b0,n=1,occ=0;
      if(!oa){const l=L[a];s+=l>>4;bl+=l&15;n++;}
      if(!ob){const l=L[b];s+=l>>4;bl+=l&15;n++;}
      if(!(oa&&ob)){const d=anchor+AO_OFF[o+2],od=OPAQUE[B[d]];if(!od){const l=L[d];s+=l>>4;bl+=l&15;n++;}occ=3-oa-ob-od;}
      cs[k]=s/n;cb[k]=bl/n;ca[k]=ao?occ:3;
    }
  }
  /** Bilinear light byte at (s,t) in 0..1 across the face (U right, V up) from the corner values. */
  lightAt(s:number,t:number):number{
    const w0=(1-s)*t,w1=(1-s)*(1-t),w2=s*t,w3=s*(1-t),cs=this.cs,cb=this.cb;
    const sky=Math.round(w0*cs[0]+w1*cs[1]+w2*cs[2]+w3*cs[3]),blk=Math.round(w0*cb[0]+w1*cb[1]+w2*cb[2]+w3*cb[3]);
    return (sky>15?15:sky)<<4|(blk>15?15:blk);
  }
  aoAt(s:number,t:number):number{
    const ca=this.ca;
    return (1-s)*t*AO_CURVE[ca[0]]+(1-s)*(1-t)*AO_CURVE[ca[1]]+s*t*AO_CURVE[ca[2]]+s*(1-t)*AO_CURVE[ca[3]];
  }
  /** Writes the scratch quad to a layer (1 opaque, 2 cutout, 3 translucent). Positions and uvs are rounded; negative
   *  positions are clamped to 0 (Uint16). `flip` triangulates along c0–c3 instead of c1–c2. */
  emit(layer:number,tile:number,rgb:number,flip:boolean){
    const buf=this.layers[layer-1];if(!buf.reserve())return;
    const P=buf.position,U=buf.uvt,T=buf.tint,r=(rgb>>>16)&255,g=(rgb>>>8)&255,b=rgb&255;
    let o=buf.quads*16;
    for(let k=0;k<4;k++){
      const c=flip?FLIP_ORDER[k]:k,y=Math.max(0,Math.round(this.qy[c]));
      P[o]=Math.max(0,Math.round(this.qx[c]));P[o+1]=y;P[o+2]=Math.max(0,Math.round(this.qz[c]));P[o+3]=this.ql[c]|this.qf[c]<<8;
      U[o]=Math.max(0,Math.round(this.qu[c]));U[o+1]=Math.max(0,Math.round(this.qv[c]));U[o+2]=tile;U[o+3]=this.qs[c];
      T[o]=r;T[o+1]=g;T[o+2]=b;T[o+3]=255;o+=4;
      if(y<this.minPy)this.minPy=y;if(y>this.maxPy)this.maxPy=y;
    }
    buf.quads++;
  }
  /** Triangulation that joins the brighter diagonal (AO first, then light), as modern renderers do against AO anisotropy. */
  flipFor():boolean{
    const s=this.qs,l=this.ql;
    const b0=s[0]*32+(l[0]>>4)+(l[0]&15),b1=s[1]*32+(l[1]>>4)+(l[1]&15),b2=s[2]*32+(l[2]>>4)+(l[2]&15),b3=s[3]*32+(l[3]>>4)+(l[3]&15);
    return b0+b3>b1+b2;
  }
  /** Box face culling: a face on the cell boundary is hidden by an opaque neighbour or a neighbour face of the same profile. */
  culled(p:number,id:number,f:number):boolean{
    if(this.iso)return false;
    const n=this.blocks[p+PAD_NB[f]];
    if(OPAQUE[n])return true;
    const prof=PROFILE[id*6+f];
    return prof!==0&&prof===PROFILE[n*6+OPPOSITE_FACE[f]];
  }
  setBox(x0:number,y0:number,z0:number,x1:number,y1:number,z1:number){const l=this.lo,h=this.hi;l[0]=x0;l[1]=y0;l[2]=z0;h[0]=x1;h[1]=y1;h[2]=z1;}
  setUV(u0:number,v0:number,u1:number,v1:number){this.u0=u0;this.v0=v0;this.u1=u1;this.v1=v1;}
  /** One face of the current box (block-local pixels) of the block `id` at padded index p, chunk cell (x,y,z).
   *  Faces on the cell boundary are culled (unless M_NOCULL) and lit from the neighbour cell; inset faces from the own
   *  cell. M_SMOOTH interpolates the corner light to each vertex, otherwise the light is flat (own cell). Emissive faces
   *  get full light outside meshBlock. Returns true when written. */
  boxFace(p:number,x:number,y:number,z:number,id:number,f:number,tile:number,layer:number,rgb:number,flags:number,mode:number):boolean{
    const na=N_AXIS[f],ua=U_AXIS[f],va=V_AXIS[f],lo=this.lo,hi=this.hi,pos=this.pos;
    const plane=N_SIGN[f]>0?hi[na]:lo[na],boundary=N_SIGN[f]>0?plane===16:plane===0;
    if(boundary&&!(mode&M_NOCULL)&&this.culled(p,id,f))return false;
    let anchor=boundary?p+PAD_NB[f]:p;
    if(OPAQUE[this.blocks[anchor]])anchor=p;
    const emissive=(flags&FLAG_EMISSIVE)!==0&&!this.iso,smooth=(mode&M_SMOOTH)!==0&&!emissive;
    if(smooth)this.corners(anchor,f,(mode&M_AO)!==0);
    const flat=emissive?0xff:this.light[smooth?anchor:p],faceShade=mode&M_SHADE?FACE_SHADE[f]:1;
    const ox=x*16,oy=y*16,oz=z*16,du=this.u1-this.u0,dv=this.v1-this.v0;
    for(let c=0;c<4;c++){
      pos[na]=plane;
      pos[ua]=(U_SIGN[f]>0)===(CU[c]===1)?hi[ua]:lo[ua];
      pos[va]=(V_SIGN[f]>0)===(CV[c]===1)?hi[va]:lo[va];
      // Geometric face coordinates 0..16 (U right, V up as seen from outside).
      const gu=U_SIGN[f]>0?pos[ua]:16-pos[ua],gv=V_SIGN[f]>0?pos[va]:16-pos[va];
      let u:number,v:number;
      if(mode&M_ROT){const dx=pos[0]-8,dz=pos[2]-8;u=8+dx*this.rotZ-dz*this.rotX+16;v=8-dx*this.rotX-dz*this.rotZ+16;}
      else if(mode&M_UV){u=this.u0+CU[c]*du;v=V_FLIP[f]?this.v1-CV[c]*dv:this.v0+CV[c]*dv;if(mode&M_MIRROR)u=this.u0+this.u1-u;}
      else{u=gu;v=V_FLIP[f]?16-gv:gv;if(mode&M_MIRROR)u=16-u;}
      this.qx[c]=ox+pos[0];this.qy[c]=oy+pos[1];this.qz[c]=oz+pos[2];this.qu[c]=u;this.qv[c]=v;
      if(smooth){const s=gu/16,t=gv/16;this.ql[c]=this.lightAt(s,t);this.qs[c]=Math.round(255*faceShade*this.aoAt(s,t));}
      else{this.ql[c]=flat;this.qs[c]=Math.round(255*faceShade);}
      this.qf[c]=flags;
    }
    if(!(mode&M_KEEP))this.emit(layer,tile,rgb,smooth&&this.flipFor());
    return true;
  }
}
