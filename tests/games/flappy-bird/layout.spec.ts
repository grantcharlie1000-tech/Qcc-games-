import {test,expect} from '../../fixtures';

for(const theme of ['off','christmas'])for(const viewport of [
 {width:320,height:568},{width:390,height:844},{width:844,height:390},
 {width:1366,height:768},{width:1920,height:1080},
])test(`${theme} fills the viewport with controls over gameplay at ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);await page.emulateMedia({reducedMotion:'reduce'});await page.goto(`/?festive=${theme}#/game/flappy-bird`);
 await expect(page.getByRole('button',{name:'Take flight',exact:true})).toBeVisible();
 await expect(page.locator('.fb-flap,.fb-actions')).toHaveCount(0);
 await expect(page.locator('.game-dock')).toHaveCount(1);
 const measure=()=>page.evaluate(()=>{
  const scene=document.querySelector('.fb-scene')!.getBoundingClientRect();
  const canvas=document.querySelector('.fb-scene canvas')!.getBoundingClientRect();
  const dock=document.querySelector('.game-dock')!.getBoundingClientRect();
  return {x:scene.x,y:scene.y,width:scene.width,height:scene.height,
   canvasWidth:canvas.width,canvasHeight:canvas.height,dockY:dock.y,dockBottom:dock.bottom,
   overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight};
 });
 await expect.poll(async()=>Math.abs((await measure()).width-viewport.width)).toBeLessThan(1);
 const scene=await measure();
 expect(scene.x).toBeCloseTo(0);expect(scene.y).toBeCloseTo(0);
 expect(scene.height).toBeCloseTo(viewport.height);
 expect(scene.canvasWidth).toBeCloseTo(scene.width);expect(scene.canvasHeight).toBeCloseTo(scene.height);
 expect(scene.dockY).toBeGreaterThan(scene.y);expect(scene.dockBottom).toBeLessThan(scene.height);
 expect(scene.overflow).toBe(false);
 for(const control of await page.locator('.game-dock button,.game-dock a,.fb-start').all()){
  if(!await control.isVisible())continue;
  expect(await control.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})).toBe(true);
 }
});
