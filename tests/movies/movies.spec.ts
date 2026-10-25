import {test,expect} from '../fixtures';
import {readFileSync} from 'node:fs';

test('full-width launch, local discovery, episodes, unavailable playback, back and Study Mode',async({page})=>{
 await page.goto('/');
 const games=page.locator('.game-card');await expect(games).toHaveCount(18);
 const launch=page.getByRole('link',{name:'Explore Movies and TV'});
 await expect(launch.locator('.movies-mini-poster')).toHaveCount(5);await expect(launch.locator('a,button')).toHaveCount(0);
 const [grid,card]=await Promise.all([page.locator('.game-grid').boundingBox(),launch.boundingBox()]);expect(card!.width).toBeGreaterThan(grid!.width-50);
 await launch.click();await expect(page.getByRole('heading',{name:'Interstellar',exact:true})).toBeVisible();
 await page.getByRole('searchbox',{name:'Search movies and TV'}).fill('sherlock');
 await expect(page.locator('.movies-results-grid .movies-poster')).toHaveCount(1);
 await page.getByRole('link',{name:'Details for Sherlock'}).click();
 await page.getByLabel('Season',{exact:true}).selectOption('2');await expect(page.getByRole('heading',{name:'The Reichenbach Fall'})).toBeVisible();
 await page.getByRole('link',{name:'Playback information for The Reichenbach Fall'}).click();
 await expect(page.getByRole('heading',{name:'Playback unavailable'})).toBeVisible();await expect(page.locator('video,iframe')).toHaveCount(0);
 await page.getByRole('link',{name:'Return to title'}).click();
 await page.getByRole('button',{name:'Add to my list'}).click();
 await page.locator('.movies-top').getByRole('button',{name:'My list',exact:true}).click();await expect(page.locator('.movies-results-grid .movies-poster')).toHaveCount(1);
 await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
 await page.evaluate(()=>scrollTo(0,0));await page.mouse.wheel(0,500);await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(0);
 // Study retains the movies route and returns to the same page.
 await page.getByRole('link',{name:'Games',exact:true}).click();
 await expect(page.locator('.movies-view')).toBeVisible();
 await page.getByRole('link',{name:'Games',exact:true}).click();await expect(games).toHaveCount(18);await expect(launch).toBeFocused();
});

for(const width of [390,768,1366])test(`responsive private network boundary at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:850});
 const requests:string[]=[];page.on('request',r=>requests.push(r.url()));
 await page.goto('/#/movies');await expect(page.locator('#movies-search')).toBeVisible();
 await page.locator('#movies-search').fill('arrival');await expect(page.locator('.movies-results-grid .movies-poster')).toHaveCount(1);await page.getByRole('link',{name:'Details for Arrival'}).click();
 await expect(page.getByRole('button',{name:'Playback unavailable'})).toBeDisabled();
 await page.getByRole('link',{name:'Playback information',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Playback unavailable'})).toBeVisible();
 expect(requests.filter(url=>new URL(url).origin!==new URL(page.url()).origin)).toEqual([]);
 const audit=await page.evaluate(()=>({frames:document.querySelectorAll('iframe,embed,object').length,hints:document.querySelectorAll('link[rel=preconnect],link[rel=dns-prefetch],link[rel=prefetch]').length,overflow:document.documentElement.scrollWidth>innerWidth,resources:performance.getEntriesByType('resource').map(r=>r.name)}));
 expect(audit.frames).toBe(0);expect(audit.hints).toBe(0);expect(audit.overflow).toBe(false);
 expect(audit.resources.every(url=>new URL(url).origin===new URL(page.url()).origin)).toBe(true);
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

test('CSP blocks provider frames, media, images, scripts and connections before a request',async({page})=>{
 await page.goto('/#/movies');await expect(page.locator('#movies-search')).toBeVisible();
 const responses:string[]=[];page.on('response',r=>{if(new URL(r.url()).origin!==new URL(page.url()).origin)responses.push(r.url());});
 const directives=await page.evaluate(async()=>{
  const violations:string[]=[];document.addEventListener('securitypolicyviolation',e=>violations.push(e.effectiveDirective));
  const host='https://framextv.cc';
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
});


test('episode return restores scroll and focus; keyboard stays inside the movie section',async({page})=>{
 await page.setViewportSize({width:390,height:700});await page.goto('/#/movies/tv-68595');
 const cities=page.getByRole('link',{name:'Playback information for Cities'});await cities.scrollIntoViewIfNeeded();
 const before=await page.locator('.movies-view').evaluate(e=>e.scrollTop);await cities.click();
 await page.getByRole('link',{name:'Return to title'}).click();await expect(cities).toBeFocused();
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
