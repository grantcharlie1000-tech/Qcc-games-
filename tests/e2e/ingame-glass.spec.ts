import {test,expect} from '../fixtures';
import {gameAction,openGameMenu} from '../game-menu';
test.use({hasTouch:true});

test('compact dock reserves play space and the menu pauses, restores focus and resumes',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/game/snake');
  await page.getByRole('button',{name:'Start slithering'}).click();
  const dock=page.getByRole('navigation',{name:'Game controls'});
  await expect(dock).toBeVisible();
  await expect(dock.locator('.game-hud')).toHaveText('Score0');
  const d=(await dock.boundingBox())!,stage=(await page.locator('.stage-wrap').boundingBox())!;
  expect(d.height).toBeLessThanOrEqual(60);
  expect(d.y).toBeGreaterThanOrEqual(stage.y+stage.height);
  for(const control of await dock.locator('button,a').all()){
    const box=(await control.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
  }
  await page.locator('#game-menu').click();
  await expect(page.getByRole('dialog',{name:'Snake menu'})).toBeVisible();
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect(page.locator('#game-menu')).toBeFocused();
  await expect(page.locator('#study-view')).toBeHidden();
});

test('menu keeps secondary actions reachable through rules and app settings',async({page})=>{
  await page.goto('/#/game/quadfall');
  await page.getByRole('button',{name:'Start',exact:true}).click();
  await page.locator('#game-menu').click();
  await page.getByRole('button',{name:'Game rules',exact:true}).click();
  await expect(page.locator('#rules-dialog')).toBeVisible();
  await page.getByRole('button',{name:'Let’s play'}).click();
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect(page.locator('#game-menu')).toBeFocused();
  await page.locator('#game-menu').click();
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.getByRole('button',{name:'Close menu',exact:true}).click();
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect(page.locator('#game-menu')).toBeFocused();
  await page.locator('#game-menu').click();
  await page.getByRole('button',{name:'Restart game',exact:true}).click();
  await expect(page.getByRole('button',{name:'Start',exact:true})).toBeVisible();
});

test('returning from a hidden tab does not resume through the game menu',async({page})=>{
  await page.goto('/#/game/quadfall');await page.getByRole('button',{name:'Start',exact:true}).click();
  await page.locator('#game-menu').click();
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.getByRole('button',{name:'Keep playing',exact:true}).click();
  await expect(page.locator('#pause-overlay')).toBeHidden();
});

test('Minesweeper local options preserve an explicitly paused game',async({page})=>{
  await page.goto('/#/game/minesweeper');
  await gameAction(page,'Game options');await page.locator('.ms-pause').click();
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await gameAction(page,'Game options');await page.getByRole('button',{name:'Close game options',exact:true}).click();
  await expect(page.locator('#pause-overlay')).toBeVisible();
});

test('Minesweeper native options cannot resume a game after a hidden tab',async({page})=>{
  await page.goto('/#/game/minesweeper');await gameAction(page,'Game options');
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));
  });
  if(await page.locator('.ms-settings[open]').count())await page.getByRole('button',{name:'Close game options',exact:true}).click();
  await expect(page.locator('#pause-overlay')).toBeVisible();
});

test('Ball Run keeps the live mode and next record target in its dock',async({page})=>{
  await page.goto('/#/game/ball-run');await page.getByRole('button',{name:'Play',exact:true}).click();
  const hud=page.locator('.game-hud');
  await expect(hud).toContainText('MEDIUM MODE');await expect(hud).toContainText('NEW BEST');
  await expect.poll(async()=>Number(await hud.locator('strong').first().textContent())).toBeGreaterThan(0);
});

test('Wordle Statistics returns keyboard focus to the dock',async({page})=>{
  await page.goto('/#/game/fivefold');await gameAction(page,'Stats');
  await page.getByRole('button',{name:'Close stats',exact:true}).click();
  await expect(page.locator('#game-menu')).toBeFocused();
});

