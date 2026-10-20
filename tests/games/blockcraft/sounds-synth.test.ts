import {describe,expect,test} from 'vitest';
import {soundSpec,specDuration,SOUND_MATERIALS,MOB_SOUND_KINDS,type SoundSpec,type Layer} from '../../../src/games/blockcraft/audio/synth';
import {MOB_KINDS} from '../../../src/games/blockcraft/data/items';
import type {SoundName} from '../../../src/games/blockcraft/engine/contracts';
import type {SoundKind} from '../../../src/games/blockcraft/data/blocks';
import {seeded} from './sounds-mock';

// The closed SoundName union, spelled out so the test fails if a name stops producing a synth.
const MATERIALS=['stone','wood','gravel','grass','sand','cloth','glass','snow','metal','liquid','plant'] as const satisfies readonly SoundKind[];
const ACTIONS=['break','place','step','hit','fall'] as const;
const SIMPLE=['hurt','death','eat','burp','drink','pop','levelup','orb','click','door_open','door_close','chest_open','chest_close','craft',
  'explode','fuse','ignite','splash','swim','fizz','lava','fire','bow','arrow_hit','throw','tool_break','equip','thunder','rain',
  'attack_weak','attack_strong','crit','sweep','toast','bucket_fill','bucket_empty','shear','milk','teleport','furnace'] as const satisfies readonly SoundName[];
const MOB_SOUNDS=['ambient','hurt','death','step'] as const;
const ALL:SoundName[]=[
  ...MATERIALS.flatMap(m=>ACTIONS.map(a=>`${a}:${m}` as SoundName)),...SIMPLE,
  ...MOB_KINDS.flatMap(k=>MOB_SOUNDS.map(s=>`mob:${k}:${s}` as SoundName))];

const fixed=(v:number)=>()=>v;
const spec=(name:string,r:()=>number=fixed(.5),distance:number|null=null)=>soundSpec(name,r,distance);
const must=(name:string,r?:()=>number)=>{const s=spec(name,r);if(!s)throw new Error(`no synth for ${name}`);return s;};
const freqs=(l:Layer)=>l.kind==='tone'?[l.freq,l.freqEnd,...(l.filter?[l.filter.freq]:[])]:[l.freq,l.freqEnd];
const round=(v:unknown):unknown=>typeof v==='number'?Math.round(v*1000)/1000:Array.isArray(v)?v.map(round):
  v&&typeof v==='object'?Object.fromEntries(Object.entries(v).map(([k,x])=>[k,round(x)])):v;
const signature=(s:SoundSpec)=>JSON.stringify(round(s.layers));

