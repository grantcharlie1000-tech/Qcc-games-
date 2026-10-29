import {test,expect,seedStudyTopic,type Page} from '../../fixtures';
import {create,reveal,neighbors,type Board} from '../../../src/games/minesweeper/model';
import {emptyStats,hint} from '../../../src/games/minesweeper/practice';
const url='/#/game/minesweeper';
const cell=(page:Page,i:number)=>page.locator(`.ms-tile[data-index="${i}"]`);
async function fixture(page:Page,board=create('beginner',7),extra={}){
 await page.addInitScript(data=>{if(!localStorage.getItem('pocket-arcade:v1:save:minesweeper'))localStorage.setItem('pocket-arcade:v1:save:minesweeper',JSON.stringify({version:1,data}));},{...board,assisted:false,practice:false,stats:emptyStats(),...extra});
 await page.goto(url);await expect(cell(page,0)).toBeVisible();return board;
}
const saved=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:minesweeper')!).data);
async function settings(page:Page){if(!await page.locator('.ms-settings').isVisible())await page.getByRole('button',{name:'Open menu',exact:true}).click();}
async function closeSettings(page:Page){if(await page.locator('.ms-settings').isVisible())await page.getByRole('button',{name:'Close game options'}).click();}
async function win(page:Page,b:Board){for(let i=0;i<b.cells.length;i++)if(b.cells[i]!==-1&&await cell(page,i).getAttribute('data-state')!=='open')await cell(page,i).click();}

test('mouse, scoped keyboard, exact save, hidden pause and confirmed restart',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));const b=await fixture(page);
 await cell(page,0).click({button:'right'});await expect(cell(page,0)).toHaveAttribute('data-state','flagged');
 await cell(page,0).click();await expect(cell(page,0)).toHaveAttribute('data-state','flagged');
 await cell(page,0).click({button:'right'});await cell(page,40).click();reveal(b,40);
 expect((await saved(page)).cells).toEqual(b.cells);expect(b.cells[40]).toBe(0);
 const hidden=b.revealed.findIndex(v=>!v);await cell(page,hidden).focus();await page.keyboard.press('f');await expect(cell(page,hidden)).toHaveAttribute('data-state','flagged');
 await page.keyboard.press('ArrowRight');await expect(cell(page,hidden+1)).toBeFocused();
 await settings(page);await page.getByRole('button',{name:'Pause game',exact:true}).click();await expect(page.locator('.ms-board')).toHaveCSS('visibility','hidden');
 const time=await page.locator('.ms-time').textContent();await page.waitForTimeout(1100);await expect(page.locator('.ms-time')).toHaveText(time!);
 await cell(page,0).dispatchEvent('click');await expect(cell(page,40)).toHaveAttribute('data-state','open');
 await page.getByRole('button',{name:'Keep playing',exact:true}).click();
 const before=await saved(page);await page.getByRole('link',{name:'Back to game library'}).click();await page.goto(url);
 await expect(cell(page,40)).toHaveAttribute('data-state','open');await expect(cell(page,hidden)).toHaveAttribute('data-state','flagged');expect((await saved(page)).cells).toEqual(before.cells);
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(cell(page,40)).toHaveAttribute('data-state','open');
 page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(page.locator('.ms-tile[data-state=open]')).toHaveCount(0);await expect(page.locator('.ms-time')).toHaveText('00:00');
 await settings(page);await page.getByRole('button',{name:'Game rules',exact:true}).click();await expect(page.locator('#rules-text')).toContainText('Incorrect flags');expect(errors).toEqual([]);
});

test('correct chord, win without all flags, terminal timer and per-difficulty record',async({page})=>{
 const b=await fixture(page);await cell(page,40).click();reveal(b,40);
 const i=b.cells.findIndex((v,i)=>v>0&&b.revealed[i]&&neighbors(b,i).some(j=>!b.revealed[j]&&b.cells[j]!==-1));
 await cell(page,i).click();await expect(page.locator('.ms-outcome')).not.toHaveText('Mine found!');
 for(const j of neighbors(b,i))if(b.cells[j]===-1)await cell(page,j).click({button:'right'});
 await cell(page,i).click();for(const j of neighbors(b,i))if(b.cells[j]!==-1)await expect(cell(page,j)).toHaveAttribute('data-state','open');
 await win(page,b);await expect(page.locator('.ms-outcome')).toHaveText('Field cleared!');await expect(page.getByRole('region',{name:'Game result'})).toBeVisible();
 await expect(page.locator('.ms-result-title')).toContainText('Score ');await expect(page.locator('.ms-result-detail')).toContainText('Easy 0 + speed');await expect(page.locator('.ms-result-detail')).toContainText('Best score');await expect(page.locator('.ms-time')).toBeVisible();
 const result=await saved(page);expect(result.stats.beginner.played).toBe(1);expect(result.stats.beginner.wins).toBe(1);expect(result.flags.filter(Boolean).length).toBeLessThan(10);
 expect(await page.evaluate(()=>localStorage.getItem('pocket-arcade:v1:best:minesweeper-easy'))).not.toBeNull();
 const elapsed=result.elapsedMs;await page.waitForTimeout(1100);expect((await saved(page)).elapsedMs).toBe(elapsed);
 await page.getByRole('button',{name:'Score rankings'}).click();await expect(page.locator('#leaderboard-game')).toHaveValue('minesweeper-score');await page.getByRole('button',{name:'Close leaderboards'}).click();
 await page.getByRole('button',{name:'New game',exact:true}).click();await expect(page.locator('.ms-time')).toHaveText('00:00');
});

