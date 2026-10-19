import { test, expect, type Page } from '@playwright/test';
const errorsByPage=new WeakMap<Page,string[]>();
const board = (page:Page) => page.locator('.cc-grid');
async function center(page:Page, cell:number) {const box=await page.locator(`[data-cc-cell="${cell}"]`).boundingBox(); if(!box) throw new Error('Cell not displayed');return {x:box.x+box.width/2,y:box.y+box.height/2};}
async function draw(page:Page,cells:number[]) {const start=await center(page,cells[0]);await page.mouse.move(start.x,start.y);await page.mouse.down();for(const cell of cells.slice(1)){const p=await center(page,cell);await page.mouse.move(p.x,p.y);}await page.mouse.up();}
test.beforeEach(async({page})=>{const errors:string[]=[];errorsByPage.set(page,errors);page.on('pageerror',error=>errors.push(error.message));await page.goto('/#/game/color-connect');await expect(board(page)).toBeVisible();});
test.afterEach(async({page})=>{expect(errorsByPage.get(page)).toEqual([])});
test('draw, erase, undo, pause, restart and reload saved paths',async({page})=>{
 const start=await page.locator('.cc-progress').textContent();
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(2);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.locator('.cc-progress')).toHaveText(start!);
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 await page.getByRole('button',{name:'Erase selected',exact:true}).click();
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(0);
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 const progress=await page.locator('.cc-progress').textContent();
 await page.getByRole('button',{name:'Pause game',exact:true}).click();
 await expect(page.getByRole('button',{name:'Hint',exact:true})).toBeDisabled();
 await page.reload();
 await expect(page.locator('.cc-progress')).toHaveText(progress!);
 await page.getByRole('button',{name:'Restart game',exact:true}).click();
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(0);
 await expect(page.locator('.cc-progress')).toHaveText(start!);
});
test('actual pointer paths fill the entire board, award a win and advance',async({page})=>{
 // Hand-checked full first-board solution, independent of the runtime solver.
 const solution:number[][]=[[9,5,6,10,11,15],[14,13,12],[8,4,0,1,2,3,7]];
 for(const path of solution) await draw(page,path);
 await expect(page.locator('.cc-win')).toBeVisible();
 await expect(page.locator('.cc-progress')).toContainText('100%');
 await expect(page.locator('#game-score')).toContainText('100');
 await page.getByRole('button',{name:'Next puzzle',exact:true}).click();
 await expect(page.locator('.cc-puzzle-name')).toContainText('Little bends');
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(0);
});
test('keyboard creates a path; redraw trims; fast pointer movement interpolates',async({page})=>{
 await page.locator('[data-cc-cell="9"]').focus();
 await page.keyboard.press('Space');
 await page.keyboard.press('ArrowUp');
 await page.keyboard.press('Space');
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(2);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(0);
 await draw(page,[14,12]);
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(3);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 const solution:number[][]=[[9,5,6,10,11,15],[14,13,12],[8,4,0,1,2,3,7]];
 await draw(page,solution[0]);
 const peg=await center(page,solution[0][0]); await page.mouse.click(peg.x,peg.y);
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(1);
});
test('responsive board and genuine touch path',async({page,browserName})=>{
 await page.setViewportSize({width:390,height:844});
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 await draw(page,[9,5,6,10,11,15]);
 await draw(page,[14,12]);
 if(browserName==='chromium')await page.screenshot({path:'tests/games/color-connect/evidence/chromium.png',fullPage:true});
 await page.getByRole('combobox',{name:'Choose puzzle'}).selectOption('11');
 await expect(page.locator('[data-cc-cell]')).toHaveCount(49);
 const smallCell=await page.locator('[data-cc-cell="0"]').boundingBox();
 expect(smallCell!.width).toBeGreaterThanOrEqual(44);
 await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.getByRole('combobox',{name:'Choose puzzle'}).selectOption('0');
 if(browserName!=='chromium')return;
 await page.getByRole('button',{name:'Restart game',exact:true}).click();
 const session=await page.context().newCDPSession(page);
 const points=await Promise.all([9,5].map(cell=>center(page,cell)));
 await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...points[0],id:1}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...points[1],id:1}]});
 await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(2);
 await session.detach();
});
test('wrong endpoints are blocked and legal backtracking removes the traversed suffix',async({page})=>{
 await draw(page,[9,8]);
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(1);
 await draw(page,[9,5,6,5]);
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(2);
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(3);
});
test('module lifecycle rejects corrupted snapshots, gates paused input, restarts while paused and disposes handlers',async({page})=>{
 const result=await page.evaluate(async()=>{
  const path='/src/games/color-connect/index.ts';const imported=await import(path);
  const host=document.createElement('div');document.body.append(host);
  let saves=0,score=0;
  const instance=await imported.default.mount(host,{id:'color-connect',settings:{sound:false,reducedMotion:true,colorBlind:true},highScore:0,setScore(value:number){score=value},setLevel(){},setStatus(){},announce(){},save(){saves++},sound(){}});
  const hint=host.querySelector<HTMLButtonElement>('.cc-hint')!;
  hint.click();const good=instance.serialize();
  instance.pause();
  hint.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  host.querySelector('[data-cc-cell="9"]')!.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));
  const pausedUnchanged=JSON.stringify(instance.serialize())===JSON.stringify(good);
  instance.restart();const restarted=instance.serialize();const disabledAfterRestart=hint.disabled;
  instance.resume();instance.restore(good);
  const restored=JSON.stringify(instance.serialize())===JSON.stringify(good);
  instance.restore({...good,paths:[[999],[],[]]});const rejected=JSON.stringify(instance.serialize())===JSON.stringify(good);
  instance.dispose();const count=saves;hint.dispatchEvent(new MouseEvent('click',{bubbles:true}));instance.restart();instance.restore(good);
  const disposed=host.childElementCount===0&&count===saves;host.remove();
  return {pausedUnchanged,restarted:restarted.paths.every((p:number[])=>p.length===0)&&restarted.moves===0&&restarted.completed.length===0,disabledAfterRestart,restored,rejected,disposed,score};
 });
 expect(result).toEqual({pausedUnchanged:true,restarted:true,disabledAfterRestart:true,restored:true,rejected:true,disposed:true,score:0});
 await page.getByRole('link',{name:'Back to game library'}).click();
 await page.getByRole('link',{name:/Color Connect/i}).click();
 await expect(board(page)).toBeVisible();
});