describe('name → synth mapping',()=>{
  test('the registries match the contract',()=>{
    expect([...SOUND_MATERIALS].sort()).toEqual([...MATERIALS].sort());
    expect([...MOB_SOUND_KINDS].sort()).toEqual([...MOB_SOUNDS].sort());
  });
  test.each(ALL)('%s has a well-formed synth',name=>{
    for(const r of [fixed(0),fixed(.5),fixed(.999),seeded(7)]){
      const s=must(name,r);
      expect(s.volume).toBeGreaterThan(0);expect(Number.isFinite(s.volume)).toBe(true);
      expect(s.pitch).toBeGreaterThan(0);expect(Number.isFinite(s.pitch)).toBe(true);
      expect(s.layers.length).toBeGreaterThan(0);expect(s.layers.length).toBeLessThanOrEqual(12);
      for(const l of s.layers){
        for(const v of [l.delay,l.attack,l.hold,l.decay])expect(v).toBeGreaterThanOrEqual(0);
        expect(l.decay).toBeGreaterThan(0);
        expect(l.gain).toBeGreaterThan(0);expect(l.gain).toBeLessThanOrEqual(1);
        for(const f of freqs(l)){expect(f).toBeGreaterThanOrEqual(20);expect(f).toBeLessThanOrEqual(16000);}
        if(l.kind==='noise'&&l.bursts){
          expect(l.bursts.length).toBeGreaterThan(0);
          for(let i=0;i<l.bursts.length;i++){
            const b=l.bursts[i];expect(b.gain).toBeGreaterThan(0);expect(b.gain).toBeLessThanOrEqual(1);expect(b.decay).toBeGreaterThan(0);
            if(i)expect(b.at).toBeGreaterThan(l.bursts[i-1].at+l.bursts[i-1].decay);
          }
        }
      }
      const d=specDuration(s);expect(d).toBeGreaterThan(0);
      if(!s.loop)expect(d).toBeLessThan(name==='thunder'?12:8);
    }
  });
  test('unknown names map to nothing (and never throw); unknown materials fall back to stone',()=>{
    for(const name of ['','nope','break:','mob:cow','mob:cow:sing','mob::ambient','step','rain:heavy',':'])expect(spec(name)).toBeNull();
    expect(signature(must('break:unobtainium'))).toBe(signature(must('break:stone')));
    expect(spec('mob:villager:ambient')).not.toBeNull();
  });
  test('the same seed gives the same synth, other seeds vary it',()=>{
    expect(signature(must('step:stone',seeded(3)))).toBe(signature(must('step:stone',seeded(3))));
    const variants=new Set([1,2,3,4,5].map(seed=>signature(must('step:stone',seeded(seed)))));
    expect(variants.size).toBeGreaterThan(3);
  });
});

describe('block sounds follow vanilla levels',()=>{
  // Vanilla: break/place (v+1)/2 at pitch ×0.8, step v×0.15, mining hit (v+1)/8 at pitch ×0.5, fall v×0.5 at pitch ×0.75.
  const levels={break:[1,.8],place:[1,.8],step:[.15,1],hit:[.25,.5],fall:[.5,.75]} as const;
  test.each(MATERIALS)('%s',material=>{
    const base=material==='metal'?1.5:1;
    for(const action of ACTIONS){
      const s=must(`${action}:${material}`);
      expect(s.volume).toBeCloseTo(levels[action][0],5);
      expect(s.pitch).toBeCloseTo(levels[action][1]*base,5);
      expect(s.ui).toBeFalsy();
    }
  });
  test('each material has its own character',()=>{
    expect(new Set(MATERIALS.map(m=>signature(must(`break:${m}`)))).size).toBe(MATERIALS.length);
    expect(new Set(MATERIALS.filter(m=>m!=='glass').map(m=>signature(must(`step:${m}`)))).size).toBe(MATERIALS.length-1);
  });
  test('glass shatters with high tinkles; placing glass sounds like stone (as in vanilla)',()=>{
    const pings=must('break:glass').layers.filter(l=>l.kind==='tone'&&l.freq>2000);
    expect(pings.length).toBeGreaterThanOrEqual(3);
    expect(must('place:glass').layers.some(l=>l.kind==='tone'&&l.freq>2000)).toBe(false);
  });
  test('mining hits are the step sound slowed down, breaking is the dig sound',()=>{
    expect(signature(must('hit:wood'))).toBe(signature(must('step:wood')));
    expect(signature(must('fall:sand'))).toBe(signature(must('step:sand')));
    expect(signature(must('break:gravel'))).toBe(signature(must('place:gravel')));
    expect(specDuration(must('break:stone'))).toBeGreaterThan(specDuration(must('step:stone')));
  });
});

