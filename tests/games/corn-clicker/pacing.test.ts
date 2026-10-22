import {describe,expect,test} from 'vitest';
import {simulate} from './sim';
import {PERMS} from '../../../src/games/corn-clicker/data';

// Economy tuning targets from the brief, checked with a simple greedy player bot.
describe('pacing',()=>{
  test('a casual clicker affords the first producer well within a minute',()=>{
    // One click every two seconds affords a Farmhand inside a minute; the greedy bot owns one within two.
    let affordable=-1;
    simulate({seconds:60,clicksPerSecond:0.5,log:(t,g)=>{if(affordable<0&&(g.s.kernels.gte(g.unitPrice('farmhand',0))||g.totalOwned()>0))affordable=t;}});
    expect(affordable).toBeGreaterThan(0);expect(affordable).toBeLessThanOrEqual(60);
    expect(simulate({seconds:180,clicksPerSecond:2}).firstProducer).toBeLessThanOrEqual(120);
  });
  test('active play: frequent purchases, garden and a worthwhile first Replant in 1–3 hours, then a faster second run',()=>{
    const earned:number[]=[];
    const run=simulate({seconds:3*3600,clicksPerSecond:6,golden:true,log:(t,g)=>{if(t===3600)earned.push(g.s.run.earned.log10());}});
    const within=(a:number,b:number)=>run.purchases.filter(t=>t>a&&t<=b).length;
    expect(within(0,300)).toBeGreaterThanOrEqual(15);
    for(let m=5;m<30;m+=5)expect(within(m*60,(m+5)*60)).toBeGreaterThanOrEqual(5);
    expect(run.firstGarden).toBeGreaterThan(0);expect(run.firstGarden).toBeLessThan(3600);
    expect(run.seedTimes[1]).toBeGreaterThan(1800);
    expect(run.seedTimes[5]).toBeLessThan(2*3600);
    expect(run.seedTimes[10]).toBeLessThan(3*3600);
    const g=run.game;
    expect(g.replant()).toBeGreaterThanOrEqual(10);
    for(const p of [...PERMS].sort((a,b)=>a.cost-b.cost))g.buyPerm(p.id);
    simulate({seconds:3600,clicksPerSecond:6,golden:true,game:g,log:(t,game)=>{if(t===3600)earned.push(game.s.run.earned.log10());}});
    // At least 3× more after an hour of the second run.
    expect(earned[1]-earned[0]).toBeGreaterThan(Math.log10(3));
  },120000);
  test('idle play with occasional clicks still reaches a first Golden Seed within three hours',()=>{
    const run=simulate({seconds:3*3600,clicksPerSecond:0.3});
    expect(run.seedTimes[1]).toBeLessThan(3*3600);
  },120000);
});
