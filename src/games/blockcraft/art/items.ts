// STUB item art (owned by the item art agent, who paints every name in ITEM_SPRITES as original
// 16×16 pixel art). Also renders item icons for the UI: sprites, flat block tiles and isometric
// block cubes.
import {ITEM_SPRITES,itemDef,type ItemIcon} from '../data/items';
import {blockDef,BLOCK_BY_NAME,TILE} from '../data/blocks';
import {tilePixels} from './atlas';

export type SpritePainter=(x:number,y:number)=>[number,number,number,number];
export const SPRITE_PAINTERS:Record<string,SpritePainter>={};
function hashName(name:string){let h=2166136261;for(let i=0;i<name.length;i++)h=Math.imul(h^name.charCodeAt(i),16777619);return h>>>0;}
function placeholder(name:string):SpritePainter{
  const h=hashName(name),r=80+(h&127),g=80+((h>>8)&127),b=80+((h>>16)&127);
  return(x,y)=>Math.abs(x-7.5)+Math.abs(y-7.5)<7?[r,g,b,255]:[0,0,0,0];
}
/** 16×16 RGBA pixels of an item sprite, top row first. */
export function spritePixels(name:string):Uint8ClampedArray{
  const paint=SPRITE_PAINTERS[name]??placeholder(name),out=new Uint8ClampedArray(TILE*TILE*4);
  for(let y=0;y<TILE;y++)for(let x=0;x<TILE;x++){const c=paint(x,y),i=(y*TILE+x)*4;out[i]=c[0];out[i+1]=c[1];out[i+2]=c[2];out[i+3]=c[3];}
  return out;
}
export const SPRITE_NAMES=ITEM_SPRITES;
const cache=new Map<string,string>();
/** Data URL of an item's inventory icon (32×32 for crisp scaling). */
export function iconUrl(itemId:string):string{
  const hit=cache.get(itemId);if(hit)return hit;
  const def=itemDef(itemId),canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;
  const ctx=canvas.getContext('2d');
  if(def&&ctx)drawIcon(ctx,def.icon);
  const url=canvas.toDataURL();cache.set(itemId,url);return url;
}
function toCanvas(pixels:Uint8ClampedArray){
  const c=document.createElement('canvas');c.width=TILE;c.height=TILE;
  c.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels),TILE,TILE),0,0);return c;
}
function drawIcon(ctx:CanvasRenderingContext2D,icon:ItemIcon){
  ctx.imageSmoothingEnabled=false;
  if(icon.kind==='sprite'){ctx.drawImage(toCanvas(spritePixels(icon.sprite)),0,0,32,32);return;}
  if(icon.kind==='tile'){ctx.drawImage(toCanvas(tilePixels(icon.tile)),0,0,32,32);return;}
  // Isometric cube: top, left (south) and right (east) faces with shading.
  const def=BLOCK_BY_NAME.get(icon.block)??blockDef(0),[east,,top,,south]=def.tiles;
  const faces:[string,number,DOMMatrix][]= [
    [top,1,new DOMMatrix([1,.5,-1,.5,16,1].map(v=>v) as unknown as number[])],
    [south,.8,new DOMMatrix([1,.5,0,1,0,9])],
    [east,.62,new DOMMatrix([1,-.5,0,1,16,17])]];
  for(const [tile,shade,m] of faces){
    if(!tile)continue;
    ctx.save();ctx.setTransform(m.a,m.b,m.c,m.d,m.e,m.f);
    ctx.drawImage(toCanvas(tilePixels(tile)),0,0,TILE,TILE);
    ctx.fillStyle=`rgba(0,0,0,${1-shade})`;ctx.fillRect(0,0,TILE,TILE);ctx.restore();
  }
}
