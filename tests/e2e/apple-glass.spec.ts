import {test,expect} from '../fixtures';

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
    const drop=(await page.locator('.fm-drop').boundingBox())!;
    expect(drop.y+drop.height).toBeLessThanOrEqual(boxes[0].y-8);
    await expect(page.locator('.game-view')).toHaveAttribute('data-glass-tone','light');
    for(const object of await objects.all())await expect(object).toHaveAttribute('data-glass',browserName==='chromium'?'backdrop':'frost');
    await expect(dock).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  });
}

for(const width of [390,1366]){
  test(`decorative lenses preserve single-value text size at ${width}px`,async({page})=>{
    await page.setViewportSize({width,height:844});
    await page.goto('/#/game/neon-coil');
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
    await expect(page.locator('#game-menu svg')).toHaveCSS('filter','none');
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
  await expect(button.locator('.ui-glass-lens')).toHaveCSS('backdrop-filter',/blur\(1.5px\)/);
  await page.mouse.move(1,1);await page.mouse.up();
  await expect(button).not.toHaveAttribute('data-pressing');
  await page.emulateMedia({reducedMotion:'reduce'});
  await button.hover();await page.mouse.down();
  await expect(button).toHaveCSS('scale','none');
  await page.mouse.move(1,1);await page.mouse.up();
});

test('light desktop controls keep dark hover ink and an opaque accessible surface',async({page})=>{
  await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/fruit-merge');
  const menu=page.locator('#game-menu');await menu.hover();
  await expect(menu).toHaveCSS('color','rgb(11, 16, 21)');
  await expect(menu).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  await page.emulateMedia({contrast:'more'});
  await expect(menu).toHaveAttribute('data-glass','off');
  await expect(menu).toHaveCSS('background-color','rgb(241, 243, 245)');
  await expect(menu).toHaveCSS('color','rgb(11, 16, 21)');
});

for(const density of [1,2])test.describe(`uniform arcade optics at DSF ${density}`,()=>{
  test.use({deviceScaleFactor:density});
  test('the home lens treats both halves equally and shares the dock clarity',async({page,browserName})=>{
    test.skip(browserName!=='chromium','SVG backdrop coverage is a Chromium feature');
    await page.setViewportSize({width:390,height:844});await page.goto('/');
    const home=page.locator('.app-tabbar');await expect(home).toHaveClass(/is-refracting/);
    const homeBlur=await home.locator('.ui-glass-lens').evaluate(e=>getComputedStyle(e).backdropFilter.match(/blur\([^)]+\)/)![0]);
    await page.addStyleTag({content:'#content{visibility:hidden}body{background:repeating-linear-gradient(90deg,#172b38 0 10px,#dfc9a6 10px 20px)!important}.app-tabbar::after{display:none}.app-tabbar .ui-tab{visibility:hidden}'});
    const shot=(await home.screenshot({animations:'disabled'})).toString('base64');
    const rendered=await page.evaluate(async({shot,density})=>{
      const image=new Image();image.src='data:image/png;base64,'+shot;await image.decode();
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
      const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);
      const pixels=ctx.getImageData(0,Math.floor(c.height/2),c.width,1).data;
      let difference=0,min=255,max=0;
      for(let x=60*density;x<100*density;x++){
        for(let channel=0;channel<3;channel++)difference+=Math.abs(pixels[x*4+channel]-pixels[(x+200*density)*4+channel]);
        min=Math.min(min,pixels[x*4]);max=Math.max(max,pixels[x*4]);
      }
      return {difference:difference/(40*density*3),contrast:max-min};
    },{shot,density});
    expect(rendered.difference).toBeLessThan(1);
    expect(rendered.contrast).toBeGreaterThan(80);
    await page.goto('/#/game/neon-coil');
    await expect(page.locator('#game-menu')).toHaveClass(/is-refracting/);
    const gameBlur=await page.locator('#game-menu .ui-glass-lens').evaluate(e=>getComputedStyle(e).backdropFilter.match(/blur\([^)]+\)/)![0]);
    expect(gameBlur).toBe(homeBlur);
  });
});

// Read the actual rendered background under the glyph boxes with the glyphs
// hidden. This catches an adaptive tone that looks clear but loses its labels.
for(const id of ['fruit-merge','solitaire','block-fill','fivefold','globle','snake','neon-coil','quadfall','maze-muncher','ball-run','blockcraft']){
  test(`${id} dock glyphs retain 4.5:1 contrast over their rendered surface`,async({page,browserName})=>{
    await page.setViewportSize({width:390,height:844});await page.goto(`/#/game/${id}`);
    const dock=page.locator('.game-dock');
    await expect(dock.locator('.game-hud strong').first()).toBeVisible();
    await expect(dock.locator(`.game-glass[data-glass=${browserName==='chromium'?'backdrop':'frost'}]`)).toHaveCount(3);
    if(id==='ball-run'){
      await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));
      await page.locator('.br-play').click();await page.clock.runFor(600);
    }
    if(id==='blockcraft'){
      // A cave or night sky may be entirely dark. The light regular variant must
      // still support its dark glyphs on that darkest background.
      await page.addStyleTag({content:'.blockcraft canvas{visibility:hidden!important}.blockcraft{background:#000!important}'});
    }
    const boxes=await dock.evaluate(el=>{
      const d=el.getBoundingClientRect();
      return [...el.querySelectorAll('.game-hud small,.game-hud strong,.ui-tab > svg,.ui-tab > span:not(.ui-glass-lens,.ui-glass-glow)')].map(e=>{
        const r=e.getBoundingClientRect();
        return {x:r.x-d.x,y:r.y-d.y,w:r.width,h:r.height,color:getComputedStyle(e).color};
      }).filter(r=>r.w>0&&r.h>0);
    });
    await page.addStyleTag({content:'.game-hud-item,.game-dock>.ui-tab>svg,.game-dock>.ui-tab>span:not(.ui-glass-lens,.ui-glass-glow){visibility:hidden!important}'});
    const shot=(await dock.screenshot({animations:'disabled'})).toString('base64');
    const ratios=await page.evaluate(async({shot,boxes})=>{
      const image=new Image();image.src='data:image/png;base64,'+shot;await image.decode();
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
      const context=c.getContext('2d')!;context.drawImage(image,0,0);
      const data=context.getImageData(0,0,c.width,c.height).data;
      const lum=(rgb:number[])=>rgb.reduce((l,v,i)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
      return boxes.map(b=>{
        const ink=lum(b.color.match(/[\d.]+/g)!.slice(0,3).map(Number));let worst=Infinity;
        for(let y=Math.max(0,Math.ceil(b.y));y<Math.min(c.height,Math.floor(b.y+b.h));y++)for(let x=Math.max(0,Math.ceil(b.x));x<Math.min(c.width,Math.floor(b.x+b.w));x++){
          const i=(y*c.width+x)*4,bg=lum([data[i],data[i+1],data[i+2]]);
          worst=Math.min(worst,(Math.max(ink,bg)+.05)/(Math.min(ink,bg)+.05));
        }
        return worst;
      });
    },{shot,boxes});
    expect(Math.min(...ratios),`${id}: ${ratios.map(r=>r.toFixed(2)).join(', ')}`).toBeGreaterThanOrEqual(4.5);
  });
}
