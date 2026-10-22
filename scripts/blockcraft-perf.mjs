// Blockcraft performance probe: the measurements in docs/BLOCKCRAFT.md come from it.
//
// Start the dev server (window.blockcraft is the engine only in development), then run one mode at a time:
//   npx vite --host 127.0.0.1 --port 4322 --strictPort &
//   ARCADE_URL=http://127.0.0.1:4322 CHROMIUM_PATH=/path/to/chrome node scripts/blockcraft-perf.mjs <mode> [width] [height] [seconds]
// Modes:
//   perf  load time, chunk light and mesh times, then frame times, main-thread busy share, a heap allocation sample and a
//         CPU profile, standing and then sprinting (default 1366x768)
//   leak  creative flight north for `seconds` (default 180): heap after GC, chunks, GPU geometries and textures,
//         entities, listeners and the autosave size every 30 s, then the autosave cost at 10k, 50k and 150k edits
//   save  the autosave cost at 10k, 50k and 150k edits: three saves each, the third after one more edit
// Chromium runs with software WebGL (SwiftShader), so frame times measure the emulated GPU, not a real device. Results
// (JSON, allocation samples, CPU profiles) go to BLOCKCRAFT_PERF_DIR (default test-results/blockcraft-perf).
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';

const [MODE='perf',W='1366',H='768',SECS='180']=process.argv.slice(2);
if(!['perf','leak','save'].includes(MODE)){console.error('usage: node scripts/blockcraft-perf.mjs perf|leak|save [width] [height] [seconds]');process.exit(2);}
const URL=process.env.ARCADE_URL||'http://127.0.0.1:4322';
const OUT=process.env.BLOCKCRAFT_PERF_DIR||'test-results/blockcraft-perf';
await mkdir(OUT,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),
  args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-precise-memory-info','--js-flags=--expose-gc']});
const context=await browser.newContext({viewport:{width:+W,height:+H}});
// The arcade asks for a Study topic on the first visit.
await context.addInitScript(()=>sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading'));
const page=await context.newPage();
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push('console: '+m.text());});
const cdp=await context.newCDPSession(page);
await cdp.send('Performance.enable');
const log=(...a)=>console.log(new Date().toISOString().slice(11,19),...a);

const t0=Date.now();
await page.goto(URL+'/#/game/blockcraft');
await page.waitForFunction(()=>document.querySelector('.blockcraft')?.getAttribute('data-ready')==='true',null,{timeout:120000});
const readyMs=Date.now()-t0;

/** Autosave cost as the edit list grows (snow and ice alone may use 75 % of the 200 000-edit budget). */
async function saveScaling(runs){
  const out=[];
  for(const target of [10000,50000,150000]){
    const r=await page.evaluate(([target,runs])=>{
      const g=window.blockcraft,w=g.world;
      outer:for(const c of w.chunks.values())for(let y=70;y<128;y++)for(let i=0;i<256;i++){
        if(w.editCount>=target)break outer;const x=c.cx*16+(i&15),z=c.cz*16+(i>>4);if(w.get(x,y,z)===0)w.set(x,y,z,1,'tick');
      }
      const saves=[];
      for(let k=0;k<runs;k++){
        // The last save follows one more edit: only that chunk's segment is encoded again.
        if(k===2){const p=g.player.state;w.set(Math.floor(p.x),120,Math.floor(p.z),1,'tick');}
        const a=performance.now(),v=g.serialize(),b=performance.now(),s=JSON.stringify({version:1,data:v,updated:Date.now()}),c=performance.now();
        let setItemMs=-1,err='';
        try{localStorage.setItem('blockcraft-perf-save',s);setItemMs=+(performance.now()-c).toFixed(1);localStorage.removeItem('blockcraft-perf-save');}catch(e){err=String(e);}
        saves.push({serializeMs:+(b-a).toFixed(1),stringifyMs:+(c-b).toFixed(1),setItemMs,MB:+(s.length/1e6).toFixed(2),err,
          parts:k?undefined:{edits:JSON.stringify(v.edits).length,populated:JSON.stringify(v.populated).length,
            ...Object.fromEntries(Object.entries(v.systems).map(([n,x])=>[n,JSON.stringify(x).length]))}});
      }
      return{edits:w.editCount,chunksWithEdits:w.serializeEdits().length,saves};
    },[target,runs]);
    log('save',JSON.stringify(r));out.push(r);
  }
  return out;
}

