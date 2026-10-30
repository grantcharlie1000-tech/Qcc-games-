import {test,expect} from '../fixtures';
import type {Page,Route} from '@playwright/test';

// Automatic failover, the remembered server, episode validation and the licence rule.
// Provider pages are local fixtures. A watchdog test installs the clock before goto and waits for the frame's load first,
// so no watchdog is armed before the clock can run it.
const PROVIDER_PAGE='<!doctype html><title>Provider fixture</title><button>Play stream</button>';
const FRAMEXTV_READY="<script>parent.postMessage({event:'frameXTV:ready'},'*')</script>";
// A provider page that sends its frame to a host outside our frame-src policy. The page redirects itself because WebKit refuses a 302 from route.fulfill;
// the browser checks the navigation against the same policy either way, so the violation is the same.
const REDIRECT_OUT={contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><meta http-equiv="refresh" content="0;url=https://example.org/">'};
// The watch page renders once the collection has answered, so a provider frame is awaited before it is read.
const loadedFrame=async(page:Page,host:RegExp)=>{await expect(page.locator('iframe.movies-provider-frame')).toBeAttached();await expect.poll(()=>page.frame({url:host})).not.toBeNull();const frame=page.frame({url:host})!;await frame.waitForLoadState('load');return frame;};
// Installed alone, the clock runs in real time. Pausing it leaves time to runFor, so every watchdog fires when the test says.
const frozenClock=async(page:Page)=>{await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+1000));};
const providerFrame=(page:Page)=>page.locator('iframe.movies-provider-frame');
const lands=(page:Page,server:string)=>expect(providerFrame(page)).toHaveAttribute('data-provider',server);
const serversRow=(page:Page)=>page.getByRole('group',{name:'Servers',exact:true});
const stored=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1')||'{}'));
// A real-time wait on the test side. A page-side timer would be frozen by the clock.
const settle=(_page:Page)=>new Promise<void>(resolve=>setTimeout(resolve,300));
const savedProgress=(page:Page,progress:Record<string,number>,meta:Record<string,{duration:number;updated:number}>)=>page.addInitScript(({progress,meta})=>{if(window!==window.top)return;localStorage.setItem('qcc:movies:v1',JSON.stringify({list:[],titles:{},progress,meta}));},{progress,meta});
const thirdParty=(page:Page,urls:string[])=>{const app=new URL(page.url()).origin;return urls.filter(url=>{const target=new URL(url);return !['data:','blob:'].includes(target.protocol)&&target.origin!==app&&target.hostname!=='image.tmdb.org';});};

// A two-season series. Season 1 has two episodes; season 2 has its episodes only when asked for it, as the API answers.
const seasonTitle=(season:number,id='tv-90200')=>({id,kind:'tv',name:'Pill Series',year:2024,genres:['Adventure'],overview:'A fixture series.',poster:'https://image.tmdb.org/t/p/w500/fixture90200.jpg',seasons:[
 {number:1,name:'Season 1',episodes:season===1?[{number:1,name:'Pilot',overview:'The first episode.'},{number:2,name:'Second Episode',overview:'Still the first season.'}]:[]},
 {number:2,name:'Season 2',episodes:season===2?[{number:1,name:'Second Season Opener',overview:'The second season begins.'}]:[]}
]});
const seasonOf=(url:string)=>Number(new URL(url).searchParams.get('season')||1);
const licensedOpener={key:'tv-90200:s2:e1',path:'movies/media/second-season-opener.mp4',license:'CC0-1.0',credit:'QCC fixture',evidence:'docs/rights/fixture.md',reviewed:true,territory:'Worldwide',expires:'2099-12-31'};

test.beforeEach(async({page})=>{
 // Existing playback coverage accepts each fresh third-party playback warning.
 await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>{await dialog.getByRole('button',{name:'Continue',exact:true}).click();});
 await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
 await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:PROVIDER_PAGE+FRAMEXTV_READY}));
 for(const url of ['https://framextv.xyz/**','https://vidlink.pro/**','https://vixsrc.to/**','https://vidsrc.to/**'])
  await page.route(url,route=>route.fulfill({contentType:'text/html',body:PROVIDER_PAGE}));
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

test('a provider redirect blocked by the CSP moves to Server 2',async({page})=>{
 await page.route('https://framextv.cc/**',route=>route.fulfill(REDIRECT_OUT));
 await page.goto('/#/movies/movie-157336/play');
 await lands(page,'vidlink');
 await expect(page.locator('.movies-failover')).toHaveText("Server 1 didn't start. Trying Server 2…");
 // The overlay stays on the screen through a redraw, so its server name must follow the switch.
 await expect(page.locator('.movies-connecting p')).toHaveText('Connecting to Server 2…');
});

