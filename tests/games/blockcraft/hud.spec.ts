import {test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';

// HUD and menus in the browser: layout at 1366×768 and 390×844 (clear of the arcade toolbar and the shell's corner
// buttons), bars and hotbar drawn from state, F1/F3 flags, the action bar, world options, controls, advancements
// and the death screen. Software WebGL is slow, so timeouts are generous. Screenshots go to HUD_EVIDENCE_DIR.
type Box={x:number;y:number;width:number;height:number};
const evidence=(name:string)=>`${process.env.HUD_EVIDENCE_DIR??'test-results/hud-evidence'}/${name}.png`;
const overlaps=(a:Box,b:Box)=>a.x<b.x+b.width-.5&&b.x<a.x+a.width-.5&&a.y<b.y+b.height-.5&&b.y<a.y+a.height-.5;
async function ready(page:Page){await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:60000});}
async function play(page:Page){
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing',{timeout:15000});
}
/** Bounding boxes of every visible element matching a selector. */
async function boxes(page:Page,selector:string):Promise<Box[]>{
  return page.locator(selector).evaluateAll(els=>els.filter(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;})
    .map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};}));
}
const HUD_PARTS='.bc-hotbar-bg,.bc-offhand,.bc-xp,.bc-level,.bc-hearts .bc-icon,.bc-food .bc-icon,.bc-armor .bc-icon,.bc-air .bc-icon,.bc-readouts[data-place=right] .bc-dial,.bc-held-name';
const SHELL='.game-toolbar a,.game-toolbar button';
/** Sets survival values through the live service (test-only overrides of its getters). */
async function setSurvival(page:Page,values:Record<string,number>,armor?:number){
  await page.evaluate(([v,a])=>{
    const s=(window as unknown as {blockcraft:{survival:Record<string,unknown>}}).blockcraft.survival;
    for(const [k,n] of Object.entries(v))Object.defineProperty(s,k,{configurable:true,get:()=>n});
    if(typeof a==='number')s.armorPoints=()=>a;
  },[values,armor] as const);
}
async function give(page:Page){
  await page.evaluate(()=>{
    const inv=(window as unknown as {blockcraft:{inventory:{setSlot(i:number,s:unknown):void;setOffhand(s:unknown):void;select(i:number):void}}}).blockcraft.inventory;
    inv.setSlot(0,{id:'diamond_pickaxe',count:1,damage:780});inv.setSlot(1,{id:'dirt',count:64});inv.setSlot(2,{id:'compass',count:1});
    inv.setOffhand({id:'clock',count:1});inv.select(0);
  });
}
async function checkClear(page:Page,width:number,height:number){
  const hud=await boxes(page,HUD_PARTS),shell=await boxes(page,SHELL);
  expect(hud.length).toBeGreaterThan(20);
  for(const b of hud){
    expect(b.x,'inside the left edge').toBeGreaterThanOrEqual(0);expect(b.x+b.width,'inside the right edge').toBeLessThanOrEqual(width+.5);
    expect(b.y,'below the arcade toolbar').toBeGreaterThanOrEqual(56);expect(b.y+b.height).toBeLessThanOrEqual(height+1.5);
    for(const s of shell)expect(overlaps(b,s),`HUD ${JSON.stringify(b)} overlaps shell button ${JSON.stringify(s)}`).toBe(false);
  }
}

