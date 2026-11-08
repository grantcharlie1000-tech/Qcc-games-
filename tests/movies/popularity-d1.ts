import {readFileSync} from 'node:fs';
import {Miniflare} from 'miniflare';
import * as esbuild from 'esbuild';
import {fileURLToPath} from 'node:url';

/** Local workerd D1. The installed binary accepts compatibility dates through 2026-08-06.
 * Nothing is created in a Cloudflare account. Persistence stays in Miniflare's temporary directory. */
export const POPULARITY_D1_COMPATIBILITY_DATE='2026-08-06';
const SECRET='test-only-secret-not-for-production-123456';

export async function startIsolatedPopularity(){
 const bundled=await esbuild.build({
  entryPoints:[fileURLToPath(new URL('./popularity-d1-worker.ts',import.meta.url))],
  bundle:true,format:'esm',platform:'neutral',write:false,target:'es2022',
 });
 const mf=new Miniflare({
  modules:true,
  script:bundled.outputFiles[0].text,
  compatibilityDate:POPULARITY_D1_COMPATIBILITY_DATE,
  d1Databases:['MOVIE_POPULARITY_DB'],
  d1Persist:false,
  bindings:{MOVIE_POPULARITY_ENABLED:'true',MOVIE_POPULARITY_SECRET:SECRET},
 });
 const call=async(request:Request)=>{
  const body=request.method==='GET'||request.method==='HEAD'?undefined:await request.arrayBuffer();
  return mf.dispatchFetch(request.url,{method:request.method,headers:[...request.headers.entries()],body:body&&body.byteLength?body:undefined});
 };
 const schema=readFileSync(fileURLToPath(new URL('../../docs/movie-popularity-schema.sql',import.meta.url)),'utf8');
 const setup=await call(new Request('http://pop.test/__isolated_preview/schema',{method:'POST',body:schema}));
 if(!setup.ok)throw new Error(`Isolated D1 schema failed (${setup.status}): ${await setup.text()}`);
 return {call,async dispose(){await mf.dispose();}};
}