test('a server that never loads is replaced after 15 seconds',async({page})=>{
 await frozenClock(page);
 await page.route('https://framextv.cc/**',()=>{});
 await page.goto('/#/movies/movie-157336/play');
 await lands(page,'framextv');
 await page.clock.runFor(14000);
 await lands(page,'framextv');
 await page.clock.runFor(1000);
 await lands(page,'vidlink');
});

test('FrameXTV that loads without a ready message is replaced after 12 seconds',async({page})=>{
 await frozenClock(page);
 await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:PROVIDER_PAGE}));
 await page.goto('/#/movies/movie-157336/play');
 await loadedFrame(page,/framextv/);
 await page.clock.runFor(11000);
 await lands(page,'framextv');
 await page.clock.runFor(1000);
 await lands(page,'vidlink');
});

test('a ready FrameXTV stays selected',async({page})=>{
 await frozenClock(page);
 await page.goto('/#/movies/movie-157336/play');
 await loadedFrame(page,/framextv/);
 await page.clock.runFor(30000);
 await lands(page,'framextv');
 await expect(page.locator('.movies-connecting')).toBeHidden();
});

test('the server that played is remembered after a reload',async({page})=>{
 await page.route('https://framextv.cc/**',route=>route.fulfill(REDIRECT_OUT));
 await page.goto('/#/movies/movie-157336/play');
 await lands(page,'vidlink');
 await (await loadedFrame(page,/vidlink/)).evaluate(()=>parent.postMessage({type:'PLAYER_EVENT',data:{event:'timeupdate',currentTime:5,duration:100}},'*'));
 await expect.poll(async()=>(await stored(page)).provider).toBe('vidlink');
 await expect(page.locator('.movies-failover')).toBeEmpty();
 const asked:string[]=[];page.on('request',request=>{if(request.url().includes('framextv'))asked.push(request.url());});
 await page.reload();
 await lands(page,'vidlink');
 await settle(page);
 expect(asked).toEqual([]);
});

test('a manual pick that fails does not switch by itself',async({page})=>{
 await frozenClock(page);
 await page.route('https://vixsrc.to/**',()=>{});
 await page.goto('/#/movies/movie-157336/play');
 await serversRow(page).getByRole('button',{name:/^Server 3\b/}).click();
 await lands(page,'vixsrc');
 await page.clock.runFor(15000);
 await expect(page.locator('.movies-failover')).toHaveText("Server 3 didn't start. Try Server 4.");
 await lands(page,'vixsrc');
});

test('a server picked on one title is manual on that title only',async({page})=>{
 await frozenClock(page);
 await page.goto('/#/movies/movie-157336/play');
 await serversRow(page).getByRole('button',{name:/^Server 2\b/}).click();
 await lands(page,'vidlink');
 await loadedFrame(page,/vidlink/);
 // On the next title VidLink never answers. FrameXTV loads without a ready message, so the failover note stays on screen.
 await page.route('https://vidlink.pro/**',()=>{});
 await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:PROVIDER_PAGE}));
 await page.evaluate(()=>{location.hash='#/movies/movie-438631/play';});
 await expect(providerFrame(page)).toHaveAttribute('src',/\/movie\/438631\?/);
 await page.clock.runFor(14000);
 await lands(page,'vidlink');
 await page.clock.runFor(1000);
 await lands(page,'framextv');
 await expect(page.locator('.movies-failover')).toHaveText("Server 2 didn't start. Trying Server 1…");
});

test('when every server fails, Try again restarts at Server 1',async({page})=>{
 let blocked=true;
 for(const origin of ['https://framextv.cc','https://vidlink.pro','https://vixsrc.to','https://vidsrc.to'])
  await page.route(origin+'/**',route=>blocked?route.fulfill(REDIRECT_OUT):route.fulfill({contentType:'text/html',body:PROVIDER_PAGE+(origin==='https://framextv.cc'?FRAMEXTV_READY:'')}));
 await page.goto('/#/movies/movie-157336/play');
 await expect(page.getByRole('heading',{name:"Playback didn't start",exact:true})).toBeVisible();
 await expect(page.getByText('This title would not start on any server.',{exact:true})).toBeVisible();
 await expect(providerFrame(page)).toHaveCount(0);
 blocked=false;
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await lands(page,'framextv');
});

