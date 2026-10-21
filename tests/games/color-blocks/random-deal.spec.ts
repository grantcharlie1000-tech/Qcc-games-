import {test,expect,seedStudyTopic,type Page} from '../../fixtures';
import type {State} from '../../../src/games/color-blocks/model';
import {solveHand} from './hand-oracle';
const SAVE='pocket-arcade:v1:save:color-blocks';
const saved=(page:Page):Promise<State>=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).data,SAVE);
function checkFresh(state:State){
 expect(state.board).toEqual(Array(64).fill(0));expect(state.moves).toBe(0);
 expect(solveHand(state.board,state.tray)).toHaveLength(3);
}

test('independent fresh games vary their hands while reload preserves each saved run',async({browser},testInfo)=>{
 test.setTimeout(60000);
 const samples:State[]=[];
 try{
  for(let i=0;i<12;i++){
   const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
   try{
    expect((await context.storageState()).origins).toEqual([]);await seedStudyTopic(context);
    const page=await context.newPage();await page.goto('/#/game/color-blocks');
    await expect(page.locator('.cb-piece')).toHaveCount(3);await page.getByRole('button',{name:'Pause game',exact:true}).click();
    const before=await saved(page);checkFresh(before);samples.push(before);
    await page.reload();await expect(page.locator('.cb-piece')).toHaveCount(3);
    await page.getByRole('button',{name:'Pause game',exact:true}).click();expect(await saved(page)).toEqual(before);
   }finally{await context.close();}
  }
 }finally{await testInfo.attach('fresh-game-samples',{body:JSON.stringify(samples),contentType:'application/json'});}
 expect(new Set(samples.map(state=>state.rng)).size).toBeGreaterThan(1);
 expect(new Set(samples.map(state=>state.tray.join(','))).size).toBeGreaterThan(1);
});

test('Restart creates a new random run rather than replaying a preset deal',async({page},testInfo)=>{
 const samples:State[]=[];
 await page.goto('/#/game/color-blocks');await expect(page.locator('.cb-piece')).toHaveCount(3);
 try{
  for(let i=0;i<16;i++){
   await page.getByRole('button',{name:'Restart game',exact:true}).click();
   const state=await saved(page);checkFresh(state);samples.push(state);
  }
  await page.reload();await expect(page.locator('.cb-piece')).toHaveCount(3);
  await page.getByRole('button',{name:'Pause game',exact:true}).click();expect(await saved(page)).toEqual(samples.at(-1));
 }finally{await testInfo.attach('restart-samples',{body:JSON.stringify(samples),contentType:'application/json'});}
 expect(new Set(samples.map(state=>state.rng)).size).toBeGreaterThan(1);
 expect(new Set(samples.map(state=>state.tray.join(','))).size).toBeGreaterThan(1);
});
