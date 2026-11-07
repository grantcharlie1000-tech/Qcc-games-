import {expect,test} from '../../fixtures';
import {gameOption,pauseGame} from '../../game-menu';

test('cancelled searches cannot change the board or charge an assist',async({page})=>{
  await page.addInitScript(()=>{
    class DelayedWorker extends EventTarget{
      terminated=false;
      constructor(){super();(window as unknown as {hintWorkers:DelayedWorker[]}).hintWorkers.push(this);}
      postMessage(){} terminate(){this.terminated=true;}
    }
    (window as unknown as {hintWorkers:DelayedWorker[]}).hintWorkers=[];
    (window as unknown as {Worker:typeof DelayedWorker}).Worker=DelayedWorker;
  });
  await page.goto('/#/game/water-sort');
  const hint=page.getByRole('button',{name:'Hint',exact:true});
  await hint.click();await expect(hint).toBeDisabled();
  await expect(page.locator('.ws-message')).toHaveText('Finding a hint. Selecting a tube cancels the search.');
  await page.locator('[data-tube="0"]').click();
  expect(await page.evaluate(()=>(window as unknown as {hintWorkers:{terminated:boolean}[]}).hintWorkers[0].terminated)).toBe(true);
  await page.evaluate(()=>(window as unknown as {hintWorkers:EventTarget[]}).hintWorkers[0].dispatchEvent(new MessageEvent('message',{data:{kind:'pour',from:0,to:2,remaining:1}})));
  await expect(page.locator('.ws-hint-from')).toHaveCount(0);
  await hint.click();
  await page.evaluate(async()=>{
    const {hintFor}=await import(String('/src/games/water-sort/hint.ts'));
    const tubes=[...document.querySelectorAll<HTMLElement>('.ws-tube')].map(e=>e.dataset.colours?e.dataset.colours.split(',').map(Number):[]);
    const result=hintFor({tubes,history:[]});
    (window as unknown as {hintWorkers:EventTarget[]}).hintWorkers[1].dispatchEvent(new MessageEvent('message',{data:result}));
  });
  await expect(page.locator('.ws-hint-from')).toHaveCount(1);
  await pauseGame(page);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:water-sort')!).data);
  expect(saved.assists).toBe(1);
  expect(saved.history).toHaveLength(0);
});

test('hint remains available when workers cannot be created',async({page})=>{
  await page.addInitScript(()=>{
    (window as unknown as {Worker:unknown}).Worker=class {constructor(){throw new Error('workers unavailable');}};
  });
  await page.goto('/#/game/water-sort');
  await page.getByRole('button',{name:'Hint',exact:true}).click();
  await expect(page.locator('.ws-hint-from')).toHaveCount(1);
});

test('keyboard interaction cancels an active fallback search and a later hint works',async({page})=>{
  await page.addInitScript(()=>{
    (window as unknown as {Worker:unknown}).Worker=class {constructor(){throw new Error('workers unavailable');}};
  });
  await page.goto('/#/game/water-sort');
  await gameOption(page,'Level','76');
  const hint=page.getByRole('button',{name:'Hint',exact:true});
  await hint.click();
  await expect(hint).toBeDisabled();
  await page.waitForTimeout(50);
  await expect(hint).toBeDisabled();
  const tube=page.locator('[data-tube="0"]');
  await tube.focus();
  await page.keyboard.press('Space');
  await expect(tube).toHaveClass(/ws-selected/);
  await expect(hint).toBeEnabled();
  await page.waitForTimeout(100);
  await expect(page.locator('.ws-hint-from')).toHaveCount(0);
  await pauseGame(page);
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:water-sort')!).data);
  expect(saved.assists).toBe(0);
  await gameOption(page,'Level','0');
  await hint.click();
  await expect(page.locator('.ws-hint-from')).toHaveCount(1);
});
