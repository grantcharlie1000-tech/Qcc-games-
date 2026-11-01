import {test,expect} from '../fixtures';
import {readFileSync} from 'node:fs';
const catalog=JSON.parse(readFileSync('public/movies/catalog.json','utf8'));
const destinations=['Games','Movies','TV Shows','My list','Study'];

test.beforeEach(async({page,context})=>{
  await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  await context.addInitScript(titles=>localStorage.setItem('qcc:movies:v1',JSON.stringify({list:titles.map((t:{id:string})=>t.id),titles:Object.fromEntries(titles.map((t:object&{id:string})=>[t.id,t])),progress:{},meta:{}})),catalog.titles);
});

for(const width of [320,390,1366])test(`one persistent shell keeps its destinations, geometry and scroll rules at ${width}px`,async({page})=>{
  test.setTimeout(60000);await page.setViewportSize({width,height:844});await page.goto('/?glass=fallback#/collection');
  const nav=page.locator('.section-navigation'),bar=nav.locator('.section-tabbar');
  await expect(nav).toHaveCount(1);await expect(bar).toHaveAttribute('data-glass','frost');
  const identity=await nav.elementHandle();
  await nav.evaluate(root=>{
    (window as any).__shellRemovals=0;
    new MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node===root||node instanceof Element&&node.contains(root))(window as any).__shellRemovals++;}).observe(document.body,{childList:true,subtree:true});
  });
  const presentation=()=>bar.evaluate(e=>{
    const r=e.getBoundingClientRect(),s=getComputedStyle(e);
    return {box:[r.x,r.y,r.width,r.height],filter:s.backdropFilter,background:s.background,border:s.border,shadow:s.boxShadow,transition:s.transition};
  });
  const initial=await presentation();
  for(const name of destinations){
    await bar.getByRole(name==='Study'?'button':'link',{name,exact:true}).click();
    if(name==='Study')await expect(page.locator('#study-title')).toBeVisible();
    else if(name==='Games')await expect(page.locator('.game-card').first()).toBeVisible();
    else await expect(page.locator('.movies-poster').first()).toBeVisible();
    await expect(nav).toHaveCount(1);expect(await identity!.evaluate(e=>e===document.querySelector('.section-navigation'))).toBe(true);
    await expect(bar.locator(':scope>.ui-tab')).toHaveText(destinations);
    await expect.poll(presentation).toEqual(initial);
    await expect(bar.locator('[aria-current="page"]')).toHaveText(name);
    await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();document.documentElement.dataset.input='pointer';});
    const range=await page.evaluate(()=>{const e=document.body.classList.contains('movies-active')&&!document.body.classList.contains('study-active')?document.querySelector<HTMLElement>('.movies-view')!:document.scrollingElement!;e.scrollTop=0;return e.scrollHeight-e.clientHeight;});
    // Let the same passive scroll controller observe the top before reversing
    // direction; two programmatic positions in one frame are one scroll event.
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    if(range>144){
      const y=Math.min(250,range-30);await page.evaluate(y=>{const movies=document.querySelector('.movies-view');if(movies&&!document.body.classList.contains('study-active'))movies.scrollTop=y;else scrollTo(0,y);},y);
      await expect(bar).toHaveAttribute('data-minimized','true');
      await page.evaluate(y=>{const movies=document.querySelector('.movies-view');if(movies&&!document.body.classList.contains('study-active'))movies.scrollTop=y-64;else scrollTo(0,y-64);},y);
      await expect(bar).not.toHaveAttribute('data-minimized');
    }else await expect(bar).not.toHaveAttribute('data-minimized');
    await page.evaluate(()=>{const movies=document.querySelector('.movies-view');if(movies&&!document.body.classList.contains('study-active'))movies.scrollTop=0;else scrollTo(0,0);});
  }
  expect(await page.evaluate(()=>(window as any).__shellRemovals)).toBe(0);
});

