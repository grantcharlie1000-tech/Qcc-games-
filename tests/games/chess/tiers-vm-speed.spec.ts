import {test,expect,chromium} from '@playwright/test';
import type {Browser,BrowserServer,Page,Worker as BrowserWorker} from '@playwright/test';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {cpus} from 'node:os';
import {Chess} from '../../../src/chess-ai/providers/beginner/vendor/chess.js';
import {hostSnapshot,hostInterval} from '../../chess-ai/providers/benchmarks/quota-browser.mjs';
import {prepareCustomModules} from '../../chess-ai/providers/browser/prepare';
import {providerRun,sourceSnapshot,type Side,type Position,type Row} from '../../chess-ai/providers/browser/speed-requests';

const output=process.env.CHESS_VM_SPEED_OUTPUT||'.omc/state/chess-tiers-vm-speed-final.json';
const profiles=[{name:'desktop',viewport:{width:1440,height:900},isMobile:false,hasTouch:false},{name:'phone-viewport',viewport:{width:390,height:844},isMobile:true,hasTouch:true}];
const sourceFolders={candidate:'src/chess-ai/providers/beginner/',baseline:'tests/chess-ai/providers/benchmarks/hillclimb-tiers/baseline/'};
const harnessPaths=['tests/games/chess/tiers-vm-speed.spec.ts','tests/chess-ai/providers/browser/speed-requests.ts','tests/chess-ai/providers/browser/prepare.ts','tests/chess-ai/providers/browser/custom.html','tests/chess-ai/providers/browser/cpu-probe.worker.js','tests/chess-ai/providers/benchmarks/quota-browser.mjs'];
const percentile=(values:number[],q:number)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*q)-1)];
const median=(values:number[])=>percentile(values,.5);
const harnessSnapshot=async()=>Object.fromEntries(await Promise.all(harnessPaths.map(async path=>[path,createHash('sha256').update(await readFile(path)).digest('hex')])));
type Sample=Row&{profile:string;slow:boolean;repeat:number;side:Side};

async function arithmetic(worker:BrowserWorker) {
  return await worker.evaluate(()=>{
    const samples=[];
    for(let repeat=0;repeat<3;repeat++) {
      let checksum=123;const started=performance.now(),iterations=10000000;
      for(let i=0;i<iterations;i++)checksum=Math.imul(checksum^i,1664525)+1013904223|0;
      samples.push({ms:performance.now()-started,checksum,iterations});
    }
    return samples;
  });
}

