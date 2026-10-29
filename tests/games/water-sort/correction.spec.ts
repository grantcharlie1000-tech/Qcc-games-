import {test,expect} from '../../fixtures';
import type {Page} from '@playwright/test';
const root=(page:Page)=>page.locator('.ws-game');
const tube=(page:Page,n:number)=>page.locator(`.ws-tube[data-tube="${n}"]`);
const volume=(page:Page,n:number)=>tube(page,n).locator('[data-units]').evaluateAll(nodes=>nodes.reduce((total,node)=>total+Number((node as HTMLElement).dataset.units),0));
async function open(page:Page){await page.goto('/#/game/water-sort');await expect(root(page)).toHaveAttribute('data-phase','ready');}

test('travelling glass pours level liquid into destination, pause retains the same transaction, and returns once',async({page})=>{
  await page.clock.install();await open(page);await page.clock.pauseAt(new Date(Date.now()+100));
  const original=await tube(page,0).locator('.ws-glass').boundingBox();
  await tube(page,0).click();await tube(page,2).click();
  await page.clock.runFor(700);
  await expect(root(page)).toHaveAttribute('data-pour-phase','flow');
  const source=await volume(page,0),target=await volume(page,2);
  expect(source).toBeLessThan(4);expect(target).toBeGreaterThan(0);expect(source+target).toBeCloseTo(4,3);
  const moving=await tube(page,0).locator('.ws-glass').boundingBox();
  expect(Math.abs(moving!.x-original!.x)+Math.abs(moving!.y-original!.y)).toBeGreaterThan(20);
  const horizontal=await tube(page,0).locator('.ws-liquid polygon').evaluateAll(nodes=>nodes.every(node=>{
    const polygon=node as SVGPolygonElement,matrix=polygon.getScreenCTM()!;
    const points=Array.from(polygon.points).map(p=>new DOMPoint(p.x,p.y).matrixTransform(matrix));
    const min=Math.min(...points.map(p=>p.y));return points.filter(p=>Math.abs(p.y-min)<.02).length>=2;
  }));expect(horizontal).toBe(true);
  await expect(page.locator('.ws-stream')).toHaveCSS('opacity','1');
  const streamLine=await page.locator('.ws-stream path').evaluate(node=>{
    const p=node as SVGPathElement,a=p.getPointAtLength(0),b=p.getPointAtLength(p.getTotalLength());return{x1:a.x,x2:b.x,y1:a.y,y2:b.y};
  });
  expect(streamLine.x1).toBeCloseTo(streamLine.x2,1);expect(streamLine.y1).toBeLessThan(streamLine.y2);
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  await page.clock.runFor(3000);
  expect(await volume(page,0)).toBeCloseTo(source,4);expect(await volume(page,2)).toBeCloseTo(target,4);
  await page.getByRole('button',{name:'Keep playing',exact:true}).click();
  await page.clock.runFor(1000);
  await expect(root(page)).toHaveAttribute('data-moves','1');await expect(root(page)).toHaveAttribute('data-phase','ready');
  const returned=await tube(page,0).locator('.ws-glass').boundingBox();expect(returned!.x).toBeCloseTo(original!.x,1);expect(returned!.y).toBeCloseTo(original!.y,1);
  await page.clock.runFor(3000);await expect(root(page)).toHaveAttribute('data-moves','1');
});

test('native keyboard source and destination selection ignores held Enter and survives a cancelled pointer',async({page})=>{
  await open(page);await tube(page,0).focus();await page.keyboard.press('Enter');
  await page.keyboard.down('Enter');await page.keyboard.down('Enter');await page.keyboard.up('Enter');
  // The first non-repeated press clears selection; the repeated press must not select again.
  await expect(tube(page,0)).toHaveAttribute('aria-pressed','false');
  await tube(page,0).dispatchEvent('pointerdown',{pointerId:44,isPrimary:true,button:0,clientX:30,clientY:300});
  await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointercancel',{pointerId:44})));
  await tube(page,2).dispatchEvent('pointerup',{pointerId:44,isPrimary:true,button:0,clientX:200,clientY:500});
  await expect(root(page)).toHaveAttribute('data-moves','0');
  await tube(page,0).focus();await page.keyboard.press('Space');await page.keyboard.press('ArrowDown');
  await expect(tube(page,2)).toBeFocused();await page.keyboard.press('Enter');
  await expect(root(page)).toHaveAttribute('data-moves','1');
  await expect(tube(page,2)).toBeFocused();
});

for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1366,height:768}]){
  test(`open scene and all seven tubes fit ${viewport.width}x${viewport.height}`,async({page})=>{
    await page.setViewportSize(viewport);await open(page);
    await page.getByRole('combobox',{name:'Level',exact:true}).selectOption('7');
    await expect(page.locator('.ws-tube')).toHaveCount(7);
    const boxes=await page.locator('.ws-tube').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
    for(const box of boxes){expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(76);expect(box.right).toBeLessThanOrEqual(viewport.width);expect(box.bottom).toBeLessThanOrEqual(viewport.height-55);}
    expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
    await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Hint',exact:true})).toBeVisible();
    await page.screenshot({path:`tests/games/water-sort/evidence/correction-${viewport.width}x${viewport.height}.png`});
  });
}

