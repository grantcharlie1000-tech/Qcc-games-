/** Describe retained 900 comparisons without rerunning either engine. */
import {readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder = new URL('./hillclimb-tiers/', import.meta.url);
const inputs = {};
async function read(name, historical = false) {
  const url = historical ? new URL('./hillclimb-900/' + name, import.meta.url) : new URL(name, folder);
  const bytes = await readFile(url);
  inputs[(historical ? '../hillclimb-900/' : '') + name] = createHash('sha256').update(bytes).digest('hex');
  return JSON.parse(bytes);
}
const current = await read('900-post-round15-v2.json');
const baseline = await read('900-baseline-bundle-heldout-v2.json');
const historical = await read('900-post-round15-regression-v2.json');
const accepted = await read('window-validation-2.json', true);
const speed = await read('browser-speed.json');
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
function work(rows) {
  const moves = rows.flatMap(row => row.moves), nodes = moves.map(move => move.nodes).sort((a, b) => a - b);
  return {choices: moves.length, medianNodes: (nodes[Math.floor((nodes.length - 1) / 2)] + nodes[Math.floor(nodes.length / 2)]) / 2,
    completedDepthCounts: Object.fromEntries([...new Set(moves.map(move => move.depth))].sort().map(depth => [depth, moves.filter(move => move.depth === depth).length]))};
}
if (current.metricVersion !== 2 || baseline.metricVersion !== 2 || current.corpusSha256 !== baseline.corpusSha256) throw Error('Fresh comparisons differ');
const paired = current.rows.map(row => {
  const other = baseline.rows.find(old => old.id === row.id);
  if (!other || other.fen !== row.fen || row.moves.some(move => !other.moves.some(old => old.seed === move.seed))) throw Error('Pair mismatch');
  return {source: row.source, contributor: row.contributor, differenceCp: row.botLoss - other.botLoss};
});
function bootstrap(key) {
  const groups = [...new Set(paired.map(row => row[key]))].map(id => paired.filter(row => row[key] === id));
  let state = 732187;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const samples = Array.from({length: 4000}, () => mean(groups.flatMap(() => groups[Math.floor(random() * groups.length)]).map(row => row.differenceCp))).sort((a, b) => a - b);
  return {clusters: groups.length, resamples: 4000, seed: 732187, difference95Cp: [samples[100], samples[3899]]};
}
let identical = 0;
for (const row of historical.rows) {
  const other = accepted.rows.find(old => old.id === row.id);
  if (!other || other.fen !== row.fen) throw Error('Historical pair mismatch');
  for (const move of row.moves) if (other.moves.find(old => old.seed === move.seed)?.move === move.move) identical++;
}
const speedRows = speed.samples.filter(row => row.side === 'candidate' && row.tier === 900 && row.profile === 'desktop' && !row.slow);
if (speedRows.length !== 40) throw Error('Incomplete speed corpus');
const report = {generatedAt: new Date().toISOString(), sourceSha256: current.sourceSha256,
  method: 'Descriptive audit of existing reports only. Paired loss differences average the fixed seeds within each position before cluster bootstrap. No model reruns, tuning or new acceptance gate. Historical evidence was reused for node-budget selection; it is not held out. Device-dependent timed baselines are not a fixed absolute strength.',
  fresh: {positions: paired.length, acceptedRerunMeanCpLoss: mean(baseline.rows.map(row => row.botLoss)), currentMeanCpLoss: mean(current.rows.map(row => row.botLoss)), differenceCp: mean(paired.map(row => row.differenceCp)), gameBootstrap: bootstrap('source'), contributorBootstrap: bootstrap('contributor'), currentWork: work(current.rows), acceptedRerunWork: work(baseline.rows)},
  historical: {acceptedWork: work(accepted.rows), currentWork: work(historical.rows), identicalMoves: identical, choices: historical.rows.reduce((sum, row) => sum + row.moves.length, 0)},
  speedCorpus: {choices: speedRows.length, completedDepthCounts: Object.fromEntries([...new Set(speedRows.map(row => row.depth))].map(depth => [depth, speedRows.filter(row => row.depth === depth).length]))}, inputs};
await writeFile(new URL('900-preservation-limits.json', folder), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({...report, inputs: undefined}));
