import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';
import {gameAction} from '../game-menu';

async function hiddenChrome(page:Page,selector:string){
  const chrome=page.locator(selector);
  await expect(chrome).toHaveAttribute('inert');
  await expect(chrome).toHaveCSS('visibility','hidden');
  expect(await chrome.evaluate(root=>[root,...root.querySelectorAll('*')].every(el=>{
    const s=getComputedStyle(el);return s.backdropFilter==='none'&&s.pointerEvents==='none';
  }))).toBe(true);
  expect(await chrome.evaluate(root=>[...root.querySelectorAll('a,button')].every(el=>{
    const r=el.getBoundingClientRect();return !root.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
  }))).toBe(true);
}
for(const fallback of [false,true]){
  const url=(route='collection')=>`/${fallback?'?glass=fallback':''}#/${route}`;
  test(`sheets remove section navigation paint and restore focus, fallback=${fallback}`,async({page})=>{
    await page.setViewportSize({width:390,height:844});await page.goto(url());
    const trigger=page.locator('.app-menu');await trigger.click();
    await hiddenChrome(page,'.app-navigation');
    await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
    await hiddenChrome(page,'.app-navigation');
    await page.keyboard.press('Escape');
    await expect(page.locator('.app-navigation')).not.toHaveAttribute('inert');
    await expect(trigger).toBeFocused();
    await trigger.click();await page.getByRole('button',{name:'Leaderboards',exact:true}).click();
    await hiddenChrome(page,'.app-navigation');await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await page.evaluate(()=>scrollTo(0,180));await expect(page.locator('.app-tabbar')).toHaveAttribute('data-minimized','true');
    // Opening an external sheet must not reset the reader's collapsed state.
    await page.evaluate(()=>document.querySelector<HTMLDialogElement>('#menu')!.showModal());
    await hiddenChrome(page,'.app-navigation');await page.keyboard.press('Escape');
    await expect(page.locator('.app-navigation')).not.toHaveAttribute('inert');
    await expect(page.locator('.app-tabbar')).toHaveAttribute('data-minimized','true');
  });
  test(`game menus, rules, settings and local panels remove dock paint, fallback=${fallback}`,async({page})=>{
    await page.setViewportSize({width:390,height:844});await page.goto(url('game/snake'));
    await expect(page.locator('.snake-canvas')).toBeVisible();
    for(const action of ['Game rules','Settings']){
      await gameAction(page,action);await hiddenChrome(page,'.game-dock');
      await page.keyboard.press('Escape');await expect(page.locator('.game-dock')).not.toHaveAttribute('inert');
      await expect(page.locator('#game-menu')).toBeFocused();
    }
    await page.goto(url('game/fivefold'));await expect(page.locator('.ff-keyboard')).toBeVisible();
    await gameAction(page,'Stats');await hiddenChrome(page,'.game-dock');
    await page.getByRole('button',{name:'Close stats',exact:true}).click();
    await expect(page.locator('.game-dock')).not.toHaveAttribute('inert');
  });
  test(`Movies warning, drawer and menu remove navigation paint, fallback=${fallback}`,async({page})=>{
    await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
    await page.setViewportSize({width:390,height:844});await page.goto(url('movies/tv-19885/season/1/episode/1/play'));
    await expect(page.getByRole('dialog',{name:'Before you watch'})).toBeVisible();
    await hiddenChrome(page,'.movies-navigation');
    await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:'<button>Play stream</button><script>parent.postMessage({event:"frameXTV:ready"},"*")</script>'}));
    await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>dialog.getByRole('button',{name:'Continue',exact:true}).click());
    await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
    await hiddenChrome(page,'.movies-navigation');await page.keyboard.press('Escape');
    await expect(page.locator('.movies-navigation')).not.toHaveAttribute('inert');
    await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
    await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
    await page.locator('.movies-menu').focus();
    await page.frame({url:/framextv/})!.evaluate(()=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:100,duration:100},'*'));
    await hiddenChrome(page,'.movies-navigation');await expect(page.getByRole('button',{name:'Play now',exact:true})).toBeFocused();
    await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.clock.runFor(200);
    await expect(page.locator('.movies-navigation')).not.toHaveAttribute('inert');await page.clock.resume();
    await page.locator('.movies-menu').click();await hiddenChrome(page,'.movies-navigation');
    await page.keyboard.press('Escape');await expect(page.locator('.movies-menu')).toBeFocused();
  });
}
