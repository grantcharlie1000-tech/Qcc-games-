import {seedStudyTopic,test,expect} from '../../fixtures';
import type {Locator,Page} from '@playwright/test';
import {CONFIG,STEP,WARMUP,speedAt,type Difficulty,type Gate,type ObstaclePose,type Run} from '../../../src/games/ball-run/config';
import {getCourse} from '../../../src/games/ball-run/course';
import {step} from '../../../src/games/ball-run/model';
import {dayKey,emptyRecords,weekKey,type Records} from '../../../src/games/ball-run/records';
import {placeRun} from './bot';

test.use({video:{mode:'on',size:{width:390,height:844}}});

const SAVE='pocket-arcade:v1:save:ball-run',BEST='pocket-arcade:v1:best:ball-run',EVIDENCE='tests/games/ball-run/evidence';
const game=(page:Page)=>page.locator('.ball-run');
const data=async(page:Page,name:string)=>Number(await game(page).getAttribute(`data-${name}`));
const saved=(page:Page)=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).data,SAVE);
const snapshot=(run:Run|null,records:Records,difficulty:Difficulty=run?.difficulty??'medium')=>({version:4,difficulty,records,run});
async function frames(page:Page,count=12){await page.evaluate(count=>new Promise<void>(resolve=>{let n=0;function f(){if(++n>=count)resolve();else requestAnimationFrame(f);}requestAnimationFrame(f);}),count);}
async function waitDistance(page:Page,distance:number){await page.waitForFunction(d=>Number(document.querySelector<HTMLElement>('.ball-run')?.dataset.distance)>=d,distance);}
/** Runs the paused clock in small slices until the game reaches a phase. */
async function runUntilPhase(page:Page,phase:string,limit=12000){
  for(let t=0;t<limit&&await game(page).getAttribute('data-phase')!==phase;t+=50)await page.clock.runFor(50);
  await expect(game(page)).toHaveAttribute('data-phase',phase);
}
/** Seeds the save once per tab, so a reload restores what the game itself saved. */
async function seed(page:Page,value:unknown){
  await page.addInitScript(([key,value])=>{if(sessionStorage.getItem('ball-run-test-seeded'))return;sessionStorage.setItem('ball-run-test-seeded','1');localStorage.setItem(key,JSON.stringify({version:1,data:value}));},[SAVE,value] as const);
}

