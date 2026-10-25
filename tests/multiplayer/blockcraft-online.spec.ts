import {test,expect,type Page} from '@playwright/test';
import {BASE,closeAll,launchPlayer,type Player} from './peers';
import {blockId} from '../../src/games/blockcraft/data/blocks';

test.skip(({browserName})=>browserName!=='chromium','Online tests launch their own Chromium processes.');

// Three independent Chromium processes on the real PeerJS Cloud: a host, a guest and a late joiner. The dev build
// exposes each engine as window.blockcraft; real mouse input mines on the guest, and the page hooks only arrange
// fixtures (a flat site, items, aim) or read state.
type V={x:number;y:number;z:number};
const ids={stone:blockId('stone'),glass:blockId('glass'),dirt:blockId('dirt'),chest:blockId('chest_north'),air:0};
const ev=<T,A=undefined>(page:Page,fn:(bc:any,arg:A)=>T,arg?:A)=>page.evaluate(([f,a])=>new Function('bc','a',`return (${f})(bc,a)`)((window as any).blockcraft,a),[fn.toString(),arg] as const) as Promise<T>;
const get=(page:Page,p:V)=>ev(page,(bc,p:V)=>bc.world.get(p.x,p.y,p.z),p);
const t0=Date.now();
const step=(name:string)=>console.log(`[${((Date.now()-t0)/1000).toFixed(0)}s] ${name}`);
const data=(page:Page,key:string)=>page.locator('.blockcraft').getAttribute(`data-${key}`);

async function openBlockcraft(p:Player){
  await p.page.goto(`${BASE}/#/game/blockcraft`);
  await expect(p.page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:90000});
  // The nearest view distance keeps three software-rendered browsers on one machine responsive.
  await ev(p.page,bc=>bc.setViewDistance(0));
}
async function play(p:Player){
  const button=p.page.getByRole('button',{name:/^(Play|Resume)$/});
  await expect(button).toBeEnabled({timeout:90000});
  await button.click({timeout:20000});
  await expect(p.page.locator('.blockcraft')).toHaveAttribute('data-phase','playing',{timeout:20000});
}
async function join(p:Player,code:string){
  await p.page.goto(`${BASE}/#/game/blockcraft?room=${code}`);
  await expect(p.page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:90000});
  await ev(p.page,bc=>bc.setViewDistance(0));
  // The invite opens the online panel with the code filled in.
  await expect(p.page.getByLabel('Room code')).toHaveValue(code,{timeout:20000});
  await p.page.getByRole('button',{name:'Join by code'}).click({timeout:20000});
  await expect.poll(()=>ev(p.page,bc=>bc.net.role),{timeout:30000}).toBe('guest');
  await expect.poll(()=>data(p.page,'ready'),{timeout:90000}).toBe('true');
}

