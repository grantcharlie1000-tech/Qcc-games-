import {test,expect} from '../fixtures';

for(const width of [390,1280])test(`dragging Games to Study selects Study at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const games=bar.locator('[href="#/collection"]');
  const study=bar.locator('[data-action="study"]');
  await expect(games).toHaveAttribute('aria-current','page');
  const start=(await games.boundingBox())!;
  const end=(await study.boundingBox())!;
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);
  await page.mouse.down();
  await page.mouse.move(end.x+end.width/2-14,end.y+end.height/2,{steps:16});
  await page.mouse.up();
  // The pill settles visibly before Study hides the shell.
  await expect.poll(()=>bar.evaluate(el=>{
    const tab=el.querySelector<HTMLElement>('[data-action="study"]')!;
    const pill=getComputedStyle(el,'::after');
    return Math.abs(parseFloat(pill.translate)+parseFloat(pill.width)/2-tab.offsetLeft-tab.offsetWidth/2);
  }),{intervals:[25]}).toBeLessThanOrEqual(2);
  // Study opens its reading view in the default configuration.
  await expect(page.locator('#study-view')).toBeVisible();
});

test('a Movies drag selects the destination and keeps the pill there',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/movies/browse/movie');
  const bar=page.locator('.movies-mobile-nav');
  const movies=bar.locator('[data-kind="movie"]');
  const tv=bar.locator('[data-kind="tv"]');
  await expect(movies).toHaveAttribute('aria-pressed','true');
  const start=(await movies.boundingBox())!;
  const end=(await tv.boundingBox())!;
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);
  await page.mouse.down();
  await page.mouse.move(end.x+end.width/2-10,end.y+end.height/2,{steps:12});
  await page.mouse.up();
  await expect(tv).toHaveAttribute('aria-pressed','true');
  await expect.poll(()=>bar.evaluate(el=>{
    const tab=el.querySelector<HTMLElement>('[data-kind="tv"]')!;
    const pill=getComputedStyle(el,'::after');
    return Math.abs(parseFloat(pill.translate)+parseFloat(pill.width)/2-tab.offsetLeft-tab.offsetWidth/2);
  })).toBeLessThanOrEqual(2);
});

test('a newer menu action cancels the pending drag selection',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const start=(await bar.locator('[href="#/collection"]').boundingBox())!;
  const end=(await bar.locator('[data-action="study"]').boundingBox())!;
  const menu=(await page.locator('.app-menu').boundingBox())!;
  await page.mouse.move(start.x+start.width/2,start.y+start.height/2);
  await page.mouse.down();
  await page.mouse.move(end.x+end.width/2,end.y+end.height/2,{steps:8});
  await page.mouse.up();
  await page.mouse.move(menu.x+menu.width/2,menu.y+menu.height/2);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('#study-view')).toBeHidden();
  await expect(bar.locator('[href="#/collection"]')).toHaveAttribute('aria-current','page');
});

test('a drag released outside the bar returns to Games',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  const bar=page.locator('.app-tabbar');
  const games=bar.locator('[href="#/collection"]');
  const box=(await games.boundingBox())!;
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.down();
  await page.mouse.move(200,box.y+box.height/2,{steps:8});
  await page.mouse.move(200,box.y-50);
  await page.mouse.up();
  await expect.poll(()=>bar.evaluate(el=>{
    const tab=el.querySelector<HTMLElement>('[href="#/collection"]')!;
    const pill=getComputedStyle(el,'::after');
    return Math.abs(parseFloat(pill.translate)+parseFloat(pill.width)/2-tab.offsetLeft-tab.offsetWidth/2);
  })).toBeLessThanOrEqual(2);
  await expect(page.locator('#study-view')).toBeHidden();
  await expect(games).toHaveAttribute('aria-current','page');
});
