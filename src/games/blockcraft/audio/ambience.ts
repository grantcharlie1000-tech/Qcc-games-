// Cave ambience and generative music (pure helpers; sounds.ts plays them).
//
// Cave mood follows vanilla's AmbientMoodSettings (tick delay 6000, search extent 8, offset 2): every tick
// one random block within 8 of the eye is sampled; sky light there lowers the mood by sky/15 × 0.001,
// otherwise the mood changes by (1 - block light) / 6000. At 1 a cave sound plays toward the sample and the
// mood resets, so about five minutes in complete darkness bring one eerie sound.
import type {Vec3} from '../engine/contracts';
import {hits,layerEnd,noise,rumble,spec,tone,vary,type Layer,type Rand,type SoundSpec} from './spec';

export const MOOD_TICK_DELAY=6000;
export const MOOD_EXTENT=8;
export const MOOD_OFFSET=2;
/** Cave sounds are placed at most this far away so they stay audible (vanilla can place them up to ~16). */
export const CAVE_MAX_DISTANCE=10;

export interface LightSource{lightAt(x:number,y:number,z:number):number}
/** One mood tick: returns the new (unclamped) mood and writes the sampled block centre to `sample`. */
export function moodStep(mood:number,world:LightSource,ex:number,ey:number,ez:number,r:Rand,sample:Vec3):number{
  const span=MOOD_EXTENT*2+1;
  const x=Math.floor(ex+Math.floor(r()*span)-MOOD_EXTENT),y=Math.floor(ey+Math.floor(r()*span)-MOOD_EXTENT),z=Math.floor(ez+Math.floor(r()*span)-MOOD_EXTENT);
  sample.x=x+.5;sample.y=y+.5;sample.z=z+.5;
  const light=world.lightAt(x,y,z),sky=light>>4&15,block=light&15;
  return sky>0?mood-sky/15*.001:mood-(block-1)/MOOD_TICK_DELAY;
}
/** Where vanilla places the mood sound: along the eye → sample direction, offset 2 further (capped here). */
export function moodSoundPosition(eye:Vec3,sample:Vec3,out:Vec3):Vec3{
  const dx=sample.x-eye.x,dy=sample.y-eye.y,dz=sample.z-eye.z,d=Math.sqrt(dx*dx+dy*dy+dz*dz);
  if(d<1e-6){out.x=eye.x;out.y=eye.y;out.z=eye.z;return out;}
  const k=Math.min(CAVE_MAX_DISTANCE,d+MOOD_OFFSET)/d;
  out.x=eye.x+dx*k;out.y=eye.y+dy*k;out.z=eye.z+dz*k;
  return out;
}

