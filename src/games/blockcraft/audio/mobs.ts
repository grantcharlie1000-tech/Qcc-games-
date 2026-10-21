// Mob voices for every kind in MOB_KINDS (data/items.ts): ambient, hurt, death and step, played by the
// entity service as `mob:<name>:<kind>`. Vanilla levels: voices at the mob's getSoundVolume() (1 for most;
// 0.4 for cows, wolves, squid and small slimes; rabbits quieter) with pitch (r - r) × 0.2 + 1, steps at 0.15.
// Companion wolves also play the wolf_growl, wolf_whine, wolf_pant and wolf_shake ambient variants.
// Unknown creatures get a stable generic voice derived from their name.
import type {MobSoundKind} from '../engine/contracts';
import {grains,hashString,hits,louder,mulberry,noise,rumble,spec,tone,vanillaPitch,vary,type Layer,type Rand,type SoundSpec} from './spec';

interface Voice{
  ambient(r:Rand,f:number):Layer[];hurt(r:Rand,f:number):Layer[];death(r:Rand,f:number):Layer[];step(r:Rand,f:number):Layer[];
  /** Vanilla getSoundVolume() for this mob (default 1); ambient may be quieter still. */
  volume?:number;ambientVolume?:number;
  /** Loudness trim per sound so every sample set sits near the same rendered level before the volumes above apply. */
  trim?:Partial<Record<MobSoundKind,number>>;
}
type Filter={type:BiquadFilterType;freq:number;q:number};
const bp=(freq:number,q=1.5):Filter=>({type:'bandpass',freq,q});
const lp=(freq:number,q=1):Filter=>({type:'lowpass',freq,q});

const wolfHurt=(_r:Rand,f:number)=>[tone('sawtooth',900*f,{freqEnd:620*f,attack:.008,hold:.05,decay:.12,gain:.25,filter:bp(1400)}),
  noise('bandpass',1500*f,{q:1,decay:.08,gain:.1})];
const wolfDeath=(_r:Rand,f:number)=>[tone('sawtooth',820*f,{freqEnd:300*f,attack:.01,hold:.2,decay:.4,gain:.24,vibrato:{rate:7,depth:.04},filter:bp(1200)}),
  noise('bandpass',1200*f,{q:1,attack:.02,decay:.3,gain:.08})];
const wolfStep=(_r:Rand,f:number)=>[noise('bandpass',1400*f,{q:1.3,decay:.03,gain:.4}),rumble(240*f,{attack:.003,decay:.04,gain:.25})];

