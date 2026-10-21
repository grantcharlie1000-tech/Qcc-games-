// Sound service: procedural Web Audio for every SoundName (no audio files).
//
//  - One AudioContext, created on the first user gesture (pointer, key, touch, click, or the change of a form control
//    such as the shell's sound checkbox, heard in the capture and the bubble phase so a gesture that switches sound on
//    starts it at once) while the shell's sound setting is on, or on the next frame once the setting is switched on
//    after a gesture. Master gain =
//    MASTER_LEVEL × settings.volume, 0 while game.context.settings.sound is off (read live on every frame, play
//    and event, since the shell does not announce changes; settingsChanged, stateChanged and shellPaused re-sync).
//  - The context is suspended while the engine is paused or lost, while the shell pauses the game, while the
//    sound setting is off or the volume is 0, and closed on dispose. Sounds requested while silent are dropped, and
//    so are sounds requested while the browser holds the context suspended on its own (its clock stands still, so
//    they would all burst out on resume) unless a resume asked for by a gesture is about to complete.
//  - At most MAX_VOICES voices (each play() is one voice whatever its layers). A full pool drops a new sound
//    quieter than every playing one, otherwise the quietest voice is faded out and replaced. Beds (rain,
//    underwater, music) count toward the cap but are never stolen.
//  - Positional sounds use vanilla's linear falloff (16 × max(1, volume) blocks) from game.player.eye() and a
//    stereo pan from the player's yaw, re-applied every frame while they play (the listener is the camera, as in
//    OpenAL); interface sounds are never positional and thunder is never attenuated (it keeps the direction it came
//    from and turns with the head; its timbre follows thunderDistance()).
//  - Ambience: vanilla's cave mood (ambience.ts) plays eerie cave sounds after minutes in darkness; rain is a
//    looping bed refreshed by the weather's play('rain') calls (level = the call's volume capped by
//    weather.intensity, softly panned toward the raining column and low-passed when the call's pitch is below 1,
//    as for rain on the roof; level, muffling, nearness and pan are averaged over recent calls, as vanilla's
//    overlapping rain samples average out); the underwater loop and its additions follow the player's eyes in water;
//    sparse generative music plays a calm piece every few minutes at low volume, waiting while the world stands still
//    (death screen, loading).
// Recipes carry vanilla's event volume and pitch as defaults; as in vanilla playSound(sound, volume, pitch), a
// caller's volume or pitch replaces them (resolveLevels). Unknown names are ignored, nothing here ever throws.
import type {Game,SoundName,SoundService,System,Vec3} from '../engine/contracts';
import {composePiece,caveSpec,moodSoundPosition,moodStep,underwaterLoopSpec,underwaterSpec,MUSIC_FIRST_DELAY,MUSIC_GAP,
  UNDERWATER_CHANCES,UNDERWATER_FADE_TICKS,type Piece,type UnderwaterSound} from './ambience';
import {ATTENUATION_DISTANCE,rangeFor,spatialize,stereoPan,type Spatial} from './spatial';
import {mulberry,resolveLevels,type Layer,type Rand,type SoundSpec} from './spec';
import {soundSpec,thunderDistance} from './synth';
import {createNoiseBank,renderLayers,type NoiseBank} from './voice';

export const MAX_VOICES=16;
/** Master gain at full settings volume (headroom for many voices before the limiter). */
export const MASTER_LEVEL=.7;
/** Music bus level relative to the master (calm and low). */
export const MUSIC_LEVEL=.45;
/** Underwater loop level at full fade. */
export const UNDERWATER_LEVEL=.5;
/** Voices quieter than this after attenuation are not started. */
const MIN_LEVEL=.002;
/** Seconds the rain bed keeps sounding after the weather's last play('rain'), its level time constant, and how long
 *  it lingers silent before it is released. */
const RAIN_HOLD=4;const RAIN_FADE=.8;const RAIN_RELEASE=3;
/** Rain is a bed, not a point source: the raining column's distance only softens it (to this floor) and its
 *  direction only half pans it, both averaged over recent calls. */
const RAIN_NEAR_FLOOR=.6;const RAIN_PAN=.5;const RAIN_AVERAGE=.3;
/** Rain low-pass cutoff when unmuffled; a call pitch p < 1 muffles it to RAIN_OPEN × p⁴ (p = 0.5 → 750 Hz, 4 octaves). */
const RAIN_OPEN=12000;const RAIN_MAX_MUFFLE=Math.log2(RAIN_OPEN/300);
/** Weight of each play('rain') in the averaged level and muffling (in octaves). The weather picks a random column every
 *  ~1 s, on the roof above or on open ground nearby: averaged, a canopy or a house by open ground settles in between
 *  instead of jumping between 750 Hz and 12 kHz with every call; going indoors muffles it over a few seconds. */
