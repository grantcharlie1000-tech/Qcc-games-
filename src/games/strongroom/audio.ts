import type {Entity} from './sim';
/** Synthesised cues only: no audio downloads. A single graph, capped by the active tier. */
export class Audio{
 private ctx:AudioContext|null=null;private master:GainNode|null=null;private voices=new Set<OscillatorNode>();
 constructor(public limit:number,private enabled:()=>boolean){}
 unlock(){if(!this.enabled())return;if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.gain.value=.12;this.master.connect(this.ctx.destination);}void this.ctx.resume().catch(()=>{});}
 tone(frequency:number,duration:number,pan=0,volume=1){
  if(!this.enabled()||!this.ctx||!this.master||this.voices.size>=this.limit)return;
  const ctx=this.ctx,osc=ctx.createOscillator(),gain=ctx.createGain(),panner=ctx.createStereoPanner();osc.type='triangle';osc.frequency.setValueAtTime(frequency,ctx.currentTime);osc.frequency.exponentialRampToValueAtTime(Math.max(30,frequency*.25),ctx.currentTime+duration);gain.gain.setValueAtTime(volume,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+duration);panner.pan.value=Math.max(-1,Math.min(1,pan));osc.connect(gain);gain.connect(panner);panner.connect(this.master);this.voices.add(osc);osc.onended=()=>{this.voices.delete(osc);osc.disconnect();gain.disconnect();panner.disconnect();};osc.start();osc.stop(ctx.currentTime+duration);
 }
 shot(source:Entity,listener?:Entity){if(!listener)return;const distance=Math.hypot(source.x-listener.x,source.z-listener.z);if(distance>40)return;const angle=Math.atan2(source.x-listener.x,source.z-listener.z)+listener.yaw;this.tone(140,.09,Math.sin(angle),source===listener?.8:Math.max(.05,1-distance/40));}
 pause(){if(this.ctx)void this.ctx.suspend().catch(()=>{});}
 dispose(){for(const v of this.voices){v.onended=null;try{v.stop();}catch{}v.disconnect();}this.voices.clear();void this.ctx?.close().catch(()=>{});this.ctx=null;}
}
