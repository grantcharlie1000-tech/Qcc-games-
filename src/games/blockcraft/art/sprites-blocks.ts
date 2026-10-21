// Isometric block icons, rendered in software from atlas tiles (no canvas, so it runs in Node tests too).
// The projection is vanilla's GUI block transform: the model is turned 225° about y and tilted 30° down,
// scaled to 10/16 of the slot, so the top face is a 2:1 rhombus and the side edges are cos 30° tall.
// Visible faces: top (+y), left (+z, south) and right (+x, east), shaded 100 / 80 / 60 %. Each pixel casts an
// orthographic ray through the block's boxes and composites the front faces it enters, nearest first. Back faces
// are culled, as vanilla draws block items, so cutout tiles (glass) show the slot through their holes and
// translucent tiles (ice) cover it by their own alpha.
import {BLOCKS,TILE,TILE_ALPHA,stairsBoxes,type BlockDef,type TintKind} from '../data/blocks';
import {BIOME_BY_NAME} from '../data/biomes';
import {tilePixels} from './atlas';

/** Brightness of each visible face as seen in the inventory. */
export const FACE_SHADE={top:1,left:.8,right:.6} as const;
const plains=BIOME_BY_NAME.get('plains');
/** Tints applied to biome-tinted tiles in icons: the plains colours, as on the plains grass around spawn. */
export const ICON_TINTS:Record<Exclude<TintKind,'none'>,number>={grass:plains?.grass??0x91bd59,foliage:plains?.foliage??0x77ab2f,water:plains?.water??0x3f76e4};
/** Fraction of the slot the block's edge spans (vanilla GUI scale 0.625). */
const BLOCK_SCALE=.625;
// Camera basis in block space: C points from the block toward the viewer, R is screen right, U screen up.
// Rays travel along -C, which is negative on every axis, so they enter boxes through +x, +y and +z faces only.
const SIN=Math.sin(Math.PI/6),COS=Math.cos(Math.PI/6),R2=Math.SQRT1_2;
const CX=COS*R2,CY=SIN,CZ=COS*R2,RX=R2,RZ=-R2,UX=-SIN*R2,UY=COS,UZ=-SIN*R2;

/** Boxes [minX,minY,minZ,maxX,maxY,maxZ,...] in block units drawn for a block state's icon. */
export function iconBoxes(def:BlockDef):number[]{
  if(def.shape==='slab')return def.slab==='top'?[0,.5,0,1,1,1]:[0,0,0,1,.5,1];
  if(def.shape==='snow_layer')return[0,0,0,1,2/16,1];
  if(def.shape==='stairs'&&def.facing)return stairsBoxes(def.facing);
  if(def.shape==='cactus')return[1/16,0,1/16,15/16,1,15/16];
  if(def.shape==='farmland')return[0,0,0,1,15/16,1];
  if(def.shape==='bed')return[0,0,0,1,9/16,1];
  return[0,0,0,1,1,1];
}
/** The tint of a tile wherever a block draws it tinted, or null. */
export function tileTint(tile:string):number|null{
  for(const d of BLOCKS){
    if(d.tint==='none')continue;
    const f=d.tiles.findIndex((t,i)=>t===tile&&d.tintFaces[i]);
    if(f>=0)return ICON_TINTS[d.tint];
  }
  return null;
}
type TileSource=(name:string)=>Uint8ClampedArray;
const OPAQUE=0,CUTOUT=1,BLEND=2;
/** The visible faces in face order (+x, -x, +y, -y, +z, -z): right, top and left. */
const VISIBLE=[0,2,4] as const;
/** Texel index (0..TILE-1) of a coordinate in block units. */
const texel=(v:number)=>{const i=Math.floor(v*TILE);return i<0?0:i>=TILE?TILE-1:i;};
// Scratch shared by every call (grown when a shape has more boxes): entry distance and face of each box a ray
// enters, kept sorted nearest first.
let hitT=new Float64Array(4),hitFace=new Int8Array(4);

/** RGBA icon (size×size) of a block state as an isometric model. `tiles` supplies tile pixels (default the atlas).
 *  Tiles, alpha modes and tint × shade factors are resolved once per face, so the pixel loop allocates nothing. */
