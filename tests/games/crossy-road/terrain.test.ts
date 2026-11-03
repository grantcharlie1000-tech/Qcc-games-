import {expect,it} from 'vitest';
import {World} from '../../../src/games/crossy-road/world';
import {corridor,obstacleAt,obstacleVariant,lilyAt} from '../../../src/games/crossy-road/terrain';
import {forEachTrain,trainHit,trainPass,trainEntry} from '../../../src/games/crossy-road/lanes';
import type {RailLane} from '../../../src/games/crossy-road/config';

it('all grass clusters have reachable openings across negative and positive horizontal chunks',()=>{
  for(let seed=0;seed<100;seed++) {
    const world=new World(seed);let reachable=new Set<number>([4]);
    for(let row=0;row<400;row++) {
      const lane=world.lane(row), next=new Set<number>();
      if(lane.kind==='grass') {
        for(const x of reachable)if(!obstacleAt(lane,x))next.add(x);
        const queue=[...next];
        for(let i=0;i<queue.length;i++)for(const x of [queue[i]-1,queue[i]+1])
          if(x>=-32&&x<=40&&!next.has(x)&&!obstacleAt(lane,x)){next.add(x);queue.push(x);}
        for(let x=-32;x<=40;x++)if(corridor(seed,x))expect(obstacleAt(lane,x)).toBeNull();
      } else {
        for(let x=-32;x<=40;x++)if(lane.kind!=='lily'||lilyAt(lane,x))next.add(x);
      }
      expect(next.size,`seed ${seed}, row ${row}`).toBeGreaterThan(0);
      reachable=next;
    }
  }
});

it('return trips reconstruct trees and variants without retaining horizontal chunks',()=>{
  const world=new World(123), copy=new World(123);world.ensure(300);
  const lane=Array.from({length:300},(_,row)=>world.lane(row)).find(l=>l.kind==='grass'&&!l.clearing&&l.row>20)!;
  if(lane.kind!=='grass')throw new Error('missing grass fixture');
  const original=JSON.stringify(lane), top=world.generatedTo;
  const columns=[-10000,-1000,-9,-1,0,8,9,1000,10000];
  const first=columns.map(c=>[obstacleAt(lane,c),obstacleVariant(lane,c)]);
  for(let c=-5000;c<5000;c++)obstacleAt(lane,c);
  expect(columns.map(c=>[obstacleAt(lane,c),obstacleVariant(lane,c)])).toEqual(first);
  const other=copy.lane(lane.row);if(other.kind!=='grass')throw new Error('wrong replay kind');
  expect(columns.map(c=>[obstacleAt(other,c),obstacleVariant(other,c)])).toEqual(first);
  expect(JSON.stringify(lane)).toBe(original);expect(world.generatedTo).toBe(top);
});

it('a drifting observer keeps a stable train pass identifier while arrival time shifts',()=>{
  const lane:RailLane={kind:'rail',row:2,dir:1,speed:18,period:9,phase:2,length:14,color:0};
  const arrivals=new Set<number>(), passes=new Set<number>();
  for(let i=0;i<15;i++) {
    const t=2+i/60,x=4+i/60;
    arrivals.add(trainEntry(lane,t,x));passes.add(trainPass(lane,t,x));
  }
  expect(arrivals.size).toBe(15);expect([...passes]).toEqual([0]);
  expect(trainPass(lane,11,4)).toBe(1);
});

it('far-side train instances and collision agree for both directions',()=>{
  for(const dir of [-1,1] as const)for(const x of [-10000,10000]) {
    const lane:RailLane={kind:'rail',row:2,dir,speed:18,period:9,phase:2,length:14,color:0};
    let count=0;
    forEachTrain(lane,3,x-180,x+180,(lo,hi)=>{expect(trainHit(lane,(lo+hi)/2,3)).toBe(true);count++;});
    expect(count).toBeGreaterThanOrEqual(2);
  }
});
