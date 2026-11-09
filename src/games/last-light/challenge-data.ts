import type {Hazard,Platform} from './levels';
import {CAMPAIGN_ROUTES} from './route-data';

/** Hazards belong to authored encounters, never a stage-number formula.
 * Station ledges are quiet; engine gates beyond wheels can be shut down.
 * Saw travel is its full amplitude, so the approach includes that space. */
export function applyChallenge(index:number,platforms:Platform[],_mainCount:number):{hazards:Hazard[];pressure?:number;wind?:number} {
 const challenge=CAMPAIGN_ROUTES[index];
 // A short catch needs a real landing zone. Keep only the outgoing spike
 // patch when old layouts bracketed a small deck with two separate patches.
 // Existing collision volumes only disappear; the surviving patch never moves.
 const retained=new Map<number,typeof challenge.hazards[number]>();
 for(const h of challenge.hazards)if(h.kind==='spikes'&&platforms[h.ledge].w<=180){
  const before=retained.get(h.ledge),direction=Math.sign(platforms[h.ledge].x-(platforms[h.ledge-1]?.x??0))||1;
  if(!before||direction*(h.at-before.at)>0)retained.set(h.ledge,h);
 }
 const placements=challenge.hazards.filter(h=>h.kind!=='spikes'||platforms[h.ledge].w>180||retained.get(h.ledge)===h);
 const hazards=placements.map(({ledge,at,kind,height,width,travel,period,offset,disabledBy,duty}):Hazard=>{
  const p=platforms[ledge];
  return {kind,platform:p.id,x:p.x+p.w*at-width/2,y:p.y-height-(kind==='saw'?12:0),w:width,h:height,travel,period,offset,disabledBy,duty};
 });
 return {hazards,pressure:challenge.pressure,wind:challenge.wind};
}
