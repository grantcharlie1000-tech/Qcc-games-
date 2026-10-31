import {test,expect} from '../fixtures';
import type {Locator,Page} from '@playwright/test';

// The frost as the browser applies it. In Chromium's backdrop it is the lens's backdrop-filter. In the frost the lens is absent, and the
// frost is the bar's own backdrop-filter.
async function frostFilter(bar:Locator):Promise<string>{
  return bar.evaluate(el=>getComputedStyle(el.querySelector('.ui-glass-lens')??el).backdropFilter);
}

// The alpha of a computed rgba colour. The pill is at least 12% white, so the tests read its alpha and not one exact value.
const alphaOf=(rgba:string)=>{const parts=rgba.match(/[\d.]+/g)?.map(Number)??[];return parts.length===4?parts[3]:(parts.length===3?1:0);};

// The island as Liquid Glass: the selection pill, the press, the Chromium refraction and the liquid exit and entry.
test.beforeEach(async({page})=>{
  await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

// The centre of the pill, from its computed translate and width. The pill is the bar's ::after.
function pillCentre(bar:Locator){
  return bar.evaluate(el=>{
    const pill=getComputedStyle(el,'::after');
    const box=el.getBoundingClientRect();
    return box.left+el.clientLeft+parseFloat(pill.translate)+parseFloat(pill.width)/2;
  });
}
function centreOf(target:Locator){
  return target.evaluate(el=>{const box=el.getBoundingClientRect();return box.left+box.width/2;});
}
// The tab's box once it is on screen. Movies mounts its island after the route loads, so the box waits for it.
async function boxOf(target:Locator){
  await expect(target).toBeVisible();
  // A Movies render can detach the nav for a moment, so wait for a box rather than read one once.
  const boxes:{x:number;y:number;width:number;height:number}[]=[];
  await expect.poll(async()=>{const found=await target.boundingBox();if(found)boxes.push(found);return boxes.length>0;}).toBe(true);
  return boxes[0];
}
// The pill sits under the tab when its centre is within 2 px of the tab's centre.
async function expectPillUnder(bar:Locator,tab:Locator){
  await expect.poll(async()=>Math.abs((await pillCentre(bar))-(await centreOf(tab)))).toBeLessThanOrEqual(2);
}
const oneFrame=(page:import('@playwright/test').Page)=>page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));

// What the island paints now. The frost and the off bars are their own body, so their opacity is what shows. A backdrop bar keeps its opacity at 1
// while its lens and layers fade, so its most opaque layer (the lens, the pill or a tab) is what shows.
const barShown=(bar:Locator)=>bar.evaluate(el=>{
  if(el.getAttribute('data-glass')!=='backdrop')return Number(getComputedStyle(el).opacity);
  const lens=el.querySelector('.ui-glass-lens');
  const layers=[getComputedStyle(el,'::before').opacity,getComputedStyle(el,'::after').opacity,...(lens?[getComputedStyle(lens).opacity]:[]),...[...el.querySelectorAll('.ui-tab')].map(tab=>getComputedStyle(tab).opacity)];
  return Number(getComputedStyle(el).opacity)*Math.max(...layers.map(Number));
});
// The capsule's own opacity.
const capsuleShown=(page:Page)=>page.locator('.ui-tabbar-mini').evaluate(el=>Number(getComputedStyle(el).opacity));
// The transition one property runs on an element in its current state: its duration, delay and timing function.
const transitionOf=(target:Locator,property:string)=>target.evaluate((el,name)=>{
  const style=getComputedStyle(el),index=style.transitionProperty.split(', ').indexOf(name);
  if(index<0)return null;
  return {duration:style.transitionDuration.split(', ')[index],delay:style.transitionDelay.split(', ')[index],curve:style.transitionTimingFunction.match(/cubic-bezier\([^)]*\)|linear\([^)]*\)|[a-z-]+/g)?.[index]};
},property);
// Pauses the island's transitions at a moment, so a frame can be read there. The island and the capsule run no other animation.
// It returns how many transitions it paused, so a check can tell that the morph was still running.
const seekIsland=(page:Page,ms:number)=>page.evaluate(time=>{
  void document.body.offsetHeight;
  let paused=0;
  for(const animation of document.getAnimations()){
    const target=(animation.effect as KeyframeEffect|null)?.target;
    if(!(animation instanceof CSSTransition)||!(target instanceof Element)||!target.closest('.app-tabbar,.ui-tabbar-mini'))continue;
    animation.pause();
    animation.currentTime=time;
    paused++;
  }
  return paused;
},ms);
// The island's and the capsule's boxes, once no transition runs on either.
async function settledBoxes(page:Page){
  const bar=page.locator('.app-tabbar'),capsule=page.locator('.ui-tabbar-mini');
  await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(animation=>{
    const target=(animation.effect as KeyframeEffect|null)?.target;
    return target instanceof Element&&!!target.closest('.app-tabbar,.ui-tabbar-mini');
  }).length)).toBe(0);
  return {bar:(await bar.boundingBox())!,capsule:(await capsule.boundingBox())!};
}
for(const width of [390,1440]) test(`the arcade pill sits under Games at ${width}px, and the bar holds only its tabs`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  await expectPillUnder(bar,bar.locator('[aria-current="page"]'));
  // The lens and the glow are the bar's layers, so the tabs are the children that are neither.
  expect(await bar.evaluate(el=>[...el.children].filter(child=>!child.classList.contains('ui-glass-lens')&&!child.classList.contains('ui-glass-glow')).length)).toBe(6);
});

for(const width of [390,1440]) test(`the Movies pill sits under Home at ${width}px, and the bar holds only its tabs`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  await expect(bar).toBeVisible();
  await expectPillUnder(bar,bar.locator('[aria-pressed="true"]'));
  expect(await bar.evaluate(el=>[...el.children].filter(child=>!child.classList.contains('ui-glass-lens')&&!child.classList.contains('ui-glass-glow')).length)).toBe(5);
});

test('the Movies pill slides to the section chosen',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const tv=bar.locator('[data-kind="tv"]');
  await expectPillUnder(bar,bar.locator('[aria-pressed="true"]'));
  await tv.click();
  await expect(tv).toHaveAttribute('aria-pressed','true');
  await expectPillUnder(bar,tv);
});

