import {describe, expect, it} from 'vitest';
import {generate, initialState} from '../../../src/games/crossy-road/generator';
import {World} from '../../../src/games/crossy-road/world';
import {createRun, input, pose, restore, serialize, step} from '../../../src/games/crossy-road/rules';
import type {RoadLane} from '../../../src/games/crossy-road/config';

describe('reference generation revision', () => {
  it('adds compact, sedan and taxi lanes with matching physical lengths and varying repeat counts', () => {
    const lanes=Array.from({length:40},(_,i)=>generate(initialState(i),80).lanes).flat();
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
      const lanes=generate(initialState(seed),80).lanes;
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
    expect(save.worldVersion).toBe(2);
    expect(restore(save)?.worldVersion).toBe(2);
    delete save.worldVersion;
    expect(restore(save)?.worldVersion).toBe(1);
    expect(restore({...save,worldVersion:3})).toBeNull();
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
