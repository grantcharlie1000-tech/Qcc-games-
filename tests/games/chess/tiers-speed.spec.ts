import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {Chess} from '../../../src/chess-ai/providers/beginner/vendor/chess.js';
import {createCapacityProbe,hostInterval,hostSnapshot,launchQuotaBrowser,median} from '../../chess-ai/providers/benchmarks/quota-browser.mjs';
import {prepareCustomModules} from '../../chess-ai/providers/browser/prepare';

const output=process.env.CHESS_SPEED_OUTPUT||'.omc/state/chess-tiers-quota-browser-speed.json';
const percentile=(values:number[],q:number)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*q)-1)];
const profiles=[
  {name:'desktop',viewport:{width:1440,height:900},isMobile:false,hasTouch:false},
  {name:'phone-viewport',viewport:{width:390,height:844},isMobile:true,hasTouch:true},
];
const tiers=[300,500,700,900];
const fixturePath='tests/chess-ai/providers/browser/custom.html';
const harnessPaths=[fixturePath,'tests/games/chess/tiers-speed.spec.ts','tests/chess-ai/providers/browser/prepare.ts','tests/chess-ai/providers/browser/cpu-probe.worker.js','tests/chess-ai/providers/benchmarks/quota-browser.mjs','tests/chess-ai/providers/benchmarks/browser-cpu-quota.cs'];
type Side='baseline'|'candidate';
type Position={fen:string;history:string[];legal:string[]};
type Row={tier:number;positionIndex:number;requestToReplyMs:number;legal:boolean;move?:string;nodes?:number;depth?:number;workerElapsedMs?:number;error?:string};
type Sample=Row&{profile:string;limited:boolean;repeat:number;side:Side};

async function harnessSnapshot() {
  return Object.fromEntries(await Promise.all(harnessPaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
}

async function sourceSnapshot(folder:string) {
  const files:Record<string,string>={};
  async function visit(relative=''):Promise<void> {
    for(const item of await readdir(folder+relative,{withFileTypes:true})) {
      const name=relative+item.name;
      if(item.isDirectory())await visit(name+'/');
      else if(/\.(ts|js)$/.test(name))files[name]=createHash('sha256').update(await readFile(folder+name)).digest('hex');
    }
  }
  await visit();
  const ordered=Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b)));
  return {sha256:createHash('sha256').update(JSON.stringify(ordered)).digest('hex'),files:ordered};
}

async function providerRun(page:Page,side:Side,positions:Position[],repeat:number) {
  return await page.evaluate(async({side,positions,repeat,tiers})=>{
    const path=side==='baseline'?'/tests/chess-ai/providers/benchmarks/hillclimb-tiers/baseline/index.ts':'/src/chess-ai/providers/beginner/index.ts';
    const importStarted=performance.now();
    const {createProvider}=await import(path);
    const moduleImportMs=performance.now()-importStarted;
    const seedDescriptor=Object.getOwnPropertyDescriptor(crypto,'getRandomValues');
    Object.defineProperty(crypto,'getRandomValues',{configurable:true,value:(array:Uint32Array)=>{array[0]=1234+repeat;return array;}});
    const NativeWorker=window.Worker;
    let diagnostic:{nodes:number;depth?:number;elapsedMs:number}|undefined;
    const workers=new Set<Worker>();
    class MeasuredWorker extends NativeWorker {
      constructor(url:string|URL,options?:WorkerOptions) {
        super(url,options);workers.add(this);
        this.addEventListener('message',event=>{if(event.data.type==='result')diagnostic=event.data.result;});
      }
      override terminate(){workers.delete(this);super.terminate();}
    }
    window.Worker=MeasuredWorker;
    const provider=createProvider(),rows:Row[]=[],firstReplies:Row[]=[];
    let serial=0;
    const initializeStarted=performance.now();
    async function move(tier:number,positionIndex:number):Promise<Row> {
      const p=positions[positionIndex];diagnostic=undefined;const started=performance.now();
      try {
        const reply=await provider.chooseMove({fen:p.fen,startFen:p.fen,moveHistoryUci:p.history,legalMovesUci:p.legal,opponentId:`elo-${tier}`,thinkingTimeMs:tier<=500?400:500,positionRevision:++serial,signal:new AbortController().signal});
        // The awaited message listener assigns this value outside TS flow analysis.
        const measured=diagnostic as {nodes:number;depth?:number;elapsedMs:number}|undefined;
        if(!measured||!Number.isFinite(measured.nodes))throw Error('Actual Worker result diagnostics missing');
        return {tier,positionIndex,requestToReplyMs:performance.now()-started,legal:p.legal.includes(reply.moveUci),move:reply.moveUci,nodes:measured.nodes,depth:measured.depth,workerElapsedMs:measured.elapsedMs};
      }catch(error){return {tier,positionIndex,requestToReplyMs:performance.now()-started,error:String(error),legal:false};}
    }
    let initializeMs=0;
    try {
      await provider.initialize({signal:new AbortController().signal,onProgress:()=>{}});
      initializeMs=performance.now()-initializeStarted;
      // Exercise each actual search before retaining warm request timings.
      for(const tier of tiers)firstReplies.push(await move(tier,0));
      for(const tier of tiers)for(let positionIndex=0;positionIndex<positions.length;positionIndex++)rows.push(await move(tier,positionIndex));
      return {moduleImportMs,initializeMs,firstReplies,rows};
    }finally {
      provider.dispose();
      const leakedWorkers=workers.size;
      for(const worker of workers)worker.terminate();
      window.Worker=NativeWorker;
      if(seedDescriptor)Object.defineProperty(crypto,'getRandomValues',seedDescriptor);else Reflect.deleteProperty(crypto,'getRandomValues');
      if(leakedWorkers)throw Error(`${leakedWorkers} provider Workers leaked after dispose`);
    }
  },{side,positions,repeat,tiers});
}