// Seeded positions are computed from the real course at test time, never hard-coded.
const blankPose=():ObstaclePose=>({x:0,y:0,distance:0,roll:0,halfWidth:0,halfHeight:0,halfDepth:0});
function simulate(run:Run,seconds:number,until:(run:Run)=>boolean=r=>r.phase!=='running'){const r={...run};for(let i=0;i<seconds/STEP&&!until(r);i++)step(r,0,STEP);return r;}
/** A running run a few metres short of a block that it hits with no input. */
function beforeBlock(seed:number,difficulty:Difficulty){
  const course=getCourse(seed,difficulty),blocks:Parameters<Parameters<typeof course.forEachObstacle>[2]>[0][]=[];
  course.forEachObstacle(250,2500,o=>{if(o.kind==='block')blocks.push(o);});
  for(const o of blocks)for(const back of [4,6,9]){
    const d=o.distance-o.depth/2-back,s=course.sample(d),x=course.pose(o,0,blankPose()).x;
    if(!s.ground||s.tunnel||Math.abs(x-s.center)>s.width/2-.4)continue;
    const run=placeRun(seed,difficulty,d,x),end=simulate(run,2);
    if(end.phase==='dying'&&end.reason==='block')return {run,score:end.score};
  }
  throw new Error(`no block approach on ${difficulty} seed ${seed}`);
}
/** A running run on the centre line 4 m before the first gate `pick` accepts (inside its block-free zone). */
function beforeGate(seed:number,difficulty:Difficulty,pick:(gate:Gate)=>boolean=g=>g.index===0){
  const course=getCourse(seed,difficulty),found:Gate[]=[];
  course.forEachGate(0,40000,g=>{if(!found.length&&pick(g))found.push(g);});
  const gate=found[0];if(!gate)throw new Error(`no such gate on ${difficulty} seed ${seed}`);
  const run=placeRun(seed,difficulty,gate.start-4),through=simulate(run,3,r=>r.phase!=='running'||(r.gateIndex===gate.index&&r.speedUpTime===0));
  expect(through.phase).toBe('running');
  return {run,gate,before:course.speed(gate.start-4),after:course.speed(gate.start+.5)};
}
/** An ordinary block-free straight: flat, unbanked road with nothing 50 m ahead. */
function onStraight(seed:number,difficulty:Difficulty){
  const course=getCourse(seed,difficulty);
  for(let d=10;;d++){
    let clear=true;course.forEachObstacle(d-3,d+50,()=>{clear=false;});
    for(let a=d;a<=d+50&&clear;a+=2){const s=course.sample(a);clear=(s.kind==='warmup'||s.kind==='straight')&&s.bank===0&&s.ground;}
    if(clear)return placeRun(seed,difficulty,d);
  }
}
/** The first bend with no block from 3 m behind to 30 m ahead. */
function onBend(seed:number,difficulty:Difficulty){
  const course=getCourse(seed,difficulty);
  for(let d=WARMUP;;d+=2){
    const s=course.sample(d);if(s.kind!=='bend')continue;
    let clear=true;course.forEachObstacle(d-3,d+30,()=>{clear=false;});
    if(clear)return placeRun(seed,difficulty,d+12);
  }
}
/** Fully on screen, clear of the shell's corner and bottom controls, with every button hit for real. */
async function expectClear(page:Page,panel:Locator){
  // Hit tests ignore opacity, so check that the panel has finished entering and is really seen.
  await expect(panel.locator('..')).toHaveCSS('opacity','1');await expect(panel).toHaveCSS('transform','none');
  const box=(await panel.boundingBox())!,size=page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(size.width);expect(box.y+box.height).toBeLessThanOrEqual(size.height-52);
  for(const name of ['Back to game library','Pause game','Resume game','Restart game','Game rules','Open menu','Favourite Ball Run','Rankings']){
    const control=name==='Rankings'?page.locator('.lb-toggle'):page.getByRole(name.startsWith('Back')?'link':'button',{name,exact:true});
    if(!await control.isVisible())continue;
    const c=(await control.boundingBox())!;
    expect(c.x>=box.x+box.width||c.x+c.width<=box.x||c.y>=box.y+box.height||c.y+c.height<=box.y,`${name} overlaps the panel`).toBe(true);
  }
  for(const button of await panel.getByRole('button').all())expect(await button.evaluate(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&b.contains(hit);})).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
}

test('a fresh profile opens Medium setup; the slider re-themes it; help explains permanent gates; Play rolls',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page),slider=page.getByRole('slider',{name:'Difficulty'}),play=page.getByRole('button',{name:'Play',exact:true});
  await expect(play).toBeVisible();await expect(root).toHaveAttribute('data-phase','ready');await expect(root).toHaveAttribute('data-difficulty','medium');
  await expect(slider).toHaveValue('1');await expect(slider).toHaveAttribute('aria-valuetext','Medium');await expect(root.locator('.br-level')).toHaveText('Medium');
  await expect(root.locator('.br-setup .br-face')).toHaveAttribute('data-face','medium');await expect(play).toHaveCSS('background-color','rgb(226, 162, 27)');
  // The recording's 79 and 143 belong to one player, never to a fresh profile.
  expect(await page.locator('body').innerText()).not.toMatch(/\b(79|143)\b/);
  await slider.focus();await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('2');await expect(slider).toHaveAttribute('aria-valuetext','Hard');await expect(root).toHaveAttribute('data-difficulty','hard');
  await expect(root.locator('.br-level')).toHaveText('Hard');await expect(root.locator('.br-setup .br-face')).toHaveAttribute('data-face','hard');await expect(play).toHaveCSS('background-color','rgb(240, 82, 79)');
  await page.keyboard.press('Home');await expect(root).toHaveAttribute('data-difficulty','easy');await expect(play).toHaveCSS('background-color','rgb(43, 178, 76)');
  await page.keyboard.press('End');await expect(root).toHaveAttribute('data-difficulty','hard');
  const help=page.getByRole('button',{name:'How to play',exact:true});
  await help.click();await expect(help).toHaveAttribute('aria-expanded','true');await expect(root.locator('.br-help')).toBeVisible();await expect(root.locator('.br-help')).toContainText('permanently');
  await expectClear(page,root.locator('.br-setup'));
  await help.click();await expect(help).toHaveAttribute('aria-expanded','false');await expect(root.locator('.br-help')).toBeHidden();
  await page.getByRole('button',{name:'Game rules'}).click();await expect(page.locator('#rules-text')).toContainText('permanently');await page.getByRole('button',{name:'Let’s play'}).click();
  await play.click();await expect(root).toHaveAttribute('data-phase','running');await expect(root.locator('.br-setup')).toBeHidden();
  await expect(root.locator('.br-mode-label')).toHaveText('HARD MODE');await expect(root.locator('.br-target-label')).toHaveText('NEW BEST');
  const speed=await data(page,'speed');expect(speed).toBeCloseTo(CONFIG.hard.startSpeed,1);
  await waitDistance(page,15);expect(await data(page,'speed')).toBeGreaterThan(speed);await expect(root.locator('.br-score')).not.toHaveText('0');
  expect(errors).toEqual([]);
});

