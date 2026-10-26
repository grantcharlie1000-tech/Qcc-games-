import {seedStudyTopic,test,expect} from '../../fixtures';
import type {Locator,Page} from '@playwright/test';
import {CONFIG,STEP,WARMUP,speedAt,type Difficulty,type Gate,type ObstaclePose,type Run} from '../../../src/games/ball-run/config';
import {getCourse} from '../../../src/games/ball-run/course';
import {step} from '../../../src/games/ball-run/model';
import {dayKey,emptyRecords,weekKey,type Records} from '../../../src/games/ball-run/records';
import {placeRun} from './bot';

test.use({video:{mode:'on',size:{width:390,height:844}}});

const SAVE='pocket-arcade:v1:save:ball-run',BEST='pocket-arcade:v1:best:ball-run',EVIDENCE='tests/games/ball-run/evidence';
// Tracked evidence screenshots are refreshed on purpose (BALL_RUN_EVIDENCE=1), not on every run, and only
// by the Chromium project: one engine (and one pixel ratio) for the whole set, never WebKit overwriting it.
const evidence=(page:Page,name:string)=>process.env.BALL_RUN_EVIDENCE&&test.info().project.name==='chromium'?page.screenshot({path:`${EVIDENCE}/${name}`}).then(()=>{}):Promise.resolve();
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
type Box={x:number,y:number,width:number,height:number};
const apart=(a:Box,b:Box)=>b.x>=a.x+a.width||b.x+b.width<=a.x||b.y>=a.y+a.height||b.y+b.height<=a.y;
/** Fully on screen, clear of the shell's corner and bottom controls, nothing cut off, with every button hit for real. */
async function expectClear(page:Page,panel:Locator){
  // Hit tests ignore opacity, so check that the panel has finished entering and is really seen.
  await expect(panel.locator('..')).toHaveCSS('opacity','1');await expect(panel).toHaveCSS('transform','none');
  const box=(await panel.boundingBox())!,size=page.viewportSize()!;
  expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x+box.width).toBeLessThanOrEqual(size.width);expect(box.y+box.height).toBeLessThanOrEqual(size.height-52);
  for(const name of ['Back to game library','Pause game','Resume game','Restart game','Game rules','Open menu','Favourite Ball Run','Rankings']){
    const control=name==='Rankings'?page.locator('.lb-toggle'):page.getByRole(name.startsWith('Back')?'link':'button',{name,exact:true});
    if(!await control.isVisible())continue;
    expect(apart(box,(await control.boundingBox())!),`${name} overlaps the panel`).toBe(true);
  }
  // The panel shows all of its content without falling back to scrolling.
  expect(await panel.evaluate(p=>p.scrollHeight<=p.clientHeight+1&&p.scrollWidth<=p.clientWidth+1)).toBe(true);
  for(const button of await panel.getByRole('button').all())expect(await button.evaluate(b=>{const r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return !!hit&&b.contains(hit);})).toBe(true);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
}

/** A button's white label is outlined in a dark shade of its fill: WCAG contrast of that edge (the first
 * text shadow) against the fill, and of the label's own colour against the edge. */
