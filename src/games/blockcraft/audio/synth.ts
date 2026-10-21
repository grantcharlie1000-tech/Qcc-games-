// Name → synth mapping for every SoundName. Each recipe evokes the vanilla sound family with
// original procedural layers and carries vanilla's event volume and pitch (including the random pitch
// spread vanilla applies when that event plays) as defaults. As in vanilla playSound(sound, volume,
// pitch), a caller's volume or pitch replaces the default (resolveLevels in spec.ts); the sample set's
// own pitch (basePitch: metal 1.5) still applies.
import type {SoundKind} from '../data/blocks';
import type {MobSoundKind,SoundName} from '../engine/contracts';
import {grains,hits,louder,noise,rumble,spec,tone,vanillaPitch,vary,type Layer,type Rand,type SoundSpec} from './spec';
import {mobSpec} from './mobs';

export {specDuration} from './spec';
export type {SoundSpec,Layer} from './spec';

export const SOUND_MATERIALS=['stone','wood','gravel','grass','sand','cloth','glass','snow','metal','liquid','plant'] as const satisfies readonly SoundKind[];
export const MOB_SOUND_KINDS=['ambient','hurt','death','step'] as const satisfies readonly MobSoundKind[];

// ---- Blocks ------------------------------------------------------------------------------------
// Vanilla plays one sample set for breaking and placing ("dig") and another for stepping, mining hits
// and landing ("step"), at different volumes and pitches. SoundType volume and pitch are 1 except metal (pitch 1.5).
type SampleSet='dig'|'step'|'shatter';
interface Material{dig(r:Rand):Layer[];step(r:Rand):Layer[];shatter?(r:Rand):Layer[];pitch?:number;
  /** Loudness trim per sample set (rendered levels evened out across materials). */
  trim?:Partial<Record<SampleSet,number>>}
const stoneDig=(r:Rand)=>{const f=vary(r,.1);return[
  noise('bandpass',1700*f,{q:.9,decay:.05,gain:.55,bursts:grains(r,4,.09,.045,.6)}),
  rumble(420*f,{attack:.002,decay:.12,gain:.45}),
  tone('sine',150*f,{freqEnd:85*f,decay:.08,gain:.25})];};
const stoneStep=(r:Rand)=>{const f=vary(r,.1);return[
  noise('bandpass',1500*f,{q:1.2,attack:.002,decay:.07,gain:.5}),
  rumble(320*f,{attack:.002,decay:.05,gain:.35})];};

