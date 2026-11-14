import {test,expect} from '../fixtures';

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
    await page.locator(surface.menu).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#menu')).toBeVisible();
    await expect(setting).toBeChecked();
    await expect(page.locator('#menu')).toHaveCSS('backdrop-filter','none');
    const closeContrast=await page.locator('#menu .sheet-close-glass').evaluate(button=>{
      const luminance=(color:string)=>color.match(/[\d.]+/g)!.slice(0,3).reduce((sum,value,i)=>{
        const channel=Number(value)/255;
        return sum+[.2126,.7152,.0722][i]*(channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4);
      },0);
      const ink=luminance(getComputedStyle(button.querySelector('svg')!).color);
      const fill=luminance(getComputedStyle(button).backgroundColor);
      return (Math.max(ink,fill)+.05)/(Math.min(ink,fill)+.05);
    });
    expect(closeContrast).toBeGreaterThanOrEqual(4.5);
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
