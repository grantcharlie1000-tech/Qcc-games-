/** Re-anchor the actual council-approved choices, without changing their work. */
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const label=process.argv[2];if(!label)throw Error('candidate label');
const folder=new URL('./hillclimb-tiers/',import.meta.url);
const originalBytes=await readFile(new URL('./hillclimb-900/window-validation-2.json',import.meta.url));
const original=JSON.parse(originalBytes);
const current=JSON.parse(await readFile(new URL(`900-${label}.json`,folder)));
const acceptedSource='d2a1614856f7163c5794ddf78a0223f6cc2f793446e811f655d3a01829b2458b';
const referenceSource=await Promise.all(['engine.ts','brook.ts','index.ts'].map(async file=>(await readFile(new URL('baseline/'+file,folder),'utf8')).replaceAll('../../../../../../src/chess-ai/types','../../types')));
const referenceHash=createHash('sha256').update(referenceSource.join('')).digest('hex');
if(referenceHash!==acceptedSource||original.sourceSha256!==acceptedSource)throw Error('Historical reference differs from council-approved source');
if(current.metricVersion!==2||current.oracle.jsSha256!==original.oracle.jsSha256||current.oracle.wasmSha256!==original.oracle.wasmSha256)throw Error('Oracle mismatch');
const score=x=>x.kind==='mate'?Math.sign(x.value)*10000:x.value;
const loss=(a,b)=>Math.min(1000,Math.max(0,score(a)-score(b)));
const rows=[];
for(const row of current.rows) {
  const reference=original.rows.find(r=>r.id===row.id);
  if(!reference||reference.fen!==row.fen||reference.humanMove!==row.humanMove)throw Error('Regression cohort mismatch');
  if(reference.moves.length!==8||row.moves.length!==8)throw Error('All eight historical seeds are required');
  const prior=reference.moves.map(move=>{
    if(move.evaluation.depth!==10||!row.moves.some(m=>m.seed===move.seed))throw Error('Oracle depth or seed mismatch');
    return {seed:move.seed,move:move.move,loss:loss(row.best,move.evaluation)};
  });
  rows.push({id:row.id,source:row.source,acceptedLoss:prior.reduce((a,b)=>a+b.loss,0)/prior.length,currentLoss:row.botLoss,humanLoss:row.humanLoss,acceptedMoves:prior});
}
if(rows.length!==176||original.rows.length!==176)throw Error('Incomplete accepted regression cohort');
const mean=key=>rows.reduce((sum,row)=>sum+row[key],0)/rows.length;
const summary={positions:rows.length,seedsPerPosition:8,acceptedMeanCpLoss:mean('acceptedLoss'),currentMeanCpLoss:mean('currentLoss'),humanMeanCpLoss:mean('humanLoss'),ratio:mean('currentLoss')/mean('acceptedLoss')};
await writeFile(new URL(`${label}-regression-summary.json`,folder),JSON.stringify({generatedAt:new Date().toISOString(),method:'Same176positions and all eight seeds as prior accepted900validation. Both actual historical accepted moves and current moves use corrected metric2 forced-root anchors. Historical choices are preserved instead of rerunning a time-limited reference under different host contention. This reused regression set is not a fresh validation cohort.',sourceSha256:current.sourceSha256,acceptedSourceSha256:acceptedSource,acceptedReportSha256:createHash('sha256').update(originalBytes).digest('hex'),corpusSha256:current.corpusSha256,summary,rows},null,2)+'\n');
console.log(JSON.stringify(summary));
