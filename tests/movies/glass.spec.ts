import {test,expect,keyboardMode} from '../fixtures';
import type {Locator,Page,Route} from '@playwright/test';

// The Movies menus are Liquid Glass. The episode drawer is a glass sheet, the Up next card takes the sheet's surface, and the
// genre select is a glass capsule whose open list stays native. The Movies island and forced colours are checked alongside them.
const PHONE={width:390,height:844};
const DESKTOP={width:1440,height:900};
const ACCESSIBILITY_NOTE='Reduce Transparency is emulated through CDP, which only Chromium offers.';
const DRAWER={name:'Select episode',exact:true} as const;
const TRIGGER={name:'S1 · E1',exact:true} as const;

test.beforeEach(async({page})=>{
 // Existing playback coverage accepts each fresh third-party playback warning.
 await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>{await dialog.getByRole('button',{name:'Continue',exact:true}).click();});
 await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
 for(const url of ['https://framextv.cc/**','https://framextv.xyz/**'])
  await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'+(url==='https://framextv.cc/**'?'<script>parent.postMessage({event:"frameXTV:ready"},"*")</script>':'')}));
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

// Waits until the element's animations have finished, then reads its box: the layout box a user settles on.
async function settledBox(locator:Locator){
 await expect.poll(()=>locator.evaluate(el=>el.getAnimations({subtree:true}).length)).toBe(0);
 const box=await locator.boundingBox();
 if(!box)throw new Error('The element has no box');
 return box;
}
// Opens the episode drawer from the S1 · E1 control of the bundled series, and waits for it to settle.
async function openDrawer(page:Page,viewport=DESKTOP){
 await page.setViewportSize(viewport);
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await expect(page.getByRole('button',TRIGGER)).toBeVisible();
 await page.getByRole('button',TRIGGER).click();
 const drawer=page.getByRole('dialog',DRAWER);
 await expect(drawer).toBeVisible();
 await settledBox(drawer);
 return drawer;
}
// Plays the provider fixture's end of playback, which shows the Up next card for the next episode.
async function showUpNext(page:Page,viewport=DESKTOP){
 await page.setViewportSize(viewport);
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
 await page.frame({url:/framextv/})!.evaluate(()=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:100,duration:100},'*'));
 const overlay=page.getByRole('dialog',{name:'Up next'});
 await expect(overlay).toBeVisible();
 return overlay;
}
// The computed value of each system colour, read from a probe, so an expectation never hard-codes a palette.
async function systemColours(page:Page,names:string[]){
 return page.evaluate(names=>Object.fromEntries(names.map(name=>{const probe=document.createElement('span');probe.style.color=name;document.body.append(probe);const colour=getComputedStyle(probe).color;probe.remove();return [name,colour];})),names);
}

test('the episode drawer is a glass sheet with the sheet\'s blurred backdrop',async({page})=>{
 const drawer=await openDrawer(page);
 await expect(drawer).toHaveClass(/\bui-glass-sheet\b/);
 await expect(drawer).toHaveClass(/\bmovies-drawer\b/);
 expect(await drawer.getAttribute('class')).not.toMatch(/\bui-drawer\b/);
 expect(await drawer.evaluate(el=>getComputedStyle(el).backdropFilter)).toContain('blur(28px)');
});

test('at 390 px the episode drawer is a bottom sheet inset 8 px from the sides and the bottom',async({page})=>{
 const drawer=await openDrawer(page,PHONE);
 const box=await settledBox(drawer);
 expect(box.x).toBeCloseTo(8,0);
 expect(box.width).toBeCloseTo(374,0);
 expect(box.y+box.height).toBeCloseTo(836,0);
});

for(const width of [640,1440])test(`from ${width} px the episode drawer is a centred panel at most 600 px wide`,async({page})=>{
 const drawer=await openDrawer(page,{width,height:900});
 const box=await settledBox(drawer);
 expect(box.width).toBeLessThanOrEqual(600);
 expect(box.width).toBeCloseTo(Math.min(600,width-32),0);
 expect(box.x+box.width/2).toBeCloseTo(width/2,0);
});

test('on a phone the episode drawer takes the sheet\'s max height, 85 dvh',async({page})=>{
 const drawer=await openDrawer(page,PHONE);
 expect(parseFloat(await drawer.evaluate(el=>getComputedStyle(el).maxHeight))).toBeCloseTo(844*0.85,0);
});

test('from 640 px the episode drawer takes the sheet\'s max height, 760 px',async({page})=>{
 const drawer=await openDrawer(page,DESKTOP);
 expect(await drawer.evaluate(el=>getComputedStyle(el).maxHeight)).toBe('760px');
});

