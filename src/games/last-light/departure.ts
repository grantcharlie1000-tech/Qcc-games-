import type {Level} from './levels';
import type {Run} from './model';
import {goalComposition,completionMotion} from './composition';

export const clearDuration=(l:Level)=>l.goal==='ferry'?1.65:l.goal==='dawn'?1.3:1.05;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const p=clamp(v);return p*p*(3-2*p);};
export function departureProgress(l:Level,s:Run){return clamp((clearDuration(l)-s.cinematic)/clearDuration(l));}
const motionCache=new WeakMap<Run,{stage:number;x:number;y:number;offset:{x:number;y:number}}>();
export function departureOffset(l:Level,s:Run,reduced:boolean){
 if(reduced||s.phase==='playing')return {x:0,y:0};
 let cached=motionCache.get(s);
 if(!cached||cached.stage!==s.stage||cached.x!==s.x||cached.y!==s.y){
  const art=goalComposition(l),boat=art.art==='ferry'||art.art==='airship';
  cached={stage:s.stage,x:s.x,y:s.y,offset:completionMotion(l,boat?{x:art.x-43,y:art.y-46,w:26,h:35}:{x:s.x-10,y:s.y-12,w:36,h:38})};motionCache.set(s,cached);
 }
 const elapsed=clearDuration(l)-s.cinematic,boat=l.goal==='ferry';
 // The mooring stays still while the courier boards. Sail acceleration follows touchdown.
 const travel=boat?smooth((elapsed-.62)/(clearDuration(l)-.62)):smooth(elapsed/clearDuration(l));
 return {x:cached.offset.x*travel,y:(goalComposition(l).art==='airship'?-28:cached.offset.y)*travel||0};
}
/** A presentation pose only. The exit has already banked progress and frozen the timer. */
export function departurePose(l:Level,s:Run,reduced:boolean){
 const art=goalComposition(l),elapsed=clearDuration(l)-s.cinematic,p=departureProgress(l,s),offset=departureOffset(l,s,reduced);
 if(reduced)return {x:s.x,y:s.y,opacity:1,action:'idle' as const,facing:s.facing};
 if(art.art==='ferry'||art.art==='airship'){
  const board=smooth(elapsed/.46),hop=elapsed<.46?Math.sin(Math.PI*clamp(elapsed/.46))*27:0;
  const bob=Math.sin(s.clock*2)*2;
  return {x:s.x+(art.x-34-8-s.x)*board+offset.x,y:s.y+(art.y-12-24-s.y)*board-hop-bob*board+offset.y,opacity:1,settle:elapsed>=.46&&elapsed<.62?Math.sin((elapsed-.46)/.16*Math.PI):0,action:elapsed<.24?'rise' as const:elapsed<.46?'fall' as const:elapsed<.62?'land' as const:'idle' as const,facing:1};
 }
 if(['shelter','rescue','escape'].includes(l.goal)){
  const walk=smooth(elapsed/.7);
  return {x:s.x+(art.x-8-s.x)*walk,y:s.y+(art.y-24-s.y)*walk,opacity:1-smooth((elapsed-.42)/.42),action:'run' as const,facing:Math.sign(art.x-s.x-8)||s.facing};
 }
 if(l.goal==='dawn')return {x:s.x+smooth(p)*26,y:s.y,opacity:1-smooth((p-.65)/.35),action:'run' as const,facing:1};
 return {x:s.x+offset.x,y:s.y+offset.y,opacity:1,action:p<.6?'interact' as const:'idle' as const,facing:Math.sign(art.x-s.x-8)||s.facing};
}
