/** Paired held-out move comparison for the QCC ladder. Run from the repo root. */
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import {copyFile, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {createInterface} from 'node:readline';
import {build} from 'esbuild';
import {Chess, DEFAULT_POSITION} from '../../../../src/chess-ai/providers/beginner/vendor/chess.js';
import * as ort from '../../../../public/chess-engines/maia/ort.wasm.min.mjs';

const [cohortPath, split, output, baselineRoot = '.'] = process.argv.slice(2);
if (!cohortPath || !output || !['tuning','validation'].includes(split)) throw Error('Expected cohort, split, output and optional baseline root.');
const cohortBytes = await readFile(cohortPath);
const cohort = JSON.parse(cohortBytes);
const supportedTiers = new Set(['300','500','700','900','1100','1300','1600','1900','2200','2600','3000','max']);
if (Object.keys(cohort.samples).some(tier=>!supportedTiers.has(tier))) throw Error('Unsupported cohort tier');
const sha = x => createHash('sha256').update(x).digest('hex');
const dir = await mkdtemp(join(tmpdir(),'qcc-ladder-'));
const children = [];
let session;
async function bundle(root, label) {
  const {outputFiles} = await build({
    stdin:{contents:[
      "export {computeMove} from './src/chess-ai/providers/beginner/engine.ts';",
      "export {moveBudget, searchBudget as beginnerBudget} from './src/chess-ai/providers/beginner/index.ts';",
      "export {encodePosition, policyDistribution, samplePolicy} from './src/chess-ai/providers/maia/encoding.ts';",
      "export {positionCommand, searchBudget as stockfishBudget, stockfishSettings} from './src/chess-ai/providers/stockfish/uci.ts';",
      "export {findOpponent} from './src/chess-ai/catalog.ts';",
    ].join('\n'),resolveDir:resolve(root)},
    write:false,bundle:true,platform:'node',format:'esm',target:'node24',
  });
  const path = join(dir,label+'.mjs');
  await writeFile(path,outputFiles[0].contents);
  return {api:await import(pathToFileURL(path)),sha256:sha(outputFiles[0].contents)};
}
async function stockfish(label) {
  const source = 'public/chess-engines/stockfish/stockfish-19-lite-single';
  const path = join(dir,label+'.cjs');
  await copyFile(source+'.js',path);
  await copyFile(source+'.wasm',join(dir,label+'.wasm'));
  const child = spawn(process.execPath,[path],{stdio:['pipe','pipe','inherit']});
  children.push({child,closed:once(child,'close')});
  const stream = createInterface({input:child.stdout});
  let pending;
  const fail = error => {
    if (!pending) return;
    const {reject,timer} = pending;
    pending = undefined;
    clearTimeout(timer);
    reject(error);
  };
  child.on('error',fail);
  child.on('close',code => fail(Error('Stockfish exited: '+code)));
  stream.on('line',line => {
    if (!pending) return;
    pending.lines.push(line);
    if (!pending.done(line)) return;
    const {resolve,lines,timer} = pending;
    pending = undefined;
    clearTimeout(timer);
    resolve(lines);
  });
  const call = (commands,done) => new Promise((resolve,reject) => {
    if (pending) return reject(Error('Overlapping engine request'));
    pending = {resolve,reject,lines:[],done,timer:setTimeout(()=>fail(Error('Stockfish timeout')),15000)};
    child.stdin.write(commands.join('\n')+'\n');
  });
  await call(['uci'],line=>line==='uciok');
  const settings=['setoption name Threads value 1','setoption name Hash value 16'];
  return async commands => {
    await call(['ucinewgame',...settings,'isready'],line=>line==='readyok');
    return call(commands,line=>line.startsWith('bestmove '));
  };
}
function searchInput(game, ply, api, tier) {
  const board = new Chess();
  const moveHistoryUci = game.moves.slice(0,ply);
  for (const move of moveHistoryUci) board.move(move);
  const opponentId = tier==='max' ? 'max' : 'elo-'+tier;
  return {
    fen:board.fen(), startFen:DEFAULT_POSITION, moveHistoryUci,
    legalMovesUci:board.moves({verbose:true}).map(move=>move.lan),
    opponentId, thinkingTimeMs:api.findOpponent(opponentId).defaultThinkingTimeMs,
  };
}
function oracleScore(lines) {
  const exact = lines.filter(line=>/ score (cp|mate) -?\d+/.test(line)&&!/ (upperbound|lowerbound)/.test(line));
  const [,kind,value] = exact.at(-1)?.match(/ score (cp|mate) (-?\d+)/) ?? [];
  if (!kind) throw Error('No exact oracle score');
  return kind==='mate' ? Math.sign(Number(value))*10000 : Number(value);
}
try {
  const baseline = await bundle(baselineRoot,'baseline');
  const candidate = await bundle('.','candidate');
  const oracle = await stockfish('oracle');
  const opponent = await stockfish('opponent');
  const modelPath = 'public/chess-engines/maia/';
  const model = Buffer.concat(await Promise.all([1,2,3].map(n=>readFile(modelPath+'model.part'+n))));
  const modelSha256 = sha(model);
  if (modelSha256!=='405bf76c15727dad8728b352c06a8f3c1b80fb2760e8d666b32485c63d75b856') throw Error('Unexpected Maia3 weights');
  const useMaia = [1100,1300,1600,1900].some(tier=>cohort.samples[tier]?.some(g=>g.split===split));
  if (useMaia) {
    ort.env.wasm.numThreads=1;
    ort.env.wasm.proxy=false;
    ort.env.wasm.wasmPaths=pathToFileURL(join(process.cwd(),modelPath)+'/').href;
    session = await ort.InferenceSession.create(model,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  }
  async function choose(api, input, tier, seed) {
    const started=performance.now();
    let move;
    if (tier<=900) {
      const thinkingTimeMs=api.beginnerBudget(input.opponentId,api.moveBudget(input));
      move=api.computeMove({...input,thinkingTimeMs},seed).moveUci;
    } else if (tier<=1900) {
      const rating = new Float32Array([tier]);
      const result = await session.run({
        tokens:new ort.Tensor('float32',api.encodePosition(input.fen),[1,64,12]),
        elo_self:new ort.Tensor('float32',rating,[1]),
        elo_oppo:new ort.Tensor('float32',rating,[1]),
      });
      move=api.samplePolicy(api.policyDistribution(result.logits_move.data,input.fen.split(' ')[1]==='b',input.legalMovesUci),seed/4294967296);
    } else {
      const lines=await opponent([...api.stockfishSettings(input.opponentId),api.positionCommand(input),
        'go movetime '+api.stockfishBudget(input)+' searchmoves '+input.legalMovesUci.join(' ')]);
      move=lines.at(-1).split(' ')[1];
    }
    if (!input.legalMovesUci.includes(move)) throw Error(input.opponentId+' returned an illegal move '+move);
    return {move,ms:performance.now()-started};
  }
  const rows=[];
  for (const [key,games] of Object.entries(cohort.samples)) {
    const tier=key==='max' ? key : Number(key);
    for (const game of games.filter(g=>g.split===split)) {
      const gameId=game.id??game.source;
      const plies=[.15,.35,.6,.8].map(fraction=>Math.floor(game.moves.length*fraction));
      for (const ply of plies) {
        const input=searchInput(game,ply,baseline.api,tier);
        const seed=parseInt(sha(gameId+':'+ply).slice(0,8),16);
        const before=await choose(baseline.api,input,tier,seed);
        const candidateBudget=candidate.api.findOpponent(input.opponentId).defaultThinkingTimeMs;
        const after=await choose(candidate.api,{...input,thinkingTimeMs:candidateBudget},tier,seed);
        const human=game.moves[ply];
        const position='position fen '+input.fen;
        const preferred=(await oracle([position,'go depth 10'])).at(-1).split(' ')[1];
        const scores={};
        for (const move of new Set([preferred,before.move,after.move,human])) {
          scores[move]=oracleScore(await oracle([position,'go depth 10 searchmoves '+move]));
        }
        const loss=Object.fromEntries(Object.entries(scores).map(([move,score])=>
          [move,Math.max(0,Math.min(1000,scores[preferred]-score))]));
        rows.push({tier,gameId,ply,seed,fen:input.fen,human,before,after,preferred,scores,loss});
      }
    }
    console.log(tier,rows.filter(row=>row.tier===tier).length);
  }
  const report={
    node:process.version,split,cohortSha256:sha(cohortBytes),baseline:baseline.sha256,candidate:candidate.sha256,modelSha256,
    stockfishJsSha256:sha(await readFile('public/chess-engines/stockfish/stockfish-19-lite-single.js')),
    stockfishWasmSha256:sha(await readFile('public/chess-engines/stockfish/stockfish-19-lite-single.wasm')),
    rows,
  };
  await writeFile(output,JSON.stringify(report)+'\n',{flag:'wx'});
} finally {
  for (const {child} of children) child.kill();
  await Promise.allSettled(children.map(({closed})=>closed));
  if (session) await session.release();
  await rm(dir,{recursive:true,force:true});
}
