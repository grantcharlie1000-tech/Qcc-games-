import {expect,originalTheme,test,type Page} from '../fixtures';

// tabbar.ts magnifies the tab content under the raised drag lens. A release or a cancel hands every tab back at 1,
// and reduced motion never raises the lens, so nothing is magnified.
test.beforeEach(async({context,page})=>{
  await originalTheme(context);
  await page.setViewportSize({width:390,height:844});
});

const zooms=(page:Page)=>page.locator('.app-tabbar .ui-tab').evaluateAll(tabs=>tabs.map(tab=>(tab as HTMLElement).style.getPropertyValue('--section-lens-zoom')));
const scales=(page:Page)=>page.locator('.app-tabbar .ui-tab>.ui-icon').evaluateAll(icons=>icons.map(icon=>getComputedStyle(icon).scale));
const magnified=async(page:Page)=>Math.max(1,...(await zooms(page)).map(Number).filter(Number.isFinite));

async function dragFromGames(page:Page,lens=true){
  const bar=page.locator('.app-tabbar');
  // Reduced motion draws the CSS pill, so only the full-motion drags wait for the WebGL lens.
  if(lens)await expect(bar).toHaveAttribute('data-section-lens','webgl');
  else await expect(bar).toHaveAttribute('data-pill-ready','');
  const box=(await bar.getByRole('link',{name:'Games',exact:true}).boundingBox())!;
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await page.mouse.move(x+90,y,{steps:6});
  return bar;
}

test('the drag lens zoom returns to rest when the drag ends',async({page})=>{
  await page.goto('/#/collection');
  const bar=await dragFromGames(page);
  await expect(bar).toHaveAttribute('data-pill-dragging','');
  await expect.poll(()=>magnified(page)).toBeGreaterThan(1.05);
  await page.mouse.up();
  await expect(bar).not.toHaveAttribute('data-pill-dragging');
  await expect.poll(()=>zooms(page)).toEqual(['','','','','']);
  await expect.poll(()=>scales(page)).toEqual(['none','none','none','none','none']);
});

test('the drag lens zoom returns to rest when the drag is cancelled',async({page})=>{
  await page.goto('/#/collection');
  await page.evaluate(()=>addEventListener('pointerdown',(event:PointerEvent)=>{(window as any).__dragPointer=event.pointerId;},{capture:true}));
  const bar=await dragFromGames(page);
  await expect(bar).toHaveAttribute('data-pill-dragging','');
  await expect.poll(()=>magnified(page)).toBeGreaterThan(1.05);
  await page.evaluate(()=>document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:(window as any).__dragPointer,bubbles:true})));
  await expect(bar).not.toHaveAttribute('data-pill-dragging');
  await expect.poll(()=>zooms(page)).toEqual(['','','','','']);
  await expect.poll(()=>scales(page)).toEqual(['none','none','none','none','none']);
  await page.mouse.up();
});

test('reduced motion never magnifies tab content under the pill',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/#/collection');
  const bar=await dragFromGames(page,false);
  for(let sample=0;sample<5;sample++){
    await page.waitForTimeout(60);
    expect(await bar.getAttribute('data-pill-dragging')).toBeNull();
    expect(await zooms(page)).toEqual(['','','','','']);
    expect(await scales(page)).toEqual(['none','none','none','none','none']);
  }
  await page.mouse.up();
});
