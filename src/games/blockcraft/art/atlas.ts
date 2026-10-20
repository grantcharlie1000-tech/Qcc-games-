// STUB block atlas (owned by the block art agent, who paints every tile in TILE_NAMES as original
// 16×16 pixel art). This version keeps the first release's painters for common tiles and fills the
// rest with a generated placeholder so every tile renders.
import * as THREE from 'three';
import {hash3,Simplex} from '../world/noise';
import {TILE,ATLAS_COLUMNS,ATLAS_ROWS,TILE_NAMES} from '../data/blocks';

export const ATLAS_WIDTH=TILE*ATLAS_COLUMNS,ATLAS_HEIGHT=TILE*ATLAS_ROWS;
export type RGBA=[number,number,number,number?];
/** Paints one pixel of a tile: x,y in 0..15 (y down), n and m are two independent hash values in [0,1). */
export type Painter=(x:number,y:number,n:number,m:number)=>RGBA;
const scale=(c:RGBA,k:number):RGBA=>[c[0]*k,c[1]*k,c[2]*k,c[3]];

const DIRT:RGBA=[134,96,67],GREY_GRASS:RGBA=[150,150,150],STONE:RGBA=[125,125,125];
const dirt:Painter=(_x,_y,n,m)=>m<.1?[96,68,46]:m>.93?[164,122,90]:scale(DIRT,.88+n*.24);
const stone:Painter=(x,y,n)=>scale(STONE,(.88+n*.22)*(hash3(x>>1,y>>1,3,77)<.16?.84:1));
// Grass and leaves are painted grey and tinted per biome by the mesher.
const grassTop:Painter=(_x,_y,n,m)=>m>.9?[175,175,175]:scale(GREY_GRASS,.84+n*.3);
const ore=(colour:RGBA,salt:number):Painter=>(x,y,n,m)=>hash3((x+1)>>2,(y+2)>>2,salt,91)<.5&&hash3(x,y,salt,92)<.62&&(x+y+salt)%3!==0?scale(colour,.85+m*.3):stone(x,y,n,m);