for(const section of ['Movies','TV Shows','My list','Study'])test(`${section} first slot always opens Games without replacing the shell`,async({page})=>{
  await page.goto('/#/collection');const nav=page.locator('.section-navigation'),identity=await nav.elementHandle();
  await nav.getByRole(section==='Study'?'button':'link',{name:section,exact:true}).click();
  if(section==='Study')await expect(page.locator('#study-title')).toBeVisible();else await expect(page.locator('.movies-poster').first()).toBeVisible();
  await page.locator('.section-navigation:visible').getByRole('link',{name:'Games',exact:true}).click();
  await expect(page).toHaveURL(/#\/collection$/);await expect(page.locator('.game-card').first()).toBeVisible();
  expect(await identity!.evaluate(e=>e===document.querySelector('.section-navigation'))).toBe(true);await expect(nav).toHaveCount(1);
});

test('a TV title keeps TV selected in the shared shell',async({page})=>{
  await page.goto('/#/movies/tv-19885');
  await expect(page.getByRole('heading',{name:'Sherlock',exact:true})).toBeVisible();
  await expect(page.locator('.section-tabbar [aria-current=page]')).toHaveText('TV Shows');
});

test('Study keeps the shared Menu usable by keyboard and its search opens the library',async({page})=>{
  await page.goto('/#/collection');const nav=page.locator('.section-navigation');
  await nav.getByRole('button',{name:'Study',exact:true}).click();await expect(page.locator('#study-title')).toBeVisible();
  const menu=nav.getByRole('button',{name:'Open menu',exact:true});await menu.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#menu')).toHaveAttribute('open');await expect(page.locator('#menu')).toHaveAttribute('data-glass-tone','light');
  await page.locator('#search').fill('snake');await expect(page.locator('#study-view')).toBeHidden();
  await expect(page.locator('.game-card')).toHaveCount(1);
  // Escape first clears a native search field. Close explicitly to retain it.
  await page.getByRole('button',{name:'Close menu',exact:true}).click();
  await expect(menu).toBeFocused();await expect(page.locator('.game-card')).toHaveAttribute('aria-label','Play Snake');
});

test('Games keyboard activation leaves a retained Study game for the library',async({page})=>{
  await page.goto('/#/game/snake');await page.getByRole('button',{name:'Start slithering',exact:true}).click();await page.keyboard.press('Escape');
  await expect(page.locator('#study-title')).toBeVisible();
  const games=page.locator('.section-navigation').getByRole('link',{name:'Games',exact:true});await games.focus();await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/collection$/);await expect(page.locator('.game-card')).toHaveCount(21);await expect(page.locator('.snake-game')).toHaveCount(0);
});


test('the shared top controls keep identity and disappear with the bottom controls under sheets',async({page})=>{
  await page.goto('/#/collection');const header=page.locator('.section-header');await expect(header).toHaveCount(1);
  const identity=await header.elementHandle();
  for(const section of ['Movies','TV Shows','My list','Study','Games']){
    await page.locator('.section-tabbar').getByRole(section==='Study'?'button':'link',{name:section,exact:true}).click();
    await expect(page.locator('.section-tabbar [aria-current=page]')).toHaveText(section);
    expect(await identity!.evaluate(e=>e===document.querySelector('.section-header'))).toBe(true);
    await expect(header).toBeVisible();
    const hits=await header.locator('.ui-header-actions>button').evaluateAll(buttons=>buttons.map(e=>{const r=e.getBoundingClientRect();return [r.width,r.height];}));
    expect(hits.length).toBe(2);expect(hits.every(([w,h])=>w>=44&&h>=44)).toBe(true);
  }
  await page.locator('.section-menu').click();await expect(header).toHaveAttribute('inert');await expect(header).toHaveCSS('visibility','hidden');
  await page.getByRole('button',{name:'Close menu',exact:true}).click();await expect(header).not.toHaveAttribute('inert');
});

test('top and bottom controls consume the same fallback material',async({page})=>{
  await page.goto('/?glass=fallback#/collection');
  const bar=page.locator('.section-tabbar'),top=page.locator('.section-header .ui-header-actions');
  await expect(bar).toHaveAttribute('data-glass','frost');await expect(top).toHaveAttribute('data-glass','frost');
  const recipe=(element:HTMLElement)=>{const s=getComputedStyle(element),rim=getComputedStyle(element,'::before');return {filter:s.backdropFilter,background:s.background,border:s.border,shadow:s.boxShadow,tint:s.getPropertyValue('--glass-tint'),rimBackground:rim.background,rimShadow:rim.boxShadow};};
  expect(await top.evaluate(recipe)).toEqual(await bar.evaluate(recipe));
});

test('the shared Escape shortcut opens Study from every section',async({page})=>{
  await page.goto('/#/collection');
  for(const section of ['Games','Movies','TV Shows','My list']){
    await page.locator('.section-tabbar').getByRole('link',{name:section,exact:true}).click();
    await expect(page.locator('.section-tabbar [aria-current=page]')).toHaveText(section);
    await page.keyboard.press('Escape');await expect(page.locator('#study-title')).toBeVisible();
    await page.locator('.section-tabbar').getByRole('link',{name:'Games',exact:true}).click();
    await expect(page.locator('.game-card').first()).toBeVisible();
  }
});
