import {test,expect} from '../fixtures';
import {glyphContrast,glyphContrastSamples,glyphFillMask} from '../glass-contrast';
import type {Page} from '@playwright/test';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
test.beforeEach(async({page})=>{await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));});

async function moviesReady(page:Page,route:string){
  await expect(page.locator('.movies-view')).toBeVisible();
  await expect(page.locator('.movies-page-head h1')).toHaveText(route.endsWith('/tv')?'TV Shows':route.endsWith('/list')?'My list':'Movies');
}

async function navigationContrast(page:Page,scope:string,glyphs='.ui-tab>svg,.ui-tab>span:not(.ui-glass-lens,.ui-glass-glow)',mixed=false){
  const nav=page.locator(scope);
  await nav.screenshot({animations:'disabled',scale:'device'});
  // Resolve the original foreground cores on the real filter/raster path,
  // then remove only that foreground to sample the backdrop underneath it.
  const mask=await glyphFillMask(page,nav,`${scope} :is(${glyphs})`,true);
  const boxes=await nav.evaluate((n,glyphs)=>{
    const b=n.getBoundingClientRect();
    return [...n.querySelectorAll(glyphs)].filter(e=>getComputedStyle(e).clip==='auto').map(e=>{
      const r=e.getBoundingClientRect();return {x:(r.x-b.x),y:(r.y-b.y),w:r.width,h:r.height,color:getComputedStyle(e).color};
    }).filter(r=>r.w>0&&r.h>0);
  },glyphs);
  const hide=await page.addStyleTag({content:`${scope} :is(${glyphs}){color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important}`});
  const shot=(await nav.screenshot({animations:'disabled',scale:'device'})).toString('base64');
  await hide.evaluate(e=>e.parentNode?.removeChild(e));
  const samples=await glyphContrastSamples(page,shot,mask,boxes,(await nav.boundingBox())!);
  const ratios=samples.map(sample=>sample.worst);
  if(mixed){
    // A single plain foreground cannot reach 4.5 at every core when the same
    // glyph crosses light and dark stripes. Measure the best of the two inks
    // instead of reinstating an outline or pretending that limitation passes.
    const bounds=(await nav.boundingBox())!;
    const dark=await glyphContrast(page,shot,mask,boxes.map(box=>({...box,color:'rgb(11, 16, 21)'})),bounds);
    const light=await glyphContrast(page,shot,mask,boxes.map(box=>({...box,color:'rgb(255, 255, 255)'})),bounds);
    const best=ratios.map((_,i)=>Math.max(dark[i],light[i]));
    await test.info().attach('mixed-content-plain-ink-limit',{body:JSON.stringify({ratios,best}),contentType:'application/json'});
    expect(best.some(ratio=>ratio<4.5),'The fixture must actually cross both luminance ranges within a glyph').toBe(true);
    for(let i=0;i<ratios.length;i++){
      if(best[i]>=4.5)expect(ratios[i],`resolvable glyph ${i}: selected ${ratios[i]}, available ${best[i]}`).toBeGreaterThanOrEqual(4.5);
      else expect(ratios[i],`crossed glyph ${i} must still contain visible foreground cores`).toBeGreaterThan(1);
      expect(['rgb(11, 16, 21)','rgb(255, 255, 255)']).toContain(boxes[i].color);
    }
    await expect(nav.locator('.glass-vector-halo')).toHaveCount(0);
    const decoration=await nav.locator(glyphs).evaluateAll(es=>es.map(e=>{const s=getComputedStyle(e);return {stroke:s.webkitTextStrokeWidth,shadow:s.textShadow,filter:s.filter};}));
    for(const glyph of decoration)expect(glyph).toEqual({stroke:'0px',shadow:'none',filter:'none'});
  }
  if(samples.some(sample=>sample.diagonalCount))await test.info().attach('diagonal-contour-samples',{body:JSON.stringify({boxes,samples}),contentType:'application/json'});
  if(!mixed&&ratios.some(ratio=>ratio<4.5)){
    await test.info().attach('sampled-backdrop',{body:Buffer.from(shot,'base64'),contentType:'image/png'});
    await test.info().attach('foreground-mask',{body:Buffer.from(mask,'base64'),contentType:'image/png'});
    await test.info().attach('glyph-boxes',{body:JSON.stringify({boxes,ratios,glyphs:await nav.locator(glyphs).evaluateAll(es=>es.map(e=>({html:e.outerHTML,stroke:getComputedStyle(e).webkitTextStroke,shadow:getComputedStyle(e).textShadow})))}),contentType:'application/json'});
  }
  return ratios;
}

