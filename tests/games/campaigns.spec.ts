import { test, expect } from '../fixtures';
import { LEVELS, emptyPaths, solve } from '../../src/games/color-connect/model';

test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  const events:unknown[]=[];(window as any).campaignPointerEvents=events;
  document.addEventListener('pointermove',event=>{
   const grid=document.querySelector<HTMLElement>('.cc-grid');
   if(!grid?.hasPointerCapture(event.pointerId))return;
   const rect=grid.getBoundingClientRect(),size=Number(grid.getAttribute('aria-colcount'));
   const point=(sample:PointerEvent)=>[Number(((sample.clientX-rect.x)/rect.width*size).toFixed(3)),Number(((sample.clientY-rect.y)/rect.height*size).toFixed(3))];
   events.push({point:point(event),samples:event.getCoalescedEvents?.().map(point)});
  },{capture:true,passive:true});
 });
});

test.afterEach(async({page},info)=>{
 if(info.status===info.expectedStatus)return;
 // CI logs remain available when an environment cannot download trace ZIPs.
 console.log('CAMPAIGN_FAILURE',JSON.stringify(await page.evaluate(()=>({
  progress:document.querySelector('.cc-progress')?.textContent,
  pairs:document.querySelector('.cc-pairs')?.textContent,
  moves:document.querySelector('.cc-moves')?.textContent,
  winHidden:(document.querySelector('.cc-win') as HTMLElement|null)?.hidden,
  cells:Array.from(document.querySelectorAll<HTMLElement>('[data-cc-cell]'),cell=>({cell:Number(cell.dataset.ccCell),path:cell.dataset.path??null,label:cell.getAttribute('aria-label')})),
  saved:JSON.parse(localStorage.getItem('pocket-arcade:v1:save:color-connect')||'null')?.data?.paths,
  pointerEvents:(window as any).campaignPointerEvents,
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
   await page.mouse.move(box.x+box.width/2,box.y+box.height/2);if(i===0)await page.mouse.down();
  }
  if(path===result.paths.at(-1))await expect(page.locator('.cc-win')).toBeVisible();
  await page.mouse.up();
 }
 await expect(page.locator('.cc-win')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.reload();await expect(picker).toHaveValue('31');await expect(page.locator('.cc-win')).toBeVisible();
 await page.getByRole('button',{name:'Play first puzzle',exact:true}).click();await expect(picker).toHaveValue('0');
});
