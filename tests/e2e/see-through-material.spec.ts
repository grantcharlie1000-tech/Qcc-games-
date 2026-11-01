import {test,expect} from '../fixtures';
import {gameAction,openGameMenu} from '../game-menu';
import {glyphContrast} from '../glass-contrast';
import type {Page} from '@playwright/test';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});

// Charlie's clear-variant requirement supersedes the previous fit to the
// regular HIG tab bar: the panel must preserve the content's own luminance.
test('bars, buttons and sheets add almost no fill to their live backdrop',async({page})=>{
  await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  for(const route of ['collection','study','movies/browse/movie','game/snake']){
    await page.goto(`/#/${route==='study'?'collection':route}`);
    if(route==='study'){
      await page.locator('.app-tabbar [data-action=study]').click();
      await expect(page.locator('#study-view')).toBeVisible();
      await pinArticleNavigation(page);
    }
    const scope=route.startsWith('game')?'.game-dock':route.startsWith('movies')?'.movies-navigation':'.app-navigation';
    await expect(page.locator(scope)).toBeVisible();
    const veils=await page.locator(`${scope} .arcade-glass`).evaluateAll(elements=>elements.map(e=>getComputedStyle(e,'::before').backgroundColor));
    for(const veil of veils)expect(Number(veil.match(/[\d.]+/g)?.[3]??1),`${route}: ${veil}`).toBeLessThanOrEqual(.02);
    if(route==='game/snake')await openGameMenu(page);
    else if(route==='study')await page.locator('#study-view [data-reading-choices]').first().click();
    else await page.locator(`${scope} .section-menu`).click();
    const dialog=page.locator('dialog[open]');await expect(dialog).toBeVisible();
    const material=await dialog.evaluate(e=>({fill:getComputedStyle(e).backgroundColor,filter:getComputedStyle(e).backdropFilter}));
    expect(Number(material.fill.match(/[\d.]+/g)?.[3]??1),`${route}: sheet ${material.fill}`).toBeLessThanOrEqual(.02);
    expect(material.filter).not.toMatch(/brightness|contrast|saturate\((?!1\))/);
    const blur=Number(material.filter.match(/blur\(([\d.]+)px\)/)?.[1]??0);
    expect(blur).toBeLessThanOrEqual(.6);
    await page.keyboard.press('Escape');
  }
});

test('native start/end cards and floating Boost share the clear optical tokens',async({page})=>{
  for(const [game,selector,dimmer] of [
    ['snake','.snake-card',''],['quadfall','.qf-card',''],['maze-muncher','.mm-card',''],
    ['neon-coil','.nc-card','.nc-overlay'],['neon-coil','.nc-boost',''],
    ['flappy-bird','.fb-card',''],['ball-run','.br-setup','.br-layer'],
    ['minesweeper','.ms-hint-message',''],
    ['tower','.tower-end-card','.tower-end'],['slipline','.sl-overlay .game-panel','.sl-overlay']
  ]){
    await page.goto(`/#/game/${game}`);await expect(page.locator(selector).first()).toBeAttached();
    const paint=await page.locator(selector).first().evaluate(e=>{const s=getComputedStyle(e);return {fill:s.backgroundColor,image:s.backgroundImage,filter:s.backdropFilter};});
    expect(paint.fill,game).toBe('rgba(184, 184, 184, 0.02)');
    expect(paint.image,game).toBe('none');
    expect(paint.filter,game).toContain('blur(0.3px)');
    if(dimmer){
      const veil=await page.locator(dimmer).evaluate(e=>{const s=getComputedStyle(e);return {fill:s.backgroundColor,image:s.backgroundImage,filter:s.backdropFilter};});
      expect(veil,game).toEqual({fill:'rgba(0, 0, 0, 0)',image:'none',filter:'none'});
    }
  }
});

