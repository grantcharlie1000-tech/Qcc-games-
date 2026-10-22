// Block atlas: every tile in TILE_NAMES painted as original 16×16 pixel art (art/tiles-*.ts) into a
// 256×256 RGBA atlas, plus the GPU texture and the cloud mask used by the renderer.
//
// Conventions the painters follow (see data/blocks.ts TILE_ALPHA and TINTED_TILES):
//  - opaque tiles are fully opaque; cutout tiles are alpha 0 outside the shape and 255 inside; translucent tiles
//    (water, ice) are semi-transparent everywhere. paintTile enforces these rules after painting.
//  - biome-tinted tiles (grass top and overlay, short grass, fern, sugar cane, lily pad, oak/jungle/acacia/dark oak
//    leaves, water) are grey; birch, spruce and cherry leaves and the grass block side band are pre-coloured.
//  - side tiles are upright (row 0 is the top of the block face); top tiles have north up.
//  - natural tiles (stone, earth, sand, ice, leaves, water, lava...) repeat every 16 px: greedy quads and the
//    renderer's fract() repeat them across many blocks, so every pattern period divides the tile (tested via `raw`).
//  - special layouts: the torch is a 2×10 stick in columns 7-8 / rows 6-15; the lantern follows the lantern model's
//    UV layout (see tiles-built.ts); bed tops have the head end on row 0.
import * as THREE from 'three';
import {TILE,ATLAS_COLUMNS,ATLAS_ROWS,TILE_NAMES,TILE_ALPHA,WOOD_TYPES,WOOL_COLOURS} from '../data/blocks';
import {type Painter,type RGBA,hash,hashN,hashName,shade} from './tiles-core';
import * as terrain from './tiles-terrain';
import {bark,logTop,planks,leaves,SAPLINGS} from './tiles-wood';
import * as plants from './tiles-plants';
import * as built from './tiles-built';
import {destroyStage} from './tiles-overlay';

export type {Painter,RGBA};
export const ATLAS_WIDTH=TILE*ATLAS_COLUMNS,ATLAS_HEIGHT=TILE*ATLAS_ROWS;

const woodPainters:Record<string,Painter>={};
for(const wood of WOOD_TYPES){
  woodPainters[`${wood}_log`]=bark(wood);woodPainters[`${wood}_log_top`]=logTop(wood);woodPainters[`${wood}_planks`]=planks(wood);
  woodPainters[`${wood}_leaves`]=leaves(wood);woodPainters[`${wood}_sapling`]=SAPLINGS[wood];
}
const woolPainters:Record<string,Painter>={};
WOOL_COLOURS.forEach((colour,i)=>{woolPainters[`${colour}_wool`]=built.wool(built.WOOL_HEX[colour],1200+i*10);});
const cropPainters:Record<string,Painter>={};
for(let s=0;s<8;s++)cropPainters[`wheat_stage${s}`]=plants.wheat(s);
for(let s=0;s<4;s++){cropPainters[`carrots_stage${s}`]=plants.carrots(s);cropPainters[`potatoes_stage${s}`]=plants.potatoes(s);}
const destroyPainters:Record<string,Painter>={};
for(let s=0;s<10;s++)destroyPainters[`destroy_stage_${s}`]=destroyStage(s);
const orePainters:Record<string,Painter>={};
['coal','iron','copper','gold','redstone','lapis','diamond','emerald'].forEach((name,i)=>{
  orePainters[`${name}_ore`]=terrain.ore(name,terrain.stone,1300+i*17);
  if(name!=='emerald')orePainters[`deepslate_${name}_ore`]=terrain.ore(name,terrain.deepslate,1500+i*19,.9);
});

