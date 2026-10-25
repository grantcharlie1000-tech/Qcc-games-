import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const folder=process.env.MOVIES_EVIDENCE_DIR||'docs/evidence/movies';await mkdir(folder,{recursive:true});
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
 await context.addInitScript(()=>{sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');});
 const page=await context.newPage(),external=[],requests=[],errors=[];
 page.on('request',request=>{const u=new URL(request.url());requests.push(u.pathname);if(u.origin!==origin)external.push(request.url());});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(url);await page.locator('.movies-launch').waitFor();
 await page.screenshot({path:`${folder}/${label}-grid.png`,fullPage:false});
 await page.locator('.movies-launch').click();await page.locator('#movies-search').waitFor();
 await page.screenshot({path:`${folder}/${label}-home.png`});
 const dom=await page.evaluate(()=>({frames:document.querySelectorAll('iframe,object,embed').length,media:document.querySelectorAll('video,audio').length,hints:document.querySelectorAll('link[rel=preconnect],link[rel=dns-prefetch],link[rel=prefetch]').length,csp:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content')}));
 assert.equal(dom.frames,0);assert.equal(dom.media,0);assert.equal(dom.hints,0);assert(dom.csp.includes("frame-src 'none'"));assert(dom.csp.includes("media-src 'self'"));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${folder}/${label}-mobile.png`});
 await page.locator('#movies-search').fill('sherlock');await page.locator('.movies-results-grid .movies-poster').first().click();await page.locator('#movies-season').selectOption('2');await page.getByRole('link',{name:'Playback information for The Reichenbach Fall'}).click();await page.getByRole('heading',{name:'Playback unavailable',exact:true}).waitFor();
 const cachesBefore=await page.evaluate(async()=>{const urls=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())urls.push(request.url);return urls;});
 assert(!cachesBefore.some(u=>new URL(u).pathname.startsWith(new URL('movies/',url).pathname)),'Worker must not cache movie content');
 await page.evaluate(()=>navigator.serviceWorker.ready);
 // Let the controller handshake settle, then verify a real offline reload.
 for(let i=0;i<100&&!await page.evaluate(()=>!!navigator.serviceWorker.controller);i++)await new Promise(resolve=>setTimeout(resolve,100));
 await context.setOffline(true);await page.reload();await page.getByRole('heading',{name:'The collection is unavailable'}).waitFor();
 await page.getByRole('link',{name:'Games',exact:true}).click();await page.locator('.game-card').first().waitFor();assert.equal(await page.locator('.game-card').count(),18);assert.equal(await page.locator('.movies-mini-poster svg').count(),5);
 assert.deepEqual(external,[]);assert.deepEqual(errors,[]);
 results.push({label,base,dom,external,errors,requests:[...new Set(requests)],movieContentCached:false,offlineCatalogFailsHonestly:true,offlineGameCards:18});
 await context.close();
 }finally{server.kill();}
}}finally{await browser.close();}
await writeFile(`${folder}/audit.json`,JSON.stringify({date:new Date().toISOString(),offlinePackExcludesMovies:true,results},null,2)+'\n');console.log('Movies production privacy audit passed at root and repository subpath.');
