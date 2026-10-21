// Box models of the hostile mobs and the arrow: original procedural textures (entity/hostile-art.ts) on Java-style
// geometry (model space: pixels, +y up, the mob faces -z; a positive x angle swings a limb forward and lifts a head,
// a positive y angle turns left). Animations follow the vanilla model rigs: humanoid walk with zombie arms held out
// (raised higher while chasing) and swinging on attack, skeleton bow aim, creeper four-leg walk with the swell flash
// and the charged aura, spider eight-leg gait, and baby zombies with a 1.5× head on the half-size body.
import type {AnimationState,Entity,EntityModel,PartPose} from '../engine/contracts';
import {CLEAR,buildTexture,faceSeed,grain,hash,mix,shade,speckle,upscale,type BoxDef,type Face,type PartDef,type Painter,type V3} from './hostile-art';

// ---- Pose helpers -----------------------------------------------------------------------------------
/** Sets a part's pose in place (reusing the record's object), clearing offsets. */
export function setPose(pose:Record<string,PartPose>,name:string,x:number,y:number,z:number,visible=true):PartPose{
  let p=pose[name];
  if(!p){p={x,y,z};pose[name]=p;}
  else{p.x=x;p.y=y;p.z=z;}
  p.px=0;p.py=0;p.pz=0;p.visible=visible;
  return p;
}
const MAX_HEAD_YAW=75*Math.PI/180;
const clampYaw=(a:number)=>Math.max(-MAX_HEAD_YAW,Math.min(MAX_HEAD_YAW,a));
const clampPitch=(a:number)=>Math.max(-1.3,Math.min(1.3,a));
/** Attack swing progress 0..1 from data.swing (ticks left of a 10-tick swing, as the renderer reads it), between ticks. */
export function swingProgress(e:Entity,partial:number):number{
  const s=e.data.swing;
  if(typeof s!=='number'||s<=0)return 0;
  return Math.max(0,Math.min(1,1-(s-partial)/10));
}
const ticks=(state:AnimationState)=>state.reducedMotion?0:state.time*20;

// ---- Painters ------------------------------------------------------------------------------------------
type Pal={base:number;dark:number;light:number;deep:number};
function skinOf(p:Pal,seed:number,spots=.12):(x:number,y:number)=>number{
  return(x,y)=>{const n=hash(x,y,seed);return n<spots?p.dark:n>.92?p.light:grain(p.base,x,y,seed+7,.05);};
}
function faceDetail(face:Face,x:number,y:number,map:Record<string,number>|null):number|undefined{
  if(face!=='front'||!map)return undefined;
  return map[`${x},${y}`];
}
/** Pixel map from rows of characters: '.' keeps the base, other letters index `colors`. */
function pixelMap(rows:readonly string[],colors:Record<string,number>):Record<string,number>{
  const out:Record<string,number>={};
  rows.forEach((row,y)=>{for(let x=0;x<row.length;x++){const c=row[x];if(c!=='.'&&colors[c]!==undefined)out[`${x},${y}`]=colors[c];}});
  return out;
}

// Zombie family ---------------------------------------------------------------------------------------
interface ZombieLook{skin:Pal;face:Record<string,number>;shirt:number;shirtDark:number;pants:number;pantsDark:number;shoes:number;seed:number;
  /** Husk wraps: rows of the head and arms covered by cloth bands. */
  wrap?:number;
  /** Drowned: shirt rags with holes. */
  rags?:boolean}
const ZOMBIE_SKIN:Pal={base:0x5a8b4a,dark:0x466f3a,light:0x6f9f5d,deep:0x2f4a28};
const HUSK_SKIN:Pal={base:0x958159,dark:0x7a6747,light:0xab9670,deep:0x4c3f2a};
const DROWNED_SKIN:Pal={base:0x4f9f98,dark:0x3d7f7a,light:0x6cbcb3,deep:0x24504c};

const ZOMBIE_FACE=pixelMap([
  '........',
  '........',
  '.dd..dd.',
  '.ek..ke.',
  '...nn...',
  '........',
  '..mmmm..',
  '........'],{d:0x30492a,e:0x1a2117,k:0x0b0d0a,n:0x3f6334,m:0x26381f});
