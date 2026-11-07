import {test,expect} from '../../fixtures';
import {backToGames} from '../../game-menu';
import {hook,hop,openGame,state} from './helpers';

test('a run survives graphics interruption and reopening the game',async({page})=>{
  await openGame(page);
  await hop(page,'ArrowUp');
  await hop(page,'ArrowUp');
  expect(await state(page)).toMatchObject({row:2,phase:'running'});

  const supported=await page.locator('.hw-canvas').evaluate((canvas:HTMLCanvasElement)=>{
    const gl=canvas.getContext('webgl2');
    const extension=gl?.getExtension('WEBGL_lose_context');
    if(!extension)return false;
    extension.loseContext();
    return true;
  });
  expect(supported).toBe(true);
  await expect(page.locator('.hw-lost')).toBeVisible();
  await backToGames(page);
  await page.goto('/#/game/crossy-road');
  await page.waitForFunction(()=>window.__crossyRoadTest!==undefined);
  await hook(page).freeze(true);
  await expect(page.locator('.hw-continue')).toBeVisible();
  expect(await state(page)).toMatchObject({row:2,phase:'running'});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await hop(page,'ArrowUp');
  expect(await state(page)).toMatchObject({row:3,phase:'running'});
});
