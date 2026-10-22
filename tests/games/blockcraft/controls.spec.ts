import {test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';
import {countLockErrors,lockless,look,useLockFallback} from './helpers/browser';

// Player controls in a real browser: keyboard (movement, Ctrl sprint, jump, double-tap flight, hotbar, F1/F3, text
// fields), mouse (pointer lock look and buttons, drag-to-look fallback), touch (stick, look drag, buttons, layout)
// and a mocked gamepad. Software WebGL runs at a few frames per second, so state is polled with generous timeouts.
type Engine={player:{state:Record<string,number|boolean>};input:{down(a:string):boolean;touch:boolean};setMode(m:string):void};
const data=(page:Page,key:string)=>page.locator('.blockcraft').getAttribute(`data-${key}`);
const num=async(page:Page,key:string)=>Number(await data(page,key));
const state=(page:Page,key:string)=>page.evaluate(k=>(window as unknown as {blockcraft:Engine}).blockcraft.player.state[k],key);
const down=(page:Page,action:string)=>page.evaluate(a=>(window as unknown as {blockcraft:Engine}).blockcraft.input.down(a),action);
async function boot(page:Page,mode:'survival'|'creative'='survival'){
  await page.goto('/#/game/blockcraft');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:45000});
  await expect.poll(()=>num(page,'meshes'),{timeout:45000}).toBeGreaterThan(20);
  if(mode==='creative')await page.evaluate(()=>(window as unknown as {blockcraft:Engine}).blockcraft.setMode('creative'));
}
const moved=async(page:Page,x:number,z:number)=>Math.hypot(await num(page,'x')-x,await num(page,'z')-z);
/** Watches the player for `ms` (every animation frame) and reports the highest rise and upward speed: a jump shows
 *  one or the other even under a low ceiling. */
const watchJump=(page:Page,ms=2500)=>page.evaluate(async ms=>{
  const p=(window as unknown as {blockcraft:Engine}).blockcraft.player.state,y0=p.y as number,end=performance.now()+ms;let rise=0,vy=0;
  while(performance.now()<end){rise=Math.max(rise,(p.y as number)-y0);vy=Math.max(vy,p.vy as number);await new Promise(r=>requestAnimationFrame(r));}
  return rise>.3||vy>2;
},ms);

