import {test,expect} from '../../fixtures';
import {gameAction} from '../../game-menu';

for(const viewport of [{width:390,height:844},{width:1366,height:768}])test(`Ball Run uses the shared shell controls at ${viewport.width}×${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/#/game/ball-run');await expect(page.locator('.br-play')).toBeVisible();
 await expect(page.locator('.br-help-toggle,.br-home')).toHaveCount(0);await expect(page.locator('.game-dock')).toHaveCount(1);
 expect((await page.locator('.br-slider').boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await gameAction(page,'Game rules');await expect(page.locator('#rules-text')).toContainText('Drag');
 await page.getByRole('button',{name:'Let’s play'}).click();await page.locator('.br-play').click();await expect(page.locator('.ball-run')).toHaveAttribute('data-phase','running');
 const box=(await page.locator('.br-viewport canvas').boundingBox())!;expect(box.width).toBe(viewport.width);expect(box.height).toBe(viewport.height);
});
