// Box models and painted textures of the companion mobs (wolf and squid), drawn in code to look like vanilla Java
// 1.20/1.21 mobs: the vanilla box geometry, texture sizes (64×32 per skin) and UV layouts, with original procedural fur
// and skin. Nothing is copied from Mojang's files.
//
// Geometry is written in Java model space (y down, the model root 24 px above the feet, x mirrored) and converted to the
// engine/contracts model space (+y up, pivots relative to the feet, mob facing -z) by the j* helpers: the conversion is a
// half turn about z, so x and y flip, a Java x or y rotation changes sign and a z rotation is kept.
//
// Textures are painted by position: every texel of every box face is mapped back to the point of the model it covers
// (rest pose, entity space, using the cuboid unwrap of engine/contracts ModelBox and the face orientation of the entity
// renderer: each face shows its region unmirrored from outside, rows top-down) and coloured from where it is (back,
// belly, face, paws...). Rotated boxes (the wolf's body and mane) therefore come out right without hand mapping.
import type {AnimationState,Entity,EntityModel,ModelBox,ModelPart,PartPose} from '../engine/contracts';

// ---- Java model space ------------------------------------------------------------------------------
/** A Java `addBox(x, y, z, w, h, d)` at `texOffs(u, v)` in contract space. */
export function jbox(x:number,y:number,z:number,w:number,h:number,d:number,u:number,v:number,inflate?:number):ModelBox{
  const box:ModelBox={from:[-(x+w)+0,-(y+h)+0,z+0],size:[w,h,d],uv:[u,v]};
  if(inflate)box.inflate=inflate;
  return box;
}
/** A Java part offset: top-level parts are measured from the model root (24 px above the feet), children from their parent. */
export const jpivot=(x:number,y:number,z:number,top=true):[number,number,number]=>[-x+0,(top?24-y:-y)+0,z+0];
/** A Java part rotation (radians) in contract space. */
export const jrot=(x:number,y:number,z:number):[number,number,number]=>[-x+0,-y+0,z+0];

// ---- Colour helpers --------------------------------------------------------------------------------
/** Deterministic hash of three integers to [0, 1). */
export function hash3(x:number,y:number,z:number,seed=0):number{
  let h=Math.imul(x|0,0x27d4eb2d)^Math.imul(y|0,0x165667b1)^Math.imul(z|0,0x9e3779b1)^Math.imul(seed|0,0x85ebca6b);
  h=Math.imul(h^h>>>15,0x2c1b3c6d);h=Math.imul(h^h>>>12,0x297a2d39);h^=h>>>15;
  return (h>>>0)/4294967296;
}
export function mix(a:number,b:number,t:number):number{
  const k=Math.max(0,Math.min(1,t));
  const r=(a>>16&255)+((b>>16&255)-(a>>16&255))*k,g=(a>>8&255)+((b>>8&255)-(a>>8&255))*k,bl=(a&255)+((b&255)-(a&255))*k;
  return Math.round(r)<<16|Math.round(g)<<8|Math.round(bl);
}
export function scale(c:number,k:number):number{
  const f=(v:number)=>Math.max(0,Math.min(255,Math.round(v*k)));
  return f(c>>16&255)<<16|f(c>>8&255)<<8|f(c&255);
}

