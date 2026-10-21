// Box-model building blocks for the passive mobs: procedural texture painting on the standard cuboid unwrap,
// and a model builder that adds texture variants (mooshroom, rabbit coats) and Java-style baby heads.
//
// Baby heads: vanilla quadrupeds and chickens draw a baby's head at full size on a half-size body. The entity
// framework scales a baby's whole model by 0.5, so the builder adds `baby_<part>` copies of the head parts with
// every box doubled (painted from a 2× upscale of the adult texture) at the baby head position, and swaps them in
// for babies. Variants stack whole textures vertically; their parts are prefixed `<variant>.`.
import type {AnimationState,Entity,EntityModel,ModelBox,ModelPart,PartPose} from '../engine/contracts';

export type Face='top'|'bottom'|'west'|'front'|'east'|'back';
export const FACES:readonly Face[]=['top','bottom','west','front','east','back'];
export type Vec3T=[number,number,number];

/** A face's rectangle [x, y, w, h] in the texture for the contract's cuboid unwrap: a top row of depth×width faces
 *  (top, bottom), then the side row (-x, front -z, +x, back +z). Side faces have row 0 at the top of the box. */
export function faceRect(uv:readonly [number,number],size:readonly [number,number,number],face:Face):[number,number,number,number]{
  const [u,v]=uv,[w,h,d]=size;
  switch(face){
    case 'top':return[u+d,v,w,d];
    case 'bottom':return[u+d+w,v,w,d];
    case 'west':return[u,v+d,d,h];
    case 'front':return[u+d,v+d,w,h];
    case 'east':return[u+d+w,v+d,d,h];
    default:return[u+2*d+w,v+d,w,h];
  }
}
/** Width and height of a box's whole unwrap. */
export const unwrapSize=(size:readonly [number,number,number]):[number,number]=>[2*(size[0]+size[2]),size[2]+size[1]];

// ---- Colour and noise -------------------------------------------------------------------------
/** Deterministic hash noise in [0,1) for integer lattice points. */
export function hash(x:number,y:number,seed:number):number{
  let h=(Math.imul(x|0,0x27d4eb2d)^Math.imul(y|0,0x165667b1)^Math.imul(seed|0,0x9e3779b1))>>>0;
  h=Math.imul(h^h>>>15,0x85ebca6b);h=Math.imul(h^h>>>13,0xc2b2ae35);h^=h>>>16;
  return (h>>>0)/4294967296;
}
const smooth=(t:number)=>t*t*(3-2*t);
/** Smooth value noise in [0,1) with features about `cell` pixels across. */
export function blob(x:number,y:number,cell:number,seed:number):number{
  const gx=x/cell,gy=y/cell,x0=Math.floor(gx),y0=Math.floor(gy),fx=smooth(gx-x0),fy=smooth(gy-y0);
  const a=hash(x0,y0,seed),b=hash(x0+1,y0,seed),c=hash(x0,y0+1,seed),d=hash(x0+1,y0+1,seed);
  return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
}
const channel=(v:number)=>Math.max(0,Math.min(255,Math.round(v)));
/** Multiplies a 0xRRGGBB colour's channels by f. */
export function shade(c:number,f:number):number{return channel((c>>16&255)*f)<<16|channel((c>>8&255)*f)<<8|channel((c&255)*f);}
/** Linear blend of two colours. */
export function mix(a:number,b:number,t:number):number{
  const l=(s:number)=>channel((a>>s&255)+((b>>s&255)-(a>>s&255))*t);
  return l(16)<<16|l(8)<<8|l(0);
}
/** Brightness jitter: n in [0,1) maps to ±amount. */
export const vary=(c:number,n:number,amount:number)=>shade(c,1+(n-.5)*2*amount);