test('plain label cores retain 4.5:1 beside real mixed game art',async({page})=>{
  await page.goto('/#/collection');
  await page.locator('.app-tabbar .ui-tab').first().focus();
  await page.evaluate(()=>scrollTo(0,180));
  await page.waitForTimeout(200);
  const ratios=await navigationContrast(page,'.app-navigation','.ui-tab>span:not(.ui-glass-lens,.ui-glass-glow)');
  await test.info().attach('plain-label-core-contrast',{body:JSON.stringify(ratios),contentType:'application/json'});
  expect(ratios).toHaveLength(5);
  expect(Math.min(...ratios),JSON.stringify(ratios)).toBeGreaterThanOrEqual(4.5);
});

async function headerContrast(page:Page,width:number){
  // Five backdrops, each with a white/black foreground mask and restored shot.
  // Software-renderer capture time is separate from the measured frame timing.
  test.setTimeout(90000);
  await page.setViewportSize({width,height:844});await page.goto('/#/movies/browse/movie');
  await expect(page.locator('.movies-rails-status,.movies-catalog-status').first()).toBeVisible();
  const header=page.locator('.movies-top');await expect(header).toBeVisible();
  await expect(header.locator('.glass-label').first()).toBeVisible();
  const veils=await header.locator('.floating-glass-group').evaluateAll(es=>es.map(e=>getComputedStyle(e,'::before').backgroundColor));
  expect(veils).toEqual(Array(3).fill('rgba(184, 184, 184, 0.02)'));
  await page.addStyleTag({content:'.movies-view{background:transparent!important}.movies-view>*{visibility:hidden}'});
  for(const background of ['#fff','#000','#909090','repeating-linear-gradient(90deg,#faf0d0 0 18px,#102030 18px 36px)','canvas']){
    const style=await page.addStyleTag({content:`html,body{background:${background==='canvas'?'#000':background}!important}`});
    if(background==='canvas')await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.id='unknown-header-art';canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:1';
      canvas.getContext('2d')!.fillRect(0,0,canvas.width,canvas.height);document.body.append(canvas);
    });
    await page.evaluate(()=>dispatchEvent(new Event('resize')));await page.waitForTimeout(100);
    const mixed=background.startsWith('repeating-');
    const ratios=await navigationContrast(page,'.movies-top','svg:not(.ui-brand-tile svg),.glass-label,.ui-label,kbd,.ui-wordmark>span',mixed);
    expect(ratios.length).toBeGreaterThan(3);
    if(!mixed)expect(Math.min(...ratios),`${background}: ${ratios.map(r=>r.toFixed(2))}`).toBeGreaterThanOrEqual(4.5);
    await style.evaluate(e=>(e as Element).remove());
    await page.evaluate(()=>document.getElementById('unknown-header-art')?.remove());
  }
  await page.keyboard.press('Tab');await header.locator('.movies-search-toggle').focus();
  const focus=await header.locator('.movies-search-toggle').evaluate(e=>({outline:getComputedStyle(e).outlineColor,shadow:getComputedStyle(e).boxShadow}));
  expect(focus.outline).toBe('rgb(255, 255, 255)');expect(focus.shadow).toContain('rgb(0, 0, 0)');
}
for(const width of [390,1366])test(`floating Movies header keeps the clear recipe and glyph contrast at ${width}px`,async({page})=>headerContrast(page,width));
test.describe('desktop header at DPR1',()=>{
  test.use({deviceScaleFactor:1,isMobile:false,hasTouch:false});
  for(const width of [1024,1366])test(`visible header glyphs retain 4.5:1 at ${width}px`,async({page})=>headerContrast(page,width));
});

