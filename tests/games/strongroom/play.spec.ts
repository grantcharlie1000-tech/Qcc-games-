import {test,expect} from '../../fixtures';
import type {Page} from '@playwright/test';
const route='/?quality=potato&test&seed=42#/game/strongroom';
const ready=async(page:Page)=>{await page.goto(route);await expect(page.locator('.strongroom-game')).toHaveAttribute('data-ready','true',{timeout:120000});};
const start=async(page:Page)=>{await page.getByRole('button',{name:'Play vs bots',exact:true}).click();await page.getByRole('button',{name:'Start match',exact:true}).click();};
test('returning from a guest seat starts solo with a fresh human seat and controls',async({page})=>{
 test.setTimeout(120000);await ready(page);await start(page);await page.evaluate(()=>{const g=(window as any).__game;g.net.hooks.state(g.state,3);g.input.setVirtualAction('crouch',true);});
 await page.evaluate(()=>(window as any).__game.instance.openMenu());await page.getByRole('button',{name:'Leave match',exact:true}).click();await start(page);expect(await page.evaluate(()=>(window as any).__game.localSeat)).toBe(0);expect(await page.evaluate(()=>(window as any).__game.player.bot)).toBe(false);expect(await page.evaluate(()=>(window as any).__game.player.crouch)).toBe(false);
});
test('full-screen shared glass shell, remapping, scores and Escape to Study',async({page})=>{
 test.setTimeout(180000);await page.setViewportSize({width:1440,height:900});await ready(page);
 await expect(page.getByRole('button',{name:'Play vs bots',exact:true})).toBeVisible();
 expect(await page.locator('.strongroom-game>canvas').evaluate((el:HTMLCanvasElement)=>[el.width,el.height])).toEqual([864,540]);
 await page.getByRole('button',{name:'Settings',exact:true}).click();await expect(page.getByRole('dialog',{name:'Strongroom settings'})).toBeVisible();expect((await page.getByRole('button',{name:'Close Strongroom settings',exact:true}).boundingBox())!.width).toBeLessThanOrEqual(52);await expect(page.getByRole('button',{name:'Remap Crouch'})).toHaveText('C');await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Strongroom settings'})).toBeHidden();await expect(page.locator('#study-view')).toBeHidden();
 await start(page);await expect.poll(()=>page.evaluate(()=>(window as any).__game.state.phase),{timeout:15000}).toBe('action');
 await page.keyboard.down('Tab');await expect(page.getByRole('dialog',{name:'Scoreboard'})).toBeVisible();await expect(page.getByRole('dialog',{name:'Scoreboard'})).toContainText('Bot 5');await page.keyboard.up('Tab');await expect(page.getByRole('dialog',{name:'Scoreboard'})).toBeHidden();
 await page.keyboard.press('p');await expect(page.getByRole('dialog',{name:'Strongroom menu'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByRole('dialog',{name:'Strongroom menu'})).toBeHidden();
 await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();const t=await page.evaluate(()=>(window as any).__game.state.timer);await page.waitForTimeout(300);expect(await page.evaluate(()=>(window as any).__game.state.timer)).toBe(t);
 await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();await expect(page.locator('#study-view')).toBeHidden();await expect(page.getByRole('button',{name:'Click to play',exact:true})).toBeVisible();await page.getByRole('button',{name:'Click to play',exact:true}).click({timeout:5000});await expect.poll(()=>page.evaluate(()=>(window as any).__game.input.locked)).toBe(true);
});
test('ten mount/unmount cycles lose their WebGL contexts and remove hooks/listeners',async({page})=>{
 test.setTimeout(300000);await page.addInitScript(()=>{const active=new Set<HTMLCanvasElement>(),original=HTMLCanvasElement.prototype.getContext;(window as any).__contexts=active;(HTMLCanvasElement.prototype as any).getContext=function(type:string,...args:any[]){const value=(original as any).call(this,type,...args);if(value&&/webgl/.test(type)&&!active.has(this)){active.add(this);this.addEventListener('webglcontextlost',()=>active.delete(this));}return value;};});
 for(let n=0;n<10;n++){await ready(page);await expect(page.locator('.strongroom-game')).toHaveAttribute('data-models','true',{timeout:60000});await start(page);await page.waitForTimeout(100);await page.locator('.game-dock').getByRole('link',{name:'Games',exact:true}).click();await expect(page.locator('.strongroom-game')).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>(window as any).__contexts.size)).toBe(0);expect(await page.evaluate(()=>(window as any).__game)).toBeUndefined();}
});
test('the original skinned character actually submits its visible geometry to WebGL',async({page})=>{
 test.setTimeout(180000);await ready(page);await expect(page.locator('.strongroom-game')).toHaveAttribute('data-models','true',{timeout:60000});await start(page);
 await page.evaluate(()=>{const g=(window as any).__game;g.state.paused=true;const local=g.state.entities[0],other=g.state.entities[1];g.state.entities=[local,other];local.yaw=0;local.pitch=0;Object.assign(other,{x:local.x,y:local.y,z:local.z-3,yaw:Math.PI,hp:100,bot:false});});
 await expect.poll(()=>page.evaluate(()=>{const g=(window as any).__game,a=g.view.avatars.get(1);if(!a)return null;for(const child of g.view.scene.children)if(child!==g.view.camera&&child!==a.root)child.visible=false;let triangles=0;a.root.traverse((mesh:any)=>{let visible=true;for(let p=mesh;p;p=p.parent)visible=visible&&p.visible;if(visible&&mesh.geometry)triangles+=(mesh.geometry.index?.count??mesh.geometry.attributes.position.count)/3;});return triangles>0&&g.renderer.info.render.triangles>=triangles;}),{timeout:7000}).toBe(true);
});
