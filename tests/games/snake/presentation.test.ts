import {describe,expect,it} from 'vitest';
import {advance,createState,enqueue,restoreState,TICK_MS,type SnakeState} from '../../../src/games/snake/model';
import {advancePresentation,createPresentation,projectSnake,restorePresentation,savePresentation} from '../../../src/games/snake/presentation';
const running=():SnakeState=>({...createState(7),phase:'running'});
const length=(path:{x:number;y:number}[])=>path.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p.x-path[i].x,p.y-path[i].y),0);
function orthogonal(path:{x:number;y:number}[]){for(let i=1;i<path.length;i++)expect(path[i].x===path[i-1].x||path[i].y===path[i-1].y).toBe(true);}

describe('Snake committed-path presentation',()=>{
 it('keeps every displayed cell authoritative before and on a queued-turn consuming tick',()=>{
  const s=running(),v=createPresentation();
  const original=structuredClone(s.body);advancePresentation(s,v,159);
  expect(projectSnake(s,v).path).toEqual(original);expect(s.ticks).toBe(0);
  expect(enqueue(s,'left')).toBe(false);expect(enqueue(s,'up')).toBe(true);expect(enqueue(s,'down')).toBe(false);
  advancePresentation(s,v,1);expect(s.direction).toBe('up');expect(s.ticks).toBe(1);
  const committed=projectSnake(s,v);expect(committed.path).toEqual(s.body);expect(committed.head).toEqual({x:5,y:5});
  expect(committed.tangent).toEqual({x:0,y:-1});expect(committed.progress).toBe(1);
  advancePresentation(s,v,80);expect(projectSnake(s,v)).toEqual(committed);
 });
 it('shows each consecutive buffered turn on its consuming tick without intermediate or diagonal displacement',()=>{
  const s=running(),v=createPresentation();enqueue(s,'up');enqueue(s,'left');
  for(let i=0;i<60;i++){
   advancePresentation(s,v,8);const p=projectSnake(s,v);orthogonal(p.path);
   expect(p.path).toEqual(s.body);expect(length(p.path)).toBeCloseTo(s.body.length-1,8);
   expect(p.head).toEqual({x:5-Math.max(0,s.ticks-1),y:s.ticks===0?6:5});
  }
  expect(s.direction).toBe('left');expect(s.queue).toEqual([]);
 });
 it('is equivalent under 30/60/120 Hz and a dropped frame, displaying the final authoritative grid',()=>{
  const seeds=[30,60,120];
  const result=seeds.map(hz=>{const s=running(),v=createPresentation();enqueue(s,'up');enqueue(s,'left');for(let n=0;n<hz*.4;n++)advancePresentation(s,v,1000/hz);return {s,v};});
  const s=running(),v=createPresentation();enqueue(s,'up');enqueue(s,'left');advancePresentation(s,v,400);
  for(const r of result){expect(r.s.body).toEqual(s.body);expect(r.s.ticks).toBe(s.ticks);expect(r.s.elapsed).toBeCloseTo(s.elapsed,8);expect(projectSnake(r.s,r.v).head.x).toBeCloseTo(projectSnake(s,v).head.x,8);expect(r.v.previous).toEqual(v.previous);}
  expect(projectSnake(s,v).head).toEqual({x:4,y:5});expect(projectSnake(s,v).path).toEqual(s.body);
 });
 it('matches the unchanged model across mixed frame gaps, food, buffered turns and wall collision',()=>{
  const s=running(),reference=running(),v=createPresentation();
  for(const gap of [13,88,401,0,19,1100,800]){advancePresentation(s,v,gap);advance(reference,gap);expect(s).toEqual(reference);}
  expect(s.phase).toBe('lost');expect(v.previous).toBeNull();
  expect(projectSnake(s,v).path).toEqual(s.body);
 });
 it.each([
  {name:'wall',body:[{x:5,y:0},{x:4,y:0},{x:3,y:0}]},
  {name:'body',body:[{x:5,y:5},{x:4,y:5},{x:4,y:4},{x:5,y:4},{x:6,y:4}]},
 ])('faces the consumed fatal perpendicular $name turn while preserving the last valid body',({body})=>{
  const s=running(),v=createPresentation();s.body=body;s.score=(body.length-3)*10;
  expect(restoreState(s)).toEqual(s);expect(enqueue(s,'up')).toBe(true);
  const reference=restoreState(s)!;advance(reference,TICK_MS);advancePresentation(s,v,TICK_MS);
  expect(s).toEqual(reference);expect(s.phase).toBe('lost');expect(s.direction).toBe('up');
  expect(s.body).toEqual(body);expect(s.ticks).toBe(1);expect(s.elapsed).toBe(0);expect(s.queue).toEqual([]);
  for(const reduced of [false,true]) {
   const pose=projectSnake(s,v,reduced);expect(pose.path).toEqual(body);expect(pose.tangent).toEqual({x:0,y:-1});
   expect(Math.atan2(pose.tangent.y,pose.tangent.x)).toBe(-Math.PI/2);
  }
 });
 it('shows the eaten cell and complete grown body on the exact scoring tick with no arrival delay',()=>{
  const s=running(),v=createPresentation();s.food={x:6,y:6};
  advancePresentation(s,v,159);expect(s.score).toBe(0);expect(projectSnake(s,v).head).toEqual({x:5,y:6});
  advancePresentation(s,v,1);expect(s.score).toBe(10);expect(s.body).toHaveLength(4);
  const committed=projectSnake(s,v);expect(committed.path).toEqual(s.body);expect(committed.head).toEqual({x:6,y:6});
  expect(committed.path.at(-1)).toEqual({x:3,y:6});expect(length(committed.path)).toBe(3);
  advancePresentation(s,v,80);expect(projectSnake(s,v)).toEqual(committed);
 });
 it('saves fractional growth and turn poses exactly and rejects malformed presentation without losing the grid save',()=>{
  const s=running(),v=createPresentation();s.food={x:6,y:6};advancePresentation(s,v,240);
  const data=JSON.parse(JSON.stringify({...s,presentation:savePresentation(v)}));
  const restored=restoreState(data)!,other=restorePresentation(restored,data.presentation);
  expect(projectSnake(restored,other)).toEqual(projectSnake(s,v));expect(projectSnake(restored,other).path).toEqual(restored.body);
  enqueue(s,'up');enqueue(restored,'up');advancePresentation(s,v,190);advancePresentation(restored,other,190);
  expect(restored).toEqual(s);expect(projectSnake(restored,other)).toEqual(projectSnake(s,v));
  for(const bad of [null,{previous:[],grew:false},{previous:'bad',grew:false},{previous:[{x:Infinity,y:6}],grew:true},{previous:s.body,grew:false}]){
   expect(restorePresentation(s,bad).previous).toBeNull();expect(restoreState({...s,presentation:bad})).toEqual(s);
  }
 });
 it('restores finite food and eating ages through growth and subsequent steps, accepting legacy metadata',()=>{
  const s=running(),v=createPresentation();s.food={x:6,y:6};advancePresentation(s,v,240);
  const snapshot=savePresentation(v);expect(snapshot.foodAge).toBe(80);expect(snapshot.eatAge).toBe(80);expect(snapshot.eaten).toEqual({x:6,y:6});
  const restored=restorePresentation(s,JSON.parse(JSON.stringify(snapshot)));
  expect(savePresentation(restored)).toEqual(snapshot);expect(projectSnake(s,restored)).toEqual(projectSnake(s,v));
  advancePresentation(s,restored,160);const aged=savePresentation(restored);
  expect(aged.foodAge).toBe(200);expect(aged.eatAge).toBe(200);expect(aged.eaten).toBeNull();
  const old=restorePresentation(s,{previous:restored.previous,grew:restored.grew});
  expect(old.previous).toEqual(restored.previous);expect(savePresentation(old).eatAge).toBe(200);
  for(const invalid of [NaN,Infinity,-1,201,'80',null]) {
   const bad=restorePresentation(s,{...aged,foodAge:invalid,eatAge:invalid,eaten:{x:6,y:6}});
   expect(savePresentation(bad).foodAge).toBe(200);expect(savePresentation(bad).eatAge).toBe(200);
  }
  const invalidCell=restorePresentation(s,{...aged,eatAge:10,eaten:{x:15,y:15}});
  expect(invalidCell.eaten).toBeNull();
 });
 it('never advances inactive states, pauses fractional poses without a separate clock, and supports discrete reduced motion',()=>{
  const s=running(),v=createPresentation();advancePresentation(s,v,240);
  const frozen=projectSnake(s,v),snapshot=savePresentation(v);
  // Pausing is implemented by withholding active time; no render clock can drift.
  for(let i=0;i<30;i++)expect(projectSnake(s,v)).toEqual(frozen);
  expect(savePresentation(v)).toEqual(snapshot);
  expect(projectSnake(s,v,true)).toEqual(projectSnake(s,v));expect(projectSnake(s,v,true).path).toEqual(s.body);
  advancePresentation(s,v,80);expect(s.ticks).toBe(2);expect(s.elapsed).toBe(0);
  const ready=createState();advancePresentation(ready,v,TICK_MS*4);expect(ready.ticks).toBe(0);
 });
 it('keeps pose in grid units independent of resize and frame cadence changes',()=>{
  const s=running(),v=createPresentation();enqueue(s,'up');advancePresentation(s,v,240);
  const before=projectSnake(s,v);expect(before.head).toEqual({x:5,y:5});
  // Layout/backing dimensions are deliberately absent from the projection inputs.
  expect(projectSnake(s,v)).toEqual(before);
  advancePresentation(s,v,1000/30);advancePresentation(s,v,1000/120);advancePresentation(s,v,1000/60);
  expect(s.elapsed).toBeCloseTo(80+1000/30+1000/120+1000/60,8);orthogonal(projectSnake(s,v).path);
 });
});
