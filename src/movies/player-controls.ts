const IDLE_DELAY=2800;
const CORNER_BUTTONS='.movies-fullscreen,.movies-pip';

// Provider iframes do not forward pointer movement. Their corner buttons keep
// their own small hit areas so hovering either corner can always reveal them.
export function bindPlayerControls(screen:HTMLElement){
 const abort=new AbortController(),options={signal:abort.signal};
 const pointer=matchMedia('(hover: hover) and (pointer: fine)');
 const buttons=[...screen.querySelectorAll<HTMLButtonElement>(CORNER_BUTTONS)];
 const video=screen.querySelector('video');
 let timer:ReturnType<typeof setTimeout>|undefined;
 const pinned=()=>!pointer.matches||!!video&&(video.paused||video.ended)
  ||!!screen.querySelector('.movies-player-unavailable,.movies-next:not([hidden]),.movies-connecting:not([hidden])')
  ||buttons.some(button=>button.matches(':hover,:focus-visible'));
 const schedule=()=>{
  clearTimeout(timer);
  if(pinned())return;
  timer=setTimeout(()=>{if(!pinned())screen.dataset.controlsHidden='true';},IDLE_DELAY);
 };
 const reveal=()=>{delete screen.dataset.controlsHidden;schedule();};
 for(const event of ['pointerenter','pointermove','pointerdown','keydown','focusin'])screen.addEventListener(event,reveal,options);
 screen.addEventListener('pointerleave',schedule,options);
 screen.addEventListener('focusout',()=>queueMicrotask(()=>{if(!abort.signal.aborted)schedule();}),options);
 for(const button of buttons){
  button.addEventListener('pointerenter',reveal,options);
  button.addEventListener('pointerleave',schedule,options);
 }
 for(const event of ['play','pause','ended'])video?.addEventListener(event,reveal,options);
 pointer.addEventListener('change',reveal,options);
 // Connecting, Up next and the PiP placeholder must keep their actions usable.
 const overlays=new MutationObserver(reveal);
 overlays.observe(screen,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden']});
 reveal();
 return {reveal,dispose(){clearTimeout(timer);abort.abort();overlays.disconnect();delete screen.dataset.controlsHidden;}};
}
