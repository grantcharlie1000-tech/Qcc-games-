import {chromium} from '@playwright/test';
import {execFile,spawn} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';
import {mkdir,readFile} from 'node:fs/promises';
import {cpus} from 'node:os';
import {resolve} from 'node:path';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {promisify} from 'node:util';

const exec=promisify(execFile);
const root=fileURLToPath(new URL('../../../../',import.meta.url));
const ownedStates=new WeakMap();
const capacityProtocol='capacity-v2';
const iterationsPerSample=200000000,capacityRepetitions=3;
function capacityError(message,diagnostic,cause) {
  const error=new Error(message,{cause});error.capacityDiagnostic=diagnostic;return error;
}
async function deadline(work,ms,label) {
  let timer;
  try{return await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label+' timed out')),ms);})]);}
  finally{clearTimeout(timer);}
}
export const median=xs=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
export const hostSnapshot=()=>({at:Date.now(),times:cpus().map(cpu=>cpu.times)});
export function hostInterval(before,after) {
  const sum=(rows,key)=>rows.reduce((total,row)=>total+(key?row[key]:Object.values(row).reduce((a,b)=>a+b,0)),0);
  const total=sum(after.times)-sum(before.times),idle=sum(after.times,'idle')-sum(before.times,'idle');
  return {wallMs:after.at-before.at,busyFraction:total>0?1-idle/total:null,logicalCpuCount:before.times.length};
}

async function compiledController() {
  const sourcePath=resolve(root,'tests/chess-ai/providers/benchmarks/browser-cpu-quota.cs');
  const hash=createHash('sha256').update(await readFile(sourcePath)).digest('hex');
  const executable=resolve(root,`.omc/state/chess-tiers-quota-helper-${hash.slice(0,16)}.exe`);
  await mkdir(resolve(root,'.omc/state'),{recursive:true});
  if(!existsSync(executable))await exec('powershell.exe',['-NoProfile','-NonInteractive','-Command',
    'Add-Type -TypeDefinition ([IO.File]::ReadAllText($env:QCC_QUOTA_SOURCE)) -ReferencedAssemblies System.Management -OutputAssembly $env:QCC_QUOTA_EXE -OutputType ConsoleApplication'],
    {env:{...process.env,QCC_QUOTA_SOURCE:sourcePath,QCC_QUOTA_EXE:executable},windowsHide:true,timeout:60000});
  return {executable,sourceSha256:hash};
}

