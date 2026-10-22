// Box models, painted textures and animation of the passive mobs (cow and mooshroom, pig, sheep, chicken, rabbit), drawn in
// code to look like the vanilla Java mobs: the Java model geometry (CowModel, PigModel, SheepModel and SheepFurModel,
// ChickenModel, RabbitModel), their texture sizes and UV layouts (64×32 per skin; the sheep's fur below its skin), with
// procedural pixel art in the vanilla palettes. Nothing is copied from Mojang's files.
//
// Geometry is written in Java model space and converted by the j* helpers of passive-model.ts; the bodies keep their vanilla
// 90° rest rotation. Textures are painted by position (passive-model paintParts): each texel knows where it sits on the mob,
// so coat patches wrap round the rotated bodies, and faces are drawn from small character maps (top row first, column 0
// on the viewer's left). Mooshroom mushrooms are crossed planes showing a painted red mushroom sprite, placed and turned like
// the vanilla mushroom layer; chicken legs are the vanilla 3×5×3 boxes with a cut-out shank and toes.
import {blit,blob3,buildModel,clampHeadPitch,clampHeadYaw,jbox,jpivot,jrot,mix,pick,poseQuadruped,shade,texelNoise,vary,
  type ModelSpec,type ModelVariant,type Shader,type Texel,type Vec3T} from './passive-model';
import {brainOf} from './passive-ai';
import type {Entity,EntityModel,ModelBox,ModelPart,PartPose} from '../engine/contracts';

// ---- Shared helpers ------------------------------------------------------------------------------
const part=(name:string,pivot:Vec3T,boxes:ModelBox[],extra:Partial<ModelPart>={}):ModelPart=>({name,pivot,boxes,...extra});
type Pal=Readonly<Record<string,number>>;
/** Colour of texel (i, j) from a character map (top row first); throws on a size mismatch so tests catch bad maps. */
function fromMap(map:readonly string[],pal:Pal,i:number,j:number,n:number,amount=.04):number{
  const ch=map[j]?.[i],c=ch===undefined?undefined:pal[ch];
  if(c===undefined)throw new Error(`texture map has no colour at ${i},${j} (${ch})`);
  return vary(c,n,amount);
}
/** Faces of a texel by its entity-space normal. */
const isFront=(t:Texel)=>t.nz<-.5,isBack=(t:Texel)=>t.nz>.5,isTop=(t:Texel)=>t.ny>.5,isBottom=(t:Texel)=>t.ny<-.5;
const copyPose=(to:PartPose,from:PartPose)=>{to.x=from.x;to.y=from.y;to.z=from.z;to.px=from.px;to.py=from.py;to.pz=from.pz;};
const DEG=Math.PI/180;
/** Parts whose texture is cut out (transparent texels) on purpose: crossed mushroom planes and the chicken's legs. */
export const CUTOUT_PARTS:ReadonlySet<string>=new Set(['mushroom_1','mushroom_2','head_mushroom','head_mushroom_planes','leg_r','leg_l']);

// ---- Cow and mooshroom ---------------------------------------------------------------------------
interface CowPalette{
  coat:readonly number[];coatW:readonly number[];patch:readonly number[];patchW:readonly number[];
  muzzle:number;nostril:number;eye:number;pupil:number;
  horn:number;hornLight:number;hornDark:number;hoof:number;sock:number;udder:number;udderLight:number;teat:number;
  /** Noise level above which the coat shows a patch. */
  cut:number;seed:number}
const COW:CowPalette={coat:[0x33261f,0x2a1f19,0x3f3027,0x4a382c],coatW:[6,3,3,1],patch:[0xe9e7e2,0xdcd9d3,0xf4f3f0,0xc9c5bf],patchW:[6,3,2,1],
  muzzle:0xcbb5aa,nostril:0x3a2a24,eye:0xf0efeb,pupil:0x110d0b,horn:0xb9b9b1,hornLight:0xd6d6ce,hornDark:0x8f8f88,hoof:0x4a423d,sock:0xdedbd5,
  udder:0xe89c9c,udderLight:0xf3b8b6,teat:0xc77675,cut:.6,seed:17};
