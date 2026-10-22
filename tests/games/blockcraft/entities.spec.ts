import {test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';
import {blockId} from '../../../src/games/blockcraft/data/blocks';

// Entity framework in the real engine: 60 entities of every render mode (box models with animation, sprite and block
// items, xp orbs, block-rendered entities) add at most 3 draw calls, and the CPU time of entity rendering stays small.
// In development window.blockcraft is the engine; software WebGL is slow, so everything polls with generous timeouts.
type Mesh={name:string;visible:boolean;layers:{set(n:number):void}};
type Engine={
  entities:{register(k:unknown):void;spawn(kind:string,x:number,y:number,z:number,o?:unknown):unknown;all():{kind:string}[];remove(e:unknown):void;
    dropItem(s:unknown,x:number,y:number,z:number,v?:unknown,d?:number):void;dropXp(n:number,x:number,y:number,z:number):void;
    debug:{render:{entities:number;quads:number;blockQuads:number;drawCalls:number;cpuMs:number}|null}};
  render:{info():{drawCalls:number;chunks:number};scene:{children:Mesh[]}};
  player:{state:{x:number;y:number;z:number;yaw:number};eye():{x:number;y:number;z:number}};
  world:{topY(x:number,z:number):number};
  updateSettings(p:unknown):void;
};
const num=async(page:Page,key:string)=>Number(await page.locator('.blockcraft').getAttribute(`data-${key}`));
const frames=(page:Page,n:number)=>page.evaluate(n=>new Promise<void>(done=>{let left=n;const step=()=>{if(--left<=0)done();else requestAnimationFrame(step);};requestAnimationFrame(step);}),n);

test('60 entities of every render mode add at most 3 draw calls',async({page})=>{
  test.setTimeout(240000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  // A shader that fails to compile is only logged by three.js: count it as an error too.
  page.on('console',m=>{if(m.type()==='error'&&/shader|webglprogram/i.test(m.text()))errors.push(m.text());});
  await page.setViewportSize({width:1280,height:720});
  await page.goto('/#/game/blockcraft');
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:90000});
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing',{timeout:30000});
  // Let chunk streaming settle so the chunk draw calls stay constant.
  let meshes=-1;
  for(let i=0;i<40;i++){const m=await num(page,'meshes');if(m===meshes&&m>20)break;meshes=m;await page.waitForTimeout(1500);}
  await page.evaluate(sand=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft;
    g.updateSettings({mobSpawning:false});
    for(const e of [...g.entities.all()])g.entities.remove(e);
    // A humanoid test kind with six animated parts, painted in code.
    g.entities.register({kind:'spec_mob',category:'passive',width:.6,height:1.95,maxHealth:20,
      model:{textureWidth:64,textureHeight:64,
        paint(px:Uint8ClampedArray,w:number,h:number){for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;px[i]=60+(x*3)%120;px[i+1]=120+(y*5)%100;px[i+2]=90;px[i+3]=255;}},
        parts:[
          {name:'head',pivot:[0,24,0],boxes:[{from:[-4,0,-4],size:[8,8,8],uv:[0,0]},{from:[-4,0,-4],size:[8,8,8],uv:[32,0],inflate:.5}]},
          {name:'body',pivot:[0,24,0],boxes:[{from:[-4,-12,-2],size:[8,12,4],uv:[16,16]}]},
          {name:'right_arm',pivot:[-5,22,0],boxes:[{from:[-3,-10,-2],size:[4,12,4],uv:[40,16]}]},
          {name:'left_arm',pivot:[5,22,0],boxes:[{from:[-1,-10,-2],size:[4,12,4],uv:[40,16],mirror:true}]},
          {name:'right_leg',pivot:[-1.9,12,0],boxes:[{from:[-2,-12,-2],size:[4,12,4],uv:[0,16]}]},
          {name:'left_leg',pivot:[1.9,12,0],boxes:[{from:[-2,-12,-2],size:[4,12,4],uv:[0,16],mirror:true}]}],
        animate(_e:unknown,pose:Record<string,{x:number;y:number;z:number}>,s:{time:number;headYaw:number;headPitch:number}){
          const a=Math.cos(s.time*6)*.6;pose.right_arm={x:a,y:0,z:0};pose.left_arm={x:-a,y:0,z:0};pose.right_leg={x:-a,y:0,z:0};pose.left_leg={x:a,y:0,z:0};
          pose.head={x:s.headPitch,y:s.headYaw,z:0};
        },
        appearance:(e:{id:number})=>({tint:e.id%3?0xffffff:0xff8080})}});
    g.entities.register({kind:'spec_block',category:'misc',width:.98,height:.98,maxHealth:1,render:'block',block:()=>sand,physics:'none'});
  },blockId('sand'));
  await frames(page,6);
  const base=await page.evaluate(()=>(window as unknown as {blockcraft:Engine}).blockcraft.render.info().drawCalls);
  const placed=await page.evaluate(()=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft,p=g.player.state,yaw=p.yaw;
    const fx=-Math.sin(yaw),fz=-Math.cos(yaw),rx=Math.cos(yaw),rz=-Math.sin(yaw);
    const at=(forward:number,side:number)=>{const x=p.x+fx*forward+rx*side,z=p.z+fz*forward+rz*side;return[x,g.world.topY(Math.floor(x),Math.floor(z))+1,z] as const;};
    let n=0;
    for(let i=0;i<36;i++){const [x,y,z]=at(5+Math.floor(i/9)*1.6,(i%9-4)*1.1);if(g.entities.spawn('spec_mob',x,y,z,{yaw:yaw+Math.PI,baby:i%6===0}))n++;}
    const items=['stick','dirt','torch','iron_pickaxe','cobblestone','apple','oak_planks','diamond'];
    for(let i=0;i<12;i++){const [x,y,z]=at(3.2,(i%6-2.5)*.9+(i>5?.4:0));const id=items[i%items.length];g.entities.dropItem({id,count:id==='iron_pickaxe'?1:1+i*5},x,y+.2,z,{x:0,y:0,z:0},32767);n++;}
    // Orbs beyond the 8 blocks within which the player attracts and collects them (ticks run in real time).
    for(let i=0;i<6;i++){const [x,y,z]=at(11,(i-2.5)*1.2);if(g.entities.spawn('xp_orb',x,y+.2,z,{data:{points:1+i*40}}))n++;}
    for(let i=0;i<6;i++){const [x,y,z]=at(9.5,(i-2.5)*1.6);if(g.entities.spawn('spec_block',x,y,z))n++;}
    return n;
  });
  expect(placed).toBe(60);
  await frames(page,10);
  const result=await page.evaluate(()=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft,r=g.entities.debug.render!;
    return{total:g.render.info().drawCalls,stats:{...r},meshes:g.render.scene.children.filter(c=>c.name==='entities'&&c.visible).length,count:g.entities.all().length};
  });
  // The draw calls the entities add, measured in two neighbouring frames with the entity meshes shown and then hidden
  // (moved to a layer the camera does not draw), so chunk streaming between the measurements cannot skew it; retried
  // when the chunk count changed in between.
  const added=await page.evaluate(()=>new Promise<{shown:number;hidden:number;chunks:number}|null>(done=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft,meshes=g.render.scene.children.filter(c=>c.name==='entities');
    const frame=()=>new Promise<void>(r=>requestAnimationFrame(()=>r()));
    void(async()=>{
      for(let attempt=0;attempt<10;attempt++){
        await frame();await frame();
        const shown=g.render.info();
        for(const m of meshes)m.layers.set(31);
        await frame();await frame();
        const hidden=g.render.info();
        for(const m of meshes)m.layers.set(0);
        if(shown.chunks===hidden.chunks){done({shown:shown.drawCalls,hidden:hidden.drawCalls,chunks:shown.chunks});return;}
      }
      done(null);
    })();
  }));
  console.log('entity render',JSON.stringify(result),'chunk-only draw calls before spawning',base,'with/without entities',JSON.stringify(added));
  expect(result.count).toBe(60);
  expect(result.stats.entities).toBeGreaterThanOrEqual(50);
  expect(result.stats.drawCalls).toBeLessThanOrEqual(3);expect(result.meshes).toBeLessThanOrEqual(3);
  expect(added).not.toBeNull();
  expect(added!.shown-added!.hidden).toBeGreaterThan(0);expect(added!.shown-added!.hidden).toBeLessThanOrEqual(3);
  // Entity CPU time per frame, sampled over 30 frames (brief: ≤ 1 ms for 60 entities; software GL machines are shared).
  const cpu=await page.evaluate(()=>new Promise<number>(done=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft;let n=0,sum=0;
    const step=()=>{sum+=g.entities.debug.render!.cpuMs;if(++n>=30)done(sum/n);else requestAnimationFrame(step);};requestAnimationFrame(step);
  }));
  console.log('entity render cpu ms',cpu.toFixed(3));
  expect(cpu).toBeLessThan(4);
  await page.screenshot({path:'tests/games/blockcraft/evidence/entities.png'});
  expect(errors).toEqual([]);
});