function labelEdge(button:Locator){
  return button.evaluate(b=>{
    const style=getComputedStyle(b),rgb=(s:string)=>s.match(/[\d.]+/g)!.slice(0,3).map(Number);
    const lum=(c:number[])=>{const [r,g,bl]=c.map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*bl;};
    const ratio=(a:number[],c:number[])=>{const [x,y]=[lum(a),lum(c)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
    const edge=rgb(style.textShadow.match(/rgba?\([^)]*\)/)![0]),fill=rgb(style.backgroundColor);
    return {edge:ratio(edge,fill),label:ratio(rgb(style.color),edge),shadows:style.textShadow.split(/,(?![^(]*\))/).length};
  });
}
async function expectReadableLabel(button:Locator){
  const measured=await labelEdge(button);
  expect(measured.edge,'label edge against the fill').toBeGreaterThanOrEqual(3);expect(measured.label,'label against its edge').toBeGreaterThanOrEqual(7);
  expect(measured.shadows,'an edge on every side').toBeGreaterThanOrEqual(8);
}
/** The speed readout crosses a gate's arch bars, lavender #929bfb (scene.ts's grid colour). Its text is opaque and
 * outlined on all eight sides by a hard, opaque edge: the edge stands out from the bars, and the text from its edge. */
async function expectReadableSpeed(page:Page){
  const measured=await game(page).locator('.br-speed').evaluate(e=>{
    const style=getComputedStyle(e),rgba=(s:string)=>{const v=s.match(/[\d.]+/g)!.map(Number);return [v[0],v[1],v[2],v[3]??1];};
    const lum=(c:number[])=>{const [r,g,bl]=c.slice(0,3).map(v=>{v/=255;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4;});return .2126*r+.7152*g+.0722*bl;};
    const ratio=(a:number[],c:number[])=>{const [x,y]=[lum(a),lum(c)].sort((p,q)=>q-p);return (x+.05)/(y+.05);};
    const text=rgba(style.color),edges=style.textShadow.split(/,(?![^(]*\))/).map(shadow=>{
      const colour=rgba(shadow.match(/rgba?\([^)]*\)/)![0]),[x,y,blur]=shadow.replace(/rgba?\([^)]*\)/,'').trim().split(/\s+/).map(parseFloat);
      return {colour,x,y,blur};
    }).filter(s=>s.blur===0&&s.colour[3]===1&&(s.x!==0||s.y!==0));
    const sides=new Set(edges.map(s=>`${Math.sign(s.x)},${Math.sign(s.y)}`)).size,edge=edges[0]?.colour??[0,0,0,0];
    return {alpha:text[3],sides,bars:ratio(edge,[146,155,251]),text:ratio(text,edge)};
  });
  expect(measured.alpha,'opaque text').toBe(1);expect(measured.sides,'an edge on every side').toBe(8);
  expect(measured.bars,'edge against the arch bars').toBeGreaterThanOrEqual(4.5);expect(measured.text,'text against its edge').toBeGreaterThanOrEqual(7);
}
const announced=(page:Page)=>page.locator('#announcer');
/** Counts the shell's score reports (each one writes the shell record). */
async function countReports(page:Page){
  await page.addInitScript(key=>{const writes:number[]=[],set=Storage.prototype.setItem;(window as unknown as {bestWrites:number[]}).bestWrites=writes;Storage.prototype.setItem=function(this:Storage,k:string,v:string){if(k===key)writes.push(performance.now());return set.call(this,k,v);};},BEST);
  return ()=>page.evaluate(()=>(window as unknown as {bestWrites:number[]}).bestWrites.length);
}
/** The Game Over panel's entrance mid-way: the layer's opacity and the panel's transform. */
const entrance=(over:Locator)=>over.evaluate(p=>({opacity:Number(getComputedStyle(p.parentElement!).opacity),transform:getComputedStyle(p).transform}));
/** A run that has hit a block and finished dying: what a save made at Game Over holds. */
function overRun(seed:number,difficulty:Difficulty){
  const {run,score}=beforeBlock(seed,difficulty),end=simulate(run,2);
  for(let i=0;i<1000&&end.phase!=='over';i++)step(end,0,STEP);
  expect(end.phase).toBe('over');expect(end.score).toBe(score);
  return end;
}

