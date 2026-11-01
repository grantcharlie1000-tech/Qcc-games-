import {chromium} from '@playwright/test';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
const state=process.argv[2],base=process.argv[3];
if(!['before','after'].includes(state)||!base)throw Error('Usage: before|after http://127.0.0.1:PORT');
const directory='/workspace/qcc-liquid-glass/round-13';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH??(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const entries=[],geometry=[];
try{
 for(const fallback of [false,true])for(const [id,route,ready] of [['movies-home','movies','.movies-hero'],['tv-shows','movies/browse/tv','.movies-poster'],['games-home','collection','.game-card'],['snake','game/snake','.game-hud strong'],['fruit-merge','game/fruit-merge','.game-hud strong']]){
  if(!fallback&&['snake','fruit-merge'].includes(id))continue;
  const c=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
  await c.addInitScript(({forceOld})=>{
   localStorage.setItem('pocket-arcade:v1:accounts:guest','true');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
   if(forceOld)Object.defineProperty(navigator,'userAgentData',{value:undefined});
  },{forceOld:fallback&&state==='before'});
  const page=await c.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${base}/${fallback?'?glass=fallback':''}#/${route}`);
  await page.locator(ready).first().waitFor();await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(900);
  const name=id+(fallback?'-fallback':'');
  const save=async(suffix,clip)=>{const path=`${directory}/${name}${suffix}-${state}.png`;await page.screenshot({path,clip,animations:'disabled'});entries.push({id:name+suffix,state,path});};
  await save('');
  const selector=id==='games-home'?'.app-navigation':id.startsWith('movies')||id==='tv-shows'?'.movies-navigation,.movies-mobile-nav':'.game-dock';
  const rect=await page.locator(selector).first().boundingBox();
  const crop=r=>({x:Math.max(0,r.x-24),y:Math.max(0,r.y-24),width:Math.min(390,r.x+r.width+24)-Math.max(0,r.x-24),height:Math.min(844,r.y+r.height+24)-Math.max(0,r.y-24)});
  if(rect)await save('-bar',crop(rect));
  if(id==='games-home')await save('-menu',crop(await page.locator('.app-menu').boundingBox()));
  geometry.push({id:name,state,errors,...await page.evaluate(()=>({innerHeight,visualHeight:visualViewport?.height,bodyHeight:document.body.getBoundingClientRect().height,rootBackground:getComputedStyle(document.documentElement).backgroundColor,modes:[...document.querySelectorAll('[data-glass]')].filter(e=>e.getBoundingClientRect().width).map(e=>({class:e.className,mode:e.dataset.glass,filter:getComputedStyle(e).backdropFilter}))}))});
  if(errors.length)throw Error(errors.join('; '));console.log(`${name} ${state}`);await c.close();
 }
 // Reproduce a transport that ignores abort without changing any endpoint.
 // The clock makes the existing 20-second loading deadline reviewable quickly.
 const c=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
 await c.addInitScript(()=>{
  localStorage.setItem('pocket-arcade:v1:accounts:guest','true');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
  const fetchOriginal=window.fetch.bind(window);let first=true;
  window.fetch=(input,init)=>{if(first&&String(input).includes('/movies/catalog.json')){first=false;return new Promise(()=>{});}return fetchOriginal(input,init);};
 });
 const stalled=await c.newPage();await stalled.clock.install();await stalled.clock.pauseAt(new Date(Date.now()+1000));
 await stalled.goto(`${base}/?glass=fallback#/movies/browse/tv`);
 await stalled.getByRole('heading',{name:'Opening the collection…'}).waitFor();await stalled.clock.fastForward(20001);
 await stalled.getByRole('heading',{name:state==='after'?'The collection is unavailable':'Opening the collection…'}).waitFor();
 const saveLoad=async id=>{const path=`${directory}/${id}-${state}.png`;await stalled.screenshot({path,animations:'disabled'});entries.push({id,state,path});};
 await saveLoad('tv-shows-timeout');
 if(state==='after'){
  await stalled.getByRole('button',{name:'Try again',exact:true}).click();await stalled.locator('.movies-poster').first().waitFor();
  await stalled.evaluate(()=>Promise.all([...document.querySelectorAll('.movies-poster img')].map(image=>image.decode().catch(()=>{}))));
  await stalled.clock.runFor(1000);await saveLoad('tv-shows-retry');
 }
 await c.close();
 let previous=[];try{previous=JSON.parse(await readFile(`${directory}/manifest.json`,'utf8'));}catch{}
 await writeFile(`${directory}/manifest.json`,JSON.stringify([...previous.filter(x=>x.state!==state),...entries],null,2)+'\n');
 await writeFile(`${directory}/${state}-geometry.json`,JSON.stringify(geometry,null,2)+'\n');
}finally{await browser.close();}
