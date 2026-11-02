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
    // The long form intentionally scrolls. Its offscreen submit must remain clipped.
    expect(submit.y+submit.height).toBeGreaterThan(box.y+box.height);
    expect(await page.evaluate(({x,y})=>!!document.elementFromPoint(x,y)?.closest('.account-submit'),{x:512,y:Math.min(576,submit.y+3)})).toBe(false);
    await button.scrollIntoViewIfNeeded();
    expect((await button.boundingBox())!.y+submit.height).toBeLessThanOrEqual(box.y+box.height);
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
    const options={clip:{x:305,y:550,width:420,height:27},animations:'allow' as const};
    const actual=await page.screenshot(options);
    const hidden=await page.addStyleTag({content:'#accounts-dialog,#accounts-dialog::backdrop{display:none!important}'});
    const without=await page.screenshot(options);await hidden.evaluate(e=>e.parentNode?.removeChild(e));
    // The live glass under the tab bar re-rasterises with a few levels of dither between any two screenshots,
    // so compare with a tolerance far below what a retained white rectangle would add.
    const strayPixels=await page.evaluate(async([a,b])=>{
      const load=async(data:string)=>{const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
        const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
        const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);return ctx.getImageData(0,0,canvas.width,canvas.height).data;};
      const [first,second]=[await load(a),await load(b)];let stray=first.length===second.length?0:Infinity;
      for(let i=0;i<first.length&&stray!==Infinity;i+=4)if(Math.max(Math.abs(first[i]-second[i]),Math.abs(first[i+1]-second[i+1]),Math.abs(first[i+2]-second[i+2]))>24)stray++;
      return stray;
    },[actual.toString('base64'),without.toString('base64')]);
    expect(strayPixels,'closed account tree adds no pixels to the reported white-rectangle region').toBe(0);
    await page.evaluate(()=>{for(const a of document.getAnimations())a.finish();});
    await page.reload();await expect(page.locator('.game-card').first()).toBeVisible();await expect(dialog).toBeHidden();
    await expect(dialog).toHaveCSS('backdrop-filter','none');
  });
}
