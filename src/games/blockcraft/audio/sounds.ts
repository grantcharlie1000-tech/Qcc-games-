// Sound service: procedural Web Audio for every SoundName (no audio files).
//
//  - One AudioContext, created on the first user gesture (pointer, key or touch) while the shell's sound
//    setting is on. Master gain = MASTER_LEVEL × settings.volume, 0 while game.context.settings.sound is off
//    (read live every frame and every play, since the shell does not announce changes).
//  - The context is suspended while the engine is paused or lost, while the shell pauses the game, while the
//    sound setting is off or the volume is 0, and closed on dispose. Sounds requested while silent are dropped.
//  - At most MAX_VOICES voices (each play() is one voice whatever its layers). A full pool drops a new sound
//    quieter than every playing one, otherwise the quietest voice is faded out and replaced. Beds (rain, music)
//    count toward the cap but are never stolen.
//  - Positional sounds use vanilla's linear falloff (16 × max(1, volume) blocks) from game.player.eye() and a
//    stereo pan from the player's yaw; interface sounds are never positional.
//  - Ambience: vanilla's cave mood (ambience.ts) plays eerie cave sounds after minutes in darkness; rain is a
//    looping bed refreshed by the weather's play('rain') calls whose level follows weather.intensity; sparse
//    generative music plays a calm piece every few minutes at low volume.
// Recipes carry vanilla volume and pitch (synth.ts); `options` multiply them. Unknown names are ignored.
import type {Game,SoundName,SoundService,System,Vec3} from '../engine/contracts';
import {composePiece,caveSpec,moodSoundPosition,moodStep,MUSIC_FIRST_DELAY,MUSIC_GAP,type Piece} from './ambience';
import {rangeFor,spatialize,type Spatial} from './spatial';
import {mulberry,type Layer,type Rand,type SoundSpec} from './spec';
import {soundSpec} from './synth';
import {createNoiseBank,renderLayers,type NoiseBank} from './voice';

export const MAX_VOICES=16;
/** Master gain at full settings volume (headroom for many voices before the limiter). */
export const MASTER_LEVEL=.7;
/** Music bus level relative to the master (calm and low). */
export const MUSIC_LEVEL=.45;
/** Voices quieter than this after attenuation are not started. */
const MIN_LEVEL=.002;
/** Seconds the rain bed keeps sounding after the weather's last play('rain'), and its fade time constant. */
const RAIN_HOLD=4;const RAIN_FADE=.6;const RAIN_RELEASE=3;
const GESTURES=['pointerdown','keydown','touchend','mousedown'] as const;

export interface SoundOptions{
  /** Builds the AudioContext (default: the browser's AudioContext). Returning null or throwing means no audio. */
  createContext?:()=>AudioContext|null;
  /** Where user gestures are heard (default: window). */
  gestureTarget?:EventTarget|null;
  /** Random source for synth variation and ambience (sound never consumes gameplay randomness). */
  random?:Rand;
}

interface Voice{
  name:string;out:GainNode;pan:StereoPannerNode|null;sources:AudioScheduledSourceNode[];
  /** Audio time the voice is silent (Infinity for beds until released). */
  end:number;
  /** Effective gain after volume and attenuation (stealing priority). */
  level:number;bed:boolean;
}
interface RainBed{voice:Voice;volume:number;until:number;target:number;silentSince:number}
interface Music{voice:Voice;piece:Piece;next:number;start:number}

function defaultContext():AudioContext|null{
  const w=globalThis as unknown as {AudioContext?:typeof AudioContext;webkitAudioContext?:typeof AudioContext};
  const Ctor=w.AudioContext??w.webkitAudioContext;
  return Ctor?new Ctor({latencyHint:'interactive'}):null;
}
const clamp01=(v:number)=>v<0?0:v>1?1:v;
const finiteVec=(v:Vec3|null|undefined):v is Vec3=>!!v&&typeof v==='object'&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&Number.isFinite(v.z);

