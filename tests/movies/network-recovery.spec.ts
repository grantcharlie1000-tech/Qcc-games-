import {test,expect} from '../fixtures';

const remoteTitle={id:'movie-778899',kind:'movie',name:'Remote Expedition',year:2024,genres:['Adventure'],overview:'A journey beyond the known world.',poster:'https://image.tmdb.org/t/p/w500/remote.jpg',seasons:[]};
const results={titles:[remoteTitle],page:1,totalPages:1,totalResults:1};

test.beforeEach(async({page})=>{
 await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
 for(const origin of ['https://framextv.cc','https://framextv.xyz','https://vidlink.pro','https://vixsrc.to','https://vidsrc.to'])await page.route(origin+'/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'+(origin==='https://framextv.cc'?'<script>parent.postMessage({event:"frameXTV:ready"},"*")</script>':'')}));
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

test('surrounding spaces do not discard successful catalog search',async({page})=>{
 await page.route('**/api/movies?*',route=>route.fulfill({json:results}));
 await page.goto('/#/movies');
 await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('  remote expedition  ');
 await expect(page.getByRole('link',{name:'Details for Remote Expedition'})).toBeVisible();
 await expect(page.locator('.movies-catalog-status')).not.toContainText('Searching');
});

test('full-catalog aliases remain visible without literal local query matches',async({page})=>{
 await page.route('**/api/movies?*',route=>route.fulfill({json:results}));
 await page.goto('/#/movies');
 await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('voyage lointain');
 await expect(page.getByRole('link',{name:'Details for Remote Expedition'})).toBeVisible();
});

