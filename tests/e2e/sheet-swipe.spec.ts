import {test,expect} from '../fixtures';
import {gameAction} from '../game-menu';
import type {Page,Locator} from '@playwright/test';

test.use({viewport:{width:393,height:852},isMobile:true,hasTouch:true});

async function settled(sheet:Locator){
  await expect(sheet).toBeVisible();
  await expect.poll(()=>sheet.evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
}
async function drag(page:Page,sheet:Locator,distance:number,hold=0){
  await settled(sheet);
  const b=(await sheet.locator(':scope>.sheet-grabber').boundingBox())!;
  expect(b).toBeTruthy();
  await page.mouse.move(b.x+b.width/2,b.y+12);await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+12+distance,{steps:2});
  if(hold)await page.waitForTimeout(hold);
  await page.mouse.up();
}
async function menu(page:Page){
  await page.goto('/#/collection');
  await page.evaluate(()=>scrollTo(0,650));
  // Keyboard focus keeps the expanded nav visible at this scroll position.
  await page.keyboard.press('Tab');
  await page.locator('.app-menu').focus();
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  const sheet=page.locator('#menu');await settled(sheet);return sheet;
}

test('account handle dismisses through the guest cancel path and can be reopened',async({page})=>{
  await menu(page);await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
  const sheet=page.locator('#accounts-dialog');await settled(sheet);
  await drag(page,sheet,Math.min(240,(await sheet.boundingBox())!.height*.4));
  await expect(sheet).toBeHidden();await expect(page.locator('html')).not.toHaveAttribute('data-scroll-locked');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
  await settled(sheet);expect(await sheet.evaluate(e=>parseFloat(getComputedStyle(e).translate.split(' ')[1])||0)).toBe(0);
});

test('a short drag held still is not a flick and returns to rest',async({page})=>{
  const sheet=await menu(page);
  await drag(page,sheet,65,300);
  await expect(sheet).toBeVisible();
  await expect.poll(()=>sheet.evaluate(e=>e.style.translate)).toBe('');
  await expect(page.locator('html')).toHaveAttribute('data-scroll-locked','');
});

test('closing and reopening in one task keeps the new scroll lock',async({page})=>{
  const sheet=await menu(page);
  await sheet.evaluate(async e=>{const {openSheet}=await import(String('/src/ui/sheet.ts'));(e as HTMLDialogElement).close();openSheet(e as HTMLDialogElement);});
  await page.waitForTimeout(50);
  await expect(page.locator('html')).toHaveAttribute('data-scroll-locked','');
  await page.keyboard.press('Escape');await expect(sheet).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-scroll-locked');
});

test('cancel may veto dismissal and nested sheets retain the outer lock',async({page})=>{
  const sheet=await menu(page);
  await sheet.evaluate(e=>e.addEventListener('cancel',event=>event.preventDefault(),{once:true}));
  await drag(page,sheet,240);await expect(sheet).toBeVisible();
  await expect.poll(()=>sheet.evaluate(e=>e.style.translate)).toBe('');
  await page.evaluate(async()=>{
    const {openSheet}=await import(String('/src/ui/sheet.ts'));
    const child=document.createElement('dialog');child.id='nested-sheet';child.textContent='Nested sheet';document.body.append(child);openSheet(child);
  });
  await page.keyboard.press('Escape');await expect(page.locator('#nested-sheet')).toBeHidden();
  await expect(page.locator('html')).toHaveAttribute('data-scroll-locked','');
  await page.keyboard.press('Escape');await expect(sheet).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-scroll-locked');
});

