import {test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';

// Inventory and screens: crafting planks and a crafting table, the 3×3 table, smelting in a furnace, a (large) chest
// round trip, armour equip, keyboard slots, the creative picker and the 320×568 layout. Software WebGL is slow, so
// state is read from the running engine (window.blockcraft in development) and every wait is generous.
type Engine=Record<string,any>;// eslint-disable-line @typescript-eslint/no-explicit-any
const BLOCKS_MODULE='/src/games/blockcraft/data/blocks.ts';

async function boot(page:Page,size={width:1280,height:720}){
  await page.setViewportSize(size);
  await page.goto('/#/game/blockcraft');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:45000});
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing',{timeout:15000});
  await page.evaluate(()=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft;
    // Record what the screens report to the rest of the game.
    const w=window as unknown as {crafted:unknown[];xp:number[]};w.crafted=[];w.xp=[];
    g.events.on('itemCrafted',(e:unknown)=>w.crafted.push(e));
    const addXp=g.survival.addXp.bind(g.survival);g.survival.addXp=(n:number)=>{w.xp.push(n);addXp(n);};
    // Before the crafting area is merged its service is a stub with no recipes: give the screens the vanilla ones they need.
    if(!g.crafting.allRecipes().length){
      const st=(id:string,count=1)=>({id,count});
      g.crafting={
        match(grid:({id:string}|null)[],width:number){
          const filled=grid.map((s,i)=>s?i:-1).filter(i=>i>=0),none=grid.map(()=>null);
          if(filled.length===1&&grid[filled[0]]!.id==='oak_log')return{result:st('oak_planks',4),remainders:none};
          if(filled.length===4&&filled.every(i=>grid[i]!.id==='oak_planks')){
            const xs=filled.map(i=>i%width),ys=filled.map(i=>Math.floor(i/width));
            if(Math.max(...xs)-Math.min(...xs)===1&&Math.max(...ys)-Math.min(...ys)===1)return{result:st('crafting_table'),remainders:none};
          }
          return null;
        },
        smelt:(id:string)=>id==='raw_iron'?{result:st('iron_ingot'),xp:.7}:null,
        fuelSeconds:(id:string)=>({coal:80,oak_planks:15,oak_log:15} as Record<string,number>)[id]??0,
        recipesFor:()=>[],allRecipes:()=>[]
      };
    }
  });
}
/** Runs `fn` in the page with the engine (no eval: the function runs against a handle). */
async function engine<T>(page:Page,fn:(g:Engine,arg:unknown)=>T,arg?:unknown):Promise<T>{
  const handle=await page.evaluateHandle(()=>(window as unknown as {blockcraft:Engine}).blockcraft);
  try{return await handle.evaluate(fn as (g:Engine,arg:unknown)=>T,arg) as T;}finally{await handle.dispose();}
}
type Pos={x:number;y:number;z:number};
const slot=(page:Page,label:string)=>page.locator(`.bc-screen button[data-slot][aria-label^="${label}:"]`);
const screenId=(page:Page)=>engine(page,g=>g.ui.screen);
async function give(page:Page,slotIndex:number,id:string,count:number){
  await engine(page,(g,a)=>{const [i,id,count]=a as [number,string,number];g.inventory.setSlot(i,{id,count});},[slotIndex,id,count]);
}
/** Puts blocks next to the player (overwriting terrain) and returns their positions. */
async function placeBlocks(page:Page,blocks:{dx:number;dz:number;family:string;facing?:string}[]){
  return page.evaluate(async([url,list])=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft;
    const {stateFor}=await import(/* @vite-ignore */ url);
    const p=g.player.state,x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);
    return list.map(b=>{
      const def=stateFor(b.family,b.facing?{facing:b.facing,lit:false}:{});
      g.world.set(x+b.dx,y,z+b.dz,def.id,'player');
      g.world.set(x+b.dx,y+1,z+b.dz,0,'player');// a solid block above would keep a chest shut
      return{x:x+b.dx,y,z:z+b.dz};
    });
  },[BLOCKS_MODULE,blocks] as const);
}

