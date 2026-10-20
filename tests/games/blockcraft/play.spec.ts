import {test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';

const data=(page:Page,key:string)=>page.locator('.blockcraft').getAttribute(`data-${key}`);
const num=async(page:Page,key:string)=>Number(await data(page,key));
async function ready(page:Page){await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:20000});}

test('desktop: look, walk, jump, mine, place, pick blocks, pause, Study, restore and dispose',async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1280,height:720});
  await page.goto('/#/game/blockcraft');
  await page.getByRole('button',{name:'Game rules'}).click();
  await expect(page.locator('#rules-text')).toContainText('right click places');
  await page.getByRole('button',{name:'Let’s play'}).click();
  await ready(page);
  const root=page.locator('.blockcraft');
  expect(await num(page,'workers')).toBeGreaterThan(0);
  await expect.poll(()=>num(page,'meshes'),{timeout:20000}).toBeGreaterThan(40);
  // Whole chunks merge into few draws: one opaque and at most one water mesh per chunk, plus sky details.
  expect(await num(page,'drawCalls')).toBeLessThan(2*await num(page,'meshes')+4);

  await page.getByRole('button',{name:'Change view distance'}).click();
  await expect(root).toHaveAttribute('data-view','7');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(root).toHaveAttribute('data-phase','playing');
  await expect(root).toHaveAttribute('data-locked','true');

  // Mouse look under pointer lock.
  const yaw=await num(page,'yaw');
  await page.mouse.move(640,360);await page.mouse.move(540,360,{steps:5});
  await expect.poll(()=>num(page,'yaw')).toBeGreaterThan(yaw+.1);
  // Look down at the ground in front of the player.
  for(let i=0;i<8;i++)await page.mouse.move(540,360+(i+1)*40);
  await expect.poll(()=>data(page,'target')).not.toBe('');

  // Mine the outlined block, then place stone on the next target.
  const target=(await data(page,'target'))!;
  await page.mouse.down();await page.mouse.up();
  await expect(root).toHaveAttribute('data-mined','1');
  await expect.poll(()=>data(page,'target')).not.toBe(target);
  await page.keyboard.press('Digit3');await expect(root).toHaveAttribute('data-slot','2');
  await expect(page.getByRole('button',{name:'Stone, slot 3'})).toHaveAttribute('aria-pressed','true');
  await page.mouse.down({button:'right'});await page.mouse.up({button:'right'});
  await expect(root).toHaveAttribute('data-placed','1');
  await page.mouse.wheel(0,120);await expect(root).toHaveAttribute('data-slot','3');

  // Walk and jump: held keys move continuously, a short tap still jumps.
  for(let i=0;i<8;i++)await page.mouse.move(540,360-(i+1)*40);
  const x=await num(page,'x'),z=await num(page,'z');
  await page.keyboard.down('KeyD');await page.waitForTimeout(700);await page.keyboard.up('KeyD');
  await expect.poll(async()=>Math.hypot(await num(page,'x')-x,await num(page,'z')-z)).toBeGreaterThan(1);
  await expect(root).toHaveAttribute('data-grounded','true');const ground=await num(page,'y');
  await page.keyboard.press('Space');
  await expect.poll(()=>num(page,'y'),{timeout:3000}).toBeGreaterThan(ground+.5);

  // Escape releases the mouse and opens Study; the world and edits stay frozen.
  await page.keyboard.press('Escape');
  await expect(page.locator('#study-view')).toBeVisible();
  await expect(root).toHaveAttribute('data-phase','ready');
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:blockcraft')!).data);
  expect(saved).toMatchObject({version:1,mined:1,placed:1,slot:3});
  // Placing into the mined cell overwrites that cell's edit: [cx, cz, count, index, id...].
  expect(saved.edits.length).toBeGreaterThanOrEqual(5);expect(saved.edits).toContain(3);
  await page.keyboard.down('KeyW');await page.waitForTimeout(300);await page.keyboard.up('KeyW');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:blockcraft')!).data.z)).toBe(saved.z);
  await page.getByRole('link',{name:'Games',exact:true}).click();
  await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();

  // Pause halts input; reload restores position, counters and the edited world.
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  const paused=await data(page,'x');await page.keyboard.down('KeyA');await page.waitForTimeout(300);await page.keyboard.up('KeyA');
  expect(await data(page,'x')).toBe(paused);
  await page.reload();await ready(page);
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
  await expect(root).toHaveAttribute('data-mined','1');await expect(root).toHaveAttribute('data-placed','1');await expect(root).toHaveAttribute('data-slot','3');
  await expect(root).toHaveAttribute('data-view','7');
  expect(Math.abs(await num(page,'x')-saved.x)).toBeLessThan(.01);

  // Restart builds a fresh world; leaving releases the GL context and workers.
  await page.getByRole('button',{name:'Restart game',exact:true}).click();
  await expect(root).toHaveAttribute('data-mined','0');await ready(page);
  await page.evaluate(()=>{(window as unknown as {oldCanvas:HTMLCanvasElement}).oldCanvas=document.querySelector('.blockcraft canvas')!;});
  await page.getByRole('link',{name:'Back to game library'}).click();await expect(root).toHaveCount(0);
  expect(await page.evaluate(()=>(window as unknown as {oldCanvas:HTMLCanvasElement}).oldCanvas.getContext('webgl2')!.isContextLost())).toBe(true);
  await page.screenshot({path:'tests/games/blockcraft/evidence/library.png'});
  expect(errors).toEqual([]);
});

