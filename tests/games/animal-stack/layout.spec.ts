import {test,expect} from '../../fixtures';
import {backToGames,pauseGame,resumeGame,gameAction} from '../../game-menu';
import {AnimalWorld} from '../../../src/games/animal-stack/model';

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:1366,height:768}])test(`immediate play and original end status at ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/#/game/animal-stack');
 const root=page.locator('.animal-stack');await expect(root).toHaveAttribute('data-ready','true');
 await expect(root.locator('[data-drop]')).toBeVisible();
 const hud=page.locator('.game-compact-hud');await expect(hud).toHaveAttribute('aria-label','Score 0, 0 of 40 animals balanced');
 expect(await hud.evaluate(e=>e.getBoundingClientRect().height<20&&e.scrollWidth<=e.clientWidth)).toBe(true);
 await pauseGame(page);await expect(page.locator('#pause-overlay')).toBeVisible();await resumeGame(page);
 const world=new AnimalWorld();world.over=true;const saved=world.snapshot();world.dispose();
 await backToGames(page);await expect(root).toHaveCount(0);await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:animal-stack',JSON.stringify({version:1,data})),saved);await page.goto('/#/game/animal-stack');
 await expect(root).toHaveAttribute('data-over','true');
 await expect(root.locator('.animal-stack__status')).toHaveText('The stack tumbled. Restart to try again.');
 await expect(root.locator('[data-drop]')).toBeDisabled();
 await gameAction(page,'Restart game');await expect(root).toHaveAttribute('data-over','false');await expect(root).toHaveAttribute('data-ready','true');
 await expect(root.locator('.animal-stack__status')).toBeEmpty();await root.locator('[data-drop]').click();await expect(root).toHaveAttribute('data-count','1');
});
