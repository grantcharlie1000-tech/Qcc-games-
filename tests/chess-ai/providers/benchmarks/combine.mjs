/** Combine unchanged-profile matches with the final 900-only calibration batch. */
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const read = async name => JSON.parse(await readFile(new URL(name, import.meta.url), 'utf8'));
const original = await read('./pre-900-tune-results.json');
const tuned = await read('./900-final-results.json');
if (original.config.gamesPerPair !== 40 || tuned.config.gamesPerPair !== 40 || original.config.maxPlies !== 400 || tuned.config.maxPlies !== 400) throw new Error('Expected final 40-game,400-ply batches');
const firstPairs = original.pairs.filter(pair => pair.stronger !== 'elo-900');
if (firstPairs.length !== 2 || tuned.pairs.length !== 1 || tuned.pairs[0].weaker !== 'elo-700' || tuned.pairs[0].stronger !== 'elo-900') throw new Error('Unexpected pair coverage');
const pairs = [...firstPairs.map(pair => ({...pair, sourceSha256:original.sourceSha256})), {...tuned.pairs[0],sourceSha256:tuned.sourceSha256}];
const games = [...original.games.filter(game => game.white !== 'elo-900' && game.black !== 'elo-900').map(game => ({...game,sourceSha256:original.sourceSha256})),...tuned.games.map(game => ({...game,sourceSha256:tuned.sourceSha256}))];
if(games.length !== 120)throw new Error('Expected exactly120 selected games');
const currentSource = await readFile(new URL('../../../../src/chess-ai/providers/beginner/engine.ts', import.meta.url), 'utf8');
const currentSourceSha256 = createHash('sha256').update(currentSource).digest('hex');
const restoredOriginalSource = currentSource.replace("'elo-900': {captureNotice:.79,dangerNotice:.73,mateNotice:.71,temperature:56,development:1.225,replyWeight:.25,replyLimit:4}","'elo-900': {captureNotice:.88,dangerNotice:.82,mateNotice:.82,temperature:46,development:1.3,replyWeight:.35,replyLimit:6}");
const reconstructedOriginalSha256 = createHash('sha256').update(restoredOriginalSource).digest('hex');
if(reconstructedOriginalSha256 !== original.sourceSha256)throw new Error('Original source cannot be reconstructed by restoring only the900 profile');
if(currentSourceSha256 !== tuned.sourceSha256)throw new Error('900 batch does not match current engine');
const report = {
  generatedAt:new Date().toISOString(), currentSourceSha256, reconstructedOriginalSha256,only900ProfileChanged:true,
  note:'Only the900 profile constant changed between batches;300/500/700 profiles and all search logic are unchanged. Their80 complete games remain applicable. The superseded900 matches are preserved in the original batch but excluded here. Source hashes are retained per pair and game. This is an internal regression pool, not an external Elo calibration.',
  sourceBatches:[{file:'pre-900-tune-results.json',sourceSha256:original.sourceSha256,selectedGames:80,selectedPairs:['300/500','500/700']},{file:'900-final-results.json',sourceSha256:tuned.sourceSha256,selectedGames:40,selectedPairs:['700/900']}],
  config:{gamesPerPair:40,thinkingTimeMs:75,maxPlies:400,baseSeed:original.config.baseSeed},
  environment:tuned.environment,
  completion:{games:games.length,checkmates:games.filter(game=>game.result==='white'||game.result==='black').length,draws:games.filter(game=>game.result==='draw').length,unfinished:games.filter(game=>game.result==='unfinished').length,failures:games.filter(game=>game.result==='failure').length,totalPlies:games.reduce((sum,game)=>sum+game.plies,0)},
  timing:{'elo-300':original.timing['elo-300'],'elo-500':original.timing['elo-500'],'elo-700':original.timing['elo-700'],'elo-900':tuned.timing['elo-900']},
  timingNote:'300/500/700 timing samples come from the original batch, including its superseded900 matches for700. The code for these profiles is unchanged.900 timing samples come from its final batch. These are core search timings, excluding Worker startup and pacing.',
  batchesPerformance:[{sourceSha256:original.sourceSha256,measuredGames:120,elapsedMs:original.elapsedMs,cpuMs:original.cpuMs,rssBeforeBytes:original.rssBeforeBytes,rssAfterBytes:original.rssAfterBytes},{sourceSha256:tuned.sourceSha256,measuredGames:40,elapsedMs:tuned.elapsedMs,cpuMs:tuned.cpuMs,rssBeforeBytes:tuned.rssBeforeBytes,rssAfterBytes:tuned.rssAfterBytes}],
  openingDiversity:pairs.map(pair=>{const matching=games.filter(game=>[game.white,game.black].includes(pair.weaker)&&[game.white,game.black].includes(pair.stronger));return{weaker:pair.weaker,stronger:pair.stronger,games:matching.length,distinctFirst8PlySequences:new Set(matching.map(game=>game.moves.slice(0,8).join(' '))).size};}),
  pairs,games,
};
await writeFile(new URL('./results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({completion:report.completion,pairs,openingDiversity:report.openingDiversity,timing:report.timing},null,2));
