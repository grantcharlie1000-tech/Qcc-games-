import {test,expect,originalTheme} from '../fixtures';
import {gameAction,openGameMenu} from '../game-menu';
import {glyphContrast,glyphFillMask,settleGlassInk} from '../glass-contrast';
import type {Page} from '@playwright/test';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});

// #92 separates frosted navigation/sheets from the unchanged clear HUD fill.
const CLEAR_FILL='rgba(8, 12, 18, 0.2)',FILL_RGB=[8,12,18],FILL_ALPHA=.2;
const NAV_FILL='rgba(8, 12, 18, 0.36)',FROST_FILL='rgba(12, 16, 22, 0.58)',ARCADE_SHEET_FILL='rgba(12, 16, 22, 0.9)';
test('navigation, clear controls and frosted sheets retain their intended fills over the live backdrop',async({page})=>{
  await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  for(const route of ['collection','study','movies/browse/movie','game/snake']){
    await page.goto(`/#/${route==='study'?'collection':route}`);
    if(route.startsWith('movies')){
      await expect(page.locator('.movies-view')).toBeVisible();
      await expect(page.locator('.movies-page-head h1')).toHaveText('Movies');
    }
    if(route==='study'){
      await page.locator('.app-tabbar [data-action=study]').click();
      await expect(page.locator('#study-view')).toBeVisible();
      await pinArticleNavigation(page);
    }
    const scope=route.startsWith('game')?'.game-dock':route.startsWith('movies')?'.movies-navigation':'.app-navigation';
    await expect(page.locator(scope)).toBeVisible();
    const veils=await page.locator(`${scope} .arcade-glass`).evaluateAll(elements=>elements.map(e=>getComputedStyle(e,'::before').backgroundColor));
    for(const veil of veils)expect(veil,route).toBe(route.startsWith('game')?CLEAR_FILL:NAV_FILL);
    if(route==='game/snake')await openGameMenu(page);
    else if(route==='study')await page.locator('#study-view [data-reading-choices]').first().click();
    else await page.locator(`${scope} .section-menu`).click();
    const dialog=page.locator('dialog[open]');await expect(dialog).toBeVisible();
    const material=await dialog.evaluate(e=>{
      const s=getComputedStyle(e),gl=e.querySelector(':scope>.ui-glass-gl');
      // Over a live WebGL game the sheet's fill is carried by its WebGL lens tint.
      return e.matches('[data-glass-mode=webgl]')&&gl
        ?{fill:getComputedStyle(gl,'::after').backgroundColor,filter:s.backdropFilter,lensOnly:!e.hasAttribute('data-glass-partial')}
        :{fill:s.backgroundColor,filter:s.backdropFilter,lensOnly:false};
    });
    // #102 (ff95043) made arcade game sheets and Study's privacy panel a readable
    // dark .9 fill; the collection section sheet keeps the frost fill.
    // Study retains its article theme. Arcade sheets deliberately use CSS
    // frost, without a sharp WebGL copy over the blur (#92).
    expect(material.fill,`${route}: sheet`).toBe(route==='study'?'rgba(18, 23, 29, 0.9)':route==='collection'?FROST_FILL:ARCADE_SHEET_FILL);
    expect(material.filter,route).toBe(route==='study'?'blur(1.5px)':'blur(20px) saturate(1.5)');
    expect(material.lensOnly,route).toBe(false);
    await page.keyboard.press('Escape');
  }
});

test('Slither Boost wears the shared clear glass instead of its old milky fill',async({page})=>{
  // Brief for #86: the new games' controls get the clear glass material and lens,
  // keeping Boost's spot and size from the joystick PR.
  await page.goto('/#/game/neon-coil');const boost=page.locator('.nc-boost');await expect(boost).toBeAttached();
  await expect(boost).toHaveClass(/\barcade-glass\b/);await expect(boost).toHaveClass(/\bgame-glass\b/);
  const paint=await boost.evaluate(e=>{const s=getComputedStyle(e);return {fill:s.backgroundColor,border:s.borderTopStyle,radius:s.borderTopLeftRadius};});
  expect(paint.fill).toBe('rgba(0, 0, 0, 0)');expect(paint.border).toBe('none');expect(paint.radius).toBe('17px');
});

