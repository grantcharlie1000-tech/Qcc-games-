import {test,expect} from '../../fixtures';

test('quiet surface and one accessible game menu preserve pause and navigation',async({page})=>{
 await page.goto('/#/game/minesweeper');await expect(page.locator('.ms-tile').first()).toBeVisible();
 await expect(page.locator('.ms-heading')).toHaveCount(0);await expect(page.locator('.ms-zoom')).toBeHidden();
 expect(await page.locator('.ms-toolbar').evaluate(e=>e.getBoundingClientRect().height)).toBeLessThan(76);
 await page.locator('.ms-tile[data-index="40"]').click();
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await expect(page.getByRole('dialog',{name:'Game options'})).toBeVisible();await expect(page.locator('.ms-board')).toHaveCSS('visibility','hidden');
 const time=await page.locator('.ms-time').textContent();await page.waitForTimeout(1100);await expect(page.locator('.ms-time')).toHaveText(time!);
 await expect(page.getByRole('heading',{name:'Preferences',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Statistics',exact:true})).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('.ms-settings')).not.toBeVisible();await expect(page.locator('.ms-board')).toHaveCSS('visibility','visible');await expect(page.locator('#game-menu')).toBeFocused();await expect(page.locator('#study-view')).not.toBeVisible();
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Game rules',exact:true}).click();await expect(page.locator('#rules-dialog')).toBeVisible();await expect(page.locator('.ms-settings')).not.toBeVisible();
 await page.locator('.rules-done').click();await expect(page.locator('.ms-board')).toHaveCSS('visibility','visible');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Pause game',exact:true}).click();await expect(page.locator('.ms-settings')).not.toBeVisible();await expect(page.locator('.ms-board')).toHaveCSS('visibility','hidden');
 await page.getByRole('button',{name:'Keep playing',exact:true}).click();await expect(page.locator('.ms-board')).toHaveCSS('visibility','visible');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'Account & app settings',exact:true}).click();await expect(page.locator('#menu')).toBeVisible();await expect(page.locator('.ms-settings')).not.toBeVisible();
});

for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:320,height:700},{width:844,height:390}])test(`clean controls and scrollable options at ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/#/game/minesweeper');await page.locator('.ms-tile[data-index="40"]').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const toolbar=await page.locator('.ms-toolbar').boundingBox();expect(toolbar!.height).toBeLessThan(76);
 await page.getByRole('button',{name:'Open menu',exact:true}).click();const menu=page.getByRole('dialog',{name:'Game options'});await expect(menu).toBeVisible();
 expect(await menu.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 for(const target of ['.ms-close','.ms-plus','.ms-return']){const button=menu.locator(target);await button.scrollIntoViewIfNeeded();const box=(await button.boundingBox())!;expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(viewport.width);}
 await menu.evaluate(e=>e.scrollTop=0);
 await page.getByRole('button',{name:'Close game options'}).click();await expect(page.locator('.ms-board')).toHaveCSS('visibility','visible');
});
