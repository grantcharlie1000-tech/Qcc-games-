// Box models of the hostile mobs and the arrow, drawn in code to look like the vanilla Java mobs: the Java model geometry
// (HumanoidModel/ZombieModel, DrownedModel, SkeletonModel, CreeperModel, SpiderModel), the vanilla texture sizes and UV
// layouts (zombie and husk 64×64; drowned 64×64 with its outer layer below; skeleton 64×32, the stray's clothing layer
// below it; creeper 64×32 with the charged armour below; spider 64×32 with its eyes below), and procedural pixel art in the
// vanilla palettes (entity/hostile-art.ts). Nothing is copied from Mojang's files. Extra rows below the vanilla layouts hold
// what this renderer needs on top: the 1.5× baby zombie heads and the skeleton's bow sprite.
//
// Model space: pixels, +y up, the mob faces -z; a positive x angle swings a limb forward and lifts a head, a positive y
// angle turns left. Animations follow the vanilla model rigs: humanoid walk with zombie arms held out (raised higher while
// chasing) and swinging on attack, skeleton bow aim, creeper four-leg walk with the swell flash and the charged aura,
// spider eight-leg gait, and baby zombies with a 1.5× head on the half-size body.
import type {AnimationState,Entity,EntityModel,PartPose} from '../engine/contracts';
import {CLEAR,blob,buildTexture,faceSeed,grain,hash,jfrom,jpivot,jrot,mix,pixelMap,shade,upscale,weighted,
  type BoxDef,type Face,type PartDef,type Painter,type V3} from './hostile-art';

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

// ---- Geometry ------------------------------------------------------------------------------------------
/** A Java `texOffs(u, v).addBox(x, y, z, w, h, d)` painted by `paint`. */
function jbox(x:number,y:number,z:number,w:number,h:number,d:number,u:number,v:number,paint:Painter,extra:Partial<BoxDef>={}):BoxDef{
  return{from:jfrom(x,y,z,w,h),size:[w,h,d],uv:[u,v],paint,...extra};
}
const sideOf=(face:Face)=>face==='west'||face==='east';

// ---- Shared painters ---------------------------------------------------------------------------------
interface Tones{base:number;dark:number;light:number}
/** Mottled skin: a palette by weights with soft darker blotches. */
function mottle(palette:readonly number[],weights:readonly number[],seed:number,blotch:number,blotchAt=.7):Painter{
  return(face,x,y)=>{
    const s=seed+faceSeed(face),c=weighted(palette,weights,x,y,s);
    return blob(x+faceSeed(face),y,2.5,s)>blotchAt?mix(c,blotch,.45):c;
  };
}
/** Cloth: a base tone with a faint weave, darker seams at the edges of the front and back. */
function cloth(t:Tones,seed:number):Painter{
  return(face,x,y,w)=>{
    const s=seed+faceSeed(face),n=hash(x,y,s);
    const edge=(face==='front'||face==='back')&&(x===0||x===w-1);
    return edge?grain(t.dark,x,y,s,.05):n<.12?t.dark:n>.9?t.light:grain(t.base,x,y,s,.04);
  };
}

// ---- Zombie family -------------------------------------------------------------------------------------
interface ZombieLook{
  skin:readonly number[];skinW:readonly number[];blotch:number;
  /** Face details over the skin (front of the head, 8×8). */
  face:(x:number,y:number)=>number|undefined;
  shirt:Tones;pants:Tones;shoe:number;seed:number;
  /** Shirt and trousers torn into rags (drowned). */
  rags?:boolean;
  /** Glowing eye colour drawn on an emissive layer (drowned). */
  glow?:number;
}
const ZOMBIE_LOOK:ZombieLook={
  skin:[0x5a8b45,0x52813f,0x63954d,0x47753a,0x70a35a],skinW:[10,4,3,1,1],blotch:0x416d36,
  face:pixelMap(['........','........','........','.dd..dd.','.kk..kk.','...nn...','..mmmm..','........'],
    {d:0x3e6634,k:0x0e110d,n:0x416b36,m:0x2a4024}),
  shirt:{base:0x2c9b9e,dark:0x1f7c80,light:0x3cb0b2},pants:{base:0x40419a,dark:0x32337c,light:0x4c4fac},shoe:0x45455e,seed:11};
