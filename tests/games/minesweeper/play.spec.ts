import {test,expect} from '@playwright/test';
import {writeFileSync} from 'node:fs';
import type {Page} from '@playwright/test';
import {create,reveal} from '../../../src/games/minesweeper/model';
const url='/#/game/minesweeper';
const cell=(page:Page,i:number)=>page.locator(`.ms-tile[data-index="${i}"]`);
async function fixture(page:Page,seed=7){
  const b=create('beginner',seed);await page.addInitScript(data=>{if(!localStorage.getItem('pocket-arcade:v1:save:minesweeper'))localStorage.setItem('pocket-arcade:v1:save:minesweeper',JSON.stringify({version:1,data}));},b);
  await page.goto(url);await expect(cell(page,0)).toBeVisible();return b;
}
test('mouse, keyboard, flags, pause, restart and saved progress',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const b=await fixture(page);
  await page.evaluate(()=>document.addEventListener('contextmenu',e=>{document.documentElement.dataset.msContextPrevented=String(e.defaultPrevented);}));
  await cell(page,0).click({button:'right'});
  await expect(page.locator('html')).toHaveAttribute('data-ms-context-prevented','true');await expect(cell(page,0)).toHaveAttribute('data-state','flagged');
  await cell(page,0).click();await expect(cell(page,0)).toHaveAttribute('data-state','flagged');
  await cell(page,0).click({button:'right'});await cell(page,40).click();reveal(b,40);
  await expect(cell(page,40)).toHaveAttribute('data-state','open');
  const hidden=b.revealed.findIndex(v=>!v);await cell(page,hidden).focus();await page.keyboard.press('f');
  await expect(cell(page,hidden)).toHaveAttribute('data-state','flagged');
  await page.keyboard.press('ArrowRight');await expect(cell(page,hidden+1)).toBeFocused();
  const beforePause=await cell(page,0).getAttribute('data-state');await page.getByRole('button',{name:'Pause game',exact:true}).click();const time=await page.locator('.ms-time').textContent();
  await page.waitForTimeout(1100);expect(await page.locator('.ms-time').textContent()).toBe(time);
  await cell(page,0).dispatchEvent('click');await expect(cell(page,0)).toHaveAttribute('data-state',beforePause!);
  await page.getByRole('button',{name:'Resume game',exact:true}).click();
  await page.getByRole('link',{name:'Back to game library'}).click();await page.goto(url);
  await expect(cell(page,hidden)).toHaveAttribute('data-state','flagged');await expect(cell(page,40)).toHaveAttribute('data-state','open');
  await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();
  await expect(page.locator('.ms-tile[data-state="open"]')).toHaveCount(0);await expect(page.locator('.ms-time')).toHaveText('00:00');
  await page.getByRole('button',{name:'Game rules'}).click();await expect(page.locator('#rules-text')).toContainText('all safe');
  expect(errors).toEqual([]);
});
test('reveal all safe cells wins; mine loss and correct chord',async({page})=>{
  const b=await fixture(page);await cell(page,40).click();reveal(b,40);
  const {neighbors}=await import('../../../src/games/minesweeper/model');
  const numbered=b.cells.findIndex((v,i)=>v>0&&b.revealed[i]&&neighbors(b,i).some(j=>!b.revealed[j]&&b.cells[j]!==-1));
  for(const j of neighbors(b,numbered))if(b.cells[j]===-1)await cell(page,j).click({button:'right'});
  await cell(page,numbered).click();
  for(let i=0;i<81;i++)if(b.cells[i]!==-1&&await cell(page,i).getAttribute('data-state')!=='open')await cell(page,i).click();
  await expect(page.locator('.ms-outcome')).toHaveText('Field cleared!');
  await page.getByRole('button',{name:'Restart game',exact:true}).click();
  // Save the actual new seed, then use the model only to choose a mine to click.
  await cell(page,40).click();
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:minesweeper')!).data);
  await cell(page,state.cells.indexOf(-1)).click();await expect(page.locator('.ms-outcome')).toHaveText('Mine found!');
  await expect(page.locator('.ms-tile[data-state="mine"]')).toHaveCount(10);
});
test('phone levels, adjustable cells, keyboard reveal and contained expert overflow',async({page,browser})=>{
  await page.setViewportSize({width:390,height:844});await fixture(page,12345);
  const artwork=await cell(page,0).evaluate(async tile=>{
    const background=getComputedStyle(tile).backgroundImage;
    const asset=background.match(/^url\(["']?(.*?)["']?\)$/)?.[1]||'';
    const expected=new URL('game-art/minesweeper/tile.svg',document.baseURI).href;
    let decoded=false;
    if(asset){const image=new Image();image.src=asset;try{await image.decode();decoded=image.naturalWidth>0&&image.naturalHeight>0;}catch{decoded=false;}}
    const element=tile as HTMLElement,original=element.style.backgroundImage;
    element.style.backgroundImage='none';const fallback=getComputedStyle(tile).backgroundColor;element.style.backgroundImage=original;
    return {asset,expected,decoded,fallback};
  });
  expect(artwork.asset).toBe(artwork.expected);expect(artwork.decoded).toBe(true);expect(artwork.fallback).not.toBe('rgba(0, 0, 0, 0)');
  await cell(page,0).focus();await page.keyboard.press('Enter');await expect(cell(page,0)).toHaveAttribute('data-state','open');
  await page.locator('.ms-size').selectOption('44');expect(await cell(page,0).evaluate(el=>el.getBoundingClientRect().width)).toBe(44);
  await page.locator('.ms-level').selectOption('intermediate');await expect(page.locator('.ms-tile')).toHaveCount(256);
  await page.locator('.ms-level').selectOption('expert');await expect(page.locator('.ms-tile')).toHaveCount(480);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('.ms-scroll').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await page.locator('.ms-level').selectOption('beginner');await page.locator('.ms-size').selectOption('34');await cell(page,40).click();
  await page.screenshot({path:'tests/games/minesweeper/evidence/chromium.png',fullPage:true});
  const frames=await page.evaluate(()=>new Promise<number[]>(resolve=>{const times:number[]=[];let last=0;function tick(t:number){if(last)times.push(t-last);last=t;if(times.length===60)resolve(times);else requestAnimationFrame(tick);}requestAnimationFrame(tick);}));
  const sorted=[...frames].sort((a,b)=>a-b);writeFileSync('tests/games/minesweeper/evidence/performance.json',JSON.stringify({browser:browser.version(),viewport:'390x844',samples:frames.length,meanMs:frames.reduce((a,b)=>a+b,0)/frames.length,medianMs:sorted[30],p95Ms:sorted[57],maxMs:sorted[59],note:'Headless shared Linux host; idle active beginner board. Not physical Chromebook performance.'},null,2));
});
test('touch tap, long press flag and cancellation without revealing',async({browser,browserName})=>{
 test.skip(browserName!=='chromium','Native CDP touch is specific to Chromium.');
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});const page=await context.newPage();
  await fixture(page);
  const target=cell(page,0),box=(await target.boundingBox())!;
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+17,y:box.y+17}]});
  await expect(target).toHaveAttribute('data-state','flagged');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(target).toHaveAttribute('data-state','flagged');
  await page.getByRole('button',{name:'Flag mode',exact:true}).tap();await target.tap();await expect(target).toHaveAttribute('data-state','hidden');
  const cancelBox=(await cell(page,8).boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cancelBox.x+17,y:cancelBox.y+17}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:cancelBox.x-35,y:cancelBox.y+17}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(cell(page,8)).toHaveAttribute('data-state','hidden');
  await page.getByRole('button',{name:'Flag mode',exact:true}).tap();await cell(page,40).tap();await expect(cell(page,40)).toHaveAttribute('data-state','open');
  await context.close();
});