test('custom tiers retain legal work and fast replies in a verified slower JavaScript VM',async({browserName,baseURL},info)=>{
  test.skip(browserName!=='chromium'||process.env.CHESS_VM_SPEED_RUN!=='1','Opt-in slow JavaScript VM measurement.');
  test.setTimeout(900000);
  const sources=Object.fromEntries(await Promise.all((['baseline','candidate'] as const).map(async side=>[side,await sourceSnapshot(sourceFolders[side])])));
  const corpusPath='tests/chess-ai/providers/benchmarks/hillclimb-900/human-900-validation-2.json';
  const corpusBytes=await readFile(corpusPath),corpus=JSON.parse(corpusBytes.toString());
  const positions:Position[]=corpus.positions.filter((_:unknown,i:number)=>i%23===0).slice(0,8).map((p:{fen:string;history:string[]})=>({fen:p.fen,history:p.history,legal:new Chess(p.fen).moves({verbose:true}).map(m=>m.lan)}));
  const serverPreparation=await prepareCustomModules(baseURL!,['baseline','candidate']);
  const samples:Sample[]=[],startup:Record<string,unknown>[]=[],probeLegs:Record<string,unknown>[]=[],probes:Record<string,unknown>[]=[],hostLoad:Record<string,unknown>[]=[],summaries:Record<string,unknown>[]=[];
  const browsers=new Map<boolean,Browser>(),servers=new Map<boolean,BrowserServer>(),configurations:Record<string,unknown>[]=[];
  const report:Record<string,unknown>={generatedAt:new Date().toISOString(),protocol:'slow-js-vm-v1',method:'Same installed Chrome in normal and --js-flags=--jitless modes. No job CPU quota or page throttle. Actual dedicated Worker arithmetic verifies the slower runtime across five alternating pairs per viewport. This is not a constant CPU slowdown, frequency or phone equivalence. Jitless interprets user JS and disables WebAssembly; the four custom providers use JS only. Arithmetic factors must not be applied to chess timings. Original and current actual providers/Workers use identical eight positions, five seeds and burst request order. All completed rows including errors retained. Candidate moves, nodes and depth must match across modes/viewports. Startup and first replies separate. No production-runtime or physical-phone claim.',cpu:cpus()[0].model,sources,harness:await harnessSnapshot(),corpus:{path:corpusPath,sha256:createHash('sha256').update(corpusBytes).digest('hex'),positions},serverPreparation,configurations,probes,probeLegs,samples,startup,hostLoad,summaries};
  let failure:unknown;
  try {
    for(const slow of [false,true]) {
      const args=slow?['--js-flags=--jitless']:[];
      const server=await chromium.launchServer({headless:true,executablePath:process.env.CHROMIUM_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',args});
      servers.set(slow,server);
      const browser=await chromium.connect(server.wsEndpoint());
      browsers.set(slow,browser);
      configurations.push({slow,requestedArgs:args,version:browser.version(),spawnArgs:server.process().spawnargs,processId:server.process().pid});
    }
    for(const profile of profiles) {
      const active=new Map<boolean,{page:Page;worker:BrowserWorker;close:()=>Promise<void>}>();
      try {
        for(const slow of [false,true]) {
          const context=await browsers.get(slow)!.newContext({...profile,baseURL});
          const page=await context.newPage();
          await page.goto('/tests/chess-ai/providers/browser/custom.html');
          const ready=page.waitForEvent('worker');
          await page.evaluate(()=>{(globalThis as unknown as {probe:Worker}).probe=new Worker('/tests/chess-ai/providers/browser/cpu-probe.worker.js');});
          const worker=await ready;
          active.set(slow,{page,worker,close:async()=>{try{await page.evaluate(()=>{(globalThis as unknown as {probe:Worker}).probe.terminate();});}finally{await context.close();}}});
          const identity=await worker.evaluate(()=>({url:location.href,scope:globalThis.constructor.name,webAssembly:typeof WebAssembly}));
          expect(identity.scope).toBe('DedicatedWorkerGlobalScope');
          expect(identity.url.endsWith('/tests/chess-ai/providers/browser/cpu-probe.worker.js')).toBe(true);
          probes.push({profile:profile.name,slow,identity,warmup:{excluded:true,samples:await arithmetic(worker)}});
        }
        const ratios:number[]=[],checksums=new Set<number>();
        for(let repeat=0;repeat<5;repeat++) {
          const pair=new Map<boolean,number>();
          for(const slow of repeat%2?[true,false]:[false,true]) {
            const before=hostSnapshot(),rows=await arithmetic(active.get(slow)!.worker);
            probeLegs.push({profile:profile.name,repeat,slow,rows,hostLoad:hostInterval(before,hostSnapshot())});
            for(const row of rows){expect(row.iterations).toBe(10000000);checksums.add(row.checksum);expect(row.ms).toBeGreaterThan(0);}
            expect(checksums.size).toBe(1);pair.set(slow,median(rows.map(row=>row.ms)));
          }
          ratios.push(pair.get(true)!/pair.get(false)!);
        }
        report[profile.name+'ArithmeticRatios']=ratios;
        console.info(JSON.stringify({kind:'actual-worker-vm-proof',profile:profile.name,ratios}));
        expect(Math.min(...ratios),'each paired actual Worker arithmetic test must show at least5x slower JS execution').toBeGreaterThanOrEqual(5);
      }finally{for(const item of active.values())await item.close();}
    }
    for(let repeat=0;repeat<5;repeat++)for(const profile of repeat%2?[...profiles].reverse():profiles)for(const slow of repeat%2?[true,false]:[false,true])for(const side of repeat%2?(['candidate','baseline'] as const):(['baseline','candidate'] as const)) {
      const before=hostSnapshot(),context=await browsers.get(slow)!.newContext({...profile,baseURL});
      try {
        const page=await context.newPage(),began=Date.now();
        await page.goto('/tests/chess-ai/providers/browser/custom.html',{timeout:60000});
        const navigateMs=Date.now()-began,result=await providerRun(page,side,positions,repeat);
        startup.push({profile:profile.name,slow,repeat,side,navigateMs,moduleImportMs:result.moduleImportMs,initializeMs:result.initializeMs,firstReplies:result.firstReplies});
        samples.push(...result.rows.map(row=>({profile:profile.name,slow,repeat,side,...row})));
        console.info(JSON.stringify({kind:'provider-run',profile:profile.name,repeat,slow,side,warmReplies:result.rows.length,errors:result.rows.filter(row=>!row.legal).length}));
      }finally{hostLoad.push({profile:profile.name,slow,repeat,side,...hostInterval(before,hostSnapshot())});await context.close();}
    }
    for(const profile of profiles)for(const slow of [false,true])for(const side of ['baseline','candidate'] as const)for(const tier of [300,500,700,900]) {
      const rows=samples.filter(row=>row.profile===profile.name&&row.slow===slow&&row.side===side&&row.tier===tier),times=rows.map(row=>row.requestToReplyMs);
      const perRepeat=Array.from({length:5},(_,repeat)=>{const values=rows.filter(row=>row.repeat===repeat).map(row=>row.requestToReplyMs);return {repeat,p50Ms:percentile(values,.5),p95Ms:percentile(values,.95),maxMs:Math.max(...values)};});
      summaries.push({profile:profile.name,slow,side,tier,n:rows.length,errors:rows.filter(row=>!row.legal).length,p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),maxMs:Math.max(...times),perRepeat});
    }
    const differences=samples.filter(row=>row.side==='candidate').filter(row=>{
      const normal=samples.find(other=>other.side==='candidate'&&other.profile==='desktop'&&!other.slow&&other.repeat===row.repeat&&other.tier===row.tier&&other.positionIndex===row.positionIndex);
      return !normal||normal.move!==row.move||normal.nodes!==row.nodes||normal.depth!==row.depth;
    });
    report.workDifferences=differences;
    report.errors={warm:samples.filter(row=>!row.legal).length,firstReplies:startup.flatMap(row=>row.firstReplies as Row[]).filter(row=>!row.legal).length};
    for(const side of ['baseline','candidate'] as const)expect(await sourceSnapshot(sourceFolders[side])).toEqual(sources[side]);
    expect(await harnessSnapshot()).toEqual(report.harness);
    expect(report.errors).toEqual({warm:0,firstReplies:0});expect(differences).toEqual([]);
    for(const row of summaries.filter(row=>row.side==='candidate'))expect(Number(row.p95Ms),`${row.profile} tier${row.tier} slow=${row.slow}`).toBeLessThan(row.slow?200:100);
  }catch(error){failure=error;report.error=String(error);}
  finally {
    const cleanup=[];
    for(const [slow,server] of servers){
      try{await browsers.get(slow)?.close();await server.close();cleanup.push({slow,closed:!browsers.get(slow)?.isConnected(),serverExited:server.process().exitCode!==null});}
      catch(error){cleanup.push({slow,closed:false,error:String(error)});try{await server.close();}catch{}}
    }
    report.cleanup=cleanup;await writeFile(output,JSON.stringify(report,null,2));
    await info.attach('slow JS VM report',{path:output,contentType:'application/json'});
  }
  if(failure)throw failure;
  expect(report.cleanup).toEqual([{slow:false,closed:true,serverExited:true},{slow:true,closed:true,serverExited:true}]);
});
