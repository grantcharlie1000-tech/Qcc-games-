import {test,expect} from '../../fixtures';
const saved=async(page:import('@playwright/test').Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:maze-muncher')!).data);
const label=(page:import('@playwright/test').Page)=>page.locator('.mm-svg').getAttribute('aria-label');

test('start, eat dots, turn, pause freezes play and a reload resumes the run',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-22T09:00:00Z')});await page.clock.pauseAt(new Date('2026-10-22T09:00:01Z'));
 await page.goto('/#/game/maze-muncher');
 await expect(page.getByRole('button',{name:'Start game',exact:true})).toBeVisible();
 await expect(page.locator('.mm-wall')).toHaveAttribute('d',/^M/);
 await expect(page.locator('.mm-dot')).toHaveCount(242);await expect(page.locator('.mm-berry')).toHaveCount(4);
 await page.getByRole('button',{name:'Start game',exact:true}).click();
 await expect(page.locator('.mm-banner')).toHaveText('READY!');
 await page.clock.runFor(2100);await expect(page.locator('.mm-banner')).toHaveText('');
 await page.clock.runFor(800);
 await expect.poll(async()=>Number(await page.locator('#game-score strong').textContent())).toBeGreaterThanOrEqual(30);
 await page.keyboard.press('ArrowUp');await page.clock.runFor(700);
 expect(await label(page)).toMatch(/heading up/);
 await page.getByRole('button',{name:'Pause game',exact:true}).click();
 const before=await saved(page);await page.clock.runFor(1500);expect(await saved(page)).toEqual(before);
 await page.screenshot({path:'tests/games/maze-muncher/evidence/desktop.png'});
 await page.reload();
 await expect(page.locator('#game-score strong')).toHaveText(String(before.score));
 await expect(page.locator('.mm-dot:visible')).toHaveCount(before.dots.split('').filter((c:string)=>c==='.').length);
 await page.getByRole('button',{name:'Game rules',exact:true}).click();await expect(page.locator('#rules-text')).toContainText('power berries');
 expect(errors).toEqual([]);
});

test('phone layout fits with touch buttons and swipe steering',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await context.addInitScript(()=>{localStorage.setItem('pocket-arcade:v1:accounts:guest','true');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');});
 const page=await context.newPage();
 await page.clock.install({time:new Date('2026-10-22T09:00:00Z')});await page.clock.pauseAt(new Date('2026-10-22T09:00:01Z'));
 await page.goto('/#/game/maze-muncher');
 const board=await page.locator('.mm-frame').boundingBox(),up=await page.getByRole('button',{name:'Go up'}).boundingBox();
 expect(board!.x).toBeGreaterThanOrEqual(0);expect(board!.x+board!.width).toBeLessThanOrEqual(390);expect(board!.width).toBeGreaterThan(280);
 expect(up!.y+up!.height).toBeLessThanOrEqual(844);expect(up!.height).toBeGreaterThanOrEqual(48);
 await page.getByRole('button',{name:'Go left'}).dispatchEvent('pointerdown',{isPrimary:true,button:0});
 await page.clock.runFor(2600);
 expect(await label(page)).toMatch(/heading left/);
 await page.getByRole('button',{name:'Go up'}).dispatchEvent('pointerdown',{isPrimary:true,button:0});
 await page.clock.runFor(1400);expect(await label(page)).toMatch(/heading up/);
 await page.screenshot({path:'tests/games/maze-muncher/evidence/phone.png'});
 await context.close();
});
