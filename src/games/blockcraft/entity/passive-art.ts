// Box models, painted textures and animation of the passive mobs (cow and mooshroom, pig, sheep, chicken, rabbit).
//
// Proportions follow the Java models (pixel units, 16 = 1 block) converted to the contract's space: pivots relative to the
// feet centre, +y up, -z forward. Java's rotated bodies are written as axis-aligned boxes with their own standard cuboid
// unwraps, so no rest rotations are needed. Every texture is original procedural pixel art: faces are painted from small
// character maps (eyes, muzzles, snouts) and value noise (coat patches, wool curls, feathers).
import {Canvas,blob,buildModel,clampHeadPitch,clampHeadYaw,hash,mix,poseQuadruped,shade,vary,type Face,type ModelSpec,type ModelVariant,type Vec3T} from './passive-model';
import {brainOf} from './passive-ai';
import type {Entity,EntityModel,ModelBox,ModelPart,PartPose} from '../engine/contracts';

// ---- Painting helpers ----------------------------------------------------------------------------
interface BoxUV{readonly uv:[number,number];readonly size:Vec3T}
const uvBox=(u:number,v:number,size:Vec3T):BoxUV=>({uv:[u,v],size});
/** A model box of a texture region, `from` relative to the part pivot. */
function box(from:Vec3T,t:BoxUV,inflate?:number):ModelBox{
  const b:ModelBox={from,size:[...t.size],uv:[...t.uv]};
  if(inflate)b.inflate=inflate;
  return b;
}
const part=(name:string,pivot:Vec3T,boxes:ModelBox[],extra:Partial<ModelPart>={}):ModelPart=>({name,pivot,boxes,...extra});
type Pal=Readonly<Record<string,number>>;
const FACE_SEED:Record<Face,number>={top:101,bottom:211,west:307,front:401,east:503,back:601};
const noise=(face:Face,x:number,y:number,seed:number)=>hash(x,y,seed+FACE_SEED[face]);
/** Colour of texel (x, y) from a character map (top row first); throws on a size mismatch so tests catch bad maps. */
function fromMap(map:readonly string[],pal:Pal,x:number,y:number,n:number,amount=.05):number{
  const ch=map[y]?.[x];
  const c=ch===undefined?undefined:pal[ch];
  if(c===undefined)throw new Error(`texture map has no colour at ${x},${y} (${ch})`);
  return vary(c,n,amount);
}
const mirror=(map:readonly string[])=>map.map(r=>[...r].reverse().join(''));
const fill=(rows:number,row:string)=>Array.from({length:rows},()=>row);
/** Side maps are drawn for the west face (front edge on the right); the east face shows them mirrored. */
function sideMap(face:Face,west:readonly string[],east=mirror(west)):readonly string[]{return face==='west'?west:east;}

// ---- Cow and mooshroom ---------------------------------------------------------------------------
interface CowPalette{B:number;W:number;M:number;N:number;E:number;K:number;horn:number;hornTip:number;hoof:number;udder:number;teat:number;
  /** Share of the coat (0..1 noise threshold) that is the patch colour. */
  cut:number;seed:number}
const COW:CowPalette={B:0x4b301f,W:0xe4dfd4,M:0xd7b49b,N:0x5f3e2e,E:0xeceae4,K:0x15110f,horn:0xd9d0b9,hornTip:0x958c79,hoof:0x302a26,udder:0xe6a19d,teat:0xc27a78,cut:.6,seed:17};
const MOOSHROOM:CowPalette={B:0xa1241a,W:0xd9d3c9,M:0xd2b2a4,N:0x6e2b25,E:0xece8e2,K:0x170f0e,horn:0xd8cfb8,hornTip:0x958c79,hoof:0x3a2723,udder:0xe3a29f,teat:0xbc7573,cut:.64,seed:29};
const COW_UV={head:uvBox(0,0,[8,8,6]),horn:uvBox(22,0,[1,3,1]),udder:uvBox(28,0,[4,1,6]),leg:uvBox(48,0,[4,12,4]),body:uvBox(0,16,[12,10,18]),
  cap:uvBox(0,44,[4,2,4]),stem:uvBox(16,44,[2,2,2])};
