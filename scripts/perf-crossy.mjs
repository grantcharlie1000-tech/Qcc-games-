/** Mobile performance probe. Run this worktree on 4190, then:
 * PERF_LABEL=before npm run perf:crossy
 * PERF_LABEL=after PERF_HOPS=300 npm run perf:crossy -- --check
 * The 20-second live run pins revision 3 / seed 7 and the same control policy.
 * Actual attempted hops and active DPR are reported, since scheduling varies.
 * CPU-throttled SwiftShader is a reproducible stress test, not an iPhone GPU benchmark.
 */
import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {crossySourceHash} from './crossy-source.mjs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';

const base=new URL(process.env.ARCADE_URL||'http://127.0.0.1:4190');
if(base.port!=='4190')throw new Error('Use this worktree on port 4190.');
const label=process.env.PERF_LABEL||'after';
if(!/^[a-z0-9-]+$/.test(label))throw new Error('Invalid PERF_LABEL');
const duration=Number(process.env.PERF_SECONDS||20),check=process.argv.includes('--check');
const stressHops=Number(process.env.PERF_HOPS||(check?300:0));
assert.ok(duration>=5&&duration<=60&&Number.isInteger(stressHops)&&stressHops>=0&&stressHops<=1000);
const out='/workspace/qcc-crossy-review/perf';await mkdir(out,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true});
await context.addInitScript(()=>{
  localStorage.setItem('pocket-arcade:v1:accounts:guest','true');
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
  sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
});
const page=await context.newPage();page.setDefaultTimeout(90000);
const cdp=await context.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
await cdp.send('Performance.enable');
const heap=async()=>{
  const {metrics}=await cdp.send('Performance.getMetrics');
  return Object.fromEntries(metrics.filter(m=>['JSHeapUsedSize','JSHeapTotalSize','Nodes','Documents','JSEventListeners'].includes(m.name)).map(m=>[m.name,m.value]));
};
const quantiles=values=>{
  const sorted=[...values].sort((a,b)=>a-b),at=p=>sorted[Math.min(sorted.length-1,Math.ceil(sorted.length*p)-1)]??0;
  return {samples:sorted.length,p50:at(.5),p95:at(.95),max:sorted.at(-1)??0};
};
try{
  const started=Date.now();await page.goto(`${base.origin}/#/game/crossy-road?seed=7`);
  await page.waitForFunction(()=>window.__crossyRoadTest);
  assert.equal(await page.locator('#game-title').evaluate(e=>e.firstChild.textContent.trim()),'Crossy Road');
  await page.evaluate(async()=>{const {createRun}=await import('/src/games/crossy-road/rules.ts');window.__crossyRoadTest.restore({...createRun(7),worldVersion:3});});
  if(process.env.PERF_QUALITY) await page.evaluate(q=>window.__crossyRoadTest.setQuality(q),process.env.PERF_QUALITY);
  await page.waitForTimeout(500);
  const startupMs=Date.now()-started;
  await page.evaluate(async()=>{
    const {vehicleHit,trainHit,platformAt}=await import('/src/games/crossy-road/lanes.ts');
    const {createRun}=await import('/src/games/crossy-road/rules.ts');
    const h=window.__crossyRoadTest,canvas=document.querySelector('.hw-canvas');
    const p=window.__crossyPerf={frames:[],longTasks:[],feedback:[],inputs:[],renderer:[],attempts:0,restarts:0,maxRow:0,running:false,pending:null,raf:0,timer:0,last:0};
    p.observer=new PerformanceObserver(list=>{if(p.running)for(const e of list.getEntries())p.longTasks.push({start:e.startTime,duration:e.duration});});
    p.observer.observe({type:'longtask',buffered:false});
    canvas.addEventListener('pointerdown',()=>{if(p.running)p.pending={at:performance.now(),row:h.state().row,feedback:false};},{capture:true});
    function frame(t){
      if(!p.running)return;
      if(p.last)p.frames.push(t-p.last);p.last=t;
      if(p.pending){if(!p.pending.feedback&&document.querySelector('.crossy-road').dataset.pressed==='true'){p.feedback.push(t-p.pending.at);p.pending.feedback=true;}const s=h.state();if(s.hopping||s.row!==p.pending.row){p.inputs.push(t-p.pending.at);p.pending=null;}}
      p.raf=requestAnimationFrame(frame);
    }
    function safe(lane,x,t){
      if(lane.kind==='grass')return !lane.blocked[Math.round(x)];
      if(lane.kind==='river'||lane.kind==='lily')return platformAt(lane,x,t+.12)&&platformAt(lane,x,t+.20);
      for(let dt=0;dt<=.28;dt+=.03)if(lane.kind==='road'?vehicleHit(lane,x,t+dt):trainHit(lane,x,t+dt))return false;
      return true;
    }
    function bot(){
      if(!p.running)return;
      const s=h.state();p.maxRow=Math.max(p.maxRow,s.maxRow);
      if(s.phase==='over'){h.restore({...createRun(7),worldVersion:3});p.restarts++;}
      else if((s.phase==='ready'||s.phase==='running')&&!s.hopping){
        const next=s.lanes.find(l=>l.row===s.row+1),here=s.lanes.find(l=>l.row===s.row);
        const x=next.kind==='river'?s.x:Math.round(s.x);
        let dir=safe(next,x,s.t)?'up':null;
        if(!dir&&here.kind==='grass')for(const side of [-1,1]){
          const c=s.col+side;
          if(c>=0&&c<9&&!here.blocked[c]&&safe(next,c,s.t+.14)){dir=side<0?'left':'right';break;}
        }
        if(dir){
          p.attempts++;
          if(dir==='up'){
            const opts={bubbles:true,cancelable:true,pointerType:'touch',pointerId:1,isPrimary:true,button:0,clientX:195,clientY:540};
            canvas.dispatchEvent(new PointerEvent('pointerdown',opts));
            setTimeout(()=>canvas.dispatchEvent(new PointerEvent('pointerup',opts)),35);
          }else window.dispatchEvent(new KeyboardEvent('keydown',{key:dir==='left'?'ArrowLeft':'ArrowRight',bubbles:true,cancelable:true}));
        }
      }
      p.timer=setTimeout(bot,140);
    }
    p.start=()=>{p.running=true;p.begin=performance.now();p.raf=requestAnimationFrame(frame);p.timer=setTimeout(bot,0);};
    p.stop=()=>{p.running=false;cancelAnimationFrame(p.raf);clearTimeout(p.timer);p.observer.disconnect();};
  });
  const beforeHeap=await heap();
  const memoryBefore=await page.evaluate(()=>performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null);
  await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  await page.evaluate(()=>window.__crossyPerf.start());
  for(let second=0;second<duration;second++){
    await page.waitForTimeout(1000);
    await page.evaluate(()=>{const p=window.__crossyPerf,c=document.querySelector('.hw-canvas');p.renderer.push({at:performance.now()-p.begin,...window.__crossyRoadTest.stats(),buffer:[c.width,c.height]});});
  }
  const data=await page.evaluate(()=>{const p=window.__crossyPerf;p.stop();const gl=document.querySelector('.hw-canvas').getContext('webgl2'),debug=gl.getExtension('WEBGL_debug_renderer_info');return {durationMs:performance.now()-p.begin,frames:p.frames,longTasks:p.longTasks,inputs:p.inputs,feedback:p.feedback,renderer:p.renderer,attempts:p.attempts,restarts:p.restarts,maxRow:p.maxRow,memory:performance.memory?{used:performance.memory.usedJSHeapSize,total:performance.memory.totalJSHeapSize}:null,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};});
  const endHeap=await heap(),{profile}=await cdp.send('Profiler.stop');
  await writeFile(`${out}/${label}.cpuprofile`,JSON.stringify(profile));
  const hotFunctions=profile.nodes.filter(n=>n.hitCount).sort((a,b)=>b.hitCount-a.hitCount).slice(0,18).map(n=>({name:n.callFrame.functionName,url:n.callFrame.url,hits:n.hitCount}));
  const report={label,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceHash:await crossySourceHash(),viewport:{width:390,height:844,dsf:3,touch:true},cpuThrottle:4,worldVersion:3,controlPolicy:'safe forward tap; lateral on blocked grass; 140 ms cadence',gpu:data.gpu,startupMs,durationMs:data.durationMs,frameTimeMs:quantiles(data.frames),longTasks:{count:data.longTasks.length,totalMs:data.longTasks.reduce((s,e)=>s+e.duration,0),maxMs:Math.max(0,...data.longTasks.map(e=>e.duration))},inputToHopMs:quantiles(data.inputs),inputToPressFrameMs:quantiles(data.feedback),heap:{start:beforeHeap,end:endHeap,performanceMemoryStart:memoryBefore,performanceMemoryEnd:data.memory},workload:{attempts:data.attempts,restarts:data.restarts,maxRow:data.maxRow},renderer:{maxCalls:Math.max(...data.renderer.map(s=>s.calls)),maxTriangles:Math.max(...data.renderer.map(s=>s.triangles)),maxGeometries:Math.max(...data.renderer.map(s=>s.geometries)),maxTextures:Math.max(...data.renderer.map(s=>s.textures)),samples:data.renderer},hotFunctions};
  if(stressHops){
    await page.evaluate(()=>{window.__crossyRoadTest.freeze(true);window.__crossyRoadTest.setSeed(7);});
    await cdp.send('HeapProfiler.collectGarbage');const start=await heap(),initial=await page.evaluate(()=>window.__crossyRoadTest.stats());
    for(let done=0;done<stressHops;done+=10)await page.evaluate(count=>{
      const h=window.__crossyRoadTest;
      if(h.state().phase!=='running'&&h.state().phase!=='ready')h.setSeed(7);
      for(let i=0;i<count;i++){
        const s=h.state(),row=s.row+1;
        h.forceLanes([{kind:'grass',row,shade:row%2,blocked:Array(9).fill(false),obstacles:Array(9).fill(null),variant:Array(9).fill(0),edge:Array(12).fill(null)}]);
        h.hop('up');h.advance(.12);
      }
    },Math.min(10,stressHops-done));
    await cdp.send('HeapProfiler.collectGarbage');const end=await heap(),final=await page.evaluate(()=>window.__crossyRoadTest.stats());
    report.retention={worldVersion:4,hops:stressHops,start,end,growthMB:(end.JSHeapUsedSize-start.JSHeapUsedSize)/1048576,initial,final};
  }
  await writeFile(`${out}/${label}.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({file:`${out}/${label}.json`,frameTimeMs:report.frameTimeMs,longTasks:report.longTasks,inputToHopMs:report.inputToHopMs,heapGrowthMB:(endHeap.JSHeapUsedSize-beforeHeap.JSHeapUsedSize)/1048576,renderer:{calls:report.renderer.maxCalls,triangles:report.renderer.maxTriangles,geometries:report.renderer.maxGeometries,textures:report.renderer.maxTextures},workload:report.workload,retention:report.retention&&{hops:stressHops,growthMB:report.retention.growthMB}},null,2));
  if(check){
    assert.ok(report.renderer.maxCalls<=48,'draw calls exceed 48');
    assert.ok(report.frameTimeMs.samples>=20,'too few frame samples');
    assert.ok(report.frameTimeMs.p95<=Number(process.env.PERF_MAX_P95_MS||150),'p95 exceeds the CI stress budget');
    assert.ok(report.retention&&report.retention.hops>=300,'retention check needs 300 hops');
    assert.ok(report.retention.growthMB<=8,'retained heap grew more than 8 MB');
    assert.ok(report.retention.final.geometries<=report.retention.initial.geometries+4,'geometry count grows with rows');
  }
}finally{await browser.close();}
