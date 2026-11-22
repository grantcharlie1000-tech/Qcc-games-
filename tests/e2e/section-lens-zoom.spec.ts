import {expect,originalTheme,test,type Page} from '../fixtures';

// tabbar.ts magnifies each tab's icon and label by how much of them the raised drag lens covers: content under the
// lens face reaches the lens magnification, and it eases off across the bevel, so two tabs sharing the lens both swell.
// The lens is the wide bubble section-lens.ts draws (about 1.55 bar heights, Charlie's video), not the narrower CSS pill.
// A release or a cancel hands every tab back at 1, and reduced motion never raises the lens, so nothing is magnified.
test.beforeEach(async({context,page})=>{
  await originalTheme(context);
  await page.setViewportSize({width:390,height:844});
});

const zooms=(page:Page)=>page.locator('.app-tabbar .ui-tab').evaluateAll(tabs=>tabs.map(tab=>(tab as HTMLElement).style.getPropertyValue('--section-lens-zoom')));
const scales=(page:Page)=>page.locator('.app-tabbar .ui-tab>.ui-icon').evaluateAll(icons=>icons.map(icon=>getComputedStyle(icon).scale));
const magnified=async(page:Page)=>Math.max(1,...(await zooms(page)).map(Number).filter(Number.isFinite));
// The layout boxes and the screen boxes of the tabs: the zoom scales only their content, so neither moves. MOTION-3 (#24):
// the bar itself grows about its centre while pressed (Charlie's video, 349x62 -> 365x66), so the screen boxes are read in
// the bar's own frame, with that growth undone; at rest it is 1 and they are the screen boxes as before.
const boxes=(page:Page)=>page.locator('.app-tabbar .ui-tab').evaluateAll(tabs=>tabs.map(tab=>{
  const rect=tab.getBoundingClientRect(),el=tab as HTMLElement,bar=el.closest<HTMLElement>('.app-tabbar')!,frame=bar.getBoundingClientRect();
  const grow=frame.width/bar.offsetWidth,centre=frame.left+frame.width/2;
  return [el.offsetLeft,el.offsetWidth,Math.round((centre+(rect.left-centre)/grow)*10)/10,Math.round(rect.width/grow*10)/10];
}));
// LENS_ZOOM in tabbar.ts (Charlie's video: the glyph under the lens grows 1.17x).
// MOTION-3 (#24): was 1.18; the bar's growth while pressed (x1.046 x 1.065, the video's) carries the rest of the 1.17.
const LENS_ZOOM=1.16;

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
  // MOTION-3 (#24): the bar grows about its centre while pressed (video x1.046 x1.065) and the lens moves 1:1 with the
  // finger from Games as drawn on the grown bar, so the target is read from the grown tabs and reached by that travel.
  await expect.poll(()=>bar.evaluate(el=>Math.round(el.getBoundingClientRect().width/(el as HTMLElement).offsetWidth*1000)/1000)).toBe(1.046);
  const grown=await bar.locator('.ui-tab').evaluateAll(list=>list.map(tab=>{const r=tab.getBoundingClientRect();return {x:r.x,width:r.width};}));
  // MOTION-5 (#24): Games is an end tab, so its pill is Apple's capsule held at the bar's inset (glass.ts capsulePill), a few px
  // right of the tab's centre, and the drag leaves from there: the travel is measured from the pill's own centre on screen.
  const start=await bar.evaluate(el=>{
    const pill=getComputedStyle(el,'::after'),box=el.getBoundingClientRect();
    return box.left+(el.clientLeft+parseFloat(pill.translate)+parseFloat(pill.width)/2)*box.width/(el as HTMLElement).offsetWidth;
  });
  await page.mouse.move(x+at(grown)-start,y,{steps:8});
  await expect(bar).toHaveAttribute('data-pill-dragging','');
  // The pill's stretch eases for 100ms after the last move. MOTION-5 (#24): was a wait for '1.32 0.98', the stretch after a
  // full tab of travel; from Games' capsule, held a few px in, the hop to Movies' centre is 48.9 layout px, just under the
  // 53 px tab, so the stretch settles at about 1.30. The wait is for the eased scale to reach the one the drag set.
  await expect.poll(()=>bar.evaluate(el=>{
    const want=(el as HTMLElement).style.getPropertyValue('--ui-pill-drag-scale').trim().split(/\s+/).map(Number);
    const got=getComputedStyle(el,'::after').scale.split(' ').map(Number);
    return want.length===2&&got.length===2&&want.every((value,i)=>Math.abs(value-got[i])<1e-3)&&want[0]>=1.28;
  })).toBe(true);
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

test('a tab under the lens face takes the full lens magnification, and its neighbours at most a trace',async({page})=>{
  await page.goto('/#/collection');
  const {rest}=await dragLensTo(page,tabs=>tabs[1].x+tabs[1].width/2);
  await expect.poll(async()=>Number((await zooms(page))[1])).toBeGreaterThan(LENS_ZOOM-.02);
  const [games,over,next,...far]=(await zooms(page)).map(Number);
  expect(over).toBeLessThanOrEqual(LENS_ZOOM);
  // The wide bubble's bevel just reaches the neighbours' outer content (1.013 at 390 px), so they barely swell.
  expect(games).toBeLessThan(1.04);expect(next).toBeLessThan(1.04);
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
  // The old distance rule peaked near 1.05 here. The wide bubble covers both tabs' content, as the video's 13.5 s drag
  // magnifies the two glyphs it spans, so each reaches about the full 1.17.
  expect(Math.max(left,right)).toBeLessThanOrEqual(LENS_ZOOM);
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
