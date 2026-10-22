// Entity box models (pure, DOM-free): the entity texture atlas layout, compiled models and the CPU quad writer that
// fills the dynamic vertex buffers drawn by entity/model-render.ts.
//
// Model space follows engine/contracts: pixels (16 = 1 block), +y up, the mob faces -z. A part's pivot is relative to
// its parent's pivot (the entity's feet centre for top-level parts). Part transform = translate(pivot + pose offset) ·
// rest rotation · pose rotation, each rotation applied as Rz · Ry · Rx (x first). With these axes a positive x angle lifts
// the front (-z) upward (heads look up, legs swing forward), a positive y angle turns left like yaw.
//
// Box UVs use the contract's cuboid unwrap at box.uv with size (w, h, d): top row [d, 0, w, d] top and [d + w, 0, w, d]
// bottom, then the side row at v + d: -x [0, d, h], front -z [d, w, h], +x [d + w, d, h], back +z [2d + w, w, h]. Every
// face shows its region unmirrored when seen from outside (texture rows top-down, the top face with its upper edge at
// the back); `mirror` swaps the -x/+x regions and flips every face horizontally; `inflate` grows the box, not its UVs.
// Faces of zero area are skipped, and of two coincident faces (zero thickness) only one is drawn (models are double-sided).
import type {EntityModel,ModelBox,ModelPart,PartPose} from '../engine/contracts';

// ---- Atlas layout --------------------------------------------------------------------------------
export interface Region{x:number;y:number;w:number;h:number}
export interface AtlasLayout{width:number;height:number;regions:Map<string,Region>}
/** Shelf-packs rectangles (tallest first) into an atlas `width` wide; the height grows in steps of 16. */
export function packAtlas(items:readonly {key:string;w:number;h:number}[],width=512):AtlasLayout{
  const maxW=items.reduce((m,i)=>Math.max(m,i.w),0);
  width=Math.max(width,maxW);
  const sorted=[...items].sort((a,b)=>b.h-a.h||b.w-a.w);
  const regions=new Map<string,Region>();
  let x=0,y=0,shelf=0;
  for(const it of sorted){
    if(x+it.w>width){y+=shelf;x=0;shelf=0;}
    regions.set(it.key,{x,y,w:it.w,h:it.h});
    x+=it.w;shelf=Math.max(shelf,it.h);
  }
  const height=Math.max(16,Math.ceil((y+shelf)/16)*16);
  return{width,height,regions};
}

// ---- Compiled models -------------------------------------------------------------------------------
/** Faces in output order: top, bottom, -x, front (-z), +x, back (+z). */
export const FACE_NORMALS=[[0,1,0],[0,-1,0],[-1,0,0],[0,0,-1],[1,0,0],[0,0,1]] as const;
/** Corner indices (bit0 = max x, bit1 = max y, bit2 = max z) per face, ordered top-left, top-right, bottom-left,
 *  bottom-right as seen from outside. */
export const FACE_CORNERS=[[7,6,3,2],[1,0,5,4],[2,6,0,4],[3,2,1,0],[7,3,5,1],[6,7,4,5]] as const;
export interface CompiledBox{
  /** Min and max corner in part space, pixels (inflated). */
  x0:number;y0:number;z0:number;x1:number;y1:number;z1:number;
  /** Per face: u0, v0, u1, v1 (atlas normalised, u0/v0 at the face's top-left as seen from outside). */
  uv:Float32Array;
  /** Bit per face: draw it. */
  faces:number;
}
export interface CompiledPart{
  name:string;pivot:[number,number,number];
  /** Rest rotation (radians) or null. */
  rest:[number,number,number]|null;
  boxes:CompiledBox[];children:CompiledPart[];
  tinted:boolean;emissive:boolean;
}
export interface CompiledModel{model:EntityModel;parts:CompiledPart[];scale:number;partCount:number;boxCount:number}
const EPS_TEXEL=1/64;

