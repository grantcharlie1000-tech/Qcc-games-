import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';

async function open(page:Page,fallback:boolean,chromium:boolean){
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  await page.goto(`/${fallback?'?glass=fallback':''}#/collection`);
  await expect(page.locator('.game-card').first()).toBeVisible();
  await expect(page.locator('.app-tabbar')).toHaveAttribute('data-glass',fallback||!chromium?'frost':'backdrop');
  if(!fallback&&chromium)for(const selector of ['.app-tabbar','.app-menu'])await expect(page.locator(selector)).toHaveClass(/is-refracting/);
}
async function finish(page:Page){
  await page.locator('.app-navigation').evaluate(el=>{for(const a of el.getAnimations({subtree:true}))a.finish();});
}
async function material(page:Page,selector:string){
  return page.locator(selector).evaluate(el=>{
    const read=(s:CSSStyleDeclaration)=>({filter:s.backdropFilter.replace(/url\([^)]*\)/g,'url(lens)'),background:s.background,border:s.border,shadow:s.boxShadow});
    const surface=getComputedStyle(el,'::before');
    const lens=el.querySelector('.ui-glass-lens');
    return {root:read(getComputedStyle(el)),lens:lens?read(getComputedStyle(lens)):null,veil:read(surface),veilOpacity:surface.opacity,ink:getComputedStyle(el.querySelector('.ui-tab')??el).color};
  });
}

for(const fallback of [false,true]){
  const mode=fallback?'CSS fallback':'Chromium lens';
  test(`${mode}: every filtered layer stays inside the morphing pill`,async({page,browserName})=>{
    await open(page,fallback,browserName==='chromium');
    const bar=page.locator('.app-tabbar');
    await page.evaluate(()=>scrollTo(0,180));await expect(bar).toHaveAttribute('data-minimized','true');
    await page.locator('.app-navigation').evaluate(el=>{for(const a of el.getAnimations({subtree:true})){a.pause();a.currentTime=110;}});
    for(const phase of ['mid','collapsed']){
      if(phase==='collapsed')await finish(page);
      const overflow=await page.locator('.app-navigation').evaluate(nav=>{
        const pill=nav.querySelector('.app-tabbar')!.getBoundingClientRect();
        return [...nav.querySelectorAll<HTMLElement>('*')].flatMap(el=>{
          const s=getComputedStyle(el),r=el.getBoundingClientRect();
          return s.backdropFilter!=='none'&&(r.width>pill.width+1||r.height>pill.height+1)?[{class:el.className,width:r.width,height:r.height,pill:{width:pill.width,height:pill.height}}]:[];
        });
      });
      expect(overflow,phase).toEqual([]);
      await expect(bar).toHaveCSS('opacity','1');
    }
    const box=(await bar.boundingBox())!;expect(box.width).toBeLessThanOrEqual(57);expect(box.height).toBeLessThanOrEqual(49);
    await page.keyboard.press('Tab');
    await page.locator('.app-tabbar .ui-tab').first().focus();
    await expect.poll(async()=>Math.round((await bar.boundingBox())!.width)).toBeGreaterThan(200);
    await page.locator('.app-tabbar .ui-tab').first().blur();
    await page.evaluate(()=>scrollTo(0,80));await expect(bar).not.toHaveAttribute('data-minimized','true');
    await finish(page);expect((await bar.boundingBox())!.width).toBeGreaterThan(200);
  });

  test(`${mode}: one material survives collapse and every section route`,async({page,browserName})=>{
    await open(page,fallback,browserName==='chromium');
    const initial=await material(page,'.app-tabbar');
    expect(await material(page,'.app-menu')).toEqual(initial);
    const miniRoot=await page.locator('.app-navigation .ui-tabbar-mini').evaluate(el=>{
      const s=getComputedStyle(el);return {filter:s.backdropFilter,background:s.background,border:s.border,shadow:s.boxShadow};
    });
    expect(miniRoot.filter).toBe('none');expect(miniRoot.shadow).toBe('none');
    expect(miniRoot.background).toContain('rgba(0, 0, 0, 0)');
    await page.evaluate(()=>scrollTo(0,180));await expect(page.locator('.app-tabbar')).toHaveAttribute('data-minimized','true');
    await page.locator('.app-navigation').evaluate(el=>{for(const a of el.getAnimations({subtree:true})){a.pause();a.currentTime=110;}});
    expect(await material(page,'.app-tabbar')).toEqual(initial);
    await finish(page);expect(await material(page,'.app-tabbar')).toEqual(initial);
    for(const route of ['movies/browse/movie','movies/browse/tv','movies/list','collection']){
      await page.evaluate(route=>location.hash='#/'+route,route);
      const movie=route.startsWith('movies'),bar=movie?'.movies-mobile-nav':'.app-tabbar',menu=movie?'.movies-menu':'.app-menu';
      const section=route==='collection'?'games':route.endsWith('/tv')?'tv':route.endsWith('/list')?'list':'movies';
      // Visibility alone no longer establishes route completion: this is the
      // same persistent node throughout every section transition.
      await expect(page.locator(`.section-tabbar [data-section=${section}]`)).toHaveAttribute('aria-current','page');
      await expect(page.locator(movie?'.movies-view':'.game-card').first()).toBeVisible();
      if(movie)await expect(page.locator('.movies-page-head h1')).toHaveText(section==='tv'?'TV Shows':section==='list'?'My list':'Movies');
      await expect(page.locator(bar)).toBeVisible();
      if(!fallback&&browserName==='chromium')for(const selector of [bar,menu])await expect(page.locator(selector)).toHaveClass(/is-refracting/);
      expect(await material(page,bar),route).toEqual(initial);
      expect(await material(page,menu),route+' companion').toEqual(initial);
    }
    await page.locator('.app-tabbar [data-action=study]').click();await expect(page.locator('#study-view')).toBeVisible();
    expect(await material(page,'.app-tabbar')).toEqual(initial);
  });
}
