import {test,expect} from '@playwright/test';
import assert from 'node:assert/strict';
import {reloadGameDocument,GAME_DOCUMENT_READINESS_TIMEOUT} from '../../scripts/update-document-readiness.mjs';

// Disposable response fixtures exercise browser document lifetime, not a mock
// activation/game callback. Each button performs one native same-URL reload.
const html=(generation:string)=>`<!doctype html><html><head><meta name="arcade-release" content="B"><title>${generation}</title></head><body><span class="fm-count">3 fruits</span><button onclick="location.reload()">Reload to update</button></body></html>`;
for(const scope of ['/','/Qcc-games-/']){
 test(`old B count cannot finish readiness while the real reload is held at ${scope}`,async({page},testInfo)=>{
  test.setTimeout(60000);
  const path=scope+'reload-readiness-fixture';let requests=0,release!:()=>void,held!:()=>void,strictVersionReached=false;
  const gate=new Promise<void>(resolve=>release=resolve),requestHeld=new Promise<void>(resolve=>held=resolve);
  await page.route('**'+path,async route=>{
   if(++requests===1){await route.fulfill({contentType:'text/html',body:html('old B')});return;}
   held();await gate;await route.fulfill({contentType:'text/html',body:html('new B')}).catch(()=>{});
  });
  await page.goto(path);const started=Date.now();
  const readiness=reloadGameDocument(page).then(async()=>{strictVersionReached=true;assert.equal(await page.locator('meta[name="arcade-release"]').getAttribute('content'),'C');});
  const rejected=expect(readiness).rejects.toThrow(/timed out|Timeout/i);
  try{
   await requestHeld;
   await expect(page.locator('.fm-count')).toHaveText('3 fruits');
   await expect(page.locator('meta[name="arcade-release"]')).toHaveAttribute('content','B');
   expect(strictVersionReached).toBe(false);await rejected;
   expect(strictVersionReached).toBe(false);expect(requests).toBe(2);
   await testInfo.attach('held-document-boundary',{body:JSON.stringify({scope,budgetMs:GAME_DOCUMENT_READINESS_TIMEOUT,elapsedMs:Date.now()-started,strictVersionReached}),contentType:'application/json'});
  }finally{release();await page.unrouteAll({behavior:'wait'});}
 });

 test(`a NEW wrong B document still fails the immediate strict C assertion at ${scope}`,async({page},testInfo)=>{
  const path=scope+'reload-readiness-fixture';let requests=0;
  await page.route('**'+path,route=>route.fulfill({contentType:'text/html',body:html(++requests===1?'old B':'new B')}));
  await page.goto(path);const identity=await reloadGameDocument(page);
  expect(identity.afterTimeOrigin).not.toBe(identity.beforeTimeOrigin);await expect(page).toHaveTitle('new B');
  await expect(async()=>{assert.equal(await page.locator('meta[name="arcade-release"]').getAttribute('content'),'C');}).rejects.toMatchObject({code:'ERR_ASSERTION',actual:'B',expected:'C'});
  expect(requests).toBe(2);
  await testInfo.attach('wrong-version-new-document',{body:JSON.stringify({scope,...identity,actual:'B',expected:'C'}),contentType:'application/json'});
 });
}
