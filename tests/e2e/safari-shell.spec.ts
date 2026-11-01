import {test,expect} from '../fixtures';
import {readFileSync} from 'node:fs';
const catalog=readFileSync('public/movies/catalog.json','utf8');
test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2});
test.beforeEach(async({page})=>{await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));});

for(const route of ['collection','game/snake'])test(`${route} fills the visible viewport as browser toolbars change`,async({page,context,browserName})=>{
 await page.goto(`/#/${route}`);await expect(page.locator(route==='collection'?'.game-card':'.game-hud strong').first()).toBeVisible();
 const cdp=browserName==='chromium'?await context.newCDPSession(page):undefined;
 await cdp?.send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom:34}});
 for(const height of [714,844,714]){
  await page.setViewportSize({width:390,height});
  await expect.poll(()=>page.evaluate(route=>{
   const surface=document.querySelector(route==='collection'?'#content':'.game-view')!.getBoundingClientRect();
   const controls=document.querySelector(route==='collection'?'.app-navigation':'.game-dock')!.getBoundingClientRect();
   return surface.bottom>=visualViewport!.height+visualViewport!.offsetTop-1&&controls.bottom<=visualViewport!.height+visualViewport!.offsetTop;
  },route)).toBe(true);
 }
 await cdp?.detach();
});

for(const route of ['movies','movies/browse/tv'])test(`${route} canvas covers toolbar-sized viewport changes and clears the game lock`,async({page,context,browserName})=>{
 await page.goto('/#/game/snake');await expect(page.locator('.game-hud strong').first()).toBeVisible();
 await page.evaluate(route=>{location.hash='#/'+route;},route);await expect(page.locator('.movies-poster').first()).toBeVisible();
 const cdp=browserName==='chromium'?await context.newCDPSession(page):undefined;
 await cdp?.send('Emulation.setSafeAreaInsetsOverride',{insets:{bottom:34}});
 for(const height of [714,844,714]){
  await page.setViewportSize({width:390,height});
  const geometry=await page.evaluate(()=>({
   visual:visualViewport!.height+visualViewport!.offsetTop,
   page:document.querySelector('.movies-view')!.getBoundingClientRect().bottom,
   body:document.body.getBoundingClientRect().height,
   canvas:getComputedStyle(document.documentElement).backgroundColor,
   play:document.documentElement.style.getPropertyValue('--play-height'),
   nav:document.querySelector('.movies-navigation')!.getBoundingClientRect().bottom
  }));
  expect(geometry.page).toBeGreaterThanOrEqual(geometry.visual-1);expect(geometry.body).toBeGreaterThanOrEqual(geometry.visual-1);
  expect(geometry.canvas).toBe('rgb(0, 0, 0)');expect(geometry.play).toBe('');expect(geometry.nav).toBeLessThanOrEqual(height-(cdp?34:0));
 }
 if(cdp){
  // Chromium zoom provides a visual viewport shorter than the layout viewport;
  // the resize loop above covers toolbar-like changes without pinching.
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.2});
  const visible=await page.evaluate(()=>({visual:visualViewport!.height,layout:document.documentElement.clientHeight,bottom:document.querySelector('.movies-view')!.getBoundingClientRect().bottom,end:visualViewport!.height+visualViewport!.offsetTop}));
  expect(visible.visual).toBeLessThan(visible.layout);expect(visible.bottom).toBeGreaterThanOrEqual(visible.end-1);
  await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
 }
 await cdp?.detach();
 await page.goto('/#/collection');await expect(page.locator('.game-card').first()).toBeVisible();
 expect(await page.evaluate(()=>getComputedStyle(document.documentElement).backgroundColor)).toBe('rgb(25, 29, 28)');
});

