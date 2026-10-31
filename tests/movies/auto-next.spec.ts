import {test,expect} from '../fixtures';
import {readFileSync} from 'node:fs';
import type {Page} from '@playwright/test';
const route=(season=1,episode=1)=>`/#/movies/tv-19885/season/${season}/episode/${episode}/play`;
const overlay=(page:Page)=>page.getByRole('dialog',{name:'Up next'});
async function telemetry(page:Page,currentTime=100,duration=100){await page.frame({url:/framextv/})!.evaluate(({currentTime,duration})=>parent.postMessage({event:'frameXTV:timeupdate',currentTime,duration},'*'),{currentTime,duration});}
async function open(page:Page,url=route()){await page.goto(url);await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();await page.clock.install();}
// The countdown runs on the test's clock. Pausing it first makes each runFor exactly one tick, so no tick can land before a check reads it.
async function ended(page:Page){await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await telemetry(page);await expect(overlay(page)).toBeVisible();}

test.beforeEach(async({page})=>{
 // Existing playback coverage accepts each fresh third-party playback warning.
 await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>{await dialog.getByRole('button',{name:'Continue',exact:true}).click();});
 await page.route('https://framextv.cc/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button><script>parent.postMessage({event:"frameXTV:ready"},"*")</script>'}));
 for(const origin of ['https://framextv.xyz'])await page.route(origin+'/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
 await page.route('https://image.tmdb.org/**',r=>r.abort());
 await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

test('end shows the next title, countdown and keyboard focus; Cancel stops and restores focus',async({page})=>{
 await open(page);
 // The countdown must not tick before its first value is read, so time holds here until runFor advances it.
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));await ended(page);await expect(overlay(page)).toContainText('Up next: S1 · E2 — The Blind Banker');await expect(overlay(page)).toContainText('Playing in 10');await expect(page.getByRole('button',{name:'Play now',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.clock.runFor(11000);await expect(page).toHaveURL(/season\/1\/episode\/1\/play$/);await expect(overlay(page)).toBeHidden();
 // Cancel returns focus to the element that had it before Up next took it: here the title heading, which the page focuses when the watch page opens.
 await expect(page.locator('.movies-player>h1')).toBeFocused();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1')!).progress['tv-19885:s1:e1'])).toBe(0);
 await telemetry(page);await expect(overlay(page)).toBeHidden();
});
for(const activation of ['click','Enter','countdown'])test(`${activation} advances to the next episode`,async({page})=>{
 await open(page);await ended(page);
 if(activation==='click')await page.getByRole('button',{name:'Play now',exact:true}).click();else if(activation==='Enter')await page.keyboard.press('Enter');else await page.clock.runFor(10000);
 await expect(page).toHaveURL(/season\/1\/episode\/2\/play$/);await expect(page.locator('.movies-player>h2')).toHaveText('S1 · E2 — The Blind Banker');await expect(page.locator('.movies-provider-frame')).toHaveAttribute('src',/\/19885\/1\/2\?/);await expect(overlay(page)).toBeHidden();
});
test('Enter on Cancel activates Cancel',async({page})=>{await open(page);await ended(page);await page.getByRole('button',{name:'Cancel',exact:true}).focus();await page.keyboard.press('Enter');await page.clock.runFor(11000);await expect(overlay(page)).toBeHidden();await expect(page).toHaveURL(/episode\/1\/play$/);});
test('rolls over to the next season',async({page})=>{await open(page,route(1,3));await ended(page);await expect(overlay(page)).toContainText('S2 · E1 — A Scandal in Belgravia');await page.getByRole('button',{name:'Play now',exact:true}).click();await expect(page).toHaveURL(/season\/2\/episode\/1\/play$/);});
test('final episode and movies never show a countdown',async({page})=>{await open(page,route(2,3));await telemetry(page);await page.clock.runFor(11000);await expect(overlay(page)).toBeHidden();await expect(page).toHaveURL(/season\/2\/episode\/3\/play$/);await page.goto('/#/movies/movie-157336/play');await expect(page.frameLocator('.movies-provider-frame').getByRole('button')).toBeVisible();await telemetry(page);await expect(overlay(page)).toBeHidden();});
test('auto-next defaults on, can be switched off and persists in synced settings',async({page})=>{
 await open(page);const toggle=page.getByRole('checkbox',{name:'Auto next episode'});await expect(toggle).toBeChecked();await toggle.uncheck();await telemetry(page);await page.clock.runFor(11000);await expect(overlay(page)).toBeHidden();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:settings')!).autoNextEpisode)).toBe(false);
 await page.reload();await expect(toggle).not.toBeChecked();await expect(page.frameLocator('.movies-provider-frame').getByRole('button')).toBeVisible();await telemetry(page);await expect(overlay(page)).toBeHidden();
});
test('Escape opens Study and cancels any later navigation; returning leaves the stream paused',async({page})=>{
 await open(page);await ended(page);await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();await page.clock.runFor(11000);await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();await expect(page.getByRole('button',{name:'Resume stream'})).toBeVisible();await expect(page).toHaveURL(/season\/1\/episode\/1\/play$/);await expect(overlay(page)).toBeHidden();
});
test('navigation and hidden-tab pause cancel timers',async({page})=>{
 await open(page);await ended(page);await page.getByRole('link',{name:'Back to Sherlock'}).click();await page.clock.runFor(11000);await expect(page).not.toHaveURL(/\/play$/);
 await page.goto(route());await expect(page.frameLocator('.movies-provider-frame').getByRole('button')).toBeVisible();await ended(page);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});await page.clock.runFor(11000);await expect(overlay(page)).toBeHidden();await expect(page).toHaveURL(/episode\/1\/play$/);
});
test('rejects invalid duration, resumes through the start time, and re-arms after seeking back',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('qcc:movies:v1',JSON.stringify({list:[],progress:{'tv-19885:s1:e1':42}})));
 await open(page);await expect(page.locator('.movies-provider-frame')).toHaveAttribute('src',/[?&]t=42(&|$)/);await telemetry(page,50);await expect(overlay(page)).toBeHidden();
 for(const duration of [0,-1,NaN,Infinity])await telemetry(page,100,duration);await expect(overlay(page)).toBeHidden();
 await ended(page);await page.getByRole('button',{name:'Cancel',exact:true}).click();await telemetry(page,20);await ended(page);await expect(overlay(page)).toBeVisible();
});
test('overlay fits at 320px without motion or repeated live countdown announcements',async({page})=>{
 await page.setViewportSize({width:320,height:844});await page.emulateMedia({reducedMotion:'reduce'});await open(page);await ended(page);const dialog=overlay(page);expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 const announcement=page.locator('.movies-next-announcement');const initial=await announcement.textContent();await page.clock.runFor(2000);await expect(dialog).toContainText('Playing in 8');await expect(announcement).toHaveText(initial!);expect(await dialog.evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
 for(const button of await dialog.getByRole('button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 // The card, its screen and each part are compared as boxes: nothing is clipped, the card does not scroll, and every part lies inside the card.
 const layout=await page.evaluate(()=>{
  const box=(element:Element)=>{const r=element.getBoundingClientRect();return {name:(element.textContent||element.className).trim().slice(0,24),top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
  const card=document.querySelector('.movies-next')!,screen=document.querySelector('.movies-screen')!;
  return {screen:box(screen),card:box(card),scrolls:card.scrollHeight>card.clientHeight,parts:[...card.querySelectorAll('h2,.movies-next-countdown,.movies-next-bar,button')].map(box)};
 });
 expect(layout.scrolls,'Up next scrolls inside its card').toBe(false);
 expect(layout.card.bottom).toBeLessThanOrEqual(layout.screen.bottom);
 for(const part of layout.parts){expect(part.top,part.name).toBeGreaterThanOrEqual(layout.card.top);expect(part.bottom,part.name).toBeLessThanOrEqual(layout.card.bottom);expect(part.left,part.name).toBeGreaterThanOrEqual(layout.card.left);expect(part.right,part.name).toBeLessThanOrEqual(layout.card.right);}
 await page.screenshot({path:'test-results/auto-next-320.png'});
});
test('fullscreen overlay stays in the screen and advancing preserves the fullscreen element',async({page})=>{
 await open(page);const supported=await page.locator('.movies-screen').evaluate(e=>typeof e.requestFullscreen==='function'||typeof (e as HTMLElement&{webkitRequestFullscreen?:unknown}).webkitRequestFullscreen==='function');test.skip(!supported,'Browser reports the Fullscreen API unsupported');
 await page.getByRole('button',{name:'Full screen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!(document.fullscreenElement||(document as Document&{webkitFullscreenElement?:Element}).webkitFullscreenElement))).toBe(true);
 await page.locator('.movies-screen').evaluate(e=>e.setAttribute('data-preserved','yes'));await ended(page);expect(await overlay(page).evaluate(e=>(document.fullscreenElement||(document as Document&{webkitFullscreenElement?:Element}).webkitFullscreenElement)?.contains(e))).toBe(true);
 await page.getByRole('button',{name:'Play now',exact:true}).click();await expect(page).toHaveURL(/episode\/2\/play$/);await expect(page.locator('.movies-screen')).toHaveAttribute('data-preserved','yes');expect(await page.evaluate(()=>(document.fullscreenElement||(document as Document&{webkitFullscreenElement?:Element}).webkitFullscreenElement)?.classList.contains('movies-screen'))).toBe(true);
});
test.describe('touch',()=>{test.use({viewport:{width:390,height:844},hasTouch:true});test('tap Play now advances',async({page})=>{await open(page);await ended(page);await page.getByRole('button',{name:'Play now',exact:true}).tap();await expect(page).toHaveURL(/episode\/2\/play$/);});});


test('native video ended resets progress and opens the same countdown',async({page})=>{
 await page.route('**/movies/licenses.json',r=>r.fulfill({json:[{key:'tv-19885:s1:e1',path:'movies/media/fixture.webm',license:'CC0-1.0',credit:'QCC fixture',evidence:'docs/rights/fixture.md',reviewed:true,territory:'Worldwide',expires:'2099-01-01'}]}));
 await page.route('**/movies/media/fixture.webm',r=>r.fulfill({contentType:'video/webm',body:readFileSync('tests/fixtures/movies.webm')}));
 await page.goto(route());const video=page.locator('video');await expect(video).toBeVisible();await video.evaluate(async(v:HTMLVideoElement)=>{await v.play();});await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.1);await page.keyboard.press('Escape');await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();await video.evaluate(async(v:HTMLVideoElement)=>{await v.play();});await expect(overlay(page)).toBeVisible();
 await page.clock.install();await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.keyboard.press('Escape');await page.clock.runFor(11000);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1')!).progress['tv-19885:s1:e1'])).toBe(0);
});

test('browser fullscreen exit cancels the countdown and opens Study on its next article, as Escape does',async({page})=>{
 await open(page);test.skip(!await page.locator('.movies-screen').evaluate(e=>!!(e.requestFullscreen||(e as HTMLElement&{webkitRequestFullscreen?:unknown}).webkitRequestFullscreen)),'Browser reports the Fullscreen API unsupported');
 await page.getByRole('button',{name:'Full screen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);await ended(page);
 // Study dispatches study-article-change on its own root once for each article it advances to, so the open that advances counts once.
 await page.evaluate(()=>{const state=window as Window&{articleChanges?:number};state.articleChanges=0;document.addEventListener('study-article-change',event=>{if((event.target as Element).id==='study-view')state.articleChanges!++;},true);});
 await page.evaluate(()=>document.exitFullscreen());await expect(overlay(page)).toBeHidden();await expect(page.locator('#study-view')).toBeVisible();
 await page.clock.runFor(11000);await expect(page).toHaveURL(/episode\/1\/play$/);
 expect(await page.evaluate(()=>(window as Window&{articleChanges?:number}).articleChanges)).toBe(1);
});
test('leaving fullscreen with the Full screen button does not open Study',async({page})=>{
 await open(page);test.skip(!await page.locator('.movies-screen').evaluate(e=>!!(e.requestFullscreen||(e as HTMLElement&{webkitRequestFullscreen?:unknown}).webkitRequestFullscreen)),'Browser reports the Fullscreen API unsupported');
 const button=page.getByRole('button',{name:'Full screen',exact:true});
 await button.click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
 await button.click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
 await expect(page.locator('#study-view')).toBeHidden();await expect(page).toHaveURL(/episode\/1\/play$/);
});

// Under load a browser can deliver the "entered fullscreen" event late, after the exit. The exit must still cancel the countdown.
test('a late fullscreen-enter event still lets a fullscreen exit cancel the countdown',async({page})=>{
 await page.addInitScript(()=>{
  let swallowed=0;
  for(const type of ['fullscreenchange','webkitfullscreenchange'])window.addEventListener(type,event=>{if(swallowed<1&&document.fullscreenElement){event.stopImmediatePropagation();if(type==='fullscreenchange')swallowed++;}},{capture:true});
 });
 await open(page);test.skip(!await page.locator('.movies-screen').evaluate(e=>!!(e.requestFullscreen||(e as HTMLElement&{webkitRequestFullscreen?:unknown}).webkitRequestFullscreen)),'Browser reports the Fullscreen API unsupported');
 await page.getByRole('button',{name:'Full screen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);await ended(page);
 await page.evaluate(()=>document.exitFullscreen());await expect(overlay(page)).toBeHidden();await page.clock.runFor(11000);await expect(page).toHaveURL(/episode\/1\/play$/);
});

test('provider fullscreen exits intentionally so the overlay becomes visible',async({page})=>{
 await open(page);test.skip(!await page.locator('.movies-screen').evaluate(e=>!!e.requestFullscreen),'Browser reports the Fullscreen API unsupported');
 await page.frame({url:/framextv/})!.evaluate(()=>{document.querySelector('button')!.onclick=()=>{void document.documentElement.requestFullscreen();};});
 // Under CPU load the first trusted click into the cross-site frame is sometimes misrouted, so the provider's handler never runs. The click is
 // repeated until the frame's fullscreen request has been granted.
 await expect(async()=>{
  await page.frameLocator('.movies-provider-frame').getByRole('button').click();
  expect(await page.evaluate(()=>document.fullscreenElement?.className)).toBe('movies-provider-frame');
 }).toPass({timeout:15000});
 await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));await ended(page);await expect.poll(()=>page.evaluate(()=>document.fullscreenElement)).toBe(null);await page.clock.runFor(1000);await expect(overlay(page)).toContainText('Playing in 9');
});

const remoteTitle=(season=1)=>({id:'tv-778899',kind:'tv',name:'Remote Expedition',year:2024,genres:['Adventure'],overview:'A lazily loaded series.',poster:'https://image.tmdb.org/t/p/w500/remote.jpg',seasons:[1,2].map(number=>({number,name:'Season '+number,episodes:number===season?[{number:1,name:number===1?'First Contact':'The Long Crossing',overview:''}]:[]}))});
test('lazy season rollover keeps the fullscreen screen and overlay container through metadata loading',async({page})=>{
 await page.route('**/api/movies?*',r=>r.fulfill({json:{title:remoteTitle(Number(new URL(r.request().url()).searchParams.get('season')||1))}}));
 await open(page,'/#/movies/tv-778899/season/1/episode/1/play');await expect(page.locator('.movies-player>h2')).toContainText('First Contact');
 test.skip(!await page.locator('.movies-screen').evaluate(e=>!!e.requestFullscreen),'Browser reports the Fullscreen API unsupported');
 await page.getByRole('button',{name:'Full screen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
 await page.locator('.movies-screen').evaluate(e=>e.setAttribute('data-preserved','yes'));await page.locator('.movies-next').evaluate(e=>e.setAttribute('data-preserved','yes'));
 await ended(page);await expect(overlay(page)).toContainText('S2 · E1');await page.getByRole('button',{name:'Play now',exact:true}).click();await expect(page.locator('.movies-player>h2')).toHaveText('S2 · E1 — The Long Crossing');
 await expect(page.locator('.movies-screen')).toHaveAttribute('data-preserved','yes');await expect(page.locator('.movies-next')).toHaveAttribute('data-preserved','yes');expect(await page.evaluate(()=>document.fullscreenElement?.className)).toBe('movies-screen');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button')).toBeVisible();await telemetry(page);await expect(overlay(page)).toBeHidden();
});

test('metadata arriving after Study opens cannot restart the stream or a countdown',async({page})=>{
 let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/movies?*',async r=>{await pending;await r.fulfill({json:{title:remoteTitle()}});});
 await page.goto('/#/movies/tv-778899/season/1/episode/1/play');await expect(page.getByRole('heading',{name:'Loading title details…'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();release();await page.clock.install();
 await expect(page.getByRole('button',{name:'Resume stream',includeHidden:true})).toBeAttached();await expect(page.locator('.movies-provider-frame')).toHaveCount(0);await page.clock.runFor(11000);await expect(page).toHaveURL(/episode\/1\/play$/);await expect(page.locator('#study-view')).toBeVisible();
});

// An open drawer stops the Up next countdown. Enter then goes to the control that has focus, not to Up next.
test('opening the episode drawer stops Up next, and Enter on a drawer row plays that row',async({page})=>{
 await open(page);await ended(page);
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();await expect(overlay(page)).toBeHidden();
 await page.clock.runFor(11000);await expect(page).toHaveURL(/season\/1\/episode\/1\/play$/);
 await page.getByRole('dialog',{name:'Select episode'}).getByRole('link',{name:/The Great Game/}).focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/season\/1\/episode\/3\/play$/);await expect(page.locator('.movies-player>h2')).toHaveText('S1 · E3 — The Great Game');
});
test('Enter on the Previous link follows it while Up next counts down',async({page})=>{
 await open(page,route(1,2));await ended(page);
 await page.getByRole('link',{name:'Previous episode',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/season\/1\/episode\/1\/play$/);await expect(page.locator('.movies-player>h2')).toHaveText('S1 · E1 — A Study in Pink');
});
test('Enter on the Next link follows it while Up next counts down',async({page})=>{
 await open(page,route(1,2));await ended(page);
 await page.evaluate(()=>{const state=window as Window&{followed?:string[]};state.followed=[];window.addEventListener('click',event=>{const link=(event.target as Element).closest('a[data-episode-nav]');if(link)state.followed!.push(link.getAttribute('data-episode-nav')!);},true);});
 await page.getByRole('link',{name:'Next episode',exact:true}).focus();await page.keyboard.press('Enter');
 await expect(page).toHaveURL(/season\/1\/episode\/3\/play$/);
 expect(await page.evaluate(()=>(window as Window&{followed?:string[]}).followed)).toEqual(['next']);
});
test('Enter on the Auto next switch does not play Up next',async({page})=>{
 await open(page,route(1,2));await ended(page);
 await page.getByRole('checkbox',{name:'Auto next episode'}).focus();await page.keyboard.press('Enter');
 await expect(overlay(page)).toBeVisible();await expect(page).toHaveURL(/season\/1\/episode\/2\/play$/);
});

const island=(page:Page)=>page.locator('nav.movies-mobile-nav.ui-tabbar');
// How visible the island is. With a glass lens the bar keeps its own opacity at 1 while its lens, top layer and tabs fade; without one the
// bar itself fades. So what shows is the bar's own opacity times the most opaque layer it paints.
// The island and its capsule count together: the shown state is the more visible of the two.
const islandShown=(page:Page)=>island(page).evaluate(bar=>{
 const lens=bar.querySelector('.ui-glass-lens'),layers=[getComputedStyle(bar,'::before').opacity,...(lens?[getComputedStyle(lens).opacity]:[]),...[...bar.querySelectorAll('.ui-tab')].map(tab=>getComputedStyle(tab).opacity)];
 const capsule=bar.parentElement?.querySelector(':scope > .ui-tabbar-mini');
 return Math.max(Number(getComputedStyle(bar).opacity)*Math.max(...layers.map(Number)),capsule?Number(getComputedStyle(capsule).opacity):0);
});
const capsuleShown=(page:Page)=>page.locator('.movies-view > .ui-tabbar-mini').evaluate(el=>Number(getComputedStyle(el).opacity));
test('Up next hides the island at 1440px until Cancel brings it back',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await open(page);await expect.poll(()=>islandShown(page)).toBe(1);
 await ended(page);await expect(island(page)).toHaveAttribute('data-hidden','true');await expect.poll(()=>islandShown(page)).toBe(0);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(overlay(page)).toBeHidden();
 await expect(island(page)).not.toHaveAttribute('data-hidden');await expect.poll(()=>islandShown(page)).toBe(1);
});
// Hiding userAgentData takes the Chromium lens away, so the island is frost: the bar is its own backdrop and fades its own opacity.
test('Up next hides a frost island until Cancel brings it back',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(navigator,'userAgentData',{get:()=>undefined,configurable:true});});
 await page.setViewportSize({width:1440,height:900});await open(page);await expect(island(page)).toHaveAttribute('data-glass','frost');
 await expect.poll(()=>islandShown(page)).toBe(1);
 await ended(page);await expect(island(page)).toHaveAttribute('data-hidden','true');await expect.poll(()=>islandShown(page)).toBe(0);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(overlay(page)).toBeHidden();
 await expect(island(page)).not.toHaveAttribute('data-hidden');await expect.poll(()=>islandShown(page)).toBe(1);
});
// Up next takes a minimized island and its capsule away together. Cancel brings the island back, expanded, since the travel count restarts.
test('Up next hides a minimized island and its capsule, and Cancel brings the island back expanded',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await open(page);
 // The single-provider player is shorter; keep this scroll outside the bottom zone that expands the island.
 await page.locator('.movies-view').evaluate(e=>e.scrollTo(0,180));
 await expect(island(page)).toHaveAttribute('data-minimized','true');await expect.poll(()=>capsuleShown(page)).toBe(1);
 await ended(page);await expect(island(page)).toHaveAttribute('data-hidden','true');await expect.poll(()=>islandShown(page)).toBe(0);
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(overlay(page)).toBeHidden();
 await expect(island(page)).not.toHaveAttribute('data-hidden');await expect(island(page)).not.toHaveAttribute('data-minimized');
 await expect.poll(()=>islandShown(page)).toBe(1);await expect.poll(()=>capsuleShown(page)).toBe(0);
});
test('keyboard focus in the island keeps it visible while Up next shows',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await open(page);
 const tab=island(page).locator('[data-kind="movie"]');await tab.focus();await page.keyboard.press('Shift+Tab');await page.keyboard.press('Tab');await expect(tab).toBeFocused();
 await ended(page);await expect(island(page)).toHaveAttribute('data-hidden','true');await expect(tab).toBeFocused();
 // A hide would fade over about 380 ms, so the island is read once no transition on it or its layers is running.
 await expect.poll(()=>island(page).evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);expect(await islandShown(page)).toBe(1);
});
test('pointer focus in the island does not keep it visible, so Up next moves focus to Play now',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await open(page);
 const tab=island(page).locator('[data-kind="movie"]');await page.locator('.movies-player>h2').click();await tab.evaluate(e=>(e as HTMLElement).focus());await expect(tab).toBeFocused();expect(await tab.evaluate(e=>e.matches(':focus-visible'))).toBe(false);
 // A click on a non-focusable heading, then a script focus, is not keyboard focus.
 await ended(page);await expect(island(page)).toHaveAttribute('data-hidden','true');await expect.poll(()=>islandShown(page)).toBe(0);
 await expect(page.getByRole('button',{name:'Play now',exact:true})).toBeFocused();
});
test('scrolling the page while Up next shows keeps the island hidden',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await open(page);await ended(page);
 const view=page.locator('.movies-view');await view.evaluate(e=>e.scrollTo(0,300));
 // The island checks its position in the frame after a scroll event. The clock is paused, which holds back frames too, so the test waits for the
 // scroll event and then runs one frame of the clock.
 const scrolled=view.evaluate(e=>new Promise<void>(resolve=>{const done=()=>{if(e.scrollTop===0){e.removeEventListener('scroll',done);resolve();}};e.addEventListener('scroll',done);}));
 await view.evaluate(e=>e.scrollTo(0,0));await scrolled;await page.clock.runFor(50);
 await expect(overlay(page)).toBeVisible();await expect(island(page)).toHaveAttribute('data-hidden','true');
});

test('Cancel returns focus to the control that had it before Up next took focus',async({page})=>{
 await open(page);
 await page.getByRole('button',{name:'S1 · E1',exact:true}).focus();
 await ended(page);await expect(overlay(page)).toBeVisible();await expect(page.getByRole('button',{name:'Play now',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(overlay(page)).toBeHidden();
 await expect(page.getByRole('button',{name:'S1 · E1',exact:true})).toBeFocused();
});
test('Cancel falls back to the screen when the control that had focus has gone',async({page})=>{
 await open(page);
 await page.getByRole('button',{name:'S1 · E1',exact:true}).focus();
 await ended(page);await expect(overlay(page)).toBeVisible();
 await page.evaluate(()=>document.querySelector<HTMLElement>('[data-action="episodes"]')?.remove());
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(overlay(page)).toBeHidden();
 await expect(page.locator('.movies-screen')).toBeFocused();
});

// Cancel never sends focus into the provider frame, which takes its own keys: the screen takes it instead, and Escape still opens Study.
test('Cancel never sends focus into the provider frame, and Escape still opens Study',async({page})=>{
 await open(page);
 await page.locator('iframe.movies-provider-frame').focus();
 await ended(page);await expect(overlay(page)).toBeVisible();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await expect(overlay(page)).toBeHidden();
 await expect(page.locator('.movies-screen')).toBeFocused();
 await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
});

// Below 640 px Up next covers the whole screen, so the Full screen button sits above its text and buttons. Their boxes must not meet,
// and each control must take a press where it is drawn.
for(const width of [320,390,639])test(`Up next leaves the Full screen button clear of its text and buttons at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:700});
 await open(page);await ended(page);await expect(overlay(page)).toBeVisible();
 const layout=await page.evaluate(()=>{
  type Box={l:number;t:number;r:number;b:number};
  const box=(element:Element):Box=>{const r=element.getBoundingClientRect();return {l:r.left,t:r.top,r:r.right,b:r.bottom};};
  const meet=(a:Box,b:Box)=>a.l<b.r&&b.l<a.r&&a.t<b.b&&b.t<a.b;
  const reachable=(element:Element)=>{const r=element.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&element.contains(hit);};
  const button=document.querySelector<HTMLElement>('.movies-fullscreen')!;
  const parts=[...document.querySelectorAll<HTMLElement>('.movies-next h2,.movies-next .movies-next-countdown,.movies-next button')];
  return {
   shown:parts.length,
   overlapping:parts.filter(part=>meet(box(button),box(part))).map(part=>part.textContent?.trim()??''),
   buttonReachable:reachable(button),
   actionsReachable:parts.filter(part=>part.tagName==='BUTTON').map(reachable),
  };
 });
 expect(layout.shown).toBeGreaterThan(0);
 expect(layout.overlapping).toEqual([]);
 expect(layout.buttonReachable).toBe(true);
 expect(layout.actionsReachable).toEqual([true,true]);
});

// With reduced motion, from the media query or the app's own class, Up next moves nothing: no animation or transition runs on the card, and its
// countdown bar changes width without one.
for(const setting of ['media query','class'] as const)test(`reduced motion (${setting}) leaves Up next with no animation, transform or transition`,async({page})=>{
 if(setting==='media query')await page.emulateMedia({reducedMotion:'reduce'});
 await open(page);
 if(setting==='class')await page.evaluate(()=>document.documentElement.classList.add('reduce-motion'));
 await ended(page);await expect(overlay(page)).toBeVisible();
 await page.clock.runFor(1000);
 const bar=overlay(page).locator('.movies-next-bar>span');
 await expect(bar).toHaveAttribute('style',/width: 90%/);
 const motion=await overlay(page).evaluate(card=>{
  const nodes=[card,...card.querySelectorAll('*')];
  return {
   animations:nodes.flatMap(node=>node.getAnimations()).map(animation=>((animation.effect as KeyframeEffect|null)?.getKeyframes()??[]).flatMap(frame=>Object.keys(frame)).join(',')||animation.constructor.name),
   transforms:nodes.map(node=>getComputedStyle(node).transform).filter(transform=>transform!=='none'),
   transitions:nodes.map(node=>getComputedStyle(node).transitionDuration).filter(duration=>duration!=='0s'),
  };
 });
 expect(motion.animations).toEqual([]);
 expect(motion.transforms).toEqual([]);
 expect(motion.transitions).toEqual([]);
});