const HUSK_FACE=pixelMap([
  '........',
  '........',
  '.dd..dd.',
  '.ek..ke.',
  '...nn...',
  '........',
  '.m.mm.m.',
  '..mmmm..'],{d:0x4a3c27,e:0x2a2015,k:0xd9c58a,n:0x6e5c3e,m:0x3b2f1f});
const DROWNED_FACE=pixelMap([
  '........',
  '........',
  '.dd..dd.',
  '.ek..ke.',
  '...nn...',
  '........',
  '..mmmm..',
  '...mm...'],{d:0x2a5753,e:0x1d6f73,k:0x9ff8ff,n:0x3a7470,m:0x1b3b38});
const ZOMBIE_LOOK:ZombieLook={skin:ZOMBIE_SKIN,face:ZOMBIE_FACE,shirt:0x2a8790,shirtDark:0x1d6770,pants:0x3d3f8e,pantsDark:0x2c2d6a,shoes:0x47474b,seed:11};
const HUSK_LOOK:ZombieLook={skin:HUSK_SKIN,face:HUSK_FACE,shirt:0x9a8657,shirtDark:0x7d6b44,pants:0x6f5f42,pantsDark:0x58492f,shoes:0x3e3426,seed:23,wrap:0xb9a77c};
const DROWNED_LOOK:ZombieLook={skin:DROWNED_SKIN,face:DROWNED_FACE,shirt:0x3c6f6a,shirtDark:0x2c5551,pants:0x2f5a74,pantsDark:0x24465a,shoes:0x2d3b3c,seed:37,rags:true};

function zombieHead(l:ZombieLook):Painter{
  const skin=skinOf(l.skin,l.seed);
  return(face,x,y)=>{
    const d=faceDetail(face,x,y,l.face);if(d!==undefined)return d;
    let c=skin(x+faceSeed(face),y);
    if(l.wrap!==undefined&&(face!=='front'||y<2)&&(y===1||y===2||face==='top'&&(x+y)%3===0))c=grain(l.wrap,x,y,l.seed+faceSeed(face),.07);
    if(face==='top')return shade(c,.94);
    if(face==='bottom')return shade(c,.78);
    if(face==='back'&&y>=6)return shade(c,.9);
    return c;
  };
}
function zombieBody(l:ZombieLook):Painter{
  const skin=skinOf(l.skin,l.seed+3);
  return(face,x,y,w,h)=>{
    const s=faceSeed(face)+l.seed;
    if(face==='top')return x>=w/2-2&&x<w/2+2&&y>=1&&y<h-1?skin(x,y):grain(l.shirt,x,y,s);
    if(face==='bottom')return grain(l.pantsDark,x,y,s);
    // Torn hem: a jagged edge of skin above the waist.
    const tear=h-1-Math.floor(hash(x,0,s)*3);
    if(y>=tear)return skin(x+s,y);
    if(l.rags&&hash(x,y,s+5)<.14)return skin(x+s,y);
    const edge=face==='front'||face==='back'?(x===0||x===w-1):false;
    return grain(edge||y===0?l.shirtDark:l.shirt,x,y,s,.07);
  };
}
function zombieArm(l:ZombieLook):Painter{
  const skin=skinOf(l.skin,l.seed+5);
  return(face,x,y,w,h)=>{
    const s=faceSeed(face)+l.seed+17;
    if(face==='top')return grain(l.shirt,x,y,s);
    if(face==='bottom')return shade(skin(x,y),.85);
    const sleeve=3+Math.floor(hash(x,1,s)*2);
    if(y<sleeve&&!(l.rags&&hash(x,y,s)<.25))return grain(y===sleeve-1?l.shirtDark:l.shirt,x,y,s);
    if(l.wrap!==undefined&&(y===6||y===7||y===10))return grain(l.wrap,x,y,s,.07);
    return y===h-1?shade(skin(x,y),.9):skin(x,y);
  };
}
function zombieLeg(l:ZombieLook):Painter{
  return(face,x,y,w,h)=>{
    const s=faceSeed(face)+l.seed+29;
    if(face==='top')return grain(l.pants,x,y,s);
    if(face==='bottom')return grain(l.shoes,x,y,s,.05);
    if(y>=h-2)return grain(y===h-1?shade(l.shoes,.85):l.shoes,x,y,s,.05);
    const seam=(face==='east'||face==='west')&&x===1;
    return grain(seam||y===h-3?l.pantsDark:l.pants,x,y,s,.07);
  };
}
/** Drowned outer layer: kelp strands and tatters, mostly clear. */
function kelp(seed:number,density:number):Painter{
  return(face,x,y)=>{
    const s=seed+faceSeed(face),strand=hash(x,0,s)<density;
    if(face==='top'||face==='bottom')return hash(x,y,s)<density*.6?grain(0x3f7d37,x,y,s):CLEAR;
    if(strand&&y<4+Math.floor(hash(x,1,s)*8))return grain(hash(x,y,s+1)<.5?0x3f7d37:0x5a9a49,x,y,s,.1);
    return CLEAR;
  };
}