export type FacePainter=(face:Face,x:number,y:number,w:number,h:number)=>number;
/** Writes opaque pixels into one variant's block of the texture (rows offset by `oy`). */
export class Canvas{
  constructor(readonly px:Uint8ClampedArray,readonly width:number,readonly oy=0){}
  set(x:number,y:number,c:number):void{
    x=Math.floor(x);y=Math.floor(y);if(x<0||x>=this.width||y<0)return;
    const i=((y+this.oy)*this.width+x)*4;if(i+3>=this.px.length)return;
    this.px[i]=c>>16&255;this.px[i+1]=c>>8&255;this.px[i+2]=c&255;this.px[i+3]=255;
  }
  get(x:number,y:number):number{const i=((y+this.oy)*this.width+x)*4;return this.px[i]<<16|this.px[i+1]<<8|this.px[i+2];}
  /** Paints every texel of a box's unwrap; `paint` returns the colour of face texel (x, y) of a w×h face. */
  box(uv:readonly [number,number],size:readonly [number,number,number],paint:FacePainter):void{
    for(const face of FACES){
      const [x0,y0,w,h]=faceRect(uv,size,face);
      for(let y=0;y<h;y++)for(let x=0;x<w;x++)this.set(x0+x,y0+y,paint(face,x,y,w,h));
    }
  }
}

// ---- Model builder ----------------------------------------------------------------------------
export interface ModelVariant{
  id:string;
  /** Paints this variant's block: every box of the base parts and of `extra`. */
  paint(c:Canvas):void;
  /** Parts only this variant has (mooshroom mushrooms); shown on adults when `extraVisible` allows. */
  extra?:ModelPart[];
}
export interface ModelSpec{
  /** Size of one variant's painted block, before the generated baby head band. */
  width:number;height:number;
  parts:ModelPart[];
  variants:readonly ModelVariant[];
  /** Index into variants for an entity (default 0). */
  variantOf?(e:Entity):number;
  /** Head parts drawn full size on babies; `pivot` is where the (first listed) head's pivot sits on a baby, in final pixels. */
  babyHead?:{parts:readonly string[];pivot:Vec3T};
  /** Writes the frame's pose by base part name (no variant prefix, no `baby_`). Every entry is reset to rest first. */
  pose(e:Entity,pose:Record<string,PartPose>,state:AnimationState):void;
  extraVisible?(e:Entity):boolean;
  appearance?(e:Entity):{tint?:number;flash?:number;scale?:number};
  scale?:number;
}
type Role='body'|'adultHead'|'baby'|'extra';
interface Entry{name:string;base:string;variant:number;role:Role}
const scaleVec=(v:readonly number[],f:number):Vec3T=>[v[0]*f,v[1]*f,v[2]*f];

