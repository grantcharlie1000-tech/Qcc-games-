// Box models for the monsters area in Java proportions, with textures painted here in code to look like vanilla
// (nothing is copied from Mojang's files).
//  - Enderman: the vanilla 64×32 skin layout in the top half of its texture (head 0,0; jaw 0,16; body 32,16; limbs 56,0):
//    near-black skin with faint grey speckles and glowing magenta eye slits (emissive planes on the face). The lower half holds
//    8×8 half-resolution tiles of every block it can carry; vanilla draws the carried block with the block atlas, so here each
//    holdable block is its own part (a cube of six planes, or two crossed planes for flowers and mushrooms) held half size
//    between the hands, tipped 20° toward the viewer and turned 45°, and animate() shows the one in data.carried.
//  - Slime: the vanilla 64×32 layout: a translucent green outer cube (lighter rim, shine on the upper corner) around an opaque
//    darker core with black eyes and mouth; appearance().scale is the slime size.
// Model space follows the contract (pixels, +y up from the feet, the mob faces -z). x keeps Java's sign (right limbs at -x),
// which mirrors the whole model; both mobs are symmetric, so only the texture placement matters and it follows vanilla.
// Every part is top-level with an absolute pivot (no children), so head, jaw and eyes are posed together by animate().
import {blockId,type BlockId} from '../data/blocks';
import type {AnimationState,Entity,EntityModel,ModelBox,ModelPart,PartPose} from '../engine/contracts';
import {FACE,noise,paintBox,shade,type FacePainter} from './monsters-common';

// ---- Shared helpers -----------------------------------------------------------------------------
function setPose(pose:Record<string,PartPose>,name:string,x:number,y:number,z:number,px=0,py=0,pz=0,visible=true){
  let p=pose[name];
  if(!p){p={x:0,y:0,z:0};pose[name]=p;}
  p.x=x;p.y=y;p.z=z;p.px=px;p.py=py;p.pz=pz;p.visible=visible;
}
const clamp=(v:number,a:number)=>v<-a?-a:v>a?a:v;
/** Writes one 0xRRGGBBAA pixel. */
function put(px:Uint8ClampedArray,width:number,x:number,y:number,c:number){
  const i=(y*width+x)*4;
  px[i]=c>>>24;px[i+1]=c>>>16&255;px[i+2]=c>>>8&255;px[i+3]=c&255;
}
/** Hand-drawn pixel rows: each character is a palette key ('.' or a missing key = transparent). */
function blit(px:Uint8ClampedArray,width:number,x0:number,y0:number,rows:readonly string[],palette:Readonly<Record<string,number>>){
  for(let y=0;y<rows.length;y++)for(let x=0;x<rows[y].length;x++){
    const c=palette[rows[y][x]];
    put(px,width,x0+x,y0+y,c===undefined?0:(c<<8|255)>>>0);
  }
}
/** Speckled tile: each pixel picks a colour from `colours` by cumulative weights (deterministic noise). */
function speckle(px:Uint8ClampedArray,width:number,x0:number,y0:number,size:number,salt:number,colours:readonly number[],weights:readonly number[]){
  const total=weights.reduce((a,b)=>a+b,0);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    let r=noise(salt,x,y)*total,i=0;
    while(i<colours.length-1&&r>=weights[i]){r-=weights[i];i++;}
    put(px,width,x0+x,y0+y,(colours[i]<<8|255)>>>0);
  }
}

// ---- Enderman: skin -----------------------------------------------------------------------------
/** Head box of the enderman model in pixels above the feet (vanilla: the 8 px head sits 1 px into the body top). */
export const ENDERMAN_HEAD_PX={bottom:37,top:45};
/** Vanilla-style eye colours: deep magenta slits with a lighter middle pixel. */
export const EYE_MAGENTA=0xcc00fa,EYE_LIGHT=0xe079fa;
const SKIN=[0x060606,0x0d0d0d,0x121212,0x181818,0x202020] as const,SKIN_WEIGHTS=[3,6,6,3,1] as const;
/** Near-black skin with sparse grey speckles (vanilla enderman.png is almost black). */
const skin=(salt:number):FacePainter=>(face,x,y)=>{
  let r=noise(face*37+x,y,salt)*19,i=0;
  while(i<SKIN.length-1&&r>=SKIN_WEIGHTS[i]){r-=SKIN_WEIGHTS[i];i++;}
  return shade(SKIN[i],1);
};
/** Face row (from the top) and columns of the eye slits on the 8×8 head front. */
const EYE_ROW=4,isEyeColumn=(x:number)=>x<=2||x>=5;
const eyeColour=(column:number)=>column===1||column===6?EYE_LIGHT:EYE_MAGENTA;