// Skeletons ----------------------------------------------------------------------------------------------
interface BoneLook{bone:number;shade:number;dark:number;hole:number;seed:number}
const SKELETON_BONE:BoneLook={bone:0xd3d3ca,shade:0xa7a79e,dark:0x77776f,hole:0x1b1b19,seed:41};
const STRAY_BONE:BoneLook={bone:0xc3d2d4,shade:0x9aaeb2,dark:0x6c8084,hole:0x162024,seed:53};
const SKULL=['........','........','........','.hh..hh.','.hh..hh.','...nn...','.tgtgtg.','..jjjj..'];
function skull(l:BoneLook):Painter{
  const map=pixelMap(SKULL,{h:l.hole,n:l.dark,t:l.bone,g:l.dark,j:l.shade});
  return(face,x,y)=>{
    const d=faceDetail(face,x,y,map);if(d!==undefined)return d;
    const s=l.seed+faceSeed(face),n=hash(x,y,s);
    if(face==='bottom')return l.shade;
    return n<.08?l.shade:n>.96?l.dark:grain(l.bone,x,y,s,.04);
  };
}
function ribcage(l:BoneLook):Painter{
  return(face,x,y,w,h)=>{
    const s=l.seed+faceSeed(face)+3;
    if(face==='top'||face==='bottom')return x>=w/2-1&&x<=w/2&&y>0&&y<h-1?l.hole:grain(l.shade,x,y,s,.04);
    if(face==='front'||face==='back'){
      const spine=x===w/2-1||x===w/2;
      if(y>=h-3)return y===h-2&&!spine&&x>0&&x<w-1?grain(l.bone,x,y,s,.04):spine?l.shade:y===h-1?l.dark:l.hole;
      if(spine)return grain(face==='back'?l.bone:l.shade,x,y,s,.04);
      return y%2===1&&y<h-3?grain(l.bone,x,y,s,.04):x===0||x===w-1?l.dark:l.hole;
    }
    return y%2===1&&y<h-3?l.bone:y>=h-3&&y===h-2?l.bone:l.dark;
  };
}
function boneLimb(l:BoneLook):Painter{
  return(face,x,y,w,h)=>{
    const s=l.seed+faceSeed(face)+7;
    if(face==='top'||face==='bottom')return l.shade;
    const joint=y===0||y===h-1||y===Math.floor(h/2)||y===Math.floor(h/2)-1;
    return joint?grain(l.bone,x,y,s,.03):grain(mix(l.bone,l.shade,.45),x,y,s,.06);
  };
}
/** Stray clothing: a hooded, frayed cloak (clear holes and hems). */
const CLOAK=0x56707a,CLOAK_DARK=0x445a63;
function cloakHood():Painter{
  return(face,x,y)=>{
    const s=61+faceSeed(face);
    if(face==='front')return(x===0||x===7||y<2)&&hash(x,y,s)>.1?grain(CLOAK_DARK,x,y,s):CLEAR;
    if(face==='bottom')return CLEAR;
    if(hash(x,y,s)<.08)return CLEAR;
    return grain(y>5&&face!=='top'?CLOAK_DARK:CLOAK,x,y,s);
  };
}
function cloak(hemRows:number,startRow=0):Painter{
  return(face,x,y,w,h)=>{
    const s=67+faceSeed(face);
    if(face==='top'||face==='bottom')return face==='top'&&startRow===0?grain(CLOAK,x,y,s):CLEAR;
    if(y<startRow)return CLEAR;
    const hem=h-hemRows+Math.floor(hash(x,2,s)*hemRows);
    if(y>=hem||hash(x,y,s)<.1)return CLEAR;
    return grain((x+y)%5===0?CLOAK_DARK:CLOAK,x,y,s);
  };
}
const BOW_WOOD=0x7b5631,BOW_DARK=0x55391f,BOW_STRING=0xd9d9d2;
const bowWood:Painter=(face,x,y)=>grain((x+y)%3===0?BOW_DARK:BOW_WOOD,x,y,71+faceSeed(face),.06);
const bowString:Painter=(face,x,y)=>grain(BOW_STRING,x,y,73,.04);

