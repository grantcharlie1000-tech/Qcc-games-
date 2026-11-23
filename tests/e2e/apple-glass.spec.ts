import {test,expect,originalTheme} from '../fixtures';

const forcedFallback=process.env.ARCADE_GLASS_FALLBACK==='1';
test.beforeEach(async({page})=>{
  if(forcedFallback)await page.addInitScript(()=>{
    const url=new URL(location.href);url.searchParams.set('glass','fallback');history.replaceState(null,'',url);
  });
});

// MOTION-15 (#24): was "every tab glyph rgb(255, 255, 255) while pressed". LOOK-3's 133d37f2 gave the light bar Apple's ink
// from its light still (labels #333336, glyphs #6e6e73, the selection #ff375f; the tab under the raised bubble takes that
// accent a sixth of the way to white, MOTION-7), the light look Charlie approved, so white can never be met in Playwright's
// default light scheme (the test failed at b0847649 too). Its intent is kept: while a home lens is pressed over a card-row
// gap, every glyph holds one fixed ink of that set for its role, with no halo or stroke, and reads against the glass behind
// it (the glyphs hidden, the median over each glyph's box): the grey labels at the 4.5:1 of clear-glass and
// clear-ink-adaptation, and the pressed control's own glyphs a plainly different colour from the glass under them (CIE76
// delta E). The pressed tab's accent is lighter and translucent by design (MOTION-7, from the video), so it reads by its hue:
// about 1.5-2.3:1 by luminance alone at 6cecf6a3 (logged, not pinned).
const PRESSED_INK={label:[[51,51,54]],icon:[[110,110,115]],selected:[[255,55,95],[51,51,54]],target:[[255,87,121]]} as const;
const PRESSED_FLOOR={label:4.5,pressedDeltaE:20} as const;
for(const scroll of [150,170])test(`pressed home lenses keep their fixed light ink, legible against the glass, over a card-row gap at ${scroll}px`,async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const nav=page.locator('.app-navigation'),bar=page.locator('.app-tabbar');
  await page.evaluate(y=>scrollTo(0,y),scroll);await expect(bar).toHaveAttribute('data-minimized','true');
  await page.locator('.ui-tabbar-mini').click();await expect(bar).not.toHaveAttribute('data-minimized');
  const glyphs=nav.locator('.ui-tab > .ui-icon,.ui-tab > span:not(.ui-glass-lens,.ui-glass-glow)');
  // Each visible glyph's role, painted ink (0-255, colour-mix results included), opacity, halo, stroke and box.
  const read=()=>glyphs.evaluateAll(elements=>elements.flatMap(e=>{
    const box=e.getBoundingClientRect(),style=getComputedStyle(e),tab=e.closest('.ui-tab')!;
    if(!box.width||!box.height||style.visibility==='hidden')return [];
    const parts=style.color.match(/[\d.]+/g)!.map(Number),srgb=style.color.startsWith('color(srgb');
    return [{role:tab.hasAttribute('data-lens-target')?'target':tab.matches('[aria-current=page],[aria-pressed=true]')?'selected':e.matches('span')?'label':'icon',
      control:tab.getAttribute('aria-label')||tab.querySelector(':scope>span')?.textContent?.trim(),text:e.matches('span'),ink:parts.slice(0,3).map(v=>srgb?v*255:v),opacity:Number(style.opacity),halo:e.hasAttribute('data-glass-halo'),
      stroke:style.webkitTextStrokeWidth||'0px',box:[box.x,box.y,box.width,box.height]}];
  }));
  const allowed=(g:Awaited<ReturnType<typeof read>>[number])=>(PRESSED_INK[g.role as keyof typeof PRESSED_INK] as readonly (readonly number[])[])
    .some(ink=>ink.every((v,i)=>Math.abs(v-g.ink[i])<=1))&&!g.halo&&g.stroke==='0px';
  for(const name of ['Study','Open menu']){
    const button=nav.getByRole('button',{name,exact:true});await button.hover();await page.mouse.down();
    expect(await glyphs.count()).toBeGreaterThan(0);
    // The inks ease (200 ms): poll until every glyph holds its role's ink, then read twice more to see it held. The held
    // reads compare the ink only: the pressed bar is still settling on its spring, so the boxes drift by hundredths of a px.
    await expect.poll(async()=>{const found=await read();return found.length>0&&found.every(allowed)?'':JSON.stringify(found);}).toBe('');
    const inks=(list:Awaited<ReturnType<typeof read>>)=>JSON.stringify(list.map(({box:_box,...ink})=>ink));
    const found=await read();
    for(let i=0;i<2;i++){await page.waitForTimeout(120);expect(inks(await read()),`${name}: one fixed ink while pressed`).toBe(inks(found));}
    // The glass behind each glyph, the glyphs hidden: the median contrast of the glyph as painted (its opacity over each pixel).
    const hide=await page.addStyleTag({content:'.app-navigation .ui-tab>:is(.ui-icon,span:not(.ui-glass-lens,.ui-glass-glow)){visibility:hidden!important}'});
    const png=(await page.screenshot({scale:'css'})).toString('base64');
    await hide.evaluate(e=>(e as Element).remove());
    const ratios=await page.evaluate(async({png,found})=>{
      const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
      const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
      const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);
      const linear=(v:number)=>{const s=v/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;};
      const lum=(rgb:number[])=>rgb.reduce((l,v,i)=>l+linear(v)*[.2126,.7152,.0722][i],0);
      // sRGB to CIELAB (D65).
      const lab=(rgb:number[])=>{
        const [r,g,b]=rgb.map(linear),f=(t:number)=>t>216/24389?Math.cbrt(t):(24389/27*t+16)/116;
        const x=f((.4124*r+.3576*g+.1805*b)/.95047),y=f(.2126*r+.7152*g+.0722*b),z=f((.0193*r+.1192*g+.9505*b)/1.08883);
        return [116*y-16,500*(x-y),200*(y-z)];
      };
      const median=(values:number[])=>{values.sort((a,b)=>a-b);return Math.round(100*values[values.length>>1])/100;};
      return found.map(g=>{
        const [x,y,w,h]=g.box,data=ctx.getImageData(Math.round(x),Math.round(y),Math.max(1,Math.round(w)),Math.max(1,Math.round(h))).data,ratios:number[]=[],deltas:number[]=[];
        for(let i=0;i<data.length;i+=4){
          const bg=[data[i],data[i+1],data[i+2]],painted=g.ink.map((v,k)=>g.opacity*v+(1-g.opacity)*bg[k]),ink=lum(painted),under=lum(bg);
          ratios.push((Math.max(ink,under)+.05)/(Math.min(ink,under)+.05));
          const a=lab(painted),b=lab(bg);deltas.push(Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]));
        }
        return {role:g.role,control:g.control,text:g.text,ratio:median(ratios),deltaE:median(deltas)};
      });
    },{png,found});
    console.log(`pressed ${name} at ${scroll}px: ${JSON.stringify(ratios)}`);
    expect(ratios.some(r=>r.control===name),`${name}: the pressed control's glyphs are read`).toBe(true);
    for(const r of ratios){
      if(r.role==='label')expect(r.ratio,`${name}: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(PRESSED_FLOOR.label);
      if(r.control===name)expect(r.deltaE,`${name}: ${JSON.stringify(r)}`).toBeGreaterThanOrEqual(PRESSED_FLOOR.pressedDeltaE);
    }
    await page.mouse.move(0,0);await page.mouse.up();
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
    await page.keyboard.press('Tab');
    const santa=page.locator('.santa-banner');
    if(await santa.isVisible()){
      await expect(santa).toBeFocused();
      await page.keyboard.press('Tab');
    }
    await expect(page.locator('.game-card').first()).toBeFocused();
  });
}

test('home keyboard navigation reaches games when the seasonal banner is absent',async({page,context})=>{
  await originalTheme(context);
  await page.goto('/');
  await expect(page.locator('.santa-banner')).toHaveCount(0);
  await page.getByRole('button',{name:'Open menu',exact:true}).focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('.game-card').first()).toBeFocused();
});

test('the companion Menu hides and restores with the home island and keyboard focus',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/');
  const bar=page.locator('.app-tabbar'),menu=page.getByRole('button',{name:'Open menu',exact:true});
  await page.evaluate(()=>scrollTo(0,400));await expect(bar).toHaveAttribute('data-minimized','true');
  // MOTION-7: was 'none'. Apple Music's compact bar keeps its search circle live beside the selected tab's circle
  // (Charlie's video, 34.25 s), so the minimised bar's menu circle stays a live 48 px control (2a6791de); only the
  // full hide below takes it away.
  await expect(menu).toHaveCSS('pointer-events','auto');
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
  // MOTION-7: was 'none'. The compact menu circle stays live, as the video's search circle (34.25 s).
  await expect(menu).toHaveCSS('pointer-events','auto');
  await page.keyboard.press('Tab');await menu.focus();
  await expect(menu).toHaveCSS('pointer-events','auto');await expect(bar).toHaveCSS('opacity','1');
  await bar.evaluate(e=>e.setAttribute('data-hidden','true'));await expect(bar).toHaveCSS('opacity','1');
  await menu.hover();await page.mouse.down();await expect(menu).toHaveCSS('scale','none');
  await page.mouse.move(0,0);await page.mouse.up();
});

// Original Suika art is light; its Christmas night sky intentionally uses dark glass.
for(const [theme,tone] of [['original','light'],['christmas','dark']] as const)for(const width of [390,1366]){
  test(`three independent glass objects float over the ${theme} Suika surface at ${width}px`,async({page,context,browserName})=>{
    if(theme==='original')await originalTheme(context);
    await page.setViewportSize({width,height:width===390?844:768});
    await page.goto('/#/game/fruit-merge');
    await expect(page.locator('html')).toHaveAttribute('data-festive',theme==='original'?'off':'christmas');
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
    await expect(page.locator('.game-view')).toHaveAttribute('data-glass-tone',tone);
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

test('original surface tone follows the game and glyphs have no heavy halo',async({page,context})=>{
  await originalTheme(context);
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

for(const [theme,tone,fill,ink] of [
  ['original','light','rgb(241, 243, 245)','rgb(11, 16, 21)'],
  ['christmas','dark','rgb(32, 38, 43)','rgb(255, 255, 255)'],
] as const)test(`${theme} Suika desktop controls keep white hover ink and an opaque accessible surface`,async({page,context})=>{
  if(theme==='original')await originalTheme(context);
  await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/fruit-merge');
  await expect(page.locator('html')).toHaveAttribute('data-festive',theme==='original'?'off':'christmas');
  await expect(page.locator('.game-view')).toHaveAttribute('data-glass-tone',tone);
  const menu=page.locator('#game-menu');await menu.hover();
  await expect(menu).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(menu.locator('svg')).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(page.locator('.game-hud strong')).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(menu).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await page.emulateMedia({contrast:'more'});
  const objects=page.locator('.game-dock > .arcade-glass');await expect(objects).toHaveCount(3);
  for(const object of await objects.all()){
    await expect(object).toHaveAttribute('data-glass','off');
    await expect(object).toHaveCSS('background-color',fill);
    await expect(object).toHaveCSS('color',ink);
  }
  await expect(menu.locator('svg')).toHaveCSS('color',ink);
  await expect(page.locator('.game-hud strong')).toHaveCSS('color',ink);
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

// Check the supported fixed-white palette across each game-owned dock.
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
    const glyphs=dock.locator('.game-hud small,.game-hud strong,.game-compact-hud,.ui-tab > svg,.ui-tab > span:not(.ui-glass-lens,.ui-glass-glow)').filter({visible:true});
    expect(await glyphs.count()).toBeGreaterThan(0);
    await expect.poll(()=>glyphs.evaluateAll(elements=>elements.every(e=>getComputedStyle(e).color==='rgb(255, 255, 255)'))).toBe(true);
  });
}