// ---- Enderman: carried blocks -------------------------------------------------------------------
/** Texture slot (8×8 tile) of the carried-block area: 8 per row from (0, 32). */
const slot=(i:number):[number,number]=>[(i%8)*8,32+Math.floor(i/8)*8];
interface CarriedCube{kind:'cube';top:number;side:number;bottom:number}
interface CarriedPlant{kind:'plant';sprite:number}
/** Visual of every holdable block: tile slots for cube faces, or a crossed-plane sprite. Slots in column 0 are only
 *  used by side and plant planes, whose UVs never go below 0. */
const CARRIED:Readonly<Record<string,CarriedCube|CarriedPlant>>={
  grass_block:{kind:'cube',top:9,side:0,bottom:1},dirt:{kind:'cube',top:1,side:1,bottom:1},
  coarse_dirt:{kind:'cube',top:2,side:2,bottom:2},sand:{kind:'cube',top:3,side:3,bottom:3},red_sand:{kind:'cube',top:4,side:4,bottom:4},
  gravel:{kind:'cube',top:5,side:5,bottom:5},clay:{kind:'cube',top:6,side:6,bottom:6},moss_block:{kind:'cube',top:7,side:7,bottom:7},
  podzol:{kind:'cube',top:10,side:8,bottom:1},mycelium:{kind:'cube',top:11,side:16,bottom:1},
  cactus:{kind:'cube',top:12,side:19,bottom:13},pumpkin:{kind:'cube',top:14,side:20,bottom:14},melon:{kind:'cube',top:15,side:21,bottom:15},
  tnt:{kind:'cube',top:17,side:22,bottom:18},
  dandelion:{kind:'plant',sprite:24},poppy:{kind:'plant',sprite:25},blue_orchid:{kind:'plant',sprite:26},allium:{kind:'plant',sprite:27},
  cornflower:{kind:'plant',sprite:28},oxeye_daisy:{kind:'plant',sprite:29},brown_mushroom:{kind:'plant',sprite:30},red_mushroom:{kind:'plant',sprite:31}
};
/** Names of the blocks the enderman model can show between its hands. */
export const CARRIED_BLOCKS:readonly string[]=Object.keys(CARRIED);
/** Carried block pose: vanilla CarriedBlockLayer (13 px up, 12 px forward, tipped 20° forward, turned 45°, half size). */
const CARRIED_PIVOT:[number,number,number]=[0,13,-12],CARRIED_TILT=-20*Math.PI/180,CARRIED_TURN=Math.PI/4;
/** A cube of six planes (8 px, centred 1 px above the pivot) whose faces all read 8×8 tiles. */
function cubePlanes(c:CarriedCube):ModelBox[]{
  const [tx,ty]=slot(c.top),[sx,sy]=slot(c.side),[bx,by]=slot(c.bottom);
  return[
    {from:[-4,5,-4],size:[8,0,8],uv:[tx-8,ty]},{from:[-4,-3,-4],size:[8,0,8],uv:[bx-8,by]},
    {from:[-4,-3,-4],size:[8,8,0],uv:[sx,sy]},{from:[-4,-3,4],size:[8,8,0],uv:[sx,sy]},
    {from:[-4,-3,-4],size:[0,8,8],uv:[sx,sy-8]},{from:[4,-3,-4],size:[0,8,8],uv:[sx,sy-8]}
  ];
}
/** Vanilla cross model: two planes through the centre (diagonal in the block, so square to the body once turned 45°). */
function crossPlanes(p:CarriedPlant):ModelBox[]{
  const [x,y]=slot(p.sprite);
  return[{from:[-4,-3,0],size:[8,8,0],uv:[x,y]},{from:[0,-3,-4],size:[0,8,8],uv:[x,y-8]}];
}
const carriedPartName=(block:string)=>`carried_${block}`;
const CARRIED_PART=new Map<BlockId,string>();
for(const name of CARRIED_BLOCKS)CARRIED_PART.set(blockId(name),carriedPartName(name));
/** Model part showing a carried block id, or undefined (nothing is shown). */
export const carriedPart=(id:unknown):string|undefined=>typeof id==='number'?CARRIED_PART.get(id):undefined;
const CARRIED_PARTS=CARRIED_BLOCKS.map(name=>({name:carriedPartName(name),cube:CARRIED[name].kind==='cube'}));