// Asserts the original artwork's exact colours; the Christmas theme gives these cards their own opaque palette (docs/evidence/christmas).
test('native start/end cards retain their original game palettes',async({page,context})=>{
  await originalTheme(context);
  // These fills come from the original game styles at 0f3d109. Shared glass
  // belongs to the shell and Slither sheet, not to the original native art.
  for(const [game,selector,fill] of [
    ['snake','.snake-card','rgba(20, 55, 38, 0.59)'],
    ['quadfall','.qf-card','rgba(23, 34, 57, 0.96)'],
    ['maze-muncher','.mm-card','rgba(5, 7, 26, 0.816)'],
    ['flappy-bird','.fb-card','rgba(255, 243, 217, 0.96)'],
    ['ball-run','.br-setup','rgba(29, 29, 34, 0.95)'],
    ['minesweeper','.ms-hint-message','rgba(201, 220, 159, 0.03)'],
    ['tower','.tower-end-card','rgb(244, 227, 229)'],
    ['slipline','.sl-overlay .game-panel','rgb(36, 43, 44)']
  ]){
    await page.goto(`/#/game/${game}`);await expect(page.locator(selector).first()).toBeAttached();
    const paint=await page.locator(selector).first().evaluate(e=>{const s=getComputedStyle(e);return {fill:s.backgroundColor,image:s.backgroundImage,filter:s.backdropFilter};});
    expect(paint.fill,game).toBe(fill);
    expect(paint.image,game).toBe('none');
    expect(paint.filter,game).toBe('none');
  }
  for(const [game,selector,fill] of [
    ['ball-run','.br-layer','rgba(7, 4, 12, 0.65)'],
    ['tower','.tower-end','rgba(51, 46, 75, 0.57)'],
    ['slipline','.sl-overlay','rgba(8, 8, 17, 0.72)']
  ]){
    await page.goto(`/#/game/${game}`);
    await expect(page.locator(selector)).toBeAttached();
    await expect(page.locator(selector)).toHaveCSS('background-color',fill);
    await expect(page.locator(selector)).toHaveCSS('backdrop-filter','none');
  }
  await page.goto('/#/game/neon-coil');
  await expect(page.locator('.nc-game .game-sheet')).toBeVisible();
  // Slither is the deliberate exception to native palettes: #92 frosts it.
  const panel=page.locator('.nc-game .game-sheet-panel');
  await expect(panel).toHaveAttribute('data-glass-mode','blur');
  await expect(panel).toHaveCSS('background-color',ARCADE_SHEET_FILL);
  await expect(panel).toHaveCSS('backdrop-filter','blur(20px) saturate(1.5)');
  await expect(panel.locator(':scope>.ui-glass-gl')).toHaveCount(0);
});

// The cream guidance tip is opaque and readable in both themes; the brown panel colours belong to the original theme only.
for(const theme of ['original','christmas'] as const)test(`Corn retains its pixel columns and readable cream guidance (${theme})`,async({page,context})=>{
  if(theme==='original')await originalTheme(context);
  await page.goto('/#/game/corn-clicker');
  const tip=page.locator('.cc-col .cc-tip');await expect(tip).toBeAttached();
  // Tips are opt-in since #101: ask for them from Options before checking them.
  const farmTab=page.locator('#cc-tab-farm');if(await farmTab.isVisible())await farmTab.click();
  await page.locator('#cc-subtab-options').click();
  await page.locator('[data-act=tutorial]').click();
  const cobTab=page.locator('#cc-tab-cob');if(await cobTab.isVisible())await cobTab.click();
  await expect(tip).toBeVisible();
  expect(await tip.evaluate(e=>{const s=getComputedStyle(e);return{fill:s.backgroundColor,filter:s.backdropFilter,shadow:s.boxShadow};})).toEqual({fill:'rgb(255, 243, 196)',filter:'none',shadow:'none'});
  if(theme==='original'){
  await expect(page.locator('.cc-col.cc-left')).toHaveCSS('background-image',/radial-gradient.*rgb\(74, 60, 23\).*rgb\(41, 36, 26\)/);
  await expect(page.locator('.cc-col.cc-left')).toHaveCSS('border-top-color','rgb(107, 68, 34)');
  }
  const action=tip.locator('.cc-btn');await expect(action).toHaveCSS('color','rgb(61, 46, 7)');
  await expect(action).toBeVisible();
  const box=(await action.boundingBox())!;
  const mask=await glyphFillMask(page,action,'.cc-tip .cc-btn');
  const hide=await page.addStyleTag({content:'.cc-tip .cc-btn{-webkit-text-fill-color:transparent!important}'});
  const backdrop=(await action.screenshot({animations:'disabled'})).toString('base64');
  await hide.evaluate(e=>e.parentNode?.removeChild(e));
  const ratios=await glyphContrast(page,backdrop,mask,[{x:0,y:0,w:box.width,h:box.height,color:'rgb(61, 46, 7)'}],box);
  expect(Math.min(...ratios)).toBeGreaterThanOrEqual(4.5);
});

