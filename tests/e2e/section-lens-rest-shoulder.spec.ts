import {expect,originalTheme,test} from '../fixtures';

// At rest the curved cap must illuminate an image-bearing band, not simply
// paint a bright silhouette. A narrow page mark outside the cap should be
// visible several CSS pixels inside it, and disappear when the source moves.
test('the light upper-left rest shoulder bends a page stroke into its bright inner band',async({context,page})=>{
  await originalTheme(context);
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({colorScheme:'light'});
  await page.goto('/#/collection');
  const bar=page.locator('.app-tabbar'),canvas=bar.locator('canvas.section-lens');
  await expect(bar).toHaveAttribute('data-section-lens','webgl');
  await page.locator('.game-grid').evaluate(grid=>{
    const patch=document.createElement('div');
    patch.id='rest-shoulder-patch';
    patch.style.cssText='position:fixed;inset:auto 0 0;height:120px;background:#fff;z-index:1;pointer-events:none';
    grid.append(patch);
  });
  const sample=()=>canvas.evaluate(el=>{
    const c=el as HTMLCanvasElement,rect=c.getBoundingClientRect();
    const bar=c.closest('.app-tabbar')!,b=bar.getBoundingClientRect(),pill=getComputedStyle(bar,'::after');
    const r=parseFloat(pill.height)/2;
    const cx=b.left+parseFloat(pill.left)+parseFloat(pill.translate)+r;
    const cy=b.top+parseFloat(pill.top)+r;
    const sx=c.width/rect.width,sy=c.height/rect.height,ctx=c.getContext('2d')!;
    const pixel=(depth:number,side:number)=>{
      const x=cx+side*(r-depth)*Math.SQRT1_2,y=cy-(r-depth)*Math.SQRT1_2;
      return ctx.getImageData(Math.floor((x-rect.left)*sx),Math.floor((y-rect.top)*sy),1,1).data[1];
    };
    return {shoulder:pixel(3,-1),face:pixel(10,-1)};
  });
  await expect.poll(async()=>(await sample()).face).toBeGreaterThan(205);
  let previous='';
  await expect.poll(async()=>{const next=JSON.stringify(await sample()),same=next===previous;previous=next;return same;},{intervals:[250]}).toBe(true);
  const clear=await sample();
  await page.locator('#rest-shoulder-patch').evaluate(patch=>{
    const b=document.querySelector('.app-tabbar')!.getBoundingClientRect(),pill=getComputedStyle(document.querySelector('.app-tabbar')!,'::after');
    const r=parseFloat(pill.height)/2;
    const cx=b.left+parseFloat(pill.left)+parseFloat(pill.translate)+r;
    const cy=b.top+parseFloat(pill.top)+r;
    const mark=document.createElement('i');
    // The source centre is 3.5 CSS px radially outward from the sampled
    // point, and the stroke itself is wholly outside the resting cap.
    const source=r+.5;
    mark.style.cssText=`position:fixed;left:${cx-source*Math.SQRT1_2-3}px;top:${cy-source*Math.SQRT1_2-.5}px;width:6px;height:1px;transform:rotate(-45deg);background:#333`;
    patch.append(mark);
  });
  let hit=await sample();
  // Keep diagnostic values in the RED run as well as the passing run.
  try {
    await expect.poll(async()=>{hit=await sample();return clear.shoulder-hit.shoulder;}).toBeGreaterThanOrEqual(14);
  } finally {console.log('rest shoulder bright and displaced source',JSON.stringify({clear,hit}));}
  expect(clear.shoulder-clear.face,'shoulder light extends inside the silhouette').toBeGreaterThanOrEqual(16);
  expect(Math.abs(hit.face-clear.face),'the inner face is not a duplicate of the shoulder').toBeLessThanOrEqual(3);
  await page.locator('#rest-shoulder-patch i').evaluate(el=>{
    const mark=el as HTMLElement;
    mark.style.left=`${parseFloat(mark.style.left)-5}px`;mark.style.top=`${parseFloat(mark.style.top)-5}px`;
  });
  await expect.poll(async()=>Math.abs(clear.shoulder-(await sample()).shoulder)).toBeLessThanOrEqual(3);
});
