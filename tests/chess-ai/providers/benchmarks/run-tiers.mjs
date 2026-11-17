/** Only one oracle process at a time; stop immediately if any tier fails. */
import {spawnSync} from 'node:child_process';
const label=process.argv[2],split=process.argv[3]||'tuning';
const tiers=process.argv[4]?[Number(process.argv[4])]:[300,500,700,900];
if(!label||!['tuning','validation'].includes(split)||tiers.some(t=>![300,500,700,900].includes(t)))throw Error('Arguments: label [tuning|validation] [tier]');
for(const tier of tiers) {
  const run=spawnSync(process.execPath,['tests/chess-ai/providers/benchmarks/hillclimb-tiers.mjs',String(tier),label,split],{stdio:'inherit'});
  if(run.error)throw run.error;
  if(run.status!==0)process.exit(run.status||1);
}
