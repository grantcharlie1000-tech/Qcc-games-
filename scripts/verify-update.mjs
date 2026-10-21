import {writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {legacyBuild,readBuild,release,waitingRelease} from './update-fixtures.mjs';
import {createUpdateNativeTrace} from './update-native-trace.mjs';
const current=await readBuild(process.cwd()+'/dist');
const legacy=await legacyBuild();
const A=release(legacy,'A'),L=release(legacy,'L'),B=release(current,'B'),C=release(current,'C'),D=release(current,'D'),W=waitingRelease(current,'W'),X=waitingRelease(current,'X'),Y=waitingRelease(current,'Y'),broken=release(current,'broken');
const evidence=process.env.ARCADE_UPDATE_EVIDENCE_DIR||'docs/evidence/release';await mkdir(evidence,{recursive:true});
const nativeTraceEnabled=process.env.ARCADE_UPDATE_NATIVE_TRACE==='1';
function nativeRunMetadata(){
 const value={node:process.version,platform:process.platform,arch:process.arch,suite:'full original update verifier unless explicit local filter',case:process.env.ARCADE_UPDATE_CASE||'all',scope:process.env.ARCADE_UPDATE_SCOPE||'both',buildVersion:JSON.parse(current.get('/offline-manifest.json')).version};
 try{value.checkout=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8',timeout:5000}).trim();value.tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8',timeout:5000}).trim();}catch{value.checkoutUnavailable=true;}
 value.ci=Object.fromEntries(['GITHUB_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT','GITHUB_EVENT_NAME','GITHUB_JOB','RUNNER_OS','RUNNER_ARCH'].filter(key=>process.env[key]).map(key=>[key,process.env[key]]));return value;
}
const nativeTrace=nativeTraceEnabled?createUpdateNativeTrace({enabled:true,directory:evidence+'/native-trace',metadata:nativeRunMetadata()}):undefined;
let deployed=A,scope='/',gate,holdManifest=false,manifestGate,failed=false;
const requests=[],contexts=[],profiles=[],results=[],startupInventories=[],retainedPageEvidence=[];const primaryPages=new WeakMap();
const mime={js:'application/javascript',html:'text/html',css:'text/css',json:'application/json',svg:'image/svg+xml',ttf:'font/ttf',webmanifest:'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname,relative=pathname.startsWith(scope)?'/'+pathname.slice(scope.length):'/missing',file=relative==='/'?'/index.html':relative;
 requests.push({release:deployed.label,file,destination:req.headers['sec-fetch-dest']});nativeTrace?.observeResponse(req,res,{release:deployed.label,file,scope});
 if(file==='/test-navigation-gate'){gate=res;return;}
 if(holdManifest&&file==='/offline-manifest.json'){manifestGate=res;return;}
 const data=deployed.map.get(file);res.writeHead(data?200:404,{'Content-Type':mime[file.split('.').at(-1)]||'application/octet-stream','Cache-Control':'no-store'});res.end(data);
});await new Promise(resolve=>server.listen(4181,'127.0.0.1',resolve));
async function bounded(task,milliseconds,label){let timer;try{return await Promise.race([task,new Promise((_,reject)=>timer=setTimeout(()=>{const error=new Error('Timed out: '+label);reject(error);nativeTrace?.mark('original-deadline',{label,milliseconds,heldGate:!!gate,heldManifest:!!manifestGate});},milliseconds))]);}finally{clearTimeout(timer);}}
const poll=(fn,label)=>bounded((async()=>{for(let i=0;i<150;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out: '+label);})(),15000,label);
async function version(page){return await bounded(page.evaluate(()=>new Promise((resolve,reject)=>{
 const worker=navigator.serviceWorker.controller;if(!worker||worker.state!=='activated'){resolve(undefined);return;}
 const known=window.updateWorkerVersions||(window.updateWorkerVersions=new WeakMap());if(known.has(worker)){resolve(known.get(worker));return;}
 const channel=new MessageChannel();const timer=setTimeout(()=>{channel.port1.close();channel.port2.close();reject(new Error('Worker version RPC timed out'));},3000);
 channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();channel.port2.close();known.set(worker,e.data.version);resolve(e.data.version);};worker.postMessage({type:'ARCADE_VERSION'},[channel.port2]);
})),3000,'worker version RPC (Node deadline)').catch(error=>{if(error.message.includes('version RPC')){console.log('TRANSIENT VERSION OBSERVATION',error.message);return undefined;}throw error;});}
async function home(page,base){if(nativeTraceEnabled)await nativeTrace.ready(page);await page.goto(base);await page.locator('[data-study-topic],.game-card').first().waitFor();if(await page.locator('[data-study-topic]').count())await page.locator('[data-study-topic="close-reading"]').click();}
async function menu(page){await page.getByRole('button',{name:'Open menu',exact:true}).click();}
async function closeMenu(page){await page.getByRole('button',{name:'Close menu',exact:true}).click();}
async function download(page){await menu(page);await page.getByRole('button',{name:'Make all games available offline',exact:true}).click();await page.getByRole('button',{name:'Offline pack downloaded',exact:true}).waitFor();await closeMenu(page);}
const primaryPage=context=>primaryPages.get(context);
async function sourceClient(page){return await bounded(page.evaluate(()=>new Promise((resolve,reject)=>{
 const worker=navigator.serviceWorker.controller;if(!worker){resolve(undefined);return;}const c=new MessageChannel(),t=setTimeout(()=>{c.port1.close();c.port2.close();reject(new Error('Source client probe timed out'));},3000);c.port1.onmessage=event=>{clearTimeout(t);c.port1.close();c.port2.close();resolve(event.data);};worker.postMessage({type:'ARCADE_DIAGNOSTIC_CLIENT'},[c.port2]);
})),3000,'source client probe (Node deadline)');}
async function durableOwner(page,target){
 const client=await sourceClient(page);assert.ok(client?.id,'ready document has an authenticated source client');
 await poll(()=>page.evaluate(async({id,version,entry})=>{const r=await navigator.serviceWorker.getRegistration(),cache=await caches.open('pocket-arcade-v2:'+new URL(r.scope).pathname+':'+version+':shell'),response=await cache.match(new URL('.arcade-update-state',r.scope));if(!response)return false;const state=await response.json();return !state.pending.some(item=>item.id===id)&&state.owners.some(item=>item.id===id&&item.entry===new URL(entry,r.scope).href);},{id:client.id,version:target.version,entry:target.entry}),'actual module/source client ownership is durable');return client;
}
function nativeContextMetadata(context,profile){try{return {scope,profileId:profiles.indexOf(profile),browserVersion:context.browser().version(),executableSelection:{configuredExecutable:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':null),defaultReportedExecutable:chromium.executablePath(),resolvedExecutableVerified:false,actualProcessExecutable:'unverified; default headless may resolve to headless-shell'},viewport:{width:390,height:844},persistent:true,launchArgs:['--no-sandbox']};}catch{return {scope,browserMetadataUnavailable:true};}}
async function launch(profile){
 const context=await chromium.launchPersistentContext(profile,{executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),viewport:{width:390,height:844},args:['--no-sandbox']});contexts.push(context);if(nativeTraceEnabled)await nativeTrace.observe(context,nativeContextMetadata(context,profile));
 await context.addInitScript(()=>{
  window.updateControllerTimeline=[];
  const record=label=>{try{const worker=navigator.serviceWorker.controller,item={label,time:performance.now(),script:worker?.scriptURL,state:worker?.state};window.updateControllerTimeline.push(item);if(worker){const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();channel.port2.close();},1000);channel.port1.onmessage=event=>{clearTimeout(timer);item.build=event.data;channel.port1.close();channel.port2.close();};worker.postMessage({type:'ARCADE_VERSION'},[channel.port2]);}}catch{}};
  record('document-start');navigator.serviceWorker?.addEventListener('controllerchange',()=>record('controllerchange'));
 });
 context.on('page',page=>page.on('response',response=>{if(response.status()>=400&&response.url().includes('/assets/')){console.error('ASSET FAILURE',JSON.stringify({url:response.url(),status:response.status(),fromServiceWorker:response.fromServiceWorker()}));void diagnostic(page).then(value=>console.error('ASSET FAILURE STATE',JSON.stringify(value))).catch(()=>{});}}));
 await context.tracing.start({screenshots:true,snapshots:true});
 const initial=context.pages();for(const page of initial)await page.waitForLoadState('load',{timeout:15000});
 const base=`http://127.0.0.1:4181${scope}`,appPages=initial.filter(page=>page.url().startsWith(base));
 assert.ok(initial.every(page=>page.url()==='about:blank'||appPages.includes(page)),'persistent test profile contains only owned pages');
 const primary=appPages[0]||initial[0];assert.ok(primary,'persistent context has a primary page');primaryPages.set(context,primary);
 const inventory={scope,initial:await Promise.all(initial.map(async page=>({url:page.url(),primary:page===primary,client:appPages.includes(page)?await sourceClient(page):undefined}))),closedUnusedBlankPages:0};
 if(appPages.length)for(const page of initial)if(page!==primary&&page.url()==='about:blank'){await page.close();inventory.closedUnusedBlankPages++;}
 startupInventories.push(inventory);console.log('STARTUP PAGE INVENTORY',JSON.stringify(inventory));return context;
}
async function drop(page,count){await page.bringToFront();const box=await page.locator('.fm-board').boundingBox();if(box)await page.mouse.move(box.x+box.width*(count===1?.2:count===2?.8:.5),box.y+20);await page.getByRole('button',{name:'Drop fruit',exact:true}).click();await page.locator('.fm-count').filter({hasText:count===1?'1 fruit':`${count} fruits`}).waitFor();}
async function data(page){return await page.evaluate(()=>({score:localStorage.getItem('pocket-arcade:v1:best:fruit-merge'),settings:localStorage.getItem('pocket-arcade:v1:settings'),cookie:document.cookie}));}
async function diagnostic(page){return await bounded(page.evaluate(async()=>{
 const r=await navigator.serviceWorker.getRegistration();
 const query=(worker,type='ARCADE_VERSION')=>!worker?null:new Promise(resolve=>{const c=new MessageChannel(),t=setTimeout(()=>{c.port1.close();c.port2.close();resolve({state:worker.state,timeout:true});},3000);c.port1.onmessage=e=>{clearTimeout(t);c.port1.close();c.port2.close();resolve({state:worker.state,...e.data});};worker.postMessage({type},[c.port2]);});
 const states={},entryHits=[],requestedEntry=document.querySelector('script[type="module"][src]')?.src;for(const key of await caches.keys()){if((key.startsWith('pocket-arcade:')||key.startsWith('pocket-arcade-v2:'))){const cache=await caches.open(key),hit=requestedEntry&&await cache.match(requestedEntry);entryHits.push({cache:key,status:hit?.status});const response=await cache.match(new URL('.arcade-update-state',r.scope));if(response)states[key]=await response.json();}}
 return {scope:r.scope,requestedEntry,entryHits,controllerTimeline:window.updateControllerTimeline,controller:await query(navigator.serviceWorker.controller),active:await query(r.active),waiting:await query(r.waiting),installing:await query(r.installing),activeEvents:await query(r.active,'ARCADE_DIAGNOSTIC'),waitingEvents:await query(r.waiting,'ARCADE_DIAGNOSTIC'),states};
}),5000,'worker/ledger diagnostic (Node deadline)').catch(error=>({unavailable:error.message}));}
async function cacheKeys(page){return await page.evaluate(()=>caches.keys());}
async function captureNativeFailure(error){if(nativeTraceEnabled)await nativeTrace.failure(error,{scope,heldGate:!!gate,heldManifest:!!manifestGate});}
async function settleGate(){gate?.writeHead(200,{'Cache-Control':'no-store'});gate?.end('continue');gate=undefined;}
async function delayedNavigation(context,base,discover,expected){
 const delayed=await context.newPage();if(nativeTraceEnabled)await nativeTrace.ready(delayed);const navigation=delayed.goto(base+'?delayed-navigation=1');navigation.catch(()=>{});
 await poll(()=>!!gate,'old navigation response held before document commit');
 await discover();
 let discoveryDeferred=false;try{await poll(async()=>{
 const page=context.pages().find(page=>page!==delayed&&page.url().startsWith(base));
 if(expected)return await bounded(page.evaluate(expected=>new Promise(resolve=>{
 const query=worker=>{if(!worker){resolve(false);return;}const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();channel.port2.close();resolve(false);},3000);channel.port1.onmessage=event=>{clearTimeout(timer);channel.port1.close();channel.port2.close();resolve(event.data.version===expected);};worker.postMessage({type:'ARCADE_VERSION'},[channel.port2]);};
 navigator.serviceWorker.getRegistration().then(r=>query(r?.waiting?.state==='installed'?r.waiting:r?.active));
}),expected),3000,'installed worker identity');
 return await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return !!r?.installing||!!r?.waiting;});
 },'update fully installed before old response release');}catch(error){if(expected){await captureNativeFailure(error);console.error('HELD INSTALL DIAGNOSTIC',JSON.stringify(await diagnostic(context.pages().find(page=>page!==delayed&&page.url().startsWith(base)))));throw error;}discoveryDeferred=true;}
 // Chromium may keep an extended fetch alive through installing/waiting. Record
 // that state rather than assuming execution-unready clients are enumerable.
 const state=await context.pages().find(page=>page!==delayed&&page.url().startsWith(base)).evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return {active:r.active?.state,waiting:!!r.waiting,installing:!!r.installing};});
 await settleGate();await navigation;try{await delayed.locator('[data-study-topic],.game-card').first().waitFor();}catch(error){await captureNativeFailure(error);console.error('DELAYED BOOTSTRAP DIAGNOSTIC',JSON.stringify(await diagnostic(delayed)));throw error;}
 console.log('DELAYED NAVIGATION OBSERVED',JSON.stringify({state,discoveryDeferred}));return {delayed,state,discoveryDeferred};
}
async function acceptVersion(page,target){
 await poll(async()=>await version(page)===target.version||await page.evaluate(async expected=>{const r=await navigator.serviceWorker.getRegistration();if(r?.waiting?.state!=='installed')return false;return await new Promise(resolve=>{const c=new MessageChannel(),t=setTimeout(()=>{c.port1.close();c.port2.close();resolve(false);},1000);c.port1.onmessage=e=>{clearTimeout(t);c.port1.close();c.port2.close();resolve(e.data.version===expected);};r.waiting.postMessage({type:'ARCADE_VERSION'},[c.port2]);});},target.version),'expected active or installed waiting '+target.label);
 if(await version(page)!==target.version){
  if(!await page.getByRole('button',{name:'Close menu',exact:true}).isVisible())await menu(page);
  const button=page.getByRole('button',{name:'Reload to update',exact:true});await button.waitFor();await button.click();
  await poll(async()=>await page.locator('meta[name="arcade-release"]').getAttribute('content')===target.label,'user accepted waiting '+target.label);await page.locator('[data-study-topic],.game-card').first().waitFor();
  console.log('EXPLICIT WAITING UPDATE ACCEPTED',target.label);
 }
 await poll(async()=>await version(page)===target.version,'expected controller '+target.label);
}
async function cancelledCase(path,base){
 nativeTrace?.phase('cancelled-navigation',{scope:path});
 deployed=B;const profile=await mkdtemp('/tmp/qcc-update-profile-');profiles.push(profile);const context=await launch(profile),page=primaryPage(context);
 await home(page,base);await download(page);await poll(async()=>await version(page)===B.version,'fixed B controls canceled-navigation fixture');
 const cancelled=await context.newPage();if(nativeTraceEnabled)await nativeTrace.ready(cancelled);const attempt=cancelled.goto(base+'?delayed-navigation=1');attempt.catch(()=>{});await poll(()=>!!gate,'canceled B reservation response held');
 await cancelled.close();await settleGate();await attempt.catch(()=>{});console.log('CANCELED B NAVIGATION',path);
 const bPack='pocket-arcade-v2:'+path+':'+B.version+':pack';
 for(const target of [C,D]){
  deployed=target;await menu(page);await closeMenu(page);await acceptVersion(page,target);await page.reload();
  await poll(async()=>await page.locator('meta[name="arcade-release"]').getAttribute('content')===target.label,'canceled reservation fixture visible '+target.label);
  assert.ok((await cacheKeys(page)).includes(bPack),'unresolved B reservation keeps only its own dependencies');
 }
 await poll(async()=>!(await cacheKeys(page)).includes('pocket-arcade-v2:'+path+':'+C.version+':shell'),'canceled B reservation does not pin unrelated C forever');
 await context.tracing.stop({path:`${evidence}/update-cancelled-${path==='/'?'root':'subpath'}.zip`});await context.close();
}
async function fillQuota(page){return await page.evaluate(()=>{
 let size=0,step=1<<20;while(step){try{localStorage.setItem('update-test-quota','x'.repeat(size+step));size+=step;}catch(error){if(!(error instanceof DOMException)||error.name!=='QuotaExceededError')throw error;step=Math.floor(step/2);}}return size;
});}
async function holdActivation(page,target){
 await poll(()=>page.evaluate(expected=>new Promise(resolve=>{navigator.serviceWorker.getRegistration().then(r=>{const worker=r?.waiting;if(worker?.state!=='installed'){resolve(false);return;}const c=new MessageChannel(),t=setTimeout(()=>{c.port1.close();c.port2.close();resolve(false);},1000);c.port1.onmessage=e=>{clearTimeout(t);c.port1.close();c.port2.close();resolve(e.data.version===expected);};worker.postMessage({type:'ARCADE_VERSION'},[c.port2]);});}),target.version),'expected installed waiting '+target.label);
 await page.evaluate(async expected=>{
 const worker=(await navigator.serviceWorker.getRegistration()).waiting;if(!worker)throw new Error('Expected waiting update');const send=worker.postMessage.bind(worker);
 worker.postMessage=(message,...ports)=>{if(message.type==='ARCADE_ACTIVATE'){if(message.version!==expected)throw new Error('Wrong offered version');window.activationHeld=true;window.releaseTestActivation=()=>{window.activationHeld=false;send(message,...ports);};}else send(message,...ports);};
},target.version);}
async function releaseActivation(page){await page.evaluate(()=>{if(!window.activationHeld)throw new Error('Activation was not held');window.releaseTestActivation();});}
async function progress(page){return await page.evaluate(()=>{
 const data=JSON.parse(localStorage.getItem('pocket-arcade:v1:save:fruit-merge')).data;return {seed:data.seed,bag:data.bag,current:data.current,next:data.next,score:data.score,fruits:data.fruits.map(({id,tier})=>({id,tier}))};
});}
async function controlledWaitingCase(path,base){
 nativeTrace?.phase('controlled-waiting-WXY',{scope:path});
 console.log('CONTROLLED WAITING START',path);deployed=B;const profile=await mkdtemp('/tmp/qcc-update-profile-');profiles.push(profile);const context=await launch(profile),a=primaryPage(context);await home(a,base);await download(a);
 await menu(a);await a.locator('#motion').check();await closeMenu(a);await a.getByRole('link',{name:'Play Fruit Merge',exact:true}).click();await drop(a,1);await a.keyboard.press('Escape');await a.evaluate(()=>{window.retainedDocument='waiting-B';});
 const c=await context.newPage();if(nativeTraceEnabled)await nativeTrace.ready(c);await home(c,base);deployed=W;await menu(c);await closeMenu(c);await a.getByRole('button',{name:'Reload to update',exact:true}).waitFor();
 await holdActivation(a,W);nativeTrace?.mark('W-click-before-hold');await a.getByRole('button',{name:'Reload to update',exact:true}).click();await poll(()=>a.evaluate(()=>window.activationHeld),'explicit W activation held after first save');nativeTrace?.mark('W-held-after-first-save');
 await a.getByLabel('Study topic',{exact:true}).selectOption('quadratics');await a.getByLabel('Study topic',{exact:true}).selectOption('close-reading');nativeTrace?.mark('W-release-request',{heldGate:!!gate,heldManifest:!!manifestGate});await releaseActivation(a);nativeTrace?.mark('W-release-returned');await poll(async()=>await version(a)===W.version,'W activates after topic away and back');
 await poll(async()=>!await a.locator('#reload-update').isDisabled(),'topic cancellation flow settled');assert.equal(await a.evaluate(()=>window.retainedDocument),'waiting-B','topic away/back cancels pending reload');await a.getByRole('link',{name:'Games',exact:true}).click();await drop(a,2);
 console.log('CONTROLLED TOPIC CANCELLATION PASS',path);await c.reload();deployed=X;await menu(c);await closeMenu(c);await a.keyboard.press('Escape');await a.getByRole('button',{name:'Reload to update',exact:true}).waitFor();await holdActivation(a,X);await a.getByRole('button',{name:'Reload to update',exact:true}).click();await poll(()=>a.evaluate(()=>window.activationHeld),'explicit X activation held');
 await a.getByRole('link',{name:'Games',exact:true}).click();await drop(a,3);await releaseActivation(a);await poll(async()=>await version(a)===X.version,'X activates without reloading resumed game');await a.getByRole('button',{name:'Pause game',exact:true}).waitFor();assert.equal(await a.evaluate(()=>window.retainedDocument),'waiting-B');
 console.log('CONTROLLED RESUME CANCELLATION PASS',path);await c.reload();deployed=Y;await menu(c);await closeMenu(c);await menu(a);await a.getByRole('button',{name:'Reload to update',exact:true}).waitFor();const savedProgress=await progress(a);await holdActivation(a,Y);await a.getByRole('button',{name:'Reload to update',exact:true}).click();await poll(()=>a.evaluate(()=>window.activationHeld),'explicit Y activation held after first durable save');
 assert.ok(await fillQuota(a)>1_000_000);await a.locator('#motion').uncheck();assert.equal(JSON.parse((await data(a)).settings).reducedMotion,true);await releaseActivation(a);
 await a.locator('#update-status').filter({hasText:'could not be saved'}).waitFor();assert.equal(await a.evaluate(()=>window.retainedDocument),'waiting-B','late preference failure refuses the actual reload');
 await a.evaluate(()=>localStorage.removeItem('update-test-quota'));await a.getByRole('button',{name:'Reload to update',exact:true}).click();await a.locator('.fm-count').filter({hasText:savedProgress.fruits.length===1?'1 fruit':`${savedProgress.fruits.length} fruits`}).waitFor();await a.getByRole('button',{name:'Pause game',exact:true}).click();assert.deepEqual(await progress(a),savedProgress,'the mounted game restores the saved basket and sequence');assert.equal(await a.locator('meta[name="arcade-release"]').getAttribute('content'),'Y');assert.equal(JSON.parse((await data(a)).settings).reducedMotion,false);
 await context.tracing.stop({path:`${evidence}/update-controlled-waiting-${path==='/'?'root':'subpath'}.zip`});await context.close();console.log('CONTROLLED WAITING PASS',path);
}
async function legacyWaitingCase(path,base,transition=false){
 nativeTrace?.phase(transition?'legacy-waiting-transition':'legacy-already-waiting',{scope:path});
 deployed=A;const profile=await mkdtemp('/tmp/qcc-update-profile-');profiles.push(profile);const context=await launch(profile),a=primaryPage(context);await home(a,base);await download(a);await a.getByRole('link',{name:'Play Fruit Merge',exact:true}).click();await drop(a,1);await a.keyboard.press('Escape');await a.evaluate(()=>{window.retainedDocument='legacy-A-with-waiting-L';});
 const b=await context.newPage();await home(b,base);deployed=L;await b.reload();
 await poll(()=>b.evaluate(expected=>new Promise(resolve=>{navigator.serviceWorker.getRegistration().then(r=>{if(r?.waiting?.state!=='installed'){resolve(false);return;}const c=new MessageChannel(),t=setTimeout(()=>{c.port1.close();c.port2.close();resolve(false);},1000);c.port1.onmessage=e=>{clearTimeout(t);c.port1.close();c.port2.close();resolve(e.data.version===expected);};r.waiting.postMessage({type:'ARCADE_VERSION'},[c.port2]);});}),L.version),'legacy L already waiting over active A');
 assert.equal(await version(b),A.version);
 if(transition){
  const observer=await context.newPage(),cdp=await context.newCDPSession(observer),versions=new Map();cdp.on('ServiceWorker.workerVersionUpdated',({versions:updates})=>{for(const value of updates)versions.set(value.versionId,value);});await cdp.send('ServiceWorker.enable');
  await poll(()=>[...versions.values()].some(value=>value.status==='installed'),'native legacy L waiting identity');const legacyId=[...versions.values()].find(value=>value.status==='installed').versionId;
  deployed=B;holdManifest=true;await b.reload();await poll(()=>!!manifestGate,'B manifest held while legacy L waits');
  await poll(()=>[...versions.values()].some(value=>value.status==='installing'),'native B installing identity');const successorId=[...versions.values()].find(value=>value.status==='installing').versionId;
  const candidate='pocket-arcade-v2:'+path+':'+B.version+':shell';let installer;await poll(async()=>{for(const worker of context.serviceWorkers())if(await bounded(worker.evaluate(()=>VERSION),3000,'installer identity').catch(()=>undefined)===B.version){installer=worker;return true;}return false;},'B installer execution context');const names=()=>bounded(installer.evaluate(()=>caches.keys()),3000,'installer cache observation');
  assert.ok((await names()).includes(candidate),'v2 candidate exists before L activates');await a.close();await b.close();
  await poll(()=>versions.get(legacyId)?.status==='activated','legacy L actually activates while B manifest is held');assert.equal(versions.get(successorId)?.status,'installing');assert.ok((await names()).includes(candidate),'legacy activation cleanup cannot touch v2 B');
  console.log('LEGACY ACTIVATED DURING MODERN INSTALL',JSON.stringify({scope:path,legacy:versions.get(legacyId),successor:versions.get(successorId),caches:await names()}));
  holdManifest=false;manifestGate.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});manifestGate.end(B.map.get('/offline-manifest.json'));manifestGate=undefined;
  await poll(()=>versions.get(successorId)?.status==='activated','B activates after legacy L transition');await home(observer,base);assert.equal(await observer.locator('meta[name="arcade-release"]').getAttribute('content'),'B');assert.equal(await version(observer),B.version);
  assert.ok(!(await cacheKeys(observer)).includes('pocket-arcade:'+path+':'+A.version+':pack'),'legacy cleanup ran against its own namespace');await cdp.detach();await context.tracing.stop({path:`${evidence}/update-legacy-transition-${path==='/'?'root':'subpath'}.zip`});await context.close();console.log('LEGACY TRANSITION MIGRATION PASS',path);return;
 }
 deployed=B;await b.reload();await poll(async()=>await version(b)===B.version,'fixed B migrates active A with already-waiting legacy L');
 assert.equal(await a.evaluate(()=>window.retainedDocument),'legacy-A-with-waiting-L');await b.reload();assert.equal(await b.locator('meta[name="arcade-release"]').getAttribute('content'),'B');
 await context.setOffline(true);await a.bringToFront();await a.getByRole('link',{name:'Games',exact:true}).click();await drop(a,2);await context.setOffline(false);
 assert.ok((await cacheKeys(a)).includes('pocket-arcade:'+path+':'+A.version+':pack'));await context.tracing.stop({path:`${evidence}/update-legacy-waiting-${path==='/'?'root':'subpath'}.zip`});await context.close();console.log('LEGACY ALREADY WAITING MIGRATION PASS',path);
}
async function legacyNavigationCase(path,base){
 nativeTrace?.phase('legacy-delayed-navigation',{scope:path});
 deployed=A;const profile=await mkdtemp('/tmp/qcc-update-profile-');profiles.push(profile);const context=await launch(profile),page=primaryPage(context);await home(page,base);await download(page);
 const observed=await delayedNavigation(context,base,async()=>{deployed=B;await page.reload();});
 assert.equal(await observed.delayed.locator('meta[name="arcade-release"]').getAttribute('content'),'A');
 await page.reload();await poll(async()=>await version(page)===B.version,'legacy delayed-navigation fixture activation after response release');
 assert.ok((await cacheKeys(page)).includes('pocket-arcade:'+path+':'+A.version+':pack'),'execution-unready legacy HTML retains its old assets');
 await context.tracing.stop({path:`${evidence}/update-legacy-navigation-${path==='/'?'root':'subpath'}.zip`});await context.close();return observed.state;
}
try{
 for(const path of (process.env.ARCADE_UPDATE_SCOPE?[process.env.ARCADE_UPDATE_SCOPE]:['/','/Qcc-games-/'])){
  scope=path;deployed=A;holdManifest=false;const tag=path==='/'?'root':'subpath',base=`http://127.0.0.1:4181${path}`,profile=await mkdtemp('/tmp/qcc-update-profile-');profiles.push(profile);
  if(process.env.ARCADE_UPDATE_CASE==='legacy-transition'){await legacyWaitingCase(path,base,true);results.push({scope:path,legacyWaitingActivatedDuringInstall:true});continue;}
  if(process.env.ARCADE_UPDATE_CASE==='legacy-waiting'){await legacyWaitingCase(path,base);results.push({scope:path,legacyAlreadyWaitingMigration:true});continue;}
  if(process.env.ARCADE_UPDATE_CASE==='waiting'){await controlledWaitingCase(path,base);results.push({scope:path,controlledWaiting:true});continue;}
  if(!process.env.ARCADE_UPDATE_CASE){await legacyWaitingCase(path,base);await legacyWaitingCase(path,base,true);deployed=A;}
  nativeTrace?.phase('migration',{scope:path});console.log('SEED LEGACY',path);let context=await launch(profile),a=primaryPage(context);await home(a,base);await download(a);await poll(()=>a.evaluate(()=>!!navigator.serviceWorker.controller),'legacy control');assert.equal(await version(a),A.version);
  await a.evaluate(()=>{localStorage.setItem('pocket-arcade:v1:best:fruit-merge','1234');localStorage.setItem('pocket-arcade:v1:settings',JSON.stringify({sound:false,reducedMotion:true,colorBlind:true}));document.cookie='retainedCookie=unchanged; path=/';});await context.close();
  context=await launch(profile);a=primaryPage(context);await home(a,base);await a.getByRole('link',{name:'Play Fruit Merge',exact:true}).click();await drop(a,1);await a.keyboard.press('Escape');await a.evaluate(()=>{window.retainedDocument='legacy-A';});const before=await data(a);
  const b=await context.newPage();await home(b,base);
  console.log('DEPLOY FIXED B',path);deployed=B;await b.reload();
  await poll(async()=>await version(b)===B.version,'B activation with legacy tabs retained');
  assert.equal(await a.evaluate(()=>window.retainedDocument),'legacy-A','activation must not reload the old game document');
  assert.ok((await cacheKeys(a)).includes('pocket-arcade:'+path+':'+A.version+':pack'));assert.equal(B.map.has('/'+A.game),false);
  await context.setOffline(true);await a.bringToFront();await a.getByRole('link',{name:'Games',exact:true}).click();await drop(a,2);await a.keyboard.press('Escape');
  assert.equal(await a.evaluate(url=>fetch(url).then(r=>r.ok),new URL(A.game,base).href),true,'old lazy asset survives removed server copy while offline');await context.setOffline(false);
  await b.reload();assert.equal(await b.locator('meta[name="arcade-release"]').getAttribute('content'),'B');await menu(b);assert.match(await b.locator('.menu-note').textContent(),/Release B/);await closeMenu(b);
  assert.equal(await a.evaluate(()=>window.retainedDocument),'legacy-A');assert.deepEqual(await data(b),before);await a.close();await b.close();await context.close();
  context=await launch(profile);a=primaryPage(context);await home(a,base);await a.getByRole('link',{name:'Play Fruit Merge',exact:true}).click();await a.locator('.fm-count').filter({hasText:'2 fruits'}).waitFor();assert.equal(await version(a),B.version);await download(a);
  assert.ok((await cacheKeys(a)).includes('pocket-arcade:'+path+':'+A.version+':pack'),'one-time legacy pack is deliberately pinned across profile restart');
  await a.keyboard.press('Escape');await a.evaluate(()=>{window.retainedDocument='modern-B';});
  // Preserve/adopt every restored app page and deliberately seed one extra B
  // document. Its live dependency must block reclamation until explicit update.
  const retainedBPages=context.pages().filter(page=>page!==a&&page.url().startsWith(base));retainedBPages.push(await context.newPage());
  const retainedB=[];for(const [i,page] of retainedBPages.entries()){await home(page,base);const client=await durableOwner(page,B),marker='retained-extra-B-'+i;await page.evaluate(marker=>window.retainedExtraDocument=marker,marker);retainedB.push({page,client,marker});}
  console.log('RETAINED B PAGE INVENTORY',JSON.stringify(retainedB.map(({client,marker})=>({client,marker}))));
  const c=await context.newPage();await home(c,base);
  // A mismatched installation must leave B navigation/gameplay working and must
  // not seal the active worker or change any retained document.
  broken.map.set('/offline-manifest.json',Buffer.from(JSON.stringify({version:'mismatched',files:[broken.entry]})));deployed=broken;
  const manifestRequests=requests.filter(r=>r.release==='broken'&&r.file==='/offline-manifest.json').length;await menu(c);await poll(()=>requests.filter(r=>r.release==='broken'&&r.file==='/offline-manifest.json').length>manifestRequests,'mismatched manifest requested by installer');await poll(()=>c.evaluate(async()=>!(await navigator.serviceWorker.getRegistration())?.installing),'failed inconsistent install settled');await closeMenu(c);assert.equal(await version(c),B.version);await c.reload();assert.equal(await c.locator('meta[name="arcade-release"]').getAttribute('content'),'B');deployed=C;
  console.log('DEPLOY C WITH MODERN NAVIGATION PENDING',path);
  const modernRace=await delayedNavigation(context,base,async()=>{await c.evaluate(()=>window.dispatchEvent(new Event('online')));},C.version);
  await c.evaluate(()=>window.dispatchEvent(new Event('online')));
  try{await acceptVersion(c,C);}catch(error){await captureNativeFailure(error);console.error('MODERN ACTIVATION DIAGNOSTIC',JSON.stringify(await diagnostic(c)));throw error;}assert.equal(await a.evaluate(()=>window.retainedDocument),'modern-B');
  assert.equal(await modernRace.delayed.locator('meta[name="arcade-release"]').getAttribute('content'),'B');await poll(()=>modernRace.delayed.evaluate(async({version,entry})=>{const r=await navigator.serviceWorker.getRegistration(),cache=await caches.open('pocket-arcade-v2:'+new URL(r.scope).pathname+':'+version+':shell'),response=await cache.match(new URL('.arcade-update-state',r.scope));if(!response)return false;const ledger=await response.json();return !ledger.pending.some(item=>item.entry===new URL(entry,r.scope).href)&&ledger.owners.some(item=>item.entry===new URL(entry,r.scope).href);},{version:C.version,entry:B.entry}),'delayed live B document durably acknowledges its module');console.log('DELAYED BOOTSTRAP VERIFIED',JSON.stringify(await diagnostic(modernRace.delayed)));await modernRace.delayed.close();
  await c.reload();await menu(c);assert.match(await c.locator('.menu-note').textContent(),/Release C/);await closeMenu(c);
  await a.bringToFront();await a.getByRole('button',{name:'Reload to update',exact:true}).waitFor();assert.equal(await a.locator('#app').getAttribute('aria-hidden'),'true');
  assert.equal(await a.evaluate(()=>document.activeElement?.id),'study-title','update notice does not steal focus');
  await a.screenshot({path:`${evidence}/update-study-${tag}-390.png`,fullPage:false});await a.setViewportSize({width:1366,height:768});await a.screenshot({path:`${evidence}/update-study-${tag}-1366.png`,fullPage:false});await a.setViewportSize({width:390,height:844});
  const oldPack='pocket-arcade-v2:'+path+':'+B.version+':pack';assert.ok((await cacheKeys(a)).includes(oldPack));assert.equal(C.map.has('/'+B.game),false);
  console.log('OFFLINE MODERN RETENTION',path);await bounded(context.setOffline(true),5000,'Playwright offline transition');assert.equal(await a.evaluate(url=>fetch(url).then(r=>r.ok),new URL(B.game,base).href),true);
  for(const {page,marker} of retainedB){assert.equal(await page.evaluate(()=>window.retainedExtraDocument),marker,'extra B document survives C activation');assert.ok((await cacheKeys(page)).includes(oldPack));assert.equal(await page.evaluate(url=>fetch(url).then(response=>response.ok),new URL(B.game,base).href),true,'extra B can read its removed immutable asset offline');}
  await context.setOffline(false);
  // Fill actual browser localStorage, without replacing its methods. Only this
  // test-owned key is removed for recovery; no user storage is cleared.
  console.log('ACTUAL QUOTA TEST',path);await a.getByRole('link',{name:'Games',exact:true}).click();const quota=await a.evaluate(()=>{
   let size=0,step=1<<20;while(step){try{localStorage.setItem('update-test-quota','x'.repeat(size+step));size+=step;}catch(error){if(!(error instanceof DOMException)||error.name!=='QuotaExceededError')throw error;step=Math.floor(step/2);}}return {size};
  });assert.ok(quota.size>1_000_000);await drop(a,3);await menu(a);await a.evaluate(()=>{
   let size=0,step=1<<20;while(step){try{localStorage.setItem('update-test-quota','x'.repeat(size+step));size+=step;}catch(error){if(!(error instanceof DOMException)||error.name!=='QuotaExceededError')throw error;step=Math.floor(step/2);}}return {size};
  });await a.locator('#motion').uncheck();await a.getByRole('button',{name:'Reload to update',exact:true}).click();assert.equal(await a.evaluate(()=>window.retainedDocument),'modern-B');await a.locator('#update-status').filter({hasText:'could not be saved'}).waitFor();assert.equal(JSON.parse((await data(a)).settings).reducedMotion,true,'failed preference write remains memory-only until recovery');await a.screenshot({path:`${evidence}/update-save-blocked-${tag}.png`,fullPage:false});
  // Hold an actual future install while C reclaims B. A C runtime cleanup must
  // never enumerate/delete the newly-created D cache.
  console.log('FUTURE INSTALL DURING CLEANUP',path);deployed=D;holdManifest=true;await menu(c);await poll(()=>!!manifestGate,'future D manifest fetch held');await closeMenu(c);const futureShell='pocket-arcade-v2:'+path+':'+D.version+':shell';assert.ok((await cacheKeys(c)).includes(futureShell));
  await c.evaluate(async()=>{window.futureInstallerBeforeGc=(await navigator.serviceWorker.getRegistration()).installing;});const beforeGc=await diagnostic(c);assert.equal(beforeGc.installing?.version,D.version,'exact future D installer is present before GC');assert.equal(beforeGc.installing?.state,'installing');
  await a.evaluate(()=>localStorage.removeItem('update-test-quota'));await a.getByRole('button',{name:'Reload to update',exact:true}).click();await a.locator('.fm-count').filter({hasText:'3 fruits'}).waitFor();assert.equal(await a.locator('meta[name="arcade-release"]').getAttribute('content'),'C');assert.equal(JSON.parse((await data(a)).settings).reducedMotion,false);
  for(const {page,client,marker} of retainedB){
   assert.equal(await page.evaluate(()=>window.retainedExtraDocument),marker,'extra B document was not automatically navigated');assert.equal(await page.locator('meta[name="arcade-release"]').getAttribute('content'),'B');assert.ok((await cacheKeys(page)).includes(oldPack),'live extra B dependency keeps B assets');
   await menu(page);await page.getByRole('button',{name:'Reload to update',exact:true}).click();await poll(async()=>{const marker=await page.locator('meta[name="arcade-release"]').getAttribute('content'),entry=await page.locator('script[type="module"][src]').getAttribute('src');return marker==='C'&&!!entry&&new URL(entry,base).href===new URL(C.entry,base).href;},'extra B explicit reload reaches C document and module');const current=await durableOwner(page,C);retainedPageEvidence.push({scope,oldClient:client,currentClient:current,marker,retainedUntilExplicitReload:true,oldImmutableAssetWorkedOffline:true});
  }
  for(const page of context.pages().filter(page=>page.url().startsWith(base)))await durableOwner(page,C);
  console.log('ALL OWNED PAGES CURRENT BEFORE GC',path);
  await c.bringToFront();await c.evaluate(()=>window.dispatchEvent(new Event('online')));try{await poll(async()=>!(await cacheKeys(c)).includes(oldPack),'modern B caches reclaimed after old document safely reloads');}catch(error){await captureNativeFailure(error);console.error('RECLAMATION DIAGNOSTIC C',JSON.stringify(await diagnostic(c)));console.error('RECLAMATION DIAGNOSTIC GAME',JSON.stringify(await diagnostic(a)));throw error;}assert.ok((await cacheKeys(c)).includes(futureShell));assert.equal(await c.evaluate(async()=>(await navigator.serviceWorker.getRegistration()).installing===window.futureInstallerBeforeGc),true,'native future installer identity is unchanged across GC');const afterGc=await diagnostic(c);assert.equal(afterGc.installing?.version,D.version,'same future D installation survives GC');assert.equal(afterGc.installing?.state,'installing');assert.ok((await cacheKeys(c)).includes('pocket-arcade:'+path+':'+A.version+':pack'),'legacy pins propagated through C');
  holdManifest=false;manifestGate.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});manifestGate.end(D.map.get('/offline-manifest.json'));manifestGate=undefined;await acceptVersion(c,D);
  assert.equal(await a.locator('meta[name="arcade-release"]').getAttribute('content'),'C','future activation still does not reload an active game');
  await a.keyboard.press('Escape');await a.getByRole('button',{name:'Reload to update',exact:true}).click();await a.locator('.fm-count').filter({hasText:'3 fruits'}).waitFor();assert.equal(await a.locator('meta[name="arcade-release"]').getAttribute('content'),'D');
  await a.close();await c.close();for(const {page} of retainedB)await page.close();await context.close();context=await launch(profile);const restored=primaryPage(context);await home(restored,base);await restored.getByRole('link',{name:'Play Fruit Merge',exact:true}).click();await restored.locator('.fm-count').filter({hasText:'3 fruits'}).waitFor();assert.equal(await version(restored),D.version);await poll(async()=>!(await cacheKeys(restored)).includes('pocket-arcade-v2:'+path+':'+C.version+':shell'),'next generation C reclaimed without re-pinning already removed B');assert.equal(JSON.parse((await data(restored)).settings).reducedMotion,false);assert.equal((await data(restored)).score,before.score);assert.equal((await data(restored)).cookie,before.cookie);
  await context.tracing.stop({path:`${evidence}/update-${tag}.zip`});await context.close();
  results.push({scope:path,oldVersion:A.version,versions:[B.version,C.version,D.version],persistentProfileRestarted:true,naturalReloadDiscovery:true,noAutomaticDocumentReload:true,legacyDelayedNavigation:false,modernDelayedNavigation:true,legacyPackPinned:true,oldLazyChunkRemovedFromServer:true,oldGamePlayedOffline:true,persistentProfileWorkerRestart:true,forcedLiveWorkerRestart:false,visibleNewContent:true,scoreSettingsCookiePreserved:true,actualProgressRestored:true,quotaBlockedUserReload:true,pendingPreferenceRecovered:true,inconsistentInstallRecovery:true,modernCachesCleaned:true,futureInstallCachePreserved:true});console.log('MIGRATION PASS',path);await controlledWaitingCase(path,base);Object.assign(results.at(-1),{waitingUpdateAccepted:true,resumeCancelsPendingReload:true,lateQuotaBlocksActualReload:true});await cancelledCase(path,base);const legacyNavigation=await legacyNavigationCase(path,base);Object.assign(results.at(-1),{cancelledReservationAllowsLaterGc:true,legacyDelayedNavigation:true,legacyDelayedNavigationWorkerState:legacyNavigation});
 }
}catch(error){
 failed=true;console.error('LOCAL FAILURE PROFILES RETAINED',JSON.stringify(profiles));
 console.error(error);await captureNativeFailure(error);await settleGate();manifestGate?.end();console.error('REQUESTS AT FAILURE',JSON.stringify(requests.slice(-40)));for(const [i,context] of contexts.entries()){for(const page of context.pages()){if(!page.isClosed())console.error('FAILURE WORKER',JSON.stringify(await diagnostic(page)));console.error('FAILURE PAGE',page.url(),await page.evaluate(()=>({marker:document.querySelector('meta[name="arcade-release"]')?.getAttribute('content'),focus:document.activeElement?.id,body:document.body.className,status:document.querySelector('#update-status')?.textContent,disabled:document.querySelector('#reload-update')?.disabled})).catch(()=>null));}await Promise.race([context.tracing.stop({path:`${evidence}/update-failure-${i}.zip`}).catch(()=>{}),new Promise(resolve=>setTimeout(resolve,5000))]);}throw error;
}finally{
 gate?.end('stop');manifestGate?.end();for(const context of contexts)await context.close().catch(()=>{});server.closeAllConnections();await new Promise(resolve=>server.close(resolve));if(!failed)for(const profile of profiles)await rm(profile,{recursive:true,force:true});
 await writeFile(evidence+'/update-results.json',JSON.stringify({recordedAt:new Date().toISOString(),results,requests,startupInventories,retainedPageEvidence,retainedProfiles:failed?profiles:[]},null,2));
}
console.log(JSON.stringify(results,null,2));
