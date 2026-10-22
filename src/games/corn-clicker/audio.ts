/** Tiny synthesised sound effects (no audio files). Created lazily after a user gesture. */
export type Cue='pop'|'buy'|'upgrade'|'golden'|'achievement'|'harvest'|'plant'|'pest'|'deny'|'festival';
export class Sfx {
  private ctx:AudioContext|undefined;
  private master:GainNode|undefined;
  enabled=false;volume=0.6;
  private last=0;
  private ensure():AudioContext|undefined {
    if(!this.enabled)return undefined;
    try{
      if(!this.ctx){this.ctx=new AudioContext();this.master=this.ctx.createGain();this.master.connect(this.ctx.destination);}
      if(this.ctx.state==='suspended')void this.ctx.resume();
      this.master!.gain.value=this.volume*0.5;
      return this.ctx;
    }catch{return undefined;}
  }
  private tone(freq:number,start:number,length:number,type:OscillatorType='sine',peak=0.3,slide=1){
    const ctx=this.ctx!,osc=ctx.createOscillator(),gain=ctx.createGain(),t=ctx.currentTime+start;
    osc.type=type;osc.frequency.setValueAtTime(freq,t);
    if(slide!==1)osc.frequency.exponentialRampToValueAtTime(freq*slide,t+length);
    gain.gain.setValueAtTime(0.0001,t);gain.gain.exponentialRampToValueAtTime(peak,t+0.008);gain.gain.exponentialRampToValueAtTime(0.0001,t+length);
    osc.connect(gain);gain.connect(this.master!);osc.start(t);osc.stop(t+length+0.02);
  }
  play(cue:Cue){
    const ctx=this.ensure();if(!ctx)return;
    // Rapid clicking should not stack into a wall of noise.
    if(cue==='pop'){const now=ctx.currentTime;if(now-this.last<0.035)return;this.last=now;}
    try{
      switch(cue){
        case 'pop':this.tone(380+Math.random()*160,0,0.07,'triangle',0.35,1.8);break;
        case 'buy':this.tone(520,0,0.08,'square',0.08);this.tone(780,0.06,0.1,'square',0.08);break;
        case 'upgrade':[523,659,784].forEach((f,i)=>this.tone(f,i*0.06,0.14,'triangle',0.2));break;
        case 'golden':[784,988,1175,1568].forEach((f,i)=>this.tone(f,i*0.07,0.25,'sine',0.22));break;
        case 'achievement':[523,659,784,1047].forEach((f,i)=>this.tone(f,i*0.09,0.3,'triangle',0.2));break;
        case 'harvest':this.tone(300,0,0.12,'triangle',0.3,2);this.tone(600,0.08,0.12,'triangle',0.2,1.5);break;
        case 'plant':this.tone(220,0,0.12,'sine',0.3,0.7);break;
        case 'pest':this.tone(160,0,0.18,'sawtooth',0.12,3);break;
        case 'deny':this.tone(160,0,0.12,'square',0.06,0.8);break;
        case 'festival':[392,523,659,523,784].forEach((f,i)=>this.tone(f,i*0.1,0.18,'square',0.07));break;
      }
    }catch{/* audio is optional */}
  }
  dispose(){void this.ctx?.close().catch(()=>{});this.ctx=undefined;}
}
