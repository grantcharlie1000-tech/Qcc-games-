import {test,expect} from '../../fixtures';

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`tap flight uses the space above the dock at ${viewport.width}×${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/#/game/flappy-bird');
 await expect(page.getByRole('button',{name:'Take flight',exact:true})).toBeVisible();
 await expect(page.locator('.fb-flap,.fb-actions')).toHaveCount(0);
 await expect(page.locator('.game-dock')).toHaveCount(1);
 const measure=()=>page.evaluate(()=>{const b=document.querySelector('.fb-scene')!.getBoundingClientRect(),s=document.querySelector('.stage-wrap')!.getBoundingClientRect(),d=document.querySelector('.game-dock')!.getBoundingClientRect();return{width:b.width,height:b.height,x:b.x,y:b.y,bottom:b.bottom,stageWidth:s.width,stageHeight:s.height,stageY:s.y,dockY:d.y,overflow:document.documentElement.scrollWidth>innerWidth};});
 await expect.poll(async()=>{const b=await measure();return Math.min(b.stageWidth-b.width,b.stageHeight-b.height);}).toBeLessThan(1);
 const b=await measure();expect(b.y).toBeGreaterThanOrEqual(b.stageY-.1);expect(b.bottom).toBeLessThanOrEqual(b.dockY);expect(b.overflow).toBe(false);
 if(viewport.width===390)expect(b.height).toBeGreaterThan(740); // Before: 690px, plus a separate Flap row.
});