/** Face texture rectangles [x, y, w, h] (texture pixels) of a box in output face order. */
export function faceRects(uv:readonly [number,number],size:readonly [number,number,number],mirror=false):[number,number,number,number][]{
  const [u,v]=uv,[w,h,d]=size;
  const west:[number,number,number,number]=[u,v+d,d,h],east:[number,number,number,number]=[u+d+w,v+d,d,h];
  return[[u+d,v,w,d],[u+d+w,v,w,d],mirror?east:west,[u+d,v+d,w,h],mirror?west:east,[u+2*d+w,v+d,w,h]];
}
function compileBox(b:ModelBox,region:Region,atlasW:number,atlasH:number):CompiledBox{
  const g=Math.max(-8,Math.min(8,Number.isFinite(b.inflate)?b.inflate!:0));
  const [fx,fy,fz]=b.from,[sw,sh,sd]=b.size;
  const box:CompiledBox={x0:fx-g,y0:fy-g,z0:fz-g,x1:fx+sw+g,y1:fy+sh+g,z1:fz+sd+g,uv:new Float32Array(24),faces:0};
  const rects=faceRects(b.uv,b.size,!!b.mirror);
  // Zero area faces are skipped; for zero thickness keep the first of each coincident pair.
  const area=[sw*sd,sw*sd,sd*sh,sw*sh,sd*sh,sw*sh];
  const drop=[false,sh===0,false,false,sw===0,sd===0];
  for(let f=0;f<6;f++){
    if(area[f]<=0||drop[f])continue;
    box.faces|=1<<f;
    const [rx,ry,rw,rh]=rects[f],ex=Math.min(EPS_TEXEL,rw/4),ey=Math.min(EPS_TEXEL,rh/4);
    let u0=(region.x+rx+ex)/atlasW,u1=(region.x+rx+rw-ex)/atlasW;
    if(b.mirror){const t=u0;u0=u1;u1=t;}
    box.uv[f*4]=u0;box.uv[f*4+1]=(region.y+ry+ey)/atlasH;box.uv[f*4+2]=u1;box.uv[f*4+3]=(region.y+ry+rh-ey)/atlasH;
  }
  return box;
}
const finite3=(v:unknown):v is [number,number,number]=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n));
function compilePart(p:ModelPart,region:Region,atlasW:number,atlasH:number,counts:{parts:number;boxes:number},depth:number):CompiledPart{
  counts.parts++;
  const boxes:CompiledBox[]=[];
  for(const b of p.boxes??[]){
    if(!finite3(b.from)||!finite3(b.size)||b.size.some(n=>n<0)||!Array.isArray(b.uv))continue;
    boxes.push(compileBox(b,region,atlasW,atlasH));counts.boxes++;
  }
  const rest=finite3(p.rotation)&&p.rotation.some(n=>n!==0)?[...p.rotation] as [number,number,number]:null;
  return{name:p.name,pivot:finite3(p.pivot)?[...p.pivot] as [number,number,number]:[0,0,0],rest,boxes,
    children:depth<8?(p.children??[]).map(c=>compilePart(c,region,atlasW,atlasH,counts,depth+1)):[],tinted:!!p.tinted,emissive:!!p.emissive};
}
export function compileModel(model:EntityModel,region:Region,atlasW:number,atlasH:number):CompiledModel{
  const counts={parts:0,boxes:0};
  const parts=model.parts.map(p=>compilePart(p,region,atlasW,atlasH,counts,0));
  return{model,parts,scale:Number.isFinite(model.scale)&&model.scale!>0?model.scale!:1,partCount:counts.parts,boxCount:counts.boxes};
}

