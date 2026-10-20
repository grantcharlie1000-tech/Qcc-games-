import {test,expect,type Page} from '../../fixtures';
import {advance,createState,enqueue,type SnakeState} from '../../../src/games/snake/model';
import type {savePresentation} from '../../../src/games/snake/presentation';

type Snapshot=SnakeState&{presentation:ReturnType<typeof savePresentation>};
const saved=async(page:Page):Promise<Snapshot>=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:snake')!).data);
const pixels=(page:Page)=>page.locator('canvas').evaluate((canvas:HTMLCanvasElement)=>canvas.toDataURL());
async function setup(page:Page){
 await page.clock.install({time:new Date('2026-10-20T10:00:00Z')});
 await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
 await page.goto('/#/game/snake');
 await page.evaluate(()=>document.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest('button');
  if(button?.classList.contains('snake-start'))(window as unknown as {snakeTestStart:number}).snakeTestStart=performance.now();
  if(button?.id==='pause-game')(window as unknown as {snakeTestPause:number}).snakeTestPause=performance.now();
 },true));
 await page.getByRole('button',{name:'Start slithering',exact:true}).click();
 await page.clock.runFor(20); // Establish the RAF timestamp; no simulation tick yet.
}
async function pause(page:Page){await page.getByRole('button',{name:'Pause game',exact:true}).click();return saved(page);}

test('continuous authoritative travel, junction-buffered turn, frozen v2 save and growth reload',async({page})=>{
 await setup(page);await page.clock.runFor(80);
 const a=await pixels(page);await page.clock.runFor(32);const b=await pixels(page);expect(b).not.toBe(a); // The authoritative head moves within an executing leg, without waiting for its endpoint.
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
 expect(turned.body[0].x).toBe(6);expect(turned.body[0].y).toBeLessThan(6);expect(turned.body[0].y).toBeGreaterThan(5);expect(await pixels(page)).not.toBe(restoredFrozen);
 // Save inside the apple/growth interval, including the active 200 ms feedback.
 await page.getByRole('button',{name:'Restart game',exact:true}).click();
 await page.getByRole('button',{name:'Start slithering',exact:true}).click();
 await page.clock.runFor(620);const grown=await pause(page);
 expect(grown.score).toBe(10);expect(grown.segments).toBe(4);
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
  const baseline=await target.evaluate(()=>(window as unknown as {snakeTestStart:number}).snakeTestStart);
  expect(Number.isFinite(baseline)).toBe(true);
  if(droppedFrame)await target.clock.fastForward(400);else await target.clock.runFor(400);
  const snapshot=await pause(target);
  const times=await target.evaluate(()=>(window as unknown as {snakeTestFrames:number[]}).snakeTestFrames);
  const delivered=await target.evaluate(()=>(window as unknown as {snakeTestPause:number}).snakeTestPause)-baseline; // Pause flushes elapsed time after the last delivered RAF too.
  const reference:SnakeState={...createState(),phase:'running'};enqueue(reference,'up');enqueue(reference,'left');advance(reference,delivered);
  const {presentation,...grid}=snapshot;
  expect(grid.phase).toBe(reference.phase);expect(grid.direction).toBe(reference.direction);expect(grid.queue).toEqual(reference.queue);
  expect(grid.score).toBe(reference.score);expect(grid.seed).toBe(reference.seed);expect(grid.segments).toBe(reference.segments);
  expect(grid.elapsed).toBeCloseTo(reference.elapsed,8);expect(grid.time).toBeCloseTo(delivered,8);expect(grid.growth).toBeCloseTo(reference.growth,8);
  expect(grid.body.length).toBe(reference.body.length);grid.body.forEach((p,i)=>{expect(p.x).toBeCloseTo(reference.body[i].x,8);expect(p.y).toBeCloseTo(reference.body[i].y,8);}); // Floating arithmetic tolerance only; actual delivered duration remains authoritative.
  expect(snapshot.ticks).toBe(2);
  return {snapshot,delivered,count:times.length};
 }
 const steady=await scenario(page,false);
 const context=await browser.newContext();
 await context.addInitScript(()=>sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading'));
 const dropped=await context.newPage();const skipped=await scenario(dropped,true);
 expect(steady.count).toBeGreaterThan(20);expect(skipped.count).toBeLessThan(steady.count/2);
 expect(skipped.snapshot.body[0].y).toBe(steady.snapshot.body[0].y); // Both execute the same horizontal leg; x differs exactly with active event time.
 expect(skipped.snapshot.direction).toBe(steady.snapshot.direction);
 expect(skipped.snapshot.ticks).toBe(steady.snapshot.ticks);expect(skipped.snapshot.queue).toEqual(steady.snapshot.queue);
 expect(skipped.snapshot.presentation).toEqual(steady.snapshot.presentation);
 expect(skipped.snapshot.body[0].x-steady.snapshot.body[0].x).toBeCloseTo(-(skipped.delivered-steady.delivered)/160,8);
 expect(skipped.snapshot.elapsed-steady.snapshot.elapsed).toBeCloseTo(skipped.delivered-steady.delivered,8);
 await context.close();
});

