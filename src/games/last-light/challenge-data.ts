import type {Hazard,Platform} from './levels';
import {CAMPAIGN_ROUTES} from './route-data';

/** Hazards belong to authored encounters, never a stage-number formula.
 * Station ledges are quiet; engine gates beyond wheels can be shut down.
 * Saw travel is its full amplitude, so the approach includes that space. */
export function applyChallenge(index:number,platforms:Platform[],_mainCount:number):{hazards:Hazard[];pressure?:number;wind?:number} {
 const challenge=CAMPAIGN_ROUTES[index];
 const hazards=challenge.hazards.map(({ledge,at,kind,height,width,travel,period,offset,disabledBy,duty}):Hazard=>{
  const p=platforms[ledge];
  return {kind,x:p.x+p.w*at-width/2,y:p.y-height-(kind==='saw'?12:0),w:width,h:height,travel,period,offset,disabledBy,duty};
 });
 return {hazards,pressure:challenge.pressure,wind:challenge.wind};
}
