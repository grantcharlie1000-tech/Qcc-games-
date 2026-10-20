// Positional audio maths (pure). Vanilla Minecraft plays world sounds through OpenAL's linear
// distance model with reference distance 0 and max distance 16 × max(1, volume): gain falls
// linearly from 1 at the listener to 0 at the range. The listener is the camera (player eye).
import type {Vec3} from '../engine/contracts';

/** Blocks at which a sound of volume ≤ 1 becomes silent. */
export const ATTENUATION_DISTANCE=16;
/** How far apart the ears are heard: full left/right placement is softened so both ears hear a sound. */
const PAN_WIDTH=.85;
/** Within this distance of the head a sound drifts back to the centre (no flipping between ears). */
const NEAR=1.5;

/** Attenuation range in blocks: 16 × max(1, volume) (explosions at volume 4 carry 64 blocks). */
export function rangeFor(volume:number):number{return ATTENUATION_DISTANCE*Math.max(1,volume);}

/** Linear falloff: 1 at the listener, 0 at `range` and beyond. */
export function attenuation(distance:number,range:number):number{
  if(!(range>0))return 0;
  const g=1-distance/range;
  return g>0?Math.min(1,g):0;
}

/** Stereo pan -1 (left) .. 1 (right) of a source at offset (dx,dy,dz) from the eye for a player yaw.
 *  Yaw 0 looks north (-z) and positive yaw turns left, so the right ear points along (cos yaw, 0, -sin yaw). */
export function stereoPan(dx:number,dy:number,dz:number,yaw:number):number{
  const d=Math.sqrt(dx*dx+dy*dy+dz*dz);
  if(!(d>1e-6))return 0;
  const side=(dx*Math.cos(yaw)-dz*Math.sin(yaw))/d;
  const near=d<NEAR?d/NEAR:1;
  const p=side*PAN_WIDTH*near;
  return p>1?1:p<-1?-1:p;
}

export interface Spatial{gain:number;pan:number;distance:number}
/** Gain and pan of a source at `at` heard from `eye` with yaw `yaw` (fills `out` when given). */
export function spatialize(at:Vec3,eye:Vec3,yaw:number,range:number,out:Spatial={gain:0,pan:0,distance:0}):Spatial{
  const dx=at.x-eye.x,dy=at.y-eye.y,dz=at.z-eye.z;
  out.distance=Math.sqrt(dx*dx+dy*dy+dz*dz);
  out.gain=attenuation(out.distance,range);
  out.pan=stereoPan(dx,dy,dz,yaw);
  return out;
}
