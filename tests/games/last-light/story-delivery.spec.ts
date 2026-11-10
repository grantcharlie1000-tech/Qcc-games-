import {test,expect} from '../../fixtures';
import {createRun,serialize} from '../../../src/games/last-light/model';
import {CHAPTERS} from '../../../src/games/last-light/story';
const URL='/#/game/last-light';
for(const stage of [0,8,39])test(`level ${stage+1} clears with arrows and nearby keys without story interactions`,async({page})=>{
 test.setTimeout(90000);
 if(stage){const run=createRun();run.stage=stage;run.cleared=stage;await page.addInitScript(save=>localStorage.setItem('pocket-arcade:v1:save:last-light',JSON.stringify({version:1,data:save,updated:1})),serialize(run));}
 await page.goto(URL);await expect(page.getByRole('button',{name:stage?'Continue →':'Play →',exact:true})).toBeVisible();
 await page.evaluate(()=>{
  const nativeFrame=window.requestAnimationFrame.bind(window),nativeCancel=window.cancelAnimationFrame.bind(window);
  let stamp=1000000,next=1;const callbacks=new Map<number,FrameRequestCallback>();
  (window as any).__releaseFrames=()=>{window.requestAnimationFrame=nativeFrame;window.cancelAnimationFrame=nativeCancel;for(const cb of callbacks.values())nativeFrame(cb);callbacks.clear();};
  window.requestAnimationFrame=callback=>{const id=next++;callbacks.set(id,callback);return id;};window.cancelAnimationFrame=id=>{callbacks.delete(id);};
  (window as any).__tick=(frames=1)=>{stamp+=8.334*frames;const pending=[...callbacks.values()];callbacks.clear();for(const callback of pending)callback(stamp);};
 });
 await page.getByRole('button',{name:stage?'Continue →':'Play →',exact:true}).click();
 await expect(page.locator('.ll-opening')).toBeVisible();
 await expect(page.locator('.ll-opening')).toContainText(CHAPTERS[stage].line);
 await page.screenshot({path:`work/last-light/story-level-${stage+1}-start.png`});
 const result=await page.evaluate(async(stage)=>{
  const path='/tests/games/last-light/journeys.json',witness=(await import(path)).default.find((w:any)=>w.stage===stage);
  const game=document.querySelector<HTMLElement>('.ll-game')!,canvas=game.querySelector('canvas')!,held=new Set<string>();let openingWhileMoving=false;
  function key(code:string,on:boolean){if(on===held.has(code))return;on?held.add(code):held.delete(code);canvas.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code,bubbles:true}));}
  (window as any).__tick();
  // Keep every legal 120 Hz input step while rendering several physics
  // steps per frame, as the real fixed-step loop does on slower displays.
  for(const [frames,bits] of witness.blocks){
   const move=(bits&3)-1;key('ArrowRight',move>0);key('ArrowLeft',move<0);key('ArrowUp',!!(bits&4));key('ShiftRight',!!(bits&8));
   for(let remaining=frames;remaining>0;){const count=Math.min(10,remaining);(window as any).__tick(count);remaining-=count;if(Number(game.dataset.x)>212&&!game.querySelector<HTMLElement>('.ll-opening')!.hidden)openingWhileMoving=true;}
  }
  const result={openingWhileMoving,phase:game.dataset.phase,deaths:Number(document.querySelector('.ll-deaths')!.textContent),activated:game.dataset.activated};
  for(const keyCode of [...held])key(keyCode,false);
  for(let i=0;i<24;i++)(window as any).__tick(10);
  (window as any).__releaseFrames();return result;
 },stage);
 expect(result).toEqual({openingWhileMoving:true,phase:stage===39?'complete':'cleared',deaths:0,activated:''});
 await expect(page.getByRole('heading',{name:stage===39?'All forty cleared.':'Level clear.',exact:true})).toBeVisible();await expect(page.locator('.ll-card > .ll-story')).toHaveText(CHAPTERS[stage].after);await page.screenshot({path:`work/last-light/story-level-${stage+1}-clear.png`});if(stage<39){await page.getByRole('button',{name:'Next level →',exact:true}).click();await expect(page.locator('.ll-game')).toHaveAttribute('data-stage',String(stage+2));}
});