// Carried-block palettes (0xRRGGBB) and hand-drawn tiles.
const DIRT=[0x593d29,0x6c4b33,0x79553a,0x866043,0x9b7653] as const;
const GREEN={G:0x4f7f2b,g:0x619337,h:0x72a83f,H:0x86bb4d};
const SIDE_DIRT={D:0x593d29,d:0x79553a,b:0x866043,l:0x9b7653};
const GRASS_TOP=['hgHhgGhg','GhghHhgh','hHgGhghH','ghhgHGhg','HgGhhgHh','hghHgGhg','gHhgGhhH','hGghHghg'];
const FRINGED_SIDE=['hgHhgGhH','gGhdgbhg','bgdbbGbd','bbdlbbbl','dbbbDbbb','blbdbbdb','bbDbblbb','lbbbdbbD'];
const PODZOL={G:0x4a3015,g:0x5b3d1c,h:0x7a5730,H:0x8f6a3a};
const PODZOL_TOP=['hghHgGhg','GhgGHhgh','hHgghggH','gGhgHGhg','HghGhgGh','hgGHghgg','gHhgGhhH','hGghHghG'];
const MYCELIUM={G:0x5a4f55,g:0x6f6265,h:0x84777d,H:0x9d8f97};
const MYCELIUM_TOP=['hgHhgGhg','GhgHHhgh','hHgGhghH','ghhgHGhg','HgGhhgHh','hghHgGhH','gHhgGhhg','hGgHhgHg'];
const CACTUS={C:0x3f6420,c:0x57822b,k:0x6e9a3b,w:0xd9d6a8};
const CACTUS_SIDE=['CckcCckC','CckcCwkC','wckcCckC','CckcCckw','CckwCckC','CckcCckC','CwkcCckC','CckcCcwC'];
const CACTUS_TOP=['CCCCCCCC','CkkkkkkC','CkcccckC','CkcCCckC','CkcCCckC','CkcccckC','CkkkkkkC','CCCCCCCC'];
const CACTUS_BOTTOM=['CCCCCCCC','CccccccC','CcCCCCcC','CcCkkCcC','CcCkkCcC','CcCCCCcC','CccccccC','CCCCCCCC'];
const PUMPKIN={B:0x9c5509,O:0xc46d12,o:0xe38a1d,y:0xf3a63b,t:0x5b4a14,T:0x7a6a22};
const PUMPKIN_SIDE=['BOoyBOoy','OoyoOoyo','OoyoOoyo','OoyoOoyo','OoyoOoyo','OoyoOoyo','OoyoOoyo','BOoyBOoy'];
const PUMPKIN_TOP=['OoyoOoyO','oyoOOoyo','yoOoooOy','OoOtTOoO','OoOTtOoO','yoOoooOy','oyoOOoyo','OoyoOoyO'];
const MELON={M:0x52771c,m:0x759e2b,v:0xa3c34a,t:0x6b5a1c};
const MELON_SIDE=['MvmMvmvM','MvmMvmvM','mvMmvMvm','MvmMvmvM','MvmMvmvM','mvMmvMvm','MvmMvmvM','MvmMvmvM'];
const MELON_TOP=['MmmvvmmM','mvmmmmvm','mmvMMvmm','vmMttMmv','vmMttMmv','mmvMMvmm','mvmmmmvm','MmmvvmmM'];
const TNT={R:0xdb4a2a,r:0xa8301c,W:0xeeeeee,w:0xc4c4c4,K:0x262626};
const TNT_SIDE=['rRrRrRrR','rRrRrRrR','rRrRrRrR','WKWKKWKW','WKWKWKKW','rRrRrRrR','rRrRrRrR','rRrRrRrR'];
const TNT_TOP=['rRRrrRRr','RwwRRwwR','RwwRRwwR','rRRKKRRr','rRRKKRRr','RwwRRwwR','RwwRRwwR','rRRrrRRr'];
const TNT_BOTTOM=['rRRrrRRr','RwwRRwwR','RwwRRwwR','rRRrrRRr','rRRrrRRr','RwwRRwwR','RwwRRwwR','rRRrrRRr'];
const STEM={s:0x3e7a20,L:0x5c9c2e};
const PLANTS:readonly [number,readonly string[],Readonly<Record<string,number>>][]=[
  [24,['........','...YY...','..YOOY..','...YY...','...s....','..Ls....','...sL...','...s....'],{Y:0xf0d22a,O:0xe8a317,...STEM}],
  [25,['........','..rrRr..','.rrKKrr.','..rRrR..','...s....','..Ls....','...sL...','...s....'],{r:0xd12b1f,R:0x8f1a12,K:0x1f1a14,...STEM}],
  [26,['........','.c.bc.b.','.bBbBbb.','..bBcB..','...sb...','..Ls....','...sL...','...s....'],{b:0x2fa8dc,B:0x1b78b5,c:0x8ad6f2,...STEM}],
  [27,['..aia...','.aiAaa..','.aAaiA..','..aAa...','...s....','...s....','..Ls....','...s....'],{a:0xb86ad9,A:0x8a45b0,i:0xdfa6f2,...STEM}],
  [28,['........','..kfk...','.fFfFf..','..fFf...','...s....','..Ls....','...sL...','...s....'],{f:0x4f6fe3,F:0x2f4bb3,k:0x83a0ff,...STEM}],
  [29,['........','..WwW...','.WWYWW..','..WwW...','...s....','..Ls....','...sL...','...s....'],{W:0xf2f2f2,w:0xcfcfcf,Y:0xf0c72a,...STEM}],
  [30,['........','........','..jjju..','.ujuuuU.','.UUUUUU.','...tT...','...tT...','...tT...'],{u:0x9c7454,U:0x775638,j:0xb68c66,t:0xdccdb0,T:0xbcaa8a}],
  [31,['........','..rWrr..','.rrrrWr.','.WrrRrr.','.RRRRRR.','...tT...','...tT...','...tT...'],{r:0xd42c2c,R:0xa31c1c,W:0xf2f2f2,t:0xdccdb0,T:0xbcaa8a}]
];
function paintCarried(px:Uint8ClampedArray,w:number){
  const at=(i:number,rows:readonly string[],pal:Readonly<Record<string,number>>)=>{const [x,y]=slot(i);blit(px,w,x,y,rows,pal);};
  const sp=(i:number,colours:readonly number[],weights:readonly number[])=>{const [x,y]=slot(i);speckle(px,w,x,y,8,100+i,colours,weights);};
  sp(1,DIRT,[2,3,4,6,3]);// dirt
  sp(2,[0x4f3a29,0x5e4330,0x77553b,0x8c6a4d,0x7d7775],[2,3,5,3,2]);// coarse dirt: darker, with grey grit
  sp(3,[0xbdb27d,0xc9bf8a,0xdbd3a0,0xe7e1bb],[1,3,6,2]);// sand
  sp(4,[0x95501a,0xa95b1c,0xbe6621,0xd17830],[1,3,6,2]);// red sand
  sp(5,[0x575352,0x6b6564,0x837f7e,0x9c9997,0x86705f],[2,3,4,3,1]);// gravel
  sp(6,[0x8b909c,0x959aa7,0xa0a6b3,0xadb2bf],[1,3,6,2]);// clay
  sp(7,[0x405a1f,0x4d6a26,0x597a2d,0x6c8f37],[1,3,6,2]);// moss block
  at(0,FRINGED_SIDE,{...GREEN,...SIDE_DIRT});at(9,GRASS_TOP,GREEN);
  at(8,FRINGED_SIDE,{...PODZOL,...SIDE_DIRT});at(10,PODZOL_TOP,PODZOL);
  at(16,FRINGED_SIDE,{...MYCELIUM,...SIDE_DIRT});at(11,MYCELIUM_TOP,MYCELIUM);
  at(12,CACTUS_TOP,CACTUS);at(13,CACTUS_BOTTOM,CACTUS);at(19,CACTUS_SIDE,CACTUS);
  at(14,PUMPKIN_TOP,PUMPKIN);at(20,PUMPKIN_SIDE,PUMPKIN);
  at(15,MELON_TOP,MELON);at(21,MELON_SIDE,MELON);
  at(17,TNT_TOP,TNT);at(18,TNT_BOTTOM,TNT);at(22,TNT_SIDE,TNT);
  for(const [i,rows,pal] of PLANTS)at(i,rows,pal);
}

