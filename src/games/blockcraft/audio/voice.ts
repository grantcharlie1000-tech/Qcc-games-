// Turns synth layers (spec.ts) into Web Audio nodes. Noise comes from two buffers made once per
// AudioContext (white and brown) and played from random offsets, so no voice allocates sample data.
import {layerEnd,type Layer,type Mod,type Rand} from './spec';

export interface NoiseBank{white:AudioBuffer;brown:AudioBuffer}
const NOISE_SECONDS=2;
/** Silence floor for exponential ramps (they cannot reach 0). */
const FLOOR=.0001;
/** Seconds a source keeps running after its envelope ends. */
const TAIL=.03;

/** Two seconds of white and loop-safe brown noise, mono. */
export function createNoiseBank(ctx:BaseAudioContext,r:Rand):NoiseBank{
  const rate=ctx.sampleRate,length=Math.max(1,Math.floor(rate*NOISE_SECONDS));
  const white=ctx.createBuffer(1,length,rate),brown=ctx.createBuffer(1,length,rate);
  const w=white.getChannelData(0),b=brown.getChannelData(0);
  let last=0;
  for(let i=0;i<length;i++){const x=r()*2-1;w[i]=x;last=(last+.02*x)/1.02;b[i]=last;}
  // Remove the drift between the ends so the brown loop has no click, then normalise.
  const drift=b[length-1]-b[0];let peak=1e-6;
  for(let i=0;i<length;i++){b[i]-=drift*i/length;peak=Math.max(peak,Math.abs(b[i]));}
  for(let i=0;i<length;i++)b[i]*=.9/peak;
  return{white,brown};
}

/** Schedules the layers into `dest` starting at `t0`; `pitch` multiplies frequencies and divides times.
 *  Started sources are pushed to `sources`. Loop layers rise to their gain and sustain until stopped.
 *  Returns the time the last layer ends (Infinity for loops). */
export function renderLayers(ctx:BaseAudioContext,bank:NoiseBank,layers:readonly Layer[],pitch:number,t0:number,dest:AudioNode,
  sources:AudioScheduledSourceNode[],r:Rand,loop=false):number{
  const nyquist=ctx.sampleRate*.45;
  const hz=(f:number)=>Math.min(nyquist,Math.max(10,f*pitch));
  let end=t0;
  for(const l of layers){
    const start=t0+l.delay/pitch,stop=t0+layerEnd(l)/pitch;
    end=Math.max(end,stop);
    const env=ctx.createGain();
    envelope(env.gain,l,start,pitch,loop);
    env.connect(dest);
    let head:AudioNode=env;
    if(l.tremolo)head=tremolo(ctx,l.tremolo,head,start,stop,pitch,sources,loop);
    if(l.kind==='tone'){
      if(l.filter){
        const f=ctx.createBiquadFilter();f.type=l.filter.type;f.frequency.setValueAtTime(hz(l.filter.freq),start);f.Q.setValueAtTime(l.filter.q,start);
        f.connect(head);head=f;
      }
      const osc=ctx.createOscillator();osc.type=l.wave;
      const f0=hz(l.freq),f1=hz(l.freqEnd);
      osc.frequency.setValueAtTime(f0,start);
      if(f1!==f0&&!loop)osc.frequency.exponentialRampToValueAtTime(f1,stop);
      if(l.fm){
        const mod=ctx.createOscillator(),depth=ctx.createGain();
        mod.frequency.setValueAtTime(f0*l.fm.ratio,start);
        if(f1!==f0&&!loop)mod.frequency.exponentialRampToValueAtTime(f1*l.fm.ratio,stop);
        depth.gain.setValueAtTime(f0*l.fm.depth,start);
        mod.connect(depth).connect(osc.frequency);
        run(mod,start,stop,sources,loop);
      }
      if(l.vibrato)lfo(ctx,l.vibrato,f0*l.vibrato.depth,osc.frequency,start,stop,pitch,sources,loop);
      osc.connect(head);
      run(osc,start,stop,sources,loop);
    }else{
      const filter=ctx.createBiquadFilter();filter.type=l.filter;
      const f0=hz(l.freq),f1=hz(l.freqEnd);
      filter.frequency.setValueAtTime(f0,start);
      if(f1!==f0&&!loop)filter.frequency.exponentialRampToValueAtTime(f1,stop);
      filter.Q.setValueAtTime(l.q,start);
      filter.connect(head);
      const src=ctx.createBufferSource();src.buffer=l.color==='brown'?bank.brown:bank.white;src.loop=true;
      src.connect(filter);
      run(src,start,stop,sources,loop,r()*NOISE_SECONDS*.9);
    }
  }
  return loop?Infinity:end;
}

function envelope(p:AudioParam,l:Layer,start:number,pitch:number,loop:boolean){
  p.setValueAtTime(0,start);
  if(l.kind==='noise'&&l.bursts&&!loop){
    for(const b of l.bursts){
      const s=start+b.at/pitch;
      p.setValueAtTime(0,s);p.linearRampToValueAtTime(b.gain,s+.002/pitch);p.exponentialRampToValueAtTime(FLOOR,s+(.002+b.decay)/pitch);
    }
    return;
  }
  const peak=start+Math.max(.001,l.attack)/pitch;
  p.linearRampToValueAtTime(l.gain,peak);
  if(loop)return;
  const held=peak+l.hold/pitch;
  if(l.hold>0)p.setValueAtTime(l.gain,held);
  p.exponentialRampToValueAtTime(FLOOR,held+l.decay/pitch);
}

function tremolo(ctx:BaseAudioContext,m:Mod,into:AudioNode,start:number,stop:number,pitch:number,sources:AudioScheduledSourceNode[],loop:boolean):AudioNode{
  const amp=ctx.createGain(),depth=Math.min(1,Math.max(0,m.depth));
  amp.gain.setValueAtTime(1-depth/2,start);
  amp.connect(into);
  lfo(ctx,m,depth/2,amp.gain,start,stop,pitch,sources,loop);
  return amp;
}
function lfo(ctx:BaseAudioContext,m:Mod,amount:number,target:AudioParam,start:number,stop:number,pitch:number,sources:AudioScheduledSourceNode[],loop:boolean){
  const osc=ctx.createOscillator(),gain=ctx.createGain();
  osc.frequency.setValueAtTime(m.rate*pitch,start);gain.gain.setValueAtTime(amount,start);
  osc.connect(gain).connect(target);
  run(osc,start,stop,sources,loop);
}
function run(src:AudioScheduledSourceNode,start:number,stop:number,sources:AudioScheduledSourceNode[],loop:boolean,offset?:number){
  if(offset===undefined)src.start(start);else (src as AudioBufferSourceNode).start(start,offset);
  if(!loop)src.stop(stop+TAIL);
  sources.push(src);
}
