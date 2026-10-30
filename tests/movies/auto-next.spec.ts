import {test,expect} from '../fixtures';
import {readFileSync} from 'node:fs';
import type {Page} from '@playwright/test';
const route=(season=1,episode=1)=>`/#/movies/tv-19885/season/${season}/episode/${episode}/play`;
const overlay=(page:Page)=>page.getByRole('dialog',{name:'Up next'});
async function telemetry(page:Page,currentTime=100,duration=100){await page.frame({url:/framextv/})!.evaluate(({currentTime,duration})=>parent.postMessage({event:'frameXTV:timeupdate',currentTime,duration},'*'),{currentTime,duration});}
async function open(page:Page,url=route()){await page.goto(url);await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();await page.clock.install();}
async function ended(page:Page){await telemetry(page);await expect(overlay(page)).toBeVisible();}

test.beforeEach(async({page})=>{
 await page.route('https://framextv.cc/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
 await page.route('https://image.tmdb.org/**',r=>r.abort());
 await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

test('end shows the next title, countdown and keyboard focus; Cancel stops and restores focus',async({page})=>{
 await open(page);await ended(page);await expect(overlay(page)).toContainText('Up next: S1 · E2 — The Blind Banker');await expect(overlay(page)).toContainText('Playing in 10');await expect(page.getByRole('button',{name:'Play now',exact:true})).toBeFocused();
 await page.getByRole('button',{name:'Cancel',exact:true}).click();await page.clock.runFor(11000);await expect(page).toHaveURL(/season\/1\/episode\/1\/play$/);await expect(overlay(page)).toBeHidden();await expect(page.locator('.movies-screen')).toBeFocused();
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
 await page.setViewportSize({width:320,height:700});await page.emulateMedia({reducedMotion:'reduce'});await open(page);await ended(page);const dialog=overlay(page);expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 const announcement=page.locator('.movies-next-announcement');const initial=await announcement.textContent();await page.clock.runFor(2000);await expect(dialog).toContainText('Playing in 8');await expect(announcement).toHaveText(initial!);expect(await dialog.evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);
 for(const button of await dialog.getByRole('button').all())expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
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

test('browser fullscreen exit cancels countdown without opening Study',async({page})=>{
 await open(page);test.skip(!await page.locator('.movies-screen').evaluate(e=>!!(e.requestFullscreen||(e as HTMLElement&{webkitRequestFullscreen?:unknown}).webkitRequestFullscreen)),'Browser reports the Fullscreen API unsupported');
 await page.getByRole('button',{name:'Full screen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);await ended(page);
 await page.evaluate(()=>document.exitFullscreen());await expect(overlay(page)).toBeHidden();await page.clock.runFor(11000);await expect(page).toHaveURL(/episode\/1\/play$/);await expect(page.locator('#study-view')).toBeHidden();
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
 await page.frameLocator('.movies-provider-frame').getByRole('button').click();await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.className)).toBe('movies-provider-frame');await ended(page);await expect.poll(()=>page.evaluate(()=>document.fullscreenElement)).toBe(null);await page.clock.runFor(1000);await expect(overlay(page)).toContainText('Playing in 9');
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

// Task 15 review 1, Important 1: an open drawer stops the Up next countdown. Enter then goes to the control that has focus, not to Up next.
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