// ---- Enderman: model ----------------------------------------------------------------------------
const endermanParts:ModelPart[]=[
  // Vanilla EndermanModel: body 26–38, head 37–45, arms hang from 36 (8–38 px), legs reach the ground from 30.
  {name:'body',pivot:[0,26,0],boxes:[{from:[-4,0,-2],size:[8,12,4],uv:[32,16]}]},
  {name:'head',pivot:[0,ENDERMAN_HEAD_PX.bottom,0],boxes:[{from:[-4,0,-4],size:[8,8,8],uv:[0,0]}]},
  // The jaw (vanilla "hat") is a slightly smaller copy of the head: hidden inside it until the head lifts.
  {name:'jaw',pivot:[0,ENDERMAN_HEAD_PX.bottom,0],boxes:[{from:[-4,0,-4],size:[8,8,8],uv:[0,16],inflate:-.5}]},
  // Glowing eye slits: two 3×1 planes just in front of the face (vanilla draws an emissive eyes layer over the head).
  {name:'eyes',pivot:[0,ENDERMAN_HEAD_PX.bottom,0],emissive:true,boxes:[
    {from:[-4,7-EYE_ROW,-4.1],size:[3,1,0],uv:[32,0]},
    {from:[1,7-EYE_ROW,-4.1],size:[3,1,0],uv:[32,0],mirror:true}]},
  {name:'right_arm',pivot:[-5,36,0],boxes:[{from:[-1,-28,-1],size:[2,30,2],uv:[56,0]}]},
  {name:'left_arm',pivot:[5,36,0],boxes:[{from:[-1,-28,-1],size:[2,30,2],uv:[56,0],mirror:true}]},
  {name:'right_leg',pivot:[-2,30,0],boxes:[{from:[-1,-30,-1],size:[2,30,2],uv:[56,0]}]},
  {name:'left_leg',pivot:[2,30,0],boxes:[{from:[-1,-30,-1],size:[2,30,2],uv:[56,0],mirror:true}]},
  ...CARRIED_BLOCKS.map((name):ModelPart=>{
    const v=CARRIED[name];
    return{name:carriedPartName(name),pivot:[...CARRIED_PIVOT],rotation:[CARRIED_TILT,0,0],boxes:v.kind==='cube'?cubePlanes(v):crossPlanes(v)};
  })
];