const VOICES:Record<string,Voice>={
  // Low, drawn-out moo with a vocal formant.
  cow:{volume:.4,trim:{ambient:.7,hurt:.7,death:.7},
    ambient:(_r,f)=>[tone('sawtooth',128*f,{freqEnd:104*f,attack:.12,hold:.55,decay:.35,gain:.3,vibrato:{rate:5,depth:.012},filter:lp(900)}),
      tone('sawtooth',129*f,{freqEnd:105*f,attack:.14,hold:.5,decay:.35,gain:.16,filter:bp(620,3)}),
      rumble(300,{attack:.15,hold:.4,decay:.3,gain:.08})],
    hurt:(_r,f)=>[tone('sawtooth',172*f,{freqEnd:128*f,attack:.03,hold:.12,decay:.16,gain:.32,filter:lp(1100)}),
      tone('sawtooth',173*f,{freqEnd:129*f,attack:.03,hold:.1,decay:.16,gain:.14,filter:bp(700,3)})],
    death:(_r,f)=>[tone('sawtooth',142*f,{freqEnd:78*f,attack:.06,hold:.6,decay:.5,gain:.3,vibrato:{rate:4,depth:.02},filter:lp(850)}),
      tone('sawtooth',143*f,{freqEnd:79*f,attack:.08,hold:.55,decay:.5,gain:.14,filter:bp(560,3)}),
      rumble(260,{delay:.9,decay:.2,gain:.3})],
    step:(_r,f)=>[rumble(250*f,{attack:.003,decay:.08,gain:.5}),noise('bandpass',900*f,{q:1.2,decay:.04,gain:.25})]},
  // Snorting double grunt; squeals when hurt.
  pig:{trim:{ambient:4,hurt:1.2},
    ambient:(_r,f)=>[tone('square',182*f,{freqEnd:140*f,attack:.01,decay:.12,gain:.18,tremolo:{rate:30,depth:.5},filter:bp(800,2)}),
      tone('square',176*f,{freqEnd:132*f,delay:.22,attack:.01,decay:.14,gain:.18,tremolo:{rate:28,depth:.5},filter:bp(760,2)}),
      noise('bandpass',1200*f,{q:1.5,decay:.09,gain:.16,bursts:hits([0,.22],.1,.18)})],
    hurt:(_r,f)=>[tone('sawtooth',520*f,{freqEnd:760*f,attack:.015,hold:.14,decay:.12,gain:.25,vibrato:{rate:12,depth:.03},filter:bp(1500,2)}),
      noise('bandpass',1400*f,{q:1.2,decay:.12,gain:.12})],
    death:(_r,f)=>[tone('sawtooth',760*f,{freqEnd:300*f,attack:.015,hold:.3,decay:.35,gain:.25,vibrato:{rate:10,depth:.04},filter:bp(1300,2)}),
      noise('bandpass',1200*f,{q:1.2,attack:.01,decay:.3,gain:.1})],
    step:(_r,f)=>[noise('bandpass',1100*f,{q:1.4,decay:.04,gain:.4}),rumble(210*f,{attack:.003,decay:.06,gain:.35})]},
  // Bleat: a nasal tone with a fast amplitude wobble.
  sheep:{trim:{ambient:1.5,hurt:1.5,death:1.5,step:1.4},
    ambient:(_r,f)=>[tone('sawtooth',282*f,{freqEnd:250*f,attack:.05,hold:.45,decay:.25,gain:.26,tremolo:{rate:22,depth:.6},filter:bp(1100)}),
      tone('sawtooth',567*f,{freqEnd:502*f,attack:.06,hold:.4,decay:.25,gain:.08,tremolo:{rate:22,depth:.6},filter:bp(1900,2)})],
    hurt:(_r,f)=>[tone('sawtooth',332*f,{freqEnd:282*f,attack:.02,hold:.12,decay:.12,gain:.26,tremolo:{rate:26,depth:.55},filter:bp(1200)})],
    death:(_r,f)=>[tone('sawtooth',302*f,{freqEnd:198*f,attack:.04,hold:.5,decay:.4,gain:.26,tremolo:{rate:18,depth:.6},filter:bp(1000)}),
      tone('sawtooth',604*f,{freqEnd:396*f,attack:.05,hold:.45,decay:.4,gain:.07,tremolo:{rate:18,depth:.6},filter:bp(1700,2)})],
    step:(_r,f)=>[noise('lowpass',520*f,{attack:.006,decay:.07,gain:.45}),noise('bandpass',950*f,{q:1,decay:.03,gain:.2})]},
  // Clucks ending in a "bawk".
  chicken:{trim:{ambient:2.2,hurt:1.2,death:1.2},
    ambient:(_r,f)=>[tone('square',700*f,{freqEnd:520*f,attack:.004,decay:.05,gain:.14,filter:bp(1400,3)}),
      tone('square',680*f,{freqEnd:500*f,delay:.11,attack:.004,decay:.05,gain:.14,filter:bp(1400,3)}),
      tone('square',900*f,{freqEnd:600*f,delay:.24,attack:.005,hold:.06,decay:.08,gain:.16,filter:bp(1500,3)})],
    hurt:(_r,f)=>[tone('sawtooth',1100*f,{freqEnd:800*f,attack:.01,hold:.08,decay:.1,gain:.2,vibrato:{rate:25,depth:.06},filter:bp(1800,2)}),
      noise('highpass',2500*f,{decay:.12,gain:.1})],
    death:(_r,f)=>[tone('sawtooth',1000*f,{freqEnd:450*f,attack:.01,hold:.15,decay:.22,gain:.2,vibrato:{rate:22,depth:.07},filter:bp(1600,2)}),
      noise('highpass',2400*f,{decay:.25,gain:.1})],
    step:(_r,f)=>[noise('highpass',3000*f,{q:.8,decay:.015,gain:.3,bursts:hits([0,.035],.015,.32)})]},
  // Quiet sniffs and squeaks; hops thump.
  rabbit:{volume:.6,trim:{ambient:1.5,hurt:.5,death:.4,step:1.8},
    ambient:(_r,f)=>[tone('sine',1800*f,{freqEnd:2200*f,attack:.006,decay:.06,gain:.18}),
      noise('bandpass',3200*f,{q:1.5,decay:.03,gain:.18,bursts:hits([.09,.16],.03,.2)})],
    hurt:(_r,f)=>[tone('sine',2000*f,{freqEnd:2600*f,attack:.005,hold:.05,decay:.08,gain:.25}),
      tone('sine',4000*f,{freqEnd:5200*f,attack:.005,decay:.06,gain:.06})],
    death:(_r,f)=>[tone('sine',2400*f,{freqEnd:1200*f,attack:.006,hold:.15,decay:.25,gain:.25,vibrato:{rate:14,depth:.05}}),
      tone('sine',4800*f,{freqEnd:2400*f,attack:.006,hold:.1,decay:.2,gain:.05})],
    step:(_r,f)=>[rumble(300*f,{attack:.003,decay:.06,gain:.4}),noise('bandpass',1300*f,{q:1,decay:.025,gain:.15})]},
  // Two-note bark (companions pick growls, whines and pants themselves, see the wolf_* variants below); yelps when
  // hurt, whimpers when dying.
  wolf:{volume:.4,trim:{ambient:2,hurt:1.3,step:1.4},
    ambient:(_r,f)=>[
      noise('bandpass',620*f,{q:1.5,attack:.008,decay:.11,gain:.4}),
      tone('sawtooth',430*f,{freqEnd:260*f,attack:.008,decay:.13,gain:.25,filter:lp(1400)}),
      noise('bandpass',600*f,{q:1.5,delay:.27,attack:.008,decay:.1,gain:.35}),
      tone('sawtooth',410*f,{freqEnd:250*f,delay:.27,attack:.008,decay:.12,gain:.22,filter:lp(1300)})],
    hurt:wolfHurt,death:wolfDeath,step:wolfStep},
  // Companion wolves' own ambient sounds (vanilla Wolf.getAmbientSound: growl when angry, else a third of the time a
  // pant, or a whine when tamed below half health; the fur shake after getting wet). Hurt, death and steps are the wolf's.
  // A low, rough, rolling growl.
  wolf_growl:{volume:.4,trim:{hurt:1.3,step:1.4},
    ambient:(_r,f)=>[
      tone('sawtooth',150*f,{freqEnd:118*f,attack:.07,hold:.42,decay:.32,gain:.34,fm:{ratio:.5,depth:.35},tremolo:{rate:22,depth:.55},filter:lp(700)}),
      rumble(380*f,{attack:.06,hold:.42,decay:.3,gain:.28,tremolo:{rate:22,depth:.6}}),
      noise('bandpass',900*f,{q:1.2,attack:.08,hold:.35,decay:.25,gain:.08})],
    hurt:wolfHurt,death:wolfDeath,step:wolfStep},
  // A high, nasal whimper that rises and falls.
  wolf_whine:{volume:.4,trim:{ambient:1.2,hurt:1.3,step:1.4},
    ambient:(_r,f)=>[
      tone('sawtooth',720*f,{freqEnd:920*f,attack:.04,hold:.12,decay:.1,gain:.24,vibrato:{rate:7,depth:.025},filter:bp(1300,2.5)}),
      tone('sawtooth',930*f,{freqEnd:640*f,delay:.27,attack:.03,hold:.22,decay:.3,gain:.24,vibrato:{rate:6,depth:.03},filter:bp(1200,2.5)}),
      tone('sine',1860*f,{freqEnd:1280*f,delay:.27,attack:.03,hold:.18,decay:.25,gain:.05,vibrato:{rate:6,depth:.03}})],
    hurt:wolfHurt,death:wolfDeath,step:wolfStep},
  // Quick breathy pants.
  wolf_pant:{volume:.4,trim:{ambient:2,hurt:1.3,step:1.4},
    ambient:(_r,f)=>[
      noise('bandpass',1700*f,{q:1,decay:.07,gain:.3,bursts:hits([0,.16,.32,.48],.08,.3)}),
      noise('bandpass',900*f,{q:1,decay:.05,gain:.12,bursts:hits([.08,.24,.4,.56],.05,.12)})],
    hurt:wolfHurt,death:wolfDeath,step:wolfStep},
  // Shaking water out of the fur: a flapping rattle of short noise grains.
  wolf_shake:{volume:.4,trim:{ambient:1.5,hurt:1.3,step:1.4},
    ambient:(r,f)=>[
      noise('bandpass',1300*f,{q:.9,decay:.035,gain:.45,bursts:grains(r,12,.62,.035,.5,.3,.35)}),
      noise('lowpass',650*f,{attack:.05,hold:.35,decay:.22,gain:.16,tremolo:{rate:15,depth:.7}}),
      noise('highpass',3200*f,{q:.7,delay:.04,decay:.012,gain:.12,bursts:grains(r,8,.55,.012,.15,.5)})],
    hurt:wolfHurt,death:wolfDeath,step:wolfStep},
  // Wet, squishy burbles.
  squid:{volume:.4,trim:{death:.45},
    ambient:(_r,f)=>[rumble(500*f,{freqEnd:300*f,attack:.05,decay:.4,gain:.5,tremolo:{rate:9,depth:.6}}),
      tone('sine',300*f,{freqEnd:620*f,delay:.1,attack:.004,decay:.05,gain:.16}),
      tone('sine',360*f,{freqEnd:700*f,delay:.26,attack:.004,decay:.05,gain:.12})],
    hurt:(_r,f)=>[noise('bandpass',720*f,{freqEnd:300*f,q:2,attack:.006,decay:.15,gain:.42}),
      tone('sine',260*f,{freqEnd:120*f,attack:.004,decay:.12,gain:.25})],
    death:(_r,f)=>[noise('bandpass',700*f,{freqEnd:220*f,q:2,attack:.01,hold:.1,decay:.4,gain:.42,tremolo:{rate:7,depth:.5}}),
      tone('sine',240*f,{freqEnd:80*f,attack:.01,hold:.1,decay:.4,gain:.25})],
    step:(_r,f)=>[noise('lowpass',700*f,{attack:.03,decay:.15,gain:.3})]},
  // Hollow groans with a rough, growling edge.
  zombie:{
    ambient:(_r,f)=>[tone('sawtooth',96*f,{freqEnd:86*f,attack:.15,hold:.5,decay:.4,gain:.32,vibrato:{rate:4,depth:.03},fm:{ratio:.5,depth:.3},filter:bp(450)}),
      rumble(600*f,{attack:.15,hold:.4,decay:.4,gain:.12})],
    hurt:(_r,f)=>[tone('sawtooth',142*f,{freqEnd:100*f,attack:.02,hold:.08,decay:.15,gain:.34,fm:{ratio:.5,depth:.35},filter:bp(550)}),
      rumble(500*f,{attack:.01,decay:.12,gain:.15})],
    death:(_r,f)=>[tone('sawtooth',112*f,{freqEnd:58*f,attack:.06,hold:.7,decay:.6,gain:.32,vibrato:{rate:3.5,depth:.04},fm:{ratio:.5,depth:.35},filter:bp(420)}),
      rumble(550*f,{attack:.1,hold:.5,decay:.5,gain:.12})],
    step:(_r,f)=>[rumble(300*f,{attack:.004,decay:.1,gain:.5}),noise('bandpass',1000*f,{q:1,decay:.06,gain:.25})]},
  // Lower, drier zombie with a sandy rasp.
  husk:{
    ambient:(_r,f)=>[tone('sawtooth',80*f,{freqEnd:70*f,attack:.15,hold:.5,decay:.45,gain:.3,vibrato:{rate:3.5,depth:.03},fm:{ratio:.5,depth:.45},filter:bp(380)}),
      noise('bandpass',1500*f,{q:.7,attack:.15,hold:.4,decay:.4,gain:.18})],
    hurt:(_r,f)=>[tone('sawtooth',122*f,{freqEnd:86*f,attack:.02,hold:.08,decay:.16,gain:.32,fm:{ratio:.5,depth:.45},filter:bp(470)}),
      noise('bandpass',1500*f,{q:.7,attack:.01,decay:.14,gain:.18})],
    death:(_r,f)=>[tone('sawtooth',96*f,{freqEnd:50*f,attack:.06,hold:.7,decay:.65,gain:.3,vibrato:{rate:3,depth:.04},fm:{ratio:.5,depth:.45},filter:bp(360)}),
      noise('bandpass',1400*f,{q:.7,attack:.1,hold:.5,decay:.5,gain:.16})],
    step:(_r,f)=>[rumble(280*f,{attack:.004,decay:.1,gain:.45}),noise('lowpass',2300*f,{q:.6,attack:.008,decay:.08,gain:.3})]},
  // Gargling, bubbling zombie.
  drowned:{trim:{ambient:.65,hurt:.55,death:.6},
    ambient:(_r,f)=>[tone('sawtooth',90*f,{freqEnd:80*f,attack:.12,hold:.45,decay:.4,gain:.3,tremolo:{rate:13,depth:.7},filter:lp(700,2)}),
      tone('sine',400*f,{freqEnd:800*f,delay:.2,attack:.003,decay:.05,gain:.12}),
      tone('sine',460*f,{freqEnd:900*f,delay:.45,attack:.003,decay:.05,gain:.1})],
    hurt:(_r,f)=>[tone('sawtooth',130*f,{freqEnd:95*f,attack:.02,hold:.08,decay:.16,gain:.32,tremolo:{rate:15,depth:.6},filter:lp(800,2)}),
      noise('bandpass',700*f,{freqEnd:1400*f,q:2,attack:.01,decay:.12,gain:.18})],
    death:(_r,f)=>[tone('sawtooth',104*f,{freqEnd:55*f,attack:.06,hold:.6,decay:.6,gain:.3,tremolo:{rate:11,depth:.7},filter:lp(650,2)}),
      noise('bandpass',600*f,{freqEnd:1500*f,q:2,delay:.2,attack:.05,decay:.5,gain:.16})],
    step:(_r,f)=>[rumble(320*f,{attack:.004,decay:.09,gain:.45}),noise('bandpass',900*f,{freqEnd:1400*f,q:1.5,attack:.008,decay:.08,gain:.25})]},
  // Dry bone rattles.
  skeleton:{trim:{ambient:2.5,hurt:2,death:2.2,step:1.8},
    ambient:(r,f)=>[noise('bandpass',2200*f,{q:4,decay:.02,gain:.45,bursts:grains(r,6,.3,.02,.5)}),
      noise('bandpass',900*f,{q:2,attack:.03,decay:.2,gain:.12})],
    hurt:(r,f)=>[noise('bandpass',2000*f,{q:3,decay:.025,gain:.5,bursts:grains(r,3,.08,.025,.55)}),
      tone('triangle',800*f,{attack:.001,decay:.05,gain:.2})],
    death:(r,f)=>[noise('bandpass',2100*f,{q:3.5,decay:.025,gain:.5,bursts:grains(r,10,.6,.025,.55,.4,.6)}),
      tone('triangle',700*f,{attack:.001,decay:.06,gain:.2}),
      rumble(400*f,{delay:.55,decay:.12,gain:.25})],
    step:(_r,f)=>[noise('bandpass',2500*f,{q:3,decay:.025,gain:.4}),tone('triangle',1400*f,{attack:.001,decay:.03,gain:.12})]},
  // Skeleton rattle with an icy, breathy hiss.
  stray:{trim:{hurt:2,step:1.8},
    ambient:(r,f)=>[noise('bandpass',1800*f,{q:4,decay:.02,gain:.45,bursts:grains(r,6,.3,.02,.5)}),
      noise('highpass',4000*f,{q:.7,attack:.1,hold:.2,decay:.3,gain:.14})],
    hurt:(r,f)=>[noise('bandpass',1700*f,{q:3,decay:.025,gain:.5,bursts:grains(r,3,.08,.025,.55)}),
      noise('highpass',4200*f,{q:.7,attack:.02,decay:.12,gain:.12})],
    death:(r,f)=>[noise('bandpass',1750*f,{q:3.5,decay:.025,gain:.5,bursts:grains(r,10,.6,.025,.55,.4,.6)}),
      noise('highpass',4000*f,{q:.7,attack:.05,hold:.2,decay:.4,gain:.12})],
    step:(_r,f)=>[noise('bandpass',2100*f,{q:3,decay:.025,gain:.4}),noise('highpass',4500*f,{q:.7,decay:.03,gain:.1})]},
  // Vanilla creepers make no idle noise: a barely audible leafy rustle keeps them stealthy. Hurt/death crunch.
  creeper:{ambientVolume:.2,trim:{hurt:1.6,death:1.7},
    ambient:(_r,f)=>[noise('highpass',3000*f,{q:.7,attack:.05,decay:.2,gain:.25})],
    hurt:(r,f)=>[noise('bandpass',1500*f,{q:.8,decay:.04,gain:.5,bursts:grains(r,4,.15,.04,.55)}),
      noise('lowpass',600*f,{attack:.005,decay:.15,gain:.3})],
    death:(r,f)=>[noise('bandpass',1400*f,{q:.8,decay:.045,gain:.5,bursts:grains(r,7,.5,.045,.55,.4,.4)}),
      rumble(300*f,{attack:.004,decay:.2,gain:.35})],
    step:(_r,f)=>[noise('highpass',2000*f,{q:.7,attack:.003,decay:.05,gain:.3})]},
  // Hissing chitter; skittering steps.
  spider:{trim:{ambient:1.2,hurt:2.5,death:1.3,step:1.4},
    ambient:(r,f)=>[noise('bandpass',3500*f,{q:2,attack:.02,hold:.2,decay:.15,gain:.3,tremolo:{rate:35,depth:.8}}),
      noise('bandpass',2000*f,{q:2,decay:.015,gain:.3,bursts:grains(r,4,.3,.015,.35)})],
    hurt:(_r,f)=>[tone('sawtooth',1400*f,{freqEnd:1800*f,attack:.005,hold:.08,decay:.1,gain:.16,tremolo:{rate:40,depth:.5},filter:bp(2200,3)}),
      noise('bandpass',3000*f,{q:1.5,decay:.12,gain:.18})],
    death:(_r,f)=>[tone('sawtooth',1800*f,{freqEnd:600*f,attack:.005,hold:.3,decay:.4,gain:.16,tremolo:{rate:30,depth:.5},filter:bp(1800,3)}),
      noise('bandpass',2800*f,{q:1.5,attack:.01,hold:.2,decay:.3,gain:.15,tremolo:{rate:30,depth:.6}})],
    step:(_r,f)=>[noise('bandpass',3000*f,{q:2,decay:.015,gain:.3,bursts:hits([0,.03,.06,.09],.015,.32)})]},
  // Warbling, otherworldly "vwoops".
  enderman:{trim:{ambient:.65,hurt:1.5,step:1.4},
    ambient:(_r,f)=>[tone('sine',220*f,{freqEnd:330*f,attack:.1,hold:.3,decay:.4,gain:.28,fm:{ratio:1.5,depth:.9},vibrato:{rate:6,depth:.08},filter:bp(900,2)}),
      tone('sine',140*f,{freqEnd:110*f,attack:.4,decay:.12,gain:.18,vibrato:{rate:5,depth:.05}})],
    hurt:(_r,f)=>[tone('sawtooth',300*f,{freqEnd:520*f,attack:.01,hold:.1,decay:.2,gain:.24,fm:{ratio:2.3,depth:1.3},filter:bp(1200,2)}),
      noise('bandpass',1800*f,{q:1,attack:.01,decay:.2,gain:.12})],
    death:(_r,f)=>[tone('sawtooth',500*f,{freqEnd:80*f,attack:.02,hold:.8,decay:.8,gain:.24,fm:{ratio:1.7,depth:1},vibrato:{rate:8,depth:.06},filter:bp(1000,2)}),
      noise('bandpass',1500*f,{freqEnd:300*f,q:1,attack:.05,hold:.6,decay:.8,gain:.12})],
    step:(_r,f)=>[noise('bandpass',1000*f,{q:1,decay:.05,gain:.4}),rumble(260*f,{attack:.003,decay:.05,gain:.3})]},
  // Squelches (vanilla slimes only squish; volume 0.4 × size, callers scale for bigger slimes).
  slime:{volume:.4,trim:{death:.75,step:.75},
    ambient:(_r,f)=>[rumble(600*f,{freqEnd:300*f,attack:.01,decay:.18,gain:.5}),tone('sine',180*f,{freqEnd:90*f,attack:.005,decay:.15,gain:.22})],
    hurt:(_r,f)=>[tone('sine',300*f,{freqEnd:140*f,attack:.005,decay:.14,gain:.3}),noise('bandpass',900*f,{q:2,attack:.005,decay:.12,gain:.35})],
    death:(_r,f)=>[rumble(650*f,{freqEnd:250*f,attack:.01,decay:.25,gain:.5}),tone('sine',260*f,{freqEnd:80*f,attack:.005,decay:.3,gain:.25}),
      noise('bandpass',800*f,{q:2,delay:.18,attack:.005,decay:.15,gain:.3})],
    step:(_r,f)=>[rumble(500*f,{freqEnd:260*f,attack:.008,decay:.12,gain:.45}),tone('sine',150*f,{freqEnd:80*f,attack:.005,decay:.1,gain:.15})]}
};
const VOICE_MAP=new Map<string,Voice>(Object.entries(VOICES));

