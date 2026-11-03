import {describe, expect, it} from 'vitest';
import {generate, initialState} from '../../../src/games/crossy-road/generator';
import {World} from '../../../src/games/crossy-road/world';
import {createRun, input, pose, restore, serialize, step} from '../../../src/games/crossy-road/rules';
import type {RoadLane} from '../../../src/games/crossy-road/config';

describe('reference generation revision', () => {
  it('keeps rivers densely covered by 2–4-cell logs, including at late difficulty', () => {
    for(let seed=0;seed<40;seed++) for(const lane of generate(initialState(seed,4),400).lanes) {
      if(lane.kind!=='river') continue;
      const coverage=lane.movers.reduce((n,m)=>n+m.len,0)/lane.cycle;
      expect(coverage).toBeGreaterThan(0.7);
      for(let i=0;i<lane.movers.length;i++) {
        const mover=lane.movers[i], next=lane.movers[i+1]?.offset??lane.cycle;
        expect([2,3,4]).toContain(mover.len);
        expect(next-mover.offset-mover.len).toBeGreaterThanOrEqual(0.55-1e-9);
        expect(next-mover.offset-mover.len).toBeLessThanOrEqual(1.1+1e-9);
      }
    }
  });

  it('gives each traffic lane one paint, with all reference colours and yellow taxis', () => {
    const colours=new Set<number>();
    for(let seed=0;seed<40;seed++) for(const lane of generate(initialState(seed,4),100).lanes) {
      if(lane.kind!=='road') continue;
      expect(new Set(lane.movers.map(m=>m.color)).size).toBe(1);
      if(lane.vehicle==='car') {
        if(lane.style==='taxi') expect(lane.movers[0].color).toBe(2);
        else colours.add(lane.movers[0].color);
      }
    }
    expect(colours).toEqual(new Set([0,1,3,4,5,6]));
  });
  it('adds compact, sedan and taxi lanes with matching physical lengths and varying repeat counts', () => {
    const lanes=Array.from({length:40},(_,i)=>generate(initialState(i,4),80).lanes).flat();
    const roads=lanes.filter((l): l is RoadLane=>l.kind==='road');
    expect(new Set(roads.filter(l=>l.vehicle==='car').map(l=>l.style))).toEqual(new Set(['compact','sedan','taxi']));
    for(const lane of roads.filter(l=>l.vehicle==='car')) {
      for(const mover of lane.movers) expect(mover.len).toBe(lane.style==='compact'?1.2:1.8);
    }
    expect(new Set(roads.map(l=>l.movers.length)).size).toBeGreaterThan(2);
  });

  it('produces log/lily pairs, early triple crossings, and short stumps without losing open cells', () => {
    let pairs=0, triples=0, stumps=0;
    for(let seed=0;seed<100;seed++) {
      const lanes=generate(initialState(seed,4),80).lanes;
      for(let r=1;r<lanes.length-1;r++) {
        const l=lanes[r];
        if(l.kind==='lily' && lanes[r-1].kind==='river' && !['river','lily'].includes(lanes[r+1].kind)) pairs++;
        if(r<40 && l.kind==='rail' && lanes[r+1].kind==='rail' && lanes[r+2]?.kind==='rail') triples++;
        if(l.kind==='grass') l.obstacles.forEach((o,c)=>{if(o==='tree'&&l.variant[c]===3) {stumps++;expect(l.blocked[c]).toBe(true);}});
      }
    }
    expect(pairs).toBeGreaterThan(5); expect(triples).toBeGreaterThan(5); expect(stumps).toBeGreaterThan(5);
  });

  it('stores the generation revision and accepts legacy saves as revision one', () => {
    const save=serialize(createRun(7));
    expect(save.worldVersion).toBe(5);
    expect(restore(save)?.worldVersion).toBe(5);
    for (const worldVersion of [1,2,3,4]) expect(restore({...save,worldVersion})?.worldVersion).toBe(worldVersion);
    delete save.worldVersion;
    expect(restore(save)?.worldVersion).toBe(1);
    expect(restore({...save,worldVersion:6})).toBeNull();
    expect(generate(initialState(7,1),60).lanes).not.toEqual(generate(initialState(7,2),60).lanes);
  });
});

it('records a hop-in car impact on the road while preserving the visible collision pose', () => {
  const world=new World(1), run=createRun(1);
  world.override([{kind:'road',row:1,dir:1,speed:1.5,vehicle:'car',cycle:10,phase:3.8,movers:[{offset:0,len:1.8,color:0}]}]);
  input(run,'up',world); step(run,1/60,world);
  expect(run.death?.cause).toBe('car');
  expect(run.death?.contact?.row).toBe(1);
  expect(run.death?.contact?.mode).toBe('hop-in');
  expect(run.death?.contact?.z).toBeCloseTo(pose(run).z);
  expect(run.death?.contact?.lift).toBeCloseTo(pose(run).lift);
  expect(restore(serialize(run))?.death?.contact).toEqual(run.death?.contact);
});