test('keyboard and mouse: walk, sprint, jump, fly, hotbar, F1/F3 and text fields',async({page,browserName})=>{
  test.setTimeout(150000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1280,height:720});
  const locks=!lockless(browserName);await countLockErrors(page);
  await boot(page,'creative');
  const root=page.locator('.blockcraft');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(root).toHaveAttribute('data-phase','playing');
  // Headless WebKit never grants pointer lock: the mouse steps run on the drag-to-look and hold fallback there.
  if(locks)await expect(root).toHaveAttribute('data-locked','true');else await useLockFallback(page,640,360);
  await expect(root).toHaveAttribute('data-hud-hidden','');await expect(root).toHaveAttribute('data-debug','');

  // Mouse look turns the player; buttons map to attack, use and pick while held.
  const yaw=await num(page,'yaw');
  await look(page,locks,{x:640,y:360},160,0,4);
  await expect.poll(async()=>Math.abs(await num(page,'yaw')-yaw)).toBeGreaterThan(.1);
  expect(await num(page,'yaw')).toBeLessThan(yaw);// moving right turns right (yaw decreases)
  for(const [button,action] of [['left','attack'],['right','use'],['middle','pick']] as const){
    await page.mouse.down({button});await expect.poll(()=>down(page,action)).toBe(true);
    await page.mouse.up({button});await expect.poll(()=>down(page,action)).toBe(false);
  }

  // Space jumps; a quick double tap starts creative flight, then holding Space rises above the trees.
  await page.keyboard.down('Space');expect(await watchJump(page)).toBe(true);await page.keyboard.up('Space');
  for(let attempt=0;attempt<4&&!await state(page,'flying');attempt++){
    // The second tap comes after the take-off (flight on the ground ends at once, as in vanilla), however slow the frames
    // are: two taps read in the same frame would both land before the jump.
    await page.keyboard.press('Space');
    await page.waitForFunction(()=>!(window as unknown as {blockcraft:Engine}).blockcraft.player.state.onGround,undefined,{timeout:3000}).catch(()=>{});
    await page.keyboard.press('Space');await page.waitForTimeout(800);
  }
  expect(await state(page,'flying')).toBe(true);
  const flyY=await state(page,'y') as number;
  await page.keyboard.down('Space');await expect.poll(()=>state(page,'y'),{timeout:40000}).toBeGreaterThan(flyY+10);await page.keyboard.up('Space');
  // W moves forward; holding Ctrl as well sprints (here sprint-flying in open air).
  let x=await num(page,'x'),z=await num(page,'z');
  await page.keyboard.down('KeyW');
  await expect.poll(()=>moved(page,x,z),{timeout:15000}).toBeGreaterThan(.5);
  await page.keyboard.down('ControlLeft');
  await expect.poll(()=>state(page,'sprinting'),{timeout:10000}).toBe(true);
  await page.keyboard.up('ControlLeft');await page.keyboard.up('KeyW');
  await expect.poll(()=>down(page,'forward')).toBe(false);
  // Sneak descends until touching the ground ends the flight.
  await page.keyboard.down('ShiftLeft');
  await expect.poll(()=>state(page,'flying'),{timeout:60000}).toBe(false);
  await page.keyboard.up('ShiftLeft');

  // Hotbar keys and the wheel; F3 and F1 toggle the root flags read by the HUD.
  await page.keyboard.press('Digit5');await expect(root).toHaveAttribute('data-slot','4');
  await page.mouse.wheel(0,120);await expect(root).toHaveAttribute('data-slot','5');
  await page.mouse.wheel(0,-120);await page.waitForTimeout(300);await page.mouse.wheel(0,-120);await expect(root).toHaveAttribute('data-slot','3');
  await page.keyboard.press('F3');await expect(root).toHaveAttribute('data-debug','true');
  await page.keyboard.press('F3');await expect(root).toHaveAttribute('data-debug','');
  await page.keyboard.press('F1');await expect(root).toHaveAttribute('data-hud-hidden','true');
  await page.keyboard.press('F1');await expect(root).toHaveAttribute('data-hud-hidden','');

  // Typing into a text field outside the game never moves the player or changes the hotbar.
  await page.evaluate(()=>{const i=document.createElement('input');i.id='bc-test-field';document.body.append(i);i.focus();});
  x=await num(page,'x');z=await num(page,'z');
  await page.keyboard.type('wasd 12');await page.keyboard.down('KeyW');await page.waitForTimeout(700);await page.keyboard.up('KeyW');
  await expect(page.locator('#bc-test-field')).toHaveValue(/^wasd 12w*$/);
  expect(await moved(page,x,z)).toBeLessThan(.05);await expect(root).toHaveAttribute('data-slot','3');
  await page.evaluate(()=>document.getElementById('bc-test-field')!.remove());
  expect(errors).toEqual([]);
});

test('mouse drag-to-look when pointer lock is unavailable',async({page})=>{
  test.setTimeout(120000);
  await page.addInitScript(()=>{Object.defineProperty(Element.prototype,'requestPointerLock',{value:undefined,configurable:true});});
  await boot(page);
  const root=page.locator('.blockcraft');
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(root).toHaveAttribute('data-phase','playing');expect(await data(page,'locked')).not.toBe('true');
  const yaw=await num(page,'yaw');
  await page.mouse.move(400,360);await page.mouse.down();
  for(let i=1;i<=6;i++)await page.mouse.move(400+i*30,360);
  await page.mouse.up();
  await expect.poll(async()=>Math.abs(await num(page,'yaw')-yaw)).toBeGreaterThan(.2);
  // A still press turns into holding attack (mining) until released.
  await page.mouse.move(640,500);await page.mouse.down();
  await expect.poll(()=>down(page,'attack'),{timeout:10000}).toBe(true);
  await page.mouse.up();await expect.poll(()=>down(page,'attack')).toBe(false);
});