export async function launchQuotaBrowser(options={}) {
  if(process.platform!=='win32')throw Error('This measured CPU quota harness requires Windows job objects');
  const compiled=await compiledController();
  const javascriptHarnessSourceSha256=createHash('sha256').update(await readFile(fileURLToPath(import.meta.url))).digest('hex');
  const jobName='qcc-chess-'+randomUUID();
  const server=await chromium.launchServer({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--no-sandbox'],...options});
  const browserProcess=server.process(),rootProcessId=browserProcess.pid;
  let browser,controller,closed=false,commandBusy=false,accountingBusy=false,activeAccounting,protocolError;
  const probeCleanups=new Set();
  const cleanup={restored:false,browserExited:false,helperExited:false,errors:[]};
  try {
    controller=spawn(compiled.executable,[String(rootProcessId),jobName],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stderr='';controller.stderr.on('data',chunk=>{stderr+=chunk;});
    const rows=[],pending=[];
    let exit;
    const exited=new Promise(resolveExit=>controller.once('exit',(code,signal)=>{exit={code,signal};resolveExit(exit);while(pending.length)pending.shift().reject(Error(`Quota controller exited ${code}: ${stderr}`));}));
    controller.once('error',error=>{while(pending.length)pending.shift().reject(error);});
    controller.stdin.on('error',error=>{while(pending.length)pending.shift().reject(error);});
    createInterface({input:controller.stdout}).on('line',line=>{
      try {const value=JSON.parse(line);if(pending.length)pending.shift().resolve(value);else rows.push(value);}
      catch(error){while(pending.length)pending.shift().reject(error);}
    });
    const next=()=>new Promise((resolveNext,reject)=>{
      if(rows.length){resolveNext(rows.shift());return;}
      if(exit){reject(Error(`Quota controller exited ${exit.code}: ${stderr}`));return;}
      const waiter={resolve:value=>{clearTimeout(timer);resolveNext(value);},reject:error=>{clearTimeout(timer);reject(error);}};
      const timer=setTimeout(()=>{const index=pending.indexOf(waiter);if(index>=0)pending.splice(index,1);protocolError=Error('Quota controller acknowledgement timed out; further commands are unsafe');reject(protocolError);},30000);
      pending.push(waiter);
    });
    const ready=await next();
    const command=async line=>{
      if(protocolError)throw protocolError;
      if(exit)throw Error(`Quota controller exited ${exit.code}: ${stderr}`);
      if(commandBusy)throw capacityError('Overlapping quota controller commands',{command:line});
      commandBusy=true;
      try{controller.stdin.write(line+'\n');return await next();}finally{commandBusy=false;}
    };
    const idle=operation=>{if(closed||accountingBusy)throw capacityError('Rejected '+operation+' during close or an accounting interval',{closed,accountingBusy});};
    const verify=processId=>command('verify '+processId);
    const validateSnapshot=(snapshot,processId,expectedRate)=>{
      if(snapshot.rootProcessId!==rootProcessId||snapshot.jobName!==jobName||snapshot.cpuControlFlags!==5||snapshot.cpuRatePer10000!==expectedRate)throw capacityError('Queried hard cap or job identity mismatch',{snapshot,expectedRate});
      if(snapshot.verifiedProcessId!==processId||snapshot.verifiedInJob!==true||!snapshot.processIds.includes(processId))throw capacityError('Actual Worker host is not a verified member of the owned job',{snapshot,processId});
      if(!Number.isInteger(snapshot.logicalCpuCount)||snapshot.logicalCpuCount<1)throw capacityError('Invalid native logical processor count',{snapshot});
    };
    // No renderer/context exists before the browser root joins this single job.
    browser=await chromium.connect(server.wsEndpoint());
    const api={
      browser,server,jobName,rootProcessId,ready,controllerSourceSha256:compiled.sourceSha256,javascriptHarnessSourceSha256,
      setQuota:rate=>{idle('quota change');if(!Number.isInteger(rate)||rate<1||rate>10000)throw Error('Invalid CPU rate');return command('set '+rate);},
      status:()=>{idle('status query');return command('status');},
      verifyProcess:processId=>{idle('membership query');if(!Number.isInteger(processId)||processId<1)throw Error('Invalid Worker host PID');return verify(processId);},
      async accountingInterval(work,{workerProcessId,expectedCpuRatePer10000}) {
        idle('accounting interval');
        if(commandBusy)throw capacityError('Overlapping accounting interval and controller operation',{});
        if(!Number.isInteger(workerProcessId)||workerProcessId<1||![416,10000].includes(expectedCpuRatePer10000))throw Error('Capacity intervals require a traced Worker PID and rate416 or10000');
        accountingBusy=true;
        const metadata={workerProcessId,expectedCpuRatePer10000};
        const operation=(async()=>{
          try {
            metadata.before=await verify(workerProcessId);
            validateSnapshot(metadata.before,workerProcessId,expectedCpuRatePer10000);
            let failure;
            try{metadata.value=await work();}catch(error){failure=error;metadata.workError=String(error);}
            metadata.after=await verify(workerProcessId);
            validateSnapshot(metadata.after,workerProcessId,expectedCpuRatePer10000);
            if(failure)throw failure;
            return metadata;
          }catch(error){throw capacityError('Capacity accounting interval failed: '+error.message,metadata,error);}
          finally{accountingBusy=false;activeAccounting=undefined;}
        })();
        activeAccounting=operation;return await operation;
      },
      async close() {
        if(closed)return cleanup;closed=true;
        for(const closeProbe of [...probeCleanups])try{await closeProbe();}catch(error){cleanup.errors.push(String(error));}
        if(activeAccounting)try{await activeAccounting;}catch{/* The rejected operation retains its own diagnostic snapshots. */}
        try {const restored=await command('set 10000');if(restored.cpuRatePer10000!==10000||restored.cpuControlFlags!==5)throw Error('Full CPU cap restoration readback mismatch');cleanup.restored=true;}catch(error){cleanup.errors.push(String(error));}
        try {await browser.close();}catch(error){cleanup.errors.push(String(error));}
        try {await server.close();cleanup.browserExited=browserProcess.exitCode!==null||browserProcess.signalCode!==null;}catch(error){cleanup.errors.push(String(error));}
        try {await command('close');controller.stdin.end();await exited;cleanup.helperExited=exit.code===0;}catch(error){cleanup.errors.push(String(error));controller.stdin.end();await exited;cleanup.helperExited=exit?.code===0;}
        if(stderr.trim())cleanup.errors.push(stderr.trim());
        return cleanup;
      }
    };
    ownedStates.set(api,{probeCleanups});
    return api;
  }catch(error) {
    // EOF restores full CPU even if startup or connection failed.
    controller?.stdin.end();
    await browser?.close().catch(()=>{});await server.close().catch(()=>{});
    throw error;
  }
}

async function workerRequest(page,key,message,timeoutMs) {
  return await page.evaluate(async({key,message,timeoutMs})=>{
    const slot=globalThis.__qccCapacityProbes?.get(key);
    if(!slot)throw Error('Missing or stale persistent capacity Worker');
    if(slot.error)throw Error('Persistent capacity Worker failed: '+slot.error);
    if(slot.busy)throw Error('Overlapping persistent Worker operations');
    slot.busy=true;
    return await new Promise((resolveRow,reject)=>{
      let timer;
      const finish=(error,value)=>{
        clearTimeout(timer);slot.worker.onmessage=null;slot.worker.onerror=null;slot.rejectCurrent=undefined;slot.busy=false;
        if(error)reject(error);else resolveRow(value);
      };
      slot.rejectCurrent=error=>finish(error);
      timer=setTimeout(()=>finish(Error('Persistent capacity Worker request timed out')),timeoutMs);
      slot.worker.onmessage=event=>event.data?.type==='error'?finish(Error(event.data.message)):finish(undefined,event.data);
      slot.worker.onerror=event=>{slot.error=event.message;finish(Error(event.message));};
      try{slot.worker.postMessage(message);}catch(error){finish(error);}
    });
  },{key,message,timeoutMs});
}

function validateBatch(batch,repetitions,checksum) {
  if(batch?.type!=='batch'||!Array.isArray(batch.samples)||batch.samples.length!==repetitions||batch.totalIterations!==iterationsPerSample*repetitions)throw capacityError('Arithmetic batch count or total iterations mismatch',{batch,repetitions});
  const expected=checksum??batch.samples[0]?.checksum;
  if(!Number.isInteger(expected))throw capacityError('Invalid arithmetic checksum',{batch});
  for(const sample of batch.samples)if(sample.iterations!==iterationsPerSample||sample.checksum!==expected||!Number.isFinite(sample.ms)||sample.ms<=0)throw capacityError('Arithmetic sample checksum, iterations or duration mismatch',{sample,batch,expected});
  const summed=batch.samples.reduce((sum,row)=>sum+row.ms,0);
  if(!Number.isFinite(batch.batchWallMs)||batch.batchWallMs<=0||batch.summedLoopWallMs!==summed)throw capacityError('Arithmetic loop duration sum mismatch',{batch,summed});
  return {checksum:expected,summedLoopWallMs:summed};
}

async function traceWorkerIdentity(owned,page,key,marker,timeoutMs) {
  const trace=await owned.browser.newBrowserCDPSession();
  const matches=[];let eventCount=0,startAttempted=false,endRequested=false,complete;
  let resolveComplete;
  const completed=new Promise(resolveDone=>{resolveComplete=resolveDone;});
  const onComplete=event=>resolveComplete(event);
  const onData=event=>{
    eventCount+=event.value.length;
    for(const row of event.value)if(row.name==='TimeStamp'&&row.args?.data?.message===marker&&matches.length<2)matches.push({name:row.name,cat:row.cat,ph:row.ph,pid:row.pid,tid:row.tid,ts:row.ts,marker});
  };
  trace.on('Tracing.dataCollected',onData);trace.on('Tracing.tracingComplete',onComplete);
  try {
    startAttempted=true;
    await deadline(trace.send('Tracing.start',{categories:'-*,devtools.timeline',options:'record-until-full',transferMode:'ReportEvents'}),timeoutMs,'Worker identity trace start');
    const acknowledgement=await deadline(workerRequest(page,key,{type:'identity',marker},timeoutMs),timeoutMs,'Worker identity marker');
    if(acknowledgement?.type!=='identity'||acknowledgement.marker!==marker)throw capacityError('Worker identity acknowledgement mismatch',{acknowledgement,marker});
    endRequested=true;
    await deadline(trace.send('Tracing.end'),timeoutMs,'Worker identity trace end');
    complete=await deadline(completed,timeoutMs,'Worker identity trace completion');
    if(complete.dataLossOccurred||eventCount>20000||matches.length!==1)throw capacityError('Missing, ambiguous or incomplete actual Worker trace identity',{marker,matches,eventCount,complete});
    const event=matches[0];
    if(!Number.isInteger(event.pid)||event.pid<=0||!Number.isInteger(event.tid)||event.tid<=0)throw capacityError('Invalid traced OS Worker host identity',{event});
    return {method:'Unique console.timeStamp executed in the retained Worker, OS pid/tid from a bounded devtools.timeline trace before retained arithmetic.',marker,event,eventCount,dataLossOccurred:complete.dataLossOccurred??null};
  }catch(error){throw capacityError('Actual Worker identity trace failed: '+error.message,{marker,matches,eventCount,complete},error);}
  finally {
    if(startAttempted&&!endRequested)try{endRequested=true;await deadline(trace.send('Tracing.end'),timeoutMs,'Failed identity trace cleanup');}catch{/* The original error retains identity diagnostics. */}
    if(endRequested&&!complete)try{await deadline(completed,timeoutMs,'Failed identity trace completion');}catch{/* Detach below still releases this owned session. */}
    trace.off('Tracing.dataCollected',onData);trace.off('Tracing.tracingComplete',onComplete);
    await deadline(trace.detach(),timeoutMs,'Worker identity session detach');
  }
}

function accountingMetrics(interval,summedLoopWallMs) {
  const {before,after}=interval;
  const ticks=value=>{if(typeof value!=='string'||!/^\d+$/.test(value))throw Error('Invalid native integer counter');return BigInt(value);};
  try {
    const user=ticks(after.accounting.totalUserTime100ns)-ticks(before.accounting.totalUserTime100ns);
    const kernel=ticks(after.accounting.totalKernelTime100ns)-ticks(before.accounting.totalKernelTime100ns);
    const frequency=ticks(before.monotonic.frequency);
    const a0=ticks(before.monotonic.beforeQueryTicks),a1=ticks(before.monotonic.afterQueryTicks);
    const b0=ticks(after.monotonic.beforeQueryTicks),b1=ticks(after.monotonic.afterQueryTicks);
    if(user<0n||kernel<0n||user+kernel===0n||frequency<=0n||frequency!==ticks(after.monotonic.frequency)||a1<a0||b0<=a1||b1<b0||before.logicalCpuCount!==after.logicalCpuCount)throw Error('Nonmonotonic or empty job accounting interval');
    const jobCpuSeconds=Number(user+kernel)/10000000;
    const nativeMinimumWallMs=Number(b0-a1)/Number(frequency)*1000;
    const nativeMaximumWallMs=Number(b1-a0)/Number(frequency)*1000;
    const jobCpuPerLoopWall=jobCpuSeconds/(summedLoopWallMs/1000);
    if(![jobCpuSeconds,nativeMinimumWallMs,nativeMaximumWallMs,jobCpuPerLoopWall].every(value=>Number.isFinite(value)&&value>0)||summedLoopWallMs>nativeMaximumWallMs+1)throw Error('Invalid CPU or loop/native wall duration');
    return {jobUserDelta100ns:String(user),jobKernelDelta100ns:String(kernel),jobCpuSeconds,jobCpuPerLoopWall,nativeMinimumWallMs,nativeMaximumWallMs,nativeQueryBeforeSpanMs:Number(a1-a0)/Number(frequency)*1000,nativeQueryAfterSpanMs:Number(b1-b0)/Number(frequency)*1000,jobCpuPerNativeWallRange:[jobCpuSeconds/(nativeMaximumWallMs/1000),jobCpuSeconds/(nativeMinimumWallMs/1000)]};
  }catch(error){throw capacityError('Invalid capacity accounting metrics: '+error.message,{interval,summedLoopWallMs},error);}
}

/** capacity-v2 uses three fixed200Mloops. It makes no >=5x relative wall-slowdown claim. */
export async function createCapacityProbe(owned,page,{workerPath,startupTimeoutMs=120000,identityTimeoutMs=15000,batchTimeoutMs=60000}={}) {
  const ownerState=ownedStates.get(owned);
  if(!ownerState||page.context().browser()!==owned.browser)throw Error('Capacity proof requires a page belonging to this newly owned quota browser');
  const source=await readFile(resolve(root,'tests/chess-ai/providers/browser/cpu-probe.worker.js'),'utf8');
  const workerSourceSha256=createHash('sha256').update(source).digest('hex');
  const key='qcc-chess-capacity-'+randomUUID(),marker='qcc-chess-capacity-'+randomUUID();
  let closed=false,busy=false,closePromise,identity,warmup;
  const close=async()=>{
    if(closePromise)return await closePromise;
    closed=true;
    closePromise=(async()=>{
      try {
        if(!page.isClosed())await page.evaluate(key=>{
          const slots=globalThis.__qccCapacityProbes,slot=slots?.get(key);if(!slot)return;
          slot.rejectCurrent?.(Error('Persistent capacity Worker closed'));
          slot.worker.terminate();if(slot.blobURL)URL.revokeObjectURL(slot.blobURL);slots.delete(key);
        },key);
      }finally{ownerState.probeCleanups.delete(close);}
    })();
    return await closePromise;
  };
  ownerState.probeCleanups.add(close);
  try {
    const creationStarted=process.hrtime.bigint();
    await page.evaluate(({key,source,workerPath})=>{
      const slots=globalThis.__qccCapacityProbes??=new Map();
      if(slots.has(key))throw Error('Capacity Worker identity collision');
      const blobURL=workerPath?undefined:URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      let worker;
      try{worker=new Worker(workerPath||blobURL,workerPath?{type:'module'}:undefined);}catch(error){if(blobURL)URL.revokeObjectURL(blobURL);throw error;}
      const slot={worker,blobURL,busy:false};
      worker.addEventListener('error',event=>{slot.error=event.message;});slots.set(key,slot);
    },{key,source,workerPath});
    warmup=await workerRequest(page,key,{type:'batch',iterations:iterationsPerSample,repetitions:1},startupTimeoutMs);
    const warmValidation=validateBatch(warmup,1);
    const workerCreationAndWarmupWallMs=Number(process.hrtime.bigint()-creationStarted)/1000000;
    const traced=await traceWorkerIdentity(owned,page,key,marker,identityTimeoutMs);
    const membership=await owned.verifyProcess(traced.event.pid);
    if(membership.verifiedProcessId!==traced.event.pid||membership.verifiedInJob!==true||!membership.processIds.includes(traced.event.pid)||membership.jobName!==owned.jobName||membership.rootProcessId!==owned.rootProcessId)throw capacityError('Traced actual Worker host is outside the owned job',{traced,membership});
    identity={...traced,nativeMembership:membership,workerKey:key,workerSourceSha256};
    return {
      protocol:capacityProtocol,identity,warmup:{...warmup,workerCreationAndWarmupWallMs,excludedFromAccounting:true},
      async measure({expectedCpuRatePer10000=416}={}) {
        if(closed||busy||!identity)throw capacityError('Missing, closed or overlapping persistent capacity Worker operation',{closed,busy,identity});
        busy=true;let interval,rawBatch;const hostBefore=hostSnapshot();
        try {
          interval=await owned.accountingInterval(async()=>{
            rawBatch=await workerRequest(page,key,{type:'batch',iterations:iterationsPerSample,repetitions:capacityRepetitions},batchTimeoutMs);return rawBatch;
          },{workerProcessId:identity.event.pid,expectedCpuRatePer10000});
          const batch=validateBatch(rawBatch,capacityRepetitions,warmValidation.checksum);
          const metrics=accountingMetrics(interval,batch.summedLoopWallMs);
          return {protocol:capacityProtocol,workerProcessId:identity.event.pid,workerThreadId:identity.event.tid,workerMarker:identity.marker,workerSourceSha256,samples:rawBatch.samples,medianMs:median(rawBatch.samples.map(row=>row.ms)),summedLoopWallMs:batch.summedLoopWallMs,batchWallMs:rawBatch.batchWallMs,totalIterations:rawBatch.totalIterations,...metrics,accountingBefore:interval.before,accountingAfter:interval.after,hostLoad:hostInterval(hostBefore,hostSnapshot()),validation:{queriedHardCapMatches:true,queriedCpuRatePer10000:expectedCpuRatePer10000,queriedCpuControlFlags:5,workerMembershipProven:true,positiveFiniteAccounting:true,equalSuccessfulArithmetic:true,dutyTolerance:expectedCpuRatePer10000===416?.20:null,withinDutyTolerance:expectedCpuRatePer10000===416?metrics.jobCpuPerLoopWall<=.20:null},interpretation:'Whole-job scheduled CPU time divided by actual arithmetic-loop wall time. Other browser CPU is included, never subtracted. This is an observed duty estimate, not a frequency, physical-core, relative wall-speed or device-equivalence claim; 100ns counter units do not establish 100ns resolution.'};
        }catch(error){throw capacityError('Capacity measurement rejected: '+error.message,{identity,rawBatch,interval,operationDiagnostic:error.capacityDiagnostic,hostLoad:hostInterval(hostBefore,hostSnapshot())},error);}
        finally{busy=false;}
      },
      close
    };
  }catch(error){
    const diagnostic={identity,warmup,workerSourceSha256,workerKey:key,operationDiagnostic:error.capacityDiagnostic};
    try{await close();}catch(cleanupError){diagnostic.cleanupError=String(cleanupError);}
    throw capacityError('Persistent capacity probe setup failed: '+error.message,diagnostic,error);
  }
}

export async function arithmeticProbe(page,{repetitions=5,iterations=50000000,workerPath}={}) {
  const before=hostSnapshot();
  const samples=await page.evaluate(async({repetitions,iterations,workerPath})=>{
    const source=`onmessage=({data})=>{let checksum=123;const start=performance.now();for(let i=0;i<data.iterations;i++)checksum=Math.imul(checksum^i,1664525)+1013904223|0;postMessage({ms:performance.now()-start,checksum,iterations:data.iterations});}`;
    const url=workerPath||URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    const worker=new Worker(url,workerPath?{type:'module'}:undefined),rows=[];
    try {
      for(let repeat=0;repeat<=repetitions;repeat++)rows.push(await new Promise((resolveRow,reject)=>{
        const timer=setTimeout(()=>reject(Error('Fixed arithmetic Worker probe timed out')),30000);
        worker.onmessage=event=>{clearTimeout(timer);resolveRow(event.data);};
        worker.onerror=event=>{clearTimeout(timer);reject(Error(event.message));};
        worker.postMessage({iterations});
      }));
    }finally{worker.terminate();if(!workerPath)URL.revokeObjectURL(url);}
    return rows.slice(1);
  },{repetitions,iterations,workerPath});
  return {samples,medianMs:median(samples.map(row=>row.ms)),hostLoad:hostInterval(before,hostSnapshot())};
}
