import {test,expect} from '../fixtures';

test('portrait Pool uses the height between player cards and dock',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/pool');
  await page.locator('.pool-table').hover();
  const table=(await page.locator('.pool-table').boundingBox())!,players=(await page.locator('.pool-players').boundingBox())!,dock=(await page.locator('.game-dock').boundingBox())!;
  expect(table.height).toBeGreaterThanOrEqual(440);expect(table.height/table.width).toBeCloseTo(840/440,2);
  expect(players.y).toBeLessThan(32);expect(table.y).toBeGreaterThanOrEqual(players.y+players.height);
  const footer=(await page.locator('.pool-under').boundingBox())!;
  expect(footer.y).toBeGreaterThanOrEqual(table.y+table.height);expect(footer.y+footer.height).toBeLessThanOrEqual(dock.y-4);
  expect(dock.y-footer.y-footer.height).toBeLessThan(24);
});

test('Pool PC pocket choice stays readable while the balls roll',async({page})=>{
  await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
  await page.locator('.pool-table').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
  await expect(page.locator('.pool-game')).toHaveAttribute('data-phase','moving');
  await expect(page.locator('.pool-message')).toBeHidden();
  for(const selector of ['.pool-pocket-row','[aria-label="8-ball pocket"]']){
    const pixels=await page.locator(selector).evaluate(e=>parseFloat(getComputedStyle(e).fontSize)*e.getBoundingClientRect().width/(e as HTMLElement).offsetWidth);
    expect(pixels).toBeGreaterThanOrEqual(14);
  }
});

test('Flappy portrait flight fills the board without a Flap footer',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.clock.install();await page.goto('/#/game/flappy-bird');
  await page.clock.pauseAt(new Date(Date.now()+1000));await page.getByRole('button',{name:'Take flight',exact:true}).click();
  await expect(page.locator('.flappy-bird')).toHaveAttribute('data-phase','running');
  const scene=(await page.locator('.fb-scene').boundingBox())!,dock=(await page.locator('.game-dock').boundingBox())!;await expect(page.locator('.fb-flap')).toHaveCount(0);
  expect(scene.height).toBeGreaterThanOrEqual(640);expect(scene.y).toBeLessThan(32);
  expect(scene.height).toBeGreaterThanOrEqual(768);expect(dock.y-scene.y-scene.height).toBeLessThan(32);
});

test('Water Sort uses a broad single row and grouped actions on PC',async({page})=>{
  await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/water-sort');
  await page.locator('.ws-tube').first().hover();
  const tubes=await page.locator('.ws-tube').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};}));
  expect(tubes).toHaveLength(4);expect(Math.max(...tubes.map(t=>t.y))-Math.min(...tubes.map(t=>t.y))).toBeLessThan(2);
  expect(Math.min(...tubes.map(t=>t.width))).toBeGreaterThanOrEqual(100);
  const undo=(await page.getByRole('button',{name:'Undo',exact:true}).boundingBox())!,hint=(await page.getByRole('button',{name:'Hint',exact:true}).boundingBox())!;
  expect(Math.abs(hint.y-undo.y)).toBeLessThanOrEqual(1);await expect(page.locator('.game-dock').getByRole('button',{name:'Undo',exact:true})).toBeVisible();
  await page.locator('.ws-tube').first().click();await page.locator('.ws-tube').last().click();
  await expect(page.locator('.ws-game')).toHaveAttribute('data-moves','1');
});
