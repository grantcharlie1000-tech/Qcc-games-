import assert from 'node:assert/strict';
import {performance as clock} from 'node:perf_hooks';

export const GAME_DOCUMENT_READINESS_TIMEOUT=30_000;

// A retained game can already show the restored count. Observe a real fresh
// document before checking it; never wait for a desired release marker.
export async function reloadGameDocument(page){
 const deadline=clock.now()+GAME_DOCUMENT_READINESS_TIMEOUT;
 const timeoutError=new Error('Fresh game document readiness timed out after30000ms');let expired=false,timer;
 const remaining=()=>{const milliseconds=deadline-clock.now();if(expired||milliseconds<=0){expired=true;throw timeoutError;}return milliseconds;};
 const bound=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(timeoutError);},GAME_DOCUMENT_READINESS_TIMEOUT);});
 const task=(async()=>{
  const before=await page.evaluate(()=>performance.timeOrigin);remaining();
  assert.ok(Number.isFinite(before),'old document has a native time origin');
  // Arm before the original trusted click. Same-URL reloads need a document
  // response; a hash change or the old page's label cannot satisfy this gate.
  const [response]=await Promise.all([
   page.waitForNavigation({waitUntil:'domcontentloaded',timeout:remaining()}),
   page.getByRole('button',{name:'Reload to update',exact:true}).click({timeout:remaining()})
  ]);remaining();
  assert.ok(response,'reload must commit a fresh main-document response');
  assert.equal(response.request().isNavigationRequest(),true,'reload response is a document navigation');
  assert.equal(response.frame(),page.mainFrame(),'reload response belongs to the main frame');
  const after=await page.evaluate(()=>performance.timeOrigin);remaining();
  assert.ok(Number.isFinite(after),'new document has a native time origin');
  assert.notEqual(after,before,'reload must replace the old document');
  await page.locator('.fm-count').filter({hasText:'3 fruits'}).waitFor({timeout:remaining()});remaining();
  return {beforeTimeOrigin:before,afterTimeOrigin:after};
 })();
 try{return await Promise.race([task,bound]);}finally{clearTimeout(timer);}
}
