// Reproducible local-only account/leaderboard traffic measurement. No production services.
// Run: node scripts/measure-sync.mjs --label before --port 4421 --output docs/evidence/sync-measurements.json
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'vite';
import {LocalDB,createLocalPool} from '../tests/support/local-db.mjs';
import {chromium} from '@playwright/test';

const args=process.argv.slice(2);
const option=(name,fallback)=>{const index=args.indexOf(name);return index<0?fallback:args[index+1];};
const label=option('--label','measurement'),port=Number(option('--port','4422'));
const output=resolve(option('--output','docs/evidence/sync-measurements.json'));
assert(Number.isInteger(port)&&port>1024,'Use an unprivileged local port.');
const origin=`http://127.0.0.1:${port}`;
const prefix='pocket-arcade:v1:',clockTime=1793000000000;
const username='MeasureSync',password='local measurement password';
const blockcraft={version:1,data:{version:2,seed:1,settings:{mode:'creative'},edits:[],systems:{legacyFixture:'x'.repeat(1999800)}},updated:1};
// Keep the legacy fixture just below both the 2 MiB database text cap and wire cap.
const saves={
 'save:blockcraft':{value:blockcraft,updated:1},
 'save:water-sort':{value:{version:1,data:{measurement:true},updated:1},updated:1},
 'best:snake':{value:12,updated:1},
 favourites:{value:['snake'],updated:1},
};
const fixtureBytes=Buffer.byteLength(JSON.stringify(saves['save:blockcraft']));
assert(fixtureBytes>1900000&&fixtureBytes<2097152,'Legacy fixture size is outside measurement bounds.');
await mkdir('.netlify',{recursive:true});
const directory=await mkdtemp(resolve('.netlify/measure-sync-'));
const database=new LocalDB({directory});
let pool,server,browser;
let handlerActive=0;
let browserTraffic=null;
const hasLarge=buffer=>{try{return !!JSON.parse(buffer.toString('utf8')).saves?.['save:blockcraft'];}catch{return false;}};
const sourcePaths=['src/accounts','src/core/storage.ts','src/core/content.ts','src/main.ts','src/leaderboard','db/migrations'];
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:10*1024*1024});
const gitSha=git('rev-parse','HEAD').trim();
const sourceHash=createHash('sha256');
const sourceFiles=[...new Set(git('ls-files','--cached','--others','--exclude-standard','--',...sourcePaths).trim().split('\n').filter(Boolean))].sort();
for(const path of sourceFiles)sourceHash.update(path+'\0').update(await readFile(path)).update('\0');
const run={label,gitSha,branch:git('branch','--show-current').trim(),applicationDirty:!!git('status','--porcelain','--',...sourcePaths).trim(),trackedSourceDiffSha256:createHash('sha256').update(git('diff','--no-ext-diff','--binary',gitSha,'--',...sourcePaths)).digest('hex'),sourceTreeSha256:sourceHash.digest('hex'),sourcePaths,measuredAt:new Date().toISOString(),flows:[]};