export function renderBlockIcon(def:BlockDef,size:number,tiles:TileSource=tilePixels):Uint8ClampedArray{
  const out=new Uint8ClampedArray(size*size*4),boxes=iconBoxes(def),nb=boxes.length,k=size*BLOCK_SCALE;
  if(hitT.length<nb/6){hitT=new Float64Array(nb/6);hitFace=new Int8Array(nb/6);}
  const src:(Uint8ClampedArray|null)[]=[null,null,null,null,null,null],mode=[0,0,0,0,0,0];
  const fr=[0,0,0,0,0,0],fg=[0,0,0,0,0,0],fb=[0,0,0,0,0,0],shade=[FACE_SHADE.right,0,FACE_SHADE.top,0,FACE_SHADE.left,0];
  const loaded=new Map<string,Uint8ClampedArray>();
  for(const f of VISIBLE){
    const tile=def.tiles[f];if(!tile)continue;
    let p=loaded.get(tile);if(!p){p=tiles(tile);loaded.set(tile,p);}
    src[f]=p;const m=TILE_ALPHA.get(tile);mode[f]=m==='cutout'?CUTOUT:m==='translucent'?BLEND:OPAQUE;
    const tint=def.tint!=='none'&&def.tintFaces[f]?ICON_TINTS[def.tint]:0xffffff;
    fr[f]=(tint>>16&255)/255*shade[f];fg[f]=(tint>>8&255)/255*shade[f];fb[f]=(tint&255)/255*shade[f];
  }
  const T=hitT,F=hitFace,half=size/2;
  for(let py=0;py<size;py++){
    const sy=-(py+.5-half)/k;
    for(let px=0;px<size;px++){
      // Point on the view plane through the block centre, moved back toward the viewer; the ray runs along -C.
      const sx=(px+.5-half)/k;
      const ox=.5+sx*RX+sy*UX+CX*4,oy=.5+sy*UY+CY*4,oz=.5+sx*RZ+sy*UZ+CZ*4;
      let n=0;
      for(let b=0;b<nb;b+=6){
        // Slab test: distances to the max planes (entry) and the min planes (exit) along each axis.
        const ex=(ox-boxes[b+3])/CX,ey=(oy-boxes[b+4])/CY,ez=(oz-boxes[b+5])/CZ;
        const xx=(ox-boxes[b])/CX,xy=(oy-boxes[b+1])/CY,xz=(oz-boxes[b+2])/CZ;
        let enter=ex,face=0;if(ey>enter){enter=ey;face=2;}if(ez>enter){enter=ez;face=4;}
        const exit=xx<xy?(xx<xz?xx:xz):(xy<xz?xy:xz);
        if(enter>=exit-1e-9)continue;
        let j=n++;while(j>0&&T[j-1]>enter){T[j]=T[j-1];F[j]=F[j-1];j--;}
        T[j]=enter;F[j]=face;
      }
      if(!n)continue;
      let r=0,g=0,bl=0,alpha=0;
      for(let h=0;h<n;h++){
        const face=F[h],s=src[face];if(!s)continue;
        const t=T[h],x=ox-CX*t,y=oy-CY*t,z=oz-CZ*t;
        // Tiles upright as seen from outside the block; tops have north up (the mesher's convention).
        const col=face===0?texel(1-z):texel(x),row=face===2?texel(z):texel(1-y);
        const i=(row*TILE+col)*4,m=mode[face];
        const a=m===OPAQUE?1:m===CUTOUT?(s[i+3]>=128?1:0):s[i+3]/255;
        if(!a)continue;
        const w=(1-alpha)*a;
        r+=w*s[i]*fr[face];g+=w*s[i+1]*fg[face];bl+=w*s[i+2]*fb[face];alpha+=w;
        if(alpha>.999)break;
      }
      if(alpha<=0)continue;
      const o=(py*size+px)*4;
      out[o]=Math.round(r/alpha);out[o+1]=Math.round(g/alpha);out[o+2]=Math.round(bl/alpha);out[o+3]=Math.round(Math.min(1,alpha)*255);
    }
  }
  return out;
}
