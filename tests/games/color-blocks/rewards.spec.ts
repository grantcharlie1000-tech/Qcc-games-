import {pauseGame} from '../../game-menu';
import {test,expect,type Page} from '../../fixtures';
import {createGame,type State} from '../../../src/games/color-blocks/model';
const SAVE='pocket-arcade:v1:save:color-blocks';
const EVIDENCE='tests/games/color-blocks/evidence';
/** Rows 0–2 are full except columns 5–7; a big square there clears three rows and three colours. */
function fixture():State{
 const s:State={...createGame(42),board:Array(64).fill(0),tray:[18,0,1],colors:[3,5,5],witness:[],history:[],seed:0};
 for(let y=0;y<3;y++)for(let x=0;x<5;x++)s.board[y*8+x]=y<2?1:2;s.board[63]=4;return s;
}
async function open(page:Page,s=fixture()){
 await page.addInitScript(({key,snapshot})=>{if(!sessionStorage.getItem('cb-reward-ready')){localStorage.clear();localStorage.setItem('pocket-arcade:v1:accounts:guest','true');localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');localStorage.setItem(key,JSON.stringify({version:1,data:snapshot}));sessionStorage.setItem('cb-reward-ready','yes');}},{key:SAVE,snapshot:s});
 await page.goto('/#/game/color-blocks');await expect(page.locator('.cb-cell')).toHaveCount(64);
}
async function centre(page:Page,selector:string){const b=(await page.locator(selector).boundingBox())!;return {x:b.x+b.width/2,y:b.y+b.height/2};}
/** Grab the top-left block of a tray piece and drag it so that block lands on `cell`. */
async function dragTo(page:Page,slot:number,cell:number){
 const b=(await page.locator(`[data-slot="${slot}"] svg`).boundingBox())!,cols=Number((await page.locator(`[data-slot="${slot}"] svg`).getAttribute('viewBox'))!.split(' ')[2])/32;
 await page.mouse.move(b.x+b.width/cols/2,b.y+b.width/cols/2);await page.mouse.down();
 const end=await centre(page,`[data-cell="${cell}"]`);await page.mouse.move(end.x,end.y,{steps:6});
}
/** Freeze running effects for a stable screenshot, then let them finish. */
async function capture(page:Page,path:string){await page.evaluate(()=>document.getAnimations().forEach(a=>a.pause()));await page.screenshot({path});await page.evaluate(()=>document.getAnimations().forEach(a=>a.play()));}
const saved=(page:Page):Promise<State>=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).data,SAVE);

for(const viewport of [{width:390,height:844},{width:1366,height:768}])test(`preview, release, label and score settle at ${viewport.width}px`,async({page})=>{
 await page.setViewportSize(viewport);await open(page);const root=page.locator('.cb-game');
 await dragTo(page,0,5);
 await expect(page.locator('.cb-ghost')).toHaveCount(9);await expect(page.locator('.cb-line-preview')).toHaveCount(24);await expect(page.locator('.cb-board')).toHaveClass(/cb-preview-rainbow/);
 await page.screenshot({path:`${EVIDENCE}/rewards-preview-${viewport.width}.png`});
 // Record every value the dock's score source shows while the total counts up.
 await page.evaluate(()=>{const w=window as unknown as {cbShown:string[]};w.cbShown=[];const el=document.querySelector('.cb-score-total')!;new MutationObserver(()=>w.cbShown.push(el.textContent!)).observe(el,{childList:true,characterData:true,subtree:true});});
 await page.mouse.up();
 // State commits before presentation: 9 + 20·3² + 40·3 colours gone (1, 2 and the piece's 3).
 await expect(root).toHaveAttribute('data-score','309');await expect(root).toHaveAttribute('data-combo','1');
 await expect(page.locator('.cb-label strong')).toHaveText('3 colours gone!');await expect(page.locator('.cb-label small')).toHaveText('+309');
 await expect(page.locator('.cb-sweep.cb-rainbow')).toHaveCount(3);
 await capture(page,`${EVIDENCE}/rewards-release-${viewport.width}.png`);
 await expect(page.locator('.cb-breakdown')).toHaveText('+309 = 9 blocks + 180 lines + 120 colour');
 await expect(page.locator('.cb-combo')).toBeVisible();await expect(page.locator('.cb-combo-label')).toHaveText('Combo 1');await expect(page.locator('.cb-pips .cb-pip-on')).toHaveCount(2);
 await expect(page.locator('.cb-effects')).toBeEmpty();await expect(page.locator('.cb-score-total')).toHaveText('309');await expect(page.locator('.game-hud')).toContainText('309');
 const shown=(await page.evaluate(()=>(window as unknown as {cbShown:string[]}).cbShown)).map(Number);expect(shown.some(v=>v>0&&v<309),`intermediate totals: ${shown.join(', ')}`).toBe(true);expect(shown.at(-1)).toBe(309);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const tray=(await page.locator('.cb-tray').boundingBox())!,dock=(await page.locator('.game-dock').boundingBox())!;expect(tray.y+tray.height).toBeLessThanOrEqual(dock.y);
 await page.screenshot({path:`${EVIDENCE}/rewards-settled-${viewport.width}.png`});
 // A plain placement spends one setup move and keeps the chain.
 await dragTo(page,1,40);await page.mouse.up();await expect(root).toHaveAttribute('data-setup','1');await expect(page.locator('.cb-pips .cb-pip-on')).toHaveCount(1);await expect(root).toHaveAttribute('data-combo','1');
});

test('the next drag works while a big celebration is still fading, with frame timings',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);const root=page.locator('.cb-game');const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>{const w=window as unknown as {cbFrames:number[];cbLong:number[]};w.cbFrames=[];w.cbLong=[];new PerformanceObserver(list=>{for(const e of list.getEntries())w.cbLong.push(e.duration);}).observe({type:'longtask'});let prev=0;const tick=(t:number)=>{if(prev)w.cbFrames.push(t-prev);prev=t;if(w.cbFrames.length<90)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
 await dragTo(page,0,5);
 // Record what is on screen at the instant the next piece is picked up.
 await page.evaluate(()=>document.addEventListener('pointerdown',()=>{(window as unknown as {cbAtDown:number}).cbAtDown=document.querySelectorAll('.cb-effects > *').length;},{capture:true,once:true}));
 const next=(await page.locator('[data-slot="1"] svg').boundingBox())!,target=await centre(page,'[data-cell="40"]');
 await page.mouse.up();await page.mouse.move(next.x+next.width/2,next.y+next.height/2);await page.mouse.down();await page.mouse.move(target.x,target.y,{steps:3});
 await expect(root).toHaveAttribute('data-moves','1');
 // The previous clear's effects were still fading when the new drag began, and the ghost follows the pointer.
 expect(await page.evaluate(()=>(window as unknown as {cbAtDown:number}).cbAtDown)).toBeGreaterThan(0);await expect(page.locator('.cb-ghost')).toHaveCount(1);
 await capture(page,`${EVIDENCE}/rewards-drag-during-celebration.png`);
 await page.mouse.up();await expect(root).toHaveAttribute('data-moves','2');await expect(page.locator('[data-cell="40"]')).toHaveAttribute('data-value','5');
 const frames=await page.waitForFunction(()=>{const f=(window as unknown as {cbFrames:number[]}).cbFrames;return f.length>=90&&f;}).then(h=>h.jsonValue()) as number[];
 frames.sort((a,b)=>a-b);console.log(`Block Blast clear + drag, headless Chromium: ${frames.length} RAF intervals; median ${frames[45].toFixed(2)} ms, p95 ${frames[85].toFixed(2)} ms, max ${frames.at(-1)!.toFixed(2)} ms; slowest ${frames.slice(-6).map(f=>f.toFixed(0)).join(', ')}.`);
 // RAF gaps here include Playwright's synchronous input dispatch (a plain drag on the previous build
 // showed the same p95 ≈ 83 ms), so the assertion uses main-thread long tasks: the game's own work.
 const long=await page.evaluate(()=>(window as unknown as {cbLong:number[]}).cbLong);console.log(`Long tasks during clear + drag: ${long.length ? long.map(d=>d.toFixed(0)).join(', ')+' ms' : 'none'}.`);
 expect(Math.max(0,...long)).toBeLessThan(100);expect(errors).toEqual([]);
});

test('interrupting a celebration leaves exactly the state of an unanimated placement',async({page})=>{
 await open(page);await dragTo(page,0,5);await page.mouse.up();await pauseGame(page);
 await expect(page.locator('.cb-effects')).toBeEmpty();const animated=await saved(page);
 // Same fixture again, placed by keyboard, which runs no presentation at all.
 const context=page.context();await page.close();const second=await context.newPage();await open(second);
 await expect(second.locator('.cb-game')).toHaveAttribute('data-moves','0');await second.locator('#game-stage').focus();await second.keyboard.press('1');
 for(let i=0;i<5;i++)await second.keyboard.press('ArrowRight');await second.keyboard.press('Enter');
 await expect(second.locator('.cb-game')).toHaveAttribute('data-moves','1');await expect(second.locator('.cb-effects')).toBeEmpty();
 await pauseGame(second);expect(await saved(second)).toEqual(animated);
 expect(animated.score).toBe(309);expect(animated.history).toEqual([[0,5,0]]);
});

test('reduced motion keeps the label but drops particles and scaling',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await open(page);
 await dragTo(page,0,5);await page.mouse.up();
 await expect(page.locator('.cb-label strong')).toHaveText('3 colours gone!');expect(await page.locator('.cb-spark').count()).toBe(0);
 await expect(page.locator('.cb-score-total')).toHaveText('309');await expect(page.locator('.cb-feedback')).toHaveText('3 lines cleared! 3 colours gone! +309 = 9 blocks + 180 lines + 120 colour');
 await capture(page,`${EVIDENCE}/rewards-reduced-motion.png`);
});

test('game over shows a compact result card that restarts the run',async({page})=>{
 const s=fixture();s.board=Array.from({length:64},(_,i)=>(i%8+Math.floor(i/8))%2===0?1:0);s.tray=[5,null,null];s.colors=[2,null,null];s.score=812;s.lines=14;s.maxCombo=4;s.maxLines=3;s.moves=40;
 await open(page,s);await expect(page.locator('.cb-result')).toBeVisible();await expect(page.locator('.cb-result-score')).toHaveText('812');
 await expect(page.locator('.cb-result-stats')).toContainText('Best combo4');await expect(page.locator('.cb-result-stats')).toContainText('Biggest clear3 lines');
 await page.screenshot({path:`${EVIDENCE}/rewards-result-card.png`});
 await page.locator('.cb-again').click();await expect(page.locator('.cb-result')).toBeHidden();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','0');
});
