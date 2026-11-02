// Edge-only lens profile shared by the WebGL renderer's shader and its tests.
// A rounded rectangle's signed distance gives the depth inside the rim and the
// outward normal. Within `band` CSS px of the rim the sample point moves inward
// by bend*e(t), with e(t)=1-3t²+2t³ (t = depth/band). The centre is flat.
// bend/band <= 2/3 keeps sampling monotonic along straight edges (no folding).

export interface LensPreset{radius:number;band:number;bend:number;softness:number;saturation:number}

/** Research presets (CSS px). Softness is a 5-tap offset, not a Gaussian sigma. */
export const LENS_PRESETS={
  button:{radius:24,band:8,bend:4.5,softness:.3,saturation:1.08},
  dock:{radius:32,band:10,bend:6,softness:.6,saturation:1.08},
  sheet:{radius:28,band:14,bend:8,softness:.6,saturation:1.08},
} as const satisfies Record<string,LensPreset>;

export const MAX_BEND_RATIO=2/3;

/** e(t)=1-3t²+2t³ on [0,1]: 1 at the rim, 0 (with zero slope) at the inner edge of the band. */
export function edgeFactor(t:number):number{
  const x=Math.min(1,Math.max(0,t));
  return 1-x*x*(3-2*x);
}

/** Keeps a preset inside the non-folding range and the surface's own geometry. */
export function fitPreset(preset:LensPreset,width:number,height:number,radius=preset.radius):LensPreset{
  const r=Math.max(0,Math.min(radius,width/2,height/2));
  // The band cannot exceed the half-thickness, or opposite rims would overlap.
  const band=Math.max(.5,Math.min(preset.band,Math.min(width,height)/2));
  const bend=Math.max(0,Math.min(preset.bend,band*MAX_BEND_RATIO));
  return {...preset,radius:r,band,bend};
}

/** Signed distance from a point (relative to the centre) to a rounded rectangle, with its outward normal. */
export function roundedRectField(px:number,py:number,width:number,height:number,radius:number):{sd:number;nx:number;ny:number}{
  const r=Math.max(0,Math.min(radius,width/2,height/2));
  const qx=Math.abs(px)-(width/2-r),qy=Math.abs(py)-(height/2-r);
  const ax=Math.max(qx,0),ay=Math.max(qy,0),len=Math.hypot(ax,ay);
  const sd=len+Math.min(Math.max(qx,qy),0)-r;
  let nx=0,ny=0;
  if(len>1e-6){nx=ax/len*Math.sign(px);ny=ay/len*Math.sign(py);}
  else if(qx>qy)nx=Math.sign(px)||1;
  else ny=Math.sign(py)||1;
  return {sd,nx,ny};
}

/** Sampling offset at a point (CSS px relative to the lens centre). Zero outside the lens and in the flat centre. */
export function lensOffset(px:number,py:number,width:number,height:number,preset:LensPreset):{dx:number;dy:number;inside:boolean}{
  const {sd,nx,ny}=roundedRectField(px,py,width,height,preset.radius);
  if(sd>0)return {dx:0,dy:0,inside:false};
  const e=edgeFactor(-sd/Math.max(preset.band,.001));
  return {dx:-nx*preset.bend*e,dy:-ny*preset.bend*e,inside:true};
}

/** The glass buffer density: 1-1.5 device px per CSS px, independent of DPR 2-3 phones. */
export function glassDensity(devicePixelRatio:number):number{
  return Math.min(1.5,Math.max(1,devicePixelRatio||1));
}