const RAIN_SMOOTH=.25;
/** Octaves a call's pitch muffles the rain bed by. */
const muffleOf=(pitch:number)=>pitch>=1?0:Math.min(RAIN_MAX_MUFFLE,-4*Math.log2(pitch));
/** Seconds a pending resume() keeps accepting sounds (and blocks further resume calls) before it counts as stalled. */
const RESUME_GRACE=1;
/** Music notes are scheduled this many seconds ahead; one more than MUSIC_LATE seconds overdue (after a main-thread
 *  hitch) is skipped rather than stacked onto the notes due now. */
const MUSIC_LOOKAHEAD=1.5;const MUSIC_LATE=.25;
/** Playing voices with less than this many seconds left are not re-spatialised; time constant of those updates. */
const FOLLOW_MIN=.1;const FOLLOW_TC=.05;
const GESTURES=['pointerdown','pointerup','mousedown','touchend','keydown','click','change'] as const;

export interface SoundOptions{
  /** Builds the AudioContext (default: the browser's AudioContext). Returning null or throwing means no audio. */
  createContext?:()=>AudioContext|null;
  /** Where user gestures are heard (default: window). */
  gestureTarget?:EventTarget|null;
  /** Random source for synth variation and ambience (sound never consumes gameplay randomness). */
  random?:Rand;
}

interface Voice{
  name:string;out:GainNode;filter:BiquadFilterNode|null;pan:StereoPannerNode|null;sources:AudioScheduledSourceNode[];
  /** Audio time the voice is silent (Infinity for beds until released). */
  end:number;
  /** Effective gain after volume and attenuation (stealing priority). */
  level:number;bed:boolean;
  /** Follows the listener: 0 no, 1 a source at (x,y,z) attenuated over `range`, 2 a global sound (thunder) from the
   *  direction (x,y,z) relative to the listener, panned only. `base` is the gain before attenuation, `panned` the pan. */
  follow:0|1|2;x:number;y:number;z:number;range:number;base:number;panned:number;
}
interface RainBed{voice:Voice;volume:number;until:number;target:number;silentSince:number;near:number;pan:number;
  /** Averaged muffling in octaves below RAIN_OPEN, and the cutoff it gives. */
  muffle:number;cutoff:number}
