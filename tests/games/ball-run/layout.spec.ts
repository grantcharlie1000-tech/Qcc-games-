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

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`original setup and difficulty action at ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/#/game/ball-run');
 const setup=page.getByRole('region',{name:'Ball Run setup'});await expect(setup).toBeVisible();
 await expect(setup.getByRole('heading',{name:'BALL RUN',exact:true})).toBeVisible();await expect(setup.locator('.br-copy')).toHaveCount(0);// #101 removed the setup explainer copy
 const slider=setup.getByRole('slider',{name:'Difficulty'});await slider.focus();await page.keyboard.press('End');await expect(slider).toHaveAttribute('aria-valuetext','Hard');
 await expect(setup.locator('.br-level')).toHaveText('Hard');
 const button=setup.getByRole('button',{name:'Play',exact:true}),panel=(await setup.boundingBox())!;
 expect(panel.x).toBeGreaterThanOrEqual(0);expect(panel.y).toBeGreaterThanOrEqual(0);expect(panel.x+panel.width).toBeLessThanOrEqual(viewport.width);expect(panel.y+panel.height).toBeLessThanOrEqual(viewport.height);
 expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await button.click();await expect(setup).toBeHidden();await expect(page.locator('.ball-run')).toHaveAttribute('data-phase','running');await expect(page.locator('.ball-run')).toHaveAttribute('data-difficulty','hard');
});
