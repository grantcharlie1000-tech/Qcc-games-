import {test,expect} from '../fixtures';
import type {Page} from '../fixtures';
import type {Locator} from '@playwright/test';

// The frost as the browser applies it. In Chromium it is the lens's backdrop-filter. In the mirror the lens has no backdrop-filter of its
// own, so the frost is the scene's filter, which is set once the mirror's map is ready: the test waits for that first.
async function frostFilter(bar:Locator):Promise<string>{
  if(await bar.getAttribute('data-glass')==='mirror')await expect.poll(()=>bar.evaluate(el=>el.style.getPropertyValue('--ui-glass-filter'))).not.toBe('');
  return bar.evaluate(el=>el.getAttribute('data-glass')==='mirror'
    ?getComputedStyle(el.querySelector('.ui-glass-scene')!).filter
    :getComputedStyle(el.querySelector('.ui-glass-lens')!).backdropFilter);
}

// The menu sheet enters by scale and translate. Under load, a click sent while it still moves can miss its target (CI once clicked Study Mode
// 95 ms into the entry and nothing opened), so a test waits for the sheet and its backdrop to settle before it clicks inside.
async function menuSettled(page:Page){
 await expect(page.locator('#menu')).toBeVisible();
 await expect.poll(()=>page.locator('#menu').evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
}

test('the games home is back in its original style',async({page})=>{
 await page.setViewportSize({width:1366,height:900});
 await page.goto('/');
 // The arcade top bar is gone. Its brand, count and favourites moved into the menu, and its menu button is now the island's sixth tab.
 await expect(page.locator('#app > header')).toHaveCount(0);
 await expect(page.locator('.topbar')).toHaveCount(0);
 await expect(page.locator('.count-pill,.favourites-pill,.hamburger')).toHaveCount(0);
 await expect(page.locator('.app-tabbar').getByRole('button',{name:'Open menu',exact:true})).toBeVisible();
 const grid=page.locator('.game-grid');
 expect(await grid.evaluate(element=>element.firstElementChild?.classList.contains('game-card')??false)).toBe(true);
 await expect(page.locator('.movies-launch')).toHaveCount(0);
 await expect(grid.locator('.game-card')).toHaveCount(21);
 await expect(grid.locator('.game-card:has(h2):has(.title-line)')).toHaveCount(21);
 expect(await page.locator('.game-card h2').first().evaluate(element=>getComputedStyle(element).fontFamily)).toMatch(/^"?Arcade/);
 expect(await page.locator('html').evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgb(25, 29, 28)');
 // The island comes first in the page order, so the first Tab reaches its Games tab. Keep tabbing through the island until the first game card has focus.
 await page.keyboard.press('Tab');
 await expect(page.locator('.app-tabbar').getByRole('link',{name:'Games',exact:true})).toBeFocused();
 const card=grid.locator('.game-card').first();
 for(let press=0;press<12&&!(await card.evaluate(element=>element===document.activeElement));press++)await page.keyboard.press('Tab');
 await expect(card).toBeFocused();
 expect(await card.evaluate(element=>getComputedStyle(element).outlineWidth)).toBe('3px');
 expect(await card.evaluate(element=>getComputedStyle(element).outlineColor)).toBe('rgb(255, 224, 164)');
});

// Six tabs fit the island: each is a 44 px target, its label sits inside it without clipping, and the bar and page stay on screen.
async function expectIslandFits(page:Page){
 const report=await page.locator('.app-tabbar').evaluate(bar=>{
  const box=(element:Element)=>{const rect=element.getBoundingClientRect();return {left:rect.left,right:rect.right,width:rect.width,height:rect.height};};
  return {
   bar:box(bar),
   viewport:innerWidth,
   pageFits:document.documentElement.scrollWidth<=innerWidth,
   tabs:[...bar.querySelectorAll<HTMLElement>('.ui-tab')].map(tab=>({name:tab.textContent?.trim(),tab:box(tab),label:box(tab.querySelector('span')!),overflows:tab.scrollWidth>tab.clientWidth}))
  };
 });
 expect(report.tabs.map(tab=>tab.name)).toEqual(['Games','Movies','TV Shows','My list','Study','Menu']);
 for(const {name,tab,label,overflows} of report.tabs){
  expect(tab.width,`${name} width`).toBeGreaterThanOrEqual(44);
  expect(tab.height,`${name} height`).toBeGreaterThanOrEqual(44);
  expect(label.left,`${name} label starts inside its tab`).toBeGreaterThanOrEqual(tab.left);
  expect(label.right,`${name} label ends inside its tab`).toBeLessThanOrEqual(tab.right);
  expect(overflows,`${name} overflows its tab`).toBe(false);
 }
 expect(report.bar.left).toBeGreaterThanOrEqual(0);
 expect(report.bar.right).toBeLessThanOrEqual(report.viewport);
 expect(report.pageFits).toBe(true);
}

for(const width of [320,360,390]) test(`the phone island holds six tabs at least 44 px across and tall at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/');
 await expect(page.locator('.app-tabbar')).toBeVisible();
 await expectIslandFits(page);
 // The sixth tab is the menu. Its accessible name stays "Open menu", and it is the only one on the games screen.
 const menu=page.getByRole('button',{name:'Open menu',exact:true});
 await expect(menu).toHaveCount(1);
 expect(await menu.evaluate(element=>!!element.closest('.app-tabbar'))).toBe(true);
});

test('the island fits at 1366px too',async({page})=>{
 await page.setViewportSize({width:1366,height:900});
 await page.goto('/');
 await expect(page.locator('.app-tabbar')).toBeVisible();
 await expectIslandFits(page);
});

for(const [width,height] of [[390,844],[1366,900]]) test(`the island's Menu opens the menu, and Escape returns focus to it at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height});
 await page.goto('/');
 const menu=page.locator('.app-tabbar').getByRole('button',{name:'Open menu',exact:true});
 await expect(menu).toHaveAttribute('aria-haspopup','dialog');
 await menu.click();
 await expect(page.locator('#menu')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('#menu')).toBeHidden();
 await expect(menu).toBeFocused();
});

test('closing Study opened from the menu returns focus to the island Menu',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.locator('.app-tabbar').getByRole('button',{name:'Open menu',exact:true}).click();
 await menuSettled(page);
 await page.getByRole('button',{name:'Study Mode',exact:true}).click();
 await expect(page.locator('#study-view')).toBeVisible();
 await page.locator('#study-view a[data-study-return][aria-label="Games"]').click();
 await expect(page.locator('#study-view')).toBeHidden();
 await expect(page.locator('.app-tabbar').getByRole('button',{name:'Open menu',exact:true})).toBeFocused();
});

test('Favourites only in the menu shows a notice, and Show all games clears it',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await menuSettled(page);
 await page.getByLabel('Favourites only',{exact:true}).check();
 await page.getByRole('button',{name:'Close menu',exact:true}).click();
 await expect(page.locator('.empty-library')).toContainText('Your favourites');
 await expect(page.locator('.library-filter-text')).toHaveText('Showing your favourites');
 await page.getByRole('button',{name:'Show all games',exact:true}).click();
 await expect(page.locator('.game-card')).toHaveCount(21);
 await expect(page.locator('.library-filter')).toHaveCount(0);
 await expect(page.locator('#favourites-only')).not.toBeChecked();
 await expect(page.locator('.game-card').first()).toBeFocused();
});

