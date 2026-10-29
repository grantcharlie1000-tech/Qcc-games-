import {test,expect} from '../fixtures';
import type {Page} from '../fixtures';

test('desktop header has brand, sections and actions',async({page})=>{
 await page.setViewportSize({width:1366,height:900});
 await page.goto('/');
 await expect(page.locator('.site-brand')).toHaveText('Mauri Study Notes');
 await expect(page.locator('.ui-nav').getByRole('link',{name:'Movies',exact:true})).toHaveAttribute('href','#/movies/browse/movie');
 await expect(page.locator('.ui-nav').getByRole('link',{name:'TV Shows',exact:true})).toHaveAttribute('href','#/movies/browse/tv');
 await expect(page.locator('.count-pill')).toHaveAttribute('aria-label','21 games');
 await expect(page.locator('.app-tabbar')).toHaveCount(1);
 await expect(page.locator('.app-tabbar')).toBeVisible();
 // On desktop the island is centred and at most 440 px wide.
 const island=await page.locator('.app-tabbar').boundingBox();
 expect(Math.abs(island!.x+island!.width/2-683)).toBeLessThanOrEqual(2);
 expect(island!.width).toBeLessThanOrEqual(440);
 await page.getByRole('button',{name:'Search games',exact:true}).click();
 await expect(page.locator('#menu')).toBeVisible();
 await expect(page.locator('#search')).toBeFocused();
});

test('pressing / on the library opens search',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.game-card').first()).toBeVisible();
 await page.keyboard.press('/');
 await expect(page.locator('#menu')).toBeVisible();
 await expect(page.locator('#search')).toBeFocused();
 await expect(page.locator('#search')).toHaveValue('');
});

test('a typed slash goes into an open search box and keeps the menu open',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Search games',exact:true}).click();
 await expect(page.locator('#search')).toBeFocused();
 await page.keyboard.press('/');
 await expect(page.locator('#search')).toHaveValue('/');
 await expect(page.locator('#menu')).toBeVisible();
});

test('a slash with the menu open leaves focus on the close button',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 const close=page.getByRole('button',{name:'Close menu',exact:true});
 await close.focus();
 await page.keyboard.press('/');
 await expect(close).toBeFocused();
});

test('slash does not open search in a game or in Movies & TV',async({page})=>{
 await page.goto('/#/collection/1');
 await expect(page.locator('.game-view')).toBeVisible();
 await page.keyboard.press('/');
 await expect(page.locator('#menu')).toBeHidden();
 await page.goto('/#/movies');
 await expect(page.locator('.movies-view')).toBeVisible();
 await page.keyboard.press('/');
 await expect(page.locator('#menu')).toBeHidden();
});

for(const width of [320,390]) test(`phone tab bar replaces the section links at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/');
 await expect(page.locator('.app-tabbar')).toBeVisible();
 const heights=await page.locator('.app-tabbar > *').evaluateAll(items=>items.map(item=>item.getBoundingClientRect().height));
 expect(heights).toHaveLength(5);
 for(const height of heights)expect(height).toBeGreaterThanOrEqual(44);
 await expect(page.locator('.ui-nav')).toBeHidden();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await expect(page.getByRole('button',{name:'Open menu',exact:true})).toBeVisible();
});

test('the wordmark never clips from 320 to 1024 px',async({page})=>{
 for(const width of [320,640,768,1024]){
  await page.setViewportSize({width,height:844});
  await page.goto('/');
  await expect(page.locator('.ui-wordmark')).toBeVisible();
  expect(await page.locator('.ui-wordmark').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 }
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
 // The continue hero makes the home page long enough to rest in the middle of it.
 await seedSnakeSave(page);
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
 // From 1000 px of viewport height the hero is capped at 500 px, so the page height changes only with the viewport.
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

// A save brings the continue hero and its rail, so the hero tests seed one before the first render.
async function seedSnakeSave(page:Page){
 await page.addInitScript(()=>{if(window!==window.top)return;try{localStorage.setItem('pocket-arcade:v1:save:snake',JSON.stringify({version:1,data:{},updated:Date.now()-90000}));}catch{}});
}

for(const width of [1440,390]) test(`with no saves the home opens on the Movies & TV launch at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===1440?900:844});
 await page.goto('/');
 await expect(page.locator('.movies-launch')).toBeVisible();
 await expect(page.locator('.arcade-hero')).toHaveCount(0);
 await expect(page.locator('body')).not.toContainText('Game of the day');
 // The launch is the first thing in the library grid, right under the header.
 expect(await page.locator('.game-grid').evaluate(grid=>grid.firstElementChild?.classList.contains('movies-launch')??false)).toBe(true);
 const header=(await page.locator('.topbar').boundingBox())!;
 const launch=(await page.locator('.movies-launch').boundingBox())!;
 expect(launch.y).toBeGreaterThanOrEqual(header.y+header.height);
 expect(launch.y-(header.y+header.height)).toBeLessThanOrEqual(40);
});