test('the drawer grows from the episode control that opened it',async({page})=>{
 const drawer=await openDrawer(page,DESKTOP);
 const origin=await drawer.evaluate(el=>el.style.getPropertyValue('--sheet-origin'));
 expect(origin).toMatch(/^\d+px \d+px$/);
 const [trigger,box]=await Promise.all([page.getByRole('button',TRIGGER).boundingBox(),settledBox(drawer)]);
 if(!trigger)throw new Error('The episode control has no box');
 const [x,y]=origin.split(' ').map(part=>parseFloat(part));
 // The origin is the trigger's centre measured from the sheet's corner, clamped to the sheet's box (src/ui/sheet.ts).
 const clamp=(value:number,size:number)=>Math.min(Math.max(value,0),size);
 expect(Math.abs(x-clamp(trigger.x+trigger.width/2-box.x,box.width))).toBeLessThanOrEqual(1);
 expect(Math.abs(y-clamp(trigger.y+trigger.height/2-box.y,box.height))).toBeLessThanOrEqual(1);
});

// WebKit reports a sheet's ::backdrop fade with no pseudo-element, on the open dialog itself. The dialog's own transitions never
// include background-color, so an animation of nothing but background-color on an open dialog is that fade.
const backdropFade=(animation:{pseudo:string;dialog:boolean;properties:string[]})=>animation.pseudo==='::backdrop'||(animation.pseudo===''&&animation.dialog&&animation.properties.every(key=>key==='backgroundColor'));
// Reduced motion leaves one animation, the sheet's ::backdrop colour fade. Every other animation in the document must be gone, and the backdrop
// may change opacity or background colour only, never a transform, translate or scale.
async function expectOnlyBackdropFade(page:Page){
 const animations=await page.evaluate(()=>document.getAnimations().map(animation=>{
  const effect=animation.effect as KeyframeEffect|null;
  const properties=[...new Set((effect?.getKeyframes()??[]).flatMap(frame=>Object.keys(frame)))].filter(key=>!['offset','easing','composite','computedOffset'].includes(key));
  return {pseudo:effect?.pseudoElement??'',dialog:effect?.target instanceof HTMLDialogElement&&effect.target.open,properties};
 }));
 expect(animations.filter(animation=>!backdropFade(animation)),'animations other than the backdrop fade').toEqual([]);
 for(const animation of animations)expect(animation.properties.every(key=>key==='opacity'||key==='backgroundColor'),`${animation.pseudo||'element'} animates ${animation.properties.join(', ')}`).toBe(true);
}
// The media query and the app's own setting are two ways into reduced motion. The setting puts .reduce-motion on <html> (src/main.ts).
for(const setting of ['media query','class'] as const)test(`with reduced motion (${setting}) the drawer opens with no movement`,async({page})=>{
 if(setting==='media query')await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize(DESKTOP);
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 if(setting==='class')await page.evaluate(()=>document.documentElement.classList.add('reduce-motion'));
 await page.getByRole('button',TRIGGER).click();
 const drawer=page.getByRole('dialog',DRAWER);
 await expect(drawer).toBeVisible();
 expect(await drawer.evaluate(el=>getComputedStyle(el).transitionProperty)).toBe('none');
 await expectOnlyBackdropFade(page);
});

test('more contrast makes the drawer an opaque panel with a 2 px edge',async({page})=>{
 await page.emulateMedia({contrast:'more'});
 const drawer=await openDrawer(page,PHONE);
 expect(await drawer.evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.backdropFilter,s.borderTopWidth];})).toEqual(['rgb(18, 18, 20)','none','2px']);
});

test('Reduce Transparency gives the drawer an opaque sheet with no blur (Chromium only)',async({page,browserName})=>{
 test.skip(browserName!=='chromium',ACCESSIBILITY_NOTE);
 await page.setViewportSize(PHONE);
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
 await page.getByRole('button',TRIGGER).click();
 const drawer=page.getByRole('dialog',DRAWER);
 await expect(drawer).toBeVisible();
 expect(await drawer.evaluate(el=>[getComputedStyle(el).backgroundColor,getComputedStyle(el).backdropFilter])).toEqual(['rgb(28, 28, 32)','none']);
});

test('forced colours give the drawer the system Canvas, CanvasText and a 2 px border',async({page})=>{
 await page.emulateMedia({forcedColors:'active'});
 const drawer=await openDrawer(page,PHONE);
 const system=await systemColours(page,['Canvas','CanvasText']);
 expect(await drawer.evaluate(el=>{const s=getComputedStyle(el);return {background:s.backgroundColor,border:s.borderTopColor,width:s.borderTopWidth};})).toEqual({background:system.Canvas,border:system.CanvasText,width:'2px'});
});

