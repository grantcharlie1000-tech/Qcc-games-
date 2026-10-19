import { test, expect, type Page } from '@playwright/test';
import { deal, type State } from '../../../src/games/solitaire/model';
const key='pocket-arcade:v1:save:solitaire';
async function open(page:Page,state:State=deal(123)){
 await page.addInitScript(({key,state})=>{if(!sessionStorage.getItem('sol-test-init')){localStorage.setItem(key,JSON.stringify({version:1,data:{version:1,state,history:[]},updated:0}));sessionStorage.setItem('sol-test-init','1');}},{key,state});
 await page.goto('/#/game/solitaire');await expect(page.locator('.solitaire')).toBeVisible();
}
const state=()=>{const s=deal(99);const columns=[[6],[18],[10,19,5],[7]];const used=columns.flat();s.tableau=Array.from({length:7},(_,i)=>(columns[i]||[]).map(id=>({id,up:true})));s.tableau[2][0].up=false;s.stock=Array.from({length:52},(_,i)=>i).filter(id=>!used.includes(id));s.waste=[];s.foundations=[[],[],[],[]];return s;};
async function saved(page:Page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).data,key);}
test('stock draw, hint, undo, restart, pause and save restore operate through the shell',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await open(page);
 await page.getByRole('button',{name:'Draw from stock, 24 cards'}).click();await expect(page.locator('[data-source="waste"]')).toBeVisible();expect((await saved(page)).state.stock).toHaveLength(23);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.locator('[data-source="waste"]')).toHaveCount(0);await expect(page.getByRole('button',{name:'Draw from stock, 24 cards'})).toBeVisible();
 await page.getByRole('button',{name:'Hint',exact:true}).click();await expect(page.locator('.sol-message')).toContainText('Hint:');await expect(page.locator('.sol-hint')).toHaveCount(1);
 await page.getByRole('button',{name:'Draw from stock, 24 cards'}).click();const before=await saved(page);
 await page.getByRole('button',{name:'Pause game',exact:true}).click();await expect(page.locator('.solitaire button:not(:disabled)')).toHaveCount(0);await expect(page.getByRole('heading',{name:'Paused',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Keep playing',exact:true}).click();await page.reload();await expect(page.locator('[data-source="waste"]')).toBeVisible();expect((await saved(page)).state).toEqual(before.state);
 await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(page.getByRole('button',{name:'Draw from stock, 24 cards'})).toBeVisible();await expect(page.getByRole('button',{name:'Undo',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Pause game',exact:true}).click();await page.getByRole('button',{name:'Restart game',exact:true}).click();await expect(page.locator('#pause-overlay')).toBeHidden();await expect(page.getByRole('button',{name:'Draw from stock, 24 cards'})).toBeEnabled();
 await page.getByRole('button',{name:'Game rules',exact:true}).click();await expect(page.locator('#rules-text')).toContainText('Unlimited recycles');await page.locator('.rules-done').click();
 await page.getByRole('link',{name:'Back to game library'}).click();await page.goto('/#/game/solitaire');await expect(page.getByRole('button',{name:'Draw from stock, 24 cards'})).toBeVisible();expect(errors).toEqual([]);
});
test('click and keyboard move real cards and undo restores a revealed card',async({page})=>{
 await open(page,state());const six=page.getByRole('button',{name:'6 of hearts, column 2',exact:true});await six.click();await expect(six).toHaveAttribute('aria-pressed','true');await page.getByRole('button',{name:'7 of clubs, column 1',exact:true}).click();await expect(page.getByRole('button',{name:'6 of hearts, column 1',exact:true})).toBeVisible();expect((await saved(page)).state.tableau[0].map((c:{id:number})=>c.id)).toEqual([6,18]);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('button',{name:'6 of hearts, column 2',exact:true})).toBeVisible();
 const seven=page.getByRole('button',{name:'7 of hearts, column 3',exact:true});await seven.focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Move selected cards to column 4',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByRole('button',{name:'Jack of clubs, column 3',exact:true})).toBeVisible();expect((await saved(page)).state.tableau[3].map((c:{id:number})=>c.id)).toEqual([7,19,5]);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect(page.getByRole('button',{name:'Jack of clubs, column 3',exact:true})).toHaveCount(0);
});
test('pointer drag moves a sequence and rejects an illegal drop',async({page})=>{
 await open(page,state());const from=await page.getByRole('button',{name:'7 of hearts, column 3',exact:true}).boundingBox();const to=await page.getByRole('button',{name:'8 of clubs, column 4',exact:true}).boundingBox();
 await page.mouse.move(from!.x+15,from!.y+10);await page.mouse.down();await page.mouse.move(to!.x+20,to!.y+40,{steps:12});await expect(page.locator('.sol-drag-ghost')).toBeVisible();await page.mouse.up();await expect(page.locator('.sol-drag-ghost')).toHaveCount(0);expect((await saved(page)).state.tableau[3].map((c:{id:number})=>c.id)).toEqual([7,19,5]);
 const six=await page.getByRole('button',{name:'6 of hearts, column 2',exact:true}).boundingBox();const empty=await page.getByRole('button',{name:'Move selected cards to column 7, empty, Kings only'}).boundingBox();const before=(await saved(page)).state;
 await page.mouse.move(six!.x+12,six!.y+12);await page.mouse.down();await page.mouse.move(empty!.x+15,empty!.y+50,{steps:10});await page.mouse.up();expect((await saved(page)).state).toEqual(before);
});
test('phone layout remains readable and fits, with actual screenshot evidence',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);await expect(page.locator('.sol-tableau')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'tests/games/solitaire/evidence/chromium.png',fullPage:true});
});
test('complete legal foundations show a win; invalid saves safely start fresh',async({page})=>{
 const s=deal(1);s.tableau=[[],[],[],[],[],[],[]];s.stock=[];s.foundations=Array.from({length:4},(_,suit)=>Array.from({length:13},(_,r)=>suit*13+r));s.foundations[0].pop();s.waste=[12];await open(page,s);await expect(page.locator('.solitaire')).not.toHaveClass(/sol-won/);await page.getByRole('button',{name:'King of clubs, Waste',exact:true}).click();await page.getByRole('button',{name:'Queen of clubs, foundation',exact:true}).click();await expect(page.locator('.solitaire')).toHaveClass(/sol-won/);await expect(page.locator('.sol-message')).toContainText('Perfect finish');await expect(page.locator('#game-score')).toContainText('520');
 await page.getByRole('link',{name:'Back to game library'}).click();await expect(page.locator('.solitaire')).toHaveCount(0);await page.evaluate(key=>{localStorage.setItem(key,JSON.stringify({version:1,data:{version:1,state:{stock:[1,1]},history:[]}}));},key);await page.goto('/#/game/solitaire');await expect(page.getByRole('button',{name:'Draw from stock, 24 cards'})).toBeVisible();
});