// ---- Position painter ------------------------------------------------------------------------------
/** One texel of a box face: where it sits on the model (rest pose, entity space, pixels) and on the face. */
export interface Texel{
  x:number;y:number;z:number;nx:number;ny:number;nz:number;
  part:string;box:number;
  /** 0 top, 1 bottom, 2 -x, 3 front (-z), 4 +x, 5 back (+z): the face in the box's own frame. */
  face:number;
  /** Column and row on the face as seen from outside (0 = left / top) and the face size in texels. */
  i:number;j:number;w:number;h:number;
}
/** Colour 0xRRGGBB, or -1 for a transparent texel. */
export type Shader=(t:Texel)=>number;
type Mat=number[];
const FACE_CORNERS=[[7,6,3,2],[1,0,5,4],[2,6,0,4],[3,2,1,0],[7,3,5,1],[6,7,4,5]] as const;
const FACE_NORMALS=[[0,1,0],[0,-1,0],[-1,0,0],[0,0,-1],[1,0,0],[0,0,1]] as const;
/** Texture rectangles [x, y, w, h] of a box's faces in the order above (contract cuboid unwrap). */
export function faceRects(uv:readonly [number,number],size:readonly [number,number,number],mirror=false):[number,number,number,number][]{
  const [u,v]=uv,[w,h,d]=size;
  const west:[number,number,number,number]=[u,v+d,d,h],east:[number,number,number,number]=[u+d+w,v+d,d,h];
  return[[u+d,v,w,d],[u+d+w,v,w,d],mirror?east:west,[u+d,v+d,w,h],mirror?west:east,[u+2*d+w,v+d,w,h]];
}
/** translate(t) · Rz · Ry · Rx, as a 3×4 row-major matrix. */
function trs(tx:number,ty:number,tz:number,x:number,y:number,z:number):Mat{
  const cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);
  return[cz*cy,cz*sy*sx-sz*cx,cz*sy*cx+sz*sx,tx, sz*cy,sz*sy*sx+cz*cx,sz*sy*cx-cz*sx,ty, -sy,cy*sx,cy*cx,tz];
}
function mul(a:Mat,b:Mat):Mat{
  const o:Mat=new Array(12);
  for(let r=0;r<3;r++)for(let c=0;c<4;c++)o[r*4+c]=a[r*4]*b[c]+a[r*4+1]*b[4+c]+a[r*4+2]*b[8+c]+(c===3?a[r*4+3]:0);
  return o;
}
const IDENTITY:Mat=[1,0,0,0,0,1,0,0,0,0,1,0];
/** Part → entity transforms (3×4 row-major) under a pose, by the entity renderer's rule: translate(pivot + pose offset) ·
 *  rest rotation · pose rotation. Hidden parts and their children are left out. */
export function posedTransforms(parts:readonly ModelPart[],pose:Readonly<Record<string,PartPose>>):Map<string,number[]>{
  const out=new Map<string,Mat>();
  const walk=(list:readonly ModelPart[],parent:Mat)=>{for(const p of list){
    const q=pose[p.name];
    if(q&&q.visible===false)continue;
    const r=p.rotation??[0,0,0];
    let m=trs(p.pivot[0]+(q?.px??0),p.pivot[1]+(q?.py??0),p.pivot[2]+(q?.pz??0),r[0],r[1],r[2]);
    if(q&&(q.x||q.y||q.z))m=mul(m,trs(0,0,0,q.x||0,q.y||0,q.z||0));
    m=mul(parent,m);out.set(p.name,m);
    if(p.children)walk(p.children,m);
  }};
  walk(parts,IDENTITY);
  return out;
}
/** The rest transform (part → entity space) of every part, by name. */
export const restTransforms=(parts:readonly ModelPart[])=>posedTransforms(parts,{});
/** Applies a part transform to a point (pixels). */
export function transformPoint(m:readonly number[],x:number,y:number,z:number):[number,number,number]{
  return[m[0]*x+m[1]*y+m[2]*z+m[3],m[4]*x+m[5]*y+m[6]*z+m[7],m[8]*x+m[9]*y+m[10]*z+m[11]];
}
/** Paints every face of every box of `parts` (and their children) with `shader`; later boxes overwrite shared regions. */
export function paintParts(pixels:Uint8ClampedArray,width:number,height:number,parts:readonly ModelPart[],shader:Shader):void{
  const transforms=restTransforms(parts);
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
        t.part=p.name;t.box=bi;t.face=f;t.w=rw;t.h=rh;
        for(let j=0;j<rh;j++)for(let i=0;i<rw;i++){
          let s=(i+.5)/rw;const v=(j+.5)/rh;if(b.mirror)s=1-s;
          const lx=P0[0]+(P1[0]-P0[0])*s+(P2[0]-P0[0])*v,ly=P0[1]+(P1[1]-P0[1])*s+(P2[1]-P0[1])*v,lz=P0[2]+(P1[2]-P0[2])*s+(P2[2]-P0[2])*v;
          t.x=m[0]*lx+m[1]*ly+m[2]*lz+m[3];t.y=m[4]*lx+m[5]*ly+m[6]*lz+m[7];t.z=m[8]*lx+m[9]*ly+m[10]*lz+m[11];
          t.i=b.mirror?rw-1-i:i;t.j=j;
          const px=rx+i,py=ry+j;
          if(px<0||py<0||px>=width||py>=height)continue;
          const colour=shader(t),o=(py*width+px)*4;
          if(colour<0){pixels[o+3]=0;continue;}
          pixels[o]=colour>>16&255;pixels[o+1]=colour>>8&255;pixels[o+2]=colour&255;pixels[o+3]=255;
        }
      }
    });
    if(p.children)walk(p.children);
  }};
  walk(parts);
}
/** Noise of a texel from its model position (texels on the same spot of two boxes match). */
const texelNoise=(t:Texel,seed:number)=>hash3(Math.round(t.x*2),Math.round(t.y*2),Math.round(t.z*2),seed);

