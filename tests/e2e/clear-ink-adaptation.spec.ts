import {test,expect} from '../fixtures';
test.use({viewport:{width:390,height:844},hasTouch:true});
test('frosted sheet headings and secondary actions keep white ink over dark and light content without outlines',async({page})=>{
 await page.goto('/#/collection');
 await page.addStyleTag({content:'#content *{visibility:hidden!important}#content,body{background:#050505!important}'});
 await page.locator('.app-navigation .section-menu').click();
 for(const target of ['#menu h2','#open-accounts','#open-leaderboards']){
  await expect.poll(()=>page.locator(target).evaluate(e=>getComputedStyle(e.querySelector('.glass-label')??e).color)).toBe('rgb(255, 255, 255)');
 }
 await page.keyboard.press('Escape');
 await page.addStyleTag({content:'#content,body{background:#fafafa!important}'});
 await page.locator('.app-navigation .section-menu').click();
 // #92's dark frost supplies contrast itself, so sheet ink stays white.
 for(const target of ['#menu h2','#open-accounts','#open-leaderboards']){
  await expect.poll(()=>page.locator(target).evaluate(e=>getComputedStyle(e.querySelector('.glass-label')??e).color)).toBe('rgb(255, 255, 255)');
  await expect(page.locator(target)).toHaveCSS('-webkit-text-stroke-width','0px');
 }
 await expect(page.locator('#menu .glass-vector-halo')).toHaveCount(0);
});
test('live canvas ink stays white across bright and dark frames',async({page})=>{
 await page.goto('/#/game/neon-coil');await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.locator('.nc-canvas').evaluate(old=>{
  const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;canvas.className='nc-canvas';old.replaceWith(canvas);
  canvas.getContext('2d')!.fillStyle='#fff';canvas.getContext('2d')!.fillRect(0,0,390,844);
 });
 const ink=page.locator('.game-hud strong');
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await page.locator('.nc-canvas').evaluate(e=>{(e as HTMLElement).style.opacity='0';(e.parentElement as HTMLElement).style.background='#000';});
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await page.locator('.nc-canvas').evaluate(e=>(e as HTMLElement).style.opacity='1');
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await page.locator('.nc-canvas').evaluate(e=>{const c=e as HTMLCanvasElement;const ctx=c.getContext('2d')!;ctx.fillStyle='#000';ctx.fillRect(0,0,c.width,c.height);});
 await expect.poll(()=>ink.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(255, 255, 255)');
 await expect(ink).toHaveCSS('-webkit-text-stroke-width','0px');
});

// The dark theme's smoked navigation keeps white ink. The light theme's is Apple Music's milky glass with grey ink (below).
for(const fallback of [false,true])test(`navigation icons and labels stay white (${fallback?'fallback':'native'})`,async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});
 await page.goto(`/${fallback?'?glass=fallback':''}#/collection`);
 await page.locator('.app-tabbar .ui-tab').first().focus();
 await page.addStyleTag({content:'#content *{visibility:hidden!important}#content{background:transparent!important}'});
 const icons=page.locator('.app-navigation>.arcade-glass svg.ui-icon');
 await expect(icons).toHaveCount(6);
 // C30 draws the selected tab in one fixed accent, and every other glyph and label stays white. The WebGL lens keeps the accent everywhere.
 // The CSS fallback cannot hold the accent at 3:1 over bright art, so where glass-ink flags bright art under the label (data-glass-halo),
 // the selected tab turns white with the doubled dark .85 rim, as safari-shell.spec.ts's white-artwork test needs. Over normal art it keeps the accent.
 const selected='.app-tabbar .ui-tab:is([aria-current=page],[aria-pressed=true])';
 // MOTION-10: the WebGL bar eases its tab ink (colour, 200 ms, f8dd2db1), so the lens taking the bar over can still be
 // easing the accent here: each one-off colour read waits until no colour transition runs in the bar for two frames.
 const inkSettled=()=>expect.poll(()=>page.locator('.app-tabbar').evaluate(async el=>{
  const frame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
  const easing=()=>el.getAnimations({subtree:true}).some(a=>a.playState==='running'&&(a as CSSTransition).transitionProperty==='color');
  if(easing())return false;await frame();if(easing())return false;await frame();return !easing();
 })).toBe(true);
 await inkSettled();
 const accent=await page.locator(`${selected}>span`).evaluate(e=>getComputedStyle(e).color);
 expect(accent).not.toBe('rgb(255, 255, 255)');
 for(const [background,labelColor] of [['#fff','rgb(255, 255, 255)'],['#000','rgb(255, 255, 255)'],['#fff','rgb(255, 255, 255)']]){
  await page.evaluate(background=>{document.body.style.background=background;document.documentElement.style.background=background;dispatchEvent(new Event('resize'));},background);
  await expect.poll(()=>page.locator('.app-tabbar .ui-tab:not([aria-current=page],[aria-pressed=true])>span').first().evaluate(e=>getComputedStyle(e).color)).toBe(labelColor);
  // The bare #fff body is bright art: glass-ink flags it with the halo. The #000 body is normal art: no flag.
  const bright=fallback&&background==='#fff',ink=bright?'rgb(255, 255, 255)':accent;
  // LOOK-11: the WebGL bar inks its selected tab from the art as soon as it is painted (section-lens.ts requestInk), so over
  // the bare #fff body the native accent is the deeper blue that keeps 2:1 against its lighter pill (an adaptive blue, as
  // clear-glass.spec pins it), where this one-off read used to land before the ink did. The label and the glyph share it.
  const blue=(color:string)=>{const [r,g,b]=(color.match(/\d+/g)??[]).map(Number);return b>=200&&b>Math.max(r,g);};
  if(fallback)await expect.poll(()=>page.locator(`${selected}>span`).evaluate(e=>getComputedStyle(e).color)).toBe(ink);
  else await expect.poll(async()=>blue(await page.locator(`${selected}>span`).evaluate(e=>getComputedStyle(e).color))).toBe(true);
  if(fallback)expect(await page.locator(`${selected}>span`).evaluate(e=>({halo:e.hasAttribute('data-glass-halo'),rim:getComputedStyle(e).textShadow})))
   .toEqual({halo:bright,rim:'rgba(0, 0, 0, 0.85) 0px 0px 1px, rgba(0, 0, 0, 0.85) 0px 0px 1px'});
  await expect.poll(()=>icons.evaluateAll((es,selected)=>es.map(e=>e.closest(selected)?'accent':getComputedStyle(e).color),selected)).toEqual(Array(await icons.count()).fill('rgb(255, 255, 255)').map((white,index)=>index===0?'accent':white));
  await inkSettled();
  const label=await page.locator(`${selected}>span`).evaluate(e=>getComputedStyle(e).color);
  expect(await page.locator(`${selected}>svg.ui-icon`).evaluate(e=>getComputedStyle(e).color)).toBe(fallback?ink:label);
  if(!fallback)expect(blue(label),label).toBe(true);
  expect(await icons.evaluateAll(es=>es.every(e=>!(e as HTMLElement).style.getPropertyValue('--glass-adaptive-ink')))).toBe(true);
 }
 // The collapsed dock copies the selected icon and must keep the same colour.
 await page.evaluate(()=>{(document.activeElement as HTMLElement)?.blur();document.querySelector('.app-tabbar')!.setAttribute('data-minimized','true');});
 await expect(page.locator('.app-navigation .ui-tabbar-mini')).toBeVisible();
 // MOTION-7: was white. Apple's compact circle keeps the selected tab's accent glyph (Charlie's video, 34.25 s: the Home
 // glyph in its tab's blue), so the copy now keeps the selected icon's own colour: the accent, or white with the rim where
 // the CSS fallback flagged bright art (the last body here is #fff).
 await expect(page.locator('.app-navigation .ui-tabbar-mini svg')).toHaveCSS('color',fallback?'rgb(255, 255, 255)':accent);
});