for(const width of [390,1366])test(`Movies shares navigation geometry, actions and companion focus at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto('/#/movies/browse/tv');await expect(page.locator('.movies-poster').first()).toBeVisible();
 const nav=page.locator('.movies-navigation'),bar=nav.locator('.section-tabbar'),menu=nav.getByRole('button',{name:'Open menu',exact:true});
 await expect(bar.locator('.ui-tab')).toHaveText(['Home','Movies','TV Shows','My list','Study']);await expect(bar).toHaveAttribute('data-glass-tone','dark');
 const gap=await nav.evaluate(e=>{const b=e.querySelector('.section-tabbar')!.getBoundingClientRect(),m=e.querySelector('.section-menu')!.getBoundingClientRect();return m.left-b.right;});expect(gap).toBeGreaterThanOrEqual(8);
 await bar.getByRole('button',{name:'Study',exact:true}).focus();await page.keyboard.press('Tab');await expect(menu).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.locator('#menu')).toBeVisible();await expect(page.locator('#menu')).toHaveAttribute('data-glass-tone','dark');
 await page.keyboard.press('Escape');await expect(menu).toBeFocused();
 await page.evaluate(()=>{(document.activeElement as HTMLElement).blur();document.documentElement.dataset.input='pointer';});
 await bar.evaluate(e=>e.setAttribute('data-minimized','true'));await expect(menu).toHaveCSS('opacity','0');
 await menu.focus();await expect(menu).toHaveCSS('opacity','1');await expect(bar).toHaveCSS('opacity','1');
 await page.keyboard.press('Enter');await page.locator('#search').fill('snake');await expect(page).toHaveURL(/#\/collection$/);await page.keyboard.press('Escape');await expect(page.getByRole('link',{name:'Play Snake',exact:true})).toBeVisible();
});

for(const mode of ['flag','WebKit brands'])test(`${mode} selects one fallback surface without blurring its companion`,async({page})=>{
 if(mode==='WebKit brands')await page.addInitScript(()=>Object.defineProperty(navigator,'userAgentData',{value:undefined}));
 await page.goto(`/${mode==='flag'?'?glass=fallback':''}#/collection`);
 const bar=page.locator('.app-tabbar'),menu=page.locator('.app-menu');
 await expect(bar).toHaveAttribute('data-glass','frost');await expect(menu).toHaveAttribute('data-glass','frost');
 await expect(page.locator('.app-navigation .ui-scroll-edge')).toHaveCount(0);await expect(page.locator('.app-navigation .ui-glass-lens')).toHaveCount(0);
 for(const object of [bar,menu]){
  expect(await object.evaluate(e=>getComputedStyle(e).backdropFilter)).toContain('blur(4px)');
  expect(await object.locator('.ui-glass-glow').evaluate(e=>getComputedStyle(e).maskComposite.split(',').every(value=>value.trim()==='exclude'))).toBe(true);
 }
});

for(const feature of ['prefers-reduced-transparency','prefers-contrast','forced-colors'])test(`forced fallback gives ${feature} priority`,async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','CDP accessibility media emulation');
 const cdp=await context.newCDPSession(page);await cdp.send('Emulation.setEmulatedMedia',{features:[{name:feature,value:feature==='forced-colors'?'active':feature==='prefers-contrast'?'more':'reduce'}]});
 await page.goto('/?glass=fallback#/movies');
 await expect(page.locator('.movies-mobile-nav')).toHaveAttribute('data-glass','off');await expect(page.locator('.movies-menu')).toHaveAttribute('data-glass','off');
 await expect(page.locator('.movies-menu')).toHaveCSS('backdrop-filter','none');
 const solid=await page.locator('.movies-menu').evaluate(e=>({fill:getComputedStyle(e).backgroundColor,border:parseFloat(getComputedStyle(e).borderTopWidth)}));expect(solid.fill).toMatch(/^rgb\(/);expect(solid.border).toBeGreaterThanOrEqual(1);await cdp.detach();
});

