import {expect,test} from '../../fixtures';
import {pauseGame} from '../../game-menu';

test('holding Space cancels a pending hint without losing native activation',async({page})=>{
  await page.addInitScript(()=>{
    class DelayedWorker extends EventTarget {
      terminated=false;
      constructor(){super();(window as unknown as {hintWorkers:DelayedWorker[]}).hintWorkers.push(this);}
      postMessage(){} terminate(){this.terminated=true;}
    }
    (window as unknown as {hintWorkers:DelayedWorker[]}).hintWorkers=[];
    (window as unknown as {Worker:typeof DelayedWorker}).Worker=DelayedWorker;
  });
  await page.goto('/#/game/water-sort');
  await page.getByRole('button',{name:'Hint',exact:true}).click();
  const tube=page.locator('[data-tube="0"]');await tube.focus();
  await page.keyboard.down('Space');
  expect(await page.evaluate(()=>(window as unknown as {hintWorkers:{terminated:boolean}[]}).hintWorkers[0].terminated)).toBe(true);
  await expect(tube).toBeFocused();
  await page.evaluate(()=>(window as unknown as {hintWorkers:EventTarget[]}).hintWorkers[0].dispatchEvent(new MessageEvent('message',{data:{kind:'pour',from:0,to:2,remaining:1}})));
  await page.keyboard.up('Space');
  await expect(tube).toHaveClass(/ws-selected/);
  await expect(page.locator('.ws-hint-from')).toHaveCount(0);
  await pauseGame(page);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:water-sort')!).data);
  expect(saved.assists).toBe(0);expect(saved.history).toHaveLength(0);
});