test('icon palette still respects high contrast and forced colours',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});
 await page.goto('/#/collection');
 const menu=page.locator('.app-navigation .section-menu'),icon=menu.locator('svg.ui-icon');
 await expect(icon).toHaveCSS('color','rgb(255, 255, 255)');
 await page.emulateMedia({contrast:'more'});
 await expect(menu).toHaveAttribute('data-glass','off');
 await expect(icon).toHaveCSS('color',await menu.evaluate(e=>getComputedStyle(e).color));
 await page.emulateMedia({contrast:'no-preference',forcedColors:'active'});
 await expect(menu).toHaveAttribute('data-glass','off');
 await expect(icon).toHaveCSS('color',await menu.evaluate(e=>getComputedStyle(e).color));
 await page.emulateMedia({forcedColors:'none'});
 await expect(menu).not.toHaveAttribute('data-glass','off');
 await expect(icon).toHaveCSS('color','rgb(255, 255, 255)');
});

// LOOK-6 (Charlie's 23:10Z feedback, Apple's dark still): the dark menu circle is the bar's see-through smoke, .125 of
// white over the art, no longer #92's near-black .36 veil. Its white glyph must keep 4.5:1 over that glass, or carry the
// dark halo where the art behind it is bright; glass off stays opaque.
test('the dark menu circle\'s smoked glass keeps its white glyph at 4.5:1 or halos it',async({page})=>{
 await page.emulateMedia({colorScheme:'dark'});
 await page.goto('/#/collection');
 const menu=page.locator('.app-navigation .section-menu'),icon=menu.locator('svg.ui-icon');
 await expect(icon).toHaveCSS('color','rgb(255, 255, 255)');
 await expect.poll(()=>menu.evaluate(e=>getComputedStyle(e,'::before').backgroundColor)).toBe('rgba(255, 255, 255, 0.125)');
 // White ink's contrast over the lightest glass pixel under the glyph, the glyph itself hidden.
 const glass=async()=>{
  const hide=await page.addStyleTag({content:'.app-navigation .section-menu svg{visibility:hidden!important}'});
  const box=(await icon.boundingBox())!,png=(await page.screenshot({clip:box,scale:'css'})).toString('base64');
  await hide.evaluate(e=>(e as Element).remove());
  return page.evaluate(async png=>{
   const i=new Image();i.src='data:image/png;base64,'+png;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;
   const x=c.getContext('2d')!;x.drawImage(i,0,0);const d=x.getImageData(0,0,c.width,c.height).data;
   const lum=(r:number,g:number,b:number)=>[r,g,b].reduce((l,v,k)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][k];},0);
   let top=0;for(let k=0;k<d.length;k+=4)top=Math.max(top,lum(d[k],d[k+1],d[k+2]));
   return 1.05/(top+.05);
  },png);
 };
 const halo=()=>icon.evaluate(e=>e.hasAttribute('data-glass-halo'));
 // Our dark page: the smoke over it keeps the plain white glyph far above 4.5:1.
 const page0=await glass();
 expect(page0).toBeGreaterThanOrEqual(4.5);
 for(const [color,bright] of [['#000',false],['#777',true],['#fff',true]] as const){
  await page.evaluate(color=>{document.getElementById('menu-ink-patch')?.remove();const p=document.createElement('div');p.id='menu-ink-patch';
   p.style.cssText=`position:fixed;inset:auto 0 0;height:160px;z-index:1;pointer-events:none;background:${color}`;document.body.append(p);},color);
  await expect.poll(halo,color).toBe(bright);
  const contrast=await glass();
  // Over black the smoke reads about 32 (16:1); over mid grey and white it drops under 4.5:1, so the halo carries it.
  if(!bright)expect(contrast,color).toBeGreaterThanOrEqual(4.5);
  else expect(contrast,color).toBeLessThan(4.5);
 }
 // LOOK-7 (#24 review of LOOK-6, I1): a live switch to light with the bright art still under the circle must leave the light
 // circle's grey glyph exactly as a fresh light load draws it (the approved light look): no dark halo, no adaptive ink.
 const glyph=()=>icon.evaluate(e=>({ink:e.classList.contains('glass-ink'),halo:e.hasAttribute('data-glass-halo'),filter:getComputedStyle(e).filter,color:getComputedStyle(e).color}));
 await page.emulateMedia({colorScheme:'light'});
 await expect.poll(glyph).toEqual({ink:false,halo:false,filter:'none',color:'rgb(110, 110, 115)'});
 await page.emulateMedia({colorScheme:'dark'});
 await expect.poll(halo).toBe(true);
 await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
 await expect(menu).toHaveAttribute('data-glass','off');
 expect(await menu.evaluate(e=>getComputedStyle(e).backgroundColor)).toMatch(/^rgb\(\d+, \d+, \d+\)$/);
});

