import {test,expect} from '../fixtures';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

// Same real games and scroll traversal on both refs. Timing samples are retained
// even when the budget fails: a shared software-rendering host is not a phone.
for(const device of [
  {name:'mobile',viewport:{width:393,height:852},rate:4},
  {name:'desktop',viewport:{width:1440,height:1000},rate:1}
])test.describe(device.name,()=>{
  test.use({viewport:device.viewport,deviceScaleFactor:1,isMobile:device.name==='mobile',hasTouch:device.name==='mobile'});
  for(const scene of ['home-scroll','claimline','crossy-road'])test(`${scene}: median and p95 frame time`,async({page,browserName})=>{
    test.skip(browserName!=='chromium','CDP CPU throttling is a Chromium measurement.');
    test.setTimeout(120_000);
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate',{rate:device.rate});
    await cdp.send('Performance.enable');
    await page.addInitScript(()=>{
      let seed=11;
      Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
      crypto.getRandomValues=<T extends ArrayBufferView|null>(array:T):T=>{
        if(array){const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);bytes.fill(11);}return array;
      };
    });
    const frames:number[]=[],runs:unknown[]=[];
    for(let repeat=0;repeat<3;repeat++){
      await page.evaluate(()=>localStorage.clear()).catch(()=>{});
      await page.goto(scene==='home-scroll'?'/#/collection':`/#/game/${scene}`);
      if(scene==='home-scroll'){
        await expect(page.locator('.section-tabbar')).toBeVisible();
        await page.evaluate(()=>document.fonts.ready);
      }else if(scene==='claimline'){
        await page.locator('.cl-start').click();
        await expect(page.locator('.cl-game')).toHaveAttribute('data-phase','running');
      }else{
        await expect(page.locator('.crossy-road')).toBeVisible();
        await page.keyboard.press('ArrowUp');
        await expect(page.locator('.crossy-road')).toHaveAttribute('data-phase','running');
      }
      if(scene!=='home-scroll')await page.evaluate(scene=>{
        const drive=()=>{
          const root=document.querySelector<HTMLElement>(scene==='claimline'?'.cl-game':'.crossy-road');
          if(root?.dataset.phase==='over')root.querySelector<HTMLButtonElement>(scene==='claimline'?'.cl-start':'.hw-again')?.click();
          else if(scene==='crossy-road')root?.querySelector('canvas')?.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
        };
        // Drive through the same public keys/restart buttons as a player; no
        // frozen simulation, fake canvas or altered gameplay enters this run.
        setInterval(drive,180);
      },scene);
      await page.waitForTimeout(800);
      const before=await cdp.send('Performance.getMetrics');
      const run=await page.evaluate(async({scroll})=>{
        const intervals:number[]=[],allIntervals:number[]=[];
        const stats=()=>({...((globalThis as unknown as {__qccGlassStats?:Record<string,number>}).__qccGlassStats??{})});
        const startStats=stats(),travel=Math.max(0,document.documentElement.scrollHeight-innerHeight);
        const phases:Record<string,number>={};
        let last=0,start=0,previousPhase:string|null=null;
        await new Promise<void>(resolve=>{
          function tick(now:number){
            const phase=document.querySelector('.cl-game,.crossy-road')?.getAttribute('data-phase');
            if(!start){start=now;last=now;}
            else{
              allIntervals.push(now-last);
              if(scroll||(phase==='running'&&previousPhase==='running'))intervals.push(now-last);
            }
            last=now;previousPhase=phase??null;
            if(phase)phases[phase]=(phases[phase]??0)+1;
            if(scroll){
              const phase=((now-start)/2400)%2;
              window.scrollTo(0,travel*(phase<1?phase:2-phase));
            }
            if(now-start>=5000){resolve();return;}
            requestAnimationFrame(tick);
          }
          requestAnimationFrame(tick);
        });
        return {intervals,allIntervals,travel,startStats,endStats:stats(),phases};
      },{scroll:scene==='home-scroll'});
      const after=await cdp.send('Performance.getMetrics');
      const prior=new Map(before.metrics.map(m=>[m.name,m.value]));
      const metrics=Object.fromEntries(after.metrics.filter(m=>['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration','LayoutCount','RecalcStyleCount'].includes(m.name)).map(m=>[m.name,m.value-(prior.get(m.name)??0)]));
      if(scene==='home-scroll')expect(run.travel).toBeGreaterThan(200);
      else expect(run.intervals.length,'active-play timing samples, excluding menus/death screens').toBeGreaterThan(15);
      frames.push(...run.intervals);runs.push({...run,metrics});
    }
    const sorted=[...frames].sort((a,b)=>a-b),quantile=(q:number)=>sorted[Math.ceil(sorted.length*q)-1];
    const result={device:device.name,scene,viewport:device.viewport,deviceScaleFactor:1,cpuThrottle:device.rate,variant:process.env.PERF_VARIANT??'working',samples:frames.length,median:quantile(.5),p95:quantile(.95),p99:quantile(.99),sampling:'active gameplay; raw all-phase intervals also retained',runs};
    await test.info().attach('frame-times',{body:JSON.stringify(result),contentType:'application/json'});
    if(process.env.PERF_OUTPUT){
      let stored:typeof result[]=[];
      try{stored=JSON.parse(await readFile(process.env.PERF_OUTPUT,'utf8'));}catch{/* first case */}
      stored=stored.filter(r=>r.device!==result.device||r.scene!==scene);stored.push(result);
      await mkdir(dirname(process.env.PERF_OUTPUT),{recursive:true});
      await writeFile(process.env.PERF_OUTPUT,JSON.stringify(stored,null,2));
    }
    if(process.env.PERF_COMPARE){
      const baseline=JSON.parse(await readFile(process.env.PERF_COMPARE,'utf8')) as typeof result[];
      const original=baseline.find(r=>r.device===device.name&&r.scene===scene)!;
      expect(original,'matching main measurement').toBeTruthy();
      // Compare frame buckets, avoiding a false regression from 0.1ms clock
      // quantization while retaining all raw values in the report.
      expect.soft(Math.round(result.p95),'p95 no worse than main (rounded ms)').toBeLessThanOrEqual(Math.max(20,Math.round(original.p95)));
    }
  });
});
