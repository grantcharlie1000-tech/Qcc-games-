import {cpus} from 'node:os';
import {existsSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import {createCapacityProbe,launchQuotaBrowser,median} from './quota-browser.mjs';

// Explicit measurement restart. Previous rejected relative wall gates stay rejected.
const output=process.env.CHESS_QUOTA_OUTPUT||'.omc/state/chess-tiers-quota-capacity-v2-probe.json';
if(existsSync(output))throw Error('Refuse to overwrite existing measurement evidence: '+output);
const rate=Number(process.env.CHESS_QUOTA_RATE||416);
if(rate!==416)throw Error('capacity-v2 retains the frozen416/10000 hard cap');
const owned=await launchQuotaBrowser();
const report={protocol:'capacity-v2',generatedAt:new Date().toISOString(),method:'New capacity-v2 benchmark: queried416/10000 hard cap plus observed whole-job CPU time per actual arithmetic-loop wall time. One warm persistent real Worker, actual OS host PID traced before retained work and verified in the owned job. Five alternating10000/416pairs, three retained200Mloops per leg. No relative6x/5x wall-slowdown, physical-device, physical-core, frequency or production-runtime claim.',originalRelativeWallGateIsAcceptanceCriterion:false,previousRejectedWallGateResultsRemainRejected:true,previousRejectedCapacityV1ResultsRemainRejected:true,cpu:cpus()[0].model,nodeLogicalCpuCount:cpus().length,nativeLogicalCpuCount:owned.ready.logicalCpuCount,cpuRatePer10000:rate,nominalJobCpuFraction:rate/10000,nominalLogicalProcessorEquivalents:owned.ready.logicalCpuCount*rate/10000,dutyValidationTolerance:.20,accountingPrecision:'100ns is the counter unit, not a demonstrated counter resolution. Raw counter and native query brackets are retained. Duty is an observed estimate, not a guaranteed instantaneous capacity or hardware-equivalence bound.',jobName:owned.jobName,browserProcessId:owned.rootProcessId,controllerSourceSha256:owned.controllerSourceSha256,javascriptHarnessSourceSha256:owned.javascriptHarnessSourceSha256,ready:owned.ready,legs:[],errorCount:0};
let failure,probe;
try {
  const page=await owned.browser.newPage();
  await page.goto('data:text/html,<title>Owned browser capacity accounting</title>');
  await owned.setQuota(10000);
  probe=await createCapacityProbe(owned,page);
  report.workerIdentity=probe.identity;report.warmup=probe.warmup;
  for(let repeat=0;repeat<5;repeat++)for(const limited of repeat%2?[true,false]:[false,true]) {
    const quota=await owned.setQuota(limited?rate:10000);
    const leg=await probe.measure({expectedCpuRatePer10000:limited?416:10000});
    report.legs.push({repeat,limited,quota,...leg});
    console.log(JSON.stringify({repeat,limited,medianMs:leg.medianMs,summedLoopWallMs:leg.summedLoopWallMs,jobCpuSeconds:leg.jobCpuSeconds,jobCpuPerLoopWall:leg.jobCpuPerLoopWall,hostBusy:leg.hostLoad.busyFraction,validation:leg.validation}));
  }
  const ratios=Array.from({length:5},(_,repeat)=>report.legs.find(leg=>leg.repeat===repeat&&leg.limited).medianMs/report.legs.find(leg=>leg.repeat===repeat&&!leg.limited).medianMs);
  const checksums=new Set(report.legs.flatMap(leg=>leg.samples.map(row=>row.checksum)));
  const limited=report.legs.filter(leg=>leg.limited),duties=limited.map(leg=>leg.jobCpuPerLoopWall);
  report.relativeWallSlowdownDescriptiveOnly={pairedRatios:ratios,median:median(ratios),min:Math.min(...ratios),max:Math.max(...ratios)};
  report.capacityDuty={limitedLegs:duties.length,median:median(duties),min:Math.min(...duties),max:Math.max(...duties),allWithinValidationTolerance:limited.every(leg=>leg.validation.withinDutyTolerance)};
  report.successfulWork={sampleCount:report.legs.reduce((total,leg)=>total+leg.samples.length,0),checksumCount:checksums.size,iterationsPerSample:200000000,totalIterations:report.legs.reduce((total,leg)=>total+leg.totalIterations,0),errors:0};
  if(checksums.size!==1||report.successfulWork.sampleCount!==30)throw Error('Arithmetic work mismatch in capacity protocol');
  // Retain every completed pair before asserting the predeclared duty tolerance.
  if(!report.capacityDuty.allWithinValidationTolerance)throw Error('At least one retained limited leg exceeds the .20 observed-duty validation tolerance');
}catch(error){failure=error;report.error=String(error);report.errorCount++;report.capacityDiagnostic=error.capacityDiagnostic;}
finally {
  try{await probe?.close();report.persistentWorkerClosed=true;}catch(error){report.persistentWorkerClosed=false;report.workerCleanupError=String(error);}
  report.cleanup=await owned.close();await writeFile(output,JSON.stringify(report,null,2),{flag:'wx'});
}
console.log(JSON.stringify({output,capacityDuty:report.capacityDuty,relativeWallSlowdownDescriptiveOnly:report.relativeWallSlowdownDescriptiveOnly,cleanup:report.cleanup,error:report.error}));
if(failure)throw failure;
if(!report.persistentWorkerClosed||!report.cleanup.restored||!report.cleanup.browserExited||!report.cleanup.helperExited||report.cleanup.errors.length)throw Error('Owned capacity-protocol resources did not close cleanly');