test('real drag and held keys steer; P pauses and resumes; Study, blur, death and restore keep their contracts',async({page})=>{
  test.setTimeout(90000);
  await page.clock.install({time:new Date('2026-10-20T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-20T12:00:01Z'));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page),canvas=root.locator('canvas');
  await page.getByRole('button',{name:'Play',exact:true}).click();await page.clock.runFor(64);await waitDistance(page,.2);
  // One controlled clock: native input and actionability never race timer backlogs or the course.
  let pointerHeld=false;
  try{
    await page.keyboard.down('ArrowRight');
    try{await page.clock.runFor(250);}finally{await page.keyboard.up('ArrowRight');}
    await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)>.5);
    await page.clock.runFor(300);const rest=await data(page,'x');
    await canvas.hover();const bounds=(await canvas.boundingBox())!;
    await canvas.evaluate(el=>el.addEventListener('pointerdown',event=>{
      const p=event as PointerEvent;el.setAttribute('data-test-drag',JSON.stringify({id:p.pointerId,x:Number(el.closest<HTMLElement>('.ball-run')!.dataset.x),clientX:p.clientX,clientY:p.clientY,width:el.clientWidth,trusted:p.isTrusted}));
    },{capture:true,once:true}));
    await page.mouse.move(bounds.x+bounds.width*.55,bounds.y+bounds.height*.65);await page.mouse.down();pointerHeld=true;
    const anchor=JSON.parse((await canvas.getAttribute('data-test-drag'))!);expect(anchor.trusted).toBe(true);
    expect(await canvas.evaluate((el,id)=>el.hasPointerCapture(id),anchor.id)).toBe(true);
    // A fresh drag starts from the ball: holding still does not teleport it.
    await page.clock.runFor(150);expect(Math.abs(await data(page,'x')-rest)).toBeLessThan(.05);
    await page.mouse.move(anchor.clientX+(-.3-anchor.x)/6*anchor.width,anchor.clientY,{steps:8});
    await page.clock.runFor(500);
    await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)<.1);await page.mouse.up();pointerHeld=false;
    expect(await canvas.evaluate((el,id)=>el.hasPointerCapture(id),anchor.id)).toBe(false);
    // P is the shell's pause button: label, frozen world, and P again resumes.
    await page.keyboard.press('p');await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Resume game');
    const distance=await root.getAttribute('data-distance'),x=await root.getAttribute('data-x');await page.keyboard.press('ArrowLeft');await page.clock.runFor(200);
    expect(await root.getAttribute('data-distance')).toBe(distance);expect(await root.getAttribute('data-x')).toBe(x);
    await page.keyboard.press('p');await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Pause game');
    await page.clock.runFor(100);expect(await data(page,'distance')).toBeGreaterThan(Number(distance));
    // A key held into Study is released; keys pressed while reading never reach the game.
    await page.keyboard.down('ArrowLeft');await page.clock.runFor(50);await page.keyboard.press('Escape');const studyDistance=await root.getAttribute('data-distance');
    await page.keyboard.down('d');await page.clock.runFor(200);expect(await root.getAttribute('data-distance')).toBe(studyDistance);await page.keyboard.up('d');await page.keyboard.up('ArrowLeft');
    await page.getByRole('link',{name:'Games',exact:true}).click();
    await expect(root).toHaveAttribute('data-phase','running');await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Pause game');
    await page.clock.runFor(400);const settled=await data(page,'x');await page.clock.runFor(250);expect(Math.abs(await data(page,'x')-settled)).toBeLessThan(.02);
    // Losing window focus releases a held key too.
    await page.keyboard.down('d');await page.clock.runFor(100);await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
    await page.clock.runFor(400);const blurred=await data(page,'x');await page.clock.runFor(250);expect(Math.abs(await data(page,'x')-blurred)).toBeLessThan(.02);await page.keyboard.up('d');
    // Off the edge: a fall, a frozen score and the Game Over panel.
    await page.keyboard.down('ArrowRight');await runUntilPhase(page,'dying');const score=await root.getAttribute('data-score');
    await page.clock.runFor(300);await expect(root).toHaveAttribute('data-score',score!);
    await runUntilPhase(page,'over');await page.keyboard.up('ArrowRight');
    await expect(page.getByRole('heading',{name:'GAME OVER'})).toBeVisible();await expect(root.locator('.br-reason')).toHaveText('You fell off the track');
    await page.getByRole('button',{name:'Play again',exact:true}).click();await expect(root).toHaveAttribute('data-phase','running');
    await page.getByRole('button',{name:'Restart game',exact:true}).click();
    await expect(root).toHaveAttribute('data-phase','ready');await expect(root).toHaveAttribute('data-distance','0.000');await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Play',exact:true}).click();await page.clock.runFor(400);await waitDistance(page,3);await page.getByRole('button',{name:'Pause game',exact:true}).click();
    const kept=await root.getAttribute('data-distance');await page.reload();
    await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();await expect(root).toHaveAttribute('data-distance',kept!);
    await expect(page.getByRole('heading',{name:'Your run is waiting'})).toBeVisible();
    await page.evaluate(()=>{(window as unknown as {oldBallCanvas:HTMLCanvasElement}).oldBallCanvas=document.querySelector('.ball-run canvas')!;});
    await page.getByRole('link',{name:'Back to game library'}).click();await expect(root).toHaveCount(0);
    expect(await page.evaluate(()=>{const c=(window as unknown as {oldBallCanvas:HTMLCanvasElement}).oldBallCanvas;return c.getContext('webgl2')!.isContextLost();})).toBe(true);
    await page.getByRole('link',{name:'Play Ball Run',exact:true}).click();await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
    expect(errors).toEqual([]);
  }finally{
    await page.keyboard.up('ArrowRight');await page.keyboard.up('ArrowLeft');await page.keyboard.up('d');
    if(pointerHeld)await page.mouse.up();await page.clock.resume();
  }
});

