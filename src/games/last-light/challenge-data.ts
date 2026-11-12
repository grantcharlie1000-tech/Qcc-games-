import type {Hazard,Platform} from './levels';
import {CAMPAIGN_ROUTES} from './route-data';

/** Hazards belong to authored encounters, never a stage-number formula.
 * Station ledges are quiet; engine gates beyond wheels can be shut down.
 * Saw travel is its full amplitude, so the approach includes that space. */
export function applyChallenge(index:number,platforms:Platform[],_mainCount:number):{hazards:Hazard[];pressure?:number;wind?:number} {
 const challenge=CAMPAIGN_ROUTES[index];
 // A short catch has one readable obstacle and an open approach. A second
 // emitter/spike on the same tiny deck can trap the player between cycles.
 const retained=new Map<number,typeof challenge.hazards[number]>();
 for(const h of challenge.hazards)if(platforms[h.ledge].w<200){
  const before=retained.get(h.ledge),direction=Math.sign(platforms[h.ledge].x-(platforms[h.ledge-1]?.x??0))||1;
  if(!before||direction*(h.at-before.at)>0)retained.set(h.ledge,h);
 }
 const placements=challenge.hazards.filter(h=>platforms[h.ledge].w>=200||retained.get(h.ledge)===h);
 const hazards=placements.map(({ledge,at,kind,height,width,travel,period,offset,disabledBy,duty,art}):Hazard=>{
  const p=platforms[ledge],hazard:Hazard={kind,platform:p.id,x:p.x+p.w*at-width/2,y:p.y-height-(kind==='saw'?12:0),w:width,h:kind==='crusher'?18:height,travel,period,offset,disabledBy,duty};
  // The art rides on the hazard (and on every moved copy of it) to the painter.
  return art?Object.assign(hazard,{art}):hazard;
 });
 return {hazards,pressure:challenge.pressure,wind:challenge.wind};
}