test('crafts planks and a crafting table in the inventory, then uses the 3×3 table',async({page})=>{
  test.setTimeout(150000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page);
  await give(page,0,'oak_log',2);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','screen');
  await expect(page.locator('.bc-panel')).toHaveAttribute('aria-label','Inventory');
  expect(await screenId(page)).toBe('inventory');
  // Pick up both logs and put them in the 2×2 grid.
  await slot(page,'Hotbar slot 1').click();
  await expect(page.locator('.bc-cursor')).toBeVisible();
  await slot(page,'Crafting grid row 1 column 1').click();
  await expect(slot(page,'Crafting result')).toHaveAttribute('aria-label','Crafting result: Oak Planks, 4');
  // Shift-click crafts both logs into eight planks, which land at the hotbar end first.
  await slot(page,'Crafting result').click({modifiers:['Shift']});
  await expect.poll(()=>engine(page,g=>g.inventory.count('oak_planks')),{timeout:10000}).toBe(8);
  await expect(slot(page,'Hotbar slot 9')).toHaveAttribute('aria-label','Hotbar slot 9: Oak Planks, 8');
  expect(await engine(page,g=>g.inventory.count('oak_log'))).toBe(0);
  // Right click places one plank in each grid cell.
  await slot(page,'Hotbar slot 9').click();
  for(const cell of ['row 1 column 1','row 1 column 2','row 2 column 1','row 2 column 2'])
    await slot(page,`Crafting grid ${cell}`).click({button:'right'});
  await expect(slot(page,'Crafting result')).toHaveAttribute('aria-label','Crafting result: Crafting Table');
  await slot(page,'Hotbar slot 9').click();// put the other four planks back
  await slot(page,'Crafting result').click();
  await slot(page,'Hotbar slot 2').click();
  await expect(slot(page,'Hotbar slot 2')).toHaveAttribute('aria-label','Hotbar slot 2: Crafting Table');
  const crafted=await page.evaluate(()=>(window as unknown as {crafted:{stack:{id:string;count:number};station:string}[]}).crafted);
  expect(crafted.map(c=>`${c.stack.id}x${c.stack.count}@${c.station}`)).toEqual(['oak_planksx4@inventory','oak_planksx4@inventory','crafting_tablex1@inventory']);
  // Leave a plank in the grid: closing gives it back.
  await slot(page,'Hotbar slot 9').click();await slot(page,'Crafting grid row 1 column 1').click({button:'right'});
  await page.keyboard.press('KeyE');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  await expect(page.locator('.bc-screen')).toBeHidden();
  expect(await engine(page,g=>g.inventory.count('oak_planks'))).toBe(4);
  // The crafting table block opens the 3×3 grid.
  const [at]=await placeBlocks(page,[{dx:2,dz:0,family:'crafting_table'}]);
  await engine(page,(g,a)=>g.ui.open('crafting_table',a),at);
  await expect(page.locator('.bc-panel')).toHaveAttribute('aria-label','Crafting');
  await expect(page.locator('.bc-screen button[aria-label^="Crafting grid row 3 column 3:"]')).toHaveCount(1);
  // Closing put the planks back in the first free slot; shift-click fills the table's grid first.
  await expect(slot(page,'Hotbar slot 1')).toHaveAttribute('aria-label','Hotbar slot 1: Oak Planks, 4');
  await slot(page,'Hotbar slot 1').click({modifiers:['Shift']});
  expect(await engine(page,g=>g.ui.layout.grid.cells.filter(Boolean).length)).toBe(1);
  await page.locator('.bc-screen [data-close]').click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  expect(await engine(page,g=>g.inventory.count('oak_planks'))).toBe(4);
  expect(errors).toEqual([]);
});

