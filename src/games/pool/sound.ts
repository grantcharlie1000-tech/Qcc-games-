/** Synthesised table sounds: ball clicks, cushion thumps, pocket drops and the cue strike. No audio files. */
export class PoolSound{
  private ctx:AudioContext|null=null;private noise:AudioBuffer|null=null;private recent:number[]=[];
  constructor(private enabled:()=>boolean){}
  private audio(){
    if(!this.enabled())return null;
    try{
      this.ctx??=new AudioContext();
      if(this.ctx.state==='suspended')void this.ctx.resume();
      if(!this.noise){const n=this.ctx.createBuffer(1,this.ctx.sampleRate*.4,this.ctx.sampleRate),d=n.getChannelData(0);let s=12345;for(let i=0;i<d.length;i++){s=(s*1103515245+12345)>>>0;d[i]=s/2147483648-1;}this.noise=n;}
      return this.ctx;
    }catch{return null;}
  }
  /** Avoid machine-gun stacking during the break. */
  private budget(now:number){this.recent=this.recent.filter(t=>now-t<.05);if(this.recent.length>=4)return false;this.recent.push(now);return true;}
  private burst(a:AudioContext,at:number,gain:number,type:BiquadFilterType,freq:number,q:number,dur:number){
    const src=a.createBufferSource();src.buffer=this.noise;const f=a.createBiquadFilter();f.type=type;f.frequency.value=freq;f.Q.value=q;
    const g=a.createGain();g.gain.setValueAtTime(gain,at);g.gain.exponentialRampToValueAtTime(.0001,at+dur);
    src.connect(f);f.connect(g);g.connect(a.destination);src.start(at,Math.random()*.2,dur+.02);
  }
  private tone(a:AudioContext,at:number,gain:number,f0:number,f1:number,dur:number,type:OscillatorType='sine'){
    const o=a.createOscillator();o.type=type;o.frequency.setValueAtTime(f0,at);o.frequency.exponentialRampToValueAtTime(f1,at+dur);
    const g=a.createGain();g.gain.setValueAtTime(gain,at);g.gain.exponentialRampToValueAtTime(.0001,at+dur);
    o.connect(g);g.connect(a.destination);o.start(at);o.stop(at+dur+.02);
  }
  ball(speed:number){
    const a=this.audio();if(!a||speed<.05||!this.budget(a.currentTime))return;
    const v=Math.min(1,speed/5),at=a.currentTime,gain=.04+.38*v*v;
    this.burst(a,at,gain,'bandpass',3600+800*v,3,.035);
    this.tone(a,at,gain*.5,2600+400*v,2200,.045);
  }
  rail(speed:number){
    const a=this.audio();if(!a||speed<.1||!this.budget(a.currentTime))return;
    const v=Math.min(1,speed/5),at=a.currentTime;
    this.tone(a,at,.06+.22*v,150,70,.12);
    this.burst(a,at,.03+.1*v,'lowpass',900,1,.08);
  }
  pocket(speed:number){
    const a=this.audio();if(!a)return;
    const at=a.currentTime,v=Math.min(1,.3+speed/3);
    this.tone(a,at,.14*v,220,90,.09);
    this.burst(a,at+.03,.06*v,'bandpass',1400,2,.05);
    this.burst(a,at+.09,.05*v,'lowpass',500,1,.28);
  }
  cue(power:number){
    const a=this.audio();if(!a)return;
    const at=a.currentTime,v=.2+.8*power;
    this.burst(a,at,.12+.25*v,'bandpass',1800,2.5,.03);
    this.tone(a,at,.08*v,900,500,.05,'triangle');
  }
  dispose(){void this.ctx?.close().catch(()=>{});this.ctx=null;}
}
