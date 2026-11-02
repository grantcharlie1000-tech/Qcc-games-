import {test,expect} from '../../fixtures';

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`tap tower fills available space at ${viewport.width}×${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/#/game/tower');await expect(page.locator('.tower-canvas')).toBeVisible();
 await expect(page.locator('.tower-drop,.tower-footer')).toHaveCount(0);await expect(page.locator('.game-dock')).toHaveCount(1);
 const measure=()=>page.evaluate(()=>{const b=document.querySelector('.tower-viewport')!.getBoundingClientRect(),c=document.querySelector('.tower-canvas')!.getBoundingClientRect(),s=document.querySelector('.stage-wrap')!.getBoundingClientRect(),d=document.querySelector('.game-dock')!.getBoundingClientRect();return{width:b.width,height:b.height,ratio:c.width/c.height,y:b.y,bottom:b.bottom,stageWidth:s.width,stageHeight:s.height,stageY:s.y,dockY:d.y,overflow:document.documentElement.scrollWidth>innerWidth};});
 await expect.poll(async()=>{const b=await measure();return Math.min(b.stageWidth-b.width,b.stageHeight-b.height);}).toBeLessThan(1);
 const b=await measure();expect(b.ratio).toBeCloseTo(400/470,3);expect(b.y).toBeGreaterThanOrEqual(b.stageY-.1);expect(b.bottom).toBeLessThanOrEqual(b.dockY);expect(b.overflow).toBe(false);
 if(viewport.width===390)expect(b.height).toBeGreaterThan(433); // The phone was already width-limited; removing its footer must not shrink the board.
});
