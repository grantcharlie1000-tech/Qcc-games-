import {test,expect} from '../fixtures';
import {openGameMenu} from '../game-menu';

test.use({viewport:{width:390,height:844},hasTouch:true});
for(const route of ['collection','game/snake','game/neon-coil'])test(`${route} uses a clear, softly blurred surface without stroke halos`,async({page})=>{
  await page.goto(`/#/${route}`);
  const surface=page.locator(route.startsWith('game')?'.game-hud':'.app-tabbar');
  await expect(surface).toBeVisible();
  await expect(surface.locator('.glass-ink').first()).toBeAttached();
  // The ::before veil settles once the surface is pill-ready.
  await expect.poll(()=>surface.evaluate(e=>getComputedStyle(e,'::before').backgroundColor)).toBe('rgba(255, 255, 255, 0.06)');
  const material=await surface.evaluate(e=>{
    const s=getComputedStyle(e),lens=e.querySelector('.ui-glass-lens'),webgl=e.matches(':is([data-glass-mode=webgl],[data-glass-mode=canvas]):not([data-glass-partial])');
    const gl=e.querySelector(':scope>.ui-glass-gl');
    return {fill:getComputedStyle(e,'::before').backgroundColor,webgl,glVisible:!!gl&&getComputedStyle(gl).visibility==='visible',blur:webgl?s.backdropFilter:getComputedStyle(lens&&getComputedStyle(lens).display!=='none'?lens:e).backdropFilter,
      strokes:[...e.querySelectorAll('.glass-ink')].map(g=>getComputedStyle(g).webkitTextStrokeWidth),halos:e.querySelectorAll('.glass-vector-halo').length};
  });
  // Bars soften art gently; sheets use the stronger readable frost below.
  expect(material.fill).toBe('rgba(255, 255, 255, 0.06)');
  // A live WebGL canvas behind a game control is refracted by the shared WebGL
  // lens, whose shader replaces the CSS blur (src/ui/webgl-glass.css).
  if(material.webgl){expect(material.glVisible).toBe(true);expect(material.blur).toBe('none');}
  else expect(material.blur).toMatch(route.startsWith('game')?/^blur\(2px\) (url\("#ui-glass-\d+"\) )?saturate\(1\.08\)$/:/^blur\(3px\) (url\("#ui-glass-\d+"\) )?saturate\(1\.08\)$/);
  expect(material.strokes.every(s=>s==='0px')).toBe(true);expect(material.halos).toBe(0);
  if(route.startsWith('game/'))await openGameMenu(page);
  else if(route==='collection')await page.locator('.app-navigation .section-menu').click();
  const sheet=page.locator('dialog[open]');
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS('-webkit-text-stroke-width','0px');
  const optics=await sheet.evaluate(e=>{
    const s=getComputedStyle(e),gl=e.querySelector(':scope>.ui-glass-gl');
    return {webgl:e.matches('[data-glass-mode=webgl]'),partial:e.hasAttribute('data-glass-partial'),filter:s.backdropFilter,fill:s.backgroundColor,lensTint:gl?getComputedStyle(gl,'::after').backgroundColor:null};
  });
  expect(optics.webgl).toBe(false);expect(optics.lensTint).toBeNull();
  expect(optics.filter).toBe('blur(22px) saturate(1.18)');expect(optics.fill).toBe('rgba(255, 255, 255, 0.72)');
});