test('native phone touch drag steers continuously and cancel releases capture',async({browser,browserName})=>{
  test.skip(browserName!=='chromium','CDP native touch uses Chromium.');
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await seedStudyTopic(context);
  const page=await context.newPage();await page.goto('/#/game/ball-run');await page.getByRole('button',{name:'Play',exact:true}).tap();
  const cdp=await context.newCDPSession(page),root=game(page),box=(await root.locator('canvas').boundingBox())!;
  const x=box.x+box.width*.4,y=box.y+box.height*.65;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+60,y}]});
  await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)>.55);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await frames(page,30);const before=Number(await root.getAttribute('data-x'));await frames(page,18);const after=Number(await root.getAttribute('data-x'));
  expect(Math.abs(after-before)).toBeLessThan(.1);
  await page.keyboard.down('ArrowLeft');await page.waitForFunction(x=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)<x-.35,after);await page.keyboard.up('ArrowLeft');
  await expect(root).toHaveAttribute('data-phase','running');await context.close();
});

test('a restored Hard run hits a block: burst, Game Over with records, R and Home, and reload keeps the records',async({page})=>{
  test.setTimeout(90000);
  const {run,score}=beforeBlock(11,'hard'),records=emptyRecords();records.hard.allTime=score+600;
  await seed(page,snapshot(run,records));
  await page.clock.install({time:new Date()});await page.clock.pauseAt(new Date(Date.now()+1000));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page),over=root.locator('.br-over');
  await expect(page.getByRole('heading',{name:'Your run is waiting'})).toBeVisible();await expect(root.locator('.br-continue')).toContainText('Hard');await expect(root.locator('.br-continue')).toContainText(`${run.score} m`);
  await expect(root).toHaveAttribute('data-distance',run.distance.toFixed(3));
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await runUntilPhase(page,'dying');await expect(root).toHaveAttribute('data-score',String(score));
  await page.clock.runFor(150);await page.screenshot({path:`${EVIDENCE}/collision.png`});
  await runUntilPhase(page,'over');await page.clock.runFor(400);
  await expect(page.getByRole('heading',{name:'GAME OVER'})).toBeVisible();await expect(over.locator('.br-reason')).toHaveText('You hit a block');
  await expect(over.locator('.br-final')).toHaveText(String(score));
  await expect(over.locator('.br-badge')).toContainText('HARD');await expect(over.locator('.br-badge .br-face')).toHaveAttribute('data-face','hard');
  const row=(name:string)=>over.locator('.br-row').filter({hasText:name});
  await expect(row('Today’s best').locator('strong')).toHaveText(String(score));await expect(row('Today’s best')).toHaveAttribute('data-new','true');
  await expect(row('Week’s best').locator('strong')).toHaveText(String(score));await expect(row('Week’s best')).toHaveAttribute('data-new','true');
  await expect(row('All-time best').locator('strong')).toHaveText(String(score+600));await expect(row('All-time best')).toHaveAttribute('data-new','false');
  // The final, unthrottled score report reaches the shell record.
  expect(await page.evaluate(key=>Number(localStorage.getItem(key)),BEST)).toBe(score);
  await expectClear(page,over);await page.screenshot({path:`${EVIDENCE}/results.png`});
  // R plays again at once on a new course of the same difficulty.
  await page.keyboard.press('r');await expect(root).toHaveAttribute('data-phase','running');await page.clock.runFor(100);
  expect(await data(page,'distance')).toBeLessThan(5);await expect(root).toHaveAttribute('data-difficulty','hard');expect((await saved(page)).run.seed).not.toBe(run.seed);
  // A key held through death stays released after Play again until it is pressed afresh.
  await page.keyboard.down('ArrowRight');await runUntilPhase(page,'over');await expect(over.locator('.br-reason')).toHaveText('You fell off the track');
  await expect(row('Today’s best').locator('strong')).toHaveText(String(score));await expect(row('Today’s best')).toHaveAttribute('data-new','false');
  await page.keyboard.press('r');await page.clock.runFor(300);await expect(root).toHaveAttribute('data-phase','running');await expect(root).toHaveAttribute('data-x','0.000');
  await page.keyboard.up('ArrowRight');await page.keyboard.down('ArrowRight');await runUntilPhase(page,'over');await page.keyboard.up('ArrowRight');
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();await expect(page.getByRole('slider',{name:'Difficulty'})).toHaveValue('2');await expect(root).toHaveAttribute('data-phase','ready');
  await page.reload();
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();await expect(page.getByRole('slider',{name:'Difficulty'})).toHaveValue('2');
  await page.getByRole('button',{name:'Play',exact:true}).click();await page.clock.runFor(100);
  await expect(root.locator('.br-target-label')).toHaveText('THIS WEEK');await expect(root.locator('.br-target-value')).toHaveText(String(score));
  expect(errors).toEqual([]);
});

