import {test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';
import {blockDef,blockId} from '../../../src/games/blockcraft/data/blocks';
import {countLockErrors,evidencePath,lockless,useLockFallback} from './helpers/browser';

// Interaction flows in the running game (survival): mining with drops, placing, a door placed and opened, a bucket
// picking up and pouring water, and a crafting table opened by right click. The dev build exposes the engine as
// window.blockcraft; the test builds a flat site around the player and aims by setting the view directly.
const data=(page:Page,key:string)=>page.locator('.blockcraft').getAttribute(`data-${key}`);
const num=async(page:Page,key:string)=>Number(await data(page,key));
type V={x:number;y:number;z:number};
interface Engine{world:{get(x:number,y:number,z:number):number;set(x:number,y:number,z:number,id:number,cause?:string):boolean};
  player:{state:V&{yaw:number;pitch:number};eye():V;teleport(x:number,y:number,z:number):void};
  inventory:{held():{id:string;count:number}|null;selected:number;setSlot(i:number,s:{id:string;count:number}|null):void;count(id:string):number};
  entities:{all():{kind:string;data:Record<string,unknown>}[]}}
declare global{interface Window{blockcraft?:Engine}}

const get=(page:Page,p:V)=>page.evaluate(p=>window.blockcraft!.world.get(p.x,p.y,p.z),p);
const aim=(page:Page,p:V)=>page.evaluate(p=>{
  const bc=window.blockcraft!,s=bc.player.state,e=bc.player.eye(),dx=p.x-e.x,dy=p.y-e.y,dz=p.z-e.z;
  s.yaw=Math.atan2(-dx,-dz);s.pitch=Math.atan2(dy,Math.hypot(dx,dz));
},p);
const hold=(page:Page,id:string,count=1)=>page.evaluate(([id,count])=>{const inv=window.blockcraft!.inventory;inv.setSlot(inv.selected,{id:id as string,count:count as number});},[id,count] as const);
async function rightClick(page:Page){await page.mouse.down({button:'right'});await page.waitForTimeout(120);await page.mouse.up({button:'right'});}
async function targetIs(page:Page,p:V){await expect.poll(()=>data(page,'target'),{timeout:20000}).toBe(`${p.x},${p.y},${p.z}`);}

test('mine, place, open a door, use a bucket and open a crafting table',async({page,browserName})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1024,height:640});
  await countLockErrors(page);
  await page.goto('/#/game/blockcraft');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:60000});
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  // Headless WebKit never grants pointer lock: there the presses below go through the hold-to-mine / click fallback.
  if(lockless(browserName))await useLockFallback(page,512,320);
  else await expect(page.locator('.blockcraft')).toHaveAttribute('data-locked','true');

  // A flat stone site 7×7 around the player with clear air above.
  const ids={stone:blockId('stone'),dirt:blockId('dirt'),water:blockId('water'),air:0,grass:blockId('grass_block')};
  const o=await page.evaluate(ids=>{
    const bc=window.blockcraft!,p=bc.player.state,fx=Math.floor(p.x),fy=Math.floor(p.y),fz=Math.floor(p.z);
    for(let dz=-3;dz<=3;dz++)for(let dx=-3;dx<=3;dx++){
      bc.world.set(fx+dx,fy-1,fz+dz,ids.stone);
      for(let dy=0;dy<4;dy++)bc.world.set(fx+dx,fy+dy,fz+dz,ids.air);
    }
    bc.player.teleport(fx+.5,fy,fz+.5);
    return{x:fx,y:fy,z:fz};
  },ids);
  const at=(dx:number,dy:number,dz:number):V=>({x:o.x+dx,y:o.y+dy,z:o.z+dz});

  // 1. Survival mining: dirt takes 0.75 s by hand, then drops itself.
  const dirt=at(0,-1,-2),dirtBefore=await page.evaluate(()=>window.blockcraft!.inventory.count('dirt'));
  await page.evaluate(([p,id])=>window.blockcraft!.world.set(p.x,p.y,p.z,id),[dirt,ids.dirt] as const);
  await aim(page,{x:dirt.x+.5,y:dirt.y+1,z:dirt.z+.5});await targetIs(page,dirt);
  await page.mouse.down();
  await page.waitForTimeout(150);expect(await get(page,dirt)).toBe(ids.dirt);
  await expect.poll(()=>get(page,dirt),{timeout:30000}).toBe(ids.air);
  await page.mouse.up();
  expect(await num(page,'mined')).toBe(1);
  await expect.poll(()=>page.evaluate(before=>{
    const bc=window.blockcraft!;
    return bc.inventory.count('dirt')>before||bc.entities.all().some(e=>e.kind==='item'&&(e.data.stack as {id:string}).id==='dirt');
  },dirtBefore),{timeout:20000}).toBe(true);

  // 2. Placing: a grass block on the stone floor.
  await page.evaluate(([p,id])=>window.blockcraft!.world.set(p.x,p.y,p.z,id),[dirt,ids.stone] as const);
  await hold(page,'grass_block',8);
  await aim(page,{x:dirt.x+.5,y:dirt.y+1,z:dirt.z+.5});await targetIs(page,dirt);
  await rightClick(page);
  await expect.poll(()=>get(page,at(0,0,-2)),{timeout:20000}).toBe(ids.grass);
  expect(await num(page,'placed')).toBe(1);
  expect(await page.evaluate(()=>window.blockcraft!.inventory.held()!.count)).toBe(7);

  // 3. A door to the east: both halves face the player (west); right click opens both.
  const floorE=at(2,-1,0);
  await hold(page,'oak_door');await aim(page,{x:floorE.x+.5,y:floorE.y+1,z:floorE.z+.5});await targetIs(page,floorE);
  await rightClick(page);
  await expect.poll(async()=>blockDef(await get(page,at(2,0,0))).name,{timeout:20000}).toBe('oak_door_lower_closed_west');
  expect(blockDef(await get(page,at(2,1,0))).name).toBe('oak_door_upper_closed_west');
  // Closed and facing west, the panel lies on the east edge of the cell.
  await aim(page,{x:o.x+3-.25,y:o.y+.5,z:o.z+.5});await targetIs(page,at(2,0,0));
  await rightClick(page);
  await expect.poll(async()=>blockDef(await get(page,at(2,0,0))).name,{timeout:20000}).toBe('oak_door_lower_open_west');
  expect(blockDef(await get(page,at(2,1,0))).name).toBe('oak_door_upper_open_west');

  // 4. A bucket to the west: pick up a water source, then pour it on the floor.
  const pool=at(-2,-1,0);
  await page.evaluate(([p,id])=>window.blockcraft!.world.set(p.x,p.y,p.z,id),[pool,ids.water] as const);
  await hold(page,'bucket');await aim(page,{x:pool.x+.5,y:pool.y+1-.01,z:pool.z+.5});
  await rightClick(page);
  await expect.poll(()=>page.evaluate(()=>window.blockcraft!.inventory.held()?.id),{timeout:20000}).toBe('water_bucket');
  expect(await get(page,pool)).toBe(ids.air);
  const floorW=at(-2,-1,1);
  await aim(page,{x:floorW.x+.5,y:floorW.y+1,z:floorW.z+.5});await targetIs(page,floorW);
  await rightClick(page);
  await expect.poll(()=>get(page,at(-2,0,1)),{timeout:20000}).toBe(ids.water);
  // (The empty bucket left behind is the inventory's consumeHeld remainder, covered by unit tests.)

  // 5. A crafting table to the south opens its screen on right click; E closes it.
  const floorS=at(0,-1,2);
  await hold(page,'crafting_table');await aim(page,{x:floorS.x+.5,y:floorS.y+1,z:floorS.z+.5});await targetIs(page,floorS);
  await rightClick(page);
  await expect.poll(async()=>blockDef(await get(page,at(0,0,2))).name,{timeout:20000}).toBe('crafting_table');
  await aim(page,{x:o.x+.5,y:o.y+.5,z:o.z+2});await targetIs(page,at(0,0,2));
  await page.waitForTimeout(300);// the right-click repeat delay
  await rightClick(page);
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','screen',{timeout:20000});
  await page.keyboard.press('KeyE');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  await page.screenshot({path:evidencePath('interaction.png')});
  expect(errors).toEqual([]);
});
