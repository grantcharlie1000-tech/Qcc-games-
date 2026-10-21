// Texture painting and UV packing for the hostile mob box models (entity/hostile-models.ts). Every texture is painted
// in code (original art): each box carries a painter that returns the colour of one face texel, and the builder packs
// every box's cuboid unwrap (contracts ModelBox: a top row of depth×width top and bottom faces, then the side row
// -x, front -z, +x, back +z) into one texture, sharing regions between boxes with the same key (left and right limbs).
import type {ModelBox,ModelPart} from '../engine/contracts';

export type Face='top'|'bottom'|'west'|'front'|'east'|'back';
export const FACES:readonly Face[]=['top','bottom','west','front','east','back'];
/** Painter result for a texel the renderer discards (alpha 0: overlay gaps, rags, eye-only layers). */
export const CLEAR=-1;
/** Colour 0xRRGGBB (or CLEAR) of texel (x, y) of a w×h face; y = 0 is the top row (side faces) or the back edge (top). */
export type Painter=(face:Face,x:number,y:number,w:number,h:number)=>number;
export type V3=[number,number,number];

export interface BoxDef{from:V3;size:V3;paint:Painter;inflate?:number;mirror?:boolean;
  /** Boxes sharing a key share one texture region, painted by the first one. */
  key?:string}
export interface PartDef{name:string;pivot:V3;rotation?:V3;boxes:BoxDef[];children?:PartDef[];emissive?:boolean;tinted?:boolean}
export interface BuiltTexture{parts:ModelPart[];width:number;height:number;paint(pixels:Uint8ClampedArray,width:number,height:number):void}

/** Face rectangle [x, y, w, h] of a box unwrap at `uv`. */
export function faceRect(uv:readonly [number,number],size:readonly number[],face:Face):[number,number,number,number]{
  const [u,v]=uv,w=size[0],h=size[1],d=size[2];
  switch(face){
    case 'top':return[u+d,v,w,d];
    case 'bottom':return[u+d+w,v,w,d];
    case 'west':return[u,v+d,d,h];
    case 'front':return[u+d,v+d,w,h];
    case 'east':return[u+d+w,v+d,d,h];
    default:return[u+2*d+w,v+d,w,h];
  }
}
/** Width and height of a box's unwrap. */
export const unwrapSize=(size:readonly number[]):[number,number]=>[2*(size[0]+size[2]),size[2]+size[1]];

/** Packs the boxes of `defs` into a texture `width` wide (shelves in definition order) and returns contract parts. */
export function buildTexture(defs:readonly PartDef[],width:number):BuiltTexture{
  const regions:{uv:[number,number];size:V3;paint:Painter}[]=[],byKey=new Map<string,[number,number]>();
  let x=0,y=0,shelf=0;
  const alloc=(w:number,h:number):[number,number]=>{
    if(w>width)throw new Error(`box unwrap ${w} wider than texture ${width}`);
    if(x+w>width){y+=shelf;x=0;shelf=0;}
    const at:[number,number]=[x,y];x+=w;shelf=Math.max(shelf,h);return at;
  };
  const toPart=(p:PartDef):ModelPart=>{
    const boxes:ModelBox[]=p.boxes.map(b=>{
      let uv=b.key?byKey.get(b.key):undefined;
      if(!uv){
        const [w,h]=unwrapSize(b.size);uv=alloc(w,h);regions.push({uv,size:b.size,paint:b.paint});
        if(b.key)byKey.set(b.key,uv);
      }
      const box:ModelBox={from:[...b.from],size:[...b.size],uv:[uv[0],uv[1]]};
      if(b.inflate)box.inflate=b.inflate;
      if(b.mirror)box.mirror=true;
      return box;
    });
    const part:ModelPart={name:p.name,pivot:[...p.pivot],boxes};
    if(p.rotation)part.rotation=[...p.rotation];
    if(p.children?.length)part.children=p.children.map(toPart);
    if(p.emissive)part.emissive=true;
    if(p.tinted)part.tinted=true;
    return part;
  };
  const parts=defs.map(toPart);
  const height=Math.max(16,Math.ceil((y+shelf)/16)*16);
  return{parts,width,height,paint(px,w,h){
    for(const r of regions)for(const face of FACES){
      const [fx,fy,fw,fh]=faceRect(r.uv,r.size,face);
      for(let ty=0;ty<fh;ty++)for(let tx=0;tx<fw;tx++){
        const px0=fx+tx,py0=fy+ty;if(px0<0||px0>=w||py0<0||py0>=h)continue;
        const c=r.paint(face,tx,ty,fw,fh),i=(py0*w+px0)*4;
        if(c<0){px[i]=px[i+1]=px[i+2]=px[i+3]=0;continue;}
        px[i]=c>>16&255;px[i+1]=c>>8&255;px[i+2]=c&255;px[i+3]=255;
      }
    }
  }};
}

// ---- Colour and noise -----------------------------------------------------------------------------
/** Deterministic hash noise in [0,1) for integer lattice points. */
export function hash(x:number,y:number,seed:number):number{
  let h=(Math.imul(x|0,0x27d4eb2d)^Math.imul(y|0,0x165667b1)^Math.imul(seed|0,0x9e3779b1))>>>0;
  h=Math.imul(h^h>>>15,0x85ebca6b);h=Math.imul(h^h>>>13,0xc2b2ae35);h^=h>>>16;
  return (h>>>0)/4294967296;
}
const channel=(v:number)=>Math.max(0,Math.min(255,Math.round(v)));
/** Multiplies a colour's channels by f. */
export function shade(c:number,f:number):number{return channel((c>>16&255)*f)<<16|channel((c>>8&255)*f)<<8|channel((c&255)*f);}
/** Linear blend of two colours. */
export function mix(a:number,b:number,t:number):number{
  const l=(s:number)=>channel((a>>s&255)+((b>>s&255)-(a>>s&255))*t);
  return l(16)<<16|l(8)<<8|l(0);
}
/** A colour with per-texel brightness jitter of ±amount. */
export const grain=(c:number,x:number,y:number,seed:number,amount=.08)=>shade(c,1+(hash(x,y,seed)-.5)*2*amount);
/** Picks one of a palette's colours from hash noise (weighted toward the first entries). */
export function speckle(palette:readonly number[],x:number,y:number,seed:number):number{
  const n=hash(x,y,seed);return palette[Math.min(palette.length-1,Math.floor(n*n*palette.length))];
}
/** Index of a face for seeding noise so neighbouring faces differ. */
export const faceSeed=(face:Face)=>FACES.indexOf(face)*131;

/** Scales a painter up: texel (x, y) of a big face samples (x·w0/w, y·h0/h) of the original w0×h0 face (baby heads). */
export function upscale(paint:Painter,w0:number,h0:number,d0:number):Painter{
  return(face,x,y,w,h)=>{
    const ow=face==='west'||face==='east'?d0:w0,oh=face==='top'||face==='bottom'?d0:h0;
    return paint(face,Math.min(ow-1,Math.floor(x*ow/w)),Math.min(oh-1,Math.floor(y*oh/h)),ow,oh);
  };
}
