import {test,expect} from '@playwright/test';
for(const viewport of [{width:320,height:568},{width:768,height:1024},{width:1366,height:768}])test(`editorial notes, fictional contributors and visible Games navigation fit ${viewport.width}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/');await expect(page.locator('[data-study-topic]')).toHaveCount(20);await expect(page.locator('.study-ad-placeholder')).toHaveCount(0);
 await page.screenshot({path:`docs/evidence/study-editorial/picker-${viewport.width}.png`,fullPage:true});
 await page.locator('[data-study-topic="close-reading"]').click();await expect(page.locator('.study-ad-placeholder')).toHaveCount(0);await page.getByRole('button',{name:'Open menu',exact:true}).click();
 const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
 await page.getByRole('button',{name:'Study Mode',exact:true}).click();
 const games=page.getByRole('navigation',{name:'Site navigation'}).getByRole('link',{name:'Games',exact:true});
 await expect(games).toBeVisible();await expect(page.locator('.study-byline')).toContainText('Fictional contributor');await expect(page.locator('.study-byline svg')).toBeVisible();
 await expect(page.locator('.study-ad-placeholder')).toContainText('Advertisement placeholder');await expect(page.locator('.study-ad-placeholder')).toContainText('Ads are disabled');
 await expect(page.locator('iframe')).toHaveCount(0);const formats=new Set<string>(),authors=new Set<string>();
 const ids=await page.locator('#study-topic option').evaluateAll(es=>es.map(e=>(e as HTMLOptionElement).value));
 for(const id of ids){
  await page.getByLabel('Study topic',{exact:true}).selectOption(id);await expect(page.locator('.study-byline')).toContainText('Fictional contributor');
  await expect(page.locator('.study-figure svg')).toBeVisible();await expect(page.locator('.study-chapter h2')).toHaveCount(5);
  formats.add((await page.locator('.study-chapter').getAttribute('data-format'))!);authors.add((await page.locator('.study-author-name').textContent())!);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 expect(formats.size).toBe(3);expect(authors.size).toBe(4);expect(requests).toEqual([]);
 await page.screenshot({path:`docs/evidence/study-editorial/article-${viewport.width}.png`,fullPage:true});
 const bounds=(await games.boundingBox())!;expect(bounds.height).toBeGreaterThanOrEqual(44);expect(bounds.width).toBeGreaterThanOrEqual(44);
 await games.focus();await page.keyboard.press('Enter');await expect(page.locator('.game-card')).toHaveCount(14);await expect(page.locator('#study-view')).toBeHidden();
});

test('modified Games clicks reach the browser without returning the retained game',async({page,context})=>{
 await page.goto('/#/game/minesweeper');await page.locator('[data-study-topic="close-reading"]').click();
 await expect(page.locator('.ms')).toBeVisible();
 const retained=await page.locator('#game-stage > *').elementHandle();
 await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
 // Observe after Study's delegated handler without cancelling the browser action.
 // Browser/platform choices of a tab, window or download are deliberately native.
 await page.evaluate(()=>window.addEventListener('click',event=>{
  if(!(event.target as Element).closest('[data-study-return]'))return;
  document.documentElement.dataset.gamesClickPrevented=String(event.defaultPrevented);
  document.documentElement.dataset.gamesClickTrusted=String(event.isTrusted);
 }));
 const closeOpenedPage=(opened:import('@playwright/test').Page)=>{void opened.close();};
 context.on('page',closeOpenedPage);
 const games=page.getByRole('navigation',{name:'Site navigation'}).getByRole('link',{name:'Games',exact:true});
 for(const modifier of ['Control','Meta','Shift','Alt'] as const){
  await games.click({modifiers:[modifier]});
  await expect(page.locator('html')).toHaveAttribute('data-games-click-trusted','true');
  await expect(page.locator('html')).toHaveAttribute('data-games-click-prevented','false');
  await expect(page.locator('#study-view')).toBeVisible();
  expect(await retained!.evaluate(node=>node===document.querySelector('#game-stage > *'))).toBe(true);
 }
 context.off('page',closeOpenedPage);
 // Ordinary primary clicks still use the existing lifecycle callback.
 await games.click();await expect(page.locator('#study-view')).toBeHidden();
 expect(await retained!.evaluate(node=>node===document.querySelector('#game-stage > *'))).toBe(true);
});
