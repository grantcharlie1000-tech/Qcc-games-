import {test,expect} from '../fixtures';
for(const width of [320,390,1366])test(`Water Sort keeps small glass Undo/Hint in the top row at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto('/#/game/water-sort');
 const actions=page.locator('.ws-top-actions');await expect(actions).toBeVisible();
 const dock=(await page.locator('.game-dock').boundingBox())!,row=(await actions.boundingBox())!;
 expect(row.y).toBeLessThan(24);expect(row.y).toBeCloseTo(dock.y,0);expect(row.x).toBeGreaterThanOrEqual(dock.x+dock.width+4);
 for(const name of ['Undo','Hint']){
  const action=actions.getByRole('button',{name,exact:true});await expect(action).toHaveClass(/arcade-glass/);
  const r=(await action.boundingBox())!;expect(r.width).toBeGreaterThanOrEqual(44);expect(r.width).toBeLessThanOrEqual(44);expect(r.height).toBe(44);
  await expect(action.locator('svg')).toHaveCount(1);expect((await action.textContent())?.trim()).toBe('');
 }
 await expect(actions.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
 await actions.getByRole('button',{name:'Hint',exact:true}).click();await expect(page.locator('.ws-hint-from')).toHaveCount(1);
 const from=await page.locator('.ws-hint-from').getAttribute('data-tube'),to=await page.locator('.ws-hint-to').getAttribute('data-tube');
 await page.locator(`[data-tube="${from}"]`).click();await page.locator(`[data-tube="${to}"]`).click();
 await expect(page.locator('.ws-game')).toHaveAttribute('data-moves','1');await expect(page.locator('.ws-game')).toHaveAttribute('data-phase','ready');
 await actions.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.ws-game')).toHaveAttribute('data-moves','0');
});
test('desktop Slither keeps keyboard boost without a touch Boost button',async({page})=>{
 await page.goto('/#/game/neon-coil');await page.getByRole('button',{name:'Play',exact:true}).click();
 await expect(page.locator('.nc-boost')).toBeHidden();await page.keyboard.down('Space');
 await expect(page.locator('.nc-game')).toHaveAttribute('data-boosting','true');await page.keyboard.up('Space');
});
test.describe('touch Slither',()=>{
 test.use({hasTouch:true});
 test('keeps the touch Boost button available',async({page})=>{
  await page.goto('/#/game/neon-coil');await page.getByRole('button',{name:'Play',exact:true}).click();await expect(page.locator('.nc-boost')).toBeVisible();
 });
});
test('Study article prose and accessible captions omit fiction labels',async({page})=>{
 await page.goto('/#/collection');await page.locator('.app-tabbar [data-action=study]').click();await expect(page.locator('#study-view')).toBeVisible();
 const visible=await page.locator('#study-view article').innerText();expect(visible).not.toMatch(/fictional|invented|explicitly fictional/i);
 const descriptions=await page.locator('#study-view [alt],#study-view [aria-label]').evaluateAll(es=>es.map(e=>`${e.getAttribute('alt')??''} ${e.getAttribute('aria-label')??''}`).join(' '));
 expect(descriptions).not.toMatch(/fictional|invented|explicitly fictional/i);
});
