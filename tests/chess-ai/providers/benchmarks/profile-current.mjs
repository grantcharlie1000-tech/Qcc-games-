/** Diagnostic sampling only, never a wall-time or device benchmark. */
import {Session} from 'node:inspector';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Chess} from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';
const directory=await mkdtemp(join(tmpdir(),'qcc-profile-'));
const session=new Session();session.connect();
const post=(command,params={})=>new Promise((resolve,reject)=>session.post(command,params,(error,result)=>error?reject(error):resolve(result)));
try {
  const compiled=await build({entryPoints:['src/chess-ai/providers/beginner/engine.ts'],bundle:true,format:'esm',platform:'node',target:'node24',write:false,minify:false,treeShaking:false});
  const modulePath=join(directory,'model.mjs');await writeFile(modulePath,compiled.outputFiles[0].contents);
  const {computeMove}=await import(pathToFileURL(modulePath).href);
  const corpus=JSON.parse(await readFile(new URL('./hillclimb-900/human-900-validation-2.json',import.meta.url)));
  const inputs=corpus.positions.filter((_,i)=>i%23===0).slice(0,8).map(p=>({fen:p.fen,moveHistoryUci:p.history,legalMovesUci:new Chess(p.fen).moves({verbose:true}).map(m=>m.lan)}));
  for(const tier of [300,500,700,900])computeMove({...inputs[0],opponentId:`elo-${tier}`,thinkingTimeMs:tier===900?200:75},42);
  await post('Profiler.enable');await post('Profiler.start');
  const usage=[];
  for(const tier of [300,500,700,900]) {
    const started=performance.now(),cpu=process.cpuUsage(),work=[];
    for(let repeat=0;repeat<2;repeat++)for(const input of inputs)work.push(computeMove({...input,opponentId:`elo-${tier}`,thinkingTimeMs:tier===900?200:75},42+repeat));
    const spent=process.cpuUsage(cpu);
    usage.push({tier,moves:work.length,nodes:work.reduce((n,r)=>n+r.nodes,0),wallMs:performance.now()-started,userCpuMs:spent.user/1000,systemCpuMs:spent.system/1000});
  }
  const {profile}=await post('Profiler.stop');
  const counts=new Map();for(const id of profile.samples)counts.set(id,(counts.get(id)||0)+1);
  const hot=profile.nodes.map(n=>({name:n.callFrame.functionName,line:n.callFrame.lineNumber+1,samples:counts.get(n.id)||0})).sort((a,b)=>b.samples-a.samples);
  await writeFile(new URL('./hillclimb-tiers/profile-before-speed.json',import.meta.url),JSON.stringify({generatedAt:new Date().toISOString(),method:'Inspector sampling around current computeMove calls. Process CPU usage includes profiling, GC and compilation overhead; diagnostic only. No performance comparison or phone claim.',usage,hot,profile},null,2));
  console.log(JSON.stringify({usage,hot:hot.slice(0,20)},null,2));
}finally{session.disconnect();await rm(directory,{recursive:true,force:true});}
