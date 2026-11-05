import {test,expect} from '../fixtures';
import {HIDDEN_INK,glyphContrast,settleGlassInk} from '../glass-contrast';

const forcedFallback=process.env.ARCADE_GLASS_FALLBACK==='1';
test.beforeEach(async({page})=>{
  if(forcedFallback)await page.addInitScript(()=>{
    const url=new URL(location.href);url.searchParams.set('glass','fallback');history.replaceState(null,'',url);
  });
});

for(const scroll of [150,170])test(`pressed home lenses keep fixed-white glyphs over a card-row gap at ${scroll}px`,async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const nav=page.locator('.app-navigation'),bar=page.locator('.app-tabbar');
  await page.evaluate(y=>scrollTo(0,y),scroll);await expect(bar).toHaveAttribute('data-minimized','true');
  await page.locator('.ui-tabbar-mini').click();await expect(bar).not.toHaveAttribute('data-minimized');
  for(const name of ['Study','Open menu']){
    const button=nav.getByRole('button',{name,exact:true});await button.hover();await page.mouse.down();
    await button.screenshot({animations:'disabled'});
    await settleGlassInk(nav);
    const boxes=await nav.evaluate(n=>{
      const b=n.getBoundingClientRect();
      return [...n.querySelectorAll('.ui-tab > .ui-icon,.ui-tab > span:not(.ui-glass-lens,.ui-glass-glow)')].map(e=>{
        const r=e.getBoundingClientRect();return {x:r.x-b.x,y:r.y-b.y,w:r.width,h:r.height,color:getComputedStyle(e).color,icon:e instanceof SVGElement};
      });
    });
    const visible=(await nav.screenshot({animations:'disabled'})).toString('base64');
    // Adaptive ink colours each .glass-ink glyph itself, so hide the glyphs, not just the tab.
    const hidden=await page.addStyleTag({content:`.app-navigation .ui-tab,.app-navigation .ui-tab *{color:${HIDDEN_INK}!important}`});
    const shot=(await nav.screenshot({animations:'disabled'})).toString('base64');
    await hidden.evaluate(e=>e.parentNode?.removeChild(e));
    const maskStyle=await page.addStyleTag({content:'body{background:#000!important}#content{visibility:hidden!important}.app-navigation .arcade-glass{background:transparent!important;backdrop-filter:none!important}.app-navigation .arcade-glass::before,.app-navigation .arcade-glass::after,.app-navigation .ui-glass-lens,.app-navigation .ui-glass-glow{visibility:hidden!important}.app-navigation .ui-tab,.app-navigation .ui-tab *{color:#fff!important;background:none!important;text-shadow:none!important;filter:none!important}'});
    const mask=(await nav.screenshot({animations:'disabled'})).toString('base64');
    await maskStyle.evaluate(e=>e.parentNode?.removeChild(e));
    await page.mouse.move(0,0);await page.mouse.up();
    const ratios=await glyphContrast(page,shot,mask,boxes,(await nav.boundingBox())!);
    // Record measured contrast without claiming universal WCAG compliance;
    // both labels and icons deliberately retain fixed-white ink.
    const iconBoxes=boxes.filter(box=>box.icon);
    const text=ratios.filter((_,i)=>!boxes[i].icon),icons=await glyphContrast(page,visible,mask,iconBoxes,(await nav.boundingBox())!,true);
    await test.info().attach(`${name}-icon-contrast`,{body:JSON.stringify({bounds:await nav.boundingBox(),boxes:iconBoxes,icons}),contentType:'application/json'});
    await test.info().attach(`${name}-icon-mask`,{body:Buffer.from(mask,'base64'),contentType:'image/png'});
    expect(text.length).toBeGreaterThan(0);
    expect(text.every(ratio=>Number.isFinite(ratio)&&ratio>=1)).toBe(true);
    await test.info().attach(`${name}-label-core-contrast`,{body:JSON.stringify({text,limitation:'Fixed-white cores cannot guarantee 4.5:1 over every backdrop.'}),contentType:'application/json'});
    // Icons now deliberately stay white instead of adapting to the backdrop.
    for(const box of boxes)expect(box.color).toBe('rgb(255, 255, 255)');
  }
});

