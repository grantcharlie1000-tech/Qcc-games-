import {chromium,expect} from '@playwright/test';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const folder=process.env.MOVIES_EVIDENCE_DIR||'docs/evidence/movies';await mkdir(folder,{recursive:true});
const live=process.env.MOVIES_LIVE==='1';
const video=await readFile('tests/fixtures/movies.webm');
const manifest=JSON.parse(await readFile('dist/offline-manifest.json','utf8'));
assert(!manifest.files.some(path=>path.startsWith('movies/')),'Movie content must be excluded from offline pack');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
const results=[];
try{for(const [label,base,port] of [['root','/',4381],['subpath','/Qcc-games-/',4382]]){
 const server=spawn('node',['scripts/serve-built.mjs'],{env:{...process.env,PORT:String(port),ARCADE_BASE:base},stdio:'ignore'});
 const origin=`http://127.0.0.1:${port}`,url=origin+base;
 try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,100));}
 const context=await browser.newContext({viewport:{width:1366,height:850},reducedMotion:'reduce'});
 await context.addInitScript(()=>{if(window!==window.top)return;localStorage.setItem('pocket-arcade:v1:accounts:guest','true');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');});
 if(!live){
  await context.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
 }
 await context.route('**/api/playback?*',route=>route.fulfill({json:{provider:new URL(route.request().url()).searchParams.get('provider'),source:{url:'/api/media?token=audit-fixture',type:'webm'},subtitles:[]}}));
 await context.route('**/api/media?*',route=>{
  const match=route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/),headers={'accept-ranges':'bytes'};
  if(!match)return route.fulfill({contentType:'video/webm',body:video,headers});
  const start=Number(match[1]),end=Math.min(match[2]?Number(match[2]):video.length-1,video.length-1);
  if(start>end||start>=video.length)return route.fulfill({status:416,headers:{'content-range':`bytes */${video.length}`},body:''});
  return route.fulfill({status:206,contentType:'video/webm',body:video.subarray(start,end+1),headers:{...headers,'content-range':`bytes ${start}-${end}/${video.length}`}});
 });
 const page=await context.newPage(),unauthorized=[],requests=[],providerRequests=[],errors=[];
 const allowed=new Set([origin,'https://image.tmdb.org']);
 page.on('request',request=>{const u=new URL(request.url());requests.push(u.href);let child=false;try{child=request.frame()!==page.mainFrame();}catch{}if(child)providerRequests.push(u.href);if(child?u.origin!==origin:!allowed.has(u.origin))unauthorized.push(u.href);});page.on('pageerror',e=>errors.push(e.message));
 const response=await page.goto(url);await page.locator('.movies-launch').waitFor();await page.locator('.movies-launch').click();await page.locator('#movies-search').waitFor();
 assert(!requests.some(u=>new URL(u).pathname==='/api/playback'),'Playback must not resolve until playback is selected');
 const policy=response.headers()['content-security-policy'];
 assert(policy.includes("script-src 'self'"));assert(policy.includes("frame-src 'self'"));assert(policy.includes("media-src 'self' blob:"));
 await page.setViewportSize({width:390,height:844});await page.locator('#movies-search').fill('sherlock');await page.locator('.movies-results-grid .movies-poster').first().click();await page.locator('#movies-season').selectOption('2');await page.getByRole('link',{name:'Play The Reichenbach Fall'}).click();
 const frame=page.locator('.movies-provider-frame');await frame.waitFor();assert.equal(await frame.getAttribute('sandbox'),'allow-scripts allow-same-origin');assert.equal(await frame.getAttribute('referrerpolicy'),'no-referrer');assert((await frame.getAttribute('allow')).includes("camera 'none'"));
 assert.equal(new URL(await frame.getAttribute('src'),url).pathname,base+'movies/player.html');
 const player=page.frameLocator('.movies-provider-frame');await expect(player.getByLabel('Source',{exact:true}).locator('option')).toHaveText(['FrameXTV','VidLink','VixSrc','VidSrc']);
 await player.getByRole('button',{name:'Play stream',exact:true}).click();await expect.poll(()=>player.locator('video').evaluate(v=>v.currentTime)).toBeGreaterThan(.1);
 await page.keyboard.press('Escape');await page.locator('#study-view').waitFor();assert.equal(await page.locator('.movies-provider-frame').count(),0);await page.getByRole('link',{name:'Games',exact:true}).click();await page.getByRole('button',{name:'Resume stream'}).click();await frame.waitFor();
 const cachesBefore=await page.evaluate(async()=>{const urls=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())urls.push(request.url);return urls;});
 assert(!cachesBefore.some(u=>new URL(u).pathname.startsWith(new URL('movies/',url).pathname)||/^\/api\/(?:media|playback)(?:$|\/)/.test(new URL(u).pathname)),'Worker must not cache movie content or relay capabilities');
 await page.evaluate(()=>navigator.serviceWorker.ready);for(let i=0;i<100&&!await page.evaluate(()=>!!navigator.serviceWorker.controller);i++)await new Promise(resolve=>setTimeout(resolve,100));
 await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'The collection is unavailable'}).waitFor();await page.getByRole('link',{name:'Games',exact:true}).click();await page.locator('.game-card').first().waitFor();assert.equal(await page.locator('.game-card').count(),19);assert.equal(await page.locator('.movies-mini-poster').count(),0,'Offline movie launch must not request remote posters');
 assert.deepEqual(unauthorized,[]);assert.deepEqual(errors,[]);
 results.push({label,base,allowedOrigins:[...allowed],unauthorizedRequests:unauthorized,playerRequests:[...new Set(providerRequests)],errors,requests:[...new Set(requests)],sandbox:'allow-scripts allow-same-origin',fixturePlaybackVerified:true,providerUnloadedForStudy:true,movieContentCached:false,offlineCatalogFailsHonestly:true,offlineGameCards:19});await context.close();
 }finally{server.kill();}
}}finally{await browser.close();}
await writeFile(`${folder}/audit.json`,JSON.stringify({date:new Date().toISOString(),transport:'first-party relay fixtures'+(live?'; live poster requests':'; poster fixtures'),livePlaybackVerified:false,fixturePlaybackVerified:true,offlinePackExcludesMovies:true,results},null,2)+'\n');console.log('Movies production integration/isolation audit passed at root and repository subpath, including real fixture playback. Live upstream playback requires a deployed backend and is not asserted by this static-build audit.');
