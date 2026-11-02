import assert from 'node:assert/strict';
import {readFile,readdir,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {runInNewContext} from 'node:vm';

export async function verifyBuiltKillSwitch(directory='dist'){
 const source=await readFile(join(directory,'sw.js'),'utf8');
 assert.equal(source,await readFile('public/sw.js','utf8'),'The build must ship the recovery worker unchanged at sw.js');
 const listeners=new Map(),names=new Set(['pocket-arcade:/:old:shell','pocket-arcade-v2:/:old:pack','unrelated-cache']);
 let skipped=0,claimed=false,registered=true;
 const urls=['https://arcade.test/?one#/collection','https://arcade.test/?two#/collection'],navigated=[];
 const self={
  addEventListener(name,handler){assert(!listeners.has(name),'Unexpected duplicate lifecycle handler');listeners.set(name,handler);},
  async skipWaiting(){skipped++;},
  registration:{async unregister(){assert(claimed,'Claim clients before unregistering');registered=false;return true;}},
  clients:{
   async claim(){assert.equal(names.size,0,'Delete ALL caches before claiming clients');claimed=true;},
   async matchAll(options){assert.equal(options.type,'window');return urls.map(url=>({url,async navigate(target){assert(!registered,'Unregister before navigating');assert.equal(target,url);navigated.push(target);}}));}
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
 assert.deepEqual(navigated,urls,'Every window must navigate to its URL once');
 const headers=await readFile(join(directory,'_headers'),'utf8');
 const workerHeaders=headers.split(/\n\s*\n/).find(block=>block.startsWith('/sw.js\n'));
 assert.match(workerHeaders||'',/Cache-Control:.*no-cache.*max-age=0/,'sw.js must be served without a long cache');
 await assert.rejects(access(join(directory,'offline-manifest.json')),'Offline packs must no longer be generated');
 async function scan(path){
  for(const item of await readdir(path,{withFileTypes:true})){
   const file=join(path,item.name);
   if(item.isDirectory())await scan(file);
   else if(/\.(?:[cm]?js|ts|html)$/.test(item.name)){
    const code=await readFile(file,'utf8');
    assert(!/\bserviceWorker\s*(?:\?\.|\.)\s*register\s*\(|\bserviceWorker\s*\[\s*['"]register['"]\s*\]/.test(code),'Worker registration is forbidden: '+file);
   }
  }
 }
 await scan('src');await scan(directory);
 console.log('PASS: built sw.js skips waiting, clears all caches, claims, unregisters and navigates once; no fetch handler, offline manifest or app worker registration.');
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await verifyBuiltKillSwitch(process.argv[2]);