/** One painter per tile name in TILE_NAMES. */
export const PAINTERS:Record<string,Painter>={
  stone:terrain.stone,granite:terrain.granite,diorite:terrain.diorite,andesite:terrain.andesite,
  cobblestone:terrain.cobblestone,mossy_cobblestone:terrain.mossyCobblestone,bedrock:terrain.bedrock,
  dirt:terrain.dirt,coarse_dirt:terrain.coarseDirt,
  grass_block_top:terrain.grassBlockTop,grass_block_side:terrain.grassBlockSide,grass_block_side_overlay:terrain.grassBlockSideOverlay,
  grass_block_snow:terrain.grassBlockSnow,podzol_top:terrain.podzolTop,podzol_side:terrain.podzolSide,
  mycelium_top:terrain.myceliumTop,mycelium_side:terrain.myceliumSide,
  sand:terrain.sand,red_sand:terrain.redSand,sandstone:terrain.sandstone,sandstone_top:terrain.sandstoneTop,sandstone_bottom:terrain.sandstoneBottom,
  red_sandstone:terrain.redSandstone,red_sandstone_top:terrain.redSandstoneTop,red_sandstone_bottom:terrain.redSandstoneBottom,
  gravel:terrain.gravel,clay:terrain.clay,snow:terrain.snow,ice:terrain.ice,packed_ice:terrain.packedIce,obsidian:terrain.obsidian,
  ...orePainters,
  deepslate:terrain.deepslate,deepslate_top:terrain.deepslateTop,cobbled_deepslate:terrain.cobbledDeepslate,tuff:terrain.tuff,
  copper_block:terrain.copperBlock,exposed_copper:terrain.exposedCopper,weathered_copper:terrain.weatheredCopper,oxidized_copper:terrain.oxidizedCopper,
  ...woodPainters,
  short_grass:plants.shortGrass,fern:plants.fern,dead_bush:plants.deadBush,
  dandelion:plants.dandelion,poppy:plants.poppy,blue_orchid:plants.blueOrchid,allium:plants.allium,cornflower:plants.cornflower,oxeye_daisy:plants.oxeyeDaisy,
  brown_mushroom:plants.brownMushroom,red_mushroom:plants.redMushroom,sugar_cane:plants.sugarCane,lily_pad:plants.lilyPad,
  cactus_side:plants.cactusSide,cactus_top:plants.cactusTop,cactus_bottom:plants.cactusBottom,
  pumpkin_side:plants.pumpkinSide,pumpkin_top:plants.pumpkinTop,melon_side:plants.melonSide,melon_top:plants.melonTop,moss_block:plants.mossBlock,
  ...cropPainters,
  farmland:terrain.farmlandDry,farmland_moist:terrain.farmlandMoist,
  water_still:terrain.waterStill,water_flow:terrain.waterFlow,lava_still:terrain.lavaStill,lava_flow:terrain.lavaFlow,
  crafting_table_top:built.craftingTableTop,crafting_table_side:built.craftingTableSide,crafting_table_front:built.craftingTableFront,
  furnace_side:built.furnaceSide,furnace_top:built.furnaceTop,furnace_front:built.furnaceFrontOff,furnace_front_on:built.furnaceFrontOn,
  chest_side:built.chestSide,chest_top:built.chestTop,chest_front:built.chestFront,
  torch:built.torch,glass:built.glass,bricks:built.bricks,stone_bricks:built.stoneBricks,mossy_stone_bricks:built.mossyStoneBricks,bookshelf:built.bookshelf,
  ...woolPainters,
  tnt_side:built.tntSide,tnt_top:built.tntTop,tnt_bottom:built.tntBottom,glowstone:built.glowstone,lantern:built.lantern,fire:built.fire,
  barrel_side:built.barrelSide,barrel_top:built.barrelTop,barrel_bottom:built.barrelBottom,
  iron_block:built.ironBlock,gold_block:built.goldBlock,diamond_block:built.diamondBlock,emerald_block:built.emeraldBlock,
  lapis_block:built.lapisBlock,coal_block:built.coalBlock,redstone_block:built.redstoneBlock,
  ladder:built.ladder,
  bed_foot_side:built.bedFootSide,bed_foot_top:built.bedFootTop,bed_foot_end:built.bedFootEnd,
  bed_head_side:built.bedHeadSide,bed_head_top:built.bedHeadTop,bed_head_end:built.bedHeadEnd,
  oak_door_bottom:built.oakDoorBottom,oak_door_top:built.oakDoorTop,
  ...destroyPainters
};