test('real input after stalled RAF cannot retarget a past junction or escape an earlier collision',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{
  const request=window.requestAnimationFrame.bind(window);
  const pending:FrameRequestCallback[]=[];(window as unknown as {snakeTestStaleFrames:FrameRequestCallback[]}).snakeTestStaleFrames=pending;
  window.requestAnimationFrame=callback=>request(()=>{pending.push(callback);}); // Suppress delivery after the one already-scheduled game frame.
 });
 await page.clock.runFor(230);
 await page.keyboard.press('ArrowUp');
 // Deliver a genuinely stale captured RAF after the event flush. It must never rewind the baseline.
 await page.evaluate(()=>{for(const callback of (window as unknown as {snakeTestStaleFrames:FrameRequestCallback[]}).snakeTestStaleFrames.splice(0))callback(50);});
 await page.clock.runFor(20);await page.keyboard.press('ArrowLeft');
 await page.evaluate(()=>document.querySelector<HTMLButtonElement>('#pause-game')!.click());
 const late=await saved(page);expect(late.time).toBeCloseTo(270,8);expect(late.ticks).toBe(1);
 expect(late.body[0].x).toBeCloseTo(5+270/160,8);expect(late.body[0].y).toBe(6);expect(late.direction).toBe('right');expect(late.queue).toEqual(['up','left']);
 await page.evaluate(()=>{document.querySelector<HTMLButtonElement>('#restart-game')!.click();document.querySelector<HTMLButtonElement>('.snake-start')!.click();});
 await page.clock.runFor(2000);await page.keyboard.press('ArrowUp');
 await expect(page.getByRole('button',{name:'Play again',exact:true})).toBeVisible();
 const ended=await saved(page);expect(ended.phase).toBe('lost');expect(ended.direction).toBe('right');expect(ended.queue).toEqual([]);
 expect(ended.body[0].x).toBeCloseTo(15.1,8);
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
   const radius=getComputedStyle(canvas).borderTopLeftRadius;
   const values=[...radius.matchAll(/([\d.]+)(px|%)/g)].map(match=>Number(match[1])*(match[2]==='%'?c.width/100:1));
   const corner=Math.min(...values);
   const rim=getComputedStyle(document.querySelector('.snake-garden')!,'::after').display;
   return {width:c.width,height:c.height,backing:canvas.width,dpr:devicePixelRatio,corner,rim,padBottom:p.bottom,padRight:p.right,overflow:document.documentElement.scrollWidth>innerWidth,
    targets:[...pad.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {width:r.width,height:r.height};})};
  });
  expect(measurements.width).toBeCloseTo(measurements.height,0);expect(measurements.corner).toBeLessThanOrEqual(measurements.width/32+1e-6);expect(measurements.rim).toBe('none');
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
