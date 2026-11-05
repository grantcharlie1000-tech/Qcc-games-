import {captureAuditEvidence} from '../helpers/audit-evidence';
import {test,expect} from '../fixtures';
import type {Locator} from '@playwright/test';

async function settledScrollTop(scores:Locator){
 // Space scrolls natively and can keep animating after the first nonzero sample.
 // Poll from the test runner so this also works with the game's clock paused.
 let previous=-1,unchanged=0;
 await expect.poll(async()=>{
  const top=await scores.evaluate(el=>el.scrollTop);
  unchanged=Math.abs(top-previous)<.5?unchanged+1:0;previous=top;
  return unchanged;
 },{intervals:[100]}).toBeGreaterThanOrEqual(3);
 return previous;
}

for(const [game,viewport] of [
 ['snake',{width:1440,height:900}],
 ['minesweeper',{width:1160,height:520}],
] as const)test(`${game} top scores hide the scrollbar while preserving scroll input`,async({page})=>{
 await page.setViewportSize(viewport);
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{
  entries:Array.from({length:25},(_,i)=>({rank:i+1,playerId:(i+1).toString(16).padStart(64,'0'),name:`Player ${i+1}`,score:2500-i})),player:null,
 }}));
 await page.goto(`/#/game/${game}`);
 await expect(page.locator('#game-stage .loading')).toHaveCount(0);
 const side=page.locator('.lb-sidebar'),scores=side.locator('.lb-scroll');
 await side.getByRole('button',{name:'Top scores',exact:true}).click();
 await expect(scores.locator('tbody tr')).toHaveCount(25);
 expect(await scores.evaluate(el=>el.scrollHeight>el.clientHeight)).toBe(true);
 expect(await scores.evaluate(el=>{
  const style=getComputedStyle(el);
  return style.getPropertyValue('scrollbar-width')==='none'||getComputedStyle(el,'::-webkit-scrollbar').display==='none';
 })).toBe(true);
 await expect(scores).toHaveCSS('overflow-y','auto');
 expect(await scores.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);

 await scores.hover();await page.mouse.wheel(0,180);
 await expect.poll(()=>scores.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await scores.evaluate(el=>{el.scrollTop=0;});
 await side.getByRole('button',{name:'Hide top scores'}).focus();
 await page.keyboard.press('Tab');
 if(game==='minesweeper')await page.keyboard.press('Tab');
 await expect(scores).toBeFocused();
 await expect(scores).toHaveAccessibleName('Top scores');
 await expect(scores).toHaveCSS('outline-style','solid');
 await captureAuditEvidence(page,test.info(),`leaderboard-${game}-keyboard-focus`);
 await page.keyboard.press('ArrowDown');
 await expect.poll(()=>scores.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await page.keyboard.press('End');
 await expect.poll(()=>scores.evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop))).toBeLessThanOrEqual(1);
 await page.keyboard.press('Home');
 await expect.poll(()=>scores.evaluate(el=>el.scrollTop)).toBe(0);
 await page.keyboard.press('Space');
 await expect.poll(()=>scores.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 const afterSpace=await settledScrollTop(scores);
 await page.keyboard.press('Shift+Space');
 // Native page-up distances need not exactly undo the preceding page-down.
 await expect.poll(()=>scores.evaluate(el=>el.scrollTop)).toBeLessThan(afterSpace);
 await expect(scores).toBeFocused();
 await page.keyboard.press('Tab');
 await expect(side.getByRole('button',{name:'All rankings'})).toBeFocused();

 // The play surface's capture listener must continue to allow touch panning
 // inside an actually overflowing leaderboard, including touch-capable laptops.
 expect(await scores.locator('tbody td').first().evaluate(el=>{
  // Generic Event keeps this guard check portable to WebKit's desktop context,
  // which does not expose the synthetic Touch/TouchEvent constructors.
  const event=new Event('touchmove',{bubbles:true,cancelable:true});
  Object.defineProperty(event,'touches',{value:[{target:el}]});
  return el.dispatchEvent(event);
 })).toBe(true);
 const bounds=(await side.boundingBox())!;
 expect(bounds.y).toBeGreaterThanOrEqual(0);
 expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height);
 await side.getByRole('button',{name:'Hide top scores'}).click();
 await expect(scores).toBeHidden();
 await side.getByRole('button',{name:'Top scores',exact:true}).click();
 await expect(scores).toBeVisible();
});

