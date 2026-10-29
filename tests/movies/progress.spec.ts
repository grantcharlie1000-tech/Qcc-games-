import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';

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
 await page.route('https://framextv.cc/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
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

test('continue watching shows one tile per title, resuming its newest episode',async({page})=>{
 await seed(page,{list:[],progress:{'tv-19885:s1:e1':300,'tv-19885:s1:e2':400,'movie-157336':1800},titles:{},meta:{'tv-19885:s1:e1':{duration:2700,updated:1000},'tv-19885:s1:e2':{duration:2700,updated:2000},'movie-157336':{duration:5400,updated:1500}}});
 await page.goto('/#/movies');
 const tiles=page.locator('a.movies-continue');
 await expect(tiles).toHaveCount(2);
 await expect(tiles.nth(0)).toHaveAttribute('href','#/movies/tv-19885/season/1/episode/2/play');
 await expect(tiles.nth(0)).toContainText('S1 · E2');
 await expect(tiles.nth(1)).toHaveAttribute('href','#/movies/movie-157336/play');
});