const HUSK_LOOK:ZombieLook={
  skin:[0xab9a71,0xa08f67,0xb5a57d,0x8f7f5a,0xc2b28b],skinW:[10,4,3,1,1],blotch:0x8a7a56,
  face:pixelMap(['........','........','........','.dd..dd.','.kk..kk.','...nn...','..mmmm..','..mmmm..'],
    {d:0x6d5d3f,k:0x16120c,n:0x7a6a4a,m:0x3b2f1e}),
  shirt:{base:0x7e6e4e,dark:0x6a5b3f,light:0x8d7d5b},pants:{base:0x5f5139,dark:0x4d412d,light:0x6c5d43},shoe:0x3a3022,seed:23};
const DROWNED_GLOW=0x8ff7ef;
const DROWNED_LOOK:ZombieLook={
  skin:[0x4f9e8a,0x46907d,0x58ab96,0x3d7f6d,0x67b9a3],skinW:[10,4,3,1,1],blotch:0x3a7766,
  face:pixelMap(['........','........','........','.dd..dd.','.ee..ee.','...nn...','..mmmm..','........'],
    {d:0x356e69,e:DROWNED_GLOW,n:0x3c7c75,m:0x23504c}),
  shirt:{base:0x4aa9bb,dark:0x3a8d9e,light:0x5fbccc},pants:{base:0x4b4e93,dark:0x3c3e78,light:0x5a5ea6},shoe:0x34365c,seed:37,
  rags:true,glow:DROWNED_GLOW};

function zombieSkin(l:ZombieLook,salt:number):Painter{return mottle(l.skin,l.skinW,l.seed+salt,l.blotch);}
function zombieHead(l:ZombieLook):Painter{
  const skin=zombieSkin(l,0);
  return(face,x,y,w,h)=>{
    if(face==='front'){const d=l.face(x,y);if(d!==undefined)return d;}
    const c=skin(face,x,y,w,h);
    return face==='bottom'?shade(c,.85):face==='top'?shade(c,.96):c;
  };
}
/** The torso: shirt with a neck opening and a ragged hem (the drowned's shirt is all holes). */
function zombieBody(l:ZombieLook):Painter{
  const skin=zombieSkin(l,3),shirt=cloth(l.shirt,l.seed+5);
  return(face,x,y,w,h)=>{
    const s=l.seed+faceSeed(face);
    if(face==='bottom')return grain(l.pants.dark,x,y,s,.05);
    if(face==='top')return x>=w/2-1&&x<=w/2&&y>=1&&y<=2?skin(face,x,y,w,h):shirt(face,x,y,w,h);
    if(face==='front'&&y===0&&x>=w/2-1&&x<=w/2)return skin(face,x,y,w,h);
    const hem=h-1-(hash(x,3,s)<.35?1:0);
    if(y>=hem)return hash(x,y,s+2)<.5?skin(face,x,y,w,h):grain(l.shirt.dark,x,y,s,.05);
    if(l.rags&&(blob(x+faceSeed(face),y,2,s+9)>.62||hash(x,y,s+4)<.08))return skin(face,x,y,w,h);
    return shirt(face,x,y,w,h);
  };
}
/** Arms: a short sleeve over bare skin. */
function zombieArm(l:ZombieLook):Painter{
  const skin=zombieSkin(l,5),sleeve=cloth(l.shirt,l.seed+7);
  return(face,x,y,w,h)=>{
    const s=l.seed+faceSeed(face)+17;
    if(face==='top')return sleeve(face,x,y,w,h);
    if(face==='bottom')return shade(skin(face,x,y,w,h),.85);
    const end=l.rags?2+Math.floor(hash(x,1,s)*3):4;
    if(y<end)return y===end-1?grain(l.shirt.dark,x,y,s,.05):sleeve(face,x,y,w,h);
    return y===h-1?shade(skin(face,x,y,w,h),.9):skin(face,x,y,w,h);
  };
}
/** Legs: trousers down to dark shoes (the drowned's trousers end in rags above the shins). */
function zombieLeg(l:ZombieLook):Painter{
  const pants=cloth(l.pants,l.seed+29),skin=zombieSkin(l,9);
  return(face,x,y,w,h)=>{
    const s=l.seed+faceSeed(face)+29;
    if(face==='top')return grain(l.pants.base,x,y,s,.04);
    if(face==='bottom')return grain(l.shoe,x,y,s,.05);
    if(l.rags){
      const hem=h-4+Math.floor(hash(x,5,s)*3);
      if(y>=hem)return y===h-1?shade(skin(face,x,y,w,h),.85):skin(face,x,y,w,h);
      if(hash(x,y,s+3)<.06)return skin(face,x,y,w,h);
    }else if(y===h-1)return grain(l.shoe,x,y,s,.05);
    const seam=sideOf(face)&&x===1;
    return seam?grain(l.pants.dark,x,y,s,.04):pants(face,x,y,w,h);
  };
}
/** Emissive eye layer: the glowing eyes only, everything else clear. */
function eyeLayer(map:(x:number,y:number)=>number|undefined,only:number):Painter{
  return(face,x,y)=>{if(face!=='front')return CLEAR;const c=map(x,y);return c===only?c:CLEAR;};
}
/** Drowned outer layer: strands of kelp hanging from the top edge, mostly clear. */
function kelp(seed:number,density:number):Painter{
  const KELP=[0x2d6e2a,0x3e8c35,0x56a447,0x24581f] as const;
  return(face,x,y,_w,h)=>{
    const s=seed+faceSeed(face);
    if(face==='top')return hash(x,y,s)<density*.7?KELP[Math.floor(hash(x,y,s+1)*3)]:CLEAR;
    if(face==='bottom')return CLEAR;
    const strand=hash(x,0,s)<density,length=2+Math.floor(hash(x,1,s)*(h-2));
    if(strand&&y<length)return y===length-1?KELP[3]:KELP[Math.floor(hash(x,y,s+2)*3)];
    return CLEAR;
  };
}