export function createEndermanModel():EntityModel{
  return{
    textureWidth:64,textureHeight:64,parts:endermanParts,
    paint(px,w,h){
      // Head: the face carries the eye slits too (dark magenta under the glowing planes).
      paintBox(px,w,h,0,0,8,8,8,(face,x,y,fw,fh)=>
        face===FACE.front&&y===EYE_ROW&&isEyeColumn(x)?shade(eyeColour(x),.55):skin(1)(face,x,y,fw,fh));
      // Jaw: the same skin, its front a shade darker where the mouth gapes.
      paintBox(px,w,h,0,16,8,8,8,(face,x,y,fw,fh)=>face===FACE.front&&y>=5?shade(0x050505,1):skin(2)(face,x,y,fw,fh));
      paintBox(px,w,h,32,16,8,12,4,skin(3));
      paintBox(px,w,h,56,0,2,30,2,skin(4));
      // Eye slit plane (3×1): magenta with a lighter middle pixel.
      for(let x=0;x<3;x++)put(px,w,32+x,0,shade(x===1?EYE_LIGHT:EYE_MAGENTA,1));
      paintCarried(px,w);
    },
    animate(e:Entity,pose:Record<string,PartPose>,s:AnimationState){
      const angry=e.data.angry===true,carriedName=carriedPart(e.data.carried);
      // Vanilla HumanoidModel walk, halved by EndermanModel and clamped to ±0.4 rad.
      const swing=s.limbSwing*.6662,amount=s.limbAmount;
      let rightArm=clamp(Math.cos(swing+Math.PI)*amount*.5,.4),leftArm=clamp(Math.cos(swing)*amount*.5,.4),armZ=0;
      const rightLeg=clamp(Math.cos(swing)*1.4*amount*.5,.4),leftLeg=clamp(Math.cos(swing+Math.PI)*1.4*amount*.5,.4);
      if(carriedName){rightArm=leftArm=.5;armZ=.05;}
      const swingTicks=typeof e.data.swing==='number'?e.data.swing:0;
      const attack=Math.max(s.attack,swingTicks>0?1-swingTicks/10:0);
      if(attack>0){const a=Math.sin(attack*Math.PI);rightArm+=a*1.1;leftArm+=a*.6;}
      // Angry endermen shake (vanilla offsets the whole model by about 0.02 blocks a frame); not with reduced motion.
      let jx=0,jz=0;
      if(angry&&!s.reducedMotion){
        const t=Math.floor(s.time*60);
        jx=(noise(e.id,t,1)-.5)*.64;jz=(noise(e.id,t,2)-.5)*.64;
      }
      // Angry: the head lifts 5 px off the jaw (vanilla "creepy" open mouth).
      const lift=angry?5:0;
      setPose(pose,'head',s.headPitch,s.headYaw,0,jx,lift,jz);
      setPose(pose,'eyes',s.headPitch,s.headYaw,0,jx,lift,jz);
      setPose(pose,'jaw',s.headPitch,s.headYaw,0,jx,0,jz);
      setPose(pose,'body',0,0,0,jx,0,jz);
      setPose(pose,'right_arm',rightArm,0,-armZ,jx,0,jz);
      setPose(pose,'left_arm',leftArm,0,armZ,jx,0,jz);
      setPose(pose,'right_leg',rightLeg,0,0,jx,0,jz);
      setPose(pose,'left_leg',leftLeg,0,0,jx,0,jz);
      for(const p of CARRIED_PARTS)setPose(pose,p.name,0,p.cube?CARRIED_TURN:0,0,jx,0,jz,p.name===carriedName);
    }
  };
}

