import {test,expect} from '../../fixtures';
import {createRun,serialize} from '../../../src/games/last-light/model';

test('every exit type has distinct visible departure frames without letterbox bars',async({page})=>{
 await page.goto('/#/game/last-light');await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const [{Scene},{LEVELS},{createRun},{clearDuration}]=await Promise.all(['/src/games/last-light/render.ts','/src/games/last-light/levels.ts','/src/games/last-light/model.ts','/src/games/last-light/departure.ts'].map(p=>import(p)));
  const kinds=new Set<string>(),frames=[];
  for(const l of LEVELS){const kind=l.goal==='ferry'&&l.setting==='sky'?'airship':l.goal;if(kinds.has(kind))continue;kinds.add(kind);
   const canvas=document.createElement('canvas'),scene=new Scene(canvas);scene.resize(1280,720);const s=createRun();Object.assign(s,{stage:l.id,cleared:l.id+1,phase:l.id===39?'complete':'cleared',x:l.exit.x,y:l.exit.y+32,grounded:true,clock:2});
   const hashes=[];for(const age of [.05,.35,.8]){s.cinematic=clearDuration(l)-age;s.clock=2+age;scene.step(s,{},1/120);scene.draw(s,false);const pixels=canvas.getContext('2d')!.getImageData(0,0,canvas.width,canvas.height).data;hashes.push(pixels.reduce((hash:number,v:number)=>Math.imul(hash^v,16777619)>>>0,2166136261));}
   frames.push({kind,distinct:new Set(hashes).size});
  }return frames;
 });
 expect(result).toHaveLength(9);for(const frame of result)expect(frame.distinct,frame.kind).toBe(3);
});

test('cat strokes animate, pause deterministically and use a gentle reduced-motion pose',async({page})=>{
 await page.goto('/#/game/last-light');await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();
 const result=await page.evaluate(async()=>{
  const [{Courier},{cat},{createRun},{petPose}]=await Promise.all(['/src/games/last-light/courier.ts','/src/games/last-light/environment-art.ts','/src/games/last-light/model.ts','/src/games/last-light/affection.ts'].map(p=>import(p)));
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;const c=canvas.getContext('2d')!,courier=new Courier(),s=createRun();Object.assign(s,{x:30,y:40,grounded:true,clock:1,pet:{platform:0,x:66,y:64,started:1}});
  function draw(age:number,reduced=false){s.clock=1+age;courier.tick(s,{},1/120);c.clearRect(0,0,160,100);courier.draw(c,s,'#f3c77a',reduced);cat(c,66,64,reduced?0:s.clock,true,petPose(s,reduced)!.contact,reduced);return c.getImageData(0,0,160,100).data.reduce((hash:number,v:number)=>Math.imul(hash^v,16777619)>>>0,2166136261);}
  const animated=[.1,.3,.45,.65,.8,1.2].map(n=>draw(n));const frozen=[draw(.8),draw(.8)];const reduced=[draw(.4,true),draw(.65,true),draw(.8,true)];return {animated,frozen,reduced};
 });
 expect(new Set(result.animated).size).toBeGreaterThanOrEqual(5);expect(new Set(result.frozen).size).toBe(1);expect(new Set(result.reduced).size).toBe(1);
});

for(const touch of [false,true])test(`Down drops through a grate with ${touch?'a contextual touch control':'the arrow keys'}`,async({page})=>{
 if(touch)await page.emulateMedia({reducedMotion:'reduce'});
 const s=createRun();s.stage=26;s.cleared=26;s.checkpoint=true;s.checkpointIndex=3;
 await page.addInitScript(data=>localStorage.setItem('pocket-arcade:v1:save:last-light',JSON.stringify({version:1,data,updated:1})),serialize(s));
 await page.goto('/#/game/last-light');await page.getByRole('button',{name:'Continue →',exact:true}).click();await expect(page.locator('.ll-game')).toHaveAttribute('data-ground','15');
 const y=Number(await page.locator('.ll-game').getAttribute('data-y'));
 if(touch){await page.addStyleTag({content:'.ll-touch{display:flex!important}'});await page.getByRole('button',{name:'Drop through grate',exact:true}).click();}else await page.keyboard.press('ArrowDown');
 await expect.poll(async()=>Number(await page.locator('.ll-game').getAttribute('data-y'))).toBeGreaterThan(y+8);
 await expect(page.locator('.ll-game')).not.toHaveAttribute('data-ground','15');
});

test('new press and enemy art animates within the world and draws without errors',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/#/game/last-light');await expect(page.getByRole('button',{name:'Play →',exact:true})).toBeVisible();
 const frames=await page.evaluate(async()=>{
  const [{drawEnemy,drawPress},{LEVELS},{createRun}]=await Promise.all(['/src/games/last-light/enemy-art.ts','/src/games/last-light/levels.ts','/src/games/last-light/model.ts'].map(p=>import(p)));
  const canvas=document.createElement('canvas');canvas.width=160;canvas.height=180;const c=canvas.getContext('2d')!,s=createRun(),enemy=LEVELS.find((l:any)=>l.enemies.length)!.enemies[0],press=LEVELS[18].hazards.find((h:any)=>h.kind==='crusher');
  const hash=()=>c.getImageData(0,0,160,180).data.reduce((h:number,v:number)=>Math.imul(h^v,16777619)>>>0,2166136261),out=[];
  for(const time of [0,.5,1.5,2]){s.clock=time;c.clearRect(0,0,160,180);c.save();c.translate(80-enemy.x,160-enemy.y);drawEnemy(c,enemy,s,false);c.restore();out.push(hash());}
  for(const phase of [.1,.45,.57,.65,.85]){s.clock=phase*press.period-press.offset;c.clearRect(0,0,160,180);c.save();c.translate(60-press.x,25-press.y);drawPress(c,press,s,false);c.restore();out.push(hash());}return out;
 });
 expect(new Set(frames).size).toBeGreaterThanOrEqual(8);expect(errors).toEqual([]);
});

