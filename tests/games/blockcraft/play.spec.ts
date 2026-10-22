import {test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';
import {blockId} from '../../../src/games/blockcraft/data/blocks';
import {countLockErrors,evidencePath,lockless,look,useLockFallback} from './helpers/browser';

// Engine smoke tests: boot, controls, screens, modes, Study, persistence and disposal.
// Feature specs live beside this file (one per feature area).
const data=(page:Page,key:string)=>page.locator('.blockcraft').getAttribute(`data-${key}`);
const num=async(page:Page,key:string)=>Number(await data(page,key));
async function ready(page:Page){await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:30000});}
const SAVE='pocket-arcade:v1:save:blockcraft';
type Saved={version:number;seed:number;edits:unknown[]};
const saved=(page:Page)=>page.evaluate(k=>(JSON.parse(localStorage.getItem(k)??'null') as {data:Saved}|null)?.data??null,SAVE);

test('boots, plays, opens the inventory, switches mode, pauses for Study and restores',async({page,browserName})=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1280,height:720});
  const locks=!lockless(browserName);await countLockErrors(page);
  await page.goto('/#/game/blockcraft');await ready(page);
  const root=page.locator('.blockcraft');
  expect(await num(page,'workers')).toBeGreaterThan(0);
  await expect.poll(()=>num(page,'meshes'),{timeout:30000}).toBeGreaterThan(40);
  await page.getByRole('button',{name:'Game mode'}).click();await expect(root).toHaveAttribute('data-mode','creative');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(root).toHaveAttribute('data-phase','playing');
  // Without pointer lock (headless WebKit) the same steps run on the drag-to-look and click fallback.
  if(locks)await expect(root).toHaveAttribute('data-locked','true');else await useLockFallback(page,640,360);
  // Look down, mine instantly in creative, place a block back.
  await look(page,locks,{x:640,y:360},0,240);
  await expect.poll(()=>data(page,'target')).not.toBe('');
  await page.mouse.down();await page.waitForTimeout(120);await page.mouse.up();
  await expect.poll(()=>num(page,'mined')).toBeGreaterThan(0);
  // With that block gone, look further down until another block is in reach, then place. data-target can lag a
  // frame behind the mined block, so retry the click (placement has a 0.25 s cooldown).
  for(let i=0;i<12&&await num(page,'placed')===0;i++){
    if(!(await data(page,'target')))await look(page,locks,locks?{x:640,y:580+i*20}:{x:640,y:360},0,20,1);
    await page.mouse.down({button:'right'});await page.waitForTimeout(80);await page.mouse.up({button:'right'});
    await page.waitForTimeout(300);
  }
  await expect.poll(()=>num(page,'placed')).toBeGreaterThan(0);
  await page.keyboard.press('Digit3');await expect(root).toHaveAttribute('data-slot','2');
  // Walk.
  const x=await num(page,'x'),z=await num(page,'z');
  await page.keyboard.down('KeyD');await page.waitForTimeout(600);await page.keyboard.up('KeyD');
  await expect.poll(async()=>Math.hypot(await num(page,'x')-x,await num(page,'z')-z)).toBeGreaterThan(.3);
  // Inventory screen releases the mouse without pausing; E closes it again.
  await page.keyboard.press('KeyE');await expect(root).toHaveAttribute('data-phase','screen');
  await expect(page.locator('.bc-screen')).toBeVisible();
  await page.keyboard.press('KeyE');await expect(root).toHaveAttribute('data-phase','playing');
  // Escape opens Study and pauses with a saved snapshot.
  await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
  await expect(root).toHaveAttribute('data-phase','paused');
  const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:blockcraft')!).data);
  expect(snapshot).toMatchObject({version:2,settings:{mode:'creative'}});expect(snapshot.edits.length).toBeGreaterThanOrEqual(1);
  // Back to the game: that click resumes play at once (no second Resume on Blockcraft's Game Menu).
  await page.getByRole('link',{name:'Games',exact:true}).click();
  await expect(root).toHaveAttribute('data-phase','playing');await expect(page.locator('.bc-menu')).toBeHidden();
  // Resume can legitimately advance residual movement. Freeze and capture the save
  // actually being restored, rather than comparing with the earlier Study snapshot.
  await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
  await expect(root).toHaveAttribute('data-phase','paused');
  const reloadSnapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:blockcraft')!).data);
  await page.reload();await ready(page);
  await expect(root).toHaveAttribute('data-mode','creative');
  expect(Math.abs(await num(page,'x')-reloadSnapshot.systems.player.x)).toBeLessThan(.01);
  await page.evaluate(()=>{(window as unknown as {oldCanvas:HTMLCanvasElement}).oldCanvas=document.querySelector('.blockcraft canvas')!;});
  await page.getByRole('link',{name:'Back to game library'}).click();await expect(root).toHaveCount(0);
  expect(await page.evaluate(()=>(window as unknown as {oldCanvas:HTMLCanvasElement}).oldCanvas.getContext('webgl2')!.isContextLost())).toBe(true);
  expect(errors).toEqual([]);
});

