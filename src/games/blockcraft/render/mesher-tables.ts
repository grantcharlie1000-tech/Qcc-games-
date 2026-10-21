// Static tables for the mesher, derived once from the block registry (data/blocks.ts) so the hot loops only index
// typed arrays. Face order everywhere: +x (east), -x (west), +y (up), -y (down), +z (south), -z (north).
import {BLOCKS,BLOCK_BY_NAME,FACE_TILE,LIQUID,TILE_INDEX,doorPanelBox,opposite,rotateCW,stairsBoxes,type Facing,type Shape} from '../data/blocks';
import {PAD_LAYER,PAD_X} from '../engine/constants';

// ---- Shapes and vertex flags -----------------------------------------------------------------------
export const SH_AIR=0,SH_CUBE=1,SH_CROSS=2,SH_CROP=3,SH_TORCH=4,SH_LIQUID=5,SH_SLAB=6,SH_SNOW=7,SH_FARMLAND=8,SH_CACTUS=9,
  SH_LADDER=10,SH_DOOR=11,SH_BED=12,SH_FLAT=13,SH_STAIRS=14,SH_LANTERN=15,SH_FIRE=16;
/** Every registry shape has a mesher code (a new Shape fails to compile here until it is meshed). */
const SHAPE_CODE:Record<Shape,number>={air:SH_AIR,cube:SH_CUBE,cross:SH_CROSS,crop:SH_CROP,torch:SH_TORCH,liquid:SH_LIQUID,slab:SH_SLAB,
  snow_layer:SH_SNOW,farmland:SH_FARMLAND,cactus:SH_CACTUS,ladder:SH_LADDER,door:SH_DOOR,bed:SH_BED,flat:SH_FLAT,stairs:SH_STAIRS,
  lantern:SH_LANTERN,fire:SH_FIRE};
/** `position.w` flag bits (shifted by 8 when written): sway, liquid surface, emissive. */
export const FLAG_SWAY=1,FLAG_LIQUID=2,FLAG_EMISSIVE=4;

// ---- Face geometry ---------------------------------------------------------------------------------
/** Normal axis (0 x, 1 y, 2 z) and sign of each face. */
export const N_AXIS=[0,0,1,1,2,2],N_SIGN=[1,-1,1,-1,1,-1];
/** Tangent frame of each face: U points right and V up as seen from outside (U×V is the outward normal), so the
 *  corner order below is counter-clockwise from the front. */
export const U_AXIS=[2,2,0,0,0,0],U_SIGN=[-1,1,1,1,1,-1],V_AXIS=[1,1,2,2,1,1],V_SIGN=[1,1,-1,1,1,1];
/** On the bottom face the texture v follows -z (like the top) while the geometric V follows +z. */
export const V_FLIP=[0,0,0,1,0,0];
export const OPPOSITE_FACE=[1,0,3,2,5,4];
/** Horizontal faces only: true for the four sides. */
export const SIDE_FACE=[1,1,0,0,1,1];
/** Horizontal unit vector of each face (0 for up/down). */
export const FACE_DX=[1,-1,0,0,0,0],FACE_DZ=[0,0,0,0,1,-1];
/** Quad corners: c0=(U0,V1) top-left, c1=(U0,V0) bottom-left, c2=(U1,V1) top-right, c3=(U1,V0) bottom-right.
 *  Triangles (0,1,2),(2,1,3) share the c1–c2 diagonal; FLIP_ORDER rewrites the quad to share c0–c3 instead. */
export const CU=[0,0,1,1],CV=[1,0,1,0],FLIP_ORDER=[1,3,0,2];
const PAD_STRIDE=[1,PAD_LAYER,PAD_X];
/** Padded-volume offset of each face's neighbour. */
export const PAD_NB=new Int32Array(6);
/** For face f and corner c, padded offsets (from the light cell in front of the face) of the two side cells and the
 *  diagonal corner cell that share the vertex: AO_OFF[(f*4+c)*3 + 0..2]. */
