export type Point = {x:number;y:number};
/** One species: physics and art share sprite coordinates (y down, origin near the body middle).
 * `shapes` are hand-authored convex pieces; limb gaps stay empty. `art` is inner SVG markup in the
 * same coordinates; every `id` in it must start with the species key so preview sheets stay valid. */
export interface SpeciesDef {
 name:string;
 /** Matter mass. Existing range: penguin 1.4 … elephant 5.8. */
 mass:number;
 /** Representative body colour. */
 color:string;
 shapes:Point[][];
 art:string;
 /** Optional sprite box override when art reaches beyond the colliders (antlers, tails, plumes). */
 box?:{x:number;y:number;width:number;height:number};
}
export const poly=(...xy:number[]):Point[]=>Array.from({length:xy.length/2},(_,i)=>({x:xy[i*2],y:xy[i*2+1]}));
const PAD=10;
/** Sprite box in body coordinates: collider bounds plus stroke padding unless the species overrides it. */
export function speciesBox(def:SpeciesDef){
 if(def.box)return def.box;
 const xs=def.shapes.flat().map(p=>p.x),ys=def.shapes.flat().map(p=>p.y);
 const x=Math.floor(Math.min(...xs))-PAD,y=Math.floor(Math.min(...ys))-PAD;
 return {x,y,width:Math.ceil(Math.max(...xs))+PAD-x,height:Math.ceil(Math.max(...ys))+PAD-y};
}