test('host, guest and a late joiner share one world',async()=>{
  test.setTimeout(900_000);
  const host=await launchPlayer('Hana'),guest=await launchPlayer('Tama'),late=await launchPlayer('Rua');
  const players=[host,guest,late];
  try{
    for(const p of players)await p.page.setViewportSize({width:1024,height:640});
    // A single-player world first: the host's own save must survive hosting.
    await openBlockcraft(host);
    await host.page.waitForTimeout(5500);// one shell autosave
    const soloSeed=await host.page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:blockcraft')!).data.seed);

    // ---- Host creates a room: the shared world is a separate world.
    step('Host creates a room: the shared world is a separate world.');
    const canvas=await host.page.locator('.blockcraft canvas').boundingBox();
    await host.page.getByRole('button',{name:'Multiplayer'}).click({timeout:20000});
    await expect(host.page.getByRole('dialog',{name:'Blockcraft multiplayer'})).toBeVisible();
    expect(await host.page.locator('.blockcraft canvas').boundingBox()).toEqual(canvas);
    await host.page.getByRole('button',{name:'Create room'}).click({timeout:20000});
    await expect(host.page.locator('.mp-room-code')).toHaveText(/^[A-Z2-9]{6}$/,{timeout:30000});
    const code=(await host.page.locator('.mp-room-code').textContent())!.trim();
    await expect.poll(()=>ev(host.page,bc=>bc.net.role)).toBe('host');
    await expect(host.page.locator('.blockcraft')).toHaveAttribute('data-ready','true',{timeout:90000});
    await host.page.getByRole('button',{name:'Close multiplayer menu'}).click({timeout:20000});
    const sharedSeed=await ev(host.page,bc=>bc.terrain.seed);
    expect(sharedSeed).not.toBe(soloSeed);
    await play(host);

    // Host changes: a flat stone site with a 4-block glass pillar and a chest holding 3 diamonds.
    const o:V=await ev(host.page,(bc,ids:any)=>{
      const p=bc.player.state,x=Math.floor(p.x),y=Math.floor(p.y),z=Math.floor(p.z);
      for(let dz=-4;dz<=4;dz++)for(let dx=-4;dx<=4;dx++){bc.world.set(x+dx,y-1,z+dz,ids.stone);for(let dy=0;dy<4;dy++)bc.world.set(x+dx,y+dy,z+dz,ids.air);}
      for(let dy=0;dy<4;dy++)bc.world.set(x+3,y+dy,z+3,ids.glass);
      bc.world.set(x-3,y,z+3,ids.chest);
      bc.blockEntities.get(x-3,y,z+3).items[0]={id:'diamond',count:3};
      bc.player.teleport(x+.5,y,z+.5);
      return{x,y,z};
    },ids);
    const at=(dx:number,dy:number,dz:number):V=>({x:o.x+dx,y:o.y+dy,z:o.z+dz});

    // ---- Guest joins: it sees the host's existing changes and contents before playing.
    step("Guest joins: it sees the host's existing changes and contents before playing.");
    await join(guest,code);
    await expect(guest.page.locator('.bc-waiting')).toBeHidden({timeout:30000});
    expect(await ev(guest.page,bc=>bc.terrain.seed)).toBe(sharedSeed);
    await expect.poll(()=>get(guest.page,at(3,3,3)),{timeout:30000}).toBe(ids.glass);
    expect(await get(guest.page,at(-3,0,3))).toBe(ids.chest);
    await expect(host.page.locator('.mp-players')).toContainText('Tama');
    await play(guest);
    // Each player is visible to the other as a character with a name tag.
    await ev(guest.page,(bc,p:V)=>bc.player.teleport(p.x+.5,p.y,p.z-1.5),o);
    await expect.poll(()=>ev(host.page,(bc,z:number)=>bc.entities.all().filter((e:any)=>e.kind==='player_avatar').map((e:any)=>[e.data.name,Math.abs(e.z-z)<.2]),o.z-1.5),{timeout:20000}).toEqual([['Tama',true]]);
    await expect(guest.page.locator('.bc-nametag')).toContainText('Hana',{timeout:20000});

    // ---- The guest mines with real input; the host rolls the drop, and the guest picks it up.
    step('The guest mines with real input; the host rolls the drop, and the guest picks it up.');
    const target=at(0,-1,-3);
    await ev(guest.page,(bc,a:{p:V;t:V})=>{
      bc.player.teleport(a.p.x+.5,a.p.y,a.p.z-1.5);
      const s=bc.player.state,e=bc.player.eye(),dx=a.t.x+.5-e.x,dy=a.t.y+1-e.y,dz=a.t.z+.5-e.z;
      s.yaw=Math.atan2(-dx,-dz);s.pitch=Math.atan2(dy,Math.hypot(dx,dz));
    },{p:o,t:target});
    await expect.poll(()=>data(guest.page,'target'),{timeout:20000}).toBe(`${target.x},${target.y},${target.z}`);
    const cobbleBefore=await ev(guest.page,bc=>bc.inventory.count('cobblestone'));
    await ev(guest.page,bc=>{const inv=bc.inventory;inv.setSlot(inv.selected,{id:'stone_pickaxe',count:1});});
    await guest.page.mouse.move(512,320);await guest.page.mouse.down();
    await expect.poll(()=>get(guest.page,target),{timeout:30000}).toBe(ids.air);
    await guest.page.mouse.up();
    await expect.poll(()=>get(host.page,target),{timeout:15000}).toBe(ids.air);
    // The drop fell into the hole: step over it.
    await ev(guest.page,(bc,t:V)=>bc.player.teleport(t.x+.5,t.y+1,t.z+.5),target);
    await expect.poll(()=>ev(guest.page,bc=>bc.inventory.count('cobblestone')),{timeout:30000}).toBeGreaterThan(cobbleBefore);

    // ---- Simultaneous edits of one cell: the host's arrives first, the guest's is refused and put back.
    step("Simultaneous edits of one cell: the host's arrives first, the guest's is refused and put back.");
    const cell=at(1,0,-1);
    await Promise.all([ev(host.page,(bc,a:any)=>bc.world.set(a.c.x,a.c.y,a.c.z,a.id),{c:cell,id:ids.glass}),ev(guest.page,(bc,a:any)=>bc.world.set(a.c.x,a.c.y,a.c.z,a.id),{c:cell,id:ids.dirt})]);
    await expect.poll(async()=>[await get(host.page,cell),await get(guest.page,cell)],{timeout:15000}).toEqual([ids.glass,ids.glass]);

    // ---- An invalid action (far out of reach) is refused by the host and undone on the guest.
    step('An invalid action (far out of reach) is refused by the host and undone on the guest.');
    const far=at(-20,0,0);
    const before=await get(host.page,far);
    await ev(guest.page,(bc,a:any)=>bc.world.set(a.c.x,a.c.y,a.c.z,a.id),{c:far,id:before===ids.glass?ids.dirt:ids.glass});
    await expect.poll(()=>get(guest.page,far),{timeout:15000}).toBe(before);
    expect(await get(host.page,far)).toBe(before);

    // ---- Chest contents come from the host; taking them empties the host's chest.
    step("Chest contents come from the host; taking them empties the host's chest.");
    const chest=at(-3,0,3);
    await ev(guest.page,(bc,c:V)=>bc.ui.open('chest',c),chest);
    await expect.poll(()=>ev(guest.page,(bc,c:V)=>bc.blockEntities.get(c.x,c.y,c.z).items[0],chest),{timeout:15000}).toEqual({id:'diamond',count:3});
    // A normal click picks the stack up to the cursor; Shift-click is the UI quick-move into inventory.
    await guest.page.getByRole('button',{name:/^Chest slot 1:/}).click({modifiers:['Shift']});
    await expect.poll(()=>ev(guest.page,bc=>bc.inventory.count('diamond'))).toBe(3);
    await expect.poll(()=>ev(host.page,(bc,c:V)=>bc.blockEntities.get(c.x,c.y,c.z).items[0],chest),{timeout:30000}).toBeNull();
    // The host cannot open it while the guest has it open.
    await ev(host.page,(bc,c:V)=>bc.ui.open('chest',c),chest);
    expect(await ev(host.page,bc=>bc.ui.screen)).toBeNull();
    expect(await data(host.page,'phase')).toBe('playing');
    await ev(guest.page,bc=>bc.ui.close());
    // Closing a screen re-captures the mouse, which needs a click outside a test.
    if(await data(guest.page,'phase')!=='playing')await play(guest);

    // ---- Mobs are the host's: a cow the host spawns appears on the guest.
    step("Mobs are the host's: a cow the host spawns appears on the guest.");
    await ev(host.page,(bc,p:V)=>bc.entities.spawn('cow',p.x+2.5,p.y,p.z-2.5,{reason:'event'}),o);
    await expect.poll(()=>ev(guest.page,bc=>bc.entities.all().filter((e:any)=>e.kind==='cow').length),{timeout:20000}).toBeGreaterThan(0);

    // ---- Damage is the host's: an explosion beside the guest hurts the guest.
    step("Damage is the host's: an explosion beside the guest hurts the guest.");
    await ev(host.page,bc=>bc.updateSettings({mode:'survival',difficulty:'normal'}));
    await expect.poll(()=>ev(guest.page,bc=>bc.settings.difficulty)).toBe('normal');
    const healthBefore=await ev(guest.page,bc=>bc.survival.health);
    const gp:V=await ev(guest.page,bc=>({x:bc.player.state.x,y:bc.player.state.y,z:bc.player.state.z}));
    await expect.poll(async()=>{const v:any=await ev(host.page,bc=>bc.net.players().find((p:any)=>!p.local));return v?Math.round(v.z*10):null;},{timeout:10000}).toBe(Math.round(gp.z*10));
    await ev(host.page,(bc,p:V)=>bc.ticks.explode(p.x+1.5,p.y+.5,p.z,1.5),gp);
    await expect.poll(()=>ev(guest.page,bc=>bc.survival.health),{timeout:15000}).toBeLessThan(healthBefore);

    // ---- A late joiner sees everything changed so far, including the guest's mining.
    step("A late joiner sees everything changed so far, including the guest's mining.");
    await join(late,code);
    await expect.poll(()=>get(late.page,target),{timeout:30000}).toBe(ids.air);
    expect(await get(late.page,cell)).toBe(ids.glass);
    expect(await get(late.page,at(3,0,3))).toBe(ids.glass);
    await expect.poll(()=>ev(late.page,(bc,c:V)=>bc.world.get(c.x,c.y,c.z),chest)).toBe(ids.chest);
    expect(await ev(late.page,bc=>bc.time.day)).toBe(await ev(host.page,bc=>bc.time.day));
    await expect(late.page.locator('.bc-nametag')).toHaveCount(2,{timeout:20000});

    // ---- Host pause (Escape opens Study Mode) pauses the room: guests wait, their edits are refused, resume resynchronises.
    step('Host pause pauses the room: guests wait, their edits are refused, resume resynchronises.');
    await host.page.keyboard.press('Escape');await expect(host.page.locator('#study-view')).toBeVisible();
    await expect(guest.page.locator('.bc-waiting')).toBeVisible({timeout:10000});
    await expect(guest.page.locator('.bc-waiting')).toContainText('Waiting for host');
    expect(await data(guest.page,'phase')).not.toBe('playing');
    const pausedCell=at(-1,0,-1);
    await ev(guest.page,(bc,c:V)=>bc.world.set(c.x,c.y,c.z,4),pausedCell);
    await expect.poll(()=>get(guest.page,pausedCell),{timeout:15000}).toBe(ids.air);
    await host.page.getByRole('link',{name:'Games',exact:true}).click({timeout:20000});await expect(host.page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');
    await expect(guest.page.locator('.bc-waiting')).toBeHidden({timeout:15000});
    await guest.page.screenshot({path:test.info().outputPath('guest-after-resume.png')});
    await play(guest);

    // ---- The shared world is saved on the host apart from the single-player save.
    step('The shared world is saved on the host apart from the single-player save.');
    await host.page.keyboard.press('Escape');await expect(host.page.locator('#study-view')).toBeVisible();
    const saves=await host.page.evaluate(()=>({solo:JSON.parse(localStorage.getItem('pocket-arcade:v1:save:blockcraft')!).data.seed,shared:JSON.parse(localStorage.getItem('pocket-arcade:v1:mp:blockcraft:world')!).world.seed}));
    expect(saves).toEqual({solo:soloSeed,shared:sharedSeed});
    await host.page.getByRole('link',{name:'Games',exact:true}).click({timeout:20000});await expect(host.page.locator('.blockcraft')).toHaveAttribute('data-phase','playing');

    // ---- The host leaving ends the session cleanly; each guest is back in its own single-player world.
    step('The host leaving ends the session cleanly; each guest is back in its own single-player world.');
    await host.page.goto(`${BASE}/#/`);
    for(const p of [guest,late]){
      await expect(p.page.locator('#game-status')).toHaveText(/host ended the online game|Lost the connection/,{timeout:30000});
      await expect.poll(()=>ev(p.page,bc=>bc.net.role)).toBe('offline');
      expect(await ev(p.page,bc=>bc.terrain.seed)).not.toBe(sharedSeed);
    }
  }finally{await closeAll(players);}
});
