import {it,expect} from 'vitest';
import {createRun,input,step,pose} from '../../../src/games/crossy-road/rules';
import {World} from '../../../src/games/crossy-road/world';
import {HOP_TIME,type PlayerPose,type StepEvents} from '../../../src/games/crossy-road/config';

it('writes the exact mid-hop pose into reusable frame storage',()=>{
  const run=createRun(1),world=new World(1);
  input(run,'up',world);step(run,HOP_TIME/2,world);
  const out:PlayerPose={x:0,z:0,lift:0,facing:'down',progress:0};
  expect(pose(run,out)).toBe(out);
  expect(out).toEqual({x:4,z:.5,lift:.5,facing:'up',progress:.5});
});

it('reuses step events while clearing a previous landing before the next tick',()=>{
  const run=createRun(1),world=new World(1);
  const events:StepEvents={landed:false,newMax:false,chime:false,died:null,over:false,ufoWarn:false};
  input(run,'up',world);
  expect(step(run,HOP_TIME,world,false,events)).toBe(events);
  expect(events.landed).toBe(true);
  expect(step(run,.01,world,false,events)).toBe(events);
  expect(events).toEqual({landed:false,newMax:false,chime:false,died:null,over:false,ufoWarn:false});
});
