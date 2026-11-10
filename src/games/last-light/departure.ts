import type {Level} from './levels';
import type {Run} from './model';
import {goalComposition,serviceDoor} from './composition';
export interface DepartureView {width:number;height:number;cameraX?:number;cameraY?:number}
const DEFAULT_VIEW={width:640,height:360};
/** How far the Old Quarter's counterweight lift rides from its landing to the hoist house floor. */
export const HOIST_RIDE=280;
export const clearDuration=(l:Level)=>l.goal==='ferry'?1.95:l.goal==='engine'?2.2:['relay','signal','dawn'].includes(l.goal)?1.65:1.25;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const p=clamp(v);return p*p*(3-2*p);};
export function departureProgress(l:Level,s:Run){return clamp((clearDuration(l)-s.cinematic)/clearDuration(l));}
export function departureVisibility(s:Run,reduced:boolean){return !reduced||s.phase==='playing'?1:1-smooth((.22-s.cinematic)/.22);}
/** Boats leave the viewport; building lifts travel to their upper landing. */
export function departureOffset(l:Level,s:Run,reduced:boolean,view:DepartureView=DEFAULT_VIEW){
 if(reduced||s.phase==='playing')return {x:0,y:0};
 const elapsed=clearDuration(l)-s.cinematic,art=goalComposition(l);
 if(l.goal==='ferry'){const p=clamp((elapsed-.62)/(clearDuration(l)-.62)),travel=p*p;const distance=view.cameraX===undefined?view.width+180:Math.max(160,view.cameraX+view.width+80-art.x);return {x:distance*travel,y:(l.setting==='sky'?-view.height*.36*travel:0)||0};}
 // The Old Quarter's hoist rides to a hoist house built a fixed storey above its lift landing, so it never outruns the building.
 if(l.goal==='engine'){const p=smooth((elapsed-.52)/.92),distance=l.world===0?HOIST_RIDE:Math.max(280,view.height*.75);return {x:0,y:-distance*p||0};}
 return {x:0,y:0};
}
/** Presentation only: progress/score were banked at the trigger. */
export function departurePose(l:Level,s:Run,reduced:boolean,view:DepartureView=DEFAULT_VIEW){
 const art=goalComposition(l),elapsed=clearDuration(l)-s.cinematic,offset=departureOffset(l,s,reduced,view);
 if(reduced)return {x:s.x,y:s.y,opacity:departureVisibility(s,reduced),action:'idle' as const,facing:s.facing};
 if(l.goal==='ferry'){
  const board=smooth(elapsed/.46),hop=elapsed<.46?Math.sin(Math.PI*clamp(elapsed/.46))*27:0,bob=Math.sin(s.clock*2)*2;
  return {x:s.x+(art.x-42-s.x)*board+offset.x,y:s.y+(art.y-36-s.y)*board-hop-bob*board+offset.y,opacity:1,settle:elapsed>=.46&&elapsed<.62?Math.sin((elapsed-.46)/.16*Math.PI):0,action:elapsed<.24?'rise' as const:elapsed<.46?'fall' as const:elapsed<.62?'land' as const:'idle' as const,facing:1};
 }
 if(l.goal==='engine'){
  const board=smooth(elapsed/.28),walk=smooth((elapsed-1.46)/.5);
  return {x:s.x+(art.x-8-s.x)*board+walk*106,y:s.y+(art.y-32-s.y)*board+offset.y,opacity:1-smooth((elapsed-1.97)/.16),action:elapsed<.28||elapsed>1.46?'run' as const:'idle' as const,facing:1};
 }

 const service=serviceDoor(l),door=service??{x:art.x,y:art.y,side:Math.sign(art.x-s.x)||1},activate=service?.5:0,walk=smooth((elapsed-activate)/.64),fade=smooth((elapsed-activate-.65)/.18);
 return {x:s.x+(door.x-8+door.side*10-s.x)*walk,y:s.y+(door.y-24-s.y)*walk,opacity:1-fade,action:elapsed<activate?'interact' as const:'run' as const,facing:Math.sign(door.x-s.x)||s.facing};
}