test('a search is shown as literal text in the notice, which wraps at 320px',async({page})=>{
 await page.setViewportSize({width:320,height:844});
 let alerted=false;
 page.on('dialog',dialog=>{alerted=true;void dialog.dismiss();});
 await page.goto('/');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await menuSettled(page);
 const payload='<img src=x onerror=alert(1)>';
 await page.getByRole('searchbox').fill(payload);
 await page.getByRole('button',{name:'Close menu',exact:true}).click();
 await expect(page.locator('.library-filter-text')).toHaveText(`Games matching “${payload}”`);
 await expect(page.locator('.library-filter img')).toHaveCount(0);
 // The text and the button wrap inside the phone width. Read in one evaluate, as the menu's close handler re-renders the notice.
 expect(await page.evaluate(()=>[...document.querySelectorAll<HTMLElement>('.library-filter-text,.library-filter button')].every(element=>element.getBoundingClientRect().right<=innerWidth))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(alerted).toBe(false);
});

test('the filter notice lines up with the game grid',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await menuSettled(page);
 await page.getByLabel('Favourites only',{exact:true}).check();
 await page.getByRole('button',{name:'Close menu',exact:true}).click();
 // The notice's text starts where the grid's content starts, so the text is compared with the grid's content edge, not the notice's padded box.
 // Both edges are read in one evaluate: the menu's close handler re-renders the library, so a locator box could be read from a replaced node.
 // The edge comes from the grid's padding, because a favourites filter with no favourites leaves the grid with no cell.
 const [textLeft,gridLeft]=await page.evaluate(()=>{const grid=document.querySelector<HTMLElement>('.game-grid')!;return [document.querySelector('.library-filter-text')!.getBoundingClientRect().left,grid.getBoundingClientRect().left+parseFloat(getComputedStyle(grid).paddingLeft)];});
 expect(Math.abs(textLeft-gridLeft)).toBeLessThan(1);
});

