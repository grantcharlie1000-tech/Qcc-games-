import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import {createAccountsHandler} from '../../src/accounts/server';
import {createChatHandler} from '../../src/chat/server';
import {createSocialHandler} from '../../src/social/server';
import {createMemoryStore} from '../../src/media/store';

const database=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];
let accounts:ReturnType<typeof createAccountsHandler>,chat:ReturnType<typeof createChatHandler>,social:ReturnType<typeof createSocialHandler>;
test.beforeAll(async()=>{
 const connectionString=await database.start();await database.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;
 const store=createMemoryStore();const db={query:(text:string,values?:unknown[])=>pool.query(text,values),connect:()=>pool.connect()} as never;
 accounts=createAccountsHandler(pool);chat=createChatHandler(db,store);social=createSocialHandler(db,store);
});
test.afterAll(async()=>{await pool?.end();await database.stop();});

const PASSWORD='long enough password';
let summaryRequests=0;
async function connect(context:BrowserContext,pollScale?:number){
 summaryRequests=0;
 await context.addInitScript(scale=>{
  if(window!==window.top)return;
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
  if(scale)(window as unknown as {__QCC_POLL_SCALE__:number}).__QCC_POLL_SCALE__=scale;
 },pollScale);
 for(const [name,handle] of [['accounts',accounts],['chat',chat],['social',social]] as const)await context.route(`**/.netlify/functions/${name}**`,async route=>{
  const req=route.request();
  if(name==='chat'&&req.url().includes('action=summary'))summaryRequests++;
  const result=await handle(new Request(req.url(),{method:req.method(),headers:req.headers(),body:['POST','PUT'].includes(req.method())?req.postData():undefined}));
  await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:await result.text()});
 });
}
const call=(handle:(request:Request)=>Promise<Response>,action:string,token:string|null,body?:unknown)=>
 handle(new Request(`https://qcc.test/.netlify/functions/x?action=${action}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}));
async function signup(name:string):Promise<string>{
 const response=await call(accounts,'signup',null,{username:name,password:PASSWORD});expect(response.status).toBe(201);return (await response.json()).token;
}
async function guest(page:Page){
 const dialog=page.locator('#accounts-dialog');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Play as guest',exact:true}).click();await expect(dialog).not.toBeVisible();
}
async function logIn(page:Page,username:string){
 const dialog=page.locator('#accounts-dialog');await expect(dialog).toBeVisible();
 await dialog.getByLabel('Username',{exact:true}).fill(username);await dialog.getByLabel('Password',{exact:true}).fill(PASSWORD);
 await dialog.locator('form').getByRole('button',{name:'Log in',exact:true}).click();await expect(dialog).not.toBeVisible();
}
const stamp=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);

test('launcher opens Social and Chat routes and back',async({page,context})=>{
 await connect(context);await page.goto('/');await guest(page);
 const tabs=page.locator('.app-tabbar .ui-tab');
 await expect(tabs).toHaveCount(6);
 await expect(page.locator('.app-tabbar [data-action=apps]')).toHaveText('Apps');
 await expect(page.locator('.app-tabbar [data-action=apps] + [data-action=study]')).toHaveCount(1);
 await expect(page.getByRole('button',{name:'Apps',exact:true})).toHaveAttribute('aria-haspopup','dialog');
 await page.getByRole('button',{name:'Apps',exact:true}).click();
 const sheet=page.locator('#apps-dialog');await expect(sheet).toBeVisible();
 await expect(sheet.getByRole('link',{name:/QCC Social/})).toHaveAttribute('href','#/social');
 await sheet.getByRole('link',{name:/QCC Social/}).click();
 await expect(sheet).not.toBeVisible();await expect(page).toHaveURL(/#\/social$/);
 await expect(page.locator('section.social-view')).toBeVisible();await expect(page.locator('body')).toHaveClass(/social-active/);
 await expect(page.getByRole('heading',{name:'QCC Social',level:1})).toBeVisible();
 await expect(page.locator('.social-view')).toContainText('Short posts from other QCC players.');
 await expect(page.locator('.app-navigation')).toBeHidden();
 await page.getByRole('link',{name:'Back to games'}).first().click();
 await expect(page.locator('.game-grid')).toBeVisible();await expect(page.locator('body')).not.toHaveClass(/social-active/);
 await page.goto('/#/chat');await page.reload();
 await expect(page.locator('section.chat-view')).toBeVisible();await expect(page.locator('body')).toHaveClass(/chat-active/);
 await expect(page.locator('.chat-view')).toContainText('Message friends one to one.');
 await page.evaluate(()=>{location.hash='#/social/search';});
 await expect(page.locator('section.social-view')).toBeVisible();await expect(page.locator('section.chat-view')).toHaveCount(0);
 await expect(page.locator('body')).not.toHaveClass(/chat-active/);
 await page.goBack();await expect(page.locator('section.chat-view')).toBeVisible();
 // Log in / Sign up opens the accounts dialog.
 await page.getByRole('button',{name:'Log in / Sign up'}).click();await expect(page.locator('#accounts-dialog')).toBeVisible();
});

test('launcher shows unread badge from chat summary',async({page,context})=>{
 await connect(context);
 const a=`ba_${stamp()}`,b=`bb_${stamp()}`,tokenA=await signup(a),tokenB=await signup(b);
 const first=await call(chat,'request',tokenA,{username:b});expect(first.status,await first.clone().text()).toBeLessThan(300);
 expect((await call(chat,'respond',tokenB,{username:a,accept:true})).status).toBeLessThan(300);
 expect((await call(chat,'send',tokenA,{to:b,kind:'text',body:'kia ora'})).status).toBeLessThan(300);
 await page.goto('/');await logIn(page,b);
 const apps=page.locator('.app-tabbar [data-action=apps]');
 await expect(apps).toHaveAttribute('aria-label','Apps, 1 unread message');
 await expect(apps.locator('.apps-badge')).toHaveText('1');
 await apps.click();
 const tile=page.locator('#apps-dialog [data-app=chat]');
 await expect(tile).toHaveAttribute('aria-label','QCC Chat, 1 unread message');
 await expect(tile.locator('.apps-badge')).toBeVisible();
 await page.locator('#apps-dialog').getByRole('button',{name:'Close apps'}).click();
 // Signing out clears the badge.
 await page.locator('.app-navigation [data-action=menu]').click();
 await page.getByRole('button',{name:'Log out',exact:true}).click();
 await expect(apps).toHaveAttribute('aria-label','Apps');await expect(apps.locator('.apps-badge')).toBeHidden();
});

test('launcher stops polling when hidden or signed out',async({page,context})=>{
 // 60 s poll scaled to 0.05 = 3 s.
 await connect(context,0.05);
 const name=`bp_${stamp()}`;await signup(name);
 await page.goto('/');await logIn(page,name);
 await expect.poll(()=>summaryRequests).toBeGreaterThanOrEqual(2);
 const setVisibility=(state:'visible'|'hidden')=>page.evaluate(value=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>value});
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>value==='hidden'});
  document.dispatchEvent(new Event('visibilitychange'));
 },state);
 await setVisibility('hidden');await page.waitForTimeout(300);
 const hiddenCount=summaryRequests;await page.waitForTimeout(6500);
 expect(summaryRequests).toBe(hiddenCount);
 await setVisibility('visible');
 await expect.poll(()=>summaryRequests).toBeGreaterThan(hiddenCount);
 await page.locator('.app-navigation [data-action=menu]').click();
 await page.getByRole('button',{name:'Log out',exact:true}).click();
 await expect(page.locator('#menu')).not.toBeVisible();await page.waitForTimeout(300);
 const signedOutCount=summaryRequests;await page.waitForTimeout(6500);
 expect(summaryRequests).toBe(signedOutCount);
});

test('Escape still opens Study from #/social',async({page,context})=>{
 await connect(context);await page.goto('/');await guest(page);
 await page.goto('/#/social');await page.reload();
 await expect(page.locator('section.social-view')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('body')).toHaveClass(/study-active/);
});

for(const width of [320,390,1440])test(`six tabs fit without horizontal overflow at ${width} px width`,async({page,context})=>{
 await connect(context);await page.setViewportSize({width,height:844});await page.goto('/');await guest(page);
 await expect(page.locator('.app-tabbar .ui-tab')).toHaveCount(6);
 const metrics=await page.evaluate(()=>{
  const bar=document.querySelector<HTMLElement>('.app-tabbar')!,tabs=[...bar.querySelectorAll<HTMLElement>('.ui-tab')],menu=document.querySelector<HTMLElement>('.app-menu')!;
  const box=bar.getBoundingClientRect(),m=menu.getBoundingClientRect();
  return {scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,barOverflow:bar.scrollWidth-bar.clientWidth,
   tabsInside:tabs.every(t=>{const r=t.getBoundingClientRect();return r.left>=box.left-1&&r.right<=box.right+1;}),tabW:Math.min(...tabs.map(t=>t.getBoundingClientRect().width)),
   labels:tabs.map(t=>t.scrollWidth-t.clientWidth),menuGap:m.left-box.right,menuInside:m.right<=innerWidth,tv:getComputedStyle(tabs[2].querySelector('.tab-long')!).display};
 });
 expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
 expect(metrics.barOverflow).toBeLessThanOrEqual(1);expect(metrics.tabsInside).toBe(true);expect(metrics.menuInside).toBe(true);
 expect(Math.max(...metrics.labels)).toBeLessThanOrEqual(1);expect(metrics.menuGap).toBeGreaterThanOrEqual(0);
 expect(metrics.tabW).toBeGreaterThanOrEqual(width<360?36:44);
 expect(metrics.tv).toBe(width<440?'none':'block');
 await expect(page.getByRole('link',{name:'TV Shows',exact:true})).toBeVisible();
});