const MOOSHROOM:CowPalette={coat:[0xa8261b,0x9f2319,0xb02b20,0x8c1d14],coatW:[8,3,2,1],patch:[0xd9d5cf,0xc9c4bd,0xe6e3de,0xb3ada6],patchW:[6,3,2,1],
  muzzle:0xd5c1b8,nostril:0x5c1d17,eye:0xf0efeb,pupil:0x140c0b,horn:0xbab8b0,hornLight:0xd8d6ce,hornDark:0x8f8d86,hoof:0x4b3833,sock:0xcfcac3,
  udder:0xe59a9a,udderLight:0xf0b5b3,teat:0xc27372,cut:.63,seed:29};
/** The front of the head (8×8): B coat, W blaze, E eye white, K pupil, M muzzle, N nostril. */
const COW_FACE=['BBBWWBBB','BBWWWWBB','BBBWWBBB','BEKWWKEB','BBBWWBBB','BMMMMMMB','MNMMMMNM','MMMMMMMM'];
/** Red mushroom sprite (16×16): R cap, r cap shade, W spots, w stem, s stem shade. */
const MUSHROOM_SPRITE=[
  '................','................','................','................','................','................','................',
  '................','................','......RRRR......','.....RWRRRR.....','.....RRRRWR.....','.....rrrrrr.....','.......ws.......',
  '.......ws.......','......wwss......'];
const MUSHROOM_PAL:Pal={R:0xe2312c,r:0xb3211c,W:0xf2ede4,w:0xe2d9c7,s:0xc4b79f};
const MUSHROOM_SPRITE_AT:[number,number]=[0,32];
function cowShader(p:CowPalette):Shader{
  const pal:Pal={E:p.eye,K:p.pupil,M:p.muzzle,N:p.nostril};
  const coat=(t:Texel)=>{
    const n=texelNoise(t,p.seed),patch=blob3(t.x+40,t.y,t.z,5.5,p.seed)>p.cut;
    return patch?pick(p.patch,p.patchW,n):pick(p.coat,p.coatW,n);
  };
  return t=>{
    const n=texelNoise(t,p.seed+1);
    switch(t.part){
      case 'head':{
        if(t.box>0){// horns: lighter on top, darker toward the base
          if(isTop(t))return p.hornLight;
          return t.j===t.h-1||isBottom(t)?p.hornDark:vary(p.horn,n,.04);
        }
        if(isFront(t)){
          const ch=COW_FACE[t.j][t.i];
          if(ch==='B')return coat(t);
          if(ch==='W')return pick(p.patch,p.patchW,n);
          return fromMap(COW_FACE,pal,t.i,t.j,n,.03);
        }
        // Muzzle round the lower sides and chin; a pale blaze running back over the poll.
        if(isBottom(t))return t.z<-11?vary(p.muzzle,n,.04):coat(t);
        if(!isTop(t)&&t.y<19&&t.z<-12)return vary(p.muzzle,n,.04);
        if(isTop(t)&&Math.abs(t.x)<1.1&&t.z<-10)return pick(p.patch,p.patchW,n);
        return coat(t);
      }
      case 'body':{
        if(t.box===1){// udder: pink, teats at the corners of its underside
          if(isBottom(t)&&(t.i===0||t.i===t.w-1)&&(t.j===1||t.j===t.h-2))return p.teat;
          return vary(isBottom(t)?p.udderLight:p.udder,n,.04);
        }
        return coat(t);
      }
      case 'leg_rh':case 'leg_lh':case 'leg_rf':case 'leg_lf':{
        if(isBottom(t)||t.y<2)return vary(p.hoof,n,.06);
        if(t.y<5)return vary(p.sock,n,.03);
        return coat(t);
      }
    }
    return -1;
  };
}
function cowParts():ModelPart[]{
  return[
    part('head',jpivot(0,4,-8),[jbox(-4,-4,-6,8,8,6,0,0),jbox(-5,-5,-4,1,3,1,22,0),jbox(4,-5,-4,1,3,1,22,0)]),
    part('body',jpivot(0,5,2),[jbox(-6,-10,-7,12,18,10,18,4),jbox(-2,2,-8,4,6,1,52,0)],{rotation:jrot(Math.PI/2,0,0)}),
    part('leg_rh',jpivot(-4,12,7),[jbox(-2,0,-2,4,12,4,0,16)]),part('leg_lh',jpivot(4,12,7),[jbox(-2,0,-2,4,12,4,0,16)]),
    part('leg_rf',jpivot(-4,12,-6),[jbox(-2,0,-2,4,12,4,0,16)]),part('leg_lf',jpivot(4,12,-6),[jbox(-2,0,-2,4,12,4,0,16)])
  ];
}
/** Crossed 16×16 planes standing on their pivot (a red mushroom block's cross model). */
function crossPlanes():ModelBox[]{
  const [u,v]=MUSHROOM_SPRITE_AT;
  return[{from:[-8,0,0],size:[16,16,0],uv:[u,v]},{from:[0,0,-8],size:[0,16,16],uv:[u,v-16]}];
}
/** Vanilla MushroomCowMushroomLayer: two mushrooms on the back (model root space) and one on the head, each a block-size
 *  cross model turned about y (the layer's angle plus the cross model's 45°). */