for(const fallback of [false,true])test(`adaptive ink stays legible while real game artwork scrolls behind it (${fallback?'fallback':'native'})`,async({page})=>{
  test.setTimeout(60000);
  await page.goto(`/${fallback?'?glass=fallback':''}#/collection`);
  const first=page.locator('.app-tabbar .ui-tab').first();
  await first.focus(); // Keep the expanded dock visible during each sample.
  for(const y of [0,70,140,210,350,560]){
    await page.evaluate(y=>scrollTo(0,y),y);
    await page.waitForTimeout(180);
    const ratios=await navigationContrast(page,'.app-navigation');
    expect(ratios.length).toBeGreaterThanOrEqual(11);
    expect(Math.min(...ratios),`scroll ${y}: ${ratios.map(r=>r.toFixed(2))}`).toBeGreaterThanOrEqual(4.5);
  }
});

test('clear glass keyboard focus has both light and dark edges',async({page})=>{
  await page.goto('/#/collection');
  await page.addStyleTag({content:'#content{visibility:hidden}body{background:#000!important}'});
  await page.keyboard.press('Tab');
  await page.locator('.app-tabbar .ui-tab').first().focus();
  const focus=await page.locator('.app-tabbar .ui-tab').first().evaluate(e=>{
    const s=getComputedStyle(e);return {outline:s.outlineColor,shadow:s.boxShadow};
  });
  expect(focus.outline).toBe('rgb(255, 255, 255)');
  expect(focus.shadow).toContain('rgb(0, 0, 0)');
});

