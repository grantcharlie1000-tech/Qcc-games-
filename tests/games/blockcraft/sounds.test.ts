import {afterEach,beforeEach,describe,expect,test} from 'vitest';
import {createFakeGame,fakeContext,type FakeGame} from './helpers/fake-game';
import {createSounds,createSoundEngine,MAX_VOICES,MASTER_LEVEL,type SoundEngine} from '../../../src/games/blockcraft/audio/sounds';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {CHUNK_VOLUME,LAYER} from '../../../src/games/blockcraft/engine/constants';
import type {SoundName} from '../../../src/games/blockcraft/engine/contracts';
import type {VoxelWorld} from '../../../src/games/blockcraft/world/world';
import type {Settings} from '../../../src/core/types';
import {MockAudioContext,MockFilter,MockGain,MockPanner,MockSource,gestureTarget,seeded} from './sounds-mock';

let game:FakeGame,shell:Settings,engine:SoundEngine,gestures:ReturnType<typeof gestureTarget>;
const ctx=()=>engine.audioContext as unknown as MockAudioContext;
const lastValue=(g:{gain:{events:{value:number}[]}})=>g.gain.events[g.gain.events.length-1]?.value;
const master=()=>engine.masterGain as unknown as MockGain;

function build(sound=true){
  game=createFakeGame();
  shell={sound,reducedMotion:false,colorBlind:false};
  game.context=fakeContext({settings:shell});
  gestures=gestureTarget();
  engine=createSoundEngine(game,{createContext:()=>new MockAudioContext() as unknown as AudioContext,gestureTarget:gestures.target,random:seeded(5)});
  game.sounds=Object.assign(engine,{played:[]});
  engine.init?.();
}
const start=()=>{gestures.gesture();return ctx();};
const at=(dx:number,dy:number,dz:number)=>{const e=game.player.eye();return{x:e.x+dx,y:e.y+dy,z:e.z+dz};};

beforeEach(()=>{MockAudioContext.created.length=0;build();});
afterEach(()=>engine.dispose?.());