// The first server waits until the test has focused Reload player, then every server fails, so the panel redraws with its controls.
test('an exhausted failover keeps keyboard focus on Reload player',async({page})=>{
 let release!:()=>void;const released=new Promise<void>(resolve=>{release=resolve;});
 await page.route('https://framextv.cc/**',async route=>{await released;await route.fulfill(REDIRECT_OUT);});
 for(const origin of ['https://vidlink.pro','https://vixsrc.to','https://vidsrc.to'])await page.route(origin+'/**',route=>route.fulfill(REDIRECT_OUT));
 await page.goto('/#/movies/movie-157336/play');
 const reload=page.getByRole('button',{name:'Reload player',exact:true});
 await expect(reload).toBeVisible();
 await reload.focus();release();
 await expect(page.getByRole('heading',{name:"Playback didn't start",exact:true})).toBeVisible();
 await expect(reload).toBeFocused();
});

test('a server clicked on an exhausted title starts after a visit to another title',async({page})=>{
 await frozenClock(page);
 const up=new Set<string>();
 for(const origin of ['https://framextv.cc','https://vidlink.pro','https://vixsrc.to','https://vidsrc.to'])
  await page.route(origin+'/**',route=>route.fulfill(up.has(origin)?{contentType:'text/html',body:PROVIDER_PAGE+(origin==='https://framextv.cc'?FRAMEXTV_READY:'')}:REDIRECT_OUT));
 await page.goto('/#/movies/movie-157336/play');
 await expect(page.getByRole('heading',{name:"Playback didn't start",exact:true})).toBeVisible();
 // Title A's frame leaves its key behind. B has no frame, so that key is what a pick on B would record.
 up.add('https://framextv.cc');
 await page.evaluate(()=>{location.hash='#/movies/movie-438631/play';});
 await lands(page,'framextv');
 await expect(serversRow(page).getByRole('button',{name:/^Server 1\b/})).toHaveAttribute('data-state','working');
 await page.clock.runFor(60000);
 await page.evaluate(()=>{location.hash='#/movies/movie-157336/play';});
 await expect(page.getByRole('heading',{name:"Playback didn't start",exact:true})).toBeVisible();
 await expect(serversRow(page)).toBeVisible();
 up.add('https://vidlink.pro');
 await serversRow(page).getByRole('button',{name:/^Server 2\b/}).click();
 await lands(page,'vidlink');
});

test('the 45 second budget covers the automatic switches',async({page})=>{
 await frozenClock(page);
 // The first three servers never answer, so each one runs out its watchdog. The fourth is never asked for.
 const asked:string[]=[];
 for(const origin of ['https://framextv.cc','https://vidlink.pro','https://vixsrc.to'])
  await page.route(origin+'/**',()=>{asked.push(origin);});
 await page.route('https://vidsrc.to/**',route=>{asked.push('https://vidsrc.to');return route.fulfill({contentType:'text/html',body:PROVIDER_PAGE});});
 await page.goto('/#/movies/movie-157336/play');
 await lands(page,'framextv');
 await page.clock.runFor(15000);
 await lands(page,'vidlink');
 await page.clock.runFor(15000);
 await lands(page,'vixsrc');
 await page.clock.runFor(15000);
 await expect(page.getByRole('heading',{name:"Playback didn't start",exact:true})).toBeVisible();
 expect(asked.includes('https://vidsrc.to')).toBe(false);
});

test('opening Study while connecting stops the watchdog',async({page})=>{
 await frozenClock(page);
 await page.route('https://framextv.cc/**',()=>{});
 await page.goto('/#/movies/movie-157336/play');
 await lands(page,'framextv');
 await page.keyboard.press('Escape');
 await expect(page.locator('#study-view')).toBeVisible();
 await page.clock.runFor(20000);
 await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();
 await expect(page.getByRole('button',{name:'Resume stream'})).toBeVisible();
 await page.clock.runFor(20000);
 await expect(providerFrame(page)).toHaveCount(0);
 await expect(page).toHaveURL(/movie-157336\/play$/);
});