/** Finds or makes the pose of a part (pose objects are kept by the renderer between frames). */
export function poseOf(pose:Record<string,PartPose>,name:string):PartPose{
  let p=pose[name];
  if(!p){p={x:0,y:0,z:0};pose[name]=p;}
  return p;
}

// ---- Wolf ------------------------------------------------------------------------------------------
/** Vanilla 1.20.5 wolf variants of our biomes: pale (taiga and the default), woods (forests), ashen (snowy taiga). */
export const WOLF_VARIANTS=['pale','woods','ashen'] as const;
export type WolfVariant=typeof WOLF_VARIANTS[number];
/** Per-entity state the wolf model draws (filled by the wolf kind for the frame being drawn). */
export interface WolfLook{
  variant:number;tamed:boolean;angry:boolean;sitting:boolean;
  /** Tail angle from hanging straight down, radians (vanilla getTailAngle). */
  tail:number;
  /** Head tilt while begging, radians (vanilla getHeadRollAngle). */
  headRoll:number;
  /** Shake animation 0..2 while shaking off water, else 0 (vanilla shakeAnim). */
  shake:number;
}
export const newWolfLook=():WolfLook=>({variant:0,tamed:false,angry:false,sitting:false,tail:Math.PI/5,headRoll:0,shake:0});
/** Vanilla getBodyRollAngle: the shake wobble of a part, `offset` delays it along the body. */
export function bodyRoll(shake:number,offset:number):number{
  if(shake<=0)return 0;
  const f=Math.max(0,Math.min(1,(shake+offset)/1.8));
  return Math.sin(f*Math.PI)*Math.sin(f*Math.PI*11)*.15*Math.PI;
}
/** Texture of one wolf skin (vanilla 64×32 layout); the three skins are stacked, then a strip for the collar. */
const SKIN_H=32,WOLF_TEX_W=64,WOLF_TEX_H=SKIN_H*WOLF_VARIANTS.length+16,COLLAR_V=SKIN_H*WOLF_VARIANTS.length;
/** Free spots of the vanilla layout used for the eye decals (tame and angry faces). */
const TAME_EYES:[number,number]=[52,0],ANGRY_EYES:[number,number]=[52,4];

interface Fur{light:number;mid:number;shadow:number;back:number;belly:number;ear:number;nose:number;tail:number;tip:number}
const FURS:Record<WolfVariant,Fur>={
  pale:{light:0xe4e1db,mid:0xd0cbc3,shadow:0xb7b0a6,back:0xa0988e,belly:0xefede9,ear:0x8a7d74,nose:0x2a2522,tail:0xcbc5bc,tip:0x958c82},
  woods:{light:0xc7a77f,mid:0xa7855e,shadow:0x876848,back:0x5b4330,belly:0xe4d4bb,ear:0x45322a,nose:0x1e1714,tail:0x7d5e40,tip:0x3a2a1e},
  ashen:{light:0xaeb2b6,mid:0x93979b,shadow:0x797d82,back:0x55585d,belly:0xcbced1,ear:0x3d3f43,nose:0x1c1c1e,tail:0x6e7277,tip:0x3c3e42}
};
/** Wolf part names per variant (`<variant>.<role>`), resolved once. */
export interface WolfNames{root:string;head:string;realHead:string;eyesTame:string;eyesAngry:string;body:string;mane:string;collar:string;
  rightHind:string;leftHind:string;rightFront:string;leftFront:string;tail:string;realTail:string}