// ---- Affine 3×4 matrices (row-major: r0 = m[0..3], r1 = m[4..7], r2 = m[8..11]; column 3 = translation) ----------
export type Mat=Float64Array;
export const mat=():Mat=>new Float64Array(12);
export function identity(m:Mat):Mat{m.fill(0);m[0]=m[5]=m[10]=1;return m;}
/** out = a · b (out may alias neither). */
export function multiply(out:Mat,a:Mat,b:Mat):Mat{
  for(let r=0;r<3;r++){
    const a0=a[r*4],a1=a[r*4+1],a2=a[r*4+2];
    out[r*4]=a0*b[0]+a1*b[4]+a2*b[8];out[r*4+1]=a0*b[1]+a1*b[5]+a2*b[9];out[r*4+2]=a0*b[2]+a1*b[6]+a2*b[10];
    out[r*4+3]=a0*b[3]+a1*b[7]+a2*b[11]+a[r*4+3];
  }
  return out;
}
/** Sets m to translate(t) · Rz(z) · Ry(y) · Rx(x). */
export function euler(m:Mat,x:number,y:number,z:number,tx=0,ty=0,tz=0):Mat{
  const cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  m[0]=cz*cy;m[1]=cz*sy*sx-sz*cx;m[2]=cz*sy*cx+sz*sx;m[3]=tx;
  m[4]=sz*cy;m[5]=sz*sy*sx+cz*cx;m[6]=sz*sy*cx-cz*sx;m[7]=ty;
  m[8]=-sy;m[9]=cy*sx;m[10]=cy*cx;m[11]=tz;
  return m;
}
/** Entity → world: translate(x, y, z) · Ry(yaw) · Rz(roll) · scale(s). */
export function entityMatrix(m:Mat,x:number,y:number,z:number,yaw:number,roll:number,s:number):Mat{
  const cy=Math.cos(yaw),sy=Math.sin(yaw),cr=Math.cos(roll),sr=Math.sin(roll);
  // Ry · Rz
  m[0]=cy*cr*s;m[1]=-cy*sr*s;m[2]=sy*s;m[3]=x;
  m[4]=sr*s;m[5]=cr*s;m[6]=0;m[7]=y;
  m[8]=-sy*cr*s;m[9]=sy*sr*s;m[10]=cy*s;m[11]=z;
  return m;
}

// ---- Vertex buffers ------------------------------------------------------------------------------
/** Vertex flags (extra.w). */
export const FLAG_EMISSIVE=1;
/** Vanilla entity diffuse lighting: two fixed lights, 0.6 power and 0.4 ambient. */
const L0=[.2,1,-.7],L1=[-.2,1,.7];
{const a=Math.hypot(...L0),b=Math.hypot(...L1);for(let i=0;i<3;i++){L0[i]/=a;L1[i]/=b;}}
export function diffuse(nx:number,ny:number,nz:number):number{
  const a=nx*L0[0]+ny*L0[1]+nz*L0[2],b=nx*L1[0]+ny*L1[1]+nz*L1[2];
  return Math.min(1,.6*(Math.max(0,a)+Math.max(0,b))+.4);
}
/** Growable quad buffers: per vertex position (3 × f32, relative to `origin`), uv (2 × f32), colour (rgba u8) and
 *  extra (light byte sky<<4|block, hurt 0..255, flash 0..255, flags). */
