import {describe,it,expect} from 'vitest';
import {LEVELS} from '../../../src/games/last-light/levels';
import {createRun,respawn,step,STEP} from '../../../src/games/last-light/model';
import journeys from './journeys.json';

// Regenerate with: node tests/games/last-light/record-journeys.mjs [stage ids]

describe('Last Light continuous journeys',()=>{
 it('records one complete input witness for every chapter',()=>{
  expect(journeys.map(journey=>journey.stage)).toEqual(LEVELS.map(level=>level.id));
 });

 for(const level of LEVELS)it(`${level.id+1}: a continuous journey reaches the exit without a setback`,()=>{
  const witness=journeys.find(journey=>journey.stage===level.id)!;
  const run=createRun();run.stage=level.id;run.cleared=level.id;respawn(run,false);
  let frames=0,clearAt=-1,diedAt=-1;
  // Each block is [120 Hz frame count, input bits]. Bits 0–1 encode move+1,
  // then jump, dash and interact. Only the model moves the courier: no forced
  // positions, velocities, flags, interactions or cleared-state assignments.
  for(const [count,bits] of witness.blocks){
   expect(Number.isInteger(count)&&count>0).toBe(true);
   expect(bits>=0&&bits<32&&(bits&3)<3).toBe(true);
   const input={move:(bits&3)-1,jump:!!(bits&4),dash:!!(bits&8),interact:false};
   for(let frame=0;frame<count;frame++){
    const event=step(run,input);frames++;
    if(event.death&&diedAt<0)diedAt=frames;
    if(event.clear)clearAt=frames;
   }
  }
  expect(diedAt,'First death frame').toBe(-1);
  expect(run.stageDeaths).toBe(0);
  expect(run.activated).toEqual([]);
  expect(run.phase).toBe(level.id===LEVELS.length-1?'complete':'cleared');
  expect(clearAt,'The witness ends when the exit is reached; no padding after clear').toBe(frames);
  expect(run.stageTime/1000).toBeCloseTo(frames*STEP,5);
  // Duration prevents empty maps; the difficulty audit separately verifies
  // required control choices, so adding safe distance cannot satisfy it.
  expect(run.stageTime/1000,'Expert play must contain a complete journey').toBeGreaterThanOrEqual(level.id<8?8:10);
  expect(run.stageTime/1000,'A safe completion should not require a long timing wait').toBeLessThan(100);
 });

});
