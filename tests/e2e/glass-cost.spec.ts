import {test,expect} from '../fixtures';
import {startGame} from '../game-menu';

test.use({viewport:{width:393,height:852}});

async function expectCheap(page:import('@playwright/test').Page){
  const effects=await page.locator('.arcade-glass,.game-glass,.ui-glass-sheet,.ui-scroll-edge').evaluateAll(es=>es.filter(e=>e.getBoundingClientRect().width).flatMap(e=>['', '::before','::after'].flatMap(p=>{
    const s=getComputedStyle(e,p||null);
    return [s.backdropFilter,s.getPropertyValue('-webkit-backdrop-filter'),s.filter].filter(v=>v&&v!=='none').map(value=>({surface:e.id||e.className,pseudo:p,value}));
  })));
  expect(effects,'glass must not filter the changing backdrop or moving sheets').toEqual([]);
  await expect(page.locator('.ui-glass-gl,.ui-glass-lens,.ui-scroll-edge,svg feDisplacementMap')).toHaveCount(0);
}

test('scrolling chrome and moving sheets have no filter layers',async({page})=>{
  await page.goto('/#/collection');await expectCheap(page);
  await page.evaluate(()=>window.scrollTo(0,650));
  await expect(page.locator('.section-tabbar')).toHaveAttribute('data-minimized','true');
  await page.locator('.ui-tabbar-mini').click();
  await expect(page.locator('.section-tabbar')).not.toHaveAttribute('data-minimized','true');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await expect(page.locator('#menu')).toBeVisible();await expectCheap(page);
});

for(const id of ['claimline','crossy-road','snake'])test(`${id}: gameplay makes no lens copies or uploads`,async({page})=>{
  await page.goto(`/#/game/${id}`);
  if(id==='claimline')await page.locator('.cl-start').click();
  else if(id==='crossy-road'){await expect(page.locator('.crossy-road')).toBeVisible();await page.keyboard.press('ArrowUp');}
  else await startGame(page,id);
  await expect(page.locator('#game-menu')).toBeVisible();await expectCheap(page);
  const read=()=>page.evaluate(()=>({...((globalThis as unknown as {__qccGlassStats?:Record<string,number>}).__qccGlassStats??{})}));
  const before=await read();await page.waitForTimeout(500);const after=await read();
  for(const key of ['frames','canvasFrames','uploads'])expect((after[key]??0)-(before[key]??0),`${key} must stay idle while game frames continue`).toBe(0);
  await page.locator('#game-menu').click();await expectCheap(page);
});
