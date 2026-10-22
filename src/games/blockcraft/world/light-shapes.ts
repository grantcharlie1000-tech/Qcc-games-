// Light occlusion by block shape, as in vanilla Java (`useShapeForLightOcclusion`): slabs, stairs,
// snow layers and farmland have no light opacity, but light cannot cross a face where the two
// touching faces together cover the whole square. A bottom slab therefore lets sky light into its
// own cell from above but not down through its full bottom face, and a top slab next to a bottom
// slab closes the gap between them. Every other block uses only its light opacity.
//
// Faces are reduced to quadrant masks (2×2 grid per face), which is exact for the half-block shapes
// in the registry; partial strips (a snow layer's 2px side, farmland's 15/16 side) count only the
// quadrants they cover completely. Derived from the registry geometry, never hard-coded per block.
import {BLOCKS,COLLISION_BOXES,LIGHT_EMISSION,LIGHT_OPACITY,OPAQUE,OUTLINE_BOX,type BlockId,type Shape} from '../data/blocks';

/** Shapes whose geometry occludes light by face. */
export const LIGHT_OCCLUDING_SHAPES:ReadonlySet<Shape>=new Set<Shape>(['slab','stairs','snow_layer','farmland']);
/** Light class of an opaque cube: blocks all light, no face shapes (an emitting cube such as glowstone still shines out). */
export const OPAQUE_CLASS=15;
/** Per block id: 0 (no face occlusion), 1..14 (a face-shape class) or OPAQUE_CLASS. */
export const LIGHT_CLASS=new Uint8Array(256);
/** Per class and face (+x,-x,+y,-y,+z,-z): quadrant mask of the face, 15 = full face. Index class*6 + face. */
export const CLASS_FACES=new Uint8Array(16*6);

/** Quadrant mask of one face of a shape given as boxes [minX,minY,minZ,maxX,maxY,maxZ,...] in block units.
 *  Bit u + 2v covers [u/2,(u+1)/2] × [v/2,(v+1)/2] of the face plane, where u and v are the other two axes
 *  in x,y,z order (so both blocks sharing a face use the same quadrants). A quadrant counts when every
 *  1/16 pixel of it lies inside a box that touches the face plane. */
export function faceQuadrants(boxes:readonly number[],face:number):number{
  const axis=face>>1,positive=(face&1)===0,ua=axis===0?1:0,va=axis===2?1:2;
  let mask=0;
  for(let q=0;q<4;q++){
    const u0=(q&1)/2,v0=(q>>1)/2;
    let covered=true;
    for(let sv=0;sv<8&&covered;sv++)for(let su=0;su<8&&covered;su++){
      const pu=u0+(su+.5)/16,pv=v0+(sv+.5)/16;
      let hit=false;
      for(let b=0;b<boxes.length&&!hit;b+=6){
        const touches=positive?boxes[b+3+axis]>=1:boxes[b+axis]<=0;
        hit=touches&&pu>boxes[b+ua]&&pu<boxes[b+3+ua]&&pv>boxes[b+va]&&pv<boxes[b+3+va];
      }
      covered=hit;
    }
    if(covered)mask|=1<<q;
  }
  return mask;
}

/** True when light cannot cross from a cell of class `from` to its neighbour of class `to` through `face` of `from`. */
export function facesOcclude(from:number,to:number,face:number):boolean{
  return (CLASS_FACES[from*6+face]|CLASS_FACES[to*6+(face^1)])===15;
}

{
  const signatures=new Map<string,number>();
  for(const d of BLOCKS){
    if(OPAQUE[d.id]){LIGHT_CLASS[d.id]=OPAQUE_CLASS;continue;}
    if(!LIGHT_OCCLUDING_SHAPES.has(d.shape))continue;
    const boxes=COLLISION_BOXES[d.id].length?COLLISION_BOXES[d.id]:OUTLINE_BOX[d.id];
    const faces=[0,1,2,3,4,5].map(face=>faceQuadrants(boxes,face));
    if(faces.every(m=>m===0))continue;
    const key=faces.join();
    let cls=signatures.get(key);
    if(cls===undefined){
      // 14 classes fit in the working volume's nibble; further shapes fall back to opacity-only light.
      if(signatures.size>=OPAQUE_CLASS-1)continue;
      cls=signatures.size+1;signatures.set(key,cls);
      faces.forEach((m,face)=>{CLASS_FACES[cls!*6+face]=m;});
    }
    LIGHT_CLASS[d.id]=cls;
  }
}

/** True when replacing block `from` by `to` can change light anywhere: opacity, emission, opaqueness or the face shape
 *  that occludes light differ. (A bottom slab placed in open air has the same opacity as air but shades the cells below.)
 *  Meant for world/world.ts set() when it decides whether neighbours beyond the shared border need relighting: comparing
 *  only opacity and emission misses placing or removing slabs, stairs, snow layers and farmland. */
export function changesLight(from:BlockId,to:BlockId):boolean{
  return LIGHT_OPACITY[from]!==LIGHT_OPACITY[to]||LIGHT_EMISSION[from]!==LIGHT_EMISSION[to]||OPAQUE[from]!==OPAQUE[to]||LIGHT_CLASS[from]!==LIGHT_CLASS[to];
}
