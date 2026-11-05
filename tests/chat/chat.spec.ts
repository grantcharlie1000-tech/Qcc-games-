import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {NetlifyDB} from '@netlify/database-dev';
import {getDatabase} from '@netlify/database';
import sharp from 'sharp';
import {createAccountsHandler} from '../../src/accounts/server';
import {createChatHandler} from '../../src/chat/server';
import {createSocialHandler} from '../../src/social/server';
import {createMediaHandler} from '../../src/media/server';
import {createMemoryStore} from '../../src/media/store';

const database=new NetlifyDB({logger:()=>{}});let pool:ReturnType<typeof getDatabase>['pool'];
let accounts:ReturnType<typeof createAccountsHandler>,chat:ReturnType<typeof createChatHandler>,social:ReturnType<typeof createSocialHandler>,media:ReturnType<typeof createMediaHandler>;
const counts={messages:0,list:0,open_snap:0};
test.beforeAll(async()=>{
 const connectionString=await database.start();await database.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;
 const store=createMemoryStore();const db={query:(text:string,values?:unknown[])=>pool.query(text,values),connect:()=>pool.connect()} as never;
 accounts=createAccountsHandler(pool);chat=createChatHandler(db,store);social=createSocialHandler(db,store);media=createMediaHandler(db,store);
});
test.afterAll(async()=>{await pool?.end();await database.stop();});
test.use({viewport:{width:390,height:844}});

const PASSWORD='long enough password';
async function connect(context:BrowserContext,options:{pollScale?:number}={}){
 await context.addInitScript(scale=>{
  if(window!==window.top)return;
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
  if(scale)(window as unknown as {__QCC_POLL_SCALE__:number}).__QCC_POLL_SCALE__=scale;
 },options.pollScale);
 for(const [name,handle] of [['accounts',accounts],['chat',chat],['social',social],['media',media]] as const)await context.route(`**/.netlify/functions/${name}**`,async route=>{
  const req=route.request();
  if(name==='chat'){
   const url=req.url();
   if(url.includes('action=messages'))counts.messages++;else if(url.includes('action=list'))counts.list++;else if(url.includes('action=open_snap'))counts.open_snap++;
  }
  const body=['POST','PUT'].includes(req.method())?(name==='media'?req.postDataBuffer()??undefined:req.postData()??undefined):undefined;
  const result=await handle(new Request(req.url(),{method:req.method(),headers:req.headers(),body:body as BodyInit|undefined}));
  await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:Buffer.from(await result.arrayBuffer())});
 });
}
const call=(handle:(request:Request)=>Promise<Response>,action:string,token:string|null,body?:unknown)=>
 handle(new Request(`https://qcc.test/.netlify/functions/x?action=${action}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}));
async function signup(name:string):Promise<string>{
 const response=await call(accounts,'signup',null,{username:name,password:PASSWORD});expect(response.status).toBe(201);return (await response.json()).token;
}
async function logIn(page:Page,username:string){
 const dialog=page.locator('#accounts-dialog');await expect(dialog).toBeVisible();
 await dialog.getByLabel('Username',{exact:true}).fill(username);await dialog.getByLabel('Password',{exact:true}).fill(PASSWORD);
 await dialog.locator('form').getByRole('button',{name:'Log in',exact:true}).click();await expect(dialog).not.toBeVisible();
}
const stamp=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
async function user(prefix:string){const name=`${prefix}_${stamp()}`.slice(0,24);return {name,token:await signup(name)};}
type User={name:string;token:string};
async function befriend(a:User,b:User){
 expect((await call(chat,'request',a.token,{username:b.name})).status).toBe(200);
 expect((await call(chat,'respond',b.token,{username:a.name,accept:true})).status).toBe(200);
}
const say=async(from:User,to:User,body:string)=>{const r=await call(chat,'send',from.token,{to:to.name,kind:'text',body});expect(r.status,await r.clone().text()).toBe(201);return await r.json() as {id:string};};
async function open(page:Page,name:string,hash='#/chat'){
 await page.goto('/');await logIn(page,name);
 await page.evaluate(h=>{location.hash=h;},hash);
 await expect(page.locator('section.chat-view')).toBeVisible();
}
async function second(browser:import('@playwright/test').Browser,name:string,hash:string,pollScale=0.05){
 const context=await browser.newContext({viewport:{width:390,height:844}});await connect(context,{pollScale});
 const page=await context.newPage();await open(page,name,hash);return {context,page};
}
const png=(width=600,height=400,color='#46ecd5')=>sharp({create:{width,height,channels:3,background:color}}).png().toBuffer();
const composer=(page:Page)=>page.getByRole('textbox',{name:/^Message to /});
async function send(page:Page,text:string){
 await composer(page).fill(text);await page.getByRole('button',{name:'Send message'}).click();
}
const entry=(page:Page,text:string)=>page.locator('.chat-entry').filter({hasText:text});
async function menuOn(page:Page,text:string){
 const row=entry(page,text);await row.hover();await row.getByRole('button',{name:'Message options'}).click();
}

test('friend request, accept, exchange messages in two browser contexts',async({page,browser,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('fa'),b=await user('fb');
 await open(page,a.name,'#/chat/add');
 await expect(page.getByRole('heading',{name:'Add a friend',level:1})).toBeVisible();
 await page.locator('#chat-add-username').fill('x');
 await page.getByRole('button',{name:'Send request'}).click();
 await expect(page.getByText('Usernames are 3–24 letters, numbers, dots, dashes or underscores.')).toBeVisible();
 await page.locator('#chat-add-username').fill(b.name);
 await page.getByRole('button',{name:'Send request'}).click();
 await expect(page.getByText(`Request sent. If @${b.name} accepts, they'll appear in your chats.`)).toBeVisible();
 await expect(page.locator('#chat-add-username')).toHaveValue('');
 // The sent request is remembered by this device on the Add screen; the server no longer lists it.
 await expect(page.locator('.chat-sent').getByText('Request sent')).toBeVisible();

 const other=await second(browser,b.name,'#/chat');const pb=other.page;
 await expect(pb.getByRole('heading',{name:'Friend requests · 1'})).toBeVisible();
 await expect(pb.getByText('Wants to be friends')).toBeVisible();
 await pb.getByRole('button',{name:'Accept'}).click();
 await expect(pb.getByRole('heading',{name:/Friend requests/})).toBeHidden();
 const rowB=pb.locator('a.chat-row').filter({hasText:a.name});
 await expect(rowB).toBeVisible();await expect(rowB).toContainText("You're now friends");

 // A sees the new friend through polling, opens the chat and sends a message.
 await page.getByRole('link',{name:'Chats'}).click();
 const rowA=page.locator('a.chat-row').filter({hasText:b.name});
 await expect(rowA).toBeVisible();
 await rowA.click();
 await expect(page).toHaveURL(new RegExp(`#/chat/with/${b.name}$`));
 await expect(page.locator('.chat-tabbar')).toHaveAttribute('data-hidden','true');
 await expect(page.locator('.chat-intro')).toContainText("Messages disappear 24 hours after they're viewed. Not end-to-end encrypted.");
 await send(page,'Kia ora from A');
 await expect(entry(page,'Kia ora from A')).toBeVisible();
 await expect(entry(page,'Kia ora from A').locator('.chat-receipt')).toHaveText('Not seen yet');

 // B's list shows it as new, with the unread badge, before B opens the chat.
 await expect(rowB).toContainText('New message');
 await expect(rowB.locator('.chat-unread')).toHaveText('1');
 await expect(rowB).toHaveAccessibleName(new RegExp(`^${a.name}, New message, (just now|.* ago), 1 unread$`));
 await rowB.click();
 await expect(entry(pb,'Kia ora from A')).toBeVisible();
 await expect(pb.locator('.chat-group-name[data-who=friend]').first()).toHaveText(a.name);
 // A's receipt flips to "They've seen it" once B has viewed it (polling).
 await expect(entry(page,'Kia ora from A').locator('.chat-receipt')).toHaveText("They've seen it");

 // B replies; A receives it by polling while the conversation is open.
 await send(pb,'Kia ora from B');
 await expect(entry(page,'Kia ora from B')).toBeVisible();
 await expect(page.locator('.chat-log')).toHaveAttribute('aria-live','polite');
 await other.context.close();
});

