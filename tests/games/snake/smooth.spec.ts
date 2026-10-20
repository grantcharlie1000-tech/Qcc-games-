import {test,expect,type Page} from '../../fixtures';
import {advance,createState,enqueue,type SnakeState} from '../../../src/games/snake/model';
import type {SnakePresentation} from '../../../src/games/snake/presentation';

type Snapshot=SnakeState&{presentation:Pick<SnakePresentation,'previous'|'grew'>};
const saved=async(page:Page):Promise<Snapshot>=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:snake')!).data);
const pixels=(page:Page)=>page.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL());
async function setup(page:Page){
 await page.clock.install({time:new Date('2026-10-20T10:00:00Z')});
 await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
 await page.goto('/#/game/snake');await page.getByRole('button',{name:'Start slithering',exact:true}).click();
 await page.clock.runFor(20); // Establish the RAF timestamp; no simulation tick yet.
}
async function pause(page:Page){await page.getByRole('button',{name:'Pause game',exact:true}).click();return saved(page);}

test('authoritative tick frames, mid-tick buffered turn, frozen fractional save and reload',async({page})=>{
 await setup(page);await page.clock.runFor(200);
 const a=await pixels(page);await page.clock.runFor(32);const b=await pixels(page);expect(b).toBe(a); // Effect-free geometry stays fixed before the next committed tick.
 await page.keyboard.press('ArrowLeft'); // Illegal reversal while facing right.
 await page.keyboard.press('ArrowUp');await page.keyboard.press('ArrowDown'); // Illegal against buffered up.
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowDown'); // Full two-turn buffer.
 const snapshot=await pause(page);
 expect(snapshot.direction).toBe('right');expect(snapshot.queue).toEqual(['up','left']);expect(snapshot.elapsed).toBeGreaterThan(0);
 const frozen=await pixels(page);await page.clock.runFor(1000);expect(await pixels(page)).toBe(frozen);
 await page.reload();expect(await pixels(page)).toBe(frozen);
 await page.getByRole('button',{name:'Pause game',exact:true}).click();
 expect(await saved(page)).toEqual(snapshot);
 const restoredFrozen=await pixels(page);await page.clock.runFor(1000);expect(await pixels(page)).toBe(restoredFrozen);
 await page.getByRole('button',{name:'Resume game',exact:true}).click();
 await page.clock.runFor(180-snapshot.elapsed);
 const turned=await pause(page);expect(turned.direction).toBe('up');expect(turned.queue).toEqual(['left']);
 expect(turned.body[0]).toEqual({x:6,y:5});expect(await pixels(page)).not.toBe(restoredFrozen);
 // Save inside the apple/growth interval, including the active 200 ms feedback.
 await page.getByRole('button',{name:'Restart game',exact:true}).click();
 await page.getByRole('button',{name:'Start slithering',exact:true}).click();
 await page.clock.runFor(740);const grown=await pause(page);
 expect(grown.score).toBe(10);expect(grown.presentation.grew).toBe(true);
 const growingPixels=await pixels(page);await page.reload();expect(await pixels(page)).toBe(growingPixels);
 await page.getByRole('button',{name:'Pause game',exact:true}).click();expect(await saved(page)).toEqual(grown);
});

