import {test,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';

const origin='http://127.0.0.1:4618',root=resolve('dist');
const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.ttf':'font/ttf'};
let server,scope,legacy,legacyWorker,networkDocuments;
// Cache-only navigations reproduce ERR_FAILED when index.html is evicted.
// This fixture has no knowledge of the recovery implementation.
const oldWorker=String.raw`
const VERSION='7cc4be4c7742',NAME='pocket-arcade:'+new URL(self.registration.scope).pathname+':'+VERSION+':shell';
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(NAME);
 await cache.put(new URL('index.html',self.registration.scope),new Response('<!doctype html><h1>Cached old app</h1>',{headers:{'Content-Type':'text/html'}}));
 await caches.open('unrelated-cache');
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 if(event.request.mode==='navigate'&&!new URL(event.request.url).searchParams.has('network')){
  event.respondWith(caches.open(NAME).then(cache=>cache.match(new URL('index.html',self.registration.scope))));
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
   const document=relative===''||relative==='seed.html'||relative==='index.html';
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
 const response=await page.reload();
 expect(response.fromServiceWorker()).toBe(true);
 await expect(page.getByRole('heading',{name:'Cached old app'})).toBeVisible();
 expect(await page.evaluate(()=>caches.keys())).toHaveLength(2);
}
async function recovered(page){
 await expect(page.locator('.game-card').first()).toBeVisible();
 await expect.poll(()=>page.evaluate(async()=>({
  caches:await caches.keys(),registrations:(await navigator.serviceWorker.getRegistrations()).length,
  controlled:!!navigator.serviceWorker.controller
 }))).toEqual({caches:[],registrations:0,controlled:false});
 expect(await page.evaluate(()=>window.appRegistrations)).toEqual([]);
 expect(await page.evaluate(()=>localStorage.getItem('pocket-arcade:v1:best:snake'))).toBe('2468');
 expect(await page.evaluate(()=>document.cookie)).toContain('recovery=preserved');
 await page.getByRole('button',{name:'Open menu',exact:true}).click();
 await expect(page.getByRole('button',{name:/available offline|Offline pack downloaded|Reload to update/})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Study Mode',exact:true})).toBeVisible();
}

for(const path of ['/','/Qcc-games-/']){
 test('replacement worker recovers two returning windows with an evicted shell at '+path,async({page,context})=>{
  scope=path;await seed(page);
  const second=await context.newPage();
  const oldResponse=await second.goto(origin+scope+'seed.html?returning=two#/collection');
  expect(oldResponse.fromServiceWorker()).toBe(true);
  const urls=[page.url(),second.url()];
  await page.evaluate(async()=>{
   for(const name of await caches.keys())if(name.startsWith('pocket-arcade:'))await(await caches.open(name)).delete(new URL('index.html',location.href));
  });
  const broken=await context.newPage();
  await expect(broken.goto(origin+scope+'seed.html?broken=1')).rejects.toThrow(/ERR_FAILED/);
  await broken.close();
  legacy=false;legacyWorker=false;
  const responses=[page,second].map(tab=>tab.waitForResponse(response=>response.request().isNavigationRequest()&&!response.fromServiceWorker()&&response.headers()['x-recovery-network']==='built-app'));
  // Simulate the browser update check at the original URL. These legacy pages
  // run no app code, so only the replacement worker can rescue them.
  await page.evaluate(()=>{void navigator.serviceWorker.getRegistration().then(registration=>registration.update());});
  for(const response of await Promise.all(responses)){expect(response.status()).toBe(200);expect(response.fromServiceWorker()).toBe(false);}
  await recovered(page);await recovered(second);
  expect([page.url(),second.url()]).toEqual(urls);
  expect(networkDocuments.sort()).toEqual(urls.map(url=>url.split('#')[0]).sort());
  const response=await page.reload();expect(response.fromServiceWorker()).toBe(false);expect(response.status()).toBe(200);
  await expect.poll(()=>page.evaluate(()=>navigator.serviceWorker.getRegistrations().then(registrations=>registrations.length))).toBe(0);
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
  await expect.poll(()=>page.evaluate(async()=>({caches:await caches.keys(),registrations:(await navigator.serviceWorker.getRegistrations()).length}))).toEqual({caches:[],registrations:0});
  expect(await page.evaluate(()=>window.appRegistrations)).toEqual([]);
  const reload=await page.reload();expect(reload.fromServiceWorker()).toBe(false);
  await recovered(page);
 });
}
