import {test,expect} from '../../fixtures';
import {gameAction} from '../../game-menu';
import {generateLevel,campaignScore} from '../../../src/games/block-fill/logic';

test('restored final garden keeps its layout, moves and campaign record across reload and restart',async({page})=>{
  const level=generateLevel(31),best={'0':{steps:8,hints:0}};
  const saved={version:1,level:31,path:level.solution.slice(0,3),rewarded:false,steps:2,hints:0,best};
  await page.addInitScript(value=>{const key='pocket-arcade:v1:save:block-fill';if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({version:1,data:value,updated:1}));},saved);
  await page.goto('/#/game/block-fill');const board=page.locator('.bf-board');
  await expect(board).toHaveAttribute('data-level','32');await expect(board).toHaveAttribute('data-covered','3');
  await expect(board).toHaveAttribute('data-total',String(level.cells.length));
  const delta=level.solution[3]-level.solution[2],key=delta===1?'ArrowRight':delta===-1?'ArrowLeft':delta===level.size?'ArrowDown':'ArrowUp';
  await board.focus();await page.keyboard.press(key);await expect(board).toHaveAttribute('data-covered','4');
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:block-fill')!).data);
  expect((await state()).steps).toBe(3);expect((await state()).best).toEqual(best);
  await page.reload();await expect(board).toHaveAttribute('data-level','32');await expect(board).toHaveAttribute('data-covered','4');
  await gameAction(page,'Restart game');await expect(board).toHaveAttribute('data-level','1');await expect(board).toHaveAttribute('data-covered','1');
  const after=await state();expect(after.best).toEqual(best);expect(campaignScore(after.best)).toBe(campaignScore(best));
});

test('undoing and finishing a garden again preserves the better campaign record',async({page})=>{
  const level=generateLevel(0);
  await page.goto('/#/game/block-fill');
  const board=page.locator('.bf-board');await board.focus();
  const key=(from:number,to:number)=>to-from===1?'ArrowRight':to-from===-1?'ArrowLeft':to-from===level.size?'ArrowDown':'ArrowUp';
  for(let i=1;i<level.solution.length;i++)await page.keyboard.press(key(level.solution[i-1],level.solution[i]));
  await expect(page.getByRole('button',{name:/Next garden/})).toBeVisible();
  const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:block-fill')!).data);
  expect((await state()).best['0']).toEqual({steps:level.cells.length-1,hints:0});
  await page.keyboard.press('Backspace');
  await expect(board).toHaveAttribute('data-covered',String(level.cells.length-1));
  await page.keyboard.press(key(level.solution.at(-2)!,level.solution.at(-1)!));
  await expect(page.getByRole('button',{name:/Next garden/})).toBeVisible();
  const result=await state();
  expect(result.steps).toBe(level.cells.length);
  expect(result.best['0']).toEqual({steps:level.cells.length-1,hints:0});
});