test('Corn guidance adds no second material inside its clear column',async({page})=>{
  await page.goto('/#/game/corn-clicker');
  const tip=page.locator('.cc-col .cc-tip');await expect(tip).toBeAttached();
  expect(await tip.evaluate(e=>{const s=getComputedStyle(e);return{fill:s.backgroundColor,filter:s.backdropFilter,shadow:s.boxShadow};})).toEqual({fill:'rgba(0, 0, 0, 0)',filter:'none',shadow:'none'});
  await expect(page.locator('.cc-col.cc-left')).toHaveCSS('background-color','rgba(184, 184, 184, 0.02)');
  const action=tip.locator('.cc-btn');await expect(action).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(action).toBeVisible();
  const visible=(await action.screenshot({animations:'disabled'})).toString('base64');
  const box=(await action.boundingBox())!;
  await page.addStyleTag({content:'.cc-tip .cc-btn{background:#000!important;color:#fff!important;-webkit-text-stroke:0!important;text-shadow:none!important;border-color:transparent!important}'});
  const mask=(await action.screenshot({animations:'disabled'})).toString('base64');
  const edges=await glyphContrast(page,visible,mask,[{x:0,y:0,w:box.width,h:box.height,color:'rgb(255, 255, 255)'}],box,true);
  expect(Math.min(...edges)).toBeGreaterThanOrEqual(4.5);
});

test('Blockcraft Controls and Advancements keep clear content and one readable label',async({page})=>{
  await page.goto('/#/game/blockcraft');
  await expect(page.locator('.bc-menu [data-act=primary]')).toBeEnabled({timeout:30000});
  await page.locator('.bc-menu [data-act=controls]').click();
  const controls=page.locator('.bc-menu [data-panel=controls]');await expect(controls).toBeVisible();
  const boxes=await controls.evaluate(e=>{const b=e.getBoundingClientRect();return [...e.querySelectorAll('dt,dd')].slice(0,2).concat([...e.querySelectorAll('.bc-btn')]).map(s=>{const r=s.getBoundingClientRect();return{x:r.x-b.x,y:r.y-b.y,w:r.width,h:r.height,color:getComputedStyle(s).color};});});
  const visible=(await controls.screenshot({animations:'disabled'})).toString('base64');
  await test.info().attach('blockcraft-clear-controls',{body:Buffer.from(visible,'base64'),contentType:'image/png'});
  const style=await page.addStyleTag({content:'.bc-menu [data-panel=controls],.bc-menu [data-panel=controls] *{background:#000!important;color:#fff!important;-webkit-text-stroke:0!important;text-shadow:none!important;border-color:transparent!important}'});
  const mask=(await controls.screenshot({animations:'disabled'})).toString('base64');
  const edges=await glyphContrast(page,visible,mask,boxes,(await controls.boundingBox())!,true);
  expect(Math.min(...edges),JSON.stringify(edges)).toBeGreaterThanOrEqual(4.5);
  await style.evaluate(e=>(e as Element).remove());
  await page.locator('.bc-menu [data-panel=controls] [data-act=back]').click();
  await page.locator('.bc-menu [data-act=advancements]').click();
  const empty=page.locator('.bc-adv-empty');await expect(empty).toBeVisible();
  await test.info().attach('blockcraft-clear-advancements',{body:await page.locator('.bc-panel').screenshot({animations:'disabled'}),contentType:'image/png'});
  expect(await empty.evaluate(e=>{const s=getComputedStyle(e);return{fill:s.backgroundColor,image:s.backgroundImage,filter:s.backdropFilter};})).toEqual({fill:'rgba(0, 0, 0, 0)',image:'none',filter:'none'});
  for(const selector of ['.bc-title .bc-px','.bc-adv-empty .bc-px','.bc-adv-summary .bc-px']){
    const art=page.locator(selector).first();await expect(art).toBeVisible();
    const paint=await art.evaluate(e=>{const s=getComputedStyle(e);return{color:s.color,stroke:s.webkitTextStrokeWidth,shadow:s.textShadow,image:s.backgroundImage,filter:s.filter};});
    expect(paint.color).toBe('rgba(0, 0, 0, 0)');expect(paint.stroke).toBe('0px');expect(paint.shadow).toBe('none');
    expect(paint.image).not.toBe('none');expect(paint.filter).toContain('drop-shadow');
    const bounds=(await art.boundingBox())!;
    const visible=(await art.screenshot({animations:'disabled'})).toString('base64');
    const maskArt=await art.evaluate(e=>{
      const url=getComputedStyle(e).backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)![1];
      const doc=new DOMParser().parseFromString(decodeURIComponent(url.slice('data:image/svg+xml,'.length)),'image/svg+xml');
      const swatch=document.createElement('span');swatch.style.color=doc.querySelector('[fill]')!.getAttribute('fill')!;document.body.append(swatch);
      const color=getComputedStyle(swatch).color;swatch.remove();
      for(const n of doc.querySelectorAll('[fill]'))if(n.getAttribute('fill')!=='none')n.setAttribute('fill','#fff');
      return{color,url:'data:image/svg+xml,'+encodeURIComponent(new XMLSerializer().serializeToString(doc))};
    });
    // A stylesheet follows the periodically refreshed summary node. An inline
    // mask on its old span can disappear during a screenshot and prove nothing.
    // Keep the same image filter/raster grid: removing it moves some scaled
    // pixel-font edges in WebKit. Black glyph shadows disappear into the black
    // panel, leaving only the white foreground alpha in the mask.
    const maskStyle=await page.addStyleTag({content:`.bc-panel{background:#000!important}${selector}{background-image:url("${maskArt.url}")!important;--pixel-glass-halo:#000!important}`});
    const mask=(await art.screenshot({animations:'disabled'})).toString('base64');
    const edges=await glyphContrast(page,visible,mask,[{x:0,y:0,w:bounds.width,h:bounds.height,color:maskArt.color}],bounds,true);
    await test.info().attach('pixel-glyph-contrast',{body:JSON.stringify({selector,edges}),contentType:'application/json'});
    await maskStyle.evaluate(e=>(e as Element).remove());
    expect(Math.min(...edges),`${selector}: ${JSON.stringify(edges)}`).toBeGreaterThanOrEqual(4.5);
  }
  // The visible book tab opens Statistics without starting or changing a world.
  await statisticsContrast(page);
});

