// Femboy Frosthop frame-time measurement through the real shell (Liquid Glass dock on).
//   node scripts/perf/femboy-obby.mjs [url] [seconds] [checkpoint] [low]
// Starts the run at a checkpoint, warms up 5 s, then walks/turns with real key events while sampling every
// requestAnimationFrame interval and the renderer's draw calls and triangles. Prints JSON.
// RAF intervals are main-thread frame pacing, not GPU execution time.
import {chromium} from 'playwright';
const [url='http://127.0.0.1:4631',secs='60',cp='12',low='']=process.argv.slice(2);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
await ctx.addInitScript(()=>{localStorage.setItem('pocket-arcade:v1:accounts:guest','true');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');});
const page=await ctx.newPage();
await page.goto(`${url}/#/game/femboy-obby`);
await page.waitForFunction(()=>window.__frosthopTest?.state().steps>5,null,{timeout:30000});
await page.evaluate(c=>window.__frosthopTest.teleport(c),+cp);
if(low){await page.click('.fo-open');await page.locator('.fo-low').check();await page.click('.fo-close');}
await page.locator('.fo-canvas').focus();
await page.waitForTimeout(5000);
await page.evaluate(()=>{window.__perf={iv:[],calls:[],tris:[]};let last=0;const f=t=>{if(last)window.__perf.iv.push(t-last);last=t;const s=window.__frosthopTest?.stats();if(s){window.__perf.calls.push(s.calls);window.__perf.tris.push(s.triangles);}window.__perf.id=requestAnimationFrame(f);};window.__perf.id=requestAnimationFrame(f);});
const end=Date.now()+(+secs)*1000;
while(Date.now()<end){await page.keyboard.down('KeyE');await page.waitForTimeout(700);await page.keyboard.up('KeyE');await page.keyboard.down('KeyW');await page.waitForTimeout(250);await page.keyboard.up('KeyW');await page.waitForTimeout(400);}
const r=await page.evaluate(()=>{cancelAnimationFrame(window.__perf.id);const q=(a,p)=>{const s=[...a].sort((x,y)=>x-y);return s[Math.min(s.length-1,Math.floor(p*s.length))];};const p=window.__perf;return {frames:p.iv.length,p50ms:+q(p.iv,.5).toFixed(2),p95ms:+q(p.iv,.95).toFixed(2),callsMax:Math.max(...p.calls),callsP50:q(p.calls,.5),trianglesMax:Math.max(...p.tris),trianglesP50:q(p.tris,.5),stats:window.__frosthopTest.stats(),deaths:window.__frosthopTest.state().deaths};});
console.log(JSON.stringify({url,seconds:+secs,checkpoint:+cp,low:!!low,browser:browser.version(),renderer:'Chromium headless, SwiftShader (CPU) WebGL',...r}));
await browser.close();