/** Fallback for a tile name without a painter (a registry tile added before its art): a noisy colour derived
 *  from the name, diamond-shaped for names that look like cutout plants. Every current tile has a painter. */
export function placeholder(name:string):Painter{
  const h=hashName(name),base:RGBA=[60+(h&127),60+((h>>8)&127),60+((h>>16)&127)];
  const cutout=/sapling|flower|grass$|fern|bush|mushroom|stage|torch|ladder|door|cane|lily|destroy/.test(name);
  return(x,y,n)=>cutout&&(Math.abs(x-7.5)+Math.abs(y-7.5))>7?[0,0,0,0]:shade(base,.8+n*.4);
}
/** RGBA pixels of one tile (16×16, top row first) from its painter (or `painter`), with TILE_ALPHA enforced:
 *  opaque → 255, cutout → 0 or 255, translucent → 64..240. */
export function paintTile(name:string,painter:Painter=PAINTERS[name]??placeholder(name)):Uint8ClampedArray{
  const out=new Uint8ClampedArray(TILE*TILE*4),salt=hashName(name)&0xffff,mode=TILE_ALPHA.get(name)??'opaque';
  for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){
    const c=painter(x,y,hash(x,y,salt),hash(x,y,salt+1)),i=(y*TILE+x)*4;let a=c[3]??255;
    if(mode==='opaque')a=255;else if(mode==='cutout')a=a>=128?255:0;else a=Math.max(64,Math.min(240,a));
    out[i]=c[0];out[i+1]=c[1];out[i+2]=c[2];out[i+3]=a;
    if(!a){out[i]=0;out[i+1]=0;out[i+2]=0;}
  }
  return out;
}
/** RGBA pixels of the whole atlas, top row first. */
export function paintAtlas():Uint8ClampedArray{
  const data=new Uint8ClampedArray(ATLAS_WIDTH*ATLAS_HEIGHT*4);
  TILE_NAMES.forEach((name,tile)=>{
    const pixels=paintTile(name),ox=(tile%ATLAS_COLUMNS)*TILE,oy=Math.floor(tile/ATLAS_COLUMNS)*TILE;
    for(let y=0;y<TILE;y++)data.set(pixels.subarray(y*TILE*4,(y+1)*TILE*4),((oy+y)*ATLAS_WIDTH+ox)*4);
  });
  return data;
}
let cached:Uint8ClampedArray|null=null;
export const atlasPixels=()=>cached??=paintAtlas();
/** RGBA pixels of one tile (16×16, top row first), for icons. Unknown names give a transparent tile. */
export function tilePixels(name:string):Uint8ClampedArray{
  const tile=TILE_NAMES.indexOf(name),out=new Uint8ClampedArray(TILE*TILE*4);if(tile<0)return out;
  const atlas=atlasPixels(),ox=(tile%ATLAS_COLUMNS)*TILE,oy=Math.floor(tile/ATLAS_COLUMNS)*TILE;
  for(let y=0;y<TILE;y++)out.set(atlas.subarray(((oy+y)*ATLAS_WIDTH+ox)*4,((oy+y)*ATLAS_WIDTH+ox+TILE)*4),y*TILE*4);
  return out;
}
function flippedAtlas(){
  const pixels=atlasPixels(),flipped=new Uint8Array(pixels.length),row=ATLAS_WIDTH*4;
  for(let y=0;y<ATLAS_HEIGHT;y++)flipped.set(pixels.subarray(y*row,(y+1)*row),(ATLAS_HEIGHT-1-y)*row);
  return flipped;
}
/** The atlas as a GPU texture (rows flipped for WebGL, nearest filtering, no colour conversion). */
export function paintAtlasTexture():THREE.DataTexture{
  const texture=new THREE.DataTexture(flippedAtlas(),ATLAS_WIDTH,ATLAS_HEIGHT,THREE.RGBAFormat);
  texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  return texture;
}
/** Mip levels a tile keeps to itself: 16, 8, 4, 2 and 1 px per tile (vanilla Mipmap Levels 4). */
export const ATLAS_MIP_LEVELS=4;
/** The next mip level of an RGBA image: a 2x2 box filter weighted by alpha, so transparent texels never darken their
 *  neighbours. Tiles are 16 px and aligned, so up to ATLAS_MIP_LEVELS each tile is filtered on its own. */