// Asserts the original artwork's exact colours; the Christmas theme gives these cards their own opaque palette (docs/evidence/christmas).
test('native Minesweeper pause retains its opaque green palette and hides the board',async({page,context})=>{
  await originalTheme(context);
  await page.goto('/#/game/minesweeper');
  await expect(page.locator('.ms-board')).toBeVisible();
  // Backgrounding is the shell's supported pause trigger; the old native
  // Pause control no longer exists in the collected game menu.
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
  const pause=page.locator('#pause-overlay');
  await expect(pause).toBeVisible();
  await expect(page.locator('.ms-board')).toHaveCSS('visibility','hidden');
  await expect(pause).toHaveCSS('background-color','rgb(24, 35, 31)');
  await expect(pause).toHaveCSS('backdrop-filter','blur(5px)');
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});});
  await page.locator('#resume-game').click();
  await expect(pause).toBeHidden();
  await expect(page.locator('.ms-board')).toHaveCSS('visibility','visible');
});

/** Under the suite's software GL, Blockcraft is too slow to screenshot in two phases:
 * 1) after the menu is usable the engine keeps meshing and drawing chunks (~600ms a frame)
 *    until streaming completes, which shows as a mesh count that stops moving;
 * 2) while a menu or screen is open it redraws the world every frame (~300ms at 1366x768).
 * These assertions measure the HTML panels, so wait for (1) and shrink the canvas for (2). */
async function quietBlockcraftCanvas(page:Page){
  const root=page.locator('.blockcraft');
  let previous='',same=0;
  await expect.poll(async()=>{const now=(await root.getAttribute('data-meshes'))??'';same=now!==''&&now===previous?same+1:0;previous=now;return same>=4;},{intervals:[500],timeout:90000}).toBe(true);
  await page.addStyleTag({content:'.blockcraft canvas{width:2px!important;height:2px!important}'});
  await expect.poll(()=>page.evaluate(()=>new Promise<number>(res=>{let n=0;const s=performance.now();const f=()=>{n++;if(performance.now()-s>600)res(n);else requestAnimationFrame(f)};requestAnimationFrame(f)})),{timeout:30000}).toBeGreaterThan(10);
}

