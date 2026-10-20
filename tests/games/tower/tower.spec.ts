import {seedStudyTopic} from '../../fixtures';
import { test, expect } from '../../fixtures';
const fixed=new Date('2026-01-01T12:00:00Z');
async function start(page:import('@playwright/test').Page){
  await page.clock.install({time:fixed});await page.clock.pauseAt(fixed);
  await page.goto('/#/game/tower');await expect(page.getByRole('button',{name:'Drop block',exact:true})).toBeVisible();
}
test('timed mouse and keyboard build a real tower, pause freezes it, save restores and restart resets',async({page})=>{
  await page.setViewportSize({width:390,height:844});await start(page);
  await page.clock.runFor(1450);await page.locator('.tower-canvas').click();
  await expect(page.locator('.tower-height')).toHaveText('1');
  await expect(page.locator('#game-score strong')).toHaveText('1');
  await page.clock.runFor(200+1300);await page.keyboard.press('Space');
  await expect(page.locator('.tower-height')).toHaveText('2');
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:tower')!).data);
  expect(saved.blocks).toHaveLength(3);expect(saved.blocks[1].w).toBeLessThan(110);expect(saved.blocks[2].d).toBeLessThan(110);
  await page.clock.runFor(5000);await page.keyboard.press('Space');
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:tower')!).data)).toEqual(saved);
  await page.reload();await expect(page.locator('.tower-height')).toHaveText('2');
  await page.getByRole('button',{name:'Game rules'}).click();
  await expect(page.locator('#rules-text')).toContainText('overlap');
  await page.getByRole('button',{name:'Let’s play'}).focus();await page.keyboard.press('Space');await expect(page.locator('.tower-height')).toHaveText('2');
  await page.screenshot({path:'tests/games/tower/evidence/chromium.png',fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(page.locator('.tower-height')).toHaveText('0');
  await expect(page.locator('#game-score strong')).toHaveText('0');
});
test('a complete keyboard miss ends the run and the play-again action resets it',async({page})=>{
  await start(page);await page.keyboard.press('Enter');
  await expect(page.getByRole('heading',{name:'One more floor?'})).toBeVisible();
  await expect(page.locator('.tower-game')).toHaveAttribute('data-phase','over');
  await page.getByRole('button',{name:'Build again'}).click();await expect(page.locator('.tower-height')).toHaveText('0');
  await page.clock.runFor(1526);await page.getByRole('button',{name:'Drop block',exact:true}).click();
  await expect(page.locator('.tower-height')).toHaveText('1');await expect(page.locator('.tower-combo')).toHaveText('1');
});
test('touch input drops a slab on a phone and leaving releases input',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await seedStudyTopic(context);const page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await start(page);
  await page.clock.runFor(1450);await page.locator('.tower-canvas').tap();await expect(page.locator('.tower-height')).toHaveText('1');
  await page.getByRole('link',{name:'Back to game library'}).click();await page.keyboard.press('Space');
  await page.goto('/#/game/tower');await expect(page.locator('.tower-height')).toHaveText('1');
  await page.getByRole('button',{name:'Restart game',exact:true}).click();await page.clock.runFor(1450);await page.locator('.tower-canvas').tap();
  await expect(page.locator('.tower-height')).toHaveText('1');expect(errors).toEqual([]);await context.close();
});

test('camera follows a tall tower while genuine keyboard inputs preserve perfect size',async({page})=>{
  await page.setViewportSize({width:390,height:844});await start(page);
  await page.locator('.tower-canvas').focus();
  for(let height=0;height<9;height++){
    // Motion is analytical in elapsed time. Jump to each alignment rather than
    // painting every intermediate frame on the CI software renderer.
    await page.clock.fastForward((height?200:0)+Math.round(145/(95+height*4)*1000));
    await page.keyboard.press('Space');await expect(page.locator('.tower-height')).toHaveText(String(height+1));
  }
  await expect(page.locator('.tower-combo')).toHaveText('9');
  await page.clock.runFor(200);
  await page.screenshot({path:'tests/games/tower/evidence/tall-tower.png',fullPage:true});
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:tower')!).data);
  expect(saved.blocks).toHaveLength(10);
  for(const block of saved.blocks){expect(block.w).toBe(110);expect(block.d).toBe(110);}
});