const COW_FACE=['BBBWWBBB','BBWWWWBB','BBBWWBBB','BEKWWKEB','BBBWWBBB','BMMWWMMB','MMNMMNMM','MMMMMMMM'];
const COW_SIDE=['BBBBBB','BBBBBB','BBWBBB','BBWWBB','BBBBBB','BBBBBM','BBBBMM','BBBMMM'];
const COW_TOP=['BBBBBBBB','BBBBBBBB','BBBBBBBB','BBBWWBBB','BBBWWBBB','BBBWWBBB'];
const COW_CHIN=['BBBBBBBB','BBBBBBBB','BBBBBBBB','BMMMMMMB','MMMMMMMM','MMMMMMMM'];
const COW_BACK=['BBBBBBBB','BBBBBBBB','BBBWWBBB','BBWWWBBB','BBBWBBBB','BBBBBBBB','BBBBBBBB','BBBBBBBB'];
/** Mushroom on a mooshroom: red cap with pale dots over a pale stem. */
const CAP_TOP=['RWRR','RRRW','RRRR','WRRR'];
function paintCow(c:Canvas,p:CowPalette,mushrooms:boolean){
  const pal:Pal={B:p.B,W:p.W,M:p.M,N:p.N,E:p.E,K:p.K};
  const coat=(face:Face,x:number,y:number,off:number)=>{
    const n=noise(face,x,y,p.seed),patch=blob(x+off*13,y+off*7,5,p.seed+off)>p.cut;
    return vary(patch?p.W:p.B,n,patch?.03:.07);
  };
  c.box(COW_UV.head.uv,COW_UV.head.size,(f,x,y)=>{
    const n=noise(f,x,y,p.seed);
    switch(f){
      case 'front':return fromMap(COW_FACE,pal,x,y,n);
      case 'west':case 'east':return fromMap(sideMap(f,COW_SIDE),pal,x,y,n);
      case 'top':return fromMap(COW_TOP,pal,x,y,n);
      case 'bottom':return fromMap(COW_CHIN,pal,x,y,n);
      default:return fromMap(COW_BACK,pal,x,y,n);
    }
  });
  c.box(COW_UV.horn.uv,COW_UV.horn.size,(f,_x,y)=>f==='top'||f!=='bottom'&&y===0?p.hornTip:p.horn);
  c.box(COW_UV.udder.uv,COW_UV.udder.size,(f,x,y)=>f==='bottom'&&(x===0||x===3)&&(y===1||y===4)?p.teat:vary(p.udder,noise(f,x,y,p.seed),.04));
  c.box(COW_UV.leg.uv,COW_UV.leg.size,(f,x,y)=>{
    if(f==='bottom')return vary(p.hoof,noise(f,x,y,p.seed),.08);
    if(f==='top')return p.B;
    if(y>=10)return vary(p.hoof,noise(f,x,y,p.seed),.08);
    if(y>=7)return vary(p.W,noise(f,x,y,p.seed),.03);
    return coat(f,x,y,3);
  });
  c.box(COW_UV.body.uv,COW_UV.body.size,(f,x,y,w)=>{
    // A tail down the rump: a dark stripe ending in a tuft.
    if(f==='back'&&(x===5||x===6)&&y<9)return y>=6?shade(p.B,.7):shade(p.B,.85);
    return coat(f,x,y,f==='top'?1:f==='bottom'?2:f==='west'?4:f==='east'?5:6+w);
  });
  if(!mushrooms)return;
  c.box(COW_UV.cap.uv,COW_UV.cap.size,(f,x,y)=>{
    const R=0xc52a20,W=0xeee6da;
    if(f==='top')return fromMap(CAP_TOP,{R,W},x,y,noise(f,x,y,5),.04);
    if(f==='bottom')return vary(0xcdb994,noise(f,x,y,5),.05);
    return y===0&&(x+(f==='front'||f==='back'?1:0))%3===1?W:shade(R,y===1?.85:1);
  });
  c.box(COW_UV.stem.uv,COW_UV.stem.size,(f,x,y)=>vary(f==='top'?0xd9cfbb:0xe9e1cf,noise(f,x,y,7),.04));
}
function cowParts():ModelPart[]{
  const u=COW_UV;
  return[
    part('head',[0,20,-8],[box([-4,-4,-6],u.head),box([-5,2,-4],u.horn),box([4,2,-4],u.horn)]),
    part('body',[0,12,0],[box([-6,0,-8],u.body),box([-2,-1,4],u.udder)]),
    part('leg_rh',[-4,12,7],[box([-2,-12,-2],u.leg)]),part('leg_lh',[4,12,7],[box([-2,-12,-2],u.leg)]),
    part('leg_rf',[-4,12,-6],[box([-2,-12,-2],u.leg)]),part('leg_lf',[4,12,-6],[box([-2,-12,-2],u.leg)])
  ];
}
function mushroomParts():ModelPart[]{
  const u=COW_UV,mushroom=(dx:number,dy:number,dz:number)=>[box([dx-1,dy,dz-1],u.stem),box([dx-2,dy+2,dz-2],u.cap)];
  return[
    // Same pivot as the head, posed like it, so it rides on the head.
    part('head_mushroom',[0,20,-8],mushroom(0,4,-3)),
    part('mushroom_1',[3,22,2],mushroom(0,0,0)),part('mushroom_2',[-2,22,7],mushroom(0,0,0))
  ];
}
const copyRotation=(to:PartPose,from:PartPose)=>{to.x=from.x;to.y=from.y;to.z=from.z;to.px=from.px;to.py=from.py;to.pz=from.pz;};
/** Cow (variant 'cow') and mooshroom (variant 'mooshroom': red coat, mushrooms on adults). */
export function cowModel():EntityModel{
  const variants:ModelVariant[]=[
    {id:'cow',paint:c=>paintCow(c,COW,false)},
    {id:'mooshroom',paint:c=>paintCow(c,MOOSHROOM,true),extra:mushroomParts()}
  ];
  const spec:ModelSpec={width:64,height:50,parts:cowParts(),variants,
    variantOf:e=>e.data.variant==='mooshroom'?1:0,
    babyHead:{parts:['head'],pivot:[0,10,-4]},
    pose(_e,pose,state){poseQuadruped(pose,state);copyRotation(pose.head_mushroom,pose.head);}};
  return buildModel(spec);
}

