import {test,expect,type Page} from '../../fixtures';
import {createGame,SHAPES,type State} from '../../../src/games/color-blocks/model';
import {clearReference,solveHand} from './hand-oracle';
const SAVE='pocket-arcade:v1:save:color-blocks';
async function saved(page:Page):Promise<State>{return page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).data,SAVE);}
test.use({viewport:{width:390,height:844},hasTouch:true});
test('a fresh full hand plays through native touch, mouse and keyboard, then survives reload and restart',async({page})=>{
 const fixture:State={...createGame(42),board:Array.from({length:64},(_,i)=>(Math.floor(i/8)+i%8)%2?0:1),tray:[null,null,0],bag:[18,16,17]};
 await page.addInitScript(({key,s})=>{if(!sessionStorage.getItem('fair-cb-seeded')){localStorage.setItem(key,JSON.stringify({version:1,data:s}));sessionStorage.setItem('fair-cb-seeded','yes');}},{key:SAVE,s:fixture});
 await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/#/game/color-blocks');
 const root=page.locator('.cb-game');await expect(root).toHaveAttribute('data-moves','0');await page.locator('.cb-board').hover();
 await page.locator('#game-stage').focus();await page.keyboard.press('3');await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
 await expect(root).toHaveAttribute('data-moves','1');let state=await saved(page);expect(state.tray).toEqual([0,0,0]);
 const witness=solveHand(state.board,state.tray);expect(witness).toHaveLength(3);let cursor={x:1,y:0};
 for(const [i,move] of witness!.entries()){
  const expected=[...state.board];for(const [dx,dy] of SHAPES[state.tray[move.slot]!])expected[(move.y+dy)*8+move.x+dx]=1;
  const slot=page.locator(`[data-slot="${move.slot}"]`),cell=page.locator(`[data-cell="${move.y*8+move.x}"]`);
  if(i===0){await slot.tap();await cell.tap();}
  else if(i===1){await slot.click();await cell.click();}
  else{
   await page.locator('#game-stage').focus();await page.keyboard.press(String(move.slot+1));
   for(let n=cursor.x;n!==move.x;n+=Math.sign(move.x-n))await page.keyboard.press(move.x>n?'ArrowRight':'ArrowLeft');
   for(let n=cursor.y;n!==move.y;n+=Math.sign(move.y-n))await page.keyboard.press(move.y>n?'ArrowDown':'ArrowUp');
   await page.keyboard.press('Enter');
  }
  await expect(root).toHaveAttribute('data-moves',String(i+2));state=await saved(page);expect(state.board.map(Boolean)).toEqual(clearReference(expected).map(Boolean));cursor=move;
 }
 await expect(root).not.toHaveClass(/cb-over/);expect(solveHand(state.board,state.tray)).toHaveLength(3);
 await page.screenshot({path:'tests/games/color-blocks/evidence/fair-hand-390x844.png'});
 await page.getByRole('button',{name:'Pause game',exact:true}).tap();state=await saved(page);await page.reload();await expect(root).toHaveAttribute('data-moves','4');expect(await saved(page)).toEqual(state);
 await page.getByRole('button',{name:'Restart game',exact:true}).tap();await expect(root).toHaveAttribute('data-moves','0');expect(solveHand((await saved(page)).board,(await saved(page)).tray)).toHaveLength(3);
});
