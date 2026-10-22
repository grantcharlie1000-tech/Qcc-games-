// Box-model building blocks for the passive mobs: vanilla Java geometry helpers, position-based texture painting on the
// contract's cuboid unwrap, and a model builder that adds texture variants (mooshroom, rabbit coats) and Java-style baby heads.
//
// Java model space: geometry is written exactly as the Java LayerDefinitions (`addBox` at `texOffs`, part offsets measured
// from the model root 24 px above the feet, y down, rotations in radians) and converted to engine/contracts model space
// (+y up, pivots relative to the feet centre, the mob facing -z) by the j* helpers. The conversion is a half turn about z:
// x and y flip, a Java x or y rotation changes sign and a z rotation is kept, so texture offsets stay where vanilla has them.
//
// Painting: every texel of every box face is mapped back to the point of the model it covers (rest pose, entity space,
// through the same face orientation as the entity renderer, entity/model.ts) and a shader colours it from where it is on
// the mob (back, belly, face, hooves...). Rotated boxes (the bodies of the quadrupeds) come out right without hand mapping.
//
// Baby heads: vanilla quadrupeds and chickens draw a baby's head at full size on a half-size body. The entity framework
// scales a baby's whole model by 0.5, so the builder adds `baby_<part>` copies of the head parts with every box doubled
// (painted from a 2× upscale of the adult texture) at the baby head position, and swaps them in for babies.
//
// Variants stack whole textures vertically. Each variant's parts sit under a box-less group part named after the variant
// (pivot 0, no rotation) and keep the plain part names, the same in every group. animate shows one group and writes
// poses only for that variant's parts, so the pose record holds one entry per group plus one per part name (rabbit: 6 + 14),
// not one per part of every variant, and the renderer skips a hidden coat with one lookup.
import type {AnimationState,Entity,EntityModel,ModelBox,ModelPart,PartPose} from '../engine/contracts';
import {FACE_CORNERS,FACE_NORMALS,euler,faceRects,identity,mat,multiply,type Mat} from './model';

export type Face='top'|'bottom'|'west'|'front'|'east'|'back';
/** Faces in the contract's output order (top, bottom, -x, front -z, +x, back +z). */
export const FACES:readonly Face[]=['top','bottom','west','front','east','back'];
export type Vec3T=[number,number,number];

/** A face's rectangle [x, y, w, h] in the texture for the contract's cuboid unwrap: a top row of depth×width faces
 *  (top, bottom), then the side row (-x, front -z, +x, back +z). Side faces have row 0 at the top of the box. */
export function faceRect(uv:readonly [number,number],size:readonly [number,number,number],face:Face):[number,number,number,number]{
  return faceRects(uv,size)[FACES.indexOf(face)];
}
/** Width and height of a box's whole unwrap. */
export const unwrapSize=(size:readonly [number,number,number]):[number,number]=>[2*(size[0]+size[2]),size[2]+size[1]];

// ---- Java model space ------------------------------------------------------------------------------
/** A Java `texOffs(u, v).addBox(x, y, z, w, h, d)` in contract space. */
export function jbox(x:number,y:number,z:number,w:number,h:number,d:number,u:number,v:number,opt:{inflate?:number;mirror?:boolean}={}):ModelBox{
  const box:ModelBox={from:[-(x+w)+0,-(y+h)+0,z+0],size:[w,h,d],uv:[u,v]};
  if(opt.inflate)box.inflate=opt.inflate;
  if(opt.mirror)box.mirror=true;
  return box;
}
/** A Java part offset: top-level parts are measured from the model root (24 px above the feet), children from their parent. */
export const jpivot=(x:number,y:number,z:number,top=true):Vec3T=>[-x+0,(top?24-y:-y)+0,z+0];
/** A Java part rotation (radians) in contract space. */
export const jrot=(x:number,y:number,z:number):Vec3T=>[-x+0,-y+0,z+0];