// Creeper -------------------------------------------------------------------------------------------------
const CREEPER_GREENS=[0x56b347,0x479a3a,0x6cc95a,0x3a822f,0x8bdc77,0x2c6a24] as const;
const CREEPER_FACE=pixelMap([
  '........',
  '........',
  '.ee..ee.',
  '.ek..ke.',
  '...mm...',
  '...mm...',
  '..m..m..',
  '.mm..mm.'],{e:0x101010,k:0x262f22,m:0x141414});
/** Blotchy camouflage: 2×2 cells of the palette with single-texel speckle. */
function camo(seed:number):Painter{
  return(face,x,y)=>{
    const s=seed+faceSeed(face),cell=hash(x>>1,y>>1,s);
    const c=CREEPER_GREENS[Math.floor(cell*cell*CREEPER_GREENS.length)];
    return hash(x,y,s+1)<.15?speckle(CREEPER_GREENS,x,y,s+2):c;
  };
}
function creeperHead():Painter{
  const skin=camo(83);
  return(face,x,y,w,h)=>{const d=faceDetail(face,x,y,CREEPER_FACE);return d!==undefined?d:skin(face,x,y,w,h);};
}
function creeperFoot():Painter{
  const skin=camo(97);
  return(face,x,y,w,h)=>face==='bottom'?0x2a5a22:y>=h-1?shade(skin(face,x,y,w,h),.8):skin(face,x,y,w,h);
}
/** Charged aura: diagonal light-blue bands, clear between them. */
const aura:Painter=(face,x,y)=>{
  const band=((x+y+faceSeed(face))%6+6)%6;
  return band<2?(band===0?0x9be3ff:0x62bdf5):CLEAR;
};

// Spider ---------------------------------------------------------------------------------------------------
const SPIDER_FUR=[0x3a2f2a,0x2b231f,0x4b3e36,0x3a2f2a,0x5e4f44] as const;
const fur=(seed:number):Painter=>(face,x,y)=>speckle(SPIDER_FUR,x,y,seed+faceSeed(face));
function spiderHead():Painter{
  const f=fur(101);
  return(face,x,y,w,h)=>{
    if(face==='front'&&y>=6&&(x===2||x===5))return 0x6b5a4c;// fangs
    if(face==='front'&&y>=2&&y<=4)return 0x1e1815;
    return f(face,x,y,w,h);
  };
}
function spiderAbdomen():Painter{
  const f=fur(107);
  return(face,x,y,w,h)=>{
    if(face==='top'){const cx=Math.abs(x-(w-1)/2),row=y%4;if(row===1&&cx<w/2-1-Math.floor(y/4)||row===2&&cx<1.5)return 0x6a5747;}
    return f(face,x,y,w,h);
  };
}
function spiderLeg():Painter{
  const f=fur(113);
  return(face,x,y,w,h)=>(x===5||x===6||x===11)&&face!=='top'?0x56473d:x===w-1?0x1e1815:f(face,x,y,w,h);
}
const SPIDER_EYES=pixelMap([
  '........',
  '........',
  '.e....e.',
  '..EE.EE.',
  '.e.ee.e.',
  '........',
  '........',
  '........'],{e:0xb81b14,E:0xf0331f});