export class QuadWriter{
  quads=0;capacity:number;
  position!:Float32Array;uv!:Float32Array;color!:Uint8Array;extra!:Uint8Array;
  /** Bumped when the arrays are reallocated (the GPU attributes must be rebuilt). */
  version=0;
  /** World offset subtracted from positions (keeps float32 precision far from the origin). */
  ox=0;oy=0;oz=0;
  // Per-entity state applied to every quad written.
  light=0xf0;hurt=0;flash=0;tintR=255;tintG=255;tintB=255;
  /** Face shade of the next quadFrom() (quad() takes it as an argument). */
  shade=1;
  constructor(capacity=1024){this.capacity=capacity;this.allocate(capacity);}
  private allocate(capacity:number){
    const old={p:this.position,u:this.uv,c:this.color,e:this.extra};
    this.capacity=capacity;
    this.position=new Float32Array(capacity*12);this.uv=new Float32Array(capacity*8);this.color=new Uint8Array(capacity*16);this.extra=new Uint8Array(capacity*16);
    if(old.p){this.position.set(old.p.subarray(0,this.quads*12));this.uv.set(old.u.subarray(0,this.quads*8));this.color.set(old.c.subarray(0,this.quads*16));this.extra.set(old.e.subarray(0,this.quads*16));}
    this.version++;
  }
  begin(ox:number,oy:number,oz:number){this.quads=0;this.ox=ox;this.oy=oy;this.oz=oz;}
  /** Room for n more quads; false when the hard cap (1 << 17 quads) is reached. */
  reserve(n:number):boolean{
    if(this.quads+n<=this.capacity)return true;
    if(this.quads+n>1<<17)return false;
    let c=this.capacity;while(c<this.quads+n)c*=2;
    this.allocate(Math.min(c,1<<17));return true;
  }
  /** One quad from four world-space corners (top-left, top-right, bottom-left, bottom-right) and its uv rectangle. */
  quad(ax:number,ay:number,az:number,bx:number,by:number,bz:number,cx:number,cy:number,cz:number,dx:number,dy:number,dz:number,
    u0:number,v0:number,u1:number,v1:number,shade:number,flags:number){
    if(!this.reserve(1))return;
    const q=this.quads++,p=q*12,t=q*8,c=q*16;
    const P=this.position,ox=this.ox,oy=this.oy,oz=this.oz;
    P[p]=ax-ox;P[p+1]=ay-oy;P[p+2]=az-oz;P[p+3]=bx-ox;P[p+4]=by-oy;P[p+5]=bz-oz;
    P[p+6]=cx-ox;P[p+7]=cy-oy;P[p+8]=cz-oz;P[p+9]=dx-ox;P[p+10]=dy-oy;P[p+11]=dz-oz;
    const U=this.uv;U[t]=u0;U[t+1]=v0;U[t+2]=u1;U[t+3]=v0;U[t+4]=u0;U[t+5]=v1;U[t+6]=u1;U[t+7]=v1;
    this.shade=shade;this.colours(c,flags);
  }
  /** quad() with its corners read from `k` (x, y, z at offsets a, b, c, d), its uv rectangle from uv[o..o+3] and the
   *  shade from `shade`. The per-face hot paths use it: doubles passed to a call are boxed (allocated), offsets are not. */
  quadFrom(k:Float64Array,a:number,b:number,c:number,d:number,uv:Float32Array,o:number,flags:number){
    if(!this.reserve(1))return;
    const q=this.quads++,p=q*12,t=q*8;
    const P=this.position,ox=this.ox,oy=this.oy,oz=this.oz;
    P[p]=k[a]-ox;P[p+1]=k[a+1]-oy;P[p+2]=k[a+2]-oz;P[p+3]=k[b]-ox;P[p+4]=k[b+1]-oy;P[p+5]=k[b+2]-oz;
    P[p+6]=k[c]-ox;P[p+7]=k[c+1]-oy;P[p+8]=k[c+2]-oz;P[p+9]=k[d]-ox;P[p+10]=k[d+1]-oy;P[p+11]=k[d+2]-oz;
    const U=this.uv;U[t]=U[t+4]=uv[o];U[t+1]=U[t+3]=uv[o+1];U[t+2]=U[t+6]=uv[o+2];U[t+5]=U[t+7]=uv[o+3];
    this.colours(q*16,flags);
  }
  private colours(c:number,flags:number){
    const shade=this.shade,r=Math.round(this.tintR*shade),g=Math.round(this.tintG*shade),b=Math.round(this.tintB*shade);
    const C=this.color,E=this.extra,emissive=flags&FLAG_EMISSIVE;
    const hurt=emissive?0:this.hurt,flash=emissive?0:this.flash;
    for(let v=0;v<4;v++){const o=c+v*4;C[o]=r;C[o+1]=g;C[o+2]=b;C[o+3]=255;E[o]=this.light;E[o+1]=hurt;E[o+2]=flash;E[o+3]=flags;}
  }
  /** A flat rectangle centred at (x,y,z) spanning ±(ux,uy,uz) and ±(vx,vy,vz) (v points up the texture). */
  rect(x:number,y:number,z:number,ux:number,uy:number,uz:number,vx:number,vy:number,vz:number,u0:number,v0:number,u1:number,v1:number,shade:number,flags:number){
    this.quad(x-ux+vx,y-uy+vy,z-uz+vz,x+ux+vx,y+uy+vy,z+uz+vz,x-ux-vx,y-uy-vy,z-uz-vz,x+ux-vx,y+uy-vy,z+uz-vz,u0,v0,u1,v1,shade,flags);
  }
}

