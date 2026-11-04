/** One-shot WAAPI motion for QCC Social and Chat (DESIGN 12.2). CSS motion is covered by the shell's reduced-motion reset; element.animate() is not, so every call goes through motion(). */
export type Reduced=()=>boolean;
export const reducedMotion=(live?:Reduced):boolean=>
  (live?.()??false)
  ||document.documentElement.classList.contains('reduce-motion')
  ||(typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches);
/** Runs a one-shot animation unless motion is reduced; returns the Animation or null. */
export function motion(el:Element,frames:Keyframe[],options:KeyframeAnimationOptions,live?:Reduced,reducedFrames?:Keyframe[]):Animation|null{
  if(typeof el.animate!=='function')return null;
  if(reducedMotion(live))return reducedFrames?el.animate(reducedFrames,{duration:120,easing:'ease',fill:'none'}):null;
  return el.animate(frames,{fill:'none',...options});
}
export const EASE_OUT='cubic-bezier(.23,1,.32,1)';
/**
 * Exit for an element whose CSS transition plays the way out on `[data-leaving]` (DESIGN 12.1 row 15): it stops taking input at once, then is removed.
 * Instant when motion is reduced, or when `instant` (keyboard use never animates, rows 3 and 15).
 */
export function leave(el:HTMLElement,ms:number,instant=false,live?:Reduced):void{
  if(instant||reducedMotion(live)){el.remove();return;}
  el.dataset.leaving='true';el.inert=true;
  window.setTimeout(()=>el.remove(),ms);
}