/** A creature voice built from a hash of its name, for kinds without a designed voice. */
function genericVoice(name:string):Voice{
  const h=mulberry(hashString(name));
  const base=120+h()*480,formant=600+h()*1600,rate=4+h()*6;
  const wave=(['sawtooth','square','triangle'] as const)[Math.floor(h()*3)];
  const filter=bp(formant);
  return{
    ambient:(_r,f)=>[tone(wave,base*f,{freqEnd:base*.85*f,attack:.04,hold:.25,decay:.25,gain:.25,filter,vibrato:{rate,depth:.02}})],
    hurt:(_r,f)=>[tone(wave,base*1.4*f,{freqEnd:base*1.1*f,attack:.01,hold:.06,decay:.12,gain:.28,filter})],
    death:(_r,f)=>[tone(wave,base*1.2*f,{freqEnd:base*.5*f,attack:.02,hold:.35,decay:.4,gain:.26,filter,vibrato:{rate,depth:.03}})],
    step:(_r,f)=>[rumble(260*f,{attack:.003,decay:.07,gain:.45}),noise('bandpass',1000*f,{q:1,decay:.04,gain:.2})]
  };
}
const generic=new Map<string,Voice>();

const KINDS=new Set<string>(['ambient','hurt','death','step']);
/** `rest` is "<name>:<kind>" of a `mob:<name>:<kind>` sound. */
export function mobSpec(rest:string,r:Rand):SoundSpec|null{
  const colon=rest.indexOf(':');
  if(colon<=0)return null;
  const name=rest.slice(0,colon),kind=rest.slice(colon+1);
  if(!KINDS.has(kind))return null;
  let voice=VOICE_MAP.get(name);
  if(!voice){
    voice=generic.get(name);
    if(!voice){voice=genericVoice(name);if(generic.size<256)generic.set(name,voice);}
  }
  const k=kind as MobSoundKind,trim=voice.trim?.[k]??1;
  if(k==='step')return spec(.15,1,louder(voice.step(r,vary(r,.04)),trim));
  const pitch=vanillaPitch(r);
  const volume=(voice.volume??1)*(k==='ambient'?voice.ambientVolume??1:1);
  return spec(volume,pitch,louder(voice[k](r,vary(r,.04)),trim));
}
