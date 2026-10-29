import {test,expect} from '../fixtures';
import {readFileSync} from 'node:fs';
// Network fixtures isolate browser security tests from provider uptime and workspace egress restrictions.
test.beforeEach(async({page})=>{
 await page.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
 await page.route('https://framextv.cc/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
 await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
});

for(const width of [320,390,650,768,1280,1920])test(`launch poster cards have no duplicate sources at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:800});await page.goto('/');
 const sources=await page.locator('.movies-launch img').evaluateAll(images=>images.map(image=>(image as HTMLImageElement).src));
 expect(sources.length).toBeGreaterThan(0);
 expect(new Set(sources).size).toBe(sources.length);
});

test('offline launch skips remote posters and retains a readable coloured fallback',async({page})=>{
 await page.addInitScript(()=>Object.defineProperty(navigator,'onLine',{get:()=>false}));
 const remote:string[]=[];page.on('request',request=>{if(request.url().startsWith('https://image.tmdb.org/'))remote.push(request.url());});
 await page.goto('/');const launch=page.locator('.movies-launch');
 await expect(launch).toHaveText('Movies & TV');await expect(launch.locator('img')).toHaveCount(0);
 expect(remote).toEqual([]);expect(await launch.evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('gradient');
 await expect(launch.getByRole('heading')).toHaveCSS('color','rgb(255, 255, 255)');
});

test('failed launch posters are hidden over the coloured fallback',async({page})=>{
 await page.route('https://image.tmdb.org/**',route=>route.abort());await page.goto('/');
 const launch=page.locator('.movies-launch');
 await expect.poll(()=>launch.locator('img').evaluateAll(images=>images.every(image=>(image as HTMLImageElement).hidden))).toBe(true);
 expect(await launch.evaluate(e=>getComputedStyle(e).backgroundImage)).toContain('gradient');
 await expect(launch.getByRole('heading')).toBeVisible();
});

test('full-width launch, local discovery, episodes, enabled playback, back and Study Mode',async({page})=>{
 await page.goto('/');
 const games=page.locator('.game-card');await expect(games).toHaveCount(21);
 const launch=page.getByRole('link',{name:'Movies & TV',exact:true});
 await expect(launch).toHaveAttribute('href','#/movies');
 await expect(launch).toHaveText('Movies & TV');
 await expect(launch.locator('[aria-hidden="true"] img')).toHaveCount(8);
 await expect(launch.locator('a,button')).toHaveCount(0);
 await launch.focus();await expect(launch).toBeFocused();
 expect(await launch.evaluate(e=>getComputedStyle(e).outlineStyle)).toBe('solid');
 const [grid,card]=await Promise.all([page.locator('.game-grid').boundingBox(),launch.boundingBox()]);expect(card!.width).toBeGreaterThan(grid!.width-50);
 await expect(launch.locator('img').first()).toHaveAttribute('src',/^https:\/\/image\.tmdb\.org\/t\/p\/w185\//);
 await launch.press('Enter');await expect(page.getByRole('heading',{name:'Interstellar',exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/movies-home.png',fullPage:true});
 await expect(page.locator('.movies-poster img').first()).toHaveAttribute('src',/^https:\/\/image\.tmdb\.org\/t\/p\//);
 await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('sherlock');
 await expect(page.locator('.movies-results-grid .movies-poster')).toHaveCount(1);
 await page.getByRole('link',{name:'Details for Sherlock'}).click();
 await page.getByRole('button',{name:/^Season 2\b/}).click();await expect(page.getByRole('heading',{name:'The Reichenbach Fall'})).toBeVisible();
 await page.getByRole('link',{name:'Play The Reichenbach Fall'}).click();
 await expect(page.locator('.movies-provider-frame')).toBeVisible();await expect(page.locator('video')).toHaveCount(0);
 await page.getByRole('link',{name:'Back to Sherlock'}).click();
 await page.getByRole('button',{name:'Add to my list'}).click();
 await page.locator('.movies-top').getByRole('button',{name:'My list',exact:true}).click();await expect(page.locator('.movies-results-grid .movies-poster')).toHaveCount(1);
 await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
 await page.evaluate(()=>scrollTo(0,0));await page.mouse.wheel(0,500);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
 // Study retains the movies route and returns to the same page.
 await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();
 await expect(page.locator('.movies-view')).toBeVisible();
 await page.getByRole('link',{name:'Games',exact:true}).click();await expect(games).toHaveCount(21);await expect(launch).toBeFocused();
});

for(const width of [320,390,768,1366])test(`responsive allowlisted provider boundary at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('/#/movies');await expect(page.locator('#movies-search')).toBeVisible();
 await page.locator('#movies-search').fill('arrival');await expect(page.locator('.movies-results-grid .movies-poster')).toHaveCount(1);await page.getByRole('link',{name:'Details for Arrival'}).click();
 await expect(page.getByRole('button',{name:'Play movie'})).toBeEnabled();
 await page.getByRole('button',{name:'Play movie'}).click();
 await expect(page.locator('.movies-provider-frame')).toBeVisible();
 expect(requests.filter(url=>![new URL(page.url()).origin,'https://image.tmdb.org','https://framextv.cc'].includes(new URL(url).origin))).toEqual([]);
 const audit=await page.evaluate(()=>({frames:document.querySelectorAll('iframe,embed,object').length,hints:document.querySelectorAll('link[rel=preconnect],link[rel=dns-prefetch],link[rel=prefetch]').length,overflow:(document.querySelector('.movies-view')!.scrollWidth>document.querySelector('.movies-view')!.clientWidth),resources:performance.getEntriesByType('resource').map(r=>r.name)}));
 expect(audit.frames).toBe(1);expect(audit.hints).toBe(0);expect(audit.overflow).toBe(false);
 expect(audit.resources.every(url=>[new URL(page.url()).origin,'https://image.tmdb.org','https://framextv.cc'].includes(new URL(url).origin))).toBe(true);
 await page.screenshot({path:`test-results/movies-${width}.png`,fullPage:true});
});