test.describe('desktop Statistics glyphs',()=>{
  test.use({viewport:{width:1366,height:768},deviceScaleFactor:1,isMobile:false,hasTouch:false});
  test('Blockcraft Statistics stay legible at DPR1 over light and dark content',async({page})=>{
    await page.goto('/#/game/blockcraft');
    await expect(page.locator('.bc-menu [data-act=primary]')).toBeEnabled({timeout:30000});
    await page.locator('.bc-menu [data-act=advancements]').click();
    await statisticsContrast(page);
  });
});

async function statisticsContrast(page:Page){
  await page.locator('.bc-adv-tab[id$="-statistics"]').click();
  await expect(page.locator('.bc-adv-stats')).toBeVisible();
  await expect(page.locator('.bc-adv-stat-row').first()).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
  for(const backdrop of ['#000','#fff']){
    const source=await page.addStyleTag({content:`.bc-screen{background:${backdrop}!important}`});
    for(const selector of ['.bc-adv-stat-name','.bc-adv-stat-empty']){
      const text=page.locator(selector).first();await text.scrollIntoViewIfNeeded();
      // Whole-panel clips preserve WebKit's fractional glyph raster alignment.
      const panel=page.locator('.bc-adv-stats'),bounds=(await panel.boundingBox())!,r=(await text.boundingBox())!;
      const color=await text.evaluate(e=>getComputedStyle(e).color);
      const visible=(await panel.screenshot({animations:'disabled'})).toString('base64');
      const style=await page.addStyleTag({content:'.bc-adv-stats,.bc-adv-stats *{color:#fff!important;-webkit-text-fill-color:#fff!important;background:#000!important;text-shadow:none!important;-webkit-text-stroke:0!important;border-color:transparent!important}'});
      const mask=(await panel.screenshot({animations:'disabled'})).toString('base64');
      const edges=await glyphContrast(page,visible,mask,[{x:r.x-bounds.x,y:r.y-bounds.y,w:r.width,h:r.height,color}],bounds,true);
      await style.evaluate(e=>(e as Element).remove());
      await test.info().attach('statistics-glyph-contrast',{body:JSON.stringify({selector,backdrop,edges}),contentType:'application/json'});
      expect(Math.min(...edges),`${selector} over ${backdrop}: ${JSON.stringify(edges)}`).toBeGreaterThanOrEqual(4.5);
    }
    await source.evaluate(e=>(e as Element).remove());
  }
}