test('the Movies pill survives a re-render of the page',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies/browse/movie');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const movie=bar.locator('[data-kind="movie"]');
  await expect(movie).toHaveAttribute('aria-pressed','true');
  const before=await movie.elementHandle();
  // Search updates its results in place, so a route change is what renders the page again. Each render rebuilds the nav, so the tab
  // element the test started with is gone, and the pill must find the new one.
  await page.evaluate(()=>{location.hash='#/movies';});
  await expect(bar.locator('[data-kind="movie"]')).not.toHaveAttribute('aria-pressed','true');
  await page.evaluate(()=>{location.hash='#/movies/browse/movie';});
  await expect(bar.locator('[data-kind="movie"]')).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>before!.evaluate(el=>el.isConnected)).toBe(false);
  await expectPillUnder(bar,bar.locator('[aria-pressed="true"]'));
});

test('the pill appears under the current tab on load without sliding in from the edge',async({page})=>{
  await page.addInitScript(()=>{
    const w=window as Window&{__pillX?:string[]};
    w.__pillX=[];
    const sample=()=>{
      const bar=document.querySelector('.app-tabbar');
      if(bar)w.__pillX!.push(getComputedStyle(bar,'::after').translate);
      if(performance.now()<2500)requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const games=bar.locator('[aria-current="page"]');
  await expectPillUnder(bar,games);
  const samples=await page.evaluate(()=>(window as Window&{__pillX?:string[]}).__pillX??[]);
  const xs=samples.map(sample=>parseFloat(sample)).filter(x=>Number.isFinite(x));
  const target=xs[xs.length-1];
  expect(Math.abs(target-await games.evaluate(el=>(el as HTMLElement).offsetLeft))).toBeLessThan(1);
  // Each sample is either the unplaced pill at 0 or already at its target. A value in between is a slide.
  expect(xs.filter(x=>Math.abs(x)>0.5&&Math.abs(x-target)>0.5)).toEqual([]);
});

test('a press moves the pill under the finger and swells it, and release takes the swell away',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const tv=bar.locator('[data-kind="tv"]');
  await expectPillUnder(bar,bar.locator('[aria-pressed="true"]'));
  const box=await boxOf(tv);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await expectPillUnder(bar,tv);
  await expect.poll(()=>bar.evaluate(el=>getComputedStyle(el,'::after').scale)).toBe('1.1 1.14');
  await page.mouse.up();
  await expect(bar).not.toHaveAttribute('data-pressing');
  // The tap selects the TV tab, so the pill stays under it.
  await expect(tv).toHaveAttribute('aria-pressed','true');
  await expectPillUnder(bar,tv);
  await expect.poll(()=>bar.evaluate(el=>getComputedStyle(el,'::after').scale)).toBe('none');
});

test('a press that slides off the tab springs the pill back and selects nothing',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const home=bar.locator('[data-kind="all"]');
  const tv=bar.locator('[data-kind="tv"]');
  const box=await boxOf(tv);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await expectPillUnder(bar,tv);
  await page.mouse.move(box.x+box.width/2,40,{steps:4});
  await page.mouse.up();
  await expect(bar).not.toHaveAttribute('data-pressing');
  await expectPillUnder(bar,home);
  await expect(home).toHaveAttribute('aria-pressed','true');
  await expect(page).toHaveURL(/#\/movies$/);
});

test('keyboard activation moves the pill but never swells it',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const tv=bar.locator('[data-kind="tv"]');
  await expect(bar).toBeVisible();
  await page.evaluate(()=>{
    const w=window as Window&{__sawPressing?:boolean};
    w.__sawPressing=false;
    const nav=document.querySelector('nav.movies-mobile-nav')!;
    new MutationObserver(()=>{if(nav.hasAttribute('data-pressing'))w.__sawPressing=true;}).observe(nav,{attributes:true,attributeFilter:['data-pressing']});
  });
  await tv.focus();
  await page.keyboard.press('Enter');
  await expect(tv).toHaveAttribute('aria-pressed','true');
  await expectPillUnder(bar,tv);
  expect(await page.evaluate(()=>(window as Window&{__sawPressing?:boolean}).__sawPressing)).toBe(false);
});

test('the island shrinks in 300 ms on the drawer curve, its glass fades from 120 to 240 ms, and its tabs fade in the first 80 ms',async({page,browserName})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const tab=bar.locator('[aria-current="page"]');
  const capsule=page.locator('.ui-tabbar-mini');
  const icon=capsule.locator('.ui-icon');
  await expect(bar).toBeVisible();
  // At rest the island is expanded, and these are the transitions it runs when it expands: its glass returns in the first 100 ms.
  expect(await transitionOf(bar,'translate')).toEqual({duration:'0.3s',delay:'0s',curve:'cubic-bezier(0.32, 0.72, 0, 1)'});
  expect(await transitionOf(bar,'scale')).toEqual({duration:'0.3s',delay:'0s',curve:'cubic-bezier(0.32, 0.72, 0, 1)'});
  expect(await transitionOf(bar,'opacity')).toMatchObject({duration:'0.1s',delay:'0s'});
  expect(await transitionOf(tab,'opacity')).toMatchObject({duration:'0.16s',delay:'0.14s'});
  // The capsule fades out in 120 ms, riding the island's leading edge, and takes its stretched size only once it is gone. Its icon holds until then.
  expect(await transitionOf(capsule,'opacity')).toMatchObject({duration:'0.12s',delay:'0s'});
  expect(await transitionOf(capsule,'translate')).toEqual({duration:'0.3s',delay:'0s',curve:'cubic-bezier(0.32, 0.72, 0, 1)'});
  expect(await transitionOf(capsule,'scale')).toMatchObject({duration:'0s',delay:'0.12s'});
  expect(await transitionOf(icon,'opacity')).toMatchObject({duration:'0s',delay:'0.12s'});
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  // Minimized, these are the transitions it runs on the way down.
  expect(await transitionOf(bar,'translate')).toEqual({duration:'0.3s',delay:'0s',curve:'cubic-bezier(0.32, 0.72, 0, 1)'});
  expect(await transitionOf(bar,'scale')).toEqual({duration:'0.3s',delay:'0s',curve:'cubic-bezier(0.32, 0.72, 0, 1)'});
  expect(await transitionOf(bar,'opacity')).toMatchObject({duration:'0.12s',delay:'0.12s'});
  expect(await transitionOf(tab,'opacity')).toMatchObject({duration:'0.08s',delay:'0s'});
  // In Chromium the lens fades in the first 80 ms, before the bar narrows.
  if(browserName==='chromium')expect(await transitionOf(bar.locator('.ui-glass-lens'),'opacity')).toMatchObject({duration:'0.08s',delay:'0s'});
  // The capsule travels the same 300 ms and fades in from 80 to 260 ms. Its icon shows from 160 ms, once the capsule is nearly round.
  expect(await transitionOf(capsule,'translate')).toEqual({duration:'0.3s',delay:'0s',curve:'cubic-bezier(0.32, 0.72, 0, 1)'});
  expect(await transitionOf(capsule,'opacity')).toMatchObject({duration:'0.18s',delay:'0.08s'});
  expect(await transitionOf(icon,'opacity')).toMatchObject({duration:'0.12s',delay:'0.16s'});
});

