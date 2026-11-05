import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {LocalDB,createLocalPool} from '../support/local-db';
import type {Pool} from 'pg';
import {createAccountsHandler} from '../../src/accounts/server';
import {createChatHandler} from '../../src/chat/server';
import {createSocialHandler} from '../../src/social/server';
import {createMemoryStore} from '../../src/media/store';
import {seedStudyTopic} from '../fixtures';

const database=new LocalDB();let pool:Pool;
let accounts:ReturnType<typeof createAccountsHandler>,chat:ReturnType<typeof createChatHandler>,social:ReturnType<typeof createSocialHandler>;
test.beforeAll(async()=>{
 const connectionString=await database.start();await database.applyMigrations('db/migrations');pool=createLocalPool(connectionString);
 const store=createMemoryStore();const db={query:(text:string,values?:unknown[])=>pool.query(text,values),connect:()=>pool.connect()} as never;
 accounts=createAccountsHandler(pool);chat=createChatHandler(db,store);social=createSocialHandler(db,store);
});
test.afterAll(async()=>{await pool?.end();await database.stop();});

const PASSWORD='long enough password';
let summaryRequests=0;
async function connect(context:BrowserContext,pollScale?:number,chatMissing=false){
 summaryRequests=0;
 await context.addInitScript(scale=>{
  if(window!==window.top)return;
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
  if(scale)(window as unknown as {__QCC_POLL_SCALE__:number}).__QCC_POLL_SCALE__=scale;
 },pollScale);
 for(const [name,handle] of [['accounts',accounts],['chat',chat],['social',social]] as const)await context.route(`**/.netlify/functions/${name}**`,async route=>{
  const req=route.request();
  if(name==='chat'&&req.url().includes('action=summary'))summaryRequests++;
  if(name==='chat'&&chatMissing)return route.fulfill({status:404,contentType:'text/html',body:'<h1>Not found</h1>'});
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
 const stops=await sheet.evaluate(el=>[...el.querySelectorAll('.apps-tile')].map(t=>[...t.querySelectorAll('stop')].map(stop=>getComputedStyle(stop).stopColor)));
 expect(stops[0][0]).not.toBe('rgb(255, 255, 255)');expect(stops[0][0]).not.toBe(stops[1][0]);expect(stops[0][0]).toBe('rgb(166, 132, 255)');
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
 await setVisibility('hidden');await expect.poll(async()=>{const a=summaryRequests;await page.waitForTimeout(150);return summaryRequests===a;}).toBe(true);
 const hiddenCount=summaryRequests;await page.waitForTimeout(3600);
 expect(summaryRequests).toBe(hiddenCount);
 await setVisibility('visible');
 await expect.poll(()=>summaryRequests).toBeGreaterThan(hiddenCount);
 await page.locator('.app-navigation [data-action=menu]').click();
 await page.getByRole('button',{name:'Log out',exact:true}).click();
 await expect(page.locator('#menu')).not.toBeVisible();await page.waitForTimeout(300);
 const signedOutCount=summaryRequests;await page.waitForTimeout(3600);
 expect(summaryRequests).toBe(signedOutCount);
});

test('Apps tab stays hidden and nothing polls when the chat backend is missing',async({page,context})=>{
 await connect(context,0.05,true);
 const name=`bh_${stamp()}`;await signup(name);
 await page.goto('/');await logIn(page,name);
 // Only the one capability probe reached the chat route; after the 404 the Apps tab is never added, so the bar is the shell's own five tabs.
 await expect(page.locator('.app-tabbar .ui-tab')).toHaveCount(5);
 await expect(page.locator('.app-tabbar [data-action=apps]')).toHaveCount(0);
 await expect(page.locator('.app-navigation')).not.toHaveAttribute('data-apps','on');
 expect(await page.locator('.app-tabbar .ui-tab:visible').count()).toBe(5);
 await page.waitForTimeout(4000);
 expect(summaryRequests).toBe(1);
 // Direct routes still work and show their own state.
 await page.goto('/#/chat');await page.reload();
 await expect(page.locator('section.chat-view')).toBeVisible();
});

test('the five-tab bar fits 320px with 44px controls when there is no chat backend',async({page,context})=>{
 await connect(context,0.05,true);await page.setViewportSize({width:320,height:844});await page.goto('/');await guest(page);
 await expect(page.locator('.app-tabbar .ui-tab')).toHaveCount(5);
 const m=await page.evaluate(()=>{const bar=document.querySelector<HTMLElement>('.app-tabbar')!,menu=document.querySelector<HTMLElement>('.app-menu')!.getBoundingClientRect();
  return {overflow:bar.scrollWidth-bar.clientWidth,page:document.documentElement.scrollWidth<=innerWidth,widths:[...bar.querySelectorAll<HTMLElement>('.ui-tab')].map(t=>t.getBoundingClientRect().width),menu:menu.width,menuInside:menu.right<=innerWidth};});
 expect(m.overflow).toBeLessThanOrEqual(0);expect(m.page).toBe(true);expect(m.menuInside).toBe(true);
 for(const w of m.widths)expect(w).toBeGreaterThanOrEqual(44);
 expect(m.menu).toBeGreaterThanOrEqual(44);
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
 await expect(page.locator('.app-navigation')).toHaveAttribute('data-apps','on');
 await expect(page.locator('.app-tabbar .ui-tab')).toHaveCount(6);
 const metrics=await page.evaluate(()=>{
  // Below 360px the Apps tab is hidden (it moves to the Menu sheet), so measure the tabs that are shown.
  const bar=document.querySelector<HTMLElement>('.app-tabbar')!,tabs=[...bar.querySelectorAll<HTMLElement>('.ui-tab')].filter(t=>t.getBoundingClientRect().width>0),menu=document.querySelector<HTMLElement>('.app-menu')!;
  const box=bar.getBoundingClientRect(),m=menu.getBoundingClientRect();
  return {scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth,barOverflow:bar.scrollWidth-bar.clientWidth,
   tabsInside:tabs.every(t=>{const r=t.getBoundingClientRect();return r.left>=box.left-1&&r.right<=box.right+1;}),tabW:Math.min(...tabs.map(t=>t.getBoundingClientRect().width)),
   labels:tabs.map(t=>t.scrollWidth-t.clientWidth),menuGap:m.left-box.right,menuInside:m.right<=innerWidth,shown:tabs.length,tv:getComputedStyle(bar.querySelector('.tab-tv')!,'::after').content};
 });
 expect(metrics.scroll).toBeLessThanOrEqual(metrics.client);
 expect(metrics.barOverflow).toBeLessThanOrEqual(1);expect(metrics.tabsInside).toBe(true);expect(metrics.menuInside).toBe(true);
 expect(Math.max(...metrics.labels)).toBeLessThanOrEqual(1);expect(metrics.menuGap).toBeGreaterThanOrEqual(0);
 // f60500b: every control is at least 44 px; the 36 px allowance went with Apps moving to the Menu below 360px.
 expect(metrics.tabW).toBeGreaterThanOrEqual(44);
 expect(metrics.shown).toBe(width<360?5:6);
 // Between 360 and 439px the TV tab shows a CSS-only "TV" label; its accessible name stays "TV Shows".
 expect(metrics.tv).toBe(width>=360&&width<440?'"TV"':'none');
 await expect(page.getByRole('link',{name:'TV Shows',exact:true})).toBeVisible();
});

test('leaving #/social before its chunk loads keeps the library',async({page,context})=>{
 await connect(context);await page.goto('/');await guest(page);await expect(page.locator('.game-card').first()).toBeVisible();
 let release:()=>void=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route(/\/src\/social\/view/,async route=>{await gate;await route.continue();});
 await page.evaluate(()=>{location.hash='#/social';});
 await expect(page.locator('.loading')).toContainText('Opening Social');
 await page.evaluate(()=>{location.hash='#/collection';});
 await expect(page.locator('.game-card').first()).toBeVisible();
 release();await page.waitForTimeout(800);
 await expect(page.locator('.game-card').first()).toBeVisible();await expect(page.locator('section.social-view')).toHaveCount(0);
 await expect(page.locator('body')).not.toHaveClass(/social-active/);
});

// The shell's tab bar with the capability probe answering (a 401 JSON, as a deployed chat handler gives an anonymous caller).
test.describe('shell navigation with Apps available',()=>{
 test.beforeEach(async({context})=>{
  await seedStudyTopic(context);
  await context.route('**/.netlify/functions/chat**',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({error:'Log in to use Chat.'})}));
 });
 const controls=(page:Page)=>page.locator('.app-navigation .ui-tab');
 const sizes=(page:Page)=>controls(page).evaluateAll(els=>els.map(el=>{const r=el.getBoundingClientRect();return {name:el.getAttribute('aria-label')??el.textContent?.trim(),width:r.width,height:r.height,left:r.left,right:r.right};}).filter(c=>c.width>0&&c.height>0));
 async function ready(page:Page,width:number){
  await page.setViewportSize({width,height:844});await page.goto('/');
  await expect(page.locator('.app-navigation')).toHaveAttribute('data-apps','on');
  await expect(page.locator('.app-tabbar')).toBeVisible();
 }
 for(const width of [320,360,390,1440])test(`every navigation control is at least 44 px at ${width}px`,async({page})=>{
  await ready(page,width);
  const list=await sizes(page);
  expect(list.length).toBe(width<360?6:7);
  for(const c of list){expect(c.width,`${c.name} width`).toBeGreaterThanOrEqual(44);expect(c.height,`${c.name} height`).toBeGreaterThanOrEqual(44);}
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
 test('the island fits within the viewport with its side insets at 1366px',async({page})=>{
  await ready(page,1366);
  const nav=(await page.locator('.app-navigation').boundingBox())!,bar=(await page.locator('.app-tabbar').boundingBox())!;
  expect(nav.x).toBeGreaterThanOrEqual(12);expect(nav.x+nav.width).toBeLessThanOrEqual(1366-12);
  expect(bar.x).toBeGreaterThanOrEqual(nav.x);
  const list=await sizes(page);
  for(const c of list){expect(c.left).toBeGreaterThanOrEqual(nav.x);expect(c.right).toBeLessThanOrEqual(nav.x+nav.width);}
 });
 test('at 320px Apps leaves the bar and opens from the Menu sheet',async({page})=>{
  await ready(page,320);
  await expect(page.locator('.app-tabbar [data-action=apps]')).toBeHidden();
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await expect(page.locator('#menu')).toBeVisible();
  await page.locator('#menu').getByRole('button',{name:'Apps',exact:true}).click();
  await expect(page.locator('#apps-dialog')).toBeVisible();
  await expect(page.locator('#menu')).toBeHidden();
 });
 for(const width of [360,390])test(`at ${width}px the Apps tab is in the bar and opens the launcher`,async({page})=>{
  await ready(page,width);
  const tab=page.locator('.app-tabbar [data-action=apps]');
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.locator('#apps-dialog')).toBeVisible();
 });
});