describe('event sounds',()=>{
  test('level up is a rising arpeggio',()=>{
    const notes=must('levelup').layers.filter(l=>l.kind==='tone'&&l.delay>=0).sort((a,b)=>a.delay-b.delay||a.freq-b.freq);
    const starts=[...new Map(notes.map(n=>[n.delay,n.freq])).entries()];
    expect(starts.length).toBeGreaterThanOrEqual(3);
    for(let i=1;i<starts.length;i++){expect(starts[i][0]).toBeGreaterThan(starts[i-1][0]);expect(starts[i][1]).toBeGreaterThan(starts[i-1][1]);}
  });
  test('the xp orb is a quiet ding at a random pitch',()=>{
    const pitches=[0,.2,.4,.6,.8,.99].map(v=>{let i=0;const r=()=>[v,1-v][i++%2];return must('orb',r).pitch;});
    expect(new Set(pitches.map(p=>p.toFixed(3))).size).toBeGreaterThanOrEqual(3);
    for(const p of pitches){expect(p).toBeGreaterThanOrEqual(.5);expect(p).toBeLessThanOrEqual(1.3);}
    expect(must('orb').volume).toBeCloseTo(.1,5);
    expect(must('orb').layers.every(l=>l.kind==='tone')).toBe(true);
  });
  test('explosions and thunder carry far; interface sounds are not positional',()=>{
    expect(must('explode').volume).toBe(4);
    expect(must('thunder').volume).toBeGreaterThanOrEqual(1000);
    for(const name of ['click','toast','craft'])expect(must(name).ui).toBe(true);
    for(const name of ['explode','door_open','mob:cow:ambient','step:grass'])expect(must(name).ui).toBeFalsy();
  });
  test('close thunder cracks, distant thunder only rumbles',()=>{
    const bright=(s:SoundSpec)=>Math.max(...s.layers.map(l=>l.kind==='noise'&&l.filter==='highpass'?l.gain:0));
    expect(bright(spec('thunder',fixed(.5),4)!)).toBeGreaterThan(0);
    expect(bright(spec('thunder',fixed(.5),200)!)).toBe(0);
  });
  test('rain is a looping bed; the explosion has a low boom',()=>{
    expect(must('rain').loop).toBe(true);
    expect(must('explode').layers.some(l=>l.kind==='tone'&&l.freq<100)).toBe(true);
    expect(specDuration(must('explode'))).toBeGreaterThan(1);
  });
  test('event families differ from each other',()=>{
    expect(new Set(SIMPLE.map(n=>signature(must(n)))).size).toBe(SIMPLE.length);
  });
});

describe('mob voices',()=>{
  test('every mob kind has its own ambient, hurt, death and step sound',()=>{
    for(const kind of MOB_SOUNDS)expect(new Set(MOB_KINDS.map(m=>signature(must(`mob:${m}:${kind}`)))).size).toBe(MOB_KINDS.length);
  });
  test('vanilla levels: steps at 0.15, voices at 1 with a ±10% random pitch',()=>{
    for(const mob of MOB_KINDS){
      expect(must(`mob:${mob}:step`).volume).toBeCloseTo(.15,5);
      for(const v of ['ambient','hurt','death'] as const){
        const lo=must(`mob:${mob}:${v}`,fixed(0)).pitch,hi=must(`mob:${mob}:${v}`,(()=>{let i=0;return()=>i++%2?0:.999;})()).pitch;
        expect(lo).toBeCloseTo(1,5);expect(hi).toBeGreaterThan(1.15);expect(hi).toBeLessThan(1.21);
      }
    }
  });
  test('death cries last longer than hurt cries',()=>{
    for(const mob of MOB_KINDS)expect(specDuration(must(`mob:${mob}:death`))).toBeGreaterThan(specDuration(must(`mob:${mob}:hurt`)));
  });
  test('creepers are almost silent until they hiss; endermen warble',()=>{
    const creeper=must('mob:creeper:ambient');
    expect(creeper.volume*Math.max(...creeper.layers.map(l=>l.gain))).toBeLessThan(.1);
    expect(must('mob:enderman:ambient').layers.some(l=>l.kind==='tone'&&(l.fm||l.vibrato))).toBe(true);
  });
  test('unknown creatures get a stable generic voice',()=>{
    expect(signature(must('mob:villager:hurt'))).toBe(signature(must('mob:villager:hurt')));
    expect(signature(must('mob:villager:hurt'))).not.toBe(signature(must('mob:pillager:hurt')));
  });
});