const spiderEyes:Painter=(face,x,y)=>face==='front'?SPIDER_EYES[`${x},${y}`]??CLEAR:CLEAR;

// Arrow ----------------------------------------------------------------------------------------------------
const arrowShaft:Painter=(face,x,y)=>grain((x+y)%4===0?0x6e5432:0x8c6c42,x,y,127+faceSeed(face),.05);
const arrowHead:Painter=(face,x,y)=>grain((x+y)%2?0x5c5c63:0x8e8e96,x,y,131,.06);
const arrowFletch:Painter=(face,x,y,w,h)=>grain(y===0||x===0?0xb9b9b4:0xefefe9,x,y,137+faceSeed(face),.03);

// ---- Geometry ------------------------------------------------------------------------------------------
const box=(from:V3,size:V3,paint:Painter,extra:Partial<BoxDef>={}):BoxDef=>({from,size,paint,...extra});
interface HumanoidSpec{head:Painter;body:Painter;arm:Painter;leg:Painter;thin?:boolean;
  hat?:Painter;jacket?:Painter;sleeve?:Painter;pants?:Painter;overlay?:number;
  baby?:boolean;bow?:boolean;width:number}
function humanoid(spec:HumanoidSpec){
  const limb:V3=spec.thin?[2,12,2]:[4,12,4],o=spec.overlay??.25;
  const armFrom=(right:boolean):V3=>spec.thin?[-1,-10,-1]:right?[-1,-10,-2]:[-3,-10,-2];
  const legFrom:V3=spec.thin?[-1,-12,-1]:[-2,-12,-2];
  const legX=spec.thin?2:1.9;
  const withOverlay=(base:BoxDef,paint:Painter|undefined,key:string,inflate:number):BoxDef[]=>
    paint?[base,box(base.from,base.size,paint,{inflate,key,mirror:base.mirror})]:[base];
  const parts:PartDef[]=[
    {name:'head',pivot:[0,24,0],boxes:withOverlay(box([-4,0,-4],[8,8,8],spec.head),spec.hat,'hat',.5)},
    {name:'body',pivot:[0,12,0],boxes:withOverlay(box([-4,0,-2],[8,12,4],spec.body),spec.jacket,'jacket',o)},
    {name:'right_arm',pivot:[5,22,0],boxes:withOverlay(box(armFrom(true),limb,spec.arm,{key:'arm'}),spec.sleeve,'sleeve',o),
      children:spec.bow?[{name:'bow',pivot:[0,-9,0],boxes:[
        box([-.5,-2.5,-3],[1,1,6],bowWood,{key:'bow_grip'}),box([-.5,-1.5,-6],[1,1,3],bowWood,{key:'bow_limb'}),
        box([-.5,-1.5,3],[1,1,3],bowWood,{key:'bow_limb'}),box([-.5,-.5,-7],[1,1,14],bowString)]}]:undefined},
    {name:'left_arm',pivot:[-5,22,0],boxes:withOverlay(box(armFrom(false),limb,spec.arm,{key:'arm',mirror:true}),spec.sleeve,'sleeve',o)},
    {name:'right_leg',pivot:[legX,12,0],boxes:withOverlay(box(legFrom,limb,spec.leg,{key:'leg'}),spec.pants,'pants',o)},
    {name:'left_leg',pivot:[-legX,12,0],boxes:withOverlay(box(legFrom,limb,spec.leg,{key:'leg',mirror:true}),spec.pants,'pants',o)}
  ];
  if(spec.baby)parts.push({name:'baby_head',pivot:[0,24,0],boxes:withOverlay(box([-6,0,-6],[12,12,12],upscale(spec.head,8,8,8)),
    spec.hat?upscale(spec.hat,8,8,8):undefined,'baby_hat',.75)});
  return buildTexture(parts,spec.width);
}

