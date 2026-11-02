import {test,expect,type Page} from '../../fixtures';
async function beginAction(page:Page){
 await expect.poll(()=>page.evaluate(()=>(window as any).__game.state.phase)).toBe('pick');
 expect(await page.evaluate(()=>{const g=(window as any).__game;return g.state.requestPick(g.localSeat,{locked:true});})).toBe(true);
 await expect.poll(()=>page.evaluate(()=>(window as any).__game.state.phase)).toBe('prep');
 await page.evaluate(()=>(window as any).__game.state.timer=.01);await expect.poll(()=>page.evaluate(()=>(window as any).__game.state.phase),{timeout:15000}).toBe('action');
}
for(const device of [{width:844,height:390,scale:3},{width:667,height:375,scale:2}])test(`outline touch controls and sharp DOM at ${device.width}`,async({browser})=>{
 test.setTimeout(180000);const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:device.scale,isMobile:true,hasTouch:true});const {seedStudyTopic}=await import('../../fixtures');await seedStudyTopic(context);const page=await context.newPage();
 try{await page.goto('/?quality=potato&test#/game/strongroom');await expect(page.locator('.strongroom-game')).toHaveAttribute('data-ready','true',{timeout:120000});await page.getByRole('button',{name:'Play vs bots',exact:true}).click();await page.getByRole('button',{name:'Start match',exact:true}).click();await beginAction(page);await expect(page.getByRole('button',{name:'Fire',exact:true})).toBeVisible();
 for(const name of ['Move','Fire','Reload','Crouch','Aim','Jump']){const box=await page.getByRole('button',{name,exact:true}).boundingBox();expect(box).toBeTruthy();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(device.width);expect(box!.y+box!.height).toBeLessThanOrEqual(device.height);}
 const size=await page.locator('.strongroom-game>canvas').evaluate((el:HTMLCanvasElement)=>[el.width,el.height]);expect(size).toEqual([Math.floor(device.width*.6),Math.floor(device.height*.6)]);
 expect(await page.evaluate(()=>(window as any).__game.settings.setMode('crouch','hold'))).toBe(true);
 const crouch=page.getByRole('button',{name:'Crouch',exact:true}),box=(await crouch.boundingBox())!;
 // A held browser pointer exercises pointerdown/up independently, catching click-only pulses.
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 try{await expect.poll(()=>page.evaluate(()=>(window as any).__game.player.crouch)).toBe(true);await expect(crouch).toHaveAttribute('aria-pressed','true');}finally{await page.mouse.up();}
 await expect.poll(()=>page.evaluate(()=>(window as any).__game.player.crouch)).toBe(false);await expect(crouch).toHaveAttribute('aria-pressed','false');
 await page.setViewportSize({width:390,height:844});await expect(page.locator('.sr-orientation')).toBeVisible();await expect(page.locator('.sr-orientation')).toHaveCSS('opacity','1');await expect(page.locator('.sr-orientation')).toContainText('Turn your phone sideways');
 }finally{await context.close();}
});
