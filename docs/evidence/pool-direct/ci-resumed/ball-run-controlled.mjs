// Controlled causal reproduction; gates only the game RAF in the RED case.
// ARCADE_URL=http://127.0.0.1:4173 node docs/evidence/pool-direct/ci-resumed/ball-run-controlled.mjs
import {chromium} from 'playwright';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader']});
const report={recordedAt:new Date().toISOString(),browser:browser.version(),controlledStall:true,cases:[]};
async function init(page){await page.addInitScript(()=>{
 sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
 window.diag={events:[],frames:[],blocked:0};window.holdGameRAF=false;
 const state=()=>{const el=document.querySelector('.ball-run');return {x:el?.dataset.x,distance:el?.dataset.distance,phase:el?.dataset.phase,focused:document.hasFocus()};};
 for(const type of ['keydown','keyup','blur'])window.addEventListener(type,e=>{const record={type,key:e.key,trusted:e.isTrusted,at:performance.now(),state:state(),get accepted(){return e.defaultPrevented;}};window.diag.events.push(record);},true);
 window.installDiagnosticRAF=()=>{const raf=requestAnimationFrame.bind(window);
 window.requestAnimationFrame=callback=>{
  if(callback.name!=='loop')return raf(callback);
  const run=time=>{if(window.holdGameRAF){window.diag.blocked++;raf(run);return;}
   const before={at:performance.now(),time,state:state()};callback(time);window.diag.frames.push({before,after:{at:performance.now(),state:state()}});
  };return raf(run);
 };};window.installDiagnosticRAF();
});}
try{
 for(const manual of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();await init(page);
  if(manual){await page.clock.install({time:new Date('2026-10-20T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-20T12:00:01Z'));}
  await page.goto(`${process.env.ARCADE_URL || 'http://127.0.0.1:4173'}/#/game/ball-run`);if(manual)await page.evaluate(()=>window.installDiagnosticRAF());await page.getByRole('button',{name:'Start rolling',exact:true}).click();
  if(manual)await page.clock.runFor(64);
  await page.waitForFunction(()=>Number(document.querySelector('.ball-run').dataset.distance)>=.2);
  const before=await page.locator('.ball-run').evaluate(el=>({...el.dataset}));
  if(!manual)await page.evaluate(()=>window.holdGameRAF=true);
  if(manual){await page.keyboard.down('ArrowRight');try{await page.clock.runFor(250);}finally{await page.keyboard.up('ArrowRight');}}
  else await page.keyboard.press('ArrowRight',{delay:250});
  const diagnostic=await page.evaluate(()=>window.diag); // Captured BEFORE any reload or navigation.
  const after=await page.locator('.ball-run').evaluate(el=>({...el.dataset}));
  const down=diagnostic.events.find(e=>e.type==='keydown'&&e.key==='ArrowRight'),up=diagnostic.events.find(e=>e.type==='keyup'&&e.key==='ArrowRight');
  const held=diagnostic.frames.filter(f=>f.before.at>=down.at&&f.before.at<=up.at);
  assert.ok(down.trusted&&up.trusted&&down.accepted);assert.equal(diagnostic.events.filter(e=>e.type==='blur'&&e.at>=down.at&&e.at<=up.at).length,0);
  if(manual){assert.ok(Number(after.x)>.5);assert.ok(held.length>0);await page.clock.resume();}
  else{assert.equal(held.length,0);assert.equal(after.x,before.x);assert.equal(after.distance,before.distance);assert.ok(Number(after.x)<=.5);await page.evaluate(()=>window.holdGameRAF=false);}
  report.cases.push({case:manual?'bounded simulation clock':'original wall-clock press under controlled game-RAF stall',before,after,heldCallbacks:held.length,diagnostic,originalThresholdPasses:Number(after.x)>.5});await context.close();
 }
}finally{await browser.close();await writeFile(process.env.EVIDENCE_OUTPUT || '/tmp/ball-run-controlled.json',JSON.stringify(report,null,2));}
console.log(report.cases.map(c=>({case:c.case,heldCallbacks:c.heldCallbacks,x:c.after.x,distance:c.after.distance,originalThresholdPasses:c.originalThresholdPasses})));