test('home shows a hero, three rails and a footer',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await seedSnakeSave(page);
 await page.goto('/');
 await expect(page.locator('.arcade-hero')).toBeVisible();
 expect(await page.locator('.ui-rail').count()).toBeGreaterThanOrEqual(3);
 await expect(page.locator('.game-card')).toHaveCount(21);
 await expect(page.locator('.site-footer')).toBeVisible();
});

test('hero favourite toggle feeds the Favourites filter',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await seedSnakeSave(page);
 await page.goto('/');
 const toggle=page.locator('[data-hero-favourite]');
 await toggle.click();
 await expect(toggle).toContainText('In favourites');
 expect(await toggle.getAttribute('aria-pressed')).toBeNull();
 expect(await toggle.innerHTML()).toContain('m5 12.5 4.5 4.5L19 7.5');
 await page.getByRole('button',{name:'Favourites',exact:true}).click();
 await expect(page.locator('.game-card')).toHaveCount(1);
});

for(const width of [320,390]) test(`home fits ${width}px phones`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/');
 await expect(page.locator('.game-card').first()).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('cover images mark themselves loaded once the library renders',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.game-card img.is-loaded')).toHaveCount(21);
});

test('footer links have clean accessible names and the leaderboards action opens',async({page})=>{
 await page.goto('/');
 const footer=page.locator('.site-footer');
 await expect(footer.getByRole('link',{name:'Movies',exact:true})).toHaveAttribute('href','#/movies/browse/movie');
 await expect(footer.getByRole('link',{name:'TV Shows',exact:true})).toBeVisible();
 await footer.getByRole('button',{name:'Leaderboards',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Leaderboards'})).toBeVisible();
});

test('rail arrows scroll the row and the flags follow the scroll position',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/');
 const rail=page.locator('[data-rail="puzzle"]');
 const row=rail.locator('.ui-rail-row');
 await rail.hover();
 await rail.locator('.ui-rail-arrow.next').click();
 await expect.poll(()=>row.evaluate(element=>element.scrollLeft)).toBeGreaterThan(0);
 await expect(rail).toHaveAttribute('data-can-prev','true');
 await row.evaluate(element=>{element.scrollLeft=element.scrollWidth;});
 await expect(rail).toHaveAttribute('data-can-next','false');
});

test('the Movies loading state keeps a way back to games',async({page})=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/src/movies/view.ts*',async route=>{await gate;await route.continue();});
 await page.goto('/');
 await page.getByRole('link',{name:'Movies & TV',exact:true}).click();
 const back=page.locator('#content').getByRole('link',{name:'Back to games',exact:true});
 await expect(back).toBeVisible();
 await expect(back).toHaveClass(/ui-btn/);
 const loadingBox=await back.boundingBox();
 expect(Math.abs(loadingBox!.x+loadingBox!.width/2-page.viewportSize()!.width/2)).toBeLessThan(2);
 await back.click();
 await expect(page.locator('.game-card')).toHaveCount(21);
 release();
});

test('game cards keep 2:3 posters with their captions below',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/');
 const card=page.locator('[data-rail="puzzle"] .game-card').first();
 const poster=await card.locator('.ui-card-poster').boundingBox();
 const caption=await card.locator('.ui-card-caption').boundingBox();
 expect(poster!.height/poster!.width).toBeCloseTo(1.5,1);
 expect(caption!.y).toBeGreaterThanOrEqual(poster!.y+poster!.height);
});

test('the footer brand stacks its name above the tagline',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const name=await page.locator('.ui-footer-brand strong').boundingBox();
 const tagline=await page.locator('.ui-footer-brand > span:last-child').boundingBox();
 expect(tagline!.y).toBeGreaterThanOrEqual(name!.y+name!.height);
});

// Waits until a rail row has stopped moving for two frames. By then the scroll event for the last key press has
// run, so its arrow flags and any focus move are in place before the next read or press.
async function settleRow(page:Page,selector:string):Promise<void>{
 await page.evaluate(async(sel)=>{
  const row=document.querySelector<HTMLElement>(sel);
  if(!row)return;
  let last=row.scrollLeft,quiet=0;
  while(quiet<2){
   await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
   quiet=row.scrollLeft===last?quiet+1:0;
   last=row.scrollLeft;
  }
 },selector);
}