export const AO_OFF=new Int32Array(6*4*3);
/** Unit-cube corner position per face and corner (x,y,z in 0/1, the normal axis already on the face plane). */
export const CORNER=new Uint8Array(6*4*3);
for(let f=0;f<6;f++){
  PAD_NB[f]=N_SIGN[f]*PAD_STRIDE[N_AXIS[f]];
  for(let c=0;c<4;c++){
    const o=(f*4+c)*3,su=(CU[c]?1:-1)*U_SIGN[f]*PAD_STRIDE[U_AXIS[f]],sv=(CV[c]?1:-1)*V_SIGN[f]*PAD_STRIDE[V_AXIS[f]];
    AO_OFF[o]=su;AO_OFF[o+1]=sv;AO_OFF[o+2]=su+sv;
    const pos=[0,0,0];pos[N_AXIS[f]]=N_SIGN[f]>0?1:0;
    pos[U_AXIS[f]]=U_SIGN[f]>0?CU[c]:1-CU[c];pos[V_AXIS[f]]=V_SIGN[f]>0?CV[c]:1-CV[c];
    CORNER[o]=pos[0];CORNER[o+1]=pos[1];CORNER[o+2]=pos[2];
  }
}
/** Vanilla directional face shade (east/west 0.6, up 1, down 0.5, north/south 0.8). */
export const FACE_SHADE=[.6,.6,1,.5,.8,.8];
/** Vanilla ambient occlusion: each occluding neighbour of a vertex takes 0.2 off; index = 3 - occluders. */
export const AO_CURVE=[.4,.6,.8,1];
/** Shade byte for face f and AO level: SHADE[f*4+ao] = 255 × face shade × AO. */
export const SHADE=new Uint8Array(24);
for(let f=0;f<6;f++)for(let a=0;a<4;a++)SHADE[f*4+a]=Math.round(255*FACE_SHADE[f]*AO_CURVE[a]);
/** Rounded average of `sum` over `count` light cells: AVG[count*64+sum]. */
export const AVG=new Uint8Array(5*64);
for(let n=1;n<=4;n++)for(let s=0;s<=60;s++)AVG[n*64+s]=Math.floor((2*s+n)/(2*n));
const FACE_OF_FACING:Record<Facing,number>={east:0,west:1,south:4,north:5};

// ---- Per-block tables ------------------------------------------------------------------------------
export const SHAPE=new Uint8Array(256),FAMILY_ID=new Uint16Array(256),CULL_SAME=new Uint8Array(256),EMISSIVE=new Uint8Array(256);
/** 1 = every vertex sways (leaves), 2 = only the vertices above the block base (plants and crops). */
export const SWAY=new Uint8Array(256);
/** Per block and face (id*6+f): 0 untinted, 1 grass, 2 foliage, 3 water. */
export const TINT_KIND=new Uint8Array(256*6);
/** Vanilla random plant offset: 0 none, 1 horizontal (flowers), 2 horizontal and down (short grass, ferns). */
export const PLANT_OFFSET=new Uint8Array(256);
/** The block's `facing` as a face index (east 0, west 1, south 4, north 5); 255 without facing. */
export const FACING_FACE=new Uint8Array(256).fill(255);
/** Own liquid surface height 0..1 (vanilla amount/9: sources and falling liquid 8/9, level L (8-L)/9). */
export const LIQUID_HEIGHT=new Float64Array(256);
/** Still and flowing tile per liquid kind (LIQUID value 1 water, 2 lava). */
export const LIQUID_STILL_TILE=new Uint16Array(3),LIQUID_FLOW_TILE=new Uint16Array(3);
/** Top slab (8..16) rather than bottom slab. */
export const SLAB_TOP=new Uint8Array(256);
/** Door panel box in pixels (doorPanelBox), its front face index and whether it is the upper half. */
export const DOOR_BOX=new Uint8Array(256*6),DOOR_FRONT=new Uint8Array(256),DOOR_UPPER=new Uint8Array(256);
/** Upper back box of stairs in pixels (second box of stairsBoxes). */
export const STAIRS_BACK=new Uint8Array(256*6);
/** Grass, podzol and mycelium show the snowy side when snow or a snow block is on top. */
export const SNOWY_DIRT=new Uint8Array(256),SNOW_COVER=new Uint8Array(256);
/** Shape code of the cube blocks in the translucent layer (ice): liquids do not draw against them. */
export const TRANSLUCENT_CUBE=new Uint8Array(256);

/** Boundary face profiles: two partial shapes whose touching faces have the same non-zero profile hide both faces
 *  (snow beside snow, same-half slabs, aligned stairs). Opaque cubes are handled by OPAQUE; 0 never culls. */
export const P_NONE=0,P_FULL=1,P_LOWER=2,P_UPPER=3,P_SNOW=4,P_FARMLAND=5,P_BED=6,P_CACTUS=7,
  /** Stairs sides: lower half plus the upper half on the +x / -x / +z / -z side. */
  P_STAIRS_XP=8,P_STAIRS_XN=9,P_STAIRS_ZP=10,P_STAIRS_ZN=11;
export const PROFILE=new Uint8Array(256*6);

