import {test,expect} from '../../fixtures';
import {active,drag,freezeClock,gameRoot,running,seedRun} from './helpers';

test.use({hasTouch:true});

test('starts with one Tap to play prompt and the shared dock',async({page})=>{
 await page.goto('/#/game/quadfall');
 await expect(page.getByRole('button',{name:'Tap to play',exact:true})).toBeVisible();
 await expect(page.locator('.game-dock')).toHaveCount(1);
 await expect(page.locator('.game-dock')).toHaveAccessibleName('Game controls');
 await expect(page.locator('.game-hud')).toContainText('Score0');
 await expect(page.locator('.game-hud')).toContainText('Level1');
 await expect(page.locator('.game-hud')).toContainText('Lines0');
 await expect(page.locator('.qf-pad,.qf-header,.qf-guide,.qf-card-label,.qf-stats,.qf-game header,.game-view > header')).toHaveCount(0);
 await expect(page.locator('.qf-game p')).toHaveCount(0);
 await page.getByRole('button',{name:'Tap to play',exact:true}).click();
 await expect(page.locator('.qf-canvas')).toBeFocused();
 await expect(gameRoot(page)).toHaveAttribute('data-phase','running');
});

for(const key of ['Enter','Space'])test(`${key} starts without also hard dropping`,async({page})=>{
 await freezeClock(page);await page.goto('/#/game/quadfall');await page.locator('.qf-canvas').focus();
 await page.keyboard.press(key);
 await expect(gameRoot(page)).toHaveAttribute('data-phase','running');
 await expect(gameRoot(page)).toHaveAttribute('data-score','0');
 await expect(gameRoot(page)).toHaveAttribute('data-locks','0');
});

test('tap rotates once and leaves the page stationary',async({page})=>{
 await page.setViewportSize({width:390,height:844});await running(page);
 const before=await active(page),box=(await page.locator('.qf-canvas').boundingBox())!;
 await page.touchscreen.tap(box.x+box.width*.5,box.y+box.height*.4);await page.clock.runFor(32);
 expect((await active(page)).r).toBe((before.r+1)%4);
 await expect(gameRoot(page)).toHaveAttribute('data-score','0');
 expect(await page.evaluate(()=>({x:scrollX,y:scrollY,overflow:document.documentElement.scrollHeight>innerHeight}))).toEqual({x:0,y:0,overflow:false});
});

test('horizontal drag moves exactly three cells without rotating',async({page})=>{
 await running(page);const before=await active(page);await drag(page,-3.05,0,240);
 expect(await active(page)).toEqual({...before,x:before.x-3});
 await expect(gameRoot(page)).toHaveAttribute('data-score','0');
});

test('slow downward drag soft drops three cells',async({page})=>{
 await running(page);const before=await active(page);await drag(page,0,3.05,420);
 expect(await active(page)).toEqual({...before,y:before.y+3});
 await expect(gameRoot(page)).toHaveAttribute('data-score','3');
 await expect(gameRoot(page)).toHaveAttribute('data-locks','0');
});

test('fast downward flick hard drops exactly once without soft drop or rotate',async({page})=>{
 await running(page);await drag(page,0,4,80);
 await expect(gameRoot(page)).toHaveAttribute('data-score','36');
 await expect(gameRoot(page)).toHaveAttribute('data-locks','1');
 expect(await active(page)).toEqual({id:'I',x:3,y:2,r:0});
});

test('swipe up holds and a second swipe cannot hold the same piece twice',async({page})=>{
 await running(page);await drag(page,0,-2,180);
 await expect(gameRoot(page)).toHaveAttribute('data-hold','T');
 expect((await active(page)).id).toBe('I');
 await drag(page,0,-2,180);expect((await active(page)).id).toBe('I');
 await expect(gameRoot(page)).toHaveAttribute('data-score','0');
});