test.describe('mouse wheel scrolling',()=>{
test.use({isMobile:false,hasTouch:false});
test('background wheel is locked, the sheet scrolls, and closing restores the page',async({page})=>{
  const sheet=await menu(page),before=await page.evaluate(()=>scrollY);
  await page.mouse.move(2,2);await page.mouse.wheel(0,450);await page.waitForTimeout(100);
  expect(await page.evaluate(()=>scrollY)).toBe(before);
  await sheet.evaluate(e=>{e.style.maxHeight='320px';});
  const box=(await sheet.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  await page.mouse.wheel(0,180);await expect.poll(()=>sheet.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('Escape');await expect(sheet).toBeHidden();expect(await page.evaluate(()=>scrollY)).toBe(before);
});
});

for(const [id,action,selector] of [['minesweeper','Game options','.ms-settings'],['fivefold','Stats','.ff-dialog'],['pool','Multiplayer','.mp-card'],['globle','Stats and options','.gl-options']] as const){
  test(`${id} handle closes its own sheet and releases the lock`,async({page})=>{
    await page.goto(`/#/game/${id}`);await gameAction(page,action);
    const sheet=page.locator(selector);await settled(sheet);
    await expect(page.locator('html')).toHaveAttribute('data-scroll-locked','');
    await drag(page,sheet,Math.min(240,(await sheet.boundingBox())!.height*.4));
    await expect(sheet).toBeHidden();await expect(page.locator('html')).not.toHaveAttribute('data-scroll-locked');
    await expect(page.locator('#game-menu')).toBeVisible();
  });
}

test('the episode drawer handle uses its native close path',async({page})=>{
  await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async d=>{await d.getByRole('button',{name:'Continue',exact:true}).click();});
  await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  for(const url of ['https://framextv.cc/**','https://framextv.xyz/**'])await page.route(url,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title>'}));
  await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
  await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
  const sheet=page.locator('.movies-drawer');await settled(sheet);
  await drag(page,sheet,Math.min(240,(await sheet.boundingBox())!.height*.4));
  await expect(sheet).toBeHidden();await expect(page.locator('html')).not.toHaveAttribute('data-scroll-locked');
});

test('a canceled drag returns to rest and keeps the modal open',async({page})=>{
  const sheet=await menu(page),b=(await sheet.locator('.sheet-grabber').boundingBox())!;
  await page.mouse.move(b.x+b.width/2,b.y+12);await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+82,{steps:2});
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await expect.poll(()=>sheet.evaluate(e=>e.style.translate)).toBe('');
  await page.mouse.up();await expect(sheet).toBeVisible();
});

test('native touch pan from the handle closes the sheet without moving the page',async({page,context,browserName})=>{
  test.skip(browserName!=='chromium','Native touch injection uses CDP; other engines cover the pointer path.');
  const sheet=await menu(page),before=await page.evaluate(()=>scrollY),box=(await sheet.boundingBox())!;
  const cdp=await context.newCDPSession(page),x=box.x+box.width/2,y=box.y+12;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+i*20}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(sheet).toBeHidden();expect(await page.evaluate(()=>scrollY)).toBe(before);
});

test('native body scrolling stays inside the sheet and only a pull at the top dismisses',async({page,context,browserName})=>{
  test.skip(browserName!=='chromium','Native touch injection uses CDP.');
  const sheet=await menu(page),before=await page.evaluate(()=>scrollY),cdp=await context.newCDPSession(page);
  const pan=async(x:number,y:number,dy:number)=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+dy*i/12}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  };
  await sheet.evaluate(e=>{e.style.maxHeight='340px';e.scrollTop=180;});
  const b=(await sheet.boundingBox())!;
  await pan(b.x+b.width/2,b.y+140,70);await expect(sheet).toBeVisible();
  expect(await sheet.evaluate(e=>e.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(()=>scrollY)).toBe(before);
  await sheet.evaluate(e=>{e.style.removeProperty('max-height');e.scrollTop=0;});
  const p=(await page.locator('#account-summary').boundingBox())!;
  await pan(p.x+p.width/2,p.y+p.height/2,240);
  await expect(sheet).toBeHidden();expect(await page.evaluate(()=>scrollY)).toBe(before);
});

test('reduced motion retains dismissal and navigation releases a detached sheet lock',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  const sheet=await menu(page);await drag(page,sheet,240);await expect(sheet).toBeHidden();
  await expect(page.locator('html')).not.toHaveAttribute('data-scroll-locked');
  await menu(page);
  await page.evaluate(()=>document.getElementById('menu')!.remove());
  await expect(page.locator('html')).not.toHaveAttribute('data-scroll-locked');
});
