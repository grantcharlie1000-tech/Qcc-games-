import {describe,it,expect} from 'vitest';
import {LEVELS,LEVEL_COUNT} from '../../../src/games/last-light/levels';
import {createRun,step,nextStage,respawn,serialize,restore,rankScore,platformAt,laserActive,PLAYER_H,type Run,type Input} from '../../../src/games/last-light/model';
const idle:Input={move:0,jump:false,dash:false};
function grounded(stage=0,platform=0):Run {
 const s=createRun();s.stage=stage;s.cleared=stage;const p=LEVELS[stage].platforms[platform],r=platformAt(p,0);
 Object.assign(s,{x:r.x+30,y:r.y-PLAYER_H,grounded:true,ground:p.id});return s;
}
const ticks=(s:Run,count:number,input=idle)=>{for(let i=0;i<count;i++)step(s,input);};

describe('Last Light physics and campaign',()=>{
 it('lands and never sinks into a solid platform',()=>{const s=createRun();ticks(s,240);expect(s.y).toBe(LEVELS[0].platforms[0].y-PLAYER_H);expect(s.grounded).toBe(true);expect(s.deaths).toBe(0);});
 it('has buffered, variable-height and coyote jumps',()=>{
  const held=grounded(),tapped=grounded();let topHeld=held.y,topTapped=tapped.y;
  for(let i=0;i<80;i++){step(held,{...idle,jump:true});step(tapped,{...idle,jump:i<5});topHeld=Math.min(topHeld,held.y);topTapped=Math.min(topTapped,tapped.y);}
  expect(topHeld).toBeLessThan(topTapped-20);
  const coyote=grounded();coyote.grounded=false;coyote.ground=-1;coyote.coyote=.06;step(coyote,{...idle,jump:true});expect(coyote.vy).toBeLessThan(-300);
  const buffered=grounded();buffered.grounded=false;buffered.ground=-1;buffered.y-=2;buffered.vy=100;step(buffered,{...idle,jump:true});ticks(buffered,5,{...idle,jump:true});expect(buffered.vy).toBeLessThan(-300);
 });
 it('allows one air dash, caps it, and refills it on landing',()=>{
  const s=grounded();step(s,{...idle,jump:true});step(s,{...idle,dash:true});expect(s.dashReady).toBe(false);expect(s.vx).toBe(560);
  ticks(s,20);step(s,{...idle,dash:true});expect(s.dashLeft).toBe(0);
  s.x=72;ticks(s,180);expect(s.grounded).toBe(true);expect(s.dashReady).toBe(true);
 });
 it('wall jumps away from the touched wall',()=>{const s=grounded();s.grounded=false;s.ground=-1;s.coyote=0;s.wall=1;step(s,{...idle,jump:true});expect(s.vx).toBeLessThan(-200);expect(s.vy).toBeLessThan(-300);});
 it('rides moving platforms and triggers springs and crumbles',()=>{
  const l=LEVELS.find(l=>l.platforms.some(p=>p.kind==='moving'&&p.axis!=='y'))!,p=l.platforms.find(p=>p.kind==='moving')!;const s=grounded(l.id,p.id),before=s.x;ticks(s,12);expect(s.ground).toBe(p.id);expect(s.x).not.toBe(before);
  const springLevel=LEVELS.find(l=>l.platforms.some(p=>p.kind==='spring'))!,springPlatform=springLevel.platforms.find(p=>p.kind==='spring')!,spring=grounded(springLevel.id,springPlatform.id);
  step(spring,idle);expect(spring.vy).toBeLessThan(-600);
  const crumbleLevel=LEVELS.find(l=>l.platforms.some(p=>p.kind==='crumble'))!,crumblePlatform=crumbleLevel.platforms.find(p=>p.kind==='crumble')!,crumble=grounded(crumbleLevel.id,crumblePlatform.id);
  step(crumble,idle);expect(crumble.crumbles[crumblePlatform.id]).toBeGreaterThan(0);ticks(crumble,120);expect(crumble.grounded).toBe(false);expect(crumble.y).toBeGreaterThan(crumblePlatform.y-PLAYER_H);
 });
 it('uses surface-specific friction and conveyor movement',()=>{
  const iceLevel=LEVELS.find(l=>l.platforms.some(p=>p.kind==='ice'))!,ice=grounded(iceLevel.id,iceLevel.platforms.find(p=>p.kind==='ice')!.id);
  ice.vx=200;const stone=grounded(0,1);stone.vx=200;ticks(ice,10);ticks(stone,10);expect(ice.vx).toBeGreaterThan(stone.vx+90);
  const beltLevel=LEVELS.find(l=>l.platforms.some(p=>p.kind==='belt'&&p.direction===1))!,belt=grounded(beltLevel.id,beltLevel.platforms.find(p=>p.kind==='belt'&&p.direction===1)!.id),before=belt.x;
  ticks(belt,10);expect(belt.x).toBeGreaterThan(before);
 });
 it('kills on hazards, preserves collectibles and respawns at the checkpoint',()=>{
  const s=grounded(2);s.checkpoint=true;s.sparks=1;s.collected=[0];s.y=LEVELS[2].height+100;step(s,idle);
  expect(s.deaths).toBe(1);expect(s.x).toBe(LEVELS[2].checkpoint.x);expect(s.y).toBe(LEVELS[2].checkpoint.y-PLAYER_H);expect(s.sparks).toBe(1);expect(s.collected).toEqual([0]);
  const hazard=LEVELS[2].hazards[0],spiked=grounded(2);spiked.x=hazard.x;spiked.y=hazard.y-12;step(spiked,idle);expect(spiked.deaths).toBe(1);
 });
 it('collects memories once and clears without optional encounters',()=>{
  const s=grounded(8),l=LEVELS[8],spark=l.pickups.find(p=>p.kind==='spark')!;
  s.x=spark.x-8;s.y=spark.y-12;step(s,idle);expect(s.sparks).toBe(1);step(s,idle);expect(s.sparks).toBe(1);expect(s.memories).toEqual([24]);
  s.x=l.exit.x;s.y=l.exit.y+25;s.vx=0;s.vy=0;expect(step(s,idle).clear).toBe(true);expect(s.phase).toBe('cleared');
 });
 it('never skips a stage and completes exactly at stage 40',()=>{
  const s=createRun();expect(nextStage(s)).toBe(false);
  for(let stage=0;stage<LEVEL_COUNT;stage++){
   expect(s.stage).toBe(stage);const l=LEVELS[stage];s.x=l.exit.x;s.y=l.exit.y+25;
   expect(step(s,idle).clear,`stage ${stage+1}`).toBe(true);expect(s.cleared).toBe(stage+1);
   const elapsed=s.time;step(s,{move:1,jump:true,dash:true});expect(s.time).toBe(elapsed);
   expect(nextStage(s)).toBe(stage<LEVEL_COUNT-1);
  }
  expect(s.phase).toBe('complete');expect(s.best).toBeGreaterThan(40_000);
 });
 it('gives escape chapters escalating pressure while preserving a safe opening and checkpoint reset',()=>{
  const escapes=LEVELS.filter(l=>l.goal==='escape'),pressures=escapes.map(l=>l.pressure!);expect(pressures).toHaveLength(5);expect(pressures.every((n,i)=>n>=70&&(i===0||n>pressures[i-1]))).toBe(true);
  const s=grounded(4);ticks(s,1200);expect(s.deaths).toBe(0);expect(s.chasing).toBe(false);
  const before=s.threat;s.x=LEVELS[4].spawn.x+130;step(s,idle);expect(s.chasing).toBe(true);expect(s.threat-before).toBeCloseTo(LEVELS[4].pressure!/120,6);
  respawn(s);expect(s.chasing).toBe(false);expect(s.threat).toBe(s.x-300);
 });
 it('cycles lasers predictably without relying on visual animation',()=>{const laser=LEVELS.flatMap(l=>l.hazards).find(h=>h.kind==='laser')!;expect(laserActive(laser,-(laser.offset??0))).toBe(true);expect(laserActive(laser,2-(laser.offset??0))).toBe(false);});
 it('ranks stage progress first and rewards sparks, speed, and fewer deaths',()=>{
  expect(rankScore(2,0,31_536_000_000,1e7)).toBeGreaterThan(rankScore(1,120,0,0));
  expect(rankScore(10,2,40000,2)).toBeGreaterThan(rankScore(10,1,40000,2));
  expect(rankScore(10,2,30000,2)).toBeGreaterThan(rankScore(10,2,40000,2));
  expect(rankScore(10,2,40000,1)).toBeGreaterThan(rankScore(10,2,40000,2));expect(rankScore(0,3,0,0)).toBe(0);
 });
 it('round-trips real progress and restarts on a safe checkpoint',()=>{
  const s=grounded(9);s.checkpoint=true;s.time=20000;s.stageTime=2000;s.deaths=4;s.best=9600;s.x=900;
  const data=serialize(s),restored=restore(JSON.parse(JSON.stringify(data)))!;
  expect(restored).not.toBeNull();expect(restored.stage).toBe(9);expect(restored.deaths).toBe(4);expect(restored.x).toBe(LEVELS[9].checkpoint.x);expect(restored.time).toBe(20000);
  s.phase='cleared';s.cleared=10;expect(restore(serialize(s))?.phase).toBe('cleared');
 });
 it('rejects corrupt, inconsistent, oversized and impossible saves',()=>{
  const valid=serialize(createRun());
  for(const bad of [null,{}, {...valid,stage:40},{...valid,stage:1.5},{...valid,cleared:20},{...valid,time:NaN},{...valid,time:-1},{...valid,deaths:Infinity},{...valid,sparks:100},{...valid,collected:[999]},{...valid,collected:[0,0]},{...valid,key:true},{...valid,phase:'complete'},{...valid,checkpoint:'yes'},{...valid,best:2147483647}])expect(restore(bad)).toBeNull();
 });
});
