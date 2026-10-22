// Texture painting and UV layout for the hostile mob box models (entity/hostile-models.ts). Every texture is painted in
// code (nothing is copied from Mojang's files): each box carries a painter that returns the colour of one face texel, and
// the builder paints every box's cuboid unwrap (contracts ModelBox: a top row of depth×width top and bottom faces, then the
// side row -x, front -z, +x, back +z) at the box's texture offset. Boxes give their vanilla Java offset (`uv`), so the
// textures follow the vanilla layouts; boxes without one are shelf-packed below (the arrow). Boxes sharing a region (left
// and right limbs, by `key` or by offset) are painted once, by the first box.
import type {ModelBox,ModelPart} from '../engine/contracts';

export type Face='top'|'bottom'|'west'|'front'|'east'|'back';
export const FACES:readonly Face[]=['top','bottom','west','front','east','back'];
/** Painter result for a texel the renderer discards (alpha 0: overlay gaps, rags, eye-only layers). */
export const CLEAR=-1;
/** Colour 0xRRGGBB (or CLEAR) of texel (x, y) of a w×h face region; x = 0 is the left column of the region as stored in the
 *  texture (seen from outside the box), y = 0 the top row (side faces) or the back edge (top face). */
export type Painter=(face:Face,x:number,y:number,w:number,h:number)=>number;
export type V3=[number,number,number];

export interface BoxDef{from:V3;size:V3;paint:Painter;inflate?:number;mirror?:boolean;
  /** Vanilla texture offset of the box unwrap; packed automatically when missing. */
  uv?:[number,number];
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

// ---- Java model space ------------------------------------------------------------------------------
// Geometry is written as the Java LayerDefinitions (`addBox` offsets, part offsets from the model root 24 px above the feet,
// y down) and converted to contract space (+y up from the feet, the mob facing -z): a half turn about z, so x and y flip,
// Java x and y rotations change sign and z rotations are kept.
/** Contract `from` of a Java `addBox(x, y, z, w, h, d)`. */
export const jfrom=(x:number,y:number,z:number,w:number,h:number):V3=>[-(x+w)+0,-(y+h)+0,z+0];
/** A Java part offset (top-level parts from the model root, children from their parent). */
export const jpivot=(x:number,y:number,z:number,top=true):V3=>[-x+0,(top?24-y:-y)+0,z+0];
/** A Java part rotation in contract space. */
export const jrot=(x:number,y:number,z:number):V3=>[-x+0,-y+0,z+0];

/** Builds contract parts from `defs` and a painter for a texture `width` wide (and at least `height` tall). */
export function buildTexture(defs:readonly PartDef[],width:number,height=0):BuiltTexture{
  const regions:{uv:[number,number];size:V3;paint:Painter}[]=[],byKey=new Map<string,[number,number]>(),painted=new Set<string>();
  // Packed boxes go on shelves below every explicitly placed region.
  let maxV=0;
  const visit=(list:readonly PartDef[])=>{for(const p of list){for(const b of p.boxes)if(b.uv)maxV=Math.max(maxV,b.uv[1]+unwrapSize(b.size)[1]);if(p.children)visit(p.children);}};
  visit(defs);
  let x=0,y=Math.max(maxV,height),shelf=0;
  const alloc=(w:number,h:number):[number,number]=>{
    if(w>width)throw new Error(`box unwrap ${w} wider than texture ${width}`);
    if(x+w>width){y+=shelf;x=0;shelf=0;}
    const at:[number,number]=[x,y];x+=w;shelf=Math.max(shelf,h);return at;
  };
  const toPart=(p:PartDef):ModelPart=>{
    const boxes:ModelBox[]=p.boxes.map(b=>{
      let uv=b.key?byKey.get(b.key):undefined;
      if(!uv)uv=b.uv?[b.uv[0],b.uv[1]]:alloc(...unwrapSize(b.size));
      const id=`${uv},${b.size}`;
      if(!painted.has(id)){painted.add(id);regions.push({uv,size:b.size,paint:b.paint});}
      if(b.key&&!byKey.has(b.key))byKey.set(b.key,uv);
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
  const used=x===0&&shelf===0?y:y+shelf;
  const texHeight=Math.max(16,Math.ceil(Math.max(used,height)/16)*16);
  return{parts,width,height:texHeight,paint(px,w,h){
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
const smooth=(t:number)=>t*t*(3-2*t);
/** Smooth value noise in [0,1) with features about `cell` texels across. */
export function blob(x:number,y:number,cell:number,seed:number):number{
  const gx=x/cell,gy=y/cell,x0=Math.floor(gx),y0=Math.floor(gy),fx=smooth(gx-x0),fy=smooth(gy-y0);
  const a=hash(x0,y0,seed),b=hash(x0+1,y0,seed),c=hash(x0,y0+1,seed),d=hash(x0+1,y0+1,seed);
  return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
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
/** Picks one of a palette's colours by cumulative weights from hash noise. */
export function weighted(palette:readonly number[],weights:readonly number[],x:number,y:number,seed:number):number{
  let total=0;for(const w of weights)total+=w;
  let r=hash(x,y,seed)*total;
  for(let i=0;i<palette.length;i++){if(r<weights[i])return palette[i];r-=weights[i];}
  return palette[palette.length-1];
}
/** Index of a face for seeding noise so neighbouring faces differ. */
export const faceSeed=(face:Face)=>FACES.indexOf(face)*131;
/** Pixel map from rows of characters (top row first): '.' (or a letter missing from `colors`) is undefined. */
export function pixelMap(rows:readonly string[],colors:Readonly<Record<string,number>>):(x:number,y:number)=>number|undefined{
  return(x,y)=>{const c=rows[y]?.[x];return c===undefined||c==='.'?undefined:colors[c];};
}

/** Scales a painter up: texel (x, y) of a big face samples (x·w0/w, y·h0/h) of the original w0×h0 face (baby heads). */
export function upscale(paint:Painter,w0:number,h0:number,d0:number):Painter{
  return(face,x,y,w,h)=>{
    const ow=face==='west'||face==='east'?d0:w0,oh=face==='top'||face==='bottom'?d0:h0;
    return paint(face,Math.min(ow-1,Math.floor(x*ow/w)),Math.min(oh-1,Math.floor(y*oh/h)),ow,oh);
  };
}
