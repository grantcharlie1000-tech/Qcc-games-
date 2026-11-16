import {Session} from 'node:inspector';
import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {Chess} from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[],entries:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
const session=new Session();session.connect();
const post=(command,params={})=>new Promise((resolve,reject)=>session.post(command,params,(error,result)=>error?reject(error):resolve(result)));
try {
  const {computeMove}=await server.ssrLoadModule('/tests/chess-ai/providers/benchmarks/hillclimb-tiers/baseline/engine.ts');
  const corpus=JSON.parse(await readFile(new URL('./hillclimb-900/human-900-validation-2.json',import.meta.url)));
  const inputs=corpus.positions.filter((_,i)=>i%23===0).slice(0,8).map(p=>({fen:p.fen,moveHistoryUci:p.history,legalMovesUci:new Chess(p.fen).moves({verbose:true}).map(m=>m.lan)}));
  await post('Profiler.enable');await post('Profiler.start');
  for(const opponentId of ['elo-300','elo-500','elo-700','elo-900'])for(const input of inputs)computeMove({...input,opponentId,thinkingTimeMs:opponentId==='elo-900'?200:75},42);
  const {profile}=await post('Profiler.stop');
  const counts=new Map();for(const id of profile.samples)counts.set(id,(counts.get(id)||0)+1);
  const hot=profile.nodes.map(n=>({name:n.callFrame.functionName,path:n.callFrame.url,line:n.callFrame.lineNumber+1,samples:counts.get(n.id)||0})).sort((a,b)=>b.samples-a.samples);
  await writeFile(new URL('./hillclimb-tiers/baseline-profile.json',import.meta.url),JSON.stringify({method:'Inspector sampling enabled only around baseline computeMove calls; profiling times are excluded from performance comparisons.',hot,profile},null,2));
  console.log(JSON.stringify(hot.slice(0,15),null,2));
}finally{session.disconnect();await server.close();}