test.describe('touch',()=>{
  test.use({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
  test('stick, look drag, jump, sneak toggle, hold ring, inventory and layout',async({page,browserName})=>{
    test.skip(browserName!=='chromium','Native CDP touch is specific to Chromium.');
    test.setTimeout(150000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await boot(page);
    const root=page.locator('.blockcraft');
    await page.getByRole('button',{name:'Play',exact:true}).tap();
    await expect(root).toHaveAttribute('data-phase','playing');
    const cdp=await page.context().newCDPSession(page);
    const touch=(type:'touchStart'|'touchMove'|'touchEnd',points:{x:number;y:number;id:number}[])=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points});
    // A first touch on the world switches to touch controls when the device did not report a coarse pointer.
    if(!await page.evaluate(()=>(window as unknown as {blockcraft:Engine}).blockcraft.input.touch)){
      await touch('touchStart',[{x:195,y:300,id:9}]);await touch('touchEnd',[]);
    }
    const layer=page.locator('.bc-touch');await expect(layer).toBeVisible();
    const jump=page.getByRole('button',{name:/^Jump/}),sneak=page.getByRole('button',{name:'Sneak'});
    const drop=page.getByRole('button',{name:/^Drop item/}),inventory=page.getByRole('button',{name:'Inventory'});
    for(const b of [jump,sneak,drop,inventory])await expect(b).toBeVisible();

    // Layout at 390, 320 and landscape: every control inside the viewport and clear of the others.
    for(const size of [{width:390,height:844},{width:320,height:568},{width:844,height:390}]){
      await page.setViewportSize(size);await page.waitForTimeout(200);
      if(size.width>size.height)await page.screenshot({path:'test-results/blockcraft-touch-landscape.png'});
      const boxes=await page.locator('.bc-stick, .bc-touch-btn').evaluateAll(els=>els.map(e=>{const r=e.getBoundingClientRect();return{l:r.left,t:r.top,r:r.right,b:r.bottom};}));
      expect(boxes.length).toBe(5);
      for(const b of boxes){expect(b.l).toBeGreaterThanOrEqual(0);expect(b.t).toBeGreaterThanOrEqual(0);expect(b.r).toBeLessThanOrEqual(size.width);expect(b.b).toBeLessThanOrEqual(size.height);expect(b.r-b.l).toBeGreaterThanOrEqual(40);}
      for(let i=0;i<boxes.length;i++)for(let j=i+1;j<boxes.length;j++){
        const a=boxes[i],c=boxes[j];expect(a.r<=c.l||c.r<=a.l||a.b<=c.t||c.b<=a.t).toBe(true);
      }
    }
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(200);
    await page.screenshot({path:'test-results/blockcraft-touch-portrait.png'});

    // Pushing the stick fully forward walks and sprints, while a second finger drags the view.
    const stick=(await page.locator('.bc-stick').boundingBox())!;
    const cx=stick.x+stick.width/2,cy=stick.y+stick.height/2;
    const x=await num(page,'x'),z=await num(page,'z'),yaw=await num(page,'yaw');
    await touch('touchStart',[{x:cx,y:cy,id:1}]);
    await touch('touchMove',[{x:cx,y:cy-stick.height,id:1}]);
    await expect.poll(()=>state(page,'sprinting'),{timeout:15000}).toBe(true);
    await touch('touchStart',[{x:cx,y:cy-stick.height,id:1},{x:200,y:250,id:2}]);
    for(let i=1;i<=5;i++)await touch('touchMove',[{x:cx,y:cy-stick.height,id:1},{x:200+i*25,y:250,id:2}]);
    await expect.poll(()=>moved(page,x,z),{timeout:15000}).toBeGreaterThan(.8);
    await touch('touchEnd',[]);
    await expect.poll(async()=>Math.abs(await num(page,'yaw')-yaw)).toBeGreaterThan(.2);
    await expect.poll(()=>down(page,'sprint')).toBe(false);

    // Jump while the finger is down.
    const jb=(await jump.boundingBox())!;
    await touch('touchStart',[{x:jb.x+jb.width/2,y:jb.y+jb.height/2,id:3}]);expect(await watchJump(page)).toBe(true);
    await touch('touchEnd',[]);

    // Sneak is a toggle.
    await sneak.tap();await expect(sneak).toHaveAttribute('aria-pressed','true');
    await expect.poll(()=>state(page,'sneaking')).toBe(true);
    await sneak.tap();await expect(sneak).toHaveAttribute('aria-pressed','false');
    await expect.poll(()=>state(page,'sneaking')).toBe(false);

    // A still finger on the world shows the hold ring filling up, then holds attack (mining) until lifted. The ring is
    // only up for the 300 ms hold delay (a frame or two of software WebGL), so an observer records it.
    await page.evaluate(()=>{
      const ring=document.querySelector<HTMLElement>('.bc-hold-ring')!,w=window as unknown as {ringProgress:number};w.ringProgress=-1;
      new MutationObserver(()=>{if(!ring.hidden)w.ringProgress=Math.max(w.ringProgress,Number(ring.style.getPropertyValue('--p'))||0);})
        .observe(ring,{attributes:true,attributeFilter:['hidden','style']});
    });
    await touch('touchStart',[{x:195,y:420,id:4}]);
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {ringProgress:number}).ringProgress),{timeout:10000}).toBeGreaterThan(0);
    await expect.poll(()=>down(page,'attack'),{timeout:10000}).toBe(true);
    await touch('touchEnd',[]);await expect.poll(()=>down(page,'attack')).toBe(false);
    await expect(page.locator('.bc-hold-ring')).toBeHidden();

    // The inventory button opens the inventory screen and hides the touch controls.
    await inventory.tap();await expect(root).toHaveAttribute('data-phase','screen');await expect(layer).toBeHidden();
    await page.screenshot({path:'test-results/blockcraft-touch-inventory.png'});
    expect(errors).toEqual([]);
  });
});