test('a fresh profile opens Medium setup; the slider re-themes it; help explains permanent gates; Play rolls',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page),slider=page.getByRole('slider',{name:'Difficulty'}),play=page.getByRole('button',{name:'Play',exact:true});
  await expect(play).toBeVisible();await expect(root).toHaveAttribute('data-phase','ready');await expect(root).toHaveAttribute('data-difficulty','medium');
  // Behind a panel the canvas is no Tab stop: from the stage, Tab reaches the difficulty first.
  await page.locator('#game-stage').focus();await page.keyboard.press('Tab');await expect(slider).toBeFocused();await expect(root.locator('canvas')).toHaveAttribute('tabindex','-1');
  await expect(slider).toHaveValue('1');await expect(slider).toHaveAttribute('aria-valuetext','Medium');await expect(root.locator('.br-level')).toHaveText('Medium');
  await expect(root.locator('.br-setup .br-face')).toHaveAttribute('data-face','medium');await expect(play).toHaveCSS('background-color','rgb(226, 162, 27)');
  // The recording's 79 and 143 belong to one player, never to a fresh profile.
  expect(await page.locator('body').innerText()).not.toMatch(/\b(79|143)\b/);
  await slider.focus();await page.keyboard.press('ArrowRight');
  await expect(slider).toHaveValue('2');await expect(slider).toHaveAttribute('aria-valuetext','Hard');await expect(root).toHaveAttribute('data-difficulty','hard');
  await expect(root.locator('.br-level')).toHaveText('Hard');await expect(root.locator('.br-setup .br-face')).toHaveAttribute('data-face','hard');await expect(play).toHaveCSS('background-color','rgb(240, 82, 79)');
  await expectReadableLabel(play);
  await page.keyboard.press('Home');await expect(root).toHaveAttribute('data-difficulty','easy');await expect(play).toHaveCSS('background-color','rgb(43, 178, 76)');
  // White on the reference's green and amber is below 3:1: a dark edge in the fill's own hue carries the label.
  await expectReadableLabel(play);
  await page.keyboard.press('ArrowRight');await expect(root).toHaveAttribute('data-difficulty','medium');await expectReadableLabel(play);
  await page.keyboard.press('End');await expect(root).toHaveAttribute('data-difficulty','hard');
  const help=page.getByRole('button',{name:'How to play',exact:true});
  await help.click();await expect(help).toHaveAttribute('aria-expanded','true');await expect(root.locator('.br-help')).toBeVisible();await expect(root.locator('.br-help')).toContainText('permanently');
  await expectClear(page,root.locator('.br-setup'));
  await help.click();await expect(help).toHaveAttribute('aria-expanded','false');await expect(root.locator('.br-help')).toBeHidden();
  // The shell's Restart gives a fresh setup panel with help closed.
  await help.click();await page.getByRole('button',{name:'Restart game',exact:true}).click();
  await expect(help).toHaveAttribute('aria-expanded','false');await expect(root.locator('.br-help')).toBeHidden();await expect(slider).toBeVisible();await expect(root).toHaveAttribute('data-difficulty','hard');
  await page.getByRole('button',{name:'Game rules'}).click();await expect(page.locator('#rules-text')).toContainText('permanently');await page.getByRole('button',{name:'Let’s play'}).click();
  await play.click();await expect(root).toHaveAttribute('data-phase','running');await expect(root.locator('.br-setup')).toBeHidden();
  await expect(root.locator('canvas')).toBeFocused();await expect(root.locator('canvas')).toHaveAttribute('tabindex','0');
  await expect(root.locator('.br-mode-label')).toHaveText('HARD MODE');await expect(root.locator('.br-target-label')).toHaveText('NEW BEST');
  const speed=await data(page,'speed');expect(speed).toBeCloseTo(CONFIG.hard.startSpeed,1);
  await waitDistance(page,15);expect(await data(page,'speed')).toBeGreaterThan(speed);await expect(root.locator('.br-score')).not.toHaveText('0');
  expect(errors).toEqual([]);
});