for(const stuck of ['fetch','body','restore'])test(`a stalled catalog ${stuck} reaches retry and late data cannot replace the current TV route`,async({page})=>{
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
 await page.addInitScript(({stuck,catalog})=>{
  const original=window.fetch.bind(window);let first=true;
  window.fetch=async(input,init)=>{
   if(!String(input).includes('/movies/catalog.json')||!first)return original(input,init);
   first=false;
   if(stuck==='body')return {ok:true,json:()=>new Promise(resolve=>{(window as any).__releaseCatalog=()=>resolve(JSON.parse(catalog));})} as Response;
   return new Promise(resolve=>{(window as any).__releaseCatalog=()=>resolve(new Response(catalog,{headers:{'Content-Type':'application/json'}}));});
  };
 },{stuck,catalog});
 await page.goto('/#/movies');await expect(page.getByRole('heading',{name:'Opening the collection…'})).toBeVisible();
 await page.locator('.movies-mobile-nav').getByRole('button',{name:'TV Shows',exact:true}).click();
 if(stuck==='restore'){
  await page.clock.setSystemTime(new Date(Date.now()+30000));
  await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 }else await page.clock.fastForward(20001);
 await expect(page.getByRole('heading',{name:'The collection is unavailable'})).toBeVisible();await expect(page.locator('.movies-empty')).toContainText('timed out');
 await page.getByRole('button',{name:'Try again',exact:true}).click();await expect(page.getByRole('heading',{name:'TV Shows',exact:true})).toBeVisible();
 await page.evaluate(()=>(window as any).__releaseCatalog());await expect(page.getByRole('heading',{name:'TV Shows',exact:true})).toBeVisible();await expect(page).toHaveURL(/#\/movies\/browse\/tv$/);
});

for(const route of ['collection','movies'])test(`${route} fallback Menu ink retains 4.5:1 on black/white patterned content`,async({page})=>{
 await page.goto(`/?glass=fallback#/${route}`);const menu=page.locator(route==='collection'?'.app-menu':'.movies-menu');
 await expect(menu).toHaveAttribute('data-glass','frost');
 // High-frequency black and white exercise both ends of backdrop luminance.
 await page.evaluate(()=>{const art=document.createElement('div');art.style.cssText='position:fixed;inset:0;z-index:49;pointer-events:none;background:repeating-conic-gradient(#000 0% 25%,#fff 0% 50%) 0 0 / 24px 24px';(document.querySelector('.section-navigation:not(.app-navigation)')?.parentElement??document.body).append(art);});
 const actual=(await menu.screenshot({animations:'disabled'})).toString('base64');
 const hide=await page.addStyleTag({content:'.section-menu>.ui-icon{visibility:hidden!important}'});
 const backdrop=(await menu.screenshot({animations:'disabled'})).toString('base64');await hide.evaluate(e=>e.parentNode?.removeChild(e));
 await page.addStyleTag({content:'.section-menu,.section-menu::before{background:#000!important;color:#fff!important;backdrop-filter:none!important;box-shadow:none!important}.section-menu .ui-glass-glow,.section-menu .ui-glass-lens{display:none!important}'});
 const mask=(await menu.screenshot({animations:'disabled'})).toString('base64');
 const result=await page.evaluate(async({actual,backdrop,mask})=>{
  const decode=async(source:string)=>{const image=new Image();image.src='data:image/png;base64,'+source;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);return {data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};};
  const ink=await decode(actual),bg=await decode(backdrop),shape=await decode(mask);
  const lum=(data:Uint8ClampedArray,i:number)=>[.2126,.7152,.0722].reduce((l,w,c)=>{const v=data[i+c]/255;return l+w*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4);},0);
  let worst=Infinity,cores=0;
  // Only the central SVG, excluding the separate white rim.
  for(let y=Math.ceil(shape.height*.28);y<shape.height*.72;y++)for(let x=Math.ceil(shape.width*.28);x<shape.width*.72;x++){
   const i=(y*shape.width+x)*4;if(Math.min(...shape.data.slice(i,i+3))<250)continue;
   const a=lum(ink.data,i),b=lum(bg.data,i);worst=Math.min(worst,(Math.max(a,b)+.05)/(Math.min(a,b)+.05));cores++;
  }
  return {worst,cores};
 },{actual,backdrop,mask});
 expect(result.cores).toBeGreaterThan(20);expect(result.worst).toBeGreaterThanOrEqual(4.5);
});


test('Study opened from the Movies Menu returns focus to its visible companion',async({page})=>{
 await page.goto('/#/movies');await expect(page.locator('.movies-hero')).toBeVisible();
 const menu=page.locator('.movies-menu');await menu.click();await page.locator('#menu').getByRole('button',{name:'Study Mode',exact:true}).click();
 await expect(page.locator('#study-title')).toBeVisible();await page.getByRole('link',{name:'Games',exact:true}).click();
 await expect(menu).toBeFocused();await expect(page.locator('.movies-view')).toBeVisible();
});

