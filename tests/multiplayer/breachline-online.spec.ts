import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {closeAll,launchPlayer,type Player} from './peers';

test.skip(({browserName})=>browserName!=='chromium','Uses two independent Chromium WebRTC sessions.');
const state=(page:Page)=>page.evaluate(()=>window.__breachlineTest!.state());
const hook=(page:Page)=>page.waitForFunction(()=>window.__breachlineTest!==undefined,undefined,{timeout:60000});

test('two devices share a Breachline room: seats, a round, movement, gunfire and destruction',async()=>{
 test.setTimeout(240_000);
 const players:Player[]=[];
 try{
  const host=await launchPlayer('Hana');players.push(host);
  const guest=await launchPlayer('Gus');players.push(guest);
  const a=host.page,b=guest.page;
  await a.goto('/?festive=off#/game/breachline');await hook(a);
  await a.locator('.bl-size').selectOption('2');
  await a.locator('.bl-online').click();
  await a.locator('.mp-create').click();
  await expect(a.locator('.mp-room-code')).toHaveText(/^[A-Z2-9]{6}$/,{timeout:30000});
  const code=await a.locator('.mp-room-code').innerText();
  // The invite link opens the game with the code filled in.
  await b.goto('/?festive=off#/collection/28?room='+code);await hook(b);
  await expect(b.locator('.mp-code')).toHaveValue(code);
  await b.locator('.mp-join-button').click();
  await expect(a.locator('.mp-players')).toContainText('Gus',{timeout:30000});
  await a.locator('.mp-close').click();await b.locator('.mp-close').click();
  // Both lobbies show the same seats: Hana with Azure, Gus with Ember, a bot beside each.
  for(const page of [a,b]){
   await expect(page.locator('.bl-squad-list[data-squad="0"] li').first()).toContainText('Hana');
   await expect(page.locator('.bl-squad-list[data-squad="1"] li').first()).toContainText('Gus');
   await expect(page.locator('.bl-squad-list li')).toHaveCount(4);
  }
  await expect(b.locator('.bl-play')).toBeDisabled();
  await expect(b.locator('.bl-play')).toHaveText('Waiting for the host');
  await expect(a.locator('.bl-play')).toHaveText('Start match');
  await a.locator('.bl-play').click();
  for(const page of [a,b])await expect(page.locator('.breachline')).toHaveAttribute('data-phase','prep',{timeout:15000});
  let sa=await state(a),sb=await state(b);
  expect(sa.host).toBe(true);expect(sb.host).toBe(false);expect(sb.online).toBe(true);
  expect(sb.self).toBe(1);expect(sb.me!.role).toBe(1);expect(sa.me!.role).toBe(0);
  expect(sb.players.map(p=>p.name)).toEqual(sa.players.map(p=>p.name));
  // The host parks the bots and opens the round; the guest (a defender) walks, and the host sees it move.
  await a.evaluate(()=>{const h=window.__breachlineTest!;h.still();h.skip(19.5);});
  await expect(b.locator('.breachline')).toHaveAttribute('data-phase','action',{timeout:15000});
  const before=(await state(a)).players[1];
  await b.evaluate(()=>{const h=window.__breachlineTest!;h.look(Math.PI,0);h.hold({mz:1},0.8);});
  await expect.poll(async()=>{const p=(await state(a)).players[1];return Math.hypot(p.x-before.x,p.z-before.z);},{timeout:10000}).toBeGreaterThan(0.8);
  // The guest shoots a soft wall: the holes appear on both devices, in the same number.
  // (Fired in real time: the host refuses shots that arrive faster than the weapon can fire.)
  await b.evaluate(()=>{const h=window.__breachlineTest!;const me=h.state().me!;h.look(me.z< -2?Math.PI:0,-0.05);});
  for(let i=0;i<12;i++){await b.evaluate(()=>window.__breachlineTest!.hold({fire:true,mx:0.6},0.05));await b.waitForTimeout(110);}
  await expect.poll(async()=>(await state(a)).holes,{timeout:10000}).toBeGreaterThan(2);
  await expect.poll(async()=>(await state(b)).holes-(await state(a)).holes,{timeout:10000}).toBe(0);
  // The host hits the guest: the guest's health falls on both.
  const g=(await state(a)).players[1];
  await a.evaluate(([x,z])=>{const h=window.__breachlineTest!;h.place(x,z+4,0,-0.12);},[g.x,g.z]);
  await a.evaluate(()=>window.__breachlineTest!.hold({fire:true},0.25));
  await expect.poll(async()=>(await state(b)).me!.hp,{timeout:10000}).toBeLessThan(100);
  sa=await state(a);sb=await state(b);
  expect(sa.players[1].hp).toBe(sb.me!.hp);
  // The guest leaves: a bot takes the seat and the host plays on.
  await b.locator('.bl-canvas').focus();
  await b.evaluate(()=>document.exitPointerLock());
  await b.goto('/?festive=off#/collection');
  await expect.poll(async()=>(await state(a)).players[1].bot,{timeout:20000}).toBe(true);
  expect((await state(a)).phase).not.toBe('lobby');
 }finally{await closeAll(players);}
});
