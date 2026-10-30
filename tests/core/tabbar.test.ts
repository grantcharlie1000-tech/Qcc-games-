import {expect,test} from 'vitest';
import {nextTabbarState,type TabbarScroll} from '../../src/ui/tabbar';

const expanded=(lastY:number):TabbarScroll=>({minimized:false,lastY,travel:0});
const minimized=(lastY:number):TabbarScroll=>({minimized:true,lastY,travel:0});

test('it minimizes after 64 px of downward travel, and not before',()=>{
  const almost=nextTabbarState(expanded(200),200+64-1,1000);
  expect(almost.minimized).toBe(false);
  expect(nextTabbarState(almost,200+64,1000).minimized).toBe(true);
});

test('a 40 px scroll down does not minimize it',()=>{
  expect(nextTabbarState(expanded(200),240,1000).minimized).toBe(false);
});

test('it expands after 32 px of upward travel, and not before',()=>{
  const almost=nextTabbarState(minimized(400),400-31,1000);
  expect(almost.minimized).toBe(true);
  expect(nextTabbarState(almost,400-32,1000).minimized).toBe(false);
});

// The position must be 120 px or more from the top. A jump from the top zone to 65 px carries 65 px of travel, and still does not minimize.
test('it does not minimize above 120 px, however far it has travelled',()=>{
  const jumped=nextTabbarState(expanded(0),65,1000);
  expect(jumped).toEqual({minimized:false,lastY:65,travel:65});
  const nearer=nextTabbarState(jumped,119,1000);
  expect(nearer.minimized).toBe(false);
  expect(nextTabbarState(nearer,120,1000).minimized).toBe(true);
});

test('it always expands within 64 px of the top',()=>{
  expect(nextTabbarState(minimized(300),64,1000)).toEqual({minimized:false,lastY:64,travel:0});
  expect(nextTabbarState(minimized(300),0,1000).minimized).toBe(false);
});

test('it always expands within 24 px of the end',()=>{
  expect(nextTabbarState(minimized(700),1000-24,1000)).toEqual({minimized:false,lastY:976,travel:0});
  expect(nextTabbarState(minimized(700),1000,1000).minimized).toBe(false);
});

test('a page too short to reach 120 px is always expanded',()=>{
  expect(nextTabbarState(minimized(80),81,119).minimized).toBe(false);
  expect(nextTabbarState(minimized(80),81,119)).toEqual({minimized:false,lastY:81,travel:0});
});

test('jitter of alternating ±5 px never toggles it',()=>{
  for(const start of [expanded(400),minimized(400)]){
    let state=start;
    for(let step=0;step<40;step++){
      state=nextTabbarState(state,400+(step%2===0?5:0),1000);
      expect(state.minimized).toBe(start.minimized);
    }
  }
});

test('a reversal starts the count again',()=>{
  let state=nextTabbarState(expanded(100),140,1000);
  state=nextTabbarState(state,130,1000);
  state=nextTabbarState(state,170,1000);
  expect(state.minimized).toBe(false);
  expect(nextTabbarState(state,210,1000).minimized).toBe(true);
});

test('values below 0 or above max are clamped',()=>{
  expect(nextTabbarState(expanded(100),-300,1000).lastY).toBe(0);
  expect(nextTabbarState(expanded(900),1400,1000).lastY).toBe(1000);
  // Overscroll past the end counts as the end: it expands the bar and adds no travel.
  expect(nextTabbarState(minimized(900),1400,1000)).toEqual({minimized:false,lastY:1000,travel:0});
});

// A sample that does not move keeps the travel built so far: only a real reversal starts the count again.
test('a sample with no change in position keeps the travel built so far',()=>{
  const built=nextTabbarState(expanded(200),230,1000);
  expect(built.travel).toBe(30);
  const still=nextTabbarState(built,230,1000);
  expect(still).toEqual({minimized:false,lastY:230,travel:30});
  expect(nextTabbarState(still,264,1000).minimized).toBe(true);
});

// While a text field has focus the state holds, so typing and the on-screen keyboard never toggle it. The travel restarts from there.
test('typing holds a minimized bar minimized, and scrolling up while typing does not expand it',()=>{
  expect(nextTabbarState(minimized(300),340,1000,true).minimized).toBe(true);
  expect(nextTabbarState(minimized(300),200,1000,true).minimized).toBe(true);
});

// The two ends of the page, and a page too short to scroll, keep the bar expanded even while the reader types.
test('typing never keeps the bar minimized at the top, at the end, or on a short page',()=>{
  expect(nextTabbarState(minimized(300),40,1000,true).minimized).toBe(false);
  expect(nextTabbarState(minimized(300),990,1000,true).minimized).toBe(false);
  expect(nextTabbarState(minimized(300),300,100,true).minimized).toBe(false);
});

test('typing holds an expanded bar expanded, however far the page moves',()=>{
  expect(nextTabbarState(expanded(300),600,1000,true).minimized).toBe(false);
});

test('the travel built before typing does not count after it',()=>{
  let state=nextTabbarState(expanded(200),250,1000);
  state=nextTabbarState(state,250,1000,true);
  expect(state).toEqual({minimized:false,lastY:250,travel:0});
  expect(nextTabbarState(state,300,1000).minimized).toBe(false);
});

test('the step returns a new state and leaves its input alone',()=>{
  const state=expanded(200);
  nextTabbarState(state,260,1000);
  expect(state).toEqual(expanded(200));
});
