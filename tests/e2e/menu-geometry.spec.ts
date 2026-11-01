import {test,expect} from '../fixtures';

// Geometry only: the glass recipe and its bindings belong to the material.
for(const width of [320,390,1366])for(const route of ['collection','movies','movies/browse/tv']){
  test(`${route} Menu shares the bar's height and baseline at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
    await page.goto(`/#/${route}`);
    const nav=page.locator('.section-navigation:visible'),bar=nav.locator('.section-tabbar'),menu=nav.locator('.section-menu');
    await expect(menu).toBeVisible();
    await expect.poll(()=>nav.evaluate(root=>{
      const bar=root.querySelector('.section-tabbar')!.getBoundingClientRect(),circle=root.querySelector('.section-menu')!.getBoundingClientRect();
      const tabs=[...root.querySelectorAll<HTMLElement>('.section-tabbar>.ui-tab')].map(e=>e.getBoundingClientRect());
      return {height:Math.abs(bar.height-circle.height),top:Math.abs(bar.top-circle.top),bottom:Math.abs(bar.bottom-circle.bottom),round:Math.abs(circle.width-circle.height),gap:circle.left-bar.right,fits:tabs.every(t=>t.left>=bar.left&&t.right<=bar.right&&t.width>=44&&t.height>=44)};
    })).toMatchObject({height:0,top:0,bottom:0,round:0,fits:true});
    const boxes=await Promise.all([bar.boundingBox(),menu.boundingBox()]);
    expect(boxes[1]!.x-boxes[0]!.x-boxes[0]!.width).toBeGreaterThanOrEqual(8);
    expect(boxes[1]!.x+boxes[1]!.width).toBeLessThanOrEqual(width-8);
    await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();document.documentElement.dataset.input='pointer';});
    await bar.evaluate(e=>e.setAttribute('data-minimized','true'));
    await expect(bar).toHaveCSS('height','48px');
    await expect(menu).toHaveCSS('opacity','0');
    const hidden=await menu.boundingBox();expect(hidden?.height??0).toBe(0);
    // Keyboard access restores the whole group, including the matching circle.
    await page.keyboard.press('Tab');await menu.focus();
    await expect(menu).toHaveCSS('opacity','1');
    await expect.poll(()=>nav.evaluate(root=>{
      const a=root.querySelector('.section-tabbar')!.getBoundingClientRect(),b=root.querySelector('.section-menu')!.getBoundingClientRect();
      return [a.height-b.height,a.top-b.top,a.bottom-b.bottom];
    })).toEqual([0,0,0]);
  });
}

for(const width of [320,390,1366])test(`in-game controls retain one common height at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});await page.goto('/#/game/snake');
  await expect(page.locator('.game-hud strong').first()).toBeVisible();
  const sizes=await page.locator('.game-dock>.game-glass').evaluateAll(objects=>objects.map(e=>e.getBoundingClientRect().height));
  expect(sizes.length).toBe(3);expect(Math.min(...sizes)).toBeGreaterThanOrEqual(44);expect(new Set(sizes).size).toBe(1);
});
