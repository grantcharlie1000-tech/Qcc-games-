import {expect,originalTheme,test,type Page} from '../fixtures';

// tabbar.ts magnifies each tab's icon and label by how much of them the raised drag lens covers: content under the
// lens face reaches the lens magnification, and it eases off across the bevel, so two tabs sharing the lens both swell.
// A release or a cancel hands every tab back at 1, and reduced motion never raises the lens, so nothing is magnified.
test.beforeEach(async({context,page})=>{
  await originalTheme(context);
  await page.setViewportSize({width:390,height:844});
});

const zooms=(page:Page)=>page.locator('.app-tabbar .ui-tab').evaluateAll(tabs=>tabs.map(tab=>(tab as HTMLElement).style.getPropertyValue('--section-lens-zoom')));
const scales=(page:Page)=>page.locator('.app-tabbar .ui-tab>.ui-icon').evaluateAll(icons=>icons.map(icon=>getComputedStyle(icon).scale));
const magnified=async(page:Page)=>Math.max(1,...(await zooms(page)).map(Number).filter(Number.isFinite));
// The layout boxes and the screen boxes of the tabs: the zoom scales only their content, so neither moves.
const boxes=(page:Page)=>page.locator('.app-tabbar .ui-tab').evaluateAll(tabs=>tabs.map(tab=>{
  const rect=tab.getBoundingClientRect(),el=tab as HTMLElement;
  return [el.offsetLeft,el.offsetWidth,Math.round(rect.left*10)/10,Math.round(rect.width*10)/10];
}));
// LENS_ZOOM in tabbar.ts (Charlie's video: the glyph under the lens grows 1.17x).
const LENS_ZOOM=1.18;

// Drags the lens from Games until its centre sits at x: over a tab's centre, or on the gap between two tabs.
async function dragLensTo(page:Page,at:(tabs:{x:number;width:number}[])=>number){
  const bar=page.locator('.app-tabbar');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  const tabs=await bar.locator('.ui-tab').evaluateAll(list=>list.map(tab=>{const r=tab.getBoundingClientRect();return {x:r.x,width:r.width,y:r.y+r.height/2};}));
  const rest=await boxes(page);
  const x=tabs[0].x+tabs[0].width/2,y=tabs[0].y;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await expect(bar).toHaveAttribute('data-pressing','');
  await page.mouse.move(at(tabs),y,{steps:8});
  await expect(bar).toHaveAttribute('data-pill-dragging','');
  // The pill's stretch eases for 100ms after the last move.
  await expect.poll(()=>bar.evaluate(el=>getComputedStyle(el,'::after').scale)).toBe('1.32 0.98');
  return {bar,rest};
}

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

test('a tab under the lens face takes the full lens magnification, and its neighbours none',async({page})=>{
  await page.goto('/#/collection');
  const {rest}=await dragLensTo(page,tabs=>tabs[1].x+tabs[1].width/2);
  await expect.poll(async()=>Number((await zooms(page))[1])).toBeGreaterThan(LENS_ZOOM-.02);
  const [games,over,next,...far]=(await zooms(page)).map(Number);
  expect(over).toBeLessThanOrEqual(LENS_ZOOM);
  expect(games).toBeLessThan(1.005);expect(next).toBeLessThan(1.005);
  expect(far).toEqual([1,1]);
  // Movies and the tabs past it keep their layout and screen boxes; Games keeps its layout box under its own press.
  const held=await boxes(page);
  expect(held.slice(1)).toEqual(rest.slice(1));
  expect(held[0].slice(0,2)).toEqual(rest[0].slice(0,2));
  await page.mouse.up();
});

test('both tabs under a lens between them are visibly magnified, about equally',async({page})=>{
  await page.goto('/#/collection');
  const {rest}=await dragLensTo(page,tabs=>(tabs[1].x+tabs[1].width+tabs[2].x)/2);
  await expect.poll(async()=>Math.min(...(await zooms(page)).slice(1,3).map(Number))).toBeGreaterThan(1+.6*(LENS_ZOOM-1));
  const [games,left,right,...far]=(await zooms(page)).map(Number);
  // The old distance rule peaked near 1.05 here. Each tab now has most of its content under the face or bevel.
  expect(Math.max(left,right)).toBeLessThan(LENS_ZOOM-.03);
  expect(Math.abs(left-right)).toBeLessThan(.03);
  expect([games,...far]).toEqual([1,1,1]);
  const held=await boxes(page);
  expect(held.slice(1)).toEqual(rest.slice(1));
  await page.mouse.up();
  await expect.poll(()=>zooms(page)).toEqual(['','','','','']);
});

test('the drag lens zoom returns to rest when the drag ends',async({page})=>{
  await page.goto('/#/collection');
  const bar=await dragFromGames(page);
  await expect(bar).toHaveAttribute('data-pill-dragging','');
  await expect.poll(()=>magnified(page)).toBeGreaterThan(1.1);
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
  await expect.poll(()=>magnified(page)).toBeGreaterThan(1.1);
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
