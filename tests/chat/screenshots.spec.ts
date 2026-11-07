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
 // These feature fixtures represent an established player; welcome behavior has its own suite.
 await page.evaluate(name=>localStorage.setItem('qcc:christmas-welcome:2026:'+name.toLowerCase(),'seen'),username);
 await dialog.getByLabel('Username',{exact:true}).fill(username);await dialog.getByLabel('Password',{exact:true}).fill(PASSWORD);
 await dialog.locator('form').getByRole('button',{name:'Log in',exact:true}).click();await expect(dialog).not.toBeVisible();
}
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
const png=(w:number,h:number,a:string,b:string)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#g)"/><circle cx="${w*0.7}" cy="${h*0.35}" r="${h*0.14}" fill="#fde68a"/><path d="M0 ${h} L${w*0.35} ${h*0.55} L${w*0.6} ${h*0.8} L${w*0.8} ${h*0.6} L${w} ${h} Z" fill="#0f172a" opacity=".55"/></svg>`)).png().toBuffer();

// Evidence screenshots for the design review (docs/evidence/social-chat/chat-*.png). Run with CHAT_SHOTS=1.
test.skip(!process.env.CHAT_SHOTS,'set CHAT_SHOTS=1 to regenerate the screenshots');
const OUT='docs/evidence/social-chat';
async function snap(from:User,to:User,colors:[string,string]=['#f97316','#6d28d9']){
 const upload=await media(new Request('https://qcc.test/.netlify/functions/media?action=upload&purpose=snap',{method:'POST',headers:{'content-type':'image/png',authorization:'Bearer '+from.token},body:await png(900,1200,...colors) as unknown as BodyInit}));
 expect(upload.status).toBe(201);
 const sent=await call(chat,'send',from.token,{to:to.name,kind:'snap',mediaId:(await upload.json()).id});expect(sent.status).toBe(201);return (await sent.json()).id as string;
}
const named=async(name:string)=>({name,token:await signup(name)}) as User;
const messages=async(viewer:User,other:User)=>(await (await call(chat,`messages&with=${other.name}`,viewer.token)).json()) as {messages:{id:string;kind:string;body:string|null}[]};

