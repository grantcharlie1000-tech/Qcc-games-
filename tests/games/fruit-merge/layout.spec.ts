import {test,expect} from '../../fixtures';

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`direct-drop basket fits above the dock at ${viewport.width}×${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.goto('/#/game/fruit-merge');await expect(page.locator('.fm-board')).toBeVisible();
 await expect(page.locator('.fm-drop,.fm-foot')).toHaveCount(0);await expect(page.locator('.game-dock')).toHaveCount(1);
 const measure=()=>page.evaluate(()=>{const b=document.querySelector('.fm-board')!.getBoundingClientRect(),r=document.querySelector('.fm')!.getBoundingClientRect(),s=document.querySelector('.stage-wrap')!.getBoundingClientRect(),d=document.querySelector('.game-dock')!.getBoundingClientRect();return{width:b.width,height:b.height,y:r.y,bottom:r.bottom,rootWidth:r.width,rootHeight:r.height,stageWidth:s.width,stageHeight:s.height,stageY:s.y,dockY:d.y,overflow:document.documentElement.scrollWidth>innerWidth};});
 await expect.poll(async()=>{const b=await measure();return Math.min(b.stageWidth-b.rootWidth,b.stageHeight-b.rootHeight);}).toBeLessThan(1);
 const b=await measure();expect(b.width/b.height).toBeCloseTo(360/510,3);expect(b.y).toBeGreaterThanOrEqual(b.stageY-.1);expect(b.bottom).toBeLessThanOrEqual(b.dockY);expect(b.overflow).toBe(false);
 if(viewport.width===390)expect(b.width).toBeGreaterThan(368);
});

for(const viewport of [{width:390,height:844},{width:844,height:390}])test(`the loss banner stays above the dock at ${viewport.width}×${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.addInitScript(()=>{
  const data={version:1,seed:42,bag:[0,1,2,3],current:0,next:1,score:123,time:3000,lastDrop:0,lastMerge:0,combo:0,aim:180,nextId:4,lost:true,fruits:[{id:1,tier:10,y:404},{id:2,tier:9,y:245},{id:3,tier:8,y:103}].map(f=>({...f,x:180,vx:0,vy:0,angle:0,av:0,age:3000,danger:0,sleeping:true}))};
  localStorage.setItem('pocket-arcade:v1:save:fruit-merge',JSON.stringify({version:1,data}));
 });
 await page.goto('/#/game/fruit-merge');await expect(page.locator('.fm-banner')).toHaveText('Basket full — a fresh start awaits!');
 await expect.poll(()=>page.evaluate(()=>document.querySelector('.fm')!.getBoundingClientRect().bottom-document.querySelector('.stage-wrap')!.getBoundingClientRect().bottom)).toBeLessThanOrEqual(.1);
 const board=(await page.locator('.fm-board').boundingBox())!;expect(board.width/board.height).toBeCloseTo(360/510,3);
});