// Apple Music's light bar is pale, see-through frost: unselected glyphs are mid-grey and labels a dark grey (about 45 in
// Apple's light still, #333336 here), which must still read at 4.5:1 over the lens's frost where it is darkest, over black art.
test('the light theme\'s milky navigation keeps Apple\'s grey ink legible at 4.5:1',async({page})=>{
 await page.emulateMedia({colorScheme:'light'});
 await page.goto('/#/collection');
 const bar=page.locator('.app-tabbar');
 await expect(bar).toHaveAttribute('data-section-lens','webgl');
 await page.addStyleTag({content:'#content *{visibility:hidden!important}#content,body,html{background:#000!important}'});
 const label=bar.locator('.ui-tab:not([aria-current=page])>span').first();
 await expect.poll(()=>label.evaluate(e=>getComputedStyle(e).color)).toBe('rgb(51, 51, 54)');
 await expect(bar.locator('.ui-tab:not([aria-current=page]) svg.ui-icon').first()).toHaveCSS('color','rgb(110, 110, 115)');
 const contrast=()=>bar.locator('canvas.section-lens').evaluate((surface,index)=>{
  const canvas=surface as HTMLCanvasElement,rect=canvas.getBoundingClientRect(),sx=canvas.width/rect.width,sy=canvas.height/rect.height;
  const lum=(rgb:number[])=>rgb.reduce((l,v,i)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
  const span=canvas.closest('.app-tabbar')!.querySelectorAll('.ui-tab:not([aria-current=page])>span')[index]!,box=span.getBoundingClientRect();
  const ink=lum(getComputedStyle(span).color.match(/[\d.]+/g)!.slice(0,3).map(Number));
  const data=canvas.getContext('2d')!.getImageData(Math.round((box.left-rect.left)*sx),Math.round((box.top-rect.top)*sy),Math.max(1,Math.round(box.width*sx)),Math.max(1,Math.round(box.height*sy))).data;
  let lowest=Infinity;
  for(let i=0;i<data.length;i+=4)if(data[i+3]>250)lowest=Math.min(lowest,(lum([data[i],data[i+1],data[i+2]])+.05)/(ink+.05));
  return lowest;
 },0);
 await expect.poll(contrast).toBeGreaterThanOrEqual(4.5);
});

test('game icons stay white across canvas changes and repeated menu opens',async({page})=>{
 await page.goto('/#/game/neon-coil');await page.getByRole('button',{name:'Play',exact:true}).click();
 await page.locator('.nc-canvas').evaluate(old=>{
  const canvas=document.createElement('canvas');canvas.width=390;canvas.height=844;canvas.className='nc-canvas';old.replaceWith(canvas);
 });
 for(const [background,labelColor] of [['#fff','rgb(255, 255, 255)'],['#000','rgb(255, 255, 255)'],['#fff','rgb(255, 255, 255)']]){
  await page.locator('.nc-canvas').evaluate((e,color)=>{const c=e as HTMLCanvasElement,ctx=c.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,c.width,c.height);},background);
  await expect.poll(()=>page.locator('.game-hud strong').evaluate(e=>getComputedStyle(e).color)).toBe(labelColor);
  await expect(page.locator('#game-menu svg')).toHaveCSS('color','rgb(255, 255, 255)');
  await expect(page.locator('.nc-chevrons')).toHaveCSS('color','rgb(255, 255, 255)');
  await page.locator('#game-menu').click();
  await expect(page.locator('#game-options .sheet-close-glass svg')).toHaveCSS('color','rgb(255, 255, 255)');
  await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  await expect(page.locator('#game-menu')).toBeFocused();
 }
});
