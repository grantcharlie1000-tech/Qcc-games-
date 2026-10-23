import { test, expect } from '../fixtures';
import { LEVELS, emptyPaths, solve } from '../../src/games/color-connect/model';

test.afterEach(async({page},info)=>{
 if(info.status===info.expectedStatus)return;
 // CI logs remain available when an environment cannot download trace ZIPs.
 console.log('CAMPAIGN_FAILURE',JSON.stringify(await page.evaluate(()=>({
  progress:document.querySelector('.cc-progress')?.textContent,
  pairs:document.querySelector('.cc-pairs')?.textContent,
  moves:document.querySelector('.cc-moves')?.textContent,
  winHidden:(document.querySelector('.cc-win') as HTMLElement|null)?.hidden,
  saved:JSON.parse(localStorage.getItem('pocket-arcade:v1:save:color-connect')||'null')?.data?.paths,
  layout:{rows:getComputedStyle(document.querySelector('.cc-grid')!).gridTemplateRows,focus:(document.activeElement as HTMLElement)?.dataset.ccCell},
 }))));
});

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
   const dom=await page.locator(`[data-cc-cell="${cell}"]`).evaluate(node=>{const r=node.getBoundingClientRect(),g=node.closest('.cc-grid')!.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,grid:[g.x,g.y,g.width,g.height]}});
   // Check actual hit areas while held, when WebKit can change implicit rows.
   const logical=[(dom.x+dom.width/2-dom.grid[0])/dom.grid[2]*9,(dom.y+dom.height/2-dom.grid[1])/dom.grid[3]*9];
   expect(Math.abs(logical[0]-(cell%9+.5))).toBeLessThan(.05);expect(Math.abs(logical[1]-(Math.floor(cell/9)+.5))).toBeLessThan(.05);
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);if(i===0)await page.mouse.down();
  }
  if(path===result.paths.at(-1))await expect(page.locator('.cc-win')).toBeVisible();
  await page.mouse.up();
  // The SVG and input mapper use equal squares; native button focus must not
  // resize an implicit CSS grid row and move its hit area away from the art.
  await expect.poll(()=>page.locator('.cc-grid').evaluate(grid=>{
   const r=grid.getBoundingClientRect(),n=Number(grid.getAttribute('aria-colcount'));
   return Math.max(...Array.from(grid.querySelectorAll<HTMLElement>('[data-cc-cell]'),cell=>{
    const box=cell.getBoundingClientRect(),i=Number(cell.dataset.ccCell);
    return Math.max(Math.abs(box.x+box.width/2-(r.x+(i%n+.5)*r.width/n)),Math.abs(box.y+box.height/2-(r.y+(Math.floor(i/n)+.5)*r.height/n)));
   }));
  }),{message:'Every hit cell stays aligned with its drawn square after focus changes'}).toBeLessThan(1);
 }
 await expect(page.locator('.cc-win')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.reload();await expect(picker).toHaveValue('31');await expect(page.locator('.cc-win')).toBeVisible();
 await page.getByRole('button',{name:'Play first puzzle',exact:true}).click();await expect(picker).toHaveValue('0');
});
