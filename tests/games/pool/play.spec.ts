import {test,expect} from '../../fixtures';
import {directShot} from './helpers';
test.beforeEach(async({page})=>{await page.goto('/#/game/pool');await expect(page.locator('.pool-game')).toBeVisible();});
test('trackpad aim, power, real break, pause, mode and restart at phone width',async({page})=>{
 test.setTimeout(45000);await page.setViewportSize({width:390,height:844});await page.getByLabel('Players').selectOption('two');const root=page.locator('.pool-game'),canvas=page.getByRole('img',{name:/Billiards table/});
 await expect(root).toHaveAttribute('data-shots','0');
 await directShot(page,-Math.PI/2,1);await expect(root).toHaveAttribute('data-shots','1');await expect(root).toHaveAttribute('data-phase','moving');
 await page.getByRole('button',{name:'Pause game',exact:true}).click();const before=await root.getAttribute('data-table');await expect(root).toHaveAttribute('data-gesture','idle');await page.waitForTimeout(180);expect(await root.getAttribute('data-table')).toBe(before);
 await page.getByRole('button',{name:'Keep playing'}).click();await expect(root).toHaveAttribute('data-phase','aim',{timeout:20000});await expect(page.locator('.pool-message')).not.toHaveText(/Balls rolling/);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByLabel('Players').selectOption('two');await expect(root).toHaveAttribute('data-shots','0');await expect(page.locator('.pool-player').nth(1)).toContainText('Player 2');
 await canvas.focus();const angle=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:pool')!).data.angle);await page.keyboard.press('ArrowRight');expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:pool')!).data.angle)).not.toBe(angle);
 await directShot(page);await expect(root).toHaveAttribute('data-shots','1');await page.getByRole('button',{name:'Restart game'}).click();await expect(root).toHaveAttribute('data-shots','0');await expect(root).toHaveAttribute('data-phase','aim');
 await page.getByRole('button',{name:'Game rules'}).click();await expect(page.locator('#rules-text')).toContainText('Local simplifications');await page.getByRole('button',{name:'Let’s play'}).click();

});
test('save preserves an aimed live shot through exit and restores without duplicate input',async({page})=>{
 const root=page.locator('.pool-game');await page.getByLabel('Players').selectOption('two');await directShot(page,-Math.PI/2,.7);await expect(root).toHaveAttribute('data-shots','1');
 await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.clock.install();await page.clock.pauseAt(new Date(Date.now()+100));const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:pool')!).data);expect(saved.phase).toBe('moving');expect(saved.shots).toBe(1);await page.getByRole('link',{name:'Back to game library'}).click();await page.getByRole('link',{name:'Play Pool',exact:true}).click();await expect(root).toHaveAttribute('data-shots','1');await page.getByRole('button',{name:'Pause game',exact:true}).click();const restored=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:pool')!).data);expect(restored.shots).toBe(1);expect(restored.balls.filter((b:{pocketed:boolean})=>b.pocketed).length).toBe(saved.balls.filter((b:{pocketed:boolean})=>b.pocketed).length);expect(restored.balls).toEqual(saved.balls);
 await page.clock.resume();await page.reload();await expect(root).toHaveAttribute('data-shots','1');await expect(page.getByLabel('Players')).toHaveValue('two');await page.getByRole('button',{name:'Restart game'}).click();await expect(root).toHaveAttribute('data-shots','0');await directShot(page);await expect(root).toHaveAttribute('data-shots','1');
});
test('computer opponent takes a genuine offline reply after a deliberately missed break',async({page})=>{const root=page.locator('.pool-game');await directShot(page,Math.PI/2,.25);await expect(root).toHaveAttribute('data-shots','2',{timeout:15000});await expect(page.locator('.pool-player').nth(1)).toContainText('Computer');});
test('scratch gives ball-in-hand and a trackpad click places a non-overlapping cue',async({page})=>{
 await page.setViewportSize({width:844,height:390});
 const {createGame}=await import('../../../src/games/pool/model');const fixture=createGame('two');fixture.break=false;fixture.groups=['solids','stripes'];fixture.balls[0].x=100;fixture.balls[0].y=420;for(const b of fixture.balls)if(b.id!==0&&b.id!==8)b.pocketed=true;fixture.balls[1].pocketed=false;fixture.balls[1].x=220;fixture.balls[1].y=300;fixture.balls[8].x=280;fixture.balls[8].y=250;
 await page.getByRole('link',{name:'Back to game library'}).click();await expect(page.getByRole('link',{name:'Play Pool',exact:true})).toBeVisible();await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:pool',JSON.stringify({version:1,data})),fixture);await page.getByRole('link',{name:'Play Pool',exact:true}).click();await expect(page.locator('.pool-game')).toHaveAttribute('data-shots','0');await directShot(page,Math.PI,.35);await expect(page.locator('.pool-inhand')).toBeVisible();await expect(page.locator('.pool-message')).toContainText('Scratch');await expect(page.locator('.pool-game')).toHaveAttribute('data-turn','1');
 await expect.poll(async()=>{const r=(await page.locator('.pool-game').boundingBox())!;return r.y>=0&&r.y+r.height<=391;}).toBe(true);
 const canvas=page.locator('.pool-table');const box=(await canvas.boundingBox())!;
 // Compare with native delivered coordinates: one CSS pixel spans multiple model units when fitted.
 await canvas.evaluate(el=>el.addEventListener('pointerdown',event=>{
  const p=event as PointerEvent,r=el.getBoundingClientRect();el.setAttribute('data-test-placement',JSON.stringify({clientX:p.clientX,clientY:p.clientY,left:r.left,top:r.top,width:r.width,height:r.height,trusted:p.isTrusted}));
 },{capture:true,once:true}));
 const point={x:Math.floor(box.x+240/840*box.width),y:Math.floor(box.y+180/440*box.height)};
 await page.mouse.click(point.x,point.y);await expect(page.locator('.pool-inhand')).toBeHidden();
 const delivered=JSON.parse((await canvas.getAttribute('data-test-placement'))!);expect(delivered.trusted).toBe(true);expect(delivered.clientX).toBe(point.x);expect(delivered.clientY).toBe(point.y);
 const expected={x:(delivered.clientY-delivered.top)*440/delivered.height,y:840-(delivered.clientX-delivered.left)*840/delivered.width};
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:pool')!).data);
 expect(state.balls[0].x).toBeCloseTo(expected.x,0);expect(state.balls[0].y).toBeCloseTo(expected.y,0);

});
for(const [pocket,winner] of [['2','Player 1'],['0','Player 2']])test(`actual 8-ball pot with called pocket ${pocket} awards ${winner}`,async({page})=>{
 const {createGame}=await import('../../../src/games/pool/model');const fixture=createGame('two');fixture.break=false;fixture.groups=['solids','stripes'];for(const b of fixture.balls)if(b.id!==0&&b.id!==8)b.pocketed=true;fixture.balls[0].x=220;fixture.balls[0].y=420;fixture.balls[8].x=110;fixture.balls[8].y=420;
 await page.getByRole('link',{name:'Back to game library'}).click();await expect(page.getByRole('link',{name:'Play Pool',exact:true})).toBeVisible();await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:pool',JSON.stringify({version:1,data})),fixture);await page.getByRole('link',{name:'Play Pool',exact:true}).click();await expect(page.locator('.pool-live')).toContainText('group is clear');await page.getByLabel('8-ball pocket').selectOption(pocket);await directShot(page,Math.PI,.38);await expect(page.locator('.pool-game')).toHaveAttribute('data-phase','over');await expect(page.locator('.pool-message')).toContainText(`${winner} won`);await expect(page.locator('.pool-game')).toHaveAttribute('data-gesture','idle');await page.reload();await expect(page.locator('.pool-game')).toHaveAttribute('data-phase','over');
});

