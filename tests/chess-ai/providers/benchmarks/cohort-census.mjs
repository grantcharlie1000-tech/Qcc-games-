/** Metadata only. Never reads oracle scores or filters the frozen cohorts. */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('./hillclimb-tiers/',import.meta.url);
const intersection=(a,b)=>[...a].filter(x=>b.has(x));
const rows=[];
for(const tier of [300,500,700,900]) {
  const bytes=await readFile(new URL(`human-${tier}.json`,folder));
  const corpus=JSON.parse(bytes),parts={};
  for(const split of ['tuning','validation']) {
    const positions=corpus.positions.filter(p=>p.split===split);
    parts[split]={positions:positions.length,
      contributors:new Set(positions.map(p=>p.contributor)),
      games:new Set(positions.map(p=>p.source)),
      // Ignore move counters while retaining side, castling and en-passant state.
      boards:new Set(positions.map(p=>p.fen.split(' ').slice(0,4).join(' ')))};
  }
  const a=parts.tuning,b=parts.validation;
  rows.push({tier,sha256:createHash('sha256').update(bytes).digest('hex'),
    tuning:{positions:a.positions,contributors:a.contributors.size,games:a.games.size,uniqueBoards:a.boards.size},
    validation:{positions:b.positions,contributors:b.contributors.size,games:b.games.size,uniqueBoards:b.boards.size},
    overlap:{contributors:intersection(a.contributors,b.contributors).length,
      games:intersection(a.games,b.games).length,boards:intersection(a.boards,b.boards).length}});
}
const current900=JSON.parse(await readFile(new URL('human-900.json',folder)));
const currentGames=new Set(current900.positions.map(p=>p.source));
const priorFolder=new URL('../hillclimb-900/',folder),prior900=[];
for(const name of (await readdir(priorFolder)).filter(name=>/^human-900.*\.json$/.test(name))) {
  const bytes=await readFile(new URL(name,priorFolder));
  const prior=JSON.parse(bytes);
  prior900.push({name,sha256:createHash('sha256').update(bytes).digest('hex'),overlappingGames:intersection(currentGames,new Set(prior.positions.map(p=>p.source))).length});
}
const report={generatedAt:new Date().toISOString(),method:'Frozen metadata only. Contributor and game disjointness is checked between tuning and validation. This does not establish both-player disjointness because opponents were not the split unit. Common opening boards may recur. No positions are removed.',rows,prior900};
await writeFile(new URL('cohort-census.json',folder),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(rows));
