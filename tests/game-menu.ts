import {expect,type Page} from '@playwright/test';

/** Exercise the same visible menu path as a player; never click a hidden legacy control. */
export async function openGameMenu(page:Page){
  if(await page.locator('#game-options[open]').count())return;
  const local=page.locator('#game-stage dialog[open]');
  if(await local.count())await page.keyboard.press('Escape');
  await page.locator('#game-menu').click();
  await expect(page.locator('#game-options')).toBeVisible();
}
export async function pauseGame(page:Page){
  if(await page.locator('.ms-settings[open]').count())await page.locator('.ms-pause').click();
  else {await openGameMenu(page);await page.locator('#game-options').focus();}
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
  if(await page.locator('#game-menu').isVisible())await gameAction(page,'Settings');
  else await page.locator('.app-tabbar').getByRole('button',{name:'Open menu',exact:true}).click();
  await expect(page.locator('#menu')).toBeVisible();
}
export async function gameOption(page:Page,label:string,value:string){
  await openGameMenu(page);
  await page.locator('#game-options').getByLabel(label,{exact:true}).selectOption(value);
}
export async function backToGames(page:Page){
  if(await page.locator('#game-options[open]').count())await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  await page.getByRole('link',{name:'Games',exact:true}).click();
}
