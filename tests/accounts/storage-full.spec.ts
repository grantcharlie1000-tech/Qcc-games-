import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {appSettings,gameAction} from '../game-menu';

const message='Storage is full right now. Your progress is kept on this device.';
const full={error:'storage_full',message};
const save={version:1,data:{checkpoint:'keep this progress'},updated:1};
async function setup(context:BrowserContext,account=true){
 await context.addInitScript(({account,save})=>{
  localStorage.setItem('pocket-arcade:v1:accounts:guest','true');
  if(account)localStorage.setItem('pocket-arcade:v1:accounts:session',JSON.stringify({token:'acct_'+'a'.repeat(64),username:'Ada'}));
  localStorage.setItem('pocket-arcade:v1:save:snake',JSON.stringify(save));
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
  localStorage.setItem('qcc:christmas-welcome:2026:ada','seen');
  sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
 },{account,save});
 await context.route('**/.netlify/functions/accounts**',async route=>{
  const action=new URL(route.request().url()).searchParams.get('action');
  if(action==='sync'){
   const saves=route.request().postDataJSON()?.saves??{};
   const acks=Object.fromEntries(Object.keys(saves).map(key=>[key,'1']));
   return route.fulfill({json:{protocolVersion:2,cursor:'1',saves:{},conflicts:{},acks,revisions:acks}});
  }
  return route.fulfill({json:{token:'acct_'+'a'.repeat(64),username:'Ada'}});
 });
 await context.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({json:{entries:[],player:null}}));
}
const localSave=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:save:snake')!));

test('account sync shows the capacity notice and retains the local and staged save',async({page,context})=>{
 await setup(context);
 await context.route('**/.netlify/functions/accounts**',route=>route.fulfill({status:507,json:full}));
 await page.goto('/');await appSettings(page);
 await expect(page.locator('#account-sync-status')).toHaveText(message);
 expect(await localSave(page)).toEqual(save);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:accounts:pending:ada')!)['save:snake'].value)).toEqual(save);
});
test('login displays the full message while guest progress remains local',async({page,context})=>{
 await setup(context,false);
 await context.route('**/.netlify/functions/accounts**',route=>route.fulfill({status:507,json:full}));
 await page.goto('/');await appSettings(page);await page.locator('#menu').getByRole('button',{name:'Log in / Sign up',exact:true}).click();
 const dialog=page.locator('#accounts-dialog');await dialog.getByLabel('Username',{exact:true}).fill('Ada');await dialog.getByLabel('Password',{exact:true}).fill('password1');
 await dialog.locator('form').getByRole('button',{name:'Log in',exact:true}).click();
 await expect(dialog.locator('.account-status')).toHaveText(message);expect(await localSave(page)).toEqual(save);
});
test('leaderboard shows a rejected background upload even when subsequent ranking reads succeed',async({page,context})=>{
 await page.clock.install();let storageFull=true;
 await setup(context);await context.addInitScript(()=>localStorage.setItem('pocket-arcade:v1:leaderboard:pending:account:ada',JSON.stringify({snake:100})));
 await context.route('**/.netlify/functions/leaderboard**',route=>route.fulfill(route.request().method()==='POST'&&storageFull?{status:507,json:full}:{json:{entries:[],player:null}}));
 // Rankings moved from the in-game rail to the shared dialog. Check both entry paths.
 await page.goto('/#/game/minesweeper');await gameAction(page,'Leaderboards');await expect(page.locator('#leaderboard-dialog .lb-status')).toHaveText(message);
 await page.getByRole('button',{name:'Close leaderboards',exact:true}).click();await appSettings(page);await page.locator('#menu').getByRole('button',{name:'Leaderboards',exact:true}).click();
 await expect(page.locator('#leaderboard-dialog .lb-status')).toHaveText(message);
 await page.getByRole('button',{name:'Refresh scores',exact:true}).click();await expect(page.locator('#leaderboard-dialog .lb-status')).toHaveText(message);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:leaderboard:pending:account:ada')!))).toEqual({snake:100});
 expect(await localSave(page)).toEqual(save);
 storageFull=false;await page.clock.fastForward(60000);
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('pocket-arcade:v1:leaderboard:pending:account:ada')!))).toEqual({});
 await expect(page.locator('#leaderboard-dialog .lb-status')).not.toHaveText(message);
 await page.getByRole('button',{name:'Close leaderboards',exact:true}).click();await gameAction(page,'Leaderboards');await expect(page.locator('#leaderboard-dialog .lb-status')).not.toHaveText(message);
});
test('leaderboard game menu and app settings show capacity errors on reads',async({page,context})=>{
 await setup(context);
 await context.route('**/.netlify/functions/leaderboard**',route=>route.fulfill({status:507,json:full}));
 await page.goto('/#/game/minesweeper');await gameAction(page,'Leaderboards');await expect(page.locator('#leaderboard-dialog .lb-status')).toHaveText(message);
 await page.getByRole('button',{name:'Close leaderboards',exact:true}).click();await appSettings(page);await page.locator('#menu').getByRole('button',{name:'Leaderboards',exact:true}).click();
 await expect(page.locator('#leaderboard-dialog .lb-status')).toHaveText(message);expect(await localSave(page)).toEqual(save);
});
