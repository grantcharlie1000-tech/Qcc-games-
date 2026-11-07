import {test,expect} from '../fixtures';
test.use({viewport:{width:390,height:844},hasTouch:true});
test('frosted sheet headings and secondary actions keep white ink over dark and light content without outlines',async({page})=>{
 await page.goto('/#/collection');
 await page.addStyleTag({content:'#content *{visibility:hidden!important}#content,body{background:#050505!important}'});
 await page.locator('.app-navigation .section-menu').click();
 for(const target of ['#menu h2','#open-accounts','#open-leaderboards']){
  await expect.poll(()=>page.locator(target).evaluate(e=>getComputedStyle(e.querySelector('.glass-label')??e).color)).toBe('rgb(255, 255, 255)');
 }
 await page.keyboard.press('Escape');
 await page.addStyleTag({content:'#content,body{background:#fafafa!important}'});
 await page.locator('.app-navigation .section-menu').click();
 // #92's dark frost supplies contrast itself, so sheet ink stays white.
 for(const target of ['#menu h2','#open-accounts','#open-leaderboards']){
  await expect.poll(()=>page.locator(target).evaluate(e=>getComputedStyle(e.querySelector('.glass-label')??e).color)).toBe('rgb(255, 255, 255)');
  await expect(page.locator(target)).toHaveCSS('-webkit-text-stroke-width','0px');
 }
 await expect(page.locator('#menu .glass-vector-halo')).toHaveCount(0);
});
test('live canvas ink stays white across bright and dark frames',async({page})=>{
 await page.goto('/#/game/neon-coil');await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.locator('.nc-canvas').evaluate(old=>{
  const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;canvas.className='nc-canvas';old.replaceWith(canvas);
  canvas.getContext('2d')!.fillStyle='#fff';canvas.getContext('2d')!.fillRect(0,0,390,844);
 });
 const ink=page.locator('.game-hud strong');
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await page.locator('.nc-canvas').evaluate(e=>{(e as HTMLElement).style.opacity='0';(e.parentElement as HTMLElement).style.background='#000';});
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await page.locator('.nc-canvas').evaluate(e=>(e as HTMLElement).style.opacity='1');
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await page.locator('.nc-canvas').evaluate(e=>{const c=e as HTMLCanvasElement;const ctx=c.getContext('2d')!;ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);});
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await expect(ink).toHaveCSS('-webkit-text-stroke-width','0px');
});

for(const fallback of [false,true])test(`navigation icons and labels stay white (${fallback?'fallback':'native'})`,async({page})=>{
 await page.goto(`/${fallback?'?glass=fallback':''}#/collection`);
 await page.locator('.app-tabbar .ui-tab').first().focus();
 await page.addStyleTag({content:'#content *{visibility:hidden!important}#content{background:transparent!important}'});
 const icons=page.locator('.app-navigation>.arcade-glass svg.ui-icon');
 await expect(icons).toHaveCount(6);
 for(const [background,labelColor] of [['#fff','rgb(255, 255, 255)'],['#000','rgb(255, 255, 255)'],['#fff','rgb(255, 255, 255)']]){
  await page.evaluate(background=>{document.body.style.background=background;document.documentElement.style.background=background;dispatchEvent(new Event('resize'));},background);
  await expect.poll(()=>page.locator('.app-tabbar .ui-tab>span').first().evaluate(e=>getComputedStyle(e).color)).toBe(labelColor);
  await expect.poll(()=>icons.evaluateAll(es=>es.map(e=>getComputedStyle(e).color))).toEqual(Array(await icons.count()).fill('rgb(255, 255, 255)'));
  expect(await icons.evaluateAll(es=>es.every(e=>!(e as HTMLElement).style.getPropertyValue('--glass-adaptive-ink')))).toBe(true);
 }
 // The collapsed dock copies the selected icon and must keep the same colour.
 await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();document.querySelector('.app-tabbar')!.setAttribute('data-minimized','true');});
 await expect(page.locator('.app-navigation .ui-tabbar-mini')).toBeVisible();
 await expect(page.locator('.app-navigation .ui-tabbar-mini svg')).toHaveCSS('color','rgb(255, 255, 255)');
});

test('icon palette still respects high contrast and forced colours',async({page})=>{
 await page.goto('/#/collection');
 const menu=page.locator('.app-navigation .section-menu'),icon=menu.locator('svg.ui-icon');
 await expect(icon).toHaveCSS('color','rgb(255, 255, 255)');
 await page.emulateMedia({contrast:'more'});
 await expect(menu).toHaveAttribute('data-glass','off');
 await expect(icon).toHaveCSS('color',await menu.evaluate(e=>getComputedStyle(e).color));
 await page.emulateMedia({contrast:'no-preference',forcedColors:'active'});
 await expect(menu).toHaveAttribute('data-glass','off');
 await expect(icon).toHaveCSS('color',await menu.evaluate(e=>getComputedStyle(e).color));
 await page.emulateMedia({forcedColors:'none'});
 await expect(menu).not.toHaveAttribute('data-glass','off');
 await expect(icon).toHaveCSS('color','rgb(255, 255, 255)');
});

test('game icons stay white across canvas changes and repeated menu opens',async({page})=>{
 await page.goto('/#/game/neon-coil');await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.locator('.nc-canvas').evaluate(old=>{
  const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;canvas.className='nc-canvas';old.replaceWith(canvas);
 });
 for(const [background,labelColor] of [['#fff','rgb(255, 255, 255)'],['#000','rgb(255, 255, 255)'],['#fff','rgb(255, 255, 255)']]){
  await page.locator('.nc-canvas').evaluate((e,color)=>{const c=e as HTMLCanvasElement,ctx=c.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,c.width,c.height);},background);
  await expect.poll(()=>page.locator('.game-hud strong').evaluate(e=>getComputedStyle(e).color)).toBe(labelColor);
  await expect(page.locator('#game-menu svg')).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(page.locator('.nc-chevrons')).toHaveCSS('color','rgb(255, 255, 255)');
  await page.locator('#game-menu').click();
  await expect(page.locator('#game-options .sheet-close-glass svg')).toHaveCSS('color','rgb(255, 255, 255)');
  await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  await expect(page.locator('#game-menu')).toBeFocused();
 }
});
