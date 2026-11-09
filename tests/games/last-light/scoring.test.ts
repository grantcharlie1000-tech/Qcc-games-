import {describe,it,expect} from 'vitest';
import {normalizeLastLightScore} from '../../../src/core/last-light-score';
import {mergeSaves} from '../../../src/accounts/merge';
import {rankScore,restore,createRun,serialize} from '../../../src/games/last-light/model';
describe('readable Last Light scores',()=>{
 it('awards explainable points instead of a million-point sorting key',()=>{expect(rankScore(20,30,600000,4)).toBe(26700);expect(rankScore(1,3,10000,0)).toBe(1530);expect(rankScore(40,120,0,0)).toBe(62000);});
 it('migrates an old best without inventing bonuses or touching ordinary scores',()=>{expect(normalizeLastLightScore(20_600_000)).toBe(20000);expect(normalizeLastLightScore(26700)).toBe(26700);});
 it('does not let an old cloud best beat a better new score',()=>{const old={'best:last-light':{value:20_600_000,updated:9},'best:snake':{value:20_600_000,updated:9}},fresh={'best:last-light':{value:26700,updated:10}};expect(mergeSaves(old,fresh)['best:last-light'].value).toBe(26700);expect(mergeSaves(fresh,old)['best:last-light'].value).toBe(26700);expect(mergeSaves(old,{})['best:snake'].value).toBe(20_600_000);});
 it('restores legacy chapter progress with a converted score',()=>{const data={...serialize(createRun()),version:1,stage:20,cleared:20,time:600000,stageTime:0,sparks:30,best:20_600_000};const s=restore(data);expect(s?.stage).toBe(20);expect(s?.best).toBe(23000);});
});
it('preserves original spark IDs when migrating worlds with interleaved keys and dash crystals',()=>{
 const base=serialize(createRun());
 for(const [stage,collected,key,sparks,expected] of [[8,[0,1,2,3],true,3,[0,1,2]],[16,[0,1,2,3,4],true,3,[0,3,1,2]]] as const){
  const s=restore({...base,version:1,stage,cleared:stage,time:60000,collected:[...collected],key,sparks,best:stage*1_000_000+600000});
  expect(s).not.toBeNull();expect(s?.sparks).toBe(3);expect(s?.collected).toEqual(expected);expect(restore(serialize(s!))).not.toBeNull();
 }
});
it('banks each chapter independently so a later slow chapter cannot erase earned bonuses',async()=>{
 const {step,nextStage}=await import('../../../src/games/last-light/model');const {LEVELS}=await import('../../../src/games/last-light/levels');
 const s=createRun();s.time=10000;s.stageTime=10000;s.deaths=2;s.stageDeaths=2;s.x=LEVELS[0].exit.x;s.y=LEVELS[0].exit.y+24;
 step(s,{move:0,jump:false,dash:false});expect(s.best).toBe(1180);expect(nextStage(s)).toBe(true);expect(s.stageDeaths).toBe(0);
 s.stageTime=600000;s.time+=600000;s.activated=LEVELS[1].stations.map(p=>p.id);s.x=LEVELS[1].exit.x;s.y=LEVELS[1].exit.y+24;
 step(s,{move:0,jump:false,dash:false});expect(s.best).toBe(2180);expect(restore(serialize(s))?.best).toBe(2180);
});