// ---- Slime --------------------------------------------------------------------------------------
const SLIME_RIM=0x8ad377,SLIME_JELLY=0x6fbf5b,SLIME_SHINE=0xc4f2b4,SLIME_CORE=[0x4b8f3d,0x579e47,0x62ad51,0x70bb5e] as const,SLIME_DARK=0x1b2e17;
/** Alpha of the outer jelly between the rim pixels: translucent, but above 0.5 so an alpha-tested renderer still draws it. */
export const SLIME_OUTER_ALPHA=140;
/** Alpha of the outer rim pixels. */
export const SLIME_RIM_ALPHA=215;
const slimeParts:ModelPart[]=[
  // Vanilla SlimeModel (inner layer, then the outer cube drawn last so blending shows the core through it).
  {name:'core',pivot:[0,0,0],boxes:[{from:[-3,1,-3],size:[6,6,6],uv:[0,16]}]},
  {name:'right_eye',pivot:[0,0,0],boxes:[{from:[-3.25,4,-3.5],size:[2,2,2],uv:[32,0]}]},
  {name:'left_eye',pivot:[0,0,0],boxes:[{from:[1.25,4,-3.5],size:[2,2,2],uv:[32,4]}]},
  {name:'mouth',pivot:[0,0,0],boxes:[{from:[0,2,-3.5],size:[1,1,1],uv:[32,8]}]},
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
        const rim=x===0||y===0||x===fw-1||y===fh-1,n=noise(face*13+x,y,21);
        // A shine on the upper corner of every side face (the light catching the jelly).
        if(face>=FACE.west&&(x===1&&(y===1||y===2)||x===2&&y===1))return shade(SLIME_SHINE,1,200);
        return rim?shade(SLIME_RIM,.96+n*.08,SLIME_RIM_ALPHA):shade(SLIME_JELLY,.94+n*.1,SLIME_OUTER_ALPHA);
      });
      paintBox(px,w,h,0,16,6,6,6,(face,x,y)=>{
        const n=noise(face*7+x,y,22);
        return shade(SLIME_CORE[n<.15?0:n<.55?1:n<.9?2:3],1);
      });
      const dark:FacePainter=()=>shade(SLIME_DARK,1);
      paintBox(px,w,h,32,0,2,2,2,dark);paintBox(px,w,h,32,4,2,2,2,dark);paintBox(px,w,h,32,8,1,1,1,dark);
    },
    appearance:e=>slimeAppearance(e.data.size)
  };
}