test('Hold chip swaps a piece once without rotating or dropping',async({page})=>{
 await running(page);await page.getByRole('button',{name:'Hold',exact:true}).tap();
 await expect(gameRoot(page)).toHaveAttribute('data-hold','T');
 await expect(page.getByRole('button',{name:'Hold',exact:true})).toBeDisabled();
 expect(await active(page)).toEqual({id:'I',x:3,y:2,r:0});
 await page.locator('.qf-canvas').focus();await page.keyboard.press('Space');
 await expect(page.getByRole('button',{name:'Hold',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Hold',exact:true}).tap();
 expect((await active(page)).id).toBe('T');
});

test('all keyboard bindings act once, and Escape opens the shared pause menu',async({page})=>{
 await running(page);
 for(const [key,x] of [['ArrowLeft',2],['a',1],['ArrowRight',2],['d',3]] as const){await page.keyboard.press(key);expect((await active(page)).x).toBe(x);}
 for(const [key,r] of [['ArrowUp',1],['x',2],['w',3],['z',2]] as const){await page.keyboard.press(key);expect((await active(page)).r).toBe(r);}
 for(const key of ['ArrowDown','s'])await page.keyboard.press(key);
 expect((await active(page)).y).toBe(4);await expect(gameRoot(page)).toHaveAttribute('data-score','2');
 await page.keyboard.press('c');await expect(gameRoot(page)).toHaveAttribute('data-hold','T');
 await page.keyboard.press('Space');await expect(gameRoot(page)).toHaveAttribute('data-locks','1');
 await page.keyboard.press('Shift');expect((await active(page)).id).toBe('T');
 await page.keyboard.press('Escape');await expect(page.locator('#game-options')).toBeVisible();
 await expect(page.locator('#study-view')).toBeHidden();
 const before=await active(page);await page.clock.runFor(2000);expect(await active(page)).toEqual(before);
 await page.keyboard.press('Escape');await page.clock.runFor(32);await expect(page.locator('#game-options')).toBeHidden();
 await page.clock.runFor(1100);expect((await active(page)).y).toBeGreaterThan(before.y);
});

test('held keys use DAS/ARR and soft drop speeds up',async({page})=>{
 await running(page);await page.keyboard.down('ArrowLeft');expect((await active(page)).x).toBe(2);
 await page.clock.runFor(132);expect((await active(page)).x).toBe(2);
 await page.clock.runFor(18);expect((await active(page)).x).toBe(1);
 await page.clock.runFor(66);expect((await active(page)).x).toBe(0);
 await page.keyboard.up('ArrowLeft');await page.keyboard.down('ArrowDown');
 const y=(await active(page)).y;await page.clock.runFor(100);expect((await active(page)).y).toBeGreaterThanOrEqual(y+2);
 await page.keyboard.up('ArrowDown');
});

test('cancelled gestures and blur do not release actions or leave keys held',async({page})=>{
 await running(page);const board=(await page.locator('.qf-canvas').boundingBox())!;
 await page.mouse.move(board.x+board.width/2,board.y+board.height/2);await page.mouse.down();
 await page.locator('.qf-canvas').dispatchEvent('pointercancel',{pointerId:1,isPrimary:true,pointerType:'mouse'});
 await page.mouse.up();expect((await active(page)).r).toBe(0);
 await page.keyboard.down('ArrowLeft');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
 await page.clock.runFor(400);expect((await active(page)).x).toBe(2);await page.keyboard.up('ArrowLeft');
});

test('restored run waits for Continue and shows a ghost',async({page})=>{
 await freezeClock(page);await seedRun(page);await page.goto('/#/game/quadfall');
 await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
 const before=await active(page);await page.clock.runFor(2000);expect(await active(page)).toEqual(before);
 expect(Number(await gameRoot(page).getAttribute('data-ghost'))).toBeGreaterThan(before.y);
 await page.getByRole('button',{name:'Continue',exact:true}).click();await page.clock.runFor(1100);
 expect((await active(page)).y).toBeGreaterThan(before.y);
});

test('game over shows a glass sheet, preserves best and supports keyboard replay',async({page})=>{
 const board=Array.from({length:22},()=>Array(10).fill(null));
 for(let x=3;x<=6;x++)for(let y=0;y<=3;y++)board[y][x]='O';
 await running(page,{board,active:{id:'O',x:3,y:19,r:0},score:123});await page.keyboard.press('Space');
 const sheet=page.getByRole('dialog',{name:'Game over',exact:true});await expect(sheet).toBeVisible();
 await expect(sheet).toHaveClass(/ui-glass-sheet/);await expect(sheet).toContainText('Score');await expect(sheet).toContainText('Best');
 await expect(sheet.getByRole('button',{name:'Play again'})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>Number(localStorage.getItem('pocket-arcade:v1:best:quadfall')))).toBeGreaterThanOrEqual(123);
 await page.reload();await expect(sheet).toBeVisible();
 await page.keyboard.press('Enter');await expect(gameRoot(page)).toHaveAttribute('data-phase','running');
 await expect(sheet).toBeHidden();await expect(gameRoot(page)).toHaveAttribute('data-score','0');
});

for(const reducedMotion of [false,true])test(`line clear reports unchanged scoring and respects reduced motion ${reducedMotion}`,async({page})=>{
 await page.emulateMedia({reducedMotion:reducedMotion?'reduce':'no-preference'});
 const board=Array.from({length:22},()=>Array(10).fill(null));board[21]=Array.from({length:10},(_,x)=>x===5?null:'O');
 await running(page,{board,active:{id:'I',x:3,y:18,r:1}});await page.keyboard.press('Space');
 await expect(gameRoot(page)).toHaveAttribute('data-lines','1');await expect(gameRoot(page)).toHaveAttribute('data-score','100');
 await expect(page.locator('.game-hud')).toContainText('Lines1');await expect(page.locator('#announcer')).toHaveText('Single clear');
 await expect(gameRoot(page)).toHaveAttribute('data-clearing','true');await page.clock.runFor(200);
 await expect(gameRoot(page)).toHaveAttribute('data-clearing','false');
});

test('rules describe mobile gestures and shared pause',async({page})=>{
 await page.goto('/#/game/quadfall');await page.getByRole('button',{name:'Menu',exact:true}).click();
 await expect(page.getByText('Show touch controls', {exact:true})).toBeHidden();
 await page.getByRole('button',{name:'Game rules',exact:true}).click();
 const rules=page.locator('#rules-text');await expect(rules).toContainText('downward flick');
 await expect(rules).toContainText('swipe up');await expect(rules).toContainText('Escape');
});

test('held Space cannot automatically replay after the hard drop ends a run',async({page})=>{
 const board=Array.from({length:22},()=>Array(10).fill(null));
 for(let x=3;x<=6;x++)for(let y=0;y<=3;y++)board[y][x]='O';
 await running(page,{board,active:{id:'O',x:3,y:19,r:0},score:123});
 await page.keyboard.down('Space');await expect(gameRoot(page)).toHaveAttribute('data-phase','lost');
 await page.keyboard.down('Space');await page.keyboard.up('Space');
 await expect(gameRoot(page)).toHaveAttribute('data-phase','lost');
 await expect(page.getByRole('dialog',{name:'Game over',exact:true})).toBeVisible();
 await page.keyboard.press('Space');await expect(gameRoot(page)).toHaveAttribute('data-phase','running');
});

test('results can be dismissed to reach the shared dock without resetting the lost run',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const board=Array.from({length:22},()=>Array(10).fill(null));
 for(let x=3;x<=6;x++)for(let y=0;y<=3;y++)board[y][x]='O';
 await running(page,{board,active:{id:'O',x:3,y:19,r:0},score:123});await page.keyboard.press('Space');
 const sheet=page.getByRole('dialog',{name:'Game over',exact:true});await expect(sheet).toBeVisible();
 const score=await gameRoot(page).getAttribute('data-score');
 await page.getByRole('button',{name:'Close results',exact:true}).tap();await page.clock.runFor(400);
 await expect(sheet).toBeHidden();await expect(page.getByRole('link',{name:'Games',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Menu',exact:true}).tap();await page.clock.runFor(400);
 await expect(page.locator('#game-options')).toBeVisible();await page.getByRole('button',{name:'Close game menu',exact:true}).tap();await page.clock.runFor(400);
 await expect(sheet).toBeHidden();await expect(gameRoot(page)).toHaveAttribute('data-phase','lost');
 await expect(gameRoot(page)).toHaveAttribute('data-score',score!);
 await page.getByRole('link',{name:'Games',exact:true}).tap();await expect(gameRoot(page)).toHaveCount(0);
});