function mushroomParts():ModelPart[]{
  return[
    part('mushroom_1',[-3.2,21.6,8],crossPlanes(),{rotation:[0,93*DEG,0]}),
    part('mushroom_2',[2.03,21.6,-.21],crossPlanes(),{rotation:[0,51*DEG,0]}),
    // Posed like the head, so it rides on it: the planes are a child placed in head space.
    part('head_mushroom',jpivot(0,4,-8),[],{children:[part('head_mushroom_planes',[0,3.2,-3.2],crossPlanes(),{rotation:[0,123*DEG,0]})]})
  ];
}
const paintMushroom=(px:Uint8ClampedArray,width:number,oy:number)=>blit(px,width,MUSHROOM_SPRITE_AT[0],MUSHROOM_SPRITE_AT[1]+oy,MUSHROOM_SPRITE,MUSHROOM_PAL);
/** Cow (variant 'cow') and mooshroom (variant 'mooshroom': red coat, mushrooms on adults). */
export function cowModel():EntityModel{
  const variants:ModelVariant[]=[
    {id:'cow',shader:cowShader(COW)},
    {id:'mooshroom',shader:cowShader(MOOSHROOM),extra:mushroomParts(),decorate:paintMushroom}
  ];
  const spec:ModelSpec={width:64,height:48,parts:cowParts(),variants,
    variantOf:e=>e.data.variant==='mooshroom'?1:0,
    babyHead:{parts:['head'],pivot:[0,10,-4]},
    pose(_e,pose,state){poseQuadruped(pose,state);copyPose(pose.head_mushroom,pose.head);}};
  return buildModel(spec);
}

// ---- Pig -------------------------------------------------------------------------------------------
const PIG={skin:[0xf0a5a1,0xf3aea9,0xeb9c97,0xf7bab5,0xdd8984],skinW:[10,3,3,1,0],snout:0xdf8d88,snoutLight:0xe9a09a,nostril:0x8c4446,nostrilDeep:0x6a3133,
  eye:0xf5f2f0,pupil:0x15100f,hoof:0xb06e66,hoofDark:0x94564f,seed:41};
