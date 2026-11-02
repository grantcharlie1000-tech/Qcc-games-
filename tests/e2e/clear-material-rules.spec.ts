import {test,expect} from '../fixtures';
import {openGameMenu} from '../game-menu';

test.use({viewport:{width:390,height:844},hasTouch:true});
for(const route of ['collection','game/snake','game/neon-coil'])test(`${route} uses a clear, softly blurred surface without stroke halos`,async({page})=>{
  await page.goto(`/#/${route}`);
  const surface=page.locator(route.startsWith('game')?'.game-hud':'.app-tabbar');
  await expect(surface).toBeVisible();
  await expect(surface.locator('.glass-ink').first()).toBeAttached();
  // The ::before veil settles once the surface is pill-ready.
  await expect.poll(()=>surface.evaluate(e=>getComputedStyle(e,'::before').backgroundColor)).toBe('rgba(8, 12, 18, 0.2)');
  const material=await surface.evaluate(e=>{
    const s=getComputedStyle(e),lens=e.querySelector('.ui-glass-lens'),webgl=e.matches('[data-glass-mode=webgl]:not([data-glass-partial])');
    const gl=e.querySelector(':scope>.ui-glass-gl');
    return {fill:getComputedStyle(e,'::before').backgroundColor,webgl,glVisible:!!gl&&getComputedStyle(gl).visibility==='visible',blur:webgl?s.backdropFilter:getComputedStyle(lens&&getComputedStyle(lens).display!=='none'?lens:e).backdropFilter,
      strokes:[...e.querySelectorAll('.glass-ink')].map(g=>getComputedStyle(g).webkitTextStrokeWidth),halos:e.querySelectorAll('.glass-vector-halo').length};
  });
  // The approved clear material: one shared --glass-clear-fill (8 12 18 / .20).
  // Navigation softens art with a 3px frost and a gentle tone curve; game
  // controls and sheets use the --glass-clear-blur (1.5px) recipe.
  expect(material.fill).toBe('rgba(8, 12, 18, 0.2)');
  // A live WebGL canvas behind a game control is refracted by the shared WebGL
  // lens, whose shader replaces the CSS blur (src/ui/webgl-glass.css).
  if(material.webgl){expect(material.glVisible).toBe(true);expect(material.blur).toBe('none');}
  else expect(material.blur).toMatch(route.startsWith('game')?/^blur\(1\.5px\) (url\("#ui-glass-\d+"\) )?saturate\(1\.08\)$/:/^blur\(3px\) (url\("#ui-glass-\d+"\) )?saturate\(1\.05\) brightness\(0\.9\) contrast\(0\.85\)$/);
  expect(material.strokes.every(s=>s==='0px')).toBe(true);expect(material.halos).toBe(0);
  if(route.startsWith('game/'))await openGameMenu(page);
  else if(route==='collection')await page.locator('.app-navigation .section-menu').click();
  const sheet=page.locator('dialog[open]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS('-webkit-text-stroke-width','0px');
  expect(await sheet.evaluate(e=>getComputedStyle(e).backdropFilter)).toBe('blur(1.5px) saturate(1.08)');
  expect(await sheet.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgba(8, 12, 18, 0.2)');
});
