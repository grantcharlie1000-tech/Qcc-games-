import {cp,mkdtemp,readFile,readdir,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
export async function readBuild(directory){const files=new Map();async function walk(dir){for(const item of await readdir(dir,{withFileTypes:true})){const file=join(dir,item.name);if(item.isDirectory())await walk(file);else if(!file.endsWith('.map'))files.set('/'+file.slice(directory.length+1),await readFile(file));}}await walk(directory);return files;}
export async function legacyBuild(){
 const root=process.cwd(),project=await mkdtemp(join(tmpdir(),'qcc-legacy-build-'));
 try{
  for(const path of ['src','public','scripts','index.html','package.json','vite.config.ts'])await cp(join(root,path),join(project,path),{recursive:true});
  await symlink(join(root,'node_modules'),join(project,'node_modules'),'dir');
  for(const [fixture,target] of [['main.ts.fixture','src/main.ts'],['offline.ts.fixture','src/core/offline.ts'],['sw.js.fixture','public/sw.js'],['offline-manifest.mjs.fixture','scripts/offline-manifest.mjs']])await cp(join(root,'tests/fixtures/retained-update',fixture),join(project,target));
  await run(process.execPath,[resolve('node_modules/vite/bin/vite.js'),'build'],{cwd:project,maxBuffer:2_000_000});
  await run(process.execPath,['scripts/offline-manifest.mjs'],{cwd:project,maxBuffer:2_000_000});
  return await readBuild(join(project,'dist'));
 }finally{await rm(project,{recursive:true,force:true});}
}
export function release(build,label){
 const map=new Map(build),manifest=JSON.parse(map.get('/.vite/manifest.json')),pack=JSON.parse(map.get('/offline-manifest.json'));
 const oldEntry=manifest['index.html'].file,oldGame=manifest['src/games/fruit-merge/index.ts'].file;
 const entry=oldEntry.replace('.js',`-${label}.js`),game=oldGame.replace('.js',`-${label}.js`),version=pack.version+'-'+label;
 map.delete('/'+oldEntry);map.delete('/'+oldGame);
 map.set('/'+game,build.get('/'+oldGame));
 map.set('/'+entry,Buffer.from(build.get('/'+oldEntry).toString().replaceAll(oldGame.split('/').at(-1),game.split('/').at(-1)).replace(/No ads\.(?=[^<]*<br>Made for a little time to play\.)/,`Release ${label}. No ads.`)));
 map.set('/index.html',Buffer.from(build.get('/index.html').toString().replace('<head>',`<head><meta name="arcade-release" content="${label}">`).replaceAll(oldEntry,entry).replaceAll(oldGame,game)));
 // Test-only response gate leaves legacy fetch/cache/lifecycle logic intact.
 const gate=String.raw`const observe=self.addEventListener.bind(self),debug={pending:{},done:[],skipCalls:0,skipDone:0};let eventId=0;
observe('message',event=>{if(event.data?.type==='ARCADE_DIAGNOSTIC')event.ports[0]?.postMessage(debug);if(event.data?.type==='ARCADE_DIAGNOSTIC_CLIENT')event.ports[0]?.postMessage({id:event.source?.id,url:event.source?.url});});
const skip=self.skipWaiting.bind(self);self.skipWaiting=()=>{debug.skipCalls++;return skip().then(value=>{debug.skipDone++;return value;});};
self.addEventListener=(name,handler)=>observe(name,event=>{
 if(name==='fetch')event.handled.then(()=>debug.done.push({name:'handled',url:event.request.url}),error=>debug.done.push({name:'handled',url:event.request.url,error:String(error)}));
 if(name==='fetch'&&event.request.mode==='navigate')debug.done.push({name:'navigation-start',url:event.request.url,resultingClientId:event.resultingClientId,clientId:event.clientId});
 if(name==='message'&&event.data?.type==='ARCADE_CLIENT_READY')debug.done.push({name:'ready-source',id:event.source?.id,entry:event.data.entry});
 const wait=event.waitUntil.bind(event);event.waitUntil=task=>{const id=++eventId;debug.pending[id]={name,type:event.data?.type,url:event.request?.url};wait(Promise.resolve(task).then(value=>{debug.done.push(debug.pending[id]);delete debug.pending[id];return value;},error=>{debug.done.push({...debug.pending[id],error:String(error)});delete debug.pending[id];throw error;}));};
 if(name==='fetch'&&event.request.mode==='navigate'&&new URL(event.request.url).searchParams.has('delayed-navigation')){const respond=event.respondWith.bind(event);event.respondWith=result=>respond(fetch(new URL('test-navigation-gate',self.registration.scope)).then(response=>response.text()).then(()=>result));}
 handler(event);
});
`;
 map.set('/sw.js',Buffer.from(gate+build.get('/sw.js').toString().replaceAll(pack.version,version).replaceAll(oldEntry,entry).replaceAll(oldGame,game)));
 map.set('/offline-manifest.json',Buffer.from(JSON.stringify({version,files:pack.files.map(file=>file===oldEntry?entry:file===oldGame?game:file)})));
 return {map,version,entry,game,label};
}

// Deliberately waiting fixture tests the explicit UI path, without changing the
// production worker's automatic migration policy. The page fixture delays delivery of ACTIVATE;
// the worker handles the real message with its production event lifetime.
export function waitingRelease(build,label){
 const value=release(build,label);let script=value.map.get('/sw.js').toString();
 script=script.replace(' await self.skipWaiting();',' /* test fixture deliberately waits for user activation */');
 value.map.set('/sw.js',Buffer.from(script));return value;
}