test('smelts raw iron in a furnace and pays its experience when the output is taken',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page);
  const [at]=await placeBlocks(page,[{dx:0,dz:-2,family:'furnace',facing:'south'}]);
  await give(page,9,'raw_iron',2);await give(page,10,'coal',1);
  await engine(page,(g,a)=>g.ui.open('furnace',a),at);
  await expect(page.locator('.bc-panel')).toHaveAttribute('aria-label','Furnace');
  // Shift-click sends smeltable items to the input and fuel to the fuel slot.
  await slot(page,'Inventory slot 1').click({modifiers:['Shift']});
  await slot(page,'Inventory slot 2').click({modifiers:['Shift']});
  await expect(slot(page,'Furnace input')).toHaveAttribute('aria-label','Furnace input: Raw Iron, 2');
  await expect(slot(page,'Furnace fuel')).toHaveAttribute('aria-label','Furnace fuel: Coal');
  const furnace=(field:string)=>engine(page,(g,a)=>{const [p,f]=a as [Pos,string];return g.blockEntities.get(p.x,p.y,p.z)[f];},[at,field]);
  expect(await furnace('input')).toEqual({id:'raw_iron',count:2});
  if(await engine(page,g=>typeof g.blockEntities.tick==='function')){
    // The real furnace: 10 s of game time per item; the flame and arrow follow it.
    await expect.poll(async()=>Number((await page.locator('.bc-flame i').getAttribute('style'))?.match(/height: ([\d.]+)/)?.[1]??0),{timeout:60000}).toBeGreaterThan(0);
    await expect.poll(async()=>(await furnace('output') as {count:number}|null)?.count??0,{timeout:200000,intervals:[1000]}).toBe(2);
  }else{
    // Before the smelting area is merged its block entities do not tick: finish the job as a furnace would.
    await engine(page,(g,a)=>{const p=a as Pos;Object.assign(g.blockEntities.get(p.x,p.y,p.z),
      {input:null,fuel:null,output:{id:'iron_ingot',count:2},burn:60,burnTotal:80,cook:4,xp:1.4});},at);
    await expect(page.locator('.bc-progress i')).toHaveAttribute('style',/width: 40/);
    await expect(page.locator('.bc-flame i')).toHaveAttribute('style',/height: 75/);
  }
  await expect(slot(page,'Furnace output')).toHaveAttribute('aria-label','Furnace output: Iron Ingot, 2');
  await slot(page,'Furnace output').click({modifiers:['Shift']});
  await expect.poll(()=>engine(page,g=>g.inventory.count('iron_ingot'))).toBe(2);
  const paid=await page.evaluate(()=>(window as unknown as {xp:number[]}).xp);
  expect(paid.reduce((a,b)=>a+b,0)).toBeGreaterThanOrEqual(1);
  expect(await furnace('xp')).toBe(0);
  const crafted=await page.evaluate(()=>(window as unknown as {crafted:{stack:{id:string};station:string}[]}).crafted);
  expect(crafted).toEqual([{stack:{id:'iron_ingot',count:2},station:'furnace'}]);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  expect(errors).toEqual([]);
});