test('leaving the title while connecting leaves no switch behind',async({page})=>{
 await frozenClock(page);
 await page.route('https://framextv.cc/**',()=>{});
 const asked:string[]=[];page.on('request',request=>{if(request.url().includes('vidlink'))asked.push(request.url());});
 await page.goto('/#/movies/movie-157336/play');
 await lands(page,'framextv');
 await page.getByRole('link',{name:'Back to Interstellar',exact:true}).click();
 await expect(page.getByRole('button',{name:'Play movie',exact:true})).toBeVisible();
 await page.clock.runFor(20000);
 await expect(page).toHaveURL(/#\/movies\/movie-157336$/);
 await expect(providerFrame(page)).toHaveCount(0);
 expect(asked).toEqual([]);
});

test('switching episode while the first episode connects leaves no switch behind',async({page})=>{
 await frozenClock(page);
 // The first episode's FrameXTV never answers. Its watchdog must not follow the viewer to the next episode.
 await page.route(/framextv\.cc\/embed\/19885\/1\/1\?/,()=>{});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await lands(page,'framextv');
 await expect(page.locator('.movies-connecting')).toBeVisible();
 await page.clock.runFor(5000);
 await page.getByRole('link',{name:'Next episode',exact:true}).click();
 await expect(providerFrame(page)).toHaveAttribute('src',/\/19885\/1\/2\?/);
 await loadedFrame(page,/framextv/);
 await page.clock.runFor(20000);
 await expect(page.locator('.movies-failover')).toBeEmpty();
 await lands(page,'framextv');
 await expect(providerFrame(page)).toHaveAttribute('src',/\/19885\/1\/2\?/);
});

test('ready messages posted by the page itself do not count',async({page})=>{
 await frozenClock(page);
 await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:PROVIDER_PAGE}));
 await page.goto('/#/movies/movie-157336/play');
 await loadedFrame(page,/framextv/);
 // The page's own message reaches its listeners, as a real one would. The source check must refuse it.
 await page.evaluate(()=>new Promise<void>(resolve=>{window.addEventListener('message',event=>{if(event.data?.event==='frameXTV:ready')resolve();});window.postMessage({event:'frameXTV:ready'},'*');}));
 await page.clock.runFor(11000);
 await lands(page,'framextv');
 await page.clock.runFor(1000);
 await lands(page,'vidlink');
});