/** The front of the head (8×8): S skin, E eye white, K pupil; the snout covers rows 4–6 of columns 2–5. */
const PIG_FACE=['SSSSSSSS','SSSSSSSS','SSSSSSSS','SEKSSKES','SSSSSSSS','SSSSSSSS','SSSSSSSS','SSSSSSSS'];
/** The snout's front (4×3): L snout, N nostrils. */
const PIG_SNOUT=['LLLL','NLLN','LLLL'];
function pigShader():Shader{
  const p=PIG,pal:Pal={E:p.eye,K:p.pupil,L:p.snout,N:p.nostril};
  const skin=(t:Texel)=>{
    // Smooth pink with a faint mottling and a few darker blotches.
    const n=texelNoise(t,p.seed),blot=blob3(t.x,t.y,t.z,3,p.seed+3)>.74;
    const c=pick(p.skin,p.skinW,n);
    return blot?mix(c,p.skin[4],.45):isBottom(t)?shade(c,.95):c;
  };
  return t=>{
    const n=texelNoise(t,p.seed+1);
    switch(t.part){
      case 'head':
        if(t.box===1){// snout: darker pink, nostrils on the front
          if(isFront(t))return fromMap(PIG_SNOUT,pal,t.i,t.j,n,.03);
          return vary(isTop(t)?p.snoutLight:p.snout,n,.03);
        }
        if(isFront(t)){const ch=PIG_FACE[t.j][t.i];return ch==='S'?skin(t):fromMap(PIG_FACE,pal,t.i,t.j,n,.02);}
        return skin(t);
      case 'body':return skin(t);
      default:// legs: trotters on the bottom row
        if(isBottom(t))return vary(p.hoofDark,n,.05);
        return t.y<1?vary(p.hoof,n,.05):skin(t);
    }
  };
}
export function pigModel():EntityModel{
  const leg=(name:string,x:number,z:number)=>part(name,jpivot(x,18,z),[jbox(-2,0,-2,4,6,4,0,16)]);
  return buildModel({width:64,height:32,variants:[{id:'pig',shader:pigShader()}],
    parts:[
      part('head',jpivot(0,12,-6),[jbox(-4,-4,-8,8,8,8,0,0),jbox(-2,0,-9,4,3,1,16,16)]),
      part('body',jpivot(0,11,2),[jbox(-5,-10,-7,10,16,8,28,8)],{rotation:jrot(Math.PI/2,0,0)}),
      leg('leg_rh',-3,7),leg('leg_lh',3,7),leg('leg_rf',-3,-5),leg('leg_lf',3,-5)
    ],
    babyHead:{parts:['head'],pivot:[0,8,-2]},
    pose(_e,pose,state){poseQuadruped(pose,state);}});
}

// ---- Sheep -----------------------------------------------------------------------------------------
const SHEEP={face:0xc3b9af,faceShade:0xb0a59a,faceLight:0xd0c7be,eye:0xf1f0ec,pupil:0x1b1817,nose:0xd59a97,mouth:0xa86f6c,
  skin:[0xd9c6b8,0xcdb8a8,0xe4d4c8,0xc0a999],skinW:[5,3,2,1],leg:0xc5b4a5,legShade:0xb09e8e,hoof:0x6a5a4f,
  wool:[0xf3f3f1,0xe4e4e1,0xd5d5d1,0xfbfbfa,0xc8c8c3],woolW:[8,4,2,2,1],seed:59};