test('a large chest keeps items between openings; armour equips by shift-click, click and keyboard',async({page})=>{
  test.setTimeout(150000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page);
  const chests=await placeBlocks(page,[{dx:2,dz:0,family:'chest',facing:'west'},{dx:2,dz:1,family:'chest',facing:'west'}]);
  await give(page,0,'diamond',5);await give(page,1,'cobblestone',64);
  await engine(page,(g,a)=>g.ui.open('chest',a),chests[0]);
  await expect(page.locator('.bc-panel')).toHaveAttribute('aria-label','Large Chest');
  await expect(page.locator('.bc-screen button[aria-label^="Chest slot"]')).toHaveCount(54);
  await slot(page,'Hotbar slot 1').click({modifiers:['Shift']});
  await slot(page,'Hotbar slot 2').click();await slot(page,'Chest slot 30').click();
  await expect(slot(page,'Chest slot 1')).toHaveAttribute('aria-label','Chest slot 1: Diamond, 5');
  await page.keyboard.press('KeyE');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  expect(await engine(page,g=>g.inventory.count('diamond')+g.inventory.count('cobblestone'))).toBe(0);
  // Reopen from the other half: same contents.
  await engine(page,(g,a)=>g.ui.open('chest',a),chests[1]);
  await expect(slot(page,'Chest slot 1')).toHaveAttribute('aria-label','Chest slot 1: Diamond, 5');
  await expect(slot(page,'Chest slot 30')).toHaveAttribute('aria-label','Chest slot 30: Cobblestone, 64');
  await slot(page,'Chest slot 1').click({modifiers:['Shift']});
  await slot(page,'Chest slot 30').click({modifiers:['Shift']});
  await expect.poll(()=>engine(page,g=>[g.inventory.count('diamond'),g.inventory.count('cobblestone')])).toEqual([5,64]);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  // Armour: shift-click equips into the matching slot, a click puts a helmet on, number keys swap a focused slot.
  await give(page,9,'iron_chestplate',1);await give(page,10,'leather_helmet',1);await give(page,11,'diamond_boots',1);
  await page.keyboard.press('KeyE');
  await expect(page.locator('.bc-panel')).toHaveAttribute('aria-label','Inventory');
  await slot(page,'Inventory slot 1').click({modifiers:['Shift']});
  await expect(slot(page,'Chestplate slot')).toHaveAttribute('aria-label','Chestplate slot: Iron Chestplate');
  await slot(page,'Inventory slot 2').click();await slot(page,'Boots slot').click();
  expect(await engine(page,g=>g.inventory.armorIn('feet'))).toBeNull();// a helmet does not fit the boots
  await slot(page,'Helmet slot').click();
  await expect(slot(page,'Helmet slot')).toHaveAttribute('aria-label','Helmet slot: Leather Helmet');
  await slot(page,'Inventory slot 3').focus();
  await page.keyboard.press('Digit5');
  await expect(slot(page,'Hotbar slot 5')).toHaveAttribute('aria-label','Hotbar slot 5: Diamond Boots');
  await slot(page,'Hotbar slot 5').focus();await page.keyboard.press('Shift+Enter');
  await expect(slot(page,'Boots slot')).toHaveAttribute('aria-label','Boots slot: Diamond Boots');
  expect(await engine(page,g=>g.inventory.armor.map((a:{id:string}|null)=>a?.id??null))).toEqual(['leather_helmet','iron_chestplate',null,'diamond_boots']);
  // Hovering shows a tooltip with the armour points.
  await slot(page,'Chestplate slot').hover();
  await expect(page.locator('.bc-tip')).toContainText('+6 Armor');
  // A worn tool keeps its durability bar while carried, and a save made meanwhile keeps the carried stack.
  await engine(page,g=>g.inventory.setSlot(12,{id:'iron_pickaxe',count:1,damage:125}));
  await slot(page,'Inventory slot 4').click();
  await expect(page.locator('.bc-cursor .bc-d')).toBeVisible();
  expect(await engine(page,g=>g.serialize().systems.ui)).toEqual({stacks:[{id:'iron_pickaxe',count:1,damage:125}]});
  await slot(page,'Inventory slot 4').click();
  await expect(page.locator('.bc-cursor')).toBeHidden();
  await page.keyboard.press('KeyE');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  expect(errors).toEqual([]);
});

