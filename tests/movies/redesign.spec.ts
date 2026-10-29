import {test,expect} from '../fixtures';
import type {Locator,Page} from '@playwright/test';

// Same network fixtures as movies.spec.ts. The streaming hosts also answer with the provider fixture page.
test.beforeEach(async({page})=>{
 await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
 for(const url of ['https://framextv.cc/**','https://framextv.xyz/**','https://vidlink.pro/**','https://vixsrc.to/**','https://vidsrc.to/**'])
  await page.route(url,route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
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
 // A control the page focuses while it is already in view stays where it is.
 const card=page.locator('.movies-poster').first();
 await card.scrollIntoViewIfNeeded();
 const before=await page.locator('.movies-view').evaluate(v=>v.scrollTop);
 await card.focus();
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 expect(await page.locator('.movies-view').evaluate(v=>v.scrollTop)).toBe(before);
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

// Ruling 4: a heading focused by script shows no ring. The Tab press first makes script focus count as keyboard focus.
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

// Ruling 1: the Movies tab bar is the glass island at every width.
for(const width of [1440,390])test(`the Movies island is visible at ${width}px, with 5 items`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 await expect(bar).toBeVisible();
 await expect(bar.locator('.ui-tab')).toHaveCount(5);
});

// Ruling 2: the island's hide-on-scroll follows the Movies scroller.
for(const width of [390,1440])test(`the Movies island hides on scroll down and returns on scroll up at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 const view=page.locator('.movies-view');
 await expect(bar).toBeVisible();
 // The page must be scrollable first: wait for the catalog's rails, which render after the loading state.
 await expect(page.locator('[data-rail]').first()).toBeVisible();
 await expect.poll(()=>view.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(424);
 await view.evaluate(e=>e.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await view.evaluate(e=>e.scrollTo(0,300));
 await expect(bar).not.toHaveAttribute('data-hidden');
});

test('the Movies island is shown again after a section change while it is hidden',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const bar=page.locator('nav.movies-mobile-nav.ui-tabbar');
 const view=page.locator('.movies-view');
 await expect(page.locator('[data-rail]').first()).toBeVisible();
 await expect.poll(()=>view.evaluate(e=>e.scrollHeight-e.clientHeight)).toBeGreaterThan(424);
 await view.evaluate(e=>e.scrollTo(0,400));
 await expect(bar).toHaveAttribute('data-hidden','true');
 await page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true}).click();
 await expect(bar).not.toHaveAttribute('data-hidden');
 await expect(bar.locator('[data-kind="tv"]')).toHaveAttribute('aria-pressed','true');
});

// Ruling 3: content and keyboard focus clear the island at every width.
for(const width of [390,1440])test(`the Movies scroller keeps 88px of bottom clearance at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:844});
 await page.goto('/#/movies');
 const view=page.locator('.movies-view');
 expect(await view.evaluate(e=>getComputedStyle(e).scrollPaddingBottom)).toBe('88px');
 expect(await view.evaluate(e=>getComputedStyle(e).paddingBottom)).toBe('88px');
});

// Ruling 5: the header never clips the wordmark, overflows its row, or lets the brand, nav and actions overlap, from 320 to 1920 px.
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
 await expect(page.getByText('Make it a movie night.')).toHaveCount(0);
});

// Ruling 1: the hero list button names its action in its label, has no aria-pressed, and shows at every width.
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

// Ruling 2: a series hero whose episodes are not loaded plays through the title page, never a play route without an episode.
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

// Ruling 7: a poster that fails to load is classified as failed and its title shows on the placeholder.
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

// Section 9: keyboard focus stays visible in the search field, with the ring on the field's box rather than the bare input.
test('the search field shows a focus ring on its box',async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 await tabTo(page,page.locator('#movies-search'));
 const box=page.locator('label.movies-search');
 const ring=await outline(box);
 expect(ring.style).toBe('solid');
 expect(ring.width).toBeGreaterThanOrEqual(2);
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
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies');
 const card=page.locator('[data-rail="sci-fi-fantasy"] [data-title="movie-157336"]');
 await expect(card).toBeVisible();
 await card.click();
 await expect(page).toHaveURL(/#\/movies\/movie-157336$/);
 await page.getByRole('link',{name:'← Back to browsing',exact:true}).click();
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
