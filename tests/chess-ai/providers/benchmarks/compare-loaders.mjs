/** Verify the setup-loader change preserves frozen candidate decisions. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('./hillclimb-tiers/',import.meta.url);
const references={300:'final-tuning-v2',500:'final-tuning-v2',700:'round-10-quality-v2',900:'round-10-quality-v2'};
const rows=[];
for(const tier of [300,500,700,900]) {
  const oldBytes=await readFile(new URL(`${tier}-${references[tier]}.json`,folder));
  const currentBytes=await readFile(new URL(`${tier}-final-bundle-tuning-v2.json`,folder));
  const old=JSON.parse(oldBytes),current=JSON.parse(currentBytes);
  if(old.corpusSha256!==current.corpusSha256||old.rows.length!==current.rows.length)throw Error('Cohort differs');
  let compared=0;
  for(const row of current.rows) {
    const prior=old.rows.find(r=>r.id===row.id);
    if(!prior||prior.fen!==row.fen)throw Error('Position differs');
    for(const move of row.moves) {
      const before=prior.moves.find(m=>m.seed===move.seed);
      if(!before||before.move!==move.move||before.nodes!==move.nodes||before.depth!==move.depth)throw Error(`Loader changes candidate decision/work: ${tier} ${row.id} ${move.seed}`);
      compared++;
    }
  }
  rows.push({tier,compared,changes:0,reference:`${tier}-${references[tier]}.json`,referenceSha256:createHash('sha256').update(oldBytes).digest('hex'),currentSha256:createHash('sha256').update(currentBytes).digest('hex'),sourceSha256:current.sourceSha256});
}
await writeFile(new URL('loader-equivalence.json',folder),JSON.stringify({generatedAt:new Date().toISOString(),method:'Compare every tuning position and seed against pre-loader-change reports. Moves, nodes and completed depth must be identical. This is setup equivalence, not a browser or performance claim.',rows},null,2)+'\n');
console.log(JSON.stringify(rows));
