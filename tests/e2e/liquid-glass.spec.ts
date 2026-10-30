import {test,expect} from '../fixtures';
import type {Locator} from '@playwright/test';

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

for(const width of [390,1440]) test(`the arcade pill sits under Games at ${width}px, and the bar holds only its tabs`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  await expectPillUnder(bar,bar.locator('[aria-current="page"]'));
  expect(await bar.evaluate(el=>el.children.length)).toBe(6);
});

for(const width of [390,1440]) test(`the Movies pill sits under Home at ${width}px, and the bar holds only its tabs`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  await expect(bar).toBeVisible();
  await expectPillUnder(bar,bar.locator('[aria-pressed="true"]'));
  expect(await bar.evaluate(el=>el.children.length)).toBe(5);
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

test('the Movies pill survives a re-render from typing in search',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies/browse/movie');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  const movie=bar.locator('[data-kind="movie"]');
  await expect(movie).toHaveAttribute('aria-pressed','true');
  const before=await movie.elementHandle();
  await page.locator('#movies-search').fill('in');
  // The page rebuilds its nav on every render, so the tab element it started with is gone.
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

test('a hidden island ignores taps where it used to be',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const box=await boxOf(bar.getByRole('link',{name:'Movies',exact:true}));
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-hidden','true');
  await expect(bar).toHaveCSS('pointer-events','none');
  // A real click at the old spot. Its target is the page underneath, never the island, so the island's Movies link is not activated.
  await page.evaluate(()=>{
    const w=window as Window&{__clickedIn?:string};
    document.addEventListener('click',event=>{w.__clickedIn=(event.target as Element).closest('.app-tabbar')?'island':'page';},{capture:true,once:true});
  });
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await expect.poll(()=>page.evaluate(()=>(window as Window&{__clickedIn?:string}).__clickedIn)).toBe('page');
  expect(page.url()).not.toContain('#/movies');
});

test('the island squeezes into a blob before it drops, and rises before it pops open',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  const motion=()=>bar.evaluate(el=>{const s=getComputedStyle(el);return {props:s.transitionProperty,durations:s.transitionDuration,delays:s.transitionDelay};});
  expect(await motion()).toEqual({props:'translate, scale, opacity',durations:'0.36s, 0.42s, 0.14s',delays:'0s, 0.08s, 0s'});
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-hidden','true');
  expect(await motion()).toEqual({props:'scale, translate, opacity',durations:'0.2s, 0.28s, 0.16s',delays:'0s, 0.11s, 0.22s'});
});

