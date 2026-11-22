import {expect,test} from '../fixtures';

// MOTION-5 (#24): the MOTION-4 release specs (section-lens.spec.ts) make the new selection in place, so the Games scene and its
// lens stay up. A real drag let go over Movies also changes the route (Charlie's video turns the page to Library at the lift,
// 15.183 s), and the new route can tear the Games bar's WebGL lens down while its raised bubble is still falling. Through that
// change no section bar may pop its bubble (a visible bar's lift never drops by more than a third in a frame, with the CSS
// timeline at .1x), no other bar may show a raised bubble it was never pressed into, and nothing may be left raised, pressed
// or dragging once the route has settled.
test('a drag release that changes the route lets the lens fall without a pop and leaves nothing raised',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the timeline is slowed through the Chromium DevTools protocol');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const games=bar.getByRole('link',{name:'Games',exact:true}), movies=bar.getByRole('link',{name:'Movies',exact:true});
  await expect(games).toHaveAttribute('aria-current','page');
  const from=(await games.boundingBox())!, to=(await movies.boundingBox())!;
  const y=from.y+from.height/2;
  await page.mouse.move(from.x+from.width/2,y);
  await page.mouse.down();
  await page.mouse.move(to.x+to.width/2,y,{steps:6});
  await expect(bar).toHaveAttribute('data-pill-dragging','');
  await expect.poll(()=>bar.locator('canvas.section-lens').evaluate(el=>(el as HTMLCanvasElement).style.getPropertyValue('--section-lens-pad-x'))).not.toBe('');
  await page.waitForTimeout(300);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Animation.enable');
  await cdp.send('Animation.setPlaybackRate',{playbackRate:.1});
  await page.evaluate(()=>{
    type Sample={t:number;bars:{origin:boolean;lift:number;pad:string}[]};
    const w=window as Window&{__trace?:Sample[];__released?:number};
    document.querySelector('.app-tabbar')!.setAttribute('data-route-origin','');
    w.__trace=[];
    addEventListener('pointerup',()=>{w.__released??=performance.now();},{capture:true,once:true});
    const end=performance.now()+2600;
    const sample=()=>{
      const t=performance.now();
      const bars=[...document.querySelectorAll<HTMLElement>('.section-tabbar')].filter(el=>el.isConnected&&el.getBoundingClientRect().width>0&&getComputedStyle(el).visibility!=='hidden').map(el=>{
        const scale=getComputedStyle(el,'::after').scale;
        const [sx,sy=sx]=scale==='none'?[1]:scale.split(' ').map(Number);
        const lens=el.querySelector<HTMLCanvasElement>('canvas.section-lens');
        return {origin:el.hasAttribute('data-route-origin'),lift:Math.min(1,Math.max(0,(sx*sy-1.07)/.18)),pad:lens?.style.getPropertyValue('--section-lens-pad-x')??''};
      });
      w.__trace!.push({t,bars});
      if(t<end)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(2800);
  await cdp.send('Animation.setPlaybackRate',{playbackRate:1});
  await expect(page).toHaveURL(/#\/movies\/browse\/movie$/);
  const {trace,released}=await page.evaluate(()=>{
    const w=window as Window&{__trace?:{t:number;bars:{origin:boolean;lift:number;pad:string}[]}[];__released?:number};
    return {trace:w.__trace!,released:w.__released!};
  });
  const before=trace.filter(sample=>sample.t<released), after=trace.filter(sample=>sample.t>=released);
  expect(before.at(-1)?.bars.find(entry=>entry.origin)?.lift,'held lift').toBe(1);
  expect(after.length).toBeGreaterThan(8);
  // The Games bar's bubble, while that bar is still on screen, falls on the release spring: no step of more than a third.
  const origin=after.map(sample=>sample.bars.find(entry=>entry.origin)?.lift).filter((lift):lift is number=>lift!==undefined);
  expect(origin[0]??0,JSON.stringify(origin)).toBeGreaterThan(.6);
  expect(Math.max(0,...origin.slice(1).map((lift,i)=>origin[i]-lift)),JSON.stringify(origin)).toBeLessThanOrEqual(.3);
  // A bar the route brings in was never pressed, so it never shows a raised bubble.
  const others=after.flatMap(sample=>sample.bars.filter(entry=>!entry.origin));
  expect(others.filter(entry=>entry.lift>0||entry.pad!==''),JSON.stringify(others.slice(0,6))).toEqual([]);
  // Once the route has settled, every section bar is flat: not pressed or dragging, no swell, and no raised lens on show. A bar
  // the route has hidden keeps its last lens frame on a canvas the stylesheet hides until its next fresh draw
  // (section-navigation.css: visible only under data-section-lens=webgl), so a raised pad there is never seen.
  await page.waitForTimeout(700);
  const settled=await page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.section-tabbar')].map(el=>{
    const lens=el.querySelector<HTMLCanvasElement>('canvas.section-lens');
    return {pressing:el.hasAttribute('data-pressing'),dragging:el.hasAttribute('data-pill-dragging'),scale:getComputedStyle(el,'::after').scale,
      raised:!!lens&&getComputedStyle(lens).visibility!=='hidden'&&lens.style.getPropertyValue('--section-lens-pad-x')!==''};
  }));
  expect(settled.length).toBeGreaterThan(0);
  for(const entry of settled)expect(entry,JSON.stringify(settled)).toEqual({pressing:false,dragging:false,scale:'none',raised:false});
});
