import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const folder=process.env.MOVIES_EVIDENCE_DIR||'docs/evidence/movies';await mkdir(folder,{recursive:true});
const live=process.env.MOVIES_LIVE==='1';
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
 await context.addInitScript(()=>{if(window!==window.top)return;sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');});
 if(!live){
  await context.route('https://image.tmdb.org/**',route=>route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6WQAAAAASUVORK5CYII=','base64')}));
  await context.route('https://framextv.xyz/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Provider fixture</title><button>Play stream</button>'}));
 }
 const page=await context.newPage(),unauthorized=[],requests=[],providerRequests=[],errors=[];
 const allowed=new Set([origin,'https://image.tmdb.org','https://framextv.xyz','https://framextv.cc']);
 page.on('request',request=>{const u=new URL(request.url());requests.push(u.href);let child=false;try{child=request.frame()!==page.mainFrame();}catch{}if(child)providerRequests.push(u.href);else if(!allowed.has(u.origin))unauthorized.push(u.href);});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('.movies-launch').waitFor();await page.locator('.movies-launch').click();await page.locator('#movies-search').waitFor();
 assert(!requests.some(u=>new URL(u).hostname.startsWith('framextv.')),'Provider must not load until playback is selected');
 const policy=await page.evaluate(()=>document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'));
 assert(policy.includes("script-src 'self'"));assert(policy.includes('frame-src https://framextv.xyz https://framextv.cc'));
 await page.setViewportSize({width:390,height:844});await page.locator('#movies-search').fill('sherlock');await page.locator('.movies-results-grid .movies-poster').first().click();await page.locator('#movies-season').selectOption('2');await page.getByRole('link',{name:'Play The Reichenbach Fall'}).click();
 const frame=page.locator('.movies-provider-frame');await frame.waitFor();assert.equal(await frame.getAttribute('sandbox'),'allow-scripts allow-same-origin');assert.equal(await frame.getAttribute('referrerpolicy'),'no-referrer');assert((await frame.getAttribute('allow')).includes("camera 'none'"));
 await page.keyboard.press('Escape');await page.locator('#study-view').waitFor();assert.equal(await page.locator('.movies-provider-frame').count(),0);await page.getByRole('link',{name:'Games',exact:true}).click();await page.getByRole('button',{name:'Resume stream'}).click();await frame.waitFor();
 const cachesBefore=await page.evaluate(async()=>{const urls=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())urls.push(request.url);return urls;});
 assert(!cachesBefore.some(u=>new URL(u).pathname.startsWith(new URL('movies/',url).pathname)),'Worker must not cache movie content');
 await page.evaluate(()=>navigator.serviceWorker.ready);for(let i=0;i<100&&!await page.evaluate(()=>!!navigator.serviceWorker.controller);i++)await new Promise(resolve=>setTimeout(resolve,100));
 await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'The collection is unavailable'}).waitFor();await page.getByRole('link',{name:'Games',exact:true}).click();await page.locator('.game-card').first().waitFor();assert.equal(await page.locator('.game-card').count(),18);assert.equal(await page.locator('.movies-mini-poster').count(),5);
 assert.deepEqual(unauthorized,[]);assert.deepEqual(errors,[]);
 results.push({label,base,allowedOrigins:[...allowed],unauthorizedParentRequests:unauthorized,providerRequests:[...new Set(providerRequests)],errors,requests:[...new Set(requests)],sandbox:'allow-scripts allow-same-origin',providerUnloadedForStudy:true,movieContentCached:false,offlineCatalogFailsHonestly:true,offlineGameCards:18});await context.close();
 }finally{server.kill();}
}}finally{await browser.close();}
await writeFile(`${folder}/audit.json`,JSON.stringify({date:new Date().toISOString(),transport:live?'live requests attempted; stream playback not asserted':'approved-provider transport fixtures; no live availability assertion',livePlaybackVerified:false,offlinePackExcludesMovies:true,results},null,2)+'\n');console.log('Movies production integration/isolation audit passed at root and repository subpath. Live request mode: '+live+'; actual stream playback is not asserted.');