test('Blockcraft Controls and Advancements retain the original panels and readable labels',async({page})=>{
  test.setTimeout(240000);
  await page.goto('/#/game/blockcraft');
  await expect(page.locator('.bc-menu [data-act=primary]')).toBeEnabled({timeout:30000});
  await quietBlockcraftCanvas(page);
  await page.locator('.bc-menu [data-act=controls]').click();
  const controls=page.locator('.bc-menu [data-panel=controls]');await expect(controls).toBeVisible();
  const boxes=await controls.evaluate(e=>{const b=e.getBoundingClientRect();return [...e.querySelectorAll('dt,dd')].slice(0,2).concat([...e.querySelectorAll('.bc-btn')]).map(s=>{const r=s.getBoundingClientRect();return{x:r.x-b.x,y:r.y-b.y,w:r.width,h:r.height,color:getComputedStyle(s).color};});});
  const mask=await glyphFillMask(page,controls,'.bc-menu [data-panel=controls] :is(dt,dd,.bc-btn)');
  const hide=await page.addStyleTag({content:'.bc-menu [data-panel=controls] :is(dt,dd,.bc-btn){-webkit-text-fill-color:transparent!important;text-shadow:none!important}'});
  const backdrop=(await controls.screenshot({animations:'disabled'})).toString('base64');
  await hide.evaluate(e=>e.parentNode?.removeChild(e));
  const ratios=await glyphContrast(page,backdrop,mask,boxes,(await controls.boundingBox())!);
  expect(Math.min(...ratios.slice(0,2)),JSON.stringify(ratios)).toBeGreaterThanOrEqual(4.5);
  // Preserve the original vanilla gray button, including its existing contrast
  // limitation. The restoration requirement does not authorize recoloring it.
  const done=controls.locator('.bc-btn');
  await expect(done).toHaveCSS('background-image','linear-gradient(rgb(142, 142, 142), rgb(108, 108, 108))');
  await expect(done).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(done).toHaveCSS('text-shadow','rgb(63, 63, 63) 2px 2px 0px');
  await test.info().attach('original-native-button-contrast',{body:JSON.stringify({contrast:ratios[2],limitation:'Original gray palette is preserved; small white Done text does not reach 4.5:1 at every core.'}),contentType:'application/json'});
  expect(ratios[2]).toBeGreaterThan(3.7);expect(ratios[2]).toBeLessThan(4.1);
  await page.locator('.bc-menu [data-panel=controls] [data-act=back]').click();
  await page.locator('.bc-menu [data-act=advancements]').click();
  const empty=page.locator('.bc-adv-empty');await expect(empty).toBeVisible();
  await test.info().attach('blockcraft-original-advancements',{body:await page.locator('.bc-panel').screenshot({animations:'disabled'}),contentType:'image/png'});
  expect(await empty.evaluate(e=>{const s=getComputedStyle(e);return{fill:s.backgroundColor,image:s.backgroundImage,filter:s.backdropFilter};})).toEqual({fill:'rgb(0, 0, 0)',image:'none',filter:'none'});
  for(const selector of ['.bc-title .bc-px','.bc-adv-empty .bc-px','.bc-adv-summary .bc-px']){
    const art=page.locator(selector).first();await expect(art).toBeVisible();
    const paint=await art.evaluate(e=>{const s=getComputedStyle(e);return{color:s.color,stroke:s.webkitTextStrokeWidth,shadow:s.textShadow,image:s.backgroundImage,filter:s.filter};});
    expect(paint.color).toBe('rgba(0, 0, 0, 0)');expect(paint.stroke).toBe('0px');expect(paint.shadow).toBe('none');
    expect(paint.image).not.toBe('none');expect(paint.filter).toBe('none');
    const bounds=(await art.boundingBox())!;
    const hide=await page.addStyleTag({content:`${selector}{background-image:none!important}`});
    const backdrop=(await art.screenshot({animations:'disabled'})).toString('base64');
    await hide.evaluate(e=>e.parentNode?.removeChild(e));
    const maskArt=await art.evaluate(e=>{
      const url=getComputedStyle(e).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)![1];
      const doc=new DOMParser().parseFromString(decodeURIComponent(url.slice('data:image/svg+xml,'.length)),'image/svg+xml');
      const swatch=document.createElement('span');swatch.style.color=doc.querySelector('[fill]')!.getAttribute('fill')!;document.body.append(swatch);
      const color=getComputedStyle(swatch).color;swatch.remove();
      for(const n of doc.querySelectorAll('[fill]'))if(n.getAttribute('fill')!=='none')n.setAttribute('fill','#fff');
      return{color,url:'data:image/svg+xml,'+encodeURIComponent(new XMLSerializer().serializeToString(doc))};
    });
    // Follow the periodically refreshed summary with a stylesheet and preserve
    // its original pixel-font raster grid. A black background isolates the
    // white foreground image without flattening the real panel in the shot.
    const maskStyle=await page.addStyleTag({content:`${selector}{background-color:#000!important;background-image:url("${maskArt.url}")!important}`});
    const mask=(await art.screenshot({animations:'disabled'})).toString('base64');
    const ratios=await glyphContrast(page,backdrop,mask,[{x:0,y:0,w:bounds.width,h:bounds.height,color:maskArt.color}],bounds);
    await test.info().attach('pixel-glyph-contrast',{body:JSON.stringify({selector,ratios}),contentType:'application/json'});
    await maskStyle.evaluate(e=>(e as Element).remove());
    expect(Math.min(...ratios),`${selector}: ${JSON.stringify(ratios)}`).toBeGreaterThanOrEqual(4.5);
  }
  // The visible book tab opens Statistics without starting or changing a world.
  await statisticsContrast(page);
});

