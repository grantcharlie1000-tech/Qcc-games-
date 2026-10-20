import {expect,type Page} from '../../fixtures';
export async function directShot(page:Page,angle=-Math.PI/2,power=.75){
 const canvas=page.locator('.pool-table');await expect(canvas).toBeVisible();
 // Hover waits for native actionability/stable geometry before recording coordinates.
 await canvas.hover();
 const b=(await canvas.boundingBox())!;
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:pool')||'{"data":{"balls":[{"id":0,"x":220,"y":615}]}}').data);
 const cue=state.balls.find((ball:{id:number})=>ball.id===0);
 const point=(x:number,y:number)=>({x:b.x+(840-y)/840*b.width,y:b.y+x/440*b.height});
 // A felt drag sets aim; its release must never shoot.
 const start=point(100,300),aim=point(cue.x+Math.cos(angle)*100,cue.y+Math.sin(angle)*100);
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(aim.x,aim.y,{steps:4});await page.mouse.up();
 const c=point(cue.x,cue.y),end=point(cue.x-Math.cos(angle)*power*120,cue.y-Math.sin(angle)*power*120);
 await page.mouse.move(c.x,c.y);await page.mouse.down();await expect(page.locator('.pool-game')).toHaveAttribute('data-gesture','pull');await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();
}
