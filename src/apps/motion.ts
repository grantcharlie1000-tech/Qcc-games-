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