test('real drag and held keys steer; P pauses and resumes; Study, blur, death and restore keep their contracts',async({page})=>{
  test.setTimeout(180000);
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
    // P is the shell's pause button: label, frozen world, and P again resumes. A key held down
    // through the pause and the resume is released by the pause: it steers only when pressed afresh.
    const held=await data(page,'x');await page.keyboard.down('ArrowRight');await page.clock.runFor(100);expect(await data(page,'x')).toBeGreaterThan(held);
    await page.keyboard.press('p');await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Resume game');
    const distance=await root.getAttribute('data-distance'),x=await root.getAttribute('data-x');await page.keyboard.press('ArrowLeft');await page.clock.runFor(200);
    expect(await root.getAttribute('data-distance')).toBe(distance);expect(await root.getAttribute('data-x')).toBe(x);
    await page.keyboard.press('p');await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Pause game');
    await page.clock.runFor(100);expect(await data(page,'distance')).toBeGreaterThan(Number(distance));
    await page.clock.runFor(300);const resumed=await data(page,'x');await page.clock.runFor(250);expect(Math.abs(await data(page,'x')-resumed)).toBeLessThan(.02);
    await page.keyboard.up('ArrowRight');
    // A key held down into Study and back out is released; keys pressed while reading never reach the game.
    const studied=await data(page,'x');await page.keyboard.down('ArrowLeft');await page.clock.runFor(100);expect(await data(page,'x')).toBeLessThan(studied);
    await page.keyboard.press('Escape');const studyDistance=await root.getAttribute('data-distance');
    await page.keyboard.down('d');await page.clock.runFor(200);expect(await root.getAttribute('data-distance')).toBe(studyDistance);await page.keyboard.up('d');
    await page.getByRole('link',{name:'Games',exact:true}).click();
    await expect(root).toHaveAttribute('data-phase','running');await expect(page.locator('#pause-game')).toHaveAttribute('aria-label','Pause game');
    await page.clock.runFor(400);const settled=await data(page,'x');await page.clock.runFor(250);expect(Math.abs(await data(page,'x')-settled)).toBeLessThan(.02);
    await page.keyboard.up('ArrowLeft');
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
  test.setTimeout(180000);
  const {run,score}=beforeBlock(11,'hard'),records=emptyRecords();records.hard.allTime=score+600;
  await seed(page,snapshot(run,records));
  await page.clock.install({time:new Date()});await page.clock.pauseAt(new Date(Date.now()+1000));
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page),over=root.locator('.br-over');
  await expect(page.getByRole('heading',{name:'Your run is waiting'})).toBeVisible();await expect(root.locator('.br-continue')).toContainText('Hard');await expect(root.locator('.br-continue')).toContainText(`${run.score} m`);
  await expect(root).toHaveAttribute('data-distance',run.distance.toFixed(3));
  // A restored run is announced, not only written to the status line; the canvas behind the panel is no Tab stop.
  await expect(announced(page)).toHaveText(`Saved Hard run at ${run.score} metres. Press Continue to resume.`);await expect(root.locator('canvas')).toHaveAttribute('tabindex','-1');
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await runUntilPhase(page,'dying');await expect(root).toHaveAttribute('data-score',String(score));
  await page.clock.runFor(150);await evidence(page,`collision.png`);
  await runUntilPhase(page,'over');
  // Phase polling can stop on the first entrance frame; move inside the 250 ms animation.
  // Its 50 ms polling slice plus 64 ms still leaves the fade and scale in progress.
  await page.clock.runFor(64);
  // Mid-entrance: fading in and settling from a slightly smaller scale.
  const mid=await entrance(over);expect(mid.opacity).toBeGreaterThan(0);expect(mid.opacity).toBeLessThan(1);expect(mid.transform).toMatch(/^matrix\(0\.9\d*, 0, 0, 0\.9\d*, 0, 0\)$/);
  await page.clock.runFor(400);
  const again=page.getByRole('button',{name:'Play again',exact:true});
  await expect(again).toBeFocused();await expect(root.locator('canvas')).toHaveAttribute('tabindex','-1');
  await expect(page.getByRole('heading',{name:'GAME OVER'})).toBeVisible();await expect(over.locator('.br-reason')).toHaveText('You hit a block');
  await expect(over.locator('.br-final')).toHaveText(String(score));
  await expect(over.locator('.br-badge')).toContainText('HARD');await expect(over.locator('.br-badge .br-face')).toHaveAttribute('data-face','hard');
  const row=(name:string)=>over.locator('.br-row').filter({hasText:name});
  await expect(row('Today’s best').locator('strong')).toHaveText(String(score));await expect(row('Today’s best')).toHaveAttribute('data-new','true');
  await expect(row('Week’s best').locator('strong')).toHaveText(String(score));await expect(row('Week’s best')).toHaveAttribute('data-new','true');
  await expect(row('All-time best').locator('strong')).toHaveText(String(score+600));await expect(row('All-time best')).toHaveAttribute('data-new','false');
  // The final, unthrottled score report reaches the shell record.
  expect(await page.evaluate(key=>Number(localStorage.getItem(key)),BEST)).toBe(score);
  await expectClear(page,over);await evidence(page,`results.png`);
  await expectReadableLabel(again);
  // Reopened at Game Over, the panel keeps this run's NEW markers and crown, with Play again focused as after a live death.
  await page.reload();await expect(page.getByRole('heading',{name:'GAME OVER'})).toBeVisible();await page.clock.runFor(400);
  await expect(over.locator('.br-final')).toHaveText(String(score));await expect(again).toBeFocused();
  await expect(row('Today’s best')).toHaveAttribute('data-new','true');await expect(row('Week’s best')).toHaveAttribute('data-new','true');await expect(row('All-time best')).toHaveAttribute('data-new','false');
  await expect(over.locator('.br-crown')).toBeVisible();
  // R plays again at once on a new course of the same difficulty.
  await page.keyboard.press('r');await expect(root).toHaveAttribute('data-phase','running');await page.clock.runFor(100);
  expect(await data(page,'distance')).toBeLessThan(5);await expect(root).toHaveAttribute('data-difficulty','hard');expect((await saved(page)).run.seed).not.toBe(run.seed);
  // A key held through death stays released after Play again until it is pressed afresh.
  await page.keyboard.down('ArrowRight');await runUntilPhase(page,'over');await expect(over.locator('.br-reason')).toHaveText('You fell off the track');
  await expect(row('Today’s best').locator('strong')).toHaveText(String(score));await expect(row('Today’s best')).toHaveAttribute('data-new','false');
  await page.keyboard.press('r');await page.clock.runFor(300);await expect(root).toHaveAttribute('data-phase','running');await expect(root).toHaveAttribute('data-x','0.000');
  await page.keyboard.up('ArrowRight');await page.keyboard.down('ArrowRight');await runUntilPhase(page,'over');await page.keyboard.up('ArrowRight');
  await expect(again).toBeFocused();
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();await expect(page.getByRole('slider',{name:'Difficulty'})).toHaveValue('2');await expect(root).toHaveAttribute('data-phase','ready');
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeFocused();
  await page.reload();
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();await expect(page.getByRole('slider',{name:'Difficulty'})).toHaveValue('2');
  await page.getByRole('button',{name:'Play',exact:true}).click();await page.clock.runFor(100);
  await expect(root.locator('.br-target-label')).toHaveText('THIS WEEK');await expect(root.locator('.br-target-value')).toHaveText(String(score));
  expect(errors).toEqual([]);
});

