import {gameAction,pauseGame,openGameMenu} from '../../game-menu';
import {test,expect,seedStudyTopic} from '../../fixtures';
const saved=async(page:import('@playwright/test').Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:maze-muncher')!).data);
const label=(page:import('@playwright/test').Page)=>page.locator('.mm-svg').getAttribute('aria-label');

test('start, eat dots, turn, pause freezes play and a reload resumes the run',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-22T09:00:00Z')});await page.clock.pauseAt(new Date('2026-10-22T09:00:01Z'));
 await page.goto('/#/game/maze-muncher');
 await expect(page.getByRole('button',{name:'Start',exact:true})).toBeVisible();
 await expect(page.locator('.mm-wall')).toHaveAttribute('d',/^M/);
 await expect(page.locator('.mm-dot')).toHaveCount(242);await expect(page.locator('.mm-berry')).toHaveCount(4);
 await page.getByRole('button',{name:'Start',exact:true}).click();
 await expect(page.locator('.mm-banner')).toHaveText('READY!');
 await page.clock.runFor(2100);await expect(page.locator('.mm-banner')).toHaveText('');
 await page.clock.runFor(800);
 await expect.poll(async()=>Number(await page.locator('#game-score strong').textContent())).toBeGreaterThanOrEqual(30);
 await page.keyboard.press('ArrowUp');await page.clock.runFor(700);
 expect(await label(page)).toMatch(/heading up/);
 await pauseGame(page);
 const before=await saved(page);await page.clock.runFor(1500);expect(await saved(page)).toEqual(before);
 await page.screenshot({path:'tests/games/maze-muncher/evidence/desktop.png'});
 await page.reload();
 await expect(page.locator('#game-score strong')).toHaveText(String(before.score));
 await expect(page.locator('.mm-dot:visible')).toHaveCount(before.dots.split('').filter((c:string)=>c==='.').length);
 await gameAction(page,'Game rules');await expect(page.locator('#rules-text')).toContainText('power berries');
 expect(errors).toEqual([]);
});


// The real saved-run boundary supplies a known corridor; no game-only test hooks.
import {createState,type Dir} from '../../../src/games/maze-muncher/model';
async function corridor(page:import('@playwright/test').Page){
 const data=createState(9);data.phase='intro';data.timer=1;
 await page.clock.install({time:new Date('2026-11-01T09:00:00Z')});await page.clock.pauseAt(new Date('2026-11-01T09:00:01Z'));
 await page.addInitScript(data=>localStorage.setItem('pocket-arcade:v1:save:maze-muncher',JSON.stringify({version:1,data})),data);
 await page.setViewportSize({width:390,height:844});await page.goto('/#/game/maze-muncher');
 await expect(page.locator('.mm-svg')).toBeVisible();await page.clock.runFor(20);
}
async function current(page:import('@playwright/test').Page){
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));return saved(page);
}
async function swipe(page:import('@playwright/test').Page,dir:Dir){
 const r=(await page.locator('.mm-game').boundingBox())!;
 // The band above the maze is part of the play area too. A 13px swipe must suffice.
 const x=r.x+r.width/2,y=r.y+30,dx=dir==='left'?-13:dir==='right'?13:0,dy=dir==='up'?-13:dir==='down'?13:0;
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy);await page.mouse.up();
}
for(const dir of ['up','down','left','right'] as const)test(`short ${dir} swipe anywhere in the play area steers without scrolling`,async({page})=>{
 await corridor(page);await swipe(page,dir);expect((await current(page)).player.next).toBe(dir);
 await page.clock.runFor(dir==='down'?1100:600);expect((await current(page)).player.dir).toBe(dir);
 expect(await page.evaluate(()=>({x:scrollX,y:scrollY,touch:getComputedStyle(document.querySelector('.mm-game')!).touchAction}))).toEqual({x:0,y:0,touch:'none'});
});

test('an early swipe survives blocked centres and turns at the first legal junction',async({page})=>{
 await corridor(page);await swipe(page,'up');await page.clock.runFor(250);
 const queued=(await current(page)).player;expect(queued.dir).toBe('left');expect(queued.next).toBe('up');expect(queued.x).toBeLessThan(12.5);expect(queued.x).toBeGreaterThan(11.5);
 await page.clock.runFor(250);const turned=(await current(page)).player;
 expect(turned.dir).toBe('up');expect(turned.next).toBeNull();expect(turned.x).toBe(11.5);expect(turned.y).toBeLessThan(21.5);
});

