import {seedStudyTopic,test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';

test.use({video:{mode:'on',size:{width:390,height:844}}});

async function frames(page:Page,count=12){await page.evaluate(count=>new Promise<void>(resolve=>{let n=0;function f(){if(++n>=count)resolve();else requestAnimationFrame(f);}requestAnimationFrame(f);}),count);}
async function waitDistance(page:Page,distance:number){await page.waitForFunction(d=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.distance)>=d,distance);}
async function seedCourse(page:Page,distance=24){await page.addInitScript(distance=>localStorage.setItem('pocket-arcade:v1:save:ball-run',JSON.stringify({version:1,data:{version:1,seed:8,run:2,phase:'running',distance,x:0,vx:0,height:.38,vy:0,grounded:true,elapsed:2,best:143,reason:''}})),distance);}

test('real drag and held keys steer; pause, Study, restart, restore, and disposal retain their contracts',async({page})=>{
  await page.clock.install({time:new Date('2026-10-20T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-20T12:00:01Z'));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const game=page.locator('.ball-run'),canvas=game.locator('canvas');
  await page.getByRole('button',{name:'Game rules'}).click();await expect(page.locator('#rules-text')).toContainText('ramps');await page.getByRole('button',{name:'Let’s play'}).click();
  await page.getByRole('button',{name:'Start rolling'}).click();await page.clock.runFor(64);await waitDistance(page,.2);
  // Keep this lifecycle contract on one controlled clock: native input and
  // actionability must not race resumed timer backlogs or course hazards.
  let pointerHeld=false;
  try{
    await page.keyboard.down('ArrowRight');
    try{await page.clock.runFor(250);}finally{await page.keyboard.up('ArrowRight');}
    await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)>.5);
    await canvas.hover();const bounds=(await canvas.boundingBox())!;
    await canvas.evaluate(el=>el.addEventListener('pointerdown',event=>{
      const p=event as PointerEvent;el.setAttribute('data-test-drag',JSON.stringify({id:p.pointerId,x:Number(el.closest<HTMLElement>('.ball-run')!.dataset.x),clientX:p.clientX,clientY:p.clientY,width:el.clientWidth,trusted:p.isTrusted}));
    },{capture:true,once:true}));
    await page.mouse.move(bounds.x+bounds.width*.55,bounds.y+bounds.height*.65);await page.mouse.down();pointerHeld=true;
    const anchor=JSON.parse((await canvas.getAttribute('data-test-drag'))!);expect(anchor.trusted).toBe(true);
    expect(await canvas.evaluate((el,id)=>el.hasPointerCapture(id),anchor.id)).toBe(true);
    // Aim inside the road from the actual native down-event position, rather
    // than assuming the preceding held key stopped at exactly x=.5.
    await page.mouse.move(anchor.clientX+(-.3-anchor.x)/6*anchor.width,anchor.clientY,{steps:8});
    await page.clock.runFor(500);
    await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)<.1);await page.mouse.up();pointerHeld=false;
    expect(await canvas.evaluate((el,id)=>el.hasPointerCapture(id),anchor.id)).toBe(false);
    await page.getByRole('button',{name:'Pause game',exact:true}).click();
    const distance=await game.getAttribute('data-distance'),x=await game.getAttribute('data-x');await page.keyboard.press('ArrowLeft');await page.clock.runFor(200);
    expect(await game.getAttribute('data-distance')).toBe(distance);expect(await game.getAttribute('data-x')).toBe(x);
    await page.getByRole('button',{name:'Keep playing'}).click();
    await page.keyboard.down('ArrowLeft');await page.keyboard.press('Escape');const studyDistance=await game.getAttribute('data-distance');
    await page.keyboard.down('d');await page.clock.runFor(200);expect(await game.getAttribute('data-distance')).toBe(studyDistance);await page.keyboard.up('d');await page.keyboard.up('ArrowLeft');
    await page.getByRole('link',{name:'Games',exact:true}).click();
    await expect(game).toHaveAttribute('data-phase','running');
    await page.keyboard.down('ArrowRight');await page.clock.runFor(10000);await expect(game).toHaveAttribute('data-phase','over',{timeout:10000});await page.keyboard.up('ArrowRight');
    await page.getByRole('button',{name:'Roll again'}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();
    await expect(game).toHaveAttribute('data-phase','ready');await expect(game).toHaveAttribute('data-distance','0.000');
    await page.getByRole('button',{name:'Start rolling'}).click();await page.clock.runFor(400);await waitDistance(page,3);await page.getByRole('button',{name:'Pause game',exact:true}).click();
    const saved=await game.getAttribute('data-distance');await page.reload();await expect(page.getByRole('button',{name:'Continue rolling'})).toBeVisible();await expect(game).toHaveAttribute('data-distance',saved!);
    await page.evaluate(()=>{(window as unknown as {oldBallCanvas:HTMLCanvasElement}).oldBallCanvas=document.querySelector('.ball-run canvas')!;});
    await page.getByRole('link',{name:'Back to game library'}).click();await expect(game).toHaveCount(0);
    expect(await page.evaluate(()=>{const c=(window as unknown as {oldBallCanvas:HTMLCanvasElement}).oldBallCanvas;return c.getContext('webgl2')!.isContextLost();})).toBe(true);
    await page.getByRole('link',{name:'Play Ball Run',exact:true}).click();await expect(page.getByRole('button',{name:'Continue rolling'})).toBeVisible();expect(errors).toEqual([]);
  }finally{
    await page.keyboard.up('ArrowRight');await page.keyboard.up('ArrowLeft');await page.keyboard.up('d');
    if(pointerHeld)await page.mouse.up();await page.clock.resume();
  }
});

