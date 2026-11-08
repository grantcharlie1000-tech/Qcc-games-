import {readFileSync} from 'node:fs';
function fulfillMedia(path:string,contentType:string){
 const body=readFileSync(path);
 return async(route:import('@playwright/test').Route)=>{
  const range=route.request().headers().range;
  if(range){
   const match=/bytes=(\d+)-(\d*)/.exec(range);
   const start=Number(match?.[1]??0);
   const end=match?.[2]?Number(match[2]):body.length-1;
   await route.fulfill({status:206,headers:{'content-type':contentType,'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${body.length}`,'content-length':String(end-start+1)},body:body.subarray(start,end+1)});
   return;
  }
  await route.fulfill({status:200,headers:{'content-type':contentType,'accept-ranges':'bytes','content-length':String(body.length)},body});
 };
}
import {test,expect} from '../fixtures';
import type {Page} from '@playwright/test';
import {MoviePopularity} from '../../src/movies/popularity';
import {startIsolatedPopularity} from './popularity-d1';
const ENDPOINT='**/api/movie-popularity';
async function setup(page:Page,ids:string[]=[]){
 await page.route('**/api/movies?*',r=>r.fulfill({status:503,json:{error:'catalog_not_configured'}}));
 await page.route(ENDPOINT,r=>r.fulfill({json:{titleIds:ids,windowDays:7}}));
 await page.route('https://framextv.cc/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><button>Play fixture</button>'}));
 await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>{await dialog.getByRole('button',{name:'Continue',exact:true}).click();});
}
test('shows only real ranked titles and keeps the preference on by default without a new popup',async({page})=>{
 await setup(page,['movie-157336','movie-329865']);await page.goto('/#/movies');
 const rail=page.locator('[data-rail="popular-marlborough"]');
 await expect(rail.getByRole('heading',{name:'Popular in Marlborough'})).toBeVisible();
 await expect(rail.locator('[data-title]')).toHaveCount(2);
 await expect(rail.locator('[data-title]').first()).toHaveAttribute('data-title','movie-157336');
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.locator('.movies-menu').click();
 await expect(page.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'})).toBeChecked();
 await page.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'}).uncheck();
 await page.reload();await page.locator('.movies-menu').click();
 await expect(page.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'})).not.toBeChecked();
});
test('empty and unavailable states never substitute TMDB trending or starter titles',async({page})=>{
 await setup(page);await page.goto('/#/movies');const rail=page.locator('[data-rail="popular-marlborough"]');
 await expect(rail).toContainText('Not enough viewing activity yet.');await expect(rail.locator('[data-title]')).toHaveCount(0);
 await page.route(ENDPOINT,r=>r.fulfill({status:503,json:{error:'not_configured'}}));await page.reload();
 await expect(rail).toContainText('Popular picks are unavailable right now.');await expect(rail.locator('[data-title]')).toHaveCount(0);
});
test('historical FrameXTV fixture messages do not contribute',async({page})=>{
 await setup(page);const posts:unknown[]=[];
 await page.route(ENDPOINT,async route=>{if(route.request().method()==='POST')posts.push(route.request().postDataJSON());await route.fulfill({json:{titleIds:[],windowDays:7}});});
 await page.goto('/#/movies/movie-157336/play');await expect(page.locator('.movies-provider-frame')).toBeVisible();
 await page.clock.install();
 const frame=()=>page.frame({url:/framextv/})!;
 const report=async(time:number)=>{await frame().evaluate(time=>parent.postMessage({event:'frameXTV:timeupdate',currentTime:time,duration:6000},'*'),time);await page.waitForTimeout(20);};
 await frame().evaluate(()=>parent.postMessage({event:'frameXTV:ready'},'*'));await report(0);await report(3000);
 for(let i=0;i<=12;i++){await page.clock.runFor(5000);await report(3000+i*5);}
 expect(posts).toEqual([]);
});

for(const width of [390,1440])test(`popularity toggle shares the settings group at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);await page.goto('/#/movies');await page.locator('.movies-menu').click();
 const layout=await page.locator('#movie-popularity').evaluate(input=>{
  const row=input.closest('label')!,previous=document.querySelector('#festive')!.closest('label')!;
  const switchBox=input.getBoundingClientRect(),previousSwitch=document.querySelector('#festive')!.getBoundingClientRect();
  return {sameGroup:row.parentElement===previous.parentElement,adjacent:row.previousElementSibling===previous,gap:row.getBoundingClientRect().top-previous.getBoundingClientRect().bottom,rightDifference:switchBox.right-previousSwitch.right,border:getComputedStyle(row).borderTopWidth};
 });
 expect(layout.sameGroup).toBe(true);expect(layout.adjacent).toBe(true);expect(Math.abs(layout.gap)).toBeLessThanOrEqual(1);expect(Math.abs(layout.rightDifference)).toBeLessThanOrEqual(1);expect(layout.border).toBe('1px');
});

async function stamp(page:Page){
 await page.evaluate(()=>{document.getElementById('popularity-test-fixture')?.remove();const banner=document.createElement('div');banner.id='popularity-test-fixture';banner.textContent='TEST FIXTURE — not live Popular in Marlborough';banner.style.cssText='position:fixed;z-index:2147483647;top:0;left:0;right:0;padding:8px 12px;background:#111;color:#fff;font:600 14px/1.3 sans-serif;text-align:center';document.body.append(banner);});
}
const shot=(name:string)=>`/opt/cursor/artifacts/popular-marlborough/${name}.png`;

test('archive playback and parent-page messages do not contribute',async({page})=>{
 await setup(page);const posts:unknown[]=[];
 await page.route(ENDPOINT,async route=>{if(route.request().method()==='POST')posts.push(route.request().postDataJSON());await route.fulfill({json:{titleIds:[],windowDays:7}});});
 const catalog=JSON.parse(readFileSync('public/movies/catalog.json','utf8'));
 catalog.titles=[{...catalog.titles[0],id:'movie-10331',name:'Night of the Living Dead',year:1968,source:{type:'archive',archiveId:'night_of_the_living_dead',license:'Public domain (US, no copyright notice, 1968)',evidence:'collection: feature_films'}}];
 await page.route('**/movies/catalog.json',route=>route.fulfill({json:catalog}));
 await page.route('https://archive.org/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><button>Archive fixture</button>'}));
 await page.goto('/#/movies/movie-10331/play');
 const embedded=page.locator('.movies-archive-frame');
 await expect(embedded).toBeVisible();
 const frame=await (await embedded.elementHandle())?.contentFrame();
 if(!frame)throw new Error('Archive fixture frame did not load');
 await frame.evaluate(()=>{parent.postMessage({event:'frameXTV:timeupdate',currentTime:120,duration:6000},'*');parent.postMessage({event:'timeupdate',currentTime:120},'*');});
 await page.evaluate(()=>postMessage({event:'frameXTV:timeupdate',currentTime:120,duration:6000},location.origin));
 await page.waitForTimeout(50);expect(posts).toEqual([]);
});

test('a real local video counts only 60 seconds of advancing playback',async({page})=>{
 test.setTimeout(150_000);
 await setup(page);const posts:unknown[]=[];
 await page.route(ENDPOINT,async route=>{if(route.request().method()==='POST')posts.push(route.request().postDataJSON());await route.fulfill({json:{titleIds:[],windowDays:7}});});
 await page.route('**/movies/licenses.json',route=>route.fulfill({json:[{key:'movie-157336',path:'movies/media/popularity-minute.webm',license:'CC0-1.0',credit:'TEST FIXTURE generated silent clip',evidence:'docs/rights/popularity-sample.md',reviewed:true,territory:'Worldwide',expires:'2099-01-01'}]}));
 await page.route('**/movies/media/popularity-minute.webm',fulfillMedia('tests/movies/fixtures/popularity-minute.webm','video/webm'));
 await page.goto('/#/movies/movie-157336/play');
 const video=page.locator('video');await expect(video).toBeVisible();
 await video.evaluate(node=>new Promise<void>(resolve=>{const element=node as HTMLVideoElement;if(element.readyState>=1)resolve();else element.addEventListener('loadedmetadata',()=>resolve(),{once:true});}));
 const restored=await video.evaluate(node=>new Promise<number>((resolve,reject)=>{
  const element=node as HTMLVideoElement;
  const timer=setTimeout(()=>reject(new Error('restore timed out')),5000);
  element.addEventListener('seeked',()=>{clearTimeout(timer);resolve(element.currentTime);},{once:true});
  element.currentTime=40;
 }));
 expect(restored).toBeGreaterThan(30);expect(posts).toEqual([]);
 await video.evaluate(node=>new Promise<void>((resolve,reject)=>{
  const element=node as HTMLVideoElement;
  const timer=setTimeout(()=>reject(new Error('return timed out')),5000);
  element.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});
  element.currentTime=0;
 }));
 await video.evaluate(node=>(node as HTMLVideoElement).play());
 await expect.poll(()=>video.evaluate(node=>(node as HTMLVideoElement).currentTime)).toBeGreaterThan(2);
 await video.evaluate(node=>(node as HTMLVideoElement).pause());
 await page.waitForTimeout(1000);expect(posts).toEqual([]);
 const jumped=await video.evaluate(node=>new Promise<number>((resolve,reject)=>{
  const element=node as HTMLVideoElement;
  const timer=setTimeout(()=>reject(new Error('seek timed out')),5000);
  element.addEventListener('seeked',()=>{clearTimeout(timer);resolve(element.currentTime);},{once:true});
  element.currentTime=30;
 }));
 expect(jumped).toBeGreaterThan(20);expect(posts).toEqual([]);
 await video.evaluate(node=>new Promise<void>((resolve,reject)=>{
  const element=node as HTMLVideoElement;
  const timer=setTimeout(()=>reject(new Error('rewind timed out')),5000);
  element.addEventListener('seeked',()=>{clearTimeout(timer);resolve();},{once:true});
  element.currentTime=0;
 }));
 await video.evaluate(node=>(node as HTMLVideoElement).play());
 await expect.poll(()=>video.evaluate(node=>(node as HTMLVideoElement).currentTime),{timeout:90_000}).toBeGreaterThan(61);
 await expect.poll(()=>posts.length,{timeout:5_000}).toBe(1);
 expect(posts[0]).toMatchObject({titleId:'movie-157336'});
 expect(Object.keys(posts[0] as object).sort()).toEqual(['titleId','token']);
});

test('opt-out reaches another tab immediately, survives reload, and clear history leaves it off',async({page,context})=>{
 await setup(page);await page.goto('/#/movies');
 const other=await context.newPage();await other.goto('/#/movies');await other.locator('.movies-menu').click();
 await other.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'}).uncheck();
 await page.locator('.movies-menu').click();
 await expect(page.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'})).not.toBeChecked();
 await page.getByRole('button',{name:'Close menu',exact:true}).click();
 await page.getByRole('button',{name:'Clear my list & watch history'}).click();
 await page.locator('.movies-menu').click();
 await expect(page.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'})).not.toBeChecked();
 await page.reload();await page.locator('.movies-menu').click();
 await expect(page.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'})).not.toBeChecked();
 await other.reload();await other.locator('.movies-menu').click();
 await expect(other.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'})).not.toBeChecked();
});

for(const width of [390,1440])test(`fixture screenshots at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page,['movie-157336']);await page.goto('/#/movies');
 const rail=page.locator('[data-rail="popular-marlborough"]');await expect(rail.locator('[data-title="movie-157336"]')).toBeVisible();
 await stamp(page);await page.screenshot({path:shot(`${width}-fixture-populated`)});
 await page.route(ENDPOINT,route=>route.fulfill({status:503,json:{error:'popularity_unavailable'}}));await page.reload();
 await expect(rail).toContainText('Popular picks are unavailable right now.');await stamp(page);await page.screenshot({path:shot(`${width}-fixture-unavailable`)});
 await page.locator('.movies-menu').click();await page.getByRole('checkbox',{name:'Contribute to Popular in Marlborough'}).uncheck();
 await stamp(page);await page.screenshot({path:shot(`${width}-fixture-opt-out`)});
});

