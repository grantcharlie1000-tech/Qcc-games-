import {test,expect} from '../../fixtures';
import {openGameMenu} from '../../game-menu';

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1366,height:768}]){
 test(`maze fills the play area above the shared dock at ${viewport.width}×${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);await page.goto('/#/game/maze-muncher');
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
  await expect(page.locator('.mm-pad,.mm-controls,[data-dir]')).toHaveCount(0);
  await expect(page.locator('.game-dock')).toHaveCount(1);
  await expect(page.locator('.game-hud')).toContainText('Lives3');
  const measure=()=>page.evaluate(()=>{
   const box=(s:string)=>{const r=document.querySelector(s)!.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
   return{board:box('.mm-frame'),art:box('.mm-svg'),stage:box('.stage-wrap'),dock:box('.game-dock'),overflow:document.documentElement.scrollWidth>innerWidth};
  });
  await expect.poll(async()=>{const {board,stage}=await measure();return Math.min(stage.width-board.width,stage.height-board.height);}).toBeLessThan(1);
  const {board,art,stage,dock,overflow}=await measure();
  expect(art.width/art.height).toBeCloseTo(224/266,3);
  expect(Math.abs(board.x+board.width/2-viewport.width/2)).toBeLessThan(1);
  expect(board.y).toBeGreaterThanOrEqual(stage.y-.1);expect(board.bottom).toBeLessThanOrEqual(dock.y);
  expect(overflow).toBe(false);
  if(viewport.width===390)expect(board.width).toBeGreaterThan(368); // Untouched phone frame was 358px.
  await expect(page.locator('.mm-frame .game-sheet').getByRole('heading')).toHaveText('Pac-Man');
  await expect(page.locator('.mm-banner')).toBeHidden();
  await openGameMenu(page);await expect(page.getByLabel('Show touch controls')).not.toBeVisible();
 });
}
