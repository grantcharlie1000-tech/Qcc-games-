import {test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';
import {biomeId} from '../../../src/games/blockcraft/data/biomes';

// Weather in the real renderer: rain and lightning stay within the precipitation draw-call budget, the HUD dataset
// follows the state, and nothing throws. Screenshots go to test-results for a visual check.
const data=(page:Page,key:string)=>page.locator('.blockcraft').getAttribute(`data-${key}`);
async function ready(page:Page){await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:60000});}
interface Debug{weather:{set(s:string,t?:number):void;strike(x:number,y:number,z:number):void;intensity:number;flash:number;bolts:unknown[]};
  render:{scene:{children:{name:string;visible:boolean;geometry?:{instanceCount?:number;attributes:Record<string,{data?:{array:Float32Array;stride:number}}>}}[]}};
  player:{state:{x:number;y:number;z:number};teleport(x:number,y:number,z:number):void};
  world:{topY(x:number,z:number):number;chunks:Map<number,{biomes:Uint8Array}>}}
const engine='(window as unknown as {blockcraft:Debug}).blockcraft';

test('rain and lightning render within budget',async({page},info)=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  // A shader that fails to compile is only logged by three.js: count it as an error too.
  page.on('console',m=>{if(m.type()==='error'&&/shader|webglprogram/i.test(m.text()))errors.push(m.text());});
  await page.setViewportSize({width:960,height:540});
  await page.goto('/#/game/blockcraft');await ready(page);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  // The world spawn may sit in a dry biome (deserts and savannas get no rain, as in vanilla), so every loaded column is
  // made plains first; nudging the camera rebuilds the precipitation field.
  await page.evaluate(plains=>{
    const g=(window as unknown as {blockcraft:Debug}).blockcraft,p=g.player.state;
    for(const c of g.world.chunks.values())c.biomes.fill(plains);
    g.weather.set('thunder',100000);g.player.teleport(p.x,p.y+1,p.z);
  },biomeId('plains'));
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-weather','thunder');
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {blockcraft:Debug}).blockcraft.weather.intensity),{timeout:60000}).toBeGreaterThan(.9);
  const drops=await page.evaluate(()=>{
    const s=(window as unknown as {blockcraft:Debug}).blockcraft.render.scene.children.find(c=>c.name==='weather-precipitation');
    return s?{visible:s.visible,count:s.geometry?.instanceCount??0}:null;
  });
  expect(drops?.visible).toBe(true);expect(drops!.count).toBeGreaterThan(300);expect(drops!.count).toBeLessThanOrEqual(1756);
  await page.screenshot({path:info.outputPath('rain.png')});
  // A strike a few blocks in front of the player.
  await page.evaluate(()=>{
    const g=(window as unknown as {blockcraft:Debug}).blockcraft,p=g.player.state,x=Math.floor(p.x),z=Math.floor(p.z)-12;
    g.weather.strike(x,g.world.topY(x,z)+1,z);
  });
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {blockcraft:Debug}).blockcraft.weather.bolts.length),{timeout:20000}).toBeGreaterThan(0);
  await page.screenshot({path:info.outputPath('bolt.png')});
  const visible=await page.evaluate(()=>(window as unknown as {blockcraft:Debug}).blockcraft.render.scene.children.filter(c=>c.name.startsWith('weather-')&&c.visible).length);
  expect(visible).toBeLessThanOrEqual(2);
  expect(await data(page,'weather')).toBe('thunder');
  expect(errors).toEqual([]);
  void engine;
});

test('snow falls as flakes in cold biomes',async({page},info)=>{
  test.setTimeout(180000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  // A shader that fails to compile is only logged by three.js: count it as an error too.
  page.on('console',m=>{if(m.type()==='error'&&/shader|webglprogram/i.test(m.text()))errors.push(m.text());});
  await page.setViewportSize({width:960,height:540});
  await page.goto('/#/game/blockcraft');await ready(page);
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  // Turn every loaded column snowy, then nudge the camera so the precipitation field is rebuilt.
  await page.evaluate(snowy=>{
    const g=(window as unknown as {blockcraft:Debug}).blockcraft,p=g.player.state;
    for(const c of g.world.chunks.values())c.biomes.fill(snowy);
    g.weather.set('rain',100000);g.player.teleport(p.x,p.y+1,p.z);
  },biomeId('snowy_plains'));
  await expect.poll(()=>page.evaluate(()=>(window as unknown as {blockcraft:Debug}).blockcraft.weather.intensity),{timeout:60000}).toBeGreaterThan(.9);
  const kinds=await page.evaluate(()=>{
    const s=(window as unknown as {blockcraft:Debug}).blockcraft.render.scene.children.find(c=>c.name==='weather-precipitation')!;
    const data=s.geometry!.attributes.iPos.data!,count=s.geometry!.instanceCount??0,seen:Record<string,number>={};
    for(let i=0;i<count;i++){const k=String(data.array[i*data.stride+3]);seen[k]=(seen[k]??0)+1;}
    return{visible:s.visible,count,seen};
  });
  expect(kinds.visible).toBe(true);expect(kinds.count).toBeGreaterThan(300);
  // Only snowflakes (kind 1): no rain streaks or splashes.
  expect(Object.keys(kinds.seen)).toEqual(['1']);
  await page.screenshot({path:info.outputPath('snow.png')});
  expect(errors).toEqual([]);
});
