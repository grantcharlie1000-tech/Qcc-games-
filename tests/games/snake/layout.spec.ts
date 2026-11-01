import {test,expect} from '../../fixtures';
import {openGameMenu} from '../../game-menu';

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:844,height:390},{width:1366,height:768}]){
  test(`Snake uses the free space without a D-pad at ${viewport.width}×${viewport.height}`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/#/game/snake');
    await expect(page.locator('.snake-start')).toBeVisible();
    await expect(page.locator('.snake-pad,[data-direction]')).toHaveCount(0);
    const measure=()=>page.evaluate(()=>{
      const box=(selector:string)=>{const r=document.querySelector(selector)!.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom};};
      return {board:box('.snake-garden'),stage:box('.stage-wrap'),dock:box('.game-dock'),overflow:document.documentElement.scrollWidth>innerWidth};
    });
    await expect.poll(async()=>{const {board,stage}=await measure();return Math.abs(board.width-Math.min(728,stage.width,stage.height));}).toBeLessThan(1);
    const before=await measure(),{board,stage,dock}=before;
    expect(board.width).toBeCloseTo(board.height,3);
    expect(Math.abs(board.x+board.width/2-viewport.width/2)).toBeLessThan(1);
    expect(Math.abs(board.y+board.height/2-stage.y-stage.height/2)).toBeLessThan(1);
    expect(board.y).toBeGreaterThanOrEqual(stage.y);expect(board.bottom).toBeLessThanOrEqual(dock.y);
    expect(before.overflow).toBe(false);
    await openGameMenu(page);await expect(page.getByLabel('Show touch controls')).toHaveCount(0);
    await page.getByRole('button',{name:'Close game menu',exact:true}).click();
    await expect.poll(async()=>(await measure()).board).toEqual(board);
  });
}