export const wolfNames=(v:WolfVariant):WolfNames=>({root:v,head:`${v}.head`,realHead:`${v}.real_head`,eyesTame:`${v}.eyes_tame`,eyesAngry:`${v}.eyes_angry`,
  body:`${v}.body`,mane:`${v}.mane`,collar:`${v}.collar`,rightHind:`${v}.right_hind_leg`,leftHind:`${v}.left_hind_leg`,
  rightFront:`${v}.right_front_leg`,leftFront:`${v}.left_front_leg`,tail:`${v}.tail`,realTail:`${v}.real_tail`});
const NAMES=WOLF_VARIANTS.map(wolfNames);

/** Java WolfModel.createBodyLayer for one skin (texture rows offset by `dv`). */
function wolfParts(v:WolfVariant,dv:number):ModelPart{
  const n=wolfNames(v),leg=()=>[jbox(0,0,-1,2,8,2,0,18+dv)];
  // The eye decals lie 0.1 px in front of the head's face and cover its top three rows.
  const decal=(name:string,[u,dvv]:[number,number]):ModelPart=>({name,pivot:[0,0,0],boxes:[{from:[-4,0,-2.1],size:[6,3,0],uv:[u,dvv+dv]}]});
  return{name:n.root,pivot:[0,0,0],boxes:[],children:[
    {name:n.head,pivot:jpivot(-1,13.5,-7),boxes:[],children:[
      {name:n.realHead,pivot:[0,0,0],boxes:[jbox(-2,-3,-2,6,6,4,0,dv),jbox(-2,-5,0,2,2,1,16,14+dv),jbox(2,-5,0,2,2,1,16,14+dv),jbox(-.5,-.001,-5,3,3,4,0,10+dv)],
        children:[decal(n.eyesTame,TAME_EYES),decal(n.eyesAngry,ANGRY_EYES)]}]},
    {name:n.body,pivot:jpivot(0,14,2),rotation:jrot(Math.PI/2,0,0),boxes:[jbox(-3,-2,-3,6,9,6,18,14+dv)]},
    // The collar band hugs the front (neck end) of the mane: the mane's local +y side, rotated forward.
    {name:n.mane,pivot:jpivot(-1,14,-3),rotation:jrot(Math.PI/2,0,0),boxes:[jbox(-3,-3,-3,8,6,7,21,dv)],
      children:[{name:n.collar,pivot:[0,0,0],tinted:true,boxes:[{from:[-5,1,-3],size:[8,2,7],uv:[0,COLLAR_V],inflate:.3}]}]},
    {name:n.rightHind,pivot:jpivot(-2.5,16,7),boxes:leg()},
    {name:n.leftHind,pivot:jpivot(.5,16,7),boxes:leg()},
    {name:n.rightFront,pivot:jpivot(-2.5,16,-4),boxes:leg()},
    {name:n.leftFront,pivot:jpivot(.5,16,-4),boxes:leg()},
    {name:n.tail,pivot:jpivot(-1,12,8),boxes:[],children:[{name:n.realTail,pivot:[0,0,0],boxes:[jbox(0,0,-1,2,8,2,9,18+dv)]}]}
  ]};
}
const role=(t:Texel)=>t.part.slice(t.part.indexOf('.')+1);
type Face='wild'|'tame'|'angry';
/** The front of the head: row 0 at the top of the head, column 0 on the wolf's right. Eyes sit on row 2, just above the snout. */
function faceColour(f:Fur,t:Texel,mode:Face):number{
  const r=Math.floor(13.5-t.y),c=Math.floor(3-t.x),n=texelNoise(t,11);
  let col=n<.6?f.light:n<.9?f.mid:f.shadow;
  if(r===0&&(c===2||c===3))col=mix(f.mid,f.back,.5);
  const eye=c===1||c===4,outer=c===0||c===5;
  if(r===2){
    if(mode==='angry'){if(eye)return 0xb0261b;if(outer)return 0x2b201c;}
    else if(mode==='tame'){if(eye)return 0x1d1816;if(outer)return 0xf3f3f1;}
    else{if(eye)return 0x1d1816;if(outer)return mix(col,f.shadow,.6);}
  }
  if(r===1){
    if(mode==='angry'&&c>=1&&c<=4)return 0x3b302b;
    if(mode==='wild'&&eye)return mix(col,f.shadow,.35);
  }
  return col;
}
function wolfShader(f:Fur):Shader{
  return t=>{
    // Soft two-tone fur with faint vertical streaks; the shadow tone is rare.
    const n=texelNoise(t,3),streak=hash3(Math.round(t.x*2),7,Math.round(t.z*2),5),v=n*.6+streak*.4;
    const fur=v<.55?f.light:v<.93?f.mid:f.shadow;
    switch(role(t)){
      case 'real_head':{
        if(t.box===1||t.box===2){
          // Ears: dark outside, a brownish inner ear on the front.
          if(t.nz<-.5)return t.j===0?mix(f.back,f.ear,.4):f.ear;
          return n<.5?f.back:scale(f.back,.9);
        }
        if(t.box===3){
          // Snout: black nose on the front's top row, a darker mouth line under the sides.
          if(t.nz<-.5)return t.j===0?(t.i===1?f.nose:scale(f.nose,1.6)):n<.7?f.belly:f.light;
          if(t.ny<-.5)return f.belly;
          if(t.ny>.5)return n<.6?f.light:f.mid;
          return t.j===t.h-1?mix(f.shadow,f.nose,.35):n<.6?f.light:f.mid;
        }
        if(t.nz<-.5)return faceColour(f,t,'wild');
        if(t.ny>.5)return Math.abs(t.x)<1.2?mix(f.back,f.shadow,n*.6):fur;
        if(t.ny<-.5)return f.belly;
        return t.y>12.5&&n<.5?f.shadow:fur;
      }
      case 'eyes_tame':return faceColour(f,t,'tame');
      case 'eyes_angry':return faceColour(f,t,'angry');
      case 'body':case 'mane':{
        const mane=role(t)==='mane';
        if(t.ny<-.5)return n<.7?f.belly:f.light;
        // The chest under the head is pale, the rump plain fur.
        if(t.nz<-.5)return mane?(t.y<11?f.belly:fur):fur;
        const top=(t.y-7)/(mane?7:6)+(n-.5)*.25;
        if(t.ny>.5||top>.8)return n<.6?f.back:n<.9?mix(f.back,f.shadow,.4):scale(f.back,.9);
        if(top>.6)return mix(fur,f.back,.45);
        return t.y<8.2?mix(fur,f.belly,.5):fur;
      }
      case 'right_hind_leg':case 'left_hind_leg':case 'right_front_leg':case 'left_front_leg':{
        if(t.ny<-.5)return f.shadow;
        // Lighter paws, a darker back edge.
        if(t.y<1.6)return n<.6?f.belly:f.light;
        return t.nz>.5?(n<.5?f.mid:f.shadow):n<.6?f.light:f.mid;
      }
      case 'real_tail':{
        // Rest pose: hanging from y 12 (base) to y 4 (tip).
        const along=(12-t.y)/8;
        if(along>.72)return n<.6?f.tip:scale(f.tip,.88);
        return n<.55?f.tail:n<.85?mix(f.tail,f.light,.4):f.shadow;
      }
      case 'collar':{
        // Greyscale, tinted by the collar colour: a band round the neck. On the front only its edge shows (the inside is
        // cut out so the chest fur stays visible around the head).
        if(t.face===0)return t.j===0||t.j===t.h-1||t.i===0||t.i===t.w-1?0xd4d4d4:-1;
        return t.j===0&&(t.face===4||t.face===2)?0xc8c8c8:n<.85?0xf0f0f0:0xdedede;
      }
    }
    return fur;
  };
}

