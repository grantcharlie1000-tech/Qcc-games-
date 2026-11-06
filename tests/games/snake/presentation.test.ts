import {describe,expect,it} from 'vitest';
import {advance,createState,enqueue,start,TICK_MS,GRACE_MS} from '../../../src/games/snake/model';
import {buildSpine,bulge,bulgePositions,blink,createView,deathFx,foodScale,mouth,taper,tongue} from '../../../src/games/snake/presentation';

describe('snake presentation',()=>{
 it('interpolates the head and tail between ticks while the length stays constant',()=>{
  const s=createState();start(s);
  const at=(ms:number)=>{const c=JSON.parse(JSON.stringify(s));advance(c,ms);return buildSpine(c);};
  const a=at(0),b=at(TICK_MS/2);
  expect(a.head).toEqual({x:4,y:7});expect(b.head.x).toBeCloseTo(4.5);
  expect(a.length).toBeCloseTo(3);expect(b.length).toBeCloseTo(3);
  expect(b.points.at(-1)!.x).toBeCloseTo(1.5);
 });
 it('rounds corners without changing the travelled path much',()=>{
  const s=createState();start(s);advance(s,TICK_MS+GRACE_MS+1);enqueue(s,'up');advance(s,TICK_MS*2-GRACE_MS-1+TICK_MS/2);
  const spine=buildSpine(s),corner={x:6,y:7};
  const nearest=Math.min(...spine.points.map(p=>Math.hypot(p.x-corner.x,p.y-corner.y)));
  expect(nearest).toBeGreaterThan(.1);expect(nearest).toBeLessThan(.25);
  expect(spine.tangent).toEqual({x:0,y:-1});
 });
 it('tapers the last cells and swells under a swallow',()=>{
  expect(taper(0,10)).toBe(1);expect(taper(10,10)).toBeCloseTo(.5);expect(taper(8.75,10)).toBeCloseTo(.75);
  expect(bulge(3,[3],10)).toBeCloseTo(1.22);expect(bulge(0,[5],10)).toBeCloseTo(1,3);
 });
 it('opens the mouth as the apple nears and turns decorations off under reduced motion',()=>{
  const s=createState();start(s);const v=createView(s);
  expect(mouth(s,v,{x:5,y:7},false)).toBe(0);expect(mouth(s,v,{x:10,y:7},false)).toBe(1);expect(mouth(s,v,{x:10,y:7},true)).toBe(0);
  v.eats.push({at:0,cell:{x:3,y:3}});v.clock=TICK_MS;
  expect(bulgePositions(v,false)).toEqual([2]);expect(bulgePositions(v,true)).toEqual([]);
  v.foodBorn=0;v.clock=30;expect(foodScale(v,false)).toBeLessThan(1);expect(foodScale(v,true)).toBe(1);
 });
 it('blinks, flicks the tongue and shakes on death only when motion is allowed',()=>{
  const s=createState(),v=createView();
  const lids=Array.from({length:600},(_,i)=>{v.clock=i*10;return blink(v,s,false);});
  expect(Math.min(...lids)).toBeLessThan(.5);
  v.clock=100;expect(tongue(v,s,false)).toBeGreaterThan(0);expect(tongue(v,s,true)).toBe(0);
  s.phase='lost';v.endedAt=0;v.clock=20;
  expect(Math.hypot(deathFx(v,s,false).dx,deathFx(v,s,false).dy)).toBeGreaterThan(0);
  expect(deathFx(v,s,true)).toMatchObject({dx:0,dy:0,flash:0});
 });
});

import {headPose,easeOutStrong} from '../../../src/games/snake/head';
describe('snake head geometry',()=>{
 it('is closed at rest and grows a jaw wider than the head as it opens',()=>{
  expect(headPose(0,10).jaw).toBeNull();
  const half=headPose(.5,10),full=headPose(1,10);
  for(const p of [half,full])for(const d of [p.jaw,p.cavity,p.fangs])expect(d).toMatch(/^M[-\d. ]+[AQ]/);
  expect(full.cavityBox!.ry).toBeGreaterThan(half.cavityBox!.ry);
  // Fully open, the jaw reaches past the head's half-width of 10.
  const ry=Number(full.jaw!.match(/A[\d.]+ ([\d.]+)/)![1]);expect(ry).toBeGreaterThan(10);
 });
 it('uses the strong ease-out curve for the snap shut',()=>{
  expect(easeOutStrong(0)).toBe(0);expect(easeOutStrong(1)).toBe(1);expect(easeOutStrong(.25)).toBeGreaterThan(.7);
 });
});