test('a missing episode shows Episode unavailable and no iframe',async({page})=>{
 await page.goto('/#/movies/tv-19885/season/9/episode/9/play');
 await expect(page.getByRole('heading',{name:'Episode unavailable',exact:true})).toBeVisible();
 await expect(page.getByText("This episode isn't in this season's list.",{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Choose another episode',exact:true})).toHaveAttribute('href','#/movies/tv-19885');
 await expect(page.locator('iframe')).toHaveCount(0);
});

test('a TV play route that names no episode shows Episode unavailable and asks no provider',async({page})=>{
 const asked:string[]=[];page.on('request',request=>{if(/framextv|vidlink|vixsrc|vidsrc/.test(new URL(request.url()).hostname))asked.push(request.url());});
 await page.goto('/#/movies/tv-19885/play');
 await expect(page.getByRole('heading',{name:'Episode unavailable',exact:true})).toBeVisible();
 await expect(page.getByText("This link doesn't name an episode.",{exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Choose an episode',exact:true})).toHaveAttribute('href','#/movies/tv-19885');
 await expect(page.locator('iframe')).toHaveCount(0);
 await expect(serversRow(page)).toHaveCount(0);
 await settle(page);
 expect(asked).toEqual([]);
});

test('an episode missing from a loaded season is unavailable, and its link goes to that season',async({page})=>{
 await page.route('**/api/movies?*',route=>route.fulfill({json:{title:seasonTitle(seasonOf(route.request().url()))}}));
 await page.goto('/#/movies/tv-90200/season/1/episode/9/play');
 await expect(page.getByRole('heading',{name:'Episode unavailable',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Choose another episode',exact:true})).toHaveAttribute('href','#/movies/tv-90200/season/1/episode/1');
 await expect(page.locator('iframe')).toHaveCount(0);
});

test('an episode whose season failed to load keeps the provider player',async({page})=>{
 await page.route('**/api/movies?*',route=>{if(seasonOf(route.request().url())===2)return route.fulfill({status:503,json:{error:'catalog_not_configured'}});return route.fulfill({json:{title:seasonTitle(1)}});});
 await page.goto('/#/movies/tv-90200');
 await expect(page.locator('section.movies-detail h1')).toHaveText('Pill Series');
 await page.evaluate(()=>{location.hash='#/movies/tv-90200/season/2/episode/1/play';});
 await lands(page,'framextv');
 await expect(providerFrame(page)).toHaveAttribute('src',/\/embed\/90200\/2\/1\?/);
});

test('an answer for another title is a failed load and shows its notice',async({page})=>{
 await page.route('**/api/movies?*',route=>route.fulfill({json:{title:seasonTitle(1,'tv-90999')}}));
 await page.goto('/#/movies/tv-90200');
 await expect(page.getByRole('heading',{name:'Title details unavailable',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Retry title',exact:true})).toBeVisible();
 await expect(page.getByText('Pill Series')).toHaveCount(0);
});

test('the Resumed pill waits for the first sign of life from the server',async({page})=>{
 await savedProgress(page,{'movie-157336':42},{'movie-157336':{duration:7200,updated:1000}});
 await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:PROVIDER_PAGE}));
 await frozenClock(page);
 await page.goto('/#/movies/movie-157336/play');
 await loadedFrame(page,/framextv/);
 const pill=page.locator('.movies-resume-pill');
 await expect(pill).toBeHidden();
 await (await loadedFrame(page,/framextv/)).evaluate(()=>parent.postMessage({event:'frameXTV:ready'},'*'));
 await expect(pill).toHaveText('Resumed at 0:42');
});

test('a server that cannot resume never shows the Resumed pill',async({page})=>{
 await savedProgress(page,{'movie-157336':42},{'movie-157336':{duration:7200,updated:1000}});
 await page.goto('/#/movies/movie-157336/play');
 await serversRow(page).getByRole('button',{name:/^Server 4\b/}).click();
 await lands(page,'vidsrc');
 await (await loadedFrame(page,/vidsrc/)).evaluate(()=>parent.postMessage({type:'PLAYER_EVENT',data:{event:'timeupdate',currentTime:50,duration:100}},'*'));
 await settle(page);
 await expect(page.locator('.movies-resume-pill')).toBeHidden();
});

test('a playback server that loads and never reports offers the next server 12 seconds after its frame loads',async({page})=>{
 await frozenClock(page);
 await page.goto('/#/movies/movie-157336/play');
 await serversRow(page).getByRole('button',{name:/^Server 2\b/}).click();
 await lands(page,'vidlink');
 await loadedFrame(page,/vidlink/);
 await expect(page.locator('.movies-connecting')).toBeHidden();
 const prompt=page.getByText('Taking a while? Try another server.',{exact:true});
 await page.clock.runFor(11000);
 await expect(prompt).toHaveCount(0);
 await page.clock.runFor(1000);
 await expect(prompt).toBeVisible();
 await expect(page.locator('.movies-connecting .movies-slow')).toHaveCount(0);
 await expect(page.locator('.movies-slow-row+.movies-servers')).toHaveCount(1);
});

test('a server that only reports playback offers the next server, and its button switches',async({page})=>{
 await frozenClock(page);
 await page.goto('/#/movies/movie-157336/play');
 await serversRow(page).getByRole('button',{name:/^Server 2\b/}).click();
 await lands(page,'vidlink');
 await loadedFrame(page,/vidlink/);
 await page.clock.runFor(12000);
 const row=page.locator('.movies-slow-row');
 await expect(row.getByText('Taking a while? Try another server.',{exact:true})).toBeVisible();
 await row.getByRole('button',{name:'Try Server 3',exact:true}).click();
 await lands(page,'vixsrc');
});

test('a list change on the playing title keeps the slow prompt of its stream',async({page})=>{
 await frozenClock(page);
 await page.goto('/#/movies/movie-157336/play');
 await serversRow(page).getByRole('button',{name:/^Server 2\b/}).click();
 await lands(page,'vidlink');
 await loadedFrame(page,/vidlink/);
 await page.clock.runFor(12000);
 const prompt=page.getByText('Taking a while? Try another server.',{exact:true});
 await expect(prompt).toBeVisible();
 await page.getByRole('button',{name:'Add to my list',exact:true}).click();
 await expect(page.getByRole('button',{name:'In my list',exact:true})).toBeVisible();
 await lands(page,'vidlink');
 await expect(prompt).toHaveCount(1);
});

test('a server that cannot report is uncovered once its frame loads, and gets no slow prompt',async({page})=>{
 await frozenClock(page);
 await page.goto('/#/movies/movie-157336/play');
 await serversRow(page).getByRole('button',{name:/^Server 4\b/}).click();
 await lands(page,'vidsrc');
 await loadedFrame(page,/vidsrc/);
 await expect(page.locator('.movies-connecting')).toBeHidden();
 await page.locator('.movies-screen').scrollIntoViewIfNeeded();
 const hit=await page.evaluate(()=>{const box=document.querySelector('.movies-screen')!.getBoundingClientRect();const el=document.elementFromPoint(box.left+box.width/2,box.top+box.height/2);return el instanceof HTMLIFrameElement?el.dataset.provider:'';});
 expect(hit).toBe('vidsrc');
 await expect(serversRow(page).getByRole('button',{name:/^Server 4\b/})).toHaveAttribute('data-state','idle');
 await page.clock.runFor(20000);
 await expect(page.getByText('Taking a while? Try another server.',{exact:true})).toHaveCount(0);
 await lands(page,'vidsrc');
});

test('a licensed episode in a season that is still loading plays from its file through a fullscreen rollover',async({page})=>{
 await frozenClock(page);
 await page.route('**/movies/licenses.json',route=>route.fulfill({json:[licensedOpener]}));
 await page.route('**/movies/media/**',route=>route.fulfill({contentType:'video/mp4',body:''}));
 const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 let asked=false;
 await page.route('**/api/movies?*',async route=>{
  if(seasonOf(route.request().url())===2){asked=true;await held;}
  return route.fulfill({json:{title:seasonTitle(seasonOf(route.request().url()))}});
 });
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/#/movies/tv-90200/season/1/episode/2/play');
 await loadedFrame(page,/framextv/);
 await page.getByRole('button',{name:'Full screen',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>document.fullscreenElement?.className)).toBe('movies-screen');
 await (await loadedFrame(page,/framextv/)).evaluate(()=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:100,duration:100},'*'));
 await expect(page.getByRole('dialog',{name:'Up next'})).toContainText('S2 · E1');
 const mark=requests.length;
 await page.getByRole('button',{name:'Play now',exact:true}).click();
 await expect.poll(()=>asked).toBe(true);
 await expect(page.locator('.movies-media video')).toHaveAttribute('src',/\/movies\/media\/second-season-opener\.mp4$/);
 await expect(providerFrame(page)).toHaveCount(0);
 await settle(page);
 expect(thirdParty(page,requests.slice(mark))).toEqual([]);
 release();
 await expect(page.locator('.movies-player>h2')).toHaveText('S2 · E1 — Second Season Opener');
 await expect(providerFrame(page)).toHaveCount(0);
 expect(thirdParty(page,requests.slice(mark))).toEqual([]);
});

test('a licensed episode whose season failed to load plays from its file, and no provider is asked',async({page})=>{
 await page.route('**/movies/licenses.json',route=>route.fulfill({json:[licensedOpener]}));
 await page.route('**/movies/media/**',route=>route.fulfill({contentType:'video/mp4',body:''}));
 await page.route('**/api/movies?*',route=>{if(seasonOf(route.request().url())===2)return route.fulfill({status:503,json:{error:'catalog_not_configured'}});return route.fulfill({json:{title:seasonTitle(1)}});});
 const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
 await page.goto('/#/movies/tv-90200');
 await expect(page.locator('section.movies-detail h1')).toHaveText('Pill Series');
 const mark=requests.length;
 await page.evaluate(()=>{location.hash='#/movies/tv-90200/season/2/episode/1/play';});
 await expect(page.locator('.movies-media video')).toHaveAttribute('src',/\/movies\/media\/second-season-opener\.mp4$/);
 await expect(providerFrame(page)).toHaveCount(0);
 await settle(page);
 expect(thirdParty(page,requests.slice(mark))).toEqual([]);
});

test('an episode that ends on FrameXTV opens Up next for the next episode',async({page})=>{
 await frozenClock(page);
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 const frame=await loadedFrame(page,/framextv/);
 await frame.evaluate(()=>parent.postMessage({event:'frameXTV:ended'},'*'));
 await expect(page.locator('.movies-next')).toBeVisible();
 await expect(page.getByRole('dialog',{name:'Up next'})).toContainText('Up next: S1 · E2 — The Blind Banker');
});

test('an automatic failover keeps the episode drawer open',async({page})=>{
 await frozenClock(page);
 await page.route('https://framextv.cc/**',()=>{});
 await page.goto('/#/movies/tv-19885/season/1/episode/1/play');
 await lands(page,'framextv');
 await page.getByRole('button',{name:'S1 · E1',exact:true}).click();
 const drawer=page.locator('dialog.movies-drawer');await expect(page.getByRole('dialog',{name:'Select episode'})).toBeVisible();
 await page.clock.runFor(15000);
 await lands(page,'vidlink');
 await expect(drawer).toHaveJSProperty('open',true);await expect(page.getByRole('dialog',{name:'Select episode'})).toBeVisible();
});

test('a licensed episode reached cold plays from its file once its season answers, and no provider is asked while it waits',async({page})=>{
 await page.route('**/movies/licenses.json',route=>route.fulfill({json:[licensedOpener]}));
 await page.route('**/movies/media/**',route=>route.fulfill({contentType:'video/mp4',body:''}));
 const requests:string[]=[];page.on('request',request=>requests.push(request.url()));
 let release!:()=>void;const held=new Promise<void>(resolve=>{release=resolve;});
 let asked=false;
 await page.route('**/api/movies?*',async route=>{
  if(seasonOf(route.request().url())===2){asked=true;await held;}
  return route.fulfill({json:{title:seasonTitle(seasonOf(route.request().url()))}});
 });
 await page.goto('/#/movies/tv-90200/season/2/episode/1/play');
 await expect.poll(()=>asked).toBe(true);
 await settle(page);
 expect(thirdParty(page,requests)).toEqual([]);
 await expect(providerFrame(page)).toHaveCount(0);
 release();
 await expect(page.locator('.movies-media video')).toHaveAttribute('src',/\/movies\/media\/second-season-opener\.mp4$/);
 await settle(page);
 expect(thirdParty(page,requests)).toEqual([]);
 await expect(providerFrame(page)).toHaveCount(0);
});

// A manual pick whose frame answers only after its watchdog has failed it. The late frame's playback revives the pick.
test('a manual pick that fails on its watchdog and then plays is remembered and its note clears',async({page})=>{
 await frozenClock(page);
 const late:{route?:Route}={};
 await page.route('https://vidlink.pro/**',route=>{late.route=route;});
 await page.goto('/#/movies/movie-157336/play');
 await serversRow(page).getByRole('button',{name:/^Server 2\b/}).click();
 await lands(page,'vidlink');
 await page.clock.runFor(15000);
 await expect(page.locator('.movies-failover')).toHaveText("Server 2 didn't start. Try Server 3.");
 await late.route!.fulfill({contentType:'text/html',body:"<!doctype html><title>Provider fixture</title><script>parent.postMessage({type:'PLAYER_EVENT',data:{event:'timeupdate',currentTime:5,duration:100}},'*')</script>"});
 await expect(page.locator('.movies-failover')).toBeEmpty();
 await expect(serversRow(page).getByRole('button',{name:/^Server 2\b/})).toHaveAttribute('data-state','working');
 await expect.poll(async()=>(await stored(page)).provider).toBe('vidlink');
 await lands(page,'vidlink');
});

// A stream that played and then lost its frame to a blocked frame-src says it stopped, not that it never started.
test('a server that stopped after playing says so in the failover note, and the next server starts',async({page})=>{
 await frozenClock(page);
 await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:PROVIDER_PAGE+FRAMEXTV_READY}));
 await page.goto('/#/movies/movie-157336/play');
 await lands(page,'framextv');
 await (await loadedFrame(page,/framextv/)).evaluate(()=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:5,duration:100},'*'));
 await expect(serversRow(page).getByRole('button',{name:/^Server 1\b/})).toHaveAttribute('data-state','working');
 await page.evaluate(()=>{const blocked=document.createElement('iframe');blocked.src='https://unapproved-provider.invalid/blocked';document.body.append(blocked);});
 await expect(page.locator('.movies-failover')).toHaveText('Server 1 stopped. Trying Server 2…');
 await lands(page,'vidlink');
});

test('a manual pick that stopped after playing says so, names the next server and stays on screen',async({page})=>{
 await frozenClock(page);
 await page.goto('/#/movies/movie-157336/play');
 await serversRow(page).getByRole('button',{name:/^Server 2\b/}).click();
 await lands(page,'vidlink');
 await (await loadedFrame(page,/vidlink/)).evaluate(()=>parent.postMessage({type:'PLAYER_EVENT',data:{event:'timeupdate',currentTime:5,duration:100}},'*'));
 await expect(serversRow(page).getByRole('button',{name:/^Server 2\b/})).toHaveAttribute('data-state','working');
 await page.evaluate(()=>{const blocked=document.createElement('iframe');blocked.src='https://unapproved-provider.invalid/blocked';document.body.append(blocked);});
 await expect(page.locator('.movies-failover')).toHaveText('Server 2 stopped. Try Server 3.');
 await lands(page,'vidlink');
});

// The frame loads with no ready message, so FrameXTV's 12 second watchdog is the one under test. A frame at another provider's origin
// sends a ready, a NaN time and a valid time. None of it may count as FrameXTV's, save progress or clear the watchdog.
test('messages from an unapproved origin cannot mark FrameXTV working, save progress or clear its watchdog',async({page})=>{
 await frozenClock(page);
 await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:PROVIDER_PAGE}));
 // The spoof frame is vixsrc.to: an approved frame origin for another provider, so the source and provider checks run. provider.test.ts covers the origin check.
 await page.route('https://vixsrc.to/spoof',route=>route.fulfill({contentType:'text/html',body:"<!doctype html><title>Spoof</title><script>parent.postMessage({event:'frameXTV:ready'},'*');parent.postMessage({event:'frameXTV:timeupdate',currentTime:NaN},'*');parent.postMessage({event:'frameXTV:timeupdate',currentTime:42,duration:100},'*');</script>"}));
 await page.goto('/#/movies/movie-157336/play');
 await loadedFrame(page,/framextv/);
 await page.evaluate(()=>{const spoof=document.createElement('iframe');spoof.src='https://vixsrc.to/spoof';document.body.append(spoof);});
 await loadedFrame(page,/vixsrc\.to\/spoof/);
 await expect(serversRow(page).getByRole('button',{name:/^Server 1\b/})).toHaveAttribute('data-state','trying');
 await page.clock.runFor(11000);
 await lands(page,'framextv');
 await page.clock.runFor(1000);
 await lands(page,'vidlink');
 expect((await stored(page)).progress['movie-157336']).toBeUndefined();
});

