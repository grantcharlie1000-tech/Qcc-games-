// Synth descriptions (pure data). A sound is a few layers, each an enveloped oscillator or a
// filtered burst of shared noise; voice.ts turns a spec into Web Audio nodes. Every recipe builds a
// fresh spec from a random source so repeated sounds vary like vanilla's several samples per event.

export type Rand=()=>number;
export interface Envelope{
  /** Seconds after the voice starts. */
  delay:number;
  /** Linear rise, held peak and exponential fall, seconds. */
  attack:number;hold:number;decay:number;
  /** Peak amplitude 0..1. */
  gain:number;
}
export interface Mod{rate:number;depth:number}
export interface ToneLayer extends Envelope{
  kind:'tone';wave:OscillatorType;
  /** Hz at the start and at the end of the layer (exponential glide). */
  freq:number;freqEnd:number;
  /** Frequency modulation: modulator at freq × ratio, deviation `depth` × freq (growls, warbles, bells). */
  fm:{ratio:number;depth:number}|null;
  /** Pitch wobble: rate Hz, depth as a fraction of the frequency. */
  vibrato:Mod|null;
  /** Amplitude wobble: rate Hz, depth 0..1 (bleats, gargles, snorts). */
  tremolo:Mod|null;
  filter:{type:BiquadFilterType;freq:number;q:number}|null;
}
export interface Burst{
  /** Seconds after the layer starts; bursts are sorted and never overlap. */
  at:number;gain:number;decay:number;
}
export interface NoiseLayer extends Envelope{
  kind:'noise';
  /** White noise or brown (integrated, rumbling) noise. */
  color:'white'|'brown';
  filter:BiquadFilterType;
  /** Filter frequency at the start and end (exponential sweep), Q. */
  freq:number;freqEnd:number;q:number;
  /** Grains (crumbles, crackles, rattles): replaces the envelope with short bursts. */
  bursts:Burst[]|null;
  tremolo:Mod|null;
}
export type Layer=ToneLayer|NoiseLayer;
export interface SoundSpec{
  /** Vanilla event volume (the default when play() gets no volume): the gain is min(1, volume) and the attenuation
   *  range 16 × max(1, volume) blocks. */
  volume:number;
  /** Vanilla event pitch, including its random spread (the default when play() gets no pitch). The played rate is
   *  basePitch × pitch clamped to 0.5..2: it multiplies frequencies and divides durations. */
  pitch:number;
  /** Timbre factor of the sample set that applies whatever pitch the caller asks for (vanilla SoundType pitch: metal 1.5). */
  basePitch?:number;
  layers:Layer[];
  /** Interface sound: never positional. */
  ui?:boolean;
  /** Heard everywhere (thunder, vanilla volume 10000): not attenuated by distance, still panned toward its source. */
  global?:boolean;
  /** Looping bed (rain): layers sustain at their gain until the bed is released. */
  loop?:boolean;
}

type ToneOptions=Partial<Omit<ToneLayer,'kind'|'wave'|'freq'>>&{decay:number;gain:number};
type NoiseOptions=Partial<Omit<NoiseLayer,'kind'|'filter'|'freq'>>&{decay:number;gain:number};

const clampFreq=(f:number)=>Math.min(16000,Math.max(20,f));
const clampGain=(g:number)=>Math.min(1,Math.max(.001,g));

export function tone(wave:OscillatorType,freq:number,o:ToneOptions):ToneLayer{
  return{kind:'tone',wave,freq:clampFreq(freq),freqEnd:clampFreq(o.freqEnd??freq),delay:Math.max(0,o.delay??0),attack:Math.max(0,o.attack??.004),
    hold:Math.max(0,o.hold??0),decay:Math.max(.005,o.decay),gain:clampGain(o.gain),fm:o.fm??null,vibrato:o.vibrato??null,tremolo:o.tremolo??null,
    filter:o.filter?{...o.filter,freq:clampFreq(o.filter.freq)}:null};
}
export function noise(filter:BiquadFilterType,freq:number,o:NoiseOptions):NoiseLayer{
  return{kind:'noise',color:o.color??'white',filter,freq:clampFreq(freq),freqEnd:clampFreq(o.freqEnd??freq),q:o.q??.8,
    delay:Math.max(0,o.delay??0),attack:Math.max(0,o.attack??.003),hold:Math.max(0,o.hold??0),decay:Math.max(.005,o.decay),gain:clampGain(o.gain),
    bursts:o.bursts&&o.bursts.length?o.bursts:null,tremolo:o.tremolo??null};
}
/** Brown noise through a low-pass: thumps, rumbles and bodies. */
export const rumble=(freq:number,o:NoiseOptions)=>noise('lowpass',freq,{...o,color:'brown'});

