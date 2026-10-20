import {test,expect,type Page} from '../../fixtures';
import {createGame,type State} from '../../../src/games/color-blocks/model';
test.use({video:{mode:'on',size:{width:390,height:844}}});
const SAVE='pocket-arcade:v1:save:color-blocks';
const fixture=():State=>({...createGame(42),tray:[5,12,0],board:Array(64).fill(0)});
async function open(page:Page,state=fixture()){
 await page.addInitScript(({key,s})=>{localStorage.clear();localStorage.setItem(key,JSON.stringify({version:1,data:s}));},{key:SAVE,s:state});
 await page.goto('/#/game/color-blocks');await expect(page.locator('.cb-cell')).toHaveCount(64);
}
async function pickup(page:Page){
 const b=await page.locator('[data-slot="0"] svg').boundingBox();if(!b)throw Error('missing tray art');
 await page.mouse.move(b.x+b.width/4,b.y+b.height/4);await page.mouse.down();return b;
}
async function target(page:Page,i=18){const b=(await page.locator(`[data-cell="${i}"]`).boundingBox())!;return {x:b.x+b.width/2,y:b.y+b.height/2};}
async function ghost(page:Page){return page.locator('.cb-ghost').evaluateAll(es=>es.map(e=>Number((e as HTMLElement).dataset.cell)));}
for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1366,height:768}])test(`square board and full footprint ${viewport.width}x${viewport.height}`,async({page})=>{
 await page.setViewportSize(viewport);const s=fixture();
 for(const [color,indices] of [[4,[7]],[7,[13,14,24,25,26,27,28,30,43,51,52,60]],[1,[15,44,53,54]],[5,[29,34,35,36,42]],[3,[40,41]]] as [number,number[]][])for(const i of indices)s.board[i]=color;
 s.moves=18;s.score=2362;await open(page,s);
 const b=(await page.locator('.cb-board').boundingBox())!,tray=(await page.locator('.cb-tray').boundingBox())!;
 expect(Math.abs(b.width-b.height)).toBeLessThan(1);expect(b.y).toBeGreaterThanOrEqual(76);expect(tray.y+tray.height).toBeLessThanOrEqual(viewport.height);
 expect(await page.evaluate(()=>({x:document.documentElement.scrollWidth>innerWidth,y:document.documentElement.scrollHeight>innerHeight}))).toEqual({x:false,y:false});
 const small=await pickup(page),large=(await page.locator('.cb-drag-art').boundingBox())!;
 expect(large.width/small.width).toBeCloseTo(2,1);const end=await target(page,0);await page.mouse.move(end.x,end.y,{steps:8});expect(await ghost(page)).toEqual([0,1,8,9]);
 await page.screenshot({path:`tests/games/color-blocks/evidence/correction-${viewport.width}x${viewport.height}-drag.png`});
 await page.mouse.up();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','19');
 await expect(page.locator('[data-cell="9"]')).toHaveAttribute('data-value','6');
 await page.screenshot({path:`tests/games/color-blocks/evidence/correction-${viewport.width}x${viewport.height}.png`});
});
test('Escape, resize and lost capture cancel a gesture without arming a later board click',async({page})=>{
 await page.setViewportSize({width:390,height:844});await open(page);
 for(const kind of ['escape','resize','capture']){
  await pickup(page);const end=await target(page);await page.mouse.move(end.x,end.y,{steps:5});expect(await ghost(page)).toEqual([18,19,26,27]);
  if(kind==='escape')await page.keyboard.press('Escape');
  if(kind==='resize')await page.setViewportSize({width:400,height:844});
  if(kind==='capture')await page.evaluate(()=>{const root=document.querySelector('.cb-game')!;root.dispatchEvent(new PointerEvent('lostpointercapture',{pointerId:1,bubbles:true}));});
  await page.mouse.up();if(kind==='escape'){await expect(page.locator('.study-return')).toBeVisible();await page.getByRole('link',{name:'Games'}).click();}await page.locator('[data-cell="18"]').click();
  await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','0');await expect(page.locator('.cb-drag-art')).toBeHidden();
 }
});
test('a fresh keyboard selection can be placed by a board click after restore',async({page})=>{
 await open(page);await page.locator('#game-stage').focus();await page.keyboard.press('1');await page.locator('[data-cell="18"]').click();
 await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');await expect(page.locator('[data-cell="27"]')).toHaveAttribute('data-value','6');
});
test('held placement key cannot place a freshly selected second piece',async({page})=>{
 await open(page);await page.locator('#game-stage').focus();await page.keyboard.press('1');await page.keyboard.down('Enter');
 await page.keyboard.press('3');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.down('Enter');
 await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');await page.keyboard.up('Enter');
 await page.keyboard.press('Enter');await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','2');
});
test('pointer crossing clear shows short row/column feedback without changing scoring',async({page})=>{
 const s=fixture();s.tray=[0,1,2];s.moves=2;s.combo=2;for(let x=1;x<8;x++)s.board[x]=1;for(let y=1;y<8;y++)s.board[y*8]=2;
 await open(page,s);await pickup(page);const end=await target(page,0);await page.mouse.move(end.x,end.y,{steps:5});await page.mouse.up();
 await expect(page.locator('.cb-game')).toHaveAttribute('data-score','121');await expect(page.locator('.cb-game')).toHaveAttribute('data-combo','3');
 expect(await page.locator('.cb-occupied').count()).toBe(0);await expect(page.locator('.cb-feedback')).toContainText('2 lines cleared');
 await expect(page.locator('.cb-effects')).toBeEmpty();
});
test.describe('native touch evidence',()=>{
 test.use({hasTouch:true,viewport:{width:390,height:844}});
 test('trusted touch pickup, lifted preview, snap, invalid return and cancel',async({page,context,browserName},testInfo)=>{
  test.skip(browserName!=='chromium','Native touch dispatch uses Chromium CDP.');await open(page);
  const session=await context.newCDPSession(page);
  async function start(slot:number){const b=(await page.locator(`[data-slot="${slot}"] svg`).boundingBox())!;await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/4,y:b.y+b.height/4,id:1}]});return b;}
  async function move(i:number){const end=await target(page,i),b=(await page.locator('.cb-board').boundingBox())!;end.y+=Math.max(26,b.width/8*1.25);await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...end,id:1}]});return end;}
  const small=await start(0);await page.waitForTimeout(250);const large=(await page.locator('.cb-drag-art').boundingBox())!;expect(large.width/small.width).toBeCloseTo(2,1);
  const finger=await move(18);await page.waitForTimeout(350);expect(await ghost(page)).toEqual([18,19,26,27]);const floating=(await page.locator('.cb-drag-art').boundingBox())!;expect(floating.y+floating.height/4).toBeLessThan(finger.y-25);
  await page.screenshot({path:'tests/games/color-blocks/evidence/touch-lifted-preview.png'});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');
  await page.waitForTimeout(250);await start(1);await page.waitForTimeout(200);await move(18);await page.waitForTimeout(300);expect(await ghost(page)).toEqual([]);await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('.cb-drag-art')).toBeHidden();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');
  await page.waitForTimeout(250);await start(1);await move(40);await page.waitForTimeout(300);expect(await ghost(page)).toEqual([40,41,42,49]);await session.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await page.locator('[data-cell="40"]').tap();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');await expect(page.locator('.cb-drag-art')).toBeHidden();
  await start(1);await move(40);await page.keyboard.press('Escape');await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('.study-return')).toBeVisible();await page.getByRole('link',{name:'Games'}).click();await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');
  await start(1);await move(40);await page.getByRole('button',{name:'Pause game',exact:true}).focus();await page.keyboard.press('Enter');await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','1');await expect(page.locator('#pause-overlay')).toBeVisible();await page.getByRole('button',{name:'Keep playing'}).click();
  await page.locator('#game-stage').focus();await page.keyboard.press('3');await page.keyboard.press('Enter');await expect(page.locator('.cb-game')).toHaveAttribute('data-moves','2');
  await session.detach();const video=page.video()!;await page.close();await video.saveAs('tests/games/color-blocks/evidence/touch-drag.webm');await testInfo.attach('touch-drag-recording',{path:'tests/games/color-blocks/evidence/touch-drag.webm',contentType:'video/webm'});
 });
});