test('native phone touch drag steers continuously and cancel releases capture',async({browser,browserName})=>{
  test.skip(browserName!=='chromium','CDP native touch uses Chromium.');
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await seedStudyTopic(context);
  const page=await context.newPage();await page.goto('/#/game/ball-run');await page.getByRole('button',{name:'Start rolling'}).tap();
  const cdp=await context.newCDPSession(page),game=page.locator('.ball-run'),box=(await game.locator('canvas').boundingBox())!;
  const x=box.x+box.width*.4,y=box.y+box.height*.65;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+60,y}]});
  await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)>.55);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await frames(page,30);const before=Number(await game.getAttribute('data-x'));await frames(page,18);const after=Number(await game.getAttribute('data-x'));
  expect(Math.abs(after-before)).toBeLessThan(.1);
  await page.keyboard.down('ArrowLeft');await page.waitForFunction(x=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)<x-.35,after);await page.keyboard.up('ArrowLeft');
  await expect(game).toHaveAttribute('data-phase','running');await context.close();
});

test('a real restored run accelerates through cyan gates and flies then lands across a gap without jumping',async({page})=>{
  await page.setViewportSize({width:390,height:844});await seedCourse(page,24);await page.goto('/#/game/ball-run');
  const game=page.locator('.ball-run');await page.getByRole('button',{name:'Continue rolling'}).click();
  await expect(game.locator('.br-boost')).toBeVisible();
  const bounds=(await game.locator('canvas').boundingBox())!;
  await page.mouse.move(bounds.width*.55,bounds.height*.65);await page.mouse.down();await page.mouse.move(bounds.width*.49,bounds.height*.65,{steps:4});
  await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)<-.08);await page.mouse.up();
  await waitDistance(page,58);
  await page.keyboard.down('d');await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)>.3);await page.keyboard.up('d');
  await waitDistance(page,65.2);await expect(game).toHaveAttribute('data-grounded','false');
  await waitDistance(page,73);await expect(game).toHaveAttribute('data-grounded','true');await expect(game).toHaveAttribute('data-phase','running');
  const ballX=Number(await game.getAttribute('data-ball-screen-x'));expect(ballX).toBeGreaterThan(.2);expect(ballX).toBeLessThan(.8);
  console.log('BALL_RUN_RENDER',await game.evaluate(el=>({calls:(el as HTMLElement).dataset.drawCalls,geometries:(el as HTMLElement).dataset.geometries})));
  const timing=await page.evaluate(()=>new Promise<number[]>(resolve=>{const times:number[]=[];let last=performance.now();function f(t:number){times.push(t-last);last=t;if(times.length===45)resolve(times.slice(1));else requestAnimationFrame(f);}requestAnimationFrame(f);}));
  timing.sort((a,b)=>a-b);console.log('BALL_RUN_RAF_MS',{median:timing[Math.floor(timing.length/2)],p95:timing[Math.floor(timing.length*.95)]});
});

