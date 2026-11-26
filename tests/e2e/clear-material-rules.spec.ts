import {test,expect} from '../fixtures';
import {openGameMenu} from '../game-menu';

test.use({viewport:{width:390,height:844},hasTouch:true});
for(const route of ['collection','game/snake','game/neon-coil'])test(`${route} uses its navigation or clear HUD material and a frosted menu without stroke halos`,async({page})=>{
  // The section navigation's material is the dark theme's (LOOK-6: Apple's dark smoke; the light frost is pinned in
  // liquid-glass.spec and clear-ink-adaptation.spec).
  if(route==='collection')await page.emulateMedia({colorScheme:'dark'});
  await page.goto(`/#/${route}`);
  const surface=page.locator(route.startsWith('game')?'.game-hud':'.app-tabbar');
  await expect(surface).toBeVisible();
  await expect(surface.locator('.glass-ink').first()).toBeAttached();
  // The ::before veil settles once the surface is pill-ready.
  const fill=route==='collection'?'rgba(255, 255, 255, 0.125)':'rgba(8, 12, 18, 0.2)';
  await expect.poll(()=>surface.evaluate(e=>getComputedStyle(e,'::before').backgroundColor)).toBe(fill);
  const material=await surface.evaluate(e=>{
    const s=getComputedStyle(e),lens=e.querySelector('.ui-glass-lens'),webgl=e.matches('[data-glass-mode=webgl]:not([data-glass-partial])');
    const gl=e.querySelector(':scope>.ui-glass-gl');
    return {fill:getComputedStyle(e,'::before').backgroundColor,mode:(e as HTMLElement).dataset.glass??'',knee:getComputedStyle(e,'::before').backdropFilter,webgl,glVisible:!!gl&&getComputedStyle(gl).visibility==='visible',blur:webgl?s.backdropFilter:getComputedStyle(lens&&getComputedStyle(lens).display!=='none'?lens:e).backdropFilter,
      strokes:[...e.querySelectorAll('.glass-ink')].map(g=>getComputedStyle(g).webkitTextStrokeWidth),halos:e.querySelectorAll('.glass-vector-halo').length};
  });
  // #92 frosts navigation at 12px (in the dark theme Apple's smoke, .125 of white since LOOK-6); small HUD controls retain 1.5px/.20.
  expect(material.fill).toBe(fill);
  // A live WebGL canvas behind a game control is refracted by the shared WebGL
  // lens, whose shader replaces the CSS blur (src/ui/webgl-glass.css).
  if(material.webgl){expect(material.glVisible).toBe(true);expect(material.blur).toBe('none');}
  else if(route.startsWith('game'))expect(material.blur).toMatch(/^blur\(1\.5px\) (url\("#ui-glass-\d+"\) )?saturate\(1\.08\)$/);
  // LOOK-11: beside the WebGL bar (data-glass=backdrop) the dark smoke's roll-off is a knee on the tint's own layer
  // (section-navigation.css), so the lens keeps saturate(.92) alone; a frost on the glass itself keeps the cap.
  else if(material.mode==='backdrop'){
    expect(material.blur).toMatch(/^blur\(12px\) (url\("#ui-glass-\d+"\) )?saturate\(0\.92\)$/);
    expect(material.knee).toBe('brightness(1.5773) brightness(0.634) opacity(0.291)');
  }else expect(material.blur).toMatch(/^blur\(12px\) (url\("#ui-glass-\d+"\) )?saturate\(0\.92\) brightness\(1\.1283\) brightness\(0\.8863\)$/);
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
  // #102 (ff95043): arcade game sheets use the readable .9 fill; the collection section sheet keeps the frost fill.
  // #92 deliberately removes the sharp WebGL sheet copy: frost stays in CSS.
  expect(optics).toEqual({webgl:false,partial:false,filter:'blur(20px) saturate(1.5)',fill:route==='collection'?'rgba(12, 16, 22, 0.58)':'rgba(12, 16, 22, 0.9)',lensTint:null});
});
