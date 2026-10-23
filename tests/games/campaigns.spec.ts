import { test, expect } from '../fixtures';
import { LEVELS, emptyPaths, solve } from '../../src/games/color-connect/model';

test('the final 9×9 connection puzzle is selectable, playable, saved and wraps after completion',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:390,height:844});
 await page.goto('/#/game/color-connect');
 const picker=page.getByRole('combobox',{name:'Choose puzzle'});
 await expect(picker.locator('option')).toHaveCount(32);await picker.selectOption('31');
 await expect(page.locator('.cc-cell')).toHaveCount(81);
 const result=solve(LEVELS[31],emptyPaths(LEVELS[31]));expect(result.kind).toBe('solved');
 if(result.kind!=='solved')throw Error('Final puzzle has no solution');
 await page.locator('.cc-grid').hover();
 for(const path of result.paths){
  for(const [i,cell] of path.entries()){
   const box=(await page.locator(`[data-cc-cell="${cell}"]`).boundingBox())!;
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);if(i===0)await page.mouse.down();
  }
  await page.mouse.up();
 }
 await expect(page.locator('.cc-win')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.reload();await expect(picker).toHaveValue('31');await expect(page.locator('.cc-win')).toBeVisible();
 await page.getByRole('button',{name:'Play first puzzle',exact:true}).click();await expect(picker).toHaveValue('0');
});
