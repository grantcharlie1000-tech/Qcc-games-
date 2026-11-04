import type {TestType,CDPSession,Page,BrowserContext} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
export function registerTiming(test:TestType<any,any>){
 test.use({serviceWorkers:'block'});
 let cdp:CDPSession,blocked:string[]=[];
 test.beforeEach(async({page,context}:{page:Page;context:BrowserContext})=>{
  blocked=[];
  await context.route('**/*',async route=>{
   const r=route.request(),u=new URL(r.url());
   if(u.origin==='http://127.0.0.1:4600'&&['GET','HEAD'].includes(r.method())&&!/^\/(?:\.netlify|api)(?:\/|$)/.test(u.pathname))return route.continue();
   blocked.push(`${r.method()} ${u.origin}${u.pathname}`);await route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*',socket=>socket.close());
  cdp=await context.newCDPSession(page);
  await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  await cdp.send('Tracing.start',{categories:'devtools.timeline,v8,blink.user_timing,disabled-by-default-devtools.timeline',transferMode:'ReturnAsStream'});
 });
 test.afterEach(async({page}:{page:Page},info)=>{
  // afterEach still runs after the original 7s assertion or 30s test fails.
  // Each collector is independent, so one failed export does not hide the rest.
  const errors:string[]=[];
  const attach=async(name:string,value:unknown)=>{const path=info.outputPath(name);await writeFile(path,JSON.stringify(value));await info.attach(name,{path,contentType:'application/json'});};
  try{await attach('timing.json',await page.evaluate(()=>({events:(globalThis as any).__qccBallTiming,glass:(globalThis as any).__qccGlassStats,now:performance.now(),url:location.href})));}catch(e){errors.push(String(e));}
  try{await attach('cpu.cpuprofile',(await cdp.send('Profiler.stop')).profile);}catch(e){errors.push(String(e));}
  try{
   const done=new Promise<any>(resolve=>cdp.once('Tracing.tracingComplete',resolve));
   await cdp.send('Tracing.end');
   const {stream}=await done;let trace='';
   for(;;){const part=await cdp.send('IO.read',{handle:stream});trace+=part.base64Encoded?Buffer.from(part.data,'base64').toString():part.data;if(part.eof)break;}
   await cdp.send('IO.close',{handle:stream});
   const path=info.outputPath('chromium-trace.json');await writeFile(path,trace);await info.attach('chromium-trace',{path,contentType:'application/json'});
  }catch(e){errors.push(String(e));}
  await attach('isolation.json',{blocked,errors,variant:process.env.BALLRUN_VARIANT,pinnedMain:'d453cbb17a414f6786728763191dc88b132d9c5c'});
  if(errors.length)throw new Error(`Diagnostic collection failed: ${errors.join('; ')}`);
 });
}