describe('audio context lifecycle',()=>{
  test('no AudioContext exists before the first user gesture, then exactly one',()=>{
    expect(()=>engine.play('click')).not.toThrow();
    expect(MockAudioContext.created).toHaveLength(0);
    expect(engine.audioContext).toBeNull();
    start();
    expect(MockAudioContext.created).toHaveLength(1);
    gestures.gesture('keydown');gestures.gesture('touchend');
    expect(MockAudioContext.created).toHaveLength(1);
    engine.play('click');
    expect(engine.voiceCount).toBe(1);
    expect(game.root.dataset.audio).toBe('running');
  });
  test('a gesture while the shell sound is off creates nothing; switching sound on works on the next gesture',()=>{
    engine.dispose?.();build(false);
    gestures.gesture();
    expect(MockAudioContext.created).toHaveLength(0);
    shell.sound=true;gestures.gesture();
    expect(MockAudioContext.created).toHaveLength(1);
  });
  test('sound switched on after an earlier gesture starts on the next frame, without waiting for another gesture',()=>{
    engine.dispose?.();build(false);
    engine.frame?.(1/60);
    expect(MockAudioContext.created).toHaveLength(0);
    gestures.gesture('keydown');
    engine.frame?.(1/60);
    expect(MockAudioContext.created).toHaveLength(0);
    shell.sound=true;engine.frame?.(1/60);
    expect(MockAudioContext.created).toHaveLength(1);
    expect(ctx().state).toBe('running');
    engine.play('click');
    expect(engine.voiceCount).toBe(1);
  });
  test('without any gesture, switching sound on never creates a context',()=>{
    engine.dispose?.();build(false);
    shell.sound=true;
    for(let i=0;i<10;i++){engine.frame?.(1/60);engine.tick?.();}
    game.updateSettings({volume:.9});
    expect(MockAudioContext.created).toHaveLength(0);
  });
  test.each(['pointerup','click','touchend','mousedown'])('%s counts as a user gesture',type=>{
    gestures.gesture(type);
    expect(MockAudioContext.created).toHaveLength(1);
  });
  test('the master gain follows settings.volume and the shell sound toggle live',()=>{
    const c=start();
    expect(lastValue(master())).toBeCloseTo(MASTER_LEVEL,5);
    expect(c.reaches(master())).toBe(true);
    game.updateSettings({volume:.5});
    expect(lastValue(master())).toBeCloseTo(MASTER_LEVEL*.5,5);
    shell.sound=false;engine.frame?.(1/60);
    expect(lastValue(master())).toBe(0);
    expect(c.state).toBe('suspended');
    const before=c.nodes.length;engine.play('explode');
    expect(c.nodes.length).toBe(before);
    shell.sound=true;engine.frame?.(1/60);
    expect(c.state).toBe('running');
    expect(lastValue(master())).toBeCloseTo(MASTER_LEVEL*.5,5);
    game.updateSettings({volume:0});
    expect(c.state).toBe('suspended');
  });
  test('suspends while the engine is paused or lost, or the shell pauses, and resumes for play',()=>{
    const c=start();
    game.setState('paused');expect(c.state).toBe('suspended');
    engine.play('click');expect(engine.voiceCount).toBe(0);
    game.setState('playing');expect(c.state).toBe('running');
    game.shellPaused=true;game.events.emit('shellPaused',{paused:true});expect(c.state).toBe('suspended');
    game.shellPaused=false;game.events.emit('shellPaused',{paused:false});expect(c.state).toBe('running');
    game.setState('screen');expect(c.state).toBe('running');
    game.setState('dead');expect(c.state).toBe('running');
    game.setState('lost');expect(c.state).toBe('suspended');
  });
  test('a gesture resumes a context the browser left suspended',()=>{
    const c=start();c.state='suspended';
    gestures.gesture();
    expect(c.state).toBe('running');
  });
  test('while the browser holds the context suspended nothing queues up (no burst when it resumes)',()=>{
    const c=start();
    // Autoplay policy: the browser suspended the context and no resume is pending.
    c.state='suspended';
    for(let i=0;i<20;i++)engine.play('step:stone');
    game.player.state.headInWater=true;
    for(let i=0;i<5;i++)engine.tick?.();
    expect(engine.voiceCount).toBe(0);
    gestures.gesture();
    expect(c.state).toBe('running');
    engine.play('step:stone');
    expect(engine.voiceNames()).toContain('step:stone');
  });
  test('sounds played while a resume is still pending are kept (the first click is heard)',()=>{
    const c=start();
    c.state='suspended';
    let resolve=()=>{};
    c.resume=()=>{c.resumes++;return new Promise<void>(r=>{resolve=()=>{c.state='running';r();};});};
    gestures.gesture();
    expect(c.resumes).toBe(1);
    engine.play('click');
    expect(engine.voiceNames()).toEqual(['click']);
    // Further gestures while it is pending do not stack resume calls.
    gestures.gesture('keydown');
    expect(c.resumes).toBe(1);
    resolve();
    expect(c.state).toBe('running');
  });
  test('a gesture also resumes a context in a non-standard paused state (iOS "interrupted")',()=>{
    const c=start();
    (c as unknown as {state:string}).state='interrupted';
    engine.play('click');
    expect(engine.voiceCount).toBe(0);
    gestures.gesture();
    expect(c.state).toBe('running');
    engine.play('click');
    expect(engine.voiceCount).toBe(1);
  });
  test('gestures are heard in the capture and the bubble phase, including the shell sound checkbox change',()=>{
    engine.dispose?.();build(false);
    const added:{type:string;capture:boolean}[]=[],removed:{type:string;capture:boolean}[]=[];
    const capture=(o?:boolean|AddEventListenerOptions)=>typeof o==='boolean'?o:!!o?.capture;
    const target={
      addEventListener(type:string,_l:unknown,o?:boolean|AddEventListenerOptions){added.push({type,capture:capture(o)});},
      removeEventListener(type:string,_l:unknown,o?:boolean|EventListenerOptions){removed.push({type,capture:capture(o)});},
      dispatchEvent:()=>true
    } as EventTarget;
    const recorded=createSoundEngine(game,{createContext:()=>new MockAudioContext() as unknown as AudioContext,gestureTarget:target});
    recorded.init?.();
    for(const type of ['pointerdown','keydown','click','change'])for(const phase of [true,false])
      expect(added).toContainEqual({type,capture:phase});
    recorded.dispose?.();
    expect(removed.length).toBe(added.length);
    for(const a of added)expect(removed).toContainEqual(a);
  });
  test('a settings change that switches the shell sound on starts audio within that gesture',()=>{
    engine.dispose?.();build(false);
    shell.sound=true;gestures.gesture('change');
    expect(MockAudioContext.created).toHaveLength(1);
    expect(ctx().state).toBe('running');
  });
  test('dispose closes the context and removes every listener',()=>{
    const c=start();engine.play('click');
    engine.dispose?.();
    expect(c.closes).toBe(1);
    expect(()=>{engine.play('explode');engine.frame?.(.016);engine.tick?.();game.setState('playing');}).not.toThrow();
    gestures.gesture();
    expect(MockAudioContext.created).toHaveLength(1);
    expect(engine.voiceCount).toBe(0);
  });
  test('unavailable Web Audio is silent, never an error',()=>{
    engine.dispose?.();
    game=createFakeGame();game.context=fakeContext({settings:{sound:true,reducedMotion:false,colorBlind:false}});
    const g=gestureTarget();
    const broken=createSoundEngine(game,{createContext:()=>{throw new Error('no audio');},gestureTarget:g.target});
    broken.init?.();
    expect(()=>{g.gesture();broken.play('explode');broken.frame?.(.016);broken.dispose?.();}).not.toThrow();
  });
});

