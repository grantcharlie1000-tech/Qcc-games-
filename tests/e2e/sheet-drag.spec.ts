import {test,expect,type Page} from '../fixtures';
import {openGameMenu} from '../game-menu';

test.use({viewport:{width:390,height:844},hasTouch:true});
async function open(page:Page){await page.goto('/?glass=fallback#/game/snake');await page.getByRole('button',{name:'Start slithering',exact:true}).click();await openGameMenu(page);await expect.poll(()=>page.locator('#game-options').evaluate(e=>e.getAnimations().length)).toBe(0);return page.locator('#game-options');}
async function pull(page:Page,selector:string,dy:number,hold=160,steps=16){const r=await page.locator(selector).boundingBox();if(!r)throw Error('Missing drag target');const x=r.x+r.width/2,y=r.y+r.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y+dy,{steps});if(hold)await page.waitForTimeout(hold);return {x,y};}

test('a sheet follows the handle and distance dismissal resumes the game and restores focus',async({page})=>{
 const sheet=await open(page),before=(await sheet.boundingBox())!;
 await pull(page,'#game-options>.sheet-grabber',before.height*.36);
 const moved=(await sheet.boundingBox())!;expect(moved.y-before.y).toBeCloseTo(before.height*.36,0);
 expect(await sheet.evaluate(e=>Number(getComputedStyle(e,'::backdrop').opacity))).toBeLessThan(1);
 await page.mouse.up();await expect(sheet).toBeHidden();await expect(page.locator('#pause-overlay')).toBeHidden();await expect(page.locator('#game-menu')).toBeFocused();
 await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Pause game');
});
test('a short held pull springs back and upward pulling has resistance',async({page})=>{
 const sheet=await open(page),before=(await sheet.boundingBox())!;await pull(page,'#game-options>.sheet-grabber',60);await page.mouse.up();
 await expect.poll(async()=>Math.abs((await sheet.boundingBox())!.y-before.y)).toBeLessThan(1);await expect(sheet).toBeVisible();
 await pull(page,'#game-options>.sheet-grabber',-60);const up=(await sheet.boundingBox())!;expect(before.y-up.y).toBeGreaterThan(0);expect(before.y-up.y).toBeLessThan(30);await page.mouse.up();await expect(sheet).toBeVisible();
});
test('a quick downward flick dismisses below the distance threshold',async({page})=>{const sheet=await open(page);expect((await sheet.boundingBox())!.height*.3).toBeGreaterThan(100);await pull(page,'#game-options>.sheet-grabber',100,0,1);await page.mouse.up();await expect(sheet).toBeHidden();});
test('content which is already scrolled keeps its scroll gesture',async({page})=>{
 const sheet=await open(page);await sheet.evaluate(e=>{e.style.maxHeight='360px';e.scrollTop=100;});
 await expect.poll(()=>sheet.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
 const r=(await sheet.boundingBox())!;await page.mouse.move(r.x+8,r.y+100);await page.mouse.down();await page.mouse.move(r.x+8,r.y+300,{steps:12});await page.mouse.up();await expect(sheet).toBeVisible();expect(await sheet.evaluate(e=>e.style.translate)).toBe('');
});
test('content at the scroll top can pull down; cancellation restores the sheet',async({page})=>{
 const sheet=await open(page),r=(await sheet.boundingBox())!;await page.mouse.move(r.x+8,r.y+100);await page.mouse.down();await page.mouse.move(r.x+8,r.y+160,{steps:10});
 expect((await sheet.boundingBox())!.y-r.y).toBeCloseTo(60,0);await sheet.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();await expect.poll(async()=>Math.abs((await sheet.boundingBox())!.y-r.y)).toBeLessThan(1);await expect(sheet).toBeVisible();
});
test('reduced motion snaps without a spring and keeps X and Escape',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});const sheet=await open(page);await pull(page,'#game-options>.sheet-grabber',50);await page.mouse.up();expect(await sheet.evaluate(e=>e.getAnimations().length)).toBe(0);
 await page.getByRole('button',{name:'Close game menu',exact:true}).click();await expect(sheet).toBeHidden();await openGameMenu(page);await page.keyboard.press('Escape');await expect(sheet).toBeHidden();
});
test('the same gesture closes shell settings and rules through their existing close paths',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Settings',exact:true}).click();const menu=page.locator('#menu');await expect.poll(()=>menu.evaluate(e=>e.getAnimations().length)).toBe(0);
 await pull(page,'#menu>.sheet-grabber',(await menu.boundingBox())!.height*.4);await page.mouse.up();await expect(menu).toBeHidden();await expect(page.locator('#pause-overlay')).toBeHidden();
 await openGameMenu(page);await page.getByRole('button',{name:'Game rules',exact:true}).click();await expect.poll(()=>page.locator('#rules-dialog').evaluate(e=>e.getAnimations().length)).toBe(0);
 await pull(page,'#rules-dialog>.sheet-grabber',(await page.locator('#rules-dialog').boundingBox())!.height*.4);await page.mouse.up();await expect(page.locator('#rules-dialog')).toBeHidden();await expect(page.locator('#pause-overlay')).toBeHidden();
});