/** Vanilla HumanoidModel walk: legs swing 1.4 rad, arms counter-swing; head yaw and pitch. */
function poseHumanoid(pose:Record<string,PartPose>,state:AnimationState,baby:boolean,babyHead:boolean){
  const c=Math.cos(state.limbSwing),amt=state.limbAmount;
  setPose(pose,'head',clampPitch(state.headPitch),clampYaw(state.headYaw),0,!baby);
  setPose(pose,'body',0,0,0);
  setPose(pose,'right_leg',c*1.4*amt,0,0);setPose(pose,'left_leg',-c*1.4*amt,0,0);
  setPose(pose,'right_arm',-c*amt,0,0);setPose(pose,'left_arm',c*amt,0,0);
  if(babyHead)setPose(pose,'baby_head',clampPitch(state.headPitch),clampYaw(state.headYaw),0,baby);
}
/** Idle arm bob (vanilla AnimationUtils.bobArms). */
function bobArms(pose:Record<string,PartPose>,t:number){
  const z=Math.cos(t*.09)*.05+.05,x=Math.sin(t*.067)*.05;
  pose.right_arm.z+=z;pose.left_arm.z-=z;pose.right_arm.x-=x;pose.left_arm.x+=x;
}
/** Zombie arms (vanilla animateZombieArms): held forward, higher while chasing, swinging down on an attack. */
function zombieArms(pose:Record<string,PartPose>,aggressive:boolean,attack:number,t:number){
  const f=Math.sin(attack*Math.PI),f1=Math.sin((1-(1-attack)*(1-attack))*Math.PI);
  const x=Math.PI/(aggressive?1.5:2.25)-f*1.2+f1*.4;
  setPose(pose,'right_arm',x,.1-f*.6,0);setPose(pose,'left_arm',x,-.1+f*.6,0);
  bobArms(pose,t);
}
/** Conversion shiver: a fast sideways jitter of every part (vanilla isShaking). */
function shiver(pose:Record<string,PartPose>,names:readonly string[],t:number){
  const dx=Math.cos(t*3.25)*.35;
  for(const n of names){const p=pose[n];if(p)p.px=(p.px??0)+dx;}
}
const HUMANOID_PARTS=['head','body','right_arm','left_arm','right_leg','left_leg','baby_head'] as const;

function zombieModel(look:ZombieLook,options:{scale?:number;overlay?:boolean}={}):EntityModel{
  const t=humanoid({head:zombieHead(look),body:zombieBody(look),arm:zombieArm(look),leg:zombieLeg(look),baby:true,width:64,
    hat:options.overlay?kelp(look.seed+1,.35):undefined,jacket:options.overlay?kelp(look.seed+2,.3):undefined,
    sleeve:options.overlay?kelp(look.seed+3,.3):undefined,pants:options.overlay?kelp(look.seed+4,.2):undefined});
  return{textureWidth:t.width,textureHeight:t.height,paint:t.paint,parts:t.parts,scale:options.scale,
    animate(e,pose,state){
      const time=ticks(state);
      poseHumanoid(pose,state,e.baby,true);
      zombieArms(pose,e.data.aggressive===true,swingProgress(e,state.partial),time);
      if(typeof e.data.converting==='number'&&!state.reducedMotion)shiver(pose,HUMANOID_PARTS,time);
    }};
}
export const zombieModels={
  zombie:()=>zombieModel(ZOMBIE_LOOK),
  husk:()=>zombieModel(HUSK_LOOK,{scale:1.0625}),
  drowned:()=>zombieModel(DROWNED_LOOK,{overlay:true})
};