interface UnderwaterBed{voice:Voice;target:number}
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
  private rain:RainBed|null=null;private underwater:UnderwaterBed|null=null;private music:Music|null=null;
  private live=false;private masterTarget=-1;private disposed=false;private unavailable=false;private initialised=false;
  /** Our latest resume()/suspend() request while it is in flight, its sequence number, and how long a resume has been
   *  pending (seconds of frames). */
  private pending:'resume'|'suspend'|null=null;private pendingSeq=0;private resumeAge=0;
  /** Audio time the world stopped running (death screen, loading; -1 while it runs): the piece waits that long. */
  private musicAway=-1;
  private readonly noteLayer:Layer[]=[];
  /** A user gesture has been seen (the page may start audio from now on). */
  private activated=false;
  private mood=0;private musicDelay=0;private submerged=false;private fade=0;
  private offs:(()=>void)[]=[];
  private readonly rand:Rand;private readonly spatial:Spatial={gain:0,pan:0,distance:0};
  private readonly levels={volume:0,pitch:1};
  private readonly sample:Vec3={x:0,y:0,z:0};private readonly moodAt:Vec3={x:0,y:0,z:0};private readonly moodEye:Vec3={x:0,y:0,z:0};
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
  /** Rain bed: target gain (0 when silent or absent), smoothed pan and low-pass cutoff in Hz. */
  get rainLevel():number{return this.rain?this.rain.target:0;}
  get rainPan():number{return this.rain?this.rain.pan:0;}
  get rainCutoff():number{return this.rain?this.rain.cutoff:RAIN_OPEN;}
  /** Underwater loop target gain (0 when absent). */
  get underwaterLevel():number{return this.underwater?this.underwater.target:0;}
  /** Seconds into the playing music piece (-1 when none). */
  get musicTime():number{return this.music&&this.ctx?this.ctx.currentTime-this.music.start:-1;}

  // ---- Lifecycle ------------------------------------------------------------------------------
  init(){
    if(this.initialised||this.disposed)return;
    this.initialised=true;
    const sync=()=>this.sync();
    const ev=this.game.events;
    this.offs.push(ev.on('settingsChanged',sync),ev.on('stateChanged',sync),ev.on('shellPaused',sync));
    const target=this.options.gestureTarget!==undefined?this.options.gestureTarget:(typeof window!=='undefined'?window:null);
    if(target){
      // Capture: before any handler can stop the event. Bubble: after the page's own handlers ran, so a click or change
      // that switched the shell's sound on is seen with the new setting while it is still a user gesture.
      const onGesture=()=>this.gesture();
      for(const type of GESTURES)for(const capture of [true,false])target.addEventListener(type,onGesture,{capture,passive:true});
      this.offs.push(()=>{for(const type of GESTURES)for(const capture of [true,false])target.removeEventListener(type,onGesture,{capture});});
    }
    this.musicDelay=this.delay(MUSIC_FIRST_DELAY);
  }
  tick(){
    if(this.disposed)return;
    try{this.moodTick();this.underwaterTick();this.musicTick();}catch{/* audio is optional */}
  }
  frame(_dt:number){
    if(this.disposed)return;
    try{
      if(this.pending==='resume')this.resumeAge+=Number.isFinite(_dt)&&_dt>0?_dt:0;
      this.sync();
      if(!this.ctx)return;
      this.prune();this.followListener();this.updateRain();this.report();
    }catch{/* audio is optional */}
  }
  reset(){
    this.stopAll();
    this.mood=0;this.fade=0;this.submerged=false;this.musicAway=-1;this.musicDelay=this.delay(MUSIC_FIRST_DELAY);
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
    if(!this.ready())return;
    const pos=finiteVec(at)?at:null;
    let distance:number|null=null,eye:Vec3|null=null;
    if(pos){eye=this.game.player.eye();const dx=pos.x-eye.x,dy=pos.y-eye.y,dz=pos.z-eye.z;distance=Math.sqrt(dx*dx+dy*dy+dz*dz);}
    const opts=options&&typeof options==='object'?options:null;
    if(name==='thunder')distance=thunderDistance(distance,opts?.volume);
    const s=soundSpec(name,this.rand,distance);
    if(!s)return;
    const {volume,pitch}=resolveLevels(s,opts,this.levels);
    if(s.loop){this.refreshRain(name,s,volume,pitch,pos,eye);return;}
    this.playSpec(name,s,volume,pitch,pos,eye);
  }
  /** Starts a one-shot voice at a resolved volume and playback rate; returns false when it was dropped. */
  private playSpec(name:string,s:SoundSpec,volume:number,pitch:number,pos:Vec3|null,eye:Vec3|null):boolean{
    if(!(volume>0))return false;
    const base=Math.min(1,volume),range=rangeFor(volume);
    let level=base,pan=0;
    const positional=pos&&eye&&!s.ui?pos:null;
    if(positional){
      spatialize(positional,eye!,this.game.player.state.yaw,range,this.spatial);
      if(!s.global)level*=this.spatial.gain;
      pan=this.spatial.pan;
    }
    if(level<MIN_LEVEL||!this.claim(level))return false;
    const v=this.startVoice(name,s.layers,pitch,level,pan,false);
    if(positional){
      v.base=base;v.range=range;
      if(s.global){v.follow=2;v.x=positional.x-eye!.x;v.y=positional.y-eye!.y;v.z=positional.z-eye!.z;}
      else{v.follow=1;v.x=positional.x;v.y=positional.y;v.z=positional.z;}
    }
    this.voices.push(v);
    return true;
  }
  /** Builds a voice: layers → gain (level) → optional low-pass (beds) → stereo pan → master. */
  private startVoice(name:string,layers:readonly Layer[],pitch:number,level:number,pan:number,bed:boolean,loop=false,lowpass=0):Voice{
    const c=this.ctx!,now=c.currentTime;
    const out=c.createGain();out.gain.setValueAtTime(level,now);
    let tail:AudioNode=out,filter:BiquadFilterNode|null=null,panner:StereoPannerNode|null=null;
    if(lowpass>0){
      filter=c.createBiquadFilter();filter.type='lowpass';
      filter.frequency.setValueAtTime(Math.min(lowpass,c.sampleRate*.45),now);filter.Q.setValueAtTime(.5,now);
      tail.connect(filter);tail=filter;
    }
    if(typeof c.createStereoPanner==='function'){
      panner=c.createStereoPanner();panner.pan.setValueAtTime(pan,now);
      tail.connect(panner);tail=panner;
    }
    tail.connect(this.master!);
    const sources:AudioScheduledSourceNode[]=[];
    const end=layers.length?renderLayers(c,this.bank!,layers,pitch,now,out,sources,this.rand,loop):now;
    return{name,out,filter,pan:panner,sources,end:bed?Infinity:end+.05,level,bed,follow:0,x:0,y:0,z:0,range:0,base:level,panned:pan};
  }
  /** Re-spatialises playing positional voices from the current eye and yaw (no allocation; nothing is rescheduled
   *  while the listener stands still). */
  private followListener(){
    const c=this.ctx;if(!c)return;
    const now=c.currentTime,yaw=this.game.player.state.yaw;
    let eye:Vec3|null=null;
    for(let i=0;i<this.voices.length;i++){
      const v=this.voices[i];
      if(!v.follow||v.end-now<FOLLOW_MIN)continue;
      let level=v.base,pan:number;
      if(v.follow===2)pan=stereoPan(v.x,v.y,v.z,yaw);
      else{
        if(!eye)eye=this.game.player.eye();
        spatialize(v,eye,yaw,v.range,this.spatial);
        level*=this.spatial.gain;pan=this.spatial.pan;
      }
      if(Math.abs(level-v.level)>.002){v.level=level;v.out.gain.setTargetAtTime(level,now,FOLLOW_TC);}
      if(v.pan&&Math.abs(pan-v.panned)>.01){v.panned=pan;v.pan.pan.setTargetAtTime(pan,now,FOLLOW_TC);}
    }
  }

  // ---- Voice pool ------------------------------------------------------------------------------
  /** Makes room for a voice of `level`: true when it may start. Beds always get a slot unless every voice is a bed. */
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
  private disconnect(v:Voice){try{v.out.disconnect();v.filter?.disconnect();v.pan?.disconnect();}catch{/* ignore */}}
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
  private removeVoice(v:Voice,fade=.2){
    const i=this.voices.indexOf(v);if(i>=0)this.voices.splice(i,1);
    this.release(v,fade);
  }
  private stopAll(){
    for(const v of this.voices)this.release(v,.01);
    this.voices.length=0;this.rain=null;this.underwater=null;this.music=null;
  }

  // ---- Context and master gain ----------------------------------------------------------------
  private gesture(){
    if(this.disposed)return;
    this.activated=true;
    try{
      if(!this.ctx){if(this.game.context.settings.sound&&!this.unavailable)this.create();}
      else if(this.ctx.state!=='running'&&this.audible())this.resumeContext();
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
  /** Sounds may start now: audible, and the context runs or a resume is about to complete. */
  private ready():boolean{
    const c=this.ctx;
    return this.live&&!!c&&(c.state==='running'||(this.pending==='resume'&&this.resumeAge<RESUME_GRACE));
  }
  /** Asks a context that is not running (suspended, or Safari's 'interrupted') or that we are suspending to resume;
   *  one request at a time, though a stalled resume may be retried by a later gesture. */
  private resumeContext(){
    const c=this.ctx;
    if(!c||c.state==='closed'||(this.pending==='resume'&&this.resumeAge<RESUME_GRACE))return;
    if(c.state!=='running'||this.pending==='suspend')this.request(c,'resume');
  }
  /** Suspends a running context (or one we are resuming); one request at a time. */
  private suspendContext(){
    const c=this.ctx;
    if(!c||c.state==='closed'||this.pending==='suspend')return;
    if(c.state==='running'||this.pending==='resume')this.request(c,'suspend');
  }
  /** Calls resume() or suspend(); when the latest request settles, the context is brought back in line with what is
   *  wanted now (sound may have come back while a suspend was in flight). */
  private request(c:AudioContext,kind:'resume'|'suspend'){
    const seq=++this.pendingSeq;
    this.pending=kind;
    if(kind==='resume')this.resumeAge=0;
    const done=()=>{
      if(this.ctx!==c||seq!==this.pendingSeq||this.disposed)return;
      this.pending=null;
      if(kind==='suspend'&&this.live)this.resumeContext();
      this.sync();
    };
    try{Promise.resolve(kind==='resume'?c.resume():c.suspend()).then(done,done);}catch{this.pending=null;}
  }
  private audible():boolean{
    const g=this.game,c=this.ctx;
    return !!c&&!this.disposed&&c.state!=='closed'&&!!g.context.settings.sound&&!g.shellPaused&&g.state!=='paused'&&g.state!=='lost'&&g.settings.volume>0;
  }
  /** Applies the audible state and master level (cheap when nothing changed). */
  private sync(){
    if(this.disposed)return;
    // Sound switched on after the page was already activated: start now (a later gesture resumes it if the browser
    // still holds it suspended).
    if(!this.ctx&&this.activated&&!this.unavailable&&this.game.context.settings.sound)this.create();
    const c=this.ctx,m=this.master;
    if(!c||!m)return;
    const want=this.audible();
    const target=want?MASTER_LEVEL*clamp01(this.game.settings.volume):0;
    const now=c.currentTime,g=m.gain;
    if(want!==this.live){
      this.live=want;
      g.cancelScheduledValues(now);
      if(want){
        g.setValueAtTime(0,now);g.setTargetAtTime(target,now,.03);
        this.resumeContext();
      }else g.setTargetAtTime(0,now,.005);
      this.masterTarget=target;
    }else if(want&&target!==this.masterTarget){
      g.setTargetAtTime(target,now,.03);this.masterTarget=target;
    }
    // Silent: keep the context suspended (also when a resume completed after sound went away). A context the browser
    // suspended while audible is left alone until a gesture resumes it.
    if(!want)this.suspendContext();
    // The world stopped (death screen, loading): the music piece waits from now until ticks come back.
    const st=this.game.state;
    if(this.musicAway<0&&st!=='playing'&&st!=='screen')this.musicAway=now;
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
  private refreshRain(name:string,s:SoundSpec,volume:number,pitch:number,pos:Vec3|null,eye:Vec3|null){
    if(name!=='rain')return;
    const c=this.ctx!,now=c.currentTime;
    // Where it rains relative to the listener: nearer columns sound fuller, the direction leans the bed.
    let near=1,pan=0;
    if(pos&&eye){
      spatialize(pos,eye,this.game.player.state.yaw,ATTENUATION_DISTANCE,this.spatial);
      near=RAIN_NEAR_FLOOR+(1-RAIN_NEAR_FLOOR)*this.spatial.gain;pan=this.spatial.pan*RAIN_PAN;
    }
    const muffle=muffleOf(pitch),level=clamp01(volume);
    let rain=this.rain;
    if(!rain){
      if(!this.claim(1,true))return;
      const cutoff=RAIN_OPEN*Math.pow(2,-muffle);
      const voice=this.startVoice(name,s.layers,1,0,pan,true,true,cutoff);
      voice.out.gain.cancelScheduledValues(now);voice.out.gain.setValueAtTime(0,now);
      this.voices.push(voice);
      rain=this.rain={voice,volume:level,until:0,target:0,silentSince:-1,near,pan,muffle,cutoff};
    }else{
      rain.near+=(near-rain.near)*RAIN_AVERAGE;
      const p=rain.pan+(pan-rain.pan)*RAIN_AVERAGE;
      if(Math.abs(p-rain.pan)>.005){rain.pan=p;rain.voice.pan?.pan.setTargetAtTime(p,now,RAIN_FADE);}
      rain.volume+=(level-rain.volume)*RAIN_SMOOTH;
      rain.muffle+=(muffle-rain.muffle)*RAIN_SMOOTH;
      const cutoff=RAIN_OPEN*Math.pow(2,-rain.muffle);
      if(Math.abs(cutoff/rain.cutoff-1)>.01){rain.cutoff=cutoff;rain.voice.filter?.frequency.setTargetAtTime(Math.min(cutoff,c.sampleRate*.45),now,RAIN_FADE);}
    }
    rain.until=now+RAIN_HOLD;
    this.updateRain();
  }
  private updateRain(){
    const rain=this.rain,c=this.ctx;
    if(!rain||!c)return;
    const now=c.currentTime;
    const wi=(this.game.weather as {intensity?:unknown}|undefined)?.intensity;
    const intensity=typeof wi==='number'&&Number.isFinite(wi)?clamp01(wi):1;
    const target=now<rain.until?Math.min(rain.volume,intensity)*rain.near:0;
    if(Math.abs(target-rain.target)>1e-4||(target===0&&rain.target!==0)){
      rain.target=target;rain.voice.level=target;
      rain.voice.out.gain.setTargetAtTime(target,now,RAIN_FADE);
    }
    if(target>0){rain.silentSince=-1;return;}
    if(rain.silentSince<0)rain.silentSince=now;
    else if(now-rain.silentSince>RAIN_RELEASE){this.rain=null;this.removeVoice(rain.voice);}
  }

  // ---- Beds: underwater ------------------------------------------------------------------------
  private underwaterTick(){
    const under=!!this.game.player.state.headInWater;
    const changed=under!==this.submerged;
    this.submerged=under;
    this.fade=under?Math.min(UNDERWATER_FADE_TICKS,this.fade+1):Math.max(0,this.fade-2);
    const c=this.ctx;
    if(!c)return;
    this.sync();
    const bed=this.underwater;
    if(!this.ready()){
      if(bed&&this.fade===0){this.underwater=null;this.removeVoice(bed.voice,.05);}
      return;
    }
    if(changed)this.playUnderwater(under?'enter':'exit');
    if(this.fade>0){
      const target=this.fade/UNDERWATER_FADE_TICKS*UNDERWATER_LEVEL,now=c.currentTime;
      if(!bed){
        if(!this.claim(1,true))return;
        const voice=this.startVoice('underwater',underwaterLoopSpec().layers,1,0,0,true,true);
        voice.out.gain.cancelScheduledValues(now);voice.out.gain.setValueAtTime(0,now);
        this.voices.push(voice);
        this.underwater={voice,target:-1};
      }
      const u=this.underwater!;
      if(target!==u.target){u.target=target;u.voice.level=target;u.voice.out.gain.setTargetAtTime(target,now,.05);}
    }else if(bed){this.underwater=null;this.removeVoice(bed.voice,.05);}
    if(under){
      const f=this.rand();
      if(f<UNDERWATER_CHANCES.ultraRare)this.playUnderwater('ultra_rare');
      else if(f<UNDERWATER_CHANCES.rare)this.playUnderwater('rare');
      else if(f<UNDERWATER_CHANCES.additions)this.playUnderwater('additions');
    }
  }
  private playUnderwater(kind:UnderwaterSound){
    const s=underwaterSpec(kind,this.rand);
    this.playSpec(`underwater_${kind}`,s,s.volume,s.pitch,null,null);
  }

  // ---- Cave mood -------------------------------------------------------------------------------
  private moodTick(){
    const g=this.game,p=g.player.state,e=this.moodEye;
    e.x=p.x;e.y=p.y+g.player.eyeHeight();e.z=p.z;
    this.mood=moodStep(this.mood,g.world,e.x,e.y,e.z,this.rand,this.sample);
    if(this.mood<1){if(this.mood<0)this.mood=0;return;}
    this.mood=0;
    if(!this.ctx)return;
    this.sync();
    if(!this.ready())return;
    moodSoundPosition(e,this.sample,this.moodAt);
    const s=caveSpec(this.rand);
    this.playSpec('cave',s,s.volume,s.pitch,this.moodAt,e);
  }

  // ---- Music -----------------------------------------------------------------------------------
  private delay([min,max]:readonly [number,number]){return Math.ceil(min+this.rand()*(max-min))+1;}
  private musicTick(){
    const c=this.ctx;
    if(!c)return;
    this.sync();
    if(!this.ready())return;
    const now=c.currentTime,m=this.music;
    if(this.musicAway>=0){
      // Ticks stopped while the audio clock ran on (death screen): the piece waits instead of bursting out missed notes.
      if(m&&now>this.musicAway)m.start+=now-this.musicAway;
      this.musicAway=-1;
    }
    if(m){
      const notes=m.piece.notes,layer=this.noteLayer;
      while(m.next<notes.length&&m.start+notes[m.next].t<now+MUSIC_LOOKAHEAD){
        const n=notes[m.next++],t=m.start+n.t;
        // Overdue after a main-thread hitch: skipped, so missed notes never pile up at once.
        if(t<now-MUSIC_LATE)continue;
        layer[0]=n.layer;
        renderLayers(c,this.bank!,layer,1,Math.max(now,t),m.voice.out,m.voice.sources,this.rand);
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
    const voice:Voice={name:'music',out,filter:null,pan:null,sources:[],end:Infinity,level:MUSIC_LEVEL,bed:true,
      follow:0,x:0,y:0,z:0,range:0,base:MUSIC_LEVEL,panned:0};
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