// ---- Skeletons ----------------------------------------------------------------------------------------------
interface BoneLook{bone:number;shade:number;light:number;dark:number;hole:number;seed:number}
const SKELETON_BONE:BoneLook={bone:0xbcbcbc,shade:0xa3a3a3,light:0xd6d6d6,dark:0x828282,hole:0x262626,seed:41};
const STRAY_BONE:BoneLook={bone:0xb6c3c4,shade:0x9babad,light:0xcfdadb,dark:0x7a8b8e,hole:0x1f2b2e,seed:53};
const SKULL=['........','........','........','.hh..hh.','.hh..hh.','...nn...','.tdtdtd.','........'];
function bone(l:BoneLook,salt:number):Painter{
  return(face,x,y)=>{const s=l.seed+salt+faceSeed(face),n=hash(x,y,s);return n<.1?l.shade:n>.95?l.light:grain(l.bone,x,y,s,.025);};
}
function skull(l:BoneLook):Painter{
  const map=pixelMap(SKULL,{h:l.hole,n:l.dark,t:l.light,d:l.hole}),b=bone(l,0);
  return(face,x,y,w,h)=>{
    if(face==='front'){const d=map(x,y);if(d!==undefined)return d;}
    if(face==='bottom')return l.shade;
    return b(face,x,y,w,h);
  };
}
/** The ribcage (8×12×4): collarbone, ribs and spine over dark gaps, the pelvis below. */
const RIBS_FRONT=['BBBBBBBB','gggBBggg','BBBBBBBB','gggBBggg','BBBBBBBB','gggBBggg','gBBBBBBg','gggBBggg','gggBBggg','ggBBBBgg','gBBBBBBg','gBBggBBg'];
const RIBS_SIDE=['BBBB','gggB','BBBB','gggB','BBBB','gggB','BBBB','gggB','gggB','ggBB','gBBB','gBBg'];
function ribcage(l:BoneLook):Painter{
  const b=bone(l,3);
  return(face,x,y,w,h)=>{
    const s=l.seed+faceSeed(face)+3;
    let ch:string;
    if(face==='top')return x===0||x===w-1||y===0||y===h-1?b(face,x,y,w,h):l.hole;
    if(face==='bottom')return x>=2&&x<w-2?grain(l.shade,x,y,s,.04):l.hole;
    if(face==='front'||face==='back')ch=RIBS_FRONT[y][x];
    else ch=RIBS_SIDE[y][face==='west'?w-1-x:x];
    return ch==='B'?b(face,x,y,w,h):grain(l.hole,x,y,s,.1);
  };
}
/** Bones of the arms and legs (2×12×2): knobbly joints at the ends and the middle. */
function boneLimb(l:BoneLook):Painter{
  const b=bone(l,7);
  return(face,x,y,w,h)=>{
    if(face==='top'||face==='bottom')return l.shade;
    const joint=y===0||y===h-1||y===Math.floor(h/2)||y===Math.floor(h/2)-1;
    return joint?l.light:x===w-1?mix(b(face,x,y,w,h),l.dark,.35):b(face,x,y,w,h);
  };
}
/** Stray clothing (vanilla stray overlay: a humanoid layer 0.25 px out): a frosty blue-grey robe, hood and baggy sleeves
 *  with ragged hems and holes. */
