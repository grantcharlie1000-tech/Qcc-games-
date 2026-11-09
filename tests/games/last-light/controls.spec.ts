import {test,expect} from '../../fixtures';
import {createRun,serialize} from '../../../src/games/last-light/model';
const URL='/#/game/last-light';
for(const [width,height] of [[1896,900],[1280,800],[844,390],[390,844],[320,568]])test(`one glass HUD row at ${width}×${height}`,async({page})=>{
 await page.setViewportSize({width,height});await page.goto(URL);await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();await page.keyboard.press('Enter');await expect(page.locator('.ll-overlay')).toBeHidden();
 const box=await page.evaluate(()=>{const dock=document.querySelector('.game-dock')!.getBoundingClientRect(),canvas=document.querySelector('.ll-canvas')!.getBoundingClientRect(),hud=document.querySelector('.ll-hud')!.getBoundingClientRect(),glass=document.querySelector('.game-hud')!.getBoundingClientRect();return {top:canvas.top,dockBottom:dock.bottom,dockHeight:dock.height,hudTop:hud.top,hudBottom:hud.bottom,glassTop:glass.top,glassBottom:glass.bottom,overflow:document.documentElement.scrollWidth>innerWidth};});
 expect(box.top).toBeLessThanOrEqual(64);expect(box.dockHeight).toBeLessThanOrEqual(48);expect(box.hudTop).toBeGreaterThanOrEqual(box.glassTop);expect(box.hudBottom).toBeLessThanOrEqual(box.glassBottom);expect(box.overflow).toBe(false);
 await expect(page.getByRole('button',{name:'Map',exact:true})).toHaveCount(0);await expect(page.locator('.ll-map')).toHaveCount(0);
});
test('arrows and adjacent keys control movement, optional interaction, retry and menus',async({page})=>{
 await page.goto(URL);await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Find your footing.'})).toBeVisible();await page.keyboard.press('Enter');await page.keyboard.press('Enter');await expect(page.locator('.ll-overlay')).toBeHidden();
 await page.keyboard.down('ArrowRight');await expect.poll(async()=>Number(await page.locator('.ll-game').getAttribute('data-x'))).toBeGreaterThan(118);await page.keyboard.up('ArrowRight');await page.keyboard.press('Enter');await expect(page.locator('.ll-dialogue')).toBeVisible();
 await page.keyboard.press('ArrowRight');await page.keyboard.down('ArrowUp');await expect.poll(async()=>Number(await page.locator('.ll-game').getAttribute('data-y'))).toBeLessThan(390);await page.keyboard.up('ArrowUp');await page.keyboard.press('ShiftRight');await expect(page.locator('.ll-game')).toHaveAttribute('data-dash','false');
 await page.keyboard.press('Delete');await expect(page.locator('.ll-game')).toHaveAttribute('data-overlay','menu');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(page.locator('.ll-journal')).toBeVisible();await page.keyboard.press('PageDown');await expect(page.locator('.ll-game')).toHaveAttribute('data-overlay','menu');await page.keyboard.press('Delete');await page.keyboard.press('End');await expect(page.locator('.ll-deaths')).toHaveText('1');
});
test('death has a visible impact and finishes at the checkpoint',async({page})=>{
 await page.goto(URL);await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();await page.keyboard.press('Enter');await page.keyboard.down('ArrowRight');await expect(page.locator('.ll-game')).toHaveAttribute('data-death','true',{timeout:10000});await page.keyboard.up('ArrowRight');await expect(page.locator('.ll-deaths')).toHaveText('1');await expect(page.locator('.ll-game')).toHaveAttribute('data-death','false');await expect(page.locator('.ll-notice')).toContainText('Level start');
});
test('residents and scenery remain visible at close range',async({page})=>{
 await page.goto(URL);
 const result=await page.evaluate(async()=>{
  const levelPath='/src/games/last-light/levels.ts',modelPath='/src/games/last-light/model.ts',worldPath='/src/games/last-light/world.ts';
  const [{LEVELS},{createRun},{drawLife,worldDressing}]=await Promise.all([import(levelPath),import(modelPath),import(worldPath)]);
  const samples=[];const kinds=new Set();
  for(const l of LEVELS)for(const item of worldDressing(l)){
   if(kinds.has(item.kind)||!['resident','tree','washing'].includes(item.kind))continue;kinds.add(item.kind);
   const canvas=document.createElement('canvas');canvas.width=item.bounds.w+40;canvas.height=item.bounds.h+40;const c=canvas.getContext('2d')!,s=createRun();s.stage=l.id;s.y=item.y-24;s.clock=0;
   const draw=(x:number)=>{s.x=x;c.clearRect(0,0,canvas.width,canvas.height);c.save();c.translate(20-item.bounds.x,20-item.bounds.y);drawLife(c,l,s,item.bounds.x-20,item.bounds.y-20,canvas.width,canvas.height,true);c.restore();const pixels=c.getImageData(20,20,item.bounds.w,item.bounds.h).data;let opaque=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]>40)opaque++;return opaque;};samples.push({kind:item.kind,far:draw(item.x-200),near:draw(item.x-8)});
  }return samples;
 });
 expect(result.length).toBe(3);for(const sample of result)expect(sample.near,sample.kind).toBeGreaterThanOrEqual(sample.far*.95);
});
test('escape lead also fits inside the single glass row on a small phone',async({page})=>{
 await page.setViewportSize({width:320,height:568});const run=createRun();run.stage=35;run.cleared=35;run.best=35000;await page.addInitScript(data=>localStorage.setItem('pocket-arcade:v1:save:last-light',JSON.stringify({version:1,data,updated:1})),serialize(run));await page.goto(URL);await expect(page.getByRole('button',{name:'Continue →',exact:true})).toBeVisible();await page.keyboard.press('Enter');await expect(page.locator('.ll-task-progress')).toBeVisible();
 const row=await page.evaluate(()=>{const parent=document.querySelector('.game-hud')!.getBoundingClientRect(),lead=document.querySelector('.ll-task-progress')!.getBoundingClientRect();return {right:lead.right,limit:parent.right,top:lead.top,bottom:lead.bottom,pTop:parent.top,pBottom:parent.bottom};});expect(row.right).toBeLessThanOrEqual(row.limit);expect(row.top).toBeGreaterThanOrEqual(row.pTop);expect(row.bottom).toBeLessThanOrEqual(row.pBottom);
});
