import {test,expect} from '../fixtures';
import {openGameMenu} from '../game-menu';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});

// Charlie's clear-variant requirement supersedes the previous fit to the
// regular HIG tab bar: the panel must preserve the content's own luminance.
test('bars, buttons and sheets add almost no fill to their live backdrop',async({page})=>{
  await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  for(const route of ['collection','study','movies/browse/movie','game/snake']){
    await page.goto(`/#/${route}`);
    const scope=route.startsWith('game')?'.game-dock':route.startsWith('movies')?'.movies-navigation':'.app-navigation';
    await expect(page.locator(scope)).toBeVisible();
    const veils=await page.locator(`${scope} .arcade-glass`).evaluateAll(elements=>elements.map(e=>getComputedStyle(e,'::before').backgroundColor));
    for(const veil of veils)expect(Number(veil.match(/[\d.]+/g)?.[3]??1),`${route}: ${veil}`).toBeLessThanOrEqual(.02);
    if(route==='game/snake')await openGameMenu(page);
    else await page.locator(`${scope} .section-menu`).click();
    const dialog=page.locator('dialog[open]');await expect(dialog).toBeVisible();
    const material=await dialog.evaluate(e=>({fill:getComputedStyle(e).backgroundColor,filter:getComputedStyle(e).backdropFilter}));
    expect(Number(material.fill.match(/[\d.]+/g)?.[3]??1),`${route}: sheet ${material.fill}`).toBeLessThanOrEqual(.02);
    expect(material.filter).not.toMatch(/brightness|contrast|saturate\((?!1\))/);
    const blur=Number(material.filter.match(/blur\(([\d.]+)px\)/)?.[1]??0);
    expect(blur).toBeLessThanOrEqual(3);
    await page.keyboard.press('Escape');
  }
});