test.describe('touch',()=>{
  test.use({hasTouch:true});
  test('a tap picks up and places, a long press takes half, quick move turns taps into shift-clicks',async({page})=>{
    test.setTimeout(150000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await boot(page,{width:390,height:844});
    await give(page,9,'dirt',10);
    await engine(page,g=>g.ui.open('inventory'));
    const centre=async(label:string)=>{const b=(await slot(page,label).boundingBox())!;return{x:b.x+b.width/2,y:b.y+b.height/2};};
    let p=await centre('Inventory slot 1');await page.touchscreen.tap(p.x,p.y);
    await expect.poll(()=>engine(page,g=>g.ui.menu.cursor)).toEqual({id:'dirt',count:10});
    p=await centre('Inventory slot 5');await page.touchscreen.tap(p.x,p.y);
    await expect(slot(page,'Inventory slot 5')).toHaveAttribute('aria-label','Inventory slot 5: Dirt, 10');
    // Hold a finger on the stack: half of it comes up.
    const cdp=await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:p.x,y:p.y}]});
    await page.waitForTimeout(1200);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await expect.poll(()=>engine(page,g=>g.ui.menu.cursor)).toEqual({id:'dirt',count:5});
    await expect(slot(page,'Inventory slot 5')).toHaveAttribute('aria-label','Inventory slot 5: Dirt, 5');
    p=await centre('Inventory slot 5');await page.touchscreen.tap(p.x,p.y);
    await expect(slot(page,'Inventory slot 5')).toHaveAttribute('aria-label','Inventory slot 5: Dirt, 10');
    // The quick-move toggle is shown for touch and sends a tapped stack to the hotbar.
    await page.locator('.bc-screen [data-quick]').tap();
    await expect(page.locator('.bc-screen [data-quick]')).toHaveAttribute('aria-pressed','true');
    p=await centre('Inventory slot 5');await page.touchscreen.tap(p.x,p.y);
    await expect(slot(page,'Hotbar slot 1')).toHaveAttribute('aria-label','Hotbar slot 1: Dirt, 10');
    await page.locator('.bc-screen [data-close]').tap();
    await expect(page.locator('.bc-screen')).toBeHidden();
    expect(errors).toEqual([]);
  });
});

test('creative picker and the survival inventory fit a 320×568 phone',async({page})=>{
  test.setTimeout(150000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await boot(page,{width:320,height:568});
  const fits=async()=>{
    const box=(await page.locator('.bc-panel').boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x+box.width).toBeLessThanOrEqual(320);expect(box.y+box.height).toBeLessThanOrEqual(568);
    expect(await page.locator('.bc-panel').evaluate(e=>e.scrollWidth<=e.clientWidth&&e.scrollHeight<=e.clientHeight+1)).toBe(true);
  };
  await engine(page,g=>g.ui.open('inventory'));
  await expect(page.locator('.bc-panel')).toHaveAttribute('aria-label','Inventory');
  await fits();
  const chests=await placeBlocks(page,[{dx:2,dz:0,family:'chest',facing:'west'},{dx:2,dz:1,family:'chest',facing:'west'}]);
  await engine(page,(g,a)=>g.ui.open('chest',a),chests[0]);
  await expect(page.locator('.bc-panel')).toHaveAttribute('aria-label','Large Chest');
  await fits();
  await engine(page,g=>g.ui.close());
  // Creative: tabs, search, infinite stacks and the hotbar row.
  await engine(page,g=>g.setMode('creative'));
  await engine(page,g=>{g.inventory.clear();g.ui.open('creative');});
  await expect(page.locator('.bc-panel')).toHaveClass(/bc-panel-creative/);
  await fits();
  await page.locator('.bc-tab[aria-label="Search Items"]').click();
  await page.locator('.bc-search-input').fill('diamond sw');
  await expect(page.locator('.bc-catalog button[data-slot]')).toHaveCount(1);
  await page.locator('.bc-catalog button[data-slot]').first().click();
  await slot(page,'Hotbar slot 1').click();
  await expect(slot(page,'Hotbar slot 1')).toHaveAttribute('aria-label','Hotbar slot 1: Diamond Sword');
  await page.locator('.bc-tab[aria-label="Spawn Eggs"]').click();
  await expect(page.locator('.bc-catalog button[data-slot]')).toHaveCount(16);
  await page.locator('.bc-catalog button[aria-label="Cow Spawn Egg"]').click({modifiers:['Shift']});
  await slot(page,'Hotbar slot 2').click();
  await expect(slot(page,'Hotbar slot 2')).toHaveAttribute('aria-label','Hotbar slot 2: Cow Spawn Egg, 64');
  await page.locator('.bc-tab[aria-label="Survival Inventory"]').click();
  await fits();
  await slot(page,'Hotbar slot 2').click();
  await page.locator('.bc-screen button[aria-label^="Destroy item slot"]').click();
  expect(await engine(page,g=>g.inventory.count('cow_spawn_egg'))).toBe(0);
  await page.screenshot({path:'tests/games/blockcraft/evidence/screens-creative-320.png'});
  await page.keyboard.press('KeyE');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  expect(errors).toEqual([]);
});
