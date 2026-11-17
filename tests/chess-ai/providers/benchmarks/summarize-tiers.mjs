import {readFile,writeFile} from 'node:fs/promises';
const [label,baselineLabel,split='validation',selection]=process.argv.slice(2);
if(!label||!baselineLabel)throw Error('candidate-label baseline-label [split]');
const selectedTiers=selection?selection.split(',').map(Number):[300,500,700,900];
if(selectedTiers.some(tier=>![300,500,700,900].includes(tier)))throw Error('Invalid tier selection');
const folder=new URL('./hillclimb-tiers/',import.meta.url);
const mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length;
let state=732187;
const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
const histogram=values=>Object.fromEntries([[0,10],[10,50],[50,100],[100,200],[200,500],[500,1001]].map(([a,b])=>[`${a}-${b===1001?'1000':b}`,values.filter(x=>x>=a&&x<b).length/values.length]));
const tiers=[];
for(const tier of selectedTiers) {
  const candidate=JSON.parse(await readFile(new URL(`${tier}-${label}.json`,folder)));
  const baseline=JSON.parse(await readFile(new URL(`${tier}-${baselineLabel}.json`,folder)));
  if(candidate.metricVersion!==2||baseline.metricVersion!==2)throw Error('Only corrected metric2 reports may be combined');
  if(candidate.corpusSha256!==baseline.corpusSha256||candidate.rows.map(r=>r.id).join()!==baseline.rows.map(r=>r.id).join())throw Error('Cohorts differ');
  const rows=candidate.rows,groups=[...new Set(rows.map(r=>r.contributor))].map(id=>rows.filter(r=>r.contributor===id));
  const deltas=[];
  for(let sample=0;sample<5000;sample++) {
    const selected=groups.flatMap(()=>groups[Math.floor(random()*groups.length)]);
    deltas.push(mean(selected.map(r=>r.botLoss-r.humanLoss)));
  }
  deltas.sort((a,b)=>a-b);
  const human=mean(rows.map(r=>r.humanLoss)),bot=mean(rows.map(r=>r.botLoss)),old=mean(baseline.rows.map(r=>r.botLoss));
  tiers.push({tier,split,sourceSha256:candidate.sourceSha256,baselineSourceSha256:baseline.sourceSha256,corpusSha256:candidate.corpusSha256,positions:rows.length,games:new Set(rows.map(r=>r.source)).size,contributors:groups.length,humanMeanCpLoss:human,baselineMeanCpLoss:old,candidateMeanCpLoss:bot,ratio:bot/human,absoluteLogRatio:Math.abs(Math.log(bot/human)),reductionFromBaselineFraction:1-bot/old,contributorBootstrapDifference95Cp:[deltas[125],deltas[4874]],histograms:{human:histogram(rows.map(r=>r.humanLoss)),candidate:histogram(rows.flatMap(r=>r.moves.map(m=>m.loss))),baseline:histogram(baseline.rows.flatMap(r=>r.moves.map(m=>m.loss)))},failures:candidate.failures+baseline.failures});
}
await writeFile(new URL(`${label}-summary.json`,folder),JSON.stringify({generatedAt:new Date().toISOString(),method:'Matched forced-root oracle losses, metric2. Four fixed candidate seeds per human position.95% intervals from5000 contributor-cluster bootstrap resamples, descriptive only. Convenience cohorts do not establish a platform rating or a narrow Elo interval.',tiers},null,2)+'\n');
console.log(JSON.stringify(tiers.map(({tier,humanMeanCpLoss,baselineMeanCpLoss,candidateMeanCpLoss,ratio,contributorBootstrapDifference95Cp})=>({tier,humanMeanCpLoss,baselineMeanCpLoss,candidateMeanCpLoss,ratio,contributorBootstrapDifference95Cp})),null,2));
