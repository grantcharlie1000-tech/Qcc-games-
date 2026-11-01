import {test,expect} from '../fixtures';
import {glyphContrast} from '../glass-contrast';
import type {Page} from '@playwright/test';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
test.beforeEach(async({page})=>{await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));});

async function navigationContrast(page:Page,scope:string){
  const nav=page.locator(scope);
  await nav.screenshot({animations:'disabled',scale:'device'});
  const boxes=await nav.evaluate(n=>{
    const b=n.getBoundingClientRect();
    return [...n.querySelectorAll('.ui-tab>svg,.ui-tab>span:not(.ui-glass-lens,.ui-glass-glow)')].map(e=>{
      const r=e.getBoundingClientRect();return {x:(r.x-b.x),y:(r.y-b.y),w:r.width,h:r.height,color:getComputedStyle(e).color};
    }).filter(r=>r.w>0&&r.h>0);
  });
  const hide=await page.addStyleTag({content:`${scope} .ui-tab,${scope} .ui-tab>svg,${scope} .ui-tab>span{color:transparent!important}`});
  const shot=(await nav.screenshot({animations:'disabled',scale:'device'})).toString('base64');
  await hide.evaluate(e=>(e as Element).remove());
  const maskStyle=await page.addStyleTag({content:`html,body{background:#000!important}#content{visibility:hidden}${scope}{visibility:visible!important}.arcade-glass{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.arcade-glass::before,.arcade-glass::after,.ui-glass-lens,.ui-glass-glow{visibility:hidden!important}${scope} .ui-tab,${scope} .ui-tab>svg,${scope} .ui-tab>span{color:#fff!important;background:none!important;box-shadow:none!important;text-shadow:none!important;filter:none!important}`});
  const mask=(await nav.screenshot({animations:'disabled',scale:'device'})).toString('base64');
  await maskStyle.evaluate(e=>(e as Element).remove());
  return glyphContrast(page,shot,mask,boxes,(await nav.boundingBox())!);
}

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

// These bounds come from paired blank patches of Apple's official light/dark
// Music tab-bar images. The fit is a model, not a claim about Apple's shader:
// O = (1-alpha)B + alpha*T gives alpha .133-.157 for RGB-neutral T.
// Catch both a heavy veil and a filter that hides the backdrop despite low alpha.
for(const fallback of [false,true])test(`clear glass retains the backdrop instead of whitening it (${fallback?'fallback':'native'})`,async({page,browserName})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto(`/${fallback?'?glass=fallback':''}#/collection`);
  const bar=page.locator('.app-tabbar');
  await expect(bar).toBeVisible();
  const veil=await bar.evaluate(e=>getComputedStyle(e,'::before').backgroundColor.match(/[\d.]+/g)!.map(Number));
  expect(veil[3]??1).toBeGreaterThanOrEqual(.1);
  expect(veil[3]??1).toBeLessThanOrEqual(.18);
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
    await reference.setContent('<body style="margin:0;background:linear-gradient(90deg,#102030 50%,#f5ddb0 50%)"><div style="position:fixed;top:100px;left:0;width:390px;height:64px;background:rgba(184,184,184,.14);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px)"></div></body>');
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
  expect(patches.spread).toBeLessThanOrEqual(15);
});

test('navigation, companion and game controls share the same clear optical recipe',async({page})=>{
  let reference:unknown;
  for(const route of ['collection','movies/browse/movie','movies/browse/tv','movies/list','game/fruit-merge','game/snake','game/blockcraft']){
    await page.goto(`/#/${route}`);
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

for(const fallback of [false,true])for(const route of ['collection','movies/browse/movie'])test(`${route}: adaptive glyphs retain 4.5:1 on light, dark and mixed content (${fallback?'fallback':'native'})`,async({page})=>{
  await page.goto(`/${fallback?'?glass=fallback':''}#/${route}`);
  const scope=route==='collection'?'.app-navigation':'.movies-navigation';
  const nav=page.locator(scope);await expect(nav).toBeVisible();
  await page.addStyleTag({content:`#content,.movies-top,.movies-main,.movies-footer{visibility:hidden}body{background:#fff!important}.movies-view{background:transparent!important}.section-navigation{visibility:visible!important}`});
  for(const background of ['#fff','#000','repeating-linear-gradient(90deg,#faf0d0 0 18px,#102030 18px 36px)']){
    const backdrop=await page.addStyleTag({content:`html,body{background:${background}!important}`});
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await nav.screenshot({animations:'disabled',scale:'device'});
    const boxes=await nav.evaluate(n=>{
      const b=n.getBoundingClientRect();
      return [...n.querySelectorAll('.ui-tab>svg,.ui-tab>span:not(.ui-glass-lens,.ui-glass-glow)')].map(e=>{
        const r=e.getBoundingClientRect();return {x:(r.x-b.x),y:(r.y-b.y),w:r.width,h:r.height,color:getComputedStyle(e).color};
      }).filter(r=>r.w>0&&r.h>0);
    });
    const hide=await page.addStyleTag({content:`${scope} .ui-tab,${scope} .ui-tab>svg,${scope} .ui-tab>span{color:transparent!important}`});
    const shot=(await nav.screenshot({animations:'disabled',scale:'device'})).toString('base64');
    await hide.evaluate(e=>(e as Element).remove());
    const maskStyle=await page.addStyleTag({content:`html,body{background:#000!important}.arcade-glass{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important}.arcade-glass::before,.arcade-glass::after,.ui-glass-lens,.ui-glass-glow{visibility:hidden!important}${scope} .ui-tab,${scope} .ui-tab>svg,${scope} .ui-tab>span{color:#fff!important;background:none!important;box-shadow:none!important;text-shadow:none!important;filter:none!important}`});
    const mask=(await nav.screenshot({animations:'disabled',scale:'device'})).toString('base64');
    await maskStyle.evaluate(e=>(e as Element).remove());
    const ratios=await glyphContrast(page,shot,mask,boxes,(await nav.boundingBox())!);
    expect(ratios.length).toBeGreaterThanOrEqual(11);
    expect(Math.min(...ratios),`${background}: ${ratios.map(r=>r.toFixed(2))}`).toBeGreaterThanOrEqual(4.5);
    await backdrop.evaluate(e=>(e as Element).remove());
  }
});