for(const surface of ['bar','menu','dock','sheet'] as const)test(`${surface} preserves the rendered background with near-zero added white`,async({page})=>{
  await page.goto(surface==='bar'||surface==='menu'?'/#/collection':'/#/game/snake');
  if(surface==='bar'||surface==='menu'){
    await page.locator('.app-tabbar [data-action=study]').click();
    await expect(page.locator('#study-view')).toBeVisible();
    await pinArticleNavigation(page);
  }
  if(surface==='sheet')await openGameMenu(page);
  const selector={bar:'.app-tabbar',menu:'.app-menu',dock:'.game-hud',sheet:'#game-options'}[surface];
  const panel=page.locator(selector);await expect(panel).toBeVisible();
  await panel.screenshot({animations:'disabled'});
  const bounds=(await panel.boundingBox())!;
  await page.evaluate(({surface,bounds})=>{
    const art=document.createElement('div');art.id='transmission-art';
    // Five horizontal bands let every height see both light and dark content.
    art.style.cssText=`position:fixed;inset:0;pointer-events:none;z-index:${surface==='sheet'?9999:20};background:repeating-linear-gradient(90deg,#152431 0 30px,#f8e6c0 30px 60px);background-position:${bounds.x}px 0`;
    (surface==='dock'?document.querySelector('.game-view')!:document.body).append(art);
  },{surface,bounds});
  await panel.evaluate(e=>e.classList.add('transmission-panel'));
  const hideInk=await page.addStyleTag({content:'.transmission-panel>*:not(.ui-glass-lens,.ui-glass-glow){visibility:hidden!important}.transmission-panel::after{display:none!important}'});
  const glass=(await panel.screenshot({animations:'disabled',scale:'css'})).toString('base64');
  const hide=await page.addStyleTag({content:'.transmission-panel,.transmission-panel::before{visibility:hidden!important}'});
  const source=(await page.screenshot({clip:bounds,scale:'css'})).toString('base64');
  await hide.evaluate(e=>(e as Element).remove());await hideInk.evaluate(e=>(e as Element).remove());
  const measured=await page.evaluate(async({glass,source,surface})=>{
    const decode=async(png:string)=>{const i=new Image();i.src='data:image/png;base64,'+png;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const ctx=c.getContext('2d')!;ctx.drawImage(i,0,0);return {w:c.width,h:c.height,data:ctx.getImageData(0,0,c.width,c.height).data};};
    const a=await decode(glass),b=await decode(source);
    const lightness=(data:Uint8ClampedArray,offset:number)=>{
      const y=[.2126,.7152,.0722].reduce((sum,k,c)=>{const v=data[offset+c]/255;return sum+k*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4);},0);
      return y>216/24389?116*Math.cbrt(y)-16:24389/27*y;
    };
    const levels:number[]=[],original:number[]=[],added:number[]=[];
    // Measure the clear centre. The separately tested convex edge intentionally
    // displaces source detail and is not a claim of zero optical displacement.
    const x0=surface==='menu'?Math.ceil(a.w*.42):20,x1=surface==='menu'?Math.floor(a.w*.58):a.w-20;
    const y0=surface==='sheet'?20:Math.ceil(a.h*.45),y1=surface==='sheet'?a.h-20:Math.floor(a.h*.55);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
      const l=lightness(a.data,(y*a.w+x)*4),s=lightness(b.data,(y*b.w+x)*4);
      levels.push(l);original.push(s);added.push(Math.max(0,l-s));
    }
    const mean=(a:number[])=>a.reduce((s,v)=>s+v,0)/a.length;
    const sd=(a:number[])=>{const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)**2)));};
    return {lift:mean(added),retention:sd(original)>1?sd(levels)/sd(original):null,samples:levels.length};
  },{glass,source,surface});
  expect(measured.samples).toBeGreaterThan(20);
  expect(measured.lift,JSON.stringify(measured)).toBeLessThanOrEqual(2);
  if(measured.retention!==null)expect(measured.retention,JSON.stringify(measured)).toBeGreaterThanOrEqual(.95);
});

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