test('shell Restart abandoning a run commits its score once, to today’s best and the shell record',async({page})=>{
  const now=new Date(),records=emptyRecords();records.medium={allTime:5000,day:'',dayBest:0,week:weekKey(now),weekBest:4000};
  await seed(page,snapshot(null,records,'medium'));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page);
  await expect(root).toHaveAttribute('data-difficulty','medium');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(root.locator('.br-target-label')).toHaveText('THIS WEEK');await expect(root.locator('.br-target-value')).toHaveText('4000');
  await waitDistance(page,25);
  await page.getByRole('button',{name:'Restart game',exact:true}).click();
  await expect(root).toHaveAttribute('data-phase','ready');await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
  const kept=(await saved(page)).records.medium;
  expect(kept.day).toBe(dayKey(now));expect(kept.dayBest).toBeGreaterThanOrEqual(25);expect(kept.weekBest).toBe(4000);expect(kept.allTime).toBe(5000);
  expect(await page.evaluate(key=>Number(localStorage.getItem(key)),BEST)).toBe(kept.dayBest);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(root.locator('.br-target-label')).toHaveText('TODAY');await expect(root.locator('.br-target-value')).toHaveText(String(kept.dayBest));
  // A run abandoned before its first metre has nothing to commit.
  await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(root).toHaveAttribute('data-phase','ready');
  expect((await saved(page)).records.medium).toEqual(kept);
});

