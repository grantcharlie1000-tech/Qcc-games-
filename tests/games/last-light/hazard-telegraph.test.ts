import {describe,expect,it} from 'vitest';
import {LEVELS} from '../../../src/games/last-light/levels';
import {createRun,hazardAt,hazardFade,hazardWindDown,laserActive,surfaceBelow,PLAYER_H} from '../../../src/games/last-light/model';

describe('Last Light hazard wind-down',()=>{
 const steam={kind:'steam' as const,x:100,y:200,w:20,h:112,period:2.8,duty:.6,offset:0};
 const laser={...steam,kind:'laser' as const};
 const on=2.8*.6,window=hazardWindDown(steam);
 it('keeps full strength until the wind-down window',()=>{
  expect(window).toBeGreaterThan(.3);
  expect(hazardFade(steam,0)).toBe(0);
  expect(hazardFade(steam,on-window-.01)).toBe(0);
  expect(hazardAt(steam,.2)).toMatchObject({y:200,h:112});
 });
 it('sinks steam toward its grate, keeping the floor fixed',()=>{
  const half=hazardAt(steam,on-window/2);
  expect(hazardFade(steam,on-window/2)).toBeCloseTo(.5,5);
  expect(half.h).toBeCloseTo(56,5);expect(half.y+half.h).toBeCloseTo(312,5);
  const late=hazardAt(steam,on-.001);expect(late.h).toBeLessThan(2);
  expect(laserActive(steam,on-.001)).toBe(true);expect(laserActive(steam,on+.001)).toBe(false);
 });
 it('only flags lasers for flicker; their collision height is unchanged',()=>{
  expect(hazardFade(laser,on-window/2)).toBeCloseTo(.5,5);
  expect(hazardAt(laser,on-.01).h).toBe(112);
  expect(hazardFade(laser,on+.1)).toBe(0);
  expect(hazardFade({...steam,kind:'spikes' as const},on-.1)).toBe(0);
 });
});

describe('Last Light ground shadow',()=>{
 it('stays on the surface below while the courier rises',()=>{
  const s=createRun(),ground=surfaceBelow(s);
  expect(ground).toBeDefined();
  s.y=ground!-PLAYER_H-60;
  expect(surfaceBelow(s)).toBe(ground);
 });
 it('has nothing to land on over an open gap',()=>{
  const s=createRun();s.x=-10000;expect(surfaceBelow(s,LEVELS[0])).toBeUndefined();
 });
});
