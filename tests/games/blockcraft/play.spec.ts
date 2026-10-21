import {test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';
import {blockId} from '../../../src/games/blockcraft/data/blocks';

// Engine smoke tests: boot, controls, screens, modes, Study, persistence and disposal.
// Feature specs live beside this file (one per feature area).
const data=(page:Page,key:string)=>page.locator('.blockcraft').getAttribute(`data-${key}`);
const num=async(page:Page,key:string)=>Number(await data(page,key));
async function ready(page:Page){await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:30000});}

test('boots, plays, opens the inventory, switches mode, pauses for Study and restores',async({page})=>{
  test.setTimeout(90000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1280,height:720});
  await page.goto('/#/game/blockcraft');await ready(page);
  const root=page.locator('.blockcraft');
  expect(await num(page,'workers')).toBeGreaterThan(0);
  await expect.poll(()=>num(page,'meshes'),{timeout:30000}).toBeGreaterThan(40);
  await page.getByRole('button',{name:'Game mode'}).click();await expect(root).toHaveAttribute('data-mode','creative');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(root).toHaveAttribute('data-phase','playing');await expect(root).toHaveAttribute('data-locked','true');
  // Look down, mine instantly in creative, place a block back.
  for(let i=0;i<6;i++)await page.mouse.move(640,360+(i+1)*40);
  await expect.poll(()=>data(page,'target')).not.toBe('');
  await page.mouse.down();await page.waitForTimeout(120);await page.mouse.up();
  await expect.poll(()=>num(page,'mined')).toBeGreaterThan(0);
  // With that block gone, look further down until another block is in reach, then place. data-target can lag a
  // frame behind the mined block, so retry the click (placement has a 0.25 s cooldown).
  for(let i=0;i<12&&await num(page,'placed')===0;i++){
    if(!(await data(page,'target')))await page.mouse.move(640,600+i*20);
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
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:blockcraft')!).data);
  expect(saved).toMatchObject({version:2,settings:{mode:'creative'}});expect(saved.edits.length).toBeGreaterThanOrEqual(5);
  await page.getByRole('link',{name:'Games',exact:true}).click();
  await expect(page.getByRole('button',{name:'Resume',exact:true})).toBeVisible();
  await page.reload();await ready(page);
  await expect(root).toHaveAttribute('data-mode','creative');
  expect(Math.abs(await num(page,'x')-saved.systems.player.x)).toBeLessThan(.01);
  await page.evaluate(()=>{(window as unknown as {oldCanvas:HTMLCanvasElement}).oldCanvas=document.querySelector('.blockcraft canvas')!;});
  await page.getByRole('link',{name:'Back to game library'}).click();await expect(root).toHaveCount(0);
  expect(await page.evaluate(()=>(window as unknown as {oldCanvas:HTMLCanvasElement}).oldCanvas.getContext('webgl2')!.isContextLost())).toBe(true);
  expect(errors).toEqual([]);
});

test('survival mining takes time and drops the block',async({page})=>{
  test.setTimeout(60000);
  await page.goto('/#/game/blockcraft');await ready(page);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  for(let i=0;i<8;i++)await page.mouse.move(640,360+(i+1)*40);
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

for(const mode of ['throws','fails to load'] as const)test(`terrain still generates when a worker ${mode}`,async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(mode=>{
    const Real=window.Worker;
    window.Worker=(mode==='throws'
      ?class{constructor(){throw new Error('Workers blocked');}}
      :class extends Real{constructor(_url:string|URL,options?:WorkerOptions){super('/missing-blockcraft-worker.js',options);}}) as unknown as typeof Worker;
  },mode);
  await page.goto('/#/game/blockcraft');await ready(page);
  await expect.poll(()=>num(page,'meshes'),{timeout:30000}).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('screenshot of the world at desktop size',async({page})=>{
  await page.setViewportSize({width:1366,height:768});
  await page.goto('/#/game/blockcraft');await ready(page);
  await expect.poll(()=>num(page,'meshes'),{timeout:30000}).toBeGreaterThan(60);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.waitForTimeout(800);
  await page.screenshot({path:'tests/games/blockcraft/evidence/chromium.png'});
});