test('a sheet uses the same clear transfer at five heights across a light/dark boundary',async({page})=>{
  await page.goto('/#/game/snake');await openGameMenu(page);
  const panel=page.locator('#game-options');await panel.screenshot({animations:'disabled'});
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
  for(const {height,color} of rows){
    const original=height<.55?[248,248,248]:[21,36,49];
    const expected=original.map(v=>v*.98+184*.02);
    expect(Math.max(...color.map((v,i)=>Math.abs(v-expected[i]))),JSON.stringify(rows)).toBeLessThanOrEqual(2);
  }
});

for(const surface of ['dark','light','multiplayer'] as const)test(`${surface} sheet action icons retain 4.5:1 without backing rectangles`,async({page})=>{
  await page.goto(surface==='multiplayer'?'/#/game/pool':surface==='dark'?'/#/game/snake':'/#/game/fruit-merge');
  if(surface==='multiplayer')await gameAction(page,'Multiplayer');else await openGameMenu(page);
  const selector=surface==='multiplayer'?'.mp-card':'#game-options',panel=page.locator(selector);
  await page.evaluate(surface=>{const art=document.createElement('div');art.style.cssText=`position:fixed;inset:0;z-index:${surface==='multiplayer'?59:9999};background:${surface==='light'?'black':'white'}`;document.body.append(art);},surface);
  await panel.screenshot({animations:'disabled'});
  const boxes=await panel.evaluate(e=>{const b=e.getBoundingClientRect();return [...e.querySelectorAll('svg')].filter(s=>s.getBoundingClientRect().width>0).map(s=>{const r=s.getBoundingClientRect();return{x:r.x-b.x,y:r.y-b.y,w:r.width,h:r.height,color:getComputedStyle(s).color};});});
  expect(boxes.length).toBeGreaterThanOrEqual(surface==='multiplayer'?1:2);
  const visible=(await panel.screenshot({animations:'disabled'})).toString('base64');
  const hide=await page.addStyleTag({content:`${selector} svg{color:transparent!important}`});
  const shot=(await panel.screenshot({animations:'disabled'})).toString('base64');await hide.evaluate(e=>(e as Element).remove());
  await page.addStyleTag({content:`${selector},${selector} *{background:#000!important;backdrop-filter:none!important;box-shadow:none!important;border-color:transparent!important;text-shadow:none!important;-webkit-text-stroke:0!important}${selector} svg{color:#fff!important}.glass-vector-halo{display:none!important}`});
  const mask=(await panel.screenshot({animations:'disabled'})).toString('base64');
  const ratios=await glyphContrast(page,shot,mask,boxes,(await panel.boundingBox())!);
  expect(Math.min(...ratios),JSON.stringify(ratios)).toBeGreaterThanOrEqual(4.5);
  const edges=await glyphContrast(page,visible,mask,boxes,(await panel.boundingBox())!,true);
  await test.info().attach('visible-edge-contrast',{body:JSON.stringify({surface,ratios,edges}),contentType:'application/json'});
  expect(Math.min(...edges),JSON.stringify(edges)).toBeGreaterThanOrEqual(4.5);
});