// ---- Colour and noise -------------------------------------------------------------------------
/** Deterministic hash noise in [0,1) for integer lattice points. */
export function hash(x:number,y:number,seed:number):number{
  let h=(Math.imul(x|0,0x27d4eb2d)^Math.imul(y|0,0x165667b1)^Math.imul(seed|0,0x9e3779b1))>>>0;
  h=Math.imul(h^h>>>15,0x85ebca6b);h=Math.imul(h^h>>>13,0xc2b2ae35);h^=h>>>16;
  return (h>>>0)/4294967296;
}
/** Deterministic hash of three integers to [0, 1). */
export function hash3(x:number,y:number,z:number,seed:number):number{return hash(Math.imul(x|0,0x632be5ab)^(y|0),z,seed);}
const smooth=(t:number)=>t*t*(3-2*t);
/** Smooth value noise in [0,1) with features about `cell` pixels across. */
export function blob(x:number,y:number,cell:number,seed:number):number{
  const gx=x/cell,gy=y/cell,x0=Math.floor(gx),y0=Math.floor(gy),fx=smooth(gx-x0),fy=smooth(gy-y0);
  const a=hash(x0,y0,seed),b=hash(x0+1,y0,seed),c=hash(x0,y0+1,seed),d=hash(x0+1,y0+1,seed);
  return (a+(b-a)*fx)*(1-fy)+(c+(d-c)*fx)*fy;
}
/** Smooth 3D value noise in [0,1) with features about `cell` pixels across (patches that wrap round a body). */
export function blob3(x:number,y:number,z:number,cell:number,seed:number):number{
  const gx=x/cell,gy=y/cell,gz=z/cell,x0=Math.floor(gx),y0=Math.floor(gy),z0=Math.floor(gz);
  const fx=smooth(gx-x0),fy=smooth(gy-y0),fz=smooth(gz-z0);
  let v=0;
  for(let k=0;k<8;k++){
    const dx=k&1,dy=k>>1&1,dz=k>>2&1;
    v+=hash3(x0+dx,y0+dy,z0+dz,seed)*(dx?fx:1-fx)*(dy?fy:1-fy)*(dz?fz:1-fz);
  }
  return v;
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
/** Picks a colour from a palette by noise n in [0,1) and cumulative weights. */
export function pick(colours:readonly number[],weights:readonly number[],n:number):number{
  let total=0;for(const w of weights)total+=w;
  let r=n*total;
  for(let i=0;i<colours.length;i++){if(r<weights[i])return colours[i];r-=weights[i];}
  return colours[colours.length-1];
}

// ---- Position painter ------------------------------------------------------------------------------
/** One texel of a box face: where it sits on the model (rest pose, entity space, pixels) and on the face. */
export interface Texel{
  x:number;y:number;z:number;
  /** Face normal in entity space (rest pose). */
  nx:number;ny:number;nz:number;
  /** Part name (the plain spec name) and the box's index in it. */
  part:string;box:number;
  /** 0 top, 1 bottom, 2 -x, 3 front (-z), 4 +x, 5 back (+z): the face in the box's own frame. */
  face:number;
  /** Column and row on the face as seen from outside (0 = left / top) and the face size in texels. */
  i:number;j:number;w:number;h:number;
}
/** Colour 0xRRGGBB, or -1 for a transparent texel. */
export type Shader=(t:Texel)=>number;
/** Rest transforms (part → entity space) of every part by name, parents first. */
export function restTransforms(parts:readonly ModelPart[]):Map<string,Mat>{
  const out=new Map<string,Mat>();
  const walk=(list:readonly ModelPart[],parent:Mat)=>{for(const p of list){
    const r=p.rotation??[0,0,0],local=euler(mat(),r[0],r[1],r[2],p.pivot[0],p.pivot[1],p.pivot[2]);
    const m=multiply(mat(),parent,local);out.set(p.name,m);
    if(p.children)walk(p.children,m);
  }};
  walk(parts,identity(mat()));
  return out;
}
/** Paints every face of every box of `parts` (and their children) with `shader`, rows offset by `oy`; later boxes overwrite
 *  shared regions. `name` maps a part name to the name the shader sees. */
export function paintParts(pixels:Uint8ClampedArray,width:number,oy:number,parts:readonly ModelPart[],shader:Shader,name=(n:string)=>n):void{
  const transforms=restTransforms(parts),height=pixels.length/4/width;
  const t:Texel={x:0,y:0,z:0,nx:0,ny:0,nz:0,part:'',box:0,face:0,i:0,j:0,w:0,h:0};
  const walk=(list:readonly ModelPart[])=>{for(const p of list){
    const m=transforms.get(p.name)!;
    p.boxes.forEach((b,bi)=>{
      const [fx,fy,fz]=b.from,[sw,sh,sd]=b.size;
      const corner=(k:number)=>[k&1?fx+sw:fx,k&2?fy+sh:fy,k&4?fz+sd:fz];
      const rects=faceRects(b.uv,b.size,!!b.mirror),drop=[false,sh===0,false,false,sw===0,sd===0];
      for(let f=0;f<6;f++){
        const [rx,ry,rw,rh]=rects[f];
        if(rw<=0||rh<=0||drop[f])continue;
        const [a,c1,c2]=FACE_CORNERS[f],P0=corner(a),P1=corner(c1),P2=corner(c2),n=FACE_NORMALS[f];
        t.nx=m[0]*n[0]+m[1]*n[1]+m[2]*n[2];t.ny=m[4]*n[0]+m[5]*n[1]+m[6]*n[2];t.nz=m[8]*n[0]+m[9]*n[1]+m[10]*n[2];
        t.part=name(p.name);t.box=bi;t.face=f;t.w=rw;t.h=rh;
        for(let j=0;j<rh;j++)for(let i=0;i<rw;i++){
          let s=(i+.5)/rw;const v=(j+.5)/rh;if(b.mirror)s=1-s;
          const lx=P0[0]+(P1[0]-P0[0])*s+(P2[0]-P0[0])*v,ly=P0[1]+(P1[1]-P0[1])*s+(P2[1]-P0[1])*v,lz=P0[2]+(P1[2]-P0[2])*s+(P2[2]-P0[2])*v;
          t.x=m[0]*lx+m[1]*ly+m[2]*lz+m[3];t.y=m[4]*lx+m[5]*ly+m[6]*lz+m[7];t.z=m[8]*lx+m[9]*ly+m[10]*lz+m[11];
          t.i=b.mirror?rw-1-i:i;t.j=j;
          const px=rx+i,py=ry+j+oy;
          if(px<0||px>=width||py<0||py>=height)continue;
          const colour=shader(t),o=(py*width+px)*4;
          if(colour<0){pixels[o]=pixels[o+1]=pixels[o+2]=pixels[o+3]=0;continue;}
          pixels[o]=colour>>16&255;pixels[o+1]=colour>>8&255;pixels[o+2]=colour&255;pixels[o+3]=255;
        }
      }
    });
    if(p.children)walk(p.children);
  }};
  walk(parts);
}
/** Noise of a texel from its model position (texels on the same spot of two faces match). */
export const texelNoise=(t:Texel,seed:number)=>hash3(Math.floor(t.x*2),Math.floor(t.y*2),Math.floor(t.z*2),seed);
/** Writes hand-drawn pixel rows (top row first) at (x0, y0); characters missing from the palette are transparent. */
export function blit(px:Uint8ClampedArray,width:number,x0:number,y0:number,rows:readonly string[],palette:Readonly<Record<string,number>>):void{
  for(let y=0;y<rows.length;y++)for(let x=0;x<rows[y].length;x++){
    const c=palette[rows[y][x]],o=((y0+y)*width+x0+x)*4;
    if(c===undefined){px[o]=px[o+1]=px[o+2]=px[o+3]=0;continue;}
    px[o]=c>>16&255;px[o+1]=c>>8&255;px[o+2]=c&255;px[o+3]=255;
  }
}

// ---- Model builder ----------------------------------------------------------------------------
export interface ModelVariant{
  id:string;
  /** Colours every box of the base parts and of `extra` (texels carry the plain part names). */
  shader:Shader;
  /** Extra painting after the boxes (sprites of plane parts), rows offset by `oy`. */
  decorate?(px:Uint8ClampedArray,width:number,oy:number):void;
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
  /** Writes the frame's pose by base part name (no `baby_`). Every entry is reset to rest first. */
  pose(e:Entity,pose:Record<string,PartPose>,state:AnimationState):void;
  extraVisible?(e:Entity):boolean;
  appearance?(e:Entity):{tint?:number;flash?:number;scale?:number};
  scale?:number;
}
type Role='body'|'adultHead'|'baby'|'extra';
interface Entry{name:string;base:string;role:Role}
const scaleVec=(v:readonly number[],f:number):Vec3T=>[v[0]*f,v[1]*f,v[2]*f];

/** Expands a spec into a contract EntityModel (variants, baby heads, reusable pose objects). */
export function buildModel(spec:ModelSpec):EntityModel{
  const babyNames=new Set(spec.babyHead?.parts??[]),babyParts:ModelPart[]=[],copies:{sx:number;sy:number;w:number;h:number;dx:number;dy:number}[]=[];
  let shelfX=0,shelfY=spec.height,shelfH=0;
  const alloc=(w:number,h:number):[number,number]=>{
    if(w>spec.width)throw new Error('baby head region wider than the texture');
    if(shelfX+w>spec.width){shelfY+=shelfH;shelfX=0;shelfH=0;}
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
  const parts:ModelPart[]=[],baseNames=new Set<string>(),partNames=new Set<string>();
  /** Per variant: the top-level parts it poses. */
  const entries:Entry[][]=[];
  const shift=(p:ModelPart,oy:number):ModelPart=>{
    partNames.add(p.name);
    return{...p,boxes:p.boxes.map(b=>({...b,uv:[b.uv[0],b.uv[1]+oy] as [number,number]})),children:p.children?.map(c=>shift(c,oy))};
  };
  spec.variants.forEach((variant,i)=>{
    const oy=i*blockHeight,own:ModelPart[]=[],list:Entry[]=[];
    const add=(p:ModelPart,base:string,role:Role)=>{own.push(shift(p,oy));list.push({name:p.name,base,role});baseNames.add(base);};
    for(const p of spec.parts)add(p,p.name,babyNames.has(p.name)?'adultHead':'body');
    for(const p of babyParts)add(p,p.name.slice(5),'baby');
    for(const p of variant.extra??[])add(p,p.name,'extra');
    if(new Set(list.map(en=>en.name)).size!==list.length)throw new Error(`duplicate part name in variant ${variant.id}`);
    entries.push(list);
    if(multi)parts.push({name:variant.id,pivot:[0,0,0],boxes:[],children:own});else parts.push(...own);
  });
  const groups=multi?spec.variants.map(v=>v.id):[];
  if(new Set(groups).size!==groups.length||groups.some(g=>partNames.has(g)))throw new Error('variant ids must be unique and differ from part names');
  const base:Record<string,PartPose>={};
  for(const n of baseNames)base[n]={x:0,y:0,z:0,px:0,py:0,pz:0,visible:true};
  const names=[...baseNames];
  return{
    textureWidth:spec.width,textureHeight:blockHeight*spec.variants.length,parts,scale:spec.scale,
    paint(px,width){
      spec.variants.forEach((variant,i)=>{
        const oy=i*blockHeight;
        paintParts(px,width,oy,[...spec.parts,...variant.extra??[]],variant.shader);
        variant.decorate?.(px,width,oy);
        for(const c of copies)for(let y=0;y<2*c.h;y++)for(let x=0;x<2*c.w;x++){
          const s=((c.sy+(y>>1)+oy)*width+c.sx+(x>>1))*4,d=((c.dy+y+oy)*width+c.dx+x)*4;
          px[d]=px[s];px[d+1]=px[s+1];px[d+2]=px[s+2];px[d+3]=px[s+3];
        }
      });
    },
    animate(e,pose,state){
      for(let i=0;i<names.length;i++){const p=base[names[i]];p.x=p.y=p.z=0;p.px=p.py=p.pz=0;p.visible=true;}
      spec.pose(e,base,state);
      let variant=spec.variantOf?.(e)??0;
      if(!Number.isInteger(variant)||variant<0||variant>=entries.length)variant=0;
      const baby=e.baby,extra=!baby&&(spec.extraVisible?.(e)??true);
      // Only the entity's variant group is shown; the hidden groups' parts need no pose.
      for(let g=0;g<groups.length;g++){
        let out=pose[groups[g]];if(!out){out={x:0,y:0,z:0};pose[groups[g]]=out;}
        out.x=out.y=out.z=0;out.px=out.py=out.pz=0;out.visible=g===variant;
      }
      const list=entries[variant];
      for(let i=0;i<list.length;i++){
        const en=list[i],src=base[en.base];
        let on=src.visible!==false;
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
