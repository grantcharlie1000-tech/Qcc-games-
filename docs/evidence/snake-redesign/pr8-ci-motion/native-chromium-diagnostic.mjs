import {chromium} from '/workspace/qcc-snake/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const page=await browser.newPage();page.setDefaultTimeout(10000);await page.addInitScript(()=>sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading'));
await page.clock.install({time:new Date('2026-10-20T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
await page.addInitScript(()=>{
 window.motionObservations=[];const original=window.matchMedia.bind(window);
 window.matchMedia=media=>{const q=original(media);if(media==='(prefers-reduced-motion: reduce)'){window.observedQuery=q;q.addEventListener('change',event=>window.motionObservations.push({at:performance.now(),matches:event.matches,stage:'native-event'}));}return q;};
});
await page.goto('http://127.0.0.1:4181/#/game/snake');await page.getByRole('button',{name:'Start slithering',exact:true}).click();await page.clock.runFor(260);
const rows=[];const snapshot=()=>page.evaluate(()=>({at:performance.now(),query:observedQuery.matches,attribute:document.querySelector('.snake-game').dataset.reducedMotion,events:motionObservations.slice(-2)}));
for(let i=0;i<40;i++){
 const expected=i%2===0;await page.emulateMedia({reducedMotion:expected?'reduce':'no-preference'});const afterEmulate=await snapshot();await page.clock.runFor(16);const afterFrame=await snapshot();await new Promise(resolve=>setTimeout(resolve,25));const afterNative=await snapshot();rows.push({expected,afterEmulate,afterFrame,afterNative});
}
await writeFile('/tmp/qcc-snake-motion-diagnostic.json',JSON.stringify({engine:'chromium',rows},null,2));console.log(JSON.stringify({rows:rows.length,misses:rows.filter(r=>r.afterFrame.attribute!==String(r.expected)),nativeEvents:await page.evaluate(()=>motionObservations.length)},null,2));await browser.close();