test.describe('live Movies motion preference',()=>{
 test.use({isMobile:false,hasTouch:false,viewport:{width:1366,height:768},deviceScaleFactor:1});
 test('Menu changes rail motion immediately without recreating Movies',async({page})=>{
  const fixture=JSON.parse(catalog),movie=fixture.titles.find((title:any)=>title.kind==='movie');
  fixture.titles.push(...Array.from({length:18},(_,i)=>({...movie,id:`movie-motion-${i}`,name:`Motion fixture ${i}`})));
  await page.route('**/movies/catalog.json',route=>route.fulfill({json:fixture}));
  await page.goto('/#/movies');const rail=page.locator('[data-rail="movies-you-ll-love"]');await expect(rail).toBeVisible();
  await page.evaluate(()=>{const scroll=Element.prototype.scrollBy;(window as any).__scrollModes=[];Element.prototype.scrollBy=function(options:any,y?:number){if(this.classList.contains('ui-rail-row'))(window as any).__scrollModes.push(options.behavior);if(typeof options==='number')scroll.call(this,options,y??0);else (scroll as Function).call(this,options);};});
  for(const [enabled,direction,behavior] of [[true,'1','auto'],[false,'-1','smooth']] as const){
   // Scrolling to the rail can minimize navigation. Keyboard entry reveals it.
   await page.locator('.movies-mobile-nav [data-action="study"]').focus();await page.keyboard.press('Tab');await expect(page.locator('.movies-menu')).toBeFocused();await page.keyboard.press('Enter');
   await page.locator('#menu').getByRole('checkbox',{name:'Reduce motion',exact:true}).setChecked(enabled);await page.keyboard.press('Escape');
   await rail.hover();await rail.locator(`[data-scroll="${direction}"]`).click();
   await expect.poll(()=>page.evaluate(()=>(window as any).__scrollModes.at(-1))).toBe(behavior);
  }
 });
});

for(const press of [false,true])test(`dark selected tab retains 4.5:1 over white artwork${press?' while pressed':''}`,async({page})=>{
 await page.goto('/?glass=fallback#/movies');await expect(page.locator('.movies-hero')).toBeVisible();
 await page.evaluate(()=>{const art=document.createElement('div');art.style.cssText='position:fixed;inset:0;z-index:49;pointer-events:none;background:white';document.querySelector('.movies-view')!.append(art);});
 const tab=page.locator('.movies-mobile-nav [aria-pressed=true]');await tab.evaluate(e=>e.classList.add('contrast-target'));
 if(press){await tab.hover();await page.mouse.down();}
 const actual=(await tab.screenshot({animations:'disabled'})).toString('base64');
 const boxes=await tab.evaluate(e=>{const box=e.getBoundingClientRect();return [...e.querySelectorAll('.ui-icon,span')].map(child=>{const b=child.getBoundingClientRect();return {x:b.x-box.x,y:b.y-box.y,w:b.width,h:b.height};});});
 const hide=await page.addStyleTag({content:'.contrast-target>*{visibility:hidden!important}'});const backdrop=(await tab.screenshot({animations:'disabled'})).toString('base64');await hide.evaluate(e=>e.parentNode?.removeChild(e));
 await page.addStyleTag({content:'.contrast-target{color:white!important;background:black!important;text-shadow:none!important}.contrast-target>*{color:white!important;filter:none!important}'});
 const mask=(await tab.screenshot({animations:'disabled'})).toString('base64');
 const result=await page.evaluate(async({actual,backdrop,mask,boxes})=>{
  const read=async(source:string)=>{const image=new Image();image.src='data:image/png;base64,'+source;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d')!;ctx.drawImage(image,0,0);return {data:ctx.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height};};
  const a=await read(actual),b=await read(backdrop),m=await read(mask);let worst=Infinity,cores=0;
  const lum=(d:Uint8ClampedArray,i:number)=>[.2126,.7152,.0722].reduce((l,w,c)=>{const v=d[i+c]/255;return l+w*(v<=.04045?v/12.92:((v+.055)/1.055)**2.4);},0);
  for(const box of boxes)for(let y=Math.ceil(box.y*devicePixelRatio);y<Math.floor((box.y+box.h)*devicePixelRatio);y++)for(let x=Math.ceil(box.x*devicePixelRatio);x<Math.floor((box.x+box.w)*devicePixelRatio);x++){const i=(y*m.w+x)*4;if(Math.min(...m.data.slice(i,i+3))<250)continue;const ink=lum(a.data,i),bg=lum(b.data,i);worst=Math.min(worst,(Math.max(ink,bg)+.05)/(Math.min(ink,bg)+.05));cores++;}
  return {worst,cores};
 },{actual,backdrop,mask,boxes});
 if(press){await page.mouse.move(0,0);await page.mouse.up();}
 expect(result.cores).toBeGreaterThan(20);expect(result.worst).toBeGreaterThanOrEqual(4.5);
});