test('the app Reduce motion class also disables settling motion',async({page})=>{
 const sheet=await open(page);await page.evaluate(()=>document.documentElement.classList.add('reduce-motion'));
 await pull(page,'#game-options>.sheet-grabber',50);await page.mouse.up();expect(await sheet.evaluate(e=>e.getAnimations().length)).toBe(0);
});
for(const reduce of [false,true])test(`custom Stats sheet uses the same dismissal, reduced=${reduce}`,async({page})=>{
 await page.emulateMedia({reducedMotion:reduce?'reduce':'no-preference'});await page.goto('/#/game/fivefold');await expect(page.locator('.game-menu-source').first()).toBeAttached();await openGameMenu(page);await page.getByRole('button',{name:'Stats',exact:true}).click();
 const sheet=page.locator('.ff-dialog');await expect(sheet).toBeVisible();await expect.poll(()=>sheet.evaluate(e=>e.getAnimations().length)).toBe(0);await pull(page,'.ff-dialog>.sheet-grabber',(await sheet.boundingBox())!.height*.4);await page.mouse.up();await expect(sheet).toBeHidden();
});
test('Movies retains one draggable handle after opening and changing seasons',async({page})=>{
 await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await page.route('https://framextv.cc/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title>'}));
 await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async d=>{await d.getByRole('button',{name:'Continue',exact:true}).click();});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const sheet=page.locator('.movies-drawer');await expect(sheet.locator(':scope>.sheet-grabber')).toHaveCount(1);await sheet.locator('[data-drawer-season="2"]').click();await expect(sheet.locator(':scope>.sheet-grabber')).toHaveCount(1);
 await expect.poll(()=>sheet.evaluate(e=>e.getAnimations().length)).toBe(0);await pull(page,'.movies-drawer>.sheet-grabber',(await sheet.boundingBox())!.height*.4);await page.mouse.up();await expect(sheet).toBeHidden();
});
test('real touch pulls top content but upward and already-scrolled gestures still scroll',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','CDP touch injection');await open(page);await page.getByRole('button',{name:'Settings',exact:true}).click();const sheet=page.locator('#menu');await expect.poll(()=>sheet.evaluate(e=>e.getAnimations().length)).toBe(0);
 const cdp=await context.newCDPSession(page),r=(await sheet.boundingBox())!;
 async function touch(y:number,dy:number){await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+10,y}]});for(let i=1;i<=12;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+10,y:y+dy*i/12}]});await page.waitForTimeout(16);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
 await touch(r.y+320,-180);await expect.poll(()=>sheet.evaluate(e=>e.scrollTop)).toBeGreaterThan(50);await expect(sheet).toBeVisible();
 await touch(r.y+120,220);await expect.poll(()=>sheet.evaluate(e=>e.scrollTop)).toBe(0);await expect(sheet).toBeVisible();
 await page.waitForTimeout(200);await touch(r.y+100,r.height*.4);await expect(sheet).toBeHidden();await cdp.detach();
});
test('a pen can dismiss from the same header',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','CDP pen injection');const sheet=await open(page),r=(await page.locator('#game-options>.sheet-grabber').boundingBox())!,dy=(await sheet.boundingBox())!.height*.4;
 const cdp=await context.newCDPSession(page),x=r.x+r.width/2,y=r.y+r.height/2;
 await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',buttons:1,pointerType:'pen',clickCount:1});
 for(let i=1;i<=12;i++)await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y:y+dy*i/12,button:'left',buttons:1,pointerType:'pen'});
 await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y:y+dy,button:'left',buttons:0,pointerType:'pen',clickCount:1});await expect(sheet).toBeHidden();await cdp.detach();
});