test('renders ranked titles from the isolated D1 preview',async({page})=>{
 const preview=await startIsolatedPopularity();
 try{
  const now=Date.now();
  for(let n=1;n<=5;n++){
   const storage=new Map<string,string>();
   const fetcher=async(_url:RequestInfo|URL,init?:RequestInit)=>{const headers=new Headers(init?.headers);headers.set('origin','https://qcc.test');headers.set('cf-connecting-ip',`198.51.100.${n}`);return preview.call(new Request('https://qcc.test/api/movie-popularity',{...init,headers})) as unknown as Response;};
   const client=new MoviePopularity(()=>({getItem:key=>storage.get(key)??null,setItem:(key,value)=>{storage.set(key,value);},removeItem:key=>{storage.delete(key);}}),fetcher,()=>now,()=>n.toString(16).padStart(32,'0'));
   client.available=true;for(let i=0;i<=60;i++)await client.sample('movie-157336',i,i*1000,true);await new Promise(resolve=>setTimeout(resolve,0));
  }
  await page.route(ENDPOINT,async route=>{
   const request=route.request();const headers=new Headers(request.headers());headers.set('cf-connecting-ip','198.51.100.50');
   const upstream=await preview.call(new Request(request.url(),{method:request.method(),headers,body:request.postData()??undefined}));
   await route.fulfill({status:upstream.status,headers:Object.fromEntries(upstream.headers.entries()),body:Buffer.from(await upstream.arrayBuffer())});
  });
  await page.route('**/api/movies?*',route=>route.fulfill({status:503,json:{error:'catalog_not_configured'}}));
  await page.addLocatorHandler(page.getByRole('dialog',{name:'Before you watch'}),async dialog=>{await dialog.getByRole('button',{name:'Continue',exact:true}).click();});
  await page.setViewportSize({width:1440,height:900});await page.goto('/#/movies');
  const rail=page.locator('[data-rail="popular-marlborough"]');
  await expect(rail.locator('[data-title="movie-157336"]')).toBeVisible();
  await expect(rail).not.toContainText('Trending');
  await stamp(page);await page.screenshot({path:shot('1440-isolated-d1-ranked')});
  await page.setViewportSize({width:390,height:900});await stamp(page);await page.screenshot({path:shot('390-isolated-d1-ranked')});
 }finally{await preview.dispose();}
});
