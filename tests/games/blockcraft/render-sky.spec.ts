import {inflateSync} from 'node:zlib';
import {test,expect} from '../../fixtures';
import type {Page} from '../../fixtures';

// Renderer and sky in a real browser: screenshots at noon, dusk, midnight and underwater (saved as evidence), sky and fog
// colours sampled from the screenshots, the hand, overlays and the draw-call budget.
const data=(page:Page,key:string)=>page.locator('.blockcraft').getAttribute(`data-${key}`);
async function ready(page:Page){await expect(page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:60000});}
type Engine={[k:string]:any};
const EVIDENCE='tests/games/blockcraft/evidence';

/** Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) for screenshot pixels. */
function decodePng(buf:Buffer){
  let o=8,width=0,height=0,channels=4;const idat:Buffer[]=[];
  while(o<buf.length){
    const len=buf.readUInt32BE(o),type=buf.toString('ascii',o+4,o+8),body=buf.subarray(o+8,o+8+len);
    if(type==='IHDR'){width=body.readUInt32BE(0);height=body.readUInt32BE(4);channels=body[9]===6?4:3;}
    else if(type==='IDAT')idat.push(body);
    o+=12+len;
  }
  const raw=inflateSync(Buffer.concat(idat)),stride=width*channels,out=new Uint8Array(width*height*4);let prev=new Uint8Array(stride);
  for(let y=0;y<height;y++){
    const f=raw[y*(stride+1)],line=raw.subarray(y*(stride+1)+1,(y+1)*(stride+1)),cur=new Uint8Array(stride);
    for(let i=0;i<stride;i++){
      const a=i>=channels?cur[i-channels]:0,b=prev[i],c=i>=channels?prev[i-channels]:0;
      const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);
      cur[i]=(line[i]+(f===1?a:f===2?b:f===3?(a+b)>>1:f===4?(pa<=pb&&pa<=pc?a:pb<=pc?b:c):0))&255;
    }
    for(let x=0;x<width;x++)for(let k=0;k<4;k++)out[(y*width+x)*4+k]=k<channels?cur[x*channels+k]:255;
    prev=cur;
  }
  return{width,height,pixel:(x:number,y:number)=>{const i=(Math.floor(y)*width+Math.floor(x))*4;return[out[i],out[i+1],out[i+2]];}};
}
/** Average colour of a screen region given in fractions of the canvas. */
function region(png:ReturnType<typeof decodePng>,x0:number,y0:number,x1:number,y1:number){
  let r=0,g=0,b=0,n=0;
  for(let y=Math.floor(y0*png.height);y<y1*png.height;y+=2)for(let x=Math.floor(x0*png.width);x<x1*png.width;x+=2){const p=png.pixel(x,y);r+=p[0];g+=p[1];b+=p[2];n++;}
  return[r/n,g/n,b/n];
}
async function settle(page:Page,frames=6){
  // Wait for a few rendered frames (software WebGL is slow).
  await page.evaluate(n=>new Promise<void>(done=>{let k=0;const step=()=>{if(++k>=n)done();else requestAnimationFrame(step);};requestAnimationFrame(step);}),frames);
}
/** Canvas screenshot: the four sky views are kept as evidence, the others go to the test output folder. */
async function shot(page:Page,name:string){
  const canvas=page.locator('.blockcraft canvas'),keep=['noon','dusk','midnight','underwater'].includes(name);
  const buf=await canvas.screenshot({path:keep?`${EVIDENCE}/render-${name}.png`:test.info().outputPath(`render-${name}.png`)});
  return decodePng(buf);
}

