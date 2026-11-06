import {test,expect} from '../../fixtures';
import type {GameModule} from '../../../src/core/types';
import type {Arena} from '../../../src/games/neon-coil/model';

test('Slither.io schedules its game loop only while playing',async({page})=>{
  await page.addInitScript(()=>{
    const native=window.requestAnimationFrame.bind(window);
    const counts={requests:0,callbacks:0};
    (window as unknown as {neonFrames:typeof counts}).neonFrames=counts;
    window.requestAnimationFrame=callback=>{
      if(callback.name!=='loop'||!new Error().stack?.includes('/src/games/neon-coil/index.ts'))return native(callback);
      counts.requests++;
      return native(time=>{counts.callbacks++;callback(time);});
    };
  });
  await page.goto('/#/game/neon-coil');
  const game=page.locator('.nc-game');
  await expect(page.getByRole('button',{name:'Play',exact:true})).toBeVisible();
  const counts=()=>page.evaluate(()=>(window as unknown as {neonFrames:{requests:number;callbacks:number}}).neonFrames);
  const ready=await counts();
  await page.waitForTimeout(250);
  expect(await counts()).toEqual(ready);

  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(game).toHaveAttribute('data-phase','running');
  await expect.poll(async()=>(await counts()).callbacks).toBeGreaterThan(ready.callbacks);
  await page.keyboard.press('p');
  await expect(page.locator('#pause-overlay')).toBeVisible();
  const paused=await counts();
  await page.waitForTimeout(250);
  expect(await counts()).toEqual(paused);

  await page.keyboard.press('p');
  await expect(page.locator('#pause-overlay')).toBeHidden();
  await expect.poll(async()=>(await counts()).callbacks).toBeGreaterThan(paused.callbacks);
  await page.goto('/#/collection');
  await expect(game).toHaveCount(0);
  const disposed=await counts();
  await page.waitForTimeout(250);
  expect(await counts()).toEqual(disposed);
});

test('Slither.io wakes once and excludes paused time from simulation',async({page})=>{
  await page.route('**/__qcc-test-blank__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('/__qcc-test-blank__');
  const checks=await page.evaluate(async()=>{
    const path='/src/games/neon-coil/index.ts',glassPath='/src/ui/glass-frame-source.ts';
    const game:{default:GameModule}=await import(path);
    const glass:typeof import('../../../src/ui/glass-frame-source')=await import(glassPath);
    const host=document.createElement('div');host.style.cssText='width:640px;height:480px';document.body.append(host);
    const request=window.requestAnimationFrame.bind(window),cancel=window.cancelAnimationFrame.bind(window);
    const pending=new Map<number,FrameRequestCallback>();let id=0,now=1000,max=0;
    const checks:string[]=[];
    const check=(name:string,ok:boolean)=>{if(!ok)throw new Error(name);checks.push(name);};
    window.requestAnimationFrame=callback=>{
      if(callback.name!=='loop'||!new Error().stack?.includes('/src/games/neon-coil/index.ts'))return request(callback);
      const key=id===0?0:-(id++);if(id===0)id=1;
      pending.set(key,callback);max=Math.max(max,pending.size);return key;
    };
    window.cancelAnimationFrame=key=>{if(pending.has(key))pending.delete(key);else cancel(key);};
    let instance:Awaited<ReturnType<GameModule['mount']>>|undefined;
    try{
      instance=await game.default.mount(host,{id:'neon-coil',settings:{sound:false,reducedMotion:true,colorBlind:false,autoNextEpisode:false},highScore:0,setScore(){},setLevel(){},setStatus(){},announce(){},save(){},sound(){}});
      const start=host.querySelector<HTMLButtonElement>('.nc-start')!;
      const canvas=host.querySelector<HTMLCanvasElement>('.nc-canvas')!;
      const state=()=>instance!.serialize() as Arena;
      const fire=(delta:number)=>{check('one frame pending',pending.size===1);const item=pending.entries().next().value;if(!item)throw new Error('missing frame');pending.delete(item[0]);now+=delta;item[1](now);};
      check('ready is idle',pending.size===0);
      start.click();check('start schedules frame zero',pending.size===1&&pending.has(0));
      instance.pause();instance.pause();check('pause cancels frame zero',pending.size===0);
      instance.resume();instance.resume();check('repeated resume schedules once',pending.size===1);
      const before=state().ticks;fire(16);check('first frame anchors time',state().ticks===before);
      fire(100);check('active time advances simulation',state().ticks>before);
      instance.pause();const ticksAtPause=state().ticks,frozen=JSON.stringify(state());now+=10000;
      check('paused state remains unchanged',pending.size===0&&JSON.stringify(state())===frozen);
      let repaints=0;const off=glass.onGlassFrame(canvas,()=>{repaints++;});
      glass.requestGlassFrame(canvas);
      check('idle glass request repaints without stepping',repaints>0&&pending.size===0&&JSON.stringify(state())===frozen);
      repaints=0;window.dispatchEvent(new Event('resize'));
      check('idle resize repaints without stepping',repaints>0&&pending.size===0&&JSON.stringify(state())===frozen);off();
      instance.resume();fire(16);check('resume excludes paused time',JSON.stringify(state())===frozen);
      fire(100);check('simulation advances after resume',state().ticks>ticksAtPause);
      const saved=state();instance.restart();check('restart is idle',pending.size===0&&state().phase==='ready');
      instance.restore(saved);check('restored run waits',pending.size===0&&state().phase==='ready');
      start.click();check('continue schedules once',pending.size===1);
      const modelPath='/src/games/neon-coil/model.ts';
      const model:typeof import('../../../src/games/neon-coil/model')=await import(modelPath);
      const edge=state(),player=edge.snakes[0],dx=model.ARENA_RADIUS-8-player.x,dy=-player.y;
      player.x+=dx;player.y+=dy;player.previous.x+=dx;player.previous.y+=dy;
      for(const p of player.body){p.x+=dx;p.y+=dy;}
      player.angle=player.previousAngle=player.target=0;
      check('rim fixture passes save validation',model.restoreArena(edge)!==null);
      instance.restore(edge);check('rim fixture awaits continue',state().phase==='ready'&&pending.size===0&&Math.abs(state().snakes[0].x-(model.ARENA_RADIUS-8))<0.01);
      start.click();fire(16);fire(100);
      check('simulated death stops frames',state().phase==='dead'&&pending.size===0&&host.querySelector('.nc-game')?.getAttribute('data-phase')==='dead');
      start.click();check('replay after death schedules once',state().phase==='running'&&pending.size===1);
      instance.dispose();instance=undefined;check('dispose cancels frame',pending.size===0&&max<=1);
      return checks;
    }finally{instance?.dispose();window.requestAnimationFrame=request;window.cancelAnimationFrame=cancel;host.remove();}
  });
  expect(checks).toContain('dispose cancels frame');
});