/** The face (6×6): F face, E eye white, K pupil, N nose, M mouth. */
const SHEEP_FACE=['FFFFFF','FFFFFF','EKFFKE','FFFFFF','FFNNFF','FFMMFF'];
/** Greyscale fleece: soft curls (a bumpy blob pattern) so the dye tint shows true. */
function fleece(t:Texel,seed:number):number{
  const p=SHEEP,n=texelNoise(t,seed),curl=blob3(t.x*1.6,t.y*1.6,t.z*1.6,2.4,seed);
  const base=curl>.66?p.wool[1]:curl<.3?p.wool[3]:p.wool[0];
  return n>.93?p.wool[2]:n>.985?p.wool[4]:vary(base,n,.02);
}
function sheepShader():Shader{
  const p=SHEEP,pal:Pal={F:p.face,E:p.eye,K:p.pupil,N:p.nose,M:p.mouth};
  return t=>{
    const n=texelNoise(t,p.seed);
    if(t.part.startsWith('wool_'))return fleece(t,p.seed+7);
    switch(t.part){
      case 'head':
        if(isFront(t))return fromMap(SHEEP_FACE,pal,t.i,t.j,n,.025);
        return vary(isTop(t)?p.faceLight:isBottom(t)?p.faceShade:p.face,n,.03);
      case 'body':{// the shorn body: pale skin with a short, curly fleece
        const curl=blob3(t.x*1.5,t.y*1.5,t.z*1.5,2.5,p.seed+2);
        return curl>.68?p.skin[1]:curl<.25?p.skin[2]:pick(p.skin,p.skinW,n);
      }
      default:// legs: pale grey-beige with dark hooves
        if(isBottom(t)||t.y<1.5)return vary(p.hoof,n,.05);
        return vary(isBack(t)?p.legShade:p.leg,n,.04);
    }
  };
}
/** Sheep eating grass (vanilla head eat scales): head lowered 9 px and pitched down while the 40-tick graze runs. */
function eatPosition(t:number,partial:number):number{
  if(t<=0)return 0;
  if(t>=4&&t<=36)return 1;
  return t<4?(t-partial)/4:(40-t+partial)/4;
}
function eatAngle(t:number,partial:number):number{
  if(t>4&&t<=36)return Math.PI/5+.21991149*Math.sin((t-4-partial)/32*28.7);
  return Math.PI/5;
}
/** Sheep: SheepModel (skin, top half of the texture) plus SheepFurModel (tinted wool layers below it, hidden when sheared). */
export function sheepModel(tintOf:(e:Entity)=>number):EntityModel{
  const legs:[string,number,number][]=[['leg_rh',-3,7],['leg_lh',3,7],['leg_rf',-3,-5],['leg_lf',3,-5]];
  const woolLegs=legs.map(([name])=>`wool_${name}`),body=jrot(Math.PI/2,0,0);
  const parts:ModelPart[]=[
    part('head',jpivot(0,6,-8),[jbox(-3,-4,-6,6,6,8,0,0)]),
    part('wool_head',jpivot(0,6,-8),[jbox(-3,-4,-4,6,6,6,0,32,{inflate:.6})],{tinted:true}),
    part('body',jpivot(0,5,2),[jbox(-4,-10,-7,8,16,6,28,8)],{rotation:body}),
    part('wool_body',jpivot(0,5,2),[jbox(-4,-10,-7,8,16,6,28,40,{inflate:1.75})],{rotation:body,tinted:true}),
    ...legs.map(([name,x,z])=>part(name,jpivot(x,12,z),[jbox(-2,0,-2,4,12,4,0,16)])),
    ...legs.map(([,x,z],i)=>part(woolLegs[i],jpivot(x,12,z),[jbox(-2,0,-2,4,6,4,0,48,{inflate:.5})],{tinted:true}))
  ];
  const appearance=new Map<number,{tint:number}>();
  return buildModel({width:64,height:64,variants:[{id:'sheep',shader:sheepShader()}],parts,
    babyHead:{parts:['head','wool_head'],pivot:[0,10,-4]},
    pose(e,pose,state){
      poseQuadruped(pose,state);
      const t=brainOf(e).eat;
      if(t>0){pose.head.py=-9*eatPosition(t,state.partial);pose.head.x=-eatAngle(t,state.partial);}
      copyPose(pose.wool_head,pose.head);
      const sheared=e.data.sheared===true;
      pose.wool_head.visible=pose.wool_body.visible=!sheared;
      for(let i=0;i<woolLegs.length;i++){const wool=pose[woolLegs[i]];copyPose(wool,pose[legs[i][0]]);wool.visible=!sheared;}
    },
    appearance(e){
      const tint=tintOf(e);let a=appearance.get(tint);
      if(!a){a={tint};appearance.set(tint,a);}
      return a;
    }});
}

// ---- Chicken ---------------------------------------------------------------------------------------
const CHICKEN={white:[0xfbfbfa,0xf1f1ee,0xe6e6e2,0xd8d8d3],whiteW:[6,4,2,1],grey:0xcfcfca,greyDark:0xb6b6b0,eye:0x141414,
  beak:0xf6b53a,beakLight:0xfbcd5c,beakDark:0xd99426,wattle:0xd22f2b,wattleDark:0xa01f1c,leg:0xf3b23c,legDark:0xd6942b,seed:73};
