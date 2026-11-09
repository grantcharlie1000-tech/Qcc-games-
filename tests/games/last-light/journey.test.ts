import {describe,it,expect} from 'vitest';
import {LEVELS,type Level} from '../../../src/games/last-light/levels';
import {PLAYER_W,createRun,respawn,step,STEP,missionReady} from '../../../src/games/last-light/model';
import journeys from './journeys.json';

// Regenerate with: node tests/games/last-light/record-journeys.mjs [stage ids]

/** A deliberately generous speedrun bound: ignore every wall, fall and hazard,
 * allow an instant dash at every step, and allow interactions anywhere within
 * their full horizontal reach. Even this impossible courier must travel the
 * mission's length; a return door beside spawn cannot hide a five-second map.
 * Searching interval endpoints finds the shortest order through all fixtures,
 * so this does not assume the authored platform order or forbid shortcuts. */
function minimumMissionTravel(level:Level):number {
 const ranges=level.stations.map(station=>{
  const support=level.platforms[station.platform];
  const travel=support.kind==='moving'&&support.axis!=='y'?support.travel??0:0;
  return [station.x-8-48-travel,station.x-8+48+travel] as const;
 });
 const exit=[level.exit.x-PLAYER_W,level.exit.x+level.exit.w] as const;
 const points=[...new Set([level.spawn.x,...ranges.flat(),...exit])];
 const visited=(x:number)=>ranges.reduce((mask,[lo,hi],id)=>x>=lo&&x<=hi?mask|(1<<id):mask,0);
 const all=(1<<ranges.length)-1;
 const distances=new Map<string,number>();
 const queue=[{at:0,mask:visited(points[0]),distance:0}];
 while(queue.length){
  queue.sort((a,b)=>a.distance-b.distance);
  const current=queue.shift()!,key=`${current.at}:${current.mask}`;
  if(current.distance>(distances.get(key)??Infinity))continue;
  const x=points[current.at];
  if(current.mask===all&&x>=exit[0]&&x<=exit[1])return current.distance;
  for(let at=0;at<points.length;at++){
   const mask=current.mask|visited(points[at]),distance=current.distance+Math.abs(points[at]-x),next=`${at}:${mask}`;
   if(distance<(distances.get(next)??Infinity)){distances.set(next,distance);queue.push({at,mask,distance});}
  }
 }
 return Infinity;
}

describe('Last Light continuous journeys',()=>{
 it('records one complete input witness for every chapter',()=>{
  expect(journeys.map(journey=>journey.stage)).toEqual(LEVELS.map(level=>level.id));
 });

 for(const level of LEVELS)it(`${level.id+1}: a continuous journey completes every objective without a setback`,()=>{
  const witness=journeys.find(journey=>journey.stage===level.id)!;
  const run=createRun();run.stage=level.id;run.cleared=level.id;respawn(run,false);
  let frames=0,clearAt=-1,diedAt=-1;
  // Each block is [120 Hz frame count, input bits]. Bits 0–1 encode move+1,
  // then jump, dash and interact. Only the model moves the courier: no forced
  // positions, velocities, flags, interactions or cleared-state assignments.
  for(const [count,bits] of witness.blocks){
   expect(Number.isInteger(count)&&count>0).toBe(true);
   expect(bits>=0&&bits<32&&(bits&3)<3).toBe(true);
   const input={move:(bits&3)-1,jump:!!(bits&4),dash:!!(bits&8),interact:!!(bits&16)};
   for(let frame=0;frame<count;frame++){
    const event=step(run,input);frames++;
    if(event.death&&diedAt<0)diedAt=frames;
    if(event.clear)clearAt=frames;
   }
  }
  expect(diedAt,'First death frame').toBe(-1);
  expect(run.stageDeaths).toBe(0);
  expect(missionReady(run)).toBe(true);
  expect(run.phase).toBe(level.id===LEVELS.length-1?'complete':'cleared');
  expect(clearAt,'The witness ends when the exit is reached; no padding after clear').toBe(frames);
  expect(run.stageTime/1000).toBeCloseTo(frames*STEP,5);
  expect(run.stageTime/1000,'Expert play must contain a substantial journey').toBeGreaterThanOrEqual(level.id<8?12:16);
  expect(run.stageTime/1000,'A safe completion should not require a long timing wait').toBeLessThan(100);
 });

 // A horizontal bound deliberately ignores climbing. Tower switchbacks use
 // continuous replay; their route graph is also audited for shorter routes.
 for(const level of LEVELS.filter(level=>level.setting!=='tower'))it(`${level.id+1}: its mission cannot collapse into a five-second shortcut`,()=>{
  // 560 is the dash velocity; belts can add 85 and horizontal shuttles can
  // carry the courier. This upper bound is intentionally more generous than
  // any sustained movement available to a player.
  const fastest=560+Math.max(85,...level.platforms.filter(p=>p.kind==='moving'&&p.axis!=='y').map(p=>Math.abs((p.travel??0)*(p.speed??1))));
  expect(minimumMissionTravel(level)/fastest,'Seconds needed even with constant maximum speed and no obstacles').toBeGreaterThanOrEqual(6);
 });
});
