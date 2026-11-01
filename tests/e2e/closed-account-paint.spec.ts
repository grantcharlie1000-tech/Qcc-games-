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
    // Hold the exit half way through: an inactive native sheet must not retain
    // a filtered/composited rectangle while entry rerenders the games grid.
    await page.evaluate(async()=>{
      const held=[];
      for(const a of document.getAnimations()){
        const target=(a.effect as KeyframeEffect|null)?.target;
        if(target instanceof Element&&target.closest('#accounts-dialog')){a.pause();a.currentTime=90;held.push(a.ready);}
        else a.finish();
      }
      // Keep the account exit at its midpoint, but settle unrelated navigation
      // restoration and queued focus before comparing the same rendered area.
      await Promise.all(held);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    });
    // The old dialog click can sit over a restored tab. Move it away after
    // holding the exit, so a newly acquired hover fill cannot change the crop.
    await page.mouse.move(0,0);
    await expect(page.locator('.app-navigation')).not.toHaveAttribute('data-sheet-hidden');
    await expect(dialog).toBeHidden();await expect(dialog).toHaveCSS('backdrop-filter','none');
    expect(await page.evaluate(()=>[310,512,720].some(x=>!!document.elementFromPoint(x,574)?.closest('#accounts-dialog')))).toBe(false);
    await page.evaluate(async()=>{
      // Guest entry can replace the grid. Decode its current art before
      // comparing pixels viewed through the now-clear navigation.
      await document.fonts.ready;
      await Promise.all([...document.querySelectorAll<HTMLImageElement>('.game-card img')].map(image=>image.decode()));
      await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    });
    await expect(page.getByRole('button',{name:'Open menu',exact:true})).toBeFocused();
    await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>{
      const target=(a.effect as KeyframeEffect|null)?.target;
      return !(target instanceof Element&&target.closest('#accounts-dialog'))&&(a.pending||a.playState==='running');
    }).length)).toBe(0);
    const options={clip:{x:305,y:550,width:420,height:27},animations:'allow' as const};
    const stableShot=async()=>{
      let previous:Buffer|undefined;
      await expect.poll(async()=>{
        const next=await page.screenshot(options),same=previous?.equals(next)??false;
        previous=next;return same;
      },{message:'navigation pixels settle while the account exit stays paused'}).toBe(true);
      return previous!;
    };
    // Backdrop rasterization can settle after DOM/style and animations do.
    // Capture stable pixels before hiding anything, preserving any stray paint.
    const actual=await stableShot();
    const hidden=await page.addStyleTag({content:'#accounts-dialog,#accounts-dialog::backdrop{display:none!important}'});
    const without=await stableShot();await hidden.evaluate(e=>e.parentNode?.removeChild(e));
    expect(actual.equals(without),'closed account tree adds no pixels to the reported white-rectangle region').toBe(true);
    await page.evaluate(()=>{for(const a of document.getAnimations())a.finish();});
    await page.reload();await expect(page.locator('.game-card').first()).toBeVisible();await expect(dialog).toBeHidden();
    await expect(dialog).toHaveCSS('backdrop-filter','none');
  });
}
