import {isLibraryMovieArtwork} from './movies-network-policy.mjs';
import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {verifyPoolShot} from './pool-verifier-shot.mjs';
const titles={'neon-coil':'Neon Coil','fruit-merge':'Fruit Merge','water-sort':'Water Sort','color-blocks':'Color Blocks',tower:'Tower',snake:'Snake',minesweeper:'Minesweeper',solitaire:'Solitaire','block-fill':'Block Fill','color-connect':'Color Connect','ball-run':'Ball Run',pool:'Pool','animal-stack':'Animal Stack','flappy-bird':'Flappy Bird',globle:'Globle',blockcraft:'Blockcraft','maze-muncher':'Maze Muncher','corn-clicker':'Corn Clicker',slipline:'Slipline',quadfall:'Quadfall'};
const ids=process.env.ARCADE_GAMES?.split(',')||Object.keys(titles);
const sizes=[{width:390,height:844},{width:768,height:1024},{width:1366,height:768}];
const studyMedia=JSON.parse(await readFile('dist/study/image-provenance.json','utf8'));
const results=[];const servers=[];const folder=process.env.ARCADE_EVIDENCE_DIR||'docs/evidence/release';await mkdir(folder,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const waitFor=async(fn,description)=>{for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+description);};
async function action(page,id){
 if(id==='quadfall'){await page.getByRole('button',{name:'Start',exact:true}).click();await page.keyboard.press('Space');await waitFor(async()=>Number(await page.locator('.qf-game').getAttribute('data-score'))>0,'offline Quadfall hard drop');}
 else if(id==='neon-coil'){await page.getByRole('button',{name:/Enter arena|Continue arena/}).click();await page.mouse.move(240,300);await waitFor(async()=>Number(await page.locator('.nc-game').getAttribute('data-tick'))>10,'offline Neon Coil continuous movement');}
 else if(id==='fruit-merge'){await page.getByRole('button',{name:'Drop fruit',exact:true}).click();await page.waitForTimeout(650);}
 else if(id==='water-sort'){await page.getByRole('button',{name:'Hint',exact:true}).click();const from=await page.locator('.ws-hint-from').getAttribute('data-tube'),to=await page.locator('.ws-hint-to').getAttribute('data-tube');await page.locator(`[data-tube="${from}"]`).click();await page.locator(`[data-tube="${to}"]`).click();await waitFor(async()=>await page.locator('.ws-game').getAttribute('data-phase')!=='pouring','pour');}
 else if(id==='color-blocks'){await page.locator('.cb-cell').first().focus();await page.keyboard.press('1');await page.keyboard.press('Enter');assert.equal(await page.locator('.cb-game').getAttribute('data-moves'),'1');}
 else if(id==='tower'){await page.waitForTimeout(1100);await page.getByRole('button',{name:'Drop block',exact:true}).click();}
 else if(id==='snake'){await page.getByRole('button',{name:'Start slithering',exact:true}).click();await page.waitForTimeout(700);await page.getByRole('button',{name:'Turn up',exact:true}).click();}
 else if(id==='minesweeper'){await page.getByRole('gridcell').first().click();}
 else if(id==='solitaire'){await page.getByRole('button',{name:/^Draw from stock/}).click();}
 else if(id==='block-fill'){await page.getByRole('button',{name:'Hint',exact:true}).click();const text=await page.locator('.bf-message').textContent();const match=text.match(/row (\d+), column (\d+)/);assert.ok(match,`offline Block Fill hint: ${text}`);const svg=page.locator('.bf-board');await svg.focus();const head=await svg.getAttribute('aria-label');const h=head.match(/Head row (\d+), column (\d+)/);assert.ok(h);const dr=Number(match[1])-Number(h[1]),dc=Number(match[2])-Number(h[2]);await page.keyboard.press(dr===1?'ArrowDown':dr===-1?'ArrowUp':dc===1?'ArrowRight':'ArrowLeft');assert.equal(await svg.getAttribute('data-covered'),'2');}
 else if(id==='color-connect'){await page.getByRole('button',{name:'Hint',exact:true}).click();}
 else if(id==='ball-run'){await page.getByRole('button',{name:/^(Play|Continue|Play again)$/}).click();const before=await page.locator('.ball-run').getAttribute('data-distance');await page.keyboard.down('ArrowRight');try{await waitFor(async()=>Number(await page.locator('.ball-run').getAttribute('data-distance'))>Number(before)&&Number(await page.locator('.ball-run').getAttribute('data-x'))>0,'offline Ball Run forward movement and steering');}finally{await page.keyboard.up('ArrowRight');}assert.ok(Number(await page.locator('.ball-run').getAttribute('data-x'))>0,'offline held steering must move the ball');}
 else if(id==='flappy-bird'){await page.getByRole('button',{name:/Take flight|Continue flight|Fly again/}).click();await page.keyboard.press('Space');await waitFor(async()=>Number(await page.locator('.flappy-bird').getAttribute('data-tick'))>5,'offline Flappy Bird movement');}
 else if(id==='maze-muncher'){const start=page.getByRole('button',{name:/Start game|Play again/});if(await start.isVisible())await start.click();await page.keyboard.press('ArrowLeft');await waitFor(async()=>/heading left/.test(await page.locator('.mm-svg').getAttribute('aria-label')),'offline Maze Muncher movement');}
 else if(id==='corn-clicker'){
  // The shell's Restart asks before it erases the farm.
  const erase=page.getByRole('button',{name:'Erase everything',exact:true});if(await erase.isVisible()){await erase.click();await erase.waitFor({state:'hidden'});}
  const cob=page.getByRole('button',{name:/^Harvest the cob/});await cob.click();await cob.click();await waitFor(async()=>/^[1-9]/.test(await page.locator('.cc-kernels-num').textContent()),'offline Corn Clicker harvest');}
 else if(id==='slipline'){await page.getByRole('button',{name:'Use hint'}).click();}
 else if(id==='pool'){await verifyPoolShot(page);}
 else if(id==='globle'){await page.getByRole('textbox',{name:'Country name'}).fill('Kenya');await page.keyboard.press('Enter');await page.locator('.gl-guess[data-id=KEN]').waitFor();}
 else if(id==='blockcraft'){const root=page.locator('.blockcraft');
  // The shell's Restart asks before it replaces the world.
  const create=page.getByRole('button',{name:'Create New World',exact:true});if(await create.isVisible())await create.click();
  await waitFor(async()=>await root.getAttribute('data-ready')==='true','offline Blockcraft terrain');await page.getByRole('button',{name:/^(Play|Resume|Continue)$/}).click();const z=Number(await root.getAttribute('data-z'));await page.keyboard.down('KeyW');try{await waitFor(async()=>Math.abs(Number(await root.getAttribute('data-z'))-z)>.3,'offline Blockcraft walking');}finally{await page.keyboard.up('KeyW');}await page.keyboard.press('Escape');await page.getByRole('link',{name:'Games',exact:true}).click();
  // Back from Study the game plays on and captures the mouse (the lock arrives a moment later): let it go (Blockcraft
  // pauses on its Game Menu), so the shell's buttons take the clicks that follow.
  for(let i=0;i<40&&await root.getAttribute('data-locked')!=='true';i++)await page.waitForTimeout(50);
  await page.evaluate(()=>document.exitPointerLock());await waitFor(async()=>await root.getAttribute('data-locked')!=='true','offline Blockcraft mouse released');}
 else if(id==='animal-stack'){await page.getByRole('button',{name:/^Drop /}).click();await page.waitForTimeout(650);}
}
try{
 for(const [label,path,port] of [['root','/',4275],['subpath','/Qcc-games-/',4276]]){
  const server=spawn('node',['scripts/serve-built.mjs'],{env:{...process.env,PORT:String(port),ARCADE_BASE:path},stdio:'ignore',detached:true});servers.push(server);
  const base=`http://127.0.0.1:${port}${path}`;await waitFor(async()=>{try{return (await fetch(base)).ok;}catch{return false;}},'built server');
  const context=await browser.newContext({viewport:sizes[0],reducedMotion:'reduce'});const page=await context.newPage();const errors=[],external=[],failedAssets=[],movieArtworkRequests=[],movieArtworkFailures=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',response=>{if(response.status()>=400)(isLibraryMovieArtwork(response.url())?movieArtworkFailures:failedAssets).push({url:response.url(),status:response.status()});});page.on('requestfailed',request=>(isLibraryMovieArtwork(request.url())?movieArtworkFailures:failedAssets).push({url:request.url(),failure:request.failure()?.errorText}));page.on('request',r=>{if(isLibraryMovieArtwork(r.url()))movieArtworkRequests.push(r.url());else if(r.url().startsWith('http')&&new URL(r.url()).origin!==new URL(base).origin)external.push(r.url());});
  await page.goto(base+'icon.svg');await page.evaluate(async path=>{await caches.open('pocket-arcade-v2:'+path+':stale:pack');localStorage.setItem('pocket-arcade:v1:best:fruit-merge','4321');},path);
  await page.goto(base);await page.getByRole('button',{name:'Play as guest',exact:true}).click();assert.equal(await page.locator('[data-study-topic]').count(),20);await page.getByRole('button',{name:'Accept All',exact:true}).click();await page.locator('[data-study-topic="close-reading"]').click();await page.locator('.game-card').last().waitFor();assert.equal(await page.locator('.game-card').count(),Object.keys(titles).length);
  const initial=await page.evaluate(()=>performance.getEntriesByType('resource').map(e=>e.name));const manifest=await(await fetch(base+'.vite/manifest.json')).json();
  const heavy=Object.entries(manifest).filter(([key])=>key.includes('ball-run')||key.includes('fruit-merge')||key.includes('animal-stack')||key.includes('globle')||key.includes('blockcraft')).map(([,v])=>v.file);
  assert.ok(!initial.some(url=>heavy.some(file=>url.endsWith(file))),'heavy game chunks must remain lazy');
  await page.getByRole('button',{name:'Open menu'}).click();await page.getByRole('button',{name:'Make all games available offline'}).click();await page.getByRole('button',{name:'Offline pack downloaded'}).waitFor({timeout:45000});await page.getByRole('button',{name:'Close menu'}).click();
  await waitFor(()=>page.evaluate(()=>navigator.serviceWorker.controller!==null),'service worker control');
  const cacheNames=await page.evaluate(()=>caches.keys());assert.ok(!cacheNames.some(key=>key.endsWith(':stale:pack')));assert.equal(await page.evaluate(()=>localStorage.getItem('pocket-arcade:v1:best:fruit-merge')),'4321');
  await context.setOffline(true);await page.reload();await page.locator('.game-card').last().waitFor();assert.equal(await page.locator('.game-card').count(),Object.keys(titles).length);
  // Prose is bundled in the shell; any photographs come from the same-origin offline study assets.
  await page.getByRole('button',{name:'Open menu'}).click();
  const readingRequests=[];const recordReading=request=>readingRequests.push(request.url());page.on('request',recordReading);
  await page.getByRole('button',{name:'Study Mode',exact:true}).click();
  const topics=await page.locator('#study-topic option').evaluateAll(options=>options.map(o=>o.value));assert.equal(topics.length,20);const decodedStudyImages=new Map();
  for(const topic of topics){await page.getByLabel('Study topic',{exact:true}).selectOption(topic);assert.ok(await page.locator('#study-title').textContent());assert.equal(await page.locator('.study-chapter svg, .study-sidebar').count(),0);assert.equal(await page.locator('.study-text-section').count(),6);assert.ok((await page.locator('.study-article-body').innerText()).trim().split(/\s+/).length>=900);assert.equal(await page.locator('.study-byline img').count(),1);for(const image of await page.locator('.study-chapter img').evaluateAll(images=>Promise.all(images.map(async image=>{await image.decode();return {url:image.currentSrc||image.src,width:image.naturalWidth,height:image.naturalHeight};})))){const relative=new URL(image.url).pathname.slice(new URL(base).pathname.length);const expected=studyMedia.assets.find(asset=>'study/'+asset.path===relative);assert.ok(expected,'Only declared Study images may render offline: '+relative);assert.deepEqual([image.width,image.height],[expected.width,expected.height]);decodedStudyImages.set(relative,{path:relative,width:image.width,height:image.height});}}
  assert.equal(decodedStudyImages.size,studyMedia.assets.length,'Every declared Study image must decode offline');
  await page.getByRole('link',{name:'Games',exact:true}).click();page.off('request',recordReading);assert.ok(readingRequests.every(url=>new URL(url).origin===new URL(base).origin&&/^study\/(contributors|photos)\/[a-z-]+\.webp$/.test(new URL(url).pathname.slice(new URL(base).pathname.length))),'Study may request only first-party offline study photographs');
  results.push({deployment:label,studyArticlesOffline:topics.length,studyImagesOffline:[...decodedStudyImages.values()],studySwitchRequests:readingRequests});
  await page.screenshot({path:`${folder}/home-${label}-390.png`,fullPage:true});
  if(label==='root')for(const size of sizes.slice(1)){await page.setViewportSize(size);await page.screenshot({path:`${folder}/home-root-${size.width}.png`,fullPage:true});}
  await page.setViewportSize(sizes[0]);
  for(const id of ids){
   await page.goto(base+'#/game/'+id);await page.locator('#game-title').waitFor();await waitFor(async()=>{const stage=page.locator('#game-stage');return (await stage.textContent())?.includes('Getting your game ready')===false;},id+' mount');assert.equal(await page.locator('#game-title').textContent(),titles[id]);assert.equal(await page.locator('.game-error').count(),0);
   await action(page,id);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),id+' horizontal overflow');
   const frames=await page.evaluate(()=>new Promise(resolve=>{const values=[];let prev;const tick=t=>{if(prev!==undefined)values.push(t-prev);prev=t;if(values.length===45)resolve(values);else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));frames.sort((a,b)=>a-b);
   await page.screenshot({path:`${folder}/${id}-${label}-390.png`,fullPage:true});
   const retained=await page.locator('#game-stage > *').first().elementHandle();
   const switchRequests=[];const recordSwitch=request=>switchRequests.push(request.url());page.on('request',recordSwitch);
   const switchTiming=await page.evaluate(()=>{const start=performance.now();window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return {synchronousHandlerMs:performance.now()-start,articleVisible:!document.querySelector('#study-view').hidden,arcadeInert:document.querySelector('#app').inert};});
   assert.ok(switchTiming.articleVisible&&switchTiming.arcadeInert,id+' immediate Study switch');
   const frozen=await page.evaluate(id=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:'+id)).data,id);
   await page.getByLabel('Study topic',{exact:true}).selectOption('quadratics');
   assert.deepEqual(await page.evaluate(id=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:'+id)).data,id),frozen,id+' study snapshot');
   await page.getByRole('link',{name:'Games',exact:true}).click();page.off('request',recordSwitch);
   assert.equal(await retained.evaluate(node=>node===document.querySelector('#game-stage > *')),true,id+' same retained game instance');
   assert.ok(switchRequests.every(url=>new URL(url).origin===new URL(base).origin&&/^study\/(contributors|photos)\/[a-z-]+\.webp$/.test(new URL(url).pathname.slice(new URL(base).pathname.length))),id+' only offline study photographs requested while switching');
   assert.equal(await page.locator('#pause-game').getAttribute('aria-label'),'Pause game');
   await page.getByRole('button',{name:'Pause game',exact:true}).click();assert.equal(await page.locator('#pause-overlay').isVisible(),true);const snapshot=await page.evaluate(id=>localStorage.getItem('pocket-arcade:v1:save:'+id),id);assert.ok(snapshot,id+' snapshot');
   await page.getByRole('button',{name:'Restart game',exact:true}).click();assert.equal(await page.locator('#pause-overlay').isVisible(),false);
   if(label==='root')for(const size of sizes.slice(1)){await page.setViewportSize(size);await page.getByRole('button',{name:'Restart game',exact:true}).click();await action(page,id);await page.screenshot({path:`${folder}/${id}-${size.width}.png`,fullPage:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${id} overflow at ${size.width}`);}
   await page.setViewportSize(sizes[0]);await page.getByRole('link',{name:'Back to game library'}).click();await page.locator('.game-card').last().waitFor();assert.equal(await page.locator('.game-card').count(),Object.keys(titles).length);
   results.push({game:id,deployment:label,path,offline:true,action:true,save:true,restart:true,studyRestoration:true,studySwitchRequests:switchRequests.length,...switchTiming,rafMedianMs:frames[Math.floor(frames.length/2)],rafP95Ms:frames[Math.floor(frames.length*.95)]});console.log(`OFFLINE PASS ${label} ${id} + Study`);
  }
  assert.deepEqual(errors,[],'page errors');assert.deepEqual(external,[],'external runtime requests');assert.deepEqual(failedAssets,[],'failed local assets');
  results.push({deployment:label,cacheNames,externalRequests:external,movieArtworkRequests,movieArtworkFailures,pageErrors:errors,failedAssets,initialResourceCount:initial.length,heavyChunksLazy:true});await context.close();
 }
 await writeFile(folder+'/offline-results.json',JSON.stringify({recordedAt:new Date().toISOString(),browser:'Chromium',browserVersion:browser.version(),physicalHardware:false,softwareWebGL:true,rafSamplesPerGame:45,gameCount:ids.length,results},null,2));console.log(`Verified ${ids.length} games offline at both root and repository subpath.`);
}finally{await browser.close();for(const server of servers)try{process.kill(-server.pid,'SIGTERM');}catch{}}
