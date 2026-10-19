import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
const route='/#/game/animal-stack';
test('aim, stack, pause, save, restore, keyboard and restart on a phone', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(route);
  const game=page.locator('.animal-stack'),canvas=game.locator('canvas');
  await expect(game).toHaveAttribute('data-ready','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  // Real horizontal pointer placement, then release over the island.
  const b=(await canvas.boundingBox())!;
  await page.mouse.move(b.x+b.width*.42,b.y+80);await expect(game).toHaveAttribute('data-aim','151');
  await page.mouse.click(b.x+b.width*.5,b.y+95);
  await expect(game).toHaveAttribute('data-count','1');await expect(game).toHaveAttribute('data-balanced','1');
  await expect(page.locator('#game-score strong')).not.toHaveText('0');
  for(let i=2;i<=4;i++){await canvas.click({position:{x:b.width*.5,y:90}});await expect(game).toHaveAttribute('data-balanced',String(i));}
  const intervals=await page.evaluate(()=>new Promise<number[]>(resolve=>{const samples:number[]=[];let last=performance.now();const frame=(now:number)=>{samples.push(now-last);last=now;if(samples.length===61)resolve(samples.slice(1));else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));
  const sorted=intervals.sort((a,b)=>a-b);writeFileSync('tests/games/animal-stack/evidence/performance.json',JSON.stringify({engine:'system Chromium',samples:60,medianFrameMs:sorted[30],p95FrameMs:sorted[57],note:'Headless shared Linux environment; not a Chromebook hardware measurement.'},null,2));
  await page.screenshot({path:'tests/games/animal-stack/evidence/chromium.png',fullPage:true});
  await page.getByRole('button',{name:'Pause game',exact:true}).click();
  const frozen=await game.getAttribute('data-tick');
  await page.keyboard.press('ArrowLeft');
  await page.evaluate(()=>new Promise<void>(resolve=>{let frames=0;const next=()=>{if(++frames===15)resolve();else requestAnimationFrame(next);};requestAnimationFrame(next);}));
  await expect(game).toHaveAttribute('data-tick',frozen!);await expect(game).toHaveAttribute('data-count','4');
  await page.getByRole('button',{name:'Keep playing',exact:true}).click();
  await canvas.focus();await page.keyboard.press('ArrowRight');await expect(game).toHaveAttribute('data-aim','190');await page.keyboard.press('ArrowLeft');await page.keyboard.press('Space');
  await expect(game).toHaveAttribute('data-balanced','5');
  await page.getByRole('link',{name:'Back to game library',exact:true}).click();
  await page.goto(route);await expect(game).toHaveAttribute('data-balanced','5');
  await expect(game).toHaveAttribute('data-count','5');
  for(let i=0;i<2;i++){await page.getByRole('link',{name:'Back to game library',exact:true}).click();await page.locator('a[href="#/game/animal-stack"]').click();await expect(game).toHaveAttribute('data-count','5');}
  await page.getByRole('button',{name:'Game rules',exact:true}).click();await expect(page.locator('#rules-text')).toContainText('half a second');await page.getByRole('button',{name:'Let’s play',exact:true}).click();
  await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(game).toHaveAttribute('data-count','0');await expect(page.locator('#game-score strong')).toHaveText('0');
  await expect(game).toHaveAttribute('data-ready','true');
  expect(errors).toEqual([]);
});
test('touch release drops, preview is safe at the edge, and a real fall ends the run', async ({browser}) => {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});const page=await context.newPage();await page.goto(route);
  const game=page.locator('.animal-stack'),canvas=game.locator('canvas');await expect(game).toHaveAttribute('data-ready','true');
  await page.getByRole('button',{name:'Aim left',exact:true}).click();await expect(game).toHaveAttribute('data-count','0');
  const b=(await canvas.boundingBox())!;
  await page.touchscreen.tap(b.x+b.width*.5,b.y+90);await expect(game).toHaveAttribute('data-balanced','1');
  await page.touchscreen.tap(b.x+b.width*.07,b.y+90);await expect(game).toHaveAttribute('data-over','true');await expect(game.locator('.animal-stack__result')).toBeVisible();
  await expect(game.getByRole('button',{name:'Tower finished',exact:true})).toBeDisabled();await context.close();
});
