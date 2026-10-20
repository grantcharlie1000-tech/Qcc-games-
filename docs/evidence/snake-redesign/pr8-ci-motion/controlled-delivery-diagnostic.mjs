import {chromium} from '/workspace/qcc-snake/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const rows=[];
for(const scenario of ['single-slice','condition-driven']){
 const page=await browser.newPage();page.setDefaultTimeout(10000);await page.addInitScript(()=>{
  sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');const original=matchMedia.bind(window),query=new EventTarget();let matches=false;
  Object.defineProperties(query,{matches:{get:()=>matches},media:{value:'(prefers-reduced-motion: reduce)'}});
  window.matchMedia=media=>media===query.media?query:original(media);
  window.deliverMotionPreference=()=>{matches=true;query.dispatchEvent(new Event('change'));};
 });
 await page.clock.install({time:new Date('2026-10-20T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
 await page.goto('http://127.0.0.1:4181/#/game/snake');await page.getByRole('button',{name:'Start slithering',exact:true}).click();await page.clock.runFor(260);
 const snap=()=>page.evaluate(()=>({query:matchMedia('(prefers-reduced-motion: reduce)').matches,rendered:document.querySelector('.snake-game').dataset.reducedMotion,time:performance.now()}));
 await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(16);const afterSoleSlice=await snap();
 // Controlled browser boundary: publish the native preference after the old test's sole fake RAF.
 await page.evaluate(()=>deliverMotionPreference());await new Promise(resolve=>setTimeout(resolve,50));const afterDelivery=await snap();
 let afterCondition=null;if(scenario==='condition-driven'){for(let attempt=0;attempt<10;attempt++){await page.clock.runFor(16);afterCondition=await snap();if(afterCondition.query&&afterCondition.rendered==='true')break;}}
 rows.push({scenario,afterSoleSlice,afterDelivery,afterCondition});await page.close();
}
await browser.close();await writeFile('/tmp/qcc-snake-motion-delivery-diagnostic.json',JSON.stringify({kind:'controlled delayed media publication; not a WebKit execution',rows},null,2));console.log(JSON.stringify(rows,null,2));
if(rows[0].afterDelivery.rendered!=='false'||!rows[0].afterDelivery.query||rows[1].afterCondition?.rendered!=='true')throw new Error('diagnostic expectation failed');