test('blocked search keeps local matches and offers a working manual retry',async({page})=>{
 let blocked=true;
 await page.route('**/api/movies?*',route=>blocked?route.abort():route.fulfill({json:results}));
 await page.goto('/#/movies');
 await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('  arrival  ');
 await expect(page.getByRole('link',{name:'Details for Arrival',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Retry search',exact:true}).click();
 await expect(page.getByRole('button',{name:'Retry search',exact:true})).toBeVisible();
 blocked=false;
 await page.getByRole('button',{name:'Retry search',exact:true}).click();
 await expect(page.getByRole('link',{name:'Details for Remote Expedition'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Retry search',exact:true})).toHaveCount(0);
});

test('late browse metadata cannot reload an active player',async({page})=>{
 let release!:()=>void;
 const pending=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/movies?*',async route=>{await pending;await route.fulfill({json:results});});
 await page.goto('/#/movies');
 await page.locator('.movies-hero').getByRole('button',{name:'Play',exact:true}).click();
 const frame=page.locator('.movies-provider-frame');await expect(frame).toBeVisible();
 await frame.evaluate(element=>element.setAttribute('data-instance','original'));
 const response=page.waitForResponse(response=>response.url().includes('/api/movies?'));
 release();await (await response).finished();
 await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
 await expect(frame).toHaveAttribute('data-instance','original');
});

test('failed title metadata shows retry instead of claiming the title is absent',async({page})=>{
 let blocked=true;
 await page.route('**/api/movies?*',route=>blocked?route.abort():route.fulfill({json:{title:remoteTitle}}));
 await page.goto('/#/movies/movie-778899');
 await expect(page.getByRole('heading',{name:'Title not found'})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Retry title',exact:true})).toBeVisible();
 blocked=false;
 await page.getByRole('button',{name:'Retry title',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Remote Expedition',exact:true})).toBeVisible();
});

test('hung search stops waiting and remains retryable',async({page})=>{
 await page.clock.install();
 let started=false;
 await page.route('**/api/movies?*',route=>{if(new URL(route.request().url()).searchParams.has('q')){started=true;return;}return route.fulfill({json:{titles:[],page:1,totalPages:1}});});
 await page.goto('/#/movies');
 await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('arrival');
 await page.clock.fastForward(300);await expect.poll(()=>started).toBe(true);
 await page.clock.fastForward(21000);
 await expect(page.locator('.movies-catalog-status')).toContainText(/timed out/i);
 await expect(page.getByRole('button',{name:'Retry search',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Details for Arrival',exact:true})).toBeVisible();
});

test('hung local catalog stops waiting and supports retry',async({page})=>{
 await page.clock.install();
 let blocked=true,started=false;
 await page.route('**/movies/catalog.json',route=>{started=true;if(!blocked)return route.continue();});
 await page.goto('/#/movies');await expect.poll(()=>started).toBe(true);
 await page.clock.fastForward(21000);
 await expect(page.getByRole('button',{name:'Try again',exact:true})).toBeVisible();
 blocked=false;await page.getByRole('button',{name:'Try again',exact:true}).click();
 await expect(page.getByRole('searchbox',{name:'Search movies and TV'})).toBeVisible();
});

test('hung optional license registry does not leave discovery pending forever',async({page})=>{
 await page.clock.install();let started=false;
 await page.route('**/movies/licenses.json',()=>{started=true;});
 await page.goto('/#/movies');await expect.poll(()=>started).toBe(true);
 await page.clock.fastForward(21000);
 await expect(page.getByRole('searchbox',{name:'Search movies and TV'})).toBeVisible();
});

test('manual player reload recreates only the chosen frame and retains its restrictions',async({page})=>{
 await page.goto('/#/movies/movie-157336/play');
 const frame=page.locator('.movies-provider-frame');await expect(frame).toBeVisible();
 await frame.evaluate(element=>element.setAttribute('data-instance','original'));
 await page.getByRole('button',{name:'Reload player',exact:true}).click();
 await expect(frame).not.toHaveAttribute('data-instance','original');
 await expect(frame).toHaveAttribute('sandbox','allow-scripts allow-same-origin');
 await expect(frame).toHaveAttribute('referrerpolicy','no-referrer');
 await expect(page).toHaveURL(/#\/movies\/movie-157336\/play$/);
});

test('retry resumes the failed catalog page instead of the previous successful page',async({page})=>{
 // all three automatic attempts fail, so the manual retry is still exercised
 let failures=3;
 await page.route('**/api/movies?*',route=>{
  const pageNumber=Number(new URL(route.request().url()).searchParams.get('page')||1);
  if(pageNumber===2&&failures-->0)return route.abort();
  const name=pageNumber===2?'Second Page Feature':'First Page Feature';
  return route.fulfill({json:{titles:[{...remoteTitle,name}],page:pageNumber,totalPages:2,totalResults:40}});
 });
 await page.goto('/#/movies');await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('feature');
 await expect(page.getByRole('link',{name:'Details for First Page Feature'})).toBeVisible();
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await page.getByRole('button',{name:'Retry search',exact:true}).click();
 await expect(page.getByRole('link',{name:'Details for Second Page Feature'})).toBeVisible();
 await expect(page.locator('.movies-pagination')).toContainText('Page 2 of 2');
});

test('fullscreen lazy-season failures expose retry without replacing the screen or active frame',async({page})=>{
 let blocked=true,releaseFailure!:()=>void;
 const pendingFailure=new Promise<void>(resolve=>{releaseFailure=resolve;});
 const series=(season:number)=>({...remoteTitle,id:'tv-778899',kind:'tv',seasons:[1,2].map(number=>({number,name:'Season '+number,episodes:number===season?[{number:1,name:number===1?'First Contact':'The Long Crossing',overview:''}]:[]}))});
 await page.route('**/api/movies?*',async route=>{
  const season=Number(new URL(route.request().url()).searchParams.get('season')||1);
  if(season===2&&blocked){await pendingFailure;return route.fulfill({status:502,json:{error:'metadata_unavailable'}});}
  return route.fulfill({json:{title:series(season)}});
 });
 await page.goto('/#/movies/tv-778899/season/1/episode/1/play');
 await expect(page.frameLocator('.movies-provider-frame').getByRole('button',{name:'Play stream'})).toBeVisible();
 test.skip(!await page.locator('.movies-screen').evaluate(element=>!!element.requestFullscreen),'Browser reports the Fullscreen API unsupported');
 await page.getByRole('button',{name:'Full screen',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.className)).toBe('movies-screen');
 await page.locator('.movies-screen').evaluate(element=>element.setAttribute('data-instance','original-screen'));
 await page.frame({url:/framextv/})!.evaluate(()=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:100,duration:100},'*'));
 await page.getByRole('button',{name:'Play now',exact:true}).click();
 const frame=page.locator('.movies-provider-frame');await expect(frame).toHaveAttribute('src',/\/778899\/2\/1\?/);
 await frame.evaluate(element=>element.setAttribute('data-instance','season-two-frame'));
 releaseFailure();
 const retry=page.getByRole('button',{name:'Retry title',exact:true});await expect(retry).toBeVisible();
 expect(await retry.evaluate(element=>document.fullscreenElement?.contains(element))).toBe(true);
 await expect(frame).toHaveAttribute('data-instance','season-two-frame');
 blocked=false;await retry.click();
 await expect(page.locator('.movies-player>h2')).toHaveText('S2 · E1 — The Long Crossing');
 await expect(page.locator('.movies-screen')).toHaveAttribute('data-instance','original-screen');
 await expect(frame).toHaveAttribute('data-instance','season-two-frame');
 expect(await page.evaluate(()=>document.fullscreenElement?.className)).toBe('movies-screen');
 await expect(retry).toHaveCount(0);
});

// A control that re-renders the page keeps keyboard focus: the same control when it still exists, else the heading of the page.
test('Retry title keeps focus on the Retry title button when the title still fails',async({page})=>{
 await page.route('**/api/movies?*',route=>route.abort());
 await page.goto('/#/movies/movie-778899');
 const retry=page.getByRole('button',{name:'Retry title',exact:true});
 await expect(retry).toBeVisible();
 await retry.focus();await page.keyboard.press('Enter');
 // The notice and its Retry button come back, and focus returns to that button.
 await expect(page.getByRole('button',{name:'Retry title',exact:true})).toBeFocused();
});

test('a failed Retry title leaves focus where the reader moved it while the title loaded',async({page})=>{
 let holding=false;const held:(()=>void)[]=[];
 await page.route('**/api/movies?*',route=>holding?new Promise<void>(resolve=>held.push(()=>{void route.abort();resolve();})):route.abort());
 await page.goto('/#/movies/movie-778899');
 const retry=page.getByRole('button',{name:'Retry title',exact:true});
 await expect(retry).toBeVisible();
 holding=true;
 await retry.focus();await page.keyboard.press('Enter');
 await expect.poll(()=>held.length).toBeGreaterThan(0);
 // The reader moves on while the title loads, so the failure must not pull focus back to Retry.
 const search=page.getByRole('button',{name:'Search movies and TV',exact:true});
 await search.focus();
 holding=false;for(const release of held.splice(0))release();
 await expect(page.getByRole('button',{name:'Retry title',exact:true})).toBeVisible();
 await expect(search).toBeFocused();
});

test('Retry title moves focus to the title heading once the title loads',async({page})=>{
 let blocked=true;
 await page.route('**/api/movies?*',route=>blocked?route.abort():route.fulfill({json:{title:remoteTitle}}));
 await page.goto('/#/movies/movie-778899');
 const retry=page.getByRole('button',{name:'Retry title',exact:true});
 await expect(retry).toBeVisible();
 blocked=false;await retry.focus();await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:'Remote Expedition',exact:true})).toBeVisible();
 await expect(page.locator('.movies-detail h1')).toBeFocused();
});

test('Reload player keeps keyboard focus on Reload player',async({page})=>{
 await page.goto('/#/movies/movie-157336/play');
 const frame=page.locator('iframe.movies-provider-frame');await expect(frame).toBeVisible();
 await frame.evaluate(element=>element.setAttribute('data-instance','original'));
 const reload=page.getByRole('button',{name:'Reload player',exact:true});
 await reload.focus();await page.keyboard.press('Enter');
 await expect(frame).not.toHaveAttribute('data-instance','original');
 await expect(reload).toBeFocused();
});

test('Resume stream moves keyboard focus to the player heading once the stream is back',async({page})=>{
 await page.goto('/#/movies/movie-157336/play');
 await expect(page.locator('iframe.movies-provider-frame')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
 await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();
 const resume=page.getByRole('button',{name:'Resume stream',exact:true});
 await resume.focus();await page.keyboard.press('Enter');
 await expect(page.locator('iframe.movies-provider-frame')).toBeVisible();
 await expect(page.locator('.movies-player>h1')).toBeFocused();
});
