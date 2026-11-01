import {test,expect} from '../../fixtures';
for(const device of [{width:844,height:390,scale:3},{width:667,height:375,scale:2}])test(`outline touch controls and sharp DOM at ${device.width}`,async({browser})=>{
 test.setTimeout(180000);const context=await browser.newContext({viewport:{width:device.width,height:device.height},deviceScaleFactor:device.scale,isMobile:true,hasTouch:true});const {seedStudyTopic}=await import('../../fixtures');await seedStudyTopic(context);const page=await context.newPage();
 try{await page.goto('/?quality=potato&test#/game/strongroom');await expect(page.locator('.strongroom-game')).toHaveAttribute('data-ready','true',{timeout:120000});await page.getByRole('button',{name:'Play vs bots',exact:true}).click();await page.getByRole('button',{name:'Start match',exact:true}).click();await expect(page.getByRole('button',{name:'Fire',exact:true})).toBeVisible();
 for(const name of ['Move','Fire','Reload','Crouch','Aim','Jump']){const box=await page.getByRole('button',{name,exact:true}).boundingBox();expect(box).toBeTruthy();expect(box!.width).toBeGreaterThanOrEqual(44);expect(box!.height).toBeGreaterThanOrEqual(44);expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(device.width);expect(box!.y+box!.height).toBeLessThanOrEqual(device.height);}
 const size=await page.locator('.strongroom-game>canvas').evaluate((el:HTMLCanvasElement)=>[el.width,el.height]);expect(size).toEqual([Math.floor(device.width*.6),Math.floor(device.height*.6)]);
 }finally{await context.close();}
});