test('snap opens once',async({page,browser,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('sa'),b=await user('sb');await befriend(a,b);
 await open(page,a.name,`#/chat/with/${b.name}`);
 await expect(page.locator('.chat-intro')).toBeVisible();
 await page.locator('input[type=file]').setInputFiles({name:'snap.png',mimeType:'image/png',buffer:await png()});
 const sheet=page.locator('#chat-send-photo');await expect(sheet).toBeVisible();
 await expect(sheet.getByRole('heading',{name:`Send a photo to ${b.name}`})).toBeVisible();
 await expect(sheet).toContainText("It's deleted after they close it, or after 30 days if it's never opened. Screenshots can't be blocked on the web.");
 const sendPhoto=sheet.getByRole('button',{name:'Send photo'});
 await expect(sendPhoto).toBeEnabled();await sendPhoto.click();
 await expect(sheet).not.toBeVisible();
 await expect(page.locator('.chat-snap').filter({hasText:'Photo · Not seen yet'})).toBeVisible();

 const other=await second(browser,b.name,`#/chat/with/${a.name}`);const pb=other.page;
 const tile=pb.getByRole('button',{name:`Photo from ${a.name}. Open once. It's deleted when you close it.`});
 await expect(tile).toBeVisible();await expect(tile).toContainText('Photo · Open once');await expect(tile).toContainText('Deleted when you close it');await expect(tile).not.toContainText('Tap to view');
 const id=await pb.locator('.chat-entry[data-kind=snap]').getAttribute('data-id');
 counts.open_snap=0;
 await tile.click();
 const viewer=pb.locator('#chat-snap');await expect(viewer).toBeVisible();
 const photo=viewer.locator('img.chat-snap-img');await expect(photo).toBeVisible();
 await expect.poll(()=>photo.evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBeGreaterThan(0);
 await expect(photo).toHaveAttribute('alt',`Photo from ${a.name}`);
 await expect(viewer).toContainText("This photo is deleted when you close it. Screenshots can't be blocked on the web.");
 await expect(viewer.locator('.chat-snap-secs')).toHaveText(/^\d+s$/);
 await expect(viewer.getByRole('button',{name:'Close photo'})).toBeFocused();
 await viewer.getByRole('button',{name:'Close photo'}).click();
 await expect(viewer).toHaveCount(0);
 expect(counts.open_snap).toBe(1);
 // Opened: the tile is gone, the thread and the sender both say so, and the UI offers no second attempt.
 await expect(pb.locator('.chat-snap').filter({hasText:"Photo · You've seen it"})).toBeVisible();
 await expect(pb.locator('button.chat-snap')).toHaveCount(0);
 await expect(pb.locator('.chat-snap').filter({hasText:"Photo · You've seen it"})).toBeVisible();
 await expect(page.locator('.chat-snap').filter({hasText:"Photo · They've seen it"})).toBeVisible();
 expect(counts.open_snap).toBe(1);
 // The API agrees: a second open is 410.
 const again=await call(chat,'open_snap',b.token,{id});expect(again.status).toBe(410);
 await other.context.close();
});

async function snapFrom(from:User,to:User){
 const upload=await media(new Request('https://qcc.test/.netlify/functions/media?action=upload&purpose=snap',{method:'POST',headers:{'content-type':'image/png',authorization:'Bearer '+from.token},body:await png() as unknown as BodyInit}));
 expect(upload.status,await upload.clone().text()).toBeLessThan(300);
 const {id}=await upload.json() as {id:string};
 const sent=await call(chat,'send',from.token,{to:to.name,kind:'snap',mediaId:id});expect(sent.status,await sent.clone().text()).toBe(201);
}

test('snap viewer closes on Escape and after the countdown',async({page,context})=>{
 test.setTimeout(45000);
 await connect(context,{pollScale:0.05});
 const a=await user('ea'),b=await user('eb');await befriend(a,b);
 await snapFrom(a,b);await snapFrom(a,b);
 await open(page,b.name,`#/chat/with/${a.name}`);
 const tiles=page.locator('button.chat-snap');await expect(tiles).toHaveCount(2);
 await tiles.first().click();
 const viewer=page.locator('#chat-snap');await expect(viewer.locator('img.chat-snap-img')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(viewer).toHaveCount(0);
 await expect(page.locator('.chat-view')).toBeVisible();
 await expect(tiles).toHaveCount(1);
 // The second one closes itself after SNAP_VIEW_SECONDS and the ring and seconds run while it is open.
 await tiles.first().click();
 await expect(viewer.locator('img.chat-snap-img')).toBeVisible();
 await expect(viewer.locator('.chat-snap-dot')).toHaveCount(10);await expect(viewer.locator('.chat-snap-ring')).toHaveCount(0);
 await expect(viewer.locator('.chat-snap-secs')).toHaveText(/^(10|9|8)s$/);
 await expect(viewer.locator('.chat-snap-secs')).toHaveText(/^[3-6]s$/,{timeout:9000});
 await expect(viewer).toHaveCount(0,{timeout:12000});
 await expect(tiles).toHaveCount(0);
 await expect(page.locator('.chat-snap').filter({hasText:"Photo · You've seen it"})).toHaveCount(2);
});

test('save keeps message, unsend removes for both',async({page,browser,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('va'),b=await user('vb');await befriend(a,b);
 await open(page,a.name,`#/chat/with/${b.name}`);
 await send(page,'keep me');await send(page,'remove me');
 await expect(entry(page,'remove me')).toBeVisible();
 const other=await second(browser,b.name,`#/chat/with/${a.name}`);const pb=other.page;
 await expect(entry(pb,'keep me')).toBeVisible();await expect(entry(pb,'remove me')).toBeVisible();
 // Own message menu: Unsend, no Report; theirs: Report, no Unsend.
 await menuOn(pb,'keep me');
 const menu=pb.getByRole('menu',{name:'Message options'});
 await expect(menu.getByRole('menuitem',{name:'Report message'})).toBeVisible();
 await expect(menu.getByRole('menuitem',{name:'Unsend'})).toHaveCount(0);
 await menu.getByRole('menuitem',{name:'Keep message'}).click();
 await expect(entry(pb,'keep me').locator('.chat-saved')).toHaveText('Kept');await expect(pb.locator('#announcer')).toHaveText('Message kept.');
 await expect(entry(pb,'keep me')).toHaveClass(/is-saved/);
 // A sees the saved state too (it is the same message).
 await expect(entry(page,'keep me').locator('.chat-saved')).toBeVisible();
 await menuOn(page,'remove me');
 const mine=page.getByRole('menu',{name:'Message options'});
 await expect(mine.getByRole('menuitem',{name:'Report message'})).toHaveCount(0);
 await mine.getByRole('menuitem',{name:'Unsend'}).click();
 await expect(page.getByText('Message unsent.')).toBeVisible();
 await expect(entry(page,'remove me')).toHaveCount(0);
 await expect(entry(pb,'remove me')).toHaveCount(0);
 await expect(entry(pb,'keep me')).toBeVisible();
 // Server state: the saved message survives, the unsent one is gone.
 const server=await (await call(chat,`messages&with=${b.name}`,a.token)).json() as {messages:{body:string;saved:boolean}[]};
 expect(server.messages.map(m=>m.body)).toEqual(['keep me']);expect(server.messages[0]!.saved).toBe(true);
 // Let it disappear goes back.
 await menuOn(pb,'keep me');await pb.getByRole('menuitem',{name:'Let it disappear'}).click();
 await expect(entry(pb,'keep me').locator('.chat-saved')).toHaveCount(0);
 await other.context.close();
});

test('a failed send keeps the text and offers a retry, with the limit copy',async({page,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('qa'),b=await user('qb');await befriend(a,b);
 let failures=1;
 await page.route('**/.netlify/functions/chat?action=send',route=>{
  if(failures-->0)return route.fulfill({status:429,headers:{'content-type':'application/json','retry-after':'30'},body:'{"error":"rate_limited"}'});
  return route.fallback();
 });
 await open(page,a.name,`#/chat/with/${b.name}`);
 await expect(page.locator('.chat-intro')).toBeVisible();
 await send(page,'try me twice');
 const failed=entry(page,'try me twice');
 await expect(failed.getByRole('button',{name:'Not sent. Tap to try again.'})).toBeVisible();
 await expect(page.getByText("You're sending messages quickly. Wait a moment, then try again.")).toBeVisible();
 await expect(failed).toHaveClass(/is-failed/);
 await failed.getByRole('button',{name:'Not sent. Tap to try again.'}).click();
 await expect(failed.getByRole('button',{name:'Not sent. Tap to try again.'})).toHaveCount(0);
 await expect(failed).not.toHaveClass(/is-pending|is-failed/);
 const server=await (await call(chat,`messages&with=${b.name}`,a.token)).json() as {messages:{body:string}[]};
 expect(server.messages.map(m=>m.body)).toEqual(['try me twice']);
 // Over the limit: the send button stays off and the count goes negative.
 await composer(page).fill('x'.repeat(1010));
 await expect(page.locator('.chat-count')).toHaveText('-10');
 await expect(page.getByRole('button',{name:'Send message'})).toBeDisabled();
});

test('the snap viewer closes when the tab is hidden and when leaving the chat',async({page,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('ha'),b=await user('hb');await befriend(a,b);
 await snapFrom(a,b);await snapFrom(a,b);
 await open(page,b.name,`#/chat/with/${a.name}`);
 const tiles=page.locator('button.chat-snap');await expect(tiles).toHaveCount(2);
 await tiles.first().click();
 const viewer=page.locator('#chat-snap');await expect(viewer.locator('img.chat-snap-img')).toBeVisible();
 await page.evaluate(()=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'hidden'});
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect(viewer).toHaveCount(0);
 await page.evaluate(()=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>'visible'});
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});
  document.dispatchEvent(new Event('visibilitychange'));
 });
 await expect(tiles).toHaveCount(1);
 await tiles.first().click();
 await expect(viewer.locator('img.chat-snap-img')).toBeVisible();
 await page.evaluate(()=>{location.hash='#/collection';});
 await expect(viewer).toHaveCount(0);
 await expect(page.locator('section.chat-view')).toHaveCount(0);
});