test('the labels fade out as the island squeezes and fade back in once it opens',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const label=bar.getByRole('link',{name:'Games',exact:true});
  await expect(bar).toBeVisible();
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-hidden','true');
  await expect.poll(()=>label.evaluate(el=>getComputedStyle(el).opacity)).toBe('0');
  await page.evaluate(()=>window.scrollTo(0,380));
  await expect(bar).not.toHaveAttribute('data-hidden');
  await expect.poll(()=>label.evaluate(el=>getComputedStyle(el).opacity)).toBe('1');
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

for(const mode of ['media','class'] as const) test(`reduced motion (${mode}) hides the island at once, without moving or scaling it`,async({page})=>{
  if(mode==='media')await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  if(mode==='class')await page.evaluate(()=>document.documentElement.classList.add('reduce-motion'));
  const bar=page.locator('.app-tabbar');
  await page.evaluate(()=>window.scrollTo(0,400));
  await expect(bar).toHaveAttribute('data-hidden','true');
  await expect(bar).toHaveCSS('opacity','0');
  await expect(bar).toHaveCSS('scale','none');
  await expect(bar).toHaveCSS('translate','none');
  await expect(bar).toHaveCSS('transform','none');
  // No transition runs at all, so the island leaves at once: there is no fade to wait for.
  await expect(bar).toHaveCSS('transition-property','none');
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
  const glass=async(target:Locator)=>target.evaluate(el=>{
    const id=/url\("?#([^")]+)"?\)/.exec(getComputedStyle(el).backdropFilter)?.[1]??'';
    const filter=id?document.getElementById(id):null;
    return {
      id,
      isFilter:filter?.localName==='filter',
      displacement:filter?.getElementsByTagName('feDisplacementMap').length??0,
      map:filter?.getElementsByTagName('feImage')[0]?.getAttribute('href')??''
    };
  });
  const home=await glass(bar);
  expect(home.isFilter).toBe(true);
  expect(home.displacement).toBe(1);
  expect(home.map.startsWith('data:image/svg+xml,')).toBe(true);
  // The Movies island has its own filter with its own id.
  await page.goto('/#/movies');
  // The Movies bar refracts once it has a size, so its filter is referenced from the first layout onwards.
  await expect(page.locator('nav.movies-mobile-nav.ui-tabbar')).toHaveClass(/is-refracting/);
  const movies=await glass(page.locator('nav.movies-mobile-nav.ui-tabbar'));
  expect(movies.isFilter).toBe(true);
  expect(movies.id).not.toBe(home.id);
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
    const id=/url\("?#([^")]+)"?\)/.exec(getComputedStyle(el).backdropFilter)?.[1]??'';
    const image=document.getElementById(id)?.getElementsByTagName('feImage')[0];
    const bar=el as HTMLElement;
    return {mapW:Number(image?.getAttribute('width')),mapH:Number(image?.getAttribute('height')),barW:bar.offsetWidth,barH:bar.offsetHeight};
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
  // Movies rebuilds its nav when the rail requests settle, so the tabs are read once the page is idle.
  await page.waitForLoadState('networkidle');
  expect(await tabInk(bar.locator('[data-kind="tv"]'))).toEqual({color:'rgba(255, 255, 255, 0.9)',weight:'500'});
  expect(await tabInk(bar.locator('[aria-pressed="true"]'))).toEqual({color:'rgb(255, 255, 255)',weight:'700'});
});

test('the island glass is darker and tinted, and its labels and icons have a halo',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  expect(await bar.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(20, 20, 24, 0.24)');
  const backdrop=await bar.evaluate(el=>getComputedStyle(el).backdropFilter);
  expect(backdrop).toContain('brightness(0.8)');
  expect(backdrop).not.toContain('brightness(1.06)');
  const movies=bar.getByRole('link',{name:'Movies',exact:true});
  expect(await movies.evaluate(el=>getComputedStyle(el).textShadow)).toBe('rgba(0, 0, 0, 0.65) 0px 1px 2px, rgba(0, 0, 0, 0.45) 0px 0px 8px');
  expect(await movies.locator('.ui-icon').evaluate(el=>getComputedStyle(el).filter)).toBe('drop-shadow(rgba(0, 0, 0, 0.6) 0px 1px 1px)');
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
  await page.waitForLoadState('networkidle');
  expect(await movies.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(18, 18, 20, 0.96)');
  expect(await tabInk(movies.locator('[data-kind="tv"]'))).toEqual({color:'rgb(255, 255, 255)',weight:'500'});
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
  // The catalog requests settle first, because a render rebuilds the nav and would undo the change below.
  await page.waitForLoadState('networkidle');
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

// Leaving Movies disposes the island. Its filter goes, and a press on the old island is ignored.
test('leaving Movies disposes the island: its filter goes, and a press on the old island does nothing',async({page,browserName})=>{
  test.skip(browserName!=='chromium','the SVG displacement filter renders only in Chromium');
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies');
  const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
  await expect(bar).toHaveClass(/is-refracting/);
  // Keep the island and its filter's <svg>, to check them after Movies has gone.
  await page.evaluate(()=>{
    const w=window as Window&{__island?:HTMLElement;__filterSvg?:Element|null};
    const island=document.querySelector<HTMLElement>('nav.movies-mobile-nav')!;
    const id=/url\("?#([^")]+)"?\)/.exec(getComputedStyle(island).backdropFilter)?.[1]??'';
    w.__island=island;
    w.__filterSvg=document.getElementById(id)?.closest('svg')??null;
  });
  await page.goto('/#/collection');
  await expect(page.locator('.game-grid')).toBeVisible();
  expect(await page.evaluate(()=>(window as Window&{__filterSvg?:Element|null}).__filterSvg?.isConnected)).toBe(false);
  expect(await page.evaluate(()=>document.querySelectorAll('filter[id^="ui-glass-"]').length)).toBe(1);
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
