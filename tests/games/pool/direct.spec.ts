import {test,expect,type Page} from '../../fixtures';
import {settledPoolGeometry} from '../../../scripts/pool-verifier-shot.mjs';
async function table(page:Page){const canvas=page.locator('.pool-table');await expect(canvas).toBeVisible();return (await canvas.boundingBox())!;}
async function cueDrag(page:Page,pull=90){await page.locator('.pool-table').hover();const b=await settledPoolGeometry(page);await page.mouse.move(b.x+225/840*b.width,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+(225-pull)/840*b.width,b.y+b.height/2,{steps:8});}
type NativePullPoint={type:string;clientX:number;clientY:number;pointerId:number;trusted:boolean;left:number;top:number;width:number;height:number};
async function recordNativePull(page:Page){
 await page.locator('.pool-table').evaluate(canvas=>{
  const events:NativePullPoint[]=[];
  for(const type of ['pointerdown','pointermove','pointerup'])canvas.addEventListener(type,event=>{
   const p=event as PointerEvent,r=canvas.getBoundingClientRect();
   events.push({type,clientX:p.clientX,clientY:p.clientY,pointerId:p.pointerId,trusted:p.isTrusted,left:r.left,top:r.top,width:r.width,height:r.height});
   canvas.setAttribute('data-test-native-pull',JSON.stringify(events));
  },{capture:true});
 });
}
async function nativePull(page:Page){return JSON.parse((await page.locator('.pool-table').getAttribute('data-test-native-pull'))!) as NativePullPoint[];}
function observedPower(down:NativePullPoint,end:NativePullPoint){
 // The initial cue aims screen-right: a backwards pull is horizontal left.
 // Derive model distance directly from native screen pixels, independent of input.ts.
 return (down.clientX-end.clientX)*840/end.width/120;
}
async function expectNativePower(page:Page,endType:'pointermove'|'pointerup'){
 const events=await nativePull(page),down=events.find(e=>e.type==='pointerdown')!,end=events.filter(e=>e.type===endType).at(-1)!;
 expect(down).toBeDefined();expect(end).toBeDefined();expect(down.trusted&&end.trusted).toBe(true);expect(end.pointerId).toBe(down.pointerId);
 expect({left:end.left,top:end.top,width:end.width,height:end.height}).toEqual({left:down.left,top:down.top,width:down.width,height:down.height});
 const power=observedPower(down,end);expect(power).toBeGreaterThan(.7);expect(power).toBeLessThan(.8);
 await test.info().attach(`native-pull-${endType}`,{body:JSON.stringify({events,expectedPower:power,expectedDisplay:`${Math.round(power*100)}%`},null,2),contentType:'application/json'});
 if(endType==='pointermove')await expect(page.locator('.pool-power-value')).toHaveText(`${Math.round(power*100)}%`);
 else{
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:pool')!).data);
  expect(saved.angle).toBe(-Math.PI/2);expect(saved.power).toBeCloseTo(power,12);
 }
 return {down,end,power};
}
test.beforeEach(async({page})=>{await page.goto('/#/game/pool');await page.getByLabel('Players',{exact:true}).selectOption('two');});
test('horizontal direct break separates aim, pull, cancel and release',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});const b=await settledPoolGeometry(page),root=page.locator('.pool-game');expect(b.width/b.height).toBeCloseTo(840/440,1);expect(b.width).toBeGreaterThan(800);
 await page.mouse.move(b.x+b.width*.5,b.y+b.height*.5);await page.mouse.down();await page.mouse.move(b.x+b.width*.7,b.y+b.height*.5);await page.mouse.up();await expect(root).toHaveAttribute('data-shots','0');
 await cueDrag(page);await expect(root).toHaveAttribute('data-gesture','pull');await expect(page.locator('.pool-power-value')).toContainText('75%');await page.mouse.move(b.x+225/840*b.width,b.y+b.height/2);await page.mouse.up();await expect(root).toHaveAttribute('data-shots','0');
 await cueDrag(page);await page.mouse.up();await expect(root).toHaveAttribute('data-shots','1');await expect(root).toHaveAttribute('data-phase','moving');
});
test('interrupted, outside-start and multi-touch drags cannot fire',async({page})=>{
 const root=page.locator('.pool-game');let b=await table(page);
 await page.mouse.move(b.x+2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width*.2,b.y+b.height/2);await page.mouse.up();await expect(root).toHaveAttribute('data-shots','0');
 await cueDrag(page);await page.keyboard.press('c');await page.mouse.up();await expect(root).toHaveAttribute('data-shots','0');
 await cueDrag(page);await page.setViewportSize({width:844,height:390});await page.mouse.up();await expect(root).toHaveAttribute('data-shots','0');
 await cueDrag(page);await page.evaluate(()=>document.querySelector('.pool-table')!.dispatchEvent(new PointerEvent('pointercancel',{pointerId:1,bubbles:true})));await page.mouse.up();await expect(root).toHaveAttribute('data-shots','0');
 await cueDrag(page);await page.evaluate(()=>document.querySelector('.pool-table')!.dispatchEvent(new PointerEvent('pointerdown',{pointerId:99,pointerType:'touch',isPrimary:false,bubbles:true})));await page.mouse.up();await expect(root).toHaveAttribute('data-shots','0');await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{pointerId:99,pointerType:'touch'})));
 await cueDrag(page);await expect(root).toHaveAttribute('data-gesture','pull');await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();await page.mouse.up();await page.getByRole('link',{name:'Games',exact:true}).click();await expect(root).toHaveAttribute('data-shots','0');
});
test('captured release outside the canvas commits once and retains keyboard access',async({page})=>{
 const root=page.locator('.pool-game');await cueDrag(page,120);await page.mouse.move(0,0);await page.mouse.up();await expect(root).toHaveAttribute('data-shots','1');await page.getByRole('button',{name:'Restart game',exact:true}).click();await page.locator('.pool-table').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(root).toHaveAttribute('data-shots','1');
});
test('pause, restart and CSS scaling discard a loaded stroke before release',async({page})=>{
 const root=page.locator('.pool-game');
 await cueDrag(page);await expect(root).toHaveAttribute('data-gesture','pull');await page.getByRole('button',{name:'Pause game',exact:true}).focus();await page.keyboard.press('Enter');await page.mouse.up();await page.getByRole('button',{name:'Keep playing',exact:true}).click();await expect(root).toHaveAttribute('data-shots','0');
 await cueDrag(page);await expect(root).toHaveAttribute('data-gesture','pull');await page.getByRole('button',{name:'Restart game',exact:true}).focus();await page.keyboard.press('Enter');await page.mouse.up();await expect(root).toHaveAttribute('data-shots','0');
 await cueDrag(page);await expect(root).toHaveAttribute('data-gesture','pull');await page.locator('.pool-table').evaluate(el=>el.style.transform='scale(.9)');await page.mouse.up();await expect(root).toHaveAttribute('data-shots','0');await page.locator('.pool-table').evaluate(el=>el.style.transform='');
});
test('native touch captures at high DPI, rejects a second finger outside the table and recovers',async({browser,browserName})=>{
 test.skip(browserName!=='chromium','CDP supplies native touch events in Chromium.');
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3});
 try{
  await context.addInitScript(()=>{
   localStorage.setItem('pocket-arcade:v1:accounts:guest','true');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
   sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
   const events:{type:string;trusted:boolean;captured:boolean}[]=[];
   const diagnostics:Record<string,unknown>[]=[];
   const record=(label:string,event?:Event)=>{
    if(diagnostics.length>=256)return;
    const canvas=document.querySelector('.pool-table'),root=document.querySelector('.pool-game'),r=canvas?.getBoundingClientRect(),p=event as PointerEvent|undefined;
    diagnostics.push({label,time:performance.now(),gesture:root?.getAttribute('data-gesture'),phase:root?.getAttribute('data-phase'),shots:root?.getAttribute('data-shots'),rect:r?{x:r.x,y:r.y,width:r.width,height:r.height}:null,viewport:window.visualViewport?{scale:visualViewport!.scale,width:visualViewport!.width,height:visualViewport!.height,offsetLeft:visualViewport!.offsetLeft,offsetTop:visualViewport!.offsetTop}:null,focused:document.hasFocus(),visibility:document.visibilityState,event:event?{type:event.type,trusted:event.isTrusted,pointerId:p?.pointerId,pointerType:p?.pointerType,primary:p?.isPrimary,button:p?.button,buttons:p?.buttons,x:p?.clientX,y:p?.clientY,targetIsCanvas:event.target===canvas,captured:canvas instanceof HTMLCanvasElement&&p?.pointerId!==undefined?canvas.hasPointerCapture(p.pointerId):false}:null});
   };
   Object.assign(window,{poolTouchEvents:events,poolTouchDiagnostics:diagnostics,recordPoolTouchDiagnostic:record});
   for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','contextmenu']){
    window.addEventListener(type,event=>record('capture:'+type,event),{capture:true});
    window.addEventListener(type,event=>record('bubble:'+type,event));
   }
   for(const type of ['resize','blur','focus'])window.addEventListener(type,event=>record('window:'+type,event));
   for(const type of ['resize','scroll'])window.visualViewport?.addEventListener(type,event=>record('viewport:'+type,event));
   document.addEventListener('visibilitychange',event=>record('document:visibilitychange',event));
   for(const type of ['pointerdown','pointerup','pointercancel','gotpointercapture'])window.addEventListener(type,event=>{const e=event as PointerEvent;events.push({type,trusted:e.isTrusted,captured:(e.target as Element).hasPointerCapture?.(e.pointerId)||false});},{capture:true});
  });
  const page=await context.newPage();await page.goto('/#/game/pool');await page.getByLabel('Players',{exact:true}).selectOption('two');
  const root=page.locator('.pool-game'),session=await context.newCDPSession(page);
  const touch=(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',touchPoints:{x:number;y:number;id:number}[]=[])=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
  await page.locator('.pool-table').evaluate(canvas=>{
   const record=(window as unknown as {recordPoolTouchDiagnostic:(label:string)=>void}).recordPoolTouchDiagnostic;
   const observer=new ResizeObserver(()=>record('observer:table'));observer.observe(canvas);
   record('observer:attached');
  });
  async function pull(){const b=await settledPoolGeometry(page),a={x:b.x+225/840*b.width,y:b.y+b.height/2,id:1},z={...a,x:b.x+135/840*b.width};await touch('touchStart',[a]);for(let i=1;i<=6;i++)await touch('touchMove',[{...a,x:a.x+(z.x-a.x)*i/6}]);await expect(root).toHaveAttribute('data-gesture','pull');return {a,z};}
  await pull();await touch('touchCancel');await expect(root).toHaveAttribute('data-shots','0');
  // The play surface locks pinch-zoom, so a page-scale request cannot zoom the table or cancel the stroke.
  await pull();await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.25});await expect.poll(()=>page.evaluate(()=>visualViewport!.scale)).toBeCloseTo(1,2);await expect(root).toHaveAttribute('data-gesture','pull');await touch('touchCancel');await expect(root).toHaveAttribute('data-shots','0');
  await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});
  const held=await pull();await touch('touchStart',[held.z,{x:10,y:30,id:2}]);await touch('touchEnd');await expect(root).toHaveAttribute('data-gesture','idle');await expect(root).toHaveAttribute('data-shots','0');
  const returning=await pull();await touch('touchMove',[returning.a]);await touch('touchEnd');await expect(root).toHaveAttribute('data-shots','0');
  await pull();await touch('touchEnd');await expect(root).toHaveAttribute('data-shots','1');
  const events=await page.evaluate(()=>(window as unknown as {poolTouchEvents:{type:string;trusted:boolean;captured:boolean}[]}).poolTouchEvents);
  expect(events.every(e=>e.trusted)).toBe(true);expect(events.some(e=>e.type==='gotpointercapture')).toBe(true);expect(events.some(e=>e.type==='pointerup'&&e.captured)).toBe(true);expect(events.some(e=>e.type==='pointercancel')).toBe(true);
  expect(await page.evaluate(()=>({x:scrollX,y:scrollY,overflow:document.documentElement.scrollWidth>innerWidth}))).toEqual({x:0,y:0,overflow:false});
 }finally{
  try{
   for(const page of context.pages()){
    let timer:ReturnType<typeof setTimeout>|undefined;
    const diagnostics=await Promise.race([page.evaluate(()=>(window as unknown as {poolTouchDiagnostics?:unknown[]}).poolTouchDiagnostics||[]),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Pool touch diagnostic deadline')),5000);})]).finally(()=>clearTimeout(timer));
    await test.info().attach('pool-native-touch-diagnostics',{body:JSON.stringify(diagnostics,null,2),contentType:'application/json'});
   }
  }catch(error){console.warn('Pool touch diagnostic capture failed:',String(error));}
  await context.close();
 }
});
for(const size of [{width:768,height:1024},{width:1366,height:768}])test(`gesture feedback preserves table geometry at ${size.width}×${size.height}`,async({page})=>{
 await page.setViewportSize(size);await expect.poll(async()=>{const b=await table(page);return Math.abs(b.width/(b.height||1)-840/440)<.001;}).toBe(true);
 await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
 const b=await table(page),root=page.locator('.pool-game');await recordNativePull(page);await cueDrag(page);
 await expect(root).toHaveAttribute('data-gesture','pull');await expectNativePower(page,'pointermove');
 const held=await table(page);expect(held.x).toBeCloseTo(b.x,1);expect(held.y).toBeCloseTo(b.y,1);expect(held.width).toBeCloseTo(b.width,1);expect(held.height).toBeCloseTo(b.height,1);
 await page.mouse.up();await expect(root).toHaveAttribute('data-shots','1');await expectNativePower(page,'pointerup');
});
test('a contact already held outside the table blocks a new mouse stroke',async({page})=>{
 await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerdown',{pointerId:99,pointerType:'pen',isPrimary:true,button:0})));
 await cueDrag(page);await page.mouse.up();await expect(page.locator('.pool-game')).toHaveAttribute('data-shots','0');
 await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{pointerId:99,pointerType:'pen'})));
 await cueDrag(page);await page.mouse.up();await expect(page.locator('.pool-game')).toHaveAttribute('data-shots','1');
});
for(const transition of ['pause','Study'] as const)test(`native held touch remains a contact through ${transition} and blocks a new mouse stroke`,async({browser,browserName})=>{
 test.skip(browserName!=='chromium','CDP supplies native mixed touch and mouse input in Chromium.');
 const context=await browser.newContext({viewport:{width:1366,height:768},hasTouch:true});
 try{
  await context.addInitScript(()=>{
   localStorage.setItem('pocket-arcade:v1:accounts:guest','true');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
   sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
   const events:{type:string;trusted:boolean;pointerType:string}[]=[];Object.assign(window,{poolHeldContactEvents:events});
   for(const type of ['pointerdown','pointerup','pointercancel'])window.addEventListener(type,event=>{const e=event as PointerEvent;events.push({type,trusted:e.isTrusted,pointerType:e.pointerType});},{capture:true});
  });
  const page=await context.newPage();await page.goto('/#/game/pool');await page.getByLabel('Players',{exact:true}).selectOption('two');
  const root=page.locator('.pool-game'),session=await context.newCDPSession(page),brand=(await page.locator('.pool-player-heading').first().boundingBox())!;
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:brand.x+5,y:brand.y+brand.height/2,id:7}]});
  await cueDrag(page);await page.mouse.up();expect(await root.getAttribute('data-shots')).toBe('0');
  if(transition==='pause'){
   await page.getByRole('button',{name:'Pause game',exact:true}).focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Keep playing',exact:true}).focus();await page.keyboard.press('Enter');
  }else{
   await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();await page.getByRole('link',{name:'Games',exact:true}).focus();await page.keyboard.press('Enter');await expect(root).toBeVisible();
  }
  await cueDrag(page);await page.mouse.up();expect(await root.getAttribute('data-shots')).toBe('0');
  const heldEvents=await page.evaluate(()=>(window as unknown as {poolHeldContactEvents:{type:string;trusted:boolean;pointerType:string}[]}).poolHeldContactEvents);
  expect(heldEvents.every(e=>e.trusted)).toBe(true);expect(heldEvents.filter(e=>e.pointerType==='touch').map(e=>e.type)).toEqual(['pointerdown']);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect(await root.getAttribute('data-shots')).toBe('0');
  await cueDrag(page);await page.mouse.up();await expect(root).toHaveAttribute('data-shots','1');
 }finally{await context.close();}
});

test('integer native pointer positions preserve displayed and committed pull power',async({page})=>{
 await page.setViewportSize({width:768,height:1024});const canvas=page.locator('.pool-table');await canvas.hover();const b=(await canvas.boundingBox())!;
 await recordNativePull(page);
 const y=Math.floor(b.y+b.height/2),start=Math.floor(b.x+225/840*b.width),end=Math.floor(b.x+135/840*b.width);
 await page.mouse.move(start,y);await page.mouse.down();await page.mouse.move(end,y,{steps:8});
 const loaded=await expectNativePower(page,'pointermove');expect(loaded.down.clientX).toBe(start);expect(loaded.end.clientX).toBe(end);
 await page.mouse.up();await expect(page.locator('.pool-game')).toHaveAttribute('data-shots','1');await expectNativePower(page,'pointerup');
});

