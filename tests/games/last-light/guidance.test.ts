import {describe,it,expect} from 'vitest';
import {LEVELS} from '../../../src/games/last-light/levels';
import {createRun,type Run} from '../../../src/games/last-light/model';
import {missionGuidance,routeIndex,targetBearing} from '../../../src/games/last-light/guidance';
import {DESTINATIONS} from '../../../src/games/last-light/story';

function atStage(stage:number):Run {
 const run=createRun();Object.assign(run,{stage,cleared:stage,...LEVELS[stage].spawn});return run;
}

describe('Last Light mission guidance',()=>{
 it('always points to the exit before any optional encounter',()=>{
  for(const level of LEVELS){
   const run=atStage(level.id),guidance=missionGuidance(run);
   expect(guidance.phase).toBe('exit');expect(guidance.action).toBe('Reach the exit');
   expect(guidance.target.id).toBeNull();expect(guidance.target.label).toContain(DESTINATIONS[level.id]);
   expect(guidance.target.x).toBeGreaterThanOrEqual(level.exit.x);
   expect(guidance.target.x).toBeLessThanOrEqual(level.exit.x+level.exit.w);
  }
 });
 it('never redirects the objective when optional encounters are completed out of order',()=>{
  for(const level of LEVELS){
   const run=atStage(level.id),original=missionGuidance(run).target;
   for(const station of [...level.stations].reverse()){
    run.activated.push(station.id);const guidance=missionGuidance(run);
    expect(guidance.action).toBe('Reach the exit');expect(guidance.target).toEqual(original);
    expect(guidance.completed).toBe(run.activated.length);
   }
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
 it('asks for a held jump rather than a short tap onto a raised narrow landing',()=>{
  const run=atStage(0);run.ground=0;
  const level={...LEVELS[0],mainCount:2,hazards:[],platforms:[
   {id:0,x:24,y:400,w:240,h:28,kind:'stone' as const},
   {id:1,x:330,y:344,w:96,h:28,kind:'stone' as const},
  ]};
  const hint=missionGuidance(run,level).hint;expect(hint).toMatch(/Hold Space/);expect(hint).not.toContain('short hop');
 });
 it('points to the finished destination after a restored clear even if old station state is absent',()=>{
  const level=LEVELS.find(l=>l.goal==='signal')!,run=atStage(level.id);run.phase='cleared';
  const guidance=missionGuidance(run);expect(guidance.phase).toBe('complete');expect(guidance.target.id).toBeNull();
  expect(guidance.action).toBe('Level complete');
 });
});