const result={mode:MODE,W:+W,H:+H,readyMs,errors};
if(MODE==='save'){
  result.saveScaling=await saveScaling(3);
}else{
  // Light and mesh timing of every chunk build (wrapped here only; the engine is unchanged).
  await page.evaluate(()=>{
    const s=window.blockcraft.streamer;window.__t={light:[],mesh:[],builds:0};
    const L=s.light,M=s.mesher,cp=L.computePadded.bind(L),mc=M.meshChunk.bind(M);
    L.computePadded=(n,o)=>{const a=performance.now();cp(n,o);window.__t.light.push(performance.now()-a);};
    M.meshChunk=(n,l)=>{const a=performance.now();const r=mc(n,l);window.__t.mesh.push(performance.now()-a);window.__t.builds++;return r;};
  });
  await page.waitForFunction(()=>!window.blockcraft.streamer.busy,null,{timeout:180000}).catch(()=>log('streamer still busy'));
  result.settledMs=Date.now()-t0;
  const gc=async()=>{await cdp.send('HeapProfiler.enable');await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');};
  const metrics=async()=>Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(m=>[m.name,m.value]));
  const state=()=>page.evaluate(()=>{
    const g=window.blockcraft,r=g.render.renderer.info,d=g.root.dataset;let nodes=0;g.render.scene.traverse(()=>nodes++);
    return{x:+d.x,z:+d.z,chunks:g.world.chunks.size,meshed:g.streamer.meshedCount,geometries:r.memory.geometries,textures:r.memory.textures,
      drawCalls:+d.drawCalls,triangles:+d.triangles,scale:+d.scale,entities:g.entities.all().length,sceneNodes:nodes,
      edits:g.world.editCount,heap:performance.memory.usedJSHeapSize,workers:+d.workers,phase:d.phase};
  });
  const frames=seconds=>page.evaluate(seconds=>new Promise(done=>{
    const v=[];let prev;const end=performance.now()+seconds*1000;
    const f=t=>{if(prev!==undefined)v.push(t-prev);prev=t;if(t<end)requestAnimationFrame(f);else done(v);};requestAnimationFrame(f);
  }),seconds);
  const stats=v=>{const s=[...v].sort((a,b)=>a-b),q=p=>s[Math.min(s.length-1,Math.floor(p*s.length))];
    return{n:s.length,p50:+q(.5).toFixed(1),p95:+q(.95).toFixed(1),max:+s[s.length-1]?.toFixed(1),mean:+(s.reduce((a,b)=>a+b,0)/s.length).toFixed(1)};};
  const frameName=cf=>`${cf.functionName||'(anon)'} ${cf.url.split('/').slice(-2).join('/')}:${cf.lineNumber+1}`;
  /** One measuring window: frame times, busy shares, chunk builds and optionally an allocation sample or a CPU profile. */
  async function measure(label,seconds,{alloc=false,cpu=false}={}){
    const before=await metrics(),wall0=Date.now();
    await page.evaluate(()=>{window.__t.light.length=0;window.__t.mesh.length=0;window.__t.builds=0;});
    if(alloc){await cdp.send('HeapProfiler.enable');await cdp.send('HeapProfiler.startSampling',{samplingInterval:4096,includeObjectsCollectedByMajorGC:true,includeObjectsCollectedByMinorGC:true});}
    if(cpu){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:250});await cdp.send('Profiler.start');}
    const v=await frames(seconds);
    const allocProfile=alloc?(await cdp.send('HeapProfiler.stopSampling')).profile:null;
    const cpuProfile=cpu?(await cdp.send('Profiler.stop')).profile:null;
    const after=await metrics(),wall=(Date.now()-wall0)/1000;
    const chunks=await page.evaluate(()=>({light:[...window.__t.light],mesh:[...window.__t.mesh],builds:window.__t.builds}));
    const r={label,frames:stats(v),busyPct:+(100*(after.TaskDuration-before.TaskDuration)/wall).toFixed(1),
      scriptPct:+(100*(after.ScriptDuration-before.ScriptDuration)/wall).toFixed(1),
      layoutPct:+(100*((after.LayoutDuration-before.LayoutDuration)+(after.RecalcStyleDuration-before.RecalcStyleDuration))/wall).toFixed(1),
      heapMB:+(after.JSHeapUsedSize/1e6).toFixed(1),builds:chunks.builds,light:chunks.light.length?stats(chunks.light):null,
      mesh:chunks.mesh.length?stats(chunks.mesh):null,state:await state()};
    if(allocProfile){
      const by=new Map();let total=0;
      const walk=n=>{if(n.selfSize){total+=n.selfSize;const k=frameName(n.callFrame);by.set(k,(by.get(k)||0)+n.selfSize);}for(const c of n.children)walk(c);};
      walk(allocProfile.head);
      r.allocTotalMB=+(total/1e6).toFixed(2);r.allocPerFrameKB=+(total/1024/v.length).toFixed(1);
      r.allocTop=[...by].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([k,s])=>`${(s/1024/v.length).toFixed(2)} KB/frame  ${k}`);
      await writeFile(`${OUT}/alloc-${label}-${W}.json`,JSON.stringify(allocProfile));
    }
    if(cpuProfile){
      const byId=new Map(cpuProfile.nodes.map(n=>[n.id,n])),dt=new Map(),self=new Map();let total=0;
      for(let i=0;i<cpuProfile.samples.length;i++){const id=cpuProfile.samples[i];dt.set(id,(dt.get(id)||0)+(cpuProfile.timeDeltas[i]||0));}
      for(const [id,us] of dt){const k=frameName(byId.get(id).callFrame);self.set(k,(self.get(k)||0)+us);total+=us;}
      r.cpuTop=[...self].sort((a,b)=>b[1]-a[1]).slice(0,30).map(([k,us])=>`${(100*us/total).toFixed(1)}% ${(us/1000).toFixed(0)}ms  ${k}`);
      await writeFile(`${OUT}/cpu-${label}-${W}.cpuprofile`,JSON.stringify(cpuProfile));
    }
    log(JSON.stringify(r,null,1));return r;
  }

  await gc();result.afterLoad=await state();result.afterLoadHeapMB=+(result.afterLoad.heap/1e6).toFixed(1);
  log('loaded',readyMs,result.settledMs,JSON.stringify(result.afterLoad));
  // Main-thread generation cost of 12 far chunks (what the workers take off the main thread).
  result.generateMs=await page.evaluate(()=>{
    const t=window.blockcraft.terrain,v=[];
    for(let i=0;i<12;i++){const a=performance.now();t.generate(500+i,700);v.push(performance.now()-a);}
    v.sort((a,b)=>a-b);return{p50:v[6],max:v[11]};
  });
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.blockcraft')?.dataset.phase==='playing');
  await page.waitForTimeout(2000);
  if(MODE==='perf'){
    result.standing=await measure('standing',10);
    result.standingAlloc=await measure('standing-alloc',8,{alloc:true});
    result.standingCpu=await measure('standing-cpu',8,{cpu:true});
    // Sprint on foot (Control + W), jumping to clear steps.
    await page.keyboard.down('ControlLeft');await page.keyboard.down('KeyW');
    const jump=setInterval(()=>page.keyboard.press('Space').catch(()=>{}),900);
    result.sprint=await measure('sprint',10);
    result.sprintAlloc=await measure('sprint-alloc',8,{alloc:true});
    result.sprintCpu=await measure('sprint-cpu',8,{cpu:true});
    clearInterval(jump);await page.keyboard.up('KeyW');await page.keyboard.up('ControlLeft');
  }else{
    // Creative flight north, sampling every 30 s.
    await page.evaluate(()=>{const g=window.blockcraft;g.setMode('creative');const s=g.player.state;g.player.teleport(s.x,112,s.z);
      s.flying=true;s.yaw=0;s.pitch=0;});
    await page.keyboard.down('ControlLeft');await page.keyboard.down('KeyW');
    result.samples=[];const start=Date.now();
    while(Date.now()-start<+SECS*1000){
      await page.waitForTimeout(30000);
      await gc();const s=await state();s.t=Math.round((Date.now()-start)/1000);s.heapMB=+(s.heap/1e6).toFixed(1);
      s.mainHeapMB=+((await metrics()).JSHeapUsedSize/1e6).toFixed(1);
      s.stored=await page.evaluate(()=>window.blockcraft.entities.debug?.stored??null);
      s.serialize=await page.evaluate(()=>{const a=performance.now(),v=window.blockcraft.serialize(),b=performance.now(),j=JSON.stringify(v),c=performance.now();
        return{ms:+(b-a).toFixed(2),stringifyMs:+(c-b).toFixed(2),bytes:j.length,
          parts:Object.fromEntries(Object.entries(v.systems).map(([k,x])=>[k,JSON.stringify(x).length]))};});
      result.samples.push(s);log(JSON.stringify(s));
    }
    result.flying=await measure('flying',10);
    await page.keyboard.up('KeyW');await page.keyboard.up('ControlLeft');
    result.saveScaling=await saveScaling(1);
  }
}
await writeFile(`${OUT}/perf-${MODE}-${W}x${H}.json`,JSON.stringify(result,null,1));
log('errors',errors);
await browser.close();
