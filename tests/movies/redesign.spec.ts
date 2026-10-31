import {test,expect} from '../fixtures';
import type {Locator,Page} from '@playwright/test';
import {readFileSync} from 'node:fs';

// Same network fixtures as movies.spec.ts. The streaming hosts also answer with the provider fixture page.
test.beforeEach(async({page})=>{
 // Existing playback coverage accepts each fresh third-party playback warning.
 await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>{await dialog.getByRole('button',{name:'Continue',exact:true}).click();});
 await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
 for(const url of ['https://framextv.cc/**','https://framextv.xyz/**'])
  await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'+(url==='https://framextv.cc/**'?'<script>parent.postMessage({event:"frameXTV:ready"},"*")</script>':'')}));
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

// Presses Tab until the target has focus, so the focus ring comes from the keyboard as it would for a user.
async function tabTo(page:Page,target:Locator){
 for(let i=0;i<40;i++){
  if(await target.evaluate(e=>e===document.activeElement))return;
  await page.keyboard.press('Tab');
 }
 throw new Error('Tab never reached the target');
}
const outline=(target:Locator)=>target.evaluate(e=>{const s=getComputedStyle(e);return {style:s.outlineStyle,width:parseFloat(s.outlineWidth)};});
// The home's rails request fails, so the home shows the starter rails and its quiet retry line.
const railsDown=(page:Page)=>page.route('**/api/movies?rails=*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));

test('section buttons change the address and survive reload',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true}).click();
 await expect(page).toHaveURL(/#\/movies\/browse\/tv$/);
 await expect(page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.reload();
 await expect(page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.goBack();
 await expect(page).toHaveURL(/#\/movies$/);
 await expect(page.locator('.movies-top').getByRole('button',{name:'Home',exact:true})).toHaveAttribute('aria-pressed','true');
});

for(const width of [320,390])test(`the phone tab bar replaces the section buttons at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});
 await page.goto('/#/movies');
 await expect(page.locator('.movies-mobile-nav')).toBeVisible();
 await expect(page.locator('.movies-mobile-nav .ui-tab')).toHaveCount(5);
 await expect(page.locator('.movies-top .ui-nav')).toHaveCount(1);
 await expect(page.locator('.movies-top .ui-nav')).toBeHidden();
 await expect(page.locator('[data-rail]').first()).toBeVisible();
 expect(await page.locator('.movies-view').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
});

test('focus is visible on header controls and cards',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const home=page.locator('.movies-top').getByRole('button',{name:'Home',exact:true});
 await tabTo(page,home);
 const header=await outline(home);
 expect(header.style).toBe('solid');
 expect(header.width).toBeGreaterThanOrEqual(2);
 const poster=page.locator('.movies-poster').first();
 await tabTo(page,poster);
 const card=await outline(poster);
 expect(card.style).toBe('solid');
 expect(card.width).toBeGreaterThanOrEqual(2);
});

// WCAG 2.4.11: focus must not leave a field under the sticky header. Focus scrolls it to the top edge, which has to clear the header.
test('keyboard focus scrolls a field clear of the sticky header',async({page})=>{
 await railsDown(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const search=page.locator('#movies-search');
 // A failed rails request at home shows the rails status line, not the search status.
 await expect(page.locator('.movies-rails-status')).toBeVisible();
 await expect(search).toBeVisible();
 // Scroll until the field sits just above the visible area, as a user scrolling past it would leave it.
 await page.locator('.movies-view').evaluate(v=>{const f=document.querySelector('#movies-search')!;v.scrollTop+=f.getBoundingClientRect().top+12;});
 await search.focus();
 await expect(search).toBeFocused();
 const measure=()=>page.evaluate(()=>{
  const f=document.querySelector<HTMLInputElement>('#movies-search')!,b=f.getBoundingClientRect();
  const e=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2);
  return {top:Math.round(b.top),hit:e?e.tagName.toLowerCase():'none',clear:!!e&&(e===f||!!f.closest('label')?.contains(e))};
 });
 // The browser may still be scrolling to the focused field (WebKit), so wait for it to settle below the header.
 await expect.poll(async()=>(await measure()).top,{message:'top of the focused field'}).toBeGreaterThanOrEqual(56);
 const hit=await measure();
 expect(hit.clear,JSON.stringify(hit)).toBe(true);
});

// Not every browser applies scroll-padding-top to focus scrolling. With it switched off, focus must still clear the header.
test('focus clears the sticky header even where scroll-padding is not applied',async({page})=>{
 await railsDown(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await page.addStyleTag({content:'.movies-view{scroll-padding:0!important}'});
 const search=page.locator('#movies-search');
 await expect(page.locator('.movies-rails-status')).toBeVisible();
 await page.locator('.movies-view').evaluate(v=>{const f=document.querySelector('#movies-search')!;v.scrollTop+=f.getBoundingClientRect().top+12;});
 await search.focus();
 await expect(search).toBeFocused();
 await expect.poll(()=>search.evaluate(f=>Math.round(f.getBoundingClientRect().top)),{message:'top of the focused field'}).toBeGreaterThanOrEqual(56);
 // A control the page focuses while it is already in view stays where it is. The check waits until the scroll position stops changing first.
 const card=page.locator('.movies-poster').first();
 await card.scrollIntoViewIfNeeded();
 const scrollTop=()=>page.locator('.movies-view').evaluate(v=>v.scrollTop);
 const before=await scrollTop();
 await card.focus();
 let previous=-1;
 await expect.poll(async()=>{const now=await scrollTop();const stable=now===previous;previous=now;return stable;}).toBe(true);
 expect(await scrollTop()).toBe(before);
});

// Rails: an arrow scrolls its row, the ends update, and focus moves to the arrow that is still there.
test('rail arrows scroll their row, update the ends and keep focus on an arrow',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const rail=page.locator('[data-rail="movies-you-ll-love"]');
 const row=rail.locator('.ui-rail-row');
 await expect(rail).toHaveAttribute('data-can-next','true');
 await rail.locator('.ui-rail-arrow.next').focus();
 await page.keyboard.press('Enter');
 await expect.poll(()=>row.evaluate(r=>r.scrollLeft)).toBeGreaterThan(0);
 await expect(rail).toHaveAttribute('data-can-prev','true');
 await expect(rail).toHaveAttribute('data-can-next','false');
 // The Next arrow hides at the end of the row, so keyboard focus moves to Previous.
 await expect(rail.locator('.ui-rail-arrow.prev')).toBeFocused();
});

// A heading focused by script shows no ring. The Tab press first makes script focus count as keyboard focus.
test('a heading focused by script shows no ring',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const heading=page.locator('.movies-hero h1[tabindex="-1"]');
 await expect(heading).toBeVisible();
 await page.keyboard.press('Tab');
 await heading.evaluate(e=>(e as HTMLElement).focus());
 await expect(heading).toBeFocused();
 expect((await outline(heading)).style).toBe('none');
});

// The Movies tab bar is the glass island at every width.
for(const width of [1440,390])test(`the Movies island is visible at ${width}px, with 5 items`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 await expect(bar).toBeVisible();
 await expect(bar.locator('.ui-tab')).toHaveCount(5);
});

// The island's minimize-on-scroll follows the Movies scroller.
for(const width of [390,1440])test(`the Movies island minimizes on scroll down and expands on scroll up at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 const view=page.locator('.movies-view');
 await expect(bar).toBeVisible();
 // The page must be scrollable first: wait for the catalog's rails, which render after the loading state.
 await expect(page.locator('[data-rail]').first()).toBeVisible();
 await expect.poll(()=>view.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(424);
 await view.evaluate(e=>e.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-minimized','true');
 await view.evaluate(e=>e.scrollTo(0,300));
 await expect(bar).not.toHaveAttribute('data-minimized');
});

// WebKit can run an animation frame long after it was asked for. Keeping a focused control clear of the header must not
// wait for one, or a late frame moves the page after the reader has scrolled and the island reads it as a scroll down.
test('a late animation frame never moves the Movies page after the reader scrolls',async({page})=>{
 await page.addInitScript(()=>{
  const raf=window.requestAnimationFrame.bind(window);let next=0;const pending=new Map<number,number>();
  const frameState={requested:0,ran:0};(window as Window&{frameState?:typeof frameState}).frameState=frameState;
  window.requestAnimationFrame=callback=>{const id=++next;frameState.requested++;pending.set(id,window.setTimeout(()=>{pending.delete(id);raf(time=>{try{callback(time);}finally{frameState.ran++;}});},600));return id;};
  window.cancelAnimationFrame=id=>{window.clearTimeout(pending.get(id));pending.delete(id);};
 });
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 const view=page.locator('.movies-view');
 await expect(page.locator('[data-rail]').first()).toBeVisible();
 await expect.poll(()=>view.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(424);
 // A control takes focus while it is in view, and the reader scrolls. The island's frame is requested by the scroll event, so the check waits for
 // that event, and then for every frame requested so far to have run, before it reads the page.
 await page.locator('.movies-view h1').first().evaluate(h1=>(h1 as HTMLElement).focus({preventScroll:true}));
 const scrolled=view.evaluate(e=>new Promise<void>(resolve=>e.addEventListener('scroll',()=>resolve(),{once:true})));
 await view.evaluate(e=>e.scrollTo(0,400));
 await scrolled;
 await expect.poll(()=>page.evaluate(()=>{const state=(window as Window&{frameState?:{requested:number;ran:number}}).frameState!;return state.requested-state.ran;})).toBe(0);
 expect(await view.evaluate(e=>e.scrollTop)).toBe(400);
 await expect(bar).toHaveAttribute('data-minimized','true');
 await view.evaluate(e=>e.scrollTo(0,300));
 await expect(bar).not.toHaveAttribute('data-minimized');
});

test('the Movies island is expanded again after a section change while it is minimized',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 const view=page.locator('.movies-view');
 await expect(page.locator('[data-rail]').first()).toBeVisible();
 await expect.poll(()=>view.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(424);
 await view.evaluate(e=>e.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-minimized','true');
 await page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true}).click();
 await expect(bar).not.toHaveAttribute('data-minimized');
 await expect(bar.locator('[data-kind="tv"]')).toHaveAttribute('aria-pressed','true');
});

// Typing holds the island where it is, so a scroll while the search field has focus does not minimize it.
test('typing in the Movies search field never minimizes the island',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 const view=page.locator('.movies-view');
 await expect(page.locator('[data-rail]').first()).toBeVisible();
 await expect.poll(()=>view.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(424);
 await page.locator('#movies-search').focus();
 await page.keyboard.type('zebra');
 await view.evaluate(e=>e.scrollTo(0,400));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 expect(await view.evaluate(e=>e.scrollTop)).toBe(400);
 await expect(bar).not.toHaveAttribute('data-minimized');
 // Once the field has no focus, the same scroll minimizes the island.
 await page.locator('#movies-search').evaluate(el=>(el as HTMLElement).blur());
 await view.evaluate(e=>e.scrollTo(0,0));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await view.evaluate(e=>e.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-minimized','true');
});

// The capsule shows the icon of the section that is current, and a section change puts the new icon in it.
test('the Movies capsule shows the current section icon, and follows a section change',async({page})=>{
 // The header's section buttons show from 640 px, so the section change is made at a desktop width.
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 const view=page.locator('.movies-view');
 const capsule=page.locator('.movies-view > .ui-tabbar-mini');
 await expect(page.locator('[data-rail]').first()).toBeVisible();
 await expect.poll(()=>view.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(424);
 await view.evaluate(e=>e.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-minimized','true');
 await expect.poll(()=>capsule.locator('svg').evaluate(el=>el.innerHTML)).toBe(await bar.locator('[aria-pressed="true"] svg').evaluate(el=>el.innerHTML));
 await page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true}).click();
 await expect(bar.locator('[data-kind="tv"]')).toHaveAttribute('aria-pressed','true');
 await expect(bar).not.toHaveAttribute('data-minimized');
 // The TV page is shorter than the home page at this height, so the second half scrolls to 300 px, clear of the end zone.
 await expect.poll(()=>view.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(330);
 await view.evaluate(e=>e.scrollTo(0,0));
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 await view.evaluate(e=>e.scrollTo(0,300));
 await expect(bar).toHaveAttribute('data-minimized','true');
 await expect.poll(()=>capsule.locator('svg').evaluate(el=>el.innerHTML)).toBe(await bar.locator('[aria-pressed="true"] svg').evaluate(el=>el.innerHTML));
});

// Content and keyboard focus clear the island at every width.
for(const width of [390,1440])test(`the Movies scroller keeps 88px of bottom clearance at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/#/movies');
 const view=page.locator('.movies-view');
 expect(await view.evaluate(e=>getComputedStyle(e).scrollPaddingBottom)).toBe('88px');
 expect(await view.evaluate(e=>getComputedStyle(e).paddingBottom)).toBe('88px');
});

// The header never clips the wordmark, overflows its row, or lets the brand, nav and actions overlap, from 320 to 1920 px.
test('the Movies header fits from 320 to 1920 px without clipping the wordmark',async({page})=>{
 const widths=[320,360,390,639,640,700,768,900,1023,1024,1280,1920];
 const results:{width:number;wordmark:number;row:number;brand:number;overlap:boolean}[]=[];
 for(const width of widths){
  await page.setViewportSize({width,height:800});
  await page.goto('/#/movies');
  await expect(page.locator('.ui-wordmark')).toBeVisible();
  results.push(await page.evaluate(w=>{
   const shown=(s:string)=>{const e=document.querySelector<HTMLElement>(s);if(!e||getComputedStyle(e).display==='none')return undefined;const b=e.getBoundingClientRect();return {l:b.left,r:b.right};};
   const mark=document.querySelector<HTMLElement>('.ui-wordmark')!,brand=document.querySelector<HTMLElement>('.ui-brand')!,row=document.querySelector<HTMLElement>('.ui-header-inner')!;
   const B=shown('.ui-brand'),W=shown('.ui-wordmark'),N=shown('.ui-header .ui-nav'),A=shown('.ui-header-actions'),after=N??A;
   return {width:w,wordmark:mark.scrollWidth-mark.clientWidth,row:row.scrollWidth-row.clientWidth,brand:brand.scrollWidth-brand.clientWidth,
    overlap:Boolean(W&&B&&W.r>B.r+0.5)||Boolean(B&&after&&B.r>after.l+0.5)||Boolean(N&&A&&N.r>A.l+0.5)};
  },width));
 }
 expect(results.filter(r=>r.wordmark!==0||r.row!==0||r.brand!==0||r.overlap)).toEqual([]);
});

// Home rails and Continue watching. Fixture titles pass the same checks the app applies to API data.
const fixtureTitle=(id:string,name:string,kind:'movie'|'tv'='movie')=>({id,kind,name,year:2024,genres:['Adventure'],overview:'A fixture title for the home rails.',poster:`https://image.tmdb.org/t/p/w500/fixture${id.replace(/\D/g,'')}.jpg`,seasons:[]});

// The home asks the API for all of its rails in one request.
test('home rails come from one aggregated request',async({page})=>{
 const requests:string[]=[];
 await page.route('**/api/movies?*',route=>{
  requests.push(route.request().url());
  return route.fulfill({json:{rails:[
   {id:'trending',title:'Trending now',titles:[fixtureTitle('movie-90001','Fixture One')]},
   {id:'popular-movies',title:'Popular movies',titles:[fixtureTitle('movie-90002','Fixture Two')]}
  ]}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await expect(page.getByRole('heading',{name:'Trending now',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Popular movies',exact:true})).toBeVisible();
 expect(requests).toHaveLength(1);
 expect(requests[0]).toContain('rails=home');
});

// The starter rails stay on screen, with one quiet line and a retry that does not offer a search retry.
test('a failed rails request shows the starter rails and a quiet retry',async({page})=>{
 await railsDown(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const status=page.locator('.movies-rails-status');
 await expect(status).toBeVisible();
 await expect(status).toContainText('Showing the starter selection. The full catalog is unavailable right now.');
 await expect(status.getByRole('button',{name:'Retry',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Retry search',exact:true})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Movies you’ll love',exact:true})).toBeVisible();
});

// Continue watching reads what storage already holds: the most recently watched title comes first.
test('continue watching lists in-progress titles newest first',async({page})=>{
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  localStorage.setItem('qcc:movies:v1',JSON.stringify({
   list:[],
   progress:{'movie-157336':1200,'tv-19885:s1:e2':600},
   meta:{'movie-157336':{duration:7200,updated:1000},'tv-19885:s1:e2':{duration:2400,updated:2000}},
   titles:{'movie-157336':{id:'movie-157336',kind:'movie',name:'Interstellar',year:2014,poster:'https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg'}}
  }));
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const tiles=page.locator('a.movies-continue');
 await expect(tiles).toHaveCount(2);
 await expect(tiles.nth(0)).toHaveAttribute('aria-label','Resume Sherlock');
 await expect(tiles.nth(0)).toHaveAttribute('href','#/movies/tv-19885/season/1/episode/2/play');
 await expect(tiles.nth(0)).toContainText('S1 · E2');
 await expect(tiles.nth(1)).toHaveAttribute('aria-label','Resume Interstellar');
 await expect(tiles.nth(1)).toHaveAttribute('href','#/movies/movie-157336/play');
 // 600 of 2400 seconds is 25%, and 1200 of 7200 seconds rounds to 17%.
 expect(await tiles.locator('.movies-progress>span').evaluateAll(bars=>bars.map(bar=>(bar as HTMLElement).style.width))).toEqual(['25%','17%']);
});

// A title that only its stored snapshot knows still gets a Continue watching tile with its name and artwork.
test('continue watching shows a title that only its stored snapshot holds',async({page})=>{
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  localStorage.setItem('qcc:movies:v1',JSON.stringify({
   list:[],
   progress:{'movie-90061':900},
   meta:{'movie-90061':{duration:3600,updated:1000}},
   titles:{'movie-90061':{id:'movie-90061',kind:'movie',name:'Snapshot Only Film',year:2019,poster:'https://image.tmdb.org/t/p/w185/snapshotonly.jpg'}}
  }));
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const tile=page.locator('a.movies-continue');
 await expect(tile).toHaveCount(1);
 await expect(tile).toHaveAttribute('aria-label','Resume Snapshot Only Film');
 await expect(tile.locator('.ui-card-title')).toHaveText('Snapshot Only Film');
 await expect(tile).toHaveAttribute('href','#/movies/movie-90061/play');
});

// A rail that fails validation is dropped, and the rails around it still render.
test('malformed rails are skipped',async({page})=>{
 await page.route('**/api/movies?*',route=>route.fulfill({json:{rails:[
  {id:'Bad_Id',title:'Broken rail',titles:[fixtureTitle('movie-90003','Fixture Three')]},
  {id:'good',title:'Good rail',titles:[fixtureTitle('movie-90004','Fixture Four')]}
 ]}}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await expect(page.getByRole('heading',{name:'Good rail',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Broken rail',exact:true})).toHaveCount(0);
 await expect(page.locator('.movies-rails-status')).toHaveCount(0);
});

// The home asks for its rails the first time Home is shown, even when the session opened a title first.
test('home rails load when Home is first shown after a title opened',async({page})=>{
 const requests:string[]=[];
 await page.route('**/api/movies?rails=*',route=>{
  requests.push(route.request().url());
  return route.fulfill({json:{rails:[{id:'fixture',title:'Fixture rail',titles:[fixtureTitle('movie-90011','Fixture Eleven')]}]}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336');
 await expect(page.locator('.movies-detail h1')).toHaveText('Interstellar');
 await page.locator('.movies-top').getByRole('button',{name:'Home',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Fixture rail',exact:true})).toBeVisible();
 expect(requests).toHaveLength(1);
});

// The genre list offers the genres of the home rails, so a genre that only a rail has finds that rail's titles.
test('a genre offered by a home rail finds that rail title',async({page})=>{
 const western={...fixtureTitle('movie-90021','Fixture Western'),genres:['Western']};
 await page.route('**/api/movies?rails=*',route=>route.fulfill({json:{rails:[{id:'westerns',title:'Western picks',titles:[western]}]}}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await expect(page.getByRole('heading',{name:'Western picks',exact:true})).toBeVisible();
 await page.locator('#movies-genre').selectOption('Western');
 await expect(page.getByRole('link',{name:'Details for Fixture Western'})).toBeVisible();
 await expect(page.getByText('No titles found')).toHaveCount(0);
});

// My list has one source on its page and on the home rail: a saved title resolves from its stored snapshot when the catalog lacks it.
test('My list page shows a saved title that only its stored snapshot holds',async({page})=>{
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  localStorage.setItem('qcc:movies:v1',JSON.stringify({
   list:['movie-90031'],
   progress:{},
   meta:{},
   titles:{'movie-90031':{id:'movie-90031',kind:'movie',name:'Snapshot Only',year:2019,poster:'https://image.tmdb.org/t/p/w500/snapshotonly.jpg'}}
  }));
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/list');
 await expect(page.getByRole('link',{name:'Details for Snapshot Only'})).toBeVisible();
 // A list with titles never shows the empty-list copy, whether its titles come from the catalog or from a stored snapshot.
 await expect(page.getByText('Your list is empty')).toHaveCount(0);
});

// The hero list button names its action in its label, has no aria-pressed, and shows at every width.
for(const width of [1440,390])test(`the hero list button names its action at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/#/movies');
 const list=page.locator('.movies-hero .movies-hero-list');
 await expect(list).toBeVisible();
 await expect(list).toHaveAccessibleName('Add Interstellar to my list');
 await expect(list).not.toHaveAttribute('aria-pressed');
 await expect(list).toContainText('My list');
 await list.click();
 await expect(page.locator('.movies-hero .movies-hero-list')).toHaveAccessibleName('Remove Interstellar from my list');
 await expect(page.locator('.movies-hero .movies-hero-list')).not.toHaveAttribute('aria-pressed');
});

// A series hero whose episodes are not loaded plays through the title page, never a play route without an episode.
test('a series hero without a loaded season plays through its title page',async({page})=>{
 const series=fixtureTitle('tv-778811','Summary Series','tv');
 const detail={...series,seasons:[{number:1,name:'Season 1',episodes:[{number:1,name:'Pilot',overview:'The first episode.'}]}]};
 await page.route('**/api/movies?*',route=>{
  if(new URL(route.request().url()).searchParams.has('id'))return route.fulfill({json:{title:detail}});
  return route.fulfill({json:{rails:[{id:'shows',title:'Shows to start',titles:[series]}]}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const play=page.locator('.movies-hero').getByRole('button',{name:'Play',exact:true});
 await expect(play).toBeEnabled();
 await play.click();
 await expect(page).toHaveURL(/#\/movies\/tv-778811$/);
 await expect(page.getByRole('heading',{name:'Summary Series',exact:true})).toBeVisible();
});

// A poster that fails to load is classified as failed and its title shows on the placeholder.
test('a card whose image fails shows its placeholder title',async({page})=>{
 await page.route('https://image.tmdb.org/**',route=>route.fulfill({status:404,body:'Unavailable'}));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/movies');
 const card=page.locator('.movies-poster[data-title="movie-157336"]').first();
 await expect(card.locator('img.ui-card-img')).toHaveClass(/is-failed/);
 const label=card.locator('.ui-card-placeholder>span');
 await expect(label).toHaveText('Interstellar');
 await expect(label).toBeVisible();
 await expect(label).toHaveCSS('color','rgb(159, 159, 169)');
});

// A poster that failed stays failed: a re-render shows its placeholder without asking for the image again.
test('a poster that failed is not rendered as an image again',async({page})=>{
 await railsDown(page);
 await page.route('https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg',route=>route.fulfill({status:404,headers:{'cache-control':'no-store'},body:'Unavailable'}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const card=page.locator('.movies-poster[data-title="movie-157336"]').first();
 await expect(card.locator('img.ui-card-img')).toHaveClass(/is-failed/);
 await expect(card.locator('.ui-card-placeholder>span')).toBeVisible();
 await page.locator('#movies-search').fill('s');
 await page.locator('#movies-search').fill('');
 await expect(card.locator('img')).toHaveCount(0);
 const label=card.locator('.ui-card-placeholder>span');
 await expect(label).toHaveText('Interstellar');
 await expect(label).toBeVisible();
});

// A backdrop that failed is not requested again on a re-render: the poster stands in for it.
test('a backdrop that failed is not requested again on a re-render',async({page})=>{
 const backdrop='https://image.tmdb.org/t/p/w1280/pbrkL804c8yAv3zBZR4QPEafpAR.jpg';
 const requested:string[]=[];
 page.on('request',request=>{if(request.url()===backdrop)requested.push(request.url());});
 await page.route(backdrop,route=>route.fulfill({status:404,headers:{'cache-control':'no-store'},body:'Unavailable'}));
 await railsDown(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 // The failed rails request renders the home once more, and the backdrop then shows its poster. Only requests after that count.
 await expect(page.locator('.movies-rails-status')).toBeVisible();
 await expect(page.locator('.ui-hero-backdrop')).toHaveClass(/is-loaded/);
 const before=requested.length;
 await page.locator('#movies-search').fill('s');
 await page.locator('#movies-search').fill('');
 await expect(page.locator('.ui-hero-backdrop')).toHaveClass(/is-loaded/);
 expect(requested.length).toBe(before);
});

// Data flow: earlier full-catalog results stay on screen while a new query waits for its answer.
test('earlier full-catalog results stay visible until a new query answers',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let sawSecond!:()=>void;
 const secondRequest=new Promise<void>(resolve=>{sawSecond=resolve;});
 await page.route('**/api/movies?*',async route=>{
  const query=new URL(route.request().url()).searchParams.get('q');
  if(!query)return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  // The second answer is held until the test has seen its request, which goes out after the search debounce.
  if(query==='second query'){sawSecond();await held;}
  return route.fulfill({json:{titles:[query==='first query'?fixtureTitle('movie-90101','Earlier Result'):fixtureTitle('movie-90102','Later Result')],page:1,totalPages:1,totalResults:1}});
 });
 await page.goto('/#/movies');
 const search=page.getByRole('searchbox',{name:'Search movies and TV'});
 await search.fill('first query');
 await expect(page.getByRole('link',{name:'Details for Earlier Result'})).toBeVisible();
 await search.fill('second query');
 await secondRequest;
 await expect(page.locator('.movies-catalog-status')).toContainText('Searching');
 await expect(page.getByRole('link',{name:'Details for Earlier Result'})).toBeVisible();
 release();
 await expect(page.getByRole('link',{name:'Details for Later Result'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Details for Earlier Result'})).toHaveCount(0);
});

// Section 9: keyboard focus stays visible in the search field as an inner ring on the field's box, with no outline on it or the bare input.
test('the search field shows an inner focus ring on its box',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await tabTo(page,page.locator('#movies-search'));
 const box=page.locator('label.movies-search');
 expect((await outline(box)).style).toBe('none');
 expect(await box.evaluate(el=>getComputedStyle(el).boxShadow)).toContain('rgba(255, 255, 255, 0.7) 0px 0px 0px 1px inset');
 expect((await outline(page.locator('#movies-search'))).style).toBe('none');
});

// A render rebuilds the poster elements. A poster that already loaded must appear at once, not fade in again on every keystroke.
test('a re-rendered poster does not fade in again',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await expect(page.locator('.movies-poster[data-title="movie-157336"] img.ui-card-img').first()).toHaveClass(/is-loaded/);
 await page.locator('#movies-search').fill('s');
 const poster=page.locator('.movies-results-grid .movies-poster[data-title="movie-157336"] img.ui-card-img').first();
 await expect(poster).toHaveClass(/is-loaded/);
 expect(await poster.evaluate(image=>getComputedStyle(image).animationName)).toBe('none');
});

// A keyboard user who pages through results keeps focus on Next while the next page renders.
test('keyboard focus stays on Next when the next page of results renders',async({page})=>{
 await page.route('**/api/movies?*',route=>{
  const params=new URL(route.request().url()).searchParams;
  if(!params.has('q'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  const number=Number(params.get('page')||1);
  return route.fulfill({json:{titles:[fixtureTitle(`movie-9004${number}`,`Paged ${number}`)],page:number,totalPages:3,totalResults:3}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await page.locator('#movies-search').fill('star');
 const next=page.getByRole('button',{name:'Next',exact:true});
 await expect(next).toBeVisible();
 await next.focus();
 await page.keyboard.press('Enter');
 await expect(page.locator('.movies-pagination')).toContainText('Page 2 of 3');
 await expect(next).toBeFocused();
 await expect(next).toHaveAttribute('data-nav','next');
});

// Retry search replaces its own button while it runs, so focus moves to the search status line that stays.
test('Retry search keeps keyboard focus on the search status line',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await page.locator('#movies-search').fill('zz');
 const retry=page.getByRole('button',{name:'Retry search',exact:true});
 await expect(retry).toBeVisible();
 await retry.focus();
 await page.keyboard.press('Enter');
 await expect(page.locator('.movies-catalog-status')).toBeFocused();
});

// Going back from a title returns focus to the card in the rail it was opened from, even when another rail shows the same title.
test('going back from a title returns focus to the rail it was opened from',async({page})=>{
 await railsDown(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const card=page.locator('[data-rail="sci-fi-fantasy"] [data-title="movie-157336"]');
 await expect(card).toBeVisible();
 await card.click();
 await expect(page).toHaveURL(/#\/movies\/movie-157336$/);
 // The title page has no back link: browser history returns to the browse page. The back step waits for the title page to take focus,
 // which shows the app has applied the title route. Earlier, a back step could run before the title's hash change, and the page never saw the title.
 await expect(page.locator('section.movies-detail h1')).toBeFocused();
 await page.goBack();
 await expect(page).toHaveURL(/#\/movies$/);
 await expect(card).toBeFocused();
});

// A heading or a header link that has focus keeps it when a failed rails request renders the home again, so focus does not jump to the status line.
test('a page heading keeps focus when a failed rails request renders the home',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/movies?rails=*',async route=>{await held;return route.fulfill({status:503,json:{error:'catalog_not_configured'}});});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336');
 await expect(page.locator('.movies-detail h1')).toHaveText('Interstellar');
 await page.locator('.movies-top').getByRole('button',{name:'Home',exact:true}).click();
 const heading=page.locator('.movies-hero h1');
 await expect(heading).toBeFocused();
 release();
 await expect(page.locator('.movies-rails-status')).toBeVisible();
 await expect(heading).toBeFocused();
});

test('a header link keeps focus when a failed rails request renders the home',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/movies?rails=*',async route=>{await held;return route.fulfill({status:503,json:{error:'catalog_not_configured'}});});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 // The catalog's first render replaces the page, so the link is focused after that render.
 await expect(page.locator('.movies-hero')).toBeVisible();
 const games=page.locator('.movies-top a.movies-back');
 await games.focus();
 await expect(games).toBeFocused();
 release();
 await expect(page.locator('.movies-rails-status')).toBeVisible();
 await expect(games).toBeFocused();
});

// A rails response that arrives after focus moved to a card re-renders the home, and the same title keeps focus.
test('a late rails response keeps focus on the card that had it',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/movies?rails=*',async route=>{
  await held;
  return route.fulfill({json:{rails:[{id:'trending',title:'Trending now',titles:[fixtureTitle('movie-157336','Interstellar')]}]}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const card=page.locator('[data-rail="movies-you-ll-love"] [data-title="movie-157336"]');
 await expect(card).toBeVisible();
 await card.focus();
 release();
 await expect(page.getByRole('heading',{name:'Trending now',exact:true})).toBeVisible();
 await expect(page.locator('[data-rail] [data-title="movie-157336"]')).toBeFocused();
});

// Section pages and My list. Each fixture answers by the request's own parameters, so a test states what the server returns.
const seedMovies=(page:Page,state:unknown)=>page.addInitScript(value=>{
 if(window!==window.top)return;
 localStorage.setItem('qcc:movies:v1',JSON.stringify(value));
},state);
const savedFilm={list:['movie-157336'],progress:{},meta:{},titles:{}};
// Records each JSON answer as the page finishes reading it. The page handles an answer in the microtasks after that, before any other task runs, so a test that waits for the URL waits for the page to handle it.
const trackAnswers=(page:Page)=>page.addInitScript(()=>{
 if(window!==window.top)return;
 const read=Response.prototype.json,answers:string[]=[];
 (window as Window&{answers?:string[]}).answers=answers;
 Response.prototype.json=function(this:Response){return read.call(this).finally(()=>{answers.push(this.url);});};
});
// How many recorded answers have a URL that contains the text.
const answersRead=(page:Page,text:string)=>page.evaluate(fragment=>((window as Window&{answers?:string[]}).answers??[]).filter(url=>url.includes(fragment)).length,text);

test('TV Shows shows TV rails and asks the server for a genre',async({page})=>{
 const genreRequests:string[]=[];
 await page.route('**/api/movies?*',route=>{
  const url=route.request().url(),params=new URL(url).searchParams;
  if(params.get('rails')==='tv')return route.fulfill({json:{rails:[{id:'fixture-shows',title:'Fixture TV rail',titles:[fixtureTitle('tv-90201','Fixture Series','tv')]}]}});
  if(params.get('genre')==='Drama'){genreRequests.push(url);return route.fulfill({json:{titles:[{...fixtureTitle('tv-90202','Remote Drama Series','tv'),genres:['Drama']}],page:1,totalPages:1,totalResults:1}});}
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true}).click();
 await expect(page.getByRole('heading',{name:'TV Shows',exact:true,level:1})).toBeVisible();
 await expect(page.locator('.movies-page-head p')).toHaveText('Series to start tonight and seasons to catch up on.');
 await expect(page.getByRole('heading',{name:'Fixture TV rail',exact:true})).toBeVisible();
 await page.locator('#movies-genre').selectOption('Drama');
 await expect(page.getByRole('link',{name:'Details for Remote Drama Series'})).toBeVisible();
 // The bundled series that is a drama stays in the grid beside the server's title.
 await expect(page.getByRole('link',{name:'Details for Sherlock'})).toBeVisible();
 expect(genreRequests).toHaveLength(1);
 expect(new URL(genreRequests[0]).searchParams.get('type')).toBe('tv');
});

test('My list keeps a remote title after a reload',async({page})=>{
 const remote=fixtureTitle('tv-778811','Remote Expedition','tv');
 const detail={...remote,seasons:[{number:1,name:'Season 1',episodes:[{number:1,name:'First Contact',overview:'A first episode.'}]}]};
 await page.route('**/api/movies?*',route=>{
  const params=new URL(route.request().url()).searchParams;
  if(params.has('id'))return route.fulfill({json:{title:detail}});
  if(params.has('q'))return route.fulfill({json:{titles:[remote],page:1,totalPages:1,totalResults:1}});
  // Every other request, including the reload's, is answered with 503.
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('remote expedition');
 await page.getByRole('link',{name:'Details for Remote Expedition'}).click();
 await page.getByRole('button',{name:'Add to my list'}).click();
 await expect(page.getByRole('button',{name:'In my list'})).toBeVisible();
 await page.goto('/#/movies/list');
 await page.reload();
 await expect(page.getByRole('link',{name:'Details for Remote Expedition'})).toBeVisible();
});

test('an empty list explains how to add titles',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/list');
 await expect(page.getByRole('heading',{name:'Your list is empty',exact:true})).toBeVisible();
 await expect(page.getByText('Open a title and choose Add to my list to save it here.',{exact:true})).toBeVisible();
 const explore=page.getByRole('button',{name:'Explore all titles',exact:true});
 await expect(explore).toBeVisible();
 await explore.click();
 await expect(page).toHaveURL(/#\/movies$/);
 await expect(page.locator('.movies-hero')).toBeVisible();
});

test('Movies shows its own rails from rails=movie',async({page})=>{
 const requests:string[]=[];
 await page.route('**/api/movies?*',route=>{
  const url=route.request().url();
  if(new URL(url).searchParams.get('rails')==='movie'){requests.push(url);return route.fulfill({json:{rails:[{id:'fixture-picks',title:'Fixture movie rail',titles:[fixtureTitle('movie-90301','Fixture Movie Pick')]}]}});}
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await expect(page.getByRole('heading',{name:'Movies',exact:true,level:1})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Fixture movie rail',exact:true})).toBeVisible();
 await expect(page.locator('.movies-results-grid')).toHaveCount(0);
 await expect(page.locator('.movies-rails-status')).toHaveCount(0);
 expect(requests).toHaveLength(1);
});

test('Movies falls back to its bundled movies with a retry line when its rails fail',async({page})=>{
 let fail=true;
 const requests:string[]=[];
 await page.route('**/api/movies?*',route=>{
  const url=route.request().url();
  if(new URL(url).searchParams.get('rails')==='movie'){
   requests.push(url);
   return fail?route.fulfill({status:503,json:{error:'metadata_unavailable'}}):route.fulfill({json:{rails:[{id:'fixture-picks',title:'Fixture movie rail',titles:[fixtureTitle('movie-90301','Fixture Movie Pick')]}]}});
  }
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 const status=page.locator('.movies-rails-status');
 await expect(status).toContainText('Showing the starter selection. The full catalog is unavailable right now.');
 // The six bundled films, in one grid.
 await expect(page.locator('.movies-results-grid')).toHaveCount(1);
 await expect(page.locator('.movies-results-grid .movies-poster')).toHaveCount(6);
 fail=false;
 await status.getByRole('button',{name:'Retry',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Fixture movie rail',exact:true})).toBeVisible();
 expect(requests).toHaveLength(2);
});

test('a successful empty section answer shows the starter grid with no status line',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/movies?*',async route=>{
  if(new URL(route.request().url()).searchParams.get('rails')==='movie'){await held;return route.fulfill({json:{rails:[]}});}
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await expect(page.locator('.movies-results-grid .movies-poster')).toHaveCount(6);
 // The answer waits until the starter grid is on screen. The answer replaces that grid, so the checks wait for the swap.
 const loading=await page.locator('.movies-results-grid').elementHandle();
 const response=page.waitForResponse(response=>response.url().includes('rails=movie'));
 release();await (await response).finished();
 await expect.poll(()=>loading.evaluate(grid=>grid.isConnected)).toBe(false);
 await expect(page.locator('.movies-results-grid .movies-poster')).toHaveCount(6);
 await expect(page.locator('.movies-rails-status')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Retry',exact:true})).toHaveCount(0);
 await expect(page.getByText('No titles to show here right now.')).toHaveCount(0);
 await expect(page.getByText('The full catalog is unavailable right now.')).toHaveCount(0);
});

test('section rails keep their ids unique and show their names as text',async({page})=>{
 await page.route('**/api/movies?*',route=>{
  if(new URL(route.request().url()).searchParams.get('rails')==='movie')return route.fulfill({json:{rails:[
   {id:'popular',title:'<b>Bold</b> rail',titles:[fixtureTitle('movie-90701','Rail One')]},
   {id:'popular',title:'Second rail',titles:[fixtureTitle('movie-90702','Rail Two')]}
  ]}});
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await expect(page.getByRole('heading',{name:'Second rail',exact:true})).toBeVisible();
 await expect(page.locator('[data-rail="popular"]')).toHaveCount(1);
 await expect(page.locator('[data-rail="popular-2"]')).toHaveCount(1);
 const first=page.locator('.movies-shelf h2').first();
 await expect(first).toHaveText('<b>Bold</b> rail');
 expect(await first.evaluate(h=>h.querySelector('b'))).toBeNull();
});

test('a title from a section rail can be saved and survives a reload',async({page})=>{
 const railTitle=fixtureTitle('tv-90801','Rail Saved Series','tv');
 await page.route('**/api/movies?*',route=>{
  const params=new URL(route.request().url()).searchParams;
  if(params.get('rails')==='tv')return route.fulfill({json:{rails:[{id:'shows',title:'Shows rail',titles:[railTitle]}]}});
  if(params.has('id'))return route.fulfill({json:{title:{...railTitle,seasons:[]}}});
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/tv');
 await page.getByRole('link',{name:'Details for Rail Saved Series'}).click();
 await expect(page.locator('.movies-detail h1')).toHaveText('Rail Saved Series');
 await page.getByRole('button',{name:'Add to my list'}).click();
 await page.goto('/#/movies/list');
 await page.reload();
 await expect(page.getByRole('link',{name:'Details for Rail Saved Series'})).toBeVisible();
});

test('a hero title from the API rails survives a reload in My list',async({page})=>{
 const hero=fixtureTitle('movie-90501','Fixture Hero');
 await page.route('**/api/movies?*',route=>{
  if(new URL(route.request().url()).searchParams.get('rails')==='home')return route.fulfill({json:{rails:[{id:'hero-rail',title:'Hero rail',titles:[hero]}]}});
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const list=page.locator('.movies-hero .movies-hero-list');
 await expect(list).toHaveAccessibleName('Add Fixture Hero to my list');
 await list.click();
 await expect(list).toHaveAccessibleName('Remove Fixture Hero from my list');
 await page.goto('/#/movies/list');
 await page.reload();
 await expect(page.getByRole('link',{name:'Details for Fixture Hero'})).toBeVisible();
});

test('a genre on the Movies page asks the server and keeps the local matches',async({page})=>{
 const requests:string[]=[];
 await page.route('**/api/movies?*',route=>{
  const url=route.request().url();
  if(new URL(url).searchParams.get('genre')==='Science Fiction'){requests.push(url);return route.fulfill({json:{titles:[{...fixtureTitle('movie-90401','Remote Science Film'),genres:['Science Fiction']}],page:1,totalPages:1,totalResults:1}});}
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await page.locator('#movies-genre').selectOption('Science Fiction');
 await expect(page.getByRole('link',{name:'Details for Remote Science Film'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Details for Interstellar'})).toBeVisible();
 expect(requests).toHaveLength(1);
 expect(new URL(requests[0]).searchParams.get('type')).toBe('movie');
 expect(new URL(requests[0]).searchParams.get('genre')).toBe('Science Fiction');
});

test('a failed genre request keeps the local matches and offers a retry',async({page})=>{
 let fail=true;
 const requests:string[]=[];
 await page.route('**/api/movies?*',route=>{
  const url=route.request().url();
  if(new URL(url).searchParams.get('genre')==='Science Fiction'){
   requests.push(url);
   return fail?route.fulfill({status:503,json:{error:'metadata_unavailable'}}):route.fulfill({json:{titles:[{...fixtureTitle('movie-90402','Retried Science Film'),genres:['Science Fiction']}],page:1,totalPages:1,totalResults:1}});
  }
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await page.locator('#movies-genre').selectOption('Science Fiction');
 await expect(page.getByRole('link',{name:'Details for Interstellar'})).toBeVisible();
 const status=page.locator('.movies-catalog-status');
 await expect(status).toContainText('The titles included with this site are still shown.');
 fail=false;
 await status.getByRole('button',{name:'Retry',exact:true}).click();
 await expect(page.getByRole('link',{name:'Details for Retried Science Film'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Details for Interstellar'})).toBeVisible();
 expect(requests).toHaveLength(2);
});

// A failed genre request names its own results, so its status does not read as a failed full-catalog search. Retry loads the genre.
test('a failed genre request names its own results and Retry loads them',async({page})=>{
 let fail=true;
 await page.route('**/api/movies?*',route=>{
  if(new URL(route.request().url()).searchParams.get('genre')!=='Science Fiction')return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  return fail?route.fulfill({status:503,json:{error:'metadata_unavailable'}}):route.fulfill({json:{titles:[{...fixtureTitle('movie-90403','Named Genre Film'),genres:['Science Fiction']}],page:1,totalPages:1,totalResults:1}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await page.locator('#movies-genre').selectOption('Science Fiction');
 const status=page.locator('.movies-catalog-status');
 await expect(status).toContainText('Genre results is temporarily unavailable.');
 await expect(status).not.toContainText('Full catalog search');
 fail=false;
 await status.getByRole('button',{name:'Retry',exact:true}).click();
 await expect(page.getByRole('link',{name:'Details for Named Genre Film'})).toBeVisible();
});

// A short query narrows a genre's server titles as it narrows the local ones: one letter keeps only the titles that contain it.
test('a one-letter search narrows the server titles of a genre',async({page})=>{
 await page.route('**/api/movies?*',route=>{
  if(new URL(route.request().url()).searchParams.get('genre')!=='Science Fiction')return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  return route.fulfill({json:{titles:[
   {...fixtureTitle('movie-90901','Xenon Voyage'),genres:['Science Fiction'],overview:'Ships cross the void.'},
   {...fixtureTitle('movie-90902','Quiet Harbour'),genres:['Science Fiction'],overview:'A calm story of the sea.'}
  ],page:1,totalPages:1,totalResults:2}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await page.locator('#movies-genre').selectOption('Science Fiction');
 await expect(page.getByRole('link',{name:'Details for Quiet Harbour'})).toBeVisible();
 await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('x');
 await expect(page.getByRole('link',{name:'Details for Xenon Voyage'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Details for Quiet Harbour'})).toHaveCount(0);
});

// Choosing a section by its route resets the genre, as the section buttons do. The typed query is left as it is.
test('going back to TV from Movies resets the genre that Movies had set',async({page})=>{
 const genreRequests:string[]=[];
 await page.route('**/api/movies?*',route=>{
  const url=route.request().url(),params=new URL(url).searchParams;
  if(params.get('rails')==='tv')return route.fulfill({json:{rails:[{id:'fixture-shows',title:'Fixture TV rail',titles:[fixtureTitle('tv-90231','Fixture Series','tv')]}]}});
  if(params.get('genre')==='Science Fiction'){genreRequests.push(url);return route.fulfill({json:{titles:[{...fixtureTitle('movie-90231','Remote Science Film'),genres:['Science Fiction']}],page:1,totalPages:1,totalResults:1}});}
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/tv');
 await expect(page.getByRole('heading',{name:'Fixture TV rail',exact:true})).toBeVisible();
 await page.locator('.movies-top').getByRole('button',{name:'Movies',exact:true}).click();
 await expect(page).toHaveURL(/#\/movies\/browse\/movie$/);
 // The address changes before the page renders Movies, so the genre is chosen once its heading shows.
 await expect(page.getByRole('heading',{name:'Movies',exact:true,level:1})).toBeVisible();
 await page.locator('#movies-genre').selectOption('Science Fiction');
 await expect(page.getByRole('link',{name:'Details for Remote Science Film'})).toBeVisible();
 await page.clock.install();
 await page.goBack();
 await expect(page).toHaveURL(/#\/movies\/browse\/tv$/);
 await expect(page.getByRole('heading',{name:'TV Shows',exact:true,level:1})).toBeVisible();
 await expect(page.locator('#movies-genre')).toHaveValue('All');
 await expect(page.locator('.movies-catalog-status')).toHaveCount(0);
 // Past the search debounce on the clock, so a genre request for TV would have gone out by now.
 await page.clock.runFor(300);
 expect(genreRequests).toHaveLength(1);
 expect(new URL(genreRequests[0]).searchParams.get('type')).toBe('movie');
});

test('a later page of a genre uses the existing pagination',async({page})=>{
 const pages:string[]=[];
 await page.route('**/api/movies?*',route=>{
  const params=new URL(route.request().url()).searchParams;
  if(params.get('genre')==='Science Fiction'){
   const number=Number(params.get('page')||1);
   pages.push(String(number));
   return route.fulfill({json:{titles:[{...fixtureTitle(`movie-9050${number}`,`Genre Page ${number}`),genres:['Science Fiction']}],page:number,totalPages:2,totalResults:2}});
  }
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await page.locator('#movies-genre').selectOption('Science Fiction');
 await expect(page.locator('.movies-pagination')).toContainText('Page 1 of 2');
 await page.locator('.movies-pagination').getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.getByRole('link',{name:'Details for Genre Page 2'})).toBeVisible();
 await expect(page.locator('.movies-pagination')).toContainText('Page 2 of 2');
 expect(pages).toEqual(['1','2']);
});

test('a genre response that arrives after a title opened updates state only',async({page})=>{
 await trackAnswers(page);
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let sawGenre!:()=>void;
 const genreSeen=new Promise<void>(resolve=>{sawGenre=resolve;});
 await page.route('**/api/movies?*',async route=>{
  const params=new URL(route.request().url()).searchParams;
  if(params.get('genre')==='Science Fiction'){sawGenre();await held;return route.fulfill({json:{titles:[{...fixtureTitle('movie-90601','Late Genre Film'),genres:['Science Fiction']}],page:1,totalPages:1,totalResults:1}});}
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await page.locator('#movies-genre').selectOption('Science Fiction');
 await genreSeen;
 await page.getByRole('link',{name:'Details for Interstellar'}).click();
 await expect(page.locator('.movies-detail h1')).toHaveText('Interstellar');
 release();
 // The late answer has been handled once its URL is recorded, so the checks below run after it, not before it.
 await expect.poll(()=>answersRead(page,'genre=Science')).toBe(1);
 await expect(page.locator('.movies-detail h1')).toHaveText('Interstellar');
 await expect(page).toHaveURL(/#\/movies\/movie-157336$/);
 // Back in history returns to the section with its genre, and the titles that arrived meanwhile are there.
 await page.goBack();
 await expect(page).toHaveURL(/#\/movies\/browse\/movie$/);
 await expect(page.getByRole('link',{name:'Details for Late Genre Film'})).toBeVisible();
});

// A genre answer that arrives after a newer genre was chosen is dropped, so the grid keeps the newer genre's titles.
test('a superseded genre answer is dropped when a newer genre answers',async({page})=>{
 let release!:()=>void;
 let lateAnswers=0;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let sawFirst!:()=>void;
 const firstRequest=new Promise<void>(resolve=>{sawFirst=resolve;});
 await page.route('**/api/movies?*',async route=>{
  const genre=new URL(route.request().url()).searchParams.get('genre');
  // The stale titles carry Drama too, so the newer genre's filter would keep them if they reached the grid.
  if(genre==='Science Fiction'){sawFirst();await held;await route.fulfill({json:{titles:[{...fixtureTitle('movie-90511','Stale Science Film'),genres:['Science Fiction','Drama']}],page:1,totalPages:1,totalResults:1}}).catch(()=>{});lateAnswers++;return;}
  if(genre==='Drama')return route.fulfill({json:{titles:[{...fixtureTitle('movie-90512','Fresh Drama Film'),genres:['Drama']}],page:1,totalPages:1,totalResults:1}});
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await page.locator('#movies-genre').selectOption('Science Fiction');
 await firstRequest;
 await page.locator('#movies-genre').selectOption('Drama');
 await expect(page.getByRole('link',{name:'Details for Fresh Drama Film'})).toBeVisible();
 release();
 // The page cancelled the older request when Drama was chosen. Its late answer must change nothing, so the checks run once the page has read that answer.
 await expect.poll(()=>lateAnswers).toBe(1);
 await expect(page.getByRole('link',{name:'Details for Stale Science Film'})).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Details for Fresh Drama Film'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Details for Arrival'})).toBeVisible();
});

test('My list emptied by a genre filter shows No titles found, not the empty-list copy',async({page})=>{
 await seedMovies(page,savedFilm);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/list');
 await expect(page.getByRole('link',{name:'Details for Interstellar'})).toBeVisible();
 await page.locator('#movies-genre').selectOption('Documentary');
 await expect(page.getByRole('heading',{name:'No titles found',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Your list is empty'})).toHaveCount(0);
});

test('My list searches its saved titles only, without a full-catalog request',async({page})=>{
 const queries:string[]=[];
 await page.route('**/api/movies?*',route=>{
  const params=new URL(route.request().url()).searchParams;
  if(params.has('q'))queries.push(params.get('q')!);
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await seedMovies(page,savedFilm);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/list');
 await page.clock.install();
 await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('arrival');
 await expect(page.getByRole('heading',{name:'No titles found',exact:true})).toBeVisible();
 await expect(page.locator('.movies-catalog-status')).toHaveCount(0);
 // Past the 280 ms search debounce on the clock, so a request that was due would have gone out by now.
 await page.clock.runFor(300);
 expect(queries).toEqual([]);
});

test('My list shows its title block with the saved count',async({page})=>{
 await seedMovies(page,{list:['movie-157336','movie-329865'],progress:{},meta:{},titles:{}});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/list');
 const head=page.locator('.movies-page-head');
 await expect(head.getByRole('heading',{name:'My list',exact:true,level:1})).toBeVisible();
 await expect(head.locator('p')).toHaveText('Titles you saved on this device.');
 await expect(head.locator('.ui-count')).toHaveText('2 titles');
});

// My list's no-match copy says what its search covers: the titles saved on this device. The other pages keep the catalog snapshot copy.
test('My list says its search covers the titles saved on this device',async({page})=>{
 await seedMovies(page,savedFilm);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/list');
 await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('arrival');
 await expect(page.getByRole('heading',{name:'No titles found',exact:true})).toBeVisible();
 await expect(page.locator('.movies-empty p')).toHaveText('Try another title or clear your filters. My list search covers the titles saved on this device.');
 await page.goto('/#/movies/browse/movie');
 await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('zzzz');
 await expect(page.getByRole('heading',{name:'No titles found',exact:true})).toBeVisible();
 await expect(page.locator('.movies-empty p')).toHaveText('Try another title or clear your filters. Search covers this catalog snapshot only.');
});

// Study is in the header and in the island. A focus restored after a render stays in its own bar, so the island tab keeps focus.
for(const width of [390,1440])test(`the island's Study tab keeps focus when a late rails response renders at ${width}px`,async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/movies?rails=*',async route=>{await held;return route.fulfill({status:503,json:{error:'catalog_not_configured'}});});
 await page.setViewportSize({width,height:844});
 await page.goto('/#/movies');
 const study=page.locator('.movies-mobile-nav [data-action="study"]');
 await expect(study).toBeVisible();
 await study.focus();
 await expect(study).toBeFocused();
 release();
 await expect(page.locator('.movies-rails-status')).toBeVisible();
 await expect(study).toBeFocused();
});

// The collection's first ready or failed render replaces the header and the island. A control focused while it opens keeps focus.
for(const outcome of ['ready','failed'] as const)test(`the island's Study tab keeps focus when the collection opens ${outcome==='ready'?'and shows the home':'and fails'}`,async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/movies/catalog.json*',async route=>{await held;return outcome==='ready'?route.continue():route.fulfill({status:503,body:'unavailable'});});
 await page.route('**/api/movies?rails=*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/movies');
 await expect(page.getByRole('heading',{name:'Opening the collection…',exact:true})).toBeVisible();
 const study=page.locator('.movies-mobile-nav [data-action="study"]');
 await study.focus();
 await expect(study).toBeFocused();
 release();
 await expect(outcome==='ready'?page.locator('.movies-hero'):page.getByRole('heading',{name:'The collection is unavailable',exact:true})).toBeVisible();
 await expect(study).toBeFocused();
});

// An invalid route keeps its not-found message when a late rails answer arrives.
test('a late rails answer keeps the not-found message on an invalid route',async({page})=>{
 await trackAnswers(page);
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let sawRails!:()=>void;
 const railsRequest=new Promise<void>(resolve=>{sawRails=resolve;});
 await page.route('**/api/movies?rails=*',async route=>{sawRails();await held;return route.fulfill({json:{rails:[{id:'late-rail',title:'Late rail',titles:[fixtureTitle('movie-90411','Late Rail Film')]}]}});});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await expect(page.locator('.movies-hero')).toBeVisible();
 await railsRequest;
 await page.goto('/#/movies/browse/all');
 const notFound=page.getByRole('heading',{name:'That page could not be found.',exact:true});
 await expect(notFound).toBeVisible();
 release();
 await expect.poll(()=>answersRead(page,'rails=home')).toBe(1);
 await expect(notFound).toBeVisible();
 await expect(page.locator('.movies-hero')).toHaveCount(0);
});

// The same holds for a late genre answer: the invalid route keeps its message.
test('a late genre answer keeps the not-found message on an invalid route',async({page})=>{
 await trackAnswers(page);
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let sawGenre!:()=>void;
 const genreRequest=new Promise<void>(resolve=>{sawGenre=resolve;});
 await page.route('**/api/movies?*',async route=>{
  if(new URL(route.request().url()).searchParams.get('genre')==='Science Fiction'){sawGenre();await held;return route.fulfill({json:{titles:[{...fixtureTitle('movie-90421','Late Genre Answer'),genres:['Science Fiction']}],page:1,totalPages:1,totalResults:1}});}
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await page.locator('#movies-genre').selectOption('Science Fiction');
 await genreRequest;
 await page.goto('/#/movies/browse/all');
 const notFound=page.getByRole('heading',{name:'That page could not be found.',exact:true});
 await expect(notFound).toBeVisible();
 release();
 await expect.poll(()=>answersRead(page,'genre=Science')).toBe(1);
 await expect(notFound).toBeVisible();
 await expect(page.getByRole('link',{name:'Details for Late Genre Answer'})).toHaveCount(0);
});

// A direct visit to an invalid route keeps its not-found message once the catalog has loaded.
test('a direct visit to an invalid route keeps its not-found message',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/all');
 await expect(page.getByRole('heading',{name:'That page could not be found.',exact:true})).toBeVisible();
 await expect(page.locator('.movies-hero')).toHaveCount(0);
});

// A late genre or section rails answer leaves an open player alone: the same provider frame stays in place.
for(const late of ['genre','section rails'] as const)test(`a late ${late} answer leaves an open player untouched`,async({page})=>{
 await trackAnswers(page);
 const pending=late==='genre'?'genre=Science':'rails=movie';
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let sawPending!:()=>void;
 const pendingRequest=new Promise<void>(resolve=>{sawPending=resolve;});
 await page.route('**/api/movies?*',async route=>{
  if(!route.request().url().includes(pending))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  sawPending();await held;
  return route.fulfill({json:late==='genre'
   ?{titles:[{...fixtureTitle('movie-90431','Late Player Genre'),genres:['Science Fiction']}],page:1,totalPages:1,totalResults:1}
   :{rails:[{id:'late-picks',title:'Late picks',titles:[fixtureTitle('movie-90432','Late Player Pick')]}]}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 if(late==='genre')await page.locator('#movies-genre').selectOption('Science Fiction');
 await pendingRequest;
 await page.getByRole('link',{name:'Details for Interstellar'}).click();
 await page.getByRole('button',{name:'Play movie'}).click();
 const frame=page.locator('iframe.movies-provider-frame');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
 await frame.evaluate(element=>{element.dataset.kept='yes';});
 release();
 await expect.poll(()=>answersRead(page,pending)).toBe(1);
 await expect(frame).toHaveAttribute('data-kept','yes');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
});

// Safari does not focus a link on click, so the title and rail captured by the click must still bring focus back to the card.
test('going back to browsing returns focus to a card that a press opened without focusing it',async({page})=>{
 await railsDown(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 // A cancelled mousedown leaves focus where it was, as a press in Safari does for a link.
 await page.evaluate(()=>document.addEventListener('mousedown',event=>event.preventDefault(),{capture:true}));
 const card=page.locator('[data-rail="sci-fi-fantasy"] [data-title="movie-157336"]');
 await card.click();
 await expect(page).toHaveURL(/#\/movies\/movie-157336$/);
 // The title page has no back link: browser history returns to the browse page. The back step waits for the title page to take focus,
 // which shows the app has applied the title route. Earlier, a back step could run before the title's hash change, and the page never saw the title.
 await expect(page.locator('section.movies-detail h1')).toBeFocused();
 await page.goBack();
 await expect(page).toHaveURL(/#\/movies$/);
 await expect(card).toBeFocused();
});

// The title page. The API answers a title by id. A season's episodes come only when that season is asked for, as the real route does.
async function answerTitle(page:Page,title:(season:number)=>object,onRequest:(url:URL)=>Promise<void>|void=()=>{}){
 await page.route('**/api/movies?*',async route=>{
  const url=new URL(route.request().url());
  if(!url.searchParams.has('id'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  await onRequest(url);
  return route.fulfill({json:{title:title(Number(url.searchParams.get('season')||1))}});
 });
}
const seriesFor=(id:string,name:string,season:number)=>({...fixtureTitle(id,name,'tv'),seasons:[
 {number:1,name:'Season 1',episodes:season===1?[{number:1,name:'Pilot',overview:'The first episode.'},{number:2,name:'Second Episode',overview:'Still the first season.'}]:[]},
 {number:2,name:'Season 2',episodes:season===2?[{number:1,name:'Second Season Opener',overview:'The second season begins.'}]:[]}
]});

test('detail shows chips, cast and more like this from the API',async({page})=>{
 await answerTitle(page,()=>({...fixtureTitle('movie-90100','Fixture Detail'),year:2014,rating:8.4,runtime:169,genres:['Adventure','Drama'],overview:'A fixture title with cast and related titles.',
  cast:[{name:'Ada Lovelace',character:'Analyst',photo:'https://image.tmdb.org/t/p/w185/ada90100.jpg'},{name:'Grace Hopper',character:'Captain'},{name:'Mary Jackson',character:'Engineer'}],
  related:[fixtureTitle('movie-90101','Related Feature')]}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-90100');
 const detail=page.locator('section.movies-detail');
 await expect(detail.locator('h1')).toHaveText('Fixture Detail');
 await expect(detail.locator('.movies-chips .ui-chip')).toHaveText(['Movie','2014','★ 8.4','2h 49m']);
 await expect(detail.locator('.movies-tags .ui-chip')).toHaveText(['Adventure','Drama']);
 await expect(detail.locator('.movies-overview')).toHaveText('A fixture title with cast and related titles.');
 const cast=page.locator('section.movies-cast');
 await expect(cast.getByRole('heading',{name:'Cast',exact:true})).toBeVisible();
 await expect(cast).toContainText('3 people');
 const people=cast.locator('.movies-cast-card');
 await expect(people).toHaveCount(3);
 await expect(people.nth(0)).toContainText('Ada Lovelace');
 await expect(people.nth(0)).toContainText('Analyst');
 await expect(people.nth(0).locator('img')).toHaveCount(1);
 // A cast member without a photo shows initials instead.
 await expect(people.nth(1).locator('.movies-cast-initials')).toHaveText('GH');
 await expect(people.nth(2).locator('.movies-cast-initials')).toHaveText('MJ');
 await expect(page.getByRole('heading',{name:'More like this',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Details for Related Feature'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Playback information'})).toHaveCount(0);
});

test('season pills mark the current season and switch episodes',async({page})=>{
 const requested:string[]=[];
 await answerTitle(page,season=>seriesFor('tv-90200','Pill Series',season),url=>{requested.push(url.search);});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200');
 await expect(page.getByRole('group',{name:'Seasons',exact:true}).getByRole('button')).toHaveCount(2);
 const seasonOne=page.getByRole('button',{name:/^Season 1\b/}),seasonTwo=page.getByRole('button',{name:/^Season 2\b/});
 await expect(seasonOne).toHaveAttribute('aria-pressed','true');
 await expect(seasonTwo).toHaveAttribute('aria-pressed','false');
 await expect(seasonOne.locator('.movies-pill-count')).toHaveText('2');
 await expect(page.getByRole('heading',{name:'Pilot',exact:true})).toBeVisible();
 const primary=page.locator('.movies-actions a.movies-primary');
 await expect(primary).toHaveText('Play S1 E1');
 await expect(primary).toHaveAttribute('href','#/movies/tv-90200/season/1/episode/1/play');
 await seasonTwo.click();
 await expect(page).toHaveURL(/#\/movies\/tv-90200\/season\/2\/episode\/1$/);
 await expect(page.getByRole('heading',{name:'Second Season Opener',exact:true})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Pilot',exact:true})).toHaveCount(0);
 await expect(seasonTwo).toHaveAttribute('aria-pressed','true');
 await expect(seasonOne).toHaveAttribute('aria-pressed','false');
 expect(requested.some(search=>search.includes('season=2'))).toBe(true);
});

test('a season pill keeps focus after its season loads',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let asked=false;
 await answerTitle(page,season=>seriesFor('tv-90200','Pill Series',season),async url=>{if(url.searchParams.get('season')==='2'){asked=true;await held;}});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200');
 const seasonTwo=page.getByRole('button',{name:/^Season 2\b/});
 await seasonTwo.focus();
 await page.keyboard.press('Enter');
 await expect.poll(()=>asked).toBe(true);
 await expect(seasonTwo).toBeFocused();
 await expect(seasonTwo).toHaveAttribute('aria-pressed','true');
 release();
 await expect(page.getByRole('heading',{name:'Second Season Opener',exact:true})).toBeVisible();
 await expect(seasonTwo).toBeFocused();
 await expect(seasonTwo).toHaveAttribute('aria-pressed','true');
});

test('TV detail offers to continue the newest episode in progress',async({page})=>{
 await answerTitle(page,season=>seriesFor('tv-90200','Pill Series',season));
 // Two episodes are in progress. The one saved last is the newest, so Continue names it.
 await page.addInitScript(()=>{if(window!==window.top)return;localStorage.setItem('qcc:movies:v1',JSON.stringify({list:[],titles:{},progress:{'tv-90200:s1:e2':300,'tv-90200:s2:e1':200},meta:{'tv-90200:s1:e2':{duration:2400,updated:1000},'tv-90200:s2:e1':{duration:2400,updated:2000}}}));});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200');
 const primary=page.locator('.movies-actions a.movies-primary');
 await expect(primary).toHaveText('Continue S2 · E1');
 await expect(primary).toHaveAttribute('href','#/movies/tv-90200/season/2/episode/1/play');
 await expect(page.getByRole('link',{name:'Play S1 E1',exact:true})).toHaveCount(0);
});

test('a long title fits a 320px phone',async({page})=>{
 const longName='An Extraordinarily Long Title With Supercalifragilisticexpialidocious Words That Must Wrap Cleanly';
 await answerTitle(page,()=>({...fixtureTitle('movie-90110',longName),year:2001,rating:7.1,runtime:215,genres:['Adventure','Science Fiction','Historical Drama','Documentary'],overview:`An overview with one unbroken run ${'x'.repeat(140)} and ordinary words after it.`,
  cast:[{name:'Bartholomew Maximilian Featherstonehaugh',character:'The Narrator Who Never Stops Speaking'}]}));
 await page.setViewportSize({width:320,height:640});
 await page.goto('/#/movies/movie-90110');
 await expect(page.locator('.movies-detail-info h1')).toHaveText(longName);
 await expect(page.getByRole('button',{name:'Play movie',exact:true})).toBeVisible();
 expect(await page.locator('.movies-view').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 const rights=await page.locator('.movies-detail-inner *').evaluateAll(elements=>elements.map(e=>e.getBoundingClientRect().right));
 expect(rights.length).toBeGreaterThan(0);
 expect(Math.max(...rights)).toBeLessThanOrEqual(320);
});

test('the title page list button names its action without aria-pressed',async({page})=>{
 await answerTitle(page,()=>fixtureTitle('movie-90120','Listed Feature'));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-90120');
 const detail=page.locator('section.movies-detail');
 const add=detail.getByRole('button',{name:'Add to my list',exact:true});
 await expect(add).toBeVisible();
 await expect(add).not.toHaveAttribute('aria-pressed');
 await add.click();
 const remove=detail.getByRole('button',{name:'In my list',exact:true});
 await expect(remove).toBeVisible();
 await expect(remove).not.toHaveAttribute('aria-pressed');
 await remove.click();
 await expect(add).toBeVisible();
});

// A movie's saved position shows as Resume at only from START_THRESHOLD (15) seconds.
for(const [seconds,shown] of [[14,false],[15,true]] as const)test(`a movie offers Resume at only from 15 seconds, saved ${seconds}s`,async({page})=>{
 await page.addInitScript((time:number)=>{if(window!==window.top)return;localStorage.setItem('qcc:movies:v1',JSON.stringify({list:[],titles:{},progress:{'movie-157336':time},meta:{'movie-157336':{duration:10000,updated:1000}}}));},seconds);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336');
 await expect(page.locator('section.movies-detail h1')).toHaveText('Interstellar');
 const resume=page.locator('.movies-actions .movies-resume');
 if(shown)await expect(resume).toHaveText('Resume at 0:15');
 else await expect(resume).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Play movie',exact:true})).toBeVisible();
});

test('title text from the API is shown as text, never as markup',async({page})=>{
 const markup='<img src="x" alt="" data-hostile="1">';
 await answerTitle(page,()=>({...fixtureTitle('movie-90130',`Name ${markup}`),overview:'Overview <b data-hostile="1">bold</b>',genres:['<i data-hostile="1">Genre</i>'],
  cast:[{name:'<u data-hostile="1">Cast</u> Name',character:'<s data-hostile="1">Role</s>'}],related:[fixtureTitle('movie-90131','<em data-hostile="1">Related</em>')]}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-90130');
 await expect(page.locator('section.movies-detail h1')).toHaveText(`Name ${markup}`);
 await expect(page.locator('section.movies-detail .movies-overview')).toHaveText('Overview <b data-hostile="1">bold</b>');
 await expect(page.locator('[data-hostile]')).toHaveCount(0);
 await expect(page.locator('.movies-cast')).toContainText('<u data-hostile="1">Cast</u> Name');
 await expect(page.getByRole('link',{name:'Details for <em data-hostile="1">Related</em>'})).toBeVisible();
});

test('a series without loaded episodes shows its seasons and no play route',async({page})=>{
 await answerTitle(page,()=>({...fixtureTitle('tv-90300','Empty Snapshot Series','tv'),seasons:[{number:1,name:'Season 1',episodes:[]},{number:2,name:'Season 2',episodes:[]}]}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90300');
 await expect(page.locator('section.movies-detail h1')).toHaveText('Empty Snapshot Series');
 await expect(page.getByRole('group',{name:'Seasons',exact:true}).getByRole('button')).toHaveCount(2);
 await expect(page.getByRole('button',{name:/^Season 1\b/})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('a[href$="/play"]')).toHaveCount(0);
 await expect(page.locator('.movies-actions .movies-primary')).toHaveCount(0);
});

// Two counters, so a second mount shows up however it happens. `observed` counts provider iframes inserted into the page
// (MutationObserver). `renders` counts writes of the page's markup that carry a provider iframe. A same-task insert can escape the observer, so
// the write count is the one that cannot undercount.
const countFrameMounts=(page:Page)=>page.addInitScript(()=>{
 if(window!==window.top)return;
 const state=window as Window&{frameMounts?:number;playerWrites?:number};
 state.frameMounts=0;state.playerWrites=0;
 const mounted=(node:Node)=>node instanceof Element?(node.localName==='iframe'?1:0)+node.querySelectorAll('iframe').length:0;
 new MutationObserver(records=>{for(const record of records)for(const node of record.addedNodes)state.frameMounts!+=mounted(node);}).observe(document,{childList:true,subtree:true});
 const markup=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;
 Object.defineProperty(Element.prototype,'innerHTML',{configurable:true,get:markup.get,set(value:string){if(this.classList.contains('movies-view')&&String(value).includes('<iframe'))state.playerWrites!++;markup.set!.call(this,value);}});
});
const frameMounts=(page:Page)=>page.evaluate(()=>{const state=window as Window&{frameMounts?:number;playerWrites?:number};return {observed:state.frameMounts??0,renders:state.playerWrites??0};});
// Saved progress as the Movies storage keeps it, in place before the page loads.
const savedProgress=(page:Page,progress:Record<string,number>,meta:Record<string,{duration:number;updated:number}>)=>page.addInitScript(({progress,meta})=>{if(window!==window.top)return;localStorage.setItem('qcc:movies:v1',JSON.stringify({list:[],titles:{},progress,meta}));},{progress,meta});
// Lets a settled answer finish its render before the page is checked.
const settle=(page:Page)=>page.evaluate(()=>new Promise<void>(resolve=>setTimeout(resolve,300)));
// The episode drawer enters over 320 ms. Playwright can judge the drawer stable at its first pose, before the entry has moved it, and then click
// where a control was. A test that presses a control in the drawer waits for the drawer's own animations to finish first.
const drawerSettled=(drawer:Locator)=>expect.poll(()=>drawer.evaluate(el=>el.getAnimations({subtree:true}).filter(animation=>!(animation.effect as KeyframeEffect|null)?.pseudoElement).length)).toBe(0);

// A play route into a season that is still loading shows the loading text, and the player mounts once when the season arrives.
// The Continue link and a cold link to the same route both wait for the season.
for(const entry of ['Continue link','cold link'] as const)test(`a play route into an unloaded season mounts the player once (${entry})`,async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let asked=false;
 await answerTitle(page,season=>seriesFor('tv-90200','Pill Series',season),async url=>{if(url.searchParams.get('season')==='2'){asked=true;await held;}});
 await countFrameMounts(page);
 await trackAnswers(page);
 await page.setViewportSize({width:1440,height:900});
 if(entry==='Continue link'){
  await savedProgress(page,{'tv-90200:s2:e1':300},{'tv-90200:s2:e1':{duration:2400,updated:2000}});
  await page.goto('/#/movies/tv-90200');
  await page.locator('.movies-actions a.movies-primary').click();
 }else await page.goto('/#/movies/tv-90200/season/2/episode/1/play');
 await expect(page.locator('.movies-empty[role="status"] h1')).toHaveText('Loading title details…');
 await expect.poll(()=>asked).toBe(true);
 await expect(page.locator('iframe.movies-provider-frame')).toHaveCount(0);
 release();
 await expect(page.getByRole('heading',{name:'S2 · E1 — Second Season Opener',exact:true})).toBeVisible();
 await expect(page.locator('iframe.movies-provider-frame')).toHaveCount(1);
 await expect.poll(()=>answersRead(page,'season=2')).toBe(1);
 expect(await frameMounts(page)).toEqual({observed:1,renders:1});
 await expect(page.locator('iframe.movies-provider-frame')).toHaveAttribute('src',/\/embed\/90200\/2\/1\?/);
});

// A licensed local episode in a season that is still loading plays from its own file, and no provider is asked for it first.
test('a licensed episode in an unloaded season plays locally before any provider is asked',async({page})=>{
 await page.route('**/movies/licenses.json',route=>route.fulfill({json:[{key:'tv-90200:s2:e1',path:'movies/media/second-season-opener.mp4',license:'CC0-1.0',credit:'Test fixture',evidence:'docs/rights/second-season-opener.md',reviewed:true,territory:'Worldwide',expires:'2099-12-31'}]}));
 await page.route('**/movies/media/**',route=>route.fulfill({contentType:'video/mp4',body:''}));
 // Every request to another origin counts, not only a known provider's. TMDB artwork is the one allowed kind: an ordinary image request.
 const requests:{url:string;type:string}[]=[];
 page.on('request',request=>requests.push({url:request.url(),type:request.resourceType()}));
 const thirdParty=()=>{
  const app=new URL(page.url()).origin;
  return requests.filter(({url,type})=>{const target=new URL(url);return !['data:','blob:'].includes(target.protocol)&&target.origin!==app&&!(type==='image'&&target.hostname==='image.tmdb.org');}).map(({url})=>url);
 };
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let asked=false;
 await answerTitle(page,season=>seriesFor('tv-90200','Pill Series',season),async url=>{if(url.searchParams.get('season')==='2'){asked=true;await held;}});
 await savedProgress(page,{'tv-90200:s2:e1':300},{'tv-90200:s2:e1':{duration:2400,updated:2000}});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200');
 await page.locator('.movies-actions a.movies-primary').click();
 await expect(page.locator('.movies-empty[role="status"] h1')).toHaveText('Loading title details…');
 await expect.poll(()=>asked).toBe(true);
 expect(thirdParty()).toEqual([]);
 release();
 await expect(page.locator('.movies-media video')).toHaveAttribute('src',/\/movies\/media\/second-season-opener\.mp4$/);
 await expect.poll(()=>requests.some(request=>request.url.includes('second-season-opener.mp4'))).toBe(true);
 expect(thirdParty()).toEqual([]);
 await expect(page.locator('iframe.movies-provider-frame')).toHaveCount(0);
});

// Continue may show while seasons load. It carries its own season and episode from storage. The Play S1 E1 fallback
// still needs loaded seasons, which "a series without loaded episodes shows its seasons and no play route" pins.
test('Continue names its own season and episode while that season loads',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let asked=false;
 await answerTitle(page,season=>seriesFor('tv-90200','Pill Series',season),async url=>{if(url.searchParams.get('season')==='2'){asked=true;await held;}});
 await savedProgress(page,{'tv-90200:s2:e1':300},{'tv-90200:s2:e1':{duration:2400,updated:2000}});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200');
 await page.getByRole('button',{name:/^Season 2\b/}).click();
 await expect.poll(()=>asked).toBe(true);
 const primary=page.locator('.movies-actions a.movies-primary');
 await expect(page.locator('.movies-episodes-status')).toHaveText('Loading episodes…');
 await expect(primary).toHaveText('Continue S2 · E1');
 await expect(primary).toHaveAttribute('href','#/movies/tv-90200/season/2/episode/1/play');
 release();
 await expect(page.getByRole('heading',{name:'Second Season Opener',exact:true})).toBeVisible();
 await expect(primary).toHaveAttribute('href','#/movies/tv-90200/season/2/episode/1/play');
});

// A built-in title gains the API's cast, related titles, rating and runtime. Its bundled name, summary and artwork stay.
test('a built-in title gains its cast and related titles from the API and keeps its bundled name',async({page})=>{
 await answerTitle(page,()=>({...fixtureTitle('movie-157336','Interstellar (API copy)'),overview:'A different summary.',rating:8.6,runtime:169,
  cast:[{name:'Ada Lovelace',character:'Analyst'}],related:[fixtureTitle('movie-90501','Related Feature')]}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336');
 const detail=page.locator('section.movies-detail');
 await expect(detail.locator('.movies-chips')).toContainText('★ 8.6');
 await expect(detail.locator('.movies-chips')).toContainText('2h 49m');
 await expect(detail.locator('h1')).toHaveText('Interstellar');
 await expect(detail.locator('.movies-overview')).toHaveText('A pilot and a team of explorers leave a struggling Earth to search for a future among the stars.');
 // The API copy's year, genres and poster do not replace the bundled ones.
 await expect(detail.locator('.movies-chips')).toContainText('2014');
 await expect(detail.locator('.movies-chips')).not.toContainText('2024');
 await expect(detail.locator('.movies-tags .ui-chip')).toHaveText(['Science Fiction','Adventure']);
 await expect(detail.locator('.movies-detail-art')).toHaveAttribute('src',/gEU2QniE6E77NI6lCU6MxlNBvIx\.jpg$/);
 await expect(page.locator('section.movies-cast')).toContainText('Ada Lovelace');
 await expect(page.getByRole('heading',{name:'More like this',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Details for Related Feature'})).toBeVisible();
});

// When the API is unavailable, a built-in title keeps its bundled page and shows no error.
test('a built-in title keeps its bundled page when the API is unavailable, with no error',async({page})=>{
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await page.setViewportSize({width:1440,height:900});
 const answered=page.waitForResponse(response=>response.url().includes('id=movie-157336'));
 await page.goto('/#/movies/movie-157336');
 const detail=page.locator('section.movies-detail');
 await expect(detail.locator('h1')).toHaveText('Interstellar');
 await expect(page.getByRole('button',{name:'Play movie',exact:true})).toBeVisible();
 await answered;
 await expect(page.locator('section.movies-cast')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'More like this'})).toHaveCount(0);
 await expect(page.locator('.movies-detail-error')).toHaveCount(0);
 await expect(page.getByText('Title details')).toHaveCount(0);
 await expect(page.getByText('Loading title details')).toHaveCount(0);
 await expect(detail.locator('.movies-availability')).toHaveText('Streaming available. An external player receives normal connection and playback information.');
 // The bundled poster, year and genres stay when the API is down.
 await expect(detail.locator('.movies-chips')).toContainText('2014');
 await expect(detail.locator('.movies-tags .ui-chip')).toHaveText(['Science Fiction','Adventure']);
 await expect(detail.locator('.movies-detail-art')).toHaveAttribute('src',/gEU2QniE6E77NI6lCU6MxlNBvIx\.jpg$/);
});

// Nothing changes while a built-in title's details load. When they arrive the page keeps focus on Play movie.
test('a built-in title is unchanged while its details load, and keeps focus on Play movie when they arrive',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let asked=false;
 await page.route('**/api/movies?*',async route=>{
  if(!new URL(route.request().url()).searchParams.has('id'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  asked=true;await held;
  return route.fulfill({json:{title:{...fixtureTitle('movie-157336','Interstellar'),cast:[{name:'Ada Lovelace',character:'Analyst'}]}}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336');
 const play=page.getByRole('button',{name:'Play movie',exact:true});
 await expect(play).toBeVisible();
 await page.evaluate(()=>{(document.querySelector('section.movies-detail h1') as HTMLElement).dataset.held='yes';});
 await expect.poll(()=>asked).toBe(true);
 await settle(page);
 await expect(page.getByText('Loading title details')).toHaveCount(0);
 expect(await page.locator('section.movies-detail h1').getAttribute('data-held')).toBe('yes');
 await play.focus();
 release();
 await expect(page.locator('section.movies-cast')).toContainText('Ada Lovelace');
 await expect(play).toBeFocused();
});

// A built-in series takes episode stills and ratings from the API. Its bundled episodes keep their names and overviews.
test('a built-in series takes episode stills and ratings from the API and keeps its own episodes',async({page})=>{
 await page.route('**/api/movies?*',route=>{
  if(!new URL(route.request().url()).searchParams.has('id'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  return route.fulfill({json:{title:{...fixtureTitle('tv-19885','Sherlock (API copy)','tv'),seasons:[
   {number:1,name:'Season 1',episodes:[{number:1,name:'API Episode Name',overview:'API overview.',still:'https://image.tmdb.org/t/p/w300/apistill1.jpg',rating:8.1}]},
   {number:2,name:'Season 2',episodes:[]}]}}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885');
 const first=page.locator('article.movies-episode').first();
 await expect(first.locator('h3')).toHaveText('A Study in Pink');
 await expect(first.locator('.movies-episode-thumb img')).toHaveAttribute('src',/apistill1\.jpg$/);
 await expect(first.locator('.movies-episode-meta')).toContainText('★ 8.1');
 await expect(first).toContainText('Episode information is included in this starter selection.');
});

// A Play link is found again by its address, but never on its thumbnail, which is hidden from focus and shares that address.
test('focus returns to an episode\'s Play link, not its hidden thumbnail, after a re-render',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let asked=false;
 await page.route('**/api/movies?*',async route=>{
  if(!new URL(route.request().url()).searchParams.has('id'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  asked=true;await held;
  return route.fulfill({json:{title:{...fixtureTitle('tv-19885','Sherlock','tv'),cast:[{name:'Ada Lovelace',character:'Analyst'}]}}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885');
 const play=page.getByRole('link',{name:'Play The Blind Banker',exact:true});
 await play.focus();
 await expect.poll(()=>asked).toBe(true);
 release();
 await expect(page.locator('section.movies-cast')).toContainText('Ada Lovelace');
 await expect(play).toBeFocused();
});

// Season pills are 44 px tall, a long season name wraps inside a 320 px phone, and the name stays Season N.
test('season pills are 44 px tall and wrap a long season name at 320 px',async({page})=>{
 const longName='A Season Name That Is Far Too Long To Fit On One Line At Three Hundred Twenty Pixels';
 await answerTitle(page,season=>({...seriesFor('tv-90400','Long Pills Series',season),seasons:[
  {number:1,name:longName,episodes:season===1?[{number:1,name:'Pilot',overview:'The first episode.'}]:[]},
  {number:2,name:'Season 2',episodes:season===2?[{number:1,name:'Second Season Opener',overview:'The second season begins.'}]:[]}]}));
 await page.setViewportSize({width:320,height:640});
 await page.goto('/#/movies/tv-90400');
 const pills=page.locator('.movies-season-pills .ui-pill');
 await expect(pills).toHaveCount(2);
 await expect(pills.first()).toBeVisible();
 expect(await pills.first().evaluate(e=>getComputedStyle(e).whiteSpace)).toBe('normal');
 for(const height of await pills.evaluateAll(list=>list.map(e=>e.getBoundingClientRect().height)))expect(height).toBeGreaterThanOrEqual(44);
 expect(await page.locator('.movies-view').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 const long=page.getByRole('button',{name:longName,exact:true});
 await expect(long).toBeVisible();
 const box=await long.boundingBox();
 expect(box!.x+box!.width).toBeLessThanOrEqual(320);
});

// The episode count is hidden from the name, so a pill is Season N before its episodes load and after.
test('a season pill keeps the name Season N before and after its episodes load',async({page})=>{
 await answerTitle(page,season=>seriesFor('tv-90200','Pill Series',season));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200');
 const seasonOne=page.getByRole('button',{name:'Season 1',exact:true});
 await expect(seasonOne.locator('.movies-pill-count')).toHaveText('2');
 const seasonTwo=page.getByRole('button',{name:'Season 2',exact:true});
 await expect(seasonTwo).toBeVisible();
 await seasonTwo.click();
 await expect(page.getByRole('heading',{name:'Second Season Opener',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Season 2',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'Season 2',exact:true}).locator('.movies-pill-count')).toHaveText('1');
});

// A title whose poster failed has no poster column, on the first visit and on a later one, when the failed poster is not asked for again.
test('a title whose poster failed drops the poster column, on the first visit and later',async({page})=>{
 await page.route('https://image.tmdb.org/t/p/w500/fixture90600.jpg',route=>route.fulfill({status:404,headers:{'cache-control':'no-store'},body:'Unavailable'}));
 await answerTitle(page,()=>fixtureTitle('movie-90600','No Poster Feature'));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-90600');
 const inner=page.locator('section.movies-detail .movies-detail-inner');
 await expect(page.locator('section.movies-detail h1')).toHaveText('No Poster Feature');
 await expect(page.locator('.movies-detail-art')).toHaveCount(0);
 const columns=()=>inner.evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length);
 expect(await columns()).toBe(1);
 await page.evaluate(()=>{location.hash='#/movies';});
 await expect(page.locator('section.movies-detail')).toHaveCount(0);
 await page.evaluate(()=>{location.hash='#/movies/movie-90600';});
 await expect(page.locator('section.movies-detail h1')).toHaveText('No Poster Feature');
 await expect(page.locator('.movies-detail-art')).toHaveCount(0);
 expect(await columns()).toBe(1);
});

// The title backdrop reuses the hero's shade from theme.css, and no longer carries its own copy of it.
test('the title backdrop uses the shared hero shade',async({page})=>{
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336');
 const backdrop=page.locator('section.movies-detail .movies-detail-backdrop');
 await expect(backdrop.locator(':scope>.ui-hero-shade')).toHaveCount(1);
 expect(await backdrop.evaluate(e=>getComputedStyle(e,'::after').content)).toBe('none');
});

// The single-provider watch page keeps a reload control below the screen.
const playbackControls=(page:Page)=>page.locator('.movies-player-controls');
// The remaining provider supports resume positions and disables its optional embed ad script.
test('FrameXTV resumes from the saved position with embed ads disabled',async({page})=>{
 await savedProgress(page,{'movie-157336':1200},{'movie-157336':{duration:7200,updated:1000}});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336/play');
 const frame=page.locator('iframe.movies-provider-frame');
 await expect(frame).toHaveAttribute('src','https://framextv.cc/embed/157336?autoplay=1&muted=0&no_ads=1&t=1200');
 await expect(page.locator('.movies-resume-pill')).toHaveText('Resumed at 20:00');
 await expect(page.locator('[data-server],#movies-source-help')).toHaveCount(0);
});

// The watch page with reload, episode controls, the episode drawer, the Up next card and the resume pill.
test('the single-provider controls reload FrameXTV without a server picker',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336/play');
 const frame=page.locator('iframe.movies-provider-frame');
 await expect(frame).toHaveAttribute('data-provider','framextv');
 await frame.evaluate(element=>element.setAttribute('data-instance','original'));
 await expect(playbackControls(page).getByRole('button')).toHaveCount(1);
 await expect(page.getByRole('group',{name:'Servers',exact:true})).toHaveCount(0);
 await playbackControls(page).getByRole('button',{name:'Reload player',exact:true}).click();
 await expect(frame).toHaveAttribute('data-provider','framextv');
 await expect(frame).not.toHaveAttribute('data-instance','original');
 expect(new URL((await frame.getAttribute('src'))!).searchParams.get('no_ads')).toBe('1');
 await expect(playbackControls(page).getByRole('button',{name:'Reload player',exact:true})).toBeFocused();
});

test('episode controls step between episodes and stop at the ends',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await expect(page.getByRole('button',{name:'First episode',exact:true})).toBeDisabled();
 await expect(page.getByRole('button',{name:'S1 · E1',exact:true})).toHaveAttribute('aria-haspopup','dialog');
 await page.getByRole('link',{name:'Next episode',exact:true}).click();
 await expect(page).toHaveURL(/season\/1\/episode\/2\/play$/);
 await expect(page.locator('.movies-player>h2')).toHaveText('S1 · E2 — The Blind Banker');
 await expect(page.getByRole('link',{name:'Previous episode',exact:true})).toHaveAttribute('href',/season\/1\/episode\/1\/play$/);
 await page.goto('/#/movies/tv-19885/season/2/episode/3/play');
 await expect(page.getByRole('button',{name:'Final episode',exact:true})).toBeDisabled();
 await expect(page.getByRole('link',{name:'Next episode',exact:true})).toHaveCount(0);
});

test('the episode drawer lists the season and closes for Study',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await expect(drawer).toBeHidden();
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 await expect(drawer).toBeVisible();
 await expect(drawer.getByRole('heading',{name:'Episodes',exact:true})).toBeVisible();
 await expect(drawer.getByRole('link')).toHaveCount(3);
 await expect(drawer.locator('[aria-current="true"]')).toHaveAttribute('href',/season\/1\/episode\/1\/play$/);
 await page.keyboard.press('Escape');
 await expect(page.locator('#study-view')).toBeVisible();
 // The watch page is hidden while Study is open, so the drawer is read by its element rather than by role.
 await expect(page.locator('dialog.movies-drawer')).toHaveJSProperty('open',false);
 await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();
 await expect(page.getByRole('button',{name:'Resume stream'})).toBeVisible();
});

test('the close button shuts the episode drawer and returns focus to the episode button',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await drawerSettled(drawer);
 await expect(drawer).toBeVisible();
 await drawer.getByRole('button',{name:'Close episode list',exact:true}).click();
 await expect(drawer).toBeHidden();
 await expect(page.getByRole('button',{name:'S1 · E1',exact:true})).toBeFocused();
});

test('an episode picked in the drawer plays and closes the drawer',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await drawerSettled(drawer);
 await drawer.getByRole('link',{name:/The Blind Banker/}).click();
 await expect(page).toHaveURL(/season\/1\/episode\/2\/play$/);
 await expect(page.locator('.movies-player>h2')).toHaveText('S1 · E2 — The Blind Banker');
 await expect(page.locator('dialog.movies-drawer')).toHaveJSProperty('open',false);
});

test('the watch page fits a 320px phone',async({page})=>{
 const longName='An Extraordinarily Long Series Title With Supercalifragilisticexpialidocious Words That Must Wrap';
 const longEpisode='AnEpisodeNameWithoutSpacesThatRunsOnForeverAndEverAndEverAndEverAndEverAndEverAndEnd';
 await answerTitle(page,season=>({...seriesFor('tv-90500',longName,season),seasons:[
  {number:1,name:'Season 1',episodes:season===1?[{number:1,name:longEpisode,overview:'A long episode.'},{number:2,name:'Second Episode',overview:'Still the first season.'}]:[]},
  {number:2,name:'Season 2',episodes:season===2?[{number:1,name:'Second Season Opener',overview:'The second season begins.'}]:[]}
 ]}));
 await page.setViewportSize({width:320,height:640});
 await page.goto('/#/movies/tv-90500/season/1/episode/1/play');
 await expect(playbackControls(page)).toBeVisible();
 await expect(page.getByRole('button',{name:'S1 · E1',exact:true})).toBeVisible();
 expect(await page.locator('.movies-view').evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 const rights=await page.locator('.movies-player').evaluate(player=>[...player.querySelectorAll('*')].filter(e=>e.getClientRects().length).map(e=>e.getBoundingClientRect().right));
 expect(rights.length).toBeGreaterThan(0);
 expect(Math.max(...rights)).toBeLessThanOrEqual(320);
 for(const control of await page.locator('.movies-player-controls > .ui-btn,.movies-episode-controls > .ui-btn').all())expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

// On a phone the screen runs edge to edge: its negative gutter margins stretch it over the page padding, so it is as wide as the viewport.
test('the watch screen spans a 390px phone edge to edge',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/movies/movie-157336/play');
 await expect(playbackControls(page)).toBeVisible();
 const box=await page.locator('.movies-screen').boundingBox();
 expect(box!.x).toBeCloseTo(0,0);
 expect(box!.width).toBeCloseTo(390,0);
});

// The Up next card stays above the tab island while it counts down, so the island cannot cover its Play now button.
test('the Up next card is above the tab island at 1440px',async({page})=>{
 await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
 // The clock is paused before the countdown starts, so the card holds still while the check reads it.
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
 await page.frame({url:/framextv/})!.evaluate(()=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:100,duration:100},'*'));
 const playNow=page.getByRole('button',{name:'Play now',exact:true});
 await expect(playNow).toBeVisible();
 const topmost=await playNow.evaluate(button=>{const r=button.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&(hit===button||button.contains(hit));});
 expect(topmost).toBe(true);
});

// The title page and the FrameXTV player agree on the saved resume position after a reload.
test('FrameXTV keeps the title resume line after reloading its player',async({page})=>{
 await savedProgress(page,{'movie-157336':1200},{'movie-157336':{duration:7200,updated:1000}});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336');
 const resume=page.locator('.movies-actions .movies-resume');
 await expect(resume).toHaveText('Resume at 20:00');
 await page.getByRole('button',{name:'Play movie',exact:true}).click();
 await expect(page.locator('.movies-resume-pill')).toHaveText('Resumed at 20:00');
 await page.getByRole('button',{name:'Reload player',exact:true}).click();
 await expect(page.locator('iframe.movies-provider-frame')).toHaveAttribute('src',/[?&]t=1200$/);
 await expect(page.locator('.movies-resume-pill')).toHaveText('Resumed at 20:00');
 await page.getByRole('link',{name:'Back to Interstellar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Play movie',exact:true})).toBeVisible();
 await expect(resume).toHaveText('Resume at 20:00');
});

test('a saved position shows a Resumed pill for four seconds',async({page})=>{
 await savedProgress(page,{'movie-157336':42},{'movie-157336':{duration:7200,updated:1000}});
 await page.setViewportSize({width:1440,height:900});
 await page.clock.install();
 await page.goto('/#/movies/movie-157336/play');
 const pill=page.locator('.movies-resume-pill');
 await expect(pill).toHaveText('Resumed at 0:42');
 await page.clock.runFor(4100);
 await expect(pill).toBeHidden();
});

test('the drawer loads an unloaded season in place and keeps the stream running',async({page})=>{
 const requested:string[]=[];
 await answerTitle(page,season=>seriesFor('tv-90200','Pill Series',season),url=>{requested.push(url.search);});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200/season/1/episode/1/play');
 const frame=page.locator('iframe.movies-provider-frame');
 await expect(frame).toBeVisible();
 await frame.evaluate(element=>element.setAttribute('data-instance','original'));
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await drawerSettled(drawer);
 await drawer.getByRole('button',{name:'Season 2',exact:true}).click();
 await expect(drawer.getByRole('link',{name:/Second Season Opener/})).toBeVisible();
 await expect(drawer.getByRole('button',{name:'Season 2',exact:true})).toHaveAttribute('aria-pressed','true');
 expect(requested.some(search=>search.includes('season=2'))).toBe(true);
 await expect(frame).toHaveAttribute('data-instance','original');
 await expect(drawer).toHaveJSProperty('open',true);
});

// The Up next card sits in the screen's corner, and its bar drains one tenth each second. Under reduced motion the bar does not transition.
for(const reduced of [false,true] as const)test(`the Up next card sits in the screen corner and its bar drains${reduced?' without motion':''}`,async({page})=>{
 if(reduced)await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
 // The clock is paused before the countdown starts, so each runFor is exactly one tick of the bar.
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
 await page.frame({url:/framextv/})!.evaluate(()=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:100,duration:100},'*'));
 const overlay=page.getByRole('dialog',{name:'Up next'}),bar=overlay.locator('.movies-next-bar>span');
 await expect(overlay).toBeVisible();
 await expect.poll(()=>bar.evaluate(e=>(e as HTMLElement).style.width)).toBe('100%');
 await page.clock.runFor(1000);
 await expect.poll(()=>bar.evaluate(e=>(e as HTMLElement).style.width)).toBe('90%');
 expect(await bar.evaluate(e=>getComputedStyle(e).transitionProperty)).toBe(reduced?'none':'width');
 const [card,screen]=await Promise.all([overlay.boundingBox(),page.locator('.movies-screen').boundingBox()]);
 expect(card!.x+card!.width).toBeGreaterThan(screen!.x+screen!.width-40);
 expect(card!.y+card!.height).toBeGreaterThan(screen!.y+screen!.height-40);
 expect(card!.width).toBeLessThan(screen!.width*0.6);
});

// WebKit reports a sheet's ::backdrop fade with no pseudo-element, on the open dialog itself. The dialog's own transitions never
// include background-color, so an animation of nothing but background-color on an open dialog is that fade.
const backdropFade=(animation:{pseudo:string;dialog:boolean;properties:string[]})=>animation.pseudo==='::backdrop'||(animation.pseudo===''&&animation.dialog&&animation.properties.every(key=>key==='backgroundColor'));
// Reduced motion leaves one animation, the sheet's ::backdrop colour fade. Every other animation, pseudo-elements included, must be gone, and the
// backdrop may change opacity or background colour only, never a transform, translate or scale.
for(const setting of ['media query','class'] as const)test(`reduced motion (${setting}) stops card, rail and drawer animations`,async({page})=>{
 if(setting==='media query')await page.emulateMedia({reducedMotion:'reduce'});
 await page.setViewportSize({width:1440,height:900});
 const motion=async()=>{
  const animations=await page.evaluate(()=>document.getAnimations().map(animation=>{
   const effect=animation.effect as KeyframeEffect|null;
   const properties=[...new Set((effect?.getKeyframes()??[]).flatMap(frame=>Object.keys(frame)))].filter(key=>!['offset','easing','composite','computedOffset'].includes(key));
   return {pseudo:effect?.pseudoElement??'',dialog:effect?.target instanceof HTMLDialogElement&&effect.target.open,properties};
  }));
  expect(animations.filter(animation=>!backdropFade(animation)),'animations other than the backdrop fade').toEqual([]);
  for(const animation of animations)expect(animation.properties.every(key=>key==='opacity'||key==='backgroundColor'),`${animation.pseudo||'element'} animates ${animation.properties.join(', ')}`).toBe(true);
 };
 await page.goto('/#/movies');
 // The app's own setting puts .reduce-motion on <html> (src/main.ts), so the class case sets that class.
 if(setting==='class')await page.evaluate(()=>document.documentElement.classList.add('reduce-motion'));
 const rail=page.locator('[data-rail="movies-you-ll-love"]');
 await rail.hover();
 await rail.locator('.ui-card').first().hover();
 await expect(rail.locator('.ui-card-img').first()).toHaveCSS('transition-duration','0s');
 await motion();
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'Select episode',exact:true})).toBeVisible();
 await motion();
});

test('My list on the watch page keeps the stream running',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336/play');
 const frame=page.locator('iframe.movies-provider-frame');
 await expect(frame).toBeVisible();
 await frame.evaluate(element=>element.setAttribute('data-instance','original'));
 const actions=page.locator('.movies-watch-actions');
 await actions.getByRole('button',{name:'Add to my list',exact:true}).click();
 await expect(actions.getByRole('button',{name:'In my list',exact:true})).toBeFocused();
 await expect(frame).toHaveAttribute('data-instance','original');
});

test('the watch page lays out its parts in the order of section 7.6',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 const parts=()=>page.locator('.movies-player>*').evaluateAll(list=>list.map(e=>e.tagName.toLowerCase()+(e.classList[0]?'.'+e.classList[0]:'')));
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await expect(playbackControls(page)).toBeVisible();
 expect(await parts()).toEqual(['a.movies-detail-back','h1','h2','div.movies-watch-actions','div.movies-screen','div.movies-player-controls','div.movies-episode-controls','p']);
 await page.goto('/#/movies/movie-157336/play');
 await expect(playbackControls(page)).toBeVisible();
 expect(await parts()).toEqual(['a.movies-detail-back','h1','div.movies-watch-actions','div.movies-screen','div.movies-player-controls','p']);
 await expect(page.locator('.movies-episode-controls')).toHaveCount(0);
});

// A failed load keeps today's error path: a cold link into an unloaded season shows the title-details notice with a retry, and mounts no player.
test('a failed season load keeps the title-details notice and mounts no player',async({page})=>{
 await countFrameMounts(page);
 await page.route('**/api/movies?*',route=>{
  if(new URL(route.request().url()).searchParams.get('season')==='2')return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  return route.fulfill({json:{title:seriesFor('tv-90200','Pill Series',1)}});
 });
 await page.setViewportSize({width:1440,height:900});
 const answered=page.waitForResponse(response=>response.url().includes('season=2'));
 await page.goto('/#/movies/tv-90200/season/2/episode/1/play');
 await expect(page.getByRole('heading',{name:'Title details unavailable',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Retry title',exact:true})).toBeVisible();
 await answered;
 await expect(page.locator('iframe.movies-provider-frame')).toHaveCount(0);
 expect(await frameMounts(page)).toEqual({observed:0,renders:0});
});

// The Auto next switch paints its focus ring on the switch itself while its checkbox has keyboard focus.
test('the Auto next switch shows a focus ring when its checkbox has keyboard focus',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await expect(playbackControls(page)).toBeVisible();
 await tabTo(page,page.getByRole('checkbox',{name:'Auto next episode'}));
 const ring=await page.locator('.movies-auto-next .ui-switch').evaluate(element=>{const style=getComputedStyle(element);return {style:style.outlineStyle,width:parseFloat(style.outlineWidth),color:style.outlineColor};});
 expect(ring).toEqual({style:'solid',width:2,color:'rgb(255, 255, 255)'});
});

// My list keeps a licensed local video that is playing, as it keeps a provider frame. A video that was rebuilt would seek back
// to its resume point and show the Resumed pill again.
test('My list keeps a playing licensed video, and its resume pill does not come back',async({page})=>{
 await page.route('**/movies/licenses.json',route=>route.fulfill({json:[{key:'movie-157336',path:'movies/media/long-resume.webm',license:'CC0-1.0',credit:'QCC fixture',evidence:'docs/rights/fixture.md',reviewed:true,territory:'Worldwide',expires:'2099-12-31'}]}));
 // The fixture answers byte ranges, as a file server does, so the saved position can be seeked to.
 await page.route('**/movies/media/long-resume.webm',route=>{
  const body=readFileSync('tests/movies/fixtures/long-resume.webm'),size=body.length;
  const [,first='',last='']=/^bytes=(\d*)-(\d*)$/.exec(route.request().headers().range??'')??[];
  if(!first&&!last)return route.fulfill({contentType:'video/webm',headers:{'accept-ranges':'bytes'},body});
  const start=first?Number(first):Math.max(0,size-Number(last)),end=first&&last?Math.min(Number(last),size-1):size-1;
  return route.fulfill({status:206,contentType:'video/webm',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${size}`},body:body.subarray(start,end+1)});
 });
 await savedProgress(page,{'movie-157336':20},{'movie-157336':{duration:40,updated:1000}});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336/play');
 const video=page.locator('.movies-media video'),pill=page.locator('.movies-resume-pill');
 await expect(video).toBeVisible();
 await expect(pill).toHaveText('Resumed at 0:20');
 await video.evaluate(async(element:HTMLVideoElement)=>{element.dataset.instance='original';await element.play();});
 await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.currentTime)).toBeGreaterThan(21);
 // Counts each time the pill is shown from here on.
 await pill.evaluate(element=>{const state=window as Window&{pillShown?:number};state.pillShown=0;new MutationObserver(()=>{if(!(element as HTMLElement).hidden)state.pillShown!++;}).observe(element,{attributes:true,attributeFilter:['hidden']});});
 await page.locator('.movies-watch-actions').getByRole('button',{name:'Add to my list',exact:true}).click();
 await expect(page.locator('.movies-watch-actions').getByRole('button',{name:'In my list',exact:true})).toBeFocused();
 await expect(video).toHaveAttribute('data-instance','original');
 await expect.poll(()=>video.evaluate((element:HTMLVideoElement)=>element.currentTime)).toBeGreaterThan(21);
 expect(await page.evaluate(()=>(window as Window&{pillShown?:number}).pillShown)).toBe(0);
});

// Fullscreen drops the screen's border and radius. The fullscreen rule has to win over the windowed rule that sets both.
test('fullscreen drops the screen border and radius',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336/play');
 const screen=page.locator('.movies-screen');
 await expect(page.locator('iframe.movies-provider-frame')).toBeVisible();
 const supported=await screen.evaluate(element=>typeof element.requestFullscreen==='function'||typeof (element as HTMLElement&{webkitRequestFullscreen?:unknown}).webkitRequestFullscreen==='function');
 test.skip(!supported,'Browser reports the Fullscreen API unsupported');
 await page.getByRole('button',{name:'Full screen',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.className)).toBe('movies-screen');
 expect(await screen.evaluate(element=>{const style=getComputedStyle(element);return {border:style.borderTopWidth,radius:style.borderTopLeftRadius};})).toEqual({border:'0px',radius:'0px'});
});

// The drawer row of the episode already playing sets the address it has, so the drawer closes instead of staying open.
test('the drawer row of the episode already playing closes the drawer',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await drawerSettled(drawer);
 await expect(drawer).toBeVisible();
 await drawer.locator('[aria-current="true"]').click();
 await expect(drawer).toBeHidden();
 await expect(page.getByRole('button',{name:'S1 · E1',exact:true})).toBeFocused();
 await expect(page).toHaveURL(/season\/1\/episode\/1\/play$/);
});

// A season that fails to load in the drawer shows its error and a Retry button. A season that loads later is shown by Retry.
async function failingSeasonTwo(page:Page){
 const state={failing:true};
 await page.route('**/api/movies?*',route=>{
  const url=new URL(route.request().url());
  if(!url.searchParams.has('id'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  // A named season that fails answers 502, as movies-search.mts does. The client retries 502 twice before it shows Retry.
  if(url.searchParams.get('season')==='2'&&state.failing)return route.fulfill({status:502,json:{error:'metadata_unavailable'}});
  return route.fulfill({json:{title:seriesFor('tv-90200','Pill Series',Number(url.searchParams.get('season')||1))}});
 });
 return state;
}
test('a failed drawer season load shows its error and a retry, and the stream keeps playing',async({page})=>{
 await failingSeasonTwo(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200/season/1/episode/1/play');
 const frame=page.locator('iframe.movies-provider-frame');
 await expect(frame).toBeVisible();
 await frame.evaluate(element=>element.setAttribute('data-instance','original'));
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await drawerSettled(drawer);
 await drawer.getByRole('button',{name:'Season 2',exact:true}).click();
 await expect(drawer.getByRole('status')).toContainText('temporarily unavailable');
 const retry=drawer.getByRole('button',{name:'Retry episodes',exact:true});
 await expect(retry).toBeVisible();
 expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(44);
 await expect(frame).toHaveAttribute('data-instance','original');
 await expect(drawer).toHaveJSProperty('open',true);
});
test('Retry episodes loads the season that failed, in the open drawer',async({page})=>{
 const state=await failingSeasonTwo(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200/season/1/episode/1/play');
 await expect(page.locator('iframe.movies-provider-frame')).toBeVisible();
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await drawerSettled(drawer);
 await drawer.getByRole('button',{name:'Season 2',exact:true}).click();
 await expect(drawer.getByRole('button',{name:'Retry episodes',exact:true})).toBeVisible();
 state.failing=false;
 await drawer.getByRole('button',{name:'Retry episodes',exact:true}).click();
 await expect(drawer.getByRole('link',{name:/Second Season Opener/})).toBeVisible();
 await expect(drawer.getByRole('status')).toHaveCount(0);
 await expect(drawer.getByRole('button',{name:'Season 2',exact:true})).toHaveAttribute('aria-pressed','true');
});

// Previous across a season boundary. On a season's first episode, Previous is the last episode of the season before, once that season has loaded.
test('Previous on a season\'s first episode goes to the last episode of the season before',async({page})=>{
 await answerTitle(page,season=>seriesFor('tv-90200','Pill Series',season));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200/season/1/episode/1/play');
 await expect(page.getByRole('heading',{name:'S1 · E1 — Pilot',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Next episode',exact:true}).click();
 await expect(page).toHaveURL(/season\/1\/episode\/2\/play$/);
 await page.getByRole('link',{name:'Next episode',exact:true}).click();
 await expect(page.getByRole('heading',{name:'S2 · E1 — Second Season Opener',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Previous episode',exact:true})).toHaveAttribute('href',/season\/1\/episode\/2\/play$/);
});
test('Previous reads unavailable until the season before loads, then links to its last episode',async({page})=>{
 await answerTitle(page,season=>seriesFor('tv-90200','Pill Series',season));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200/season/2/episode/1/play');
 await expect(page.getByRole('heading',{name:'S2 · E1 — Second Season Opener',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Previous episode unavailable',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'S2 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await drawerSettled(drawer);
 await drawer.getByRole('button',{name:'Season 1',exact:true}).click();
 await expect(drawer.getByRole('link',{name:/Second Episode/})).toBeVisible();
 await drawer.getByRole('button',{name:'Close episode list',exact:true}).click();
 await expect(drawer).toBeHidden();
 await expect(page.getByRole('link',{name:'Previous episode',exact:true})).toHaveAttribute('href',/season\/1\/episode\/2\/play$/);
});

// The drawer closes on reload and when the page is hidden. Its modal makes the reload control inert, so this click is sent from the page.
test('reloading the player closes the episode drawer',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 await expect(drawer).toBeVisible();
 await page.locator('[data-action="reload-stream"]').evaluate(element=>(element as HTMLElement).click());
 await expect(drawer).toBeHidden();
 await expect(page.locator('iframe.movies-provider-frame')).toHaveAttribute('data-provider','framextv');
});
test('a hidden page closes the episode drawer',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 await expect(drawer).toBeVisible();
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(drawer).toBeHidden();
});

// Below 640 px the drawer is a bottom sheet. It is the glass sheet, inset 8 px from the sides and the bottom, as the menu is.
test('the episode drawer is a bottom sheet below 640px',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Select episode',exact:true});
 await expect(drawer).toBeVisible();
 // The sheet enters over 320 ms from a scale and a lift, so its box is read once its own animations have finished.
 await drawerSettled(drawer);
 const box=await drawer.boundingBox();
 expect(box!.x).toBeCloseTo(8,0);
 expect(box!.width).toBeCloseTo(374,0);
 expect(box!.y+box!.height).toBeCloseTo(836,0);
});

// Home's one rail lists the given titles. Each title's details answer only when release runs, so a test can look at the page while they load.
async function homeWithHeldDetails(page:Page,rail:object[],details:Record<string,object>){
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 const asked:string[]=[];
 await page.route('**/api/movies?*',async route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.get('rails')==='home')return route.fulfill({json:{rails:[{id:'featured',title:'Featured',titles:rail}]}});
  const id=url.searchParams.get('id')??'';
  if(!details[id])return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  asked.push(id);await held;
  return route.fulfill({json:{title:details[id]}});
 });
 return {asked,release};
}

// A built-in movie that Home lists keeps its bundled page. Its details add the cast in the background, with no loading state.
test('a built-in movie that Home lists keeps its bundled page while its details load, and gains the API cast',async({page})=>{
 const {asked,release}=await homeWithHeldDetails(page,[{...fixtureTitle('movie-157336','Interstellar'),overview:'A rail summary, not the bundled one.'}],{
  'movie-157336':{...fixtureTitle('movie-157336','Interstellar (API copy)'),overview:'An API summary, not the bundled one.',rating:8.6,runtime:169,cast:[{name:'Ada Lovelace',character:'Analyst'}],related:[fixtureTitle('movie-90501','Related Feature')]}});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await expect(page.locator('[data-rail="featured"]')).toBeVisible();
 await page.locator('a.movies-poster[data-title="movie-157336"]').click();
 const detail=page.locator('section.movies-detail');
 await expect.poll(()=>asked.includes('movie-157336')).toBe(true);
 await settle(page);
 await expect(detail.locator('h1')).toHaveText('Interstellar');
 await expect(detail.locator('.movies-overview')).toHaveText('A pilot and a team of explorers leave a struggling Earth to search for a future among the stars.');
 await expect(detail.locator('.movies-detail-art')).toHaveAttribute('src',/gEU2QniE6E77NI6lCU6MxlNBvIx\.jpg$/);
 await expect(page.getByText('Loading title details')).toHaveCount(0);
 release();
 await expect(page.locator('section.movies-cast')).toContainText('Ada Lovelace');
 await expect(page.getByRole('link',{name:'Details for Related Feature'})).toBeVisible();
 await expect(detail.locator('.movies-chips')).toContainText('★ 8.6');
 await expect(detail.locator('.movies-chips')).toContainText('2h 49m');
 await expect(detail.locator('h1')).toHaveText('Interstellar');
 await expect(detail.locator('.movies-overview')).toHaveText('A pilot and a team of explorers leave a struggling Earth to search for a future among the stars.');
});

// A built-in series that Home lists keeps its bundled episodes, and gains the API cast in the background.
test('a built-in series that Home lists keeps its bundled episodes while its details load, and gains the API cast',async({page})=>{
 const {asked,release}=await homeWithHeldDetails(page,[{...fixtureTitle('tv-19885','Sherlock','tv'),overview:'A rail summary, not the bundled one.'}],{
  'tv-19885':{...fixtureTitle('tv-19885','Sherlock (API copy)','tv'),overview:'An API summary, not the bundled one.',seasons:[],cast:[{name:'Ada Lovelace',character:'Analyst'}]}});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await expect(page.locator('[data-rail="featured"]')).toBeVisible();
 await page.locator('a.movies-poster[data-title="tv-19885"]').click();
 const detail=page.locator('section.movies-detail');
 await expect.poll(()=>asked.includes('tv-19885')).toBe(true);
 await settle(page);
 await expect(detail.locator('h1')).toHaveText('Sherlock');
 await expect(detail.locator('.movies-overview')).toHaveText('A consulting detective and a former army doctor unravel intricate mysteries in contemporary London.');
 await expect(page.locator('article.movies-episode')).toHaveCount(3);
 await expect(page.locator('article.movies-episode').first().locator('h3')).toHaveText('A Study in Pink');
 await expect(page.getByText('Loading episodes')).toHaveCount(0);
 release();
 await expect(page.locator('section.movies-cast')).toContainText('Ada Lovelace');
 await expect(detail.locator('h1')).toHaveText('Sherlock');
 await expect(detail.locator('.movies-overview')).toHaveText('A consulting detective and a former army doctor unravel intricate mysteries in contemporary London.');
 await expect(page.locator('article.movies-episode')).toHaveCount(3);
 await expect(page.locator('article.movies-episode').first().locator('h3')).toHaveText('A Study in Pink');
});

// Home's hero plays a built-in movie at once. Its details still loading are no reason to show a loading state on the player.
test('a built-in movie that Home features plays at once, while its details load',async({page})=>{
 const {asked,release}=await homeWithHeldDetails(page,[{...fixtureTitle('movie-157336','Interstellar'),overview:'A rail summary, not the bundled one.'}],{
  'movie-157336':{...fixtureTitle('movie-157336','Interstellar (API copy)'),cast:[{name:'Ada Lovelace',character:'Analyst'}]}});
 await trackAnswers(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await expect(page.locator('[data-rail="featured"]')).toBeVisible();
 await page.locator('.movies-hero [data-play-route]').click();
 await expect(page.locator('iframe.movies-provider-frame')).toHaveCount(1);
 await expect.poll(()=>asked.includes('movie-157336')).toBe(true);
 await expect(page.getByText('Loading title details')).toHaveCount(0);
 await expect(page.locator('iframe.movies-provider-frame')).toHaveCount(1);
 await expect(page.locator('.movies-player h1').first()).toHaveText('Interstellar');
 release();
 await expect.poll(()=>answersRead(page,'id=movie-157336')).toBe(1);
 await expect(page.locator('iframe.movies-provider-frame')).toHaveCount(1);
});

// A built-in movie's details that arrive while it plays do not rebuild its player. The mount counter is the one the mount-once test uses.
test('a built-in movie whose details arrive while it plays keeps its one player',async({page})=>{
 await countFrameMounts(page);
 await trackAnswers(page);
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let asked=false;
 await page.route('**/api/movies?*',async route=>{
  if(!new URL(route.request().url()).searchParams.has('id'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  asked=true;await held;
  return route.fulfill({json:{title:{...fixtureTitle('movie-157336','Interstellar (API copy)'),cast:[{name:'Ada Lovelace',character:'Analyst'}]}}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336');
 await expect.poll(()=>asked).toBe(true);
 await page.getByRole('button',{name:'Play movie',exact:true}).click();
 const frame=page.locator('iframe.movies-provider-frame');
 await expect(frame).toHaveCount(1);
 await frame.evaluate(element=>{(element as HTMLElement).dataset.marker='first';});
 release();
 await expect.poll(()=>answersRead(page,'id=movie-157336')).toBe(1);
 expect(await frameMounts(page)).toEqual({observed:1,renders:1});
 await expect(frame).toHaveAttribute('data-marker','first');
 await page.locator('.movies-detail-back').click();
 await expect(page.locator('section.movies-cast')).toContainText('Ada Lovelace');
});

// Focus on an episode's Play link stays on that link when details arrive. Continue shares its address, so the link in the same list is the one to keep.
test('focus stays on an episode\'s Play link when details arrive, not on Continue for the same episode',async({page})=>{
 let release!:()=>void;
 const held=new Promise<void>(resolve=>{release=resolve;});
 let asked=false;
 await page.route('**/api/movies?*',async route=>{
  if(!new URL(route.request().url()).searchParams.has('id'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  asked=true;await held;
  return route.fulfill({json:{title:{...fixtureTitle('tv-19885','Sherlock (API copy)','tv'),cast:[{name:'Ada Lovelace',character:'Analyst'}]}}});
 });
 await savedProgress(page,{'tv-19885:s2:e1':300},{'tv-19885:s2:e1':{duration:2400,updated:2000}});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885/season/2/episode/1');
 await expect(page.locator('.movies-actions a.movies-primary')).toHaveText('Continue S2 · E1');
 const row=page.getByRole('link',{name:'Play A Scandal in Belgravia',exact:true});
 await row.focus();
 await expect.poll(()=>asked).toBe(true);
 release();
 await expect(page.locator('section.movies-cast')).toContainText('Ada Lovelace');
 await expect(row).toBeFocused();
});

// An answer for another title's id does not change a built-in page.
test('an answer for another title leaves a built-in page as it is',async({page})=>{
 await page.route('**/api/movies?*',route=>{
  if(!new URL(route.request().url()).searchParams.has('id'))return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
  return route.fulfill({json:{title:{...fixtureTitle('movie-90501','Some Other Film'),rating:9.1,runtime:200,cast:[{name:'Ada Lovelace',character:'Analyst'}],related:[fixtureTitle('movie-90502','Related Feature')]}}});
 });
 await trackAnswers(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336');
 const detail=page.locator('section.movies-detail');
 await expect(detail.locator('h1')).toHaveText('Interstellar');
 await expect.poll(()=>answersRead(page,'id=movie-157336')).toBe(1);
 await expect(detail.locator('h1')).toHaveText('Interstellar');
 await expect(detail.locator('.movies-chips')).not.toContainText('★ 9.1');
 await expect(page.locator('section.movies-cast')).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'More like this'})).toHaveCount(0);
});

// The footer keeps its privacy copy in order, and Clear forgets the list, progress, title details, history and the remembered server.
test('the footer keeps the privacy copy and clears saved data',async({page})=>{
 await seedMovies(page,{list:['movie-157336'],progress:{'movie-157336':1200},meta:{'movie-157336':{duration:7200,updated:1}},titles:{},provider:'framextv'});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const footer=page.locator('footer.movies-footer');
 await expect(footer).toHaveClass(/ui-footer/);
 await expect(footer.locator('.ui-footer-brand strong')).toHaveText('Mauri Study Notes');
 await expect(footer.locator('.ui-footer-brand .ui-brand-tile svg')).toHaveCount(1);
 const links=footer.getByRole('navigation',{name:'Movies and TV sections',exact:true}).getByRole('link');
 await expect(links).toHaveText(['Home','Movies','TV Shows','My list']);
 expect(await links.evaluateAll(list=>list.map(link=>link.getAttribute('href')))).toEqual(['#/movies','#/movies/browse/movie','#/movies/browse/tv','#/movies/list']);
 await expect(footer.locator(':scope>strong')).toHaveText('Your screen. Your privacy.');
 await expect(footer.locator('p').nth(0)).toHaveText('My list and playback progress stay on this device. Full-catalog searches go through QCC’s metadata service to TMDB. Real posters and backdrops load from TMDB; its image server receives ordinary image requests.');
 await expect(footer.locator('p').nth(1)).toHaveText('Starter selection · Real title artwork from TMDB. Original summaries. Ratings are not supplied. This is not a live trending feed.');
 await expect(footer.locator('p').filter({hasText:'Streaming is provided by an external service.'})).toHaveText('Streaming is provided by an external service. QCC does not verify its availability or distribution rights. Movies are excluded from game offline downloads.');
 const clear=footer.getByRole('button',{name:'Clear my list & watch history',exact:true});
 await expect(clear).toBeVisible();
 await clear.click();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('qcc:movies:v1'))).toBe('{"list":[],"progress":{},"titles":{},"meta":{}}');
 await expect(clear).toBeFocused();
 await expect(footer.locator('.movies-storage')).toHaveText('Saved only on this device.');
});

// render() rewrites the second footer paragraph once the API supplies titles, so the footer must keep that paragraph at index 1.
test('the footer second paragraph takes the TMDB line once the API supplies titles',async({page})=>{
 await page.route('**/api/movies?*',route=>route.fulfill({json:{rails:[{id:'trending',title:'Trending now',titles:[fixtureTitle('movie-90001','Fixture One')]}]}}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await expect(page.getByRole('heading',{name:'Trending now',exact:true})).toBeVisible();
 const paragraphs=page.locator('footer.movies-footer p');
 await expect(paragraphs.nth(0)).toHaveText(/^My list and playback progress stay on this device\./);
 await expect(paragraphs.nth(1)).toHaveText('Search and metadata use the TMDB database. This product uses the TMDB API but is not endorsed or certified by TMDB.');
});

// Movies spacing comes from selectors that win on specificity. These values are the computed ones the layout has always had.
test('Movies title, count, status and notice spacing holds without !important',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/list');
 const title=page.locator('h1.movies-page-title');
 await expect(title).toBeVisible();
 expect(await title.evaluate(e=>{const s=getComputedStyle(e);return [s.marginTop,s.marginBottom,s.paddingLeft,s.paddingTop];})).toEqual(['56px','6px','0px','0px']);
 await page.goto('/#/movies');
 await page.fill('#movies-search','the');
 await expect(page.locator('p.movies-result-count')).toBeVisible();
 expect(await page.locator('h1.movies-page-title').evaluate(e=>{const s=getComputedStyle(e);return [s.marginTop,s.marginBottom,s.paddingLeft];})).toEqual(['40px','24px','24px']);
 expect(await page.locator('p.movies-result-count').evaluate(e=>{const s=getComputedStyle(e);return [s.marginTop,s.marginBottom];})).toEqual(['20px','20px']);
 await expect(page.locator('p.movies-catalog-status')).toHaveCount(1);
 expect(await page.locator('p.movies-catalog-status').evaluate(e=>{const s=getComputedStyle(e);return [s.marginTop,s.marginBottom];})).toEqual(['12px','16px']);
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await page.locator('.movies-screen').evaluate(screen=>{const note=document.createElement('div');note.className='movies-catalog-status movies-detail-error';note.textContent='Notice';screen.append(note);});
 expect(await page.locator('.movies-detail-error').evaluate(e=>getComputedStyle(e).marginTop)).toBe('0px');
});

// A title that is still loading shows the loading text from its first render. Every write of the page while its details are held is recorded,
// so a not-found render that is replaced before the next paint is still seen.
const pageWrites=(page:Page)=>page.addInitScript(()=>{
 if(window!==window.top)return;
 const state=window as Window&{pageWrites?:string[]};state.pageWrites=[];
 const markup=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML')!;
 Object.defineProperty(Element.prototype,'innerHTML',{configurable:true,get:markup.get,set(value:string){if(this.classList.contains('movies-view'))state.pageWrites!.push(String(value));markup.set!.call(this,value);}});
});
const writesSoFar=(page:Page)=>page.evaluate(()=>(window as Window&{pageWrites?:string[]}).pageWrites?.length??0);
test('a title route that is still loading never renders the not-found text',async({page})=>{
 await pageWrites(page);
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/movies?*',async route=>{await held;return route.fulfill({json:{title:fixtureTitle('movie-90700','Held Title')}});});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-90700');
 await expect(page.getByRole('heading',{name:'Loading title details…',exact:true})).toBeVisible();
 release();
 await expect(page.getByRole('heading',{name:'Held Title',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as Window&{pageWrites?:string[]}).pageWrites!.filter(markup=>markup.includes('Title not found')))).toEqual([]);
});
test('an unloaded title renders its loading page once when it is opened from another page',async({page})=>{
 await pageWrites(page);
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 let asked!:()=>void;const sawRequest=new Promise<void>(resolve=>{asked=resolve;});
 await page.route('**/api/movies?*',async route=>{asked();await held;return route.fulfill({json:{title:fixtureTitle('movie-90701','Single Render Title')}});});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/browse/movie');
 await expect(page.getByRole('heading',{name:'Movies',exact:true,level:1})).toBeVisible();
 const before=await writesSoFar(page);
 await page.evaluate(()=>{location.hash='#/movies/movie-90701';});
 await sawRequest;
 await expect(page.getByRole('heading',{name:'Loading title details…',exact:true})).toBeVisible();
 expect(await writesSoFar(page)-before).toBe(1);
 release();
 await expect(page.getByRole('heading',{name:'Single Render Title',exact:true})).toBeVisible();
});
test('a title opened directly draws its loading page once',async({page})=>{
 await pageWrites(page);
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/movies?*',async route=>{await held;return route.fulfill({json:{title:fixtureTitle('movie-90702','Cold Open Title')}});});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-90702');
 await expect(page.getByRole('heading',{name:'Loading title details…',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as Window&{pageWrites?:string[]}).pageWrites!.filter(markup=>markup.includes('Loading title details')))).toHaveLength(1);
 release();
 await expect(page.getByRole('heading',{name:'Cold Open Title',exact:true})).toBeVisible();
});
test('an unknown Movies route moves focus to its not-found heading and leaves no stream behind',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336/play');
 const frame=page.locator('iframe.movies-provider-frame');await expect(frame).toBeVisible();
 await page.evaluate(()=>{location.hash='#/movies/browse/all';});
 const heading=page.getByRole('heading',{name:'That page could not be found.',exact:true});
 await expect(heading).toBeVisible();
 await expect(heading).toHaveAttribute('tabindex','-1');
 await expect(heading).toBeFocused();
 await expect(frame).toHaveCount(0);
});

// An episode still that fails falls back to the backdrop, then to the poster, one candidate at a time. The watch page's drawer loads these
// stills, and the title's backdrop has not been asked for on that page, so only the walk through the list reaches the poster.
test('an episode still that fails walks the backdrop and then the poster',async({page})=>{
 await page.route('https://image.tmdb.org/t/p/w300/stillfail90800.jpg',route=>route.fulfill({status:404,body:'Unavailable'}));
 await page.route('https://image.tmdb.org/t/p/w780/backdropfail90800.jpg',route=>route.fulfill({status:404,body:'Unavailable'}));
 await answerTitle(page,season=>({...seriesFor('tv-90800','Still Series',season),backdrop:'https://image.tmdb.org/t/p/w780/backdropfail90800.jpg',seasons:[
  {number:1,name:'Season 1',episodes:[{number:1,name:'Pilot',overview:'The first episode.',still:'https://image.tmdb.org/t/p/w300/stillfail90800.jpg'}]},
  {number:2,name:'Season 2',episodes:[]}
 ]}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90800/season/1/episode/1/play');
 await expect(page.getByRole('button',{name:'S1 · E1',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const still=page.getByRole('dialog',{name:'Select episode'}).locator('.movies-drawer-still').first();
 await expect(still).toHaveAttribute('src',/\/t\/p\/w500\/fixture90800\.jpg$/);
 await expect.poll(()=>still.evaluate(image=>(image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
});

// The island follows the header in the page, so its tabs come before the content they navigate to. It is labelled as the games' island is.
test('the Movies island follows the header and comes before the page content',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto('/#/movies');
 await expect(page.locator('nav.movies-mobile-nav')).toBeVisible();
 expect(await page.evaluate(()=>document.querySelector('.movies-top')!.nextElementSibling===document.querySelector('nav.movies-mobile-nav'))).toBe(true);
 expect(await page.evaluate(()=>{const bar=document.querySelector('nav.movies-mobile-nav')!,main=document.querySelector('.movies-browse')!;return !!(bar.compareDocumentPosition(main)&Node.DOCUMENT_POSITION_FOLLOWING);})).toBe(true);
 await expect(page.locator('nav.movies-mobile-nav')).toHaveAttribute('aria-label','Sections');
});

// A rail's scroll is settled when three reads, spaced by the poll, agree. Smooth scrolling moves a rail over several frames, and a read
// taken in the middle of that move is not a position the page keeps.
async function settledScroll(row:Locator){
 const reads:number[]=[];
 await expect.poll(async()=>{reads.push(await row.evaluate(element=>element.scrollLeft));const last=reads.slice(-3);return last.length===3&&last[0]===last[1]&&last[1]===last[2]&&last[0]>0;}).toBe(true);
 return reads[reads.length-1];
}
// A rail keeps its scroll position when the page redraws. The rail is found again by its name.
test('a rail keeps its scroll position when the page redraws',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const row=page.locator('[data-rail="movies-you-ll-love"] .ui-rail-row');
 await expect(row).toBeVisible();
 // Smooth scrolling is off for this one scroll, so the row is at its position at once. The style goes before the redraw, so the redraw
 // still has to put the position back into rows that scroll smoothly.
 const still=await page.addStyleTag({content:'.ui-rail-row{scroll-behavior:auto!important}'});
 await row.evaluate(element=>{element.scrollLeft=200;});
 // The row may snap to a card edge after the scroll, so the test keeps the position the browser settles on.
 const left=()=>row.evaluate(element=>element.scrollLeft);
 const settledAt=await settledScroll(row);
 await still.evaluate(node=>(node as Element).remove());
 // Saving a title redraws Home, as another tab's change does.
 await page.evaluate(()=>{const key='qcc:movies:v1';localStorage.setItem(key,JSON.stringify({list:['movie-157336'],progress:{},meta:{},titles:{}}));window.dispatchEvent(new StorageEvent('storage',{key}));});
 await expect(page.locator('[data-rail="my-list"]')).toBeVisible();
 expect(await left()).toBe(settledAt);
});

// A rail's scroll belongs to the page it was scrolled on. A rail of another page with the same name starts at its beginning.
test('a rail of another page starts at its beginning, though it has the same name',async({page})=>{
 const titles=(prefix:string,label:string)=>Array.from({length:12},(_,index)=>fixtureTitle(`movie-${prefix}${index+1}`,`${label} ${index+1}`));
 await page.route('**/api/movies?*',route=>{
  const rails=new URL(route.request().url()).searchParams.get('rails');
  if(rails==='home')return route.fulfill({json:{rails:[{id:'action',title:'Action',titles:titles('9040','Home pick')}]}});
  if(rails==='movie')return route.fulfill({json:{rails:[{id:'action',title:'Action',titles:titles('9050','Movie pick')}]}});
  return route.fulfill({status:503,json:{error:'catalog_not_configured'}});
 });
 await page.setViewportSize({width:1440,height:900});
 // Movies is opened first, so its rails are in the page when Home hands over to it, and they are drawn at once.
 await page.goto('/#/movies/browse/movie');
 await expect(page.locator('[data-rail="action"] .ui-rail-row')).toBeVisible();
 // Where the Movies rail rests when nothing has scrolled it. Scroll snapping can put that a few px past 0 (4 in WebKit).
 const start=await settledScroll(page.locator('[data-rail="action"] .ui-rail-row'));
 await page.locator('.movies-top [data-kind="all"]').click();
 // The rail is measured once Home's own titles are in it, not the Movies rail that is still drawn while the click lands.
 const row=page.locator('[data-rail="action"] .ui-rail-row');
 await expect(row.locator('[data-title="movie-90401"]')).toHaveCount(1);
 expect(await row.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(true);
 const left=()=>row.evaluate(element=>element.scrollLeft);
 await row.evaluate(element=>{element.scrollLeft=248;});
 // Home's rail has moved before the page is left, so there is a position to carry over, and the settled position is above zero.
 expect(await settledScroll(row)).toBeGreaterThan(0);
 await page.locator('.movies-top [data-kind="movie"]').click();
 await expect(page.getByRole('heading',{name:'Movies',exact:true,level:1})).toBeVisible();
 await expect(row.locator('[data-title="movie-90501"]')).toHaveCount(1);
 // The Movies rail is drawn for this page, so Home's position is not written into it: it rests where it did before.
 await expect.poll(left).toBe(start);
});

// A season picked on a title page redraws the same page, so its More like this rail keeps the position the reader gave it.
test('a season picked on a title page keeps the More like this rail where it was',async({page})=>{
 const related=Array.from({length:12},(_,index)=>fixtureTitle(`movie-906${String(index).padStart(2,'0')}`,`Related pick ${index+1}`));
 await answerTitle(page,()=>({...fixtureTitle('tv-19885','Sherlock (API copy)','tv'),related}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-19885');
 const row=page.locator('[data-rail="related"] .ui-rail-row');
 await expect(row.locator('[data-title="movie-90600"]')).toHaveCount(1);
 expect(await row.evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(true);
 await row.evaluate(element=>{element.scrollLeft=248;});
 const settledAt=await settledScroll(row);
 expect(settledAt).toBeGreaterThan(0);
 const second=page.getByRole('button',{name:'Season 2',exact:true});
 await second.click();
 await expect(page).toHaveURL(/\/season\/2\/episode\/\d+$/);
 await expect(second).toHaveAttribute('aria-pressed','true');
 await expect.poll(()=>row.evaluate(element=>element.scrollLeft)).toBe(settledAt);
});

// Typing keeps the search field in the page: the same node, with the text typed so far.
test('the search field is the same node while three characters are typed',async({page})=>{
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const search=page.locator('#movies-search');
 await search.focus();
 await page.evaluate(()=>{(window as Window&{field?:Element}).field=document.querySelector('#movies-search')!;});
 await page.keyboard.type('the');
 await expect(search).toHaveValue('the');
 await expect(search).toBeFocused();
 expect(await page.evaluate(()=>(window as Window&{field?:Element}).field===document.querySelector('#movies-search'))).toBe(true);
});

// The status line under the results is the same node as the reader types, and it shows the new state.
test('the status line keeps its node while the search changes',async({page})=>{
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const search=page.locator('#movies-search');
 await search.focus();await page.keyboard.type('the');
 const status=page.locator('.movies-catalog-status');
 await expect(status).toContainText('Full catalog search');
 await page.evaluate(()=>{(window as Window&{statusNode?:Element}).statusNode=document.querySelector('.movies-catalog-status')!;});
 await page.keyboard.type('re');
 await expect(status).toContainText('Full catalog search');
 await expect(search).toHaveValue('there');
 expect(await page.evaluate(()=>(window as Window&{statusNode?:Element}).statusNode===document.querySelector('.movies-catalog-status'))).toBe(true);
});

// Text being composed is not a query. The field keeps its node while it composes, no request goes out for the partial text, and the
// composed text is searched once the composition ends. Requests are logged in the page, so the log is complete when the test reads it.
test('a composition keeps the search field and sends one query for the text it ends with',async({page})=>{
 await page.addInitScript(()=>{
  if(window!==window.top)return;
  const state=window as Window&{searches?:string[]};state.searches=[];
  const send=window.fetch.bind(window);
  window.fetch=(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(input instanceof Request?input.url:String(input),location.href);const query=url.searchParams.get('q');if(url.pathname==='/api/movies'&&query)state.searches!.push(query);return send(input,init);};
 });
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));
 const searches=()=>page.evaluate(()=>(window as Window&{searches?:string[]}).searches);
 const search=page.locator('#movies-search');
 await search.focus();
 await page.evaluate(()=>{const field=document.querySelector<HTMLInputElement>('#movies-search')!;(window as Window&{field?:Element}).field=field;field.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));field.value='にほ';field.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText',data:'にほ'}));});
 await expect(search).toHaveValue('にほ');
 // The debounce is 280 ms. Running the clock past it shows that the partial text sent no request.
 await page.clock.runFor(300);
 expect(await searches()).toEqual([]);
 await page.evaluate(()=>{const field=document.querySelector<HTMLInputElement>('#movies-search')!;field.value='日本';field.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'日本'}));});
 await page.clock.runFor(300);
 expect(await searches()).toEqual(['日本']);
 await expect(search).toHaveValue('日本');
 expect(await page.evaluate(()=>(window as Window&{field?:Element}).field===document.querySelector('#movies-search'))).toBe(true);
});

// A change to My list redraws the list in place: the search field stays the same node, with the text typed in it.
test('a change to My list keeps the search field and what was typed in it',async({page})=>{
 await seedMovies(page,savedFilm);
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/list');
 const search=page.locator('#movies-search');
 await search.focus();await page.keyboard.type('inter');
 await expect(search).toHaveValue('inter');
 await page.evaluate(()=>{(window as Window&{field?:Element}).field=document.querySelector('#movies-search')!;});
 // Another tab saves a second title, which the storage event reports.
 await page.evaluate(()=>{const key='qcc:movies:v1';localStorage.setItem(key,JSON.stringify({list:['movie-157336','movie-329865'],progress:{},meta:{},titles:{}}));window.dispatchEvent(new StorageEvent('storage',{key}));});
 await expect(page.locator('.movies-page-head .ui-count')).toHaveText('2 titles');
 expect(await page.evaluate(()=>(window as Window&{field?:Element}).field===document.querySelector('#movies-search'))).toBe(true);
 await expect(search).toHaveValue('inter');
 await expect(search).toBeFocused();
});

// The Movies page is black with the shared type. Its colours are checked in the stylesheet text by a unit test.
test('the Movies page is black and sets the shared font stack',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const view=page.locator('.movies-view');
 await expect(view.locator('h1').first()).toBeVisible();
 expect(await view.evaluate(element=>getComputedStyle(element).backgroundColor)).toBe('rgb(0, 0, 0)');
 const stack=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--font-sans'));
 // Engines serialise a family list differently: Chromium quotes names with spaces and WebKit does not. Spaces and quotes are dropped.
 const normal=(value:string)=>value.replace(/[\s"']+/g,'');
 expect(normal(await view.evaluate(element=>getComputedStyle(element).fontFamily))).toBe(normal(stack));
 expect(normal(await view.locator('h1').first().evaluate(element=>getComputedStyle(element).fontFamily))).toBe(normal(stack));
});

// The storage line is meant for reading, so it keeps 4.5:1 against the page it sits on.
test('the storage line keeps 4.5:1 contrast on the Movies page',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const storage=page.locator('.movies-storage');
 await expect(storage).toBeVisible();
 const ratio=await storage.evaluate(element=>{
  const channels=(value:string)=>value.match(/[\d.]+/g)!.slice(0,3).map(Number);
  const luminance=([r,g,b]:number[])=>{const linear=(v:number)=>{const c=v/255;return c<=0.03928?c/12.92:((c+0.055)/1.055)**2.4;};return 0.2126*linear(r)+0.7152*linear(g)+0.0722*linear(b);};
  const ink=luminance(channels(getComputedStyle(element).color)),paper=luminance(channels(getComputedStyle(element.closest('.movies-view')!).backgroundColor));
  return (Math.max(ink,paper)+0.05)/(Math.min(ink,paper)+0.05);
 });
 expect(ratio).toBeGreaterThanOrEqual(4.5);
});

// Home, a section and a title fit the page at every width from a 320 px phone to a 1366 px laptop, with no sideways scrolling.
for(const width of [320,390,768,1366])test(`Home, a section and a title fit ${width} px without horizontal scrolling`,async({page})=>{
 await page.setViewportSize({width,height:844});
 for(const [url,ready] of [['/#/movies','.movies-hero h1'],['/#/movies/browse/movie','h1.movies-page-title'],['/#/movies/movie-157336','.movies-detail h1']] as const){
  await page.goto(url);
  await expect(page.locator(ready).first()).toBeVisible();
  expect(await page.locator('.movies-view').evaluate(view=>view.scrollWidth<=view.clientWidth),url).toBe(true);
 }
});

// Without the Fullscreen API the Full screen button has nothing to do, so it is hidden.
test('the Full screen button is hidden where the Fullscreen API is missing',async({page})=>{
 await page.addInitScript(()=>{for(const name of ['requestFullscreen','webkitRequestFullscreen'])Object.defineProperty(Element.prototype,name,{value:undefined,configurable:true});});
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/movie-157336/play');
 await expect(page.locator('iframe.movies-provider-frame')).toBeVisible();
 // The button is still in the page with the hidden attribute, so the check reads it by its class: a role query leaves hidden controls out.
 const button=page.locator('button.movies-fullscreen');
 await expect(button).toHaveCount(1);
 await expect(button).toBeHidden();
});

// Episode rows in the drawer are at least 44 px tall, so each one is a usable touch target on a phone and on a laptop.
for(const width of [390,1440])test(`drawer episode rows are at least 44 px tall at ${width} px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.getByRole('dialog',{name:'Select episode'});
 const rows=drawer.locator('.movies-drawer-row');
 await expect(rows.first()).toBeVisible();
 await drawerSettled(drawer);
 const heights=await rows.evaluateAll(elements=>elements.map(element=>element.getBoundingClientRect().height));
 expect(heights.length).toBeGreaterThan(1);
 for(const height of heights)expect(height).toBeGreaterThanOrEqual(44);
});