test('a legacy save keeps its best as Medium’s all-time record on a new course',async({page})=>{
  await seed(page,{version:1,seed:8,run:2,phase:'running',distance:58,x:0,vx:0,height:.38,vy:0,grounded:true,elapsed:2,best:143,reason:''});
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page);
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Continue',exact:true})).toHaveCount(0);
  await expect(page.getByRole('slider',{name:'Difficulty'})).toHaveValue('1');await expect(root.locator('.br-note')).toContainText('143');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(root.locator('.br-mode-label')).toHaveText('MEDIUM MODE');await expect(root.locator('.br-target-label')).toHaveText('ALL TIME');await expect(root.locator('.br-target-value')).toHaveText('143');
});

test('a gate is a permanent speed boost with visible Speed Up feedback',async({page})=>{
  const {run,before,after}=beforeGate(5,'hard');
  expect(after-before).toBeGreaterThan(CONFIG.hard.gate.speedGain*.9);
  await seed(page,snapshot(run,emptyRecords()));
  await page.clock.install({time:new Date()});await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page),boost=root.locator('.br-boost');
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();
  await expect(root).toHaveAttribute('data-gates','0');expect(await data(page,'speed')).toBeCloseTo(before,2);
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  for(let i=0;i<60&&await root.getAttribute('data-boost')!=='true';i++)await page.clock.runFor(25);
  await expect(root).toHaveAttribute('data-boost','true');await expect(root).toHaveAttribute('data-gates','1');
  await expect(boost).toBeVisible();await expect(boost).toHaveText('Speed Up');
  await page.clock.runFor(350);await page.screenshot({path:`${EVIDENCE}/boost.png`});
  for(let i=0;i<60&&await root.getAttribute('data-boost')!=='false';i++)await page.clock.runFor(50);
  await expect(root).toHaveAttribute('data-boost','false');await expect(boost).toBeHidden();await expect(root).toHaveAttribute('data-phase','running');
  // The label has gone; the speed it announced stays.
  expect(await data(page,'speed')).toBeGreaterThan(before+CONFIG.hard.gate.speedGain*.9);await expect(root).toHaveAttribute('data-gates','1');
});

test('a gate passed at the speed cap reads Top Speed and adds nothing',async({page})=>{
  const cap=CONFIG.hard.maxSpeed,{run,gate,before,after}=beforeGate(5,'hard',g=>speedAt('hard',g.start,g.index)>=cap);
  expect(before).toBe(cap);expect(after).toBe(cap);
  await seed(page,snapshot(run,emptyRecords()));
  await page.clock.install({time:new Date()});await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page),boost=root.locator('.br-boost');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  for(let i=0;i<60&&await root.getAttribute('data-boost')!=='true';i++)await page.clock.runFor(25);
  await expect(root).toHaveAttribute('data-boost','true');await expect(root).toHaveAttribute('data-gates',String(gate.index+1));
  await expect(boost).toBeVisible();await expect(boost).toHaveText('Top Speed');await expect(root).toHaveAttribute('data-speed',cap.toFixed(2));
});

test('a curve reads as a curve',async({page})=>{
  await seed(page,snapshot(onBend(4,'medium'),emptyRecords()));
  await page.clock.install({time:new Date()});await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.clock.runFor(200);
  await expect(game(page)).toHaveAttribute('data-phase','running');await page.screenshot({path:`${EVIDENCE}/curve.png`});
});

for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`fills ${viewport.width}x${viewport.height} with a round ball and keeps every panel on screen`,async({page})=>{
  test.setTimeout(60000);
  await page.setViewportSize(viewport);await seed(page,snapshot(onStraight(3,'medium'),emptyRecords()));
  await page.clock.install({time:new Date()});await page.clock.pauseAt(new Date(Date.now()+1000));
  await page.goto('/#/game/ball-run');
  const root=game(page);
  await expect(root.locator('.br-continue')).toBeVisible();await expectClear(page,root.locator('.br-continue'));
  await page.getByRole('button',{name:'Continue',exact:true}).click();await page.clock.runFor(100);
  const canvas=root.locator('canvas'),box=(await canvas.boundingBox())!;
  // Rankings float over the game, so the canvas fills the whole viewport at every width.
  expect(box.x).toBeCloseTo(0,0);expect(box.width).toBeCloseTo(viewport.width,0);expect(box.height).toBeCloseTo(viewport.height,0);
  expect(await data(page,'aspect')).toBeCloseTo(viewport.width/viewport.height,4);
  const ballY=await data(page,'ball-screen-y');expect(ballY).toBeGreaterThan(.60);expect(ballY).toBeLessThan(.80);
  await expect(root.locator('.br-hud')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  await page.screenshot({path:`${EVIDENCE}/${viewport.width}x${viewport.height}.png`});
  await page.keyboard.down('ArrowRight');await runUntilPhase(page,'over');await page.keyboard.up('ArrowRight');await page.clock.runFor(400);
  await expectClear(page,root.locator('.br-over'));await page.screenshot({path:`${EVIDENCE}/over-${viewport.width}x${viewport.height}.png`});
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expectClear(page,root.locator('.br-setup'));await page.screenshot({path:`${EVIDENCE}/setup-${viewport.width}x${viewport.height}.png`});
  await page.getByRole('button',{name:'How to play',exact:true}).click();await expectClear(page,root.locator('.br-setup'));
});