test('malformed saves are ignored and a fresh world starts',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('pocket-arcade:v1:save:blockcraft',JSON.stringify({version:1,data:{version:1,seed:5,x:'a',y:1,z:1,yaw:0,pitch:0,slot:0,mined:0,placed:0,view:1,edits:[0,0,1,99999999,1]}})));
  await page.goto('/#/game/blockcraft');await ready(page);
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-mined','0');
  expect(errors).toEqual([]);
});

test('touch: stick moves, drag looks, tap mines, long-press places, ▲ jumps',async({browser,browserName})=>{
  test.skip(browserName!=='chromium','CDP native touch uses Chromium.');
  test.setTimeout(60000);
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await context.addInitScript(()=>sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading'));
  const page=await context.newPage();const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/#/game/blockcraft');await ready(page);
  await expect(page.locator('.bc-copy')).toContainText('long-press');
  await page.getByRole('button',{name:'Play',exact:true}).tap();
  const root=page.locator('.blockcraft');await expect(root).toHaveAttribute('data-phase','playing');
  await expect(page.locator('.bc-touch')).toBeVisible();await expect(root).not.toHaveAttribute('data-locked','true');
  const cdp=await context.newCDPSession(page),canvas=(await page.locator('.blockcraft canvas').boundingBox())!;
  const touch=async(type:'touchStart'|'touchMove'|'touchEnd',points:{x:number;y:number;id?:number}[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(p=>({x:p.x,y:p.y,id:p.id??1}))});
  // Drag to look down.
  const cx=canvas.x+canvas.width*.7,cy=canvas.y+canvas.height*.3;
  await touch('touchStart',[{x:cx,y:cy}]);for(let i=1;i<=3;i++)await touch('touchMove',[{x:cx,y:cy+i*30}]);await touch('touchEnd',[]);
  await expect.poll(()=>data(page,'target')).not.toBe('');
  // Tap mines.
  await touch('touchStart',[{x:cx,y:cy}]);await touch('touchEnd',[]);
  await expect(root).toHaveAttribute('data-mined','1');
  // Long-press places the selected block.
  await page.getByRole('button',{name:'Planks, slot 5'}).tap();await expect(root).toHaveAttribute('data-slot','4');
  await touch('touchStart',[{x:cx,y:cy}]);await page.waitForTimeout(600);await touch('touchEnd',[]);
  await expect.poll(()=>num(page,'placed')).toBeGreaterThanOrEqual(1);
  // Stick: push up to walk forward.
  const stick=(await page.locator('.bc-stick').boundingBox())!,sx=stick.x+stick.width/2,sy=stick.y+stick.height/2;
  const x=await num(page,'x'),z=await num(page,'z');
  await touch('touchStart',[{x:sx,y:sy,id:2}]);await touch('touchMove',[{x:sx,y:sy-50,id:2}]);await page.waitForTimeout(800);await touch('touchEnd',[]);
  await expect.poll(async()=>Math.hypot(await num(page,'x')-x,await num(page,'z')-z)).toBeGreaterThan(.8);
  await expect(root).toHaveAttribute('data-grounded','true');const y=await num(page,'y');
  await page.getByRole('button',{name:'Jump'}).tap();
  await expect.poll(()=>num(page,'y'),{timeout:3000}).toBeGreaterThan(y+.4);
  await page.screenshot({path:'tests/games/blockcraft/evidence/touch-390.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);await context.close();
});

test('screenshot of the world at desktop size',async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/#/game/blockcraft');await ready(page);
  await expect.poll(()=>num(page,'meshes'),{timeout:20000}).toBeGreaterThan(60);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForTimeout(600);
  await page.screenshot({path:'tests/games/blockcraft/evidence/chromium.png'});
});

for(const mode of ['throws','fails to load'] as const)test(`terrain still generates when a worker ${mode}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(mode=>{
    const Real=window.Worker;
    window.Worker=(mode==='throws'
      ?class{constructor(){throw new Error('Workers blocked');}}
      :class extends Real{constructor(_url:string|URL,options?:WorkerOptions){super('/missing-blockcraft-worker.js',options);}}) as unknown as typeof Worker;
  },mode);
  await page.goto('/#/game/blockcraft');await ready(page);
  await expect.poll(()=>num(page,'meshes'),{timeout:20000}).toBeGreaterThan(20);
  expect(await num(page,'workers')).toBe(0);
  expect(errors).toEqual([]);
});