const ROBE={base:0x6f8e96,dark:0x55727a,light:0x8daab0,frost:0xc8dcdf} as const;
function robe(seed:number,hemRows:number,start=0):Painter{
  return(face,x,y,w,h)=>{
    const s=seed+faceSeed(face),n=hash(x,y,s);
    if(face==='bottom')return CLEAR;
    if(face==='top')return start>0?CLEAR:n<.15?ROBE.dark:grain(ROBE.base,x,y,s,.04);
    if(y<start)return CLEAR;
    const hem=h-hemRows+Math.floor(hash(x,2,s)*(hemRows+1));
    if(y>=hem||n<.04)return CLEAR;
    // Vertical folds, a pale frosted hem and a few frost flecks.
    if(y>=hem-1||n>.96)return ROBE.frost;
    const fold=hash(x,7,s)<.3;
    return fold?grain(ROBE.dark,x,y,s,.04):n>.85?ROBE.light:grain(ROBE.base,x,y,s,.04);
  };
}
/** The hood: covers the top, back and sides of the skull, framing the face. */
function hood(seed:number,brim:boolean):Painter{
  const r=robe(seed,0);
  return(face,x,y,w,h)=>{
    if(face==='front')return brim&&(y===0||(x===0||x===w-1)&&y<5)?r(face,x,y,w,h):CLEAR;
    if(face==='bottom')return CLEAR;
    if(sideOf(face)&&y>=h-1-Math.floor(hash(x,9,seed)*2))return CLEAR;
    return r(face,x,y,w,h);
  };
}
/** Bow sprite (16×16) on a 1-px slab in the hand: the arc toward the front, the string toward the body. */
const BOW_SPRITE=[
  '................','................','..S..........S..','.WSSSSSSSSSSSSW.','.W............W.','..W..........W..','...W........W...',
  '....W......W....','.....WWGGWW.....','.......GG.......','................','................','................',
  '................','................','................'];
const BOW_PAL={W:0x7b5631,G:0x4e3420,S:0xdcdcd4} as const;
/** Paints the sprite on both broad faces of the slab (mirrored on the +x face so both line up) and its outline on the edges. */
function bowSlab():Painter{
  const at=(x:number,y:number)=>{const c=BOW_SPRITE[y]?.[x];return c===undefined||c==='.'?CLEAR:BOW_PAL[c as keyof typeof BOW_PAL];};
  return(face,x,y,w,h)=>{
    switch(face){
      case 'west':return at(x,y);
      case 'east':return at(w-1-x,y);
      // 1-px edges: the sprite's outermost texels along that edge.
      case 'top':return at(y,0);
      case 'bottom':return at(y,15);
      case 'front':return at(0,y);
      default:return at(15,y);
    }
  };
}

// ---- Creeper -------------------------------------------------------------------------------------------------
const CREEPER_GREENS=[0x4fae46,0x3e9437,0x67c75c,0x8bd87f,0x2f7a2a,0xb9e8b1,0x225e1f] as const,CREEPER_W=[6,4,4,2,2,1,1] as const;
const CREEPER_FACE=pixelMap(['........','........','.KK..KK.','.kK..Kk.','...KK...','..KKKK..','..KKKK..','..K..K..'],{K:0x0c0c0c,k:0x262626});
/** Mottled camouflage: speckled greens in soft light and dark patches. */
function camo(seed:number):Painter{
  return(face,x,y)=>{
    const s=seed+faceSeed(face),c=weighted(CREEPER_GREENS,CREEPER_W,x,y,s),b=blob(x+faceSeed(face),y,2.2,s+1);
    return b>.72?mix(c,CREEPER_GREENS[3],.35):b<.22?mix(c,CREEPER_GREENS[4],.4):c;
  };
}
function creeperHead():Painter{
  const skin=camo(83);
  return(face,x,y,w,h)=>{if(face==='front'){const d=CREEPER_FACE(x,y);if(d!==undefined)return d;}return skin(face,x,y,w,h);};
}
function creeperFoot():Painter{
  const skin=camo(97);
  return(face,x,y,w,h)=>face==='bottom'?0x2a5f25:y>=h-1?shade(skin(face,x,y,w,h),.82):skin(face,x,y,w,h);
}
/** Charged armour: soft diagonal bands of electric blue, clear between them. */
const aura:Painter=(face,x,y)=>{
  const band=((x+y+faceSeed(face))%8+8)%8;
  return band<2?(band===0?0x9fe0ff:0x58b4f0):CLEAR;
};

