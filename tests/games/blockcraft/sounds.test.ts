import {afterEach,beforeEach,describe,expect,test} from 'vitest';
import {createFakeGame,fakeContext,type FakeGame} from './helpers/fake-game';
import {createSounds,createSoundEngine,MAX_VOICES,MASTER_LEVEL,type SoundEngine} from '../../../src/games/blockcraft/audio/sounds';
import {B} from '../../../src/games/blockcraft/data/blocks';
import {CHUNK_VOLUME,LAYER} from '../../../src/games/blockcraft/engine/constants';
import type {SoundName} from '../../../src/games/blockcraft/engine/contracts';
import type {VoxelWorld} from '../../../src/games/blockcraft/world/world';
import type {Settings} from '../../../src/core/types';
import {MockAudioContext,MockGain,MockPanner,MockSource,gestureTarget,seeded} from './sounds-mock';

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
    engine.play('step:grass',null,{volume:.5});
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
    engine.reset?.();
    expect(engine.voiceCount).toBe(0);
  });
});

describe('ambience',()=>{
  test('rain is one bed that follows weather intensity and fades when the weather stops calling',()=>{
    const c=start();
    const weather=game.weather as {intensity:number};weather.intensity=1;
    for(let i=0;i<30;i++){engine.play('rain',null,{volume:.8});engine.frame?.(.05);c.currentTime+=.05;}
    expect(engine.voiceNames().filter(n=>n==='rain')).toHaveLength(1);
    const full=engine.rainLevel;
    expect(full).toBeGreaterThan(0);
    weather.intensity=.25;engine.frame?.(.05);
    expect(engine.rainLevel).toBeCloseTo(full/4,5);
    engine.play('rain',null,{volume:.4});engine.frame?.(.05);
    expect(engine.rainLevel).toBeCloseTo(full/8,5);
    c.currentTime+=30;engine.frame?.(.05);
    expect(engine.rainLevel).toBe(0);
    c.currentTime+=30;engine.frame?.(.05);
    expect(engine.voiceNames()).not.toContain('rain');
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