/** `count` grains spread over `span` seconds with timing jitter; decays are shortened so grains never overlap. */
export function grains(r:Rand,count:number,span:number,decay:number,gain:number,jitter=.35,fade=0):Burst[]{
  const out:Burst[]=[];const step=count>1?span/(count-1):0;
  for(let i=0;i<count;i++){
    const at=Math.max(0,i*step+(r()-.5)*step*jitter);
    out.push({at,gain:clampGain(gain*(.6+r()*.4)*(1-fade*i/Math.max(1,count))),decay});
  }
  out.sort((a,b)=>a.at-b.at);
  for(let i=0;i<out.length;i++){
    if(i&&out[i].at<=out[i-1].at+out[i-1].decay+.002)out[i].at=out[i-1].at+out[i-1].decay+.003;
  }
  return out;
}
/** Bursts at fixed times (gulps, snips). */
export function hits(times:readonly number[],decay:number,gain:number):Burst[]{
  const out:Burst[]=[];
  for(let i=0;i<times.length;i++){
    const next=i+1<times.length?times[i+1]-times[i]-.004:decay;
    out.push({at:times[i],gain:clampGain(gain),decay:Math.max(.004,Math.min(decay,next))});
  }
  return out;
}

/** Scales the loudness of freshly built layers in place (envelope and grain gains, capped at 1). Recipes use it to even
 *  out their sample sets, measured by rendering them, so vanilla's event volumes set the balance between sounds. */
export function louder(layers:Layer[],k:number):Layer[]{
  if(k===1||!(k>0)||!Number.isFinite(k))return layers;
  for(const l of layers){
    l.gain=clampGain(l.gain*k);
    if(l.kind==='noise'&&l.bursts)for(const b of l.bursts)b.gain=clampGain(b.gain*k);
  }
  return layers;
}

export function spec(volume:number,pitch:number,layers:Layer[],extra?:{ui?:boolean;loop?:boolean;global?:boolean;basePitch?:number}):SoundSpec{
  const s:SoundSpec={volume,pitch,layers:layers.slice(0,12)};
  if(extra?.ui)s.ui=true;if(extra?.loop)s.loop=true;if(extra?.global)s.global=true;
  if(extra?.basePitch!==undefined&&extra.basePitch!==1)s.basePitch=extra.basePitch;
  return s;
}

/** Shortest and longest playback rate (vanilla clamps pitch to 0.5..2). */
export const MIN_PITCH=.5;export const MAX_PITCH=2;
const validVolume=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const validPitch=(v:unknown):v is number=>typeof v==='number'&&Number.isFinite(v)&&v>0;
/** The volume and playback rate a play() call resolves to. As in vanilla playSound(sound, volume, pitch), a given
 *  volume or pitch replaces the recipe's event default; the sample set's basePitch still applies. Invalid options
 *  are ignored. */
export function resolveLevels(s:SoundSpec,options?:{volume?:number;pitch?:number}|null,out:{volume:number;pitch:number}={volume:0,pitch:1}){
  const volume=options&&validVolume(options.volume)?options.volume:s.volume;
  const pitch=(s.basePitch??1)*(options&&validPitch(options.pitch)?options.pitch:s.pitch);
  out.volume=volume;out.pitch=Math.min(MAX_PITCH,Math.max(MIN_PITCH,pitch));
  return out;
}

/** 1 ± amount, uniformly. */
export const vary=(r:Rand,amount:number)=>1+(r()*2-1)*amount;
/** Vanilla's usual random pitch: (rand - rand) × spread + 1. */
export const vanillaPitch=(r:Rand,spread=.2)=>(r()-r())*spread+1;

/** Seconds from the start of a spec to the end of its last layer (at pitch 1). */
export function specDuration(s:SoundSpec):number{
  let end=0;
  for(const l of s.layers)end=Math.max(end,layerEnd(l));
  return end;
}
export function layerEnd(l:Layer):number{
  if(l.kind==='noise'&&l.bursts){const b=l.bursts[l.bursts.length-1];return l.delay+b.at+.002+b.decay;}
  return l.delay+l.attack+l.hold+l.decay;
}

/** Stable 32-bit hash of a string (generic voices for unknown creatures). */
export function hashString(text:string):number{
  let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return h>>>0;
}
/** Small seeded generator (mulberry32). */
export function mulberry(seed:number):Rand{
  let s=seed>>>0;
  return()=>{s=(s+0x6d2b79f5)>>>0;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};
}
