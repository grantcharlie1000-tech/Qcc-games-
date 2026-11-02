import {test,expect,type Page} from '@playwright/test';
import {BASE,closeAll,launchPlayer,type Player} from './peers';
test.skip(({browserName})=>browserName!=='chromium','Independent Chromium processes exercise actual WebRTC.');
const ev=<T>(p:Page,fn:(g:any,arg:any)=>T,arg?:unknown)=>p.evaluate(([f,a])=>new Function('g','a',`return (${f})(g,a)`)((window as any).__game,a),[fn.toString(),arg] as const) as Promise<T>;
async function beginAction(host:Player,guest:Player){
 await expect.poll(()=>ev(guest.page,g=>g.state.phase),{timeout:20000}).toBe('pick');
 expect(await ev(host.page,g=>g.net.session.requestPick({locked:true}))).toBe(true);
 expect(await ev(guest.page,g=>g.net.session.requestPick({locked:true}))).toBe(true);
 await expect.poll(()=>ev(host.page,g=>g.state.phase),{timeout:20000}).toBe('prep');await expect.poll(()=>ev(guest.page,g=>g.state.phase),{timeout:20000}).toBe('prep');
 // Normal clocks are unit-tested; this DEV fixture keeps the real network/input path while skipping Prep's wait.
 await ev(host.page,g=>g.state.timer=.01);await expect.poll(()=>ev(guest.page,g=>g.state.phase),{timeout:20000}).toBe('action');
}
async function equalWalls(host:Player,guest:Player){
 await expect.poll(async()=>{const hash=await ev<string>(host.page,g=>g.walls.hash());return await ev(guest.page,(g,want)=>g.walls.hash()===want,hash);},{timeout:15000}).toBe(true);
}
async function guestBreachAndPlant(host:Player,guest:Player){
 const seat=await ev<number>(guest.page,g=>g.localSeat);
 const target=await ev<{id:number;x:number;y:number;z:number;yaw:number}>(host.page,g=>{const p=g.walls.panels.find((p:any)=>p.material==='drywall'&&p.y===0&&p.wall==='north');if(!p)throw new Error('No north floor panel');return{id:p.id,x:p.x+p.cols*.25,y:.03,z:p.z-1,yaw:Math.PI};});
 await ev(host.page,(g,p)=>{const e=g.state.entities.find((e:any)=>e.seat===p.seat);Object.assign(e,{x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:0,vx:0,vy:0,vz:0});},{...target,seat});
 await expect.poll(()=>ev(guest.page,(g,p)=>Math.hypot(g.player.x-p.x,g.player.z-p.z),target),{timeout:15000}).toBeLessThan(.1);
 await ev(guest.page,(g,p)=>{g.input.consumeLook();g.player.yaw=p.yaw;g.player.pitch=0;},target);
 const before=await ev<string>(host.page,g=>g.walls.hash());
 await guest.page.keyboard.down('3');await guest.page.waitForTimeout(1200);await guest.page.keyboard.up('3');
 await expect.poll(()=>ev(host.page,(g,s)=>g.tools.charges.has(s),seat),{timeout:15000}).toBe(true);
 await expect.poll(()=>ev(guest.page,(g,s)=>g.state.tools?.[6]?.some((c:number[])=>c[0]===s)??false,seat),{timeout:15000}).toBe(true);
 await guest.page.waitForTimeout(200);await guest.page.keyboard.down('3');await guest.page.waitForTimeout(150);await guest.page.keyboard.up('3');
 await expect.poll(()=>ev(host.page,(g,id)=>g.walls.hasDoorway(id),target.id),{timeout:15000}).toBe(true);
 expect(await ev(host.page,g=>g.walls.hash())).not.toBe(before);await equalWalls(host,guest);
 expect(await ev(guest.page,g=>g.state.phase)).toBe(await ev(host.page,g=>g.state.phase));
 expect(await ev(host.page,(g,s)=>g.state.objective.carrier===s,seat)).toBe(true);
 const live=await ev<{site:'A'|'B';x:number;z:number}>(host.page,g=>({site:g.state.objective.site,x:g.state.site.center[0],z:g.state.site.center[2]}));
 await ev(host.page,(g,p)=>{const e=g.state.entities.find((e:any)=>e.seat===p.seat);Object.assign(e,{x:p.x,y:.03,z:p.z,yaw:0,pitch:0,vx:0,vy:0,vz:0});},{...live,seat});
 await expect.poll(()=>ev(guest.page,(g,p)=>Math.hypot(g.player.x-p.x,g.player.z-p.z),live),{timeout:15000}).toBeLessThan(.1);
 await ev(guest.page,g=>{g.input.consumeLook();g.player.yaw=0;g.player.pitch=0;});
 await guest.page.keyboard.down('f');await expect.poll(()=>ev(guest.page,(g,s)=>g.state.objective.interactionSeat===s&&g.state.objective.progress>1,seat),{timeout:10000}).toBe(true);
 await expect.poll(()=>ev(host.page,g=>g.state.phase),{timeout:12000}).toBe('planted');await guest.page.keyboard.up('f');
 await expect.poll(()=>ev(guest.page,g=>g.state.phase),{timeout:15000}).toBe('planted');
 expect(await ev(guest.page,g=>({site:g.state.objective.site,state:g.state.objective.state,carrier:g.state.objective.carrier,revealed:g.state.objective.revealed}))).toEqual({site:live.site,state:'planted',carrier:null,revealed:true});
 await equalWalls(host,guest);
}
async function online(impaired:boolean,relay=false){
 const host=await launchPlayer('Hana'),guest=await launchPlayer('Tama'),players=[host,guest];
 const query=`?quality=potato&test&seed=17${impaired?'&netsim=1':''}${relay?'&relay=1':''}`;
 try{
  for(const p of players)await p.page.setViewportSize({width:1024,height:640});
  await host.page.goto(`${BASE}/${query}#/game/strongroom`);await expect(host.page.locator('.strongroom-game')).toHaveAttribute('data-ready','true',{timeout:120000});
  await host.page.getByRole('button',{name:'Play online',exact:true}).click();await host.page.getByRole('button',{name:'Create room'}).click();await expect(host.page.locator('.mp-room-code')).toHaveText(/^[A-Z2-9]{6}$/,{timeout:30000});
  const code=(await host.page.locator('.mp-room-code').textContent())!.trim();
  await guest.page.goto(`${BASE}/${query}#/game/strongroom?room=${code}${relay?'&relay=1':''}`);await expect(guest.page.getByLabel('Room code')).toHaveValue(code,{timeout:120000});await guest.page.getByRole('button',{name:'Join by code'}).click();
  if(relay){await expect.poll(async()=>await ev(guest.page,g=>g.net.session?.role)==='guest'||/Could not|failed/.test(await guest.page.locator('.mp-status').textContent()??''),{timeout:45000}).toBe(true);if(await ev(guest.page,g=>g.net.session?.role)!=='guest'){await expect(guest.page.locator('.mp-status')).not.toContainText('negotiation-failed');console.log('Strongroom relay-only unavailable:',await guest.page.locator('.mp-status').textContent());return;}}
  await expect.poll(()=>ev(guest.page,g=>g.net.session?.role),{timeout:35000}).toBe('guest');
  await expect(host.page.locator('.sr-seats')).toContainText('Tama');expect(await ev(host.page,g=>g.net.session.lobby.seats.filter((s:any)=>s.bot).length)).toBe(4);
  for(const p of players)await expect(p.page.locator('.strongroom-game')).toHaveAttribute('data-models','true',{timeout:120000});
  if(!impaired&&!relay){await host.page.setViewportSize({width:1440,height:900});await host.page.waitForTimeout(200);await host.page.screenshot({path:test.info().outputPath('desktop-room-lobby.png')});await host.page.setViewportSize({width:1024,height:640});}
  await host.page.getByRole('button',{name:'Start match',exact:true}).click();await beginAction(host,guest);
  await expect.poll(()=>ev(host.page,g=>g.net.session.room.inviteLink.includes('room='))).toBe(true);
  await host.page.evaluate(()=>{const g=(window as any).__game;const brain=g.state.botInput.bind(g.state);g.state.botInput=(e:any)=>({...brain(e),buttons:0});for(const e of g.state.entities){e.x=e.seat===0||e.seat===3?-12:e.team===0?-30:30;e.z=e.seat===0?-27:e.seat===3?-23:-10+(e.seat%3)*6;e.y=.03;e.hp=100;e.vx=e.vy=e.vz=0;e.yaw=e.seat===3?0:Math.PI;e.pitch=0;}});
  await expect.poll(()=>ev(guest.page,g=>Math.abs(g.player.z+23)),{timeout:15000}).toBeLessThan(.1);
  await guest.page.getByRole('button',{name:'Click to play',exact:true}).click();
  // Host correction preserves the guest's view; face the fixture's +x strafe direction locally.
  await ev(guest.page,g=>{g.input.consumeLook();g.player.yaw=0;g.player.pitch=0;});
  await expect.poll(()=>ev(host.page,g=>Math.abs(g.state.entities.find((e:any)=>e.seat===3).yaw)),{timeout:10000}).toBeLessThan(.01);
  const x=await ev(guest.page,g=>g.player.x);await guest.page.keyboard.down('d');await guest.page.waitForTimeout(350);await guest.page.keyboard.up('d');
  await expect.poll(()=>ev(host.page,g=>g.state.entities.find((e:any)=>e.seat===3).x),{timeout:15000}).toBeGreaterThan(x+.5);
  if(impaired){
   await host.page.evaluate(()=>{const g=(window as any).__game;g.savedLOS=g.state.world.blocked;g.state.world.blocked=()=>true;});
   await guest.page.waitForTimeout(2000);await ev(guest.page,g=>g.stats.predictionErrors.length=0);
   await ev(guest.page,g=>{g.input.consumeLook();g.player.yaw=.35;});
   let travelled=0,last=await ev<{x:number;z:number}>(guest.page,g=>({x:g.player.x,z:g.player.z}));const simStart=await ev<number>(host.page,g=>g.state.time);
   for(let n=0;n<60;n++){const key=n%2?'a':'d';await guest.page.keyboard.down(key);await guest.page.waitForTimeout(500);await guest.page.keyboard.up(key);await guest.page.waitForTimeout(500);const p=await ev<{x:number;z:number}>(guest.page,g=>({x:g.player.x,z:g.player.z}));travelled+=Math.hypot(p.x-last.x,p.z-last.z);last=p;if(n%10===9)console.log('netsim movement',n,travelled,p,await ev(guest.page,g=>({locked:g.input.locked,phase:g.state.phase,hp:g.player.hp,away:g.net.session.away,buttons:g.input.firing,held:[...g.input._down],timer:g.state.timer})));}
   expect(travelled).toBeGreaterThan(60);expect(await ev<number>(host.page,g=>g.state.time)-simStart).toBeGreaterThan(50000);expect(await ev(guest.page,g=>[g.net.session.transport.delay,g.net.session.transport.loss])).toEqual([75,.05]);
   const errors=await ev<number[]>(guest.page,g=>g.stats.predictionErrors.slice().sort((a:number,b:number)=>a-b));expect(errors.length).toBeGreaterThan(100);const p95=errors[Math.floor((errors.length-1)*.95)];console.log(`Strongroom netsim 150ms RTT / 5% loss: ${errors.length} corrections over ${travelled.toFixed(1)}m, p95 ${p95.toFixed(4)}m`);expect(p95).toBeLessThan(.3);
   await host.page.evaluate(()=>{const g=(window as any).__game;g.state.world.blocked=g.savedLOS;});
  }
  const hp=await ev(host.page,g=>g.player.hp);const target=await ev(host.page,g=>({x:g.player.x,y:g.player.y+1.2,z:g.player.z}));
  await guest.page.mouse.move(512,320);
  await ev(guest.page,(g,t)=>{g.input.consumeLook();const e=g.player,dx=t.x-e.x,dz=t.z-e.z;e.yaw=Math.atan2(-dx,-dz);e.pitch=Math.atan2(t.y-(e.y+1.62),Math.hypot(dx,dz));},target);
  await guest.page.mouse.down();await guest.page.waitForTimeout(90);await guest.page.mouse.up();
  await expect.poll(()=>ev(host.page,g=>g.player.hp),{timeout:15000}).toBeLessThan(hp);
  await expect.poll(()=>ev(guest.page,g=>g.state.entities.find((e:any)=>e.seat===0).hp),{timeout:15000}).toBe(await ev(host.page,g=>g.player.hp));
  await guestBreachAndPlant(host,guest);
  if(!impaired&&!relay){
   await guest.page.setViewportSize({width:1440,height:900});await guest.page.waitForTimeout(200);
   await guest.page.screenshot({path:test.info().outputPath('desktop-guest-online.png')});
   await guest.page.setViewportSize({width:1024,height:640});
  }
  // Guest Study is Away while the room keeps running.
  await guest.page.keyboard.press('Escape');await expect(guest.page.locator('#study-view')).toBeVisible();await expect.poll(()=>ev(host.page,g=>g.state.entities.find((e:any)=>e.seat===3).away!==null),{timeout:10000}).toBe(true);expect(await ev(host.page,g=>g.state.paused)).toBe(false);
  await guest.page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();
  await guest.page.getByRole('button',{name:'Click to play',exact:true}).click();await guest.page.keyboard.down('d');await guest.page.mouse.down();await ev(guest.page,g=>{g.input.setVirtualButton(0,true);g.input.setMoveVector(1,0);});
  await host.page.keyboard.press('Escape');await expect(host.page.locator('#study-view')).toBeVisible();await expect.poll(()=>ev(guest.page,g=>g.state.paused),{timeout:10000}).toBe(true);await expect(guest.page.locator('.sr-match-hud .toast')).toContainText('Host is reading');
  expect(await ev(guest.page,g=>[g.input.isActionDown('moveRight'),g.input.firing,g.input.moveVector().magnitude])).toEqual([false,false,0]);await guest.page.keyboard.up('d');await guest.page.mouse.up();
  const timer=await ev(host.page,g=>g.state.timer);await host.page.waitForTimeout(250);expect(await ev(host.page,g=>g.state.timer)).toBe(timer);
  await host.page.locator('.study-article-body').getByRole('link',{name:'Games',exact:true}).click();await expect.poll(()=>ev(guest.page,g=>g.state.paused),{timeout:10000}).toBe(false);
  await ev(host.page,g=>g.state.timer=.05);await expect.poll(()=>ev(host.page,g=>g.state.phase),{timeout:10000}).toBe('roundEnd');await expect.poll(()=>ev(guest.page,g=>g.state.phase),{timeout:10000}).toBe('roundEnd');expect(await ev(guest.page,g=>g.state.scores)).toEqual(await ev(host.page,g=>g.state.scores));
  if(relay)expect(await ev(host.page,g=>g.net.session.room.linkKind())).toBe('relay');
  await host.page.goto(`${BASE}/#/`);await expect(guest.page.getByRole('dialog',{name:'Host left',exact:true})).toBeVisible({timeout:20000});
 }finally{await closeAll(players);}
}
test('Strongroom: real guest damage, breach hash, plant state, Study and equal round result',async()=>{test.setTimeout(300000);await online(false);});
test('Strongroom: 60 seconds at simulated 150ms RTT and 5% unreliable loss',async()=>{test.setTimeout(300000);await online(true);});
test('Strongroom: relay-only uses TURN or explains an unreachable relay',async()=>{test.setTimeout(240000);await online(false,true);});