test('remove friend goes through a confirm sheet',async({page,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('da'),b=await user('db');await befriend(a,b);
 await open(page,a.name,`#/chat/with/${b.name}`);
 await expect(page.locator('.chat-intro')).toBeVisible();
 await page.getByRole('button',{name:'Chat info',exact:true}).click();
 await page.locator('#chat-info').getByRole('button',{name:'Remove friend'}).click();
 const confirm=page.locator('#apps-confirm');
 await expect(confirm.getByRole('heading',{name:`Remove ${b.name}?`})).toBeVisible();
 await expect(confirm).toContainText("You won't be able to message each other until one of you sends a new request. Your chat stays until it expires.");
 await expect(confirm.getByRole('button',{name:'Cancel'})).toBeFocused();
 await confirm.getByRole('button',{name:'Remove',exact:true}).click();
 await expect(page).toHaveURL(/#\/chat$/);
 await expect(page.getByText(`Removed ${b.name}.`)).toBeVisible();
 await expect(page.locator('a.chat-row').filter({hasText:b.name})).toHaveCount(0);
 expect((await call(chat,`messages&with=${b.name}`,a.token)).status).toBe(404);
});

test('Escape closes the snap viewer and revokes the photo URL; the menu button never covers a snap',async({page,context})=>{
 await connect(context,{pollScale:0.05});
 await page.addInitScript(()=>{
  const w=window as unknown as {__revoked:string[];__created:string[]};w.__revoked=[];w.__created=[];
  const revoke=URL.revokeObjectURL.bind(URL),create=URL.createObjectURL.bind(URL);
  URL.revokeObjectURL=(u:string)=>{w.__revoked.push(u);revoke(u);};
  URL.createObjectURL=(o:Blob|MediaSource)=>{const u=create(o);w.__created.push(u);return u;};
 });
 const a=await user('oa'),b=await user('ob');await befriend(a,b);
 await snapFrom(a,b);
 await open(page,b.name,`#/chat/with/${a.name}`);
 const tile=page.locator('button.chat-snap');await expect(tile).toBeVisible();
 await tile.hover();
 const more=page.locator('.chat-entry[data-kind=snap] .chat-msg-more');
 const t=(await tile.boundingBox())!,m=(await more.boundingBox())!;
 expect(m.x).toBeGreaterThanOrEqual(t.x+t.width-0.5);
 await tile.click();
 await expect(page.locator('#chat-snap img.chat-snap-img')).toBeVisible();
 const url=await page.locator('#chat-snap img.chat-snap-img').getAttribute('src');
 await page.keyboard.press('Escape');
 await expect(page.locator('#chat-snap')).toHaveCount(0);
 const w=await page.evaluate(()=>window as unknown as {__revoked:string[]});void w;
 await expect.poll(()=>page.evaluate(()=>(window as unknown as {__revoked:string[]}).__revoked)).toContain(url);
});

test('report a message from its menu',async({page,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('ra'),b=await user('rb');await befriend(a,b);
 await say(b,a,'rude words');
 await open(page,a.name,`#/chat/with/${b.name}`);
 await menuOn(page,'rude words');
 await page.getByRole('menuitem',{name:'Report message'}).click();
 const sheet=page.locator('#apps-report');await expect(sheet).toBeVisible();
 await expect(sheet.getByRole('heading',{name:'Report message'})).toBeVisible();
 await expect(sheet).toContainText('A copy of this message goes to QCC moderators, even after it disappears.');
 await expect(sheet.getByRole('radio',{name:'rude words'})).toBeChecked();
 await sheet.getByRole('radio',{name:'Harassment or bullying'}).check();
 await sheet.getByRole('button',{name:'Send report'}).click();
 await expect(sheet.getByText('Thanks. QCC moderators will review this.')).toBeVisible();
 await sheet.getByRole('button',{name:'Done'}).click();
});

test('retention change shows system line',async({page,browser,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('ta'),b=await user('tb');await befriend(a,b);
 await open(page,a.name,`#/chat/with/${b.name}`);
 const other=await second(browser,b.name,`#/chat/with/${a.name}`);const pb=other.page;
 await expect(pb.locator('.chat-intro')).toBeVisible();
 await page.getByRole('button',{name:'Chat info',exact:true}).click();
 const info=page.locator('#chat-info');await expect(info).toBeVisible();
 await expect(info.getByRole('heading',{name:b.name})).toBeVisible();
 await expect(info).toContainText('Not end-to-end encrypted. QCC moderators can read messages that are reported.');
 await expect(info).toContainText('Unopened messages and photos are deleted after 30 days. Kept messages stay up to 90 days.');
 const group=info.getByRole('radiogroup',{name:'Messages disappear'});
 await expect(group.getByRole('radio',{name:'24 hours after viewing'})).toBeChecked();
 await group.locator('label',{hasText:'7 days after sending'}).click();
 await expect(group.getByRole('radio',{name:'7 days after sending'})).toBeChecked();
 await info.getByRole('button',{name:'Close chat info'}).click();
 await expect(info).not.toBeVisible();
 const line="Messages now disappear 7 days after they're sent.";
 await expect(page.locator('.chat-system').filter({hasText:line})).toBeVisible();
 await expect(page.locator('.chat-intro')).toContainText("Messages disappear 7 days after they're sent.");
 await expect(pb.locator('.chat-system').filter({hasText:line})).toBeVisible();
 await expect(pb.locator('.chat-intro')).toContainText("Messages disappear 7 days after they're sent.");
 // Back to 24 hours adds the other line.
 await page.getByRole('button',{name:'Chat info',exact:true}).click();
 await page.locator('#chat-info').locator('label',{hasText:'24 hours after viewing'}).click();
 await expect(page.locator('.chat-system').filter({hasText:"Messages now disappear 24 hours after they're viewed."})).toBeVisible();
 await other.context.close();
});

test('chat info: report list, block and delete go through confirm sheets',async({page,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('ia'),b=await user('ib');await befriend(a,b);
 await say(b,a,'first words');await say(b,a,'second words');
 await open(page,a.name,`#/chat/with/${b.name}`);
 await expect(entry(page,'second words')).toBeVisible();
 await page.getByRole('button',{name:'Chat info',exact:true}).click();
 await page.locator('#chat-info').getByRole('button',{name:'Report a message'}).click();
 const report=page.locator('#apps-report');await expect(report).toBeVisible();
 await expect(report.getByRole('radio',{name:'second words'})).toBeVisible();await expect(report.getByRole('radio',{name:'first words'})).toBeVisible();
 await expect(report.getByRole('button',{name:'Send report'})).toBeDisabled();
 await report.getByRole('radio',{name:'first words'}).check();await report.getByRole('radio',{name:'Spam'}).check();
 await expect(report.getByRole('button',{name:'Send report'})).toBeEnabled();
 await report.getByRole('button',{name:'Close report'}).click();
 // Delete conversation: confirm, then the list.
 await page.getByRole('button',{name:'Chat info',exact:true}).click();
 await page.locator('#chat-info').getByRole('button',{name:'Delete conversation'}).click();
 const confirm=page.locator('#apps-confirm');await expect(confirm).toBeVisible();
 await expect(confirm.getByRole('heading',{name:'Delete this conversation?'})).toBeVisible();
 await expect(confirm.getByRole('button',{name:'Cancel'})).toBeFocused();
 await confirm.getByRole('button',{name:'Delete',exact:true}).click();
 await expect(page).toHaveURL(/#\/chat$/);
 await expect(page.getByText('Conversation deleted.')).toBeVisible();
 // Block from the info sheet.
 await page.goto('/');await page.evaluate(h=>{location.hash=h;},`#/chat/with/${b.name}`);
 await expect(page.locator('.chat-intro')).toBeVisible();
 await page.getByRole('button',{name:'Chat info',exact:true}).click();
 await page.locator('#chat-info').getByRole('button',{name:`Block ${b.name}`}).click();
 await expect(page.locator('#apps-confirm').getByRole('heading',{name:`Block @${b.name}?`})).toBeVisible();
 await page.locator('#apps-confirm').getByRole('button',{name:'Block',exact:true}).click();
 await expect(page).toHaveURL(/#\/chat$/);
 await expect(page.getByText(`Blocked @${b.name}.`)).toBeVisible();
 await expect(page.locator('a.chat-row').filter({hasText:b.name})).toHaveCount(0);
});

test('Block warns that the chat closes, and "Report a message first" reports before blocking',async({page,context})=>{
 await connect(context);
 const a=await user('rb'),b=await user('rc');await befriend(a,b);await say(b,a,'please stop');
 await open(page,a.name,`#/chat/with/${b.name}`);
 await expect(entry(page,'please stop')).toBeVisible();
 await page.getByRole('button',{name:'Chat info',exact:true}).click();
 await page.locator('#chat-info').getByRole('button',{name:`Block ${b.name}`}).click();
 const confirm=page.locator('#apps-confirm');
 await expect(confirm).toContainText("After blocking, this chat closes and you can't open it again.");
 await confirm.getByRole('button',{name:'Report a message first'}).click();
 const report=page.locator('#apps-report');await expect(report).toBeVisible();
 await report.getByRole('radio',{name:'please stop'}).check();await report.getByRole('radio',{name:'Harassment or bullying'}).check();
 await report.getByRole('button',{name:'Send report'}).click();
 await expect(report.getByRole('heading',{name:'Report sent'})).toBeVisible();
 await report.getByRole('button',{name:'Done'}).click();
 await expect(report).not.toBeVisible();
 const reports=await pool.query(`SELECT r.snapshot FROM social_reports r JOIN accounts t ON t.id=r.target_account_id WHERE t.username=$1 AND r.target_kind='message'`,[b.name]);
 expect(reports.rows).toHaveLength(1);expect(reports.rows[0].snapshot).toContain('please stop');
 // Still friends, so the user can now block.
 await page.getByRole('button',{name:'Chat info',exact:true}).click();
 await page.locator('#chat-info').getByRole('button',{name:`Block ${b.name}`}).click();
 await confirm.getByRole('button',{name:'Block',exact:true}).click();
 await expect(page.getByText(`Blocked @${b.name}.`)).toBeVisible();
 const contacts=await pool.query(`SELECT count(*)::int AS n FROM chat_contacts c JOIN accounts x ON x.id=c.owner_id JOIN accounts y ON y.id=c.contact_id WHERE x.username IN ($1,$2) AND y.username IN ($1,$2)`,[a.name,b.name]);
 expect(contacts.rows[0].n).toBe(0);
 const stillThere=await pool.query(`SELECT count(*)::int AS n FROM social_reports r JOIN accounts t ON t.id=r.target_account_id WHERE t.username=$1`,[b.name]);
 expect(stillThere.rows[0].n).toBe(1);
});

test('non-friend cannot be messaged (UI shows request flow)',async({page,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('na'),b=await user('nb');
 await open(page,a.name,'#/chat/with/stranger_nobody');
 await expect(page.getByRole('heading',{name:"You're not friends yet"})).toBeVisible();
 await expect(page.locator('.chat-view')).not.toContainText(/not_found|error|404/i);
 await expect(page.locator('.chat-composer')).toBeHidden();
 await expect(page.getByRole('button',{name:'Chat info',exact:true})).toHaveCount(0);
 // An existing non-friend looks identical.
 await page.evaluate(h=>{location.hash=h;},`#/chat/with/${b.name}`);
 await expect(page.getByRole('heading',{name:"You're not friends yet"})).toBeVisible();
 await page.getByRole('button',{name:'Send friend request'}).click();
 await expect(page.getByText(`Request sent. If @${b.name} accepts, they'll appear in your chats.`)).toBeVisible();
 // The server really has the request.
 const list=await (await call(chat,'list',b.token)).json() as {incoming:{friend:{username:string}}[]};
 expect(list.incoming.map(r=>r.friend.username)).toEqual([a.name]);
 // Unknown username: the same reply, no leak.
 await page.evaluate(h=>{location.hash=h;},'#/chat/with/stranger_nobody');
 await page.getByRole('button',{name:'Send friend request'}).click();
 await expect(page.getByText("Request sent. If @stranger_nobody accepts, they'll appear in your chats.")).toBeVisible();
});

test('message text is rendered safely',async({page,browser,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('xa'),b=await user('xb');await befriend(a,b);
 const payload='<img src=x onerror="window.__pwned=1"> <b>bold</b> javascript:alert(1)';
 await say(b,a,payload);
 await open(page,a.name,`#/chat/with/${b.name}`);
 const row=entry(page,'<img src=x');await expect(row).toBeVisible();
 await expect(row).toContainText('<b>bold</b>');
 await expect(page.locator('.chat-log img')).toHaveCount(0);
 await expect(page.locator('.chat-log b')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as unknown as {__pwned?:number}).__pwned)).toBeUndefined();
 // Typed by the user it is just as inert, and links stay http(s) only.
 await send(page,'see https://example.com/a?b=1 <script>window.__pwned=2</script>');
 const mine=entry(page,'see https://example.com');await expect(mine).toBeVisible();
 await expect(mine.locator('a')).toHaveAttribute('href','https://example.com/a?b=1');
 await expect(mine.locator('a')).toHaveAttribute('rel','noopener noreferrer nofollow ugc');
 expect(await page.evaluate(()=>(window as unknown as {__pwned?:number}).__pwned)).toBeUndefined();
 void browser;
});

test('polling stops when hidden',async({page,context})=>{
 await connect(context,{pollScale:0.04});
 const a=await user('pa'),b=await user('pb');await befriend(a,b);
 await open(page,a.name,`#/chat/with/${b.name}`);
 const setVisibility=(state:'visible'|'hidden')=>page.evaluate(value=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>value});
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>value==='hidden'});
  document.dispatchEvent(new Event('visibilitychange'));
 },state);
 await expect.poll(()=>counts.messages).toBeGreaterThan(4);
 await setVisibility('hidden');
 await expect.poll(async()=>{const before=counts.messages;await page.waitForTimeout(250);return counts.messages===before;}).toBe(true);
 const hidden=counts.messages;await page.waitForTimeout(1200);
 expect(counts.messages).toBe(hidden);
 await setVisibility('visible');
 await expect.poll(()=>counts.messages).toBeGreaterThan(hidden+1);
 // Leaving the conversation stops its polling for good.
 await page.evaluate(()=>{location.hash='#/chat';});
 await expect(page.getByRole('heading',{name:'Chats',level:1})).toBeVisible();
 await page.waitForTimeout(300);const left=counts.messages;await page.waitForTimeout(800);
 expect(counts.messages).toBe(left);
});

test('phone and desktop layouts',async({page,context})=>{
 await connect(context,{pollScale:0.2});
 const a=await user('la'),b=await user('lb'),c=await user('lc');await befriend(a,b);await befriend(c,a);
 await say(b,a,'A long message with an unbroken string '+'x'.repeat(120)+' and more words after it so it wraps');
 await say(a,b,'short');
 await open(page,a.name,'#/chat');
 const noScroll=()=>page.evaluate(()=>{
  const view=document.querySelector<HTMLElement>('section.chat-view')!;const doc=document.documentElement;
  const wide=[...view.querySelectorAll<HTMLElement>('*')].filter(el=>el.scrollWidth>el.clientWidth+1&&getComputedStyle(el).overflowX==='visible'&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().right>innerWidth+1);
  return {docOk:doc.scrollWidth<=innerWidth,viewOk:view.scrollWidth<=view.clientWidth,wide:wide.map(el=>el.className)};
 });
 const check=async()=>{const r=await noScroll();expect(r.docOk).toBe(true);expect(r.viewOk).toBe(true);expect(r.wide).toEqual([]);};
 for(const size of [{width:390,height:844},{width:1440,height:900}]){
  await page.setViewportSize(size);
  for(const hash of ['#/chat','#/chat/add',`#/chat/with/${b.name}`]){
   await page.evaluate(h=>{location.hash=h;},hash);
   if(hash.includes('/with/'))await expect(entry(page,'short')).toBeVisible();
   else await expect(page.locator('h1').first()).toBeVisible();
   await check();
  }
 }
 // 1440: both panes at once; the conversation is on the right, the list on the left.
 await page.setViewportSize({width:1440,height:900});
 await page.evaluate(h=>{location.hash=h;},`#/chat/with/${b.name}`);
 await expect(page.locator('.chat-pane-list')).toBeVisible();await expect(page.locator('.chat-log')).toBeVisible();
 await expect(page.locator('.chat-pane-list a.chat-row[aria-current=page]')).toContainText(b.name);
 await expect(page.locator('.chat-tabbar')).toBeVisible();
 await page.evaluate(h=>{location.hash=h;},'#/chat');
 await expect(page.getByRole('heading',{name:'Pick a chat'})).toBeVisible();
 // 390: one screen at a time, the island hidden in the conversation, the composer above the bottom edge.
 await page.setViewportSize({width:390,height:844});
 await page.evaluate(h=>{location.hash=h;},`#/chat/with/${b.name}`);
 await expect(page.locator('.chat-pane-list')).toBeHidden();
 const box=await page.locator('.chat-composer').boundingBox();expect(box!.y+box!.height).toBeLessThanOrEqual(844+0.5);
 expect(box!.width).toBeLessThanOrEqual(390+0.5);
 await expect(page.locator('.chat-tabbar')).toHaveAttribute('data-hidden','true');
 await expect(page.getByRole('link',{name:'Back to chats'})).toBeVisible();
});

test('reduced motion: no element.animate when motion is reduced',async({page,context})=>{
 await page.emulateMedia({reducedMotion:'reduce'});
 await connect(context,{pollScale:0.05});
 const a=await user('ma'),b=await user('mb');await befriend(a,b);
 await page.addInitScript(()=>{
  const original=Element.prototype.animate;(window as unknown as {__animations:string[]}).__animations=[];
  Element.prototype.animate=function(this:Element,...args:Parameters<Element['animate']>){(window as unknown as {__animations:string[]}).__animations.push(String(this.className));return original.apply(this,args);};
 });
 await open(page,a.name,`#/chat/with/${b.name}`);
 await send(page,'quiet');await expect(entry(page,'quiet')).toBeVisible();
 await page.evaluate(h=>{location.hash=h;},'#/chat');
 await expect(page.getByRole('heading',{name:'Chats',level:1})).toBeVisible();
 await page.evaluate(h=>{location.hash=h;},`#/chat/with/${b.name}`);
 await expect(entry(page,'quiet')).toBeVisible();
 // Only the 120 ms opacity fallback of row 17 (the pane swap) may run; the send and incoming slides must not.
 const ran=await page.evaluate(()=>(window as unknown as {__animations:string[]}).__animations);
 expect(ran.filter(name=>name.includes('chat-entry')||name.includes('chat-group')||name.includes('chat-snap'))).toEqual([]);
 expect(ran.every(name=>name.includes('chat-pane'))).toBe(true);
});

test('a friend message that lands during your own send stays in server order',async({page,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('oa'),b=await user('ob');await befriend(a,b);
 await say(b,a,'first from friend');
 let injected=false;
 await page.route('**/.netlify/functions/chat?action=send**',async route=>{
  if(!injected){injected=true;await say(b,a,'BETWEEN from friend');}
  const req=route.request();
  const result=await chat(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.postData()??undefined}));
  await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:Buffer.from(await result.arrayBuffer())});
 });
 await open(page,a.name,`#/chat/with/${b.name}`);
 await expect(entry(page,'first from friend')).toBeVisible();
 await send(page,'MINE sent');
 await expect(entry(page,'BETWEEN from friend')).toBeVisible({timeout:8000});
 // Wait past a full-refresh cycle too: the order must never change.
 await expect(entry(page,'MINE sent').locator('.chat-receipt')).toHaveText('Not seen yet');
 const order=async()=>(await page.locator('.chat-entry .chat-msg').allInnerTexts()).map(t=>t.trim());
 expect(await order()).toEqual(['first from friend','BETWEEN from friend','MINE sent']);
 await page.waitForTimeout(1500);
 expect(await order()).toEqual(['first from friend','BETWEEN from friend','MINE sent']);
});

test('Sent requests come from this device, so a real and an unknown username look the same',async({page,context})=>{
 await connect(context,{pollScale:0.05});
 const a=await user('sa'),b=await user('sb');const ghost=`ghost_${stamp()}`.slice(0,24);
 await open(page,a.name,'#/chat/add');
 for(const name of [b.name,ghost]){
  await page.locator('#chat-add-username').fill(name);await page.getByRole('button',{name:'Send request'}).click();
  await expect(page.getByText(`Request sent. If @${name} accepts, they'll appear in your chats.`)).toBeVisible();
 }
 const rows=page.locator('.chat-sent .chat-row');
 await expect(rows).toHaveCount(2);
 for(const name of [b.name,ghost])await expect(rows.filter({hasText:`@${name}`})).toContainText('Request sent');
 // A fresh page (no memory of this session) learns nothing from the server.
 await page.reload();
 await expect(page.getByRole('heading',{name:'Add a friend',level:1})).toBeVisible();
 await page.waitForTimeout(600);
 await expect(page.locator('.chat-sent .chat-row')).toHaveCount(0);
});