const family=new Map<string,number>();
const FLOWERS=['dandelion','poppy','blue_orchid','allium','cornflower','oxeye_daisy'],GROUND_COVER=['short_grass','fern'];
for(const b of BLOCKS){
  const id=b.id,shape=SHAPE_CODE[b.shape];
  SHAPE[id]=shape;CULL_SAME[id]=+b.cullSame;
  if(!family.has(b.family))family.set(b.family,family.size);
  FAMILY_ID[id]=family.get(b.family)!;
  for(let f=0;f<6;f++)TINT_KIND[id*6+f]=b.tintFaces[f]?{none:0,grass:1,foliage:2,water:3}[b.tint]:0;
  if(b.facing)FACING_FACE[id]=FACE_OF_FACING[b.facing];
  EMISSIVE[id]=+(shape===SH_TORCH||shape===SH_LANTERN||shape===SH_FIRE||LIQUID[id]===2||(shape===SH_CUBE&&b.lightEmission>=15));
  if(shape===SH_CUBE&&b.family.endsWith('_leaves'))SWAY[id]=1;
  else if((shape===SH_CROSS&&b.family!=='sugar_cane')||shape===SH_CROP)SWAY[id]=2;
  if(b.liquid)LIQUID_HEIGHT[id]=b.liquid.falling||b.liquid.level===0?8/9:(8-b.liquid.level)/9;
  if(b.liquid&&!b.liquid.falling){
    const kind=LIQUID[id];
    if(b.liquid.level===0)LIQUID_STILL_TILE[kind]=FACE_TILE[id*6+2];
    else if(b.liquid.level===1)LIQUID_FLOW_TILE[kind]=FACE_TILE[id*6+2];
  }
  if(shape===SH_CUBE&&b.layer==='translucent')TRANSLUCENT_CUBE[id]=1;
  const prof=(f:number,p:number)=>{PROFILE[id*6+f]=p;};
  if(shape===SH_SLAB){
    const top=b.slab==='top';SLAB_TOP[id]=+top;
    for(const f of [0,1,4,5])prof(f,top?P_UPPER:P_LOWER);
    prof(top?2:3,P_FULL);
  }else if(shape===SH_SNOW){for(const f of [0,1,4,5])prof(f,P_SNOW);prof(3,P_FULL);}
  else if(shape===SH_FARMLAND){for(const f of [0,1,4,5])prof(f,P_FARMLAND);prof(3,P_FULL);}
  else if(shape===SH_BED){for(const f of [0,1,4,5])prof(f,P_BED);prof(3,P_FULL);}
  else if(shape===SH_CACTUS){prof(2,P_CACTUS);prof(3,P_CACTUS);}
  else if(shape===SH_STAIRS&&b.facing){
    const back=stairsBoxes(b.facing).slice(6).map(v=>Math.round(v*16));
    for(let k=0;k<6;k++)STAIRS_BACK[id*6+k]=back[k];
    const front=FACE_OF_FACING[b.facing],rear=OPPOSITE_FACE[front];
    // The upper half sits on the -facing side; name it by world direction for the two side faces.
    const upper=rear===0?P_STAIRS_XP:rear===1?P_STAIRS_XN:rear===4?P_STAIRS_ZP:P_STAIRS_ZN;
    for(const f of [0,1,4,5])prof(f,f===front?P_LOWER:f===rear?P_FULL:upper);
    prof(3,P_FULL);
  }else if(shape===SH_DOOR&&b.facing&&b.door){
    const box=doorPanelBox(b.facing,b.door.open).map(v=>Math.round(v*16));
    for(let k=0;k<6;k++)DOOR_BOX[id*6+k]=box[k];
    // The panel's front faces the placer when closed and swings 90° about the hinge when open.
    DOOR_FRONT[id]=FACE_OF_FACING[b.door.open?opposite(rotateCW(b.facing)):b.facing];
    DOOR_UPPER[id]=+(b.door.half==='upper');
  }
}
for(const name of FLOWERS){const d=BLOCK_BY_NAME.get(name);if(d)PLANT_OFFSET[d.id]=1;}
for(const name of GROUND_COVER){const d=BLOCK_BY_NAME.get(name);if(d)PLANT_OFFSET[d.id]=2;}
for(const name of ['grass_block','podzol','mycelium']){const d=BLOCK_BY_NAME.get(name);if(d)SNOWY_DIRT[d.id]=1;}
for(const name of ['snow','snow_block']){const d=BLOCK_BY_NAME.get(name);if(d)SNOW_COVER[d.id]=1;}
const tile=(name:string)=>TILE_INDEX.get(name)??-1;
/** Grass block sides: the side tile carries a painted band; the greyscale overlay tile is tinted on top of it (cutout). */
export const GRASS_ID=BLOCK_BY_NAME.get('grass_block')?.id??-1;
export const GRASS_SIDE_TILE=GRASS_ID>=0?FACE_TILE[GRASS_ID*6]:-1,GRASS_OVERLAY_TILE=tile('grass_block_side_overlay');
export const SNOWY_SIDE_TILE=tile('grass_block_snow');