test('optional pads, shrinking viewport and disposal keep the dock usable',async({page})=>{
  await page.goto('/#/game/quadfall');await page.getByRole('button',{name:'Start',exact:true}).click();
  await openGameMenu(page);await page.getByLabel('Show touch controls').uncheck();
  await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  await expect(page.locator('.qf-pad')).toBeHidden();
  await openGameMenu(page);await page.getByLabel('Show touch controls').check();
  await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  await expect(page.locator('.qf-pad')).toBeVisible();
  for(const height of [844,644,568]){
    await page.setViewportSize({width:390,height});
    await expect.poll(()=>page.locator('.qf-pad').evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight)).toBe(true);
  }
  for(let i=0;i<3;i++){
    await page.goto('/#/game/block-fill');await expect(page.locator('.game-hud')).toContainText('Covered');
    await page.getByRole('link',{name:'Back to game library'}).click();
    await expect(page.locator('.game-dock')).toHaveCount(0);
    expect(await page.locator('filter[id^="ui-glass-"]').count()).toBeLessThanOrEqual(1);
  }
});

test('shared glass fallbacks and keyboard focus work in the game dock',async({page,browserName})=>{
  await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
  await page.goto('/#/game/snake');const dock=page.locator('.game-dock');
  await expect(dock).toHaveAttribute('data-glass','off');await expect(dock).toHaveCSS('backdrop-filter','none');
  await page.locator('#game-menu').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#game-options')).toHaveAttribute('open','');
  await page.keyboard.press('Escape');await expect(page.locator('#game-menu')).toBeFocused();
  if(browserName==='chromium'){
    await page.emulateMedia({contrast:'no-preference',reducedMotion:'no-preference'});
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    await expect(dock).toHaveAttribute('data-glass','off');await expect(dock).toHaveCSS('background-color','rgba(18, 18, 20, 0.97)');
  }
});

test('Pool multiplayer remains reachable from the secondary menu',async({page})=>{
  await page.goto('/#/game/pool');await gameAction(page,'Multiplayer');
  await expect(page.getByRole('dialog',{name:'Pool multiplayer',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Create room',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Close multiplayer menu',exact:true}).click();
  await expect(page.locator('#game-menu')).toBeFocused();
});

test('Minesweeper dock follows flags and time while Reveal and Flag stay by the board',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/minesweeper');
  await page.getByRole('button',{name:'Flag mode',exact:true}).click();
  await page.locator('.ms-tile[data-index="0"]').tap();
  await expect(page.locator('.game-hud')).toContainText('Flags9');
  await page.getByRole('button',{name:'Reveal',exact:true}).click();
  await page.locator('.ms-tile[data-index="40"]').tap();
  await expect(page.locator('.game-hud')).toContainText('Time00:0');
  await page.locator('#game-menu').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#game-options').getByLabel('Difficulty',{exact:true}).selectOption('expert');
  await expect(page.locator('.ms-board')).toHaveAttribute('aria-colcount','30');
});

test('dock follows a counter whose game replaces its child nodes',async({page})=>{
  await page.goto('/#/game/block-fill');
  await page.locator('.bf-board').focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('.bf-board')).toHaveAttribute('data-covered','2');
  await expect(page.locator('.game-hud')).toContainText('Covered2 / 9');
});

test('Fivefold mode controls remain usable in the menu and the keyboard keeps its space',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/fivefold');
  await page.locator('#game-menu').click();
  await page.getByRole('button',{name:'Practice',exact:true}).click();
  await expect(page.locator('.game-hud')).toContainText('Practice');
  await page.getByRole('button',{name:'S',exact:true}).click();
  await expect(page.locator('.ff-row').first()).toContainText('S');
  const dock=(await page.locator('.game-dock').boundingBox())!,board=(await page.locator('.ff-board').boundingBox())!,keys=(await page.locator('.ff-keyboard').boundingBox())!;
  expect(dock.y+dock.height).toBeLessThanOrEqual(board.y);
  expect(board.y+board.height).toBeLessThanOrEqual(keys.y);
  expect(keys.y+keys.height).toBeLessThanOrEqual(844);
});