test('off-centre side-pocket shot drops through the visible opening',async({page})=>{
 const {createGame}=await import('../../../src/games/pool/model');
 const fixture=createGame('two');fixture.break=false;fixture.groups=['solids','stripes'];
 for(const b of fixture.balls)if(b.id!==0&&b.id!==1&&b.id!==8)b.pocketed=true;
 Object.assign(fixture.balls[0],{x:220,y:434});
 Object.assign(fixture.balls[1],{x:110,y:434});
 Object.assign(fixture.balls[8],{x:280,y:250});
 await page.getByRole('link',{name:'Back to game library'}).click();
 await expect(page.getByRole('link',{name:'Play Pool',exact:true})).toBeVisible();
 await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:pool',JSON.stringify({version:1,data})),fixture);
 await page.getByRole('link',{name:'Play Pool',exact:true}).click();
 await directShot(page,Math.PI,.38);
 const root=page.locator('.pool-game');
 await expect(root).toHaveAttribute('data-shots','1');
 await expect(root).toHaveAttribute('data-phase','aim',{timeout:15000});
 await expect(page.locator('.pool-message')).toContainText('Good pot');
 await expect(root).toHaveAttribute('data-turn','0');
 const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:pool')!).data);
 expect(state.balls.find((b:{id:number})=>b.id===1).pocketed).toBe(true);
 expect(state.ballInHand).toBe(false);
});
