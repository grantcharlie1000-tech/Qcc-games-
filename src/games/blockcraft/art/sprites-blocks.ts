// Isometric block icons, rendered in software from atlas tiles (no canvas, so it runs in Node tests too).
// The projection is vanilla's GUI block transform: the model is turned 225° about y and tilted 30° down,
// scaled to 10/16 of the slot, so the top face is a 2:1 rhombus and the side edges are cos 30° tall.
// Visible faces: top (+y), left (+z, south) and right (+x, east), shaded 100 / 80 / 60 %. Each pixel casts an
// orthographic ray through the block's boxes and composites the hit faces front to back, so cutout tiles
// (glass) show the far faces through their holes and translucent tiles (ice) blend.
import {BLOCKS,TILE,TILE_ALPHA,stairsBoxes,type BlockDef,type TintKind} from '../data/blocks';
import {BIOME_BY_NAME} from '../data/biomes';
import {tilePixels} from './atlas';

/** Brightness of each face as seen in the inventory; `back` is the inside of a far face seen through a cutout. */
export const FACE_SHADE={top:1,left:.8,right:.6,back:.55,bottom:.5} as const;
const plains=BIOME_BY_NAME.get('plains');
/** Tints applied to biome-tinted tiles in icons: the plains colours, as on the plains grass around spawn. */
export const ICON_TINTS:Record<Exclude<TintKind,'none'>,number>={grass:plains?.grass??0x91bd59,foliage:plains?.foliage??0x77ab2f,water:plains?.water??0x3f76e4};
/** Fraction of the slot the block's edge spans (vanilla GUI scale 0.625). */
const BLOCK_SCALE=.625;
// Camera basis in block space: c points from the block toward the viewer, r is screen right, u screen up.
const SIN=Math.sin(Math.PI/6),COS=Math.cos(Math.PI/6),R2=Math.SQRT1_2;
const C=[COS*R2,SIN,COS*R2],RIGHT=[R2,0,-R2],UP=[-SIN*R2,COS,-SIN*R2];

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
// Face order +x,-x,+y,-y,+z,-z: shade of each as seen from the icon camera.
const SHADES=[FACE_SHADE.right,FACE_SHADE.back,FACE_SHADE.top,FACE_SHADE.bottom,FACE_SHADE.left,FACE_SHADE.back];
/** Texel column/row of a point on a face, with each face's tile upright as seen from outside the block
 *  (tops have north up, matching the mesher's convention). */
function texel(face:number,x:number,y:number,z:number):[number,number]{
  const t=(v:number)=>Math.min(TILE-1,Math.max(0,Math.floor(v*TILE)));
  switch(face){
    case 0:return[t(1-z),t(1-y)];
    case 1:return[t(z),t(1-y)];
    case 2:return[t(x),t(z)];
    case 3:return[t(x),t(1-z)];
    case 4:return[t(x),t(1-y)];
    default:return[t(1-x),t(1-y)];
  }
}
/** RGBA icon (size×size) of a block state as an isometric model. `tiles` supplies tile pixels (default the atlas). */
export function renderBlockIcon(def:BlockDef,size:number,tiles:TileSource=tilePixels):Uint8ClampedArray{
  const out=new Uint8ClampedArray(size*size*4),boxes=iconBoxes(def),k=size*BLOCK_SCALE;
  const cache=new Map<string,Uint8ClampedArray>(),pixels=(name:string)=>{let p=cache.get(name);if(!p){p=tiles(name);cache.set(name,p);}return p;};
  const tint=def.tiles.map((_,f)=>def.tint!=='none'&&def.tintFaces[f]?ICON_TINTS[def.tint]:0xffffff);
  const hits:{t:number;face:number}[]=[];
  const d=[-C[0],-C[1],-C[2]];
  for(let py=0;py<size;py++)for(let px=0;px<size;px++){
    // Point on the view plane through the block centre, then back along the view direction.
    const sx=(px+.5-size/2)/k,sy=-(py+.5-size/2)/k;
    const o=[.5+sx*RIGHT[0]+sy*UP[0]+C[0]*4,.5+sx*RIGHT[1]+sy*UP[1]+C[1]*4,.5+sx*RIGHT[2]+sy*UP[2]+C[2]*4];
    hits.length=0;
    for(let b=0;b<boxes.length;b+=6){
      let enter=-Infinity,exit=Infinity,inFace=0,outFace=0;
      for(let a=0;a<3;a++){
        // d is negative on every axis: rays enter through max faces and leave through min faces.
        const tIn=(boxes[b+3+a]-o[a])/d[a],tOut=(boxes[b+a]-o[a])/d[a];
        if(tIn>enter){enter=tIn;inFace=a*2;}
        if(tOut<exit){exit=tOut;outFace=a*2+1;}
      }
      if(enter<exit-1e-9){
        // Face indices: axis 0 → +x 0/-x 1, axis 1 → +y 2/-y 3, axis 2 → +z 4/-z 5.
        hits.push({t:enter,face:[0,2,4][inFace/2]},{t:exit,face:[1,3,5][(outFace-1)/2]});
      }
    }
    if(!hits.length)continue;
    hits.sort((a,b)=>a.t-b.t);
    let r=0,g=0,bl=0,alpha=0;
    for(const hit of hits){
      const x=o[0]+d[0]*hit.t,y=o[1]+d[1]*hit.t,z=o[2]+d[2]*hit.t,tile=def.tiles[hit.face];
      if(!tile)continue;
      const [col,row]=texel(hit.face,x,y,z),src=pixels(tile),i=(row*TILE+col)*4,mode=TILE_ALPHA.get(tile)??'opaque';
      let a=src[i+3]/255;
      if(mode==='opaque')a=1;else if(mode==='cutout')a=a>=.5?1:0;
      if(!a)continue;
      const tc=tint[hit.face],shade=SHADES[hit.face],w=(1-alpha)*a;
      r+=w*src[i]*((tc>>16&255)/255)*shade;g+=w*src[i+1]*((tc>>8&255)/255)*shade;bl+=w*src[i+2]*((tc&255)/255)*shade;
      alpha+=w;
      if(alpha>.999)break;
    }
    if(alpha<=0)continue;
    const j=(py*size+px)*4;
    out[j]=Math.round(r/alpha);out[j+1]=Math.round(g/alpha);out[j+2]=Math.round(bl/alpha);out[j+3]=Math.round(Math.min(1,alpha)*255);
  }
  return out;
}