for(const width of [320,390,1366]){
  test(`short HUDs hug content and stay centered at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto('/#/game/snake');
    const hud=page.locator('.game-hud');await expect(hud.locator('strong')).toBeVisible();
    const box=(await hud.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(88);
    expect(box.width).toBeLessThanOrEqual(120);
    expect(Math.abs(box.x+box.width/2-width/2)).toBeLessThan(1);
    const menu=(await page.locator('#game-menu').boundingBox())!;
    expect(menu.x-box.x-box.width).toBeGreaterThanOrEqual(8);
    expect(menu.x-box.x-box.width).toBeLessThanOrEqual(12);
  });
  test(`home has five tabs and a separate circular Menu at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});await page.goto('/');
    const bar=page.locator('.app-tabbar'),menu=page.getByRole('button',{name:'Open menu',exact:true});
    await expect(bar.locator('.ui-tab')).toHaveCount(5);
    await expect(menu).toHaveClass(/arcade-glass/);
    expect(await menu.evaluate(e=>!!e.closest('.app-tabbar'))).toBe(false);
    const a=(await bar.boundingBox())!,b=(await menu.boundingBox())!;
    expect(b.x-a.x-a.width).toBeGreaterThanOrEqual(8);
    expect(b.x-a.x-a.width).toBeLessThanOrEqual(12);
    expect(b.width).toBe(b.height);expect(b.width).toBeGreaterThanOrEqual(48);
    await bar.getByRole('button',{name:'Study',exact:true}).focus();
    await page.keyboard.press('Tab');await expect(menu).toBeFocused();
    await page.keyboard.press('Tab');await expect(page.locator('.game-card').first()).toBeFocused();
  });
}

test('the companion Menu hides and restores with the home island and keyboard focus',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const bar=page.locator('.app-tabbar'),menu=page.getByRole('button',{name:'Open menu',exact:true});
  await page.evaluate(()=>scrollTo(0,400));await expect(bar).toHaveAttribute('data-minimized','true');
  await expect(menu).toHaveCSS('pointer-events','none');
  await page.keyboard.press('Tab');await menu.focus();
  await expect(menu).toHaveCSS('pointer-events','auto');
  await expect.poll(async()=>(await bar.boundingBox())!.width).toBeGreaterThan(250);
  await page.locator('.game-card').first().focus();
  await bar.evaluate(e=>e.setAttribute('data-hidden','true'));
  await expect(menu).toHaveCSS('pointer-events','none');
  await menu.focus();await expect(menu).toHaveCSS('pointer-events','auto');
  await expect.poll(async()=>(await bar.boundingBox())!.y).toBeLessThan(844);
  await page.goto('/#/game/snake');await expect(menu).toBeHidden();
});

test('both home lenses use opaque surfaces with reduced transparency',async({page,browserName})=>{
  test.skip(browserName!=='chromium','CDP preference emulation');
  await page.goto('/');
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
  const objects=page.locator('.app-navigation > .arcade-glass');await expect(objects).toHaveCount(2);
  for(const object of await objects.all()){
    await expect(object).toHaveAttribute('data-glass','off');
    await expect(object).toHaveCSS('background-color','rgb(241, 243, 245)');
    await expect(object).toHaveCSS('border-top-width','1px');
  }
});

for(const preference of ['media','class'])test(`home companion preserves reduced-motion focus and press via ${preference}`,async({page})=>{
  if(preference==='media')await page.emulateMedia({reducedMotion:'reduce'});
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  if(preference==='class')await page.evaluate(()=>document.documentElement.classList.add('reduce-motion'));
  const menu=page.getByRole('button',{name:'Open menu',exact:true}),bar=page.locator('.app-tabbar');
  await page.evaluate(()=>scrollTo(0,400));await expect(bar).toHaveAttribute('data-minimized','true');
  await expect(menu).toHaveCSS('pointer-events','none');
  await page.keyboard.press('Tab');await menu.focus();
  await expect(menu).toHaveCSS('pointer-events','auto');await expect(bar).toHaveCSS('opacity','1');
  await bar.evaluate(e=>e.setAttribute('data-hidden','true'));await expect(bar).toHaveCSS('opacity','1');
  await menu.hover();await page.mouse.down();await expect(menu).toHaveCSS('scale','none');
  await page.mouse.move(0,0);await page.mouse.up();
});

