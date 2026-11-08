import * as esbuild from 'esbuild';
import {Miniflare} from 'miniflare';
import {fileURLToPath, pathToFileURL} from 'node:url';

/** Same compatibility date as `.github/workflows/pages.yml`. */
export const POPULARITY_D1_COMPATIBILITY_DATE='2026-11-04';

/** In-memory D1 and the cleanup module. The collection flag is not bound. */
export async function startLocalCleanup(){
 const built=await esbuild.build({
  entryPoints:[fileURLToPath(new URL('./movie-popularity-cleanup-local-entry.ts',import.meta.url))],
  bundle:true,format:'esm',platform:'neutral',write:false,target:'es2022',loader:{'.sql':'text'},
 });
 const script=built.outputFiles[0]?.text;
 if(!script)throw new Error('Cleanup bundle was empty');
 const mf=new Miniflare({
  unsafeTriggerHandlers:true,
  workers:[{config:{
   name:'movie-popularity-cleanup-local',
   compatibilityDate:POPULARITY_D1_COMPATIBILITY_DATE,
   manifest:{mainModule:'index.js',modules:{'index.js':{type:'esm',contents:script}}},
   env:{MOVIE_POPULARITY_DB:{type:'d1',id:`movie-popularity-cleanup-${crypto.randomUUID()}`,dev:{remote:false}}},
  }}],
 });
 const call=async request=>{
  const body=request.method==='GET'||request.method==='HEAD'?undefined:await request.arrayBuffer();
  return mf.dispatchFetch(request.url,{method:request.method,headers:[...request.headers.entries()],body:body?.byteLength?body:undefined});
 };
 return {call,async dispose(){await mf.dispose();}};
}

export async function runLocalCleanup(time=Date.now()){
 const preview=await startLocalCleanup();
 try{
  const schema=await preview.call(new Request('http://cleanup.local/__local/schema',{method:'POST'}));
  if(!schema.ok)throw new Error(`Local schema failed (${schema.status})`);
  const scheduled=await preview.call(new Request(`http://cleanup.local/cdn-cgi/local/scheduled?cron=${encodeURIComponent('15 * * * *')}&time=${time}`));
  const counts=await preview.call(new Request('http://cleanup.local/__local/counts'));
  return {ok:scheduled.ok,status:scheduled.status,counts:counts.ok?await counts.json():undefined};
 }finally{await preview.dispose();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const result=await runLocalCleanup();
 if(!result.ok){console.error(`Local cleanup failed (${result.status}).`);process.exitCode=1;}
 else console.log(`Local cleanup finished. Compatibility date ${POPULARITY_D1_COMPATIBILITY_DATE}. Collection flag was not set. No remote database was used. Rows: ${JSON.stringify(result.counts)}.`);
}