test('Enter and the contextual pet button stroke a real cat without pausing play',async({page})=>{
 test.setTimeout(90000);const run=createRun();run.stage=2;run.cleared=2;
 await page.addInitScript(data=>localStorage.setItem('pocket-arcade:v1:save:last-light',JSON.stringify({version:1,data,updated:1})),serialize(run));
 await page.goto('/#/game/last-light');await expect(page.getByRole('button',{name:'Continue →',exact:true})).toBeVisible();
 await page.evaluate(()=>{
  const native=window.requestAnimationFrame.bind(window),nativeCancel=window.cancelAnimationFrame.bind(window);let stamp=1000000,id=1;const pending=new Map<number,FrameRequestCallback>();
  window.requestAnimationFrame=cb=>{const n=id++;pending.set(n,cb);return n;};window.cancelAnimationFrame=n=>{pending.delete(n);};
  (window as any).__tick=(count=1)=>{stamp+=count*8.334;const batch=[...pending.values()];pending.clear();for(const cb of batch)cb(stamp);};
  (window as any).__release=()=>{window.requestAnimationFrame=native;window.cancelAnimationFrame=nativeCancel;for(const cb of pending.values())native(cb);pending.clear();};
 });
 await page.getByRole('button',{name:'Continue →',exact:true}).click();
 const result=await page.evaluate(async()=>{
  const witnessPath='/tests/games/last-light/journeys.json',witness=(await import(witnessPath)).default.find((j:any)=>j.stage===2),held=new Set<string>(),game=document.querySelector<HTMLElement>('.ll-game')!,canvas=game.querySelector('canvas')!;
  const key=(code:string,on:boolean)=>{if(on===held.has(code))return;on?held.add(code):held.delete(code);canvas.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,key:code,bubbles:true}));};
  (window as any).__tick();
  const modelPath='/src/games/last-light/model.ts',{createRun,respawn,step}=await import(modelPath),simulation=createRun();simulation.stage=2;simulation.cleared=2;respawn(simulation,false);
  const prefix:number[][]=[];
  // Find the cut using pure physics, then replay DOM input in bounded render
  // batches. Thousands of canvas draws in one JS task flood Chromium's GPU queue.
  journey:for(const [count,bits] of witness.blocks){let used=0;for(;used<count;){step(simulation,{move:(bits&3)-1,jump:!!(bits&4),dash:!!(bits&8)});used++;if(simulation.ground===9){prefix.push([used,bits]);break journey;}}prefix.push([used,bits]);}
  for(const [count,bits] of prefix){const move=(bits&3)-1;key('ArrowRight',move>0);key('ArrowLeft',move<0);key('ArrowUp',!!(bits&4));key('ShiftRight',!!(bits&8));for(let left=count;left>0;){const n=Math.min(10,left);(window as any).__tick(n);left-=n;}}
  for(const code of [...held])key(code,false);
  // Brake and walk into reach using actual arrow input, never an assigned position.
  let previous=Number(game.dataset.x);for(let i=0;i<360;i++){
   const x=Number(game.dataset.x),velocity=(x-previous)*30,d=2771-x;previous=x;
   const move=Math.abs(d)<3&&Math.abs(velocity)<25?0:Math.sign(d-velocity*.055);key('ArrowRight',move>0);key('ArrowLeft',move<0);(window as any).__tick(4);
   if(game.querySelector('.ll-prompt')!.textContent?.includes('Pet cat'))break;
  }
  for(const code of [...held])key(code,false);for(let i=0;i<2;i++)(window as any).__tick(10);
  const prompt=game.querySelector('.ll-prompt')!.textContent;key('Enter',true);(window as any).__tick();key('Enter',false);for(let i=0;i<4;i++)(window as any).__tick(10);
  const petting=game.dataset.petting,overlay=game.dataset.overlay;key('ArrowUp',true);(window as any).__tick();key('ArrowUp',false);
  const cancelled=game.dataset.petting;for(let i=0;i<12;i++)(window as any).__tick(10);
  (game.querySelector('.ll-prompt') as HTMLButtonElement).click();(window as any).__tick();const clicked=game.dataset.petting;
  const deaths=document.querySelector('.ll-deaths')!.textContent;(window as any).__release();return {prompt,petting,overlay,cancelled,clicked,deaths};
 });
 expect(result.prompt).toContain('Pet cat');expect(result.petting).toBe('true');expect(result.overlay).toBe('none');expect(result.cancelled).toBe('false');expect(result.clicked).toBe('true');expect(result.deaths).toBe('0');
});