// ---- Pig -------------------------------------------------------------------------------------------
const PIG={S:0xefa59e,L:0xf6bcb5,D:0xd98580,N:0x8e4446,E:0xf2f0ee,K:0x161212,hoof:0x8a5b50,seed:41};
const PIG_UV={head:uvBox(0,0,[8,8,8]),snout:uvBox(32,0,[4,3,1]),leg:uvBox(48,0,[4,6,4]),body:uvBox(0,16,[10,8,16])};
const PIG_FACE=['SSSSSSSS','SSSSSSSS','SSSSSSSS','SEKSSKES','SSSSSSSS','SSSSSSSS','SSSSSSSS','SSSSSSSS'];
const PIG_SIDE=['SSSSSDDD','SSSSSSDD','SSSSSSSD',...fill(5,'SSSSSSSS')];
const PIG_TOP=[...fill(6,'SSSSSSSS'),'DDSSSSDD','DDSSSSDD'];
const PIG_SNOUT=['LLLL','NLLN','LLLL'];
const PIG_RUMP=['SSSSSSSSSS','SSSSDDSSSS','SSSSSDSSSS','SSSSDDSSSS',...fill(4,'SSSSSSSSSS')];
function paintPig(c:Canvas){
  const p=PIG,pal:Pal={S:p.S,L:p.L,D:p.D,N:p.N,E:p.E,K:p.K};
  const skin=(f:Face,x:number,y:number)=>{
    const n=noise(f,x,y,p.seed),freckle=hash(x,y,p.seed+FACE_SEED[f]*3)>.965;
    const base=f==='top'?mix(p.S,p.L,.35):f==='bottom'?mix(p.S,p.D,.3):p.S;
    return vary(freckle?p.D:base,n,.04);
  };
  c.box(PIG_UV.head.uv,PIG_UV.head.size,(f,x,y)=>{
    const n=noise(f,x,y,p.seed);
    if(f==='front')return fromMap(PIG_FACE,pal,x,y,n,.03);
    if(f==='west'||f==='east')return fromMap(sideMap(f,PIG_SIDE),pal,x,y,n,.03);
    if(f==='top')return fromMap(PIG_TOP,pal,x,y,n,.03);
    return skin(f,x,y);
  });
  c.box(PIG_UV.snout.uv,PIG_UV.snout.size,(f,x,y)=>f==='front'?fromMap(PIG_SNOUT,pal,x,y,noise(f,x,y,p.seed),.03):vary(p.L,noise(f,x,y,p.seed),.03));
  c.box(PIG_UV.leg.uv,PIG_UV.leg.size,(f,x,y,_w,h)=>f==='bottom'||f!=='top'&&y===h-1?vary(p.hoof,noise(f,x,y,p.seed),.06):skin(f,x,y));
  c.box(PIG_UV.body.uv,PIG_UV.body.size,(f,x,y)=>f==='back'?fromMap(PIG_RUMP,pal,x,y,noise(f,x,y,p.seed),.04):skin(f,x,y));
}
export function pigModel():EntityModel{
  const u=PIG_UV,leg=(name:string,x:number,z:number)=>part(name,[x,6,z],[box([-2,-6,-2],u.leg)]);
  return buildModel({width:64,height:40,variants:[{id:'pig',paint:paintPig}],
    parts:[
      part('head',[0,12,-6],[box([-4,-4,-8],u.head),box([-2,-3,-9],u.snout)]),
      part('body',[0,6,0],[box([-5,0,-8],u.body)]),
      leg('leg_rh',-3,7),leg('leg_lh',3,7),leg('leg_rf',-3,-5),leg('leg_lf',3,-5)
    ],
    babyHead:{parts:['head'],pivot:[0,8,-2]},
    pose(_e,pose,state){poseQuadruped(pose,state);}});
}