// Only a frame-src violation fails a live attempt. An image blocked by the same policy leaves the stream alone.
test('an image blocked by the CSP during playback does not fail the stream over',async({page})=>{
 await frozenClock(page);
 await page.goto('/#/movies/movie-157336/play');
 await serversRow(page).getByRole('button',{name:/^Server 2\b/}).click();
 await lands(page,'vidlink');
 await (await loadedFrame(page,/vidlink/)).evaluate(()=>parent.postMessage({type:'PLAYER_EVENT',data:{event:'timeupdate',currentTime:5,duration:100}},'*'));
 await expect(serversRow(page).getByRole('button',{name:/^Server 2\b/})).toHaveAttribute('data-state','working');
 await page.evaluate(()=>{const w=window as unknown as {csp:string[]};w.csp=[];document.addEventListener('securitypolicyviolation',event=>{w.csp.push(event.effectiveDirective);});const image=new Image();image.src='https://unapproved-provider.invalid/blocked.png';document.body.append(image);});
 // The page's own listener is registered after the player's, so once the violation is on the window, the player has handled it too.
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {csp:string[]}).csp)).toContain('img-src');
 await expect(page.locator('.movies-failover')).toBeEmpty();
 await lands(page,'vidlink');
 await expect(serversRow(page).getByRole('button',{name:/^Server 2\b/})).toHaveAttribute('data-state','working');
 await expect(page.locator('.movies-connecting')).toBeHidden();
});