test('shell Restart abandoning a run commits its score once, to today’s best and the shell record',async({page})=>{
  // A Wednesday and the Thursday after it: one week, two days.
  const now=new Date(2026,9,21,12),tomorrow=new Date(2026,9,22,12),records=emptyRecords();records.medium={allTime:5000,day:'',dayBest:0,week:weekKey(now),weekBest:4000};
  await seed(page,snapshot(null,records,'medium'));
  // Every shell score report writes storage: count them.
  const reports=await countReports(page);
  await page.clock.install({time:now});await page.clock.pauseAt(new Date(now.getTime()+1000));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page);
  await expect(root).toHaveAttribute('data-difficulty','medium');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(root.locator('.br-target-label')).toHaveText('THIS WEEK');await expect(root.locator('.br-target-value')).toHaveText('4000');
  for(let t=0;t<6000&&await data(page,'distance')<25;t+=50)await page.clock.runFor(50);
  expect(await data(page,'distance')).toBeGreaterThanOrEqual(25);await expect(root).toHaveAttribute('data-phase','running');
  await page.getByRole('button',{name:'Restart game',exact:true}).click();
  await expect(root).toHaveAttribute('data-phase','ready');await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
  // Running reports are at least 250 ms apart; only the final one, at the commit, is not throttled.
  const writes=await page.evaluate(()=>(window as unknown as {bestWrites:number[]}).bestWrites);
  expect(writes.length).toBeGreaterThan(2);
  for(let i=1;i<writes.length-1;i++)expect(writes[i]-writes[i-1]).toBeGreaterThanOrEqual(249);
  const kept=(await saved(page)).records.medium;
  expect(kept.day).toBe(dayKey(now));expect(kept.dayBest).toBeGreaterThanOrEqual(25);expect(kept.weekBest).toBe(4000);expect(kept.allTime).toBe(5000);
  expect(await page.evaluate(key=>Number(localStorage.getItem(key)),BEST)).toBe(kept.dayBest);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(root.locator('.br-target-label')).toHaveText('TODAY');await expect(root.locator('.br-target-value')).toHaveText(String(kept.dayBest));
  // A run abandoned before its first metre has nothing to commit. The clock stands still, so the run is still at 0 m;
  // on the next day a commit would change the records (today's best starts afresh) and report the score again.
  await expect(root).toHaveAttribute('data-phase','running');await expect(root).toHaveAttribute('data-distance','0.000');
  const count=await reports();await page.clock.setSystemTime(tomorrow);
  await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(root).toHaveAttribute('data-phase','ready');
  expect((await saved(page)).records.medium).toEqual(kept);expect(await reports()).toBe(count);
});

