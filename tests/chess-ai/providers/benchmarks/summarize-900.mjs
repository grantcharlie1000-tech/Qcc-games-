import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const folder = new URL('./hillclimb-900/', import.meta.url);
const read = async name => JSON.parse(await readFile(new URL(name, folder)));
const baseline = await read('baseline-window-validation-2.json');
const candidate = await read('window-validation-2.json');
const match = await read('match.json');
const sourceFiles = ['engine.ts','brook.ts','index.ts'].map(file => `src/chess-ai/providers/beginner/${file}`);
const currentHash = createHash('sha256').update(Buffer.concat(await Promise.all(sourceFiles.map(file => readFile(file))))).digest('hex');
if (baseline.corpusSha256 !== candidate.corpusSha256 || candidate.sourceSha256 !== match.sourceSha256 || candidate.sourceSha256 !== currentHash) throw new Error('Evidence hashes differ');
const grouped = new Map();
for (const row of candidate.rows) {
  if (!grouped.has(row.source)) grouped.set(row.source, []);
  grouped.get(row.source).push(row);
}
const mean = xs => xs.reduce((sum, x) => sum+x, 0)/xs.length;
const games = [...grouped.values()].map(rows => ({ human: mean(rows.map(row => row.humanLoss)), bot: mean(rows.map(row => row.botLoss)) }));
let state = 149831;
const random = () => { state += 0x6d2b79f5; let z=state; z=Math.imul(z^(z>>>15),z|1); z^=z+Math.imul(z^(z>>>7),z|61); return ((z^(z>>>14))>>>0)/4294967296; };
const differences = [];
for (let trial=0; trial<10000; trial++) {
  let total=0;
  for (let index=0; index<games.length; index++) { const game=games[Math.floor(random()*games.length)]; total += game.bot-game.human; }
  differences.push(total/games.length);
}
differences.sort((a,b)=>a-b);
const before=baseline.summary.validation, after=candidate.summary.validation;
const report = { generatedAt: new Date().toISOString(), sourceSha256:candidate.sourceSha256, corpusSha256:candidate.corpusSha256,
  games:games.length, positions:candidate.rows.length, botChoices:candidate.rows.reduce((sum,row)=>sum+row.moves.length,0),
  baseline:before, candidate:after, lossReductionFraction:1-after.botMeanCappedCpLoss/before.botMeanCappedCpLoss,
  pairedMeanDifferenceFromHumanCp:mean(games.map(game=>game.bot-game.human)),
  approximate95PercentGameClusterBootstrapDifferenceCp:[differences[250],differences[9749]],
  uncertainty:'Descriptive game-cluster bootstrap, 10000 resamples, seed 149831. Games may share players and come from one club. Not a population confidence guarantee or an Elo conversion.',
  match:match.summary, workerComputeMs:{baseline:baseline.workerBudgetMs,candidate:candidate.workerBudgetMs}, moveAllowanceMs:500 };
await writeFile(new URL('summary.json',folder),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