for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`perspective keeps a round ball and fills ${viewport.width}x${viewport.height}`,async({page})=>{
  await page.setViewportSize(viewport);await seedCourse(page,58);await page.goto('/#/game/ball-run');await page.getByRole('button',{name:'Continue rolling'}).click();await frames(page,5);
  const canvas=page.locator('.ball-run canvas'),box=(await canvas.boundingBox())!;
  expect(box.width).toBeCloseTo(viewport.width,0);expect(box.height).toBeCloseTo(viewport.height,0);
  expect(Number(await page.locator('.ball-run').getAttribute('data-aspect'))).toBeCloseTo(viewport.width/viewport.height,4);
  const ballY=Number(await page.locator('.ball-run').getAttribute('data-ball-screen-y'));expect(ballY).toBeGreaterThan(.60);expect(ballY).toBeLessThan(.78);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  await page.screenshot({path:`tests/games/ball-run/evidence/${viewport.width}x${viewport.height}.png`});
});

test('lost WebGL visibly saves and remains stopped until exit and re-entry',async({page})=>{
  await page.goto('/#/game/ball-run');await page.getByRole('button',{name:'Start rolling'}).click();await waitDistance(page,2);
  await page.evaluate(()=>document.querySelector<HTMLCanvasElement>('.ball-run canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.getByRole('heading',{name:'Graphics interrupted'})).toBeVisible();await expect(page.getByRole('button',{name:'Start rolling'})).toBeHidden();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:ball-run')!).data.distance);
  await page.getByRole('link',{name:'Back to game library'}).click();await page.getByRole('link',{name:'Play Ball Run',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue rolling'})).toBeVisible();expect(Number(await page.locator('.ball-run').getAttribute('data-distance'))).toBeCloseTo(saved,2);
});

test('unsupported WebGL gives a visible useful fallback and retains an existing save',async({page})=>{
  await seedCourse(page,58);
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl2')return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;});
  await page.goto('/#/game/ball-run');await expect(page.getByRole('heading',{name:'3D graphics unavailable'})).toBeVisible();await expect(page.getByRole('link',{name:'Choose another game'})).toBeVisible();
  await page.getByRole('link',{name:'Choose another game'}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:ball-run')!).data.distance)).toBe(58);
});

test('procedural rendered blocks collide and repeated restarts release held input and reuse resources',async({page})=>{
  const {createRun,trackAt,section,RADIUS}=await import('../../../src/games/ball-run/model');
  const seed=42,hazard=section(seed,7).obstacles[0],d=7*24+hazard.local;
  const state=createRun(seed);state.phase='running';state.distance=d-3;state.best=200;state.elapsed=10;state.x=trackAt(seed,d).center+hazard.x;state.height=trackAt(seed,state.distance).elevation+RADIUS;
  await page.addInitScript(state=>localStorage.setItem('pocket-arcade:v1:save:ball-run',JSON.stringify({version:1,data:state})),state);
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');await page.getByRole('button',{name:'Continue rolling',exact:true}).click();
  await expect(page.locator('.ball-run')).toHaveAttribute('data-phase','over');await expect(page.locator('.br-heading')).toHaveText('You hit a block');
  await page.getByRole('button',{name:'Restart game',exact:true}).click();const geometries=await page.locator('.ball-run').getAttribute('data-geometries');
  for(let i=0;i<3;i++){
    await page.getByRole('button',{name:'Start rolling',exact:true}).click();await page.keyboard.down('ArrowRight');
    await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)>.2);
    await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();await page.keyboard.up('ArrowRight');
    await expect(page.locator('.ball-run')).toHaveAttribute('data-x','0.000');await expect(page.locator('.ball-run')).toHaveAttribute('data-geometries',geometries!);
  }
  await page.getByRole('button',{name:'Start rolling',exact:true}).click();await waitDistance(page,2);await expect(page.locator('.ball-run')).toHaveAttribute('data-x','0.000');
  await page.screenshot({path:'tests/games/ball-run/evidence/procedural-restart.png'});
});

test('resizing during a held steering key retains keyboard control',async({page})=>{
  await page.clock.install({time:new Date('2026-10-19T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-19T12:00:01Z'));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');await page.getByRole('button',{name:'Start rolling',exact:true}).click();await page.keyboard.down('ArrowRight');await page.clock.runFor(160);
  expect(Number(await page.locator('.ball-run').getAttribute('data-x'))).toBeGreaterThan(.2);await page.setViewportSize({width:768,height:844});await expect(page.locator('.ball-run')).toHaveAttribute('data-aspect',(768/844).toFixed(5));await page.clock.runFor(200);
  const x=Number(await page.locator('.ball-run').getAttribute('data-x'));await page.clock.runFor(120);const after=Number(await page.locator('.ball-run').getAttribute('data-x'));await page.keyboard.up('ArrowRight');expect(after-x).toBeGreaterThan(.3);
});
