import {test,expect} from '../fixtures';
import {readFileSync} from 'node:fs';
const providers=['framextv.cc','framextv.xyz','vidlink.pro','vixsrc.to','vidsrc.to'];
test.beforeEach(async({page})=>{
 await page.route('https://image.tmdb.org/**',r=>r.fulfill({status:204,body:''}));
 await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'fixture'}}));
 for(const host of providers)await page.route(`https://${host}/**`,r=>r.fulfill({contentType:'text/html',body:'<button>Fixture player</button>'}));
 await page.route('https://archive.org/**',r=>r.fulfill({contentType:'text/html',body:'<button>Archive fixture</button>'}));
});
const warning=(page:import('@playwright/test').Page)=>page.getByRole('dialog',{name:'Before you watch'});
for(const cancel of ['Escape','Go back'])test(`${cancel} cancels play without provider requests and returns focus`,async({page})=>{
 const requests:string[]=[];page.on('request',r=>{if(providers.includes(new URL(r.url()).hostname))requests.push(r.url());});
 await page.goto('/#/movies/movie-157336');
 const play=page.getByRole('button',{name:'Play movie',exact:true});await play.click();
 await expect(warning(page)).toBeVisible();await expect(page.getByRole('button',{name:'Go back',exact:true})).toBeFocused();
 await expect(page.locator('iframe')).toHaveCount(0);
 await page.keyboard.press('Shift+Tab');await expect(warning(page).getByRole('button',{name:'Continue',exact:true})).toBeFocused();
 await page.keyboard.press('Tab');await expect(warning(page).getByRole('button',{name:'Go back',exact:true})).toBeFocused();
 if(cancel==='Escape')await page.keyboard.press('Escape');else await warning(page).getByRole('button',{name:'Go back',exact:true}).click();
 await expect(warning(page)).toHaveCount(0);await expect(page.locator('iframe')).toHaveCount(0);await expect(play).toBeFocused();expect(requests).toEqual([]);
 await expect(page.locator('#study-view')).toBeHidden();
});
test('Continue starts playback and every fresh Play and Resume asks again',async({page})=>{
 await page.goto('/#/movies/movie-157336');
 await page.getByRole('button',{name:'Play movie',exact:true}).click();await expect(warning(page)).toBeVisible();
 await warning(page).getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('.movies-provider-frame')).toBeVisible();
 await page.getByRole('link',{name:'Back to Interstellar'}).click();await page.getByRole('button',{name:'Play movie',exact:true}).click();await expect(warning(page)).toBeVisible();await expect(page.locator('iframe')).toHaveCount(0);
 await warning(page).getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('.movies-provider-frame')).toBeVisible();
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,value:false});});
 await page.getByRole('button',{name:'Resume stream',exact:true}).click();await expect(warning(page)).toBeVisible();await expect(page.locator('iframe')).toHaveCount(0);
});
test('deep links and reloads warn before creating a provider iframe',async({page})=>{
 const requests:string[]=[];page.on('request',r=>{if(providers.includes(new URL(r.url()).hostname))requests.push(r.url());});
 await page.goto('/#/movies/movie-157336/play');await expect(warning(page)).toBeVisible();await expect(page.locator('iframe')).toHaveCount(0);expect(requests).toEqual([]);
 await warning(page).getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('.movies-provider-frame')).toBeVisible();
 await page.reload();await expect(warning(page)).toBeVisible();await expect(page.locator('iframe')).toHaveCount(0);
});
test('archive fixture plays only its sandboxed archive embed with credit and no server picker',async({page})=>{
 const catalog=JSON.parse(readFileSync('public/movies/catalog.json','utf8'));
 catalog.titles=[{...catalog.titles[0],id:'movie-10331',name:'Night of the Living Dead',year:1968,source:{type:'archive',archiveId:'night_of_the_living_dead',license:'Public domain (US, no copyright notice, 1968)',evidence:'collection: feature_films'}}];
 await page.route('**/movies/catalog.json',r=>r.fulfill({json:catalog}));
 const requests:string[]=[];page.on('request',r=>{if(providers.includes(new URL(r.url()).hostname))requests.push(r.url());});
 await page.goto('/#/movies/movie-10331/play');
 const frame=page.locator('.movies-archive-frame');await expect(frame).toHaveAttribute('src','https://archive.org/embed/night_of_the_living_dead');await expect(frame).toBeVisible();await expect(page.frameLocator('.movies-archive-frame').getByRole('button',{name:'Archive fixture'})).toBeVisible();
 await expect(warning(page)).toHaveCount(0);await expect(page.locator('[data-server],[data-action="next-server"]')).toHaveCount(0);
 await expect(frame).toHaveAttribute('sandbox','allow-scripts allow-same-origin allow-presentation');await expect(frame).toHaveAttribute('referrerpolicy','no-referrer');await expect(frame).toHaveAttribute('allowfullscreen','');
 await expect(page.locator('#movies-player-status')).toContainText('From the Internet Archive · Public domain');
 await page.clock.install();await page.clock.runFor(60000);expect(requests).toEqual([]);
 await page.getByRole('link',{name:'Back to Night of the Living Dead'}).click();
 await page.getByRole('button',{name:'Play movie',exact:true}).click();await expect(frame).toBeVisible();await expect(warning(page)).toHaveCount(0);expect(requests).toEqual([]);
});