test('plain captions adapt to dark canvas media without a glyph halo',async({page})=>{
  await page.goto('/#/movies/browse/movie');
  await moviesReady(page,'movies/browse/movie');
  await page.addStyleTag({content:'#content,.movies-top,.movies-main,.movies-footer{visibility:hidden}.movies-view{background:transparent!important}.section-navigation{visibility:visible!important}'});
  // The canvas is external to the game sampler; geometric media sampling
  // still resolves the uniform dark underlay without decorating the glyphs.
  await page.evaluate(()=>{
    const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:1';
    canvas.getContext('2d')!.fillRect(0,0,canvas.width,canvas.height);document.body.append(canvas);
  });
  await expect(page.locator('.movies-mobile-nav .ui-tab').nth(2).locator('span')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  const ratios=await navigationContrast(page,'.movies-navigation');
  expect(Math.min(...ratios),ratios.map(r=>r.toFixed(2)).join(', ')).toBeGreaterThanOrEqual(4.5);
});

test('an unavailable displacement map keeps the transparent CSS fallback',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Only Chromium builds a displacement map');
  await page.addInitScript(()=>{HTMLCanvasElement.prototype.toDataURL=()=>{throw new Error('unavailable canvas export');};});
  await page.goto('/#/collection');
  await expect(page.locator('.app-tabbar')).toHaveAttribute('data-glass','frost');
  await expect(page.locator('.app-tabbar')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
});

test('a touch-focused tab still adapts the visible mini after scrolling',async({page})=>{
  await page.goto('/#/collection');
  await page.locator('.app-tabbar .ui-tab').first().tap();
  await page.evaluate(()=>scrollTo(0,210));
  const bar=page.locator('.app-tabbar'),mini=page.locator('.app-navigation .ui-tabbar-mini');
  await expect(bar).toHaveAttribute('data-minimized','true');
  await expect(mini).toHaveCSS('opacity','1');
  await page.addStyleTag({content:'html,body{background:#000!important}#content{visibility:hidden}'});
  await expect(mini.locator('svg')).toHaveCSS('color','rgb(255, 255, 255)');
});

test('Games and Movies sheet closes use the same clear material and release it on close',async({page,browserName})=>{
  for(const route of ['collection','movies/browse/movie','game/snake']){
    await page.goto(`/#/${route}`);
    if(route.startsWith('movies'))await moviesReady(page,route);
    const trigger=page.locator(route==='collection'?'.app-menu':route.startsWith('movies')?'.movies-menu':'#game-menu');
    await trigger.click();
    const dialog=page.locator(route.startsWith('game')?'#game-options':'#menu');
    const close=dialog.locator('.dialog-head .icon-button');
    await expect(close).toHaveAttribute('data-glass',browserName==='chromium'?'backdrop':'frost');
    const veil=await close.evaluate(e=>getComputedStyle(e,'::before').backgroundColor);
    expect(veil).toBe('rgba(184, 184, 184, 0.02)');
    await expect(close).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
    await close.screenshot({animations:'disabled'});
    const boxes=await close.evaluate(e=>{const b=e.getBoundingClientRect(),svg=e.querySelector('svg')!,r=svg.getBoundingClientRect();return [{x:r.x-b.x,y:r.y-b.y,w:r.width,h:r.height,color:getComputedStyle(svg).color}];});
    const mask=await glyphFillMask(page,close,'.sheet-close-glass>svg',true);
    const hide=await page.addStyleTag({content:'.sheet-close-glass>svg{color:transparent!important}'});
    const shot=(await close.screenshot({animations:'disabled'})).toString('base64');
    await hide.evaluate(e=>e.parentNode?.removeChild(e));
    expect(Math.min(...await glyphContrast(page,shot,mask,boxes,(await close.boundingBox())!))).toBeGreaterThanOrEqual(4.5);
    await close.click();await expect(dialog).not.toBeVisible();
    await expect(close).not.toHaveAttribute('data-glass');
    await expect(close.locator('.glass-ink')).toHaveCount(0);
  }
});

// The clear-variant acceptance supersedes the earlier regular-HIG alpha fit.
// Rendered dark/chroma checks still reject hidden luminance compression.
for(const fallback of [false,true])test(`clear glass retains the backdrop instead of whitening it (${fallback?'fallback':'native'})`,async({page,browserName})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(`/${fallback?'?glass=fallback':''}#/collection`);
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  const veil=await bar.evaluate(e=>getComputedStyle(e,'::before').backgroundColor.match(/[\d.]+/g)!.map(Number));
  expect(veil[3]??1).toBeGreaterThanOrEqual(0);
  expect(veil[3]??1).toBeLessThanOrEqual(.02);
  expect(Math.max(...veil.slice(0,3))-Math.min(...veil.slice(0,3))).toBeLessThanOrEqual(1);
  await page.addStyleTag({content:'#content{visibility:hidden}body{background:linear-gradient(90deg,#102030 50%,#f5ddb0 50%)!important}.app-tabbar .ui-tab{visibility:hidden}.app-tabbar::after{display:none}'});
  const png=(await bar.screenshot({animations:'disabled',scale:'css'})).toString('base64');
  const patches=await page.evaluate(async png=>{
    const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);
    const row=ctx.getImageData(0,30,canvas.width,1).data;
    const low=row[70*4],high=row[250*4];
    const at=(part:number)=>Array.from({length:80},(_,i)=>i+140).find(x=>row[x*4]>=low+(high-low)*part)!;
    return {colors:[70,250].map(x=>[...ctx.getImageData(x,30,1,1).data].slice(0,3)),spread:at(.9)-at(.1)};
  },png);
  // A clear material must leave dark content dark and colourful content colourful.
  expect(Math.max(...patches.colors[0])).toBeLessThan(85);
  expect(patches.colors[1][0]-patches.colors[1][2]).toBeGreaterThan(40);
  // Real diffusion, not merely a computed blur declaration. 10–90% edge
  // spread is about 2.56 sigma for a Gaussian, with pixel rounding tolerance.
  if(browserName==='webkit'&&patches.spread===0){
    // Some Linux WebKit builds omit backdrop diffusion even on plain HTML.
    // Verify that independently; never classify that as working app blur.
    const reference=await page.context().newPage();
    await reference.setContent('<body style="margin:0;background:linear-gradient(90deg,#102030 50%,#f5ddb0 50%)"><div style="position:fixed;top:100px;left:0;width:390px;height:64px;background:rgba(184,184,184,.14);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px)"></div></body>');
    const png=(await reference.locator('div').screenshot({scale:'css'})).toString('base64');
    const hasBlur=await reference.evaluate(async png=>{
      const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
      const c=document.createElement('canvas');c.width=390;c.height=64;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);
      const row=ctx.getImageData(190,30,10,1).data;
      return new Set(Array.from({length:10},(_,i)=>row[i*4])).size>2;
    },png);
    expect(hasBlur,'App and independent CSS reference must have the same diffusion capability').toBe(false);
    test.info().annotations.push({type:'renderer limitation',description:'Linux WebKit omits backdrop blur in both app and independent CSS reference. Physical iOS blur remains unverified.'});
    await reference.close();
  }else expect(patches.spread).toBeGreaterThanOrEqual(6);
  // Three CSS pixels of Gaussian blur give roughly 7.7px of 10–90% spread.
  // This rejects both a missing diffusion layer and the old 0.3px recipe.
  expect(patches.spread).toBeLessThanOrEqual(10);
});