test('the library clears a notch, and a game screen does not',async({page,browserName})=>{
 test.skip(browserName!=='chromium','safe-area inset emulation is a Chromium DevTools feature');
 await page.setViewportSize({width:390,height:844});
 // Chromium can emulate the insets a notched phone reports to env(), so the padding is measured, not read from the CSS.
 const session=await page.context().newCDPSession(page);
 await session.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:47,left:0,right:0,bottom:34}});
 await page.goto('/');
 await expect(page.locator('.game-card').first()).toBeVisible();
 expect(await page.locator('#content').evaluate(element=>getComputedStyle(element).paddingTop)).toBe('47px');
 await page.goto('/#/game/snake');
 await expect(page.locator('.game-view')).toBeVisible();
 expect(await page.locator('#content').evaluate(element=>getComputedStyle(element).paddingTop)).toBe('0px');
});

test('the shell content pads the side insets as well as the top one',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await expect(page.locator('.game-card').first()).toBeVisible();
 // Every rule for the shell's content is read, so the sides count wherever the rule declares them.
 const sides=await page.evaluate(()=>{
  const rules=[...document.styleSheets].flatMap(sheet=>[...sheet.cssRules]).filter((rule):rule is CSSStyleRule=>rule instanceof CSSStyleRule&&rule.selectorText==='body:not(.in-game):not(.movies-active) #content');
  return {count:rules.length,left:rules.map(rule=>rule.style.paddingLeft).join(' '),right:rules.map(rule=>rule.style.paddingRight).join(' ')};
 });
 expect(sides.count).toBeGreaterThan(0);
 expect(sides.left).toContain('env(safe-area-inset-left)');
 expect(sides.right).toContain('env(safe-area-inset-right)');
 // With no inset the content has no side padding.
 expect(await page.locator('#content').evaluate(element=>[getComputedStyle(element).paddingLeft,getComputedStyle(element).paddingRight])).toEqual(['0px','0px']);
});

test('a notch on either side moves the shell content in from that edge (Chromium only)',async({page,browserName})=>{
 test.skip(browserName!=='chromium','safe-area inset emulation is a Chromium DevTools feature');
 await page.setViewportSize({width:390,height:844});
 const session=await page.context().newCDPSession(page);
 await session.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,left:44,right:34,bottom:0}});
 await page.goto('/');
 await expect(page.locator('.game-card').first()).toBeVisible();
 expect(await page.locator('#content').evaluate(element=>[getComputedStyle(element).paddingLeft,getComputedStyle(element).paddingRight])).toEqual(['44px','34px']);
 await page.goto('/#/game/snake');
 await expect(page.locator('.game-view')).toBeVisible();
 expect(await page.locator('#content').evaluate(element=>[getComputedStyle(element).paddingLeft,getComputedStyle(element).paddingRight])).toEqual(['0px','0px']);
});

