import {test,expect,type Page} from '@playwright/test';
import {createGame,type State} from '../../../src/games/color-blocks/model';
const SAVE='pocket-arcade:v1:save:color-blocks';
const fixture=():State=>({...createGame(42),tray:[5,12,0],board:Array(64).fill(0)});
async function open(page:Page,s=fixture()){
 await page.addInitScript(({key,snapshot})=>{if(!sessionStorage.getItem('cb-fixture-ready')){localStorage.clear();localStorage.setItem(key,JSON.stringify({version:1,data:snapshot}));sessionStorage.setItem('cb-fixture-ready','yes');}},{key:SAVE,snapshot:s});
 await page.goto('/#/game/color-blocks');await expect(page.locator('.cb-cell')).toHaveCount(64);
}
async function point(page:Page,selector:string){const b=await page.locator(selector).boundingBox();if(!b)throw Error(selector);return {x:b.x+b.width/2,y:b.y+b.height/2};}
async function occupied(page:Page){return page.locator('.cb-cell.cb-occupied').evaluateAll(el=>el.map(e=>Number((e as HTMLElement).dataset.cell)));}
for(const width of [390,1000])test(`real mouse drag preview equals placement at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await open(page);
 // Grab the first square cell rather than the piece bounding box's centre.
 const svg=await page.locator('[data-slot="0"] svg').boundingBox();if(!svg)throw Error('piece missing');
 await page.mouse.move(svg.x+svg.width/4,svg.y+svg.height/4);await page.mouse.down();
 const end=await point(page,'[data-cell="18"]');await page.mouse.move(end.x,end.y,{steps:8});
 const ghost=await page.locator('.cb-ghost').evaluateAll(el=>el.map(e=>Number((e as HTMLElement).dataset.cell)));
 expect(ghost).toEqual([18,19,26,27]);await page.mouse.up();expect(await occupied(page)).toEqual(ghost);
 await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');await expect(page.locator('[data-slot="0"]')).toBeDisabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(width===390)await page.screenshot({path:'tests/games/color-blocks/evidence/chromium.png',fullPage:true});
});
test('grab offset is maintained and invalid overlap or off-board drop cannot place',async({page})=>{
 await open(page);let b=await page.locator('[data-slot="0"] svg').boundingBox();if(!b)throw Error('missing');
 await page.mouse.move(b.x+b.width*.75,b.y+b.height*.75);await page.mouse.down();let end=await point(page,'[data-cell="27"]');await page.mouse.move(end.x,end.y,{steps:5});
 await expect(page.locator('.cb-ghost')).toHaveCount(4);await page.mouse.up();expect(await occupied(page)).toEqual([18,19,26,27]);
 b=await page.locator('[data-slot="1"] svg').boundingBox();if(!b)throw Error('missing');await page.mouse.move(b.x+b.width/2,b.y+b.height/4);await page.mouse.down();end=await point(page,'[data-cell="18"]');await page.mouse.move(end.x,end.y,{steps:5});
 await expect(page.locator('.cb-ghost')).toHaveCount(0);await page.mouse.up();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');
 b=await page.locator('[data-slot="1"] svg').boundingBox();if(!b)throw Error('missing');await page.mouse.move(b.x+b.width/2,b.y+b.height/4);await page.mouse.down();await page.mouse.move(1,1);await page.mouse.up();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');
});
test('keyboard aims, places and shows rules; pause blocks input, save reloads, restart resets',async({page})=>{
 await open(page);await page.locator('#game-stage').focus();await page.keyboard.press('1');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
 expect(await occupied(page)).toEqual([9,10,17,18]);await expect(page.locator('#game-score')).toContainText('4');
 await page.getByRole('button',{name:'Pause game',exact:true}).click();await expect(page.locator('#pause-overlay')).toBeVisible();
 await page.keyboard.press('2');await page.keyboard.press('Enter');await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');
 const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).data,SAVE);expect(saved.moves).toBe(1);
 // Remove init script's reset by navigating in the same document; route exit saves and disposes.
 await page.getByRole('link',{name:'Back to game library'}).click();await page.getByRole('link',{name:'Play Color Blocks',exact:true}).click();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');expect(await occupied(page)).toEqual([9,10,17,18]);
 await page.reload();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');expect(await occupied(page)).toEqual([9,10,17,18]);
 await page.getByRole('button',{name:'Game rules',exact:true}).click();await expect(page.locator('#rules-text')).toContainText('No rotation');await page.getByRole('button',{name:'Let’s play'}).click();
 await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','0');expect(await occupied(page)).toEqual([]);
});
test('line crossing clears together and the board survives when a later tray piece fits',async({page})=>{
 const s=fixture();s.tray=[0,1,2];for(let x=1;x<8;x++)s.board[x]=1;for(let y=1;y<8;y++)s.board[y*8]=2;await open(page,s);
 await page.locator('#game-stage').focus();await page.keyboard.press('1');await page.keyboard.press('Enter');expect(await occupied(page)).toEqual([]);await expect(page.locator('#game-score')).toContainText('41');await expect(page.locator('.cb-game')).toHaveAttribute('data-combo','1');await expect(page.locator('.cb-feedback')).toContainText('2 lines cleared');
});
test('a blocked first piece does not end the run; a genuinely blocked tray does',async({page})=>{
 const s=fixture();s.board=Array.from({length:64},(_,i)=>(i%8+Math.floor(i/8))%2===0?1:0);s.tray=[5,null,0];await open(page,s);await expect(page.locator('.cb-game')).not.toHaveClass(/cb-over/);
 await page.locator('#game-stage').focus();await page.keyboard.press('3');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');await expect(page.locator('.cb-game')).toHaveClass(/cb-over/);await expect(page.locator('#game-status')).toContainText('No pieces fit');
});
test('colourblind patterns, reduced motion and malformed save are handled through the shell',async({page})=>{
 await open(page);await page.getByRole('button',{name:'Open menu'}).click();await page.locator('#colour').check();await page.locator('#motion').check();await page.getByRole('button',{name:'Close menu',exact:true}).click();await expect(page.locator('.cb-game')).toHaveClass(/cb-patterns/);await expect(page.locator('.cb-game')).toHaveClass(/cb-reduced/);
 await page.getByRole('link',{name:'Back to game library'}).click();await page.evaluate(key=>localStorage.setItem(key,JSON.stringify({version:1,data:{board:['broken']}})),SAVE);await page.getByRole('link',{name:'Play Color Blocks',exact:true}).click();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','0');await expect(page.locator('.cb-cell')).toHaveCount(64);
});
test.describe('touch input',()=>{
 test.use({hasTouch:true,viewport:{width:390,height:844}});
 test('trusted touch drag has the same exact ghost and commitment, and tap-select works',async({page,context})=>{
  await open(page);const session=await context.newCDPSession(page);const b=await page.locator('[data-slot="0"] svg').boundingBox();if(!b)throw Error('missing');const start={x:b.x+b.width/4,y:b.y+b.height/4},end=await point(page,'[data-cell="9"]');
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...start,id:1}]});await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});await expect(page.locator('.cb-ghost')).toHaveCount(4);const ghost=await page.locator('.cb-ghost').evaluateAll(el=>el.map(e=>Number((e as HTMLElement).dataset.cell)));
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});expect(await occupied(page)).toEqual(ghost);expect(ghost).toEqual([9,10,17,18]);
  await page.locator('[data-slot="2"]').tap();await page.locator('[data-cell="63"]').tap();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','2');expect(await occupied(page)).toContain(63);await session.detach();
 });
});

test('mid-run artwork, lifecycle cleanup and measured browser frame intervals',async({page})=>{
 await page.setViewportSize({width:390,height:844});const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const s=fixture();s.moves=18;s.score=92;s.lines=3;s.tray=[5,12,0];
 for(const [color,indices] of [[4,[0,1,2,8]],[2,[12,13,14,20]],[6,[25,26,27,35]],[7,[38,39,46,47]],[3,[48,49,57]],[1,[60,61,62]]] as [number,number[]][])for(const i of indices)s.board[i]=color;
 await open(page,s);const b=await page.locator('[data-slot="0"] svg').boundingBox();if(!b)throw Error('missing');
 await page.mouse.move(b.x+b.width/4,b.y+b.height/4);await page.mouse.down();const end=await point(page,'[data-cell="43"]');await page.mouse.move(end.x,end.y,{steps:5});await expect(page.locator('.cb-ghost')).toHaveCount(4);await page.mouse.up();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','19');
 await page.screenshot({path:'tests/games/color-blocks/evidence/chromium.png',fullPage:true});
 const frames=await page.evaluate(()=>new Promise<number[]>(resolve=>{const intervals:number[]=[];let prev=0;const tick=(t:number)=>{if(prev)intervals.push(t-prev);prev=t;if(intervals.length===45)resolve(intervals);else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
 frames.sort((a,b)=>a-b);console.log(`Color Blocks headless Chromium: 45 idle RAF intervals; median ${frames[22].toFixed(2)} ms, p95 ${frames[42].toFixed(2)} ms.`);
 for(let i=0;i<3;i++){
  await page.getByRole('link',{name:'Back to game library'}).click();await page.getByRole('link',{name:'Play Color Blocks',exact:true}).click();await expect(page.locator('.cb-game')).toHaveCount(1);await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','19');
 }
 await page.locator('#game-stage').focus();await page.keyboard.press('3');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','20');expect(errors).toEqual([]);
});
