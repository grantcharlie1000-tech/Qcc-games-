import {expect,test} from 'vitest';
import {AutoQuality,defaultTier,hostRates,HostGuard} from '../../../src/games/strongroom/quality';

test('weak touch hardware and old GPUs start within their rendering budget',()=>{
 expect(defaultTier({touch:true,cores:4,memory:8,ua:''})).toBe('potato');
 expect(defaultTier({touch:true,cores:8,memory:8,ua:''})).toBe('low');
 expect(defaultTier({touch:false,cores:8,ua:'CrOS'})).toBe('low');
 expect(defaultTier({touch:false,cores:8,ua:'Linux',gpu:'Mali-G72'})).toBe('potato');
 expect(defaultTier({touch:false,cores:8,ua:'Linux'})).toBe('medium');
});
test('slow frames lower resolution with a four second rate limit and queue tier changes until a round boundary',()=>{
 const q=new AutoQuality('low',false,false);
 for(let t=0;t<=4000;t+=50)q.sample(50,t,false);
 expect(q.scale).toBeCloseTo(.65);expect(q.tier).toBe('low');
 for(let t=4050;t<=8000;t+=50)q.sample(50,t,false);
 expect(q.scale).toBeCloseTo(.55);
 for(let t=8050;t<=16000;t+=50)q.sample(50,t,false);
 expect(q.scale).toBe(.5);expect(q.tier).toBe('low');
 q.roundEnd();expect(q.tier).toBe('potato');
});
test('manual quality never drops tiers and hidden frames do not feed the controller',()=>{
 const q=new AutoQuality('high',true,false);
 for(let t=0;t<=60000;t+=100)q.sample(150,t,true);
 expect(q.scale).toBe(1);
 for(let t=60100;t<=120000;t+=50)q.sample(80,t,false);
 q.roundEnd();expect(q.tier).toBe('high');expect(q.scale).toBe(.5);
});
test('sustained fast frames restore resolution without auto raising a tier',()=>{
 const q=new AutoQuality('potato',false,true);q.scale=.5;
 for(let t=0;t<=12000;t+=16)q.sample(16,t,false);
 expect(q.scale).toBe(.6);expect(q.tier).toBe('potato');
});
test('host guard cuts AI before animation and low devices cannot offer 5v5',()=>{
 const guard=new HostGuard(10);
 for(let t=0;t<5100;t+=100)guard.sample(8,t);
 expect(guard.thinkHz).toBe(5);
 for(let t=5100;t<10500;t+=100)guard.sample(8,t);
 expect(guard.farAnimationHz).toBe(10);
 expect(hostRates('medium',true)).toEqual({tickHz:60,snapshotHz:20,maxTeam:5});
 expect(hostRates('medium',false)).toEqual({tickHz:30,snapshotHz:20,maxTeam:3});
 expect(hostRates('potato',true)).toEqual({tickHz:30,snapshotHz:15,maxTeam:3});
});
