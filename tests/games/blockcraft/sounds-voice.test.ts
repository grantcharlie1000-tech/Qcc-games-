import {describe,expect,test} from 'vitest';
import {createNoiseBank,renderLayers} from '../../../src/games/blockcraft/audio/voice';
import {soundSpec,specDuration} from '../../../src/games/blockcraft/audio/synth';
import {caveSpec,composePiece} from '../../../src/games/blockcraft/audio/ambience';
import {MOB_KINDS} from '../../../src/games/blockcraft/data/items';
import {MockAudioContext,MockBufferSource,MockNode,MockParam,MockSource,seeded} from './sounds-mock';
import type {Layer} from '../../../src/games/blockcraft/audio/spec';

const MATERIALS=['stone','wood','gravel','grass','sand','cloth','glass','snow','metal','liquid','plant'];
const NAMES=[...MATERIALS.flatMap(m=>['break','place','step','hit','fall'].map(a=>`${a}:${m}`)),
  'hurt','death','eat','burp','drink','pop','levelup','orb','click','door_open','door_close','chest_open','chest_close','craft','explode','fuse',
  'ignite','splash','swim','fizz','lava','fire','bow','arrow_hit','throw','tool_break','equip','thunder','rain','attack_weak','attack_strong',
  'crit','sweep','toast','bucket_fill','bucket_empty','shear','milk','teleport','furnace',
  ...MOB_KINDS.flatMap(k=>['ambient','hurt','death','step'].map(s=>`mob:${k}:${s}`))];

function params(node:MockNode):MockParam[]{
  return Object.values(node).filter((v):v is MockParam=>v instanceof MockParam);
}
function render(layers:Layer[],pitch:number,loop=false){
  const ctx=new MockAudioContext();ctx.currentTime=3;
  const bank=createNoiseBank(ctx as unknown as BaseAudioContext,seeded(9));
  const out=ctx.createGain();out.connect(ctx.destination);
  const sources:AudioScheduledSourceNode[]=[];
  const end=renderLayers(ctx as unknown as BaseAudioContext,bank,layers,pitch,ctx.currentTime,out as unknown as AudioNode,sources,seeded(4),loop);
  return{ctx,end,sources:sources as unknown as MockSource[],out};
}

describe('Web Audio rendering of every synth',()=>{
  test.each(NAMES)('%s renders with strictly valid automation',name=>{
    for(const pitch of [.5,1,2]){
      const s=soundSpec(name,seeded(2),5)!;
      const {ctx,end,sources,out}=render(s.layers,pitch,!!s.loop);
      expect(sources.length).toBeGreaterThan(0);
      for(const src of sources){
        expect(src.startTime).not.toBeNull();
        expect(ctx.reaches(src)).toBe(true);
        if(s.loop)expect(src.stopTime).toBeNull();
        else{expect(src.stopTime).toBeGreaterThan(src.startTime!);expect(src.stopTime).toBeLessThanOrEqual(end+.05);}
        if(src instanceof MockBufferSource){expect(src.buffer).not.toBeNull();expect(src.loop).toBe(true);}
      }
      if(!s.loop){
        expect(end).toBeGreaterThan(3);
        expect(end-3).toBeCloseTo(specDuration(s)/pitch,5);
      }else expect(end).toBe(Infinity);
      for(const node of ctx.nodes){
        if(node===out)continue;
        for(const p of params(node)){
          // Events are scheduled in time order and envelopes never exceed full scale.
          for(let i=1;i<p.events.length;i++)expect(p.events[i].time).toBeGreaterThanOrEqual(p.events[i-1].time-1e-9);
        }
        if(node.kind==='gain'&&[...node.outputs].every(o=>o instanceof MockNode))for(const e of (node as unknown as {gain:MockParam}).gain.events)
          expect(Math.abs(e.value)).toBeLessThanOrEqual(1);
      }
      for(const osc of ctx.all<MockNode&{frequency:MockParam}>('oscillator'))
        for(const e of osc.frequency.events)expect(e.value).toBeLessThanOrEqual(ctx.sampleRate/2);
    }
  });
  test('noise buffers: white and loop-safe brown, never silent or clipping',()=>{
    const ctx=new MockAudioContext();
    const bank=createNoiseBank(ctx as unknown as BaseAudioContext,seeded(3));
    expect(ctx.buffers).toHaveLength(2);
    for(const b of [bank.white,bank.brown]){
      const d=b.getChannelData(0);let peak=0,energy=0;
      for(const v of d){peak=Math.max(peak,Math.abs(v));energy+=v*v;}
      expect(peak).toBeLessThanOrEqual(1);expect(energy/d.length).toBeGreaterThan(.01);
    }
    const brown=bank.brown.getChannelData(0);
    expect(Math.abs(brown[brown.length-1]-brown[0])).toBeLessThan(.05);
  });
  test('cave sounds and music notes render too',()=>{
    for(let seed=1;seed<12;seed++){
      const cave=caveSpec(seeded(seed));
      expect(specDuration(cave)).toBeGreaterThan(2);
      expect(render(cave.layers,1).sources.length).toBeGreaterThan(0);
      const piece=composePiece(seeded(seed));
      expect(piece.length).toBeGreaterThan(30);expect(piece.length).toBeLessThan(80);
      expect(piece.notes.length).toBeGreaterThan(15);
      for(const n of piece.notes){expect(n.layer.gain).toBeLessThanOrEqual(.06);expect(n.t).toBeLessThan(piece.length);}
      expect(render(piece.notes.map(n=>n.layer),1).sources.length).toBeGreaterThan(0);
    }
  });
});