describe('play',()=>{
  test('unknown names and bad options never throw',()=>{
    start();
    for(const name of ['nope','mob:cow:sing','',undefined,null,42] as unknown as SoundName[])expect(()=>engine.play(name)).not.toThrow();
    expect(engine.voiceCount).toBe(0);
    expect(()=>engine.play('click',{x:NaN,y:0,z:0},{volume:Number.NaN,pitch:-3})).not.toThrow();
    expect(()=>engine.play('step:stone',undefined,{volume:Infinity,pitch:Infinity})).not.toThrow();
    const voices=engine.voiceCount;
    engine.play('step:stone',null,{volume:0});
    expect(engine.voiceCount).toBe(voices);
  });
  test('every voice is built from shared noise buffers (made once)',()=>{
    const c=start();
    for(let i=0;i<60;i++){engine.play(i%2?'break:gravel':'explode');c.currentTime+=5;engine.frame?.(.016);}
    expect(c.buffers.length).toBeLessThanOrEqual(2);
    expect(c.all('buffer').length).toBeGreaterThan(30);
  });
  test('positional sounds fall off with distance and pan from the camera',()=>{
    const c=start();
    game.player.state.yaw=0;
    engine.play('break:stone',at(8,0,0));
    const pan=c.all<MockPanner>('panner').at(-1)!;
    expect(pan.pan.value).toBeGreaterThan(.5);
    expect(engine.voiceLevels()[0]).toBeCloseTo(.5,5);
    engine.play('break:stone',at(-4,0,0));
    expect(c.all<MockPanner>('panner').at(-1)!.pan.value).toBeLessThan(-.5);
    expect(engine.voiceLevels()[1]).toBeCloseTo(.75,5);
    game.player.state.yaw=Math.PI;
    engine.play('break:stone',at(8,0,0));
    expect(c.all<MockPanner>('panner').at(-1)!.pan.value).toBeLessThan(-.5);
    const voices=engine.voiceCount;
    engine.play('break:stone',at(0,0,17));
    expect(engine.voiceCount).toBe(voices);
    engine.play('explode',at(0,0,32));
    expect(engine.voiceLevels().at(-1)).toBeCloseTo(.5,5);
    engine.play('click',at(100,0,0));
    expect(engine.voiceNames()).toContain('click');
  });
  test('options replace the vanilla event volume, like playSound(sound, volume, pitch)',()=>{
    start();
    engine.play('burp');
    expect(engine.voiceLevels()[0]).toBeCloseTo(.5,5);
    engine.play('burp',null,{volume:.5,pitch:.95});
    expect(engine.voiceLevels()[1]).toBeCloseTo(.5,5);
    engine.play('mob:slime:step',at(4,0,0),{volume:.8});
    expect(engine.voiceLevels()[2]).toBeCloseTo(.8*.75,5);
    engine.play('levelup',null,{volume:.25});
    expect(engine.voiceLevels()[3]).toBeCloseTo(.25,5);
  });
  test('thunder is heard everywhere, panned toward the strike',()=>{
    const c=start();game.player.state.yaw=0;
    engine.play('thunder',at(300,0,0));
    expect(engine.voiceLevels()[0]).toBe(1);
    expect(c.all<MockPanner>('panner').at(-1)!.pan.value).toBeGreaterThan(.5);
    engine.play('thunder',at(-200,0,0),{volume:.4});
    expect(engine.voiceLevels()[1]).toBeCloseTo(.4,5);
    expect(c.all<MockPanner>('panner').at(-1)!.pan.value).toBeLessThan(-.5);
  });
  test('thunder played next to the listener for panning takes its timbre from the caller distance fade',()=>{
    const c=start();
    const cracks=()=>c.all<MockFilter>('filter').filter(f=>f.type==='highpass').length;
    // Weather plays it at most 2 blocks from the eye toward the strike, at volume max(0.35, 1.15 - d/160).
    engine.play('thunder',at(2,0,0),{volume:Math.max(.35,1.15-150/160),pitch:.9});
    expect(engine.voiceNames()).toEqual(['thunder']);
    expect(cracks()).toBe(0);
    engine.play('thunder',at(2,0,0),{volume:1,pitch:.9});
    expect(cracks()).toBeGreaterThan(0);
    const near=cracks();
    // At the strike itself the distance decides.
    engine.play('thunder',at(150,0,0),{pitch:.9});
    expect(cracks()).toBe(near);
  });
  test('playing sounds follow the listener: turning and walking move them between the ears and fade them',()=>{
    const c=start();game.player.state.yaw=0;
    engine.play('explode',at(8,0,0));
    const pan=c.all<MockPanner>('panner').at(-1)!,out=[...pan.inputs][0] as MockGain;
    expect(pan.pan.value).toBeGreaterThan(.5);
    expect(lastValue(out)).toBeCloseTo(1-8/64,5);
    game.player.state.yaw=Math.PI;c.currentTime+=.1;engine.frame?.(.1);
    expect(pan.pan.value).toBeLessThan(-.5);
    // Walking 40 blocks away: 48 of the explosion's 64 blocks.
    game.player.state.x-=40;c.currentTime+=.1;engine.frame?.(.1);
    expect(lastValue(out)).toBeCloseTo(1-48/64,5);
    expect(engine.voiceLevels()[0]).toBeCloseTo(1-48/64,5);
    // Nothing is rescheduled while the listener stands still.
    const events=out.gain.events.length+pan.pan.events.length;
    for(let i=0;i<5;i++){c.currentTime+=.05;engine.frame?.(.05);}
    expect(out.gain.events.length+pan.pan.events.length).toBe(events);
  });
  test('thunder keeps its direction while the listener walks, and turns with the head',()=>{
    const c=start();game.player.state.yaw=0;
    engine.play('thunder',at(2,0,0),{volume:.6});
    const pan=c.all<MockPanner>('panner').at(-1)!,out=[...pan.inputs][0] as MockGain;
    expect(pan.pan.value).toBeGreaterThan(.5);
    game.player.state.x+=4;c.currentTime+=.1;engine.frame?.(.1);
    expect(pan.pan.value).toBeGreaterThan(.5);
    expect(lastValue(out)).toBeCloseTo(.6,5);
    game.player.state.yaw=Math.PI;c.currentTime+=.1;engine.frame?.(.1);
    expect(pan.pan.value).toBeLessThan(-.5);
  });
  test('pitch scales the synth frequencies (vanilla playback rate), clamped to 0.5..2',()=>{
    const c=start();
    const first=(fn:()=>void)=>{const n=c.nodes.length;fn();return c.nodes.slice(n).find(x=>x.kind==='oscillator') as unknown as {frequency:{events:{value:number}[]}};};
    // The interface click is a fixed sample (pitch 1, no random variation).
    const f=(pitch:number)=>first(()=>engine.play('click',null,{pitch})).frequency.events[0].value;
    expect(f(1.5)/f(1)).toBeCloseTo(1.5,5);
    expect(f(100)/f(1)).toBeCloseTo(2,5);
    expect(f(.01)/f(1)).toBeCloseTo(.5,5);
  });
});

