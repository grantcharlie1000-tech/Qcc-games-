// Item art: every name in ITEM_SPRITES painted as 16×16 pixel art in the vanilla style (art/sprites-*.ts),
// and the inventory icons the UI shows for every item: sprites, flat block tiles (plants, torches, ladders)
// and isometric block models (art/sprites-blocks.ts). Pixels are computed without a canvas; data URLs use the
// browser canvas when there is one and a small PNG encoder otherwise. Everything is cached.
import {ITEM_SPRITES,itemDef} from '../data/items';
import {BLOCK_BY_NAME,TILE} from '../data/blocks';
import {tilePixels} from './atlas';
import type {Sprite} from './sprites-core';
import {TOOL_SPRITES} from './sprites-tools';
import {ARMOUR_SPRITES} from './sprites-armour';
import {MATERIAL_SPRITES} from './sprites-materials';
import {FOOD_SPRITES} from './sprites-food';
import {MISC_SPRITES} from './sprites-misc';
import {renderBlockIcon,tileTint} from './sprites-blocks';
import {pngDataUrl} from './sprites-png';

/** Side of the square inventory icons in pixels (16 texels × 4: crisp at every GUI scale with pixelated scaling). */
export const ICON_SIZE=64;
export type {Sprite as SpritePainter};
/** Painter of every sprite: all ITEM_SPRITES plus item icons for blocks whose tile is not a picture (lantern). */
export const SPRITE_PAINTERS:Readonly<Record<string,Sprite>>={...TOOL_SPRITES,...ARMOUR_SPRITES,...MATERIAL_SPRITES,...FOOD_SPRITES,...MISC_SPRITES};
export const SPRITE_NAMES=ITEM_SPRITES;
/** Items drawn with their own sprite instead of their block tile: the lantern tile is the model's UV sheet. */
const ICON_SPRITE:Record<string,string>={lantern:'lantern'};

export const hasSprite=(name:string)=>Object.prototype.hasOwnProperty.call(SPRITE_PAINTERS,name);
const EMPTY=new Uint8ClampedArray(TILE*TILE*4);
const sprites=new Map<string,Uint8ClampedArray>();
/** 16×16 RGBA pixels of an item sprite, top row first (held and dropped items, particles). Cached and shared:
 *  treat as read-only. Unknown names give a transparent sprite. */
export function spritePixels(name:string):Uint8ClampedArray{
  let p=sprites.get(name);
  if(!p){p=hasSprite(name)?SPRITE_PAINTERS[name]():EMPTY;sprites.set(name,p);}
  return p;
}
/** Nearest-neighbour scale of a 16×16 image to size×size, multiplying rgb by `tint` (0xRRGGBB). */
function upscale(src:Uint8ClampedArray,size:number,tint=0xffffff):Uint8ClampedArray{
  const out=new Uint8ClampedArray(size*size*4),tr=tint>>16&255,tg=tint>>8&255,tb=tint&255;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const i=((y*TILE/size|0)*TILE+(x*TILE/size|0))*4,j=(y*size+x)*4;if(!src[i+3])continue;
    out[j]=Math.round(src[i]*tr/255);out[j+1]=Math.round(src[i+1]*tg/255);out[j+2]=Math.round(src[i+2]*tb/255);out[j+3]=src[i+3];
  }
  return out;
}
/** RGBA pixels (size×size, top row first) of an item's inventory icon; transparent for unknown items. */
export function iconPixels(itemId:string,size=ICON_SIZE):Uint8ClampedArray{
  const def=itemDef(itemId);
  if(!def)return new Uint8ClampedArray(size*size*4);
  const own=ICON_SPRITE[itemId];
  if(own)return upscale(spritePixels(own),size);
  const icon=def.icon;
  if(icon.kind==='sprite')return upscale(spritePixels(icon.sprite),size);
  if(icon.kind==='tile')return upscale(tilePixels(icon.tile),size,tileTint(icon.tile)??0xffffff);
  const block=BLOCK_BY_NAME.get(icon.block);
  return block?renderBlockIcon(block,size):new Uint8ClampedArray(size*size*4);
}
/** A PNG data URL through the browser canvas (compressed), or the built-in encoder when there is no canvas. */
function dataUrl(pixels:Uint8ClampedArray,size:number):string{
  if(typeof document!=='undefined'&&typeof ImageData!=='undefined'){
    try{
      const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;
      const ctx=canvas.getContext('2d');
      if(ctx){
        ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels),size,size),0,0);
        const url=canvas.toDataURL('image/png');
        if(url.startsWith('data:image/png'))return url;
      }
    }catch{/* fall back to the encoder */}
  }
  return pngDataUrl(size,size,pixels);
}
const urls=new Map<string,string>();
/** Data URL of an item's inventory icon (ICON_SIZE square), cached per item id. */
export function iconUrl(itemId:string):string{
  let url=urls.get(itemId);
  if(!url){url=dataUrl(iconPixels(itemId),ICON_SIZE);urls.set(itemId,url);}
  return url;
}
