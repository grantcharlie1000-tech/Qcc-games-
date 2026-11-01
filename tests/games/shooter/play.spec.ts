import {test,expect,type Page} from '../../fixtures';
import {mkdir} from 'node:fs/promises';

test.setTimeout(360_000);
// The default HDR path is booted by the catalog test. Exercise input using the
// upstream direct-render option on our software WebGL test machine.
const route='/?post=off#/game/shooter';
const root=(page:Page)=>page.locator('.shooter-game');
async function ready(page:Page){
  await page.goto(route);
  await expect(root(page)).toHaveAttribute('data-ready','true',{timeout:120_000});
  // Keep the real loop, bots, DOM HUD and native input running. A full DSF3
  // software frame is expensive; draw explicitly for visual checks below.
  await page.evaluate(()=>{const g=(window as any).__shooter;(window as any).__shooterDraw=g.renderFrame;g.renderFrame=()=>{};});
}
async function deploy(page:Page){
  // Shorten the buy freeze in the fixture; native input and the real update loop
  // still drive play, including on this machine's software WebGL renderer.
  await page.evaluate(()=>(window as any).__shooter.config.MATCH.FREEZE_TIME=.1);
  await page.locator('#hud-start').click();
  await expect.poll(()=>page.evaluate(()=>(window as any).__shooter.state.phase),{timeout:60_000}).toBe('live');
  // The fixture's short freeze can finish before the starting pistol equips.
  await expect.poll(()=>page.evaluate(()=>(window as any).__shooter.weapons._state),{timeout:20_000}).toBe('idle');
}
async function screenshot(page:Page,name:string){
  if(!process.env.SHOOTER_SHOTS)return;
  await mkdir(process.env.SHOOTER_SHOTS,{recursive:true});
  await page.evaluate(()=>(window as any).__shooterDraw());
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

test('P closes the buy panel without also pausing the arcade',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Headless WebKit rejects native pointer lock.');
  await ready(page);await deploy(page);
  await page.keyboard.press('b');await expect(page.locator('#hud-buy')).toBeVisible();
  await page.keyboard.press('p');await expect(page.locator('#hud-buy')).toBeHidden();
  await expect(root(page)).toHaveAttribute('data-paused','false');
});

test('arcade Restart resets an active match',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Native pointer-lock gameplay fixture uses Chromium.');
  await ready(page);await deploy(page);
  await page.evaluate(()=>{const s=(window as any).__shooter.state;s.scores={ct:2,t:1};s.round=4;s.money=50;});
  await page.keyboard.press('p');await expect(root(page)).toHaveAttribute('data-paused','true');
  await page.getByRole('button',{name:'Restart game',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>({round:(window as any).__shooter.state.round,scores:(window as any).__shooter.state.scores}))).toEqual({round:1,scores:{ct:0,t:0}});
});

test('desktop bots, pointer lock, combat, P pause, Escape Study, resume, and reentry',async({page,browserName})=>{
  test.skip(browserName!=='chromium','Headless WebKit rejects native pointer lock.');
  await page.setViewportSize({width:1440,height:900});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await ready(page);await deploy(page);
  expect(await page.evaluate(()=>document.pointerLockElement===(window as any).__shooter.canvas)).toBe(true);
  const bots=await page.evaluate(()=>(window as any).__shooter.bots.all.length);
  expect(bots).toBeGreaterThan(0);
  const start=await page.evaluate(()=>({x:(window as any).__shooter.player.position.x,z:(window as any).__shooter.player.position.z}));
  await page.keyboard.down('w');
  try{await expect.poll(()=>page.evaluate(start=>Math.hypot((window as any).__shooter.player.position.x-start.x,(window as any).__shooter.player.position.z-start.z),start),{timeout:20_000}).toBeGreaterThan(.1);}
  finally{await page.keyboard.up('w');}
  const end=await page.evaluate(()=>({x:(window as any).__shooter.player.position.x,z:(window as any).__shooter.player.position.z}));
  expect(Math.hypot(start.x-end.x,start.z-end.z)).toBeGreaterThan(.1);
  const ammo=await page.locator('#hud-ammo-mag').textContent();
  await page.mouse.down();
  try{await expect(page.locator('#hud-ammo-mag')).not.toHaveText(ammo!,{timeout:20_000});}
  finally{await page.mouse.up();}
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
  await expect(root(page)).toHaveCount(0);
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
    expect(stick.width).toBeGreaterThanOrEqual(100);expect(stick.height).toBeGreaterThanOrEqual(100);
    const sx=stick.x+stick.width/2,sy=stick.y+stick.height/2;
    const start=await page.evaluate(()=>(window as any).__shooter.player.position.clone());
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx,y:sy-42,id:1}]});
    await expect.poll(()=>page.evaluate(start=>Math.hypot((window as any).__shooter.player.position.x-start.x,(window as any).__shooter.player.position.z-start.z),start),{timeout:20_000}).toBeGreaterThan(.1);
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    const end=await page.evaluate(()=>(window as any).__shooter.player.position.clone());
    expect(Math.hypot(start.x-end.x,start.z-end.z)).toBeGreaterThan(.1);
    const yaw=await page.evaluate(()=>(window as any).__shooter.player.yaw);
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:620,y:170,id:2}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:670,y:180,id:2}]});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>page.evaluate(()=>(window as any).__shooter.player.yaw)).not.toBe(yaw);
    const fire=(await page.getByRole('button',{name:'Fire weapon and drag to aim'}).boundingBox())!;
    expect(fire.width).toBeGreaterThanOrEqual(72);expect(fire.height).toBeGreaterThanOrEqual(72);
    const ammo=await page.locator('#hud-ammo-mag').textContent();
    await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:fire.x+fire.width/2,y:fire.y+fire.height/2,id:3}]});
    await expect(page.locator('#hud-ammo-mag')).not.toHaveText(ammo!,{timeout:20_000});
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await screenshot(page,'phone-landscape-844x390-dsf3');
    await page.keyboard.press('Escape');await expect(page.locator('#study-view')).toBeVisible();
    await expect(root(page)).toHaveAttribute('data-paused','true');
  }finally{await context.close();}
});