test('sky, fog, hand and overlays at noon, dusk, midnight and underwater',async({page})=>{
  test.setTimeout(300000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewportSize({width:960,height:600});
  await page.goto('/#/game/blockcraft');await ready(page);
  await page.getByRole('button',{name:'Game mode'}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  // Freeze the clock, clear weather, hover a little above the ground in creative flight.
  await page.evaluate(()=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft;
    g.updateSettings({daylightCycle:false,weatherCycle:false});
    const p=g.player.state;p.flying=true;g.player.teleport(p.x,Math.max(p.y,g.world.topY(Math.floor(p.x),Math.floor(p.z))+1)+18,p.z);
  });
  const setView=(dayTime:number,yaw:number,pitch:number)=>page.evaluate(([t,y,p])=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft;g.skipTime(t);g.player.state.yaw=y;g.player.state.pitch=p;
  },[dayTime,yaw,pitch]);

  // Noon, looking north and a little up: a blue sky fading to a paler horizon.
  await setView(6000,0,.35);await settle(page,10);
  const noon=await shot(page,'noon');
  const zenith=region(noon,.3,.02,.7,.12);
  expect(zenith[2]).toBeGreaterThan(200);expect(zenith[2]).toBeGreaterThan(zenith[0]+40);

  // Dusk, looking west at the setting sun: an orange-red glow near the horizon.
  await setView(12100,Math.PI/2,.05);await settle(page,10);
  const dusk=await shot(page,'dusk');
  const glow=region(dusk,.35,.3,.65,.45);
  expect(glow[0]).toBeGreaterThan(glow[2]+20);

  // Midnight, looking up: a near-black sky.
  await page.evaluate(()=>{const g=(window as unknown as {blockcraft:Engine}).blockcraft;g.inventory.setSlot(0,{id:'diamond_sword',count:1});});
  await setView(18000,.6,1.1);await settle(page,10);
  const midnight=await shot(page,'midnight');
  const dark=region(midnight,.3,.02,.7,.2);
  expect(Math.max(...dark)).toBeLessThan(60);

  // Underwater: water around the eye gives a short, blue fog.
  await page.evaluate(async()=>{
    const url='/src/games/blockcraft/data/blocks.ts',{blockId}=await import(/* @vite-ignore */url);
    const g=(window as unknown as {blockcraft:Engine}).blockcraft,p=g.player.state,e=g.player.eye(),water=blockId('water');
    g.skipTime(6000);p.yaw=0;p.pitch=0;
    for(let dx=-3;dx<=3;dx++)for(let dz=-3;dz<=3;dz++)for(let dy=-2;dy<=2;dy++)g.world.set(Math.floor(e.x)+dx,Math.floor(e.y)+dy,Math.floor(e.z)+dz,water);
  });
  await settle(page,10);
  const under=await shot(page,'underwater');
  const middle=region(under,.3,.3,.7,.6);
  expect(middle[2]).toBeGreaterThan(middle[0]+30);

  // In lava: everything beyond a block is the orange lava fog.
  await page.evaluate(async()=>{
    const url='/src/games/blockcraft/data/blocks.ts',{blockId}=await import(/* @vite-ignore */url);
    const g=(window as unknown as {blockcraft:Engine}).blockcraft,e=g.player.eye(),lava=blockId('lava');
    for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)for(let dy=-1;dy<=1;dy++)g.world.set(Math.floor(e.x)+dx,Math.floor(e.y)+dy,Math.floor(e.z)+dz,lava);
  });
  await settle(page,10);
  const lava=region(await shot(page,'lava'),.3,.3,.7,.6);
  expect(lava[0]).toBeGreaterThan(lava[2]+80);expect(lava[0]).toBeGreaterThan(lava[1]+40);
  expect(errors).toEqual([]);
});

