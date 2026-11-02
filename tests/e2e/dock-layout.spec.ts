import {test,expect} from '../fixtures';
import {GAME_IDS} from '../../src/core/types';
const playable:Partial<Record<typeof GAME_IDS[number],string>>={
 'fruit-merge':'.fm-board','water-sort':'.ws-tube','color-blocks':'.cb-board',tower:'.tower-viewport',snake:'.snake-canvas',minesweeper:'.ms-board',solitaire:'.sol-top,.sol-tableau','block-fill':'.bf-board','color-connect':'.cc-grid',pool:'.pool-table,.pool-players','flappy-bird':'.fb-scene',globle:'.gl-globe','maze-muncher':'.mm-svg',slipline:'.sl-board',quadfall:'.qf-board',fivefold:'.ff-board,.ff-keyboard'
};
for(const size of [{width:320,height:844},{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`all21 docks fit, share the section-circle height and clear playable cells at ${size.width}x${size.height}`,async({page})=>{
 test.setTimeout(180000);await page.setViewportSize(size);await page.goto('/#/collection');await expect(page.locator('.section-menu')).toBeVisible();const height=(await page.locator('.section-menu').boundingBox())!.height;
 for(const id of GAME_IDS){
  await page.goto(`/#/game/${id}`);await expect(page.locator('.game-view')).toHaveAttribute('data-game-chrome','ready',{timeout:30000});
  if(id==='blockcraft'){await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:60000});await page.getByRole('button',{name:'Play',exact:true}).click();}
  // Puzzle adapters render a compact caption while retaining hidden stat sources.
  await expect(page.locator('.game-hud strong:visible,.game-hud .game-compact-hud').first()).toBeVisible();
  await expect(page.locator('.game-dock')).toHaveCSS('visibility','visible');
  await expect.poll(()=>page.locator('.game-dock').evaluate(e=>e.getAnimations().length)).toBe(0);
  // Let game-owned ResizeObservers respond to the shared visual viewport before measuring cells.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const result=await page.evaluate(({selector,height})=>{
   const dock=document.querySelector<HTMLElement>('.game-dock')!,hud=dock.querySelector<HTMLElement>('.game-hud')!,r=dock.getBoundingClientRect();
   const controls=[...dock.querySelectorAll<HTMLElement>(':scope>.game-glass')].map(e=>e.getBoundingClientRect());
   const boxes=selector?[...document.querySelectorAll(selector)].map(e=>e.getBoundingClientRect()).filter(r=>r.width&&r.height):[];
   const overlap=(a:DOMRect,b:DOMRect)=>a.left<b.right-.5&&b.left<a.right-.5&&a.top<b.bottom-.5&&b.top<a.bottom-.5;
   const escaped=[...hud.querySelectorAll('small,strong,.game-compact-hud')].flatMap(e=>{if(!e.textContent||!e.getClientRects().length||getComputedStyle(e).visibility==='hidden')return [];const range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect(),h=hud.getBoundingClientRect();return t.left<h.left+2||t.right>h.right-2||t.top<h.top+2||t.bottom>h.bottom-2?[e.textContent]:[];});
   return {fits:r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1,heights:controls.map(r=>r.height),targets:controls.every(r=>r.height===height&&r.width>=44),escaped,boards:boxes.length,covered:boxes.filter(b=>controls.some(c=>overlap(c,b))).map(b=>({x:b.x,y:b.y,w:b.width,h:b.height})),clearance:dock.closest<HTMLElement>('.game-view')!.style.getPropertyValue('--game-dock-clearance')};
  },{selector:playable[id],height});
  expect(result.fits,`${id} viewport bounds`).toBe(true);expect(result.targets,`${id} control heights ${result.heights}`).toBe(true);expect(result.escaped,`${id} caption bounds`).toEqual([]);
  if(playable[id])expect(result.boards,`${id} playable cells must exist`).toBeGreaterThan(0);
  expect(result.covered,`${id} playable cells under controls; clearance ${result.clearance}`).toEqual([]);
 }
});
