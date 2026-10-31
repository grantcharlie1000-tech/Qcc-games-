import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

// The page writes progress itself, so these tests read the stored movies object back and post from inside the provider frame.
const stored=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1')!));
const seed=(page:Page,value:object)=>page.addInitScript((data)=>{if(window!==window.top)return;localStorage.setItem('qcc:movies:v1',JSON.stringify(data));},value);
async function openPlayer(page:Page,url:string){
 await page.goto(url);await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
}
// Posts from inside the provider frame, as the real player does. The page's own listener was registered first, so once this
// listener sees the report, the page has already handled it.
async function report(page:Page,currentTime:number,duration?:number){
 await page.evaluate((time)=>{
  (window as Window&{reported?:Promise<void>}).reported=new Promise<void>(resolve=>{
   const listen=(event:MessageEvent)=>{if(event.data?.event==='frameXTV:timeupdate'&&event.data.currentTime===time){window.removeEventListener('message',listen);resolve();}};
   window.addEventListener('message',listen);
  });
 },currentTime);
 await page.frame({url:/framextv/})!.evaluate(({currentTime,duration})=>parent.postMessage({event:'frameXTV:timeupdate',currentTime,duration},'*'),{currentTime,duration});
 await page.evaluate(()=>(window as Window&{reported?:Promise<void>}).reported);
}

