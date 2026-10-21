// Box models for the monsters area, in Java proportions with original procedurally painted textures.
//  - Enderman: 2.9 blocks tall, near-black skin, emissive magenta eyes on their own part, a lower jaw that shows when the head
//    lifts (angry), long arms and legs, and a block held between the hands (a neutral cube tinted by the carried block's colour).
//  - Slime: a translucent outer cube around an opaque core with eyes and a mouth; appearance().scale is the slime size.
// Parts are all top-level with absolute pivots (no children), so head, jaw and eyes are posed together by animate().
import {blockId,type BlockId} from '../data/blocks';
import type {AnimationState,Entity,EntityModel,ModelPart,PartPose} from '../engine/contracts';
import {FACE,noise,paintBox,shade,type FacePainter} from './monsters-common';

/** Head box of the enderman model in blocks above the feet (8 px cube under the 46 px crown). */
export const ENDERMAN_HEAD_PX={bottom:38,top:46};

// ---- Shared pose helper -------------------------------------------------------------------------
function setPose(pose:Record<string,PartPose>,name:string,x:number,y:number,z:number,px=0,py=0,pz=0,visible=true){
  let p=pose[name];
  if(!p){p={x:0,y:0,z:0};pose[name]=p;}
  p.x=x;p.y=y;p.z=z;p.px=px;p.py=py;p.pz=pz;p.visible=visible;
}
const clamp=(v:number,a:number)=>v<-a?-a:v>a?a:v;

// ---- Enderman -----------------------------------------------------------------------------------
const SKIN=0x17131b,SKIN_SPECK=0x2b1d36,EYE_EDGE=0xc63be0,EYE_CORE=0xf6c2ff;
/** Representative colours of the blocks an enderman can hold (tint of the carried cube). */
export const CARRIED_COLOURS:Readonly<Record<string,number>>={
  grass_block:0x6f9e45,dirt:0x8a5f3f,coarse_dirt:0x775438,podzol:0x664420,mycelium:0x8a7488,moss_block:0x5c7d2e,
  sand:0xdccf9e,red_sand:0xbf6a31,gravel:0x8b8581,clay:0xa3a8b6,cactus:0x5c8c34,pumpkin:0xd27f1e,melon:0x86a52d,tnt:0xc84530,
  brown_mushroom:0x9b7353,red_mushroom:0xcb352e,dandelion:0xf0d53c,poppy:0xd23b2b,blue_orchid:0x2ea7dc,allium:0xb46cd6,
  cornflower:0x4b6edb,oxeye_daisy:0xe9e8de
};
const TINTS=new Map<BlockId,{tint:number}>();
for(const [name,tint] of Object.entries(CARRIED_COLOURS))TINTS.set(blockId(name),Object.freeze({tint}));
const NO_TINT:{tint?:number}=Object.freeze({});
/** The (shared, immutable) appearance for a carried block id. */
export const carriedAppearance=(id:unknown)=>typeof id==='number'?TINTS.get(id)??NO_TINT:NO_TINT;