test('incorrect chord distinguishes triggered mine, other mines and wrong flags',async({page})=>{
 const b=await fixture(page);await cell(page,40).click();reveal(b,40);
 const i=b.cells.findIndex((v,i)=>v>0&&b.revealed[i]&&neighbors(b,i).filter(j=>!b.revealed[j]&&b.cells[j]!==-1).length>=v);
 for(const j of neighbors(b,i).filter(j=>!b.revealed[j]&&b.cells[j]!==-1).slice(0,b.cells[i]))await cell(page,j).click({button:'right'});
 await cell(page,i).focus();await page.keyboard.press('c');await expect(page.locator('.ms-outcome')).toHaveText('Mine found!');await expect(page.locator('.ms-exploded')).toHaveCount(1);await expect(page.locator('.ms-tile[data-state=mine]')).toHaveCount(10);expect(await page.locator('.ms-wrong').count()).toBeGreaterThan(0);
 expect(await page.evaluate(()=>localStorage.getItem('pocket-arcade:v1:best:minesweeper-easy'))).toBeNull();
 await page.reload();await expect(page.locator('.ms-outcome')).toHaveText('Mine found!');expect((await saved(page)).stats.beginner.wins).toBe(0);
});

test('practice explains a visible deduction, undo retains time and assistance survives restore',async({page})=>{
 await fixture(page,create('beginner',7),{practice:true,assisted:true});await cell(page,40).click();await settings(page);
 await page.getByRole('button',{name:'Explain a hint'}).click();await expect(page.locator('.ms-hint-message')).toContainText('safe');await expect(page.locator('.ms-hinted')).toHaveCount(1);
 await page.waitForTimeout(1100);await settings(page);await page.getByRole('button',{name:'Undo',exact:true}).click();const state=await saved(page);expect(state.status).toBe('ready');await expect(page.locator('.ms-hint-message')).toHaveText('');expect(state.elapsedMs).toBeGreaterThan(1000);
 await page.reload();await expect(page.locator('.ms-badge')).toBeVisible();expect((await saved(page)).seed).toBe(7);await cell(page,40).click();const b=create('beginner',7);reveal(b,40);await cell(page,b.cells.indexOf(-1)).click();await expect(page.locator('.ms-outcome')).toHaveText('Mine found!');await settings(page);await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('.ms-outcome')).not.toHaveText('Mine found!');await closeSettings(page);await win(page,b);
 const result=await saved(page);expect(result.assisted).toBe(true);expect(result.stats.beginner).toEqual({played:0,wins:0,bestMs:null});expect(await page.evaluate(()=>localStorage.getItem('pocket-arcade:v1:best:minesweeper-easy'))).toBeNull();
});

test('an ambiguous practice board explains that no safe move is established',async({page})=>{
 let b=create();let found=false;
 for(let seed=1;seed<=200;seed++){b=create('beginner',seed);reveal(b,40);if(!hint(b)){found=true;break;}}
 expect(found).toBe(true);await fixture(page,b,{practice:true,assisted:true});await settings(page);
 await page.getByRole('button',{name:'Explain a hint'}).click();await expect(page.locator('.ms-hint-message')).toContainText('No safe move established');await expect(page.locator('.ms-hinted')).toHaveCount(0);
});

for(const viewport of [{width:1366,height:768},{width:390,height:844},{width:320,height:700}])test(`responsive readable field and contained Hard board at ${viewport.width}`,async({page})=>{
 await page.setViewportSize(viewport);await fixture(page);await cell(page,40).click();await page.waitForTimeout(350);
 expect(await cell(page,40).evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThanOrEqual(32);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);

 page.once('dialog',d=>d.accept());await page.locator('.ms-level').selectOption('expert');await expect(page.locator('.ms-tile')).toHaveCount(480);
 const before=await cell(page,0).boundingBox();await settings(page);await page.getByRole('button',{name:'Zoom in',exact:true}).click();await closeSettings(page);expect((await cell(page,0).boundingBox())!.width).toBeGreaterThan(before!.width);
 expect(await page.locator('.ms-scroll').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);

 await page.locator('.ms-level').selectOption('intermediate');await expect(page.locator('.ms-tile')).toHaveCount(256);
});