const legacySave={version:1,seed:8,run:2,phase:'running',distance:58,x:0,vx:0,height:.38,vy:0,grounded:true,elapsed:2,best:143,reason:''};
test('a legacy save keeps its best as Medium’s all-time record on a new course',async({page})=>{
  await seed(page,legacySave);
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page);
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Continue',exact:true})).toHaveCount(0);
  await expect(page.getByRole('slider',{name:'Difficulty'})).toHaveValue('1');await expect(root.locator('.br-note')).toContainText('143');
  await expect(page.locator('#game-status')).toContainText('143');await expect(announced(page)).toContainText('Your best of 143 m is kept');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(root.locator('.br-mode-label')).toHaveText('MEDIUM MODE');await expect(root.locator('.br-target-label')).toHaveText('ALL TIME');await expect(root.locator('.br-target-value')).toHaveText('143');
});

// Short landscape screens, down to a phone with browser bars: the note gives way, never Play or How to play.
for(const viewport of [{width:568,height:320},{width:667,height:330},{width:568,height:300},{width:640,height:300}])test(`a legacy save's note keeps Play and How to play in view at ${viewport.width}x${viewport.height}`,async({page})=>{
  await seed(page,legacySave);
  await page.setViewportSize(viewport);await page.goto('/#/game/ball-run');
  const root=game(page),setup=root.locator('.br-setup'),note=root.locator('.br-note');
  await expect(note).toContainText('143');await expectClear(page,setup);
  for(const name of ['Play','How to play']){
    const shown=await page.getByRole('button',{name,exact:true}).evaluate(b=>{
      const r=b.getBoundingClientRect(),p=b.closest('.br-panel')!.getBoundingClientRect();
      const inside=r.top>=p.top-.5&&r.bottom<=p.bottom+.5&&r.left>=p.left-.5&&r.right<=p.right+.5&&r.bottom<=innerHeight&&r.right<=innerWidth;
      return inside&&[[.5,.5],[.2,.2],[.8,.2],[.2,.8],[.8,.8]].every(([fx,fy])=>{const hit=document.elementFromPoint(r.x+r.width*fx,r.y+r.height*fy);return !!hit&&b.contains(hit);});
    });
    expect(shown,`${name} is fully visible`).toBe(true);
  }
  // The note gives way only as a last resort (it would scroll): at these sizes all of it shows.
  expect(await note.evaluate(n=>n.clientHeight>0&&n.scrollHeight<=n.clientHeight+1)).toBe(true);
});

test('a legacy save with no best opens the plain setup',async({page})=>{
  await seed(page,{version:2,seed:8,run:2,phase:'running',distance:58,x:0,vx:0,height:.38,vy:0,grounded:true,elapsed:2,best:0,reason:''});
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page);
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'Continue',exact:true})).toHaveCount(0);
  await expect(page.getByRole('slider',{name:'Difficulty'})).toHaveValue('1');await expect(root.locator('.br-note')).toBeHidden();
  await expect(page.locator('#game-status')).toHaveText(/^Choose Easy, Medium or Hard, then press Play\./);
  expect(await page.locator('body').innerText()).not.toMatch(/best of|is kept/i);await expect(announced(page)).not.toContainText('best');
});

test('a restored Game Over shows only the NEW marks its records still confirm',async({page})=>{
  const end=overRun(11,'hard'),now=new Date(),records=emptyRecords();
  // Today's best is this run's score; this week's and all time are higher, so their saved marks are stale.
  records.hard={allTime:end.score+600,day:dayKey(now),dayBest:end.score,week:weekKey(now),weekBest:end.score+5};
  await seed(page,{...snapshot(end,records),marks:{today:true,week:true,allTime:'yes'}});
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page),over=root.locator('.br-over'),row=(name:string)=>over.locator('.br-row').filter({hasText:name});
  await expect(page.getByRole('heading',{name:'GAME OVER'})).toBeVisible();await expect(over.locator('.br-final')).toHaveText(String(end.score));
  await expect(row('Today’s best')).toHaveAttribute('data-new','true');await expect(row('Week’s best')).toHaveAttribute('data-new','false');await expect(row('All-time best')).toHaveAttribute('data-new','false');
  await expect(over.locator('.br-crown')).toBeVisible();
  await expect(page.getByRole('button',{name:'Play again',exact:true})).toBeFocused();await expect(root.locator('canvas')).toHaveAttribute('tabindex','-1');
  // The status line and the announcer give the result and what to do next, in the words of a live death, never the setup prompt.
  const result=`You hit a block. ${end.score} metres. Press R or Play again for a new run.`;
  await expect(page.locator('#game-status')).toHaveText(result);await expect(announced(page)).toHaveText(result);
});