test.describe('desktop 1366x768',()=>{
  test.use({viewport:{width:1366,height:768}});
  test('HUD layout, state rendering, readouts, F1, F3 and the action bar',async({page})=>{
    test.setTimeout(150000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/#/game/blockcraft');await ready(page);await play(page);
    await setSurvival(page,{health:7,absorption:4,food:7,saturation:0,xpLevel:12,xpProgress:.5},7);await give(page);
    const hearts=page.locator('.bc-hearts .bc-icon:not([hidden])');
    await expect(hearts).toHaveCount(12,{timeout:15000});
    const icons=await hearts.evaluateAll(els=>els.map(e=>(e as HTMLElement).dataset.icon));
    expect(icons.slice(0,4)).toEqual(['heart_full heart_container','heart_full heart_container','heart_full heart_container','heart_half heart_container']);
    expect(icons[4]).toBe('heart_container');expect(icons[10]).toBe('heart_absorb_full heart_container');
    const food=await page.locator('.bc-food .bc-icon').evaluateAll(els=>els.map(e=>(e as HTMLElement).dataset.icon));
    expect(food.slice(2,5)).toEqual(['food_full food_container','food_half food_container','food_container']);
    const armor=await page.locator('.bc-armor .bc-icon:not([hidden])').evaluateAll(els=>els.map(e=>(e as HTMLElement).dataset.icon));
    expect(armor).toHaveLength(10);expect(armor[3]).toBe('armor_half armor_empty');expect(armor[4]).toBe('armor_empty');
    await expect(page.locator('.bc-xp-fill')).toHaveCSS('width','91px');
    await expect(page.locator('.bc-level')).toHaveAttribute('data-level','12');
    // Hotbar: icons, counts, durability, selection, offhand and the held item name.
    await expect(page.getByRole('button',{name:'Diamond Pickaxe, durability 781 of 1561, slot 1'})).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('button',{name:'Dirt ×64, slot 2'})).toBeVisible();
    await expect(page.locator('.bc-slot[data-slot="0"] .bc-dur')).toBeVisible();
    await expect(page.locator('.bc-slot[data-slot="1"] .bc-count')).toBeVisible();
    await expect(page.locator('.bc-offhand')).toBeVisible();
    await expect(page.locator('.bc-held-name')).toHaveText('Diamond Pickaxe');
    // The name is drawn in the pixel font (the text stays available to assistive technology).
    await expect(page.locator('.bc-held-text')).toBeVisible();await expect(page.locator('.bc-held-label')).toHaveClass(/bc-sr/);
    // Clock in the offhand: its readout; selecting the compass adds the compass readout.
    await expect(page.locator('[data-dial=clock]')).toBeVisible();await expect(page.locator('[data-dial=compass]')).toBeHidden();
    await page.keyboard.press('Digit3');
    await expect(page.locator('[data-dial=compass]')).toBeVisible();await expect(page.locator('.bc-held-name')).toHaveText('Compass');
    await expect(page.locator('.bc-readouts')).toHaveAttribute('data-place','right');
    // Compass and clock icons in slots are the animated dials too.
    await expect(page.locator('.bc-slot[data-slot="2"] img')).toHaveAttribute('src',/^data:image\/svg\+xml/);

    // Vanilla GUI scale 3 at 1366×768: the 182 px hotbar is 546 px wide, centred, on the bottom edge.
    const bar=(await page.locator('.bc-hotbar-bg').boundingBox())!;
    expect(bar.width).toBeCloseTo(546,0);expect(bar.x+bar.width/2).toBeCloseTo(683,0);expect(bar.y+bar.height).toBeCloseTo(768,0);
    const sel=(await page.locator('.bc-selection').boundingBox())!;expect(sel.x).toBeCloseTo(bar.x-3+2*60,0);
    const cross=(await page.locator('.bc-cross').boundingBox())!;expect(cross.x+cross.width/2).toBeCloseTo(683,-1);expect(cross.y+cross.height/2).toBeCloseTo(384,-1);
    await checkClear(page,1366,768);

    // Action bar above the bars.
    await page.evaluate(()=>(window as unknown as {blockcraft:{ui:{toast(m:string):void}}}).blockcraft.ui.toast('You can sleep only at night'));
    const toast=(await page.locator('.bc-toast').boundingBox())!;
    const topOfBars=Math.min(...(await boxes(page,'.bc-hearts .bc-icon,.bc-armor .bc-icon')).map(b=>b.y));
    expect(toast.y+toast.height).toBeLessThanOrEqual(topOfBars+1);
    await page.screenshot({path:evidence('hud-1366x768')});

    // Low health: vignette on.
    await setSurvival(page,{health:3,absorption:0});
    await expect(page.locator('.bc-vignette')).toHaveAttribute('data-on','true');

    // F3 (flag set by the input service) shows the debug overlay below the toolbar; F1 hides the HUD.
    await page.evaluate(()=>{(document.querySelector('.blockcraft') as HTMLElement).dataset.debug='true';});
    const dbg=page.locator('.bc-debug');
    await expect(dbg).toBeVisible();await expect(dbg).toContainText('XYZ:');await expect(dbg).toContainText('Facing:');await expect(dbg).toContainText('fps');
    await expect(dbg).toContainText('Biome:');await expect(dbg).toContainText('Weather:');await expect(dbg).toContainText('Mobs:');
    const d=(await dbg.boundingBox())!;expect(d.y).toBeGreaterThanOrEqual(56);expect(overlaps(d,bar)).toBe(false);
    await page.screenshot({path:evidence('hud-f3-1366x768')});
    // F1 hides the whole GUI, the F3 screen included; F3 alone again shows it.
    await page.evaluate(()=>{(document.querySelector('.blockcraft') as HTMLElement).dataset.hudHidden='true';});
    await expect(page.locator('.bc-hud')).toBeHidden();await expect(page.locator('.bc-crosshair')).toBeHidden();await expect(dbg).toBeHidden();
    await expect(page.locator('.bc-vignette')).toBeHidden();
    await page.evaluate(()=>{const r=(document.querySelector('.blockcraft') as HTMLElement).dataset;r.hudHidden='';r.debug='';});
    await expect(page.locator('.bc-hotbar-bg')).toBeVisible();await expect(dbg).toBeHidden();
    expect(errors).toEqual([]);
  });
});