test.beforeEach(async({page})=>{
 // Existing playback coverage accepts each fresh third-party playback warning.
 await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>{await dialog.getByRole('button',{name:'Continue',exact:true}).click();});
 await page.route('https://framextv.cc/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
 for(const origin of ['https://framextv.xyz'])await page.route(origin+'/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
 await page.route('https://image.tmdb.org/**',r=>r.abort());
 await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

test('a provider progress write stores the duration and the title snapshot',async({page})=>{
 await openPlayer(page,'/#/movies/movie-157336/play');
 await report(page,42,5400);
 expect(await stored(page)).toMatchObject({progress:{'movie-157336':42},meta:{'movie-157336':{duration:5400}},titles:{'movie-157336':{name:'Interstellar'}}});
});

test('an early provider report does not erase a saved resume point',async({page})=>{
 await seed(page,{list:[],progress:{'movie-157336':120},titles:{},meta:{'movie-157336':{duration:5400,updated:1}}});
 await openPlayer(page,'/#/movies/movie-157336/play');
 await expect(page.locator('.movies-provider-frame')).toHaveAttribute('src',/[?&]t=120(&|$)/);
 await report(page,3);
 expect((await stored(page)).progress['movie-157336']).toBe(120);
 // The skipped report must not start the 5-second throttle, so the next real report is saved at once.
 await report(page,130);
 expect((await stored(page)).progress['movie-157336']).toBe(130);
});

test('a finished movie is saved at 0 and leaves Continue watching',async({page})=>{
 await seed(page,{list:[],progress:{'movie-157336':600,'tv-19885:s1:e2':300},titles:{'movie-157336':{id:'movie-157336',kind:'movie',name:'Interstellar',year:2014,poster:'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'}},meta:{'movie-157336':{duration:5400,updated:1},'tv-19885:s1:e2':{duration:2700,updated:2}}});
 await openPlayer(page,'/#/movies/movie-157336/play');
 await report(page,5399.5,5400);
 expect((await stored(page)).progress['movie-157336']).toBe(0);
 await page.goto('/#/movies');
 // Sherlock is the only tile left, so the rail did render and the finished film has gone from it.
 await expect(page.locator('a.movies-continue')).toHaveCount(1);
 await expect(page.locator('a.movies-continue')).toHaveAttribute('aria-label','Resume Sherlock');
});

test('a rewind after a finished movie keeps saving its position',async({page})=>{
 await openPlayer(page,'/#/movies/movie-157336/play');
 await report(page,5399.5,5400);
 expect((await stored(page)).progress['movie-157336']).toBe(0);
 // A rewind reports no duration. The movie is in progress again, so the pause below saves the new position, not 0.
 await report(page,100);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
 expect((await stored(page)).progress['movie-157336']).toBe(100);
});

test('continue watching shows one tile per title, resuming its newest episode',async({page})=>{
 await seed(page,{list:[],progress:{'tv-19885:s1:e1':300,'tv-19885:s1:e2':400,'movie-157336':1800},titles:{},meta:{'tv-19885:s1:e1':{duration:2700,updated:1000},'tv-19885:s1:e2':{duration:2700,updated:2000},'movie-157336':{duration:5400,updated:1500}}});
 await page.goto('/#/movies');
 const tiles=page.locator('a.movies-continue');
 await expect(tiles).toHaveCount(2);
 await expect(tiles.nth(0)).toHaveAttribute('href','#/movies/tv-19885/season/1/episode/2/play');
 await expect(tiles.nth(0)).toContainText('S1 · E2');
 await expect(tiles.nth(1)).toHaveAttribute('href','#/movies/movie-157336/play');
});

// Saved data that other tests do not reach: a title that leaves no trace when it was never played, the list after a storage failure,
// another tab's writes, and a listed title that is the oldest of 201 remembered titles.
// The player leaves with its frame, and the save happens as the frame is taken away, so the frame's removal is awaited first.
test('leaving a title that was never played writes no progress, meta or snapshot',async({page})=>{
 await page.goto('/#/movies/movie-157336/play');await expect(page.locator('.movies-provider-frame')).toBeVisible();
 await page.getByRole('link',{name:'Back to Interstellar',exact:true}).click();await expect(page.locator('.movies-provider-frame')).toHaveCount(0);
 const saved=await stored(page);
 expect(saved.progress).toEqual({});expect(saved.meta).toEqual({});expect(saved.titles).toEqual({});
});

test('leaving a saved title at once keeps its position and its meta.updated stamp',async({page})=>{
 await seed(page,{list:[],progress:{'movie-157336':120},titles:{},meta:{'movie-157336':{duration:5400,updated:1}}});
 await page.goto('/#/movies/movie-157336/play');await expect(page.locator('.movies-provider-frame')).toBeVisible();
 await page.getByRole('link',{name:'Back to Interstellar',exact:true}).click();await expect(page.locator('.movies-provider-frame')).toHaveCount(0);
 expect(await stored(page)).toMatchObject({progress:{'movie-157336':120},meta:{'movie-157336':{duration:5400,updated:1}}});
});

test('a saved local video that is opened and left at once keeps its meta.updated stamp',async({page})=>{
 await page.route('**/movies/licenses.json',route=>route.fulfill({json:[{key:'movie-329865',path:'movies/media/fixture.webm',license:'CC0-1.0',credit:'QCC generated test fixture',evidence:'docs/rights/fixture.md',reviewed:true,territory:'Worldwide',expires:'2099-01-01'}]}));
 await page.route('**/movies/media/fixture.webm',route=>route.fulfill({contentType:'video/webm',body:readFileSync('tests/fixtures/movies.webm')}));
 await seed(page,{list:[],progress:{'movie-329865':.5},titles:{},meta:{'movie-329865':{duration:4,updated:1}}});
 await page.goto('/#/movies/movie-329865/play');await expect(page.locator('video')).toBeVisible();
 await page.locator('.movies-detail-back').click();await expect(page.locator('video')).toHaveCount(0);
 expect(await stored(page)).toMatchObject({progress:{'movie-329865':.5},meta:{'movie-329865':{updated:1}}});
});

// The title is added while every write fails. Leaving Movies and coming back must still show it, with the storage notice.
test('a title added while storage refuses writes stays in My list after leaving and returning to Movies',async({page})=>{
 await page.goto('/#/movies/movie-157336');await expect(page.getByRole('button',{name:'Add to my list',exact:true})).toBeVisible();
 await page.evaluate(()=>{Storage.prototype.setItem=function(){throw new Error('QuotaExceededError');};});
 await page.getByRole('button',{name:'Add to my list',exact:true}).click();await expect(page.getByRole('button',{name:'In my list',exact:true})).toBeVisible();
 await page.locator('.movies-top').getByRole('link',{name:'Games',exact:true}).click();await expect(page.locator('.game-card').first()).toBeVisible();
 await page.locator('.app-tabbar').getByRole('link',{name:'Movies',exact:true}).click();await expect(page.locator('#movies-search')).toBeVisible();
 await page.locator('.movies-top').getByRole('button',{name:'My list',exact:true}).click();
 // The catalog also lists this title on the Movies page, so the list is checked only once its own header pill is pressed, as the render sets it.
 await expect(page.locator('.movies-top [data-kind="list"][aria-pressed="true"]')).toHaveCount(1);
 await expect(page.locator('.movies-results-grid .movies-poster[data-title="movie-157336"]')).toHaveCount(1);
 await expect(page.locator('.movies-storage')).toContainText('Browser storage is unavailable');
});

// Two tabs share one key. A change made in the other tab shows here at once, and this tab's next write keeps it.
test('another tab\'s change to My list shows here and is not overwritten by this tab',async({page,context})=>{
 await page.goto('/#/movies/list');await expect(page.getByRole('heading',{name:'Your list is empty',exact:true})).toBeVisible();
 const other=await context.newPage();
 await other.goto('/#/movies/movie-157336');await other.getByRole('button',{name:'Add to my list',exact:true}).click();
 await expect(page.locator('.movies-results-grid .movies-poster[data-title="movie-157336"]')).toHaveCount(1);
 await page.goto('/#/movies/movie-438631');await page.getByRole('button',{name:'Add to my list',exact:true}).click();
 await expect.poll(async()=>(await stored(page)).list).toEqual(['movie-157336','movie-438631']);
 await other.close();
});

// The listed title is the oldest of 201 remembered titles. Its snapshot is kept, so My list still shows it after a reload.
test('a listed title that is the oldest of 201 remembered titles still renders in My list',async({page})=>{
 const titles:Record<string,unknown>={},progress:Record<string,number>={},meta:Record<string,unknown>={};
 const snapshot=(id:string,name:string)=>({id,kind:'movie',name,year:2001,poster:'movies/no-artwork.svg'});
 titles['movie-999001']=snapshot('movie-999001','Listed Fixture Film');
 for(let i=1;i<=200;i++){const id=`movie-${900000+i}`;titles[id]=snapshot(id,`Watched ${i}`);progress[id]=100;meta[id]={duration:6000,updated:1000+i};}
 await seed(page,{list:['movie-999001'],progress,titles,meta});
 await page.goto('/#/movies/list');
 await expect(page.locator('.movies-results-grid .movies-poster[data-title="movie-999001"]')).toHaveCount(1);
 expect((await stored(page)).titles['movie-999001']).toBeDefined();
});

// Two tabs on one title page. A change to My list in one shows at once in the other, and a click in either tab updates both.
test('a title page follows another tab\'s change to My list, and a click in either tab updates both',async({page,context})=>{
 await page.goto('/#/movies/movie-157336');
 await expect(page.getByRole('button',{name:'Add to my list',exact:true})).toBeVisible();
 const other=await context.newPage();
 await other.goto('/#/movies/movie-157336');
 await expect(other.getByRole('button',{name:'Add to my list',exact:true})).toBeVisible();
 await other.getByRole('button',{name:'Add to my list',exact:true}).click();
 await expect(other.getByRole('button',{name:'In my list',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'In my list',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'In my list',exact:true}).click();
 await expect(page.getByRole('button',{name:'Add to my list',exact:true})).toBeVisible();
 await expect(other.getByRole('button',{name:'Add to my list',exact:true})).toBeVisible();
 await other.close();
});

// A position that changes in another tab alone leaves Home as it is: the rail keeps its nodes and its scroll. A change to My list redraws Home.
test('a position change from another tab does not redraw Home, and a change to My list does',async({page})=>{
 const titles:Record<string,unknown>={},progress:Record<string,number>={},meta:Record<string,unknown>={};
 const snapshot=(id:string,name:string)=>({id,kind:'movie',name,year:2001,poster:'movies/no-artwork.svg'});
 for(let i=1;i<=13;i++){const id=`movie-${900000+i}`;titles[id]=snapshot(id,`Watched ${i}`);if(i<=12){progress[id]=100;meta[id]={duration:6000,updated:1000+i};}}
 await seed(page,{list:[],progress,titles,meta});
 await page.setViewportSize({width:390,height:800});
 await page.goto('/#/movies');
 const rail=page.locator('.movies-shelf[data-rail="continue-watching"] .ui-rail-row');
 await expect(rail.locator('.movies-continue').first()).toBeVisible();
 // The row smooths and snaps its scrolling, so the scroll is set without animation and the position it settles on is the one kept.
 const kept=await rail.evaluate(element=>{(element as HTMLElement).dataset.kept='1';element.scrollTo({left:200,behavior:'instant' as ScrollBehavior});return element.scrollLeft;});
 expect(kept).toBeGreaterThan(0);
 await page.evaluate(()=>{const key='qcc:movies:v1';const data=JSON.parse(localStorage.getItem(key)!);data.progress['movie-900001']=500;data.meta['movie-900001'].updated=Date.now();localStorage.setItem(key,JSON.stringify(data));window.dispatchEvent(new StorageEvent('storage',{key}));});
 await expect(rail).toHaveAttribute('data-kept','1');
 expect(await rail.evaluate(element=>element.scrollLeft)).toBe(kept);
 await page.evaluate(()=>{const key='qcc:movies:v1';const data=JSON.parse(localStorage.getItem(key)!);data.list.push('movie-900013');data.titles['movie-900013']={id:'movie-900013',kind:'movie',name:'Watched 13',year:2001,poster:'movies/no-artwork.svg'};localStorage.setItem(key,JSON.stringify(data));window.dispatchEvent(new StorageEvent('storage',{key}));});
 await expect(page.locator('.movies-shelf[data-rail="continue-watching"] .ui-rail-row[data-kept="1"]')).toHaveCount(0);
 await expect(page.locator('.movies-shelf[data-rail="my-list"]')).toBeVisible();
});