for(const width of [390,1366]){
  test(`three independent glass objects float over the game surface at ${width}px`,async({page,browserName})=>{
    await page.setViewportSize({width,height:width===390?844:768});
    await page.goto('/#/game/fruit-merge');
    const dock=page.getByRole('navigation',{name:'Game controls'});
    const objects=dock.locator(':scope > .arcade-glass');
    await expect(objects).toHaveCount(3);
    await expect(dock.getByRole('link',{name:'Games',exact:true})).toBeVisible();
    await expect(dock.getByRole('button',{name:'Menu',exact:true})).toBeVisible();
    const boxes=await objects.evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};}));
    for(let i=1;i<boxes.length;i++)expect(boxes[i].x-boxes[i-1].right).toBeGreaterThanOrEqual(8);
    for(const b of boxes){expect(b.width).toBeGreaterThanOrEqual(44);expect(b.height).toBeGreaterThanOrEqual(48);}
    const surface=(await page.locator('.game-surface').boundingBox())!;
    for(const b of boxes){expect(b.y).toBeGreaterThanOrEqual(surface.y);expect(b.bottom).toBeLessThanOrEqual(surface.y+surface.height);}
    const drop=(await page.locator('.fm-board').boundingBox())!;await expect(page.locator('.fm-drop')).toHaveCount(0);
    expect(drop.y+drop.height).toBeLessThanOrEqual(boxes[0].y-8);
    await expect(page.locator('.game-view')).toHaveAttribute('data-glass-tone','light');
    for(const object of await objects.all())await expect(object).toHaveAttribute('data-glass',browserName==='chromium'?'backdrop':'frost');
    await expect(dock).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  });
}

for(const width of [390,1366]){
  test(`decorative lenses preserve single-value text size at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto('/#/game/snake');
    const value=page.locator('.game-hud strong');
    const size=await value.evaluate(e=>parseFloat(getComputedStyle(e).fontSize));
    expect(size).toBeGreaterThanOrEqual(width===390?20:22);
    await page.emulateMedia({contrast:'more'});
    await expect(page.locator('.game-hud')).toHaveAttribute('data-glass','off');
    await expect(value).toHaveCSS('font-size',`${size}px`);
  });
}

test('surface tone follows the game and glyphs have no heavy halo',async({page})=>{
  for(const [id,tone] of [['fruit-merge','light'],['neon-coil','dark'],['quadfall','dark']]){
    await page.goto(`/#/game/${id}`);
    await expect(page.locator('.game-view')).toHaveAttribute('data-glass-tone',tone);
    await expect(page.locator('.game-hud')).toHaveCSS('text-shadow','none');
    // Over live game art the adaptive ink may add its thin opposite-tone outline:
    // at most four unblurred 1px drop-shadows, never a heavy blurred halo.
    await expect.poll(()=>page.locator('#game-menu svg').evaluate(e=>{
      const filter=getComputedStyle(e).filter;if(filter==='none')return true;
      const shadows=[...filter.matchAll(/drop-shadow\((?:rgba?\([^)]*\) )?(-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px\)/g)];
      return shadows.length<=4&&filter.replace(/drop-shadow\((?:rgba?\([^)]*\) )?[^)]*\)/g,'').trim()===''&&shadows.every(([,x,y,blur])=>Math.abs(+x)<=1&&Math.abs(+y)<=1&&+blur===0);
    })).toBe(true);
  }
});

test('reduced transparency replaces each lens with an opaque bordered surface',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Reduced-transparency emulation requires CDP');
  await page.goto('/#/game/fruit-merge');
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
  const objects=page.locator('.game-dock > .arcade-glass');
  await expect(objects).toHaveCount(3);
  for(const object of await objects.all()){
    await expect(object).toHaveAttribute('data-glass','off');
    await expect(object).toHaveCSS('backdrop-filter','none');
    const style=await object.evaluate(e=>{const s=getComputedStyle(e);return {fill:s.backgroundColor,border:s.borderTopWidth};});
    expect(style.fill).toMatch(/^rgb\(/);
    expect(parseFloat(style.border)).toBeGreaterThanOrEqual(1);
  }
  await expect(page.locator('.game-dock .ui-glass-lens')).toHaveCount(0);
});

