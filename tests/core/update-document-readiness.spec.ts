import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {performance as clock} from 'node:perf_hooks';
import {reloadGameDocument,GAME_DOCUMENT_READINESS_TIMEOUT} from '../../scripts/update-document-readiness.mjs';

// The fixture-owned fetch separates trusted click completion from navigation,
// like an asynchronous activation handler, without touching product callbacks.
const html=(generation:string)=>`<!doctype html><html><head><meta name="arcade-release" content="B"><title>${generation}</title></head><body><span class="fm-count">3 fruits</span><button onclick="fetch('./reload-readiness-trigger').then(()=>location.reload())">Reload to update</button></body></html>`;
for(const scope of ['/','/Qcc-games-/']){
 test(`old B count cannot finish readiness while the real reload is held at ${scope}`,async({page},testInfo)=>{
  test.setTimeout(60000);
  const path=scope+'reload-readiness-fixture';let requests=0,release!:()=>void,releaseTrigger!:()=>void,held!:()=>void,clicked!:()=>void,strictVersionReached=false;
  const gate=new Promise<void>(resolve=>release=resolve),triggerGate=new Promise<void>(resolve=>releaseTrigger=resolve);
  const requestHeld=new Promise<void>(resolve=>held=resolve),clickComplete=new Promise<void>(resolve=>clicked=resolve);
  await page.route('**'+scope+'reload-readiness-trigger',async route=>{await triggerGate;await route.fulfill({body:'continue'}).catch(()=>{});});
  await page.route('**'+path,async route=>{
   if(++requests===1){await route.fulfill({contentType:'text/html',body:html('old B')});return;}
   held();await gate;await route.fulfill({contentType:'text/html',body:html('new B')}).catch(()=>{});
  });
  await page.goto(path);const started=clock.now();let settled=false;
  const readiness=reloadGameDocument(page,{onClickComplete:clicked}).then(async()=>{strictVersionReached=true;assert.equal(await page.locator('meta[name="arcade-release"]').getAttribute('content'),'C');});
  void readiness.then(()=>{settled=true;},()=>{settled=true;});
  const rejected=expect(readiness).rejects.toMatchObject({code:'UPDATE_DOCUMENT_READINESS_TIMEOUT',phase:'navigation'});
  try{
   await Promise.race([clickComplete,readiness]);const clickCompletedMs=clock.now()-started;
   // This is the old post-click predicate: it succeeds before any reload can
   // commit, proving the fixture would let the original stale read through.
   await page.locator('.fm-count').filter({hasText:'3 fruits'}).waitFor();
   await expect(page.locator('meta[name="arcade-release"]')).toHaveAttribute('content','B');
   expect(requests).toBe(1);expect(settled).toBe(false);expect(strictVersionReached).toBe(false);
   releaseTrigger();await Promise.race([requestHeld,readiness]);
   expect(requests).toBe(2);expect(settled).toBe(false);expect(strictVersionReached).toBe(false);
   await rejected;const elapsedMs=clock.now()-started;
   expect(elapsedMs).toBeGreaterThanOrEqual(GAME_DOCUMENT_READINESS_TIMEOUT-250);
   expect(elapsedMs).toBeLessThan(GAME_DOCUMENT_READINESS_TIMEOUT+5000);
   expect(strictVersionReached).toBe(false);
   await testInfo.attach('held-document-boundary',{body:JSON.stringify({scope,budgetMs:GAME_DOCUMENT_READINESS_TIMEOUT,clickCompletedMs,elapsedMs,oldPostClickPredicatePassed:true,strictVersionReached}),contentType:'application/json'});
  }finally{releaseTrigger();release();await page.unrouteAll({behavior:'wait'});}
 });

 test(`a NEW wrong B document still fails the immediate strict C assertion at ${scope}`,async({page},testInfo)=>{
  const path=scope+'reload-readiness-fixture';let requests=0;
  await page.route('**'+scope+'reload-readiness-trigger',route=>route.fulfill({body:'continue'}));
  await page.route('**'+path,route=>route.fulfill({contentType:'text/html',body:html(++requests===1?'old B':'new B')}));
  await page.goto(path);const identity=await reloadGameDocument(page);
  expect(identity.afterTimeOrigin).not.toBe(identity.beforeTimeOrigin);await expect(page).toHaveTitle('new B');
  await expect(async()=>{assert.equal(await page.locator('meta[name="arcade-release"]').getAttribute('content'),'C');}).rejects.toMatchObject({code:'ERR_ASSERTION',actual:'B',expected:'C'});
  expect(requests).toBe(2);
  await testInfo.attach('wrong-version-new-document',{body:JSON.stringify({scope,...identity,actual:'B',expected:'C'}),contentType:'application/json'});
 });
}
