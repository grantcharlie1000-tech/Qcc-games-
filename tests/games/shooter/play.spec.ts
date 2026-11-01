import {test,expect,type Page} from '../../fixtures';
import {mkdir} from 'node:fs/promises';

test.setTimeout(180_000);
const route='/#/game/shooter';
const root=(page:Page)=>page.locator('.shooter-game');
async function ready(page:Page){
  await page.goto(route);
  await expect(root(page)).toHaveAttribute('data-ready','true',{timeout:120_000});
}
async function deploy(page:Page){
  await page.locator('#hud-start').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__shooter.state.phase),{timeout:60_000}).toBe('live');
}
async function screenshot(page:Page,name:string){
  if(!process.env.SHOOTER_SHOTS)return;
  await mkdir(process.env.SHOOTER_SHOTS,{recursive:true});
  await page.screenshot({path:`${process.env.SHOOTER_SHOTS}/${name}.png`,timeout:120_000});
}

test('catalog lazily opens Shooter with credit, full surface, and no online UI',async({page})=>{
  const loaded:string[]=[];page.on('request',r=>loaded.push(r.url()));
  await page.goto('/#/collection');
  await expect(page.getByRole('link',{name:'Play Shooter (WIP)',exact:true})).toBeVisible();
  expect(loaded.some(url=>/\/games\/shooter\/(?:index\.ts|main\.js)/.test(url))).toBe(false);
  await page.getByRole('link',{name:'Play Shooter (WIP)',exact:true}).click();
  await expect(root(page)).toHaveAttribute('data-ready','true',{timeout:120_000});
  await expect(page.locator('#hud-menu')).toContainText('Based on Tiny Strike by Guy Zyskind (ISC)');
  await expect(page.locator('#hud-leaderboard-open')).toBeHidden();
  await expect(page.locator('#hud-online-open')).toBeHidden();
  await expect(page.locator('.lb-sidebar')).toHaveCount(0);
  const size=await page.locator('.shooter-game > canvas').boundingBox();
  expect(size?.width).toBe(page.viewportSize()!.width);expect(size?.height).toBe(page.viewportSize()!.height);
  expect(loaded.filter(url=>/workers\.dev|wss?:|\/games\/shooter\/(network|leaderboard)\/|\/\.netlify\/functions\/leaderboard/.test(url))).toEqual([]);
});

test('desktop bots, pointer lock, combat, P pause, Escape Study, resume, and reentry',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await ready(page);await deploy(page);
  expect(await page.evaluate(()=>document.pointerLockElement===(window as any).__shooter.canvas)).toBe(true);
  const bots=await page.evaluate(()=>(window as any).__shooter.bots.all.length);
  expect(bots).toBeGreaterThan(0);
  const start=await page.evaluate(()=>({x:(window as any).__shooter.player.position.x,z:(window as any).__shooter.player.position.z}));
  await page.keyboard.down('w');await page.waitForTimeout(800);await page.keyboard.up('w');
  const end=await page.evaluate(()=>({x:(window as any).__shooter.player.position.x,z:(window as any).__shooter.player.position.z}));
  expect(Math.hypot(start.x-end.x,start.z-end.z)).toBeGreaterThan(.1);
  const ammo=await page.locator('#hud-ammo-mag').textContent();
  await page.mouse.down();await page.waitForTimeout(400);await page.mouse.up();
  await expect(page.locator('#hud-ammo-mag')).not.toHaveText(ammo!);
  await screenshot(page,'desktop-1440x900');
  await page.keyboard.press('p');await expect(root(page)).toHaveAttribute('data-paused','true');
  const frozen=await page.evaluate(()=>(window as any).__shooter.state.timer);
  await page.waitForTimeout(400);expect(await page.evaluate(()=>(window as any).__shooter.state.timer)).toBe(frozen);
  await page.getByRole('button',{name:'Keep playing',exact:true}).click();
  await page.locator('#hud-pause').click();
  await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
  await expect(root(page)).toHaveAttribute('data-paused','true');
  await page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();
  await expect(root(page)).toHaveAttribute('data-paused','false');
  await page.getByRole('link',{name:'Back to game library'}).click();
  expect(await page.evaluate(()=>(window as any).__shooter)).toBeUndefined();
  await ready(page);await page.locator('#hud-start').click();
  await expect(root(page)).toHaveAttribute('data-phase',/freeze|live/);
  expect(errors).toEqual([]);
});

test('phone landscape uses full DSF3, touch movement, aim, fire, and Study',async({browser,browserName})=>{
  test.skip(browserName!=='chromium','Native multi-touch is driven through Chromium CDP.');
  const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const {seedStudyTopic}=await import('../../fixtures');await seedStudyTopic(context);
  const page=await context.newPage();
  try{
    await ready(page);await deploy(page);
    expect(await page.locator('.shooter-game > canvas').evaluate((el:HTMLCanvasElement)=>[el.width,el.height])).toEqual([2532,1170]);
    await expect(page.getByRole('button',{name:'Fire weapon and drag to aim'})).toBeVisible();
    const touch=await context.newCDPSession(page);
    const stick=(await page.locator('.tc-stick').boundingBox())!;
    const sx=stick.x+stick.width/2,sy=stick.y+stick.height/2;
    const start=await page.evaluate(()=>(window as any).__shooter.player.position.clone());
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx,y:sy-42,id:1}]});
    await page.waitForTimeout(700);
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const end=await page.evaluate(()=>(window as any).__shooter.player.position.clone());
    expect(Math.hypot(start.x-end.x,start.z-end.z)).toBeGreaterThan(.1);
    const yaw=await page.evaluate(()=>(window as any).__shooter.player.yaw);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:620,y:170,id:2}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:670,y:180,id:2}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>page.evaluate(()=>(window as any).__shooter.player.yaw)).not.toBe(yaw);
    const fire=(await page.getByRole('button',{name:'Fire weapon and drag to aim'}).boundingBox())!;
    const ammo=await page.locator('#hud-ammo-mag').textContent();
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:fire.x+fire.width/2,y:fire.y+fire.height/2,id:3}]});
    await page.waitForTimeout(300);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect(page.locator('#hud-ammo-mag')).not.toHaveText(ammo!);
    await screenshot(page,'phone-landscape-844x390-dsf3');
    await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
    await expect(root(page)).toHaveAttribute('data-paused','true');
  }finally{await context.close();}
});
