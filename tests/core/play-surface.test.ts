import {expect,test} from 'vitest';
import {PLAYING_VIEWPORT,READING_VIEWPORT,fitScale,nextScreenMode,playBox,shouldBlockTouchMove} from '../../src/core/play-surface';
import {fitScale as fitted} from '../../src/core/viewport-fit';

test('playing locks pinch zoom in the viewport meta and reading restores it',()=>{
  expect(READING_VIEWPORT).toBe('width=device-width, initial-scale=1, viewport-fit=cover');
  expect(PLAYING_VIEWPORT).toContain('maximum-scale=1');
  expect(PLAYING_VIEWPORT).toContain('user-scalable=no');
  expect(PLAYING_VIEWPORT).toContain('viewport-fit=cover');
});

test('a fitted game grows to fill spare stage space and shrinks when it is too tall',()=>{
  expect(fitScale(1366,700,420,640)).toBeCloseTo(Math.min(1366/420,700/640));
  expect(fitScale(1366,700,420,640)).toBeGreaterThan(1);
  expect(fitScale(390,500,800,900)).toBeCloseTo(Math.min(390/800,500/900));
  expect(fitScale(390,500,800,900)).toBeLessThan(1);
  expect(fitScale(0,500,100,100)).toBe(1);
  expect(fitted(1366,700,420,640)).toBe(fitScale(1366,700,420,640));
});

test('the visible play box follows the visual viewport, including offset and orientation',()=>{
  expect(playBox(null,{width:390,height:844})).toEqual({width:390,height:844,top:0,left:0});
  expect(playBox({width:390,height:700,offsetTop:80,offsetLeft:0},{width:390,height:844})).toEqual({width:390,height:700,top:80,left:0});
  expect(playBox({width:844,height:390,offsetTop:0,offsetLeft:12},{width:800,height:400})).toEqual({width:844,height:390,top:0,left:12});
});

test('pinch is blocked while a single finger may scroll an intentional region',()=>{
  expect(shouldBlockTouchMove(2,true)).toBe(true);
  expect(shouldBlockTouchMove(2,false)).toBe(true);
  expect(shouldBlockTouchMove(1,false)).toBe(true);
  expect(shouldBlockTouchMove(1,true)).toBe(false);
  expect(shouldBlockTouchMove(0,false)).toBe(false);
});

test('fullscreen uses the API, falls back when it is missing or rejected, and leaves either mode',async()=>{
  const host={supported:true,active:false,requested:0,exited:0,
    request(){this.requested++;this.active=true;return Promise.resolve();},
    exit(){this.exited++;this.active=false;return Promise.resolve();}};
  expect(await nextScreenMode('window',host)).toBe('fullscreen');
  expect(host.requested).toBe(1);
  expect(await nextScreenMode('fullscreen',host)).toBe('window');
  expect(host.exited).toBe(1);

  host.supported=false;host.active=false;
  expect(await nextScreenMode('window',host)).toBe('immersive');
  expect(await nextScreenMode('immersive',host)).toBe('window');

  host.supported=true;
  host.request=()=>Promise.reject(new Error('not allowed'));
  expect(await nextScreenMode('window',host)).toBe('immersive');
});