/** Expands a spec into a contract EntityModel (variants, baby heads, reusable pose objects). */
export function buildModel(spec:ModelSpec):EntityModel{
  const babyNames=new Set(spec.babyHead?.parts??[]),babyParts:ModelPart[]=[],copies:{sx:number;sy:number;w:number;h:number;dx:number;dy:number}[]=[];
  let shelfX=0,shelfY=spec.height,shelfH=0;
  const alloc=(w:number,h:number):[number,number]=>{
    if(shelfX+w>spec.width){shelfY+=shelfH;shelfX=0;shelfH=0;}
    if(w>spec.width)throw new Error('baby head region wider than the texture');
    const at:[number,number]=[shelfX,shelfY];shelfX+=w;shelfH=Math.max(shelfH,h);return at;
  };
  if(spec.babyHead){
    const heads=spec.parts.filter(p=>babyNames.has(p.name));
    if(heads.length!==babyNames.size)throw new Error('unknown baby head part');
    const ref=heads[0].pivot,regions=new Map<string,[number,number]>();
    for(const p of heads){
      const boxes:ModelBox[]=p.boxes.map(b=>{
        const key=`${b.uv},${b.size}`;let at=regions.get(key);
        if(!at){const [w,h]=unwrapSize(b.size);at=alloc(2*w,2*h);regions.set(key,at);copies.push({sx:b.uv[0],sy:b.uv[1],w,h,dx:at[0],dy:at[1]});}
        return{...b,from:scaleVec(b.from,2),size:scaleVec(b.size,2),uv:[at[0],at[1]],inflate:b.inflate!==undefined?b.inflate*2:undefined};
      });
      const pivot=spec.babyHead.pivot,offset=[p.pivot[0]-ref[0],p.pivot[1]-ref[1],p.pivot[2]-ref[2]];
      babyParts.push({...p,name:`baby_${p.name}`,pivot:[2*(pivot[0]+offset[0]),2*(pivot[1]+offset[1]),2*(pivot[2]+offset[2])],boxes});
    }
  }
  const blockHeight=spec.babyHead?shelfY+shelfH:spec.height,multi=spec.variants.length>1;
  const parts:ModelPart[]=[],entries:Entry[]=[],baseNames=new Set<string>();
  spec.variants.forEach((variant,i)=>{
    const oy=i*blockHeight,prefix=multi?`${variant.id}.`:'';
    const add=(p:ModelPart,base:string,role:Role)=>{
      const name=prefix+p.name;
      parts.push({...p,name,boxes:p.boxes.map(b=>({...b,uv:[b.uv[0],b.uv[1]+oy] as [number,number]}))});
      entries.push({name,base,variant:i,role});baseNames.add(base);
    };
    for(const p of spec.parts)add(p,p.name,babyNames.has(p.name)?'adultHead':'body');
    for(const p of babyParts)add(p,p.name.slice(5),'baby');
    for(const p of variant.extra??[])add(p,p.name,'extra');
  });
  const base:Record<string,PartPose>={};
  for(const n of baseNames)base[n]={x:0,y:0,z:0,px:0,py:0,pz:0,visible:true};
  const names=[...baseNames];
  return{
    textureWidth:spec.width,textureHeight:blockHeight*spec.variants.length,parts,scale:spec.scale,
    paint(px,width){
      spec.variants.forEach((variant,i)=>{
        const oy=i*blockHeight;variant.paint(new Canvas(px,width,oy));
        for(const c of copies)for(let y=0;y<2*c.h;y++)for(let x=0;x<2*c.w;x++){
          const s=((c.sy+(y>>1)+oy)*width+c.sx+(x>>1))*4,d=((c.dy+y+oy)*width+c.dx+x)*4;
          px[d]=px[s];px[d+1]=px[s+1];px[d+2]=px[s+2];px[d+3]=px[s+3];
        }
      });
    },
    animate(e,pose,state){
      for(let i=0;i<names.length;i++){const p=base[names[i]];p.x=p.y=p.z=0;p.px=p.py=p.pz=0;p.visible=true;}
      spec.pose(e,base,state);
      const variant=spec.variantOf?.(e)??0,baby=e.baby,extra=!baby&&(spec.extraVisible?.(e)??true);
      for(let i=0;i<entries.length;i++){
        const en=entries[i],src=base[en.base];
        let on=en.variant===variant&&src.visible!==false;
        if(en.role==='baby')on=on&&baby;else if(en.role==='adultHead')on=on&&!baby;else if(en.role==='extra')on=on&&extra;
        const m=en.role==='baby'?2:1;
        let out=pose[en.name];if(!out){out={x:0,y:0,z:0};pose[en.name]=out;}
        out.x=src.x;out.y=src.y;out.z=src.z;out.px=(src.px??0)*m;out.py=(src.py??0)*m;out.pz=(src.pz??0)*m;out.visible=on;
      }
    },
    appearance:spec.appearance
  };
}

// ---- Shared poses -----------------------------------------------------------------------------
/** Vanilla heads turn at most 75° from the body. */
export const MAX_HEAD_YAW=75*Math.PI/180;
export const clampHeadYaw=(yaw:number)=>Math.max(-MAX_HEAD_YAW,Math.min(MAX_HEAD_YAW,yaw));
export const clampHeadPitch=(pitch:number)=>Math.max(-1.2,Math.min(1.2,pitch));
/** Quadruped walk (vanilla QuadrupedModel): diagonal legs in phase, swing 1.4 rad at full speed; head yaw and pitch. */
export function poseQuadruped(pose:Record<string,PartPose>,state:AnimationState):void{
  const a=1.4*state.limbAmount,c=Math.cos(state.limbSwing)*a;
  pose.leg_rh.x=c;pose.leg_lf.x=c;pose.leg_lh.x=-c;pose.leg_rf.x=-c;
  pose.head.x=clampHeadPitch(state.headPitch);pose.head.y=clampHeadYaw(state.headYaw);
}