// A season the API answers without episodes is not judged missing. Its episode keeps the provider player.
test('an episode whose season comes back without episodes keeps the provider player',async({page})=>{
 await page.route('**/api/movies?*',route=>route.fulfill({json:{title:seasonTitle(1)}}));
 await page.goto('/#/movies/tv-90200');
 await expect(page.locator('section.movies-detail h1')).toHaveText('Pill Series');
 await page.evaluate(()=>{location.hash='#/movies/tv-90200/season/2/episode/1/play';});
 await lands(page,'framextv');
 await expect(page.getByRole('heading',{name:'Episode unavailable',exact:true})).toHaveCount(0);
});

// A manual pick whose frame answers only after its watchdog failed it. Its own ready message revives it, and its failover line goes at once.
test('a manual pick that fails on its watchdog and then reports ready clears its failover line at once',async({page})=>{
 await frozenClock(page);
 const late:{route?:Route}={};
 await page.route('https://framextv.cc/**',route=>{late.route=route;});
 await page.goto('/#/movies/movie-157336/play');
 await serversRow(page).getByRole('button',{name:/^Server 2\b/}).click();
 await lands(page,'vidlink');
 await serversRow(page).getByRole('button',{name:/^Server 1\b/}).click();
 await lands(page,'framextv');
 await page.clock.runFor(15000);
 await expect(page.locator('.movies-failover')).toHaveText("Server 1 didn't start. Try Server 2.");
 await late.route!.fulfill({contentType:'text/html',body:"<!doctype html><title>Provider fixture</title><script>parent.postMessage({event:'frameXTV:ready'},'*')</script>"});
 await expect(page.locator('.movies-failover')).toBeEmpty();
 await expect(serversRow(page).getByRole('button',{name:/^Server 1\b/})).toHaveAttribute('data-state','working');
});

// A bare title answer whose default season is empty. The season says its episodes are not available, and Retry loads that season.
test('a title whose default season answers empty offers Retry episodes, and Retry loads that season',async({page})=>{
 await page.route('**/api/movies?*',route=>{
  const url=new URL(route.request().url());
  if(url.searchParams.has('season'))return route.fulfill({json:{title:seasonTitle(Number(url.searchParams.get('season')))}});
  return route.fulfill({json:{title:seasonTitle(2)}});
 });
 await page.goto('/#/movies/tv-90200');
 await expect(page.locator('section.movies-detail h1')).toHaveText('Pill Series');
 await expect(page.getByText("Episodes for this season aren't available right now.",{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Retry episodes',exact:true}).click();
 await expect(page.getByRole('link',{name:'Play Pilot',exact:true})).toBeVisible();
 await expect(page.getByText("Episodes for this season aren't available right now.",{exact:true})).toHaveCount(0);
});