// ---- Spider ---------------------------------------------------------------------------------------------------
const SPIDER_FUR=[0x2c2522,0x221c1a,0x3a312d,0x4d423c,0x5d5048] as const,SPIDER_W=[6,4,3,2,1] as const;
const fur=(seed:number):Painter=>(face,x,y)=>weighted(SPIDER_FUR,SPIDER_W,x,y,seed+faceSeed(face));
/** Eyes on the head's front: two big ones and six small, in red (the base texture's are dark; the eye layer glows). */
const SPIDER_EYE_ROWS=['........','........','e..ee..e','.EE..EE.','.EF..FE.','...ee...','........','........'];
const SPIDER_EYES=pixelMap(SPIDER_EYE_ROWS,{e:0xd42a1c,E:0xff3b22,F:0xc51f12});
const SPIDER_EYES_DIM=pixelMap(SPIDER_EYE_ROWS,{e:0x5a1712,E:0x6e1a12,F:0x52120c});
function spiderHead():Painter{
  const f=fur(101);
  return(face,x,y,w,h)=>{
    if(face==='front'){
      const eye=SPIDER_EYES_DIM(x,y);if(eye!==undefined)return eye;
      if(y===7&&(x===2||x===5)||y===6&&(x===2||x===5))return y===7?0x9a8a7c:0x6d5f54;// fangs
    }
    return f(face,x,y,w,h);
  };
}
function spiderAbdomen():Painter{
  const f=fur(107);
  return(face,x,y,w,h)=>{
    // A paler marking down the back: a chevron pattern widening toward the rear.
    if(face==='top'){const cx=Math.abs(x-(w-1)/2),row=y%4;if(row===1&&cx<1+Math.floor(y/4)&&cx>=Math.floor(y/4)-1||row===2&&cx<1)return 0x5f4f43;}
    return f(face,x,y,w,h);
  };
}
function spiderLeg():Painter{
  const f=fur(113);
  return(face,x,y,w,h)=>{
    if(face==='top'||face==='bottom')return f(face,x,y,w,h);
    // Pale joint bands; the region's left column on the -x and +x faces is the tip of the leg (dark).
    const along=face==='east'||face==='front'?x:w-1-x;
    return along===5||along===11?0x5a4b41:f(face,x,y,w,h);
  };
}
const spiderEyes:Painter=(face,x,y)=>face==='front'?SPIDER_EYES(x,y)??CLEAR:CLEAR;

// Arrow ----------------------------------------------------------------------------------------------------
const arrowShaft:Painter=(face,x,y)=>grain((x+y)%4===0?0x6e5432:0x8c6c42,x,y,127+faceSeed(face),.05);
const arrowHead:Painter=(_face,x,y)=>grain((x+y)%2?0x5c5c63:0x8e8e96,x,y,131,.06);
const arrowFletch:Painter=(face,x,y)=>grain(y===0||x===0?0xb9b9b4:0xefefe9,x,y,137+faceSeed(face),.03);

// ---- Humanoids -----------------------------------------------------------------------------------------------
interface Layer{head?:Painter;hat?:Painter;body?:Painter;arm?:Painter;leftArm?:Painter;leg?:Painter;leftLeg?:Painter;
  /** Texture rows below the base layout where this layer's copy of the layout starts. */
  v:number;inflate:number}
interface HumanoidSpec{head:Painter;body:Painter;arm:Painter;leg:Painter;
  /** Drowned: own left arm (32, 48) and left leg (16, 48) like the player layout. */
  leftArm?:Painter;leftLeg?:Painter;
  /** Skeleton limbs: 2×12×2 bones. */
  thin?:boolean;
  /** Outer layers (drowned kelp, stray clothing; the stray's limbs are the humanoid 4×4 ones around the bones). */
  outer?:Layer;
  /** Rows of the 1.5× baby head (and its outer hat when there is an outer layer). */
  baby?:{v:number;outerV?:number};
  /** Row of the bow slab, held in the right hand. */
  bow?:number;
  /** Emissive eye layer on the head at this texture offset. */
  eyes?:{uv:[number,number];paint:Painter};
  width:number;height:number}
