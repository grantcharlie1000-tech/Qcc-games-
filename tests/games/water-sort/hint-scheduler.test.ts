import {afterEach,expect,it,vi} from 'vitest';
import {HintSearch} from '../../../src/games/water-sort/hint-search';
import {hintFor} from '../../../src/games/water-sort/hint';
import * as fallback from '../../../src/games/water-sort/hint-fallback';

const input={tubes:[[0,1],[1],[0],[]],history:[]};
afterEach(()=>{vi.restoreAllMocks();vi.useRealTimers();});

it('bounds work with a frozen clock and performs no more work after cancellation',async()=>{
  vi.useFakeTimers();vi.spyOn(performance,'now').mockReturnValue(0);
  let steps=0;
  vi.spyOn(fallback,'hintFallback').mockImplementation(function*(){while(true){steps++;yield;}});
  const search=new HintSearch(()=>{throw Error('unavailable');}),result=search.run(input);
  vi.advanceTimersToNextTimer();
  expect(steps).toBe(16384);
  search.cancel();vi.runAllTimers();
  expect(steps).toBe(16384);
  expect(await result).toEqual({kind:'cancelled'});
  expect(vi.getTimerCount()).toBe(0);
});

it('yields after a clock checkpoint and stops a reentrant cancellation',async()=>{
  vi.useFakeTimers();let clock=0,steps=0;
  const now=vi.spyOn(performance,'now').mockImplementation(()=>clock+=5);
  vi.spyOn(fallback,'hintFallback').mockImplementation(function*(){while(true){steps++;yield;}});
  const search=new HintSearch(()=>{throw Error('unavailable');}),result=search.run(input);
  vi.advanceTimersToNextTimer();
  expect(steps).toBe(32);expect(now).toHaveBeenCalledTimes(2);
  search.cancel();expect(await result).toEqual({kind:'cancelled'});
  vi.mocked(fallback.hintFallback).mockImplementation(function*(){search.cancel();steps++;yield;steps++;yield;return {kind:'done'};});
  const retry=search.run(input);vi.advanceTimersToNextTimer();vi.runAllTimers();
  expect(steps).toBe(33);expect(await retry).toEqual({kind:'cancelled'});
  expect(vi.getTimerCount()).toBe(0);
});

it('does not orphan a search started during cancellation of the previous worker',async()=>{
  vi.useFakeTimers();let nested:Promise<unknown>|undefined,calls=0;let search:HintSearch;
  const worker=new EventTarget();
  Object.assign(worker,{postMessage(){},terminate(){nested=search.run(input);}});
  search=new HintSearch(()=>{if(calls++===0)return worker as never;throw Error('unavailable');});
  const first=search.run(input),displaced=search.run(input);
  vi.runAllTimers();
  expect(await first).toEqual({kind:'cancelled'});
  expect(await displaced).toEqual({kind:'cancelled'});
  expect(await nested).toEqual({kind:'hint',hint:hintFor(input)});
  expect(vi.getTimerCount()).toBe(0);
});