/** The wolf: three skins (pale, woods, ashen) with wild, tame and angry faces, a tinted collar and the vanilla poses
 *  (sitting, tail height, begging head tilt, wet shake). `look` fills the per-entity state for the frame. */
export function wolfModel(look:(e:Entity,partial:number,out:WolfLook)=>void):EntityModel{
  const skins=WOLF_VARIANTS.map((v,i)=>wolfParts(v,i*SKIN_H));
  const L=newWolfLook();
  return{
    textureWidth:WOLF_TEX_W,textureHeight:WOLF_TEX_H,
    parts:skins,
    paint(pixels,width,height){
      WOLF_VARIANTS.forEach((v,i)=>paintParts(pixels,width,height,[skins[i]],wolfShader(FURS[v])));
    },
    appearance(e){look(e,1,L);return L.tamed?{tint:collarColour(e.data.collar)}:{};},
    animate(e,pose,s){
      look(e,s.partial,L);
      const vi=L.variant>=0&&L.variant<NAMES.length?L.variant:0;
      for(let i=0;i<NAMES.length;i++)poseOf(pose,NAMES[i].root).visible=i===vi;
      poseWolf(NAMES[vi],pose,s,L);
    }
  };
}
/** Poses one skin (vanilla WolfModel.prepareMobModel and setupAnim, converted to contract space). */
export function poseWolf(n:WolfNames,pose:Record<string,PartPose>,s:AnimationState,L:WolfLook):void{
  const head=poseOf(pose,n.head);head.x=s.headPitch;head.y=s.headYaw;
  poseOf(pose,n.realHead).z=L.headRoll+bodyRoll(L.shake,0);
  poseOf(pose,n.eyesTame).visible=L.tamed;
  poseOf(pose,n.eyesAngry).visible=!L.tamed&&L.angry;
  poseOf(pose,n.collar).visible=L.tamed;
  const swing=s.limbSwing*.6662,amount=s.limbAmount;
  const body=poseOf(pose,n.body),mane=poseOf(pose,n.mane),tail=poseOf(pose,n.tail);
  const rh=poseOf(pose,n.rightHind),lh=poseOf(pose,n.leftHind),rf=poseOf(pose,n.rightFront),lf=poseOf(pose,n.leftFront);
  // Body and mane rest at -90° about x: a pose of (π/2 + θ, -roll) gives the vanilla Rz(roll)·Rx(θ) (see header).
  if(L.sitting){
    mane.x=Math.PI/2-1.2566371;mane.py=-2;
    body.x=Math.PI/4;body.py=-4;body.pz=-2;
    tail.py=-9;tail.pz=-2;
    rh.x=lh.x=Math.PI/2;rh.py=lh.py=-6.7;rh.pz=lh.pz=-5;
    rf.x=lf.x=-5.811947+Math.PI*2;rf.px=lf.px=-.01;rf.py=lf.py=-1;
  }else{
    rh.x=-Math.cos(swing)*1.4*amount;lh.x=-Math.cos(swing+Math.PI)*1.4*amount;
    rf.x=-Math.cos(swing+Math.PI)*1.4*amount;lf.x=-Math.cos(swing)*1.4*amount;
  }
  mane.y=-bodyRoll(L.shake,-.08);body.y=-bodyRoll(L.shake,-.16);
  tail.x=-L.tail;tail.y=L.angry?0:-Math.cos(swing)*1.4*amount;
  poseOf(pose,n.realTail).z=bodyRoll(L.shake,-.2);
}