const skin=(salt:number,base=SKIN):FacePainter=>(face,x,y)=>{
  const n=noise(face*31+x,y,salt);
  if(n>.93)return shade(SKIN_SPECK,.9+n*.2);
  return shade(base,.8+n*.4);
};
const endermanParts:ModelPart[]=[
  // Vanilla layout: legs 0–30 px, body 26–38, arms hang from the shoulders (8–38), head 38–46; no coplanar faces between parts.
  {name:'body',pivot:[0,26,0],boxes:[{from:[-4,0,-2],size:[8,12,4],uv:[32,16]}]},
  {name:'head',pivot:[0,38,0],boxes:[{from:[-4,0,-4],size:[8,8,8],uv:[0,0]}]},
  // The jaw is a slightly smaller copy of the head: hidden inside it until the head lifts.
  {name:'jaw',pivot:[0,38,0],boxes:[{from:[-4,0,-4],size:[8,8,8],uv:[0,16],inflate:-.5}]},
  {name:'eyes',pivot:[0,38,0],emissive:true,boxes:[
    {from:[-3.5,3,-4.25],size:[3,1,1],uv:[32,0]},
    {from:[.5,3,-4.25],size:[3,1,1],uv:[32,0],mirror:true}]},
  {name:'right_arm',pivot:[-5,36,0],boxes:[{from:[-1,-28,-1],size:[2,30,2],uv:[56,0]}]},
  {name:'left_arm',pivot:[5,36,0],boxes:[{from:[-1,-28,-1],size:[2,30,2],uv:[56,0],mirror:true}]},
  {name:'right_leg',pivot:[-2,30,0],boxes:[{from:[-1,-30,-1],size:[2,30,2],uv:[56,0]}]},
  {name:'left_leg',pivot:[2,30,0],boxes:[{from:[-1,-30,-1],size:[2,30,2],uv:[56,0],mirror:true}]},
  // A half-size block held between the hands, turned 45° and tipped toward the viewer (vanilla's carried block pose).
  {name:'carried',pivot:[0,13,-12],rotation:[.35,Math.PI/4,0],tinted:true,boxes:[{from:[-4,-4,-4],size:[8,8,8],uv:[0,32]}]}
];

export function createEndermanModel():EntityModel{
  return{
    textureWidth:64,textureHeight:64,parts:endermanParts,
    paint(px,w,h){
      // Head: dark skin with a faint violet glow row under the eyes on the front face.
      paintBox(px,w,h,0,0,8,8,8,(face,x,y,fw,fh)=>{
        if(face===FACE.front&&y===4&&x!==3&&x!==4)return shade(EYE_EDGE,.45);
        return skin(1)(face,x,y,fw,fh);
      });
      // Jaw: a shade lighter, with a dark mouth line along the front.
      paintBox(px,w,h,0,16,8,8,8,(face,x,y,fw,fh)=>face===FACE.front&&y===1?shade(0x070508,1):skin(2,0x1d1822)(face,x,y,fw,fh));
      // Eyes: magenta with a pale core (drawn emissive).
      paintBox(px,w,h,32,0,3,1,1,(face,x)=>face===FACE.front?shade(x===1?EYE_CORE:EYE_EDGE,1):shade(EYE_EDGE,.85));
      paintBox(px,w,h,32,16,8,12,4,skin(3));
      paintBox(px,w,h,56,0,2,30,2,(face,x,y,fw,fh)=>skin(4)(face,x,y,fw,fh));
      // Carried block: a neutral bevelled cube; appearance().tint colours it.
      paintBox(px,w,h,0,32,8,8,8,(face,x,y,fw,fh)=>{
        const edge=x===0||y===0||x===fw-1||y===fh-1,n=noise(face*17+x,y,9);
        const k=(face===FACE.top?1.08:face===FACE.bottom?.7:.92)*(edge?.78:.9+n*.18);
        return shade(0xe2e2e2,k);
      });
    },
    animate(e:Entity,pose:Record<string,PartPose>,s:AnimationState){
      const angry=e.data.angry===true,carrying=typeof e.data.carried==='number';
      const swing=s.limbSwing*.6662,amount=s.limbAmount;
      let rightArm=clamp(Math.cos(swing+Math.PI)*amount*.5,.4),leftArm=clamp(Math.cos(swing)*amount*.5,.4);
      const rightLeg=clamp(Math.cos(swing)*1.4*amount*.5,.4),leftLeg=clamp(Math.cos(swing+Math.PI)*1.4*amount*.5,.4);
      let armZ=0;
      if(carrying){rightArm=leftArm=.5;armZ=.05;}
      const swingTicks=typeof e.data.swing==='number'?e.data.swing:0;
      const attack=Math.max(s.attack,swingTicks>0?1-swingTicks/10:0);
      if(attack>0){const a=Math.sin(attack*Math.PI);rightArm+=a*1.1;leftArm+=a*.6;}
      // Angry endermen shake (vanilla jitters the whole model by about 0.02 blocks); not with reduced motion.
      let jx=0,jz=0;
      if(angry&&!s.reducedMotion){
        const t=Math.floor(s.time*60);
        jx=(noise(e.id,t,1)-.5)*.64;jz=(noise(e.id,t,2)-.5)*.64;
      }
      const lift=angry?5:0;
      setPose(pose,'head',s.headPitch,s.headYaw,0,jx,lift,jz);
      setPose(pose,'eyes',s.headPitch,s.headYaw,0,jx,lift,jz);
      setPose(pose,'jaw',s.headPitch,s.headYaw,0,jx,0,jz);
      setPose(pose,'body',0,0,0,jx,0,jz);
      setPose(pose,'right_arm',rightArm,0,-armZ,jx,0,jz);
      setPose(pose,'left_arm',leftArm,0,armZ,jx,0,jz);
      setPose(pose,'right_leg',rightLeg,0,0,jx,0,jz);
      setPose(pose,'left_leg',leftLeg,0,0,jx,0,jz);
      setPose(pose,'carried',0,0,0,jx,0,jz,carrying);
    },
    appearance:e=>carriedAppearance(e.data.carried)
  };
}