test('wrong chord loses; repeated exit and malformed save recover cleanly',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const b=await fixture(page);await cell(page,40).click();reveal(b,40);
  const {neighbors}=await import('../../../src/games/minesweeper/model');
  const i=b.cells.findIndex((v,i)=>v>0&&b.revealed[i]&&neighbors(b,i).filter(j=>!b.revealed[j]&&b.cells[j]!==-1).length>=v);
  for(const j of neighbors(b,i).filter(j=>!b.revealed[j]&&b.cells[j]!==-1).slice(0,b.cells[i]))await cell(page,j).click({button:'right'});
  await cell(page,i).focus();await page.keyboard.press('c');await expect(page.locator('.ms-outcome')).toHaveText('Mine found!');
  for(let n=0;n<3;n++){await page.getByRole('link',{name:'Back to game library'}).click();await page.goto(url);await expect(page.locator('.ms-outcome')).toHaveText('Mine found!');}
  await page.getByRole('link',{name:'Back to game library'}).click();await expect(page.locator('.ms')).toHaveCount(0);
  await page.evaluate(()=>localStorage.setItem('pocket-arcade:v1:save:minesweeper',JSON.stringify({version:1,data:{version:1,level:'expert',cells:[-1]}})));
  await page.goto(url);await expect(page.locator('.ms-tile')).toHaveCount(81);await expect(page.locator('.ms-outcome')).toHaveText('Your first move is safe.');
  expect(errors).toEqual([]);
});

test('a trusted touch hold over two seconds in Flag mode consumes only its release click',async({browser,browserName})=>{
  test.skip(browserName!=='chromium','Trusted CDP touch input requires Chromium.');
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const page=await context.newPage();await fixture(page);
  await page.getByRole('button',{name:'Flag mode',exact:true}).tap();
  await page.evaluate(()=>document.addEventListener('click',e=>{
    if(e.isTrusted&&(e.target as Element).closest('.ms-tile'))document.documentElement.dataset.msTouchClicks=String(Number(document.documentElement.dataset.msTouchClicks||0)+1);
  }));
  const target=cell(page,0),box=(await target.boundingBox())!,cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+17,y:box.y+17}]});
  await expect(target).toHaveAttribute('data-state','flagged');
  // Deliberately exceed the old 480 + 1400 ms suppression expiry.
  await page.waitForTimeout(2200);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await expect(page.locator('html')).toHaveAttribute('data-ms-touch-clicks','1');
  await expect(target).toHaveAttribute('data-state','flagged');
  await target.tap();await expect(target).toHaveAttribute('data-state','hidden');
  await target.focus();await page.keyboard.press('f');await expect(target).toHaveAttribute('data-state','flagged');
  await target.click({button:'right'});await expect(target).toHaveAttribute('data-state','hidden');
  const canceled=cell(page,1),cancelBox=(await canceled.boundingBox())!;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:cancelBox.x+17,y:cancelBox.y+17}]});
  await expect(canceled).toHaveAttribute('data-state','flagged');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await canceled.tap();await expect(canceled).toHaveAttribute('data-state','hidden');
  await context.close();
});