test('the capsule and the island share one box: the island lands exactly on the capsule, and the capsule starts exactly on the island',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  const expanded=await settledBoxes(page);
  // The capsule starts where the island is, so the morph begins as one shape.
  const start=expanded.capsule;
  expect(Math.abs(start.x-expanded.bar.x)).toBeLessThan(1);
  expect(Math.abs(start.y-expanded.bar.y)).toBeLessThan(1);
  expect(Math.abs(start.width-expanded.bar.width)).toBeLessThan(1);
  expect(Math.abs(start.height-expanded.bar.height)).toBeLessThan(1);
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect.poll(()=>capsuleShown(page)).toBe(1);
  // Once settled the island has shrunk onto the capsule, and the capsule sits in its own place.
  const settled=await settledBoxes(page);
  expect(Math.abs(settled.bar.x-settled.capsule.x)).toBeLessThan(1);
  expect(Math.abs(settled.bar.y-settled.capsule.y)).toBeLessThan(1);
  expect(Math.abs(settled.bar.width-settled.capsule.width)).toBeLessThan(1);
  expect(Math.abs(settled.bar.height-settled.capsule.height)).toBeLessThan(1);
});

test('the morph is a CSS transition of transform and opacity only, with no script animation',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  // Each transition is recorded as it starts, so the check does not race the 300 ms morph to its end.
  await page.evaluate(()=>{
    const w=window as Window&{__runs?:string[]};
    w.__runs=[];
    document.addEventListener('transitionrun',event=>{if(event.target instanceof Element&&event.target.closest('.app-tabbar,.ui-tabbar-mini'))w.__runs!.push(event.propertyName);});
  });
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  // The browser sends transitionrun on the frame after the state changes, so the check waits for the first one.
  await expect.poll(()=>page.evaluate(()=>((window as Window&{__runs?:string[]}).__runs??[]).length)).toBeGreaterThan(0);
  const {runs,scripted}=await page.evaluate(()=>({
    runs:(window as Window&{__runs?:string[]}).__runs??[],
    scripted:document.getAnimations().filter(animation=>{
      const target=(animation.effect as KeyframeEffect|null)?.target;
      return !(animation instanceof CSSTransition)&&target instanceof Element&&!!target.closest('.app-tabbar,.ui-tabbar-mini');
    }).length,
  }));
  expect(runs.length).toBeGreaterThan(0);
  for(const property of runs)expect(['translate','scale','opacity']).toContain(property);
  expect(scripted).toBe(0);
});

// Every frame of the minimize shows the island or the capsule, so the glass hands over to the capsule without a blank frame.
test('the minimize morph has no blank frame: at every moment the island or its capsule is shown',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  const frames:number[]=[];
  for(let ms=0;ms<=300;ms+=20){
    const paused=await seekIsland(page,ms);
    if(ms===0)expect(paused).toBeGreaterThan(0);
    frames.push(Math.max(await barShown(bar),await capsuleShown(page)));
  }
  expect(frames[0]).toBe(1);
  expect(frames[frames.length-1]).toBe(1);
  expect(Math.min(...frames)).toBeGreaterThanOrEqual(0.5);
});

test('the expand morph has no blank frame either',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect.poll(()=>capsuleShown(page)).toBe(1);
  await page.evaluate(()=>window.scrollTo(0,368));
  await expect(bar).not.toHaveAttribute('data-minimized');
  const frames:number[]=[];
  for(let ms=0;ms<=300;ms+=20){
    const paused=await seekIsland(page,ms);
    if(ms===0)expect(paused).toBeGreaterThan(0);
    frames.push(Math.max(await barShown(bar),await capsuleShown(page)));
  }
  expect(frames[0]).toBe(1);
  expect(frames[frames.length-1]).toBe(1);
  expect(Math.min(...frames)).toBeGreaterThanOrEqual(0.5);
});

test('the labels fade out as the island shrinks and fade back in once it opens',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const label=bar.getByRole('link',{name:'Games',exact:true});
  await expect(bar).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect.poll(()=>label.evaluate(el=>getComputedStyle(el).opacity)).toBe('0');
  await page.evaluate(()=>window.scrollTo(0,368));
  await expect(bar).not.toHaveAttribute('data-minimized');
  await expect.poll(()=>label.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
});

// A short scroll is not a deliberate one: 40 px down, from an expanded island, leaves it expanded.
test('a 40 px scroll does not minimize the island',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,500));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).not.toHaveAttribute('data-minimized');
  await page.evaluate(()=>window.scrollTo(0,440));
  await oneFrame(page);
  await oneFrame(page);
  expect(await page.evaluate(()=>scrollY)).toBe(440);
  await expect(bar).not.toHaveAttribute('data-minimized');
});

test('scrolling down minimizes the island, and 32 px back up expands it, though 31 px does not',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await page.evaluate(()=>window.scrollTo(0,369));
  await oneFrame(page);
  await oneFrame(page);
  await expect(bar).toHaveAttribute('data-minimized','true');
  await page.evaluate(()=>window.scrollTo(0,368));
  await expect(bar).not.toHaveAttribute('data-minimized');
});

// The capsule is a pointer affordance: a button that is hidden from assistive technology and out of the tab order.
test('the minimized island leaves a capsule with the current tab icon, at the bottom-leading corner',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const capsule=page.locator('.ui-tabbar-mini');
  await expect(bar).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect.poll(()=>capsuleShown(page)).toBe(1);
  expect(await capsule.evaluate(el=>[el.tagName,el.getAttribute('aria-hidden'),el.getAttribute('tabindex'),getComputedStyle(el).borderRadius])).toEqual(['BUTTON','true','-1','999px']);
  // The icon is a copy of the current tab's icon, centred and white.
  expect(await capsule.locator('svg.ui-icon').evaluate(el=>el.innerHTML)).toBe(await bar.locator('[aria-current="page"] svg.ui-icon').evaluate(el=>el.innerHTML));
  expect(await capsule.locator('svg.ui-icon').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(255, 255, 255)');
  const box=(await capsule.boundingBox())!;
  const icon=(await capsule.locator('svg.ui-icon').boundingBox())!;
  expect(box.width).toBeCloseTo(56,0);
  expect(box.height).toBeCloseTo(48,0);
  expect(box.x).toBeCloseTo(12,0);
  expect(box.y+box.height).toBeCloseTo(832,0);
  expect(icon.x+icon.width/2).toBeCloseTo(box.x+box.width/2,0);
  expect(icon.y+icon.height/2).toBeCloseTo(box.y+box.height/2,0);
  // Its pointer box is the capsule, and the bar's own tabs are no longer reachable by a tap.
  expect(await page.evaluate(([x,y])=>!!document.elementFromPoint(x,y)?.closest('.ui-tabbar-mini'),[box.x+box.width/2,box.y+box.height/2])).toBe(true);
});

