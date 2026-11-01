import {appSettings,backToGames,gameAction,pauseGame,resumeGame} from '../../game-menu';
import {advance,createState,start,enqueue} from '../../../src/games/snake/model';
import {seedStudyTopic} from '../../fixtures';
import { test, expect } from '../../fixtures';
const saved=async(page:import('@playwright/test').Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:snake')!).data);
async function waitForPhoneReady(page:import('@playwright/test').Page){
 await expect(page.locator('.snake-canvas')).toBeVisible();
 await expect(page.getByRole('button',{name:'Start slithering',exact:true})).toBeVisible();
 await expect(page.locator('.snake-pad,[data-direction]')).toHaveCount(0);
}
test('keyboard eating, turning, loss, replay, pause and saved continuation',async({page},testInfo)=>{
 test.setTimeout(60000);
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-19T09:00:00Z')});await page.clock.pauseAt(new Date('2026-10-19T09:00:01Z'));await page.goto('/#/game/snake');
 await expect(page.getByRole('button',{name:'Start slithering'})).toBeVisible();
 await page.keyboard.press('ArrowRight');await page.clock.runFor(690);
 await expect(page.locator('#game-score strong')).toHaveText('10');
 await page.keyboard.press('ArrowUp');await page.clock.runFor(170);
 await pauseGame(page);
 const before=await saved(page);expect(before.direction).toBe('up');expect(before.body[0].y).toBeLessThan(6);expect(before.body[0].y).toBeGreaterThan(5);
 await page.keyboard.press('ArrowLeft');await page.clock.runFor(1000);
 const frozen=await saved(page);expect(frozen).toEqual(before);await expect(page.locator('canvas')).toHaveAttribute('aria-label',new RegExp(`Head column ${Number((before.body[0].x+1).toFixed(3))}, row ${Number((before.body[0].y+1).toFixed(3))}`));
 await page.reload();await expect(page.locator('#game-score strong')).toHaveText('10');await expect(page.locator('canvas')).toHaveAttribute('aria-label',new RegExp(`Head column ${Number((before.body[0].x+1).toFixed(3))}, row ${Number((before.body[0].y+1).toFixed(3))}`));
 await page.clock.runFor(1050);await expect(page.getByRole('button',{name:'Play again',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Play again',exact:true}).click();await expect(page.locator('#game-score strong')).toHaveText('0');
 await page.keyboard.press('d');await page.clock.runFor(170);await page.keyboard.press('s');await page.clock.runFor(170);
 await pauseGame(page);expect((await saved(page)).direction).toBe('down');
 await gameAction(page,'Restart game');await expect(page.getByRole('button',{name:'Start slithering'})).toBeVisible();
 await gameAction(page,'Game rules');await expect(page.locator('#rules-text')).toContainText('tail');await page.getByRole('button',{name:'Let’s play'}).click();
 await appSettings(page);await page.locator('#search').fill('wasd');await expect(page.locator('#search')).toHaveValue('wasd');await page.getByRole('button',{name:'Close menu'}).click();
 await expect(page.locator('.empty-library')).toContainText('No games found');
 await appSettings(page);await page.locator('#search').fill('');await page.getByRole('button',{name:'Close menu'}).click();await page.getByRole('link',{name:'Play Snake',exact:true}).click();await gameAction(page,'Restart game');
 await page.getByRole('button',{name:'Start slithering'}).click();await page.clock.runFor(170);await page.screenshot({path:testInfo.outputPath('desktop.png'),fullPage:true});expect(errors).toEqual([]);
});
test('two native swipes turn the snake and fit a phone without a D-pad',async({browser,browserName},testInfo)=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});await seedStudyTopic(context);const page=await context.newPage();await page.clock.install({time:new Date('2026-10-19T09:00:00Z')});await page.clock.pauseAt(new Date('2026-10-19T09:00:01Z'));await page.goto('/#/game/snake');
 await waitForPhoneReady(page);
 await page.evaluate(()=>{
  const times:Record<string,number>={};(window as unknown as {snakeTouchTimes:Record<string,number>}).snakeTouchTimes=times;
  document.addEventListener('click',event=>{const target=(event.target as HTMLElement).closest('button');if(target?.classList.contains('snake-start'))times.start=performance.now();if(target?.id==='game-menu')times.pause=performance.now();},true);
  document.querySelector('canvas')!.addEventListener('pointerup',()=>{times[times.swipe===undefined?'swipe':'left']=performance.now();},true);
 });
 await page.getByRole('button',{name:'Start slithering'}).tap();await page.clock.runFor(170);
 const box=(await page.locator('.snake-canvas').boundingBox())!;
 const x=box.x+box.width/2,y=box.y+box.height/2;
 if(browserName==='chromium'){
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-65}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }else{
  // CDP is Chromium-only. WebKit exercises the same captured pointer gesture
  // with native captured pointer events.
  await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x,y-65,{steps:4});await page.mouse.up();
 }
 await page.clock.runFor(170);
 if(browserName==='chromium'){
  const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-65,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x-65,y,{steps:4});await page.mouse.up();}
 await page.clock.runFor(170);
 await pauseGame(page);const state=await saved(page);expect(state.direction).toBe('left');
 const times=await page.evaluate(()=>(window as unknown as {snakeTouchTimes:Record<string,number>}).snakeTouchTimes);
 const reference=createState();start(reference);advance(reference,times.swipe-times.start);enqueue(reference,'up');advance(reference,times.left-times.swipe);enqueue(reference,'left');advance(reference,times.pause-times.left);
 expect(state.time).toBeCloseTo(times.pause-times.start,8);expect(state.direction).toBe(reference.direction);expect(state.queue).toEqual(reference.queue);expect(state.ticks).toBe(reference.ticks);
 expect(state.body.length).toBe(reference.body.length);state.body.forEach((p:{x:number;y:number},i:number)=>{expect(p.x).toBeCloseTo(reference.body[i].x,8);expect(p.y).toBeCloseTo(reference.body[i].y,8);});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await resumeGame(page);await page.screenshot({path:testInfo.outputPath('chromium.png'),fullPage:true});await context.close();
});