test('lost WebGL visibly saves and remains stopped until exit and re-entry',async({page})=>{
  await page.goto('/#/game/ball-run');await page.getByRole('button',{name:'Play',exact:true}).click();await waitDistance(page,2);
  await page.evaluate(()=>document.querySelector<HTMLCanvasElement>('.ball-run canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.getByRole('heading',{name:'Graphics interrupted'})).toBeVisible();
  await expect(page.getByRole('button',{name:/^(Play|Continue|Play again)$/})).toHaveCount(0);
  const distance=(await saved(page)).run.distance;
  await frames(page,10);expect((await saved(page)).run.distance).toBe(distance);
  await page.getByRole('link',{name:'Back to game library'}).click();await page.getByRole('link',{name:'Play Ball Run',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();expect(await data(page,'distance')).toBeCloseTo(distance,2);
});

test('unsupported WebGL gives a visible useful fallback and never overwrites the save',async({page})=>{
  const value=snapshot(onStraight(3,'hard'),emptyRecords());value.records.hard.allTime=321;
  await seed(page,value);
  await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,type:string,...args:unknown[]){if(type==='webgl2')return null;return Reflect.apply(original,this,[type,...args]);} as typeof original;});
  await page.goto('/#/game/ball-run');await expect(page.getByRole('heading',{name:'3D graphics unavailable'})).toBeVisible();await expect(page.getByRole('link',{name:'Choose another game'})).toBeVisible();
  await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();
  await page.getByRole('link',{name:'Choose another game'}).click();
  expect(await saved(page)).toEqual(JSON.parse(JSON.stringify(value)));
});

test('repeated restarts release held input and reuse the same GPU resources',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page);await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
  const geometries=await root.getAttribute('data-geometries');expect(Number(geometries)).toBeGreaterThan(0);
  for(let i=0;i<3;i++){
    await page.getByRole('button',{name:'Play',exact:true}).click();await page.keyboard.down('ArrowRight');
    await page.waitForFunction(()=>Number(document.querySelector<HTMLElement>('.ball-run')!.dataset.x)>.2);
    await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();await page.keyboard.up('ArrowRight');
    await expect(root).toHaveAttribute('data-x','0.000');await expect(root).toHaveAttribute('data-geometries',geometries!);
  }
  await page.keyboard.down('ArrowRight');await page.getByRole('button',{name:'Play',exact:true}).click();await waitDistance(page,2);await page.keyboard.up('ArrowRight');
  await expect(root).toHaveAttribute('data-x','0.000');await expect(root).toHaveAttribute('data-geometries',geometries!);
  expect(Number(await root.getAttribute('data-draw-calls'))).toBeLessThanOrEqual(11);expect(Number(geometries)).toBeLessThanOrEqual(4);
  await page.screenshot({path:`${EVIDENCE}/procedural-restart.png`});
});

test('resizing during a held steering key retains keyboard control',async({page})=>{
  await page.clock.install({time:new Date('2026-10-19T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-19T12:00:01Z'));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');await page.getByRole('button',{name:'Play',exact:true}).click();await page.keyboard.down('ArrowRight');await page.clock.runFor(160);
  expect(await data(page,'x')).toBeGreaterThan(.2);await page.setViewportSize({width:768,height:844});await expect(game(page)).toHaveAttribute('data-aspect',(768/844).toFixed(5));await page.clock.runFor(200);
  const x=await data(page,'x');await page.clock.runFor(120);const after=await data(page,'x');await page.keyboard.up('ArrowRight');expect(after-x).toBeGreaterThan(.3);
});
