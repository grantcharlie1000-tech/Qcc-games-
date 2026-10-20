import assert from 'node:assert/strict';
import {test,expect,type Page} from '../../fixtures';
import {preparePoolShot,verifyPoolShot,settledPoolGeometry} from '../../../scripts/pool-verifier-shot.mjs';

async function mount(page:Page){
 await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
 await expect(page.locator('.pool-game')).toHaveAttribute('data-shots','0');
 await settledPoolGeometry(page);
 await page.locator('.pool-table').evaluate(canvas=>{
  const events:unknown[]=[];Object.assign(window,{verifierNativeEvents:events});
  for(const type of ['pointerdown','pointermove','pointerup'])canvas.addEventListener(type,event=>{
   const e=event as PointerEvent,root=document.querySelector<HTMLElement>('.pool-game')!;
   events.push({type,trusted:e.isTrusted,buttons:e.buttons,gesture:root.dataset.gesture,power:root.querySelector('.pool-power-value')!.textContent,shots:root.dataset.shots});
  });
 });
}

test('stale coordinates aim, while settled actual geometry produces one native pull',async({page})=>{
 await mount(page);const canvas=page.locator('.pool-table');await canvas.hover();const stale=(await canvas.boundingBox())!;
 // Temporary real DOM motion only: no product callback/model/shot-count patch.
 await canvas.evaluate(async canvas=>{
  canvas.style.transformOrigin='0 0';
  await canvas.animate([{transform:'translate(0,0) scale(1)'},{transform:'translate(95px,-27px) scale(.79)'}],{duration:160,fill:'forwards'}).finished;
 });
 await assert.rejects(async()=>{
  await page.mouse.move(stale.x+stale.width*225/840,stale.y+stale.height/2);await page.mouse.down();await page.mouse.move(stale.x+stale.width*135/840,stale.y+stale.height/2,{steps:8});await page.mouse.up();assert.equal(await page.locator('.pool-game').getAttribute('data-shots'),'1');
 },{name:'AssertionError',actual:'0',expected:'1'});
 const staleEvents=await page.evaluate(()=>(window as unknown as {verifierNativeEvents:{type:string;gesture:string;trusted:boolean}[]}).verifierNativeEvents);
 expect(staleEvents.find(e=>e.type==='pointerdown')).toMatchObject({gesture:'aim',trusted:true});
 await page.getByRole('button',{name:'Restart game',exact:true}).click();
 await canvas.evaluate(canvas=>{
  for(const animation of canvas.getAnimations())animation.cancel();
  canvas.animate([{transform:'translate(0,0) scale(1)'},{transform:'translate(95px,-27px) scale(.79)'}],{duration:160,fill:'forwards'});
 });
 // Exercise the frame predicate while the real canvas is still moving.
 const settled=await settledPoolGeometry(page);const actual=await canvas.evaluate(canvas=>{const r=canvas.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};});
 expect({x:settled.x,y:settled.y,width:settled.width,height:settled.height}).toEqual(actual);
 await verifyPoolShot(page);
 const events=await page.evaluate(()=>(window as unknown as {verifierNativeEvents:{type:string;gesture:string;trusted:boolean}[]}).verifierNativeEvents);
 expect(events.filter(e=>e.type==='pointerdown').at(-1)).toMatchObject({gesture:'pull',trusted:true});
 expect(events.every(e=>e.trusted)).toBe(true);
 await test.info().attach('stale-and-corrected-native-events',{body:JSON.stringify({stale,settled,events},null,2),contentType:'application/json'});
});

test('a continuously moving actual table fails bounded readiness before any shot attempt',async({page})=>{
 await mount(page);
 await page.locator('.pool-table').evaluate(canvas=>{canvas.animate([{transform:'translateX(0)'},{transform:'translateX(80px)'}],{duration:200,iterations:Infinity,direction:'alternate'});});
 await assert.rejects(()=>settledPoolGeometry(page),/Pool layout readiness timed out/);
 expect(await page.evaluate(()=>(window as unknown as {verifierNativeEvents:{type:string}[]}).verifierNativeEvents.some(e=>e.type==='pointerdown'))).toBe(false);
 expect(await page.locator('.pool-game').getAttribute('data-shots')).toBe('0');
});

test('geometry changed after targeting fails before down without retargeting',async({page})=>{
 await mount(page);const canvas=page.locator('.pool-table');
 // One fixture-only move event changes actual geometry after the helper targets.
 await canvas.evaluate(canvas=>{
  const change=(event:Event)=>{const e=event as PointerEvent,r=canvas.getBoundingClientRect();if(e.isTrusted&&e.clientX<r.left+r.width*.4){canvas.style.transform='translateX(95px)';canvas.removeEventListener('pointermove',change);}};
  canvas.addEventListener('pointermove',change);
 });
 await assert.rejects(()=>preparePoolShot(page),/Pool layout changed before pointerdown/);
 expect(await page.locator('.pool-game').getAttribute('data-shots')).toBe('0');
 expect(await page.evaluate(()=>(window as unknown as {verifierNativeEvents:{type:string}[]}).verifierNativeEvents.some(e=>e.type==='pointerdown'))).toBe(false);
});

test('a real accepted pull without release commit still fails the immediate strict shot assertion',async({page})=>{
 await mount(page);
 await page.locator('.pool-table').evaluate(canvas=>{
  canvas.addEventListener('pointerup',event=>{
   const root=document.querySelector<HTMLElement>('.pool-game')!;
   Object.assign(window,{suppressedPoolRelease:{trusted:event.isTrusted,gesture:root.dataset.gesture,power:root.querySelector('.pool-power-value')!.textContent,shots:root.dataset.shots}});
   // Disposable negative fixture: suppress only this release, after real pull input.
   event.stopImmediatePropagation();
  },{capture:true,once:true});
 });
 await assert.rejects(()=>verifyPoolShot(page),{name:'AssertionError',actual:'0',expected:'1'});
 expect(await page.evaluate(()=>(window as unknown as {suppressedPoolRelease:unknown}).suppressedPoolRelease)).toMatchObject({trusted:true,gesture:'pull',power:'75%',shots:'0'});
 expect(await page.locator('.pool-game').getAttribute('data-shots')).toBe('0');
});
