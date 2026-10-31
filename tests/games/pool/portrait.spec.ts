import {test,expect,type Page} from '../../fixtures';
import {createGame,type PoolState} from '../../../src/games/pool/model';
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
const state=(page:Page)=>page.evaluate(()=>(window as unknown as {__pool:{state():PoolState}}).__pool.state());
async function point(page:Page,x:number,y:number){const b=(await page.locator('.pool-table').boundingBox())!;return{x:b.x+x/440*b.width,y:b.y+y/840*b.height};}

test('portrait native touch aims, cancels and shoots in unchanged model coordinates',async({page,context,browserName})=>{
  test.skip(browserName!=='chromium','Native touch stream uses CDP');
  await page.clock.install();await page.goto('/#/game/pool');await page.locator('.pool-table').hover();await page.clock.pauseAt(new Date(Date.now()+1000));
  const canvas=page.locator('.pool-table');await expect(canvas).toHaveAttribute('width','880');await expect(canvas).toHaveAttribute('height','1680');
  const white=await canvas.evaluate(el=>Array.from((el as HTMLCanvasElement).getContext('2d')!.getImageData(440,1230,1,1).data));
  expect(Math.min(...white.slice(0,3))).toBeGreaterThan(200);
  const cdp=await context.newCDPSession(page),touch=async(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel',p?:{x:number;y:number})=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{...p,id:1}]:[]});
  await touch('touchStart',await point(page,300,500));await touch('touchEnd');
  expect((await state(page)).angle).toBeCloseTo(Math.atan2(-115,80),2);expect((await state(page)).shots).toBe(0);
  await touch('touchStart',await point(page,220,300));await touch('touchEnd');
  await touch('touchStart',await point(page,220,615));await touch('touchMove',await point(page,220,705));
  await expect(page.locator('.pool-game')).toHaveAttribute('data-gesture','pull');await expect(page.locator('.pool-power-value')).toHaveText('75%');
  await touch('touchCancel');expect((await state(page)).shots).toBe(0);
  await touch('touchStart',await point(page,220,615));await touch('touchMove',await point(page,220,705));await touch('touchEnd');
  const shot=await state(page);expect(shot.shots).toBe(1);expect(shot.angle).toBeCloseTo(-Math.PI/2,2);expect(shot.power).toBeCloseTo(.75,2);
});

test('portrait ball-in-hand uses screen axes and native placement',async({page})=>{
  const saved=createGame('two');saved.break=false;saved.ballInHand=true;
  await page.addInitScript(data=>localStorage.setItem('pocket-arcade:v1:save:pool',JSON.stringify({version:1,data})),saved);
  await page.goto('/#/game/pool');await page.locator('.pool-table').hover();
  await page.locator('.pool-table').focus();await page.keyboard.press('ArrowLeft');await page.keyboard.press('Enter');
  expect((await state(page)).balls.find(b=>b.id===0)!.x).toBe(212);expect((await state(page)).balls.find(b=>b.id===0)!.y).toBe(615);
  await page.reload();
  // Restore a fresh hand through the existing save path, not a production test setter.
  await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:pool',JSON.stringify({version:1,data})),saved);await page.reload();await page.locator('.pool-table').hover();
  const p=await point(page,100,300);await page.touchscreen.tap(p.x,p.y);
  const cue=(await state(page)).balls.find(b=>b.id===0)!;expect(cue.x).toBeCloseTo(100,0);expect(cue.y).toBeCloseTo(300,0);expect((await state(page)).ballInHand).toBe(false);
});

test('rotating the viewport cancels a held pull without changing the rack',async({page})=>{
  await page.goto('/#/game/pool');await page.locator('.pool-table').hover();const before=await state(page),a=await point(page,220,615),b=await point(page,220,705);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y);await expect(page.locator('.pool-game')).toHaveAttribute('data-gesture','pull');
  await page.setViewportSize({width:844,height:390});await page.mouse.up();
  await expect(page.locator('.pool-game')).toHaveAttribute('data-gesture','idle');expect((await state(page)).shots).toBe(0);expect((await state(page)).balls).toEqual(before.balls);
  const box=(await page.locator('.pool-table').boundingBox())!;expect(box.width/box.height).toBeCloseTo(840/440,2);
});

for(const viewport of [{width:320,height:568},{width:390,height:844},{width:568,height:320}])test(`long player labels and ball-in-hand controls fit ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);const saved=createGame('two');saved.break=false;saved.ballInHand=true;
  await page.addInitScript(data=>localStorage.setItem('pocket-arcade:v1:save:pool',JSON.stringify({version:1,data})),saved);
  await page.goto('/#/game/pool');await page.locator('.pool-table').hover();
  // A valid maximum-length display-name fixture exercises the real card CSS.
  await page.locator('.pool-player-identity strong').evaluateAll(nodes=>nodes.forEach(n=>{n.firstChild!.textContent='WWWWWWWWWWWWWWWW (you)';}));
  for(const card of await page.locator('.pool-player').all())expect(await card.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
  const dock=(await page.locator('.game-dock').boundingBox())!;
  for(const el of await page.locator('.pool-table,.pool-inhand,.pool-under,.pool-live').all()){
    if(!await el.isVisible())continue;const r=(await el.boundingBox())!;expect(r.y).toBeGreaterThanOrEqual(0);expect(r.y+r.height).toBeLessThanOrEqual(dock.y-4);
  }
});