export class SoundEngine implements SoundService{
  private ctx:AudioContext|null=null;private master:GainNode|null=null;private limiter:DynamicsCompressorNode|null=null;
  private bank:NoiseBank|null=null;
  private voices:Voice[]=[];private dying:Voice[]=[];
  private rain:RainBed|null=null;private music:Music|null=null;
  private live=false;private masterTarget=-1;private disposed=false;private unavailable=false;private initialised=false;
  private mood=0;private musicDelay=0;
  private offs:(()=>void)[]=[];
  private readonly rand:Rand;private readonly spatial:Spatial={gain:0,pan:0,distance:0};
  private readonly sample:Vec3={x:0,y:0,z:0};private readonly moodAt:Vec3={x:0,y:0,z:0};
  private reportedState='';private reportedVoices=-1;

  constructor(private readonly game:Game,private readonly options:SoundOptions={}){
    this.rand=options.random??mulberry((Date.now()^0x5bd1e995)>>>0);
  }

  // ---- Inspection (tests and debugging) -------------------------------------------------------
  get audioContext():AudioContext|null{return this.ctx;}
  get masterGain():GainNode|null{return this.master;}
  get voiceCount():number{return this.voices.length;}
  voiceNames():string[]{return this.voices.map(v=>v.name);}
  voiceLevels():number[]{return this.voices.map(v=>v.level);}
  /** Current rain bed target gain (0 when silent or absent). */
  get rainLevel():number{return this.rain?this.rain.target:0;}

  // ---- Lifecycle ------------------------------------------------------------------------------
  init(){
    if(this.initialised||this.disposed)return;
    this.initialised=true;
    const sync=()=>this.sync();
    const ev=this.game.events;
    this.offs.push(ev.on('settingsChanged',sync),ev.on('stateChanged',sync),ev.on('shellPaused',sync));
    const target=this.options.gestureTarget!==undefined?this.options.gestureTarget:(typeof window!=='undefined'?window:null);
    if(target){
      const onGesture=()=>this.gesture();
      for(const type of GESTURES)target.addEventListener(type,onGesture,{capture:true,passive:true});
      this.offs.push(()=>{for(const type of GESTURES)target.removeEventListener(type,onGesture,{capture:true});});
    }
    this.musicDelay=this.delay(MUSIC_FIRST_DELAY);
  }
  tick(){
    if(this.disposed)return;
    try{this.moodTick();this.musicTick();}catch{/* audio is optional */}
  }
  frame(_dt:number){
    if(this.disposed)return;
    try{
      this.sync();
      if(!this.ctx)return;
      this.prune();this.updateRain();this.report();
    }catch{/* audio is optional */}
  }
  reset(){
    this.stopAll();
    this.mood=0;this.musicDelay=this.delay(MUSIC_FIRST_DELAY);
  }
  dispose(){
    if(this.disposed)return;
    this.stopAll();
    this.disposed=true;
    for(const off of this.offs)off();
    this.offs=[];
    const c=this.ctx;this.ctx=null;this.master=null;this.limiter=null;this.bank=null;this.live=false;
    if(c){try{void c.close().catch(()=>{});}catch{/* already closed */}}
    try{this.game.root.dataset.audio='closed';}catch{/* no root */}
  }

