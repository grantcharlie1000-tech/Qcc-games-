import {test,expect} from '../fixtures';
import {gameAction,openGameMenu} from '../game-menu';
import {generateLevel} from '../../src/games/block-fill/logic';
test.use({hasTouch:true});

for(const viewport of [{width:390,height:844},{width:1366,height:768}]){
  test(`dock text and icons remain readable at ${viewport.width}px`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/#/game/snake');
    await expect(page.locator('.game-hud strong')).toBeVisible();
    const sizes=await page.locator('.game-dock').evaluate(dock=>({
      labels:[...dock.querySelectorAll('.ui-tab,.game-hud small')].map(e=>parseFloat(getComputedStyle(e).fontSize)),
      values:[...dock.querySelectorAll('.game-hud strong')].map(e=>parseFloat(getComputedStyle(e).fontSize)),
      icons:[...dock.querySelectorAll('.ui-tab svg')].map(e=>e.getBoundingClientRect().width)
    }));
    expect(Math.min(...sizes.labels)).toBeGreaterThanOrEqual(viewport.width>=700?14:12);
    expect(Math.min(...sizes.values)).toBeGreaterThanOrEqual(18);
    expect(Math.min(...sizes.icons)).toBeGreaterThanOrEqual(viewport.width>=700?28:24);
  });
}

test('Slipline uses the board and a compact single-line HUD',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/#/game/slipline');await expect(page.locator('.sl-hint')).toHaveCount(0);await expect(page.locator('.game-compact-hud')).toHaveAttribute('aria-label','Level 1, 3 of 3 hearts left');const board=(await page.locator('.sl-board').boundingBox())!;expect(board.width).toBeGreaterThanOrEqual(368);
});

test('late Block Fill counters stay inside the dock on a narrow phone',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  await page.addInitScript(path=>localStorage.setItem('pocket-arcade:v1:save:block-fill',JSON.stringify({version:1,data:{version:1,level:31,path,rewarded:false,steps:48,hints:0,best:{}}})),generateLevel(31).solution.slice(0,49));
  await page.goto('/#/game/block-fill');
  await expect(page.locator('.game-compact-hud')).toHaveAttribute('aria-label','Garden 32 of 32, 49 of 56 squares covered');
  const bounds=await page.locator('.game-dock').evaluate(dock=>{
    const bar=dock.getBoundingClientRect();
    const text=[...dock.querySelectorAll('.game-compact-hud')].filter(e=>e.textContent).map(e=>{const range=document.createRange();range.selectNodeContents(e);const box=range.getBoundingClientRect();return {top:box.top,bottom:box.bottom};});
    return {top:bar.top,bottom:bar.bottom,text};
  });
  for(const text of bounds.text){
    expect(text.top).toBeGreaterThanOrEqual(bounds.top+4);
    expect(text.bottom).toBeLessThanOrEqual(bounds.bottom-4);
  }
});

test('multi-stat captions fit their compact capsules on a 320px phone',async({page})=>{
  await page.setViewportSize({width:320,height:568});
  for(const id of ['slipline','color-connect','block-fill','ball-run']){
    await page.goto(`/#/game/${id}`);
    const hud=page.locator('.game-hud');await expect(hud.locator('.game-compact-hud,strong').filter({visible:true}).first()).toBeVisible();
    const failures=await hud.evaluate(h=>{
      const box=h.getBoundingClientRect();
      return [...h.querySelectorAll('small,strong,.game-compact-hud')].filter(e=>e.textContent&&e.getClientRects().length).flatMap(e=>{
        const range=document.createRange();range.selectNodeContents(e);const r=range.getBoundingClientRect();
        return r.left<box.left+2||r.right>box.right-2||r.top<box.top+2||r.bottom>box.bottom-2?[e.textContent]:[];
      });
    });
    expect(failures,`${id} text outside capsule`).toEqual([]);
  }
});

test('Pool keeps pocket choice below all six pockets',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/pool');
  await page.locator('.pool-table').focus();await page.keyboard.press('ArrowUp');await page.keyboard.press('Enter');
  await expect(page.locator('.pool-game')).toHaveAttribute('data-phase','moving');
  await expect(page.locator('.pool-message')).toBeHidden();
  const table=(await page.locator('.pool-table').boundingBox())!,status=(await page.locator('.pool-pocket-row').boundingBox())!;
  expect(status.y).toBeGreaterThanOrEqual(table.y+table.height);
});

for(const viewport of [{width:1366,height:768},{width:390,height:644},{width:320,height:568},{width:844,height:390}]){
  test(`Wordle keeps all keys and grid inside its panel at ${viewport.width}x${viewport.height}`,async({page})=>{
    await page.setViewportSize(viewport);await page.goto('/#/game/fivefold');
    await expect(page.locator('.ff-key').last()).toBeVisible();
    const panel=(await page.locator('.ff').boundingBox())!,board=(await page.locator('.ff-board').boundingBox())!,key=(await page.locator('.ff-key').last().boundingBox())!;
    expect(board.y).toBeGreaterThanOrEqual(panel.y);
    expect(key.y+key.height).toBeLessThanOrEqual(panel.y+panel.height-4);
    expect(await page.locator('.ff').evaluate(e=>e.scrollHeight<=e.clientHeight)).toBe(true);
  });
}

