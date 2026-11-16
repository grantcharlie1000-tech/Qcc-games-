/** Genuine vendored Maia3/ONNX Runtime WASM; no browser pacing or engine search. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createServer } from 'vite';
import * as ort from '../../../../public/chess-engines/maia/ort.wasm.min.mjs';
import { Chess } from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';
const asset = new URL('../../../../public/chess-engines/maia/', import.meta.url);
const model = Buffer.concat(await Promise.all([1,2,3].map(n => readFile(new URL(`model.part${n}`, asset)))));
const modelSha256 = createHash('sha256').update(model).digest('hex');
const encodingSha256 = createHash('sha256').update(await readFile(new URL('../../../../src/chess-ai/providers/maia/encoding.ts', import.meta.url))).digest('hex');
ort.env.wasm.numThreads = 1; ort.env.wasm.proxy = false; ort.env.wasm.wasmPaths = asset.href;
const loadStart = performance.now();
const session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
const initializationMs = performance.now() - loadStart;
const server = await createServer({ configFile: false, optimizeDeps: { noDiscovery: true, include: [], entries: [] }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
const { encodePosition, policyDistribution, samplePolicy } = await server.ssrLoadModule('/src/chess-ai/providers/maia/encoding.ts');
const gamesCount = Number(process.env.MAIA_GAMES || 2);
const lowerRating = Number(process.env.MAIA_LOWER || 1100);
const upperRating = Number(process.env.MAIA_UPPER || 1900);
const pairingList = process.env.MAIA_PAIRS ? process.env.MAIA_PAIRS.split(',').map(pair => pair.split(':').map(Number)) : [[lowerRating,upperRating]];
const { computeMove } = await server.ssrLoadModule('/src/chess-ai/providers/beginner/engine.ts');
const beginnerSourceSha256 = createHash('sha256').update(await readFile(new URL('../../../../src/chess-ai/providers/beginner/engine.ts', import.meta.url))).digest('hex');
const maxPlies = Number(process.env.MAIA_PLIES || 160);
const inferenceTimes = [];
const cpuStart = process.cpuUsage();
const started = performance.now();
const uci = move => move.from + move.to + (move.promotion || '');
const apply = (game, move) => game.move({ from: move.slice(0,2), to: move.slice(2,4), ...(move[4] ? { promotion: move[4] } : {}) });
let state = 87654321;
const random = () => { state += 0x6d2b79f5; let z=state; z=Math.imul(z^(z>>>15),z|1); z^=z+Math.imul(z^(z>>>7),z|61); return ((z^(z>>>14))>>>0)/4294967296; };
async function policy(fen, rating, legalMovesUci) {
  const tick = performance.now();
  const output = await session.run({ tokens: new ort.Tensor('float32', encodePosition(fen), [1,64,12]), elo_self: new ort.Tensor('float32', new Float32Array([rating]), [1]), elo_oppo: new ort.Tensor('float32', new Float32Array([rating]), [1]) });
  const moves = policyDistribution(output.logits_move.data, fen.split(' ')[1] === 'b', legalMovesUci);
  inferenceTimes.push(performance.now() - tick);
  return moves;
}
const probes = [];
const games = [];
try {
  // Same-position conditional distributions, including both sides and specials.
  const positions = [
    {name:'start',fen:new Chess().fen()},
    {name:'black-after-e4',fen:'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'},
    {name:'mate-one',fen:'7k/8/5KQ1/8/8/8/8/8 w - - 0 1'},
    {name:'promotion',fen:'7k/P7/6K1/8/8/8/8/8 w - - 0 1'},
  ];
  for (const position of positions) {
    const game = new Chess(position.fen);
    const legal = game.moves({verbose:true}).map(uci);
    for (const rating of [1100,1300,1600,1900]) {
      const moves = await policy(position.fen,rating,legal);
      probes.push({position:position.name,fen:position.fen,rating,legalMoves:legal.length,topMoves:moves.slice(0,5),entropyNats:-moves.reduce((sum,p)=>sum+p.probability*Math.log(Math.max(1e-12,p.probability)),0)});
    }
  }
  for(let match=0;match<gamesCount*pairingList.length;match++) {
    const index=match%gamesCount;
    const [pairLower,pairUpper]=pairingList[Math.floor(match/gamesCount)];
    const game=new Chess(); const history=[];
    const whiteRating=index%2?pairUpper:pairLower; const blackRating=index%2?pairLower:pairUpper;
    const opening=['e2e4','e7e5','g1f3','b8c6'];
    for(const move of opening){apply(game,move);history.push(move);}
    let failure;
    for(let ply=history.length;ply<maxPlies&&!game.isGameOver();ply++) {
      const legal=game.moves({verbose:true}).map(uci); const rating=game.turn()==='w'?whiteRating:blackRating;
      try {
        const move = rating < 1100 ? computeMove({ fen: game.fen(), startFen: new Chess().fen(), moveHistoryUci: history, legalMovesUci: legal, opponentId: `elo-${rating}`, thinkingTimeMs: 75 }, Math.floor(random()*4294967296)).moveUci : samplePolicy(await policy(game.fen(),rating,legal),random());
        if(!legal.includes(move))throw new Error(`Illegal Maia3 move ${move}`);
        apply(game,move);history.push(move);
      }catch(error){failure=String(error);break;}
      if(history.length%20===0)console.log(`Maia game${index+1}/${gamesCount} ${history.length} plies`);
    }
    const result=failure?'failure':game.isCheckmate()?(game.turn()==='w'?'black':'white'):game.isDraw()?'draw':'unfinished';
    games.push({index:match,pairGameIndex:index,whiteRating,blackRating,result,...(result==='white'?{winnerRating:whiteRating}:result==='black'?{winnerRating:blackRating}:{}),plies:history.length,finalFen:game.fen(),moves:history,...(failure?{failure}:{})});
    console.log(`Maia game${index+1}: ${result} ${games.at(-1).winnerRating||''}`);
  }
  const cpu=process.cpuUsage(cpuStart);const sorted=[...inferenceTimes].sort((a,b)=>a-b);
  const report={generatedAt:new Date().toISOString(),modelSha256,encodingSha256,modelBytes:model.length,initializationMs,elapsedMs:performance.now()-started,cpuMs:(cpu.user+cpu.system)/1000,rssBytes:process.memoryUsage().rss,inference:{count:sorted.length,firstMs:inferenceTimes[0],meanMs:inferenceTimes.reduce((a,b)=>a+b,0)/sorted.length,p50Ms:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1)},config:{gamesCount,maxPlies,lowerRating,upperRating,pairingList,beginnerSourceSha256,seed:87654321,selfAndOpponentConditioningEqual:true,temperature:1,threads:1,runtime:'vendored onnxruntime-web WASM in Node, SIMD'},note:'Small balanced-color match sample is a smoke test for conditioning/legal play only, statistically insufficient to verify Elo or order adjacent Maia tiers. Model ratings are conditioning inputs, not demonstrated QCC strength. Initialization excludes reading model parts. Timings include contended CPU, exclude browser Worker transfer and pacing.',probes,games};
  await writeFile(new URL(`./${process.env.MAIA_REPORT || 'maia-results.json'}`,import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({initializationMs,inference:report.inference,games:games.map(({moves,...rest})=>rest)},null,2));
} finally {await session.release();await server.close();}