const CHICKEN_FACE=['WWWW','KWWK','WWWW','WWWW','WWWW','WWWW'];
function chickenShader():Shader{
  const p=CHICKEN;
  const feathers=(t:Texel)=>pick(p.white,p.whiteW,texelNoise(t,p.seed));
  return t=>{
    const n=texelNoise(t,p.seed+1);
    switch(t.part){
      case 'head':
        if(t.box===1)return isBottom(t)||t.j===t.h-1&&!isTop(t)?p.beakDark:isTop(t)?p.beakLight:vary(p.beak,n,.03);
        if(t.box===2)return isBottom(t)||t.j===t.h-1&&!isTop(t)?p.wattleDark:vary(p.wattle,n,.03);
        if(isFront(t))return CHICKEN_FACE[t.j][t.i]==='K'?p.eye:feathers(t);
        return feathers(t);
      case 'body':
        // The tail end is a little greyer on top, the belly in soft shade.
        if(isBack(t))return t.y>8?vary(p.grey,n,.03):feathers(t);
        if(isBottom(t))return vary(p.white[2],n,.03);
        return feathers(t);
      case 'wing_r':case 'wing_l':
        // Feather tips along the lower edge.
        if(isBottom(t))return p.greyDark;
        return t.y<8?vary(t.y<7.5?p.grey:p.white[2],n,.03):feathers(t);
      default:{// legs (3×5×3, cut out): a 1-px shank down the middle, three toes forward and one back on the bottom row
        if(isTop(t))return -1;
        const cx=t.part==='leg_r'?1.5:-1.5,cz=-.5,alongX=Math.abs(t.x-cx)<.5,alongZ=Math.abs(t.z-cz)<.5;
        if(isBottom(t))return alongX||t.z<cz-.5?p.legDark:-1;
        const toes=t.j===t.h-1,colour=toes?p.legDark:p.leg;
        if(isFront(t))return toes||alongX?colour:-1;
        if(isBack(t))return alongX?colour:-1;
        // Sides: the shank, and the front toe running forward along the bottom row.
        return alongZ||toes&&t.z<cz?colour:-1;
      }
    }
  };
}
/** Vanilla chicken wing bob: (sin(flap) + 1) × flapSpeed, interpolated between ticks. */
function wingBob(e:Entity,partial:number):number{
  const b=brainOf(e),flap=b.oFlap+(b.flap-b.oFlap)*partial,speed=b.oFlapSpeed+(b.flapSpeed-b.oFlapSpeed)*partial;
  return (Math.sin(flap)+1)*speed;
}
export function chickenModel():EntityModel{
  const leg=(name:string,x:number)=>part(name,jpivot(x,19,1),[jbox(-1,0,-3,3,5,3,26,0)]);
  return buildModel({width:64,height:32,variants:[{id:'chicken',shader:chickenShader()}],
    parts:[
      // Head, beak and wattle (Java's head, beak and red_thing parts share one pivot and pose).
      part('head',jpivot(0,15,-4),[jbox(-2,-6,-2,4,6,3,0,0),jbox(-2,-4,-4,4,2,2,14,0),jbox(-1,-2,-3,2,2,2,14,4)]),
      part('body',jpivot(0,16,0),[jbox(-3,-4,-3,6,8,6,0,9)],{rotation:jrot(Math.PI/2,0,0)}),
      leg('leg_r',-2),leg('leg_l',1),
      part('wing_r',jpivot(-4,13,0),[jbox(0,0,-3,1,4,6,24,13)]),part('wing_l',jpivot(4,13,0),[jbox(-1,0,-3,1,4,6,24,13)])
    ],
    babyHead:{parts:['head'],pivot:[0,4,-2]},
    pose(e,pose,state){
      const swing=Math.cos(state.limbSwing)*1.4*state.limbAmount;
      pose.leg_r.x=swing;pose.leg_l.x=-swing;
      pose.head.x=clampHeadPitch(state.headPitch);pose.head.y=clampHeadYaw(state.headYaw);
      // Wings swing up and out (vanilla zRot = bob on the right wing, -bob on the left).
      const bob=wingBob(e,state.partial);
      pose.wing_r.z=bob;pose.wing_l.z=-bob;
    }});
}

// ---- Rabbit ----------------------------------------------------------------------------------------
export const RABBIT_VARIANTS=['brown','white','black','white_splotched','gold','salt'] as const;
export type RabbitVariant=typeof RABBIT_VARIANTS[number];
interface RabbitPalette{coat:readonly number[];coatW:readonly number[];dark:number;belly:number;muzzle:number;ear:number;nose:number;eye:number;
  tail:number;pattern:'plain'|'splotch'|'salt';seed:number}
