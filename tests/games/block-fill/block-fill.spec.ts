import { test, expect, type Page } from '../../fixtures';
import { generateLevel, solve } from '../../../src/games/block-fill/logic';

test.use({viewport:{width:390,height:844},reducedMotion:'reduce'});
const board=(page:Page)=>page.locator('.bf-board');
async function center(page:Page,cell:number){const level=generateLevel(Number(await board(page).getAttribute('data-level'))-1),box=(await board(page).boundingBox())!;const s=level.size*64+24;return{x:box.x+(44+cell%level.size*64)/s*box.width,y:box.y+(44+Math.floor(cell/level.size)*64)/s*box.height};}
async function stableBoard(page:Page){
  // A mounted SVG can be measured before the stage applies its first fit after
  // reload, or while the next garden is being laid out. Hover waits for the
  // actual board to be stable before we derive native pointer coordinates.
  await expect(page.locator('#game-stage')).toHaveAttribute('data-viewport-scale',/./);
  await board(page).hover();
}
async function drag(page:Page,path:number[],fast=false){
  await stableBoard(page);
  const first=await center(page,path[0]!);await page.mouse.move(first.x,first.y);await page.mouse.down();
  for(let i=1;i<path.length;i++){
    // Straight runs are sent as a single large movement, forcing interpolation.
    if(fast&&i<path.length-1&&path[i]!-path[i-1]===path[i+1]!-path[i]!)continue;
    const p=await center(page,path[i]!);await page.mouse.move(p.x,p.y,{steps:1});
  }
  await page.mouse.up();
}
async function keyboardPath(page:Page,path:number[],size:number){await board(page).focus();for(let i=1;i<path.length;i++){const d=path[i]!-path[i-1]!;await page.keyboard.press(d===1?'ArrowRight':d===-1?'ArrowLeft':d===size?'ArrowDown':'ArrowUp');}}