test.describe('desktop Statistics glyphs',()=>{
  test.use({viewport:{width:1366,height:768},deviceScaleFactor:1,isMobile:false,hasTouch:false});
  test('Blockcraft Statistics stay legible at DPR1 over light and dark content',async({page})=>{
    test.setTimeout(150000);
    await page.goto('/#/game/blockcraft');
    await expect(page.locator('.bc-menu [data-act=primary]')).toBeEnabled({timeout:30000});
    await quietBlockcraftCanvas(page);
    await page.locator('.bc-menu [data-act=advancements]').click();
    await statisticsContrast(page);
  });
});

async function statisticsContrast(page:Page){
  await page.locator('.bc-adv-tab[id$="-statistics"]').click();
  await expect(page.locator('.bc-adv-stats')).toBeVisible();
  await expect(page.locator('.bc-adv-stat-row').first()).toHaveCSS('background-color','rgba(0, 0, 0, 0.06)');
  await expect(page.locator('.bc-adv-stats')).toHaveCSS('background-color','rgb(220, 220, 220)');
  for(const backdrop of ['#000','#fff']){
    const source=await page.addStyleTag({content:`.bc-screen{background:${backdrop}!important}`});
    for(const selector of ['.bc-adv-stat-name','.bc-adv-stat-empty']){
      const text=page.locator(selector).first();await text.scrollIntoViewIfNeeded();
      // Whole-panel clips preserve WebKit's fractional glyph raster alignment.
      const panel=page.locator('.bc-adv-stats'),bounds=(await panel.boundingBox())!,r=(await text.boundingBox())!;
      const color=await text.evaluate(e=>getComputedStyle(e).color);
      const mask=await glyphFillMask(page,panel,selector);
      const hide=await page.addStyleTag({content:`${selector}{-webkit-text-fill-color:transparent!important;text-shadow:none!important}`});
      const shot=(await panel.screenshot({animations:'disabled'})).toString('base64');
      await hide.evaluate(e=>e.parentNode?.removeChild(e));
      const edges=await glyphContrast(page,shot,mask,[{x:r.x-bounds.x,y:r.y-bounds.y,w:r.width,h:r.height,color}],bounds);
      await test.info().attach('statistics-glyph-contrast',{body:JSON.stringify({selector,backdrop,edges}),contentType:'application/json'});
      expect(Math.min(...edges),`${selector} over ${backdrop}: ${JSON.stringify(edges)}`).toBeGreaterThanOrEqual(4.5);
    }
    await source.evaluate(e=>(e as Element).remove());
  }
}