const RABBIT_PAL:Record<RabbitVariant,RabbitPalette>={
  brown:{coat:[0x7c5a42,0x8a6749,0x6b4c37,0x9a7656],coatW:[5,3,2,1],dark:0x5a3f2d,belly:0xc4a682,muzzle:0xb39270,ear:0xcf9d93,nose:0xd3908f,eye:0x120d0a,tail:0xe9e1d2,pattern:'plain',seed:83},
  white:{coat:[0xf1efeb,0xe6e3de,0xfbfaf8,0xd9d5cf],coatW:[5,3,2,1],dark:0xd2cdc6,belly:0xfbfaf8,muzzle:0xfbfaf8,ear:0xf0b7b7,nose:0xeda4a8,eye:0xb3202a,tail:0xfdfdfc,pattern:'plain',seed:89},
  black:{coat:[0x2a2725,0x332f2c,0x211e1c,0x3d3835],coatW:[5,3,2,1],dark:0x1a1817,belly:0x46403c,muzzle:0x4b4440,ear:0x6c5250,nose:0x77595a,eye:0x080707,tail:0x3a3532,pattern:'plain',seed:97},
  white_splotched:{coat:[0xf0eeea,0xe5e2dd,0xfaf9f6,0xd8d4ce],coatW:[5,3,2,1],dark:0x24211f,belly:0xfaf9f6,muzzle:0xfaf9f6,ear:0xebb2b1,nose:0xe39fa2,eye:0x110d0c,tail:0xfaf9f6,pattern:'splotch',seed:101},
  gold:{coat:[0xdcb672,0xe6c486,0xc9a25e,0xefd49d],coatW:[5,3,2,1],dark:0xb28a4b,belly:0xf3e3bf,muzzle:0xf0dcb0,ear:0xe7ab9b,nose:0xdc9a8c,eye:0x231a10,tail:0xf6ead0,pattern:'plain',seed:103},
  salt:{coat:[0x8a7b6b,0x6f6255,0xa69886,0x5a4e43],coatW:[4,3,3,2],dark:0x4c4239,belly:0xbcae99,muzzle:0xb4a690,ear:0xc89a92,nose:0xc28d8a,eye:0x15110e,tail:0xd9cfbd,pattern:'salt',seed:107}
};
/** The front of the head (5×4): C coat, L muzzle; the nose sits on rows 1–2 of the middle column. */
const RABBIT_FACE=['CCCCC','CCCCC','CLLLC','LLLLL'];
function rabbitShader(p:RabbitPalette):Shader{
  const coat=(t:Texel,base?:number)=>{
    const n=texelNoise(t,p.seed);
    if(p.pattern==='splotch'&&blob3(t.x+30,t.y,t.z,3.2,p.seed)>.6)return vary(p.dark,n,.05);
    if(p.pattern==='salt'){const s=texelNoise(t,p.seed+9);if(s>.8)return vary(p.coat[2],n,.04);if(s<.22)return vary(p.dark,n,.04);}
    return base??pick(p.coat,p.coatW,n);
  };
  return t=>{
    const n=texelNoise(t,p.seed+1);
    switch(t.part){
      case 'head':
        if(t.box===1)return vary(p.nose,n,.03);
        if(isFront(t)){const ch=RABBIT_FACE[t.j][t.i];return ch==='L'?vary(p.muzzle,n,.03):coat(t);}
        if(isBottom(t))return vary(p.belly,n,.04);
        // Eyes on the sides of the head, near the front; the black-and-white coat has dark patches round them.
        if(!isTop(t)&&!isBack(t)&&t.z<-4&&t.z>-5&&t.y>10&&t.y<11)return p.eye;
        if(p.pattern==='splotch'&&!isFront(t)&&!isBottom(t)&&t.z<-2.5&&t.y>9)return vary(p.dark,n,.05);
        return coat(t);
      case 'ear_r':case 'ear_l':
        if(isFront(t))return t.i===0||t.i===t.w-1||t.j===0?coat(t):vary(p.ear,n,.04);
        return p.pattern==='splotch'?vary(p.dark,n,.05):coat(t);
      case 'body':
        if(isBottom(t))return coat(t,vary(p.belly,n,.04));
        return coat(t);
      case 'tail':return vary(p.tail,n,.03);
      case 'leg_rf':case 'leg_lf':return isBottom(t)||t.y<1.5?coat(t,vary(p.muzzle,n,.04)):coat(t);
      case 'foot_r':case 'foot_l':return isBottom(t)?vary(p.muzzle,n,.04):coat(t);
      default:return isBottom(t)?coat(t,vary(p.belly,n,.04)):coat(t);
    }
  };
}
/** Rabbits hop: a 10-tick jump animation (vanilla getJumpCompletion) kicks the hind legs back and reaches with the front legs. */
function hopProgress(e:Entity,partial:number):number{
  const hop=brainOf(e).hop;
  return hop>0?Math.sin(Math.min(1,(hop-1+partial)/10)*Math.PI):0;
}
const HAUNCH_REST=jrot(-.34906584,0,0),FRONT_LEG_REST=jrot(-.17453292,0,0),EAR_TURN=.2617994;
export function rabbitModel():EntityModel{
  const side=(s:'r'|'l',x:number,legUV:[number,number],haunchUV:[number,number],footUV:[number,number]):ModelPart[]=>[
    part(`leg_${s}f`,jpivot(x,17,-1),[jbox(-1,0,-1,2,7,2,...legUV)],{rotation:FRONT_LEG_REST}),
    part(`haunch_${s}`,jpivot(x,17.5,3.7),[jbox(-1,0,0,2,4,5,...haunchUV)],{rotation:HAUNCH_REST}),
    part(`foot_${s}`,jpivot(x,17.5,3.7),[jbox(-1,5.5,-3.7,2,1,7,...footUV)])
  ];
  const headPivot=jpivot(0,16,-1);
  return buildModel({width:64,height:32,scale:.6,
    variants:RABBIT_VARIANTS.map(id=>({id,shader:rabbitShader(RABBIT_PAL[id])})),
    variantOf:e=>{const i=RABBIT_VARIANTS.indexOf(e.data.variant as RabbitVariant);return i<0?0:i;},
    parts:[
      part('body',jpivot(0,19,8),[jbox(-3,-2,-10,6,5,10,0,0)],{rotation:jrot(-.34906584,0,0)}),
      part('tail',jpivot(0,20,7),[jbox(-1.5,-1.5,0,3,3,2,52,6)],{rotation:jrot(-.3490659,0,0)}),
      part('head',headPivot,[jbox(-2.5,-4,-5,5,4,5,32,0),jbox(-.5,-2.5,-5.5,1,1,1,32,9)]),
      part('ear_r',headPivot,[jbox(-2.5,-9,-1,2,5,1,52,0)],{rotation:jrot(0,-EAR_TURN,0)}),
      part('ear_l',headPivot,[jbox(.5,-9,-1,2,5,1,58,0)],{rotation:jrot(0,EAR_TURN,0)}),
      ...side('r',-3,[0,15],[16,15],[8,24]),...side('l',3,[8,15],[30,15],[26,24])
    ],
    // Kits have a big head like the Java baby rabbit, sitting on the front of the half-size body.
    babyHead:{parts:['head','ear_r','ear_l'],pivot:[0,4,-1]},
    pose(e,pose,state){
      const pitch=clampHeadPitch(state.headPitch),yaw=clampHeadYaw(state.headYaw);
      pose.head.x=pose.ear_r.x=pose.ear_l.x=pitch;pose.head.y=pose.ear_r.y=pose.ear_l.y=yaw;
      // Vanilla RabbitModel: haunches at (50j − 21)°, hind feet at 50j°, front legs at (−40j − 11)° (Java angles; the
      // contract's x angles have the opposite sign and the rest rotation is already applied).
      const j=hopProgress(e,state.partial);
      pose.haunch_r.x=pose.haunch_l.x=(1-50*j)*DEG;
      pose.foot_r.x=pose.foot_l.x=-50*j*DEG;
      pose.leg_rf.x=pose.leg_lf.x=(1+40*j)*DEG;
    }});
}
