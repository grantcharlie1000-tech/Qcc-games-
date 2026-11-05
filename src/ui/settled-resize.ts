// ResizeObserver fires for every frame of a width/height transition. Keep cheap
// geometry in sync, but defer expensive work (the glass PNG) until the browser
// reaches its final size. End/cancel events also cover reversals and enabling
// reduced motion halfway through a transition, without a duration-based timer.
const SIZE_PROPERTIES=new Set(['width','height','min-width','min-height','max-width','max-height']);
export function observeSettledResize(element:HTMLElement,settled:()=>void,during?:()=>void):()=>void{
  let pending=false,frame=0,disposed=false;
  const moving=()=>element.getAnimations().some(animation=>
    'transitionProperty' in animation&&SIZE_PROPERTIES.has(String(animation.transitionProperty))&&animation.playState!=='finished'&&animation.playState!=='idle');
  const flush=()=>{
    frame=0;
    if(disposed||!pending||moving())return;
    pending=false;settled();
  };
  const ended=(event:TransitionEvent)=>{
    if(event.target!==element||!SIZE_PROPERTIES.has(event.propertyName)||!pending||frame)return;
    frame=requestAnimationFrame(flush);
  };
  const resize=typeof ResizeObserver==='function'?new ResizeObserver(()=>{
    if(disposed)return;
    if(moving()){pending=true;during?.();}
    else{pending=false;settled();}
  }):undefined;
  resize?.observe(element);
  element.addEventListener('transitionend',ended);
  element.addEventListener('transitioncancel',ended);
  return ()=>{
    disposed=true;pending=false;
    resize?.disconnect();
    if(frame)cancelAnimationFrame(frame);
    element.removeEventListener('transitionend',ended);
    element.removeEventListener('transitioncancel',ended);
  };
}