test('touch pointer drag uses the same legal move path on a phone',async({browser})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});const page=await context.newPage();await open(page,state());const cdp=await context.newCDPSession(page);
 const from=(await page.getByRole('button',{name:'6 of hearts, column 2',exact:true}).boundingBox())!;const to=(await page.getByRole('button',{name:'7 of clubs, column 1',exact:true}).boundingBox())!;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:from.x+15,y:from.y+12}]});
 for(let i=1;i<=8;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+15+(to.x-from.x)*i/8,y:from.y+12+(to.y-from.y+20)*i/8}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.getByRole('button',{name:'6 of hearts, column 1',exact:true})).toBeVisible();expect((await saved(page)).state.tableau[0].map((c:{id:number})=>c.id)).toEqual([6,18]);const before=(await saved(page)).state;const current=(await page.getByRole('button',{name:'6 of hearts, column 1',exact:true}).boundingBox())!;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:current.x+12,y:current.y+12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:current.x+70,y:current.y+35}]});await expect(page.locator('.sol-drag-ghost')).toBeVisible();await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await expect(page.locator('.sol-drag-ghost')).toHaveCount(0);expect((await saved(page)).state).toEqual(before);await context.close();
});
test('a long tableau sequence stays within its column at desktop and phone sizes',async({page})=>{
 const s=deal(33);const sequence=Array.from({length:13},(_,i)=>12-i+(i%2?13:0));s.tableau=[sequence.map(id=>({id,up:true})),[],[],[],[],[],[]];s.stock=Array.from({length:52},(_,i)=>i).filter(id=>!sequence.includes(id));await page.setViewportSize({width:1366,height:900});await open(page,s);
 const fits=async()=>{const card=(await page.getByRole('button',{name:'Ace of clubs, column 1',exact:true}).boundingBox())!;const column=(await page.locator('.sol-column').first().boundingBox())!;const message=(await page.locator('.sol-message').boundingBox())!;expect(card.y+card.height).toBeLessThanOrEqual(column.y+column.height+1);expect(message.y).toBeGreaterThan(card.y+card.height);};
 await fits();await page.setViewportSize({width:390,height:844});await fits();
});
