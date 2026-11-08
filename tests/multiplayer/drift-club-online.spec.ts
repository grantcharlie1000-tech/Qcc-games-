import {test,expect} from '@playwright/test';
import {closeAll,launchPlayer,type Player} from './peers';

test.skip(({browserName})=>browserName!=='chromium','Uses two independent Chromium WebRTC sessions.');
test('an animated host and reduced-motion guest complete a three-court match',async()=>{
 test.setTimeout(180_000);
 const players:Player[]=[];
 try{
  const host=await launchPlayer('Coral');players.push(host);
  const guest=await launchPlayer('Blue');players.push(guest);
  const a=host.page,b=guest.page;
  await a.emulateMedia({reducedMotion:'no-preference'});await b.emulateMedia({reducedMotion:'reduce'});
  await a.goto('/?festive=off#/game/drift-club');await a.locator('.dc-online').click();
  await a.locator('.mp-create').click();await expect(a.locator('.mp-room-code')).toHaveText(/^[A-Z2-9]{6}$/,{timeout:30000});
  const code=await a.locator('.mp-room-code').innerText();
  await b.goto('/?festive=christmas#/collection/26?room='+code);await expect(b.locator('.mp-name')).toBeFocused();
  await b.locator('.mp-join-button').click();
  for(let end=0;end<3;end++){
   for(let delivery=0;delivery<8;delivery++){
    const [active,waiting]=(end+delivery)%2===0?[a,b]:[b,a];
    await expect(active.locator('.dc-shoot')).toBeEnabled({timeout:30000});
    await expect(waiting.locator('.dc-shoot')).toBeDisabled();
    await active.locator('.dc-angle').fill(String([0,8,-20,30][delivery%4]));
    await active.locator('.dc-power').fill(String(60+delivery*4));await active.locator('.dc-shoot').click();
    for(const page of [a,b])await expect(page.locator('.dc')).toHaveAttribute('data-throws',String(end*8+delivery+1));
    if(delivery===0&&end===0){await expect(b.locator('.dc-shoot')).toBeDisabled();}
   }
   for(const page of [a,b])await expect(page.locator('.dc-result')).toBeVisible();
   expect(await b.locator('.dc-ledger b').allTextContents()).toEqual(await a.locator('.dc-ledger b').allTextContents());
   if(end<2){await a.locator('.dc-advance').click();await expect(b.locator('.dc')).toHaveAttribute('data-end',String(end+2));}
  }
  expect(await b.locator('.dc-result h3').innerText()).toBe(await a.locator('.dc-result h3').innerText());
  await a.locator('.dc-advance').click();await expect(b.locator('.dc')).toHaveAttribute('data-throws','0');
  await b.locator('.dc-online').click();await b.locator('.mp-leave').click();await expect(a.locator('.mp-players')).toContainText('open seat');
 }finally{await closeAll(players);}
});
