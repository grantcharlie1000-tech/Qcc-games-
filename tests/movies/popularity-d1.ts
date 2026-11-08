import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import * as esbuild from 'esbuild';
import {fileURLToPath} from 'node:url';

/** Pages builds functions with this compatibility date. Local D1 uses the same date. */
export const POPULARITY_D1_COMPATIBILITY_DATE='2026-11-04';
const SECRET='test-only-secret-not-for-production-123456';

type Binding={type:'d1';id:string;dev:{remote:false}}|{type:'json';value:string};

export async function openIsolatedWorker(script:string,options:{enabled?:boolean}={}){
 const env:Record<string,Binding>={
  MOVIE_POPULARITY_DB:{type:'d1',id:`movie-popularity-${crypto.randomUUID()}`,dev:{remote:false}},
 };
 if(options.enabled){
  env.MOVIE_POPULARITY_ENABLED={type:'json',value:'true'};
  env.MOVIE_POPULARITY_SECRET={type:'json',value:SECRET};
 }
 const mf=new Miniflare({
  unsafeTriggerHandlers:true,
  workers:[{config:{
   name:'movie-popularity-local',
   compatibilityDate:POPULARITY_D1_COMPATIBILITY_DATE,
   manifest:{mainModule:'index.js',modules:{'index.js':{type:'esm',contents:script}}},
   env,
  }}],
 });
 const call=async(request:Request)=>{
  const body=request.method==='GET'||request.method==='HEAD'?undefined:await request.arrayBuffer();
  return mf.dispatchFetch(request.url,{method:request.method,headers:[...request.headers.entries()],body:body&&body.byteLength?body:undefined});
 };
 return {call,async dispose(){await mf.dispose();}};
}

async function bundle(entry:string){
 const built=await esbuild.build({
  entryPoints:[entry],bundle:true,format:'esm',platform:'neutral',write:false,target:'es2022',
  loader:{'.sql':'text'},
 });
 const file=built.outputFiles[0];
 if(!file)throw new Error(`No bundle for ${entry}`);
 return file.text;
}

export async function startIsolatedPopularity(){
 const script=await bundle(fileURLToPath(new URL('./popularity-d1-worker.ts',import.meta.url)));
 const preview=await openIsolatedWorker(script,{enabled:true});
 const schema=readFileSync(fileURLToPath(new URL('../../docs/movie-popularity-schema.sql',import.meta.url)),'utf8');
 const setup=await preview.call(new Request('http://pop.test/__isolated_preview/schema',{method:'POST',body:schema}));
 if(!setup.ok)throw new Error(`Isolated D1 schema failed (${setup.status}): ${await setup.text()}`);
 return preview;
}

/** The cleanup module only. No collection flag and no popularity HTTP route. */