describe('voice cap',()=>{
  test(`never more than ${MAX_VOICES} voices at once`,()=>{
    const c=start();
    expect(MAX_VOICES).toBe(16);
    for(let i=0;i<40;i++)engine.play('break:stone',at(1,0,0));
    expect(engine.voiceCount).toBe(16);
    const live=c.all<MockPanner>('panner').filter(p=>c.reaches(p)&&[...p.inputs].some(i=>(i as MockGain).gain&&lastValue(i as MockGain)>0));
    expect(live.length).toBeLessThanOrEqual(16);
  });
  test('a full pool drops quieter sounds and lets louder ones steal the quietest voice',()=>{
    const c=start();
    for(let i=0;i<16;i++)engine.play('step:stone');
    const sources=c.nodes.filter((n):n is MockSource=>n instanceof MockSource);
    engine.play('step:grass',null,{volume:.05});
    expect(engine.voiceNames().filter(n=>n==='step:grass')).toHaveLength(0);
    engine.play('explode');
    expect(engine.voiceCount).toBe(16);
    expect(engine.voiceNames()).toContain('explode');
    const stopped=sources.filter(s=>s.stopTime!==null&&s.stopTime<=c.currentTime+.1);
    expect(stopped.length).toBeGreaterThan(0);
  });
  test('ended voices free their slots and leave the graph',()=>{
    const c=start();
    for(let i=0;i<16;i++)engine.play('hit:wood');
    const outs=c.all<MockPanner>('panner');
    c.currentTime+=10;engine.frame?.(.016);
    expect(engine.voiceCount).toBe(0);
    for(const p of outs)expect(c.reaches(p)).toBe(false);
    engine.play('hit:wood');
    expect(engine.voiceCount).toBe(1);
  });
  test('reset stops every sound',()=>{
    start();
    for(let i=0;i<5;i++)engine.play('fire');
    engine.play('rain');
    game.player.state.headInWater=true;engine.tick?.();
    expect(engine.voiceNames()).toContain('underwater');
    engine.reset?.();
    expect(engine.voiceCount).toBe(0);
    expect(engine.underwaterLevel).toBe(0);
  });
});

