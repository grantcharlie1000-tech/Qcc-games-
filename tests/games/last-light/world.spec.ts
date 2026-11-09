import {test,expect} from '../../fixtures';
import {createRun,serialize} from '../../../src/games/last-light/model';
const URL='/#/game/last-light';
test('conversation, journal and route map work with keyboard and freeze play',async({page})=>{
 await page.goto(URL);await page.getByRole('button',{name:'Carry the light →',exact:true}).click();
 await page.keyboard.down('ArrowRight');await expect.poll(async()=>Number(await page.locator('.ll-game').getAttribute('data-x'))).toBeGreaterThan(118);await page.keyboard.up('ArrowRight');await page.keyboard.press('e');
 await expect(page.locator('.ll-dialogue')).toBeVisible();await expect(page.locator('.ll-dialogue')).toContainText('Your sister Mira');
 await page.keyboard.press('j');await expect(page.getByRole('heading',{name:'The things we carry.'})).toBeVisible();await expect(page.locator('.ll-journal')).toContainText('Nell');
 const elapsed=await page.locator('.ll-game').getAttribute('data-elapsed');await page.keyboard.press('ArrowRight');expect(await page.locator('.ll-game').getAttribute('data-elapsed')).toBe(elapsed);
 await page.keyboard.press('j');await expect(page.locator('.ll-game')).toHaveAttribute('data-overlay','none');
 await page.keyboard.press('m');await expect(page.getByRole('img',{name:/Map showing alternate routes/})).toBeVisible();await expect(page.locator('.ll-map rect')).toHaveCount(9);
 await page.getByRole('button',{name:'Back to the journey →',exact:true}).click();await expect(page.locator('.ll-game')).toHaveAttribute('data-overlay','none');
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
 await page.goto(URL);await page.getByRole('button',{name:stage?'Continue the journey →':'Carry the light →',exact:true}).click();await expect(page.locator('.ll-quest')).toBeVisible();
 await page.locator('.ll-canvas').screenshot({path:`work/last-light/chapter-${stage+1}.png`});
 await page.keyboard.press('m');await expect(page.locator('.ll-map')).toBeVisible();expect(errors).toEqual([]);
});
test.describe('phone journey tools',()=>{
 test.use({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 test('five controls fit and interaction/map buttons stay usable',async({page})=>{
  await page.goto(URL);await page.getByRole('button',{name:'Carry the light →',exact:true}).click();await expect(page.getByRole('button',{name:'Interact',exact:true})).toBeVisible();
  const right=page.getByRole('button',{name:'Move right',exact:true}),box=(await right.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await expect.poll(async()=>Number(await page.locator('.ll-game').getAttribute('data-x'))).toBeGreaterThan(118);await page.mouse.up();
  await page.getByRole('button',{name:'Interact',exact:true}).tap();await expect(page.locator('.ll-dialogue')).toBeVisible();
  await page.screenshot({path:'work/last-light/phone-dialogue.png'});await page.getByRole('button',{name:'Map',exact:true}).click();await expect(page.locator('.ll-map')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(390);
 });
});
test('the introductory route can be cleared using ordinary keyboard actions',async({page})=>{
 await page.goto(URL);await page.getByRole('button',{name:'Carry the light →',exact:true}).click();
 const result=await page.evaluate(async()=>{
  const path='/src/games/last-light/levels.ts',{LEVELS}=await import(path),l=LEVELS[0],route=[0,1,2,3,4];
  const game=document.querySelector<HTMLElement>('.ll-game')!,canvas=game.querySelector('canvas')!,held=new Set<string>();
  function key(code:string,on:boolean){if(on===held.has(code))return;if(on)held.add(code);else held.delete(code);canvas.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code,bubbles:true}));}
  const start=performance.now();let target=1,jumping=false,dashed=false,launchY=0,wasAir=false;
  return await new Promise<{phase:string;x:number;y:number;target:number;ground:number}>(resolve=>{
   function tick(now:number){
    const x=Number(game.dataset.x),y=Number(game.dataset.y),ground=Number(game.dataset.ground);
    if(game.dataset.phase!=='playing'||now-start>20000){for(const k of [...held])key(k,false);resolve({phase:game.dataset.phase!,x,y,target,ground});return;}
    if(x<100&&target>1){target=1;jumping=false;dashed=false;key('Space',false);key('KeyX',false);}
    const landed=ground>=0&&wasAir;if(landed){jumping=false;dashed=false;key('Space',false);key('KeyX',false);}wasAir=ground<0;
    if(ground>=0&&ground<l.mainCount)target=Math.min(route.length-1,ground+1);
    const next=l.platforms[route[target]],dx=next.x+next.w*.6-x,dir=Math.sign(dx),source=l.platforms.find((p:any)=>p.id===ground);
    key('ArrowRight',dir>0);key('ArrowLeft',dir<0);
    if(source&&!landed&&!jumping&&ground!==route[target]){const gap=dir>0?next.x-(x+16):x-next.x-next.w,edge=dir>0?source.x+source.w-x:x-source.x;if((edge<40||Math.abs(dx)<180)&&gap<130){jumping=true;launchY=y;}}
    if(jumping&&ground<0&&launchY-y>42&&Math.abs(dx)>120)dashed=true;
    key('Space',jumping);key('KeyX',dashed&&ground<0);requestAnimationFrame(tick);
   }requestAnimationFrame(tick);
  });
 });
 expect(result.phase,JSON.stringify(result)).toBe('cleared');await expect(page.getByRole('heading',{name:'A door opens',exact:true})).toBeVisible();await page.getByRole('button',{name:'Next chapter →',exact:true}).click();await expect(page.locator('.ll-game')).toHaveAttribute('data-stage','2');await expect(page.locator('.ll-objective')).toHaveText('Find them · lead them home');
});