test('under reduced motion Game Over only fades; shell Restart from dying or Game Over never commits twice',async({page})=>{
  test.setTimeout(90000);
  await page.emulateMedia({reducedMotion:'reduce'});
  const {run,score}=beforeBlock(11,'hard'),first=new Date(2026,9,21,12),second=new Date(2026,9,22,12),third=new Date(2026,9,23,12);
  await seed(page,snapshot(run,emptyRecords()));const reports=await countReports(page);
  await page.clock.install({time:first});await page.clock.pauseAt(new Date(first.getTime()+1000));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');
  const root=game(page),over=root.locator('.br-over'),restart=page.getByRole('button',{name:'Restart game',exact:true});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await runUntilPhase(page,'dying');
  const dead=(await saved(page)).records.hard,count=await reports();
  expect(dead.day).toBe(dayKey(first));expect(dead.dayBest).toBe(score);
  // A day later a second commit would set a new today's best, and report the score again.
  await page.clock.setSystemTime(second);await restart.click();
  await expect(root).toHaveAttribute('data-phase','ready');await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
  expect((await saved(page)).records.hard).toEqual(dead);expect(await reports()).toBe(count);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await page.keyboard.down('ArrowRight');await runUntilPhase(page,'over');await page.keyboard.up('ArrowRight');
  // Phase polling can stop on the very frame that starts the entrance (opacity 0).
  // Advance inside its 250 ms fade: the 50 ms polling slice plus 64 ms stays below its end.
  await page.clock.runFor(64);
  // Reduced motion: the panel fades in at full size.
  const mid=await entrance(over);expect(mid.opacity).toBeGreaterThan(0);expect(mid.opacity).toBeLessThan(1);expect(mid.transform).toBe('none');
  await expect(page.getByRole('button',{name:'Play again',exact:true})).toBeFocused();
  await page.clock.runFor(400);await expectClear(page,over);
  expect(await entrance(over)).toEqual({opacity:1,transform:'none'});
  const ended=(await saved(page)).records.hard,count2=await reports();
  expect(ended.day).toBe(dayKey(second));expect(count2).toBeGreaterThan(count);
  await page.clock.setSystemTime(third);await restart.click();await expect(root).toHaveAttribute('data-phase','ready');
  expect((await saved(page)).records.hard).toEqual(ended);expect(await reports()).toBe(count2);
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
  // Inside the arch: the speed readout, which the gate has just raised, stays readable over the arch bars.
  await expect(root.locator('.br-speed')).toBeVisible();await expectReadableSpeed(page);
  await page.clock.runFor(350);await evidence(page,`boost.png`);
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
  await expect(game(page)).toHaveAttribute('data-phase','running');await evidence(page,`curve.png`);
});