describe('ambience',()=>{
  test('rain is one bed: the call volume capped by weather intensity, fading when the weather stops calling',()=>{
    const c=start();
    const weather=game.weather as {intensity:number};weather.intensity=1;
    for(let i=0;i<30;i++){engine.play('rain',null,{volume:.8});engine.frame?.(.05);c.currentTime+=.05;}
    expect(engine.voiceNames().filter(n=>n==='rain')).toHaveLength(1);
    expect(engine.rainLevel).toBeCloseTo(.8,5);
    // The weather passes its eased rain level as the volume; intensity also caps a constant-volume caller.
    weather.intensity=.25;engine.frame?.(.05);
    expect(engine.rainLevel).toBeCloseTo(.25,5);
    // A quieter caller brings the bed down over a few calls (the level is averaged, like overlapping rain samples).
    for(let i=0;i<20;i++){engine.play('rain',null,{volume:.1});engine.frame?.(.05);}
    expect(engine.rainLevel).toBeCloseTo(.1,2);
    weather.intensity=.6;
    for(let i=0;i<20;i++){engine.play('rain');engine.frame?.(.05);}
    expect(engine.rainLevel).toBeCloseTo(.6,5);
    c.currentTime+=30;engine.frame?.(.05);
    expect(engine.rainLevel).toBe(0);
    c.currentTime+=30;engine.frame?.(.05);
    expect(engine.voiceNames()).not.toContain('rain');
  });
  test('rain heard under a roof (pitch below 1) is muffled; raining columns lean the bed softly toward them',()=>{
    const c=start();game.player.state.yaw=0;
    const weather=game.weather as {intensity:number};weather.intensity=1;
    engine.play('rain',at(0,0,-2),{volume:1});
    const rain=c.all<MockFilter>('filter').find(f=>f.type==='lowpass'&&[...f.outputs].some(o=>o instanceof MockPanner))!;
    expect(rain).toBeDefined();
    expect(engine.rainCutoff).toBeGreaterThan(8000);
    expect(engine.rainLevel).toBeGreaterThan(.9);
    for(let i=0;i<20;i++){engine.play('rain',at(8,0,0),{volume:.5,pitch:.5});c.currentTime+=1;engine.frame?.(.05);}
    expect(engine.rainCutoff).toBeLessThan(1000);
    expect(rain.frequency.events.at(-1)!.value).toBeLessThan(1000);
    expect(engine.rainPan).toBeGreaterThan(.2);
    expect(engine.rainPan).toBeLessThanOrEqual(.5);
    // A column 8 blocks away is half attenuated as a point source; as a bed it only softens.
    expect(engine.rainLevel).toBeGreaterThan(.5*.6);
    expect(engine.rainLevel).toBeLessThan(.5);
    // Back in the open the bed opens up over a few calls, not at the first open column.
    engine.play('rain',at(-1,0,0),{volume:1,pitch:1});c.currentTime+=1;engine.frame?.(.05);
    expect(engine.rainCutoff).toBeLessThan(2000);
    for(let i=0;i<8;i++){engine.play('rain',at(-1,0,0),{volume:1,pitch:1});c.currentTime+=1;engine.frame?.(.05);}
    expect(engine.rainCutoff).toBeGreaterThan(8000);
  });
  test('rain does not pump when muffled and open columns alternate (under a canopy, in a house by open ground)',()=>{
    const c=start();game.player.state.yaw=0;
    const weather=game.weather as {intensity:number};weather.intensity=1;
    const cutoffs:number[]=[],levels:number[]=[];
    // Weather picks a random column every 16-24 ticks: rain on the roof above (muffled) or on open ground nearby.
    for(let i=0;i<24;i++){
      const muffled=i%2===0;
      engine.play('rain',muffled?at(3,3,0):at(3,-1,0),muffled?{volume:.5,pitch:.5}:{volume:1,pitch:1});
      c.currentTime+=1;engine.frame?.(.05);
      // Once it has settled from the first call (which starts the bed muffled).
      if(i>=12){cutoffs.push(engine.rainCutoff);levels.push(engine.rainLevel);}
    }
    const spread=(v:number[])=>Math.max(...v)/Math.min(...v);
    expect(spread(cutoffs)).toBeLessThan(1.6);
    expect(spread(levels)).toBeLessThan(1.2);
    // It settles between rain on the roof (750 Hz) and rain in the open (12 kHz).
    expect(Math.min(...cutoffs)).toBeGreaterThan(1500);
    expect(Math.max(...cutoffs)).toBeLessThan(6000);
    const filter=c.all<MockFilter>('filter').find(f=>f.type==='lowpass'&&[...f.outputs].some(o=>o instanceof MockPanner))!;
    const late=filter.frequency.events.slice(-8).map(e=>e.value);
    expect(spread(late)).toBeLessThan(1.6);
  });
  test('underwater: a loop fades in over 2 s while the eyes are in water, with enter, exit and bubble additions',()=>{
    const c=start();
    const step=(n:number)=>{for(let i=0;i<n;i++){engine.tick?.();c.currentTime+=.05;engine.frame?.(.05);}};
    step(5);
    expect(engine.voiceNames()).not.toContain('underwater');
    game.player.state.headInWater=true;
    step(1);
    expect(engine.voiceNames()).toContain('underwater');
    expect(engine.voiceNames()).toContain('underwater_enter');
    expect(engine.underwaterLevel).toBeGreaterThan(0);
    expect(engine.underwaterLevel).toBeLessThan(.1);
    step(39);
    const full=engine.underwaterLevel;
    step(10);
    expect(engine.underwaterLevel).toBe(full);
    let bubbles=0;
    for(let i=0;i<3000;i++){step(1);if(engine.voiceNames().some(n=>n.startsWith('underwater_')&&n!=='underwater_enter'))bubbles++;}
    expect(bubbles).toBeGreaterThan(10);
    expect(engine.voiceNames().filter(n=>n==='underwater')).toHaveLength(1);
    game.player.state.headInWater=false;
    step(1);
    expect(engine.voiceNames()).toContain('underwater_exit');
    expect(engine.underwaterLevel).toBeLessThan(full);
    step(20);
    expect(engine.voiceNames()).not.toContain('underwater');
  });
  test('no underwater sounds on dry land or while silent',()=>{
    const c=start();
    for(let i=0;i<2000;i++){engine.tick?.();c.currentTime+=.05;}
    expect(engine.voiceNames().some(n=>n.startsWith('underwater'))).toBe(false);
    game.setState('paused');game.player.state.headInWater=true;
    for(let i=0;i<100;i++)engine.tick?.();
    expect(engine.voiceNames().some(n=>n.startsWith('underwater'))).toBe(false);
  });
  function cave(){
    const air=(y:number)=>y>=20&&y<40;
    for(let cz=-2;cz<=2;cz++)for(let cx=-2;cx<=2;cx++){
      const blocks=new Uint8Array(CHUNK_VOLUME);
      for(let y=0;y<100;y++)if(!air(y))blocks.fill(B.stone,y*LAYER,(y+1)*LAYER);
      (game.world as VoxelWorld).insert(cx,cz,{blocks,biomes:new Uint8Array(LAYER)});
    }
    game.player.teleport(.5,26,.5);
  }
  test('cave ambience plays after minutes in darkness underground (vanilla mood: +1/6000 per dark sample)',()=>{
    start();cave();
    let first=-1;
    for(let t=1;t<=12000&&first<0;t++){engine.tick?.();if(engine.voiceNames().includes('cave'))first=t;}
    expect(first).toBeGreaterThan(5900);
    expect(first).toBeLessThan(8000);
  });
  test('no cave ambience on the lit surface',()=>{
    start();game.flat(60,B.stone);game.player.teleport(.5,60,.5);
    for(let t=0;t<20000;t++)engine.tick?.();
    expect(engine.voiceNames()).not.toContain('cave');
  });
  test('sparse, quiet music: a calm piece within two minutes, then minutes of silence',()=>{
    const c=start();
    let first=-1;
    for(let t=1;t<=2400&&first<0;t++){engine.tick?.();c.currentTime+=.05;if(engine.voiceNames().includes('music'))first=t;}
    expect(first).toBeGreaterThan(0);
    // The piece ends within ~90 s; the next one waits at least three minutes.
    let end=-1;
    for(let t=1;t<=2400&&end<0;t++){engine.tick?.();c.currentTime+=.05;engine.frame?.(.05);if(!engine.voiceNames().includes('music'))end=t;}
    expect(end).toBeGreaterThan(200);
    for(let t=0;t<3*60*20;t++){engine.tick?.();c.currentTime+=.05;engine.frame?.(.05);expect(engine.voiceNames()).not.toContain('music');}
    const notes=c.all<MockGain>('gain').filter(g=>g.gain.events.some(e=>e.value>0)&&g.gain.peak()<=.12);
    expect(notes.length).toBeGreaterThan(5);
  });
  const startMusic=(c:MockAudioContext)=>{
    for(let t=1;t<=2400&&!engine.voiceNames().includes('music');t++){engine.tick?.();c.currentTime+=.05;}
    expect(engine.voiceNames()).toContain('music');
    for(let t=0;t<40;t++){engine.tick?.();c.currentTime+=.05;}
  };
  const lateNotes=(c:MockAudioContext,from:number)=>
    c.nodes.slice(from).filter((n):n is MockSource=>n instanceof MockSource&&n.kind==='oscillator'&&n.startTime===c.currentTime).length;
  test('music waits on the death screen: no burst of missed notes, and the piece goes on where it was',()=>{
    const c=start();startMusic(c);
    const position=engine.musicTime;
    expect(position).toBeGreaterThan(1.9);
    // Ticks stop on the death screen while the audio clock keeps running (frames still come).
    game.setState('dead');
    for(let i=0;i<250;i++){c.currentTime+=.1;engine.frame?.(.1);}
    game.setState('playing');
    const before=c.nodes.length;
    engine.tick?.();
    expect(lateNotes(c,before)).toBeLessThanOrEqual(5);
    expect(Math.abs(engine.musicTime-position)).toBeLessThan(.2);
  });
  test('a main-thread hitch neither bursts out the notes it missed nor holds the piece back',()=>{
    const c=start();startMusic(c);
    const position=engine.musicTime;
    c.currentTime+=25;
    const before=c.nodes.length;
    engine.tick?.();
    // Notes that should have started during the hitch are skipped, except those just due.
    expect(lateNotes(c,before)).toBeLessThanOrEqual(10);
    expect(engine.musicTime).toBeGreaterThan(position+24);
  });
  test('slow frames (below 2 fps) do not freeze the music: the piece plays on and ends',()=>{
    const c=start();startMusic(c);
    const before=c.all('oscillator').length;
    // The engine caps dt at 0.1 s: two ticks per frame while the audio clock runs 0.6 s.
    let ended=-1;
    for(let f=0;f<500&&ended<0;f++){
      c.currentTime+=.6;engine.tick?.();engine.tick?.();engine.frame?.(.1);
      if(!engine.voiceNames().includes('music'))ended=f;
    }
    expect(ended).toBeGreaterThan(0);
    // Pieces are at most ~80 s long.
    expect(ended*.6).toBeLessThan(90);
    expect(c.all('oscillator').length-before).toBeGreaterThan(20);
  });
  test('no music when the shell sound is off',()=>{
    engine.dispose?.();build(false);
    for(let t=0;t<6000;t++)engine.tick?.();
    expect(MockAudioContext.created).toHaveLength(0);
  });
});

describe('service shape',()=>{
  test('createSounds exposes only play and the lifecycle hooks',()=>{
    const service=createSounds(game);
    expect(Object.keys(service).sort()).toEqual(['dispose','frame','init','play','reset','tick']);
    service.init?.();
    expect(()=>service.play('click')).not.toThrow();
    service.dispose?.();
  });
});