test('a dropped RAF catches up to the same final grid and committed edge',async({page,browser})=>{
 async function scenario(target:Page,droppedFrame:boolean){
  await setup(target);await target.getByRole('button',{name:'Restart game',exact:true}).click();
  // This independent RAF observer shares the game's delivered timestamps, without naming its callback.
  await target.evaluate(()=>{
   const times:number[]=[];(window as unknown as {snakeTestFrames:number[]}).snakeTestFrames=times;
   const observe=(time:number)=>{
    if(document.querySelector('.snake-card')?.hasAttribute('hidden') && document.querySelector('#pause-game')?.getAttribute('aria-label')==='Pause game')times.push(time);
    requestAnimationFrame(observe);
   };
   requestAnimationFrame(observe);
  });
  await target.getByRole('button',{name:'Start slithering',exact:true}).click();
  await target.keyboard.press('ArrowUp');await target.keyboard.press('ArrowLeft');
  await target.clock.runFor(20); // Establish the first active RAF in both scenarios before the gap.
  const baseline=await target.evaluate(()=>(window as unknown as {snakeTestFrames:number[]}).snakeTestFrames[0]);
  expect(Number.isFinite(baseline)).toBe(true);
  if(droppedFrame)await target.clock.fastForward(400);else await target.clock.runFor(400);
  const snapshot=await pause(target);
  const times=await target.evaluate(()=>(window as unknown as {snakeTestFrames:number[]}).snakeTestFrames);
  const delivered=times.at(-1)!-baseline;
  const reference:SnakeState={...createState(),phase:'running'};enqueue(reference,'up');enqueue(reference,'left');advance(reference,delivered);
  const {presentation,...grid}=snapshot;
  expect(grid).toEqual(reference); // Exact fractional clock, not a widened nominal-time tolerance.
  expect(snapshot.ticks).toBe(2);
  return {snapshot,delivered,count:times.length};
 }
 const steady=await scenario(page,false);
 const context=await browser.newContext();
 await context.addInitScript(()=>sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading'));
 const dropped=await context.newPage();const skipped=await scenario(dropped,true);
 expect(steady.count).toBeGreaterThan(20);expect(skipped.count).toBeLessThan(steady.count/2);
 expect(skipped.snapshot.body).toEqual(steady.snapshot.body);expect(skipped.snapshot.direction).toBe(steady.snapshot.direction);
 expect(skipped.snapshot.ticks).toBe(steady.snapshot.ticks);expect(skipped.snapshot.queue).toEqual(steady.snapshot.queue);
 expect(skipped.snapshot.presentation).toEqual(steady.snapshot.presentation);
 expect(skipped.snapshot.elapsed-steady.snapshot.elapsed).toBeCloseTo(skipped.delivered-steady.delivered,8);
 await context.close();
});

test('resize during a turn preserves the grid and renders at the actual high-DPI display size',async({page,context,browserName})=>{
 await page.setViewportSize({width:1440,height:1200});await setup(page);
 await page.keyboard.press('ArrowUp');await page.clock.runFor(240);
 const before=await pause(page);const garden=await page.locator('.snake-garden').boundingBox();
 expect(garden!.width).toBeCloseTo(728,0);
 const canvas=await page.locator('canvas').boundingBox();expect(canvas!.width).toBeCloseTo(694.4,0);
 if(browserName==='chromium'){
  const cdp=await context.newCDPSession(page);
  const metrics={width:1366,height:768,mobile:false};
  await cdp.send('Emulation.setDeviceMetricsOverride',{...metrics,deviceScaleFactor:2});
  await expect.poll(async()=>{await page.clock.runFor(32);return page.locator('.snake-game').evaluate(root=>root.classList.contains('snake-sideways'));}).toBe(true);
  await expect.poll(async()=>{await page.clock.runFor(32);return page.locator('canvas').evaluate((c:HTMLCanvasElement)=>c.width===Math.round(c.getBoundingClientRect().width*devicePixelRatio));}).toBe(true);
  const beforeDpr=await page.locator('canvas').evaluate((c:HTMLCanvasElement)=>({width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height,backing:c.width,label:c.getAttribute('aria-label')}));
  await cdp.send('Emulation.setDeviceMetricsOverride',{...metrics,deviceScaleFactor:3});
  await page.clock.runFor(32);
  const afterDpr=await page.locator('canvas').evaluate((c:HTMLCanvasElement)=>({width:c.getBoundingClientRect().width,height:c.getBoundingClientRect().height,backing:c.width,label:c.getAttribute('aria-label')}));
  expect(afterDpr.width).toBe(beforeDpr.width);expect(afterDpr.height).toBe(beforeDpr.height);expect(afterDpr.label).toBe(beforeDpr.label);
  expect(beforeDpr.backing).toBe(Math.round(beforeDpr.width*2));expect(afterDpr.backing).toBe(Math.round(afterDpr.width*3));
  await page.clock.runFor(5000); // Include a real shell autosave while the high-DPI canvas remains paused.
  expect(await saved(page)).toEqual(before); // DPR alone cannot advance the paused fractional pose or saved history.
  await cdp.send('Emulation.clearDeviceMetricsOverride');
 }
 for(const viewport of [{width:1366,height:768},{width:844,height:390},{width:390,height:844},{width:320,height:568}]){
  await page.setViewportSize(viewport);
  // ResizeObserver is delivered by layout, independently of the installed animation clock.
  let previous='',stable=0;
  await expect.poll(async()=>{
   await page.clock.runFor(32);
   const measured=await page.evaluate(()=>{
    const c=document.querySelector('canvas') as HTMLCanvasElement,p=document.querySelector('.snake-pad')!.getBoundingClientRect(),r=c.getBoundingClientRect();
    return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,canvas:r.width,backing:c.width,padBottom:p.bottom,padRight:p.right};
   });
   const coherent=measured.width===viewport.width&&measured.height===viewport.height&&measured.backing===Math.round(measured.canvas*measured.dpr)&&measured.padBottom<viewport.height&&measured.padRight<viewport.width;
   const current=JSON.stringify(measured);stable=coherent&&current===previous?stable+1:0;previous=current;
   return stable;
  }).toBeGreaterThanOrEqual(2); // Await complete viewport, CSS, DPR, backing and control coherence after CDP reset.

  expect(await saved(page)).toEqual(before);
  const measurements=await page.evaluate(()=>{
   const canvas=document.querySelector('canvas')!,pad=document.querySelector('.snake-pad')!;
   const c=canvas.getBoundingClientRect(),p=pad.getBoundingClientRect();
   return {width:c.width,height:c.height,backing:canvas.width,dpr:devicePixelRatio,padBottom:p.bottom,padRight:p.right,overflow:document.documentElement.scrollWidth>innerWidth,
    targets:[...pad.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height};})};
  });
  expect(measurements.width).toBeCloseTo(measurements.height,0);
  expect(Math.abs(measurements.backing-Math.round(measurements.width*measurements.dpr))).toBeLessThanOrEqual(1);
  expect(measurements.padBottom).toBeLessThan(viewport.height);expect(measurements.padRight).toBeLessThan(viewport.width);
  expect(measurements.overflow).toBe(false);for(const target of measurements.targets){expect(target.width).toBeGreaterThanOrEqual(48);expect(target.height).toBeGreaterThanOrEqual(48);}
 }
});

test('OS and app reduced motion change the presentation live; cancelled swipes never enqueue a turn',async({page,context,browserName})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await setup(page);await page.clock.runFor(240);
 await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(16);
 await expect(page.locator('.snake-game')).toHaveAttribute('data-reduced-motion','true');
 await page.emulateMedia({reducedMotion:'no-preference'});await page.clock.runFor(16);
 await expect(page.locator('.snake-game')).toHaveAttribute('data-reduced-motion','false');
 const box=(await page.locator('canvas').boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
 if(browserName==='chromium'){
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-60}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
 }else {
  await page.mouse.move(x,y);await page.mouse.down();
  await page.locator('canvas').evaluate(canvas=>canvas.releasePointerCapture(1));
  await page.mouse.move(x,y-60);await page.mouse.up();
 }
 const snapshot=await pause(page);expect(snapshot.queue).toEqual([]);expect(snapshot.direction).toBe('right');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await page.locator('#motion').check();await page.getByRole('button',{name:'Close menu',exact:true}).click();
 await page.clock.runFor(32);await expect(page.locator('.snake-game')).toHaveAttribute('data-reduced-motion','true');
 expect(errors).toEqual([]);
});