test('reduced motion transfers legal volume gently without moving glass',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await open(page);
  await tube(page,0).click();await tube(page,2).click();
  await expect(root(page)).toHaveAttribute('data-moves','1');
  expect(await volume(page,0)+await volume(page,2)).toBeCloseTo(4,3);
  await expect(tube(page,0).locator('.ws-glass')).toHaveCSS('transform','none');
});

test('Study retains a partially transferred pour and resumes the same game instance',async({page})=>{
  await page.clock.install();await open(page);await page.clock.pauseAt(new Date(Date.now()+100));
  const retained=await root(page).elementHandle();
  await tube(page,0).click();await tube(page,2).click();await page.clock.runFor(700);
  const before=await volume(page,2);expect(before).toBeGreaterThan(0);
  await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
  await page.clock.runFor(5000);
  expect(await volume(page,2)).toBeCloseTo(before,4);
  await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();
  expect(await retained!.evaluate(node=>node===document.querySelector('.ws-game'))).toBe(true);
  await page.clock.runFor(1000);await expect(root(page)).toHaveAttribute('data-moves','1');
});

test('optional drag captures real pointer moves and release outside the source before pouring',async({page})=>{
  await open(page);
  const source=await tube(page,0).elementHandle(),a=(await tube(page,0).boundingBox())!,b=(await tube(page,2).boundingBox())!;
  await source!.evaluate(el=>{
    const trace={id:-1,moves:0,up:false};(window as unknown as {waterCapture:typeof trace}).waterCapture=trace;
    el.addEventListener('pointerdown',event=>{trace.id=(event as PointerEvent).pointerId;});
    el.addEventListener('pointermove',event=>{if(event.target===el&&(event as PointerEvent).buttons===1)trace.moves++;});
    el.addEventListener('pointerup',event=>{trace.up=event.target===el;});
  });
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  const id=await page.evaluate(()=>(window as unknown as {waterCapture:{id:number}}).waterCapture.id);
  expect(await source!.evaluate((el,id)=>el.hasPointerCapture(id),id)).toBe(true);
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});
  expect(await page.evaluate(()=>(window as unknown as {waterCapture:{moves:number}}).waterCapture.moves)).toBeGreaterThan(0);
  await page.mouse.up();
  expect(await page.evaluate(()=>(window as unknown as {waterCapture:{up:boolean}}).waterCapture.up)).toBe(true);
  expect(await source!.evaluate((el,id)=>el.hasPointerCapture(id),id)).toBe(false);
  await expect(root(page)).toHaveAttribute('data-moves','1');
});

test('cancel, lost capture, blur, resize, pause and disposal release drag capture without pouring',async({page})=>{
  await open(page);
  for(const reason of ['cancel','pending','lost','blur','resize','resize-same-field','pause','dispose']){
    const source=await tube(page,0).elementHandle(),a=(await tube(page,0).boundingBox())!,b=(await tube(page,2).boundingBox())!;
    await source!.evaluate(el=>el.addEventListener('pointerdown',event=>{(window as unknown as {waterPointerId:number}).waterPointerId=(event as PointerEvent).pointerId;},{once:true}));
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
    if(reason!=='pending')await page.mouse.move(a.x+a.width/2+1,a.y+a.height/2);
    const id=await page.evaluate(()=>(window as unknown as {waterPointerId:number}).waterPointerId);
    expect(await source!.evaluate((el,id)=>el.hasPointerCapture(id),id),reason).toBe(true);
    if(reason==='cancel')await tube(page,0).dispatchEvent('pointercancel',{pointerId:id});
    if(reason==='lost'||reason==='pending')await source!.evaluate((el,id)=>el.releasePointerCapture(id),id);
    if(reason==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    if(reason==='resize')await page.setViewportSize({width:1200,height:800});
    if(reason==='resize-same-field')await page.setViewportSize({width:1210,height:800});
    // Viewport changes and ResizeObserver notifications are asynchronous. Wait
    // for cancellation before sending the next native move/up sequence.
    if(reason.startsWith('resize'))await expect.poll(()=>source!.evaluate((el,id)=>el.hasPointerCapture(id),id),{message:reason}).toBe(false);
    if(reason==='pause')await page.getByRole('button',{name:'Pause game',exact:true}).evaluate(el=>(el as HTMLButtonElement).click());
    if(reason==='dispose')await page.evaluate(()=>{location.hash='#/';});
    await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:3});
    expect(await source!.evaluate((el,id)=>el.hasPointerCapture(id),id),reason).toBe(false);
    await page.mouse.up();
    if(reason==='pause')await page.getByRole('button',{name:'Keep playing',exact:true}).click();
    if(reason==='dispose'){await expect(root(page)).toHaveCount(0);await open(page);}
    await expect(root(page),reason).toHaveAttribute('data-moves','0');
    await expect(root(page),reason).toHaveAttribute('data-phase','ready');
    expect(await volume(page,0),reason).toBe(4);expect(await volume(page,2),reason).toBe(0);
    if(reason==='cancel'){
      await tube(page,0).focus();await page.keyboard.press('Enter');await expect(tube(page,0)).toHaveAttribute('aria-pressed','true');
      await page.keyboard.press('Enter');await expect(tube(page,0)).toHaveAttribute('aria-pressed','false');
    }
  }
  // A cancelled captured drag must not swallow the next native keyboard click.
  await tube(page,0).focus();await page.keyboard.press('Enter');await expect(tube(page,0)).toHaveAttribute('aria-pressed','true');
});