test('real touch tap, long hold, pan and pinch never double-activate or reveal accidentally',async({browser,browserName})=>{
 test.skip(browserName!=='chromium','CDP touch input requires Chromium.');
 const ctx=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});await seedStudyTopic(ctx);const page=await ctx.newPage();await fixture(page);const cdp=await ctx.newCDPSession(page);
 const point=async(i:number)=>{const b=(await cell(page,i).boundingBox())!;return {x:b.x+b.width/2,y:b.y+b.height/2};};
 let p=await point(0);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await expect(cell(page,0)).toHaveAttribute('data-state','flagged');await page.waitForTimeout(1700);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(cell(page,0)).toHaveAttribute('data-state','flagged');
 await page.getByRole('button',{name:'Flag mode',exact:true}).tap();await cell(page,0).tap();await expect(cell(page,0)).toHaveAttribute('data-state','hidden');
 await page.locator('.ms-reveal-mode').tap();await cell(page,40).tap();await expect(cell(page,40)).toHaveAttribute('data-state','open');
 page.once('dialog',d=>d.accept());await page.locator('.ms-level').selectOption('expert');
 p=await point(1);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[p]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:p.x-60,y:p.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('.ms-tile[data-state=open]')).toHaveCount(0);
 const box=(await page.locator('.ms-scroll').boundingBox())!,x=box.x+box.width/2,y=box.y+box.height/2,size=await cell(page,40).evaluate(e=>e.getBoundingClientRect().width);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:x-35,y},{id:2,x:x+35,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x-65,y},{id:2,x:x+65,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 expect(await cell(page,40).evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThan(size);await expect(page.locator('.ms-tile[data-state=open]')).toHaveCount(0);await expect(page.locator('.ms-tile[data-state=flagged]')).toHaveCount(0);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(page.locator('.ms-tile[data-state=open]')).toHaveCount(0);
 await ctx.close();
});

test('background pauses with the board hidden, and returning does not resume implicitly',async({page})=>{
 await fixture(page);await cell(page,40).click();
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
 await expect(page.locator('.ms-board')).toHaveCSS('visibility','hidden');const time=await page.locator('.ms-time').textContent();await page.waitForTimeout(1100);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});await expect(page.locator('.ms-time')).toHaveText(time!);await expect(page.locator('.ms-board')).toHaveCSS('visibility','hidden');
 await page.getByRole('button',{name:'Keep playing',exact:true}).click();await expect(page.locator('.ms-board')).toHaveCSS('visibility','visible');
});

test('assistive activation, keyboard reveal and shared fullscreen remain dependable',async({page})=>{
 await fixture(page);await expect(page.locator('.ms-intro')).toBeVisible();await page.getByRole('button',{name:'Dismiss first-play explanation'}).click();await page.reload();await expect(page.locator('.ms-intro')).toBeHidden();
 await settings(page);await expect(page.locator('.ms-sound')).not.toBeChecked();await closeSettings(page);
 await page.getByRole('button',{name:'Flag mode',exact:true}).click();await cell(page,0).dispatchEvent('click',{detail:0});await expect(cell(page,0)).toHaveAttribute('data-state','flagged');
 await cell(page,0).focus();await page.keyboard.press('Enter');await expect(cell(page,0)).toHaveAttribute('data-state','flagged');await page.keyboard.press('f');await page.keyboard.press('Space');await expect(cell(page,0)).toHaveAttribute('data-state','open');
 const count=await page.locator('.ms-tile[data-state=flagged]').count();await page.locator('.ms-level').focus();await page.keyboard.press('f');expect(await page.locator('.ms-tile[data-state=flagged]').count()).toBe(count);
 await settings(page);await page.getByRole('button',{name:'Enter full screen',exact:true}).click();await expect(page.locator('#fullscreen-game')).toHaveAttribute('aria-pressed','true');await settings(page);await page.getByRole('button',{name:'Exit full screen',exact:true}).click();
 await settings(page);await page.getByRole('button',{name:'Game rules',exact:true}).click();await expect(page.locator('.ms-board')).toHaveCSS('visibility','hidden');
});

test('reduced motion opens the field immediately without tile animations',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await fixture(page);await cell(page,40).click();expect(await page.locator('.ms-board').evaluate(e=>e.getAnimations({subtree:true}).length)).toBe(0);await expect(cell(page,40)).toHaveAttribute('data-state','open');
});

test('timer remains visible and advances across phone, landscape, desktop and full screen',async({page})=>{
 await page.setViewportSize({width:390,height:844});await fixture(page);await cell(page,40).click();
 for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1366,height:768}]){
  await page.setViewportSize(viewport);const timer=page.locator('.ms-time');await expect(timer).toBeVisible();
  const box=await timer.boundingBox();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width);
  const before=await timer.textContent();await page.waitForTimeout(1200);await expect(timer).not.toHaveText(before!);
 }
 await settings(page);await page.getByRole('button',{name:'Enter full screen'}).click();await expect(page.locator('.ms-time')).toBeVisible();
 const before=await page.locator('.ms-time').textContent();await page.waitForTimeout(1200);await expect(page.locator('.ms-time')).not.toHaveText(before!);
});
