import {captureAuditEvidence} from '../helpers/audit-evidence';
import {test,expect} from '../fixtures';

type LensDiagnostics=Window&{__lensEncodes?:number};

// Building and encoding the lens for every intermediate width stalls the very
// animation it is meant to decorate, especially on a DPR3 phone. Count real
// canvas encodes, without replacing their output or skipping the glass binding.
for(const width of [390,1440])test(`auto-hide builds only the settled refraction map at ${width}px`,async({page,browserName})=>{
  test.skip(browserName!=='chromium','Only Chromium uses the SVG displacement map.');
  await page.setViewportSize({width,height:844});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveClass(/is-refracting/);
  await page.evaluate(async()=>{
    await document.fonts.ready;
    const w=window as LensDiagnostics;
    w.__lensEncodes=0;
    const encode=HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL=function(...args){w.__lensEncodes!++;return encode.apply(this,args);};
  });
  await page.evaluate(()=>scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect.poll(()=>bar.evaluate(el=>Math.round(el.getBoundingClientRect().width))).toBe(56);
  await expect.poll(()=>page.evaluate(()=>(window as LensDiagnostics).__lensEncodes)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>(window as LensDiagnostics).__lensEncodes)).toBeLessThanOrEqual(1);
  await page.evaluate(()=>{(window as LensDiagnostics).__lensEncodes=0;scrollTo(0,340);});
  await expect(bar).not.toHaveAttribute('data-minimized');
  await expect.poll(()=>bar.evaluate(el=>el.getAnimations().length)).toBe(0);
  expect(await page.evaluate(()=>(window as LensDiagnostics).__lensEncodes)).toBeLessThanOrEqual(2); // bar and companion menu
  await expect(bar).toHaveClass(/is-refracting/);
  await captureAuditEvidence(page,test.info(),'taskbar-restored');
});

for(const reducedMotion of ['no-preference','reduce'] as const)test(`landscape navigation keeps 44px touch targets without a tall dock (${reducedMotion})`,async({page})=>{
  await page.setViewportSize({width:844,height:390});
  await page.emulateMedia({reducedMotion});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  const original=await bar.boundingBox();
  expect(original!.height).toBeLessThanOrEqual(52);
  for(const tab of await bar.locator('.ui-tab').all()){
    const box=(await tab.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.evaluate(()=>scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  const mini=page.locator('.app-navigation .ui-tabbar-mini');
  await expect(mini).toHaveCSS('opacity','1');
  await mini.click();
  await expect(bar).not.toHaveAttribute('data-minimized');
  await expect.poll(()=>bar.evaluate(el=>el.getAnimations().length)).toBe(0);
  expect((await bar.boundingBox())!.height).toBeLessThanOrEqual(52);
  await page.keyboard.press('Tab');
  await bar.locator('.ui-tab').first().focus();
  await expect(bar.locator('.ui-tab').first()).toBeFocused();
  await captureAuditEvidence(page,test.info(),`taskbar-landscape-${reducedMotion}`);
});

for(const width of [390,1440])test(`reversing auto-hide keeps the latest full-size glass and navigation at ${width}px`,async({page,browserName})=>{
  await page.setViewportSize({width,height:844});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  if(browserName==='chromium')await expect(bar).toHaveClass(/is-refracting/);
  const original=(await bar.boundingBox())!;
  // Hold the actual CSS morph before its destination; reverse via the real
  // scroll listener rather than changing the data attribute from the test.
  await page.evaluate(()=>new Promise<void>(resolve=>{
    const bar=document.querySelector<HTMLElement>('.app-tabbar')!;
    const hold=(event:TransitionEvent)=>{
      if(event.target!==bar||event.propertyName!=='width')return;
      bar.removeEventListener('transitionrun',hold);
      for(const animation of bar.getAnimations())if(animation instanceof CSSTransition){animation.pause();animation.currentTime=80;}
      requestAnimationFrame(()=>resolve());
    };
    bar.addEventListener('transitionrun',hold);
    scrollTo(0,400);
  }));
  await expect(bar).toHaveAttribute('data-minimized','true');
  expect((await bar.boundingBox())!.width).toBeLessThan(original.width);
  await page.evaluate(()=>scrollTo(0,340));
  await expect(bar).not.toHaveAttribute('data-minimized');
  await expect.poll(()=>bar.evaluate(el=>el.getAnimations().length)).toBe(0);
  expect((await bar.boundingBox())!.width).toBeCloseTo(original.width,0);
  await expect(bar.locator('.ui-tab').first()).toHaveCSS('opacity','1');
  if(browserName==='chromium'){
    await expect.poll(()=>bar.evaluate(el=>{
      const id=el.style.getPropertyValue('--ui-glass-filter').match(/#([^)]*)/)?.[1];
      const image=id?document.getElementById(id)?.querySelector('feImage'):null;
      return image?.getAttribute('width');
    })).toBe(String(Math.round(original.width)));
  }
});

// A reset can cancel the morph directly to the already-encoded starting size
// (for example when reduced motion takes effect). No new PNG is needed, but
// the live SVG geometry must not retain the interrupted, narrower dimensions.
test('canceling a morph to its cached size restores both map and filter bounds',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Only Chromium uses the SVG displacement map.');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveClass(/is-refracting/);
  const geometry=()=>bar.evaluate(el=>{
    const id=el.style.getPropertyValue('--ui-glass-filter').match(/#([^)]*)/)?.[1];
    const filter=id?document.getElementById(id):null;
    const image=filter?.querySelector('feImage');
    return {filter:[filter?.getAttribute('width'),filter?.getAttribute('height')],image:[image?.getAttribute('width'),image?.getAttribute('height')]};
  });
  const original=await geometry();
  await page.evaluate(()=>{
    const w=window as LensDiagnostics;w.__lensEncodes=0;
    const encode=HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL=function(...args){w.__lensEncodes!++;return encode.apply(this,args);};
  });
  await bar.evaluate(el=>new Promise<void>(resolve=>{
    const hold=(event:Event)=>{
      if(event.target!==el||(event as TransitionEvent).propertyName!=='width')return;
      el.removeEventListener('transitionrun',hold);
      for(const animation of el.getAnimations())if(animation instanceof CSSTransition){animation.pause();animation.currentTime=80;}
      requestAnimationFrame(()=>resolve());
    };
    el.addEventListener('transitionrun',hold);
    el.setAttribute('data-minimized','true');
  }));
  await expect.poll(geometry).not.toEqual(original);
  // Exercise a same-frame, instant reset of the real glass binding, without
  // passing through a second size transition that could hide the cache bug.
  await bar.evaluate(el=>{el.style.transition='none';el.removeAttribute('data-minimized');});
  await expect.poll(geometry).toEqual(original);
  expect(await page.evaluate(()=>(window as LensDiagnostics).__lensEncodes)).toBe(0);
});