test.beforeEach(async({page})=>{await page.goto('/#/game/block-fill');await expect(board(page)).toBeVisible();});
test('fast actual drag fills every square and unlocks the larger next garden',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await drag(page,generateLevel(0).solution,true);
  await expect(board(page)).toHaveAttribute('data-covered','9');await expect(page.getByRole('button',{name:'Next garden'})).toBeVisible();
  await expect(page.locator('#game-score')).toContainText('1800');
  await page.getByRole('button',{name:'Reset path',exact:true}).click();
  await expect(page.locator('#game-score')).toContainText('1800');
  await page.reload();await expect(page.locator('#game-score')).toContainText('1800');
  await drag(page,generateLevel(0).solution,true);
  await expect(board(page)).toHaveAttribute('data-covered','9');
  await page.getByRole('button',{name:'Next garden'}).click();await expect(board(page)).toHaveAttribute('data-total','14');await expect(board(page)).toHaveAttribute('data-covered','1');
  await expect(page.locator('#game-level')).toContainText('2 / 12');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
});
test('keyboard, legal current-state hints, undo, reset, pause, restart and reload save',async({page})=>{
  const level=generateLevel(0),solution=solve(level,[level.start])!;
  await keyboardPath(page,solution.slice(0,4),level.size);await expect(board(page)).toHaveAttribute('data-covered','4');
  await page.keyboard.press('Backspace');await expect(board(page)).toHaveAttribute('data-covered','3');
  await page.getByRole('button',{name:'Hint',exact:true}).click();await expect(page.locator('.bf-message')).toContainText('marked square');
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  await board(page).dispatchEvent('keydown',{key:'ArrowRight'});await expect(board(page)).toHaveAttribute('data-covered','3');
  await page.reload();await expect(board(page)).toHaveAttribute('data-covered','3');
  await page.getByRole('button',{name:'Reset path',exact:true}).click();await expect(board(page)).toHaveAttribute('data-covered','1');
  await keyboardPath(page,solution.slice(0,3),level.size);
  await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();
  await expect(board(page)).toHaveAttribute('data-covered','1');await expect(page.getByRole('button',{name:'Pause game',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Game rules',exact:true}).click();await expect(page.locator('#rules-text')).toContainText('exactly once');await page.getByRole('button',{name:'Let’s play'}).click();await expect(page.locator('#rules-dialog')).not.toBeVisible();await expect(page.getByRole('button',{name:'Pause game',exact:true})).toBeVisible();
  await keyboardPath(page,solution,level.size);await expect(board(page)).toHaveAttribute('data-covered','9');
});
test('touch trace, deliberate reverse drag and genuine dead-end recovery hint',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','Native CDP touch is specific to Chromium.');
  const level=generateLevel(0),path=level.solution;
  const session=await context.newCDPSession(page);
  await stableBoard(page);
  const start=await center(page,path[0]!);await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});
  for(const cell of path.slice(1,4)){const p=await center(page,cell);await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...p,id:1}]});}
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(board(page)).toHaveAttribute('data-covered','4');
  await drag(page,[path[3]!,path[2]!]);await expect(board(page)).toHaveAttribute('data-covered','3');
  await page.getByRole('button',{name:'Reset path',exact:true}).click();
  await drag(page,level.solution,true);await page.getByRole('button',{name:'Next garden'}).click();
  const trapLevel=generateLevel(1);
  // Independently enumerate a legal trapped prefix on this actual board.
  const explore=(p:number[]):number[]|null=>{if(p.length>2&&!solve(trapLevel,p))return p;for(const c of trapLevel.cells){const h=p.at(-1)!;if(!p.includes(c)&&Math.abs(c%trapLevel.size-h%trapLevel.size)+Math.abs(Math.floor(c/trapLevel.size)-Math.floor(h/trapLevel.size))===1){const found=explore([...p,c]);if(found)return found;}}return null;};
  const dead=explore([trapLevel.start])!;expect(dead).not.toBeNull();await keyboardPath(page,dead,trapLevel.size);
  await page.getByRole('button',{name:'Hint',exact:true}).click();await expect(page.locator('.bf-message')).toContainText('cannot finish');await expect(page.locator('.bf-message')).toContainText('Undo');
  const note=await page.locator('.bf-message').textContent(),count=Number(note!.match(/Undo (\d+)/)![1]);
  for(let i=0;i<count;i++)await page.getByRole('button',{name:'Undo',exact:true}).click();
  await page.getByRole('button',{name:'Hint',exact:true}).click();await expect(page.locator('.bf-message')).toContainText('marked square');
});
test('re-entry preserves progress and captures original golden trail art',async({page})=>{
  await drag(page,generateLevel(0).solution.slice(0,6),true);await expect(board(page)).toHaveAttribute('data-covered','6');
  await page.getByRole('link',{name:'Back to game library'}).click();await page.goto('/#/game/block-fill');await expect(board(page)).toHaveAttribute('data-covered','6');
  await board(page).focus();await page.keyboard.press('Backspace');await expect(board(page)).toHaveAttribute('data-covered','5');
  const last=await center(page,generateLevel(0).solution[5]!);await page.mouse.click(last.x,last.y);await expect(board(page)).toHaveAttribute('data-covered','6');
  await page.screenshot({path:'tests/games/block-fill/evidence/chromium.png',fullPage:true});
});

test('all twelve gardens are playable to the final win using real pointer input',async({page})=>{
  test.setTimeout(90000);
  for(let i=0;i<12;i++){
    const level=generateLevel(i);await drag(page,level.solution,true);
    await expect(board(page)).toHaveAttribute('data-covered',String(level.cells.length));
    if(i<11)await page.getByRole('button',{name:'Next garden'}).click();
  }
  await expect(page.locator('.bf-message')).toContainText('All twelve gardens filled');
});
test('invalid persisted snapshots are ignored safely',async({page})=>{
  await page.getByRole('link',{name:'Back to game library'}).click();await expect(page.getByRole('link',{name:'Play Block Fill',exact:true})).toBeVisible();
  await page.evaluate(()=>localStorage.setItem('pocket-arcade:v1:save:block-fill',JSON.stringify({version:1,data:{version:1,level:0,path:[0,8]}})));
  await page.getByRole('link',{name:'Play Block Fill',exact:true}).click();await expect(board(page)).toHaveAttribute('data-covered','1');
  await page.getByRole('button',{name:'Hint',exact:true}).click();await expect(page.locator('.bf-message')).toContainText('marked square');
});