test('survival mining takes time and drops the block',async({page,browserName})=>{
  test.setTimeout(60000);
  const locks=!lockless(browserName);await countLockErrors(page);
  await page.goto('/#/game/blockcraft');await ready(page);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  // Without pointer lock a still press is held as mining (hold-to-mine), the path a player without the lock takes.
  if(!locks)await useLockFallback(page,640,360);
  await look(page,locks,{x:640,y:360},0,320,8);
  await expect.poll(()=>data(page,'target')).not.toBe('');
  // Real terrain often puts short grass (instant to break) under the crosshair: make the target dirt (0.75 s by hand).
  const at=(await data(page,'target'))!;
  const dirt=blockId('dirt');
  await page.evaluate(([x,y,z,id])=>{const g=(window as unknown as {blockcraft:{world:{set(x:number,y:number,z:number,id:number):boolean}}}).blockcraft;
    g.world.set(x,y,z,id);},[...at.split(',').map(Number),dirt]);
  await expect.poll(()=>page.evaluate(([x,y,z])=>(window as unknown as {blockcraft:{world:{get(x:number,y:number,z:number):number}}}).blockcraft.world.get(x,y,z),at.split(',').map(Number))).toBe(dirt);
  await page.mouse.down();await page.waitForTimeout(200);
  expect(await num(page,'mined')).toBe(0);
  await expect.poll(()=>num(page,'mined'),{timeout:8000}).toBe(1);await page.mouse.up();
});

test('malformed saves are ignored and a fresh world starts',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('pocket-arcade:v1:save:blockcraft',JSON.stringify({version:1,data:{version:2,seed:5,edits:[0,0,1,99999999,1],systems:{player:{x:'a'}}}})));
  await page.goto('/#/game/blockcraft');await ready(page);
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test('a world saved on the death screen loads back onto it, without a second death',async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const deaths=()=>page.evaluate(()=>(window as unknown as {blockcraft:{stats:{deaths:number}}}).blockcraft.stats.deaths);
  await page.goto('/#/game/blockcraft');await ready(page);
  const root=page.locator('.blockcraft');
  await page.getByRole('button',{name:'Play',exact:true}).click();await expect(root).toHaveAttribute('data-phase','playing');
  await page.evaluate(()=>(window as unknown as {blockcraft:{survival:{kill(m:string):void}}}).blockcraft.survival.kill('You fell from a high place'));
  await expect(root).toHaveAttribute('data-phase','dead');expect(await deaths()).toBe(1);
  // The shell saves every 5 seconds.
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:blockcraft')??'null')?.data?.systems?.survival?.dead===true),
    {timeout:15000}).toBe(true);
  await page.reload();await ready(page);
  await expect(root).toHaveAttribute('data-phase','dead');
  await expect(page.getByRole('heading',{name:'You died!'})).toBeVisible();
  await expect(page.locator('.bc-menu')).toContainText('You fell from a high place');
  expect(await num(page,'health')).toBe(0);expect(await deaths()).toBe(1);
  await page.getByRole('button',{name:'Respawn'}).click();
  await expect.poll(()=>data(page,'phase'),{timeout:20000}).not.toBe('dead');
  await expect.poll(()=>num(page,'health')).toBe(20);
  expect(errors).toEqual([]);
});

