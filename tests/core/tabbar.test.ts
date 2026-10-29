import {expect,test} from 'vitest';
import {nextTabbarState,TABBAR_EDGE,TABBAR_THRESHOLD,type TabbarScroll} from '../../src/ui/tabbar';

const shown=(lastY:number):TabbarScroll=>({hidden:false,lastY,travel:0});
const hidden=(lastY:number):TabbarScroll=>({hidden:true,lastY,travel:0});

test('it hides after TABBAR_THRESHOLD px of downward travel and not before',()=>{
  const almost=nextTabbarState(shown(100),100+TABBAR_THRESHOLD-1,1000);
  expect(almost.hidden).toBe(false);
  expect(nextTabbarState(almost,100+TABBAR_THRESHOLD,1000).hidden).toBe(true);
});

test('it shows after TABBAR_THRESHOLD px of upward travel and not before',()=>{
  const almost=nextTabbarState(hidden(500),500-TABBAR_THRESHOLD+1,1000);
  expect(almost.hidden).toBe(true);
  expect(nextTabbarState(almost,500-TABBAR_THRESHOLD,1000).hidden).toBe(false);
});

test('jitter of alternating ±5 px never toggles it',()=>{
  for(const start of [shown(400),hidden(400)]){
    let state=start;
    for(let step=0;step<40;step++){
      state=nextTabbarState(state,400+(step%2===0?5:0),1000);
      expect(state.hidden).toBe(start.hidden);
    }
  }
});

test('it always shows within TABBAR_EDGE of the top and of the end',()=>{
  expect(nextTabbarState(hidden(300),TABBAR_EDGE,1000)).toEqual({hidden:false,lastY:TABBAR_EDGE,travel:0});
  expect(nextTabbarState(hidden(300),0,1000).hidden).toBe(false);
  expect(nextTabbarState(hidden(700),1000-TABBAR_EDGE,1000)).toEqual({hidden:false,lastY:1000-TABBAR_EDGE,travel:0});
  expect(nextTabbarState(hidden(700),1000,1000).hidden).toBe(false);
});

test('a page with max<=48 never hides it',()=>{
  let state=shown(0);
  for(const y of [0,12,24,30,40,48]){
    state=nextTabbarState(state,y,48);
    expect(state.hidden).toBe(false);
  }
  expect(nextTabbarState(shown(0),0,0).hidden).toBe(false);
});

test('values below 0 or above max are clamped',()=>{
  expect(nextTabbarState(shown(100),-300,1000).lastY).toBe(0);
  expect(nextTabbarState(shown(900),1400,1000).lastY).toBe(1000);
  // Overscroll past the end counts as the end: it shows the bar and adds no travel.
  expect(nextTabbarState(hidden(900),1400,1000)).toEqual({hidden:false,lastY:1000,travel:0});
});

test('the step returns a new state and leaves its input alone',()=>{
  const state=shown(100);
  nextTabbarState(state,120,1000);
  expect(state).toEqual(shown(100));
});