test('hero Play warns and episode auto-next warns before loading another frame',async({page})=>{
 await page.goto('/#/movies');await page.locator('.movies-hero').getByRole('button',{name:'Play',exact:true}).click();await expect(warning(page)).toBeVisible();await warning(page).getByRole('button',{name:'Go back',exact:true}).click();
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');await warning(page).getByRole('button',{name:'Continue',exact:true}).click();
 await expect(page.locator('.movies-provider-frame')).toBeVisible();
 await page.clock.install();
 await page.evaluate(()=>{const frame=document.querySelector<HTMLIFrameElement>('.movies-provider-frame')!;window.dispatchEvent(new MessageEvent('message',{origin:'https://framextv.cc',source:frame.contentWindow,data:{event:'frameXTV:ended'}}));});
 await expect(page.locator('.movies-next')).toBeVisible();await page.clock.runFor(11000);
 await expect(warning(page)).toBeVisible();await expect(page.locator('iframe')).toHaveCount(0);
 await warning(page).getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('.movies-provider-frame')).toHaveAttribute('src',/19885\/1\/2/);
});

test('cancelling an episode play leaves the old stream paused and resumable',async({page})=>{
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');await warning(page).getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('.movies-provider-frame')).toBeVisible();
 const next=page.getByRole('link',{name:'Next episode',exact:true});await next.click();await warning(page).getByRole('button',{name:'Go back',exact:true}).click();
 await expect(next).toBeFocused();await expect(page.locator('iframe')).toHaveCount(0);await expect(page.getByRole('button',{name:'Resume stream',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Resume stream',exact:true}).click();await warning(page).getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('.movies-provider-frame')).toHaveAttribute('src',/19885\/1\/1/);
});

test('fullscreen Escape cancels the warning without opening Study',async({page})=>{
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');await warning(page).getByRole('button',{name:'Continue',exact:true}).click();await expect(page.locator('.movies-provider-frame')).toBeVisible();
 test.skip(!await page.locator('.movies-screen').evaluate(e=>!!e.requestFullscreen),'Fullscreen unavailable');
 await page.getByRole('button',{name:'Full screen',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
 await page.evaluate(()=>{location.hash='#/movies/tv-19885/season/1/episode/2/play';});await expect(warning(page)).toBeVisible();
 // Browsers consume Escape to leave fullscreen, so fullscreenchange must cancel the warning too.
 await page.evaluate(()=>document.exitFullscreen());
 await expect(warning(page)).toHaveCount(0);await expect(page.locator('#study-view')).toBeHidden();await expect(page.locator('iframe')).toHaveCount(0);
});
