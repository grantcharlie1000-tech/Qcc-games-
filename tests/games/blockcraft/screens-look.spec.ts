import {test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';

// Vanilla look of the inventory-like screens: every screen at 1366×768 and 390×844 (plus touch, a landscape phone and the
// recipe book), saved as evidence (tests/games/blockcraft/evidence/screens-*.png), with the vanilla GUI geometry checked
// on the live page: one GUI pixel (--bc-u) scales the whole panel, slots are 18 GUI px, the panel keeps clear of the
// arcade toolbar (top 56 px) and fits the game area.
type Engine=Record<string,any>;// eslint-disable-line @typescript-eslint/no-explicit-any
const BLOCKS_MODULE='/src/games/blockcraft/data/blocks.ts';
const EVIDENCE='tests/games/blockcraft/evidence';

async function boot(page:Page,size:{width:number;height:number}){
  await page.setViewportSize(size);
  await page.goto('/#/game/blockcraft');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing',{timeout:20000});
  // Stocking the inventory earns advancements: keep their toasts out of the evidence pictures.
  await page.addStyleTag({content:'.bc-adv-toasts{display:none!important}'});
}
async function engine<T>(page:Page,fn:(g:Engine,arg:unknown)=>T,arg?:unknown):Promise<T>{
  const handle=await page.evaluateHandle(()=>(window as unknown as {blockcraft:Engine}).blockcraft);
  try{return await handle.evaluate(fn as (g:Engine,arg:unknown)=>T,arg) as T;}finally{await handle.dispose();}
}
type Pos={x:number;y:number;z:number};
async function placeBlocks(page:Page,blocks:{dx:number;dz:number;family:string;facing?:string}[]):Promise<Pos[]>{
  return page.evaluate(async([url,list])=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft;
    const {stateFor}=await import(/* @vite-ignore */ url);
    const p=g.player.state,x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);
    return list.map(b=>{
      const def=stateFor(b.family,b.facing?{facing:b.facing,lit:false}:{});
      g.world.set(x+b.dx,y,z+b.dz,def.id,'player');
      g.world.set(x+b.dx,y+1,z+b.dz,0,'player');
      return{x:x+b.dx,y,z:z+b.dz};
    });
  },[BLOCKS_MODULE,blocks] as const);
}
/** A believable inventory: stacks, worn tools, armour and food. */
async function stock(page:Page){
  await engine(page,g=>{
    const inv=g.inventory,put=(i:number,id:string,count=1,damage?:number)=>inv.setSlot(i,damage?{id,count,damage}:{id,count});
    put(0,'diamond_sword',1,700);put(1,'iron_pickaxe',1,40);put(2,'oak_planks',64);put(3,'torch',37);put(4,'bread',12);
    put(5,'cobblestone',64);put(6,'oak_log',9);put(8,'water_bucket');
    put(9,'raw_iron',14);put(10,'coal',23);put(13,'redstone',48);put(17,'wheat_seeds',5);put(20,'diamond',3);
    put(24,'stick',16);put(30,'golden_apple',2);put(35,'arrow',64);
    inv.setArmor('chest',{id:'iron_chestplate',count:1});inv.setArmor('feet',{id:'leather_boots',count:1,damage:30});
  });
}
/** Screen blocks next to the player: crafting table, a furnace mid-smelt, a chest with a few stacks, a large chest. */
async function stations(page:Page){
  const [table,furnace,chest,big]=await placeBlocks(page,[
    {dx:2,dz:0,family:'crafting_table'},{dx:-2,dz:0,family:'furnace',facing:'east'},{dx:0,dz:2,family:'chest',facing:'north'},
    {dx:3,dz:3,family:'chest',facing:'west'},{dx:3,dz:4,family:'chest',facing:'west'}]);
  await engine(page,(g,a)=>{
    const [f,c]=a as [Pos,Pos];
    Object.assign(g.blockEntities.get(f.x,f.y,f.z),{input:{id:'raw_iron',count:6},fuel:{id:'coal',count:7},output:{id:'iron_ingot',count:3},burn:50,burnTotal:80,cook:4.5});
    const items=g.blockEntities.get(c.x,c.y,c.z).items;
    items[0]={id:'diamond',count:12};items[4]={id:'gold_ingot',count:5};items[13]={id:'bone',count:7};items[26]={id:'string',count:2};
  },[furnace,chest]);
  return{table,furnace,chest,big};
}
/** The panel's GUI pixel, and that it fits: inside the game area, below the toolbar zone, slots 18 GUI px. */
async function checkGeometry(page:Page,size:{width:number;height:number},integer:boolean){
  const g=await page.evaluate(()=>{
    const panel=document.querySelector('.bc-panel')!,slot=document.querySelector('.bc-panel .bc-s')!;
    const u=parseFloat(getComputedStyle(panel).getPropertyValue('--bc-u'));
    const all=[panel,...document.querySelectorAll('.bc-panel .bc-tab,.bc-panel .bc-tools,.bc-book:not([hidden])')].map(e=>e.getBoundingClientRect());
    const s=slot.getBoundingClientRect();
    return{u,slot:s.width,left:Math.min(...all.map(r=>r.left)),top:Math.min(...all.map(r=>r.top)),right:Math.max(...all.map(r=>r.right)),bottom:Math.max(...all.map(r=>r.bottom)),
      bg:getComputedStyle(slot).backgroundColor,frame:getComputedStyle(panel,'::before').borderImageSource.startsWith('url(')};
  });
  expect(g.frame).toBe(true);
  expect(g.bg).toBe('rgb(139, 139, 139)');
  expect(g.slot).toBeCloseTo(18*g.u,1);
  if(integer)expect(Number.isInteger(g.u)).toBe(true);
  expect(g.left).toBeGreaterThanOrEqual(0);expect(g.right).toBeLessThanOrEqual(size.width);
  expect(g.top).toBeGreaterThanOrEqual(56);expect(g.bottom).toBeLessThanOrEqual(size.height);
  return g.u;
}
async function shot(page:Page,name:string){
  // Let lazily loaded icons and data URLs decode before the picture.
  await page.waitForTimeout(400);
  await page.screenshot({path:`${EVIDENCE}/screens-${name}.png`});
}

