import {test,expect} from '../../fixtures';

const games=['color-blocks','solitaire','block-fill','fivefold','minesweeper','pool','corn-clicker'];
for(const width of [320,390,1366])test.describe(`${width}px puzzle controls`,()=>{
 test.use({viewport:{width,height:width<700?844:768},hasTouch:width<700,isMobile:width<700,reducedMotion:'reduce'});
 for(const game of games)test(`${game} opens directly and resumes from the original pause overlay`,async({page})=>{
  await page.goto('/#/game/'+game);await expect(page.locator('.game-hud-item').first()).toBeAttached();
  await expect(page.locator('.game-sheet:visible')).toHaveCount(0);
  expect(await page.locator('.game-hud-item small,.game-hud-item strong').evaluateAll(items=>items.every(e=>e.scrollWidth<=e.clientWidth+1))).toBe(true);
  expect(await page.locator('.game-hud-item').evaluateAll(items=>items.every(item=>[...item.querySelectorAll('span,strong')].every(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return !e.textContent?.trim()||r.height<=parseFloat(s.lineHeight)*1.1;})))).toBe(true);
  if(game==='block-fill')await expect(page.locator('.game-compact-hud')).toContainText('Garden 1/32 · 11%');
  expect(await page.locator('.game-compact-hud').evaluateAll(items=>items.every(e=>e.scrollWidth<=e.clientWidth+1))).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // The browser's visibility event uses the same pause path as a background tab.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete (document as unknown as Record<string,unknown>).hidden;});
  const sheet=page.locator('#pause-overlay');
  await expect(sheet).toBeVisible();await expect(sheet.getByRole('heading',{name:'Paused',exact:true})).toBeVisible();
  await expect(sheet.getByRole('button')).toHaveCount(1);
  await sheet.getByRole('button',{name:'Keep playing',exact:true}).click();await expect(sheet).toBeHidden();
 });
});