for(const key of ['Shift+Space','Shift+Tab'] as const)test(`top scores ${key} preserves the active Tetris run`,async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 // Keep gravity still without pausing the game or disabling its input handlers.
 await page.clock.install({time:new Date('2026-11-05T12:00:00Z')});
 await page.clock.pauseAt(new Date('2026-11-05T12:00:01Z'));
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{
  entries:Array.from({length:25},(_,i)=>({rank:i+1,playerId:(i+1).toString(16).padStart(64,'0'),name:`Player ${i+1}`,score:2500-i})),player:null,
 }}));
 await page.goto('/#/game/quadfall');
 await page.getByRole('button',{name:'Start',exact:true}).click();
 const game=page.locator('.qf-game'),side=page.locator('.lb-sidebar'),scores=side.locator('.lb-scroll');
 await expect(game).toHaveAttribute('data-phase','running');
 await expect(game).toHaveAttribute('data-hold','');
 await side.getByRole('button',{name:'Top scores',exact:true}).click();
 await expect(scores.locator('tbody tr')).toHaveCount(25);
 await side.getByRole('button',{name:'Hide top scores'}).focus();
 await page.keyboard.press('Tab');await expect(scores).toBeFocused();
 const readState=()=>game.evaluate(el=>['phase','active','hold','score','lines'].map(key=>el.getAttribute(`data-${key}`)));
 const before=await readState();
 const bottom=await scores.evaluate(el=>{el.scrollTop=el.scrollHeight;return el.scrollTop;});
 expect(bottom).toBeGreaterThan(0);

 await page.keyboard.press(key);
 if(key==='Shift+Space'){
  await expect.poll(()=>scores.evaluate(el=>el.scrollTop)).toBeLessThan(bottom);
  await expect(scores).toBeFocused();
 }else await expect(side.getByRole('button',{name:'Hide top scores'})).toBeFocused();
 expect(await readState()).toEqual(before);

 // Input still belongs to the game after focus returns to its board.
 await page.locator('.qf-canvas').focus();await page.keyboard.press('Shift');
 await expect(game).not.toHaveAttribute('data-hold','');
});

for(const state of ['start','paused'] as const)test(`top scores retain keyboard scrolling beside Slither.io's ${state} sheet`,async({page})=>{
 await page.setViewportSize({width:1440,height:900});
 await page.clock.install({time:new Date('2026-11-05T12:00:00Z')});
 await page.clock.pauseAt(new Date('2026-11-05T12:00:01Z'));
 await page.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{
  entries:Array.from({length:25},(_,i)=>({rank:i+1,playerId:(i+1).toString(16).padStart(64,'0'),name:`Player ${i+1}`,score:2500-i})),player:null,
 }}));
 await page.goto('/#/game/neon-coil');
 await expect(page.locator('.nc-start')).toBeVisible();
 if(state==='paused'){
  await page.locator('.nc-start').click();await page.keyboard.press('p');
 }
 const sheet=state==='start'?page.locator('.nc-game .game-sheet'):page.locator('#pause-overlay');
 await expect(sheet).toBeVisible();
 await expect(page.locator('dialog[open]')).toHaveCount(0);
 const side=page.locator('.lb-sidebar'),scores=side.locator('.lb-scroll');
 await side.getByRole('button',{name:'Top scores',exact:true}).click();
 await expect(scores.locator('tbody tr')).toHaveCount(25);
 await side.getByRole('button',{name:'Hide top scores'}).focus();
 await page.keyboard.press('Tab');await expect(scores).toBeFocused();
 const readState=()=>page.locator('.nc-game').evaluate(el=>['phase','tick','x','y','angle','mass','boosting'].map(key=>el.getAttribute(`data-${key}`)));
 const before=await readState();

 await page.keyboard.press('Space');
 await expect.poll(()=>scores.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
 await expect(scores).toBeFocused();await expect(sheet).toBeVisible();
 expect(await readState()).toEqual(before);
 const afterSpace=await settledScrollTop(scores);
 await page.keyboard.press('Shift+Space');
 await expect.poll(()=>scores.evaluate(el=>el.scrollTop)).toBeLessThan(afterSpace);
 await expect(scores).toBeFocused();await expect(sheet).toBeVisible();
 expect(await readState()).toEqual(before);
 await page.keyboard.press('Enter');
 await expect(scores).toBeFocused();await expect(sheet).toBeVisible();
 expect(await readState()).toEqual(before);

 // The sheet still accepts its usual shortcut when the play area owns focus.
 await page.locator('.nc-canvas').focus();await page.keyboard.press('Space');
 await expect(sheet).toBeHidden();
 await expect(page.locator('.nc-game')).toHaveAttribute('data-phase','running');
});
