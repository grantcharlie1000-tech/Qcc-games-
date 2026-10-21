import {test,expect} from '@playwright/test';

declare global {
 interface Window {
  __fruitRenders:{draws:number;perFrame:Map<number,number>;sample:(frames:number)=>Promise<{draws:number;maxPerFrame:number}>};
 }
}

test('shared pause stops Fruit Merge drawing and repeated resumes keep one physics loop',async({page})=>{
 await page.addInitScript(()=>{
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
  sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
  const nativeFrame=requestAnimationFrame.bind(window);
  let frameStamp=-1;
  window.requestAnimationFrame=callback=>nativeFrame(stamp=>{frameStamp=stamp;callback(stamp);});
  const renders={draws:0,perFrame:new Map<number,number>(),sample:async(frames:number)=>{
   renders.draws=0;renders.perFrame.clear();
   for(let i=0;i<frames;i++)await new Promise<void>(resolve=>nativeFrame(()=>resolve()));
   return {draws:renders.draws,maxPerFrame:Math.max(0,...renders.perFrame.values())};
  }};
  window.__fruitRenders=renders;
  const clear=CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect=function(...args:Parameters<typeof clear>){
   if(this.canvas.classList.contains('fm-board')){renders.draws++;renders.perFrame.set(frameStamp,(renders.perFrame.get(frameStamp)||0)+1);}
   return clear.apply(this,args);
  };
 });
 await page.goto('/#/game/fruit-merge');
 await expect(page.locator('.fm-board')).toBeVisible();
 await page.getByRole('button',{name:'Drop fruit',exact:true}).click();
 await expect(page.locator('.fm-count')).toHaveText('1 fruit in basket');
 const snapshot=()=>page.evaluate(()=>{
  window.dispatchEvent(new Event('pagehide'));
  return JSON.parse(localStorage.getItem('pocket-arcade:v1:save:fruit-merge')!).data as {time:number};
 });
 for(let cycle=0;cycle<3;cycle++){
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Paused',exact:true})).toBeVisible();
  const paused=await snapshot();
  expect(await page.evaluate(()=>window.__fruitRenders.sample(20))).toEqual({draws:0,maxPerFrame:0});
  expect((await snapshot()).time).toBe(paused.time);
  await page.getByRole('button',{name:'Keep playing',exact:true}).click();
  // The shell can call resume again; its public callback must remain idempotent.
  await page.locator('#resume-game').dispatchEvent('click');
  await page.locator('#resume-game').dispatchEvent('click');
  const active=await page.evaluate(()=>window.__fruitRenders.sample(20));
  expect(active.draws).toBeGreaterThan(0);
  expect(active.maxPerFrame).toBe(1);
  expect((await snapshot()).time).toBeGreaterThan(paused.time);
 }
 await page.getByRole('link',{name:'Back to game library',exact:true}).click();
 await expect(page.locator('.fm-board')).toHaveCount(0);
 expect(await page.evaluate(()=>window.__fruitRenders.sample(10))).toEqual({draws:0,maxPerFrame:0});
});
