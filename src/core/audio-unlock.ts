// iOS suspends Web Audio when the app goes to the background (state "interrupted" or "suspended") and only
// lets it resume inside a user gesture. Games create their own AudioContexts, so the shell keeps a weak list of
// every context and resumes the interrupted ones on the next tap or key press. A context a game suspended on purpose
// (Breachline and Blockcraft do when paused) is "suspended", not "interrupted", and is left alone.
const contexts=new Set<WeakRef<AudioContext>>();

export function trackAudioContexts(){
  const Native=globalThis.AudioContext;
  if(!Native||typeof WeakRef==='undefined')return;
  class Tracked extends Native {
    constructor(options?:AudioContextOptions){super(options);contexts.add(new WeakRef(this));}
  }
  globalThis.AudioContext=Tracked;
  const resume=()=>{
    for(const ref of contexts){
      const context=ref.deref();
      if(!context||context.state==='closed'){contexts.delete(ref);continue;}
      if((context.state as string)==='interrupted')void context.resume().catch(()=>{});
    }
  };
  for(const type of ['pointerdown','touchend','keydown'])window.addEventListener(type,resume,{capture:true,passive:true});
}