  // ---- Playing ---------------------------------------------------------------------------------
  play(name:SoundName,at?:Vec3|null,options?:{volume?:number;pitch?:number}){
    try{this.playNamed(name,at,options);}catch{/* never throw: sound is optional */}
  }
  private playNamed(name:string,at:Vec3|null|undefined,options:{volume?:number;pitch?:number}|undefined){
    if(!this.ctx||this.disposed||typeof name!=='string')return;
    this.sync();
    if(!this.live)return;
    const vol=options&&typeof options.volume==='number'&&options.volume>=0&&Number.isFinite(options.volume)?options.volume:1;
    const pitch=options&&typeof options.pitch==='number'&&options.pitch>0&&Number.isFinite(options.pitch)?options.pitch:1;
    const pos=finiteVec(at)?at:null;
    let distance:number|null=null,eye:Vec3|null=null;
    if(pos){eye=this.game.player.eye();const dx=pos.x-eye.x,dy=pos.y-eye.y,dz=pos.z-eye.z;distance=Math.sqrt(dx*dx+dy*dy+dz*dz);}
    const s=soundSpec(name,this.rand,distance);
    if(!s)return;
    if(s.loop){this.refreshBed(name,s,vol);return;}
    this.playSpec(name,s,vol,pitch,pos,eye);
  }
  /** Starts a one-shot voice for a spec; returns false when it was dropped. */
  private playSpec(name:string,s:SoundSpec,vol:number,pitch:number,pos:Vec3|null,eye:Vec3|null):boolean{
    const volume=s.volume*vol;
    if(!(volume>0))return false;
    let level=Math.min(1,volume),pan=0;
    if(pos&&eye&&!s.ui){
      spatialize(pos,eye,this.game.player.state.yaw,rangeFor(volume),this.spatial);
      level*=this.spatial.gain;pan=this.spatial.pan;
    }
    if(level<MIN_LEVEL||!this.claim(level))return false;
    const p=Math.min(2,Math.max(.5,s.pitch*pitch));
    this.voices.push(this.startVoice(name,s.layers,p,level,pan,false));
    return true;
  }
  private startVoice(name:string,layers:readonly Layer[],pitch:number,level:number,pan:number,bed:boolean,loop=false):Voice{
    const c=this.ctx!,now=c.currentTime;
    const out=c.createGain();out.gain.setValueAtTime(level,now);
    let panner:StereoPannerNode|null=null;
    if(typeof c.createStereoPanner==='function'){
      panner=c.createStereoPanner();panner.pan.setValueAtTime(pan,now);
      out.connect(panner).connect(this.master!);
    }else out.connect(this.master!);
    const sources:AudioScheduledSourceNode[]=[];
    const end=layers.length?renderLayers(c,this.bank!,layers,pitch,now,out,sources,this.rand,loop):now;
    return{name,out,pan:panner,sources,end:bed?Infinity:end+.05,level,bed};
  }

  // ---- Voice pool ------------------------------------------------------------------------------
  /** Makes room for a voice of `level`: true when it may start. */
  private claim(level:number,bed=false):boolean{
    this.prune();
    if(this.voices.length<MAX_VOICES)return true;
    let victim=-1;
    for(let i=0;i<this.voices.length;i++){
      const v=this.voices[i];
      if(!v.bed&&(victim<0||v.level<this.voices[victim].level))victim=i;
    }
    if(victim<0||(!bed&&this.voices[victim].level>level))return false;
    this.release(this.voices[victim]);this.voices.splice(victim,1);
    return true;
  }
  /** Fades a voice out quickly and stops its sources; it leaves the graph once silent. */
  private release(v:Voice,fade=.012){
    const c=this.ctx;if(!c)return;
    const now=c.currentTime;
    try{const g=v.out.gain;const value=g.value;g.cancelScheduledValues(now);g.setValueAtTime(value,now);g.setTargetAtTime(0,now,fade);}catch{/* ignore */}
    for(const s of v.sources){try{s.stop(now+fade*5);}catch{/* already stopped */}}
    v.end=now+fade*5+.02;
    this.dying.push(v);
  }
  private disconnect(v:Voice){try{v.out.disconnect();v.pan?.disconnect();}catch{/* ignore */}}
  /** Drops finished voices (in place, no allocation). */
  private prune(){
    const c=this.ctx;if(!c)return;
    const now=c.currentTime;
    let w=0;
    for(let i=0;i<this.voices.length;i++){const v=this.voices[i];if(!v.bed&&now>=v.end)this.disconnect(v);else this.voices[w++]=v;}
    this.voices.length=w;
    w=0;
    for(let i=0;i<this.dying.length;i++){const v=this.dying[i];if(now>=v.end)this.disconnect(v);else this.dying[w++]=v;}
    this.dying.length=w;
  }
  private removeVoice(v:Voice){
    const i=this.voices.indexOf(v);if(i>=0)this.voices.splice(i,1);
    this.release(v,.2);
  }
  private stopAll(){
    for(const v of this.voices)this.release(v,.01);
    this.voices.length=0;this.rain=null;this.music=null;
  }

