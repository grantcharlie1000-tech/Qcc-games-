import {test,expect} from '../../fixtures';
import {createRun,serialize} from '../../../src/games/last-light/model';
const URL='/#/game/last-light';
test('optional conversation and journal work with keyboard and freeze play',async({page})=>{
 await page.goto(URL);await page.getByRole('button',{name:'Play →',exact:true}).click();
 await page.keyboard.down('ArrowRight');await expect.poll(async()=>Number(await page.locator('.ll-game').getAttribute('data-x'))).toBeGreaterThan(118);await page.keyboard.up('ArrowRight');await page.keyboard.press('e');
 await expect(page.locator('.ll-dialogue')).toBeVisible();await expect(page.locator('.ll-dialogue')).toContainText('Your sister Mira');
 await page.keyboard.press('j');await expect(page.getByRole('heading',{name:'The things we carry.'})).toBeVisible();await expect(page.locator('.ll-journal')).toContainText('Nell');
 const elapsed=await page.locator('.ll-game').getAttribute('data-elapsed');await page.keyboard.press('ArrowRight');expect(await page.locator('.ll-game').getAttribute('data-elapsed')).toBe(elapsed);
 await page.keyboard.press('j');await expect(page.locator('.ll-game')).toHaveAttribute('data-overlay','none');
 await page.keyboard.press('m');await expect(page.locator('.ll-game')).toHaveAttribute('data-overlay','none');await expect(page.getByRole('button',{name:'Map',exact:true})).toHaveCount(0);
});
test('crumble tiles warn, fragment, rebuild and keep decorative motion reduced',async({page})=>{
 await page.goto(URL);
 const result=await page.evaluate(async()=>{
  const model='/src/games/last-light/model.ts',levels='/src/games/last-light/levels.ts',terrain='/src/games/last-light/terrain.ts',actors='/src/games/last-light/world.ts';
  const {createRun}=await import(model),{LEVELS}=await import(levels),{drawPlatform}=await import(terrain),{person}=await import(actors);
  const c=document.createElement('canvas');c.width=240;c.height=280;const ctx=c.getContext('2d')!,l=LEVELS[4],p=l.platforms.find((p:any)=>p.kind==='crumble'),s=createRun();s.stage=4;
  const hash=()=>ctx.getImageData(0,0,c.width,c.height).data.reduce((n:number,v:number)=>Math.imul(n^v,16777619)>>>0,2166136261);
  function draw(timer:number|undefined,clock=1,reduced=false){ctx.clearRect(0,0,c.width,c.height);s.clock=clock;s.crumbles=timer===undefined?{}:{[p.id]:timer};drawPlatform(ctx,p,20,30,s,l,reduced);return hash();}
  const states=[undefined,.8,.3,-.1,-.45,-2.15,-2.4].map(n=>draw(n));
  const frozen=[draw(.3,3,true),draw(.3,8,true)],falling=[draw(-.1),draw(-.4)];
  const palettes=[];for(const color of ['#ae837a','#8f9c70','#b79871','#a0acbf']){ctx.clearRect(0,0,c.width,c.height);person(ctx,70,100,0,color);const pixels=ctx.getImageData(0,0,c.width,c.height).data,colors=new Set();for(let i=0;i<pixels.length;i+=4)if(pixels[i+3])colors.add(`${pixels[i]},${pixels[i+1]},${pixels[i+2]}`);palettes.push(colors.size);}
  return {states,frozen,falling,palettes};
 });
 expect(new Set(result.states).size).toBe(7);expect(result.frozen[0]).toBe(result.frozen[1]);expect(result.falling[0]).not.toBe(result.falling[1]);expect(result.palettes.every(n=>n>=22)).toBe(true);
});
for(const stage of [0,8,16,24,32,39])test(`chapter ${stage+1} scene is playable and has no console errors`,async({page})=>{
 const s=createRun();s.stage=stage;s.cleared=stage;const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 if(stage)await page.addInitScript(data=>localStorage.setItem('pocket-arcade:v1:save:last-light',JSON.stringify({version:1,data,updated:1})),serialize(s));
 await page.goto(URL);await page.getByRole('button',{name:stage?'Continue →':'Play →',exact:true}).click();await expect(page.locator('.game-hud .ll-hud')).toBeVisible();
 await page.locator('.ll-canvas').screenshot({path:`work/last-light/chapter-${stage+1}.png`});
 await page.keyboard.press('Delete');await expect(page.locator('.ll-game')).toHaveAttribute('data-overlay','menu');expect(errors).toEqual([]);
});
test.describe('phone journey tools',()=>{
 test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 test('movement controls fit and contextual interaction stays usable',async({page})=>{
  await page.goto(URL);await page.getByRole('button',{name:'Play →',exact:true}).click();
  const right=page.getByRole('button',{name:'Move right',exact:true}),box=(await right.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await expect.poll(async()=>Number(await page.locator('.ll-game').getAttribute('data-x'))).toBeGreaterThan(118);await page.mouse.up();
  await page.locator('.ll-prompt').tap();await expect(page.locator('.ll-dialogue')).toBeVisible();
  await page.screenshot({path:'work/last-light/phone-dialogue.png'});await page.getByRole('button',{name:'Dismiss conversation',exact:true}).tap();await page.getByRole('button',{name:'Menu',exact:true}).tap();await expect(page.locator('#game-options')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 });
});
for(const stage of [0,1])test(`level ${stage+1} clears with arrows and nearby keys without story interactions`,async({page})=>{
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
 const result=await page.evaluate(async(stage)=>{
  const path='/tests/games/last-light/journeys.json',witness=(await import(path)).default.find((w:any)=>w.stage===stage);
  const game=document.querySelector<HTMLElement>('.ll-game')!,canvas=game.querySelector('canvas')!,held=new Set<string>();
  function key(code:string,on:boolean){if(on===held.has(code))return;on?held.add(code):held.delete(code);canvas.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code,bubbles:true}));}
  (window as any).__tick();
  // Keep every legal 120 Hz input step while rendering several physics
  // steps per frame, as the real fixed-step loop does on slower displays.
  for(const [frames,bits] of witness.blocks){
   const move=(bits&3)-1;key('ArrowRight',move>0);key('ArrowLeft',move<0);key('ArrowUp',!!(bits&4));key('ShiftRight',!!(bits&8));
   for(let remaining=frames;remaining>0;){const count=Math.min(10,remaining);(window as any).__tick(count);remaining-=count;}
  }
  const result={phase:game.dataset.phase,deaths:Number(document.querySelector('.ll-deaths')!.textContent),activated:game.dataset.activated};
  (window as any).__releaseFrames();return result;
 },stage);
 expect(result).toEqual({phase:'cleared',deaths:0,activated:''});
 await expect(page.getByRole('heading',{name:'Level clear.',exact:true})).toBeVisible();await page.getByRole('button',{name:'Next level →',exact:true}).click();await expect(page.locator('.ll-game')).toHaveAttribute('data-stage',String(stage+2));
});
