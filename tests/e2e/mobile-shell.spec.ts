import {test as base} from '@playwright/test';
import type {CDPSession,Page} from '@playwright/test';
import {test,expect} from '../fixtures';
import {gameAction} from '../game-menu';

const phone={viewport:{width:390,height:844},hasTouch:true,isMobile:true};
const openMenu=(page:Page)=>page.locator('.app-navigation').getByRole('button',{name:'Open menu',exact:true}).click();

// A real touch drag through the browser's input pipeline, so the sheet's own touch handlers decide.
async function drag(cdp:CDPSession,x:number,from:number,to:number){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:from}]});
  const steps=10;
  for(let i=1;i<=steps;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:from+(to-from)*i/steps}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}

test.describe('phone sheets',()=>{
  test.use(phone);
  test('close with a tap outside or a pull down, and a short pull springs back',async({page,browserName})=>{
    test.skip(browserName!=='chromium','touch drags use the Chromium input protocol');
    await page.goto('/#/collection');await expect(page.locator('.game-card').first()).toBeVisible();
    const menu=page.locator('#menu');
    await openMenu(page);await expect(menu).toBeVisible();
    await page.touchscreen.tap(195,12);
    await expect(menu).toBeHidden();
    const cdp=await page.context().newCDPSession(page);
    await openMenu(page);await expect(menu).toBeVisible();
    let top=(await menu.boundingBox())!.y;
    // 20 px: below the flick distance, so speed cannot decide it.
    await drag(cdp,195,top+20,top+40);
    await expect(menu).toBeVisible();
    await expect.poll(()=>menu.evaluate(d=>(d as HTMLElement).style.translate)).toBe('');
    top=(await menu.boundingBox())!.y;
    await drag(cdp,195,top+20,top+320);
    await expect(menu).toBeHidden();
    // It opens again in place, not offset by the pull that closed it.
    await openMenu(page);await expect(menu).toBeVisible();
    expect(await menu.evaluate(d=>(d as HTMLElement).style.translate)).toBe('');
  });

  test('menu search lists matching games, opens one, and the Search key shows the filtered library',async({page})=>{
    await page.goto('/#/collection');await expect(page.locator('.game-card').first()).toBeVisible();
    await openMenu(page);
    await page.locator('#search').fill('pool');
    const results=page.getByRole('list',{name:'Matching games'});
    await expect(results.getByRole('link')).toHaveText(['Pool']);
    await page.locator('#search').fill('zzz');
    await expect(results).toContainText('No games found');
    await page.locator('#search').fill('so');
    await page.locator('#search').press('Enter');
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('.library-filter-text')).toHaveText('Games matching “so”');
    await page.getByRole('button',{name:'Show all games',exact:true}).click();
    await openMenu(page);
    await expect(results).toBeHidden();
    await page.locator('#search').fill('pool');
    await results.getByRole('link',{name:'Pool',exact:true}).click();
    await expect(page.locator('#menu')).toBeHidden();
    await expect(page.locator('.pool-game')).toBeVisible();
  });

  test('the leaderboard Refresh scores button keeps its full size',async({page})=>{
    await page.goto('/#/collection');await expect(page.locator('.game-card').first()).toBeVisible();
    await openMenu(page);await page.locator('#open-leaderboards').click();
    const box=(await page.getByRole('button',{name:'Refresh scores',exact:true}).boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    expect(box.width).toBeGreaterThan(200);
  });

  test('leaving fullscreen with a system gesture keeps the game open',async({page,browserName})=>{
    test.skip(browserName!=='chromium','touch pointer media is emulated reliably only in Chromium');
    await page.goto('/#/game/tower');await expect(page.locator('.tower-game')).toBeVisible();
    expect(await page.evaluate(()=>matchMedia('(pointer:fine)').matches)).toBe(false);
    await gameAction(page,'Enter full screen');
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
    await page.evaluate(()=>document.exitFullscreen());
    await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
    // Study would open within a frame of the exit; give it time before checking that it did not.
    await page.waitForTimeout(500);
    await expect(page.locator('#study-view')).toBeHidden();
    await expect(page.locator('.tower-game')).toBeVisible();
  });
});

test('on a desktop, a fullscreen exit the browser made still opens Study',async({page})=>{
  await page.goto('/#/game/tower');await expect(page.locator('.tower-game')).toBeVisible();
  await gameAction(page,'Enter full screen');
  await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
  await page.evaluate(()=>document.exitFullscreen());
  await expect(page.locator('#study-view')).toBeVisible();
});

base.describe('first visit on a phone',()=>{
  base.use(phone);
  base('the sign-in sheet has a close button that continues as a guest',async({page})=>{
    await page.goto('/');
    const dialog=page.locator('#accounts-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button',{name:'Close sign in',exact:true}).click();
    await expect(dialog).toBeHidden();
    await expect.poll(()=>page.evaluate(()=>localStorage.getItem('pocket-arcade:v1:accounts:guest'))).toBe('true');
  });
});

test.describe('games on phones',()=>{
  test('Drift Club runs edge to edge under the notch and home indicator, with its controls clear',async({page,browserName})=>{
    test.skip(browserName!=='chromium','safe-area insets are emulated through Chromium');
    const cdp=await page.context().newCDPSession(page);
    await page.setViewportSize({width:390,height:844});
    await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:47,bottom:34,left:0,right:0}});
    await page.goto('/#/game/drift-club');await expect(page.locator('.dc')).toBeVisible();
    expect((await page.locator('.game-dock').boundingBox())!.y).toBeGreaterThanOrEqual(47);
    let panel=(await page.locator('.dc-control').boundingBox())!,shoot=(await page.locator('.dc-shoot').boundingBox())!;
    expect(panel.y+panel.height).toBeCloseTo(844,0);
    expect(shoot.y+shoot.height).toBeLessThanOrEqual(844-34);
    await page.setViewportSize({width:844,height:390});
    await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,bottom:21,left:47,right:0}});
    await expect.poll(async()=>(await page.locator('.dc-desk').boundingBox())!.x).toBe(0);
    panel=(await page.locator('.dc-desk').boundingBox())!;shoot=(await page.locator('.dc-shoot').boundingBox())!;
    expect(panel.y+panel.height).toBeCloseTo(390,0);
    expect(shoot.x).toBeGreaterThanOrEqual(47);
    expect(shoot.y+shoot.height).toBeLessThanOrEqual(390-21);
  });

  test('Fivefold keeps readable tiles on a landscape phone',async({page})=>{
    await page.setViewportSize({width:844,height:390});
    await page.goto('/#/game/fivefold');await expect(page.locator('.ff-tile').first()).toBeVisible();
    expect((await page.locator('.ff-tile').first().boundingBox())!.width).toBeGreaterThanOrEqual(28);
    const keys=(await page.locator('.ff-keyboard').boundingBox())!,board=(await page.locator('.ff-board').boundingBox())!;
    expect(keys.x).toBeGreaterThanOrEqual(board.x+board.width);
  });

  test('the Chess menu fits above the dock on a landscape phone',async({page})=>{
    await page.setViewportSize({width:844,height:390});
    await page.goto('/#/game/chess');
    const ranked=page.locator('.ch-card').filter({hasText:'Ranked'});await expect(ranked).toBeVisible();
    const title=(await page.locator('.ch-title').boundingBox())!,dock=(await page.locator('.game-dock').boundingBox())!;
    expect(title.y).toBeGreaterThanOrEqual(0);
    for(const control of await page.locator('.ch-card,.ch-pill').all()){const box=(await control.boundingBox())!;expect(box.y+box.height).toBeLessThanOrEqual(dock.y);}
  });
});