const MATERIALS:Record<SoundKind,Material>={
  stone:{dig:stoneDig,step:stoneStep},
  wood:{
    dig:r=>{const f=vary(r,.1);return[
      tone('triangle',250*f,{freqEnd:205*f,decay:.13,gain:.32}),
      noise('bandpass',650*f,{q:4,attack:.002,decay:.1,gain:.45}),
      noise('highpass',2600*f,{q:.7,decay:.02,gain:.3,bursts:grains(r,3,.06,.02,.35)})];},
    step:r=>{const f=vary(r,.1);return[
      tone('triangle',175*f,{freqEnd:150*f,decay:.06,gain:.25}),
      noise('bandpass',480*f,{q:3,attack:.002,decay:.055,gain:.38})];}},
  gravel:{trim:{dig:1.3},
    dig:r=>{const f=vary(r,.1);return[
      noise('lowpass',1500*f,{q:.7,decay:.03,gain:.55,bursts:grains(r,6,.16,.026,.6)}),
      rumble(300*f,{attack:.003,decay:.15,gain:.3})];},
    step:r=>{const f=vary(r,.1);return[
      noise('lowpass',1700*f,{q:.7,decay:.03,gain:.5,bursts:grains(r,3,.07,.022,.55)}),
      rumble(260*f,{decay:.05,gain:.2})];}},
  grass:{trim:{dig:1.3},
    dig:r=>{const f=vary(r,.1);return[
      noise('bandpass',2700*f,{q:.7,decay:.04,gain:.5,bursts:grains(r,4,.12,.035,.55)}),
      noise('bandpass',700*f,{q:1,attack:.004,decay:.1,gain:.22})];},
    step:r=>{const f=vary(r,.1);return[
      noise('highpass',1900*f,{q:.7,decay:.04,gain:.4,bursts:grains(r,2,.04,.035,.45)}),
      noise('bandpass',650*f,{q:1,decay:.05,gain:.15})];}},
  sand:{trim:{dig:.6},
    dig:r=>{const f=vary(r,.1);return[
      noise('lowpass',2300*f,{q:.6,attack:.02,hold:.04,decay:.15,gain:.45}),
      noise('bandpass',4200*f,{q:1,decay:.02,gain:.2,bursts:grains(r,4,.12,.018,.25)})];},
    step:r=>{const f=vary(r,.1);return[
      noise('lowpass',2600*f,{q:.6,attack:.012,decay:.1,gain:.4}),
      noise('bandpass',4500*f,{q:1.2,attack:.01,decay:.06,gain:.12})];}},
  cloth:{
    dig:r=>{const f=vary(r,.1);return[
      noise('lowpass',650*f,{q:.6,attack:.012,decay:.15,gain:.6}),
      rumble(220*f,{attack:.01,decay:.12,gain:.35})];},
    step:r=>{const f=vary(r,.1);return[
      noise('lowpass',520*f,{q:.6,attack:.01,decay:.09,gain:.5}),
      rumble(180*f,{attack:.008,decay:.07,gain:.25})];}},
  // Vanilla glass only has its own breaking sound; it steps, is hit and is placed like stone.
  glass:{dig:stoneDig,step:stoneStep,trim:{shatter:.7},shatter:r=>{const f=vary(r,.08);const layers:Layer[]=[
    noise('highpass',3600*f,{q:.7,attack:.001,decay:.32,gain:.45}),
    noise('bandpass',6200*f,{q:1.5,decay:.03,gain:.3,bursts:grains(r,5,.2,.03,.35)}),
    rumble(500*f,{decay:.06,gain:.2})];
    for(let i=0;i<5;i++)layers.push(tone('sine',2600+r()*3800,{delay:r()*.18,attack:.001,decay:.12+r()*.25,gain:.12+r()*.08}));
    return layers;}},
  snow:{trim:{dig:1.6},
    dig:r=>{const f=vary(r,.1);return[
      noise('bandpass',2200*f,{q:1.6,decay:.04,gain:.5,bursts:grains(r,4,.13,.035,.55)}),
      noise('lowpass',800*f,{q:.7,attack:.01,decay:.1,gain:.25})];},
    step:r=>{const f=vary(r,.1);return[
      noise('bandpass',2600*f,{q:1.3,decay:.035,gain:.45,bursts:grains(r,2,.05,.03,.5)}),
      noise('lowpass',900*f,{attack:.01,decay:.06,gain:.18})];}},
  metal:{pitch:1.5,
    dig:r=>{const f=vary(r,.06);return[
      tone('sine',620*f,{attack:.001,decay:.35,gain:.2}),
      tone('sine',620*2.56*f,{attack:.001,decay:.2,gain:.13}),
      tone('sine',620*4.3*f,{attack:.001,decay:.12,gain:.08}),
      noise('highpass',3000*f,{attack:.001,decay:.025,gain:.35}),
      rumble(400*f,{decay:.06,gain:.25})];},
    step:r=>{const f=vary(r,.06);return[
      tone('sine',900*f,{attack:.001,decay:.07,gain:.14}),
      tone('sine',900*2.4*f,{attack:.001,decay:.05,gain:.08}),
      noise('bandpass',2000*f,{q:1,decay:.04,gain:.35})];}},
  liquid:{
    dig:r=>{const f=vary(r,.1);return[
      noise('bandpass',600*f,{freqEnd:1800*f,q:2,attack:.02,decay:.25,gain:.4}),
      tone('sine',380*f,{freqEnd:850*f,delay:.03,decay:.06,gain:.18}),
      tone('sine',520*f,{freqEnd:1100*f,delay:.12,decay:.05,gain:.12}),
      rumble(400*f,{attack:.01,decay:.15,gain:.25})];},
    step:r=>{const f=vary(r,.1);return[
      noise('bandpass',900*f,{freqEnd:1500*f,q:1.5,attack:.01,decay:.12,gain:.35}),
      rumble(350*f,{decay:.08,gain:.2})];}},
  plant:{
    dig:r=>{const f=vary(r,.1);return[
      noise('highpass',2900*f,{q:.7,decay:.03,gain:.45,bursts:grains(r,3,.08,.028,.5)}),
      noise('bandpass',1200*f,{q:.8,attack:.003,decay:.06,gain:.2})];},
    step:r=>{const f=vary(r,.1);return[
      noise('highpass',3100*f,{q:.7,attack:.004,decay:.06,gain:.3}),
      noise('bandpass',1500*f,{q:.9,decay:.03,gain:.12})];}}
};
type Action='break'|'place'|'step'|'hit'|'fall';
/** Vanilla: break/place (v+1)/2 at pitch ×0.8, step v×0.15, mining hit (v+1)/8 at ×0.5, landing v×0.5 at ×0.75 (v = 1). */
const ACTIONS:Record<Action,{volume:number;pitch:number;set:'dig'|'step'}>={
  break:{volume:1,pitch:.8,set:'dig'},place:{volume:1,pitch:.8,set:'dig'},step:{volume:.15,pitch:1,set:'step'},
  hit:{volume:.25,pitch:.5,set:'step'},fall:{volume:.5,pitch:.75,set:'step'}
};
const isAction=(v:string):v is Action=>Object.prototype.hasOwnProperty.call(ACTIONS,v);

