import {chromium} from 'playwright';
import {writeFile,mkdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
// Run against npm run dev -- --port 4173; no production test hooks are installed.
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),headless:true,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1280,height:720}});await page.goto(process.env.ARCADE_URL || 'http://127.0.0.1:4173');
const result=await page.evaluate(async()=>{
 const m=await import('/src/games/neon-coil/model.ts');const {createRenderer}=await import('/src/games/neon-coil/render.ts');
 const canvas=document.createElement('canvas');document.body.replaceChildren(canvas);const renderer=createRenderer(canvas);renderer.resize(1280,720);
 const results=[];
 for(const [mass,turn] of [[600,.018],[10000,.018],[100000,.018],[5000000,.004],[1000000000,.004]]){
  const s=m.createArena();s.phase='running';const p=s.snakes[0];p.mass=mass;
  s.snakes.slice(1).forEach(b=>{b.alive=false;b.body=[];b.pathLength=0;b.diedAt=0});
  let maxPoints=0;const simulation=[];
  for(let i=0;i<18000;i++){
   s.snakes.slice(1).forEach(b=>b.diedAt=s.ticks);s.food=[];
   const t=performance.now();m.stepArena(s,{angle:(i+1)*turn});
   if(i>=17500)simulation.push(performance.now()-t);maxPoints=Math.max(maxPoints,p.body.length);
  }
  const render=[];for(let i=0;i<180;i++){const t=performance.now();renderer.draw(s);render.push(performance.now()-t);}
  const p95=a=>a.sort((a,b)=>a-b)[Math.floor(a.length*.95)];
  results.push({mass:p.mass,turnPerTick:turn,actualLength:p.pathLength,targetLength:m.bodyLength(mass),maxPoints,finalPoints:p.body.length,simulationP95Ms:p95(simulation),renderP95Ms:p95(render),restores:m.restoreArena(s)!==null});
 }
 return {browser:navigator.userAgent,viewport:[innerWidth,innerHeight],isolatedPlayer:true,ticksPerCase:18000,results};
});
await mkdir('docs/evidence/charlie-levels',{recursive:true});await writeFile('docs/evidence/charlie-levels/growth-performance.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));await browser.close();
