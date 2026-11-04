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
test('live canvas ink follows bright and dark frames',async({page})=>{
 await page.goto('/#/game/neon-coil');await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.locator('.nc-canvas').evaluate(old=>{
  const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;canvas.className='nc-canvas';old.replaceWith(canvas);
  canvas.getContext('2d')!.fillStyle='#fff';canvas.getContext('2d')!.fillRect(0,0,390,844);
 });
 const ink=page.locator('.game-hud strong');
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(11, 16, 21)');
 await page.locator('.nc-canvas').evaluate(e=>{(e as HTMLElement).style.opacity='0';(e.parentElement as HTMLElement).style.background='#000';});
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await page.locator('.nc-canvas').evaluate(e=>(e as HTMLElement).style.opacity='1');
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(11, 16, 21)');
 await page.locator('.nc-canvas').evaluate(e=>{const c=e as HTMLCanvasElement;const ctx=c.getContext('2d')!;ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);});
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await expect(ink).toHaveCSS('-webkit-text-stroke-width','0px');
});

for(const appsAvailable of [false,true])for(const fallback of [false,true])test(`navigation icons stay white while labels adapt (${fallback?'fallback':'native'}, Apps ${appsAvailable?'enabled':'disabled'})`,async({page})=>{
 // Pin the capability probe: these counts must not depend on the test server's backend.
 await page.route('**/.netlify/functions/chat**',route=>route.fulfill({status:appsAvailable?401:404,json:{error:appsAvailable?'unauthorized':'not_found'}}));
 const probe=page.waitForResponse(response=>response.url().includes('/.netlify/functions/chat?action=summary'));
 await page.goto(`/${fallback?'?glass=fallback':''}#/collection`);
 await (await probe).finished();
 const apps=page.locator('.app-tabbar [data-action=apps]');
 if(appsAvailable){await expect(page.locator('.app-navigation')).toHaveAttribute('data-apps','on');await expect(apps).toBeVisible();}
 else{await expect(page.locator('.app-navigation')).not.toHaveAttribute('data-apps','on');await expect(apps).toHaveCount(0);}
 await page.locator('.app-tabbar .ui-tab').first().focus();
 await page.addStyleTag({content:'#content *{visibility:hidden!important}#content{background:transparent!important}'});
 const icons=page.locator('.app-navigation>.arcade-glass svg.ui-icon');
 await expect(icons).toHaveCount(appsAvailable?7:6);
 for(const [background,labelColor] of [['#fff','rgb(11, 16, 21)'],['#000','rgb(255, 255, 255)'],['#fff','rgb(11, 16, 21)']]){
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

test('Apps icons stay white while unread badges keep dark ink across repeated launcher opens',async({page})=>{
 // A local test session plus deterministic responses exercise the real launcher without a database.
 await page.addInitScript(()=>localStorage.setItem('pocket-arcade:v1:accounts:session',JSON.stringify({username:'icon_test',token:`acct_${'a'.repeat(64)}`})));
 await page.route('**/.netlify/functions/accounts**',route=>route.fulfill({json:{protocolVersion:2,cursor:'0',saves:{},conflicts:{},revisions:{},acks:{}}}));
 await page.route('**/.netlify/functions/chat**',route=>route.fulfill({json:{unread:2,requests:0}}));
 await page.goto('/#/collection');
 const apps=page.locator('.app-tabbar [data-action=apps]'),badge=apps.locator('.apps-badge');
 await expect(apps).toHaveAttribute('aria-label','Apps, 2 unread messages');
 await expect(badge).toHaveText('2');
 await page.addStyleTag({content:'#content *{visibility:hidden!important}#content{background:transparent!important}'});
 for(const [background,labelColor] of [['#fff','rgb(11, 16, 21)'],['#000','rgb(255, 255, 255)']]){
  await page.evaluate(background=>{document.body.style.background=background;document.documentElement.style.background=background;dispatchEvent(new Event('resize'));},background);
  await expect.poll(()=>apps.locator(':scope>span:not(.apps-badge)').evaluate(e=>getComputedStyle(e).color)).toBe(labelColor);
  await expect(apps.locator('svg')).toHaveCSS('color','rgb(255, 255, 255)');
  expect(await apps.locator('svg').evaluate(e=>(e as HTMLElement).style.getPropertyValue('--glass-adaptive-ink'))).toBe('');
  await expect(badge).toHaveCSS('color','rgb(9, 9, 11)');
  expect(await badge.evaluate(e=>({wrapped:e.children.length,adaptive:(e as HTMLElement).style.getPropertyValue('--glass-adaptive-ink')}))).toEqual({wrapped:0,adaptive:''});
  await apps.click();
  const sheet=page.locator('#apps-dialog'),sheetBadge=sheet.locator('[data-app=chat] .apps-badge');
  await expect(sheet.locator('h2 .glass-ink')).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(sheet.locator('.sheet-close-glass svg')).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(sheetBadge).toHaveText('2');await expect(sheetBadge).toHaveCSS('color','rgb(9, 9, 11)');
  expect(await sheetBadge.evaluate(e=>({wrapped:e.children.length,adaptive:(e as HTMLElement).style.getPropertyValue('--glass-adaptive-ink')}))).toEqual({wrapped:0,adaptive:''});
  await sheet.getByRole('button',{name:'Close apps',exact:true}).click();await expect(sheet).toBeHidden();await expect(apps).toBeFocused();
 }
});

test('app primary controls keep dark ink beside white sheet icons on repeated opens',async({page})=>{
 await page.goto('/#/collection');
 for(let opened=0;opened<2;opened++){
  await page.evaluate(async()=>{
   const path='/src/apps/sheets.ts';const {appSheet,showSheet}=await import(/* @vite-ignore */ path);
   const {dialog,body}=appSheet('apps-confirm','Primary ink regression');
   const button=document.createElement('button');button.type='button';button.className='ui-btn primary apps-pill';
   button.append(document.createTextNode('Keep '));const label=document.createElement('span');label.textContent='dark ink';button.append(label);body.append(button);
   showSheet(dialog,document.querySelector('.app-menu'));
  });
  const sheet=page.locator('#apps-confirm'),primary=sheet.locator('.ui-btn.primary');
  // Wait for the real sheet ink pass before checking the excluded controls.
  await expect(sheet.locator('h2 .glass-ink')).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(sheet.locator('.sheet-close-glass svg')).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(primary).toHaveCSS('color','rgb(0, 0, 0)');await expect(primary.locator('span')).toHaveCSS('color','rgb(0, 0, 0)');
  await expect(primary.locator('.glass-label,.glass-ink')).toHaveCount(0);
  expect(await primary.locator('span').evaluate(e=>(e as HTMLElement).style.getPropertyValue('--glass-adaptive-ink'))).toBe('');
  await sheet.getByRole('button',{name:'Close',exact:true}).click();await expect(sheet).toBeHidden();
 }
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
 for(const [background,labelColor] of [['#fff','rgb(11, 16, 21)'],['#000','rgb(255, 255, 255)'],['#fff','rgb(11, 16, 21)']]){
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
