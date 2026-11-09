import {describe,it,expect} from 'vitest';
import {LEVELS} from '../../../src/games/last-light/levels';
import {createRun,type Run} from '../../../src/games/last-light/model';
import {missionGuidance,routeIndex,targetBearing} from '../../../src/games/last-light/guidance';
import {DESTINATIONS,rescueNameFor} from '../../../src/games/last-light/story';

function atStage(stage:number):Run {
 const run=createRun();Object.assign(run,{stage,cleared:stage,...LEVELS[stage].spawn});return run;
}

describe('Last Light mission guidance',()=>{
 it('names the destination from the beginning in shelter and escape chapters',()=>{
  for(const level of LEVELS.filter(l=>l.goal==='shelter'||l.goal==='escape')){
   const guidance=missionGuidance(atStage(level.id));
   expect(guidance.phase,level.name).toBe('exit');
   expect(guidance.action).toContain(DESTINATIONS[level.id]);
   expect(guidance.total).toBe(0);expect(guidance.target.id).toBeNull();
  }
 });
 it('replaces the final mechanism task with an explicit exit objective in every chapter',()=>{
  expect(DESTINATIONS).toHaveLength(LEVELS.length);
  for(const level of LEVELS){
   const run=atStage(level.id);run.activated=level.stations.map(s=>s.id);
   const guidance=missionGuidance(run);
   expect(guidance.phase,level.name).toBe('exit');expect(guidance.action).toContain(DESTINATIONS[level.id]);
   expect(guidance.target.x).toBeGreaterThanOrEqual(level.exit.x);
   expect(guidance.target.x).toBeLessThanOrEqual(level.exit.x+level.exit.w);
   expect(guidance.target.id).toBeNull();
  }
 });
 it('keeps numbering consistent when lights are activated out of order',()=>{
  const level=LEVELS.find(l=>l.goal==='relay')!,run=atStage(level.id);
  run.activated=[level.stations[2].id];
  const first=missionGuidance(run);expect(first.completed).toBe(1);expect(first.total).toBe(3);
  expect(first.target.id).toBe(level.stations[0].id);expect(first.action).toContain('Light 1/3');
  run.activated.push(level.stations[0].id);
  const second=missionGuidance(run);expect(second.target.id).toBe(level.stations[1].id);expect(second.action).toContain('Light 2/3');
  run.activated.push(level.stations[1].id);
  expect(missionGuidance(run).action).toContain('All 3 lights lit');
 });
 it('changes a rescue from finding the named person to leading them to safety',()=>{
  const level=LEVELS.find(l=>l.goal==='rescue')!,run=atStage(level.id);
  expect(missionGuidance(run).action).toBe(`Help · ${rescueNameFor(level.id)}`);
  run.activated=[level.stations[0].id];
  expect(missionGuidance(run).action).toBe(`Lead ${rescueNameFor(level.id)} to ${DESTINATIONS[level.id]}`);
 });
 it('reports opened wheels and the named boarding destination after a bell',()=>{
  for(const goal of ['engine','ferry'] as const){
   const level=LEVELS.find(l=>l.goal===goal)!,run=atStage(level.id);run.activated=level.stations.map(s=>s.id);
   expect(missionGuidance(run).action).toContain(goal==='engine'?'Both wheels open':'Bell rung · Board');
  }
 });
 it('follows travel order through a tower that turns left instead of using x as progress',()=>{
  const level=LEVELS.find(l=>l.setting==='tower'&&l.platforms.slice(0,l.mainCount).some((p,i,all)=>i>0&&p.x<all[i-1].x))!,run=atStage(level.id);
  const index=level.mainCount-1,p=level.platforms[index];Object.assign(run,{ground:index,x:p.x,y:p.y-24});
  expect(routeIndex(run,level)).toBe(index);expect(missionGuidance(run).routeProgress).toBe(1);
  expect(missionGuidance(run).sector.index).toBe(level.sectors!.length-1);
 });
 it('teaches the air dash before the first wide gap and warns about the next crumble',()=>{
  const run=atStage(0),level=LEVELS[0];run.ground=4;
  expect(missionGuidance(run).hint).toMatch(/hold Space.*press X/);
  const crumble=level.platforms.slice(0,level.mainCount).findIndex(p=>p.kind==='crumble');run.ground=crumble-1;
  expect(missionGuidance(run).hint).toContain('Cracked landing ahead');
 });
 it('reports a compass bearing in all directions independently from the route',()=>{
  expect(targetBearing({x:0,y:0},{x:108,y:12})).toEqual({arrow:'→',distance:10,label:'right, 10 metres away'});
  expect(targetBearing({x:0,y:0},{x:8,y:-88}).arrow).toBe('↑');
  expect(targetBearing({x:0,y:0},{x:-92,y:112}).arrow).toBe('↙');
 });
 it('points to the finished destination after a restored clear even if old station state is absent',()=>{
  const level=LEVELS.find(l=>l.goal==='signal')!,run=atStage(level.id);run.phase='cleared';
  const guidance=missionGuidance(run);expect(guidance.phase).toBe('complete');expect(guidance.target.id).toBeNull();
  expect(guidance.action).toBe(`Reached ${DESTINATIONS[level.id]}`);
 });
});