  // ---- Context and master gain ----------------------------------------------------------------
  private gesture(){
    if(this.disposed)return;
    try{
      if(!this.ctx){if(this.game.context.settings.sound&&!this.unavailable)this.create();}
      else if(this.ctx.state==='suspended'&&this.audible())void this.ctx.resume().catch(()=>{});
      this.sync();
    }catch{/* audio is optional */}
  }
  private create(){
    let c:AudioContext|null=null;
    try{c=(this.options.createContext??defaultContext)();}catch{c=null;}
    if(!c){this.unavailable=true;return;}
    try{
      const master=c.createGain();master.gain.setValueAtTime(0,c.currentTime);
      let tail:AudioNode=master;
      if(typeof c.createDynamicsCompressor==='function'){
        // A gentle limiter keeps many simultaneous voices from clipping.
        const lim=c.createDynamicsCompressor();
        lim.threshold.setValueAtTime(-10,c.currentTime);lim.knee.setValueAtTime(8,c.currentTime);lim.ratio.setValueAtTime(8,c.currentTime);
        lim.attack.setValueAtTime(.003,c.currentTime);lim.release.setValueAtTime(.2,c.currentTime);
        master.connect(lim);tail=lim;this.limiter=lim;
      }
      tail.connect(c.destination);
      this.ctx=c;this.master=master;this.bank=createNoiseBank(c,this.rand);
      this.live=false;this.masterTarget=-1;
    }catch{
      this.ctx=null;this.master=null;this.unavailable=true;
      try{void c.close().catch(()=>{});}catch{/* ignore */}
    }
  }
  private audible():boolean{
    const g=this.game,c=this.ctx;
    return !!c&&!this.disposed&&c.state!=='closed'&&!!g.context.settings.sound&&!g.shellPaused&&g.state!=='paused'&&g.state!=='lost'&&g.settings.volume>0;
  }
  /** Applies the audible state and master level (cheap when nothing changed). */
  private sync(){
    const c=this.ctx,m=this.master;
    if(!c||!m||this.disposed)return;
    const want=this.audible();
    const target=want?MASTER_LEVEL*clamp01(this.game.settings.volume):0;
    const now=c.currentTime,g=m.gain;
    if(want!==this.live){
      this.live=want;
      g.cancelScheduledValues(now);
      if(want){
        g.setValueAtTime(0,now);g.setTargetAtTime(target,now,.03);
        if(c.state!=='running')void c.resume().catch(()=>{});
      }else{
        g.setTargetAtTime(0,now,.005);
        if(c.state==='running')void c.suspend().catch(()=>{});
      }
      this.masterTarget=target;
    }else if(want&&target!==this.masterTarget){
      g.setTargetAtTime(target,now,.03);this.masterTarget=target;
    }
    this.report();
  }
  /** Root data attributes for browser checks: data-audio (none, running, suspended, closed) and data-audio-voices. */
  private report(){
    const state=this.ctx?this.ctx.state:'none',voices=this.voices.length;
    if(state===this.reportedState&&voices===this.reportedVoices)return;
    this.reportedState=state;this.reportedVoices=voices;
    try{const d=this.game.root.dataset;d.audio=state;d.audioVoices=String(voices);}catch{/* no root */}
  }