/** Vanilla DyeColor texture colours, by wool colour name (collars). */
export const DYE_COLOURS:Readonly<Record<string,number>>={
  white:0xf9fffe,orange:0xf9801d,magenta:0xc74ebd,light_blue:0x3ab3da,yellow:0xfed83d,lime:0x80c71f,pink:0xf38baa,gray:0x474f52,
  light_gray:0x9d9d97,cyan:0x169c9c,purple:0x8932b8,blue:0x3c44aa,brown:0x835432,green:0x5e7c16,red:0xb02e26,black:0x1d1d21};
export const collarColour=(name:unknown)=>typeof name==='string'&&name in DYE_COLOURS?DYE_COLOURS[name]:DYE_COLOURS.red;

// ---- Squid -----------------------------------------------------------------------------------------
/** Per-entity state the squid model draws. */
export interface SquidLook{
  /** Body pitch (vanilla xBodyRot, radians): 0 upright, -π/2 swimming mantle-first, toward -π upside down. */
  pitch:number;
  /** Spin about the body's long axis (vanilla zBodyRot, radians). */
  spin:number;
  /** Tentacle spread (vanilla tentacleAngle, 0..π/4). */
  tentacles:number;
}
export const newSquidLook=():SquidLook=>({pitch:0,spin:0,tentacles:0});
/** Vanilla SquidRenderer: the model hangs 0.7 blocks lower than other mobs (its mantle spans -0.2..0.8 blocks above the
 *  feet) and turns about a point half a block up. Model y in contract space = SQUID_DROP − Java y. */