// ---- Sheep -----------------------------------------------------------------------------------------
const SHEEP={F:0xd3bea1,S:0xdcc7ad,D:0xbfa688,E:0xecebe6,K:0x1d1b1a,N:0xc6938a,M:0x94695e,hoof:0x5d5044,wool:0xf7f6f1,woolShade:0xdedcd4,woolDeep:0xc9c6bd,seed:59};
const SHEEP_UV={head:uvBox(0,0,[6,6,8]),leg:uvBox(28,0,[4,12,4]),woolLeg:uvBox(44,0,[4,6,4]),woolHead:uvBox(0,14,[6,6,6]),
  body:uvBox(0,26,[8,6,16]),woolBody:uvBox(0,48,[8,6,16])};
const SHEEP_FACE=['FFFFFF','FFFFFF','EKFFKE','FFFFFF','FFNNFF','FFMMFF'];
const SHEEP_SIDE=[...fill(2,'DDFFFFFF'),'DDDFFFFF',...fill(3,'DFFFFFFF')];
/** Wool: curls of shade in off-white, so the tint (dye colour) shows true. */
function wool(f:Face,x:number,y:number,seed:number):number{
  const p=SHEEP,curl=blob(x*1.3+FACE_SEED[f],y*1.3,2.2,seed),n=hash(x,y,seed+FACE_SEED[f]);
  return vary(n>.94?p.woolDeep:curl>.6?p.woolShade:p.wool,n,.03);
}
function paintSheep(c:Canvas){
  const p=SHEEP,pal:Pal={F:p.F,D:p.D,E:p.E,K:p.K,N:p.N,M:p.M};
  const skin=(f:Face,x:number,y:number)=>vary(p.S,noise(f,x,y,p.seed),.05);
  c.box(SHEEP_UV.head.uv,SHEEP_UV.head.size,(f,x,y)=>{
    const n=noise(f,x,y,p.seed);
    if(f==='front')return fromMap(SHEEP_FACE,pal,x,y,n,.03);
    if(f==='west'||f==='east')return fromMap(sideMap(f,SHEEP_SIDE),pal,x,y,n,.03);
    return vary(p.F,n,.04);
  });
  c.box(SHEEP_UV.leg.uv,SHEEP_UV.leg.size,(f,x,y,_w,h)=>f==='bottom'||f!=='top'&&y>=h-2?vary(p.hoof,noise(f,x,y,p.seed),.06):skin(f,x,y));
  c.box(SHEEP_UV.body.uv,SHEEP_UV.body.size,skin);
  for(const t of [SHEEP_UV.woolLeg,SHEEP_UV.woolHead,SHEEP_UV.woolBody])c.box(t.uv,t.size,(f,x,y)=>wool(f,x,y,p.seed+t.uv[1]));
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
/** Sheep: skin model plus tinted wool layers (hidden when sheared). */
export function sheepModel(tintOf:(e:Entity)=>number):EntityModel{
  const u=SHEEP_UV,legs:[string,number,number][]=[['leg_rh',-3,7],['leg_lh',3,7],['leg_rf',-3,-5],['leg_lf',3,-5]];
  const parts:ModelPart[]=[
    part('head',[0,18,-8],[box([-3,-2,-6],u.head)]),
    part('wool_head',[0,18,-8],[box([-3,-2,-4],u.woolHead,.6)],{tinted:true}),
    part('body',[0,12,0],[box([-4,0,-8],u.body)]),
    part('wool_body',[0,12,0],[box([-4,0,-8],u.woolBody,1.75)],{tinted:true}),
    ...legs.map(([name,x,z])=>part(name,[x,12,z],[box([-2,-12,-2],u.leg)])),
    ...legs.map(([name,x,z])=>part(`wool_${name}`,[x,12,z],[box([-2,-6,-2],u.woolLeg,.5)],{tinted:true}))
  ];
  const appearance=new Map<number,{tint:number}>();
  return buildModel({width:64,height:70,variants:[{id:'sheep',paint:paintSheep}],parts,
    babyHead:{parts:['head','wool_head'],pivot:[0,10,-4]},
    pose(e,pose,state){
      poseQuadruped(pose,state);
      const t=brainOf(e).eat;
      if(t>0){pose.head.py=-9*eatPosition(t,state.partial);pose.head.x=-eatAngle(t,state.partial);}
      copyRotation(pose.wool_head,pose.head);
      for(const [name] of legs)copyRotation(pose[`wool_${name}`],pose[name]);
      const sheared=e.data.sheared===true;
      pose.wool_head.visible=pose.wool_body.visible=!sheared;
      for(const [name] of legs)pose[`wool_${name}`].visible=!sheared;
    },
    appearance(e){
      const tint=tintOf(e);let a=appearance.get(tint);
      if(!a){a={tint};appearance.set(tint,a);}
      return a;
    }});
}

// ---- Chicken ---------------------------------------------------------------------------------------
const CHICKEN={W:0xf5f3ed,S:0xe3e0d7,D:0xcdc9be,K:0x131313,R:0xd3302a,r:0xa62520,beak:0xf2b13a,beakDark:0xc98a24,leg:0xe8a13a,legDark:0xc07e2a,seed:73};
const CHICKEN_UV={head:uvBox(0,0,[4,6,3]),beak:uvBox(14,0,[4,2,2]),wattle:uvBox(14,4,[2,2,2]),wing:uvBox(26,0,[1,4,6]),
  shank:uvBox(40,0,[1,5,1]),toes:uvBox(44,0,[3,1,3]),body:uvBox(0,10,[6,6,8])};
const CHICKEN_FACE=['WWWW','KWWK',...fill(4,'WWWW')];
const CHICKEN_SIDE=['WWW','WWK',...fill(4,'WWW')];
const CHICKEN_CROWN=['WWWW','WWWW','WRRW'];
function paintChicken(c:Canvas){
  const p=CHICKEN,pal:Pal={W:p.W,S:p.S,K:p.K,R:p.R};
  const feathers=(f:Face,x:number,y:number)=>{
    const n=noise(f,x,y,p.seed),row=hash(x>>1,y,p.seed+FACE_SEED[f])>.7;
    return vary(row?p.S:p.W,n,.025);
  };
  c.box(CHICKEN_UV.head.uv,CHICKEN_UV.head.size,(f,x,y)=>{
    const n=noise(f,x,y,p.seed);
    if(f==='front')return fromMap(CHICKEN_FACE,pal,x,y,n,.02);
    if(f==='west'||f==='east')return fromMap(sideMap(f,CHICKEN_SIDE),pal,x,y,n,.02);
    if(f==='top')return fromMap(CHICKEN_CROWN,pal,x,y,n,.03);
    return vary(p.W,n,.02);
  });
  c.box(CHICKEN_UV.beak.uv,CHICKEN_UV.beak.size,(f,_x,y)=>f==='top'?p.beak:f==='bottom'||y===1?p.beakDark:p.beak);
  c.box(CHICKEN_UV.wattle.uv,CHICKEN_UV.wattle.size,(f,_x,y)=>f==='bottom'||f!=='top'&&y===1?p.r:p.R);
  c.box(CHICKEN_UV.wing.uv,CHICKEN_UV.wing.size,(f,x,y,_w,h)=>{
    const n=noise(f,x,y,p.seed);
    if(f==='top')return vary(p.W,n,.02);
    if(f==='bottom')return vary(p.D,n,.03);
    return vary(y===h-1?p.D:y===h-2?p.S:p.W,n,.025);
  });
  c.box(CHICKEN_UV.shank.uv,CHICKEN_UV.shank.size,(f,x,y)=>vary(p.leg,noise(f,x,y,p.seed),.05));
  c.box(CHICKEN_UV.toes.uv,CHICKEN_UV.toes.size,(f,x,y)=>vary(f==='top'?p.leg:p.legDark,noise(f,x,y,p.seed),.05));
  c.box(CHICKEN_UV.body.uv,CHICKEN_UV.body.size,(f,x,y)=>{
    // Tail feathers: the top rows of the rump are a little greyer.
    if(f==='back'&&y<3)return vary(y===0?p.D:p.S,noise(f,x,y,p.seed),.03);
    if(f==='bottom')return vary(p.S,noise(f,x,y,p.seed),.03);
    return feathers(f,x,y);
  });
}
/** Vanilla chicken wing bob: (sin(flap) + 1) × flapSpeed, interpolated between ticks. */
function wingBob(e:Entity,partial:number):number{
  const b=brainOf(e),flap=b.oFlap+(b.flap-b.oFlap)*partial,speed=b.oFlapSpeed+(b.flapSpeed-b.oFlapSpeed)*partial;
  return (Math.sin(flap)+1)*speed;
}
export function chickenModel():EntityModel{
  const u=CHICKEN_UV,leg=(name:string,x:number)=>part(name,[x,5,1],[box([-.5,-5,-.5],u.shank),box([-1.5,-5,-2],u.toes)]);
  return buildModel({width:64,height:24,variants:[{id:'chicken',paint:paintChicken}],
    parts:[
      part('head',[0,9,-4],[box([-2,0,-2],u.head),box([-2,2,-4],u.beak),box([-1,0,-3],u.wattle)]),
      part('body',[0,5,0],[box([-3,0,-4],u.body)]),
      leg('leg_r',-1.5),leg('leg_l',1.5),
      part('wing_r',[-4,11,0],[box([0,-4,-3],u.wing)]),part('wing_l',[4,11,0],[box([-1,-4,-3],u.wing)])
    ],
    babyHead:{parts:['head'],pivot:[0,4,-2]},
    pose(e,pose,state){
      const swing=Math.cos(state.limbSwing)*1.4*state.limbAmount;
      pose.leg_r.x=swing;pose.leg_l.x=-swing;
      pose.head.x=clampHeadPitch(state.headPitch);pose.head.y=clampHeadYaw(state.headYaw);
      const bob=wingBob(e,state.partial);
      pose.wing_r.z=-bob;pose.wing_l.z=bob;
    }});
}

// ---- Rabbit ----------------------------------------------------------------------------------------
export const RABBIT_VARIANTS=['brown','white','black','white_splotched','gold','salt'] as const;
export type RabbitVariant=typeof RABBIT_VARIANTS[number];
interface RabbitPalette{B:number;L:number;D:number;belly:number;I:number;nose:number;K:number;tail:number;pattern:'plain'|'splotch'|'salt';seed:number}
const RABBIT_PAL:Record<RabbitVariant,RabbitPalette>={
  brown:{B:0x8a6a4b,L:0xb0916d,D:0x6a4f37,belly:0xcdb895,I:0xd9a7a0,nose:0xd69a98,K:0x1a1410,tail:0xe9e2d2,pattern:'plain',seed:83},
  white:{B:0xf1f0ea,L:0xfbfaf6,D:0xd9d7cf,belly:0xfbfaf6,I:0xebb3b1,nose:0xe7a3a6,K:0xb3262b,tail:0xfbfaf6,pattern:'plain',seed:89},
  black:{B:0x2d2723,L:0x433a33,D:0x1d1916,belly:0x4c433b,I:0x7d5552,nose:0x6c4a48,K:0x8a6424,tail:0x3c342e,pattern:'plain',seed:97},
  white_splotched:{B:0xf0efe9,L:0xfaf9f5,D:0x2c2622,belly:0xfaf9f5,I:0xe7b0ae,nose:0xdc9c9e,K:0x16110f,tail:0xfaf9f5,pattern:'splotch',seed:101},
  gold:{B:0xd7ae6c,L:0xe9c88c,D:0xb48b52,belly:0xf1ddb4,I:0xe6ad9d,nose:0xd99a8e,K:0x231a10,tail:0xf3e4c4,pattern:'plain',seed:103},
  salt:{B:0x8c7d69,L:0xb9ab92,D:0x544a3e,belly:0xb4a58c,I:0xcf9f97,nose:0xc58f8b,K:0x15110e,tail:0xd6cbb6,pattern:'salt',seed:107}
};
const RABBIT_UV={body:uvBox(0,0,[6,5,10]),head:uvBox(32,0,[5,4,5]),earR:uvBox(52,0,[2,5,1]),earL:uvBox(58,0,[2,5,1]),nose:uvBox(52,6,[1,1,1]),
  tail:uvBox(32,9,[3,3,2]),frontLeg:uvBox(42,9,[2,6,2]),haunch:uvBox(0,15,[2,4,5]),foot:uvBox(14,15,[2,1,7])};
const RABBIT_FACE=['BBBBB','BBBBB','BLLLB','LLLLL'];
const RABBIT_SIDE=['BBBBB','BBBKB','BBBLL','BBLLL'];
const RABBIT_EAR=['BB','II','II','II','BB'];
function paintRabbit(c:Canvas,p:RabbitPalette){
  const pal:Pal={B:p.B,L:p.L,K:p.K,I:p.I};
  /** Coat colour at a texel: the variant's pattern over a base colour. */
  const coat=(f:Face,x:number,y:number,base:number,off:number)=>{
    const n=noise(f,x,y,p.seed);
    if(p.pattern==='splotch'&&blob(x+off*11,y+off*5,3,p.seed+off)>.58)return vary(p.D,n,.05);
    if(p.pattern==='salt'){const s=hash(x,y,p.seed*7+off+FACE_SEED[f]);if(s>.78)return vary(p.L,n,.04);if(s<.18)return vary(p.D,n,.04);}
    return vary(base,n,.05);
  };
  c.box(RABBIT_UV.body.uv,RABBIT_UV.body.size,(f,x,y,_w,h)=>{
    if(f==='bottom'||f==='front')return coat(f,x,y,p.belly,1);
    if(f==='top')return coat(f,x,y,x===2||x===3?mix(p.B,p.D,.35):p.B,2);
    return coat(f,x,y,y===h-1?mix(p.B,p.belly,.5):p.B,3);
  });
  c.box(RABBIT_UV.head.uv,RABBIT_UV.head.size,(f,x,y)=>{
    const n=noise(f,x,y,p.seed);
    if(f==='front')return fromMap(RABBIT_FACE,pal,x,y,n,.03);
    if(f==='west'||f==='east')return fromMap(sideMap(f,RABBIT_SIDE),pal,x,y,n,.03);
    if(f==='bottom')return vary(p.belly,n,.04);
    return coat(f,x,y,p.B,4);
  });
  for(const ear of [RABBIT_UV.earR,RABBIT_UV.earL])
    c.box(ear.uv,ear.size,(f,x,y)=>f==='front'?fromMap(RABBIT_EAR,pal,x,y,noise(f,x,y,p.seed),.03):coat(f,x,y,f==='top'?p.D:p.B,5));
  c.box(RABBIT_UV.nose.uv,RABBIT_UV.nose.size,()=>p.nose);
  c.box(RABBIT_UV.tail.uv,RABBIT_UV.tail.size,(f,x,y)=>vary(p.tail,noise(f,x,y,p.seed),.03));
  c.box(RABBIT_UV.frontLeg.uv,RABBIT_UV.frontLeg.size,(f,x,y,_w,h)=>f==='bottom'||y>=h-2&&f!=='top'?vary(p.L,noise(f,x,y,p.seed),.04):coat(f,x,y,p.B,6));
  c.box(RABBIT_UV.haunch.uv,RABBIT_UV.haunch.size,(f,x,y,_w,h)=>coat(f,x,y,f==='bottom'||y===h-1?mix(p.B,p.belly,.4):p.B,7));
  c.box(RABBIT_UV.foot.uv,RABBIT_UV.foot.size,(f,x,y)=>f==='top'?coat(f,x,y,p.B,8):vary(p.L,noise(f,x,y,p.seed),.04));
}
const DEG=Math.PI/180;
/** Rabbits hop: a 10-tick jump animation (vanilla jump completion) kicks the hind legs back and reaches with the front legs. */
function hopProgress(e:Entity,partial:number):number{
  const hop=brainOf(e).hop;
  return hop>0?Math.sin(Math.min(1,(hop-1+partial)/10)*Math.PI):0;
}
export function rabbitModel():EntityModel{
  const u=RABBIT_UV;
  const side=(s:'r'|'l',x:number):ModelPart[]=>[
    part(`leg_${s}f`,[x*2,6,-1],[box([-1,-6,-1],u.frontLeg)]),
    part(`haunch_${s}`,[x*3,6,2],[box([-1,-4,0],u.haunch)]),
    part(`foot_${s}`,[x*3,6,2],[box([-1,-6,-2],u.foot)])
  ];
  return buildModel({width:64,height:24,scale:.6,
    variants:RABBIT_VARIANTS.map(id=>({id,paint:(c:Canvas)=>paintRabbit(c,RABBIT_PAL[id])})),
    variantOf:e=>{const i=RABBIT_VARIANTS.indexOf(e.data.variant as RabbitVariant);return i<0?0:i;},
    parts:[
      part('body',[0,3,0],[box([-3,0,-3],u.body),box([-1.5,1,7],u.tail)]),
      part('head',[0,8,-2],[box([-2.5,0,-5],u.head),box([-2.5,4,-1],u.earR),box([.5,4,-1],u.earL),box([-.5,1.5,-5.5],u.nose)]),
      ...side('r',-1),...side('l',1)
    ],
    pose(e,pose,state){
      pose.head.x=clampHeadPitch(state.headPitch);pose.head.y=clampHeadYaw(state.headYaw);
      const jump=hopProgress(e,state.partial),kick=-50*DEG*jump,reach=(11+40*jump)*DEG;
      pose.haunch_r.x=pose.haunch_l.x=pose.foot_r.x=pose.foot_l.x=kick;
      pose.leg_rf.x=pose.leg_lf.x=reach;
    }});
}
