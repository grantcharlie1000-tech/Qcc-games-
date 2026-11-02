import {test,expect} from '../fixtures';
import {gameAction,openGameMenu} from '../game-menu';
import {glyphContrast} from '../glass-contrast';

for(const [id,tone] of [['snake','dark'],['fruit-merge','light']] as const){
  test(`${id} menu and its submenus use a neutral glass sheet and retain modal focus`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    await page.goto(`/#/game/${id}`);
    await openGameMenu(page);
    const menu=page.locator('#game-options');
    await expect(menu).toHaveAttribute('data-glass-tone',tone);
    const material=await menu.evaluate(e=>{
      const s=getComputedStyle(e),group=getComputedStyle(e.querySelector('.game-menu-actions')!);
      return {filter:s.backdropFilter,radius:parseFloat(s.borderRadius),padding:parseFloat(s.paddingLeft),groupRadius:parseFloat(group.borderRadius),grabber:getComputedStyle(e,'::before').content};
    });
    expect(material.filter).toContain('blur(8px)');
    expect(material.radius).toBe(material.groupRadius+material.padding);
    expect(material.grabber).toBe('""');
    // The paused game's artwork remains visible behind the sheet. Its state is still paused.
    await expect(page.locator('#pause-overlay')).toHaveCSS('opacity','0');
    await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Resume game');
    for(let i=0;i<12;i++){
      await page.keyboard.press('Tab');
      // Native dialogs may tab through browser chrome (activeElement becomes body),
      // but must never focus an interactive element in the inert page underneath.
      expect(await menu.evaluate(e=>e.contains(document.activeElement)||document.activeElement===document.body)).toBe(true);
    }
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.locator('#game-menu')).toBeFocused();
    await gameAction(page,'Game rules');
    await expect(page.locator('#rules-dialog')).toHaveAttribute('data-glass-tone',tone);
    await page.keyboard.press('Escape');
    await gameAction(page,'Settings');
    await expect(page.locator('#menu')).toHaveAttribute('data-glass-tone',tone);
    await page.locator('#menu').getByRole('button',{name:'Leaderboards',exact:true}).click();
    await expect(page.locator('#leaderboard-dialog')).toHaveAttribute('data-glass-tone',tone);
  });
}

test('home sheets are light and game-owned submenus share the glass surface',async({page})=>{
  await page.goto('/#/collection');
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await expect(page.locator('#menu')).toHaveAttribute('data-glass-tone','light');
  await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
  await expect(page.locator('#accounts-dialog')).toHaveAttribute('data-glass-tone','light');
  await page.getByRole('button',{name:'Play as guest',exact:true}).click();
  for(const [id,action,selector] of [['minesweeper','Game options','.ms-settings'],['fivefold','Stats','.ff-dialog'],['pool','Multiplayer','.mp-card']]){
    await page.goto(`/#/game/${id}`);
    // Menu actions are collected from the asynchronously mounted game controls.
    await expect(page.locator('#game-stage .game-menu-source').first()).toBeAttached();
    await gameAction(page,action);
    const panel=page.locator(selector);await expect(panel).toBeVisible();
    expect(await panel.evaluate(e=>getComputedStyle(e).backdropFilter)).toContain('blur(8px)');
    await expect.poll(()=>panel.evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
    const targets=await panel.locator('button').evaluateAll(buttons=>buttons.map(b=>b.getBoundingClientRect().height).filter(h=>h>0));
    expect(Math.min(...targets),`${id} submenu touch targets`).toBeGreaterThanOrEqual(44);
    await page.keyboard.press('Escape');
    await expect(panel).toBeHidden();
  }
});

test('desktop actions have comfortable hit areas without enlarging board cells',async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  for(const [id,selector] of [['block-fill','[data-action="undo"]'],['solitaire','[data-action="undo"]']]){
    await page.goto(`/#/game/${id}`);
    const action=page.locator(selector);await expect(action).toBeVisible();
    const size=await action.evaluate(e=>({height:e.getBoundingClientRect().height,font:parseFloat(getComputedStyle(e).fontSize)}));
    expect(size.height,id).toBeGreaterThanOrEqual(44);
    expect(size.font,id).toBeGreaterThanOrEqual(14);
  }
});

for(const feature of ['prefers-reduced-transparency','prefers-contrast','forced-colors']){
  test(`${feature} makes arcade and native submenu surfaces opaque`,async({page,context,browserName})=>{
    test.skip(browserName!=='chromium','CDP media emulation');
    const cdp=await context.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:feature,value:feature==='forced-colors'?'active':feature==='prefers-contrast'?'more':'reduce'}]});
    await page.goto('/#/game/minesweeper');
    await gameAction(page,'Game options');
    const material=await page.locator('.ms-settings').evaluate(e=>{
      const s=getComputedStyle(e);return {filter:s.backdropFilter,fill:s.backgroundColor,border:parseFloat(s.borderTopWidth)};
    });
    expect(material.filter).toBe('none');
    expect(material.fill).toMatch(/^rgb\(/);
    expect(material.border).toBeGreaterThanOrEqual(1);
    if(feature==='forced-colors'){
      for(const selector of ['.ms-sound','.ms-close']){
        expect(await page.locator(selector).evaluate(e=>getComputedStyle(e).borderTopWidth),selector).toBe('2px');
      }
    }
    await cdp.detach();
  });
}

for(const view of ['home','accounts','snake','fruit-merge']){
  test(`${view} sheet text keeps 4.5:1 contrast over the rendered backdrop`,async({page})=>{
    await page.setViewportSize({width:390,height:844});
    const home=['home','accounts'].includes(view);
    await page.goto(home?'/#/collection':`/#/game/${view}`);
    if(home)await page.getByRole('button',{name:'Open menu',exact:true}).click();
    else await openGameMenu(page);
    if(view==='accounts')await page.getByRole('button',{name:'Log in / Sign up',exact:true}).click();
    const selector=view==='accounts'?'#accounts-dialog':home?'#menu':'#game-options',panel=page.locator(selector);
    await expect.poll(()=>panel.evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
    await panel.evaluate(e=>{e.scrollTop=0;});
    const boxes=await panel.evaluate(e=>{
      const outer=e.getBoundingClientRect(),walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT),boxes=[];
      while(walker.nextNode()){
        const node=walker.currentNode,parent=node.parentElement!;
        if(!node.textContent?.trim()||parent.closest('.sr-only')||getComputedStyle(parent).visibility==='hidden')continue;
        const range=document.createRange();range.selectNodeContents(node);
        for(const r of range.getClientRects())if(r.width&&r.top>=outer.top+2&&r.bottom<=outer.bottom-2){
          boxes.push({x:r.x-outer.x,y:r.y-outer.y,w:r.width,h:r.height,color:getComputedStyle(parent).color});
        }
      }
      return boxes;
    });
    expect(boxes.length).toBeGreaterThan(8);
    const hide=await page.addStyleTag({content:`${selector} *{color:transparent!important}`});
    const shot=(await panel.screenshot({animations:'disabled'})).toString('base64');
    await hide.evaluate(e=>e.parentNode?.removeChild(e));
    await page.addStyleTag({content:`${selector},${selector} *{background:#000!important;color:#fff!important;backdrop-filter:none!important;box-shadow:none!important;border-color:transparent!important;text-shadow:none!important}`});
    const mask=(await panel.screenshot({animations:'disabled'})).toString('base64');
    const ratios=await glyphContrast(page,shot,mask,boxes,(await panel.boundingBox())!);
    expect(Math.min(...ratios),ratios.map(r=>r.toFixed(2)).join(', ')).toBeGreaterThanOrEqual(4.5);
  });
}