for(const size of [{width:1366,height:768,tag:'1366'},{width:390,height:844,tag:'390'}]){
  test(`every screen reads as the vanilla GUI at ${size.tag}`,async({page})=>{
    test.setTimeout(240000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    await boot(page,size);
    await stock(page);
    const at=await stations(page);
    await page.mouse.move(2,size.height-2);
    const open=async(id:string,label:string,pos?:Pos)=>{
      await engine(page,(g,a)=>{const [i,p]=a as [string,Pos|undefined];g.ui.open(i,p);},[id,pos]);
      await expect(page.locator('.bc-panel')).toHaveAttribute('aria-label',label);
      return checkGeometry(page,size,true);
    };
    const u=await open('inventory','Inventory');
    expect(u).toBe(size.tag==='1366'?3:2);
    await shot(page,`inventory-${size.tag}`);
    if(size.tag==='1366'){
      // Tooltip over a worn sword (desktop has hover).
      await page.locator('.bc-screen button[aria-label^="Hotbar slot 1:"]').hover();
      await expect(page.locator('.bc-tip')).toBeVisible();
      await expect(page.locator('.bc-tip')).toContainText('7 Attack Damage');
      await shot(page,`tooltip-${size.tag}`);
      await page.mouse.move(2,size.height-2);
    }
    // The recipe book: beside the inventory on wide screens, over it on tall ones.
    await page.locator('.bc-panel [data-book-toggle]').click();
    await expect(page.locator('.bc-book')).toBeVisible();
    await checkGeometry(page,size,true);
    await shot(page,`recipe-book-${size.tag}`);
    await page.locator('.bc-screen [data-book-toggle]:visible').first().click();
    await expect(page.locator('.bc-book')).toBeHidden();
    await page.mouse.move(2,size.height-2);
    await open('crafting_table','Crafting',at.table);
    await shot(page,`crafting-${size.tag}`);
    await open('furnace','Furnace',at.furnace);
    await expect(page.locator('.bc-flame')).toHaveClass(/is-lit/);
    await shot(page,`furnace-${size.tag}`);
    await open('chest','Chest',at.chest);
    expect(await page.locator('.bc-panel').evaluate(e=>Math.round(e.getBoundingClientRect().height/parseFloat(getComputedStyle(e).getPropertyValue('--bc-u'))))).toBe(168);
    await shot(page,`chest-${size.tag}`);
    await open('chest','Large Chest',at.big);
    expect(await page.locator('.bc-panel').evaluate(e=>Math.round(e.getBoundingClientRect().height/parseFloat(getComputedStyle(e).getPropertyValue('--bc-u'))))).toBe(222);
    await shot(page,`large-chest-${size.tag}`);
    await engine(page,g=>g.ui.close());
    await engine(page,g=>g.setMode('creative'));
    await engine(page,g=>g.ui.open('creative'));
    await expect(page.locator('.bc-panel')).toHaveClass(/bc-panel-creative/);
    await checkGeometry(page,size,size.tag==='1366');
    await shot(page,`creative-${size.tag}`);
    // The scrollbar knob follows the picker, which scrolls a row at a time.
    await page.locator('.bc-catalog').evaluate(e=>{e.scrollTop=e.scrollHeight;});
    await expect.poll(()=>page.locator('.bc-knob').evaluate(e=>Number(getComputedStyle(e).getPropertyValue('--k')))).toBe(97);
    await page.locator('.bc-catalog').evaluate(e=>{e.scrollTop=0;});
    await page.locator('.bc-tab[aria-label="Search Items"]').click();
    await shot(page,`creative-search-${size.tag}`);
    await page.locator('.bc-tab[aria-label="Survival Inventory"]').click();
    await shot(page,`creative-inventory-${size.tag}`);
    await engine(page,g=>g.ui.close());
    await engine(page,g=>g.ui.open('advancements'));
    await expect(page.locator('.bc-panel')).toHaveAttribute('aria-label','Advancements');
    await shot(page,`advancements-${size.tag}`);
    await engine(page,g=>g.ui.close());
    expect(errors).toEqual([]);
  });
}

test('a landscape phone fits every screen, the large chest included',async({page})=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  const size={width:844,height:390};
  await boot(page,size);
  await stock(page);
  const at=await stations(page);
  await page.mouse.move(2,size.height-2);
  await engine(page,g=>g.ui.open('inventory'));
  await checkGeometry(page,size,false);
  await shot(page,'inventory-844x390');
  await engine(page,(g,a)=>g.ui.open('chest',a),at.big);
  await expect(page.locator('.bc-panel')).toHaveAttribute('aria-label','Large Chest');
  await checkGeometry(page,size,false);
  await shot(page,'large-chest-844x390');
  await engine(page,g=>{g.ui.close();g.setMode('creative');g.ui.open('creative');});
  await checkGeometry(page,size,false);
  await engine(page,g=>g.ui.close());
  expect(errors).toEqual([]);
});

