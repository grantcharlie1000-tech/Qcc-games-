import {test,expect,seedStudyTopic} from '../fixtures';

const surfaces=[
  {route:'/',menu:'.app-menu',bar:'.app-tabbar'},
  {route:'/#/movies/browse/movie',menu:'.movies-menu',bar:'.movies-mobile-nav'},
];

for(const width of [1280,390])test(`Reduce transparency persists across menus and restores glass at ${width}px`,async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width,height:844});
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  await page.goto('/');
  const normal=await page.locator('.app-tabbar').getAttribute('data-glass');
  await page.locator('.app-menu').click();
  const setting=page.getByRole('checkbox',{name:'Reduce transparency',exact:true});
  await expect(setting).toBeVisible();
  await setting.check();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu')).toBeHidden();
  await expect(page.locator('.app-menu')).toBeFocused();
  for(const surface of surfaces){
    await page.goto(surface.route);
    await expect(page.locator(surface.bar)).toHaveAttribute('data-glass-mode','off');
    await expect(page.locator(surface.menu)).toHaveAttribute('data-glass-mode','off');
    for(const selector of [surface.bar,surface.menu]){
      await expect(page.locator(selector)).toHaveCSS('background-color','rgb(32, 38, 43)');
      await expect(page.locator(selector)).toHaveCSS('backdrop-filter','none');
      await expect(page.locator(selector).locator('.ui-glass-lens:visible,.ui-glass-gl:visible')).toHaveCount(0);
    }
    expect(await page.locator(surface.bar).evaluate(el=>getComputedStyle(el,'::after').backgroundColor)).toBe('rgb(32, 38, 43)');
    for(const control of await page.locator('.ui-pill,.ui-icon-btn').all()){
      await expect(control).toHaveCSS('background-color','rgb(32, 38, 43)');
      await expect(control).toHaveCSS('backdrop-filter','none');
    }
    await page.locator(surface.menu).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#menu')).toBeVisible();
    await expect(setting).toBeChecked();
    await expect(page.locator('#menu')).toHaveCSS('backdrop-filter','none');
    for(const selector of ['#menu','#menu .sheet-close-glass','#menu .game-button.secondary']){
      const control=page.locator(selector).first();
      await expect(control).toHaveCSS('background-color','rgb(32, 38, 43)');
      await expect(control).toHaveCSS('backdrop-filter','none');
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator(surface.menu)).toBeFocused();
  }
  await page.reload();
  await expect(page.locator('.movies-mobile-nav')).toHaveAttribute('data-glass-mode','off');
  await page.locator('.movies-menu').click();
  await setting.uncheck();
  await page.keyboard.press('Escape');
  await expect(page.locator('.movies-mobile-nav')).toHaveAttribute('data-glass',normal!);
  await page.goto('/');
  await expect(page.locator('.app-tabbar')).toHaveAttribute('data-glass',normal!);
  await page.locator('.app-menu').click();
  await expect(setting).not.toBeChecked();
});

test('the real transparency media query remains effective with the app setting off',async({page,context,browserName})=>{
  test.skip(browserName!=='chromium','Only Chromium supports real media emulation');
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  await page.goto('/');
  const cdp=await context.newCDPSession(page);
  for(const surface of surfaces){
    await page.goto(surface.route);
    const normal=await page.locator(surface.bar).getAttribute('data-glass');
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    await expect(page.locator(surface.bar)).toHaveAttribute('data-glass-mode','off');
    await expect(page.locator(surface.bar)).toHaveCSS('background-color','rgb(32, 38, 43)');
    await expect(page.locator(surface.bar)).toHaveCSS('backdrop-filter','none');
    await page.locator(surface.menu).click();
    const setting=page.getByRole('checkbox',{name:'Reduce transparency',exact:true});
    await setting.check();
    await setting.uncheck();
    await page.keyboard.press('Escape');
    await expect(page.locator(surface.bar)).toHaveAttribute('data-glass-mode','off');
    await cdp.send('Emulation.setEmulatedMedia',{features:[]});
    await expect(page.locator(surface.bar)).toHaveAttribute('data-glass',normal!);
  }
});

for(const width of [390,1280])test('solid glass buttons keep pointer and tap focus quiet and show keyboard focus at '+width+'px',async({browser})=>{
  const context=await browser.newContext({viewport:{width,height:844},hasTouch:true});
  await seedStudyTopic(context);
  await context.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  const page=await context.newPage();
  try{
    await page.goto('/');
    await page.locator('.app-menu').tap();
    await page.getByRole('checkbox',{name:'Reduce transparency',exact:true}).check();
    await page.getByRole('button',{name:'Close menu',exact:true}).tap();
    for(const surface of surfaces){
      await page.goto(surface.route);
      const menu=page.locator(surface.menu);
      await menu.tap();
      const close=page.getByRole('button',{name:'Close menu',exact:true});
      await close.focus();
      await expect(close).toHaveCSS('outline-style','none');
      await expect(close).toHaveCSS('box-shadow','none');
      await expect(close).not.toHaveCSS('border-top-color','rgb(255, 255, 255)');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(close).toBeFocused();
      await expect(close).toHaveCSS('outline-style','solid');
      await close.tap();
      await expect(page.locator('#menu')).toBeHidden();
      await expect(menu).toHaveCSS('outline-style','none');
      await expect(menu).toHaveCSS('box-shadow','none');
      await expect(menu).not.toHaveCSS('border-top-color','rgb(255, 255, 255)');
      for(const control of await page.locator('.arcade-glass:is(button,a),.arcade-glass :is(button,a)').all()){
        if(!await control.isVisible())continue;
        await control.focus();
        await expect(control).toHaveCSS('outline-style','none');
        await expect(control).toHaveCSS('box-shadow','none');
      }
      await menu.click();
      for(const control of await page.locator('#menu button.arcade-glass').all()){
        await control.focus();
        await expect(control).toHaveCSS('outline-style','none');
        await expect(control).toHaveCSS('box-shadow','none');
      }
      await close.click();
    }
  }finally{await context.close();}
});