test('a later swipe replaces the queued turn; cancellation and tiny movements do not steer',async({page})=>{
 await corridor(page);await swipe(page,'down');await swipe(page,'up');expect((await current(page)).player.next).toBe('up');
 const r=(await page.locator('.mm-game').boundingBox())!;await page.mouse.move(r.x+100,r.y+30);await page.mouse.down();await page.mouse.move(r.x+106,r.y+30);await page.mouse.up();expect((await current(page)).player.next).toBe('up');
 await page.locator('.mm-game').evaluate(el=>el.addEventListener('pointerdown',e=>el.setAttribute('data-test-pointer',String((e as PointerEvent).pointerId)),{once:true}));
 await page.mouse.down();await page.locator('.mm-game').dispatchEvent('pointercancel',{pointerId:Number(await page.locator('.mm-game').getAttribute('data-test-pointer'))});await page.mouse.move(r.x+130,r.y+30);await page.mouse.up();expect((await current(page)).player.next).toBe('up');
 await page.clock.runFor(500);expect((await current(page)).player.dir).toBe('up');
});

test('arrows and WASD buffer all directions and Escape uses shared pause',async({page})=>{
 await corridor(page);
 for(const [key,dir] of [['ArrowUp','up'],['ArrowDown','down'],['ArrowLeft','left'],['ArrowRight','right'],['W','up'],['A','left'],['S','down'],['D','right']]){
  await page.keyboard.press(key);expect((await current(page)).player.next).toBe(dir);
 }
 await page.keyboard.press('Escape');await expect(page.locator('#pause-overlay')).toBeVisible();await expect(page.locator('#study-view')).not.toBeVisible();
 const before=await current(page);await page.keyboard.press('ArrowUp');await page.clock.runFor(1000);expect(await current(page)).toEqual(before);
});

test('Enter starts with one Start action and game over has a clean replay sheet',async({page})=>{
 await page.goto('/#/game/maze-muncher');await expect(page.locator('.mm-start')).toHaveText('Start');await page.keyboard.press('Enter');await expect(page.locator('.mm-banner')).toHaveText('READY!');
 const data=createState(9);data.phase='over';data.lives=0;data.score=1230;data.level=2;
 await page.addInitScript(data=>localStorage.setItem('pocket-arcade:v1:save:maze-muncher',JSON.stringify({version:1,data})),data);await page.reload();
 await expect(page.locator('.mm-card strong')).toHaveText('Game over');await expect(page.locator('.mm-card p')).toHaveText('1,230 points · Level 2');await expect(page.locator('.mm-lives strong')).toHaveText('0');
 await page.getByRole('button',{name:'Play again',exact:true}).click();await expect(page.locator('.mm-banner')).toHaveText('READY!');await expect(page.locator('.mm-lives strong')).toHaveText('3');
});

test('native phone touch swipes steer in all four directions without moving the page',async({browser,browserName})=>{
 test.skip(browserName!=='chromium','Native touch injection uses CDP; WebKit covers the same pointer gesture path.');
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:3});await seedStudyTopic(context);
 const page=await context.newPage();await corridor(page);const cdp=await context.newCDPSession(page);
 for(const dir of ['up','down','left','right'] as const){
  await page.reload();await expect(page.locator('.mm-svg')).toBeVisible();await page.clock.runFor(20);
  const b=(await page.locator('.mm-game').boundingBox())!,x=b.x+b.width/2,y=b.y+30;
  const dx=dir==='left'?-13:dir==='right'?13:0,dy=dir==='up'?-13:dir==='down'?13:0;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx,y:y+dy}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  expect((await current(page)).player.next).toBe(dir);await page.clock.runFor(dir==='down'?1100:600);expect((await current(page)).player.dir).toBe(dir);
  expect(await page.evaluate(()=>scrollY)).toBe(0);
 }
 await context.close();
});

test('closing the shared menu preserves keyboard steering while its button keeps focus',async({page})=>{
 await page.goto('/#/game/maze-muncher');await expect(page.locator('.mm-start')).toBeVisible();
 await openGameMenu(page);await page.getByRole('button',{name:'Close game menu',exact:true}).click();await expect(page.locator('#game-options')).toBeHidden();
 await page.locator('#game-menu').focus();await expect(page.locator('#game-menu')).toBeFocused();await page.keyboard.press('W');expect((await current(page)).player.next).toBe('up');
});

test('a second pointer ending cannot cancel the primary swipe',async({page})=>{
 await corridor(page);const b=(await page.locator('.mm-game').boundingBox())!;await page.mouse.move(b.x+100,b.y+30);await page.mouse.down();
 await page.locator('.mm-game').dispatchEvent('pointerup',{pointerId:999,isPrimary:false});await page.mouse.move(b.x+113,b.y+30);await page.mouse.up();
 expect((await current(page)).player.next).toBe('right');
});
