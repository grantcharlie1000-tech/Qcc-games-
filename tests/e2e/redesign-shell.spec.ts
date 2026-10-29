import {test,expect} from '../fixtures';
import type {Page} from '../fixtures';

test('the games home is back in its original style',async({page})=>{
 await page.setViewportSize({width:1366,height:900});
 await page.goto('/');
 const topbar=page.locator('.topbar');
 await expect(topbar.locator('.site-brand')).toHaveText('Mauri Study Notes');
 await expect(topbar.getByRole('button',{name:'Open menu',exact:true})).toBeVisible();
 await expect(topbar.locator('.count-pill')).toHaveAttribute('aria-label','21 games');
 await expect(topbar.getByRole('button',{name:'FAVOURITES',exact:true})).toBeVisible();
 const grid=page.locator('.game-grid');
 expect(await grid.evaluate(element=>element.firstElementChild?.classList.contains('movies-launch')??false)).toBe(true);
 await expect(grid.locator('.game-card')).toHaveCount(21);
 await expect(grid.locator('.game-card:has(h2):has(.title-line)')).toHaveCount(21);
 expect(await page.locator('.game-card h2').first().evaluate(element=>getComputedStyle(element).fontFamily)).toMatch(/^"?Arcade/);
 expect(await page.locator('html').evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgb(25, 29, 28)');
 // Tab from the top bar into the grid until the first game card has keyboard focus.
 const card=grid.locator('.game-card').first();
 for(let press=0;press<8&&!(await card.evaluate(element=>element===document.activeElement));press++)await page.keyboard.press('Tab');
 await expect(card).toBeFocused();
 expect(await card.evaluate(element=>getComputedStyle(element).outlineWidth)).toBe('3px');
 expect(await card.evaluate(element=>getComputedStyle(element).outlineColor)).toBe('rgb(255, 224, 164)');
});

for(const width of [320,390]) test(`the phone island holds five tabs at least 44 px tall at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/');
 await expect(page.locator('.app-tabbar')).toBeVisible();
 const heights=await page.locator('.app-tabbar > *').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().height));
 expect(heights).toHaveLength(5);
 for(const height of heights)expect(height).toBeGreaterThanOrEqual(44);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'Open menu',exact:true})).toBeVisible();
});

test('tab bar hides during games and Movies & TV',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/collection/1');
 await expect(page.locator('.game-view')).toBeVisible();
 await expect(page.locator('.app-tabbar')).toHaveCount(1);
 await expect(page.locator('.app-tabbar')).toBeHidden();
 await page.goto('/#/movies');
 await expect(page.locator('.movies-view')).toBeVisible();
 await expect(page.locator('.app-tabbar')).toHaveCount(1);
 await expect(page.locator('.app-tabbar')).toBeHidden();
 await page.goto('/#/collection');
 await expect(page.locator('.app-tabbar')).toBeVisible();
});

test('Study tab opens Study Mode',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.locator('.app-tabbar').getByRole('button',{name:'Study',exact:true}).click();
 await expect(page.locator('#study-view')).toBeVisible();
});

test('the phone tab bar is a floating glass island',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await expect(bar).toBeVisible();
 const box=await bar.boundingBox();
 expect(box!.x).toBeGreaterThanOrEqual(10);
 expect(box!.x+box!.width).toBeLessThanOrEqual(380);
 expect(box!.y+box!.height).toBeLessThanOrEqual(834);
 expect(parseFloat(await bar.evaluate(element=>getComputedStyle(element).borderRadius))).toBeGreaterThanOrEqual(24);
 expect(await bar.evaluate(element=>getComputedStyle(element).backdropFilter)).toContain('blur');
 const heights=await page.locator('.app-tabbar > *').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().height));
 expect(heights).toHaveLength(5);
 for(const height of heights)expect(height).toBeGreaterThanOrEqual(44);
});

test('scrolling down hides the tab bar and scrolling up brings it back',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await expect(bar).toBeVisible();
 await page.evaluate(()=>window.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await expect.poll(async()=>(await bar.boundingBox())!.y).toBeGreaterThanOrEqual(844);
 await page.evaluate(()=>window.scrollTo(0,280));
 await expect(bar).not.toHaveAttribute('data-hidden');
 await expect.poll(async()=>{const box=await bar.boundingBox();return box!.y+box!.height;}).toBeLessThanOrEqual(844);
});

test('the tab bar shows again near the top and after navigation',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await page.evaluate(()=>window.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await page.evaluate(()=>window.scrollTo(0,10));
 await expect(bar).not.toHaveAttribute('data-hidden');
 await page.evaluate(()=>window.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 // Open a game and come back. The library restores its old scroll position, and the bar still shows.
 await page.evaluate(()=>{location.hash='#/collection/1';});
 await expect(page.locator('.game-view')).toBeVisible();
 await page.evaluate(()=>{location.hash='#/collection';});
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(400);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(bar).not.toHaveAttribute('data-hidden');
});

test('keyboard focus brings a hidden tab bar back',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await page.evaluate(()=>window.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await expect.poll(async()=>(await bar.boundingBox())!.y).toBeGreaterThanOrEqual(844);
 await page.keyboard.press('Tab');
 await bar.locator('.ui-tab').first().focus();
 await expect.poll(async()=>{const box=await bar.boundingBox();return box!.y>=0&&box!.y+box!.height<=844;}).toBe(true);
});

test('a tapped tab does not pin the bar open',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await bar.getByRole('link',{name:'Games',exact:true}).click();
 await page.evaluate(()=>window.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await expect.poll(async()=>(await bar.boundingBox())!.y).toBeGreaterThanOrEqual(844);
});

test('reduced motion fades the bar instead of sliding',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await page.evaluate(()=>window.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await expect(bar).toHaveCSS('transform','none');
 await expect(bar).toHaveCSS('opacity','0');
 await expect(bar).toHaveCSS('pointer-events','none');
});

test('the app reduce-motion setting fades the bar too',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.evaluate(()=>document.documentElement.classList.add('reduce-motion'));
 const bar=page.locator('.app-tabbar');
 await page.evaluate(()=>window.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await expect(bar).toHaveCSS('transform','none');
 await expect(bar).toHaveCSS('opacity','0');
});

test('the island floats and hides on scroll on desktop too',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await expect(bar).toBeVisible();
 await page.evaluate(()=>window.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await expect.poll(async()=>(await bar.boundingBox())!.y).toBeGreaterThanOrEqual(900);
 await page.evaluate(()=>window.scrollTo(0,280));
 await expect(bar).not.toHaveAttribute('data-hidden');
 await expect.poll(async()=>{const box=await bar.boundingBox();return box!.y+box!.height;}).toBeLessThanOrEqual(900);
});

test('the island stays hidden in games and Movies on desktop',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/collection/1');
 await expect(page.locator('.game-view')).toBeVisible();
 await expect(page.locator('.app-tabbar')).toHaveCount(1);
 await expect(page.locator('.app-tabbar')).toBeHidden();
 await page.goto('/#/movies');
 await expect(page.locator('.movies-view')).toBeVisible();
 await expect(page.locator('.app-tabbar')).toHaveCount(1);
 await expect(page.locator('.app-tabbar')).toBeHidden();
 await page.goto('/#/collection');
 await expect(page.locator('.app-tabbar')).toBeVisible();
});

test('a fine pointer lights up a tab and leaves the current lozenge alone',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await expect(bar).toBeVisible();
 const alpha=(locator:ReturnType<Page['locator']>)=>locator.evaluate(element=>{const match=getComputedStyle(element).backgroundColor.match(/[\d.]+(?=\)$)/);return match?Number(match[0]):0;});
 const study=bar.getByRole('button',{name:'Study',exact:true});
 const games=bar.getByRole('link',{name:'Games',exact:true});
 expect(await alpha(study)).toBe(0);
 await study.hover();
 await expect.poll(()=>alpha(study)).toBeCloseTo(0.06,2);
 expect(await study.evaluate(element=>getComputedStyle(element).color)).toBe('rgb(255, 255, 255)');
 // Hover colour and background change at once: only transform is transitioned on a tab.
 expect(await study.evaluate(element=>getComputedStyle(element).transitionProperty)).toBe('transform');
 await games.hover();
 expect(await alpha(games)).toBeCloseTo(0.12,2);
});

test('the island shows again after returning from Study',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 // The arcade home is long enough to rest in the middle of it.
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await page.evaluate(()=>window.scrollTo(0,1000));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await page.evaluate(()=>window.scrollTo(0,880));
 await expect(bar).not.toHaveAttribute('data-hidden');
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(880);
 await bar.getByRole('button',{name:'Study',exact:true}).click();
 await expect(page.locator('#study-view')).toBeVisible();
 // Reading moves the page. Returning restores the old position, and that restore must not count as a scroll down.
 await page.evaluate(()=>window.scrollTo(0,100));
 // The Games link in the article text returns to the arcade. It is dispatched, not clicked, so the link is not scrolled into view.
 await page.locator('#study-view a[data-study-return][aria-label="Games"]').dispatchEvent('click');
 await expect(page.locator('#study-view')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(880);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await expect(bar).toBeVisible();
 await expect(bar).not.toHaveAttribute('data-hidden');
});

test('a resize that brings the end of the page into reach shows the island',async({page})=>{
 // Nothing in this layout depends on the viewport height, so the resize changes only the scrollable range.
 await page.setViewportSize({width:390,height:1100});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await page.evaluate(()=>window.scrollTo(0,300));
 await expect(bar).toHaveAttribute('data-hidden','true');
 const height=await page.evaluate(()=>document.documentElement.scrollHeight-322);
 await page.setViewportSize({width:390,height});
 // The scrollable range is now 322 px, so 300 px is in the end zone. Nothing scrolled, so only the resize can show the island.
 expect(await page.evaluate(()=>scrollY)).toBe(300);
 expect(await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight)).toBe(322);
 await expect(bar).not.toHaveAttribute('data-hidden');
});

for(const width of [320,390]) test(`home fits ${width}px phones`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/');
 await expect(page.locator('.game-card').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('the Movies loading state keeps a way back to games',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/src/movies/view.ts*',async route=>{await gate;await route.continue();});
 await page.goto('/');
 await page.getByRole('link',{name:'Movies & TV',exact:true}).click();
 const back=page.locator('#content').getByRole('link',{name:'Back to games',exact:true});
 await expect(back).toBeVisible();
 await expect(back).toHaveClass('game-button secondary');
 const loadingBox=await back.boundingBox();
 expect(Math.abs(loadingBox!.x+loadingBox!.width/2-page.viewportSize()!.width/2)).toBeLessThan(2);
 await back.click();
 await expect(page.locator('.game-card')).toHaveCount(21);
 release();
});

test('the Movies error state keeps a centred way back link',async({page})=>{
 await page.route('**/src/movies/view.ts*',route=>route.abort());
 await page.goto('/');
 await page.getByRole('link',{name:'Movies & TV',exact:true}).click();
 await expect(page.locator('#content')).toContainText('Movies & TV could not load.');
 const back=page.locator('#content').getByRole('link',{name:'Back to games',exact:true});
 await expect(back).toHaveClass('game-button secondary');
 const box=await back.boundingBox();
 expect(Math.abs(box!.x+box!.width/2-page.viewportSize()!.width/2)).toBeLessThan(2);
});
