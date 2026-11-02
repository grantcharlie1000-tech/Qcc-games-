import {expect,type Page} from '@playwright/test';

/** Start through each game's original menu; Slither alone uses the minimal shared sheet. */
export async function startGame(page:Page,id:string){
  const names:Record<string,string>={snake:'Start slithering','maze-muncher':'Start','flappy-bird':'Take flight','ball-run':'Play',blockcraft:'Play','neon-coil':'Play'};
  const name=names[id];if(name)await page.getByRole('button',{name,exact:true}).click();
}

/** Exercise the same visible menu path as a player; never click a hidden legacy control. */
export async function openGameMenu(page:Page){
  if(await page.locator('#game-options[open]').count())return;
  const local=page.locator('#game-stage dialog[open]');
  if(await local.count())await page.keyboard.press('Escape');
  const menu=page.locator('#game-menu');
  if(await page.evaluate(()=>!!document.pointerLockElement)){await menu.focus();await menu.press('Enter');}
  else await menu.click();
  await expect(page.locator('#game-options')).toBeVisible();
}
export async function pauseGame(page:Page){
  if(await page.locator('.ms-settings[open]').count())await page.locator('.ms-close').click();
  await openGameMenu(page);await page.locator('#game-options').focus();
}
export async function resumeGame(page:Page){
  if(await page.locator('#game-options[open]').count())await page.locator('#pause-game').click();
  else await page.locator('#resume-game').click();
  await expect(page.locator('#pause-overlay')).toBeHidden();
}
export async function gameAction(page:Page,name:string|RegExp){
  await openGameMenu(page);
  await page.locator('#game-options').getByRole('button',{name,exact:typeof name==='string'}).click();
  if(typeof name==='string'&&name.startsWith('Favourite '))await page.getByRole('button',{name:'Close game menu',exact:true}).click();
}
export async function appSettings(page:Page){
  if(await page.locator('#game-menu').count()&&!await page.locator('#study-view').isVisible())await gameAction(page,'Settings');
  else await page.locator('.app-navigation').getByRole('button',{name:'Open menu',exact:true}).click();
  await expect(page.locator('#menu')).toBeVisible();
}
export async function gameOption(page:Page,label:string,value:string){
  await openGameMenu(page);
  await page.locator('#game-options').getByLabel(label,{exact:true}).selectOption(value);
}
export async function backToGames(page:Page){
  if(await page.locator('#game-options[open]').count())await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  // Game-owned menus now suppress the dock too. Close the start/pause menu
  // through its real primary action before using the floating Games link.
  const blockcraftMenu=page.locator('.bc-menu:not([hidden]) [data-panel="main"] [data-act="primary"]');
  if(await blockcraftMenu.isVisible())await blockcraftMenu.click();
  const games=page.getByRole('link',{name:'Games',exact:true});
  // Play can capture the pointer. Keyboard activation remains a real accessible
  // route out; a native pointer click would be retargeted into the world.
  if(await page.evaluate(()=>!!document.pointerLockElement)){await games.focus();await games.press('Enter');}
  else await games.click();
}