for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1366,height:768},{width:1920,height:1080},{width:667,height:330},{width:568,height:320}])test(`fills ${viewport.width}x${viewport.height} with a round ball and keeps every panel on screen`,async({page})=>{
  test.setTimeout(120000);
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
  // The HUD shares the toolbar row, which stops at 1080 px: it stays between back and pause at every width.
  const hud=(await root.locator('.br-hud').boundingBox())!,speed=(await root.locator('.br-speed').boundingBox())!;
  for(const control of [page.getByRole('link',{name:'Back to game library'}),page.getByRole('button',{name:'Pause game',exact:true})])expect(apart(hud,(await control.boundingBox())!)).toBe(true);
  // Centred over the track (the middle of the canvas), unless that would bring it within 12 px of pause;
  // it never does. 1366 px is wide enough to centre; at 1920 px pause (at 1032–1068 px) holds it back.
  const pause=(await page.getByRole('button',{name:'Pause game',exact:true}).boundingBox())!,mid=(b:Box)=>b.x+b.width/2;
  const fits=viewport.width/2+hud.width/2<=pause.x-12;
  expect(hud.x+hud.width).toBeLessThanOrEqual(pause.x-12+.5);
  if(viewport.width===1366)expect(fits).toBe(true);
  if(viewport.width===1920)expect(fits).toBe(false);
  if(fits)expect(Math.abs(mid(hud)-viewport.width/2)).toBeLessThanOrEqual(1);
  expect(Math.abs(mid(speed)-mid(hud))).toBeLessThanOrEqual(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight)).toBe(true);
  await evidence(page,`${viewport.width}x${viewport.height}.png`);
  await page.keyboard.down('ArrowRight');await runUntilPhase(page,'over');await page.keyboard.up('ArrowRight');await page.clock.runFor(400);
  await expectClear(page,root.locator('.br-over'));await evidence(page,`over-${viewport.width}x${viewport.height}.png`);
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expectClear(page,root.locator('.br-setup'));await evidence(page,`setup-${viewport.width}x${viewport.height}.png`);
  await page.getByRole('button',{name:'How to play',exact:true}).click();await expectClear(page,root.locator('.br-setup'));
  // However short the screen, all of the help can be read: the list scrolls to its last line.
  const help=root.locator('.br-help');await help.evaluate(list=>{list.scrollTop=list.scrollHeight;});
  const list=(await help.boundingBox())!,last=(await help.locator('li').last().boundingBox())!;
  expect(last.y+last.height).toBeLessThanOrEqual(list.y+list.height+1);
});

test('lost WebGL visibly saves and remains stopped until exit and re-entry',async({page})=>{
  await page.goto('/#/game/ball-run');await page.getByRole('button',{name:'Play',exact:true}).click();await waitDistance(page,2);
  await page.evaluate(()=>document.querySelector<HTMLCanvasElement>('.ball-run canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  await expect(page.getByRole('heading',{name:'Graphics interrupted'})).toBeVisible();
  // Steering focus moves to the message rather than staying on a dead canvas.
  await expect(page.getByRole('heading',{name:'Graphics interrupted'})).toBeFocused();
  await expect(page.getByRole('button',{name:/^(Play|Continue|Play again)$/})).toHaveCount(0);
  const distance=(await saved(page)).run.distance;
  await frames(page,10);expect((await saved(page)).run.distance).toBe(distance);
  await page.getByRole('link',{name:'Back to game library'}).click();await page.getByRole('link',{name:'Play Ball Run',exact:true}).click();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeVisible();expect(await data(page,'distance')).toBeCloseTo(distance,2);
});

test('losing WebGL while a panel control has focus moves focus to the message',async({page})=>{
  await page.goto('/#/game/ball-run');const slider=page.getByRole('slider',{name:'Difficulty'});
  await slider.focus();await expect(slider).toBeFocused();
  await page.evaluate(()=>document.querySelector<HTMLCanvasElement>('.ball-run canvas')!.getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
  const heading=page.getByRole('heading',{name:'Graphics interrupted'});
  await expect(heading).toBeVisible();await expect(heading).toBeFocused();await expect(heading).toHaveAttribute('tabindex','-1');
  await expect(slider).toBeHidden();
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
  await evidence(page,`procedural-restart.png`);
});

test('resizing during a held steering key retains keyboard control',async({page})=>{
  await page.clock.install({time:new Date('2026-10-19T12:00:00Z')});await page.clock.pauseAt(new Date('2026-10-19T12:00:01Z'));
  await page.setViewportSize({width:390,height:844});await page.goto('/#/game/ball-run');await page.getByRole('button',{name:'Play',exact:true}).click();await page.keyboard.down('ArrowRight');await page.clock.runFor(160);
  expect(await data(page,'x')).toBeGreaterThan(.2);await page.setViewportSize({width:768,height:844});await expect(game(page)).toHaveAttribute('data-aspect',(768/844).toFixed(5));await page.clock.runFor(200);
  const x=await data(page,'x');await page.clock.runFor(120);const after=await data(page,'x');await page.keyboard.up('ArrowRight');expect(after-x).toBeGreaterThan(.3);
});
