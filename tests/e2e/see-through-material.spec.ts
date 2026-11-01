import {test,expect} from '../fixtures';
import {openGameMenu} from '../game-menu';
import {glyphContrast} from '../glass-contrast';

test.use({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});

// Charlie's clear-variant requirement supersedes the previous fit to the
// regular HIG tab bar: the panel must preserve the content's own luminance.
test('bars, buttons and sheets add almost no fill to their live backdrop',async({page})=>{
  await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  for(const route of ['collection','study','movies/browse/movie','game/snake']){
    await page.goto(`/#/${route}`);
    const scope=route.startsWith('game')?'.game-dock':route.startsWith('movies')?'.movies-navigation':'.app-navigation';
    await expect(page.locator(scope)).toBeVisible();
    const veils=await page.locator(`${scope} .arcade-glass`).evaluateAll(elements=>elements.map(e=>getComputedStyle(e,'::before').backgroundColor));
    for(const veil of veils)expect(Number(veil.match(/[\d.]+/g)?.[3]??1),`${route}: ${veil}`).toBeLessThanOrEqual(.02);
    if(route==='game/snake')await openGameMenu(page);
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

for(const surface of ['bar','menu','dock','sheet'] as const)test(`${surface} preserves the rendered background with near-zero added white`,async({page})=>{
  await page.goto(surface==='bar'||surface==='menu'?'/#/study':'/#/game/snake');
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

for(const tone of ['dark','light'] as const)test(`${tone} sheet action icons retain 4.5:1 without backing rectangles`,async({page})=>{
  await page.goto(tone==='dark'?'/#/game/snake':'/#/game/fruit-merge');
  await openGameMenu(page);
  const selector='#game-options',panel=page.locator(selector);
  await page.evaluate(tone=>{const art=document.createElement('div');art.style.cssText=`position:fixed;inset:0;z-index:9999;background:${tone==='dark'?'white':'black'}`;document.body.append(art);},tone);
  await panel.screenshot({animations:'disabled'});
  const boxes=await panel.evaluate(e=>{const b=e.getBoundingClientRect();return [...e.querySelectorAll('svg')].filter(s=>s.getBoundingClientRect().width>0).map(s=>{const r=s.getBoundingClientRect();return{x:r.x-b.x,y:r.y-b.y,w:r.width,h:r.height,color:getComputedStyle(s).color};});});
  expect(boxes.length).toBeGreaterThan(1);
  const hide=await page.addStyleTag({content:`${selector} svg{color:transparent!important}`});
  const shot=(await panel.screenshot({animations:'disabled'})).toString('base64');await hide.evaluate(e=>(e as Element).remove());
  await page.addStyleTag({content:`${selector},${selector} *{background:#000!important;backdrop-filter:none!important;box-shadow:none!important;border-color:transparent!important;text-shadow:none!important}${selector} svg{color:#fff!important}.glass-vector-halo{display:none!important}`});
  const mask=(await panel.screenshot({animations:'disabled'})).toString('base64');
  const ratios=await glyphContrast(page,shot,mask,boxes,(await panel.boundingBox())!);
  expect(Math.min(...ratios),JSON.stringify(ratios)).toBeGreaterThanOrEqual(4.5);
});
