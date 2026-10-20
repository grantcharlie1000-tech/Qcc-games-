import {describe,it,expect} from 'vitest';
import {createState,start,enqueue,advance,restoreState,HEAD_RADIUS,FOOD_RADIUS} from '../../../src/games/snake/model';
import {createPresentation,advancePresentation,projectSnake,restorePresentation,savePresentation} from '../../../src/games/snake/presentation';
describe('Snake authoritative continuous presentation',()=>{
 it('uses exactly the moving model path in both motion policies, retaining orthogonal corners',()=>{const s=createState();start(s);enqueue(s,'up');advance(s,240);const v=createPresentation(s);expect(projectSnake(s,v).head).toEqual({x:6,y:5.5});for(const reduced of [false,true]){const p=projectSnake(s,v,reduced);expect(p.path).toEqual(s.body);for(let i=1;i<p.path.length;i++)expect(p.path[i].x===p.path[i-1].x||p.path[i].y===p.path[i-1].y).toBe(true);}});
 it('reports contacts and effect ages even when no junction tick was crossed',()=>{const s=createState();start(s);s.food={x:6,y:6};const v=createPresentation(s);advancePresentation(s,v,110);expect(s.ticks).toBe(0);expect(s.score).toBe(10);expect(savePresentation(v).eatAge).toBeCloseTo(110-(1-HEAD_RADIUS-FOOD_RADIUS)*160);expect(projectSnake(s,v).head).toEqual(s.body[0]);});
 it('freezes fractional position/effects when no active time is delivered and restores v2 effects',()=>{const s=createState();start(s);s.food={x:6,y:6};const v=createPresentation(s);advancePresentation(s,v,110);const saved=savePresentation(v),pose=projectSnake(s,v);for(let i=0;i<20;i++){expect(savePresentation(v)).toEqual(saved);expect(projectSnake(s,v)).toEqual(pose);}expect(savePresentation(restorePresentation(s,null))).toEqual(saved);});
 it('accepts legacy optional effects without using old interpolation history as position',()=>{const s=createState();s.migration={elapsed:93,held:true};s.phase='running';const v=restorePresentation(s,{previous:[{x:99,y:99}],grew:true,foodAge:80,eatAge:30,eaten:{x:6,y:6}},true);expect(projectSnake(s,v).path).toEqual(s.body);expect(savePresentation(v)).toEqual({foodAge:80,eatAge:30,eaten:{x:6,y:6}});});
 it.each(['running','lost'] as const)('keeps v2 time-zero %s model effects exact instead of reimporting optional presenter metadata',phase=>{
  for(const metadata of [undefined,{foodAge:80,eatAge:30,eaten:{x:6,y:6}},{foodAge:200,eatAge:200,eaten:{x:6,y:6}}]){
   const raw={...createState(),version:1,phase,body:phase==='lost'?[{x:5,y:0},{x:4,y:0},{x:3,y:0}]:createState().body,direction:'up',elapsed:0};
   const s=restoreState(raw)!,view=restorePresentation(s,metadata,true),snapshot=JSON.parse(JSON.stringify(s));
   for(const presenter of [savePresentation(view),{foodAge:0,eatAge:0,eaten:{x:0,y:0}}]){
    const restored=restoreState(snapshot)!,restoredView=restorePresentation(restored,presenter);
    expect(restored).toEqual(snapshot);expect(restoredView).toEqual(view);expect(savePresentation(restoredView)).toEqual(savePresentation(view));expect(projectSnake(restored,restoredView)).toEqual(projectSnake(s,view));
   }
  }
 });
 it('round-trips migrated legacy active/expired effect ages through a v2 save',()=>{const old={...createState(),version:1,elapsed:93,phase:'running'};const s=restoreState(old)!;const view=restorePresentation(s,{foodAge:200,eatAge:30,eaten:{x:6,y:6}},true);const restored=restoreState(JSON.parse(JSON.stringify(s)));expect(restored).toEqual(s);expect(savePresentation(createPresentation(restored!))).toEqual(savePresentation(view));});
});
