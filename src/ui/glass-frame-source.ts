// A game's own render loop publishes each finished frame here. Glass consumers
// (the shared WebGL lens, adaptive ink) read the canvas synchronously inside
// notifyGlassFrame, while a non-preserved WebGL buffer is still valid. There is
// no second requestAnimationFrame: a frame that is not drawn is not refracted.
type Listener=()=>void;
interface FrameSource{repaint:()=>void;requesting:boolean;notifying:boolean}
const sources=new WeakMap<HTMLCanvasElement,FrameSource>();
const listeners=new WeakMap<HTMLCanvasElement,Set<Listener>>();
const watchers=new Set<Listener>();

function announce():void{for(const watcher of [...watchers])try{watcher();}catch{/* A consumer's failure stays local. */}}

/** Repaint the current scene only; consumers read its buffer during notifyGlassFrame. */
export function registerGlassFrameSource(canvas:HTMLCanvasElement,repaint:()=>void):()=>void{
  const source:FrameSource={repaint,requesting:false,notifying:false};
  sources.set(canvas,source);announce();
  return()=>{if(sources.get(canvas)===source){sources.delete(canvas);announce();}};
}

export function hasGlassFrameSource(canvas:HTMLCanvasElement):boolean{return sources.has(canvas);}

/** Called when any source registers or unregisters, so consumers can re-resolve theirs. */
export function watchGlassFrameSources(watcher:Listener):()=>void{watchers.add(watcher);return()=>{watchers.delete(watcher);};}

/** Delivery is synchronous: non-preserved WebGL buffers expire before another RAF. */
export function onGlassFrame(canvas:HTMLCanvasElement,listener:Listener):()=>void{
  let group=listeners.get(canvas);
  if(!group)listeners.set(canvas,group=new Set());
  group.add(listener);
  return()=>{group.delete(listener);if(!group.size&&listeners.get(canvas)===group)listeners.delete(canvas);};
}

export function notifyGlassFrame(canvas:HTMLCanvasElement):void{
  const source=sources.get(canvas);
  if(!source||source.notifying)return;
  const group=listeners.get(canvas);
  if(!group?.size)return;
  source.notifying=true;
  try{
    for(const listener of [...group])if(group.has(listener)){
      // A failed optical effect must not interrupt gameplay or other consumers.
      try{listener();}catch{/* The consumer falls back to CSS blur. */}
    }
  }finally{source.notifying=false;}
}

/** New or moved glass may need the current paused scene, without a simulation step. */
export function requestGlassFrame(canvas:HTMLCanvasElement):void{
  const source=sources.get(canvas);
  if(!source||source.requesting||source.notifying)return;
  source.requesting=true;
  try{source.repaint();}finally{source.requesting=false;}
}
