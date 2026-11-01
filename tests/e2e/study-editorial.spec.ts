import {appSettings} from '../game-menu';
import {GAME_IDS} from '../../src/core/types';
import {guestTest as test,expect} from '../fixtures';
import {expectCleanStudy} from '../study-article-assertions';

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1366,height:768}])test(`neutral study articles and embedded Games navigation fit ${viewport.width}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/');await expect(page.locator('[data-study-topic]')).toHaveCount(20);
 await page.getByRole('button',{name:'Accept All',exact:true}).click();await expectCleanStudy(page.locator('#study-view'));
 await page.locator('[data-study-topic="close-reading"]').click();await appSettings(page);
 const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
 await page.getByRole('button',{name:'Study Mode',exact:true}).click();
 const view=page.locator('#study-view'),games=page.locator('.study-article-body p').getByRole('link',{name:'Games',exact:true});
 await expect(games).toBeVisible();await expect(page.locator('.study-article-meta')).toContainText('Mauri Study Notes');await expect(page.locator('.study-hero img')).toBeVisible();
 const ids=await page.locator('#study-topic option').evaluateAll(es=>es.map(e=>(e as HTMLOptionElement).value));
 for(const id of ids){
  await page.getByLabel('Study topic',{exact:true}).selectOption(id);await expectCleanStudy(view);
  await expect(page.locator('.study-chapter svg,.study-sidebar')).toHaveCount(0);await expect(page.locator('.study-text-section')).toHaveCount(6);
  const photoTopics=['close-reading','essay-writing','poetry','film-language','forces','energy','inheritance','ecosystems','rivers-flooding','supply-demand','hauora'];
  await expect(page.locator('.study-hero img')).toHaveCount(photoTopics.includes(id)?1:0);
  await page.locator('.study-chapter img').evaluateAll(images=>Promise.all(images.map(image=>{(image as HTMLImageElement).loading='eager';return (image as HTMLImageElement).decode();})));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 expect(requests.filter(url=>new URL(url).origin!==new URL(page.url()).origin||!/^\/study\/photos\/[a-z-]+\.webp$/.test(new URL(url).pathname))).toEqual([]);
 await games.focus();await page.keyboard.press('Enter');await expect(page.locator('.game-card')).toHaveCount(GAME_IDS.length);await expect(view).toBeHidden();
});

test('modified Games clicks reach the browser without returning the retained game',async({page,context})=>{
 await page.goto('/#/game/minesweeper');await page.locator('[data-study-topic="close-reading"]').click();
 await expect(page.locator('.ms')).toBeVisible();
 const retained=await page.locator('#game-stage > *').first().elementHandle();
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
 const games=page.locator('.study-article-body p').getByRole('link',{name:'Games',exact:true});
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