test('custom tiers keep legal work and respond quickly under a verified worker CPU capacity limit',async({browserName,baseURL},testInfo)=>{
  test.skip(browserName!=='chromium'||process.platform!=='win32','Measured CPU quotas require owned Chromium on Windows.');
  test.setTimeout(900000);
  const probeOnly=process.env.CHESS_SPEED_PROBE_ONLY==='1';
  test.skip(!probeOnly&&process.env.CHESS_SPEED_RUN!=='1','Opt in with CHESS_SPEED_RUN=1; this is a bounded measurement, not a routine suite test.');
  const rate=Number(process.env.CHESS_QUOTA_RATE||Math.floor(10000/(cpus().length*6)));
  expect(rate,'capacity-v2 retains the original hard cap416').toBe(416);
  expect(cpus().length,'the fixed416 protocol is calibrated on four logical processors').toBe(4);
  const selectedSides:Side[]=process.env.CHESS_SPEED_BASELINE_ONLY==='1'?['baseline']:process.env.CHESS_SPEED_CANDIDATE_ONLY==='1'?['candidate']:['baseline','candidate'];
  const sourceFolders={candidate:'src/chess-ai/providers/beginner/',baseline:'tests/chess-ai/providers/benchmarks/hillclimb-tiers/baseline/'};
  const sources=Object.fromEntries(await Promise.all(selectedSides.map(async side=>[side,await sourceSnapshot(sourceFolders[side])])));
  const corpusPath='tests/chess-ai/providers/benchmarks/hillclimb-900/human-900-validation-2.json';
  const corpusBytes=await readFile(corpusPath),corpus=JSON.parse(corpusBytes.toString());
  const positions:Position[]=corpus.positions.filter((_:unknown,i:number)=>i%23===0).slice(0,8).map((p:{fen:string;history:string[]})=>({fen:p.fen,history:p.history,legal:new Chess(p.fen).moves({verbose:true}).map(move=>move.lan)}));
  const serverPreparation=await prepareCustomModules(baseURL!,selectedSides);
  const owned=await launchQuotaBrowser();
  const samples:Sample[]=[],startup:Record<string,unknown>[]=[],hostLoad:Record<string,unknown>[]=[],probeLegs:Record<string,unknown>[]=[],capacityWorkers:Record<string,unknown>[]=[],summaries:Record<string,unknown>[]=[];
  const arithmeticChecksums=new Set<number>();
  const report:Record<string,unknown>={generatedAt:new Date().toISOString(),protocol:'capacity-v2',method:'Actual dev-browser providers and module Workers. A persistent Windows CPU-rate controller owns only a new browser tree. The queried416 hard cap is unchanged. Actual Worker OS PID/TID and job membership are proven before retained work. Three200M arithmetic loops per leg verify scheduled CPU duty with whole-job user+kernel accounting divided by summed actual loop wall duration; .20 is accounting tolerance alongside the fixed cap. Relative wall ratios are descriptive, with no6xthroughput or physical-core equivalence claim. Five alternating baseline/candidate repetitions per viewport and CPU condition. Startup, first replies, warm legal replies and host load remain separate. Phone viewport and touch are emulated. No physical-phone or production-runtime claim.',cpu:cpus()[0].model,logicalCpuCount:cpus().length,cpuRatePer10000:rate,configuredHostCpuFraction:rate/10000,nominalLogicalProcessorEquivalents:cpus().length*rate/10000,sources,corpus:{path:corpusPath,sha256:createHash('sha256').update(corpusBytes).digest('hex'),positions},jobName:owned.jobName,browserProcessId:owned.rootProcessId,controllerSourceSha256:owned.controllerSourceSha256,javascriptHarnessSourceSha256:owned.javascriptHarnessSourceSha256,controllerReady:owned.ready,probeOnly,probeLegs,capacityWorkers,hostLoad,startup,samples,summaries};
  let failure:unknown;
  report.serverPreparation=serverPreparation;
  report.harness=await harnessSnapshot();
  try {
    // Verify actual Worker membership and scheduled duty before provider runs.
    for(const profile of profiles) {
      const context=await owned.browser.newContext({...profile,baseURL});
      let probe:Awaited<ReturnType<typeof createCapacityProbe>>|undefined;
      try {
        const page=await context.newPage();
        await page.goto('/'+fixturePath,{waitUntil:'load',timeout:60000});
        report.userAgent=await page.evaluate(()=>navigator.userAgent);
        await owned.setQuota(10000);
        probe=await createCapacityProbe(owned,page,{workerPath:'/tests/chess-ai/providers/browser/cpu-probe.worker.js'});
        capacityWorkers.push({profile:profile.name,identity:probe.identity,warmup:probe.warmup});
        const pairs:number[]=[];
        for(let repeat=0;repeat<5;repeat++) {
          const pair=new Map<boolean,number>();
          for(const limited of repeat%2?[true,false]:[false,true]) {
            const quota=await owned.setQuota(limited?rate:10000);
            const measured=await probe.measure({expectedCpuRatePer10000:limited?416:10000});
            probeLegs.push({profile:profile.name,repeat,limited,quota,...measured});pair.set(limited,measured.medianMs);
            console.info(JSON.stringify({kind:'worker-capacity-probe',profile:profile.name,repeat,limited,medianMs:measured.medianMs,jobCpuPerLoopWall:measured.jobCpuPerLoopWall,hostBusy:measured.hostLoad.busyFraction}));
            for(const row of measured.samples){arithmeticChecksums.add(row.checksum);expect(row.iterations).toBe(200000000);}
            expect(measured.samples).toHaveLength(3);
            expect(measured.totalIterations).toBe(600000000);
            expect(measured.validation.queriedHardCapMatches).toBe(true);
            expect(measured.validation.workerMembershipProven).toBe(true);
            expect(arithmeticChecksums.size,'fixed work must match across all CPU conditions and viewports').toBe(1);
          }
          pairs.push(pair.get(true)!/pair.get(false)!);
        }
        const duties=probeLegs.filter(row=>row.profile===profile.name&&row.limited).map(row=>Number(row.jobCpuPerLoopWall));
        summaries.push({profile:profile.name,kind:'capacity-probe',descriptivePairedWallRatios:pairs,medianWallRatio:median(pairs),minimumWallRatio:Math.min(...pairs),maximumWallRatio:Math.max(...pairs),limitedJobCpuPerLoopWall:duties,maximumObservedDuty:Math.max(...duties),nominalLogicalProcessorEquivalents:cpus().length*rate/10000});
        expect(duties).toHaveLength(5);
        expect(Math.max(...duties),`${profile.name}: accounting tolerance alongside unchanged416hardcap`).toBeLessThanOrEqual(.20);
        await owned.setQuota(10000);
        await page.evaluate(({name,pairs,duties})=>{document.body.innerHTML='<h1>Worker CPU capacity check</h1><pre></pre>';document.querySelector('pre')!.textContent=JSON.stringify({viewport:name,descriptiveWallRatios:pairs,jobCpuPerLoopWall:duties},null,2);},{name:profile.name,pairs,duties});
        const screenshot=`.omc/state/chess-tiers-quota-${profile.name}-probe.png`;
        await page.screenshot({path:screenshot});await testInfo.attach(`${profile.name} quota probe`,{path:screenshot,contentType:'image/png'});
      }finally{try{await probe?.close();}finally{await context.close();}}
    }
    if(!probeOnly) {
      // Both CPU conditions and both provider sides alternate to share host drift.
      for(let repeat=0;repeat<5;repeat++)for(const profile of repeat%2?[...profiles].reverse():profiles)for(const limited of repeat%2?[true,false]:[false,true])for(const side of repeat%2?[...selectedSides].reverse():selectedSides) {
        const quota=await owned.setQuota(limited?rate:10000);
        const hostBefore=hostSnapshot();
        const context=await owned.browser.newContext({...profile,baseURL});
        try {
          const page=await context.newPage(),navigateStart=Date.now();
          await page.goto('/'+fixturePath,{waitUntil:'load',timeout:60000});
          const navigateMs=Date.now()-navigateStart;
          const result=await providerRun(page,side,positions,repeat);
          startup.push({profile:profile.name,limited,repeat,side,navigateMs,moduleImportMs:result.moduleImportMs,initializeMs:result.initializeMs,firstReplies:result.firstReplies});
          samples.push(...result.rows.map(row=>({profile:profile.name,limited,repeat,side,...row})));
          console.info(JSON.stringify({kind:'provider-run',profile:profile.name,repeat,limited,side,warmReplies:result.rows.length,errors:result.rows.filter(row=>!row.legal).length}));
        }finally {
          hostLoad.push({profile:profile.name,limited,repeat,side,quota,...hostInterval(hostBefore,hostSnapshot())});
          await context.close();
        }
      }
      for(const profile of profiles)for(const limited of [false,true])for(const side of selectedSides)for(const tier of tiers) {
        const rows=samples.filter(s=>s.profile===profile.name&&s.limited===limited&&s.side===side&&s.tier===tier),times=rows.map(s=>s.requestToReplyMs);
        const perRepeat=Array.from({length:5},(_,repeat)=>{const values=rows.filter(row=>row.repeat===repeat).map(row=>row.requestToReplyMs);return {repeat,p50Ms:percentile(values,.5),p95Ms:percentile(values,.95),minMs:Math.min(...values),maxMs:Math.max(...values)};});
        summaries.push({profile:profile.name,limited,side,tier,n:rows.length,errors:rows.filter(row=>!row.legal).length,p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),maxMs:Math.max(...times),perRepeat,medianRepeatP95Ms:median(perRepeat.map(row=>row.p95Ms)),repeatP95RangeMs:[Math.min(...perRepeat.map(row=>row.p95Ms)),Math.max(...perRepeat.map(row=>row.p95Ms))]});
      }
      const workDifferences=samples.filter(s=>s.side==='candidate').filter(s=>{
        const normal=samples.find(n=>n.side==='candidate'&&n.profile==='desktop'&&!n.limited&&n.repeat===s.repeat&&n.tier===s.tier&&n.positionIndex===s.positionIndex);
        return !normal||normal.move!==s.move||normal.nodes!==s.nodes||normal.depth!==s.depth;
      });
      report.workDifferences=workDifferences;
      report.errors={warm:samples.filter(s=>!s.legal).length,firstReplies:startup.flatMap(row=>row.firstReplies as Row[]).filter(row=>!row.legal).length};
      for(const side of selectedSides)expect(await sourceSnapshot(sourceFolders[side]),`${side} source changed during benchmark`).toEqual(sources[side]);
      expect(await harnessSnapshot(),'measurement harness changed during benchmark').toEqual(report.harness);
      expect(report.errors).toEqual({warm:0,firstReplies:0});
      if(selectedSides.includes('candidate')) {
        expect(workDifferences,'same seed and normal clock must preserve candidate moves, node counts and depth across CPU conditions and viewports').toEqual([]);
        for(const row of summaries.filter(row=>row.side==='candidate'))expect(Number(row.p95Ms),`${row.profile} elo-${row.tier}, limited=${row.limited}`).toBeLessThan(row.limited?200:100);
      }
    }
  }catch(error){
    failure=error;report.error=String(error);
    if(error&&typeof error==='object'&&'capacityDiagnostic' in error)report.capacityDiagnostic=error.capacityDiagnostic;
  }
  finally {
    report.cleanup=await owned.close();
    await writeFile(output,JSON.stringify(report,null,2));
    await testInfo.attach('quota browser report',{path:output,contentType:'application/json'});
  }
  if(failure)throw failure;
  expect(report.cleanup).toEqual({restored:true,browserExited:true,helperExited:true,errors:[]});
});