for(const surface of ['bar','menu','dock','sheet'] as const)test(`${surface} transmits uniform dark and light artwork through ${surface==='dock'?'its faint directional sheen':'its intended tint without added white'}`,async({page})=>{
  // Study makes the arcade shell inert and keeps its island minimized (as at
  // 0f3d109), and the uniform art layer then covers it; Games shows the shell.
  // The sheet is the home sheet: over a live game, the WebGL lens samples the
  // canvas itself rather than an injected DOM art layer.
  await page.goto(surface==='dock'?'/#/game/snake':'/#/collection');
  if(surface==='sheet')await page.locator('.app-navigation .section-menu').click();
  const selector={bar:'.app-tabbar',menu:'.app-menu',dock:'.game-hud',sheet:'#menu'}[surface];
  const panel=page.locator(selector);await expect(panel).toBeVisible();
  await panel.screenshot({animations:'disabled'});
  const bounds=(await panel.boundingBox())!;
  await page.evaluate(surface=>{
    const art=document.createElement('div');art.id='transmission-art';
    art.style.cssText=`position:fixed;inset:0;pointer-events:none;z-index:${surface==='sheet'?9999:20}`;
    (surface==='dock'?document.querySelector('.game-view')!:document.body).append(art);
  },surface);
  await panel.evaluate(e=>e.classList.add('transmission-panel'));
  const hideInk=await page.addStyleTag({content:'.transmission-panel>*:not(.ui-glass-lens,.ui-glass-glow){visibility:hidden!important}.transmission-panel::after{display:none!important}'});
  const pairs=[];
  // Uniform sources isolate transmission from the separately tested
  // diffusion. Measuring blurred stripe boundaries mistakes diffusion for fill.
  for(const color of ['#152431','#f8e6c0']){
    await page.locator('#transmission-art').evaluate((e,color)=>{(e as HTMLElement).style.background=color;},color);
    const glass=(await panel.screenshot({animations:'disabled',scale:'css'})).toString('base64');
    // Remove the optical paint while keeping the control visible and focused.
    // Hiding a focused companion would collapse and move the navigation.
    const hide=await page.addStyleTag({content:'.transmission-panel{background:transparent!important;backdrop-filter:none!important;-webkit-backdrop-filter:none!important;box-shadow:none!important;border-color:transparent!important}.transmission-panel::before,.transmission-panel>.ui-glass-lens,.transmission-panel>.ui-glass-glow{visibility:hidden!important}'});
    const source=(await page.screenshot({clip:bounds,scale:'css'})).toString('base64');
    await hide.evaluate(e=>(e as Element).remove());
    pairs.push({glass,source});
  }
  await hideInk.evaluate(e=>(e as Element).remove());
  const measured=await page.evaluate(async({pairs,surface})=>{
    const decode=async(png:string)=>{const i=new Image();i.src='data:image/png;base64,'+png;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d')!;ctx.drawImage(i,0,0);return {w:c.width,h:c.height,data:ctx.getImageData(0,0,c.width,c.height).data};};
    const lightness=(data:Uint8ClampedArray,offset:number)=>{
      const y=[.2126,.7152,.0722].reduce((sum,k,c)=>{const v=data[offset+c]/255;return sum+k*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4);},0);
      return y>216/24389?116*Math.cbrt(y)-16:24389/27*y;
    };
    const levels:number[]=[],original:number[]=[],added:number[]=[];
    let region={w:0,h:0,x0:0,x1:0,y0:0,y1:0};
    // Measure the clear centre. The separately tested convex edge intentionally
    // displaces source detail and is not a claim of zero optical displacement.
    for(const {glass,source} of pairs){
    const a=await decode(glass),b=await decode(source);
    const x0=surface==='menu'?Math.ceil(a.w*.42):20,x1=surface==='menu'?Math.floor(a.w*.58):a.w-20;
    const y0=surface==='sheet'?20:Math.ceil(a.h*.45),y1=surface==='sheet'?a.h-20:Math.floor(a.h*.55);
    region={w:a.w,h:a.h,x0,x1,y0,y1};
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const l=lightness(a.data,(y*a.w+x)*4),s=lightness(b.data,(y*b.w+x)*4);
      levels.push(l);original.push(s);added.push(Math.max(0,l-s));
    }
    }
    const mean=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
    const sd=(a:number[])=>{const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)**2)));};
    return {lift:mean(added),retention:sd(original)>1?sd(levels)/sd(original):null,samples:levels.length,region};
  },{pairs,surface});
  expect(measured.samples).toBeGreaterThan(20);
  expect(measured.lift,JSON.stringify(measured)).toBeLessThanOrEqual(2);
  // Model the literal recipes independently: dock .20/saturate(1.08) beneath
  // its directional sheen, navigation .36/saturate(1.4)/brightness(.94),
  // sheets .58/saturate(1.5). Keep the sheen, glow and rim in the actual shot.
  // Some Linux WebKit builds paint no backdrop filters at all (see clear-glass);
  // there only the fill applies. That is checked on an independent CSS page.
  const filtered=await backdropFiltersRender(page);
  if(!filtered)test.info().annotations.push({type:'renderer limitation',description:'This browser build paints no backdrop filters; only the fill transfer is measured.'});
  const navigation=surface==='bar'||surface==='menu';
  const tone=filtered?{saturate:surface==='sheet'?1.5:navigation?1.4:1.08,brightness:navigation?.94:1,contrast:1}:{saturate:1,brightness:1,contrast:1};
  const fill=surface==='sheet'?{rgb:[12,16,22],alpha:.58}:{rgb:FILL_RGB,alpha:navigation?.36:FILL_ALPHA};
  expect(measured.retention,'Dark and light source artwork must have measurable contrast').not.toBeNull();
  const expected=expectedRetention(['#152431','#f8e6c0'],tone,fill,surface==='dock'?measured.region:undefined);
  expect(Math.abs(measured.retention!-expected),JSON.stringify({...measured,expected})).toBeLessThanOrEqual(.03);
});