/** Eerie cave sounds: distant rumbles, hollow wind, echoing drips and dissonant drones. Volume 1, pitch 1 (vanilla). */
export function caveSpec(r:Rand):SoundSpec{
  const f=vary(r,.12);
  const variant=Math.floor(r()*5);
  let layers:Layer[];
  if(variant===0)layers=[
    rumble(170*f,{freqEnd:110*f,attack:1.4,hold:1,decay:2.6,gain:.6}),
    tone('sine',55*f,{freqEnd:47*f,attack:1.5,hold:.8,decay:2.2,gain:.22})];
  else if(variant===1)layers=[
    noise('bandpass',700*f,{freqEnd:1150*f,q:12,attack:1.2,hold:.8,decay:2,gain:.4}),
    noise('bandpass',1400*f,{freqEnd:880*f,q:15,delay:.8,attack:1,decay:2,gain:.25}),
    rumble(200*f,{attack:1,hold:1,decay:2,gain:.2})];
  else if(variant===2){
    const times=[0,.45,.9,1.35,1.8],echo=[0,.52,1.04,1.56];
    layers=[
      ...times.map((t,i)=>tone('sine',1250*f,{freqEnd:900*f,delay:t,attack:.002,decay:.09,gain:.3*Math.pow(.6,i)})),
      noise('bandpass',1800*f,{q:6,delay:.2,decay:.05,gain:.2,bursts:hits(echo,.05,.2)}),
      rumble(150*f,{attack:.8,hold:.6,decay:1.5,gain:.2})];
  }else if(variant===3)layers=[
    tone('sine',220*f,{attack:2,hold:.5,decay:2.5,gain:.14,vibrato:{rate:.7,depth:.01}}),
    tone('sine',233*f,{attack:2.2,hold:.4,decay:2.5,gain:.12,vibrato:{rate:.5,depth:.012}}),
    tone('triangle',110*f,{attack:1.8,hold:.6,decay:2.4,gain:.1}),
    rumble(120*f,{attack:1.5,hold:1,decay:2,gain:.3})];
  else layers=[
    tone('sawtooth',90*f,{freqEnd:60*f,attack:1.2,hold:.6,decay:2.4,gain:.12,fm:{ratio:1.41,depth:.4},filter:{type:'lowpass',freq:400,q:3}}),
    noise('bandpass',420*f,{freqEnd:260*f,q:8,attack:1.4,hold:.4,decay:2.4,gain:.3}),
    rumble(140*f,{delay:.6,attack:.8,decay:2,gain:.3})];
  return spec(1,1,layers);
}

// ---- Underwater ----------------------------------------------------------------------------------
// Vanilla UnderwaterAmbientSoundHandler: while the eyes are in water a loop fades in over 40 ticks (out at
// twice that rate), entering and leaving play their own sounds, and every tick brings additions: bubbles 1%,
// rare distant creaks 0.1%, ultra rare eerie calls 0.01%. All are heard inside the head (not positional).
export const UNDERWATER_FADE_TICKS=40;
export const UNDERWATER_CHANCES={additions:.01,rare:.001,ultraRare:.0001} as const;
export type UnderwaterSound='enter'|'exit'|'additions'|'rare'|'ultra_rare';

/** The underwater loop: a deep, pressing hum with slow currents. */
export function underwaterLoopSpec():SoundSpec{
  return spec(1,1,[
    rumble(240,{attack:1,decay:2,gain:.42,tremolo:{rate:.23,depth:.35}}),
    tone('sine',52,{attack:1,decay:2,gain:.12,vibrato:{rate:.15,depth:.04}}),
    noise('bandpass',520,{q:3,attack:1.5,decay:2,gain:.05,tremolo:{rate:.37,depth:.6}})],{loop:true,ui:true});
}
function bubbleRun(r:Rand,count:number,span:number,low:number,high:number,gain:number):Layer[]{
  const layers:Layer[]=[];
  for(let i=0;i<count;i++){
    const f=low+r()*(high-low);
    layers.push(tone('sine',f,{freqEnd:f*(1.8+r()*.8),delay:r()*span,attack:.003,decay:.04+r()*.05,gain:gain*(.6+r()*.4)}));
  }
  return layers;
}
/** One-shot underwater sounds (volume 1, pitch 1, heard inside the head). */
export function underwaterSpec(kind:UnderwaterSound,r:Rand):SoundSpec{
  const f=vary(r,.08);
  let layers:Layer[];
  if(kind==='enter')layers=[
    rumble(700*f,{freqEnd:160*f,attack:.01,decay:.55,gain:.55}),
    noise('bandpass',900*f,{freqEnd:300*f,q:1.2,attack:.005,decay:.3,gain:.25}),
    ...bubbleRun(r,5,.5,260,700,.14)];
  else if(kind==='exit')layers=[
    noise('bandpass',800*f,{freqEnd:2600*f,q:1,attack:.01,decay:.28,gain:.32}),
    rumble(420*f,{attack:.005,decay:.15,gain:.25}),
    tone('sine',900*f,{freqEnd:1700*f,delay:.12,attack:.003,decay:.05,gain:.1})];
  else if(kind==='additions')layers=[
    ...bubbleRun(r,3+Math.floor(r()*4),.7,240,900,.16),
    rumble(300*f,{attack:.05,decay:.3,gain:.12})];
  else if(kind==='rare')layers=[
    tone('sawtooth',150*f,{freqEnd:105*f,attack:.6,hold:.6,decay:1.6,gain:.1,vibrato:{rate:.8,depth:.03},filter:{type:'lowpass',freq:420,q:4}}),
    rumble(180*f,{attack:.5,hold:.5,decay:1.5,gain:.25}),
    ...bubbleRun(r,3,1.5,200,500,.08)];
  else layers=[
    tone('sine',310*f,{freqEnd:240*f,attack:1.2,hold:.8,decay:2.4,gain:.12,vibrato:{rate:.4,depth:.02}}),
    tone('sine',328*f,{freqEnd:236*f,attack:1.4,hold:.6,decay:2.4,gain:.1,vibrato:{rate:.3,depth:.025}}),
    noise('bandpass',600*f,{freqEnd:380*f,q:9,attack:1,hold:.6,decay:2.2,gain:.18})];
  return spec(1,1,layers,{ui:true});
}

