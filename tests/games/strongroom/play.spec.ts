import {test,expect} from '../../fixtures';
import type {Page} from '@playwright/test';
const route='/?quality=potato&test&seed=42#/game/strongroom';
const ready=async(page:Page)=>{await page.goto(route);await expect(page.locator('.strongroom-game')).toHaveAttribute('data-ready','true',{timeout:120000});};
const start=async(page:Page)=>{await page.getByRole('button',{name:'Play vs bots',exact:true}).click();await page.getByRole('button',{name:'Start match',exact:true}).click();};
test('full-screen shared glass shell, remapping, scores and Escape to Study',async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width:1440,height:900});await ready(page);
 await expect(page.getByRole('button',{name:'Play vs bots',exact:true})).toBeVisible();
 expect(await page.locator('.strongroom-game>canvas').evaluate((el:HTMLCanvasElement)=>[el.width,el.height])).toEqual([864,540]);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('dialog',{name:'Strongroom settings'})).toBeVisible();await expect(page.getByRole('button',{name:'Remap Crouch'})).toHaveText('C');await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Strongroom settings'})).toBeHidden();await expect(page.locator('#study-view')).toBeHidden();
 await start(page);await expect.poll(()=>page.evaluate(()=>(window as any).__game.state.phase),{timeout:15000}).toBe('action');
 await page.keyboard.down('Tab');await expect(page.getByRole('dialog',{name:'Scoreboard'})).toBeVisible();await expect(page.getByRole('dialog',{name:'Scoreboard'})).toContainText('Bot 5');await page.keyboard.up('Tab');await expect(page.getByRole('dialog',{name:'Scoreboard'})).toBeHidden();
 await page.keyboard.press('p');await expect(page.getByRole('dialog',{name:'Strongroom menu'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Strongroom menu'})).toBeHidden();
 await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();const t=await page.evaluate(()=>(window as any).__game.state.timer);await page.waitForTimeout(300);expect(await page.evaluate(()=>(window as any).__game.state.timer)).toBe(t);
 await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();await expect(page.locator('#study-view')).toBeHidden();await expect(page.getByRole('button',{name:'Click to play',exact:true})).toBeVisible();
});
test('ten mount/unmount cycles lose their WebGL contexts and remove hooks/listeners',async({page})=>{
 test.setTimeout(300000);await page.addInitScript(()=>{const active=new Set<HTMLCanvasElement>(),original=HTMLCanvasElement.prototype.getContext;(window as any).__contexts=active;(HTMLCanvasElement.prototype as any).getContext=function(type:string,...args:any[]){const value=(original as any).call(this,type,...args);if(value&&/webgl/.test(type)&&!active.has(this)){active.add(this);this.addEventListener('webglcontextlost',()=>active.delete(this));}return value;};});
 for(let n=0;n<10;n++){await ready(page);await page.locator('.game-dock').getByRole('link',{name:'Games',exact:true}).click();await expect(page.locator('.strongroom-game')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>(window as any).__contexts.size)).toBe(0);expect(await page.evaluate(()=>(window as any).__game)).toBeUndefined();}
});