function blockSpec(action:Action,material:string,r:Rand):SoundSpec{
  const m=Object.prototype.hasOwnProperty.call(MATERIALS,material)?MATERIALS[material as SoundKind]:MATERIALS.stone;
  const a=ACTIONS[action];
  const set:SampleSet=action==='break'&&m.shatter?'shatter':a.set;
  const layers=set==='shatter'?m.shatter!(r):set==='dig'?m.dig(r):m.step(r);
  return spec(a.volume,a.pitch,louder(layers,m.trim?.[set]??1),{basePitch:m.pitch??1});
}

// ---- Events ------------------------------------------------------------------------------------
type SimpleName=Exclude<SoundName,`${string}:${string}`>;
type Recipe=(r:Rand,distance:number|null)=>SoundSpec;
/** A recipe with its rendered loudness trimmed to sit with its family (open with close, fill with empty). */
const trim=(k:number,recipe:Recipe):Recipe=>(r,distance)=>{const s=recipe(r,distance);louder(s.layers,k);return s;};
const bubbles=(r:Rand,times:readonly number[],freq:number,gain:number)=>times.map(t=>
  tone('sine',freq*vary(r,.2),{freqEnd:freq*2.2*vary(r,.2),delay:t,attack:.003,decay:.05,gain}));

const SIMPLE:Record<SimpleName,Recipe>={
  hurt:r=>{const p=vanillaPitch(r),f=vary(r,.05);return spec(1,p,[
    tone('sawtooth',215*f,{freqEnd:150*f,attack:.008,hold:.05,decay:.14,gain:.32,fm:{ratio:.5,depth:.25},filter:{type:'bandpass',freq:700,q:1.2}}),
    rumble(300,{attack:.002,decay:.08,gain:.35}),
    noise('bandpass',1300*f,{q:1,decay:.05,gain:.2})]);},
  death:r=>{const p=vanillaPitch(r),f=vary(r,.05);return spec(1,p,[
    tone('sawtooth',205*f,{freqEnd:105*f,attack:.01,hold:.18,decay:.45,gain:.32,fm:{ratio:.5,depth:.3},filter:{type:'bandpass',freq:620,q:1.2}}),
    rumble(260,{attack:.003,decay:.18,gain:.4}),
    noise('bandpass',1100*f,{q:1,decay:.08,gain:.2})]);},
  // Vanilla eating: volume 0.5 + 0.5 × rand(2), pitch (r - r) × 0.2 + 1, one chomp every 4 ticks.
  eat:r=>{const volume=.5+.5*Math.floor(r()*2),p=vanillaPitch(r),f=vary(r,.1);return spec(volume,p,[
    noise('bandpass',2300*f,{q:1,decay:.04,gain:.55,bursts:grains(r,3,.09,.04,.6)}),
    noise('lowpass',700*f,{attack:.004,decay:.07,gain:.3})]);},
  burp:r=>{const p=r()*.1+.9;return spec(.5,p,[
    tone('sawtooth',96,{freqEnd:72,attack:.02,hold:.18,decay:.2,gain:.4,fm:{ratio:.5,depth:.4},tremolo:{rate:26,depth:.7},filter:{type:'lowpass',freq:520,q:2}}),
    rumble(240,{attack:.02,hold:.1,decay:.2,gain:.2})]);},
  drink:r=>{const p=r()*.1+.9,times=[0,.17,.34];return spec(.5,p,[
    ...times.map((t,i)=>tone('sine',(270+i*20)*vary(r,.06),{freqEnd:540,delay:t,attack:.006,decay:.07,gain:.3})),
    noise('bandpass',600,{q:3,decay:.06,gain:.25,bursts:hits(times,.06,.3)})]);},
  // Item pickup: volume 0.2, pitch ((r - r) × 0.7 + 1) × 2.
  pop:r=>{const p=((r()-r())*.7+1)*2;return spec(.2,p,[
    tone('sine',520,{freqEnd:1250,attack:.003,decay:.07,gain:.55}),
    tone('triangle',1040,{freqEnd:2500,attack:.003,decay:.04,gain:.12})]);},
  levelup:r=>{const f=vary(r,.01);return spec(1,1,[523.25,659.25,783.99,1046.5].flatMap((n,i)=>[
    tone('triangle',n*f,{delay:i*.085,attack:.004,decay:.55+i*.12,gain:.2}),
    tone('sine',n*2*f,{delay:i*.085,attack:.002,decay:.25+i*.05,gain:.07})]));},
  // Experience orb: volume 0.1, pitch 0.5 × ((r - r) × 0.7 + 1.8).
  orb:r=>{const p=.5*((r()-r())*.7+1.8);return spec(.1,p,[
    tone('sine',1568,{attack:.002,decay:.24,gain:.5}),
    tone('sine',1568*2.76,{attack:.001,decay:.09,gain:.14})]);},
  click:()=>spec(.25,1,[
    noise('bandpass',3500,{q:1.5,attack:.001,decay:.012,gain:.6}),
    tone('sine',1100,{attack:.001,decay:.03,gain:.3})],{ui:true}),
  door_open:trim(1.6,r=>{const p=r()*.1+.9,f=vary(r,.05);return spec(1,p,[
    noise('bandpass',2500*f,{q:1.2,attack:.001,decay:.02,gain:.4}),
    tone('sawtooth',135*f,{freqEnd:190*f,delay:.02,attack:.03,hold:.08,decay:.12,gain:.18,fm:{ratio:3.1,depth:.4},filter:{type:'bandpass',freq:950,q:3}}),
    tone('triangle',210*f,{delay:.2,decay:.08,gain:.25}),
    noise('bandpass',520*f,{q:2,delay:.2,decay:.07,gain:.3})]);}),
  door_close:r=>{const p=r()*.1+.9,f=vary(r,.05);return spec(1,p,[
    tone('triangle',180*f,{freqEnd:148*f,attack:.002,decay:.12,gain:.4}),
    noise('bandpass',480*f,{q:2,attack:.002,decay:.1,gain:.42}),
    noise('bandpass',2400*f,{q:1.2,delay:.05,decay:.018,gain:.35})]);},
  chest_open:trim(2.5,r=>{const p=r()*.1+.9,f=vary(r,.05);return spec(.5,p,[
    noise('bandpass',2200*f,{q:1.2,decay:.02,gain:.35}),
    tone('sawtooth',105*f,{freqEnd:170*f,delay:.02,attack:.08,hold:.22,decay:.2,gain:.22,fm:{ratio:2.7,depth:.45},filter:{type:'bandpass',freq:800,q:4}}),
    noise('lowpass',900*f,{delay:.04,attack:.05,decay:.3,gain:.15})]);}),
  chest_close:r=>{const p=r()*.1+.9,f=vary(r,.05);return spec(.5,p,[
    tone('triangle',150*f,{freqEnd:118*f,attack:.002,decay:.16,gain:.42}),
    rumble(650*f,{attack:.002,decay:.13,gain:.45}),
    noise('bandpass',2300*f,{q:1.2,delay:.03,decay:.02,gain:.3})]);},
  craft:r=>{const f=vary(r,.04);return spec(.5,1,[
    tone('triangle',330*f,{attack:.001,decay:.05,gain:.3}),
    noise('bandpass',1800*f,{q:.9,decay:.05,gain:.35,bursts:grains(r,2,.06,.05,.4)}),
    tone('sine',880*f,{delay:.05,attack:.004,decay:.12,gain:.12})],{ui:true});},
  // Explosion: volume 4 (heard 64 blocks away), pitch (1 + (r - r) × 0.2) × 0.7.
  explode:r=>{const p=(1+(r()-r())*.2)*.7;return spec(4,p,[
    rumble(1500,{freqEnd:120,attack:.004,hold:.08,decay:1.7,gain:.8}),
    noise('bandpass',900,{q:.7,attack:.002,decay:.35,gain:.4}),
    tone('sine',68,{freqEnd:32,attack:.004,decay:.9,gain:.6}),
    noise('highpass',1800,{q:.7,delay:.1,decay:.05,gain:.25,bursts:grains(r,6,.8,.05,.3,.5,.6)})]);},
  fuse:trim(.55,r=>spec(1,1,[
    noise('highpass',2800,{q:.7,attack:.08,hold:1.15,decay:.3,gain:.35}),
    noise('bandpass',5200,{q:1,delay:.05,decay:.03,gain:.2,bursts:grains(r,8,1.3,.03,.25)})])),
  // Flint and steel: pitch r × 0.4 + 0.8.
  ignite:r=>{const p=r()*.4+.8;return spec(1,p,[
    noise('highpass',4500,{q:.8,attack:.001,decay:.09,gain:.5}),
    noise('bandpass',6200,{q:1.4,decay:.02,gain:.3,bursts:grains(r,2,.06,.02,.35)}),
    tone('sine',3200*vary(r,.1),{attack:.001,decay:.05,gain:.1}),
    noise('lowpass',900,{delay:.04,attack:.06,decay:.32,gain:.18})]);},
  splash:r=>{const p=vanillaPitch(r,.4);return spec(1,p,[
    noise('bandpass',700,{freqEnd:2600,q:.8,attack:.008,decay:.45,gain:.5}),
    rumble(520,{attack:.005,decay:.3,gain:.38}),
    ...bubbles(r,[.1+r()*.04,.2+r()*.04,.33+r()*.04],480,.13)]);},
  swim:r=>{const p=vanillaPitch(r,.4);return spec(.35,p,[
    noise('bandpass',480,{freqEnd:1150,q:1,attack:.12,decay:.32,gain:.38}),
    rumble(420,{attack:.1,decay:.28,gain:.28})]);},
  // Lava meeting water: volume 0.5, pitch 2.6 + (r - r) × 0.8 (the engine clamps pitch to 2).
  fizz:trim(.6,r=>{const p=2.6+(r()-r())*.8;return spec(.5,p,[
    noise('highpass',3000,{q:.7,attack:.01,hold:.2,decay:.6,gain:.4}),
    noise('bandpass',5000,{q:1.2,decay:.03,gain:.25,bursts:grains(r,6,.6,.03,.3)})]);}),
  // Lava pop: volume 0.2 + r × 0.2, pitch 0.9 + r × 0.15.
  lava:r=>{const volume=.2+r()*.2,p=.9+r()*.15;return spec(volume,p,[
    tone('sine',150,{freqEnd:520,attack:.003,decay:.07,gain:.42}),
    rumble(700,{attack:.003,decay:.1,gain:.3}),
    rumble(200,{attack:.05,decay:.3,gain:.25,tremolo:{rate:11,depth:.6}})]);},
  // Fire ambience: volume 1 + r, pitch r × 0.7 + 0.3.
  fire:r=>{const volume=1+r(),p=r()*.7+.3;return spec(volume,p,[
    noise('bandpass',3000,{q:.8,decay:.02,gain:.4,bursts:grains(r,7,.9,.02,.45,.6)}),
    rumble(420,{attack:.2,hold:.35,decay:.4,gain:.15}),
    noise('highpass',5000,{q:.7,decay:.012,gain:.25,bursts:grains(r,4,.7,.012,.3,.6)})]);},
  // Bow at full draw: pitch 1 / (r × 0.4 + 1.2) + 0.5.
  bow:r=>{const p=1/(r()*.4+1.2)+.5;return spec(1,p,[
    tone('triangle',230,{freqEnd:160,attack:.003,decay:.18,gain:.3}),
    noise('bandpass',1200,{freqEnd:600,q:1.2,attack:.02,decay:.25,gain:.35}),
    tone('sine',115,{attack:.002,decay:.08,gain:.15})]);},
  arrow_hit:trim(1.4,r=>{const p=1.2/(r()*.2+.9);return spec(1,p,[
    noise('bandpass',900,{q:1.5,attack:.001,decay:.05,gain:.5}),
    tone('triangle',320,{freqEnd:160,attack:.001,decay:.07,gain:.3}),
    tone('triangle',620,{delay:.01,decay:.2,gain:.06,tremolo:{rate:40,depth:.8}})]);}),
  // Throwing a snowball, egg or pearl: volume 0.5, pitch 0.4 / (r × 0.4 + 0.8).
  throw:trim(1.6,r=>{const p=.4/(r()*.4+.8);return spec(.5,p,[
    noise('bandpass',700,{freqEnd:1900,q:1.5,attack:.04,decay:.14,gain:.45})]);}),
  tool_break:r=>{const p=.8+r()*.4;return spec(.8,p,[
    noise('highpass',2000,{q:.7,attack:.001,decay:.06,gain:.55}),
    noise('bandpass',4500,{q:1.5,delay:.03,decay:.03,gain:.3,bursts:grains(r,4,.22,.03,.35)}),
    tone('sine',2800*vary(r,.05),{delay:.02,attack:.001,decay:.15,gain:.09}),
    tone('sine',3700*vary(r,.05),{delay:.06,attack:.001,decay:.12,gain:.07}),
    tone('triangle',400,{freqEnd:190,attack:.001,decay:.05,gain:.25})]);},
  equip:trim(1.5,r=>{const f=vary(r,.05);return spec(1,1,[
    noise('bandpass',1800*f,{q:.8,decay:.07,gain:.35,bursts:grains(r,2,.08,.07,.4)}),
    tone('sine',1300*f,{delay:.02,attack:.001,decay:.12,gain:.08}),
    tone('sine',2100*f,{delay:.05,attack:.001,decay:.08,gain:.06})]);}),
  // Thunder: volume 10000 (heard everywhere, so never attenuated; panned toward the strike), pitch 0.8 + r × 0.2.
  // The lightning impact crack (volume 2, 32 blocks) is folded in when the strike is near; far strikes lose their high end.
  thunder:(r,distance)=>{
    const p=.8+r()*.2,near=distance===null?1:Math.max(0,1-distance/32),far=distance===null?0:Math.min(1,distance/160);
    const layers:Layer[]=[];
    if(near>0)layers.push(noise('highpass',1200,{q:.7,attack:.002,decay:.28,gain:.65*near}),noise('bandpass',2500,{q:.8,attack:.001,decay:.12,gain:.4*near}));
    layers.push(rumble(900*(1-.6*far),{freqEnd:180,attack:.04,hold:.3,decay:3.6,gain:.7}),
      rumble(320,{delay:.3,decay:.4,gain:.5,bursts:grains(r,4,2.6,.6,.55,.4,.5)}),
      tone('sine',45,{freqEnd:30,delay:.2,attack:.3,hold:.5,decay:2,gain:.25}));
    return spec(10000,p,layers,{global:true});},
  // Rain: a looping bed; weather refreshes it with play('rain') and the engine follows weather.intensity.
  rain:trim(.6,()=>spec(1,1,[
    noise('bandpass',2600,{q:.5,attack:1.5,decay:2,gain:.4}),
    rumble(500,{attack:1.5,decay:2,gain:.35}),
    noise('highpass',6000,{q:.6,attack:1.5,decay:2,gain:.12})],{loop:true})),
  attack_weak:trim(1.8,()=>spec(1,1,[
    noise('lowpass',900,{q:.7,attack:.004,decay:.1,gain:.35}),
    rumble(250,{attack:.003,decay:.06,gain:.3})])),
  attack_strong:()=>spec(1,1,[
    noise('bandpass',1400,{q:.7,attack:.002,decay:.12,gain:.5}),
    tone('sine',110,{freqEnd:58,attack:.002,decay:.12,gain:.5}),
    rumble(420,{attack:.002,decay:.1,gain:.4})]),
  crit:()=>spec(1,1,[
    noise('highpass',2500,{q:.8,attack:.001,decay:.08,gain:.5}),
    tone('sine',2600,{freqEnd:2150,attack:.001,decay:.18,gain:.12}),
    tone('sine',105,{freqEnd:60,attack:.002,decay:.1,gain:.4})]),
  sweep:()=>spec(1,1,[
    noise('bandpass',3200,{freqEnd:700,q:3,attack:.03,decay:.28,gain:.55}),
    noise('highpass',5000,{q:.7,attack:.02,decay:.15,gain:.15})]),
  toast:()=>spec(1,1,[
    noise('bandpass',900,{freqEnd:2400,q:1,attack:.1,decay:.22,gain:.16}),
    tone('sine',1318.5,{delay:.12,attack:.004,decay:.6,gain:.2}),
    tone('sine',1975.5,{delay:.24,attack:.004,decay:.8,gain:.18}),
    tone('triangle',659.25,{delay:.12,attack:.01,decay:.7,gain:.08})],{ui:true}),
  bucket_fill:trim(1.8,r=>spec(1,1,[
    noise('bandpass',400,{freqEnd:1300,q:2,attack:.03,decay:.35,gain:.42}),
    ...bubbles(r,[.05,.15,.26],340,.15),
    tone('sine',900,{attack:.001,decay:.08,gain:.08})])),
  bucket_empty:()=>spec(1,1,[
    noise('bandpass',1500,{freqEnd:400,q:1.5,attack:.02,hold:.1,decay:.35,gain:.42}),
    rumble(520,{delay:.12,attack:.01,decay:.3,gain:.32}),
    tone('sine',880,{attack:.001,decay:.08,gain:.08})]),
  shear:()=>spec(1,1,[
    noise('highpass',3500,{q:.8,decay:.03,gain:.5,bursts:hits([0,.13],.03,.55)}),
    tone('sine',3100,{attack:.001,decay:.04,gain:.14}),
    tone('sine',2900,{delay:.13,attack:.001,decay:.04,gain:.14})]),
  milk:trim(1.8,r=>{const times=[0,.12,.24,.36];return spec(1,1,[
    noise('bandpass',520,{q:4,decay:.06,gain:.35,bursts:hits(times,.06,.35)}),
    ...times.map(t=>tone('sine',300*vary(r,.1),{freqEnd:560*vary(r,.1),delay:t,attack:.004,decay:.05,gain:.18})),
    tone('sine',950,{attack:.001,decay:.08,gain:.07})]);}),
  teleport:()=>spec(1,1,[
    tone('sawtooth',180,{freqEnd:900,attack:.01,decay:.35,gain:.22,fm:{ratio:1.5,depth:1.2},filter:{type:'bandpass',freq:1200,q:2}}),
    tone('sine',900,{freqEnd:150,delay:.25,attack:.02,decay:.4,gain:.2}),
    noise('bandpass',2000,{freqEnd:500,q:1.2,attack:.05,decay:.5,gain:.12})]),
  furnace:r=>spec(1,1,[
    noise('bandpass',2200,{q:1,decay:.025,gain:.35,bursts:grains(r,5,.6,.025,.4,.5)}),
    rumble(300,{attack:.1,hold:.3,decay:.4,gain:.15})])
};
const SIMPLE_MAP=new Map<string,Recipe>(Object.entries(SIMPLE));

/** The synth for a sound name, or null for names outside the SoundName union. `distance` (blocks from the
 *  listener, null when not positional) shapes sounds whose timbre depends on it (thunder). Never throws. */
export function soundSpec(name:string,r:Rand,distance:number|null=null):SoundSpec|null{
  if(typeof name!=='string'||!name)return null;
  const simple=SIMPLE_MAP.get(name);
  if(simple)return simple(r,distance);
  const colon=name.indexOf(':');
  if(colon<=0)return null;
  const prefix=name.slice(0,colon),rest=name.slice(colon+1);
  if(prefix==='mob')return mobSpec(rest,r);
  if(!isAction(prefix)||!rest||rest.includes(':'))return null;
  return blockSpec(prefix,rest,r);
}