test('the idle season pill is a translucent fill, and only the sheet has a backdrop filter',async({page})=>{
 const drawer=await openDrawer(page,PHONE);
 expect(await drawer.evaluate(el=>[...el.querySelectorAll('*')].filter(child=>getComputedStyle(child).backdropFilter!=='none').length)).toBe(0);
 const pill=drawer.getByRole('button',{name:'Season 2',exact:true});
 const fill=await pill.evaluate(el=>getComputedStyle(el).backgroundColor);
 const alpha=parseFloat(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/.exec(fill)?.[1]??'1');
 expect(alpha).toBeGreaterThan(0);
 expect(alpha).toBeLessThan(1);
});

test('the current episode row is a white 700 title on a 16% rose fill, with a rose bar on its leading edge',async({page})=>{
 // The series from the drawer text fixture is used, since its episodes carry the runtime that draws the meta line.
 await page.setViewportSize(PHONE);
 await page.route('**/api/movies?*',route=>{
  const url=new URL(route.request().url());
  if(!url.searchParams.has('id'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  return route.fulfill({json:{title:DRAWER_TITLE(Number(url.searchParams.get('season')||1))}});
 });
 await page.goto('/#/movies/tv-90300/season/1/episode/1/play');
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await expect(drawer).toBeVisible();
 await settledBox(drawer);
 const current=drawer.locator('[aria-current="true"]');
 await expect(current.locator('small')).toBeVisible();
 expect(await current.locator('strong').evaluate(el=>{const s=getComputedStyle(el);return [s.color,s.fontWeight];})).toEqual(['rgb(255, 255, 255)','700']);
 expect(await current.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgba(255, 32, 86, 0.16)');
 // The bar is an inset shadow on the leading edge, so the row's content does not move.
 expect(await current.evaluate(el=>getComputedStyle(el).boxShadow)).toMatch(/rgb\(255, 32, 86\) 3px 0px 0px 0px inset/);
 expect(await current.locator('small').evaluate(el=>getComputedStyle(el).color)).toBe('rgb(228, 228, 231)');
 expect(await current.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(228, 228, 231)');
 // The row is a link, so hovering it must not turn the current row white: the link's hover colour would otherwise win over the base row colour.
 await current.hover();
 expect(await current.evaluate(el=>getComputedStyle(el).color)).toBe('rgb(228, 228, 231)');
});

test('the close button is the sheet\'s icon button, and the heading is the sheet\'s heading',async({page})=>{
 const drawer=await openDrawer(page,PHONE);
 const close=drawer.getByRole('button',{name:'Close episode list',exact:true});
 await expect(close).toHaveClass(/\bicon-button\b/);
 expect(await close.evaluate(el=>{const s=getComputedStyle(el);return [s.width,s.height,s.borderTopLeftRadius];})).toEqual(['44px','44px','50%']);
 const heading=drawer.getByRole('heading',{name:'Episodes',exact:true});
 expect(await heading.evaluate(el=>{const s=getComputedStyle(el);return [s.fontSize,s.fontWeight,s.color,s.letterSpacing];})).toEqual(['20px','600','rgb(255, 255, 255)','-0.2px']);
});

test('on open, focus goes to the current episode row',async({page})=>{
 const drawer=await openDrawer(page,PHONE);
 await expect(drawer.locator('[aria-current="true"]')).toBeFocused();
});

test('forced colours give the drawer\'s pills and rows a visible edge, and the current row a leading edge and an underlined title',async({page})=>{
 await page.emulateMedia({forcedColors:'active'});
 const drawer=await openDrawer(page,PHONE);
 const system=await systemColours(page,['ButtonText','CanvasText']);
 const pill=drawer.getByRole('button',{name:'Season 2',exact:true});
 expect(await pill.evaluate(el=>{const s=getComputedStyle(el);return {width:s.borderTopWidth,border:s.borderTopColor,text:s.color};})).toEqual({width:'2px',border:system.ButtonText,text:system.ButtonText});
 // The pressed season is marked by an underline as well as its fill, which forced colours drop.
 const pressed=drawer.locator('.movies-drawer-seasons .ui-pill[aria-pressed="true"]');
 await expect(pressed).toHaveCSS('text-decoration-line','underline');
 expect(await pressed.evaluate(el=>getComputedStyle(el).borderTopColor)).toBe(system.ButtonText);
 // The sheet's drag handle keeps its shape in forced colours, drawn in CanvasText.
 expect(await drawer.locator('.ui-drawer-handle').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(system.CanvasText);
 const row=drawer.locator('.movies-drawer-row').nth(1);
 expect(await row.evaluate(el=>{const s=getComputedStyle(el);return {width:s.borderTopWidth,style:s.borderTopStyle,border:s.borderTopColor};})).toEqual({width:'2px',style:'solid',border:system.ButtonText});
 // Forced colours drop the rose bar, so the current row's leading edge is a 4 px ButtonText border, and its title is underlined.
 const current=drawer.locator('[aria-current="true"]');
 expect(await current.evaluate(el=>{const s=getComputedStyle(el);return {width:s.borderLeftWidth,style:s.borderLeftStyle,border:s.borderLeftColor};})).toEqual({width:'4px',style:'solid',border:system.ButtonText});
 expect(await current.locator('strong').evaluate(el=>getComputedStyle(el).textDecorationLine)).toBe('underline');
});

test('a long season name wraps inside the drawer at 320 px, with no horizontal overflow',async({page})=>{
 // A season name that would run past a pill's edge. Its pill wraps, so the sheet does not scroll sideways.
 const longName='Season One, the Extraordinarily Long Season Title That Must Wrap Across Several Lines';
 const seasons=(season:number)=>({number:season,name:season===1?longName:'Season 2',episodes:season===1?[{number:1,name:'Pilot',overview:'The first episode.'}]:[]});
 await page.route('**/api/movies?*',route=>{
  if(!new URL(route.request().url()).searchParams.has('id'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  return route.fulfill({json:{title:{id:'tv-90500',kind:'tv',name:'Long Season Names',year:2024,genres:['Drama'],overview:'A fixture series.',poster:'https://image.tmdb.org/t/p/w500/fixture90500.jpg',seasons:[seasons(1),seasons(2)]}}});
 });
 await page.setViewportSize({width:320,height:640});
 await page.goto('/#/movies/tv-90500/season/1/episode/1/play');
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',DRAWER);
 await expect(drawer).toBeVisible();
 await settledBox(drawer);
 expect(await drawer.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 expect(await drawer.locator('.movies-drawer-seasons .ui-pill').count()).toBe(2);
 expect(await drawer.evaluate(el=>{const sheet=el.getBoundingClientRect();return [...el.querySelectorAll('.movies-drawer-seasons .ui-pill')].every(pill=>pill.getBoundingClientRect().right<=sheet.right+0.5);})).toBe(true);
});

// One page per layout: a card shown on a phone would otherwise stay in the page for the desktop check.
for(const viewport of [PHONE,DESKTOP])test(`the Up next card has the sheet's blurred glass surface at ${viewport.width} px`,async({page})=>{
 const overlay=await showUpNext(page,viewport);
 expect(await overlay.evaluate(el=>getComputedStyle(el).backdropFilter)).toContain('blur(28px)');
});

test('the Up next card has a 24 px corner in the card layout at 1440 px',async({page})=>{
 const overlay=await showUpNext(page,DESKTOP);
 expect(await overlay.evaluate(el=>getComputedStyle(el).borderTopLeftRadius)).toBe('24px');
});

test('Play now is the one white capsule, and Cancel a neutral glass capsule',async({page})=>{
 const overlay=await showUpNext(page);
 const play=overlay.getByRole('button',{name:'Play now',exact:true}),cancel=overlay.getByRole('button',{name:'Cancel',exact:true});
 expect(await play.evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color,s.borderTopLeftRadius];})).toEqual(['rgb(255, 255, 255)','rgb(0, 0, 0)','999px']);
 expect(await cancel.evaluate(el=>{const s=getComputedStyle(el);return [s.backgroundColor,s.color,s.borderTopLeftRadius];})).toEqual(['rgba(255, 255, 255, 0.12)','rgb(255, 255, 255)','999px']);
});

test('the Up next buttons show a white 2 px focus ring with a 2 px offset',async({page})=>{
 const overlay=await showUpNext(page);
 const play=overlay.getByRole('button',{name:'Play now',exact:true});
 // Warning acceptance uses a pointer; enter keyboard navigation before checking its focus ring.
 await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
 await expect(play).toBeFocused();
 // Up next focuses Play now by script, so the ring shows once the page has seen keyboard use.
 await keyboardMode(page);
 expect(await play.evaluate(el=>el.matches(':focus-visible'))).toBe(true);
 expect(await play.evaluate(el=>{const s=getComputedStyle(el);return [s.outlineStyle,s.outlineWidth,s.outlineColor,s.outlineOffset];})).toEqual(['solid','2px','rgb(255, 255, 255)','2px']);
});

test('the countdown bar is white on a translucent track',async({page})=>{
 const overlay=await showUpNext(page);
 const track=overlay.locator('.movies-next-bar'),bar=overlay.locator('.movies-next-bar>span');
 const alpha=parseFloat(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/.exec(await track.evaluate(el=>getComputedStyle(el).backgroundColor))?.[1]??'1');
 expect(alpha).toBeGreaterThan(0);
 expect(alpha).toBeLessThan(1);
 expect(await bar.evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(255, 255, 255)');
});

test('forced colours give the Up next buttons a ButtonText edge, and the countdown bar a CanvasText track and fill',async({page})=>{
 await page.emulateMedia({forcedColors:'active'});
 const overlay=await showUpNext(page);
 const system=await systemColours(page,['ButtonText','CanvasText']);
 const play=overlay.getByRole('button',{name:'Play now',exact:true}),cancel=overlay.getByRole('button',{name:'Cancel',exact:true});
 // Play now and Cancel set their own border colours at a higher weight than the forced rule, so the forced rules must match that weight to win.
 expect(await play.evaluate(el=>getComputedStyle(el).borderTopColor)).toBe(system.ButtonText);
 expect(await cancel.evaluate(el=>{const s=getComputedStyle(el);return {width:s.borderTopWidth,border:s.borderTopColor};})).toEqual({width:'2px',border:system.ButtonText});
 expect(await overlay.locator('.movies-next-bar').evaluate(el=>{const s=getComputedStyle(el);return {width:s.borderTopWidth,style:s.borderTopStyle,border:s.borderTopColor};})).toEqual({width:'1px',style:'solid',border:system.CanvasText});
 expect(await overlay.locator('.movies-next-bar>span').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe(system.CanvasText);
});
test('more contrast makes the Up next card opaque, like the sheets',async({page})=>{
 await page.emulateMedia({contrast:'more'});
 const overlay=await showUpNext(page);
 expect(await overlay.evaluate(el=>[getComputedStyle(el).backgroundColor,getComputedStyle(el).backdropFilter])).toEqual(['rgb(18, 18, 20)','none']);
});

test('Reduce Transparency makes the Up next card opaque with no blur (Chromium only)',async({page,browserName})=>{
 test.skip(browserName!=='chromium',ACCESSIBILITY_NOTE);
 await page.setViewportSize(DESKTOP);
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
 await page.frame({url:/framextv/})!.evaluate(()=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:100,duration:100},'*'));
 const overlay=page.getByRole('dialog',{name:'Up next'});
 await expect(overlay).toBeVisible();
 expect(await overlay.evaluate(el=>[getComputedStyle(el).backgroundColor,getComputedStyle(el).backdropFilter])).toEqual(['rgb(28, 28, 32)','none']);
});

// White text over a white frame. The provider frame is white, the card's labels are made transparent, and the pixels under each label
// are read from a screenshot. The ratio uses the brightest pixel under the label, the worst case, against the label's own colour.
for(const viewport of [DESKTOP,PHONE])test(`white text on the Up next card keeps 4.5:1 over a bright white frame at ${viewport.width} px`,async({page})=>{
 await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><body style="margin:0;background:#fff"><button>Play stream</button><script>parent.postMessage({event:"frameXTV:ready"},"*")</script>'}));
 const overlay=await showUpNext(page,viewport);
 const card=await overlay.boundingBox();
 if(!card)throw new Error('The Up next card has no box');
 const labels=await overlay.evaluate(root=>[...root.querySelectorAll<HTMLElement>('h2,.movies-next-countdown,.ui-btn.secondary')].map(el=>{
  const range=document.createRange();range.selectNodeContents(el);
  const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>[r.left,r.top,r.width,r.height]);
  const kind=el.matches('h2')?'title':el.matches('.movies-next-countdown')?'countdown':'cancel';
  return {kind,name:(el.textContent??'').trim().slice(0,40),color:getComputedStyle(el).color,rects};
 }));
 // The labels are hidden for the screenshot, so the pixels under them are the card's own glass and the frame behind it.
 await page.addStyleTag({content:'.movies-next :is(h2,.movies-next-countdown,.ui-btn.secondary){color:transparent!important}'});
 const png=(await page.screenshot({clip:card,type:'png'})).toString('base64');
 const measured=await page.evaluate(async({png,labels,card})=>{
  const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0));
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const context=canvas.getContext('2d',{willReadFrequently:true})!;context.drawImage(bitmap,0,0);
  const linear=(c:number)=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};
  const luminance=(r:number,g:number,b:number)=>0.2126*linear(r)+0.7152*linear(g)+0.0722*linear(b);
  // The screenshot holds the card at the device scale, so its width over the card's CSS width is the scale each rectangle is sampled at.
  const scale=bitmap.width/card.width;
  return labels.map(label=>{
   const ink=(label.color.match(/[\d.]+/g)??['255','255','255']).slice(0,3).map(Number);
   const text=luminance(ink[0],ink[1],ink[2]);
   let brightest=0,total=0,count=0;
   for(const [x,y,w,h] of label.rects){
    const sx=Math.max(0,Math.floor((x-card.x)*scale)),sy=Math.max(0,Math.floor((y-card.y)*scale));
    const data=context.getImageData(sx,sy,Math.max(1,Math.ceil(w*scale)),Math.max(1,Math.ceil(h*scale))).data;
    for(let i=0;i<data.length;i+=4){const l=luminance(data[i],data[i+1],data[i+2]);brightest=Math.max(brightest,l);total+=l;count++;}
   }
   const median=count?total/count:0;
   return {kind:label.kind,name:label.name,worst:(Math.max(text,brightest)+0.05)/(Math.min(text,brightest)+0.05),typical:(Math.max(text,median)+0.05)/(Math.min(text,median)+0.05),count};
  });
 },{png,labels,card});
 // Every label must be found and must sample pixels, so a label cannot pass by being skipped.
 expect(measured.map(label=>label.kind)).toEqual(['title','countdown','cancel']);
 for(const label of measured){
  console.log(`contrast ${viewport.width} px ${label.kind} (${label.name}): worst ${label.worst.toFixed(2)}:1, typical ${label.typical.toFixed(2)}:1 over ${label.count} pixels`);
  expect(label.count,`${label.kind} sampled pixels`).toBeGreaterThan(0);
  expect(label.worst,`${label.kind} worst-case contrast`).toBeGreaterThanOrEqual(4.5);
 }
});

test('the genre select is a glass capsule with a chevron, a 44 px minimum height and an inner focus ring',async({page})=>{
 await page.setViewportSize(DESKTOP);
 await page.goto('/#/movies');
 // The home's rails fail in this suite, so the page redraws once; the select is read after that redraw.
 await expect(page.locator('.movies-rails-status')).toBeVisible();
 const select=page.locator('#movies-genre');
 await expect(select).toBeVisible();
 await expect.poll(()=>select.evaluate(el=>{const s=getComputedStyle(el);return {radius:s.borderTopLeftRadius,fill:s.backgroundColor,height:s.minHeight,border:s.borderTopWidth,chevron:s.backgroundImage.includes('data:image/svg+xml')};})).toEqual({radius:'999px',fill:'rgba(255, 255, 255, 0.1)',height:'44px',border:'1px',chevron:true});
 await page.locator('#movies-search').focus();
 await page.keyboard.press('Tab');
 await expect(select).toBeFocused();
 // A select takes no outer ring. Keyboard focus draws an inner ring on its rounded edge, beside the select's own top highlight.
 await expect.poll(()=>select.evaluate(el=>{const s=getComputedStyle(el);return {outline:s.outlineStyle,shadow:s.boxShadow};})).toEqual({outline:'none',shadow:expect.stringContaining('rgba(255, 255, 255, 0.7) 0px 0px 0px 1px inset')});
 expect(await select.evaluate(el=>getComputedStyle(el).boxShadow)).toContain('rgba(255, 255, 255, 0.18) 0px 1px 0px 0px inset');
 // The open list is the browser's own: the control is still a select with its options, and a choice still sets the genre.
 await expect(select).toHaveJSProperty('tagName','SELECT');
 const choice=(await select.locator('option').allTextContents())[1];
 await select.selectOption(choice);
 await expect(select).toHaveValue(choice);
});

test('forced colours give the genre select the browser\'s own arrow, with a 2 px ButtonText edge',async({page})=>{
 await page.emulateMedia({forcedColors:'active'});
 await page.setViewportSize(DESKTOP);
 await page.goto('/#/movies');
 // The home's rails fail in this suite, so the page redraws once; the select is read after that redraw.
 await expect(page.locator('.movies-rails-status')).toBeVisible();
 const select=page.locator('#movies-genre');
 await expect(select).toBeVisible();
 const system=await systemColours(page,['ButtonText']);
 // Forced colours drop the painted chevron, so the select takes the browser's own arrow: auto appearance and no background image.
 await expect.poll(()=>select.evaluate(el=>{const s=getComputedStyle(el);return {appearance:s.appearance,image:s.backgroundImage,width:s.borderTopWidth,border:s.borderTopColor};})).toEqual({appearance:'auto',image:'none',width:'2px',border:system.ButtonText});
});
test('forced colours give the Movies island its pill outline and underline the current tab',async({page})=>{
 await page.emulateMedia({forcedColors:'active'});
 await page.setViewportSize(PHONE);
 await page.goto('/#/movies');
 const bar=page.locator('.movies-view nav.ui-tabbar').first();
 await expect(bar).toBeVisible();
 const system=await systemColours(page,['CanvasText']);
 expect(await bar.evaluate(el=>{const s=getComputedStyle(el,'::after');return [s.outlineStyle,s.outlineWidth,s.outlineColor];})).toEqual(['solid','2px',system.CanvasText]);
 // The island re-renders, so the current tab is read through a fresh locator that waits for it, not through a handle taken earlier.
 await expect(bar.locator('.ui-tab[aria-current="page"],.ui-tab[aria-pressed="true"]').first()).toHaveCSS('text-decoration-line','underline');
});

// The episode drawer's text, measured over the frame behind it. The frames are the watch page's dark fixture (a dark ground with bright shapes,
// so the glass has something to blur) and a white frame. Each item's text is read, then hidden, and the brightest pixel under its glyph boxes
// is the worst case, which is how the Up next card's labels are measured.
const DARK_FRAME='<!doctype html><html><head><meta charset="utf-8"><title>Provider fixture</title><style>html,body{margin:0;height:100%;overflow:hidden;color:#fff;font:600 28px Arial,sans-serif}body{background:radial-gradient(circle at 18% 28%,#ff6b6b 0 9%,transparent 10%),radial-gradient(circle at 74% 34%,#4cc9f0 0 13%,transparent 14%),radial-gradient(circle at 36% 78%,#ffd166 0 11%,transparent 12%),repeating-linear-gradient(60deg,#0b1320 0 38px,#1d3557 38px 76px),#0b1320}.label{position:absolute;left:6%;top:54%;text-shadow:0 2px 8px #000}button{position:absolute;left:6%;bottom:6%;padding:10px 16px;font:600 16px Arial;background:#fff;color:#000;border:0;border-radius:6px}</style></head><body><div class="label">Provider fixture</div><button>Play stream</button><script>parent.postMessage({event:"frameXTV:ready"},"*")</script>';
const WHITE_FRAME='<!doctype html><html><head><meta charset="utf-8"><title>Provider fixture</title><style>html,body{margin:0;height:100%;background:#fff;overflow:hidden}button{position:absolute;left:6%;bottom:6%;padding:10px 16px;font:600 16px Arial;background:#fff;color:#000;border:0}</style></head><body><button>Play stream</button><script>parent.postMessage({event:"frameXTV:ready"},"*")</script>';
const DRAWER_EPISODES=[
 {name:'heading',selector:'.movies-drawer-head h2'},
 {name:'pill-pressed',selector:'.movies-drawer-seasons .ui-pill[aria-pressed="true"]'},
 {name:'pill-idle',selector:'.movies-drawer-seasons .ui-pill[aria-pressed="false"]'},
 {name:'chip-current',selector:'.movies-drawer-row[aria-current="true"] .ui-chip'},
 {name:'chip-other',selector:'.movies-drawer-row:not([aria-current]) .ui-chip'},
 {name:'title-current',selector:'.movies-drawer-row[aria-current="true"] strong'},
 {name:'meta-current',selector:'.movies-drawer-row[aria-current="true"] small'},
 {name:'title-other',selector:'.movies-drawer-row:not([aria-current]) strong'},
 {name:'meta-other',selector:'.movies-drawer-row:not([aria-current]) small'},
];
// The loading line has no retry button, so the loading state checks four items. The error state adds the retry button.
const DRAWER_LOADING=[
 {name:'heading',selector:'.movies-drawer-head h2'},
 {name:'pill-pressed',selector:'.movies-drawer-seasons .ui-pill[aria-pressed="true"]'},
 {name:'pill-idle',selector:'.movies-drawer-seasons .ui-pill[aria-pressed="false"]'},
 {name:'status',selector:'.movies-episodes-status'},
];
const DRAWER_ERROR=[...DRAWER_LOADING,{name:'retry',selector:'.movies-drawer-retry'}];
// A series with a season that loads on request. Each episode has its runtime and air date, so the meta line is drawn.
const DRAWER_TITLE=(season:number)=>({id:'tv-90300',kind:'tv',name:'Contrast Series',year:2024,genres:['Drama'],overview:'A fixture series for the drawer contrast.',poster:'https://image.tmdb.org/t/p/w500/fixture90300.jpg',seasons:[
 {number:1,name:'Season 1',episodes:season===1?[{number:1,name:'Pilot',overview:'The first episode.',runtime:42,airDate:'2024-01-01'},{number:2,name:'Second Episode',overview:'Still the first season.',runtime:44,airDate:'2024-01-08'}]:[]},
 {number:2,name:'Season 2',episodes:season===2?[{number:1,name:'Second Season Opener',overview:'The second season begins.',runtime:50,airDate:'2025-01-01'}]:[]}
]});
// Reads each present item's colour and glyph boxes, hides the text, screenshots the container, and returns the worst and typical ratios.
type DrawerItem={name:string;missing:boolean;colour:string;worst:number;typical:number;count:number};
// An item whose selector is not on the page comes back missing, with no pixels, so it fails the check rather than dropping out of it.
async function glyphContrast(page:Page,container:string,items:{name:string;selector:string}[]):Promise<DrawerItem[]>{
 const box=await page.locator(container).boundingBox();
 if(!box)throw new Error(`${container} has no box`);
 const read=await page.locator(container).evaluate((root,items)=>items.map(item=>{
  const el=root.querySelector<HTMLElement>(item.selector);
  if(!el)return {name:item.name,selector:item.selector,missing:true,colour:'',rects:[] as number[][]};
  const range=document.createRange();range.selectNodeContents(el);
  const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0).map(r=>[r.left,r.top,r.width,r.height]);
  return {name:item.name,selector:item.selector,missing:false,colour:getComputedStyle(el).color,rects};
 }),items);
 const present=read.filter(item=>!item.missing);
 const style=await page.addStyleTag({content:present.map(item=>`${container} ${item.selector}{color:transparent!important}`).join('')});
 const png=(await page.screenshot({clip:box,type:'png'})).toString('base64');
 await style.evaluate(node=>(node as Element).remove());
 const measured=await page.evaluate(async({png,present,box})=>{
  const bytes=Uint8Array.from(atob(png),c=>c.charCodeAt(0));
  const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const context=canvas.getContext('2d',{willReadFrequently:true})!;context.drawImage(bitmap,0,0);
  const linear=(c:number)=>{c/=255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};
  const luminance=(r:number,g:number,b:number)=>0.2126*linear(r)+0.7152*linear(g)+0.0722*linear(b);
  // The screenshot holds the container at the device scale, so its width over the container's CSS width is the scale each rectangle is sampled at.
  const scale=bitmap.width/box.width;
  return present.map(item=>{
   const ink=(item.colour.match(/[\d.]+/g)??['255','255','255']).slice(0,3).map(Number);
   const text=luminance(ink[0],ink[1],ink[2]);
   let brightest=0,total=0,count=0;
   for(const [x,y,w,h] of item.rects){
    const data=context.getImageData(Math.max(0,Math.floor((x-box.x)*scale)),Math.max(0,Math.floor((y-box.y)*scale)),Math.max(1,Math.ceil(w*scale)),Math.max(1,Math.ceil(h*scale))).data;
    for(let i=0;i<data.length;i+=4){const l=luminance(data[i],data[i+1],data[i+2]);brightest=Math.max(brightest,l);total+=l;count++;}
   }
   const median=count?total/count:0;
   const ratio=(a:number,b:number)=>(Math.max(a,b)+0.05)/(Math.min(a,b)+0.05);
   return {name:item.name,colour:item.colour,worst:ratio(text,brightest),typical:ratio(text,median),count};
  });
 },{png,present,box});
 return read.map(item=>{
  const found=measured.find(result=>result.name===item.name);
  return found?{...found,missing:false}:{name:item.name,missing:true,colour:'',worst:0,typical:0,count:0};
 });
}
async function expectDrawerText(page:Page,items:{name:string;selector:string}[],state:string){
 const results=await glyphContrast(page,'dialog.movies-drawer',items);
 // A selector that is not on the page fails its state, so no item can drop out of the check unnoticed.
 expect(results.filter(item=>item.missing).map(item=>item.name),`${state}: items not on the page`).toEqual([]);
 expect(results.map(item=>item.name),`${state}: items measured`).toEqual(items.map(item=>item.name));
 for(const item of results){
  console.log(`contrast ${state} ${item.name} (${item.colour}): worst ${item.worst.toFixed(2)}:1, typical ${item.typical.toFixed(2)}:1 over ${item.count} pixels`);
  expect(item.count,`${state} ${item.name} sampled pixels`).toBeGreaterThan(0);
  expect(item.worst,`${state} ${item.name} worst-case contrast`).toBeGreaterThanOrEqual(4.5);
 }
}
for(const frame of ['dark','white'] as const)for(const width of [390,1440])test(`the episode drawer's text keeps 4.5:1 over a ${frame} frame at ${width} px`,async({page})=>{
 await page.setViewportSize({width,height:width>800?900:844});
 await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:frame==='dark'?DARK_FRAME:WHITE_FRAME}));
 // The first request for season 2 is held, so the loading line can be read; the next answers as a failure, so the error line and its retry show.
 const held:Route[]=[];
 await page.route('**/api/movies?*',route=>{
  const url=new URL(route.request().url());
  if(!url.searchParams.has('id'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  const season=Number(url.searchParams.get('season')||1);
  if(season===2){if(!held.length){held.push(route);return;}return route.fulfill({status:502,json:{error:'metadata_unavailable'}});}
  return route.fulfill({json:{title:DRAWER_TITLE(season)}});
 });
 await page.goto('/#/movies/tv-90300/season/1/episode/1/play');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await expect(drawer).toBeVisible();
 await settledBox(drawer);
 await expectDrawerText(page,DRAWER_EPISODES,'episode list');
 await drawer.getByRole('button',{name:'Season 2',exact:true}).click();
 await expect(drawer.getByRole('status')).toContainText('Loading');
 await expectDrawerText(page,DRAWER_LOADING,'loading');
 await held[0].fulfill({status:502,json:{error:'metadata_unavailable'}});
 await expect(drawer.getByRole('status')).toContainText('temporarily unavailable');
 await expectDrawerText(page,DRAWER_ERROR,'error');
});
