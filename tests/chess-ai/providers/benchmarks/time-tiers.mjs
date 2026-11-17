import {readFile,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {Chess} from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';
const folder=new URL('./hillclimb-tiers/',import.meta.url), label=process.argv[2]||'baseline-core';
const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[],entries:[]},server:{middlewareMode:true,hmr:false,ws:false},appType:'custom',logLevel:'error'});
try {
  const baseline=await server.ssrLoadModule('/tests/chess-ai/providers/benchmarks/hillclimb-tiers/baseline/engine.ts');
  const current=await server.ssrLoadModule('/src/chess-ai/providers/beginner/engine.ts');
  const reference=JSON.parse(await readFile(new URL('./hillclimb-900/human-900-validation-2.json',import.meta.url)));
  const positions=reference.positions.filter((_,i)=>i%23===0).slice(0,8);
  const samples=[];
  for(let repeat=0;repeat<5;repeat++)for(const [positionIndex,p] of positions.entries())for(const tier of [300,500,700,900]) {
    const chess=new Chess(p.fen), legal=chess.moves({verbose:true}).map(m=>m.lan);
    for(const side of repeat%2?['candidate','baseline']:['baseline','candidate']) {
      if(label==='baseline-core'&&side==='candidate')continue;
      const tick=performance.now(),result=(side==='baseline'?baseline:current).computeMove({fen:p.fen,moveHistoryUci:p.history,legalMovesUci:legal,opponentId:`elo-${tier}`,thinkingTimeMs:tier===900?200:75},1234+repeat);
      if(!legal.includes(result.moveUci))throw Error('Illegal benchmark result');
      samples.push({repeat,positionIndex,tier,side,ms:performance.now()-tick,nodes:result.nodes,depth:result.depth,move:result.moveUci});
    }
  }
  const summary=[];
  for(const side of ['baseline','candidate'])for(const tier of [300,500,700,900]) {
    const times=samples.filter(s=>s.side===side&&s.tier===tier).map(s=>s.ms).sort((a,b)=>a-b);if(!times.length)continue;
    summary.push({side,tier,n:times.length,p50:times[Math.floor(times.length*.5)],p95:times[Math.floor(times.length*.95)],min:times[0],max:times.at(-1)});
  }
  await writeFile(new URL(`${label}.json`,folder),JSON.stringify({generatedAt:new Date().toISOString(),method:'Five alternating repetitions over eight fixed real positions per tier. Actual computeMove, every reply independently checked legal. Core time only; no worker startup or pacing. Baseline is the accepted 900 plus original lower tiers. No strength equivalence is assumed.',failures:0,summary,samples},null,2)+'\n');
  console.log(JSON.stringify(summary,null,2));
}finally{await server.close();}
