import {test,expect} from '../fixtures';

for(const fallback of [false,true])for(const close of ['guest','escape'] as const){
  test(`1024×577 closed account sheet leaves no paint after ${close}, fallback=${fallback}`,async({page})=>{
    await page.setViewportSize({width:1024,height:577});
    await page.goto(`/${fallback?'?glass=fallback':''}#/collection`);
    await expect(page.locator('.game-card').first()).toBeVisible();
    const dialog=page.locator('#accounts-dialog'),mini=page.locator('.app-navigation .ui-tabbar-mini');
    await expect(dialog).toBeHidden();
    await expect(mini).toHaveCSS('backdrop-filter','none');await expect(mini).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    expect((await mini.boundingBox())!.width).toBe(56);
    await page.getByRole('button',{name:'Open menu',exact:true}).click();
    await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
    await expect(dialog).toBeVisible();
    await expect.poll(()=>dialog.evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
    const button=dialog.locator('.account-submit'),box=(await dialog.boundingBox())!,submit=(await button.boundingBox())!;
    // The long form intentionally scrolls. The part of the submit beyond the sheet's edge must remain clipped.
    expect(submit.y+submit.height).toBeGreaterThan(box.y+box.height);
    expect(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.account-submit'),{x:512,y:Math.min(576,Math.max(submit.y,box.y+box.height)+3)})).toBe(false);
    await button.scrollIntoViewIfNeeded();
    // Integer scrollTop can leave a sub-pixel remainder at a fractional sheet edge.
    expect((await button.boundingBox())!.y+submit.height).toBeLessThanOrEqual(box.y+box.height+1);
    await dialog.evaluate(e=>e.scrollTop=0);
    if(close==='guest')await dialog.getByRole('button',{name:'Play as guest',exact:true}).click();else await page.keyboard.press('Escape');
    await expect(dialog).not.toHaveAttribute('open');
    // Escape hands keyboard focus back to Menu on a later frame; let its focus
    // ring land before comparing, so only the closed sheet could differ.
    if(close==='escape')await expect(page.locator('.app-navigation [data-action=menu]')).toBeFocused();
    // Hold the exit half way through: an inactive native sheet must not retain
    // a filtered/composited rectangle while entry rerenders the games grid.
    await page.evaluate(()=>{for(const a of document.getAnimations()){a.pause();a.currentTime=90;}});
    await expect(dialog).toBeHidden();await expect(dialog).toHaveCSS('backdrop-filter','none');
    expect(await page.evaluate(()=>[310,512,720].some(x=>!!document.elementFromPoint(x,574)?.closest('#accounts-dialog')))).toBe(false);
    const region={x:305,y:550,width:420,height:27};
    // Capture the viewport, then crop decoded pixels. Cropped Chromium captures
    // changed the same artwork edge pixel at (668,550) when the already-hidden
    // dialog was forced to display:none, in both live and fallback glass modes.
    // Keep the ROI away from the capture boundary in both the actual and control
    // images, rather than dropping the edge pixel or widening the tolerance.
    const options={animations:'allow' as const};
    const actual=await page.screenshot(options);
    const hidden=await page.addStyleTag({content:'#accounts-dialog,#accounts-dialog::backdrop{display:none!important}'});
    const without=await page.screenshot(options);await hidden.evaluate(e=>e.parentNode?.removeChild(e));
    // Live glass can re-rasterise with a few levels of dither. Retain the original
    // channel tolerance and require zero pixels above it throughout the same ROI.
    const countStrayPixels=(first:Buffer,second:Buffer)=>page.evaluate(async({a,b,region})=>{
      const load=async(data:string)=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
        if(image.width<region.x+region.width||image.height<region.y+region.height)throw new Error('Screenshot does not cover account paint region');
        const canvas=document.createElement('canvas');canvas.width=region.width;canvas.height=region.height;
        const ctx=canvas.getContext('2d')!;ctx.drawImage(image,region.x,region.y,region.width,region.height,0,0,region.width,region.height);
        return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
      const [first,second]=[await load(a),await load(b)];let stray=first.length===second.length?0:Infinity;
      for(let i=0;i<first.length&&stray!==Infinity;i+=4)if(Math.max(Math.abs(first[i]-second[i]),Math.abs(first[i+1]-second[i+1]),Math.abs(first[i+2]-second[i+2]))>24)stray++;
      return stray;
    },{a:first.toString('base64'),b:second.toString('base64'),region});
    expect(await countStrayPixels(actual,without),'closed account tree adds no pixels to the reported white-rectangle region').toBe(0);
    // Negative control: prove the identical capture/crop/comparison path still
    // rejects a retained white rectangle instead of merely hiding the regression.
    const retained=await page.evaluateHandle(({x,y,width,height})=>{
      const element=document.createElement('div');element.setAttribute('aria-hidden','true');
      Object.assign(element.style,{position:'fixed',left:`${x}px`,top:`${y}px`,width:`${width}px`,height:`${height}px`,
        background:'#fff',zIndex:'2147483647',pointerEvents:'none'});
      document.body.append(element);return element;
    },region);
    try{
      const withRectangle=await page.screenshot(options);
      expect(await countStrayPixels(withRectangle,without),'paint detector rejects a retained white rectangle').toBeGreaterThan(0);
    }finally{await retained.evaluate(e=>e.remove());await retained.dispose();}
    await page.evaluate(()=>{for(const a of document.getAnimations())a.finish();});
    await page.reload();await expect(page.locator('.game-card').first()).toBeVisible();await expect(dialog).toBeHidden();
    await expect(dialog).toHaveCSS('backdrop-filter','none');
  });
}
