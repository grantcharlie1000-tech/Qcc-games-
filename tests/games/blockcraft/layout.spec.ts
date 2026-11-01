import {test,expect} from '../../fixtures';
import {pauseGame,resumeGame} from '../../game-menu';
for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`Minecraft lifecycle and world options at ${viewport.width}x${viewport.height}`,async({page})=>{
 test.setTimeout(60000);await page.setViewportSize(viewport);await page.goto('/#/game/blockcraft');await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:45000});
 const sheet=page.locator('.bc-menu > .game-sheet');await expect(sheet).toBeVisible();await expect(sheet.locator('h2')).toHaveText('Minecraft');await expect(sheet.getByRole('button',{name:'Play',exact:true})).toBeVisible();
 await expect(page.locator('.game-dock')).not.toHaveAttribute('inert','');await expect(page.locator('.bc-controls')).toHaveCount(0);
 await sheet.locator('summary').focus();await page.keyboard.press('Enter');await expect(sheet.locator('details')).toHaveAttribute('open','');await expect(page.getByRole('button',{name:'Options…'})).toBeVisible();
 await sheet.locator('summary').click();await sheet.getByRole('button',{name:'Play',exact:true}).click();await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
 await pauseGame(page);await expect(page.locator('#pause-overlay h2')).toHaveText('Minecraft');await expect(sheet).toBeHidden();await resumeGame(page);await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
});