function skeletonModel(look:BoneLook,stray:boolean):EntityModel{
  const t=humanoid({head:skull(look),body:ribcage(look),arm:boneLimb(look),leg:boneLimb(look),thin:true,bow:true,width:64,
    hat:stray?cloakHood():undefined,jacket:stray?cloak(3):undefined,sleeve:stray?cloak(4):undefined,pants:stray?cloak(3,2):undefined,overlay:.25});
  return{textureWidth:t.width,textureHeight:t.height,paint:t.paint,parts:t.parts,
    animate(e,pose,state){
      poseHumanoid(pose,state,false,false);
      if(e.data.aggressive===true){
        // Vanilla BOW_AND_ARROW pose: both arms aimed along the head's pitch, the left one across the body.
        const pitch=clampPitch(state.headPitch),yaw=clampYaw(state.headYaw);
        setPose(pose,'right_arm',Math.PI/2+pitch,.1+yaw,0);setPose(pose,'left_arm',Math.PI/2+pitch,-.5+yaw,0);
        // Drawing: the string hand pulls back.
        const draw=typeof e.data.draw==='number'?Math.min(1,(e.data.draw+state.partial)/20):0;
        pose.left_arm.pz=draw*2;
      }else{
        const f=swingProgress(e,state.partial);
        if(f>0){pose.right_arm.x+=Math.sin(f*Math.PI)*1.2;}
        bobArms(pose,ticks(state));
      }
    }};
}
export const skeletonModels={skeleton:()=>skeletonModel(SKELETON_BONE,false),stray:()=>skeletonModel(STRAY_BONE,true)};

/** Creeper swelling (vanilla CreeperRenderer): flashes white on alternate tenths and swells up to 1.4× wide, 1.1× tall
 *  (one uniform scale here: their volume mean). `swell` 0..30 ticks. */
export function creeperLook(swell:number,out:{flash:number;scale:number}):{flash:number;scale:number}{
  const f=Math.max(0,Math.min(1,swell/28));
  const g=f*f*f*f,wobble=1+Math.sin(f*100)*f*.01;
  const wide=(1+g*.4)*wobble,tall=(1+g*.1)/wobble;
  out.scale=Math.cbrt(wide*wide*tall);
  out.flash=Math.floor(f*10)%2===0?0:Math.max(.5,Math.min(1,f));
  return out;
}
export function creeperModel():EntityModel{
  const head=creeperHead(),body=camo(89),foot=creeperFoot();
  const legs:[string,number,number][]=[['leg_front_right',2,-4],['leg_front_left',-2,-4],['leg_back_right',2,4],['leg_back_left',-2,4]];
  const parts:PartDef[]=[
    {name:'head',pivot:[0,18,0],boxes:[box([-4,0,-4],[8,8,8],head)],children:[{name:'aura_head',pivot:[0,0,0],emissive:true,boxes:[box([-4,0,-4],[8,8,8],aura,{inflate:2,key:'aura_head'})]}]},
    {name:'body',pivot:[0,6,0],boxes:[box([-4,0,-2],[8,12,4],body)],children:[{name:'aura_body',pivot:[0,0,0],emissive:true,boxes:[box([-4,0,-2],[8,12,4],aura,{inflate:2})]}]},
    ...legs.map(([name,x,z]):PartDef=>({name,pivot:[x,6,z],boxes:[box([-2,-6,-2],[4,6,4],foot,{key:'creeper_leg',mirror:x<0})],
      children:[{name:`aura_${name}`,pivot:[0,0,0],emissive:true,boxes:[box([-2,-6,-2],[4,6,4],aura,{inflate:2,key:'aura_leg'})]}]}))
  ];
  const t=buildTexture(parts,64),look={flash:0,scale:1};
  return{textureWidth:t.width,textureHeight:t.height,paint:t.paint,parts:t.parts,
    animate(e,pose,state){
      const c=Math.cos(state.limbSwing)*1.4*state.limbAmount,charged=e.data.charged===true;
      setPose(pose,'head',clampPitch(state.headPitch),clampYaw(state.headYaw),0);
      setPose(pose,'body',0,0,0);
      setPose(pose,'leg_back_right',c,0,0);setPose(pose,'leg_back_left',-c,0,0);
      setPose(pose,'leg_front_right',-c,0,0);setPose(pose,'leg_front_left',c,0,0);
      const drift=state.reducedMotion?0:Math.sin(state.time*2.4)*.35;
      for(const n of ['aura_head','aura_body','aura_leg_front_right','aura_leg_front_left','aura_leg_back_right','aura_leg_back_left']){
        const p=setPose(pose,n,0,0,0,charged);p.px=drift;p.pz=-drift;
      }
    },
    appearance(e){
      const s=typeof e.data.swell==='number'?e.data.swell:0;
      if(s<=0){look.flash=0;look.scale=1;return look;}
      return creeperLook(s,look);
    }};
}

