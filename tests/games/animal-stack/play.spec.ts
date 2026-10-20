import { test, expect, seedStudyTopic } from '../../fixtures';
import type {Page} from '@playwright/test';
import {AnimalWorld, FLOOR, HEIGHT, WIDTH, TAP_ROTATION_RADIANS} from '../../../src/games/animal-stack/model';
const route='/#/game/animal-stack';
const game=(page:Page)=>page.locator('.animal-stack');
async function waitingPoint(page:Page,aim=180,spawn=HEIGHT*.43){const b=(await game(page).locator('canvas').boundingBox())!,scale=Math.min(b.width/WIDTH,b.height/HEIGHT);return{x:b.x+b.width/2+(aim-WIDTH/2)*scale,y:b.y+b.height*.73-FLOOR*scale+spawn*scale,scale};}
async function loadPose(page:Page,x=230){const world=new AnimalWorld();world.drop();for(let i=0;i<300;i++)world.step();world.nextKind='giraffe';world.aim(x);world.rotateBy(-Math.PI/2);const snapshot=world.snapshot();world.dispose();await page.goto('/');await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:animal-stack',JSON.stringify({version:1,data,updated:Date.now()})),snapshot);await page.goto(route);await expect(game(page)).toHaveAttribute('data-count','1');return snapshot;}

test('only deliberate DROP/Space release; drag, tap, keyboard repeat, save and restart',async({page})=>{
 await page.setViewportSize({width:390,height:844});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(route);await expect(game(page)).toHaveAttribute('data-ready','true');
 const p=await waitingPoint(page);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+40*p.scale,p.y+50*p.scale,{steps:8});await page.mouse.up();await expect(game(page)).toHaveAttribute('data-count','0');await expect(game(page)).toHaveAttribute('data-aim','220');await expect(game(page)).toHaveAttribute('data-angle','0');
 // A canvas tap outside the waiting animal cannot act on dropped bodies or the scene.
 await page.mouse.click(p.x,p.y+180*p.scale);await expect(game(page)).toHaveAttribute('data-count','0');
 await page.mouse.click(p.x+40*p.scale,p.y);await expect(game(page)).toHaveAttribute('data-count','0');if(TAP_ROTATION_RADIANS===null)await expect(game(page)).toHaveAttribute('data-angle','0');else await expect(game(page)).toHaveAttribute('data-angle',String(TAP_ROTATION_RADIANS));
 const canvas=game(page).locator('canvas');await canvas.focus();for(let i=0;i<4;i++)await page.keyboard.press('a');await expect(game(page)).toHaveAttribute('data-aim','180');await page.getByRole('button',{name:'Restart game',exact:true}).click();await canvas.focus();
 await page.keyboard.down('Space');await expect(game(page)).toHaveAttribute('data-count','1');await expect(game(page)).toHaveAttribute('data-balanced','1');await page.keyboard.down('Space');await expect(game(page)).toHaveAttribute('data-count','1');await page.keyboard.up('Space');
 await page.getByRole('button',{name:'Pause game',exact:true}).click();const tick=await game(page).getAttribute('data-tick');await page.keyboard.press('ArrowRight');await page.waitForTimeout(250);await expect(game(page)).toHaveAttribute('data-tick',tick!);await page.getByRole('button',{name:'Keep playing',exact:true}).click();
 await page.getByRole('link',{name:'Back to game library',exact:true}).click();await page.goto(route);await expect(game(page)).toHaveAttribute('data-count','1');await expect(game(page)).toHaveAttribute('data-balanced','1');
 await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(game(page)).toHaveAttribute('data-count','0');await expect(page.locator('#game-score strong')).toHaveText('0');expect(errors).toEqual([]);
});

test('real CDP touch drag/cancel never drops; DROP button releases',async({browser,browserName})=>{
 test.skip(browserName!=='chromium','CDP touch dispatch requires Chromium.');
 const context=await browser.newContext({baseURL:process.env.ARCADE_URL||'http://127.0.0.1:4173',viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});await seedStudyTopic(context);const page=await context.newPage();await page.goto(route);await expect(game(page)).toHaveAttribute('data-ready','true');const p=await waitingPoint(page),cdp=await context.newCDPSession(page);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x+45*p.scale,y:p.y+40*p.scale,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(game(page)).toHaveAttribute('data-aim','225');await expect(game(page)).toHaveAttribute('data-count','0');await expect(game(page)).toHaveAttribute('data-angle','0');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x+45*p.scale,y:p.y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(game(page)).toHaveAttribute('data-count','0');
 await page.getByRole('button',{name:/^Drop /}).tap();await expect(game(page)).toHaveAttribute('data-count','1');await expect(game(page)).toHaveAttribute('data-balanced','1');const aim=await game(page).getAttribute('data-aim');const box=(await game(page).locator('canvas').boundingBox())!;const groundY=box.y+box.height*.73-30*p.scale;await page.touchscreen.tap(p.x+45*p.scale,groundY);await expect(game(page)).toHaveAttribute('data-aim',aim!);await expect(game(page)).toHaveAttribute('data-count','1');await context.close();
});