test('tab bar hides during games and Movies & TV',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
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

// The island keeps 10 px clear of the left, right and bottom edges, at a phone width and at a desktop one.
for(const [width,height] of [[390,844],[1440,900]]) test(`the tab bar is a floating glass island at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await expect(bar).toBeVisible();
 const box=await bar.boundingBox();
 expect(box!.x).toBeGreaterThanOrEqual(10);
 expect(box!.x+box!.width).toBeLessThanOrEqual(width-10);
 expect(box!.y+box!.height).toBeLessThanOrEqual(height-10);
 expect(parseFloat(await bar.evaluate(element=>getComputedStyle(element).borderRadius))).toBeGreaterThanOrEqual(24);
 expect(await frostFilter(bar)).toContain('blur');
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

test('reduced motion hides the bar at once instead of sliding',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await page.evaluate(()=>window.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await expect(bar).toHaveCSS('transform','none');
 // The liquid exit moves with translate and scale, so reduced motion must clear both as well.
 await expect(bar).toHaveCSS('translate','none');
 await expect(bar).toHaveCSS('scale','none');
 await expect(bar).toHaveCSS('opacity','0');
 await expect(bar).toHaveCSS('pointer-events','none');
});

test('the app reduce-motion setting hides the bar at once instead of fading',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 await page.evaluate(()=>document.documentElement.classList.add('reduce-motion'));
 const bar=page.locator('.app-tabbar');
 await page.evaluate(()=>window.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await expect(bar).toHaveCSS('transform','none');
 await expect(bar).toHaveCSS('translate','none');
 await expect(bar).toHaveCSS('scale','none');
 await expect(bar).toHaveCSS('opacity','0');
});

test('the island floats and hides on scroll on desktop too',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await expect(bar).toBeVisible();
 // The library's scroll range depends on its content, so the test scrolls to fractions of it, clear of the bar's always-shown ends.
 const range=await page.evaluate(()=>document.documentElement.scrollHeight-innerHeight);
 await page.evaluate(y=>window.scrollTo(0,y),Math.round(range/2));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await expect.poll(async()=>(await bar.boundingBox())!.y).toBeGreaterThanOrEqual(900);
 await page.evaluate(y=>window.scrollTo(0,y),Math.round(range/4));
 await expect(bar).not.toHaveAttribute('data-hidden');
 await expect.poll(async()=>{const box=await bar.boundingBox();return box!.y+box!.height;}).toBeLessThanOrEqual(900);
});

test('the island stays hidden in games and Movies on desktop',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
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
 // Hover colour and background change at once: a tab never transitions them, only its transform and its label fade.
 // The exact list: a tab moves its transform and fades its label, and its colour and background change at once.
 expect(await study.evaluate(element=>getComputedStyle(element).transitionProperty)).toBe('transform, opacity');
 await games.hover();
 // The current tab keeps no lozenge of its own: the pill carries the highlight, and a hover leaves it alone.
 expect(await alpha(games)).toBe(0);
 expect(await bar.evaluate(element=>{const match=getComputedStyle(element,'::after').backgroundColor.match(/[\d.]+(?=\)$)/);return match?Number(match[0]):0;})).toBeGreaterThanOrEqual(0.12);
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

test('the island clears the last game card when the library is scrolled to the end',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/');
 const bar=page.locator('.app-tabbar');
 await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
 expect(await page.evaluate(()=>scrollY+innerHeight)).toBe(await page.evaluate(()=>document.documentElement.scrollHeight));
 // The end zone always shows the bar. Wait until it has slid fully on screen before reading its position.
 await expect(bar).toBeVisible();
 await expect(bar).not.toHaveAttribute('data-hidden');
 await expect.poll(async()=>{const box=await bar.boundingBox();return box!.y+box!.height;}).toBeLessThanOrEqual(844);
 const island=(await bar.boundingBox())!;
 const lastCard=(await page.locator('.game-card').last().boundingBox())!;
 // The 88 px bottom padding of #content keeps the last card clear of the bar.
 expect(island.y).toBeGreaterThanOrEqual(lastCard.y+lastCard.height);
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).scrollPaddingBottom)).toBe('88px');
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
 await page.locator('.app-tabbar').getByRole('link',{name:'Movies',exact:true}).click();
 const back=page.locator('#content').getByRole('link',{name:'Back to games',exact:true});
 await expect(back).toBeVisible();
 await expect(page.locator('.app-tabbar')).toHaveCount(1);
 await expect(page.locator('.app-tabbar')).toBeHidden();
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
 await page.locator('.app-tabbar').getByRole('link',{name:'Movies',exact:true}).click();
 await expect(page.locator('#content')).toContainText('Movies & TV could not load.');
 await expect(page.locator('.app-tabbar')).toHaveCount(1);
 await expect(page.locator('.app-tabbar')).toBeHidden();
 const back=page.locator('#content').getByRole('link',{name:'Back to games',exact:true});
 await expect(back).toHaveClass('game-button secondary');
 const box=await back.boundingBox();
 expect(Math.abs(box!.x+box!.width/2-page.viewportSize()!.width/2)).toBeLessThan(2);
});