test('gamepad: A starts from the menu, left stick moves, right stick looks, A jumps, RB selects the next slot',async({page})=>{
  test.setTimeout(120000);
  await page.addInitScript(()=>{
    const pad={id:'Test pad',index:0,connected:true,mapping:'standard',timestamp:0,axes:[0,0,0,0],
      buttons:Array.from({length:17},()=>({pressed:false,touched:false,value:0}))};
    (window as unknown as {testPad:typeof pad}).testPad=pad;
    Object.defineProperty(navigator,'getGamepads',{value:()=>[pad,null,null,null],configurable:true});
  });
  await boot(page);
  const root=page.locator('.blockcraft');
  // No gamepadconnected event: the pad was exposed to the page before Blockcraft mounted (as when coming back to the
  // game), so input must find it through navigator.getGamepads() on its own.
  const set=(axes:number[],buttons:Record<number,number>={})=>page.evaluate(([a,b])=>{
    const pad=(window as unknown as {testPad:{axes:number[];buttons:{pressed:boolean;value:number}[]}}).testPad;
    pad.axes=a as number[];pad.buttons.forEach((btn,i)=>{const v=(b as Record<number,number>)[i]??0;btn.value=v;btn.pressed=v>.5;});
  },[axes,buttons] as const);
  await expect(root).toHaveAttribute('data-phase','ready');
  await set([0,0,0,0],{0:1});await expect(root).toHaveAttribute('data-phase','playing');await set([0,0,0,0]);
  const x=await num(page,'x'),z=await num(page,'z'),yaw=await num(page,'yaw');
  await set([0,-1,1,0]);
  await expect.poll(()=>moved(page,x,z),{timeout:15000}).toBeGreaterThan(.5);
  await expect.poll(async()=>await num(page,'yaw')-yaw,{timeout:15000}).toBeLessThan(-.2);
  await set([0,0,0,0]);
  await set([0,0,0,0],{0:1});expect(await watchJump(page)).toBe(true);
  await set([0,0,0,0]);
  const slot=await num(page,'slot');
  await set([0,0,0,0],{5:1});await expect(root).toHaveAttribute('data-slot',String((slot+1)%9));
  await set([0,0,0,0]);
});
