import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';

// Browser-spec helpers shared by the Blockcraft specs.

/** Committed evidence pictures come from Chromium only; other browsers write to the test's output folder, so a WebKit run
 *  never overwrites them. */
export function evidencePath(file:string):string{
  const info=test.info();
  return info.project.name==='chromium'?`tests/games/blockcraft/evidence/${file}`:info.outputPath(file);
}

/** Headless Playwright WebKit rejects every requestPointerLock() with pointerlockerror (Safari itself grants it). After two
 *  failed attempts the game falls back to drag-to-look and hold-to-mine, so specs drive that path there instead. */
export const lockless=(browserName:string)=>browserName==='webkit';

/** Counts pointerlockerror events from the first script on: call before page.goto. */
export async function countLockErrors(page:Page){
  await page.addInitScript(()=>{
    const w=window as unknown as {__lockErrors:number};w.__lockErrors=0;
    document.addEventListener('pointerlockerror',()=>{w.__lockErrors++;});
  });
}
const lockErrors=(page:Page)=>page.evaluate(()=>(window as unknown as {__lockErrors?:number}).__lockErrors??0);

/** After Play on a browser without pointer lock: a click on the world at (x, y) uses up the second lock attempt (input
 *  then takes presses as drag/hold gestures). Needs countLockErrors before goto. */
export async function useLockFallback(page:Page,x:number,y:number){
  await expect.poll(()=>lockErrors(page)).toBeGreaterThanOrEqual(1);
  if(await lockErrors(page)<2)await page.mouse.click(x,y);
  await expect.poll(()=>lockErrors(page)).toBeGreaterThanOrEqual(2);
}

/** Turns the view by a mouse movement of (dx, dy) px: plain moves with the pointer locked, a left-button drag without. */
export async function look(page:Page,locked:boolean,from:{x:number;y:number},dx:number,dy:number,steps=6){
  if(locked){
    for(let i=1;i<=steps;i++)await page.mouse.move(from.x+dx*i/steps,from.y+dy*i/steps);
    return;
  }
  await page.mouse.move(from.x,from.y);await page.mouse.down();
  for(let i=1;i<=steps;i++)await page.mouse.move(from.x+dx*i/steps,from.y+dy*i/steps);
  await page.mouse.up();
  // Leave the pointer where the drag started, so the next press is still and on the world.
  await page.mouse.move(from.x,from.y);
}