try{
 const connectionString=await database.start();
 await database.applyMigrations('db/migrations');
 pool=createLocalPool(connectionString);
 server=await createServer({cacheDir:resolve(directory,'vite-cache'),server:{host:'127.0.0.1',port,strictPort:true,hmr:false,watch:null},plugins:[{
  name:'measure-real-functions',configureServer(vite){vite.middlewares.use(async(req,res,next)=>{
   res.setHeader('Content-Security-Policy',`default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:${port}`);
   const accounts=req.url?.startsWith('/.netlify/functions/accounts');
   if(!accounts&&!req.url?.startsWith('/.netlify/functions/leaderboard'))return next();
   handlerActive++;
   try{
    const module=await vite.ssrLoadModule(accounts?'/src/accounts/server.ts':'/src/leaderboard/server.ts');
    const handle=(accounts?module.createAccountsHandler:module.createLeaderboardHandler)(pool);
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>(accounts?2097152:2048)){res.writeHead(413,{'Cache-Control':'no-store'});res.end('Request too large');return;}chunks.push(chunk);}
    const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value)headers.set(key,Array.isArray(value)?value.join(','):value);
    const request=new Request(`${origin}${req.url}`,{method:req.method,headers,body:['POST','PUT'].includes(req.method)?Buffer.concat(chunks):undefined});
    const response=await handle(request),body=await response.text(),requestBody=Buffer.concat(chunks),url=new URL(request.url);
    browserTraffic?.push({endpoint:url.pathname.split('/').at(-1),action:url.searchParams.get('action'),method:req.method,status:response.status,syncProtocol:req.headers['x-qcc-sync']??'1',requestBytes:requestBody.length,responseBytes:Buffer.byteLength(body),requestContainsBlockcraft:hasLarge(requestBody),responseContainsBlockcraft:hasLarge(Buffer.from(body))});
    res.writeHead(response.status,Object.fromEntries(response.headers));res.end(body);
   }catch{res.writeHead(503,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Local measurement handler failed."}');}
   finally{handlerActive--;}
  });},
 }]});
 await server.listen();
 // Account creation/seeding is fixture setup and is excluded from browser measurements.
 const signup=await fetch(`${origin}/.netlify/functions/accounts?action=signup`,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin},body:JSON.stringify({username,password})});
 assert.equal(signup.status,201,'Local fixture account could not be created.');
 const seededSession=await signup.json();
 const accountId=(await pool.query('SELECT id FROM accounts WHERE username=$1',[username])).rows[0].id;
 for(const [key,record] of Object.entries(saves))await pool.query('INSERT INTO account_saves(account_id,key,value,updated) VALUES ($1,$2,$3::jsonb,$4)',[accountId,key,JSON.stringify(record.value),record.updated]);
 const dbBytes=Number((await pool.query("SELECT octet_length(value::text) AS bytes FROM account_saves WHERE account_id=$1 AND key='save:blockcraft'",[accountId])).rows[0].bytes);
 assert(dbBytes<2097152,'Seeded database value exceeds its cap.');
 run.fixture={legacyBlockcraftRecordBytes:fixtureBytes,databaseValueTextBytes:dbBytes,smallKeys:Object.keys(saves).filter(k=>k!=='save:blockcraft')};
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),args:['--no-sandbox']});
 run.browser=browser.version();

 async function context(authenticated=false){
  const context=await browser.newContext({viewport:{width:1366,height:768},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(({prefix,saves,session,authenticated})=>{
   localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
   sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
   if(authenticated){
    localStorage.setItem(prefix+'accounts:guest','true');localStorage.setItem(prefix+'accounts:session',JSON.stringify(session));
    for(const [key,record] of Object.entries(saves)){localStorage.setItem(prefix+key,JSON.stringify(record.value));if(!key.startsWith('save:'))localStorage.setItem(prefix+'updated:'+key,String(record.updated));}
   }
  },{prefix,saves,session:seededSession,authenticated});
  const page=await context.newPage();
  page.setDefaultTimeout(15000);
  await page.clock.install({time:new Date(clockTime)});
  await page.clock.pauseAt(new Date(clockTime+1000));
  const traffic=[],network=[];browserTraffic=traffic;
  page.on('request',request=>{if(new URL(request.url()).pathname.startsWith('/.netlify/functions/'))network.push(request);});
  const settle=async()=>{
   for(let i=0;i<750;i++){
    await new Promise(resolve=>setTimeout(resolve,20));
    if(!handlerActive&&traffic.length===network.length){await new Promise(resolve=>setTimeout(resolve,20));if(!handlerActive&&traffic.length===network.length)return;}
   }
   throw new Error(`Local function I/O did not settle (handlers=${handlerActive},responses=${traffic.length},requests=${network.length}).`);
  };
  const advance=async(ms)=>{for(let elapsed=0;elapsed<ms;elapsed+=5000){await page.clock.runFor(Math.min(5000,ms-elapsed));await settle();}};
  const measure=async(name,duration,action)=>{
   await settle();const start=traffic.length;
   await action();await settle();
   const requests=traffic.slice(start),summary={name,simulatedDurationMs:duration,requests:requests.length,requestBytes:requests.reduce((n,r)=>n+r.requestBytes,0),responseBytes:requests.reduce((n,r)=>n+r.responseBytes,0),details:requests};
   summary.totalBytes=summary.requestBytes+summary.responseBytes;
   run.flows.push(summary);console.log(JSON.stringify({label,flow:name,requests:summary.requests,requestBytes:summary.requestBytes,responseBytes:summary.responseBytes}));return summary;
  };
  return {context,page,traffic,settle,advance,measure};
 }

 // Capture the real UI login independently: old clients cannot accept this legacy read.
 const login=await context();
 await login.page.goto(origin);await login.page.locator('#accounts-dialog').waitFor({state:'visible'});
 const loginFlow=await login.measure('seeded-account-login',0,async()=>{
  await login.page.locator('#account-username').fill(username);await login.page.locator('#account-password').fill(password);
  await login.page.locator('#accounts-dialog form button[type=submit]').click({force:true});
  let completed=false;
  for(let i=0;i<750;i++){
   completed=await login.page.evaluate(()=>!document.querySelector('#accounts-dialog').open||!document.querySelector('#accounts-dialog button[type=submit]').disabled);
   if(completed)break;
   await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert(completed,'Login did not complete.');
  // Allow the baseline's asynchronous digest/revocation to reach the real handler.
  await new Promise(resolve=>setTimeout(resolve,100));
 });
 loginFlow.loginAccepted=await login.page.evaluate(()=>!!localStorage.getItem('pocket-arcade:v1:accounts:session'));
 await login.context.close();

 // An already-authenticated browser is needed to compare old/new steady-state behavior
 // despite the baseline's first-login legacy-record rejection. It contains identical saves.
 const idle=await context(true);await idle.page.goto(origin);await idle.page.locator('.game-card').first().waitFor();await idle.settle();
 const smallFlow=await idle.measure('small-score-update',186000,async()=>{
  await idle.page.evaluate(async()=>{const store=await import('/src/core/storage.ts');store.recordScore('snake',13);window.dispatchEvent(new Event('online'));});
  await idle.advance(186000);
 });
 await idle.measure('signed-in-visible-idle-30-minutes',1800000,()=>idle.advance(1800000));
 // Chromium does not expose tab hiding consistently in headless mode. Override only
 // visibility properties and dispatch its actual event; timers/network remain real.
 await idle.page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});Object.defineProperty(document,'visibilityState',{configurable:true,get:()=> 'hidden'});document.dispatchEvent(new Event('visibilitychange'));});
 await idle.settle();
 await idle.measure('signed-in-hidden-idle-30-minutes',1800000,()=>idle.advance(1800000));
 await idle.context.close();

 const board=await context(true);await board.page.goto(origin+'/#/game/snake');await board.page.locator('#game-stage canvas').waitFor();await board.page.locator('#pause-game').click({force:true});await board.settle();
 assert.equal(await board.page.locator('#pause-game').getAttribute('aria-label'),'Resume game','Snake did not pause.');
 await board.measure('leaderboard-expanded-10-minutes',600000,async()=>{await board.page.locator('.lb-toggle').click({force:true});await board.settle();await board.advance(600000);});
 await board.page.locator('.lb-collapse').click({force:true});await board.advance(6000);
 await board.measure('paused-game-10-minutes',600000,()=>board.advance(600000));
 await board.context.close();

 const scorePuts=smallFlow.details.filter(r=>r.endpoint==='accounts'&&r.method==='PUT');
 assert(scorePuts.length>0,'The small score update did not reach the real account handler.');
 assert(scorePuts.every(r=>!r.requestContainsBlockcraft),'A small score request resent the legacy large save.');
 if(scorePuts.some(r=>r.syncProtocol==='2'))assert(scorePuts.every(r=>!r.responseContainsBlockcraft),'A v2 small score response echoed the legacy large save.');
 assert(run.flows.flatMap(f=>f.details).every(r=>r.status>0&&r.status<500),'A local function failed during measurement.');
 const previous=existsSync(output)?JSON.parse(await readFile(output,'utf8')):null;
 const evidence={schemaVersion:1,bytesDefinition:'Uncompressed UTF-8 HTTP request and response bodies recorded at the real local HTTP handler for Playwright Chromium requests; reconciled against browser request counts. Same-origin /.netlify/functions/ only. Excludes headers, TLS, compression, static assets, fixtures and teardown.',timing:'Playwright Chromium clock paused at 1793000001000; advance in 5-second steps, yielding until real local handler/browser response I/O settles after every step. Each flow begins after setup settles.',notes:[
  'Local Vite app, real account/leaderboard handlers, fresh local PGlite Postgres-compatible database with committed migrations; no external or production network.',
  'Legacy Blockcraft fixture is synthetic JSON of about 2 MB, seeded directly in the database because current write cap is 1 MiB. It exercises a legacy large record without weakening production validation.',
  'Login is measured separately. Steady-state flows use an existing authenticated browser with the identical database/local fixture so baseline first-login rejection does not prevent comparison.',
  'The small-score flow changes one score through the real storage module, dispatches the same reconnect event on both revisions, and advances 186 seconds to include the delayed leaderboard write and baseline periodic traffic. This leaves no pending improvement before clean idle.',
  'Body lengths are captured at the real local HTTP handler boundary and request counts reconciled with Chromium request events because Chromium omits completion events for some keepalive requests.',
  'Visible idle and hidden idle use the game library. Hidden flow excludes the one-time visibility transition flush; document.hidden/visibilityState are overridden and visibilitychange dispatched because headless tab visibility is unreliable.',
  'Expanded leaderboard is the desktop Snake sidebar with the game paused. Paused-game flow uses the same paused Snake game after collapsing the board and settling the transition.',
  'Body lengths are payload sizes, not billed database egress, compressed transfer bytes or predictions of physical device performance. Tokens, credentials, hashes and save contents are never written to evidence.',
 ],runs:previous?.runs??[]};
 evidence.runs=evidence.runs.filter(previous=>previous.label!==label);evidence.runs.push(run);
 await mkdir(dirname(output),{recursive:true});await writeFile(output,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({label,gitSha:run.gitSha,flows:run.flows.map(({details,...flow})=>flow)},null,2));
}finally{
 await browser?.close();await server?.close();await pool?.end();await database.stop();await rm(directory,{recursive:true,force:true});
}
