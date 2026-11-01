import {test,expect} from '../../fixtures';
import {backToGames,pauseGame,resumeGame} from '../../game-menu';
import {AnimalWorld} from '../../../src/games/animal-stack/model';

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1366,height:768}])test(`minimal pause and saved game over at ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/#/game/animal-stack');
 await expect(page.locator('[data-drop]')).toBeVisible();const hud=page.locator('.game-compact-hud');await expect(hud).toHaveAttribute('aria-label','Score 0, 0 of 40 animals balanced');expect(await hud.evaluate(e=>e.getBoundingClientRect().height<20&&e.scrollWidth<=e.clientWidth)).toBe(true);await pauseGame(page);
 const pause=page.locator('#pause-overlay');await expect(pause.getByRole('heading',{name:'Animal Stack',exact:true})).toBeVisible();
 await expect(pause.locator('.game-sheet-controls')).toHaveCount(1);await expect(pause.getByRole('button',{name:'Play',exact:true})).toBeVisible();
 await resumeGame(page);
 const world=new AnimalWorld();world.over=true;const saved=world.snapshot();world.dispose();
 await backToGames(page);await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:animal-stack',JSON.stringify({version:1,data})),saved);await page.goto('/#/game/animal-stack');
 const sheet=page.locator('.animal-stack > .game-sheet');await expect(sheet).toBeVisible();
 await expect(sheet.getByRole('heading',{name:'Animal Stack',exact:true})).toBeVisible();await expect(sheet.locator('h2')).toHaveCount(1);
 await expect(sheet.locator('.game-sheet-stats')).toContainText('Score0');await expect(sheet.getByRole('button')).toHaveCount(1);
 const panel=(await sheet.locator('.game-sheet-panel').boundingBox())!,dock=(await page.locator('.game-dock').boundingBox())!;
 expect(panel.y).toBeGreaterThanOrEqual(dock.y+dock.height);expect(panel.y+panel.height).toBeLessThanOrEqual(viewport.height);
 await sheet.getByRole('button',{name:'Play again',exact:true}).click();await expect(sheet).toBeHidden();await expect(page.locator('.animal-stack')).toHaveAttribute('data-ready','true');await expect(page.locator('.animal-stack canvas')).toBeFocused();
});