test('blocked storage, catalog failure, invalid deep links and malicious metadata fail safely',async({page})=>{
 await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw new Error('Blocked');};});
 await page.route('**/movies/catalog.json',route=>route.fulfill({status:503,body:'unavailable'}));
 await page.goto('/#/movies');await expect(page.getByRole('heading',{name:'The collection is unavailable'})).toBeVisible();
 await page.unroute('**/movies/catalog.json');await page.getByRole('button',{name:'Try again'}).click();await expect(page.locator('#movies-search')).toBeVisible();
 await expect(page.locator('.movies-storage')).toContainText('unavailable');
 await page.goto('/#/movies/movie-does-not-exist');await expect(page.getByRole('heading',{name:'Title not found'})).toBeVisible();
});

test('CSP blocks unapproved frames, media, images, scripts and connections',async({page})=>{
 await page.goto('/#/movies');await expect(page.locator('#movies-search')).toBeVisible();
 const responses:string[]=[];page.on('response',r=>{if(![new URL(page.url()).origin,'https://image.tmdb.org','https://framextv.cc'].includes(new URL(r.url()).origin))responses.push(r.url());});
 const directives=await page.evaluate(async()=>{
  const violations:string[]=[];document.addEventListener('securitypolicyviolation',e=>violations.push(e.effectiveDirective));
  const host='https://unapproved-provider.invalid';
  const frame=document.createElement('iframe');frame.src=host+'/blocked';document.body.append(frame);
  const media=document.createElement('video');media.src=host+'/blocked.mp4';document.body.append(media);media.load();
  const image=new Image();image.src=host+'/blocked.png';
  const script=document.createElement('script');script.src=host+'/blocked.js';document.body.append(script);
  await fetch(host+'/blocked').catch(()=>{});
  await new Promise(r=>setTimeout(r,100));return violations;
 });
 for(const name of ['frame-src','media-src','img-src','script-src-elem','connect-src'])expect(directives).toContain(name);
 // Chromium reports CSP-blocked attempts as requestfailed; they must never receive a response.
 expect(responses).toEqual([]);await expect(page.locator('iframe')).toHaveCount(1);
});

test('verified local media uses native controls and stores progress only in its own namespace',async({page})=>{
 await page.route('**/movies/licenses.json',route=>route.fulfill({json:[{key:'movie-329865',path:'movies/media/fixture.webm',license:'CC0-1.0',credit:'QCC generated test fixture',evidence:'docs/rights/fixture.md',reviewed:true,territory:'Worldwide',expires:'2099-01-01'}]}));
 await page.route('**/movies/media/fixture.webm',route=>route.fulfill({contentType:'video/webm',body:readFileSync('tests/fixtures/movies.webm')}));
 await page.goto('/#/movies/movie-329865/play');const video=page.locator('video');await expect(video).toBeVisible();
 await video.evaluate(async(v:HTMLVideoElement)=>{await v.play();});await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.currentTime)).toBeGreaterThan(.1);
 await page.keyboard.press('Escape');await expect.poll(()=>video.evaluate((v:HTMLVideoElement)=>v.paused)).toBe(true);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1')||'{}'));
 expect(saved.progress['movie-329865']).toBeGreaterThan(0);
 // The native player's own duration is saved beside the position, for the Continue watching bar.
 expect(saved.meta['movie-329865'].duration).toBe(await video.evaluate((v:HTMLVideoElement)=>v.duration));
});


