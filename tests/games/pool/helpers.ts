import {expect,type Page} from '../../fixtures';
import type {PoolState} from '../../../src/games/pool/game';

/** Pull the cue in the power slider down by `power` of its travel and release. */
export async function powerShot(page:Page,power=.6){
  const bar=page.locator('.pool-power');await expect(bar).toBeVisible();
  const b=(await bar.boundingBox())!,x=b.x+b.width/2,y=b.y+b.height*.12,travel=b.height*.75;
  await page.mouse.move(x,y);await page.mouse.down();
  await page.mouse.move(x,y+travel*power,{steps:8});
  await expect(page.locator('.pool-game')).toHaveAttribute('data-gesture','pull');
  await page.mouse.up();
}
/** Kept for shared specs: one real shot through the on-screen controls. */
export const directShot=(page:Page)=>powerShot(page,.6);

type Hook={state():PoolState;aim(angle:number,power:number):boolean;place(x:number,y:number):boolean};
export async function poolState(page:Page){await page.waitForFunction(()=>!!(window as unknown as {__pool?:Hook}).__pool);return page.evaluate(()=>(window as unknown as {__pool:Hook}).__pool.state());}
export const poolAim=(page:Page,angle:number,power:number)=>page.evaluate(([a,p])=>(window as unknown as {__pool:Hook}).__pool.aim(a,p),[angle,power] as const);
/** Start the page with this table already saved, as a returning player would. */
export async function seedPool(page:Page,state:PoolState){
  await page.addInitScript(s=>{localStorage.setItem('pocket-arcade:v1:save:pool',JSON.stringify({version:1,data:s,updated:Date.now()+1e7}));},JSON.parse(JSON.stringify(state)));
}
/** Screen position of a table point, using the game's own canvas size and orientation. */
export async function tableToScreen(page:Page,x:number,y:number){
  const box=(await page.locator('.pool-table').boundingBox())!;
  const orient=await page.locator('.pool-game').getAttribute('data-orient');
  // Mirrors render.ts fitView: the table (with 0.134 m of rails) is centred and scaled to fit.
  const M=.134,OW=1.98+2*M,OH=.99+2*M,pad=4,portrait=orient==='portrait';
  const scale=portrait?Math.min((box.width-pad*2)/OH,(box.height-pad*2)/OW):Math.min((box.width-pad*2)/OW,(box.height-pad*2)/OH);
  const tw=(portrait?OH:OW)*scale,th=(portrait?OW:OH)*scale,left=box.x+(box.width-tw)/2,top=box.y+(box.height-th)/2;
  return portrait?{x:left+(M+y)*scale,y:top+(1.98+M-x)*scale}:{x:left+(M+x)*scale,y:top+(M+y)*scale};
}
