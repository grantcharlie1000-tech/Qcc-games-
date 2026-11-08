/** One decoded loop and one playing source. Audio is optional and follows QCC's Sound setting. */
export class LoopMusic {
 private context:AudioContext|undefined;
 private gain:GainNode|undefined;
 private source:AudioBufferSourceNode|undefined;
 private buffer:AudioBuffer|undefined;
 private wanted=false;
 private disposed=false;
 private unavailable=false;
 private loading=false;
 private offset=0;
 private started=0;
 private readonly abort=new AbortController();
 constructor(private readonly url:string,private readonly volume=.12){}
 sync(playing:boolean,enabled:boolean){
  const wanted=playing&&enabled&&!this.disposed;
  if(wanted===this.wanted)return;
  this.wanted=wanted;if(wanted)this.activate();else this.stop();
 }
 /** A fresh gesture can recover from browser audio interruptions or a failed asset request. */
 unlock(){if(this.wanted&&!this.disposed)this.activate();}
 private activate(){
  if(this.disposed||this.unavailable||!this.wanted)return;
  try{
   if(!this.context){
    this.context=new AudioContext({latencyHint:'playback'});this.gain=this.context.createGain();this.gain.gain.value=0;this.gain.connect(this.context.destination);
   }
   const context=this.context;
   if(context.state!=='running'&&context.state!=='closed')void context.resume().catch(()=>{});
   if(this.buffer){this.start();return;}
   if(this.loading)return;this.loading=true;
   void fetch(this.url,{credentials:'omit',signal:this.abort.signal})
    .then(response=>{if(!response.ok)throw new Error('Music unavailable');return response.arrayBuffer();})
    .then(bytes=>context.decodeAudioData(bytes))
    .then(buffer=>{if(this.disposed)return;this.buffer=buffer;this.start();})
    .catch(()=>{/* Play remains available offline or when audio is blocked. A gesture may retry. */})
    .finally(()=>{this.loading=false;});
  }catch{this.unavailable=true;}
 }
 private start(){
  if(this.disposed||!this.wanted||this.source||!this.context||!this.gain||!this.buffer)return;
  try{
   const context=this.context,source=context.createBufferSource();source.buffer=this.buffer;source.loop=true;source.connect(this.gain);
   this.gain.gain.cancelScheduledValues(context.currentTime);this.gain.gain.setValueAtTime(0,context.currentTime);this.gain.gain.linearRampToValueAtTime(this.volume,context.currentTime+.18);
   this.started=context.currentTime;source.start(this.started,this.offset);this.source=source;
  }catch{/* Music must never prevent playing the game. */}
 }
 private stop(){
  const source=this.source;if(!source)return;
  if(this.context&&this.buffer)this.offset=(this.offset+Math.max(0,this.context.currentTime-this.started))%this.buffer.duration;
  this.source=undefined;
  if(this.context&&this.gain){this.gain.gain.cancelScheduledValues(this.context.currentTime);this.gain.gain.setValueAtTime(0,this.context.currentTime);}
  try{source.stop();}catch{/* Already ended. */}source.disconnect();
 }
 /** Explicit resets rewind the piece; ordinary pause/resume keeps its position. */
 reset(){this.wanted=false;this.stop();this.offset=0;}
 dispose(){
  if(this.disposed)return;this.disposed=true;this.wanted=false;this.abort.abort();this.stop();this.buffer=undefined;
  this.gain?.disconnect();if(this.context&&this.context.state!=='closed')void this.context.close().catch(()=>{});
 }
}
