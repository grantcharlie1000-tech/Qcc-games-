import type {Page} from '../../fixtures';
import {createState,type State} from '../../../src/games/quadfall/model';

export const gameRoot=(page:Page)=>page.locator('.qf-game');
export async function active(page:Page){return JSON.parse((await gameRoot(page).getAttribute('data-active'))!) as State['active'];}
export async function freezeClock(page:Page){
 await page.clock.install({time:new Date('2026-11-01T12:00:00Z')});
 await page.clock.pauseAt(new Date('2026-11-01T12:00:01Z'));
}
export async function seedRun(page:Page,changes:Partial<State>={}){
 const state=createState(1);Object.assign(state,{phase:'running',active:{id:'T',x:3,y:2,r:0},queue:['I','O','S','Z','J','L'],lowest:3},changes);
 await page.addInitScript(data=>{
  const key='pocket-arcade:v1:save:quadfall';
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,data,updated:Date.now()}));
 },state);
}
export async function running(page:Page,changes:Partial<State>={}){
 await freezeClock(page);await seedRun(page,changes);await page.goto('/#/game/quadfall');
 await page.getByRole('button',{name:'Continue',exact:true}).click();
}
/** Real captured pointer input works in Chromium and WebKit, through the same path as touch. */
export async function drag(page:Page,dx:number,dy:number,duration:number){
 const board=(await page.locator('.qf-canvas').boundingBox())!,cell=board.width/10;
 const x=board.x+board.width*.5,y=board.y+board.height*.3;
 await page.mouse.move(x,y);await page.mouse.down();
 for(let i=1;i<=4;i++){
  await page.clock.runFor(duration/4);
  await page.mouse.move(x+dx*cell*i/4,y+dy*cell*i/4);
 }
 await page.mouse.up();await page.clock.runFor(17);
}