export function spiderModel():EntityModel{
  const leg=spiderLeg();
  // Legs: [name, pivot z, rest y angle]; right legs reach +x, left legs -x (vanilla SpiderModel rest pose).
  const quarter=Math.PI/4,eighth=Math.PI/8,mid=.58119464;
  const legSpec:[string,number,number,number][]=[
    ['leg_right_hind',2,-quarter,-quarter],['leg_right_mid_hind',1,-eighth,-mid],['leg_right_mid_front',0,eighth,-mid],['leg_right_front',-1,quarter,-quarter]];
  const parts:PartDef[]=[
    {name:'head',pivot:[0,9,-3],boxes:[box([-4,-4,-8],[8,8,8],spiderHead())],
      children:[{name:'eyes',pivot:[0,0,0],emissive:true,boxes:[box([-4,-4,-8],[8,8,8],spiderEyes,{inflate:.05})]}]},
    {name:'neck',pivot:[0,9,0],boxes:[box([-3,-3,-3],[6,6,6],fur(103))]},
    {name:'abdomen',pivot:[0,9,9],boxes:[box([-5,-4,-6],[10,8,12],spiderAbdomen())]}
  ];
  for(const [name,z,y,zr] of legSpec){
    parts.push({name,pivot:[4,9,z],rotation:[0,y,zr],boxes:[box([-1,-1,-1],[16,2,2],leg,{key:'spider_leg'})]});
    parts.push({name:name.replace('right','left'),pivot:[-4,9,z],rotation:[0,-y,-zr],boxes:[box([-15,-1,-1],[16,2,2],leg,{key:'spider_leg',mirror:true})]});
  }
  const t=buildTexture(parts,64);
  const phases=[0,Math.PI,Math.PI/2,Math.PI*1.5];
  return{textureWidth:t.width,textureHeight:t.height,paint:t.paint,parts:t.parts,
    animate(e,pose,state){
      setPose(pose,'head',clampPitch(state.headPitch),clampYaw(state.headYaw),0);
      const s=state.limbSwing,a=state.limbAmount;
      legSpec.forEach(([name],i)=>{
        const swing=-Math.cos(s*2+phases[i])*.4*a,lift=Math.abs(Math.sin(s+phases[i])*.4)*a;
        setPose(pose,name,0,swing,lift);setPose(pose,name.replace('right','left'),0,-swing,-lift);
      });
    }};
}

export function arrowModel():EntityModel{
  const parts:PartDef[]=[{name:'arrow',pivot:[0,0,0],boxes:[
    box([-.5,-.5,-8],[1,1,16],arrowShaft),box([-1,-1,-9],[2,2,2],arrowHead),
    box([-1.5,-.5,4],[3,1,4],arrowFletch,{key:'fletch'}),box([-.5,-1.5,4],[1,3,4],arrowFletch)]}];
  const t=buildTexture(parts,32);
  return{textureWidth:t.width,textureHeight:t.height,paint:t.paint,parts:t.parts,scale:.9,
    animate(e,pose,state){
      // The body yaw follows the flight; pitch tilts the shaft. A stuck arrow quivers for a moment (shake).
      const shake=typeof e.data.shake==='number'&&e.data.shake>0&&!state.reducedMotion?-Math.sin((e.data.shake-state.partial)*3)*(e.data.shake-state.partial)*.012:0;
      setPose(pose,'arrow',state.headPitch+shake,0,0);
    }};
}
