import {test,expect} from '../../fixtures';
import {pauseGame,resumeGame} from '../../game-menu';
for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`Minecraft title and complete menu at ${viewport.width}x${viewport.height}`,async({page})=>{
 test.setTimeout(60000);await page.setViewportSize(viewport);await page.goto('/#/game/blockcraft');
 const root=page.locator('.blockcraft'),menu=page.locator('.bc-menu');await expect(root).toHaveAttribute('data-ready','true',{timeout:45000});
 await expect(menu.locator('.bc-menu-title')).toHaveText('Minecraft');await expect(menu.getByRole('button',{name:'Play',exact:true})).toBeVisible();
 for(const name of ['Controls','Options…','Advancements','Multiplayer'])await expect(menu.getByRole('button',{name,exact:true})).toBeVisible();
 await menu.getByRole('button',{name:'Controls',exact:true}).click();await expect(menu.locator('.bc-controls')).toContainText('Walk forward');
 await menu.getByRole('button',{name:'Done',exact:true}).click();await expect(menu.getByRole('button',{name:'Controls',exact:true})).toBeFocused();
 await menu.getByRole('button',{name:'Options…',exact:true}).click();await expect(menu.getByRole('button',{name:'Difficulty: Normal',exact:true})).toBeVisible();
 await expect(menu.locator('[data-panel=options] input[type=range]')).toHaveCount(4);await menu.getByRole('button',{name:'Done',exact:true}).click();
 await menu.getByRole('button',{name:'Play',exact:true}).click();await expect(root).toHaveAttribute('data-phase','playing');
 await pauseGame(page);await expect(page.locator('#pause-overlay')).toBeVisible();await expect(menu.locator('.bc-menu-title')).toHaveText('Game Menu');
 await resumeGame(page);await expect(root).toHaveAttribute('data-phase','playing');await expect(menu).toBeHidden();
});
