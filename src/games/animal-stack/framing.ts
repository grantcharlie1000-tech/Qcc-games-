export interface CameraFrame {previous:number;stackTop:number;cutoutTop:number;top:number;scale:number;immediate:boolean}
export const HUD_SAFE_TOP=84;
/** A rendering-only floor: preserve world scale/coordinates while keeping the whole cutout clear of HUD.
 * Clamp even the first eased frame after restore/rotation/resize, including stroke/curve padding. */
export function frameCamera({previous,stackTop,cutoutTop,top,scale,immediate}:CameraFrame){
 if(!Number.isFinite(scale)||scale<=0)return Math.max(0,previous);
 const safety=(HUD_SAFE_TOP-top)/scale-(Math.min(stackTop,cutoutTop)-4);
 const target=Math.max(0,220-stackTop,safety);
 return Math.max(0,safety,immediate?target:previous+(target-previous)*.09);
}
