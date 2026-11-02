import {test,expect} from '../fixtures';

test('portrait Pool keeps its table and player cards clear of the edge controls',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/pool');
  await page.locator('.pool-table').hover();
  const table=(await page.locator('.pool-table').boundingBox())!,players=(await page.locator('.pool-players').boundingBox())!,dock=(await page.locator('.game-dock').boundingBox())!;
  expect(table.height).toBeGreaterThanOrEqual(440);expect(table.height/table.width).toBeCloseTo(840/440,2);
  expect(players.y).toBeGreaterThanOrEqual(dock.y+dock.height);expect(table.y).toBeGreaterThanOrEqual(players.y+players.height);
  const footer=(await page.locator('.pool-under').boundingBox())!,stage=(await page.locator('.stage-wrap').boundingBox())!;
  expect(footer.y).toBeGreaterThanOrEqual(table.y+table.height);expect(footer.y+footer.height).toBeLessThanOrEqual(stage.y+stage.height);
  expect(stage.y+stage.height-footer.y-footer.height).toBeLessThan(24);
});

test('Pool PC status and pocket choice have readable rendered text',async({page})=>{
  await page.setViewportSize({width:1366,height:768});await page.goto('/#/game/pool');
  await page.locator('.pool-table').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
  await expect(page.locator('.pool-message')).toContainText('balls rolling');
  for(const selector of ['.pool-message','.pool-pocket-row','[aria-label="8-ball pocket"]']){
    const pixels=await page.locator(selector).evaluate(e=>parseFloat(getComputedStyle(e).fontSize)*e.getBoundingClientRect().width/(e as HTMLElement).offsetWidth);
    expect(pixels).toBeGreaterThanOrEqual(14);
  }
});

test('Flappy portrait flight fills the space below the floating dock without a Flap footer',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.clock.install();await page.goto('/#/game/flappy-bird');
  await page.clock.pauseAt(new Date(Date.now()+1000));await page.getByRole('button',{name:'Take flight',exact:true}).click();
  await expect(page.locator('.flappy-bird')).toHaveAttribute('data-phase','running');
  const scene=(await page.locator('.fb-scene').boundingBox())!,dock=(await page.locator('.game-dock').boundingBox())!,stage=(await page.locator('.stage-wrap').boundingBox())!;await expect(page.locator('.fb-flap')).toHaveCount(0);
  expect(scene.height).toBeGreaterThanOrEqual(640);
  expect(scene.y).toBeGreaterThanOrEqual(dock.y+dock.height);
  expect(scene.y-dock.y-dock.height).toBeLessThan(24);
  expect(scene.y).toBeCloseTo(stage.y,0);expect(scene.height).toBeCloseTo(stage.height,0);
  expect(scene.y+scene.height).toBeLessThanOrEqual(844);expect(844-scene.y-scene.height).toBeLessThan(24);
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