// ---- Music -------------------------------------------------------------------------------------
// Sparse calm pieces (original, generated): slow major-key pad chords with a few soft plucked notes,
// 30-70 s long, the first 30 s - 2 min into play and then 3-6 min apart, at low volume.
export const MUSIC_FIRST_DELAY:[number,number]=[600,2100];
export const MUSIC_GAP:[number,number]=[3600,7200];
export interface Note{t:number;layer:Layer}
export interface Piece{notes:Note[];length:number}

const PENTATONIC=[0,2,4,7,9];
/** Diatonic triads (semitones from the key root) and the chords each may move to. */
const CHORDS:Record<string,{tones:[number,number,number];next:string[]}>={
  I:{tones:[0,4,7],next:['IV','vi','V','ii','iii']},
  ii:{tones:[2,5,9],next:['V','IV','vi']},
  iii:{tones:[4,7,11],next:['vi','IV']},
  IV:{tones:[5,9,12],next:['I','V','ii','vi']},
  V:{tones:[7,11,14],next:['I','vi','IV']},
  vi:{tones:[9,12,16],next:['IV','ii','V','I']}
};
const hz=(midi:number)=>440*Math.pow(2,(midi-69)/12);

export function composePiece(r:Rand):Piece{
  const root=53+Math.floor(r()*8);// F3 .. C4
  const chords=5+Math.floor(r()*4);
  const notes:Note[]=[];
  let t=0,chord='I';
  for(let c=0;c<chords;c++){
    const len=6.5+r()*2,def=CHORDS[chord];
    const voicing=[root-12+def.tones[0],root+def.tones[1],root+def.tones[2]];
    if(r()<.5)voicing.push(root+12+def.tones[0]);
    for(const m of voicing)notes.push({t,layer:tone(r()<.5?'triangle':'sine',hz(m),{attack:2+r()*.6,hold:Math.max(.5,len-1.2),decay:2.6,
      gain:.045,vibrato:{rate:.3+r()*.3,depth:.002},filter:{type:'lowpass',freq:1400,q:.5}})});
    const plucks=Math.floor(r()*4);
    for(let i=0;i<plucks;i++){
      const m=root+12+PENTATONIC[Math.floor(r()*PENTATONIC.length)]+(r()<.25?12:0);
      notes.push({t:t+.8+r()*(len-1.6),layer:tone('sine',hz(m),{attack:.008,hold:.05,decay:1.8,gain:.05})});
    }
    t+=len;
    const options=def.next;chord=c===chords-2?'I':options[Math.floor(r()*options.length)];
  }
  notes.sort((a,b)=>a.t-b.t);
  let length=t;
  for(const n of notes)length=Math.max(length,n.t+layerEnd(n.layer));
  return{notes,length};
}
