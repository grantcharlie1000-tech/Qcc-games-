import {test,expect} from '../fixtures';
import {openGameMenu} from '../game-menu';

test.use({viewport:{width:390,height:844},hasTouch:true});
for(const route of ['collection','game/snake','game/neon-coil'])test(`${route} uses a clear, softly blurred surface without stroke halos`,async({page})=>{
  await page.goto(`/#/${route}`);
  const surface=page.locator(route.startsWith('game')?'.game-hud':'.app-tabbar');
  await expect(surface).toBeVisible();
  await expect(surface.locator('.glass-ink').first()).toBeAttached();
  const material=await surface.evaluate(e=>{
    const s=getComputedStyle(e),lens=e.querySelector('.ui-glass-lens');
    return {fill:getComputedStyle(e,'::before').backgroundColor,blur:getComputedStyle(lens??e).backdropFilter||s.backdropFilter,
      strokes:[...e.querySelectorAll('.glass-ink')].map(g=>getComputedStyle(g).webkitTextStrokeWidth),halos:e.querySelectorAll('.glass-vector-halo').length};
  });
  expect(Number(material.fill.match(/[\d.]+/g)?.[3]??1)).toBeLessThanOrEqual(.02);
  const blur=Number(material.blur.match(/blur\(([\d.]+)px\)/)?.[1]??0);
  expect(blur).toBeGreaterThanOrEqual(2);expect(blur).toBeLessThanOrEqual(4);
  expect(material.blur).not.toMatch(/contrast|brightness/);
  expect(material.strokes.every(s=>s==='0px')).toBe(true);expect(material.halos).toBe(0);
  if(route.startsWith('game/'))await openGameMenu(page);
  else if(route==='collection')await page.locator('.app-navigation .section-menu').click();
  const sheet=page.locator('dialog[open]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS('-webkit-text-stroke-width','0px');
  expect(await sheet.evaluate(e=>getComputedStyle(e).backdropFilter)).toContain('blur(3px)');
  const fill=await sheet.evaluate(e=>getComputedStyle(e).backgroundColor);
  expect(Number(fill.match(/[\d.]+/g)?.[3]??1)).toBeLessThanOrEqual(.02);
});
