import {test,expect} from '../fixtures';

test('a focused dock button keeps Space out of the pointer-locked game and opens its menu',async({page,browserName})=>{
  test.skip(browserName!=='chromium','This regression exercises native Chromium pointer lock.');
  test.setTimeout(90000);
  await page.goto('/#/game/blockcraft');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-locked','true');
  const menu=page.locator('#game-menu');await expect(page.locator('.game-dock')).not.toHaveAttribute('inert');await menu.focus();await expect(menu).toBeFocused();
  await page.keyboard.down('Space');
  expect(await page.evaluate(()=>(window as unknown as {blockcraft:{input:{down(action:string):boolean}}}).blockcraft.input.down('jump')),'Space on the shell must not queue a jump').toBe(false);
  await page.keyboard.up('Space');
  await expect(page.locator('#game-options')).toBeVisible();
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  await expect(page.locator('.game-dock')).not.toHaveAttribute('inert');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-locked','true');
  await menu.focus();await page.keyboard.press('Enter');
  await expect(page.locator('#game-options')).toBeVisible();
  await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  await expect(page.locator('.game-dock')).not.toHaveAttribute('inert');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-locked','true');
  await page.locator('.blockcraft canvas').focus();await page.keyboard.down('Space');
  expect(await page.evaluate(()=>(window as unknown as {blockcraft:{input:{down(action:string):boolean}}}).blockcraft.input.down('jump'))).toBe(true);
  await menu.focus();await page.keyboard.down('Space');await page.keyboard.up('Space');
  expect(await page.evaluate(()=>(window as unknown as {blockcraft:{input:{down(action:string):boolean}}}).blockcraft.input.down('jump')),'release after leaving the canvas must clear the held key').toBe(false);
  await expect(page.locator('#game-options')).toBeHidden();
});