test('navigation, companion and game controls share the same clear optical recipe',async({page})=>{
  let reference:unknown;
  for(const route of ['collection','study','movies/browse/movie','movies/browse/tv','movies/list','game/fruit-merge','game/snake','game/blockcraft']){
    await page.goto(`/#/${route==='study'?'collection':route}`);
    if(route.startsWith('movies'))await moviesReady(page,route);
    if(route==='study'){
      await page.locator('.app-tabbar [data-action=study]').click();
      await expect(page.locator('#study-view')).toBeVisible();
      await expect(page.locator('.section-navigation')).toBeVisible();
    }
    const scope=route.startsWith('game/')?'.game-dock':route.startsWith('movies')?'.movies-navigation':'.app-navigation';
    await expect(page.locator(scope)).toBeVisible();
    const materials=await page.locator(`${scope} .arcade-glass`).evaluateAll(elements=>elements.map(e=>{
      const s=getComputedStyle(e),v=getComputedStyle(e,'::before');
      return {veil:v.backgroundColor,blur:s.getPropertyValue('--glass-frost').trim(),tone:s.getPropertyValue('--glass-tone').trim(),shadow:v.boxShadow,pill:s.getPropertyValue('--glass-pill').trim()};
    }));
    expect(materials.length).toBeGreaterThanOrEqual(2);
    reference??=materials[0];
    for(const material of materials)expect(material,route).toEqual(reference);
  }
});

for(const fallback of [false,true])for(const route of ['collection','movies/browse/movie'])test(`${route}: plain ink keeps 4.5:1 on uniform content and measures its mixed-content limit (${fallback?'fallback':'native'})`,async({page})=>{
  test.setTimeout(90000);
  await page.goto(`/${fallback?'?glass=fallback':''}#/${route}`);
  if(route.startsWith('movies'))await moviesReady(page,route);
  const scope=route==='collection'?'.app-navigation':'.movies-navigation';
  const nav=page.locator(scope);await expect(nav).toBeVisible();
  await page.addStyleTag({content:`#content,.movies-top,.movies-main,.movies-footer{visibility:hidden}body{background:#fff!important}.movies-view{background:transparent!important}.section-navigation{visibility:visible!important}`});
  for(const background of ['#fff','#000','#606060','repeating-linear-gradient(90deg,#faf0d0 0 18px,#102030 18px 36px)']){
    const backdrop=await page.addStyleTag({content:`html,body{background:${background}!important}`});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const mixed=background.startsWith('repeating-');
    const ratios=await navigationContrast(page,scope,undefined,mixed);
    expect(ratios.length).toBeGreaterThanOrEqual(11);
    if(!mixed)expect(Math.min(...ratios),`${background}: ${ratios.map(r=>r.toFixed(2))}`).toBeGreaterThanOrEqual(4.5);
    await backdrop.evaluate(e=>(e as Element).remove());
  }
});
