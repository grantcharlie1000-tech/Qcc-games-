/** A 500-only change must preserve every other recorded decision. */
import {readFile,writeFile} from 'node:fs/promises';
const label=process.argv[2]||'post-round14-v2';
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid report label');
const folder=new URL('./hillclimb-tiers/',import.meta.url),rows=[];
for(const tier of [300,700,900]) {
  const before=JSON.parse(await readFile(new URL(`${tier}-final-bundle-validation-v2.json`,folder)));
  const after=JSON.parse(await readFile(new URL(`${tier}-${label}.json`,folder)));
  if(before.corpusSha256!==after.corpusSha256||before.rows.length!==after.rows.length)throw Error('Cohort mismatch');
  let choices=0;
  for(const row of after.rows) {
    const prior=before.rows.find(p=>p.id===row.id);
    if(!prior||prior.fen!==row.fen)throw Error('Position mismatch');
    for(const move of row.moves) {
      const old=prior.moves.find(m=>m.seed===move.seed);
      if(!old||old.move!==move.move||old.nodes!==move.nodes||old.depth!==move.depth)throw Error(`Unrelated tier changed: ${tier} ${row.id}`);
      choices++;
    }
  }
  rows.push({tier,choices,changes:0,sourceSha256:after.sourceSha256});
}
const before=JSON.parse(await readFile(new URL('match-round13-final.json',folder)));
const after=JSON.parse(await readFile(new URL('match.json',folder)));
let games=0;
for(const game of after.games.filter(g=>g.lower!==500&&g.upper!==500)) {
  const prior=before.games.find(g=>g.lower===game.lower&&g.upper===game.upper&&g.opening===game.opening&&g.upperColor===game.upperColor);
  if(!prior||JSON.stringify(prior.moves)!==JSON.stringify(game.moves)||prior.result!==game.result||prior.finalFen!==game.finalFen)throw Error('Unrelated full game changed');
  games++;
}
if(games!==24||after.games.length!==48||after.summary.some(s=>s.unfinished||s.upperScore<=.5))throw Error('Game ordering check failed');
await writeFile(new URL(`${label}-preservation.json`,folder),JSON.stringify({generatedAt:new Date().toISOString(),method:'Exact move, node and completed-depth preservation on already-scored300/700/900corpora; this is reused regression evidence, not new validation. All24non500full games must also be identical. All48games must finish with upper-tier score above.5 per pair.',rows,unchangedGames:games,sourceSha256:after.sourceSha256},null,2)+'\n');
console.log(JSON.stringify({rows,unchangedGames:games,sourceSha256:after.sourceSha256}));
