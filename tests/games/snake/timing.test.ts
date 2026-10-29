import {describe,it,expect} from 'vitest';
import {createState,start,enqueue,type Direction} from '../../../src/games/snake/model';
import {createPresentation,advancePresentation} from '../../../src/games/snake/presentation';
import {SnakeTimeline} from '../../../src/games/snake/timing';

describe('Snake input timeline',()=>{
 it('replays a late input at the junction where it occurred',()=>{
  const state=createState();start(state);
  const timeline=new SnakeTimeline(state,createPresentation(state),0);
  timeline.advance(180);
  timeline.turn('up',140);
  expect(timeline.state.direction).toBe('up');
  expect(timeline.state.body[0].x).toBeCloseTo(6);
  expect(timeline.state.body[0].y).toBeCloseTo(6-20/160);
  expect(timeline.last).toBe(180);
 });
 it('does not redirect a leg when input occurred after the centre',()=>{
  const state=createState();start(state);
  const timeline=new SnakeTimeline(state,createPresentation(state),0);
  timeline.advance(220);timeline.turn('up',180);
  expect(timeline.state.direction).toBe('right');expect(timeline.state.queue).toEqual(['up']);
 });
 it('does not rewind an apple when a late turn predates it',()=>{
  const state=createState();state.food={x:7,y:6};start(state);
  const timeline=new SnakeTimeline(state,createPresentation(state),0);
  timeline.advance(240);
  expect(timeline.state.score).toBe(10);
  timeline.turn('up',140);
  expect(timeline.state.score).toBe(10);
  expect(timeline.state.direction).toBe('right');
  expect(timeline.state.queue).toEqual(['up']);
  timeline.advance(340);
  expect(timeline.state.direction).toBe('up');
  expect(timeline.state.body[0].x).toBeCloseTo(7);
  expect(timeline.state.body[0].y).toBeCloseTo(6-20/160);
 });
 it('does not capture every frame within a tick',()=>{
  const state=createState();start(state);
  const timeline=new SnakeTimeline(state,createPresentation(state),0);
  const count=timeline.snapshotCount;
  for(let time=1;time<160;time++)timeline.advance(time);
  expect(timeline.snapshotCount).toBe(count);
  timeline.advance(160);
  expect(timeline.snapshotCount).toBe(count+1);
 });
 it('does not rewind a death for a late turn',()=>{
  const state=createState();start(state);
  const timeline=new SnakeTimeline(state,createPresentation(state),0);
  timeline.advance(1700);
  expect(timeline.state.phase).toBe('lost');
  timeline.turn('up',1500);
  expect(timeline.state.phase).toBe('lost');
 });

 it('late-handled inputs end where exact-time inputs would',()=>{
  let bad=0,total=0;
  for(let seed=1;seed<400;seed++){
   let random=seed*7919;
   const rnd=()=>{random=(Math.imul(random,1103515245)+12345)>>>0;return random/2**32;};
   const directions:Direction[]=['up','left','down','right'];
   const inputs:{t:number;d:Direction;h:number}[]=[];
   let time=0,handledTime=0;
   for(let i=0;i<6;i++){
    time+=60+rnd()*300;
    handledTime=Math.max(handledTime,time+rnd()*200);
    inputs.push({t:time,d:directions[Math.floor(rnd()*4)],h:handledTime});
   }
   const reference=createState();start(reference);
   const presentation=createPresentation(reference);
   let last=0;
   for(const input of inputs){
    advancePresentation(reference,presentation,input.t-last);last=input.t;
    enqueue(reference,input.d);
   }
   const end=inputs.at(-1)!.h+300;
   advancePresentation(reference,presentation,end-last);

   const state=createState();start(state);
   const timeline=new SnakeTimeline(state,createPresentation(state),0);
   const handled=[...inputs].sort((a,b)=>a.h-b.h);
   let index=0;
   for(let frame=0;frame<=end;frame+=16.7){
    while(index<handled.length&&handled[index].h<=frame){
     const input=handled[index++];
     timeline.turn(input.d,input.h-input.t>250?input.h:input.t);
    }
    timeline.advance(frame);
   }
   while(index<handled.length){const input=handled[index++];timeline.turn(input.d,input.t);}
   timeline.advance(end);
   if(inputs.every(input=>input.h-input.t<=250)&&reference.phase==='running'&&timeline.state.phase==='running'&&reference.score===0&&timeline.state.score===0){
    total++;
    const positions=(body:typeof reference.body)=>body.map(cell=>[+cell.x.toFixed(6),+cell.y.toFixed(6)]);
    if(JSON.stringify(positions(reference.body))!==JSON.stringify(positions(timeline.state.body))||reference.direction!==timeline.state.direction)bad++;
   }
  }
  expect(total).toBeGreaterThan(150);
  expect(bad).toBe(0);
 });
});