export function mipLevel(src:Uint8Array,width:number,height:number):Uint8Array<ArrayBuffer>{
  const w=Math.max(1,width>>1),h=Math.max(1,height>>1),out=new Uint8Array(w*h*4);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let r=0,g=0,b=0,a=0,pr=0,pg=0,pb=0;
    for(let dy=0;dy<2;dy++)for(let dx=0;dx<2;dx++){
      const sx=Math.min(width-1,x*2+dx),sy=Math.min(height-1,y*2+dy),i=(sy*width+sx)*4,al=src[i+3];
      r+=src[i]*al;g+=src[i+1]*al;b+=src[i+2]*al;a+=al;pr+=src[i];pg+=src[i+1];pb+=src[i+2];
    }
    const o=(y*w+x)*4;
    if(a>0){out[o]=Math.round(r/a);out[o+1]=Math.round(g/a);out[o+2]=Math.round(b/a);}
    else{out[o]=Math.round(pr/4);out[o+1]=Math.round(pg/4);out[o+2]=Math.round(pb/4);}
    out[o+3]=Math.round(a/4);
  }
  return out;
}
/** The atlas with its whole mip chain, for terrain: distant faces and water fade to their tiles' average colours instead
 *  of aliasing into moire. Chunk shaders pick the level themselves (at most ATLAS_MIP_LEVELS) from the unwrapped tile
 *  coordinate, so greedy-tiled quads never jump a level at their tile wraps; close up it stays nearest-pixel sharp. */
export function paintAtlasMipTexture():THREE.DataTexture{
  let data:Uint8Array=flippedAtlas(),w=ATLAS_WIDTH,h=ATLAS_HEIGHT;
  const mipmaps:{data:Uint8Array;width:number;height:number}[]=[{data,width:w,height:h}];
  while(w>1||h>1){data=mipLevel(data,w,h);w=Math.max(1,w>>1);h=Math.max(1,h>>1);mipmaps.push({data,width:w,height:h});}
  const texture=new THREE.DataTexture(mipmaps[0].data as Uint8Array<ArrayBuffer>,ATLAS_WIDTH,ATLAS_HEIGHT,THREE.RGBAFormat);
  texture.mipmaps=mipmaps as unknown as THREE.DataTexture['mipmaps'];
  texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestMipmapLinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  return texture;
}
/** Blocky cloud mask: white texels at alpha 230 where there is cloud, 0 elsewhere, covering 40% of the sky.
 *  Tiles seamlessly (periodic noise), so the renderer can scroll it; each texel becomes one cloud cell. */
export function paintClouds(size=64):Uint8ClampedArray{
  const data=new Uint8ClampedArray(size*size*4),values=new Float32Array(size*size);
  const octave=(x:number,y:number,grid:number,salt:number)=>{
    const fx=x/size*grid,fy=y/size*grid,ix=Math.floor(fx),iy=Math.floor(fy),tx=fx-ix,ty=fy-iy,sx=tx*tx*(3-2*tx),sy=ty*ty*(3-2*ty);
    const v=(i:number,j:number)=>hashN(((i%grid)+grid)%grid,((j%grid)+grid)%grid,salt);
    const a=v(ix,iy),b=v(ix+1,iy),c=v(ix,iy+1),d=v(ix+1,iy+1);
    return a+(b-a)*sx+(c-a)*sy+(a-b-c+d)*sx*sy;
  };
  for(let y=0;y<size;y++)for(let x=0;x<size;x++)
    values[y*size+x]=octave(x,y,4,4242)*.55+octave(x,y,8,4243)*.3+octave(x,y,Math.min(16,size),4244)*.15;
  const threshold=Float32Array.from(values).sort()[Math.floor(size*size*.6)];
  for(let i=0;i<size*size;i++){data[i*4]=255;data[i*4+1]=255;data[i*4+2]=255;data[i*4+3]=values[i]>threshold?230:0;}
  return data;
}
