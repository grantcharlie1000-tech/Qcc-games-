import {describe, expect, it} from 'vitest';
import {generate, generateChunk, initialState} from '../../../src/games/crossy-road/generator';
import {createRun} from '../../../src/games/crossy-road/rules';
import {HOP_TIME, PLATFORM_GRACE, roadGapMin, type Lane} from '../../../src/games/crossy-road/config';

describe('revision five terrain', () => {
  it('is no longer the revision new runs start on, but saved revision-five runs still replay it', () => {
    expect(createRun(11).worldVersion).toBe(6);
  });

  it('replays seeds independently of the requested generation batch sizes', () => {
    for(const seed of [0,1,11,2024,0xffffffff]) {
      const all=generate(initialState(seed,5),400).lanes;
      let state=initialState(seed,5);const chunks:Lane[]=[];
      while(chunks.length<400){const next=generateChunk(state);state=next.state;chunks.push(...next.lanes);}
      expect(chunks).toEqual(all);
      expect(generate(initialState(seed+1,5),400).lanes).not.toEqual(all);
    }
  });

  it('varies hazard transitions and independent directions while bounding terrain clusters', () => {
    let riverToHazard=0, sameRiverDirection=0, oppositeRiverDirection=0;
    const transitions=new Set<string>(), structures=new Set<string>();
    for(let seed=0;seed<80;seed++) {
      const lanes=generate(initialState(seed,5),450).lanes;
      let length=0,last='';
      for(let r=5;r<lanes.length;r++) {
        const lane=lanes[r],previous=lanes[r-1],kind=lane.kind==='lily'?'river':lane.kind;
        length=kind===last?length+1:1;last=kind;
        expect(length,`${seed}:${r}:${kind}`).toBeLessThanOrEqual(kind==='road'?4:kind==='river'?3:kind==='rail'?2:3);
        transitions.add(`${previous.kind}/${kind}`);
        if(previous.kind==='river'&&lane.kind!=='grass'&&lane.kind!=='river'&&lane.kind!=='lily')riverToHazard++;
        if(previous.kind==='river'&&lane.kind==='river'){if(previous.dir===lane.dir)sameRiverDirection++;else oppositeRiverDirection++;}
      }
      structures.add(lanes.slice(5,35).map(l=>l.kind).join(','));
    }
    expect(structures.size).toBe(80);
    expect(transitions.size).toBeGreaterThanOrEqual(14);
    expect(riverToHazard).toBeGreaterThan(100);
    expect(sameRiverDirection).toBeGreaterThan(100);
    expect(oppositeRiverDirection).toBeGreaterThan(100);
  });

  it('ramps speed, obstacle density and hazardous terrain across distance', () => {
    const stats=()=>({grass:0,waterRail:0,blocked:0,roadSpeed:0,roads:0,logSpeed:0,logs:0});
    const early=stats(),late=stats();
    for(let seed=0;seed<100;seed++) for(const lane of generate(initialState(seed,5),600).lanes) {
      if(lane.row<5||lane.row>=600)continue;
      const s=lane.row<155?early:lane.row>=450?late:null;if(!s)continue;
      if(lane.kind==='grass'){s.grass++;s.blocked+=lane.blocked.filter(Boolean).length;}
      if(lane.kind==='river'||lane.kind==='rail')s.waterRail++;
      if(lane.kind==='road'){s.roadSpeed+=lane.speed;s.roads++;}
      if(lane.kind==='river'){s.logSpeed+=lane.speed;s.logs++;}
    }
    expect(late.grass).toBeLessThan(early.grass);
    expect(late.waterRail).toBeGreaterThan(early.waterRail);
    expect(late.blocked/late.grass).toBeGreaterThan(early.blocked/early.grass);
    expect(late.roadSpeed/late.roads).toBeGreaterThan(early.roadSpeed/early.roads*1.3);
    expect(late.logSpeed/late.logs).toBeGreaterThan(early.logSpeed/early.logs*1.3);
  });

  it('leaves road crossing gaps and a provable landing interval on every adjacent river pair', () => {
    for(let seed=0;seed<200;seed++) {
      const lanes=generate(initialState(seed,5),400).lanes;
      for(const lane of lanes) {
        if(lane.kind!=='river'&&lane.kind!=='road')continue;
        for(let i=0;i<lane.movers.length;i++) {
          const mover=lane.movers[i],next=lane.movers[i+1];
          const gap=(next?next.offset:lane.cycle)-mover.offset-mover.len;
          if(lane.kind==='road')expect(gap+1e-9).toBeGreaterThanOrEqual(roadGapMin(lane.speed));
          else {
            expect(gap).toBeGreaterThanOrEqual(.5-1e-9);
            // The target's uncovered gap swept over a hop is smaller than any source log.
            // Thus every source log has some x supported by the target at take-off and landing,
            // at EVERY time and horizontal position, not merely a finite time-sampled window.
            expect(gap+lane.speed*HOP_TIME-2*PLATFORM_GRACE).toBeLessThan(2);
          }
        }
      }
    }
  });
});