/** Vanilla HumanoidModel.createMesh geometry (DrownedModel and SkeletonModel variants). */
function humanoid(spec:HumanoidSpec){
  const thin=!!spec.thin,o=spec.outer,ov=o?.v??0;
  const overlay=(paint:Painter|undefined,make:(v:number,paint:Painter)=>BoxDef):BoxDef[]=>paint&&o?[make(ov,paint)]:[];
  const inf=o?.inflate??0;
  const headBoxes:BoxDef[]=[jbox(-4,-8,-4,8,8,8,0,0,spec.head),
    ...overlay(o?.head,(v,p)=>jbox(-4,-8,-4,8,8,8,0,v,p,{inflate:inf})),
    ...overlay(o?.hat,(v,p)=>jbox(-4,-8,-4,8,8,8,32,v,p,{inflate:inf+.5}))];
  const rightArm:BoxDef[]=[thin?jbox(-1,-2,-1,2,12,2,40,16,spec.arm):jbox(-3,-2,-2,4,12,4,40,16,spec.arm),
    ...overlay(o?.arm,(v,p)=>jbox(-3,-2,-2,4,12,4,40,16+v,p,{inflate:inf}))];
  const leftArm:BoxDef[]=[thin?jbox(-1,-2,-1,2,12,2,40,16,spec.arm,{mirror:true}):spec.leftArm?jbox(-1,-2,-2,4,12,4,32,48,spec.leftArm)
      :jbox(-1,-2,-2,4,12,4,40,16,spec.arm,{mirror:true}),
    ...overlay(o?.leftArm??o?.arm,(v,p)=>o?.leftArm?jbox(-1,-2,-2,4,12,4,32,48+v,p,{inflate:inf}):jbox(-1,-2,-2,4,12,4,40,16+v,p,{inflate:inf,mirror:true}))];
  const rightLeg:BoxDef[]=[thin?jbox(-1,0,-1,2,12,2,0,16,spec.leg):jbox(-2,0,-2,4,12,4,0,16,spec.leg),
    ...overlay(o?.leg,(v,p)=>jbox(-2,0,-2,4,12,4,0,16+v,p,{inflate:inf}))];
  const leftLeg:BoxDef[]=[thin?jbox(-1,0,-1,2,12,2,0,16,spec.leg,{mirror:true}):spec.leftLeg?jbox(-2,0,-2,4,12,4,16,48,spec.leftLeg)
      :jbox(-2,0,-2,4,12,4,0,16,spec.leg,{mirror:true}),
    ...overlay(o?.leftLeg??o?.leg,(v,p)=>o?.leftLeg?jbox(-2,0,-2,4,12,4,16,48+v,p,{inflate:inf}):jbox(-2,0,-2,4,12,4,0,16+v,p,{inflate:inf,mirror:true}))];
  const legX=thin?2:1.9;
  const parts:PartDef[]=[
    {name:'head',pivot:jpivot(0,0,0),boxes:headBoxes,
      children:spec.eyes?[{name:'eyes',pivot:[0,0,0],emissive:true,boxes:[jbox(-4,-8,-4,8,8,8,...spec.eyes.uv,spec.eyes.paint,{inflate:.05})]}]:undefined},
    {name:'body',pivot:jpivot(0,0,0),boxes:[jbox(-4,0,-2,8,12,4,16,16,spec.body),...overlay(o?.body,(v,p)=>jbox(-4,0,-2,8,12,4,16,16+v,p,{inflate:inf}))]},
    {name:'right_arm',pivot:jpivot(-5,2,0),boxes:rightArm,
      // The bow lies in the arm's y-z plane with its grip in the hand: the arc points away from the shoulder (forward when
      // aiming), the string toward the body.
      children:spec.bow!==undefined?[{name:'bow',pivot:[0,-11,0],boxes:[{from:[-.5,-7.5,-8],size:[1,16,16],uv:[0,spec.bow],paint:bowSlab()}]}]:undefined},
    {name:'left_arm',pivot:jpivot(5,2,0),boxes:leftArm},
    {name:'right_leg',pivot:jpivot(-legX,12,0),boxes:rightLeg},
    {name:'left_leg',pivot:jpivot(legX,12,0),boxes:leftLeg}
  ];
  if(spec.baby){
    // Vanilla baby humanoids draw the head at 0.75 against the body's 0.5: a 1.5× head on the half-size model.
    const b=spec.baby,boxes:BoxDef[]=[{from:[-6,0,-6],size:[12,12,12],uv:[0,b.v],paint:upscale(spec.head,8,8,8)}];
    if(o?.hat&&b.outerV!==undefined)boxes.push({from:[-6,0,-6],size:[12,12,12],uv:[0,b.outerV],paint:upscale(o.hat,8,8,8),inflate:.75});
    parts.push({name:'baby_head',pivot:[0,24,0],boxes});
  }
  return buildTexture(parts,spec.width,spec.height);
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

function zombieModel(look:ZombieLook,options:{scale?:number;drowned?:boolean}={}):EntityModel{
  const head=zombieHead(look),body=zombieBody(look),arm=zombieArm(look),leg=zombieLeg(look);
  const t=options.drowned?humanoid({head,body,arm,leg,leftArm:zombieArm({...look,seed:look.seed+50}),leftLeg:zombieLeg({...look,seed:look.seed+60}),
      outer:{v:64,inflate:.25,head:kelp(look.seed+1,.12),hat:kelp(look.seed+2,.22),body:kelp(look.seed+3,.18),arm:kelp(look.seed+4,.2),
        leftArm:kelp(look.seed+5,.15),leg:kelp(look.seed+6,.12),leftLeg:kelp(look.seed+7,.12)},
      eyes:look.glow!==undefined?{uv:[0,32],paint:eyeLayer(look.face,look.glow)}:undefined,
      baby:{v:128,outerV:152},width:64,height:176})
    :humanoid({head,body,arm,leg,baby:{v:32},width:64,height:64});
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
  drowned:()=>zombieModel(DROWNED_LOOK,{drowned:true})
};

function skeletonModel(look:BoneLook,stray:boolean):EntityModel{
  const t=humanoid({head:skull(look),body:ribcage(look),arm:boneLimb(look),leg:boneLimb(look),thin:true,width:64,
    outer:stray?{v:32,inflate:.25,head:hood(61,true),hat:hood(63,false),body:robe(67,3),arm:robe(71,5),leg:robe(73,6)}:undefined,
    bow:stray?64:32,height:stray?96:64});
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
const AURA_PARTS=['aura_head','aura_body','aura_leg_front_right','aura_leg_front_left','aura_leg_back_right','aura_leg_back_left'] as const;
/** Vanilla CreeperModel (64×32) with the charged armour (the same model 2 px out, its texture in the rows below). */
export function creeperModel():EntityModel{
  const head=creeperHead(),body=camo(89),foot=creeperFoot();
  // [name, Java x, Java z]: right legs at Java -x.
  const legs:[string,number,number][]=[['leg_back_right',-2,4],['leg_back_left',2,4],['leg_front_right',-2,-4],['leg_front_left',2,-4]];
  const parts:PartDef[]=[
    {name:'head',pivot:jpivot(0,6,0),boxes:[jbox(-4,-8,-4,8,8,8,0,0,head)],
      children:[{name:'aura_head',pivot:[0,0,0],emissive:true,boxes:[jbox(-4,-8,-4,8,8,8,0,32,aura,{inflate:2})]}]},
    {name:'body',pivot:jpivot(0,6,0),boxes:[jbox(-4,0,-2,8,12,4,16,16,body)],
      children:[{name:'aura_body',pivot:[0,0,0],emissive:true,boxes:[jbox(-4,0,-2,8,12,4,16,48,aura,{inflate:2})]}]},
    ...legs.map(([name,x,z]):PartDef=>({name,pivot:jpivot(x,18,z),boxes:[jbox(-2,0,-2,4,6,4,0,16,foot)],
      children:[{name:`aura_${name}`,pivot:[0,0,0],emissive:true,boxes:[jbox(-2,0,-2,4,6,4,0,48,aura,{inflate:2})]}]}))
  ];
  const t=buildTexture(parts,64,64),look={flash:0,scale:1};
  return{textureWidth:t.width,textureHeight:t.height,paint:t.paint,parts:t.parts,
    animate(e,pose,state){
      const c=Math.cos(state.limbSwing)*1.4*state.limbAmount,charged=e.data.charged===true;
      setPose(pose,'head',clampPitch(state.headPitch),clampYaw(state.headYaw),0);
      setPose(pose,'body',0,0,0);
      setPose(pose,'leg_back_right',c,0,0);setPose(pose,'leg_back_left',-c,0,0);
      setPose(pose,'leg_front_right',-c,0,0);setPose(pose,'leg_front_left',c,0,0);
      // Vanilla scrolls the armour texture; here the aura drifts a little instead.
      const drift=state.reducedMotion?0:Math.sin(state.time*2.4)*.35;
      for(let i=0;i<AURA_PARTS.length;i++){const p=setPose(pose,AURA_PARTS[i],0,0,0,charged);p.px=drift;p.pz=-drift;}
    },
    appearance(e){
      const s=typeof e.data.swell==='number'?e.data.swell:0;
      if(s<=0){look.flash=0;look.scale=1;return look;}
      return creeperLook(s,look);
    }};
}

/** Vanilla SpiderModel (64×32) with the glowing eye layer (its texture in the rows below). */
export function spiderModel():EntityModel{
  const leg=spiderLeg();
  // Legs: [name, Java z, contract rest y and z angles]; right legs reach +x, left legs -x (vanilla SpiderModel rest pose).
  const quarter=Math.PI/4,eighth=Math.PI/8,mid=.58119464;
  const legSpec:[string,number,number,number][]=[
    ['leg_right_hind',2,-quarter,-quarter],['leg_right_mid_hind',1,-eighth,-mid],['leg_right_mid_front',0,eighth,-mid],['leg_right_front',-1,quarter,-quarter]];
  const parts:PartDef[]=[
    {name:'head',pivot:jpivot(0,15,-3),boxes:[jbox(-4,-4,-8,8,8,8,32,4,spiderHead())],
      children:[{name:'eyes',pivot:[0,0,0],emissive:true,boxes:[jbox(-4,-4,-8,8,8,8,32,36,spiderEyes,{inflate:.05})]}]},
    {name:'neck',pivot:jpivot(0,15,0),boxes:[jbox(-3,-3,-3,6,6,6,0,0,fur(103))]},
    {name:'abdomen',pivot:jpivot(0,15,9),boxes:[jbox(-5,-4,-6,10,8,12,0,12,spiderAbdomen())]}
  ];
  for(const [name,z,y,zr] of legSpec){
    parts.push({name,pivot:jpivot(-4,15,z),rotation:[0,y,zr],boxes:[jbox(-15,-1,-1,16,2,2,18,0,leg)]});
    parts.push({name:name.replace('right','left'),pivot:jpivot(4,15,z),rotation:[0,-y,-zr],boxes:[jbox(-1,-1,-1,16,2,2,18,0,leg,{mirror:true})]});
  }
  const t=buildTexture(parts,64,64);
  const phases=[0,Math.PI,Math.PI/2,Math.PI*1.5];
  // Leg part names resolved once (animate runs per spider per frame and must not build strings).
  const rightLegs=legSpec.map(l=>l[0]),leftLegs=rightLegs.map(n=>n.replace('right','left'));
  return{textureWidth:t.width,textureHeight:t.height,paint:t.paint,parts:t.parts,
    animate(_e,pose,state){
      setPose(pose,'head',clampPitch(state.headPitch),clampYaw(state.headYaw),0);
      const s=state.limbSwing,a=state.limbAmount;
      for(let i=0;i<rightLegs.length;i++){
        const swing=-Math.cos(s*2+phases[i])*.4*a,lift=Math.abs(Math.sin(s+phases[i])*.4)*a;
        setPose(pose,rightLegs[i],0,swing,lift);setPose(pose,leftLegs[i],0,-swing,-lift);
      }
    }};
}

export function arrowModel():EntityModel{
  const b=(from:V3,size:V3,paint:Painter,extra:Partial<BoxDef>={}):BoxDef=>({from,size,paint,...extra});
  const parts:PartDef[]=[{name:'arrow',pivot:[0,0,0],boxes:[
    b([-.5,-.5,-8],[1,1,16],arrowShaft),b([-1,-1,-9],[2,2,2],arrowHead),
    b([-1.5,-.5,4],[3,1,4],arrowFletch,{key:'fletch'}),b([-.5,-1.5,4],[1,3,4],arrowFletch)]}];
  const t=buildTexture(parts,64);
  return{textureWidth:t.width,textureHeight:t.height,paint:t.paint,parts:t.parts,scale:.9,
    animate(e,pose,state){
      // The body yaw follows the flight; pitch tilts the shaft. A stuck arrow quivers for a moment (shake).
      const shake=typeof e.data.shake==='number'&&e.data.shake>0&&!state.reducedMotion?-Math.sin((e.data.shake-state.partial)*3)*(e.data.shake-state.partial)*.012:0;
      setPose(pose,'arrow',state.headPitch+shake,0,0);
    }};
}