test('pale home glass keeps keyboard focus visible with increased contrast',async({page})=>{
  await page.emulateMedia({contrast:'more'});
  await page.goto('/#/collection');
  await page.keyboard.press('Tab');
  const tab=page.locator('.app-tabbar').getByRole('button',{name:'Study',exact:true});
  await tab.focus();
  await expect(tab).toBeFocused();
  await expect(tab).toHaveCSS('outline-color','rgb(11, 16, 21)');
  await expect(tab).toHaveCSS('outline-style','solid');
  await expect(page.locator('.app-tabbar')).toHaveCSS('background-color','rgb(241, 243, 245)');
});

test('pointer press lifts the individual button and reduced motion removes the lift',async({page})=>{
  await page.goto('/#/game/snake');
  const button=page.locator('#game-menu');
  await button.hover();await page.mouse.down();
  await expect(button).toHaveAttribute('data-pressing','');
  await expect.poll(()=>button.evaluate(e=>parseFloat(getComputedStyle(e).scale))).toBeGreaterThanOrEqual(1.08);
  const filter=await button.getAttribute('data-glass')==='frost'?button:button.locator('.ui-glass-lens');
  // A press keeps the clear --glass-clear-blur (1.5px) recipe; only the lift changes.
  await expect(filter).toHaveCSS('backdrop-filter',/blur\(1\.5px\)/);
  await page.mouse.move(1,1);await page.mouse.up();
  await expect(button).not.toHaveAttribute('data-pressing');
  await page.emulateMedia({reducedMotion:'reduce'});
  await button.hover();await page.mouse.down();
  await expect(button).toHaveCSS('scale','none');
  await page.mouse.move(1,1);await page.mouse.up();
});

test('light desktop controls keep white hover ink and an opaque accessible surface',async({page})=>{
  await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/fruit-merge');
  const menu=page.locator('#game-menu');await menu.hover();
  await expect(menu).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(menu).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await page.emulateMedia({contrast:'more'});
  await expect(menu).toHaveAttribute('data-glass','off');
  await expect(menu).toHaveCSS('background-color','rgb(241, 243, 245)');
  await expect(menu).toHaveCSS('color','rgb(11, 16, 21)');
});

for(const density of [1,2])test.describe(`uniform arcade optics at DSF ${density}`,()=>{
  test.use({deviceScaleFactor:density});
  test('the home lens diffuses both halves uniformly and the clear dock retains detail',async({page,browserName})=>{
    test.skip(browserName!=='chromium','SVG backdrop coverage is a Chromium feature');
    await page.setViewportSize({width:390,height:844});await page.goto('/');
    const home=page.locator('.app-tabbar');await expect(home).toHaveClass(/is-refracting/);
    const homeBlur=await home.locator('.ui-glass-lens').evaluate(e=>getComputedStyle(e).backdropFilter.match(/blur\([^)]+\)/)![0]);
    // #92's 12px frost requires wider source detail than the former 3px
    // blur. A 40px period still compares identical phases 120px apart.
    await page.addStyleTag({content:'#content{visibility:hidden}body{background:repeating-linear-gradient(90deg,#172b38 0 20px,#dfc9a6 20px 40px)!important}.app-tabbar::after{display:none}.app-tabbar .ui-tab{visibility:hidden}'});
    const shot=(await home.screenshot({animations:'disabled'})).toString('base64');
    const rendered=await page.evaluate(async({shot,density})=>{
      const image=new Image();image.src='data:image/png;base64,'+shot;await image.decode();
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
      const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);
      const pixels=ctx.getImageData(0,Math.floor(c.height/2),c.width,1).data;
      let difference=0,min=255,max=0;
      for(let x=50*density;x<90*density;x++){
        for(let channel=0;channel<3;channel++)difference+=Math.abs(pixels[x*4+channel]-pixels[(x+120*density)*4+channel]);
        min=Math.min(min,pixels[x*4]);max=Math.max(max,pixels[x*4]);
      }
      return {difference:difference/(40*density*3),contrast:max-min};
    },{shot,density});
    expect(rendered.difference).toBeLessThan(1);
    expect(rendered.contrast).toBeGreaterThan(10);
    await page.goto('/#/game/neon-coil');
    await expect(page.locator('#game-menu')).toHaveClass(/is-refracting/);
    const gameBlur=await page.locator('#game-menu .ui-glass-lens').evaluate(e=>getComputedStyle(e).backdropFilter.match(/blur\([^)]+\)/)![0]);
    // Navigation frost (section-navigation.css) and the game --glass-clear-blur.
    expect(homeBlur).toBe('blur(12px)');
    expect(gameBlur).toBe('blur(1.5px)');
  });
});

