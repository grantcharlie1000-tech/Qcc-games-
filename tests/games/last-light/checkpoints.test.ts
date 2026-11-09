import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {LEVELS,type Level} from '../../../src/games/last-light/levels';
import {checkpointFor,createRun,hazardActive,hazardWarning,laserActive,restore,serialize,step,type Run} from '../../../src/games/last-light/model';

const levels=LEVELS as Level[],original=LEVELS[0],idle={move:0,jump:false,dash:false};
beforeEach(()=>{
 const platforms=[0,1,2].map(id=>({id,x:24+id*300,y:400,w:240,h:28,kind:'stone' as const}));
 const checkpoints=[{x:344,y:400,platform:1},{x:644,y:400,platform:2}];
 levels[0]={...original,platforms,mainCount:3,stations:[],hazards:[],pickups:[],goal:'engine',width:1400,height:650,spawn:{x:72,y:376},checkpoint:checkpoints[0],checkpoints,exit:{x:1100,y:344,w:38,h:56},water:null};
});
afterEach(()=>{levels[0]=original;});
function stand(s:Run,id:number){const p=LEVELS[0].platforms[id];Object.assign(s,{x:p.x+40,y:p.y-24,vx:0,vy:0,grounded:true,ground:id,respawn:0});}

describe('longer chapter progress',()=>{
 it('retries at the latest flag and never rolls back when a prior flag is revisited',()=>{
  const s=createRun();stand(s,1);expect(step(s,idle).checkpoint).toBe(true);expect(s.checkpointIndex).toBe(0);
  stand(s,2);expect(step(s,idle).checkpoint).toBe(true);expect(s.checkpointIndex).toBe(1);
  stand(s,1);expect(step(s,idle).checkpoint).not.toBe(true);expect(s.checkpointIndex).toBe(1);
  s.y=800;expect(step(s,idle).death).toBe(true);expect(s.x).toBe(644);expect(s.y).toBe(376);
 });
 it('round-trips the latest safe flag and migrates older one-flag saves',()=>{
  const s=createRun();stand(s,2);step(s,idle);const saved=serialize(s),loaded=restore(saved)!;
  expect(loaded.checkpointIndex).toBe(1);expect(loaded.x).toBe(644);expect(checkpointFor(loaded)?.platform).toBe(2);
  const old={...saved};delete old.checkpointIndex;expect(restore(old)?.x).toBe(344);
  expect(restore({...saved,checkpointIndex:99})).toBeNull();expect(restore({...saved,checkpoint:false,checkpointIndex:1})).toBeNull();
 });
 it('turning an intake wheel shuts down its linked vent and persists through retries',()=>{
  const level=LEVELS[0],vent={kind:'steam' as const,x:500,y:328,w:20,h:72,period:3,offset:0,disabledBy:0};
  level.hazards=[vent];level.stations=[{id:0,platform:1,x:390,y:400,kind:'valve',label:'Intake wheel'}];
  const s=createRun();stand(s,1);expect(hazardActive(vent,s)).toBe(true);
  s.x=382;expect(step(s,{...idle,interact:true}).interact).toBe(true);expect(hazardActive(vent,s)).toBe(false);
  const loaded=restore(serialize(s))!;expect(loaded.activated).toEqual([0]);expect(hazardActive(vent,loaded)).toBe(false);
  Object.assign(loaded,{x:500,y:350});expect(step(loaded,idle).death).not.toBe(true);
 });
 it('keeps earlier preview progress when a hidden escape lamp is removed',()=>{
  levels[0]={...levels[0],goal:'escape',stations:[]};
  const saved={...serialize(createRun()),checkpoint:true,activated:[0]};delete saved.layoutVersion;delete saved.checkpointIndex;
  const loaded=restore(saved);expect(loaded).not.toBeNull();expect(loaded?.checkpoint).toBe(true);expect(loaded?.activated).toEqual([]);expect(loaded?.x).toBe(344);
  expect(restore({...saved,layoutVersion:2})).toBeNull();
 });
 it('uses the authored collapse warning and gate crossing window',()=>{
  LEVELS[0].platforms[1].kind='crumble';LEVELS[0].platforms[1].crumbleDelay=.5;
  const s=createRun();stand(s,1);step(s,idle);expect(s.crumbles[1]).toBe(.5);
  for(let frame=0;frame<62;frame++)step(s,idle);
  expect(s.crumbles[1]).toBeLessThan(0);expect(s.ground).not.toBe(1);
  const gate={kind:'laser' as const,x:0,y:0,w:18,h:140,period:2,duty:.75};
  expect(laserActive(gate,1.4)).toBe(true);expect(laserActive(gate,1.6)).toBe(false);
  expect(laserActive({...gate,duty:undefined},1.4)).toBe(false);
  s.clock=1.8;expect(hazardWarning(gate,s)).toBe(true);expect(hazardActive(gate,s)).toBe(false);
  s.clock=2;expect(hazardWarning(gate,s)).toBe(false);expect(hazardActive(gate,s)).toBe(true);
  s.activated=[0];expect(hazardWarning({...gate,disabledBy:0},s)).toBe(false);
 });
 it('keeps the dark following when it falls far behind without teleporting',()=>{
  const level=LEVELS[0];Object.assign(level,{goal:'escape',pressure:100,width:4000,platforms:[{id:0,x:0,y:400,w:4000,h:28,kind:'stone'}],checkpoints:[],checkpoint:{x:3000,y:400,platform:0},exit:{x:3900,y:344,w:38,h:56}});
  const near=createRun(),far=createRun();for(const s of [near,far])Object.assign(s,{x:1000,y:376,ground:0,grounded:true,chasing:true});
  near.threat=600;far.threat=-400;const beforeNear=near.threat,beforeFar=far.threat;
  step(near,idle);step(far,idle);
  expect(far.threat-beforeFar).toBeGreaterThan((near.threat-beforeNear)*2);
  expect(far.threat-beforeFar).toBeLessThan(4);expect(far.deaths).toBe(0);
  near.threat=near.x+8;let caught=false;for(let i=0;i<120;i++)if(step(near,idle).death){caught=true;break;}
  expect(caught,'stopping near the wall is still fatal').toBe(true);
 });
});