for(const mode of ['throws','fails to load'] as const)test(`terrain still generates when a worker ${mode}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(mode=>{
    const Real=window.Worker;
    window.Worker=(mode==='throws'
      ?class{constructor(){throw new Error('Workers blocked');}}
      :class extends Real{constructor(_url:string|URL,options?:WorkerOptions){super('/missing-blockcraft-worker.js',options);}}) as unknown as typeof Worker;
  },mode);
  // A static host answers a missing file with 404. (Vite's dev server sends index.html instead, which WebKit parses as the
  // worker script and reports as a page error, "Unexpected token '<'", that no page code can catch.)
  if(mode==='fails to load')await page.route('**/missing-blockcraft-worker.js',r=>r.fulfill({status:404,contentType:'text/html',body:'Not found'}));
  await page.goto('/#/game/blockcraft');await ready(page);
  await expect.poll(()=>num(page,'meshes'),{timeout:30000}).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('without WebGL 2 the saved world is kept, not replaced by the fallback screen',async({page})=>{
  test.setTimeout(60000);
  const world={version:2,seed:5352222,settings:{mode:'creative'},edits:[0,0,1,100,1],systems:{}};
  await page.addInitScript(([key,data])=>{
    localStorage.setItem(key as string,JSON.stringify({version:1,data}));
    const real=HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...rest:unknown[]){
      return type==='webgl2'?null:(real as (...a:unknown[])=>unknown).call(this,type,...rest);
    } as typeof real;
  },[SAVE,world] as const);
  await page.goto('/#/game/blockcraft');
  await expect(page.getByRole('heading',{name:'3D graphics unavailable'})).toBeVisible();
  // Past the shell's 5 s autosave, then a pause and leaving, which save again.
  await page.waitForTimeout(6000);
  await page.getByRole('button',{name:'Pause game'}).click();
  await page.getByRole('link',{name:'Back to game library'}).click();
  await expect(page.locator('.bc-fallback')).toHaveCount(0);
  expect(await saved(page)).toEqual(world);
});

test.describe('shell buttons on a landscape phone',()=>{
  test.use({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
  test('Keep playing resumes at once; Restart asks before it replaces the world',async({page})=>{
    test.setTimeout(120000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/#/game/blockcraft');await ready(page);
    const root=page.locator('.blockcraft');
    const seed=()=>page.evaluate(()=>(window as unknown as {blockcraft:{seed:number}}).blockcraft.seed);
    await page.getByRole('button',{name:'Play',exact:true}).tap();await expect(root).toHaveAttribute('data-phase','playing');
    // One tap on the shell's Keep playing is enough: Blockcraft's own Game Menu does not wait behind it.
    await page.getByRole('button',{name:'Pause game'}).tap();await expect(root).toHaveAttribute('data-phase','paused');
    await page.getByRole('button',{name:'Keep playing'}).tap();
    await expect(root).toHaveAttribute('data-phase','playing');await expect(page.locator('.bc-menu')).toBeHidden();
    // An edit to keep, saved by the next pause.
    const stone=blockId('stone');
    const at=await page.evaluate(id=>{
      const g=(window as unknown as {blockcraft:{player:{state:{x:number;y:number;z:number}};world:{set(x:number,y:number,z:number,id:number):boolean}}}).blockcraft;
      const p=g.player.state,x=Math.floor(p.x)+2,y=Math.floor(p.y)+3,z=Math.floor(p.z);g.world.set(x,y,z,id);return{x,y,z};
    },stone);
    const before=await seed();
    await page.getByRole('button',{name:'Pause game'}).tap();
    const kept=(await saved(page))!;expect(kept.seed).toBe(before);expect(kept.edits.length).toBeGreaterThan(0);
    await page.getByRole('button',{name:'Keep playing'}).tap();await expect(root).toHaveAttribute('data-phase','playing');
    // Restart asks first; the world and its save stay as they were until Create New World.
    await page.getByRole('button',{name:'Restart game'}).tap();
    await expect(page.getByRole('heading',{name:'Create a new world?'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Cancel'})).toBeFocused();
    expect(await root.getAttribute('data-phase')).toBe('paused');
    // (World ticks may have added edits of their own since: the kept ones are still there.)
    const asked=(await saved(page))!;
    expect(await seed()).toBe(before);expect(asked.seed).toBe(before);expect(asked.edits.length).toBeGreaterThanOrEqual(kept.edits.length);
    await page.getByRole('button',{name:'Cancel'}).tap();
    await expect(page.getByRole('heading',{name:'Game Menu'})).toBeVisible();
    await page.getByRole('button',{name:'Resume',exact:true}).tap();await expect(root).toHaveAttribute('data-phase','playing');
    expect(await page.evaluate(p=>(window as unknown as {blockcraft:{world:{get(x:number,y:number,z:number):number}}}).blockcraft.world.get(p.x,p.y,p.z),at)).toBe(stone);
    await page.getByRole('button',{name:'Restart game'}).tap();
    await page.getByRole('button',{name:'Create New World'}).tap();
    await expect.poll(seed).not.toBe(before);
    await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
    const fresh=(await saved(page))!;expect(fresh.seed).toBe(await seed());expect(fresh.edits).toEqual([]);
    // Restart while a new world still loads (both in one task, so the world cannot finish first): the question stays
    // when the world is ready behind it, and Cancel goes back to the start menu.
    const loading=await page.evaluate(()=>{
      const g=(window as unknown as {blockcraft:{newWorld():void;spawning:boolean}}).blockcraft;
      g.newWorld();document.querySelector<HTMLButtonElement>('#restart-game')!.click();return g.spawning;
    });
    expect(loading).toBe(true);
    await expect(page.getByRole('heading',{name:'Create a new world?'})).toBeVisible();
    await ready(page);await page.waitForTimeout(300);
    await expect(page.getByRole('heading',{name:'Create a new world?'})).toBeVisible();
    await expect(page.getByRole('button',{name:'Cancel'})).toBeFocused();
    await page.getByRole('button',{name:'Cancel'}).tap();
    await expect(page.getByRole('button',{name:'Play',exact:true})).toBeEnabled();
    expect(await root.getAttribute('data-phase')).toBe('ready');
    expect(errors).toEqual([]);
  });
});

test('screenshot of the world at desktop size',async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/#/game/blockcraft');await ready(page);
  await expect.poll(()=>num(page,'meshes'),{timeout:30000}).toBeGreaterThan(60);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForTimeout(800);
  await page.screenshot({path:evidencePath('chromium.png')});
});