for(const width of [320,390,1440]) test(`the minimized capsule sits fully inside the viewport at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect.poll(()=>capsuleShown(page)).toBe(1);
  const box=(await page.locator('.ui-tabbar-mini').boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(width);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y+box.height).toBeLessThanOrEqual(844);
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
});

// A tap on the capsule expands the island and does not navigate. The travel count restarts, so the island stays open until the next
// deliberate scroll down.
test('tapping the capsule expands the island without changing the route, and the next scroll down must be deliberate',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const capsule=page.locator('.ui-tabbar-mini');
  await expect(bar).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect.poll(()=>capsuleShown(page)).toBe(1);
  const url=page.url();
  const box=(await capsule.boundingBox())!;
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await expect(bar).not.toHaveAttribute('data-minimized');
  await expect(capsule).not.toBeFocused();
  await expect.poll(()=>capsuleShown(page)).toBe(0);
  expect(page.url()).toBe(url);
  // 40 px more down does not minimize it again. The count restarted at the tap, so only 64 px of new travel does.
  await page.evaluate(()=>window.scrollTo(0,440));
  await oneFrame(page);
  await oneFrame(page);
  await expect(bar).not.toHaveAttribute('data-minimized');
  await page.evaluate(()=>window.scrollTo(0,480));
  await expect(bar).toHaveAttribute('data-minimized','true');
});

test('a minimized island ignores taps where its tabs used to be',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const box=await boxOf(bar.getByRole('link',{name:'Movies',exact:true}));
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect(bar).toHaveCSS('pointer-events','none');
  // While the morph runs, the capsule still covers the island's place, and a tap there expands the island. Once it has landed, the old spot is clear.
  await settledBoxes(page);
  // A real click at the old spot. Its target is the page underneath, never the island or its capsule, so the island's Movies link is not activated.
  await page.evaluate(()=>{
    const w=window as Window&{__clickedIn?:string};
    document.addEventListener('click',event=>{w.__clickedIn=(event.target as Element).closest('.app-tabbar,.ui-tabbar-mini')?'island':'page';},{capture:true,once:true});
  });
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await expect.poll(()=>page.evaluate(()=>(window as Window&{__clickedIn?:string}).__clickedIn)).toBe('page');
  expect(page.url()).not.toContain('#/movies');
});

// Up next hides the island fully with data-hidden. Nothing else sets it, so the test sets it as Movies does.
test('the full hide drops the island below the screen edge, and its capsule fades where it is',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const capsule=page.locator('.ui-tabbar-mini');
  await expect(bar).toBeVisible();
  const range=await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
  await page.evaluate(y=>window.scrollTo(0,y),Math.round(range/2));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect.poll(()=>capsuleShown(page)).toBe(1);
  const before=await settledBoxes(page);
  await bar.evaluate(el=>el.setAttribute('data-hidden','true'));
  await expect.poll(()=>capsuleShown(page)).toBe(0);
  const after=await settledBoxes(page);
  // At 1440 px the island's place is far from the capsule's, so a capsule sent back there would cross the screen as it faded.
  expect(Math.abs(after.capsule.x-before.capsule.x)).toBeLessThan(1);
  await expect(bar).toHaveCSS('pointer-events','none');
  await expect(capsule).toHaveCSS('pointer-events','none');
  expect(after.bar.y).toBeGreaterThanOrEqual(900);
  expect(await barShown(bar)).toBe(0);
});

// The capsule is hidden from keyboard users, and the island's own tabs stay in the tab order while it is minimized. Focus that arrives by
// keyboard expands the island, and the capsule steps aside for it.
test('keyboard focus expands a minimized island, and the capsule steps aside',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const games=bar.getByRole('link',{name:'Games',exact:true});
  await expect(bar).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect.poll(()=>capsuleShown(page)).toBe(1);
  await page.evaluate(()=>(document.activeElement as HTMLElement|null)?.blur());
  await page.keyboard.press('Tab');
  await expect(games).toBeFocused();
  await expect.poll(()=>capsuleShown(page)).toBe(0);
  await expect.poll(async()=>(await bar.boundingBox())!.width).toBeGreaterThan(300);
});

test('a pill move stretches the pill with a web animation',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const tv=bar.locator('[data-kind="tv"]');
  await expectPillUnder(bar,bar.locator('[aria-pressed="true"]'));
  await tv.click();
  await expect(tv).toHaveAttribute('aria-pressed','true');
  // A three-keyframe scale animation on the pill itself, not a transition of the bar.
  await expect.poll(()=>page.evaluate(()=>document.getAnimations().some(animation=>{
    const effect=animation.effect as KeyframeEffect|null;
    return effect?.pseudoElement==='::after'&&!(animation instanceof CSSTransition)&&effect.getKeyframes().length===3;
  }))).toBe(true);
});

for(const mode of ['media','class'] as const) test(`reduced motion (${mode}) only cross-fades the island and its capsule`,async({page})=>{
  if(mode==='media')await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  if(mode==='class')await page.evaluate(()=>document.documentElement.classList.add('reduce-motion'));
  const bar=page.locator('.app-tabbar');
  const capsule=page.locator('.ui-tabbar-mini');
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect.poll(()=>barShown(bar)).toBe(0);
  await expect.poll(()=>capsuleShown(page)).toBe(1);
  // Nothing moves or scales, and the cross-fade is the only transition.
  for(const element of [bar,capsule]){
    await expect(element).toHaveCSS('translate','none');
    await expect(element).toHaveCSS('scale','none');
    await expect(element).toHaveCSS('transform','none');
    await expect(element).toHaveCSS('transition-property','opacity');
    await expect(element).toHaveCSS('transition-duration','0.15s');
  }
  // A minimized island is gone: it takes no taps, and the capsule does.
  await expect(bar).toHaveCSS('pointer-events','none');
  await expect(capsule).toHaveCSS('pointer-events','auto');
  // Both states are reachable: scrolling up brings the island back by the same fade.
  await page.evaluate(()=>window.scrollTo(0,368));
  await expect(bar).not.toHaveAttribute('data-minimized');
  await expect.poll(()=>barShown(bar)).toBe(1);
  await expect.poll(()=>capsuleShown(page)).toBe(0);
});

test('reduced motion does not swell the pill under a press',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const tv=bar.locator('[data-kind="tv"]');
  await expectPillUnder(bar,bar.locator('[aria-pressed="true"]'));
  const box=await boxOf(tv);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await expectPillUnder(bar,tv);
  // Reduced motion keeps opacity only, so the press leaves the pill at its size.
  expect(await bar.evaluate(el=>getComputedStyle(el,'::after').scale)).toBe('none');
  await page.mouse.up();
});

test('reduced motion moves the pill at once and never stretches it',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const tv=bar.locator('[data-kind="tv"]');
  await expectPillUnder(bar,bar.locator('[aria-pressed="true"]'));
  await tv.click();
  await expect(tv).toHaveAttribute('aria-pressed','true');
  await oneFrame(page);
  // One frame after the change the pill is already under TV, so nothing is in transit.
  expect(Math.abs((await pillCentre(bar))-(await centreOf(tv)))).toBeLessThanOrEqual(2);
  expect(await page.evaluate(()=>document.getAnimations().filter(animation=>(animation.effect as KeyframeEffect|null)?.pseudoElement==='::after').length)).toBe(0);
});

test('Chromium refracts the island through a filter that belongs to that bar',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the SVG displacement filter renders only in Chromium');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveClass(/is-refracting/);
  // The lens is the bar's first child, and its backdrop is the filter.
  const glass=async(target:Locator)=>target.evaluate(el=>{
    const id=/url\("?#([^")]+)"?\)/.exec(getComputedStyle(el.querySelector('.ui-glass-lens')!).backdropFilter)?.[1]??'';
    const filter=id?document.getElementById(id):null;
    return {
      id,
      isFilter:filter?.localName==='filter',
      displacement:filter?.getElementsByTagName('feDisplacementMap').length??0,
      map:filter?.getElementsByTagName('feImage')[0]?.getAttribute('href')??''
    };
  });
  const home=await glass(bar);
  expect(await bar.getAttribute('data-glass')).toBe('backdrop');
  expect(home.isFilter).toBe(true);
  expect(home.displacement).toBe(1);
  expect(home.map.startsWith('data:image/png;base64,')).toBe(true);
  // The Movies island has its own filter with its own id.
  await page.goto('/#/movies');
  // The Movies bar refracts once it has a size, so its filter is referenced from the first layout onwards.
  await expect(page.locator('nav.movies-mobile-nav.ui-tabbar')).toHaveClass(/is-refracting/);
  const movies=await glass(page.locator('nav.movies-mobile-nav.ui-tabbar'));
  expect(movies.isFilter).toBe(true);
  expect(movies.id).not.toBe(home.id);
});

// The fallbacks turn the lens off (data-glass="off"). Reduced motion keeps the island in place, so a hidden island must still fade
// out, and the opaque fallback bar keeps its edge and lift.
for(const fallback of ['reduced transparency','more contrast','forced colours'] as const) test(`with reduced motion and ${fallback}, a hidden island still disappears`,async({page,browserName})=>{
  test.skip(fallback==='reduced transparency'&&browserName!=='chromium','reduced transparency is emulated through the Chromium protocol');
  await page.emulateMedia({reducedMotion:'reduce',...(fallback==='more contrast'?{contrast:'more' as const}:{}),...(fallback==='forced colours'?{forcedColors:'active' as const}:{})});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  if(fallback==='reduced transparency'){const cdp=await page.context().newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'},{name:'prefers-reduced-motion',value:'reduce'}]});}
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-glass','off');
  if(fallback!=='forced colours')expect(await bar.evaluate(el=>getComputedStyle(el).boxShadow)).not.toBe('none');
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect(bar).toHaveCSS('opacity','0');
});

test('refraction stays off under reduced transparency and returns when that ends',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the SVG displacement filter renders only in Chromium');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveClass(/is-refracting/);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
  await expect(bar).not.toHaveClass(/is-refracting/);
  expect(await bar.evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('none');
  expect(await bar.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(18, 18, 20, 0.97)');
  await cdp.send('Emulation.setEmulatedMedia',{features:[]});
  await expect(bar).toHaveClass(/is-refracting/);
});

test('the displacement map is sized to the bar and follows a resize',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the SVG displacement filter renders only in Chromium');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const sizes=()=>bar.evaluate(el=>{
    const id=/url\("?#([^")]+)"?\)/.exec(getComputedStyle(el.querySelector('.ui-glass-lens')!).backdropFilter)?.[1]??'';
    const image=document.getElementById(id)?.getElementsByTagName('feImage')[0];
    const bar=el as HTMLElement;
    // The map covers the bar and the lens margin, 14 px on each side (LENS_MARGIN in src/ui/glass.ts), so 28 px is taken off to compare it with the bar.
    return {mapW:Number(image?.getAttribute('width'))-28,mapH:Number(image?.getAttribute('height'))-28,barW:bar.offsetWidth,barH:bar.offsetHeight};
  });
  await expect.poll(async()=>{const s=await sizes();return s.mapW===s.barW&&s.mapH===s.barH&&s.barW>0;}).toBe(true);
  const before=(await sizes()).barW;
  await page.setViewportSize({width:320,height:844});
  await expect.poll(async()=>{const s=await sizes();return s.barW!==before&&s.mapW===s.barW&&s.mapH===s.barH;}).toBe(true);
});

// The Movies provider audit reads every resource URL, so the glass must never ask for an image with an empty address.
test('the glass adds no request to an empty URL',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the SVG displacement filter renders only in Chromium');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('.app-tabbar')).toHaveClass(/is-refracting/);
  await page.goto('/#/movies');
  await expect(page.locator('nav.movies-mobile-nav.ui-tabbar')).toHaveClass(/is-refracting/);
  expect(await page.evaluate(()=>performance.getEntriesByType('resource').filter(entry=>!entry.name).length)).toBe(0);
});

test('leaving Movies removes the filter the Movies island added',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the SVG displacement filter renders only in Chromium');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const filters=()=>page.evaluate(()=>document.querySelectorAll('filter[id^="ui-glass-"]').length);
  await expect.poll(filters).toBe(1);
  await page.goto('/#/movies');
  await expect.poll(filters).toBe(2);
  await page.goto('/#/collection');
  await expect.poll(filters).toBe(1);
});

// A tab's computed colour and weight.
const tabInk=(locator:Locator)=>locator.evaluate(el=>{const style=getComputedStyle(el);return {color:style.color,weight:style.fontWeight};});

test('the arcade island tabs are 90% white, and the current tab is solid bold white',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  expect(await tabInk(bar.getByRole('link',{name:'Movies',exact:true}))).toEqual({color:'rgba(255, 255, 255, 0.9)',weight:'500'});
  expect(await tabInk(bar.getByRole('link',{name:'Games',exact:true}))).toEqual({color:'rgb(255, 255, 255)',weight:'700'});
});

test('the Movies island tabs are 90% white, and the current tab is solid bold white',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  await expect(bar).toBeVisible();
  // The failed rails draw the starter line, and that draw rebuilds the nav, so the tabs are read once the line is there.
  await expect(page.locator('.movies-rails-status')).toBeVisible();
  await expect.poll(()=>tabInk(bar.locator('[data-kind="tv"]'))).toEqual({color:'rgba(255, 255, 255, 0.9)',weight:'500'});
  await expect.poll(()=>tabInk(bar.locator('[aria-pressed="true"]'))).toEqual({color:'rgb(255, 255, 255)',weight:'700'});
});

test('the island glass is clear: a 35% dark tint over an undimmed backdrop, with a dense halo on its labels and icons',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  // The tint is the top layer's colour, above the lens, so the frost under it is not tinted by it.
  expect(await bar.evaluate(el=>getComputedStyle(el,'::before').backgroundColor)).toBe('rgba(16, 16, 20, 0.35)');
  // The selection pill is a light glass lens (at least 12% white), and its label keeps its contrast with the halo.
  expect(alphaOf(await bar.evaluate(el=>getComputedStyle(el,'::after').backgroundColor))).toBeGreaterThanOrEqual(0.12);
  // The frost is a blur, then the saturation and brightness, and it has no contrast(). In Chromium's backdrop it is the lens's backdrop,
  // with a 3 px blur. In the frost it is the bar's own, with a 10 px blur.
  const frost=await frostFilter(bar);
  if(await bar.getAttribute('data-glass')==='frost'){
    expect(frost).toContain('blur(10px)');
    expect(frost).toContain('saturate(1.8) brightness(1.04)');
  }else{
    expect(frost).toContain('blur(3px)');
    expect(frost).toContain('saturate(1.9) brightness(1.03)');
  }
  expect(frost).not.toContain('contrast(');
  const movies=bar.getByRole('link',{name:'Movies',exact:true});
  const shadow=await movies.evaluate(el=>getComputedStyle(el).textShadow);
  expect(shadow).toContain('rgb(0, 0, 0) 0px 0px 1px');
  expect(shadow).toContain('rgba(0, 0, 0, 0.6) 0px 1px 2px');
  // An SVG has no text-shadow, so the icons carry the same halo as a drop shadow.
  expect(await movies.locator('.ui-icon').evaluate(el=>getComputedStyle(el).filter)).toContain('drop-shadow(rgb(0, 0, 0) 0px 0px 1px)');
});

// contrast() never reaches the island's frost, and the blur stays at most 6 px in the lens and 10 px in the frost. The rules are read from the
// stylesheet with the shared tokens resolved, so the check holds even in an engine that does not draw backdrop-filter.
test('the island frost has no contrast(), and blurs by at most 6 px in the lens and 10 px in the frost',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('.app-tabbar')).toBeVisible();
  const written=await page.evaluate(()=>{
    const root=getComputedStyle(document.documentElement);
    // The shared tokens are resolved from :root, so the check reads the values the lens uses.
    const resolve=(value:string)=>value.replace(/var\((--[\w-]+)\)/g,(_,name:string)=>root.getPropertyValue(name).trim());
    const found:Record<string,string>={};
    for(const sheet of Array.from(document.styleSheets)){
      let rules:CSSRule[]=[];
      try{rules=Array.from(sheet.cssRules);}catch{}
      for(const rule of rules){
        if(!(rule instanceof CSSStyleRule))continue;
        if(!['.ui-glass-lens','.ui-tabbar.is-refracting .ui-glass-lens','.ui-tabbar[data-glass="frost"]'].includes(rule.selectorText))continue;
        const value=rule.style.getPropertyValue('backdrop-filter')||rule.style.getPropertyValue('-webkit-backdrop-filter');
        if(value)found[rule.selectorText]=resolve(value);
      }
    }
    return found;
  });
  for(const [selector,limit] of [['.ui-glass-lens',6],['.ui-tabbar.is-refracting .ui-glass-lens',6],['.ui-tabbar[data-glass="frost"]',10]] as const){
    const value=written[selector]??'';
    expect(value,`${selector} sets a backdrop-filter`).toContain('blur(');
    expect(value,`${selector} has no contrast()`).not.toContain('contrast(');
    expect(Number(/blur\((\d+(?:\.\d+)?)px\)/.exec(value)?.[1]),`${selector} blur`).toBeLessThanOrEqual(limit);
  }
});

test('more contrast makes the island opaque with white labels, and keeps its border',async({page})=>{
  await page.emulateMedia({contrast:'more'});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  expect(await bar.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(18, 18, 20, 0.96)');
  expect(await bar.evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('none');
  expect(await bar.evaluate(el=>getComputedStyle(el).borderTopColor)).toBe('rgba(255, 255, 255, 0.4)');
  expect(await tabInk(bar.getByRole('link',{name:'Movies',exact:true}))).toEqual({color:'rgb(255, 255, 255)',weight:'500'});
  await page.goto('/#/movies');
  const movies=page.locator('nav.movies-mobile-nav.ui-tabbar');
  await expect(movies).toBeVisible();
  await expect(page.locator('.movies-rails-status')).toBeVisible();
  expect(await movies.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(18, 18, 20, 0.96)');
  await expect.poll(()=>tabInk(movies.locator('[data-kind="tv"]'))).toEqual({color:'rgb(255, 255, 255)',weight:'500'});
});

// The pill is a light lens (at least 12% white) in every mode, so the opaque fallbacks keep a fill of their own.
test('the pill is at least 12% white with or without more contrast',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  const pill=()=>bar.evaluate(el=>getComputedStyle(el,'::after').backgroundColor);
  await expect.poll(async()=>alphaOf(await pill())).toBeGreaterThanOrEqual(0.12);
  await page.emulateMedia({contrast:'more'});
  await expect.poll(async()=>alphaOf(await pill())).toBeGreaterThanOrEqual(0.12);
  await page.emulateMedia({contrast:null});
  await expect.poll(async()=>alphaOf(await pill())).toBeGreaterThanOrEqual(0.12);
});

// Playwright cannot emulate reduced transparency, and every test browser supports backdrop-filter, so both rules are read from the stylesheet.
test('the reduced-transparency and no-backdrop-filter fallbacks set the pill to at least 12% white',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect(page.locator('.app-tabbar')).toBeVisible();
  const pills=await page.evaluate(()=>{
    const found:Record<string,string>={};
    for(const sheet of Array.from(document.styleSheets))for(const rule of Array.from(sheet.cssRules)){
      if(!(rule instanceof CSSMediaRule||rule instanceof CSSSupportsRule))continue;
      const pill=Array.from(rule.cssRules).find((inner):inner is CSSStyleRule=>inner instanceof CSSStyleRule&&inner.selectorText.split(',').map(selector=>selector.trim()).includes('.ui-tabbar::after'));
      if(pill)found[rule instanceof CSSMediaRule?rule.media.mediaText:rule.conditionText]=pill.style.backgroundColor;
    }
    return found;
  });
  expect(alphaOf(Object.entries(pills).find(([condition])=>condition.includes('prefers-reduced-transparency'))?.[1]??'')).toBeGreaterThanOrEqual(0.12);
  expect(alphaOf(Object.entries(pills).find(([condition])=>condition.startsWith('not'))?.[1]??'')).toBeGreaterThanOrEqual(0.12);
});

// A press is keyed to the pointer that began it, so another pointer's release does not end it.
test('a press ends only with the pointer that began it',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const tv=bar.locator('[data-kind="tv"]');
  await expectPillUnder(bar,bar.locator('[aria-pressed="true"]'));
  const box=await boxOf(tv);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  // Another pointer lifts away from the island. It did not begin the press, so the press stays down.
  await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointerup',{pointerId:99,bubbles:true,clientX:40,clientY:40})));
  await expect(bar).toHaveAttribute('data-pressing','');
  await expectPillUnder(bar,tv);
  await page.mouse.up();
  await expect(bar).not.toHaveAttribute('data-pressing');
  await expect(tv).toHaveAttribute('aria-pressed','true');
});

// A press whose pointer-up never arrives must not leave the pill swollen: losing the window ends it.
test('losing the window ends a press, so the pill goes back to the current tab',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const home=bar.locator('[data-kind="all"]');
  const tv=bar.locator('[data-kind="tv"]');
  await expectPillUnder(bar,home);
  const box=await boxOf(tv);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await expectPillUnder(bar,tv);
  // The release never arrives: the window loses focus instead.
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect(bar).not.toHaveAttribute('data-pressing');
  await expectPillUnder(bar,home);
  await expect(tv).toHaveAttribute('aria-pressed','false');
});

// The same for a hidden page. A visibility change while the page stays visible keeps the press.
test('a hidden page ends a press, but a visibility change while the page stays visible does not',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const home=bar.locator('[data-kind="all"]');
  const tv=bar.locator('[data-kind="tv"]');
  const box=await boxOf(tv);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(bar).toHaveAttribute('data-pressing','');
  await expectPillUnder(bar,tv);
  // The page is hidden with the pointer still down, so no pointer-up will come.
  await page.evaluate(()=>{
    Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(bar).not.toHaveAttribute('data-pressing');
  await expectPillUnder(bar,home);
});

test('a pointer cancel ends a press, springs the pill back and selects nothing',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const home=bar.locator('[data-kind="all"]');
  const tv=bar.locator('[data-kind="tv"]');
  await expectPillUnder(bar,home);
  const box=await boxOf(tv);
  const at=[box.x+box.width/2,box.y+box.height/2];
  await tv.evaluate((el,[x,y])=>el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:5,button:0,bubbles:true,clientX:x,clientY:y})),at);
  await expect(bar).toHaveAttribute('data-pressing','');
  await expectPillUnder(bar,tv);
  await tv.evaluate((el,[x,y])=>el.dispatchEvent(new PointerEvent('pointercancel',{pointerId:5,bubbles:true,clientX:x,clientY:y})),at);
  await expect(bar).not.toHaveAttribute('data-pressing');
  await expectPillUnder(bar,home);
  await expect(home).toHaveAttribute('aria-pressed','true');
  await expect(tv).toHaveAttribute('aria-pressed','false');
  await expect(page).toHaveURL(/#\/movies$/);
});

// A press whose pointer-up never arrived ends at the next primary press on the bar, so the pill cannot stay swollen.
test('a new press ends a press whose pointer-up never arrived, and the pill follows the tap',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const home=bar.locator('[data-kind="all"]');
  const tv=bar.locator('[data-kind="tv"]');
  const movie=bar.locator('[data-kind="movie"]');
  await expectPillUnder(bar,home);
  const tvBox=await boxOf(tv);
  // Pointer 5 presses TV, and its pointer-up never arrives.
  await tv.evaluate((el,[x,y])=>el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:5,button:0,bubbles:true,clientX:x,clientY:y})),[tvBox.x+tvBox.width/2,tvBox.y+tvBox.height/2]);
  await expect(bar).toHaveAttribute('data-pressing','');
  // Pointer 6 taps Movies. The stale press ends as cancelled, so TV selects nothing and the bar stops pressing.
  const movieBox=await boxOf(movie);
  await movie.evaluate((el,[x,y])=>{
    el.dispatchEvent(new PointerEvent('pointerdown',{pointerId:6,button:0,bubbles:true,clientX:x,clientY:y}));
    el.dispatchEvent(new PointerEvent('pointerup',{pointerId:6,bubbles:true,clientX:x,clientY:y}));
  },[movieBox.x+movieBox.width/2,movieBox.y+movieBox.height/2]);
  await expect(bar).not.toHaveAttribute('data-pressing');
  await expect(tv).toHaveAttribute('aria-pressed','false');
  await movie.click();
  await expect(movie).toHaveAttribute('aria-pressed','true');
  await expectPillUnder(bar,movie);
});

test('a touch press shows the press, and lifting on the tab selects it',async({page,browserName})=>{
  test.skip(browserName!=='chromium','touch input is sent through the Chromium DevTools protocol');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const tv=bar.locator('[data-kind="tv"]');
  await expectPillUnder(bar,bar.locator('[aria-pressed="true"]'));
  const box=await boxOf(tv);
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+box.width/2,y:box.y+box.height/2}]});
  await expect(bar).toHaveAttribute('data-pressing','');
  await expectPillUnder(bar,tv);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(bar).not.toHaveAttribute('data-pressing');
  await expect(tv).toHaveAttribute('aria-pressed','true');
  await expectPillUnder(bar,tv);
});

test('a touch that slides off the tab springs the pill back and selects nothing',async({page,browserName})=>{
  test.skip(browserName!=='chromium','touch input is sent through the Chromium DevTools protocol');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const home=bar.locator('[data-kind="all"]');
  const tv=bar.locator('[data-kind="tv"]');
  await expectPillUnder(bar,home);
  const box=await boxOf(tv);
  const x=box.x+box.width/2,y=box.y+box.height/2;
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await expect(bar).toHaveAttribute('data-pressing','');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:40}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(bar).not.toHaveAttribute('data-pressing');
  await expectPillUnder(bar,home);
  await expect(home).toHaveAttribute('aria-pressed','true');
  await expect(tv).toHaveAttribute('aria-pressed','false');
});

// The Study tab becomes a tab that selects nothing, so a tap changes nothing. The pill must not stay under the tapped tab.
test('a tap that selects nothing puts the pill back under the current tab',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  // The failed rails draw the starter line last. That draw rebuilds the nav, so it must finish before the change below, or it would undo it.
  await expect(page.locator('.movies-rails-status')).toBeVisible();
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const home=bar.locator('[data-kind="all"]');
  await page.evaluate(()=>{
    const tab=document.querySelector('nav.movies-mobile-nav [data-action="study"]')!;
    tab.removeAttribute('data-action');
    tab.setAttribute('aria-pressed','false');
  });
  const inert=bar.locator('.ui-tab').last();
  await expect(inert).toHaveAttribute('aria-pressed','false');
  const box=await boxOf(inert);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await expectPillUnder(bar,inert);
  await page.mouse.up();
  await expect(bar).not.toHaveAttribute('data-pressing');
  await expectPillUnder(bar,home);
  await expect(home).toHaveAttribute('aria-pressed','true');
  await expect(inert).toHaveAttribute('aria-pressed','false');
  await expect(page).toHaveURL(/#\/movies$/);
});

// Leaving Movies removes the SVG filter that the island added. The arcade island's own filter stays.
test('leaving Movies removes the SVG filter the island added (Chromium only)',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the SVG displacement filter renders only in Chromium');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  await expect(bar).toHaveClass(/is-refracting/);
  // Keep the filter's <svg>, to check it after Movies has gone.
  await page.evaluate(()=>{
    const w=window as Window&{__filterSvg?:Element|null};
    const island=document.querySelector<HTMLElement>('nav.movies-mobile-nav')!;
    const id=/url\("?#([^")]+)"?\)/.exec(getComputedStyle(island.querySelector('.ui-glass-lens')!).backdropFilter)?.[1]??'';
    w.__filterSvg=document.getElementById(id)?.closest('svg')??null;
  });
  await page.goto('/#/collection');
  await expect(page.locator('.game-grid')).toBeVisible();
  expect(await page.evaluate(()=>(window as Window&{__filterSvg?:Element|null}).__filterSvg?.isConnected)).toBe(false);
  expect(await page.evaluate(()=>document.querySelectorAll('filter[id^="ui-glass-"]').length)).toBe(1);
});

// Leaving Movies disposes the island, so a press on the old island is ignored. This runs in every browser: it checks listeners, not the filter.
test('a press on the island that Movies left behind does nothing',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  await expect(page.locator('nav.movies-mobile-nav.ui-tabbar')).toBeVisible();
  // Keep the island, to press it after Movies has gone.
  await page.evaluate(()=>{(window as Window&{__island?:HTMLElement}).__island=document.querySelector<HTMLElement>('nav.movies-mobile-nav')!;});
  await page.goto('/#/collection');
  await expect(page.locator('.game-grid')).toBeVisible();
  // The state is read during the press, before the release, so a listener left on the old island would show.
  const pressedWhileDown=await page.evaluate(()=>{
    const w=window as Window&{__island?:HTMLElement};
    const tab=w.__island!.querySelector<HTMLElement>('[data-kind="tv"]')!;
    tab.dispatchEvent(new PointerEvent('pointerdown',{pointerId:6,button:0,bubbles:true,clientX:10,clientY:10}));
    const during=w.__island!.hasAttribute('data-pressing');
    document.dispatchEvent(new PointerEvent('pointerup',{pointerId:6,bubbles:true,clientX:10,clientY:10}));
    return during;
  });
  expect(pressedWhileDown).toBe(false);
  expect(await page.evaluate(()=>(window as Window&{__island?:HTMLElement}).__island!.style.getPropertyValue('--ui-pill-on'))).toBe('');
});

// The rim is directional: the top-left highlight is brighter than the bottom-right one, on the bar and on its pill.
test('the rim of the island and of its pill is brighter at the top left than at the bottom right',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  const rim=(shadow:string)=>({
    topLeft:Number(/rgba\(255, 255, 255, ([\d.]+)\) 1\.5px 1\.5px 1px -1px inset/.exec(shadow)?.[1]??0),
    bottomRight:Number(/rgba\(255, 255, 255, ([\d.]+)\) -1px -1px 1px -1px inset/.exec(shadow)?.[1]??0)
  });
  // The bar's inner rim is on its top layer, above the lens, and the pill has its own rim.
  for(const shadow of [await bar.evaluate(el=>getComputedStyle(el,'::before').boxShadow),await bar.evaluate(el=>getComputedStyle(el,'::after').boxShadow)]){
    const {topLeft,bottomRight}=rim(shadow);
    expect(topLeft).toBeGreaterThan(0);
    expect(topLeft).toBeGreaterThan(bottomRight);
  }
});

// Forced colours drop box shadows and backgrounds: the pill keeps its edge from a 2 px outline, and the current tab is underlined.
test('forced colours give the island pill a 2 px outline and underline the current tab',async({page})=>{
  await page.emulateMedia({forcedColors:'active'});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  const system=await page.evaluate(()=>{const probe=document.createElement('p');probe.style.color='CanvasText';document.body.append(probe);const colour=getComputedStyle(probe).color;probe.remove();return colour;});
  expect(await bar.evaluate(el=>{const style=getComputedStyle(el,'::after');return [style.outlineWidth,style.outlineStyle,style.outlineColor];})).toEqual(['2px','solid',system]);
  expect(await bar.getByRole('link',{name:'Games',exact:true}).evaluate(el=>getComputedStyle(el).textDecorationLine)).toBe('underline');
  expect(await bar.getByRole('link',{name:'Movies',exact:true}).evaluate(el=>getComputedStyle(el).textDecorationLine)).toBe('none');
  // Forced colours also take the backdrop filter off, so the bar is the flat system colour. The prefixed declaration is an alias in
  // Chromium, so tests/core/theme.test.ts reads it from the stylesheet.
  expect(await bar.evaluate(el=>getComputedStyle(el).backdropFilter)).toBe('none');
  expect(await page.evaluate(()=>{
    for(const sheet of Array.from(document.styleSheets))for(const media of Array.from(sheet.cssRules)){
      if(!(media instanceof CSSMediaRule)||!media.media.mediaText.includes('forced-colors'))continue;
      for(const rule of Array.from(media.cssRules)){
        if(rule instanceof CSSStyleRule&&rule.selectorText.split(',').map(selector=>selector.trim()).includes('.ui-tabbar'))return rule.style.getPropertyValue('backdrop-filter');
      }
    }
    return '';
  })).toBe('none');
});
