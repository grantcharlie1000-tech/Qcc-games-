import {backToGames,gameAction,pauseGame,resumeGame} from '../../game-menu';
import {seedStudyTopic} from '../../fixtures';
import {test,expect} from '../../fixtures';
import type {Page} from '@playwright/test';
const T=135;
const saved=async(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:snake')!).data);
const label=(page:Page)=>page.locator('canvas.snake-canvas');
const headAt=(page:Page,col:number,row:number)=>expect(label(page)).toHaveAttribute('aria-label',new RegExp(`Head column ${col}, row ${row}\\.`));
async function freshClock(page:Page){await page.clock.install({time:new Date('2026-10-19T09:00:00Z')});await page.clock.pauseAt(new Date('2026-10-19T09:00:01Z'));}
async function open(page:Page){await page.goto('/#/game/snake');await expect(page.getByRole('button',{name:'Start slithering',exact:true})).toBeVisible();await page.clock.runFor(50);}

test('first key starts, eating scores, pause freezes, reload continues, death shows the card after its animation',async({page},testInfo)=>{
 test.setTimeout(90000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await freshClock(page);await page.goto('/#/game/snake');
 await expect(page.getByRole('button',{name:'Start slithering'})).toBeVisible();
 await headAt(page,5,8);
 await page.keyboard.press('ArrowRight');await expect(page.locator('.snake-card')).toBeHidden();await headAt(page,6,8);
 await page.clock.runFor(T*6+40);
 await expect(page.locator('#game-score strong')).toHaveText('10');await expect(page.locator('#game-level')).toContainText('Length 5');
 await page.clock.runFor(60);await page.keyboard.press('ArrowUp');await page.clock.runFor(T);
 await pauseGame(page);
 const before=await saved(page);expect(before.dir).toBe('up');expect(before.version).toBe(3);
 await page.keyboard.press('ArrowLeft');await page.clock.runFor(1000);expect(await saved(page)).toEqual(before);
 await page.reload();await expect(page.locator('#game-score strong')).toHaveText('10');
 await headAt(page,before.body[0].x+1,before.body[0].y+1);
 // Straight up into the wall: one held beat, then the run ends; the card waits for the death animation.
 await page.clock.runFor(T*(before.body[0].y+3));
 await page.clock.runFor(800);;
 await expect(page.getByRole('button',{name:'Play again',exact:true})).toBeVisible();
 await expect(page.locator('.snake-card strong')).toHaveText('One more apple?');
 await expect(page.locator('.snake-card p')).toContainText('10 points · length 5');
 await page.getByRole('button',{name:'Play again',exact:true}).click();await expect(page.locator('#game-score strong')).toHaveText('0');
 await gameAction(page,'Restart game');await expect(page.getByRole('button',{name:'Start slithering'})).toBeVisible();
 await gameAction(page,'Game rules');await expect(page.locator('#rules-text')).toContainText('tail');await page.getByRole('button',{name:'Let’s play'}).click();
 await page.screenshot({path:testInfo.outputPath('desktop.png'),fullPage:true});
 expect(errors).toEqual([]);
});

test('a turn pressed just after passing a square turns at that square; later turns queue',async({page})=>{
 await freshClock(page);await open(page);
 await page.keyboard.press('ArrowRight');await headAt(page,6,8);
 await page.clock.runFor(T+20);await headAt(page,7,8);
 await page.keyboard.press('ArrowUp');await headAt(page,6,7);
 await pauseGame(page);expect((await saved(page)).queue).toEqual([]);await resumeGame(page);
 await page.clock.runFor(T);await page.clock.runFor(70);
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('ArrowDown');
 await pauseGame(page);const s=await saved(page);expect(s.dir).toBe('up');expect(s.queue).toEqual(['left','down']);
});

test('swipes turn while the finger is still down and the board fits a phone without a D-pad',async({browser,browserName},testInfo)=>{
 test.skip(browserName!=='chromium','CDP touch input is Chromium-only.');
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await seedStudyTopic(context);const page=await context.newPage();
 await freshClock(page);await page.goto('/#/game/snake');
 await expect(page.getByRole('button',{name:'Start slithering',exact:true})).toBeVisible();
 await expect(page.locator('.snake-pad,[data-direction]')).toHaveCount(0);
 await page.getByRole('button',{name:'Start slithering'}).tap();await page.clock.runFor(T*2-10);
 const box=(await page.locator('.snake-canvas').boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2;
 const cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-30}]});
 await page.clock.runFor(T*2);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-30,y:y-30}]});
 await pauseGame(page);const s=await saved(page);
 expect(['up','left']).toContain(s.dir);expect(s.dir==='left'||s.queue.includes('left')).toBe(true);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await resumeGame(page);await page.screenshot({path:testInfo.outputPath('chromium.png'),fullPage:true});await context.close();
});

test('reduced motion shows the result card straight away',async({browser})=>{
 const context=await browser.newContext({reducedMotion:'reduce'});await seedStudyTopic(context);const page=await context.newPage();
 await freshClock(page);await open(page);
 await page.keyboard.press('ArrowUp');await page.clock.runFor(T*9+20);
 await expect(page.getByRole('button',{name:'Play again',exact:true})).toBeVisible();
 await expect(page.locator('.snake-card p')).toContainText('0 points · length 4');
 await context.close();
});

test('invalid and old saves recover and repeated exit/reentry has no stale controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await freshClock(page);
 await page.goto('/');await page.evaluate(()=>localStorage.setItem('pocket-arcade:v1:save:snake',JSON.stringify({version:1,data:{version:2,body:'broken'}})));
 for(let n=0;n<3;n++){
  await page.goto('/#/game/snake');await expect(label(page)).toHaveCount(1);
  await gameAction(page,'Restart game');await page.keyboard.press('ArrowRight');await page.clock.runFor(T+10);
  await pauseGame(page);const s=await saved(page);expect(s.ticks).toBe(2);expect(s.body[0]).toEqual({x:6,y:7});
  await backToGames(page);await page.clock.runFor(1000);await expect(page.locator('.snake-game')).toHaveCount(0);
 }
 expect(errors).toEqual([]);
});