for(const [width,height] of [[390,844],[320,568]] as const)test.describe(`phone ${width}x${height} with touch`,()=>{
  test.use({viewport:{width,height},hasTouch:true,isMobile:true});
  test('HUD and menus fit the phone and keep clear of the shell buttons',async({page})=>{
    test.setTimeout(150000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/#/game/blockcraft');await ready(page);
    // The start menu fits between the toolbar and the bottom edge.
    for(const b of await boxes(page,'.bc-menu .bc-btn')){expect(b.y).toBeGreaterThanOrEqual(56);expect(b.x+b.width).toBeLessThanOrEqual(width);expect(b.y+b.height).toBeLessThanOrEqual(height);}
    await expect(page.locator('.bc-menu-message')).toContainText('Drag');
    await page.screenshot({path:evidence(`menu-${width}x${height}`)});
    await play(page);
    await setSurvival(page,{health:20,absorption:0,food:20,saturation:5,xpLevel:3,xpProgress:.25},4);await give(page);
    await expect(page.locator('.bc-hearts .bc-icon:not([hidden])')).toHaveCount(10,{timeout:15000});
    const slots=await boxes(page,'.bc-slot');
    expect(slots).toHaveLength(9);
    for(const s of slots){expect(s.width,'touch-sized slots').toBeGreaterThanOrEqual(26);expect(s.x).toBeGreaterThanOrEqual(7.5);expect(s.x+s.width).toBeLessThanOrEqual(width-7.5);}
    await expect(page.locator('.bc-offhand')).toBeVisible();
    const off=(await page.locator('.bc-offhand').boundingBox())!;expect(off.x).toBeGreaterThanOrEqual(7.5);
    // No room beside the bars: the animated compass and clock slot icons are the readouts.
    await expect(page.locator('.bc-readouts')).toHaveAttribute('data-place','slots');
    await expect(page.locator('.bc-slot[data-slot="2"] img')).toHaveAttribute('src',/^data:image\/svg\+xml/);
    await expect(page.locator('.bc-offhand img')).toHaveAttribute('src',/^data:image\/svg\+xml/);
    await checkClear(page,width,height);
    // Tapping a slot selects it.
    await page.locator('.bc-slot[data-slot="1"]').tap();
    await expect(page.locator('.blockcraft')).toHaveAttribute('data-slot','1');
    // The action bar sits above the bars, inside the screen.
    await page.evaluate(()=>(window as unknown as {blockcraft:{ui:{toast(m:string):void}}}).blockcraft.ui.toast('You may not rest now; there are monsters nearby'));
    const toast=(await page.locator('.bc-toast').boundingBox())!;
    const topOfBars=Math.min(...(await boxes(page,'.bc-hearts .bc-icon,.bc-armor .bc-icon,.bc-food .bc-icon')).map(b=>b.y));
    expect(toast.y+toast.height).toBeLessThanOrEqual(topOfBars+1);expect(toast.x).toBeGreaterThanOrEqual(0);expect(toast.x+toast.width).toBeLessThanOrEqual(width);
    await page.screenshot({path:evidence(`hud-${width}x${height}`)});
    expect(errors).toEqual([]);
  });
});

test.describe('menus',()=>{
  test.use({viewport:{width:1280,height:720}});
  test('world options change the settings; controls, advancements and the death screen work',async({page})=>{
    test.setTimeout(150000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/#/game/blockcraft');await ready(page);
    const root=page.locator('.blockcraft');
    const settings=()=>page.evaluate(()=>({...(window as unknown as {blockcraft:{settings:Record<string,unknown>}}).blockcraft.settings}));
    await expect(page.locator('.bc-menu-title')).toHaveText('Blockcraft');
    await page.getByRole('button',{name:'Game mode'}).click();
    await expect(root).toHaveAttribute('data-mode','creative');await expect(page.getByRole('button',{name:'Game Mode: Creative'})).toBeVisible();
    await page.getByRole('button',{name:'Game mode'}).click();await expect(root).toHaveAttribute('data-mode','survival');

    await page.getByRole('button',{name:'Options…'}).click();
    await page.getByRole('button',{name:'Difficulty: Normal'}).click();
    await expect(page.getByRole('button',{name:'Difficulty: Hard'})).toBeVisible();
    for(const [label,key,value] of [['Keep Inventory: OFF','keepInventory',true],['Daylight Cycle: ON','daylightCycle',false],
      ['Weather Cycle: ON','weatherCycle',false],['Mob Spawning: ON','mobSpawning',false]] as const){
      await page.getByRole('button',{name:label}).click();
      await expect.poll(async()=>(await settings())[key]).toBe(value);
    }
    await expect(page.getByRole('button',{name:'Keep Inventory: ON'})).toHaveAttribute('aria-pressed','true');
    const fov=page.getByRole('slider',{name:/FOV/});
    await fov.focus();await page.keyboard.press('ArrowRight');
    await expect.poll(async()=>(await settings()).fov).toBe(71);
    await page.keyboard.press('End');await expect(page.getByRole('slider',{name:'FOV: Quake Pro'})).toBeVisible();
    await page.getByRole('slider',{name:/Render Distance/}).focus();await page.keyboard.press('Home');
    await expect(root).toHaveAttribute('data-view','3');await expect(page.getByRole('slider',{name:'Render Distance: 3 chunks'})).toBeVisible();
    await page.getByRole('slider',{name:/Sensitivity/}).focus();await page.keyboard.press('ArrowLeft');
    await expect.poll(async()=>(await settings()).sensitivity).toBe(.95);
    await page.getByRole('slider',{name:/Master Volume/}).focus();await page.keyboard.press('Home');
    await expect(page.getByRole('slider',{name:'Master Volume: OFF'})).toBeVisible();
    expect(await settings()).toMatchObject({difficulty:'hard',fov:110,view:0,volume:0,keepInventory:true,daylightCycle:false,weatherCycle:false,mobSpawning:false});
    await page.screenshot({path:evidence('menu-options-1280x720')});
    await page.getByRole('button',{name:'Done'}).click();

    await page.getByRole('button',{name:'Controls'}).click();
    const list=page.locator('.bc-controls');
    await expect(list).toContainText('Walk forward');await expect(list).toContainText('Hide HUD');await expect(list).toContainText('F3');
    await page.getByRole('button',{name:'Done'}).click();
    await expect(page.getByRole('button',{name:'Controls'})).toBeFocused();

    // Advancements opens the ui's screen; closing it returns to the menu or to the game.
    await page.getByRole('button',{name:'Advancements'}).click();
    await expect.poll(()=>page.evaluate(()=>(window as unknown as {blockcraft:{ui:{screen:string|null}}}).blockcraft.ui.screen)).toBe('advancements');
    await expect(page.locator('.bc-menu')).toBeHidden();
    await page.evaluate(()=>(window as unknown as {blockcraft:{ui:{close():void}}}).blockcraft.ui.close());
    await expect.poll(async()=>await page.locator('.bc-menu').isVisible()||await root.getAttribute('data-phase')==='playing',{timeout:5000}).toBe(true);
    if(await page.locator('.bc-menu').isVisible())await play(page);

    // Death screen: message, score and a Respawn button enabled after a second.
    await page.evaluate(()=>(window as unknown as {blockcraft:{survival:{kill(m:string):void}}}).blockcraft.survival.kill('Steve hit the ground too hard'));
    await expect(page.getByRole('heading',{name:'You died!'})).toBeVisible();
    await expect(page.locator('.bc-menu')).toContainText('Steve hit the ground too hard');await expect(page.locator('.bc-menu')).toContainText('Score:');
    const respawn=page.getByRole('button',{name:'Respawn'});
    await expect(respawn).toBeDisabled();await expect(respawn).toBeEnabled({timeout:5000});
    await page.screenshot({path:evidence('death-1280x720')});
    await respawn.click();
    await expect.poll(()=>root.getAttribute('data-phase'),{timeout:20000}).not.toBe('dead');
    await expect(page.getByRole('heading',{name:'You died!'})).toBeHidden();

    // Losing the WebGL context shows the lost-graphics screen without buttons.
    await page.evaluate(()=>(document.querySelector('.blockcraft canvas') as HTMLCanvasElement).getContext('webgl2')!.getExtension('WEBGL_lose_context')!.loseContext());
    await expect(page.locator('.bc-menu-title')).toHaveText('Graphics interrupted');
    await expect(page.locator('.bc-menu-message')).toContainText('Your world is saved');
    expect(await boxes(page,'.bc-menu .bc-btn')).toHaveLength(0);
    expect(errors).toEqual([]);
  });
});