test('compact dock reserves play space and the menu pauses, restores focus and resumes',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/game/snake');
  await page.getByRole('button',{name:'Start slithering',exact:true}).click();
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
  await page.getByRole('button',{name:/^(Start|Tap to play)$/}).click();
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
  await expect(page.getByRole('button',{name:/^(Start|Tap to play)$/})).toBeVisible();
});

test('returning from a hidden tab does not resume through the game menu',async({page})=>{
  await page.goto('/#/game/quadfall');await page.getByRole('button',{name:/^(Start|Tap to play)$/}).click();
  await page.locator('#game-menu').click();
  await page.evaluate(()=>{
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  await expect(page.locator('#pause-overlay')).toBeVisible();
  await page.locator('#resume-game').click();
  await expect(page.locator('#pause-overlay')).toBeHidden();
});

test('Minesweeper local options preserve a background pause',async({page})=>{
  await page.goto('/#/game/minesweeper');
  await expect(page.locator('.ms-board')).toBeVisible();
  await gameAction(page,'Game options');await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});});
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

test('responsive play area and disposal keep the dock usable',async({page})=>{
  await page.goto('/#/game/quadfall');await page.getByRole('button',{name:/^(Start|Tap to play)$/}).click();
  await openGameMenu(page);const optional=page.getByLabel('Show touch controls',{exact:true});
  if(await optional.isVisible()){await optional.uncheck();await page.getByRole('button',{name:'Close game menu',exact:true}).click();await expect(page.locator('.qf-pad')).toBeHidden();await openGameMenu(page);await optional.check();await page.getByRole('button',{name:'Close game menu',exact:true}).click();await expect(page.locator('.qf-pad')).toBeVisible();}
  else await page.getByRole('button',{name:'Close game menu',exact:true}).click();
  for(const height of [844,644,568]){
    await page.setViewportSize({width:390,height});
    const controls=page.locator('.qf-pad:visible');if(await controls.count())await expect.poll(()=>controls.evaluate(e=>e.getBoundingClientRect().bottom<=innerHeight)).toBe(true);
    for(const control of await page.locator('.game-dock a,.game-dock button').all()){const box=(await control.boundingBox())!;expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(height);}
  }
  for(let i=0;i<3;i++){
    await page.goto('/#/game/block-fill');await expect(page.locator('.game-compact-hud')).toContainText('Garden');
    await page.getByRole('link',{name:'Games'}).click();
    await expect(page.locator('.game-dock')).toHaveCount(0);
    expect(await page.locator('filter[id^="ui-glass-"]').count()).toBeLessThanOrEqual(2);
  }
});

test('shared glass fallbacks and keyboard focus work in the game dock',async({page,browserName})=>{
  await page.emulateMedia({reducedMotion:'reduce',contrast:'more'});
  await page.goto('/#/game/snake');const dock=page.locator('#game-menu');
  await expect(dock).toHaveAttribute('data-glass','off');await expect(dock).toHaveCSS('backdrop-filter','none');
  await page.locator('#game-menu').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#game-options')).toHaveAttribute('open','');
  await page.keyboard.press('Escape');await expect(page.locator('#game-menu')).toBeFocused();
  if(browserName==='chromium'){
    await page.emulateMedia({contrast:'no-preference',reducedMotion:'no-preference'});
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-transparency',value:'reduce'}]});
    await expect(dock).toHaveAttribute('data-glass','off');await expect(dock).toHaveCSS('background-color','rgb(32, 38, 43)');
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
  const board=(await page.locator('.ms-board').boundingBox())!,status=(await page.locator('.ms-underboard').boundingBox())!,controls=(await page.locator('.ms-bottom').boundingBox())!,stage=(await page.locator('.stage-wrap').boundingBox())!;
  expect(status.y-(board.y+board.height)).toBeGreaterThanOrEqual(0);
  expect(status.y-(board.y+board.height)).toBeLessThanOrEqual(24);
  expect(controls.y-(status.y+status.height)).toBeLessThanOrEqual(16);
  const above=board.y-stage.y,below=stage.y+stage.height-(controls.y+controls.height);
  expect(Math.abs(above-below)).toBeLessThanOrEqual(24);
  await page.locator('#game-menu').click();
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('#game-options').getByLabel('Difficulty',{exact:true}).selectOption('expert');
  await expect(page.locator('.ms-board')).toHaveAttribute('aria-colcount','30');
});

test('dock follows a counter whose game replaces its child nodes',async({page})=>{
  await page.goto('/#/game/block-fill');
  await page.locator('.bf-board').focus();await page.keyboard.press('ArrowRight');
  await expect(page.locator('.bf-board')).toHaveAttribute('data-covered','2');
  await expect(page.locator('.game-compact-hud')).toHaveText('Garden 1/32 · 22%');
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
  expect(keys.y-(board.y+board.height)).toBeLessThanOrEqual(32);
  expect(keys.y+keys.height).toBeLessThanOrEqual(844);
});
