import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';

export async function verifyBuiltKillSwitch(directory='dist'){
 const source=await readFile(join(directory,'sw.js'),'utf8');
 assert.equal(source,await readFile('public/sw.js','utf8'),'The build must ship the recovery worker unchanged at sw.js');
 const listeners=new Map(),names=new Set(['pocket-arcade:/:old:shell','pocket-arcade-v2:/:old:pack','unrelated-cache']);
 let skipped=0,claimed=false,enumerated=false,registered=true;
 const urls=['https://arcade.test/?one#/collection','https://arcade.test/?two#/collection'],navigated=[];
 const self={
  addEventListener(name,handler){assert(!listeners.has(name),'Unexpected duplicate lifecycle handler');listeners.set(name,handler);},
  async skipWaiting(){skipped++;},
  registration:{async unregister(){assert(claimed,'Claim clients before unregistering');assert(enumerated,'Enumerate windows before unregistering');registered=false;return true;}},
  clients:{
   async claim(){assert.deepEqual([...names],['unrelated-cache'],'Delete only pocket-arcade caches before claiming clients');claimed=true;},
   async matchAll(options){assert(claimed,'Claim clients before enumerating windows');assert(registered,'Enumerate windows before unregistering');assert.equal(options.type,'window');enumerated=true;return urls.map(url=>({url,async navigate(target){assert(!registered,'Unregister before navigating');assert.equal(target,url);navigated.push(target);}}));}
  }
 };
 runInNewContext(source,{self,caches:{async keys(){return [...names];},async delete(name){return names.delete(name);}}},{timeout:1000});
 assert.deepEqual([...listeners.keys()].sort(),['activate','install'],'The kill switch must have NO fetch handler or caching protocol');
 async function emit(name){
  const tasks=[];listeners.get(name)({waitUntil:task=>tasks.push(task)});
  let timer;
  try{await Promise.race([Promise.all(tasks),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error(name+' did not finish')),3000);})]);}
  finally{clearTimeout(timer);}
 }
 await emit('install');assert.equal(skipped,1,'Install must call skipWaiting immediately');
 await emit('activate');assert.equal(registered,false,'The worker must unregister itself');
 assert.deepEqual([...names],['unrelated-cache'],'Unrelated caches must survive recovery');
 assert.deepEqual(navigated,urls,'Every window must navigate to its URL once');
 const headers=await readFile(join(directory,'_headers'),'utf8');
 const workerHeaders=headers.split(/\n\s*\n/).find(block=>block.startsWith('/sw.js\n'));
 assert.match(workerHeaders||'',/Cache-Control:.*no-cache.*max-age=0/,'sw.js must be served without a long cache');
 await assert.rejects(access(join(directory,'offline-manifest.json')),'The broken legacy offline manifest must stay retired');
 const packs=JSON.parse(await readFile(join(directory,'offline-packs.json'),'utf8'));
 const offlineWorker=await readFile(join(directory,'offline-sw.js'),'utf8');
 assert.match(packs.version,/^[a-f0-9]{16}$/);
 assert(!offlineWorker.includes('__QCC_VERSION__'),'The safe worker must be versioned by the build');
 assert(offlineWorker.includes(packs.version),'The safe worker must match the downloaded files');
 assert.match(offlineWorker,/new Response\(await response\.blob\(\)/,'Redirected responses must be reconstructed before caching');
 assert.match(offlineWorker,/request\.mode==='navigate'/,'The offline worker must support an offline app launch');
 assert(packs.shell.includes('./')&&packs.shell.includes('offline-packs.json'),'The shell and pack metadata must be cached');
 assert.equal(Object.keys(packs.games).length,29,'Each game must have an explicit offline pack');
 for(const [id,pack]of Object.entries(packs.games)){
  assert(Array.isArray(pack.files)&&pack.files.length>0, 'Missing offline files for '+id);
  for(const file of pack.files)assert(!file.startsWith('/')&&!file.startsWith('..')&&!file.includes('://'),'Unsafe offline file in '+id);
 }
 
 async function scan(path){
  for(const item of await readdir(path,{withFileTypes:true})){
   const file=join(path,item.name);
   if(item.isDirectory())await scan(file);
   else if(/\.(?:[cm]?js|ts|html)$/.test(item.name)){
    const code=await readFile(file,'utf8');
    assert(!/serviceWorker\\s*\\.\\s*register\\s*\\(\\s*(?:new URL\\s*\\(\\s*)?['\"\x60]sw\\.js['\"\x60]/.test(code),'The broken legacy worker must never be registered: '+file);
   }
  }
 }
 await scan('src');await scan(directory);
 console.log('PASS: legacy worker retires safely; the new versioned offline worker and 29 opt-in game packs are emitted.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await verifyBuiltKillSwitch(process.argv[2]);
