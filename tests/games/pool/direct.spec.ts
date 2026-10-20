import {test,expect,type Page} from '../../fixtures';
async function table(page:Page){const canvas=page.locator('.pool-table');await expect(canvas).toBeVisible();return (await canvas.boundingBox())!;}
async function cueDrag(page:Page,pull=90){await page.locator('.pool-table').hover();const b=await table(page);await page.mouse.move(b.x+225/840*b.width,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+(225-pull)/840*b.width,b.y+b.height/2,{steps:8});}
test.beforeEach(async({page})=>{await page.goto('/#/game/pool');await page.getByLabel('Players',{exact:true}).selectOption('two');});
test('horizontal direct break separates aim, pull, cancel and release',async({page})=>{
 await page.setViewportSize({width:1440,height:1000});await expect.poll(async()=> (await table(page)).width).toBeGreaterThan(800);const b=await table(page),root=page.locator('.pool-game');expect(b.width/b.height).toBeCloseTo(840/440,1);expect(b.width).toBeGreaterThan(800);
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
   sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
   const events:{type:string;trusted:boolean;captured:boolean}[]=[];
   Object.assign(window,{poolTouchEvents:events});
   for(const type of ['pointerdown','pointerup','pointercancel','gotpointercapture'])window.addEventListener(type,event=>{const e=event as PointerEvent;events.push({type,trusted:e.isTrusted,captured:(e.target as Element).hasPointerCapture?.(e.pointerId)||false});},{capture:true});
  });
  const page=await context.newPage();await page.goto('/#/game/pool');await page.getByLabel('Players',{exact:true}).selectOption('two');
  const root=page.locator('.pool-game'),session=await context.newCDPSession(page);
  const touch=(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',touchPoints:{x:number;y:number;id:number}[]=[])=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
  async function pull(){const b=await table(page),a={x:b.x+225/840*b.width,y:b.y+b.height/2,id:1},z={...a,x:b.x+135/840*b.width};await touch('touchStart',[a]);for(let i=1;i<=6;i++)await touch('touchMove',[{...a,x:a.x+(z.x-a.x)*i/6}]);await expect(root).toHaveAttribute('data-gesture','pull');return {a,z};}
  await pull();await touch('touchCancel');await expect(root).toHaveAttribute('data-shots','0');
  await pull();await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.25});await expect.poll(()=>page.evaluate(()=>visualViewport!.scale)).toBeCloseTo(1.25,2);await expect(root).toHaveAttribute('data-gesture','idle');await touch('touchEnd');await expect(root).toHaveAttribute('data-shots','0');
  await session.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await expect.poll(()=>page.evaluate(()=>visualViewport!.scale)).toBeCloseTo(1,2);
  const held=await pull();await touch('touchStart',[held.z,{x:10,y:30,id:2}]);await touch('touchEnd');await expect(root).toHaveAttribute('data-gesture','idle');await expect(root).toHaveAttribute('data-shots','0');
  const returning=await pull();await touch('touchMove',[returning.a]);await touch('touchEnd');await expect(root).toHaveAttribute('data-shots','0');
  await pull();await touch('touchEnd');await expect(root).toHaveAttribute('data-shots','1');
  const events=await page.evaluate(()=>(window as unknown as {poolTouchEvents:{type:string;trusted:boolean;captured:boolean}[]}).poolTouchEvents);
  expect(events.every(e=>e.trusted)).toBe(true);expect(events.some(e=>e.type==='gotpointercapture')).toBe(true);expect(events.some(e=>e.type==='pointerup'&&e.captured)).toBe(true);expect(events.some(e=>e.type==='pointercancel')).toBe(true);
  expect(await page.evaluate(()=>({x:scrollX,y:scrollY,overflow:document.documentElement.scrollWidth>innerWidth}))).toEqual({x:0,y:0,overflow:false});
 }finally{await context.close();}
});
for(const size of [{width:768,height:1024},{width:1366,height:768}])test(`gesture feedback preserves table geometry at ${size.width}×${size.height}`,async({page})=>{
 await page.setViewportSize(size);await expect.poll(async()=>{const b=await table(page);return Math.abs(b.width/(b.height||1)-840/440)<.001;}).toBe(true);
 await page.evaluate(()=>new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r()))));
 const b=await table(page),root=page.locator('.pool-game');await cueDrag(page);
 await expect(root).toHaveAttribute('data-gesture','pull');await expect(page.locator('.pool-power-value')).toContainText('75%');
 const held=await table(page);expect(held.x).toBeCloseTo(b.x,1);expect(held.y).toBeCloseTo(b.y,1);expect(held.width).toBeCloseTo(b.width,1);expect(held.height).toBeCloseTo(b.height,1);
 await page.mouse.up();await expect(root).toHaveAttribute('data-shots','1');
});
test('a contact already held outside the table blocks a new mouse stroke',async({page})=>{
 await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerdown',{pointerId:99,pointerType:'pen',isPrimary:true,button:0})));
 await cueDrag(page);await page.mouse.up();await expect(page.locator('.pool-game')).toHaveAttribute('data-shots','0');
 await page.evaluate(()=>window.dispatchEvent(new PointerEvent('pointerup',{pointerId:99,pointerType:'pen'})));
 await cueDrag(page);await page.mouse.up();await expect(page.locator('.pool-game')).toHaveAttribute('data-shots','1');
});