const SQUID_DROP=12.8,SQUID_PIVOT=8;
export const SQUID_TENTACLES=8;
export const squidTentacle=(k:number)=>`tentacle${k}`;
/** Java SquidModel.createBodyLayer under a pitch part ('squid') and a spin part ('spin'). */
function squidParts():ModelPart[]{
  const tentacles:ModelPart[]=[];
  for(let k=0;k<SQUID_TENTACLES;k++){
    const d=k*Math.PI*2/8,l=k*Math.PI*-2/8+Math.PI/2;
    tentacles.push({name:squidTentacle(k),pivot:[-Math.cos(d)*5+0,SQUID_DROP-15-SQUID_PIVOT,Math.sin(d)*5+0],rotation:jrot(0,l,0),
      boxes:[jbox(-1,0,-1,2,18,2,48,0)]});
  }
  return[{name:'squid',pivot:[0,SQUID_PIVOT,0],boxes:[],children:[
    {name:'spin',pivot:[0,0,0],boxes:[],children:[
      {name:'body',pivot:[0,SQUID_DROP-8-SQUID_PIVOT,0],boxes:[jbox(-6,-8,-6,12,16,12,0,0,.02)]},
      ...tentacles]}]}];
}
const SQUID={base:0x2b4766,light:0x40628a,dark:0x1d3350,top:0x46698f,under:0x182a42,beak:0xcfc8b8,eye:0xe9edf0,pupil:0x0f1418,iris:0x5aa0a8,
  tentacle:0x294463,sucker:0x8fa9c2,tip:0x1c3049};
function squidShader():Shader{
  const S=SQUID;
  return t=>{
    const n=texelNoise(t,21);
    if(t.part==='body'){
      // Mantle from y 12.8 (top) down to -3.2 where the tentacles join.
      const r=Math.floor(SQUID_DROP-t.y);
      if(t.ny>.5)return n<.6?S.top:n<.85?S.light:S.base;
      if(t.ny<-.5){
        const d=Math.max(Math.abs(t.x),Math.abs(t.z));
        return d<1?S.beak:d<2?scale(S.beak,.62):n<.7?S.under:S.dark;
      }
      if(Math.abs(t.nz)>.5&&r>=11&&r<=12){
        // Eyes on the front and back, low on the mantle: white outside, pupil inside, a teal iris under the pupil.
        const c=Math.floor(6-t.x*Math.sign(-t.nz));
        if(c===2||c===9)return S.eye;
        if(c===3||c===8)return r===11?S.pupil:S.iris;
      }
      // Smooth navy skin: 2-pixel mottling, a few pale freckles, lighter toward the top and at the tentacle band.
      const blot=hash3(Math.floor(t.x/2),Math.floor(t.y/2),Math.floor(t.z/2),9),freckle=hash3(Math.floor(t.x/3),Math.floor(t.y/3),Math.floor(t.z/3),13);
      let col=mix(S.base,S.light,blot*.45);
      if(n>.92)col=mix(col,S.dark,.6);
      if(freckle>.86&&n>.5)col=mix(col,S.light,.7);
      col=mix(col,S.top,Math.max(0,(5-r)/5)*.45);
      if(r>=14)col=mix(col,S.light,.3);
      return col;
    }
    // Tentacles hang from y -2.2 down 18 px; suckers on the side facing the middle.
    const along=(SQUID_DROP-15-t.y)/18,inner=t.nx*t.x+t.nz*t.z<-.1;
    if(t.ny!==0&&Math.abs(t.ny)>.5)return S.tip;
    if(along>.82)return n<.6?S.tip:S.dark;
    if(inner&&t.j%3===1&&t.j>1)return mix(S.tentacle,S.sucker,.75);
    return n<.7?S.tentacle:n<.95?S.base:S.dark;
  };
}
/** The squid: vanilla 64×32 skin, the mantle pitching and spinning as it swims and the tentacles pulsing. */
export function squidModel(look:(e:Entity,partial:number,out:SquidLook)=>void):EntityModel{
  const parts=squidParts();
  const L=newSquidLook();
  return{
    textureWidth:64,textureHeight:32,parts,
    paint(pixels,width,height){paintParts(pixels,width,height,parts,squidShader());},
    animate(e,pose,s){
      look(e,s.partial,L);
      poseOf(pose,'squid').x=L.pitch;
      poseOf(pose,'spin').y=L.spin;
      for(let k=0;k<SQUID_TENTACLES;k++)poseOf(pose,squidTentacle(k)).x=-L.tentacles;
    }
  };
}