// ---- Writing a posed model -----------------------------------------------------------------------
const STACK:Mat[]=Array.from({length:10},mat),LOCAL=mat(),ROT=mat(),TMP=mat();
const CORNERS=new Float64Array(24);
/** Tint applied to `tinted` parts (0xRRGGBB, -1 = none). */
export interface ModelPaint{tint:number}
/** Writes every visible part of a compiled model posed by `pose` under `base` (entity → world). Returns quads written. */
export function writeModel(w:QuadWriter,m:CompiledModel,base:Mat,pose:Record<string,PartPose>,paint:ModelPaint):number{
  const start=w.quads;
  STACK[0].set(base);
  writeParts(w,m.parts,0,pose,paint);
  w.tintR=w.tintG=w.tintB=255;
  return w.quads-start;
}
function writeParts(w:QuadWriter,parts:CompiledPart[],depth:number,pose:Record<string,PartPose>,paint:ModelPaint){
  const parent=STACK[depth],out=STACK[depth+1];
  for(let i=0;i<parts.length;i++){
    const part=parts[i],p=pose[part.name];
    if(p&&p.visible===false)continue;
    const px=part.pivot[0]+(p?.px??0),py=part.pivot[1]+(p?.py??0),pz=part.pivot[2]+(p?.pz??0);
    if(part.rest){
      euler(ROT,part.rest[0],part.rest[1],part.rest[2],px,py,pz);
      if(p&&(p.x||p.y||p.z)){euler(TMP,p.x||0,p.y||0,p.z||0);multiply(LOCAL,ROT,TMP);}else LOCAL.set(ROT);
    }else euler(LOCAL,p?.x||0,p?.y||0,p?.z||0,px,py,pz);
    multiply(out,parent,LOCAL);
    if(part.tinted&&paint.tint>=0){w.tintR=paint.tint>>16&255;w.tintG=paint.tint>>8&255;w.tintB=paint.tint&255;}
    else w.tintR=w.tintG=w.tintB=255;
    const flags=part.emissive?FLAG_EMISSIVE:0;
    for(let b=0;b<part.boxes.length;b++)writeBox(w,part.boxes[b],out,flags);
    if(part.children.length&&depth<8){
      writeParts(w,part.children,depth+1,pose,paint);
    }
  }
}
function writeBox(w:QuadWriter,b:CompiledBox,m:Mat,flags:number){
  if(!w.reserve(6))return;
  for(let c=0;c<8;c++){
    const x=c&1?b.x1:b.x0,y=c&2?b.y1:b.y0,z=c&4?b.z1:b.z0,o=c*3;
    CORNERS[o]=m[0]*x+m[1]*y+m[2]*z+m[3];CORNERS[o+1]=m[4]*x+m[5]*y+m[6]*z+m[7];CORNERS[o+2]=m[8]*x+m[9]*y+m[10]*z+m[11];
  }
  const inv=1/Math.max(1e-9,Math.hypot(m[0],m[4],m[8]));
  for(let f=0;f<6;f++){
    if(!(b.faces&1<<f))continue;
    const n=FACE_NORMALS[f],nx=(m[0]*n[0]+m[1]*n[1]+m[2]*n[2])*inv,ny=(m[4]*n[0]+m[5]*n[1]+m[6]*n[2])*inv,nz=(m[8]*n[0]+m[9]*n[1]+m[10]*n[2])*inv;
    w.shade=flags&FLAG_EMISSIVE?1:diffuse(nx,ny,nz);
    const k=FACE_CORNERS[f];
    w.quadFrom(CORNERS,k[0]*3,k[1]*3,k[2]*3,k[3]*3,b.uv,f*4,flags);
  }
}

// ---- Procedural art for experience orbs (original) ----------------------------------------------------
/** Paints orb icon `i` (0 smallest .. 10 largest) into a 16×16 RGBA tile at (ox, oy) of an atlas `width` wide. */
export function paintOrb(px:Uint8ClampedArray,width:number,ox:number,oy:number,i:number){
  const r=1.6+i*.62,c=7.5;
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    const dx=x-c,dy=y-c,d=Math.max(Math.abs(dx),Math.abs(dy))*.55+Math.hypot(dx,dy)*.45,o=((oy+y)*width+ox+x)*4;
    if(d>r){px[o+3]=0;continue;}
    const t=d/r,edge=t>.78;
    // Bright core, yellow-green body, dark green rim; vertex colours pulse it in the renderer.
    const core=t<.35&&!edge;
    px[o]=edge?60:core?255:200;px[o+1]=edge?120:core?255:240;px[o+2]=edge?20:core?200:90;px[o+3]=255;
  }
}