async function backdropFiltersRender(page:Page){
  const reference=await page.context().newPage();
  try{
    await reference.setContent('<body style="margin:0;background:#fff"><div style="position:fixed;inset:0;backdrop-filter:brightness(.5);-webkit-backdrop-filter:brightness(.5)"></div></body>');
    const png=(await reference.screenshot({clip:{x:10,y:10,width:4,height:4}})).toString('base64');
    return await reference.evaluate(async png=>{const i=new Image();i.src='data:image/png;base64,'+png;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d')!;x.drawImage(i,0,0);return x.getImageData(1,1,1,1).data[0]<200;},png);
  }finally{await reference.close();}
}

function expectedRetention(colors:string[],tone:{saturate:number;brightness:number;contrast:number},fill:{rgb:number[];alpha:number},dockRegion?:{w:number;h:number;x0:number;x1:number;y0:number;y1:number}){
  const lightness=(rgb:number[])=>{
    const y=rgb.reduce((sum,v,c)=>{const s=v/255;return sum+[.2126,.7152,.0722][c]*(s<=.04045?s/12.92:((s+.055)/1.055)**2.4);},0);
    return y>216/24389?116*Math.cbrt(y)-16:24389/27*y;
  };
  const source=colors.map(hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)));
  // Filter Effects: saturate matrix, then brightness, then contrast, then the fill.
  const s=tone.saturate,matrix=[[.213+.787*s,.715-.715*s,.072-.072*s],[.213-.213*s,.715+.285*s,.072-.072*s],[.213-.213*s,.715-.715*s,.072+.928*s]];
  const clamp=(v:number)=>Math.min(1,Math.max(0,v));
  const filtered=(rgb:number[])=>matrix.map(row=>clamp(row.reduce((sum,k,j)=>sum+k*rgb[j]/255,0))).map(v=>255*clamp((v*tone.brightness-.5)*tone.contrast+.5));
  // The 135deg white gradient paints over the tinted backdrop. Evaluate its
  // literal .10 / .025 at 45% / .065 stops at every sampled pixel centre,
  // rather than assuming uniform alpha across a wide HUD or fitting the shot.
  const sheen:number[]=[];
  if(dockRegion){
    const {w,h,x0,x1,y0,y1}=dockRegion;
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const position=(x+.5+y+.5)/(w+h);
      sheen.push(position<.45?.10+(.025-.10)*position/.45:.025+(.065-.025)*(position-.45)/.55);
    }
  }else sheen.push(0);
  const original:number[]=[],transmitted:number[]=[];
  for(const rgb of source){
    const tinted=filtered(rgb).map((v,c)=>v*(1-fill.alpha)+fill.rgb[c]*fill.alpha);
    for(const alpha of sheen){
      original.push(lightness(rgb));
      transmitted.push(lightness(tinted.map(v=>v*(1-alpha)+255*alpha)));
    }
  }
  const mean=(a:number[])=>a.reduce((sum,v)=>sum+v,0)/a.length;
  const sd=(a:number[])=>{const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)**2)));};
  return sd(transmitted)/sd(original);
}

async function pinArticleNavigation(page:Page){
  await page.keyboard.press('Tab');
  await page.evaluate(()=>{
    const nav=document.querySelector('.app-navigation')!;
    // Study owns the same persistent shell. Keyboard focus keeps its real
    // expanded state stable across paired material screenshots.
    nav.querySelector<HTMLButtonElement>('.section-menu')!.focus({preventScroll:true});
    for(const animation of nav.getAnimations({subtree:true}))animation.finish();
  });
}