test('episode return restores scroll and focus; keyboard stays inside the movie section',async({page})=>{
 await page.setViewportSize({width:390,height:700});await page.goto('/#/movies/tv-68595');
 const cities=page.getByRole('link',{name:'Play Cities'});await cities.scrollIntoViewIfNeeded();
 const before=await page.locator('.movies-view').evaluate(e=>e.scrollTop);await cities.click();
 await page.getByRole('link',{name:'Back to Planet Earth II'}).click();await expect(cities).toBeFocused();
 expect(Math.abs(await page.locator('.movies-view').evaluate(e=>e.scrollTop)-before)).toBeLessThan(5);
 await expect(page.locator('.topbar')).toHaveJSProperty('inert',true);
 await page.getByRole('link',{name:'Games',exact:true}).click();await expect(page.locator('.topbar')).toHaveJSProperty('inert',false);
});

test('game grid offset survives entering and leaving movies',async({page})=>{
 await page.goto('/');await page.locator('.movies-launch').waitFor();await page.evaluate(()=>scrollTo(0,130));
 const before=await page.evaluate(()=>scrollY);await page.locator('.movies-launch').evaluate((e:HTMLAnchorElement)=>e.click());
 await expect(page.locator('#movies-search')).toBeVisible();await page.getByRole('link',{name:'Games',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(before);
});

test('Home clears filters and search finds titles across TV/movie categories',async({page})=>{
 await page.goto('/#/movies');await page.locator('#movies-search').fill('arrival');
 await page.locator('.movies-top').getByRole('button',{name:'Home',exact:true}).click();
 await expect(page.locator('.movies-hero')).toBeVisible();await expect(page.locator('#movies-search')).toHaveValue('');
 await page.locator('.movies-top').getByRole('button',{name:'TV Shows',exact:true}).click();
 await page.locator('.movies-search-toggle').click();await expect(page.locator('#movies-search')).toBeFocused();
 await page.locator('#movies-search').fill('arrival');await expect(page.locator('.movies-results-grid .movies-poster')).toHaveCount(1);
});

test('a featured licensed TV show plays its first included episode',async({page})=>{
 const catalog=JSON.parse(readFileSync('public/movies/catalog.json','utf8'));catalog.titles.sort((a:{kind:string},b:{kind:string})=>Number(b.kind==='tv')-Number(a.kind==='tv'));
 await page.route('**/movies/catalog.json',route=>route.fulfill({json:catalog}));
 await page.route('**/movies/licenses.json',route=>route.fulfill({json:[{key:'tv-19885:s1:e1',path:'movies/media/fixture.webm',license:'CC0-1.0',credit:'QCC generated test fixture',evidence:'docs/rights/fixture.md',reviewed:true,territory:'Worldwide',expires:'2099-01-01'}]}));
 await page.route('**/movies/media/fixture.webm',route=>route.fulfill({contentType:'video/webm',body:readFileSync('tests/fixtures/movies.webm')}));
 await page.goto('/#/movies');const play=page.locator('.movies-hero').getByRole('button',{name:'Play',exact:true});await expect(play).toBeEnabled();await play.click();
 await expect(page).toHaveURL(/tv-19885\/season\/1\/episode\/1\/play$/);await expect(page.locator('video')).toBeVisible();
});


test('provider playback is enabled and sandboxed, and Study unloads it',async({page})=>{
 await page.goto('/#/movies/movie-157336/play');const frame=page.locator('.movies-provider-frame');await expect(frame).toBeVisible();
 await expect(frame).toHaveAttribute('sandbox','allow-scripts allow-same-origin');await expect(frame).toHaveAttribute('referrerpolicy','no-referrer');
 expect(await frame.getAttribute('allow')).toContain("camera 'none'");expect(await frame.getAttribute('src')).toContain('/embed/157336?autoplay=1');
 await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();await expect(frame).toHaveCount(0);
 await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();await page.getByRole('button',{name:'Resume stream'}).click();await expect(frame).toBeVisible();
});

test('full-catalog search, episode metadata and playback are on demand',async({page})=>{
 const urls:string[]=[];page.on('request',request=>urls.push(request.url()));
 await page.route('**/api/movies?*',async route=>{
  const params=new URL(route.request().url()).searchParams;
  if(params.has('id')){
   const season=Number(params.get('season')||1);
   const episodes=season===2?[{number:1,name:'The Long Crossing',overview:'A second-season episode.'}]:[{number:1,name:'First Contact',overview:'A first-season episode.'}];
   return route.fulfill({json:{title:{id:'tv-778899',kind:'tv',name:'Remote Expedition',year:2024,genres:['Adventure','Drama'],overview:'A series returned from the full catalog.',poster:'https://image.tmdb.org/t/p/w500/remote.jpg',backdrop:'https://image.tmdb.org/t/p/w1280/remote-backdrop.jpg',seasons:[{number:1,name:'Season 1',episodes:season===1?episodes:[]},{number:2,name:'Season 2',episodes:season===2?episodes:[]}]}}});
  }
  return route.fulfill({json:{titles:[{id:'tv-778899',kind:'tv',name:'Remote Expedition',year:2024,genres:['Adventure'],overview:'A searchable series outside the starter snapshot.',poster:'https://image.tmdb.org/t/p/w500/remote.jpg',seasons:[]}],page:1,totalPages:1,totalResults:1}});
 });
 await page.goto('/#/movies');await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('remote expedition');
 await expect(page.getByRole('link',{name:'Details for Remote Expedition'})).toBeVisible();
 expect(urls.some(url=>url.includes('/api/movies?')&&url.includes('remote+expedition'))).toBe(true);
 expect(urls.some(url=>url.includes('framextv'))).toBe(false);
 await page.getByRole('link',{name:'Details for Remote Expedition'}).click();
 await expect(page.getByRole('heading',{name:'Remote Expedition'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Play First Contact'})).toBeVisible();
 await page.getByRole('button',{name:/^Season 2\b/}).click();
 await expect(page.getByRole('link',{name:'Play The Long Crossing'})).toBeVisible();
 await page.getByRole('link',{name:'Play The Long Crossing'}).click();
 await expect(page.locator('.movies-provider-frame')).toHaveAttribute('src',/\/embed\/778899\/2\/1/);
});

test('catalog search is paginated and remains isolated from the playback provider',async({page})=>{
 await page.route('**/api/movies?*',route=>{
  const params=new URL(route.request().url()).searchParams;
  const title=params.get('page')==='2'?'Second Page Feature':'First Page Feature';
  return route.fulfill({json:{titles:[{id:'movie-7788',kind:'movie',name:title,year:2023,genres:['Drama'],overview:'A full catalog result.',poster:'https://image.tmdb.org/t/p/w500/result.jpg',seasons:[]}],page:Number(params.get('page')||1),totalPages:2,totalResults:40}});
 });
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('/#/movies');await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('feature');
 await expect(page.getByRole('link',{name:'Details for First Page Feature'})).toBeVisible();
 await page.getByRole('button',{name:'Next',exact:true}).click();
 await expect(page.getByRole('link',{name:'Details for Second Page Feature'})).toBeVisible();
 expect(requests.filter(url=>url.includes('framextv'))).toEqual([]);
});


test('external player cannot read the parent document, open popups or navigate the top page',async({page})=>{
 await page.goto('/#/movies/movie-157336/play');const iframe=page.frameLocator('.movies-provider-frame');await expect(iframe.getByRole('button',{name:'Play stream'})).toBeVisible();
 const result=await iframe.locator('body').evaluate(()=>{let parentBlocked=false,topBlocked=false;try{void parent.document.body;}catch{parentBlocked=true;}try{top!.location.href='https://unapproved-provider.invalid';}catch{topBlocked=true;}const popup=window.open('about:blank');const policy=(document as any).permissionsPolicy??(document as any).featurePolicy;return {parentBlocked,topBlocked,popupBlocked:popup===null,cameraAllowed:policy?.allowsFeature('camera')};});
 expect(result).toMatchObject({parentBlocked:true,topBlocked:true,popupBlocked:true});
 expect(await page.locator('.movies-provider-frame').getAttribute('allow')).toContain("camera 'none'");
 if(result.cameraAllowed!==undefined)expect(result.cameraAllowed).toBe(false);
 await expect(page).toHaveURL(/#\/movies\/movie-157336\/play$/);
});


test('external progress is local, rejects other senders and resumes through documented controls',async({page})=>{
 await page.goto('/#/movies/movie-157336/play');const frame=page.frameLocator('.movies-provider-frame');await expect(frame.getByRole('button',{name:'Play stream'})).toBeVisible();
 await page.evaluate(()=>window.postMessage({event:'frameXTV:timeupdate',currentTime:999},location.origin));
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1')||'{}').progress['movie-157336'])).toBeUndefined();
 const origin=new URL(page.url()).origin;await frame.locator('body').evaluate((_,origin)=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:42},origin),origin);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('qcc:movies:v1')||'{}').progress['movie-157336'])).toBe(42);
 await page.keyboard.press('Escape');await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();await page.getByRole('button',{name:'Resume stream'}).click();await expect(frame.getByRole('button',{name:'Play stream'})).toBeVisible();
 expect(await page.locator('.movies-provider-frame').getAttribute('src')).toContain('t=42');
});


test('unavailable backdrops fall back to the actual title poster',async({page})=>{
 await page.route('**/pbrkL804c8yAv3zBZR4QPEafpAR.jpg',route=>route.fulfill({status:404,body:'Unavailable'}));
 await page.goto('/#/movies');
 await expect(page.locator('.movies-poster[data-title="movie-157336"] img').first()).toHaveAttribute('src','https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6MxlNBvIx.jpg');
});
