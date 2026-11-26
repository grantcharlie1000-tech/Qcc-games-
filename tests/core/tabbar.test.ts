import {describe,expect,it,test} from 'vitest';
import {GLYPH_RISE,LENS_ZOOM,glyphRise,lensBevel,lensCover,lensZoom,nextTabbarState,tabCover,type TabbarScroll} from '../../src/ui/tabbar';

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

// A 390px bar: 58px tabs, a 24px icon and a 40px label centred in each, and the drag lens at full stretch, 1.32 wide.
const TAB=58,ICON=24,LABEL=40,STRETCH=1.32;
const lensHalf=(TAB+4)*STRETCH/2,bevel=lensBevel((TAB+4)*STRETCH,48);
const content=(centre:number)=>[[centre-ICON/2,centre+ICON/2,ICON*ICON],[centre-LABEL/2,centre+LABEL/2,LABEL*12]] as const;
const zoomAt=(lens:number,tab:number,scaleX=STRETCH,scaleY=.98)=>lensZoom(scaleX,tabCover(lens,lensHalf,bevel,content(tab)),scaleY);

describe('lensCover',()=>{
  it('counts content inside the lens face in full, content past the lens not at all',()=>{
    expect(lensCover(100,40,12,80,120)).toBe(1);
    expect(lensCover(100,40,12,72,128)).toBe(1);
    expect(lensCover(100,40,12,140,180)).toBe(0);
    expect(lensCover(100,40,12,10,60)).toBe(0);
  });
  it('eases the weight down across the bevel, smooth and symmetric',()=>{
    // Across the bevel alone the smoothstep averages one half.
    expect(lensCover(100,40,12,128,140)).toBeCloseTo(.5,6);
    expect(lensCover(100,40,12,60,72)).toBeCloseTo(.5,6);
    // Thin slices step down monotonically from the face to the edge, with no jump at either end of the bevel.
    const slices=Array.from({length:14},(_,k)=>lensCover(100,40,12,127+k,128+k));
    for(let k=1;k<slices.length;k++)expect(slices[k]).toBeLessThanOrEqual(slices[k-1]);
    expect(slices[0]).toBe(1);expect(slices[13]).toBe(0);
    expect(slices[1]).toBeGreaterThan(.98);expect(slices[12]).toBeLessThan(.02);
  });
  it('reads the bevel as section-lens.ts draws it',()=>{
    expect(lensBevel(82,48)).toBe(10.8);
    expect(lensBevel(120,60)).toBe(12);
  });
});

describe('lensZoom',()=>{
  it('keeps tab content at 1 at rest, through a selection stretch and where the lens covers nothing',()=>{
    expect(zoomAt(100,100,1,1)).toBe(1);
    expect(lensZoom(1,1,1)).toBe(1);
    // A selection stretch peaks at 1.062 in area, under the 1.07 the lens rises from.
    expect(lensZoom(1.03,1,1.03)).toBe(1);
    expect(lensZoom(STRETCH,0,.98)).toBe(1);
  });
  it('raises the full magnification on a press, as Charlie\'s video does (glyph 1.17x under the held lens)',()=>{
    expect(lensZoom(1.1,1,1.14)).toBeCloseTo(LENS_ZOOM,6);
    expect(zoomAt(100,100,1.1,1.14)).toBeCloseTo(LENS_ZOOM,6);
  });
  it('magnifies content fully under the raised lens body to the lens magnification',()=>{
    // Charlie's video: the glyph under the hold and drag lens grows 29 -> 34 px, 1.17x.
    expect(LENS_ZOOM).toBeGreaterThanOrEqual(1.12);expect(LENS_ZOOM).toBeLessThanOrEqual(1.22);
    expect(zoomAt(100,100)).toBeCloseTo(LENS_ZOOM,6);
    // Its neighbours' content sits past the lens face, at most a label tip in the bevel, so they stay at about 1.
    expect(zoomAt(100,100+TAB)).toBeLessThan(1.002);
    expect(zoomAt(100,100-TAB)).toBeLessThan(1.002);
    expect(zoomAt(100,100+TAB*1.5)).toBe(1);
  });
  it('visibly enlarges both tabs when the lens sits between them',()=>{
    const left=zoomAt(100,100-TAB/2),right=zoomAt(100,100+TAB/2);
    expect(left).toBeCloseTo(right,6);
    // About two thirds of each tab's content is under the face or bevel.
    expect(left-1).toBeGreaterThan(.6*(LENS_ZOOM-1));expect(left).toBeLessThan(LENS_ZOOM);
  });
  it('eases a tab down smoothly as the lens slides off it',()=>{
    let last=zoomAt(100,100);
    for(let shift=1;shift<=Math.ceil(lensHalf+LABEL/2);shift++){
      const zoom=zoomAt(100+shift,100);
      expect(zoom).toBeLessThanOrEqual(last+1e-9);
      expect(last-zoom).toBeLessThan(.02);
      last=zoom;
    }
    expect(last).toBe(1);
  });
  it('keeps the magnification through drag stretch and lets it fall with the press area on release',()=>{
    expect(lensZoom(1.15,1,1.104)).toBeCloseTo(LENS_ZOOM,6);
    expect(lensZoom(1.32,1,.98)).toBeCloseTo(LENS_ZOOM,6);
    const release=[1.1,1.08,1.06,1.04,1.02,1].map(scale=>lensZoom(scale,1,scale*1.14/1.1));
    for(let k=1;k<release.length;k++)expect(release[k]).toBeLessThanOrEqual(release[k-1]);
    expect(release[2]).toBeGreaterThan(1);expect(release[2]).toBeLessThan(LENS_ZOOM);
    expect(release[5]).toBe(1);
  });
});

describe('glyphRise',()=>{
  // MOTION-7: Charlie's video press (19.587-19.920 s): the glyph's whole growth is x1.015 at 17 ms, 1.08 at 50, 1.146 at
  // 100, 1.193 at 133 and 1.21 by 217, about a fifth of it the bar's own spring. The lens's own share eases in over 200 ms.
  it('starts at 0, eases out and is whole by GLYPH_RISE',()=>{
    expect(GLYPH_RISE).toBe(200);
    expect(glyphRise(0)).toBe(0);expect(glyphRise(-5)).toBe(0);
    expect(glyphRise(GLYPH_RISE)).toBe(1);expect(glyphRise(1000)).toBe(1);
    let last=0;
    for(let ms=10;ms<=GLYPH_RISE;ms+=10){const rise=glyphRise(ms);expect(rise).toBeGreaterThan(last);last=rise;}
  });
  it('follows the video\'s glyph curve, about half way by 50 ms and nine tenths by 140 ms',()=>{
    expect(glyphRise(50)).toBeGreaterThan(.4);expect(glyphRise(50)).toBeLessThan(.5);
    expect(glyphRise(100)).toBeCloseTo(.75,6);
    expect(glyphRise(140)).toBeGreaterThan(.9);
  });
});