test('first-person hand, held items, selection, breaking crack, screen overlays, particles and the draw-call budget',async({page})=>{
  test.setTimeout(300000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewportSize({width:960,height:600});
  await page.goto('/#/game/blockcraft');await ready(page);
  await page.getByRole('button',{name:'Game mode'}).click();
  await page.getByRole('button',{name:'Play',exact:true}).click();
  await expect(page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
  await page.evaluate(()=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft;
    g.updateSettings({daylightCycle:false,weatherCycle:false});g.skipTime(6000);
    g.inventory.setSlot(g.inventory.selected,null);g.player.state.yaw=.4;g.player.state.pitch=-.5;
  });
  await settle(page,12);
  // The bare arm: the lower right of the screen changes when the hand is hidden (F1).
  const arm=await shot(page,'hand-arm');
  await page.evaluate(()=>{(document.querySelector('.blockcraft') as HTMLElement).dataset.hudHidden='true';});await settle(page,4);
  const hidden=decodePng(await page.locator('.blockcraft canvas').screenshot());
  await page.evaluate(()=>{(document.querySelector('.blockcraft') as HTMLElement).dataset.hudHidden='';});
  const a=region(arm,.72,.7,.95,.98),h=region(hidden,.72,.7,.95,.98);
  expect(Math.abs(a[0]-h[0])+Math.abs(a[1]-h[1])+Math.abs(a[2]-h[2])).toBeGreaterThan(20);

  // A sword in the main hand and a shield in the offhand, after the equip animation.
  await page.evaluate(()=>{const g=(window as unknown as {blockcraft:Engine}).blockcraft;
    g.inventory.setSlot(g.inventory.selected,{id:'diamond_sword',count:1});g.inventory.setOffhand({id:'shield',count:1});});
  await expect.poll(()=>page.evaluate(()=>{const g=(window as unknown as {blockcraft:Engine}).blockcraft;return g.render.scene.getObjectByName('hand').geometry.drawRange.count;}),{timeout:20000}).toBeGreaterThan(36);
  await page.waitForTimeout(1500);await settle(page,4);
  await shot(page,'hand-items');

  // Selection outline and crack on the targeted block, flames on screen, debris, smoke and an explosion.
  const target=await page.evaluate(()=>{const g=(window as unknown as {blockcraft:Engine}).blockcraft;return g.interaction.target;});
  await page.evaluate(t=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft,p=g.player.state,e=g.player.eye(),r=g.render;
    const at=t??{x:Math.floor(e.x),y:Math.floor(p.y)-1,z:Math.floor(e.z)-2};
    r.setSelection({minX:at.x,minY:at.y,minZ:at.z,maxX:at.x+1,maxY:at.y+1,maxZ:at.z+1});r.setBreaking(at,6);
    // Keep them while the (stub) interaction would clear them every frame.
    const keep={selection:r.setSelection,breaking:r.setBreaking};(window as unknown as {keep:unknown}).keep=keep;
    r.setSelection=()=>{};r.setBreaking=()=>{};
  },target);
  await settle(page,4);
  await shot(page,'crack');
  await page.evaluate(t=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft,p=g.player.state,e=g.player.eye(),r=g.render;
    const at=t??{id:1};
    r.setOverlay('fire',1);
    const fx=e.x-Math.sin(p.yaw)*2.5,fz=e.z-Math.cos(p.yaw)*2.5;
    for(const kind of ['block','smoke','flame','heart','crit','happy','note','spell'])r.spawnParticles(kind,fx,e.y-.6,fz,{block:at.id??1,count:6,spread:.7});
    r.spawnParticles('explosion',fx-3,e.y+1,fz-3,{count:2,spread:.5});
  },target);
  await settle(page,3);
  await shot(page,'overlays');
  const budget=await page.evaluate(()=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft,r=g.render,groups=r.scene.children.filter((c:Engine)=>c.isGroup);
    for(const c of groups)c.visible=false;
    r.render();const calls=r.info().drawCalls;
    for(const c of groups)c.visible=true;
    const shown=['sky','clouds','particles','hand','block-overlay','screen-overlay'].filter(n=>r.scene.getObjectByName(n)?.visible);
    return{calls,shown};
  });
  // Sky, clouds, particles, hand, block overlay and screen overlay all active: six draw calls at most.
  expect(budget.shown.length).toBe(6);expect(budget.calls).toBeLessThanOrEqual(6);
  await page.evaluate(()=>{
    const g=(window as unknown as {blockcraft:Engine}).blockcraft,r=g.render,keep=(window as unknown as {keep:Engine}).keep;
    r.setSelection=keep.selection;r.setBreaking=keep.breaking;r.setOverlay(null);r.setBreaking(null,0);r.setSelection(null);
  });
  expect(Number(await data(page,'scale'))).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});
