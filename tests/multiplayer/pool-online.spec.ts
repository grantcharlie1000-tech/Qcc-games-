import {test,expect} from '@playwright/test';
import {BASE,closeAll,launchPlayer,type Player} from './peers';
import {chooseAI,placeAICue,type PoolState} from '../../src/games/pool/model';

test.skip(({browserName})=>browserName!=='chromium','Online tests launch their own Chromium processes.');
test.describe.configure({mode:'serial'});

type Hook={state():PoolState;seat():number|null;aim(a:number,p:number):boolean;ghost(x:number,y:number):boolean;raw(c:unknown):boolean};
const hook=<T>(page:import('@playwright/test').Page,fn:(h:Hook,arg:any)=>T,arg?:unknown)=>page.evaluate(([f,a])=>new Function('h','a',`return (${f})(h,a)`)((window as unknown as {__pool:Hook}).__pool,a),[fn.toString(),arg] as const) as Promise<T>;
const settledEqual=async(a:Player,b:Player)=>{
  await expect.poll(async()=>{
    const [x,y]=await Promise.all([a.page.locator('.pool-game').getAttribute('data-rev'),b.page.locator('.pool-game').getAttribute('data-rev')]);
    const [px,py]=await Promise.all([a.page.locator('.pool-game').getAttribute('data-phase'),b.page.locator('.pool-game').getAttribute('data-phase')]);
    return x===y&&px===py&&px!=='moving';
  },{timeout:30000}).toBe(true);
};

test('two independent browsers play a full online rack and agree on the result',async()=>{
  test.setTimeout(600_000);
  const host=await launchPlayer('Hana'),guest=await launchPlayer('Tama'),extra=await launchPlayer('Rua');
  try{
    await host.page.goto(`${BASE}/#/game/pool`);
    await host.page.getByLabel('Players').selectOption('online');
    await host.page.getByRole('button',{name:'Create room'}).click();
    await expect(host.page.locator('.mp-room-code')).toHaveText(/^[A-Z2-9]{6}$/,{timeout:25000});
    const code=(await host.page.locator('.mp-room-code').textContent())!.trim();
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
    await expect(host.page.locator('.pool-live')).toContainText('Waiting for an opponent');

    // Invalid and unknown codes are explained.
    await guest.page.goto(`${BASE}/#/game/pool`);
    await guest.page.getByLabel('Players').selectOption('online');
    await guest.page.getByLabel('Room code').fill('ABC');await guest.page.getByRole('button',{name:'Join by code'}).click();
    await expect(guest.page.locator('.mp-status')).toHaveText(/6 letters and numbers/);
    await guest.page.getByLabel('Room code').fill(code==='ZZZZZZ'?'YYYYYY':'ZZZZZZ');await guest.page.getByRole('button',{name:'Join by code'}).click();
    await expect(guest.page.locator('.mp-status')).toHaveText(/No room with that code/,{timeout:25000});

    // The invite link fills in the code.
    await guest.page.goto(`${BASE}/#/game/pool?room=${code}`);await guest.page.reload();
    await expect(guest.page.getByLabel('Room code')).toHaveValue(code);
    await guest.page.getByRole('button',{name:'Join by code'}).click();
    await expect(guest.page.locator('.pool-game')).toHaveAttribute('data-online','guest',{timeout:30000});
    await expect(host.page.locator('.mp-players')).toContainText('Tama');
    await expect(guest.page.locator('.pool-player').first()).toContainText('Hana');
    await expect(guest.page.locator('.mp-link')).toContainText(/Direct peer-to-peer|TURN relay/,{timeout:15000});

    // A third player is refused: the room is full.
    await extra.page.goto(`${BASE}/#/game/pool?room=${code}`);
    await extra.page.getByRole('button',{name:'Join by code'}).click();
    await expect(extra.page.locator('.mp-status')).toHaveText('That room is full.',{timeout:30000});

    // Out-of-turn command from the guest reaches the host and is rejected there.
    await settledEqual(host,guest);
    expect(await hook(guest.page,h=>h.raw({t:'shoot',angle:-1.5,power:.9,pocket:0}))).toBe(true);
    await expect(guest.page.locator('#game-status')).toHaveText('It is not your turn.');

    // Host pause pauses the room; guest commands are refused meanwhile; resume resynchronises.
    await host.page.getByRole('button',{name:'Pause game',exact:true}).click();
    await expect(guest.page.locator('.mp-waiting')).toBeVisible();
    await expect(guest.page.locator('.mp-waiting')).toContainText('Waiting for host');
    await host.page.getByRole('button',{name:'Keep playing'}).click();
    await expect(guest.page.locator('.mp-waiting')).toBeHidden();

    const players=[host,guest];let shots=0;
    for(;shots<160;shots++){
      await settledEqual(host,guest);
      const s=await hook(host.page,h=>h.state());
      if(s.phase==='over')break;
      const mover=players[s.turn],canvas=mover.page.locator('.pool-table');
      if(s.ballInHand){
        const copy=JSON.parse(JSON.stringify(s)) as PoolState;placeAICue(copy);
        expect(await hook(mover.page,(h,a)=>h.ghost(a.x,a.y),{x:copy.balls[0].x,y:copy.balls[0].y})).toBe(true);
        await canvas.focus();await canvas.press('Enter');
        await expect.poll(async()=>(await hook(host.page,h=>h.state())).ballInHand,{timeout:20000}).toBe(false);
        await settledEqual(host,guest);
      }
      const now=await hook(host.page,h=>h.state()),plan=chooseAI(now);
      if(!now.break&&now.calledPocket!==plan.pocket)await mover.page.locator('#pool-pocket').selectOption(String(plan.pocket));
      await expect.poll(()=>hook(mover.page,(h,a)=>h.aim(a.angle,a.power),plan),{timeout:20000}).toBe(true);
      await canvas.focus();await canvas.press('Enter');
      await expect.poll(async()=>(await hook(host.page,h=>h.state())).shots,{timeout:20000}).toBe(now.shots+1);
      if(shots===0){
        // During the break the guest's balls move from the host's streamed frames (the guest runs no physics).
        const start=await guest.page.locator('.pool-game').getAttribute('data-table');
        await expect.poll(()=>guest.page.locator('.pool-game').getAttribute('data-table'),{timeout:5000}).not.toBe(start);
      }
    }
    const [a,b]=await Promise.all([hook(host.page,h=>h.state()),hook(guest.page,h=>h.state())]);
    const strip=(s:PoolState)=>({...s,angle:0,power:0});
    expect(strip(b)).toEqual(strip(a));
    expect(a.phase).toBe('over');
    // Each device labels its own seat "(you)"; otherwise the result text is identical.
    const plain=(t:string|null)=>t!.replace(' (you)','');
    expect(plain(await guest.page.locator('.pool-message').textContent())).toBe(plain(await host.page.locator('.pool-message').textContent()));
    console.log(`Online rack finished after ${a.shots} shots; winner seat ${a.winner}.`);

    // The host leaving ends the session cleanly for the guest, which returns to its offline table.
    await host.page.close();
    await expect(guest.page.locator('.mp-status')).toHaveText(/host ended the online game|Lost the connection/,{timeout:30000});
    await expect(guest.page.locator('.pool-game')).toHaveAttribute('data-online','off');
  }finally{await closeAll([host,guest,extra]);}
});