// ---- Slime --------------------------------------------------------------------------------------
const SLIME_OUTER=0x76c25a,SLIME_CORE=0x5aa83e,SLIME_EYE=0x1d3a17;
/** Outer layer alpha: translucent, but above 0.5 so an alpha-tested renderer still draws it. */
export const SLIME_OUTER_ALPHA=150;
const slimeParts:ModelPart[]=[
  {name:'core',pivot:[0,0,0],boxes:[{from:[-3,1,-3],size:[6,6,6],uv:[0,16]}]},
  {name:'right_eye',pivot:[0,0,0],boxes:[{from:[-3.25,4,-3.5],size:[2,2,2],uv:[32,0]}]},
  {name:'left_eye',pivot:[0,0,0],boxes:[{from:[1.25,4,-3.5],size:[2,2,2],uv:[32,4]}]},
  {name:'mouth',pivot:[0,0,0],boxes:[{from:[-.5,2,-3.5],size:[1,1,1],uv:[32,8]}]},
  // Drawn last so blending shows the core through it.
  {name:'outer',pivot:[0,0,0],boxes:[{from:[-4,0,-4],size:[8,8,8],uv:[0,0]}]}
];
const SLIME_SCALES=new Map<number,{scale:number}>([1,2,4].map(s=>[s,Object.freeze({scale:s})]));
/** The (shared, immutable) appearance of a slime of a size. */
export const slimeAppearance=(size:unknown)=>SLIME_SCALES.get(size as number)??SLIME_SCALES.get(1)!;

export function createSlimeModel():EntityModel{
  return{
    textureWidth:64,textureHeight:32,parts:slimeParts,
    paint(px,w,h){
      paintBox(px,w,h,0,0,8,8,8,(face,x,y,fw,fh)=>{
        const edge=x===0||y===0||x===fw-1||y===fh-1,n=noise(face*13+x,y,21);
        // A brighter highlight on the upper front corner of every side, darker rims.
        const glint=face>=FACE.west&&x>=1&&x<=2&&y>=1&&y<=2;
        return shade(SLIME_OUTER,glint?1.25:edge?.8:.92+n*.14,edge?200:glint?185:SLIME_OUTER_ALPHA);
      });
      paintBox(px,w,h,0,16,6,6,6,(face,x,y)=>shade(SLIME_CORE,.82+noise(face*7+x,y,22)*.3));
      const eye:FacePainter=(face,x,y)=>shade(SLIME_EYE,face===FACE.front&&x===0&&y===0?2.4:1);
      paintBox(px,w,h,32,0,2,2,2,eye);paintBox(px,w,h,32,4,2,2,2,eye);
      paintBox(px,w,h,32,8,1,1,1,()=>shade(0x274a1e,1));
    },
    appearance:e=>slimeAppearance(e.data.size)
  };
}