test('rules explain full coverage and returning from the dialog resumes play',async({page})=>{
 await page.getByRole('button',{name:'Game rules',exact:true}).click();
 await expect(page.locator('#rules-dialog')).toBeVisible();
 await expect(page.locator('#rules-text')).toContainText('fill the ENTIRE board');
 await page.getByRole('button',{name:'Let’s play',exact:true}).click();
 await expect(page.getByRole('button',{name:'Hint',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(2);
});
test('current-board hint respects an alternative completed path and truthfully requests a required backtrack',async({page})=>{
 await draw(page,[9,10,11,15]);
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 await expect(page.locator('[data-path="A"]')).toHaveCount(4);
 await expect(page.locator('[data-path="B"]')).toHaveCount(2);
 await page.getByRole('button',{name:'Restart game',exact:true}).click();
 await draw(page,[9,13]);
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 await expect(page.locator('.cc-feedback')).toContainText('backtrack is needed');
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(2);
 await page.getByRole('button',{name:'Erase selected',exact:true}).click();
 await expect(page.locator('.cc-grid [data-path]')).toHaveCount(0);
});
test('a save during the held final gesture restores its move, undo record and one completion award',async({page})=>{
 await page.evaluate(async()=>{
  const path='/src/games/color-connect/index.ts';const module=await import(path),host=document.createElement('section');
  host.id='cc-snapshot-test';host.style.cssText='position:fixed;inset:0 auto auto 0;width:366px;z-index:10000';document.body.append(host);
  const harness=window as unknown as {ccSnapshotInstance:any;ccSnapshotScore:number};harness.ccSnapshotScore=0;
  harness.ccSnapshotInstance=await module.default.mount(host,{id:'color-connect',settings:{sound:false,reducedMotion:true,colorBlind:true},highScore:0,setScore(value:number){harness.ccSnapshotScore=value},setLevel(){},setStatus(){},announce(){},save(){},sound(){}});
  harness.ccSnapshotInstance.restore({version:1,level:0,paths:[[9,5,6,10,11,15],[14,13,12],[]],completed:[],moves:2,history:[[[],[],[]],[[9,5,6,10,11,15],[],[]]]});
 });
 const cellCenter=async(cell:number)=>{const b=await page.locator(`#cc-snapshot-test [data-cc-cell="${cell}"]`).boundingBox();return {x:b!.x+b!.width/2,y:b!.y+b!.height/2}};
 const start=await cellCenter(8);await page.mouse.move(start.x,start.y);await page.mouse.down();
 for(const cell of [4,0,1,2,3,7]){const p=await cellCenter(cell);await page.mouse.move(p.x,p.y)}
 const saved=await page.evaluate(()=>{const h=window as unknown as {ccSnapshotInstance:any};return h.ccSnapshotInstance.serialize()});
 expect(saved.completed).toEqual([0]);expect(saved.moves).toBe(3);expect(saved.history).toHaveLength(3);
 expect(saved.history[2]).toEqual([[9,5,6,10,11,15],[14,13,12],[]]);
 const second=await page.evaluate(()=>{const h=window as unknown as {ccSnapshotInstance:any};return h.ccSnapshotInstance.serialize()});expect(second).toEqual(saved);
 await page.evaluate(data=>{const h=window as unknown as {ccSnapshotInstance:any};h.ccSnapshotInstance.restore(data)},saved);await page.mouse.up();
 expect(await page.evaluate(()=>(window as unknown as {ccSnapshotScore:number}).ccSnapshotScore)).toBe(100);
 await page.locator('#cc-snapshot-test .cc-undo').click();await expect(page.locator('#cc-snapshot-test [data-path]')).toHaveCount(9);
 const redoStart=await cellCenter(8);await page.mouse.move(redoStart.x,redoStart.y);await page.mouse.down();
 for(const cell of [4,0,1,2,3,7]){const p=await cellCenter(cell);await page.mouse.move(p.x,p.y)}await page.mouse.up();
 const final=await page.evaluate(()=>{const h=window as unknown as {ccSnapshotInstance:any;ccSnapshotScore:number};const result={score:h.ccSnapshotScore,completed:h.ccSnapshotInstance.serialize().completed};h.ccSnapshotInstance.dispose();document.querySelector('#cc-snapshot-test')?.remove();return result});
 expect(final).toEqual({score:100,completed:[0]});
});
test('pointer release synchronizes the trail-tip keyboard focus without stealing toolbar focus',async({page})=>{
 await draw(page,[9,5]);
 await expect(page.locator('[data-cc-cell="5"]')).toBeFocused();
 await page.keyboard.press('ArrowRight');
 await expect(page.locator('[data-cc-cell="6"]')).toBeFocused();
 await page.getByRole('button',{name:'Hint',exact:true}).click();
 await expect(page.getByRole('button',{name:'Hint',exact:true})).toBeFocused();
});