export const PAINTERS:Record<string,Painter>={
  grass_block_top:grassTop,
  grass_block_side:(x,y,n,m)=>y<3+(hash3(x,0,1,5)<.55?1:0)?scale([110,170,70],.85+n*.25):dirt(x,y,n,m),
  dirt,stone,
  cobblestone:(x,y,n)=>{const row=y>>2,shift=(row%2)*2,mortar=y%4===3||(x+shift)%5===4;return mortar?scale([78,78,80],.9+n*.15):scale([146,146,148],.82+hash3((x+shift)/5|0,row,4,8)*.3+n*.08);},
  sand:(_x,_y,n)=>scale([219,207,142],.95+n*.09),
  oak_log:(x,_y,n)=>scale([106,82,48],(x%4===1?.78:1)*(.9+n*.18)),
  oak_log_top:(x,y,n)=>{const d=Math.max(Math.abs(x-7.5),Math.abs(y-7.5));return d>6.5?scale([106,82,48],.9+n*.15):scale(Math.floor(d)%2?[184,148,92]:[160,126,74],.94+n*.1);},
  oak_leaves:(_x,_y,n,m)=>m<.28?[70,70,70]:m>.92?[190,190,190]:scale([130,130,130],.8+n*.34),
  oak_planks:(x,y,n)=>{const row=y>>2,seam=x===(row*7+3)%16;return y%4===3||seam?scale([118,90,54],.95+n*.1):scale([178,140,86],.92+n*.14);},
  coal_ore:ore([38,38,40],1),iron_ore:ore([214,170,138],2),gold_ore:ore([250,215,60],3),diamond_ore:ore([90,225,220],4),
  snow:(_x,_y,n)=>scale([238,245,250],.95+n*.06),
  water_still:(x,y,n)=>((x+y*3)%11===0||(x*2+y)%13===0)?[220,220,220,200]:scale([190,190,190,190],.92+n*.12),
  bricks:(x,y,n)=>{const row=y>>2,mortar=y%4===3||(x+(row%2)*4)%8===7;return mortar?scale([192,182,170],.92+n*.1):scale([152,66,50],.86+n*.22);},
  bedrock:(_x,_y,n,m)=>scale([84,84,86],.45+n*.5+(m>.85?.3:0))
};
function hashName(name:string){let h=2166136261;for(let i=0;i<name.length;i++)h=Math.imul(h^name.charCodeAt(i),16777619);return h>>>0;}
/** Placeholder for unpainted tiles: a noisy colour derived from the name. */
function placeholder(name:string):Painter{
  const h=hashName(name),base:RGBA=[60+(h&127),60+((h>>8)&127),60+((h>>16)&127)];
  const cutout=/sapling|flower|grass$|fern|bush|mushroom|stage|torch|ladder|door|cane|lily|destroy/.test(name);
  return(x,y,n)=>{
    if(cutout&&(Math.abs(x-7.5)+Math.abs(y-7.5))>7)return[0,0,0,0];
    return scale(base,.8+n*.4);
  };
}
/** RGBA pixels of the whole atlas, top row first. */
export function paintAtlas():Uint8ClampedArray{
  const data=new Uint8ClampedArray(ATLAS_WIDTH*ATLAS_HEIGHT*4);
  TILE_NAMES.forEach((name,tile)=>{
    const paint=PAINTERS[name]??placeholder(name),ox=(tile%ATLAS_COLUMNS)*TILE,oy=Math.floor(tile/ATLAS_COLUMNS)*TILE;
    for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){
      const c=paint(x,y,hash3(x,y,tile,11),hash3(x,y,tile,29)),i=((oy+y)*ATLAS_WIDTH+ox+x)*4;
      data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=c[3]??255;
    }
  });
  return data;
}
let cached:Uint8ClampedArray|null=null;
export const atlasPixels=()=>cached??=paintAtlas();
/** RGBA pixels of one tile (16×16, top row first), for icons. */
export function tilePixels(name:string):Uint8ClampedArray{
  const tile=TILE_NAMES.indexOf(name),out=new Uint8ClampedArray(TILE*TILE*4);if(tile<0)return out;
  const atlas=atlasPixels(),ox=(tile%ATLAS_COLUMNS)*TILE,oy=Math.floor(tile/ATLAS_COLUMNS)*TILE;
  for(let y=0;y<TILE;y++)out.set(atlas.subarray(((oy+y)*ATLAS_WIDTH+ox)*4,((oy+y)*ATLAS_WIDTH+ox+TILE)*4),y*TILE*4);
  return out;
}
/** The atlas as a GPU texture (rows flipped for WebGL, nearest filtering, no colour conversion). */
export function paintAtlasTexture():THREE.DataTexture{
  const pixels=atlasPixels(),flipped=new Uint8Array(pixels.length),row=ATLAS_WIDTH*4;
  for(let y=0;y<ATLAS_HEIGHT;y++)flipped.set(pixels.subarray(y*row,(y+1)*row),(ATLAS_HEIGHT-1-y)*row);
  const texture=new THREE.DataTexture(flipped,ATLAS_WIDTH,ATLAS_HEIGHT,THREE.RGBAFormat);
  texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
  return texture;
}
/** Soft-edged blocky cloud mask (alpha only), tiling seamlessly. */
export function paintClouds(size=64):Uint8ClampedArray{
  const noise=new Simplex(4242),data=new Uint8ClampedArray(size*size*4),TAU=Math.PI*2;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const a=x/size*TAU,b=y/size*TAU,v=noise.noise3(Math.cos(a)*1.6,Math.sin(a)*1.6+Math.cos(b)*1.6,Math.sin(b)*1.6);
    const i=(y*size+x)*4;data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=v>.18?225:0;
  }
  return data;
}