test('a sheet uses the same frosted transfer at five heights across a light/dark boundary',async({page})=>{
  // #92's CSS frost transmits the injected DOM backdrop at every height.
  await page.goto('/#/collection');await page.locator('.app-navigation .section-menu').click();
  const panel=page.locator('#menu');await expect(panel).toBeVisible();await panel.screenshot({animations:'disabled'});
  const bounds=(await panel.boundingBox())!;
  await page.evaluate(bounds=>{
    const art=document.createElement('div');art.style.cssText=`position:fixed;inset:0;z-index:9999;background:linear-gradient(#f8f8f8 0 ${bounds.y+bounds.height*.55}px,#152431 0)`;document.body.append(art);
  },bounds);
  // Use an empty gutter, retaining the sheet's nested action/group backgrounds.
  const png=(await panel.screenshot({scale:'css',animations:'disabled'})).toString('base64');
  const rows=await page.evaluate(async png=>{
    const image=new Image();image.src='data:image/png;base64,'+png;await image.decode();
    const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);
    return [.15,.3,.49,.7,.85].map(height=>({height,color:[...ctx.getImageData(12,Math.floor(c.height*height),1,1).data].slice(0,3)}));
  },png);
  const filtered=await backdropFiltersRender(page);
  for(const {height,color} of rows){
    const original=height<.55?[248,248,248]:[21,36,49];
    const s=filtered?1.5:1;
    const matrix=[[.213+.787*s,.715-.715*s,.072-.072*s],[.213-.213*s,.715+.285*s,.072-.072*s],[.213-.213*s,.715-.715*s,.072+.928*s]];
    const saturated=matrix.map(row=>Math.max(0,Math.min(255,row.reduce((sum,k,c)=>sum+k*original[c],0))));
    const expected=saturated.map((v,c)=>v*.42+[12,16,22][c]*.58);
    expect(Math.max(...color.map((v,i)=>Math.abs(v-expected[i]))),JSON.stringify(rows)).toBeLessThanOrEqual(2);
  }
});

for(const surface of ['dark','light','multiplayer'] as const)test(`${surface} sheet action icons retain 3:1 non-text contrast without backing rectangles`,async({page})=>{
  await page.goto(surface==='multiplayer'?'/#/game/pool':surface==='dark'?'/#/game/snake':'/#/game/fruit-merge');
  if(surface==='multiplayer')await gameAction(page,'Multiplayer');else await openGameMenu(page);
  const selector=surface==='multiplayer'?'.mp-card':'#game-options',panel=page.locator(selector);
  await page.evaluate(surface=>{const art=document.createElement('div');art.style.cssText=`position:fixed;inset:0;pointer-events:none;z-index:${surface==='multiplayer'?59:9999};background:${surface==='light'?'black':'white'}`;document.body.append(art);},surface);
  // The WebGL lens refracts the game canvas itself, beneath any DOM layer. Hide
  // that source so the sheet shows the injected art, as it does over a page.
  await page.addStyleTag({content:'#game-stage canvas:not(.ui-glass-gl>canvas){visibility:hidden!important}'});
  await page.evaluate(()=>dispatchEvent(new Event('resize')));
  await expect.poll(()=>panel.evaluate(e=>e.getAttribute('data-glass-mode'))).not.toBe('webgl');
  await settleGlassInk(panel);
  await panel.screenshot({animations:'disabled'});
  const boxes=await panel.evaluate(e=>{const b=e.getBoundingClientRect();return [...e.querySelectorAll('svg')].filter(s=>s.getBoundingClientRect().width>0).map(s=>{const r=s.getBoundingClientRect();return{x:r.x-b.x,y:r.y-b.y,w:r.width,h:r.height,color:getComputedStyle(s).color};});});
  expect(boxes.length).toBeGreaterThanOrEqual(surface==='multiplayer'?1:2);
  const mask=await glyphFillMask(page,panel,`${selector} svg`,true);
  // Action icons are non-text graphics: WCAG 1.4.11 asks 3:1 against their
  // adjacent colours, i.e. the visible exterior outline with the icon (and any
  // adaptive halo) retained, over the approved clear material.
  const shot=(await panel.screenshot({animations:'disabled'})).toString('base64');
  const ratios=await glyphContrast(page,shot,mask,boxes,(await panel.boundingBox())!,true);
  expect(Math.min(...ratios),JSON.stringify(ratios)).toBeGreaterThanOrEqual(3);
  await test.info().attach('plain-icon-core-contrast',{body:JSON.stringify({surface,ratios}),contentType:'application/json'});
  await expect(panel.locator('.glass-vector-halo')).toHaveCount(0);
});