test('pause cancels a captured gesture without rotation or drop',async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto(route);await expect(game(page)).toHaveAttribute('data-ready','true');const p=await waitingPoint(page),canvas=game(page).locator('canvas');await canvas.evaluate(e=>e.addEventListener('pointerdown',event=>e.setAttribute('data-test-pointer',String((event as PointerEvent).pointerId))));await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+5,p.y);await page.evaluate(()=>document.querySelector<HTMLButtonElement>('#pause-game')!.click());const pointer=Number(await canvas.getAttribute('data-test-pointer'));expect(await canvas.evaluate((e,id)=>e.hasPointerCapture(id),pointer)).toBe(false);await page.mouse.up();await expect(game(page)).toHaveAttribute('data-count','0');await expect(game(page)).toHaveAttribute('data-angle','0');await page.getByRole('button',{name:'Keep playing',exact:true}).click();await expect(game(page)).toHaveAttribute('data-ready','true');});

test('neck-first restored pose really pivots, stable pose earns support, edge fall ends',async({page})=>{
 await page.setViewportSize({width:390,height:844});await loadPose(page,210);await expect(game(page)).toHaveAttribute('data-angle',String(-Math.PI/2));
 // Observe every rendered angle in the browser: the pivot can peak and settle
 // between test-driver polls, especially under concurrent CI rendering.
 await game(page).evaluate(root=>{
  let peak=0;const observer=new MutationObserver(()=>{
   if(root.getAttribute('data-count')!=='2')return;
   peak=Math.max(peak,Math.abs(Number(root.getAttribute('data-body-angle'))+Math.PI/2));root.setAttribute('data-test-peak-pivot',String(peak));
  });observer.observe(root,{attributes:true,attributeFilter:['data-body-angle']});
  (window as unknown as {stopAnimalPivotProbe:()=>void}).stopAnimalPivotProbe=()=>observer.disconnect();
 });
 await game(page).getByRole('button',{name:/^Drop /}).click();await expect(game(page)).toHaveAttribute('data-count','2');
 await expect.poll(async()=>Number(await game(page).getAttribute('data-test-peak-pivot'))).toBeGreaterThan(.4);
 await expect.poll(async()=>Number(await game(page).getAttribute('data-test-peak-pivot'))).toBeGreaterThan(1);
 await page.evaluate(()=>(window as unknown as {stopAnimalPivotProbe:()=>void}).stopAnimalPivotProbe());
 // x180 is a restored-pose fixture that settles wholly above platform on the elephant.
 await loadPose(page,180);await game(page).getByRole('button',{name:/^Drop /}).click();await expect(game(page)).toHaveAttribute('data-balanced','2',{timeout:18000});expect(Number(await game(page).getAttribute('data-body-bottom'))).toBeLessThan(FLOOR-20);
 const world=new AnimalWorld();world.nextKind='penguin';world.aim(0);const snapshot=world.snapshot();world.dispose();await page.goto('/');await page.evaluate(data=>localStorage.setItem('pocket-arcade:v1:save:animal-stack',JSON.stringify({version:1,data,updated:Date.now()})),snapshot);await page.goto(route);await game(page).getByRole('button',{name:/^Drop /}).click();await expect(game(page)).toHaveAttribute('data-over','true');await expect(game(page).getByRole('button',{name:/^Drop /})).toBeDisabled();
});

for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`viewport ${viewport.width}×${viewport.height} fits without game scrolling`,async({page})=>{await page.setViewportSize(viewport);await page.goto(route);await expect(game(page)).toHaveAttribute('data-ready','true');const rect=await game(page).boundingBox();expect(rect!.height).toBeCloseTo(viewport.height);expect(await page.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.scrollHeight])).toEqual([viewport.width,viewport.height]);const button=await game(page).getByRole('button',{name:/^Drop /}).boundingBox();expect(button!.y).toBeGreaterThan(viewport.height*.8);expect(button!.y+button!.height).toBeLessThan(viewport.height);});

for(const key of ['Enter','Space'])test(`holding ${key} on actual DROP cannot release the next animal`,async({page})=>{
 await page.goto(route);await expect(game(page)).toHaveAttribute('data-ready','true');const button=game(page).getByRole('button',{name:/^Drop /});await button.focus();await page.keyboard.down(key);
 // Every deliberate release key has the same down-transition semantics on Canvas and DROP.
 await expect(game(page)).toHaveAttribute('data-count','1');await expect(game(page)).toHaveAttribute('data-balanced','1');await expect(game(page)).toHaveAttribute('data-ready','true');
 // Refocus while still holding the original key, then deliver its real repeated keydown.
 await button.focus();await page.keyboard.down(key);await expect(game(page)).toHaveAttribute('data-count','1');await page.keyboard.up(key);
});

test('held directional keys continue through resize and focus loss stops them',async({page})=>{
 const fixed=new Date('2026-10-20T00:00:00Z');await page.clock.install({time:fixed});await page.clock.pauseAt(fixed);
 await page.goto(route);await expect(game(page)).toHaveAttribute('data-ready','true');await page.clock.runFor(32);
 const canvas=game(page).locator('canvas');await canvas.focus();await page.keyboard.down('d');
 await page.setViewportSize({width:1200,height:800});await page.clock.runFor(500);await page.keyboard.up('d');
 const right=Number(await game(page).getAttribute('data-aim'));expect(right).toBeGreaterThan(210);
 await page.keyboard.down('ArrowLeft');await page.clock.runFor(300);expect(Number(await game(page).getAttribute('data-aim'))).toBeLessThan(right);
 await page.getByRole('button',{name:'Game rules',exact:true}).focus();const frozen=await game(page).getAttribute('data-aim');
 await page.clock.runFor(250);await expect(game(page)).toHaveAttribute('data-aim',frozen!);await page.keyboard.up('ArrowLeft');
});
