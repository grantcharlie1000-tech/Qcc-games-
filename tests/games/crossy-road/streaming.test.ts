import {describe, expect, it} from 'vitest';
import {createRun, hopTarget, input, pose, restore, serialize, step} from '../../../src/games/crossy-road/rules';
import {World} from '../../../src/games/crossy-road/world';
import {focusXTarget} from '../../../src/games/crossy-road/scene';
import {forEachMover, platformAt, railWarning, trainHit} from '../../../src/games/crossy-road/lanes';
import {HOP_TIME, type GrassLane, type LaneSource, type RailLane, type RiverLane} from '../../../src/games/crossy-road/config';

const grass = (row: number): GrassLane => ({kind:'grass', row, shade:0, blocked:Array(9).fill(false), obstacles:Array(9).fill(null), variant:Array(9).fill(0), edge:Array(12).fill(null)});
const open: LaneSource = {lane: grass};

describe('unbounded sideways movement', () => {
  it.each([-10000, -1, 0, 8, 9, 10000])('hops either way and advances from column %s', x => {
    const run = createRun(11); run.x = run.fromX = x;
    expect(hopTarget(run, 'left', open)).toEqual({row:0,x:x-1});
    expect(hopTarget(run, 'right', open)).toEqual({row:0,x:x+1});
    expect(input(run, 'up', open)).toBe('hop');
    step(run, HOP_TIME, open);
    expect(run).toMatchObject({row:1,x,phase:'running'});
  });

  it.each([-10000,10000])('round trips a save and a partial hop at x=%s', x => {
    const run = createRun(11); run.x = run.fromX = x;
    input(run, 'right', open); step(run, HOP_TIME / 2, open);
    const saved = restore(JSON.parse(JSON.stringify(serialize(run))));
    expect(saved).not.toBeNull();
    expect(pose(saved!)).toEqual(pose(run));
    step(saved!, HOP_TIME / 2, open);
    expect(saved).toMatchObject({x:x+1,phase:'running',hop:-1});
  });

  it.each([-1,1] as const)('rides a log beyond the old boundary in direction %s', dir => {
    const lane: RiverLane = {kind:'river',row:1,dir,speed:2,phase:0,cycle:8,movers:[{offset:0,len:4,color:0}]};
    const world: LaneSource = {lane: row => row === 1 ? lane : grass(row)};
    const run = createRun(11);
    Object.assign(run,{row:1,fromRow:1,maxRow:1,x:dir>0?9:1,fromX:dir>0?9:1,phase:'running',started:true});
    for(let i=0;i<120;i++) step(run,1/60,world);
    expect(run.phase).toBe('running');
    expect(run.x).toBeCloseTo(dir>0?13:-3,8);
    expect(platformAt(lane,run.x,run.t)).toBe(true);
    expect(hopTarget(run,'up',world)).toEqual({row:2,x:dir>0?13:-3});
  });

  it('follows far sideways without changing the target when the viewport changes', () => {
    for(const x of [-10000,-50,4,50,10000]) {
      expect(focusXTarget(x,4)).toBe(x);
      expect(focusXTarget(x,20)).toBe(x);
    }
  });
});

describe('hazards outside the original band', () => {
  it.each([-10000,10000])('renders the same log copies that support the player near %s', x => {
    const lane: RiverLane = {kind:'river',row:7,dir:-1,speed:1.3,phase:2,cycle:9,movers:[{offset:0,len:3,color:0},{offset:4,len:4,color:1}]};
    const copies: number[] = [];
    forEachMover(lane,5,x-10,x+10,(a,b)=>{copies.push(a,b);expect(platformAt(lane,(a+b)/2,5)).toBe(true);});
    expect(copies.length).toBeGreaterThan(4);
  });

  it.each([-1,1] as const)('a train and its warning translate with the observer, direction %s', dir => {
    const lane: RailLane = {kind:'rail',row:8,dir,speed:18,length:14,phase:2,period:9,color:0};
    // Moving by one spatial period must reproduce the entire train timeline.
    for (const x of [4-18*9*100,4,4+18*9*100]) {
      for(const t of [1,1.5,2,2.3,2.8,3.5,4,7,10.5]) {
        expect(trainHit(lane,x,t),`x=${x}, t=${t}`).toBe(trainHit(lane,4,t));
        expect(railWarning(lane,t,x),`warning x=${x}, t=${t}`).toBe(railWarning(lane,t,4));
      }
    }
  });
});

it('revisiting horizontal windows does not generate or retain extra lane rows', () => {
  const world = new World(11);world.ensure(40);
  const top = world.generatedTo, row = world.lane(1), run = createRun(11);
  for(let i=0;i<5000;i++) {run.x=i%2?i*100:-i*100;hopTarget(run,'up',world);}
  expect(world.generatedTo).toBe(top);
  expect(world.lane(1)).toBe(row);
});