for(const size of [{name:'phone',width:390,height:844},{name:'desktop',width:1440,height:900}])test(`chat screenshots ${size.name}`,async({page,context})=>{
 test.setTimeout(180000);
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 await connect(context);await page.setViewportSize({width:size.width,height:size.height});
 const suffix=size.name.slice(0,1)+Math.random().toString(36).slice(2,4);
 const me=await named('Tama_'+suffix);
 const F=async(n:string)=>{const f=await named(`${n}_${suffix}`);await befriend(me,f);return f;};
 const textSent=await F('Tane'),textOpened=await F('Ana'),textNew=await F('Sam'),textSeen=await F('Rangi'),snapSent=await F('Hemi'),snapOpened=await F('Kiri'),snapNew=await F('Mere'),snapSeen=await F('Wiki'),system=await F('Nikau');
 await F('Piripi');
 await say(me,textSent,'Are you coming to hoops?');
 await say(me,textOpened,'Quiz answers are in the doc');await messages(textOpened,me);
 await say(textNew,me,'Did you finish the maths?');await say(textNew,me,'Call me after tea');
 await say(textSeen,me,'See you at lunch');await messages(me,textSeen);
 await snap(me,snapSent,['#14b8a6','#1e293b']);
 const opened=await snap(me,snapOpened);void opened;
 const openedByKiri=await call(chat,'open_snap',snapOpened.token,{id:(await messages(snapOpened,me)).messages.find(m=>m.kind==='snap')!.id});expect(openedByKiri.status).toBe(200);
 await snap(snapNew,me,['#ec4899','#facc15']);
 await snap(snapSeen,me,['#0ea5e9','#16a34a']);
 const seen=await call(chat,'open_snap',me.token,{id:(await messages(me,snapSeen)).messages.find(m=>m.kind==='snap')!.id});expect(seen.status).toBe(200);
 await say(me,system,'Hello');expect((await call(chat,'retention',me.token,{with:system.name,mode:'week'})).status).toBe(200);
 const outgoing=await named('Hana_'+suffix);expect((await call(chat,'request',me.token,{username:outgoing.name})).status).toBe(200);
 for(const n of ['Aroha','Ngaio']){const r=await named(`${n}_${suffix}`);expect((await call(chat,'request',r.token,{username:me.name})).status).toBe(200);}
 // A fuller conversation with Mere (the snap above is her new photo).
 const mere=snapNew;
 await say(mere,me,'Kia ora! Are you doing the quiz later?');
 const kept=await say(mere,me,'I saved the answers, check the pinned bit');
 await say(me,mere,'Yes, after tea');await say(me,mere,'Can you send me the unbroken test string '+'abcdefghij'.repeat(12)+' so I can check it wraps?');
 await snap(me,mere,['#8b5cf6','#0f172a']);
 const meres=(await messages(me,mere)).messages;
 const mereSnap=meres.filter(m=>m.kind==='snap');
 const mineSnap=mereSnap[mereSnap.length-1]!.id;
 const opens=await call(chat,'open_snap',mere.token,{id:mineSnap});expect(opens.status).toBe(200);
 expect((await call(chat,'retention',mere.token,{with:me.name,mode:'week'})).status).toBe(200);
 await say(mere,me,'Great, thanks. Tap the photo when you get a sec');
 await snap(mere,me,['#f59e0b','#7c2d12']);
 await say(me,mere,'Got it');
 expect((await call(chat,'save',me.token,{id:kept.id,on:true})).status).toBe(200);
 await pool.query(`UPDATE chat_messages SET created_at=created_at-interval '1 day' WHERE id<=$1::bigint AND conversation_id IN (SELECT conversation_id FROM chat_messages WHERE id=$1::bigint)`,[kept.id]);
 await call(chat,`messages&with=${me.name}`,mere.token);
 await open(page,me.name,'#/chat');
 await expect(page.locator('a.chat-row')).toHaveCount(10);
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete));await page.waitForTimeout(700);
 await page.screenshot({path:`${OUT}/chat-list-${size.name}.png`});
 await page.locator('.chat-pane-list').evaluate(el=>{(el.scrollHeight>el.clientHeight?el:el.closest('.chat-view')!).scrollTo(0,99999);});await page.waitForTimeout(600);
 await page.screenshot({path:`${OUT}/chat-list-bottom-${size.name}.png`});
 await page.locator('.chat-pane-list').evaluate(el=>{el.scrollTo(0,0);el.closest('.chat-view')!.scrollTo(0,0);});
 await page.evaluate(h=>{location.hash=h;},'#/chat/add');
 await expect(page.getByRole('heading',{name:'Add a friend',level:1})).toBeVisible();
 await page.locator('#chat-add-username').fill('sam_k');await page.waitForTimeout(500);
 await page.screenshot({path:`${OUT}/chat-add-${size.name}.png`});
 await page.evaluate(h=>{location.hash=h;},`#/chat/with/${mere.name}`);
 await expect(page.locator('.chat-intro')).toBeVisible();await expect(page.locator('.chat-entry').first()).toBeVisible();await page.waitForTimeout(900);
 await page.screenshot({path:`${OUT}/chat-conversation-${size.name}.png`});
 await page.locator('.chat-entry').filter({hasText:'check the pinned bit'}).hover();
 await page.locator('.chat-entry').filter({hasText:'check the pinned bit'}).getByRole('button',{name:'Message options'}).click();
 await page.waitForTimeout(400);
 await page.screenshot({path:`${OUT}/chat-menu-${size.name}.png`});
 await page.keyboard.press('Escape');
 await page.locator('button.chat-snap').last().click();
 await expect(page.locator('#chat-snap img.chat-snap-img')).toBeVisible();await page.waitForTimeout(1500);
 await page.screenshot({path:`${OUT}/chat-snap-viewer-${size.name}.png`});
 await page.getByRole('button',{name:'Close photo'}).click();await expect(page.locator('#chat-snap')).toHaveCount(0);
 await page.getByRole('button',{name:'Chat info',exact:true}).click();
 await expect(page.locator('#chat-info')).toBeVisible();await page.waitForTimeout(700);
 await page.screenshot({path:`${OUT}/chat-info-${size.name}.png`});
 await page.getByRole('button',{name:'Close chat info'}).click();await expect(page.locator('#chat-info')).not.toBeVisible();
 await page.locator('input[type=file]').setInputFiles([{name:'a.png',mimeType:'image/png',buffer:await png(900,600,'#22c55e','#1e3a8a')}]);
 await expect(page.locator('#chat-send-photo').getByRole('button',{name:'Send photo'})).toBeEnabled();await page.waitForTimeout(1800);
 await page.screenshot({path:`${OUT}/chat-send-photo-${size.name}.png`});
});