test.describe('touch',()=>{
  test.use({hasTouch:true});
  test('touch shows the quick-move toggle above the panel and the recipe book over it',async({page})=>{
    test.setTimeout(180000);
    const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
    const size={width:390,height:844};
    await boot(page,size);
    await stock(page);
    await engine(page,g=>g.ui.open('inventory'));
    await expect(page.locator('.bc-screen [data-quick]')).toBeVisible();
    await checkGeometry(page,size,true);
    const [quick,panel]=await Promise.all([page.locator('.bc-screen [data-quick]').boundingBox(),page.locator('.bc-panel').boundingBox()]);
    expect(quick!.y+quick!.height).toBeLessThanOrEqual(panel!.y);
    expect(quick!.width).toBeGreaterThanOrEqual(24);
    await shot(page,'inventory-touch-390');
    await page.locator('.bc-screen [data-book-toggle]').first().tap();
    await expect(page.locator('.bc-book')).toBeVisible();
    const book=(await page.locator('.bc-book').boundingBox())!;
    expect(Math.abs(book.x-panel!.x)).toBeLessThan(1);expect(Math.abs(book.width-panel!.width)).toBeLessThan(1);
    await shot(page,'recipe-book-touch-390');
    await page.locator('.bc-book [data-book-toggle]').tap();
    await expect(page.locator('.bc-book')).toBeHidden();
    await page.locator('.bc-screen [data-close]').tap();
    await expect(page.locator('.bc-screen')).toBeHidden();
    expect(errors).toEqual([]);
  });
});
