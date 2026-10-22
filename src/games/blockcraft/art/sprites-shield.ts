// The supplied portrait fills the original shield's wooden panel. The 16px silhouette still drives
// extrusion and particles; a 128px texture keeps the face readable in the hand and inventory.
import {sprite,edgesOf} from './sprites-core';
import {SHIELD_FACE_RGB} from './shield-face-data';

export const SHIELD_TEXTURE_SIZE=128;
const SCALE=8,FACE_WIDTH=64;
const ROWS=[
  '................',
  '...iiiiiiiiii...',
  '...iPPPPPPQQj...',
  '...iPPPPPPQQj...',
  '...ippppppqqj...',
  '...iPPPPPPQQj...',
  '...iPPPPPPQQj...',
  '...ippppppqqj...',
  '...iPPPPPPQQj...',
  '...iPPPPPPQQj...',
  '...ippppppqqj...',
  '....iPPPPPQj....',
  '....iPPPPPQj....',
  '.....jjjjjj.....',
  '................',
  '................'];
const plain=sprite(ROWS,{i:0xc4c4c4,j:0x8a8a8a,P:0xb08a52,p:0x86663a,Q:0x8f6f40,q:0x6c5030,O:0x2e2e2e},edgesOf('ijPpQq','O'));
let texture:Uint8ClampedArray|undefined;

/** Cached, top-row-first RGBA. Embedded RGB keeps loading synchronous and works offline. */
export function shieldTexturePixels():Uint8ClampedArray{
  if(texture)return texture;
  const face=atob(SHIELD_FACE_RGB),base=plain(),out=new Uint8ClampedArray(SHIELD_TEXTURE_SIZE*SHIELD_TEXTURE_SIZE*4);
  for(let y=0;y<SHIELD_TEXTURE_SIZE;y++)for(let x=0;x<SHIELD_TEXTURE_SIZE;x++){
    const sx=Math.floor(x/SCALE),sy=Math.floor(y/SCALE),i=(y*SHIELD_TEXTURE_SIZE+x)*4,b=(sy*16+sx)*4;
    out.set(base.subarray(b,b+4),i);
    if('PpQq'.includes(ROWS[sy][sx])){
      const f=((y-2*SCALE)*FACE_WIDTH+x-4*SCALE)*3;
      out[i]=face.charCodeAt(f);out[i+1]=face.charCodeAt(f+1);out[i+2]=face.charCodeAt(f+2);
    }
  }
  return texture=out;
}

/** The original hard-alpha silhouette with the portrait averaged to its 16px particle/geometry grid. */
export function shieldSprite():Uint8ClampedArray{
  const hi=shieldTexturePixels(),out=plain();
  for(let y=0;y<16;y++)for(let x=0;x<16;x++){
    if(!'PpQq'.includes(ROWS[y][x]))continue;
    const i=(y*16+x)*4;
    for(let c=0;c<3;c++){
      let sum=0;
      for(let dy=0;dy<SCALE;dy++)for(let dx=0;dx<SCALE;dx++)sum+=hi[((y*SCALE+dy)*SHIELD_TEXTURE_SIZE+x*SCALE+dx)*4+c];
      out[i+c]=Math.round(sum/(SCALE*SCALE));
    }
  }
  return out;
}