  // ---- Beds: rain ------------------------------------------------------------------------------
  private refreshBed(name:string,s:SoundSpec,vol:number){
    if(name!=='rain')return;
    const c=this.ctx!,now=c.currentTime;
    if(!this.rain){
      if(!this.claim(1,true))return;
      const voice=this.startVoice(name,s.layers,1,0,0,true,true);
      voice.out.gain.cancelScheduledValues(now);voice.out.gain.setValueAtTime(0,now);
      this.voices.push(voice);
      this.rain={voice,volume:0,until:0,target:0,silentSince:-1};
    }
    this.rain.volume=clamp01(s.volume*vol);this.rain.until=now+RAIN_HOLD;
    this.updateRain();
  }
  private updateRain(){
    const rain=this.rain,c=this.ctx;
    if(!rain||!c)return;
    const now=c.currentTime;
    const wi=(this.game.weather as {intensity?:unknown}|undefined)?.intensity;
    const intensity=typeof wi==='number'&&Number.isFinite(wi)?clamp01(wi):1;
    const target=now<rain.until?rain.volume*intensity:0;
    if(Math.abs(target-rain.target)>1e-6){
      rain.target=target;rain.voice.level=target;
      rain.voice.out.gain.setTargetAtTime(target,now,RAIN_FADE);
    }
    if(target>0){rain.silentSince=-1;return;}
    if(rain.silentSince<0)rain.silentSince=now;
    else if(now-rain.silentSince>RAIN_RELEASE){this.rain=null;this.removeVoice(rain.voice);}
  }

  // ---- Cave mood -------------------------------------------------------------------------------
  private moodTick(){
    const g=this.game,p=g.player.state,ey=p.y+g.player.eyeHeight();
    this.mood=moodStep(this.mood,g.world,p.x,ey,p.z,this.rand,this.sample);
    if(this.mood<1){if(this.mood<0)this.mood=0;return;}
    this.mood=0;
    if(!this.ctx)return;
    this.sync();
    if(!this.live)return;
    const eye={x:p.x,y:ey,z:p.z};
    moodSoundPosition(eye,this.sample,this.moodAt);
    this.playSpec('cave',caveSpec(this.rand),1,1,this.moodAt,eye);
  }

  // ---- Music -----------------------------------------------------------------------------------
  private delay([min,max]:readonly [number,number]){return Math.ceil(min+this.rand()*(max-min))+1;}
  private musicTick(){
    const c=this.ctx;
    if(!c)return;
    this.sync();
    if(!this.live)return;
    const now=c.currentTime,m=this.music;
    if(m){
      const notes=m.piece.notes;
      while(m.next<notes.length&&m.start+notes[m.next].t<now+1.5){
        const n=notes[m.next++];
        renderLayers(c,this.bank!,[n.layer],1,Math.max(now,m.start+n.t),m.voice.out,m.voice.sources,this.rand);
      }
      if(m.voice.sources.length>64)m.voice.sources.splice(0,m.voice.sources.length-64);
      if(now>=m.start+m.piece.length){
        this.music=null;this.removeVoice(m.voice);this.musicDelay=this.delay(MUSIC_GAP);
      }
      return;
    }
    if(--this.musicDelay>0)return;
    if(!this.claim(1,true)){this.musicDelay=this.delay(MUSIC_FIRST_DELAY);return;}
    const out=c.createGain();out.gain.setValueAtTime(MUSIC_LEVEL,now);out.connect(this.master!);
    const voice:Voice={name:'music',out,pan:null,sources:[],end:Infinity,level:MUSIC_LEVEL,bed:true};
    this.voices.push(voice);
    this.music={voice,piece:composePiece(this.rand),next:0,start:now+.1};
  }
}

/** Test and debugging entry point: the engine with its inspection getters. */
export function createSoundEngine(game:Game,options?:SoundOptions):SoundEngine{return new SoundEngine(game,options);}

/** The game's sound service: exactly play() plus the lifecycle hooks. */
export function createSounds(game:Game,options?:SoundOptions):SoundService{
  const engine=new SoundEngine(game,options);
  const service:SoundService&Required<Pick<System,'init'|'tick'|'frame'|'reset'|'dispose'>>={
    init:()=>engine.init(),tick:()=>engine.tick(),frame:dt=>engine.frame(dt),reset:()=>engine.reset(),dispose:()=>engine.dispose(),
    play:(name,at,opts)=>engine.play(name,at,opts)
  };
  return service;
}
