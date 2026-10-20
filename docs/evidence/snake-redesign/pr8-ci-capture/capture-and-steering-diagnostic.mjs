import {chromium} from '/workspace/qcc-snake/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--enable-webgl','--use-gl=angle','--use-angle=swiftshader']});
const results={snake:[],ballRun:[]};
async function pageFor(game,fake=false){const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(10000);await page.addInitScript(()=>sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading'));if(fake){await page.clock.install({time:new Date('2026-10-20T10:00:00Z')});await page.clock.pauseAt(new Date('2026-10-20T10:00:01Z'));}await page.goto('http://127.0.0.1:4181/#/game/'+game);return page;}
for(const actual of [false,true]){
 const page=await pageFor('snake',true);await page.getByRole('button',{name:'Start slithering',exact:true}).click();await page.clock.runFor(260);
 await page.locator('canvas').evaluate(canvas=>{window.captureEvents=[];for(const type of ['pointerdown','gotpointercapture','lostpointercapture','pointermove','pointerup'])canvas.addEventListener(type,e=>{if(type==='pointerdown')window.downId=e.pointerId;captureEvents.push({type,id:e.pointerId,trusted:e.isTrusted,hasCapture:canvas.hasPointerCapture(e.pointerId),x:e.clientX,y:e.clientY});},{capture:true});});
 const b=await page.locator('canvas').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;await page.mouse.move(x,y);await page.mouse.down();
 if(actual)await page.mouse.move(x+1,y);
 await page.locator('canvas').evaluate((canvas,actual)=>canvas.releasePointerCapture(actual?window.downId:1),actual);
 if(actual)await page.mouse.move(x+2,y);
 await page.mouse.move(x,y-60);await page.mouse.up();await page.getByRole('button',{name:'Pause game',exact:true}).click();
 results.snake.push({scenario:actual?'established capture then release':'original immediate release',events:await page.evaluate(()=>captureEvents),state:await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:snake')).data)});await page.close();
}
{
 const page=await pageFor('ball-run');await page.getByRole('button',{name:'Start rolling',exact:true}).click();await page.waitForFunction(()=>Number(document.querySelector('.ball-run').dataset.distance)>.2);
 await page.evaluate(()=>{window.heldFrames=[];window.keyEvents=[];const raf=requestAnimationFrame;window.suppressFrames=true;window.requestAnimationFrame=cb=>raf(time=>{if(suppressFrames)heldFrames.push(cb);else cb(time);});for(const type of ['keydown','keyup'])window.addEventListener(type,e=>keyEvents.push({type,key:e.key,trusted:e.isTrusted}));});
 // Let the callback already scheduled before interception pass; the next callback is withheld.
 await page.waitForFunction(()=>heldFrames.length>0);
 await page.keyboard.press('ArrowRight',{delay:250});const during=await page.locator('.ball-run').getAttribute('data-x');
 await page.evaluate(()=>{suppressFrames=false;for(const cb of heldFrames.splice(0))cb(performance.now());});
 await page.evaluate(()=>new Promise(resolve=>{let n=0;function f(){if(++n===10)resolve();else requestAnimationFrame(f);}requestAnimationFrame(f);}));
 results.ballRun.push({scenario:'250ms native hold with no delivered RAF',during,after:await page.locator('.ball-run').getAttribute('data-x'),events:await page.evaluate(()=>keyEvents)});await page.close();
}
{
 const page=await pageFor('ball-run',true);await page.getByRole('button',{name:'Start rolling',exact:true}).click();await page.clock.runFor(100);await page.keyboard.down('ArrowRight');await page.clock.runFor(250);await page.keyboard.up('ArrowRight');
 results.ballRun.push({scenario:'250ms delivered fake RAF with native held key',after:await page.locator('.ball-run').getAttribute('data-x'),distance:await page.locator('.ball-run').getAttribute('data-distance')});await page.close();
}
await browser.close();await writeFile('/tmp/qcc-snake-second-ci-diagnostic.json',JSON.stringify(results,null,2));console.log(JSON.stringify({snake:results.snake.map(r=>({scenario:r.scenario,queue:r.state.queue,events:r.events.map(e=>e.type)})),ballRun:results.ballRun},null,2));
