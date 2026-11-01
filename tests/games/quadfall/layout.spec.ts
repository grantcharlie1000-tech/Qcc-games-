import {gameAction} from '../../game-menu';
import {test,expect} from '../../fixtures';
import {freezeClock,gameRoot,running} from './helpers';

test.use({hasTouch:true});

for(const [width,height] of [[320,568],[390,844],[430,932],[844,390],[1366,768],[600,900],[650,650]]){
 test(`board, previews and shared dock fit ${width}x${height}`,async({page})=>{
  await page.setViewportSize({width,height});await page.goto('/#/game/quadfall');
  await expect(page.getByRole('button',{name:'Tap to play',exact:true})).toBeVisible();
  const board=(await page.locator('.qf-board').boundingBox())!,dock=(await page.locator('.game-dock').boundingBox())!;
  expect(board.x).toBeGreaterThanOrEqual(0);expect(board.x+board.width).toBeLessThanOrEqual(width);
  expect(board.y).toBeGreaterThanOrEqual(0);expect(board.y+board.height).toBeLessThanOrEqual(dock.y);
  expect(board.height/board.width).toBeCloseTo(2,1);expect(dock.height).toBe(56);
  expect(dock.y+dock.height).toBeLessThanOrEqual(height);
  if(width===390)expect(board.width).toBeGreaterThanOrEqual(width*.88);
  for(const selector of ['.qf-hold','.qf-next']){
   const chip=(await page.locator(selector).boundingBox())!;
   expect(chip.y+chip.height<=board.y||chip.x+chip.width<=board.x||chip.x>=board.x+board.width).toBe(true);
   expect(chip.x).toBeGreaterThanOrEqual(0);expect(chip.x+chip.width).toBeLessThanOrEqual(width);
   expect(chip.height).toBeGreaterThanOrEqual(44);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  await expect(page.locator('.qf-pad')).toHaveCount(0);
 });
}

test('dock has the same control dimensions as Snake',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const dimensions=()=>page.locator('.game-dock > .game-glass').evaluateAll(els=>els.map(el=>({height:el.getBoundingClientRect().height,radius:getComputedStyle(el).borderRadius})));
 await page.goto('/#/game/quadfall');await expect(page.locator('.game-hud-item')).toHaveCount(3);const tetris=await dimensions();
 await page.goto('/#/game/snake');await expect(page.locator('.game-hud-item')).toHaveCount(1);
 expect(await dimensions()).toEqual(tetris);
});

test('repeated resize preserves the run and refreshes DPR canvas sizing',async({page})=>{
 await running(page);await page.keyboard.press('c');await page.keyboard.press('Space');
 const snapshot=()=>gameRoot(page).evaluate(el=>[el.getAttribute('data-active'),el.getAttribute('data-score'),el.getAttribute('data-hold')]);
 const before=await snapshot();
 for(const [width,height] of [[390,844],[844,390],[1366,768],[320,568],[430,932]]){
  await page.setViewportSize({width,height});
  await expect.poll(()=>page.locator('.qf-canvas').evaluate((c:HTMLCanvasElement)=>Math.abs(c.width-c.clientWidth*devicePixelRatio)<2&&Math.abs(c.height-c.clientHeight*devicePixelRatio)<2)).toBe(true);
  expect(await snapshot()).toEqual(before);
 }
});

test('safe areas reserve the dock and leave spawn cells unobstructed',async({page})=>{
 await page.setViewportSize({width:390,height:844});await freezeClock(page);await page.goto('/#/game/quadfall');
 // Emulate an iPhone's safe areas without changing the shared shell stylesheet.
 await page.addStyleTag({content:'.game-view[data-game-id=quadfall]{padding-top:47px!important;padding-bottom:34px!important}'});
 const canvas=(await page.locator('.qf-canvas').boundingBox())!,dock=(await page.locator('.game-dock').boundingBox())!;
 expect(canvas.y).toBeGreaterThanOrEqual(47);expect(canvas.y+canvas.height).toBeLessThanOrEqual(dock.y);
 expect(dock.y+dock.height).toBeLessThanOrEqual(844-34);
});

test('fullscreen preserves the run',async({page,browserName})=>{
 test.skip(browserName!=='chromium','Native fullscreen support varies by browser.');await running(page);
 const before=await gameRoot(page).getAttribute('data-active');
 for(let i=0;i<2;i++){
  await gameAction(page,'Enter full screen');await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await gameAction(page,'Exit full screen');await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
 }
 await expect(gameRoot(page)).toHaveAttribute('data-active',before!);
});
