import {chromium} from '/workspace/qcc-snake/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});const rows=[];
for(const omitLostHandler of [false,true]){
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);
 await page.addInitScript(omit=>{
  sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');window.omittedLostHandlers=0;const original=EventTarget.prototype.addEventListener;
  if(omit)EventTarget.prototype.addEventListener=function(type,listener,options){if(type==='lostpointercapture'&&this instanceof HTMLCanvasElement&&this.classList.contains('snake-canvas')){omittedLostHandlers++;return;}return Reflect.apply(original,this,[type,listener,options]);};
  window.restoreListenerRegistration=()=>EventTarget.prototype.addEventListener=original;
 },omitLostHandler);
 await page.clock.install({time:new Date('2026-10-20T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));
 await page.goto('http://127.0.0.1:4181/#/game/snake');await page.evaluate(()=>restoreListenerRegistration());await page.getByRole('button',{name:'Start slithering',exact:true}).click();await page.clock.runFor(260);
 const canvas=page.locator('canvas');await canvas.evaluate(canvas=>{window.captureEvents=[];for(const type of ['pointerdown','gotpointercapture','lostpointercapture','pointermove','pointerup'])canvas.addEventListener(type,e=>{if(type==='pointerdown')window.downId=e.pointerId;captureEvents.push({type,id:e.pointerId,trusted:e.isTrusted,hasCapture:canvas.hasPointerCapture(e.pointerId)});},{capture:true});});
 const b=await canvas.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+1,y);await canvas.evaluate(canvas=>canvas.releasePointerCapture(window.downId));await page.mouse.move(x+2,y);await page.mouse.move(x,y-60);await page.mouse.up();await page.getByRole('button',{name:'Pause game',exact:true}).click();
 const row={omitLostHandler,omittedHandlers:await page.evaluate(()=>omittedLostHandlers),events:await page.evaluate(()=>captureEvents),state:await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:snake')).data)};rows.push(row);await page.close();
}
await browser.close();await writeFile('/tmp/qcc-snake-capture-negative-control.json',JSON.stringify({kind:'isolated response listener omission; runtime files unchanged',rows},null,2));console.log(JSON.stringify(rows.map(r=>({omitLostHandler:r.omitLostHandler,omittedHandlers:r.omittedHandlers,queue:r.state.queue,events:r.events.map(e=>({type:e.type,trusted:e.trusted}))})),null,2));
if(rows[0].state.queue.length!==0||rows[1].state.queue.join()!=='up'||rows[1].omittedHandlers!==1)throw new Error('Negative control did not distinguish the cancellation handler');
