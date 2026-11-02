import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';

const origin='http://127.0.0.1:4618',root=resolve('dist');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'};
let server,scope,legacy,legacyWorker,networkDocuments;
// Pages redirects index.html to the scope root. addAll retains redirected=true,
// which Chrome rejects when this old worker serves it for a navigation.
const oldWorker=String.raw`
const VERSION='7cc4be4c7742',NAME='pocket-arcade:'+new URL(self.registration.scope).pathname+':'+VERSION+':shell';
const PRECACHE=[new URL('index.html',self.registration.scope).href];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(NAME);
 await cache.addAll(PRECACHE);
 const unrelated=await caches.open('unrelated-cache');
 await unrelated.put(new URL('preserved.txt',self.registration.scope),new Response('Unrelated data survives'));
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate'&&!new URL(event.request.url).searchParams.has('network')){
  event.respondWith(caches.open(NAME).then(cache=>cache.match(PRECACHE[0])));
 }
});
`;

test.beforeAll(async()=>{
 await readFile(resolve(root,'sw.js')); // A real production build is required.
 server=createServer(async(req,res)=>{
  const url=new URL(req.url,origin);
  if(!url.pathname.startsWith(scope)){res.writeHead(404).end();return;}
  const relative=url.pathname.slice(scope.length);
  try{
   if(relative==='sw.js'&&legacyWorker){
    res.writeHead(200,{'Content-Type':'application/javascript','Cache-Control':'no-cache, max-age=0'}).end(oldWorker);return;
   }
   if(relative==='index.html'){
    res.writeHead(308,{'Location':scope,'Cache-Control':'no-store'}).end();return;
   }
   const document=relative===''||relative==='seed.html';
   if(document&&legacy){
    res.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'}).end('<!doctype html><h1>Legacy setup</h1>');return;
   }
   const file=resolve(root,document?'index.html':relative);
   if(!file.startsWith(root+sep)){res.writeHead(403).end();return;}
   const data=await readFile(file);
   if(document)networkDocuments.push(url.href);
   res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream','Cache-Control':'no-cache, max-age=0','X-Recovery-Network':'built-app'}).end(data);
  }catch{res.writeHead(404).end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4618,'127.0.0.1',resolve);});
});
test.afterAll(async()=>{if(server)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));});
test.beforeEach(async({context})=>{
 legacy=true;legacyWorker=true;networkDocuments=[];
 await context.addInitScript(()=>{
  localStorage.setItem('pocket-arcade:v1:accounts:guest','true');
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
  sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
  window.appRegistrations=[];
  const register=ServiceWorkerContainer.prototype.register;
  ServiceWorkerContainer.prototype.register=function(...args){window.appRegistrations.push(String(args[0]));return register.apply(this,args);};
 });
});
async function seed(page){
 await page.goto(origin+scope+'seed.html?returning=one#/collection');
 await page.evaluate(async()=>{
  localStorage.setItem('pocket-arcade:v1:best:snake','2468');
  document.cookie='recovery=preserved; path=/';
  await navigator.serviceWorker.register(new URL('sw.js',location.href),{scope:new URL('.',location.href).href,updateViaCache:'none'});
  await navigator.serviceWorker.ready;
 });
 await expect.poll(()=>page.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
 await expect(page.getByRole('heading',{name:'Legacy setup'})).toBeVisible();
 expect(await cachedNavigation(page)).toMatchObject({redirected:true,status:200,url:origin+scope});
 expect(await page.evaluate(()=>caches.keys())).toHaveLength(2);
}
async function cachedNavigation(page){
 return page.evaluate(async()=>{
  const name=(await caches.keys()).find(name=>name.startsWith('pocket-arcade'));
  const response=await(await caches.open(name)).match(new URL('index.html',location.href));
  return {redirected:response.redirected,status:response.status,url:response.url,body:await response.text()};
 });
}
async function recovered(page){
 await expect(page.locator('.game-card').first()).toBeVisible();
 await expect.poll(()=>page.evaluate(async()=>({
  caches:await caches.keys(),registrations:(await navigator.serviceWorker.getRegistrations()).length,
  controlled:!!navigator.serviceWorker.controller
 }))).toEqual({caches:['unrelated-cache'],registrations:0,controlled:false});
 expect(await page.evaluate(async()=>{
  const response=await(await caches.open('unrelated-cache')).match(new URL('preserved.txt',location.href));
  return response.text();
 })).toBe('Unrelated data survives');
 expect(await page.evaluate(()=>window.appRegistrations)).toEqual([]);
 expect(await page.evaluate(()=>localStorage.getItem('pocket-arcade:v1:best:snake'))).toBe('2468');
 expect(await page.evaluate(()=>document.cookie)).toContain('recovery=preserved');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await expect(page.getByRole('button',{name:/available offline|Offline pack downloaded|Reload to update/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Study Mode',exact:true})).toBeVisible();
}

for(const path of ['/','/Qcc-games-/']){
 test('replacement worker recovers redirected cached navigation after one more load at '+path,async({page,context})=>{
  scope=path;await seed(page);
  const second=await context.newPage();
  const oldResponse=await second.goto(origin+scope+'seed.html?network=1&returning=two#/collection');
  expect(oldResponse.fromServiceWorker()).toBe(false);
  expect(await second.evaluate(()=>!!navigator.serviceWorker.controller)).toBe(true);
  const urls=[page.url(),second.url()];
  const cached=await cachedNavigation(page);
  const broken=await context.newPage();
  const brokenURL=origin+scope+'seed.html?broken=1#/collection';
  await expect(broken.goto(brokenURL)).rejects.toThrow(/ERR_FAILED/);
  // Let Chrome commit the error document before installing the replacement.
  await expect.poll(()=>broken.evaluate(()=>location.protocol)).toBe('chrome-error:');
  expect(await cachedNavigation(page)).toEqual(cached); // The entry was never evicted.
  const failedAgain=[];
  broken.on('requestfailed',request=>{if(request.isNavigationRequest())failedAgain.push(request.failure().errorText);});
  const networkNavigation=response=>response.request().isNavigationRequest()&&!response.fromServiceWorker()&&response.headers()['x-recovery-network']==='built-app';
  const brokenResponse=broken.waitForResponse(networkNavigation);
  legacy=false;legacyWorker=false;
  const responses=[page,second].map(tab=>tab.waitForResponse(networkNavigation));
  // Simulate the browser update check at the original URL. These legacy pages
  // run no app code, so only the replacement worker can rescue them.
  await page.evaluate(()=>{void navigator.serviceWorker.getRegistration().then(registration=>registration.update());});
  for(const response of await Promise.all(responses)){expect(response.status()).toBe(200);expect(response.fromServiceWorker()).toBe(false);}
  await recovered(page);await recovered(second);
  expect([page.url(),second.url()]).toEqual(urls);
  expect(networkDocuments.sort()).toEqual(urls.map(url=>url.split('#')[0]).sort());
  // Keep the actual failed tab. One reload of that error document must recover.
  await broken.reload();
  const response=await brokenResponse;expect(response.fromServiceWorker()).toBe(false);expect(response.status()).toBe(200);
  expect(broken.url()).toBe(brokenURL);await recovered(broken);
  expect(failedAgain).toEqual([]);
  expect(networkDocuments.sort()).toEqual([...urls,brokenURL].map(url=>url.split('#')[0]).sort());
 });
 test('app startup removes the old worker without registering its replacement at '+path,async({page})=>{
  scope=path;await seed(page);
  // Keep serving the exact old sw.js. A query bypasses only its navigation
  // handler so the new app must perform the independent cleanup.
  legacy=false;
  const response=await page.goto(origin+scope+'seed.html?network=1#/collection');
  expect(response.status()).toBe(200);expect(response.fromServiceWorker()).toBe(false);
  // Unregistering cannot detach the old controller from the current document.
  // The next network navigation must be uncontrolled.
  await expect.poll(()=>page.evaluate(async()=>({caches:await caches.keys(),registrations:(await navigator.serviceWorker.getRegistrations()).length}))).toEqual({caches:['unrelated-cache'],registrations:0});
  expect(await page.evaluate(()=>window.appRegistrations)).toEqual([]);
  const reload=await page.reload();expect(reload.fromServiceWorker()).toBe(false);
  await recovered(page);
 });
}