// Read the actual rendered background under the glyph boxes with the glyphs
// hidden. Record the limitations of white cores on translucent glass.
for(const id of ['fruit-merge','solitaire','block-fill','fivefold','globle','snake','neon-coil','quadfall','maze-muncher','ball-run','blockcraft']){
  test(`${id} dock glyphs stay white over their rendered surface`,async({page,browserName})=>{
    await page.setViewportSize({width:390,height:844});await page.goto(`/#/game/${id}`);
    // The shell is intentionally absent behind game-owned modal menus.
    if(id==='blockcraft')await page.getByRole('button',{name:'Play',exact:true}).click();
    const dock=page.locator('.game-dock');
    await expect(dock.locator('.game-hud strong,.game-compact-hud').filter({visible:true}).first()).toBeVisible();
    await expect(dock.locator(`.game-glass[data-glass=${browserName==='chromium'&&!forcedFallback?'backdrop':'frost'}]`)).toHaveCount(3);
    if(id==='ball-run'){
      await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));
      await page.locator('.br-play').click();await page.clock.runFor(600);
    }
    if(id==='blockcraft'){
      // A cave or night sky may be entirely dark. The light regular variant must
      // still support its white glyphs on that darkest background.
      await page.addStyleTag({content:'.blockcraft canvas{opacity:0!important}.blockcraft{background:#000!important}'});
    }
    await settleGlassInk(dock);
    const boxes=await dock.evaluate(el=>{
      const d=el.getBoundingClientRect();
      return [...el.querySelectorAll('.game-hud small,.game-hud strong,.game-compact-hud,.ui-tab > svg,.ui-tab > span:not(.ui-glass-lens,.ui-glass-glow)')].map(e=>{
        const r=e.getBoundingClientRect();
        return {x:r.x-d.x,y:r.y-d.y,w:r.width,h:r.height,color:getComputedStyle(e).color,icon:e instanceof SVGElement};
      }).filter(r=>r.w>0&&r.h>0);
    });
    const hideInk=await page.addStyleTag({content:`.game-hud small,.game-hud strong,.game-compact-hud{color:${HIDDEN_INK}!important}.game-dock>.ui-tab>svg,.game-dock>.ui-tab>span:not(.ui-glass-lens,.ui-glass-glow){visibility:hidden!important}`});
    const shot=(await dock.screenshot({animations:'disabled'})).toString('base64');
    // Keep the real text shadow in the background shot. An opaque ink mask
    // restricts contrast to actual glyph cores, rather than spaces in their boxes.
    await hideInk.evaluate(e=>e.parentNode?.removeChild(e));
    await page.addStyleTag({content:'.game-view{background:#000!important}.game-surface,.stage-wrap{visibility:hidden!important}.game-glass{background:transparent!important;backdrop-filter:none!important;border-color:transparent!important}.game-glass::before,.game-glass>.ui-glass-lens,.game-glass>.ui-glass-glow{visibility:hidden!important}.game-hud small,.game-hud strong,.game-compact-hud,.game-dock>.ui-tab{color:#fff!important;text-shadow:none!important}.game-dock>.ui-tab>svg{filter:none!important}'});
    const mask=(await dock.screenshot({animations:'disabled'})).toString('base64');
    const ratios=await glyphContrast(page,shot,mask,boxes,(await dock.boundingBox())!);
    // HUD labels, numbers and icons all retain fixed-white ink.
    const text=ratios.filter((_,i)=>!boxes[i].icon);
    expect(text.length).toBeGreaterThan(0);
    expect(text.every(ratio=>Number.isFinite(ratio)&&ratio>=1)).toBe(true);
    await test.info().attach('fixed-white-hud-core-contrast',{body:JSON.stringify({text,limitation:'Fixed-white cores cannot guarantee 4.5:1 over every backdrop.'}),contentType:'application/json'});
    for(const box of boxes)expect(box.color).toBe('rgb(255, 255, 255)');
  });
}
