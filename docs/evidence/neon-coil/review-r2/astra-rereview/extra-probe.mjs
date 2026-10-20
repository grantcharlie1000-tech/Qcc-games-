import {chromium} from '/workspace/Qcc-games-/node_modules/playwright/index.mjs';
import {writeFile} from 'node:fs/promises';
const folder='/tmp/neon-rereview-xHQvTN';
const b=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const result={layout:[],input:[],errors:[]};
const c=await b.newContext();await c.addInitScript(()=>sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading'));const p=await c.newPage();
p.on('pageerror',e=>result.errors.push(e.message));
for (const size of [{width:844,height:390},{width:740,height:360},{width:320,height:568},{width:568,height:320}]) {
 await p.setViewportSize(size);await p.goto('http://127.0.0.1:4173/#/game/neon-coil');await p.locator('.nc-start').waitFor();await p.locator('#restart-game').click();
 const card=await p.locator('.nc-card').boundingBox(),enter=await p.locator('.nc-start').boundingBox();await p.locator('.nc-start').click();await p.waitForTimeout(150);
 const boxes={};for(const sel of ['.nc-you','#restart-game','#favourite-game','#rules-game','#game-menu','.nc-boost'])boxes[sel]=await p.locator(sel).boundingBox();
 result.layout.push({size,card,enter,boxes});await p.screenshot({path:`${folder}/extra-running-${size.width}.png`});
}
await c.close();
const tc=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await tc.addInitScript(()=>sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading'));const t=await tc.newPage();t.on('pageerror',e=>result.errors.push(e.message));await t.clock.install();await t.clock.pauseAt(new Date());await t.goto('http://127.0.0.1:4173/#/game/neon-coil');await t.locator('.nc-start').tap();
await t.evaluate(()=>{window.pointerAudit=[];document.addEventListener('pointerdown',e=>window.pointerAudit.push({id:e.pointerId,target:e.target.className}));});
const cd=await tc.newCDPSession(t),box=await t.locator('.nc-boost').boundingBox(),boost={id:1,x:box.x+box.width/2,y:box.y+box.height/2},steer={id:2,x:195,y:200};
const send=(type,touchPoints)=>cd.send('Input.dispatchTouchEvent',{type,touchPoints});
const sample=async label=>result.input.push({label,...await t.evaluate(()=>({data:{...document.querySelector('.nc-game').dataset},capture:window.pointerAudit.map(p=>({...p,canvas:document.querySelector('canvas').hasPointerCapture(p.id),boost:document.querySelector('.nc-boost').hasPointerCapture(p.id)}))}))});
await send('touchStart',[boost]);await send('touchStart',[boost,steer]);await t.clock.runFor(500);await sample('boost-first-active');
await t.mouse.move(195,650);await t.clock.runFor(150);await sample('mouse-hover-does-not-steal');
await t.keyboard.press('p');await sample('paused-captures-cleared');await send('touchCancel',[]);await t.keyboard.press('p');await t.clock.runFor(150);await sample('resumed-no-held-input');
await send('touchStart',[boost]);await send('touchStart',[boost,steer]);await t.clock.runFor(150);await t.evaluate(()=>window.dispatchEvent(new Event('blur')));await t.clock.runFor(150);await sample('blur-captures-cleared');await send('touchCancel',[]);
await send('touchStart',[boost]);await send('touchStart',[boost,steer]);await t.clock.runFor(150);await t.evaluate(()=>location.hash='#/');await t.locator('.nc-game').waitFor({state:'detached'});result.input.push({label:'dispose',arenaCount:await t.locator('.nc-game').count()});
await tc.close();await b.close();await writeFile(`${folder}/extra-probe.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