test.describe('touch import readiness',()=>{
 test.use({hasTouch:true});
 test('phone instrumentation waits for the canvas and start control while the lazy Snake import is held',async({page})=>{
 let release!:()=>void,requested!:()=>void;
 const gate=new Promise<void>(resolve=>{release=resolve;}),held=new Promise<void>(resolve=>{requested=resolve;});
 await page.route('**/src/games/snake/index.ts*',async route=>{requested();await gate;await route.continue();});
 const navigation=page.goto('/#/game/snake');
 try{
  await held;await expect(page.locator('#game-stage .loading')).toBeVisible();
  let ready=false;const controls=waitForPhoneReady(page).then(()=>{ready=true;});
  expect(await page.locator('.snake-canvas').count()).toBe(0);expect(ready).toBe(false);
  release();await navigation;await controls;
  expect(ready).toBe(true);
 }finally{release();}
});

});

test('invalid saves recover and repeated exit/reentry has no stale controls',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.install({time:new Date('2026-10-19T09:00:00Z')});await page.clock.pauseAt(new Date('2026-10-19T09:00:01Z'));
 await page.goto('/');await page.evaluate(()=>localStorage.setItem('pocket-arcade:v1:save:snake',JSON.stringify({version:1,data:{version:1,body:'broken'}})));
 for(let n=0;n<3;n++){
  await page.goto('/#/game/snake');await expect(page.locator('canvas')).toHaveCount(1);
  await gameAction(page,'Restart game');await page.keyboard.press('ArrowRight');await page.clock.runFor(190);
  await pauseGame(page);const s=await saved(page);expect(s.ticks).toBe(1);expect(s.body[0].x).toBeGreaterThan(6);expect(s.body[0].x).toBeLessThan(6.3);expect(s.body[0].y).toBe(6);
  await backToGames(page);await page.clock.runFor(1000);await expect(page.locator('.snake-game')).toHaveCount(0);
 }expect(errors).toEqual([]);
});

test('the original result card and HUD keep the session record after a lower-scoring replay',async({page})=>{
 await page.clock.install({time:new Date('2026-11-01T09:00:00Z')});await page.clock.pauseAt(new Date('2026-11-01T09:00:01Z'));
 await page.goto('/#/game/snake');await page.getByRole('button',{name:'Start slithering',exact:true}).click();await page.clock.runFor(2000);
 const result=page.locator('.snake-card p');
 await expect(page.locator('.snake-card strong')).toHaveText('One more apple?');
 await expect(result).toContainText('10 points · 4 segments.');await expect(page.locator('#game-best strong')).toHaveText('10');
 await page.getByRole('button',{name:'Play again',exact:true}).click();await page.keyboard.press('ArrowUp');await page.clock.runFor(1600);
 await expect(result).toContainText('0 points · 3 segments.');await expect(page.locator('#game-best strong')).toHaveText('10');
});
