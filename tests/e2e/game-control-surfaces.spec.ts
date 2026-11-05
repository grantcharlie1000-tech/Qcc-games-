import {test,expect} from '../fixtures';

test.describe.configure({timeout:90000});

// These are decorative dock rims, not focus outlines. The underlying shared
// lens and all native hit targets stay in place when the extra boxes go away.
for(const viewport of [{width:390,height:844},{width:1440,height:900}]){
  test(`Globle dock has clear glass without separate painted boxes at ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport);
    await page.goto('/#/game/globle');
    const dock=page.locator('.game-dock');
    const controls=dock.locator(':scope>.arcade-glass.game-glass');
    await expect(controls).toHaveCount(3);
    await expect(page.locator('.game-compact-hud')).toContainText('Daily');
    for(const control of await controls.all()){
      await expect(control).toBeVisible();
      await expect(control).toHaveAttribute('data-glass',/^(backdrop|frost)$/);
      await expect(control).toHaveCSS('border-top-width','0px');
      await expect(control).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
      await expect.poll(()=>control.evaluate(el=>getComputedStyle(el,'::before').boxShadow)).toBe('none');
      await expect(control.locator(':scope>.ui-glass-glow')).toHaveCSS('background-image','none');
      const material=await control.evaluate(el=>{
        const lens=el.querySelector('.ui-glass-lens'),live=el.querySelector('.ui-glass-gl');
        return {mode:el.getAttribute('data-glass'),tint:getComputedStyle(el,'::before').backgroundColor,
          filter:getComputedStyle(lens??el).backdropFilter,live:!!live&&getComputedStyle(live).visibility==='visible'};
      });
      expect(['backdrop','frost']).toContain(material.mode);
      expect(material.tint).not.toBe('rgba(0, 0, 0, 0)');
      expect(material.filter!=='none'||material.live).toBe(true);
      const bounds=(await control.boundingBox())!;
      expect(bounds.height).toBeGreaterThanOrEqual(44);
      expect(bounds.width).toBeGreaterThanOrEqual(44);
    }
    // Fine-pointer hover must not paint the box back around the Menu control.
    const menu=page.locator('#game-menu');
    await menu.hover();
    await expect.poll(()=>menu.evaluate(el=>getComputedStyle(el,'::before').boxShadow)).toBe('none');
    await page.mouse.move(0,0);
    // The screenshot's country-field ring is intentional and remains visible.
    await page.getByRole('textbox',{name:'Country name',exact:true}).focus();
    await expect(page.locator('.gl-search')).toHaveCSS('outline-style','solid');
    await expect(page.locator('.gl-search')).toHaveCSS('outline-width','3px');
    await test.info().attach(`globle-clear-control-edges-${viewport.width}`,{body:await page.screenshot({animations:'disabled'}),contentType:'image/png'});
    await page.keyboard.press('Tab');
    await menu.focus();
    await expect(menu).toHaveCSS('outline-style','solid');
    expect(Number.parseFloat(await menu.evaluate(el=>getComputedStyle(el).outlineWidth))).toBeGreaterThanOrEqual(2);
    await menu.press('Enter');
    await expect(page.locator('#game-options')).toBeVisible();
  });
}

for(const preference of ['contrast','forced-colors'] as const)test(`game dock retains accessible surfaces with ${preference}`,async({page})=>{
  await page.emulateMedia(preference==='contrast'?{contrast:'more'}:{forcedColors:'active'});
  await page.goto('/#/game/globle');
  const controls=page.locator('.game-dock>.arcade-glass.game-glass');
  await expect(controls).toHaveCount(3);
  for(const control of await controls.all()){
    await expect(control).toHaveAttribute('data-glass','off');
    await expect(control).toHaveCSS('border-top-style','solid');
    expect(Number.parseFloat(await control.evaluate(el=>getComputedStyle(el).borderTopWidth))).toBeGreaterThanOrEqual(1);
    await expect(control).not.toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  }
});