test('keyboard focus stays in a rail when its arrows reach the end of the row',async({page})=>{
 // Reduced motion makes the row scroll instantly, so each press settles in a frame rather than over a glide.
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/');
 const rail=page.locator('[data-rail="puzzle"]');
 await rail.locator('.ui-rail-arrow.next').focus();
 // Press only while the next arrow is still offered, and let each press settle before reading the flag again.
 for(let press=0;press<10;press++){
  if(await rail.getAttribute('data-can-next')==='false')break;
  await page.keyboard.press('Enter');
  await settleRow(page,'[data-rail="puzzle"] .ui-rail-row');
 }
 await expect(rail).toHaveAttribute('data-can-next','false');
 // Give the browser a frame to hide the arrow, then see where focus went.
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const focus=await page.evaluate(()=>{
  const element=document.activeElement as HTMLElement|null;
  const style=element?getComputedStyle(element):null;
  return {tag:element?element.tagName:'none',inRail:!!element?.closest('[data-rail="puzzle"]'),visible:!!element&&element.getClientRects().length>0&&style!==null&&style.display!=='none'&&style.visibility!=='hidden'};
 });
 expect(focus.tag).not.toBe('BODY');
 expect(focus.inRail).toBe(true);
 expect(focus.visible).toBe(true);
});

test('library renders reuse cached save times instead of reading storage again',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.game-card')).toHaveCount(21);
 await page.evaluate(()=>{
  const reads:string[]=[];
  const getItem=Storage.prototype.getItem;
  Storage.prototype.getItem=function(this:Storage,key:string){if(key.includes(':save:'))reads.push(key);return getItem.call(this,key);};
  (window as unknown as {saveReads:string[]}).saveReads=reads;
 });
 await page.getByRole('button',{name:'Search games',exact:true}).click();
 await page.locator('#search').fill('a');
 await page.locator('#search').fill('ab');
 expect(await page.evaluate(()=>(window as unknown as {saveReads:string[]}).saveReads.length)).toBe(0);
});

test('a save written in a game reaches the Continue playing rail on return',async({page})=>{
 await page.goto('/');
 await expect(page.locator('.game-card')).toHaveCount(21);
 await expect(page.locator('.continue-card')).toHaveCount(0);
 await page.goto('/#/collection/8');
 await expect(page.locator('.game-view')).toBeVisible();
 await expect(page.locator('#game-stage p.loading')).toHaveCount(0);
 await page.goto('/#/collection');
 await expect(page.locator('.continue-card')).toHaveCount(1);
 await expect(page.locator('.continue-card')).toHaveAttribute('aria-label','Continue Snake');
});

test('the Movies error state keeps a centred way back link',async({page})=>{
 await page.route('**/src/movies/view.ts*',route=>route.abort());
 await page.goto('/');
 await page.getByRole('link',{name:'Movies & TV',exact:true}).click();
 await expect(page.locator('#content')).toContainText('Movies & TV could not load.');
 const back=page.locator('#content').getByRole('link',{name:'Back to games',exact:true});
 await expect(back).toHaveClass(/ui-btn/);
 const box=await back.boundingBox();
 expect(Math.abs(box!.x+box!.width/2-page.viewportSize()!.width/2)).toBeLessThan(2);
});

test('a card presses in while the pointer is down',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/');
 const card=page.locator('[data-rail="puzzle"] .game-card').first();
 // Smooth scrolling would still be moving the row when the press starts, so the row scrolls instantly here.
 await page.locator('[data-rail="puzzle"] .ui-rail-row').evaluate(row=>{(row as HTMLElement).style.scrollBehavior='auto';});
 await card.hover();
 // Put the pointer on the card's centre, and check that the card (or a child of it) is what is under it.
 await expect.poll(async()=>{
  const box=await card.boundingBox();
  const x=box!.x+box!.width/2,y=box!.y+box!.height/2;
  await page.mouse.move(x,y);
  return page.evaluate(([px,py])=>{const hit=document.elementFromPoint(px,py);return !!hit&&!!hit.closest('[data-rail="puzzle"] .game-card');},[x,y]);
 }).toBe(true);
 await page.mouse.down();
 await expect(card).toHaveCSS('transform','matrix(0.98, 0, 0, 0.98, 0, 0)');
 await page.mouse.up();
});
