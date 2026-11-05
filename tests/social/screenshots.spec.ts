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
let mediaDelay=0;
test.beforeAll(async()=>{
 const connectionString=await database.start();await database.applyMigrations('netlify/database/migrations');pool=getDatabase({connectionString}).pool;
 const store=createMemoryStore();const db={query:(text:string,values?:unknown[])=>pool.query(text,values),connect:()=>pool.connect()} as never;
 accounts=createAccountsHandler(pool);chat=createChatHandler(db,store);social=createSocialHandler(db,store);media=createMediaHandler(db,store);
});
test.afterAll(async()=>{await pool?.end();await database.stop();});

const PASSWORD='long enough password';
async function connect(context:BrowserContext,options:{pollScale?:number}={}){
 await context.addInitScript(scale=>{
  if(window!==window.top)return;
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
  if(scale)(window as unknown as {__QCC_POLL_SCALE__:number}).__QCC_POLL_SCALE__=scale;
 },options.pollScale);
 for(const [name,handle] of [['accounts',accounts],['chat',chat],['social',social],['media',media]] as const)await context.route(`**/.netlify/functions/${name}**`,async route=>{
  const req=route.request();
  if(name==='media'&&req.method()==='POST'&&mediaDelay)await new Promise(resolve=>setTimeout(resolve,mediaDelay));
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
async function guest(page:Page){
 const dialog=page.locator('#accounts-dialog');await expect(dialog).toBeVisible();await dialog.getByRole('button',{name:'Play as guest',exact:true}).click();await expect(dialog).not.toBeVisible();
}
async function logIn(page:Page,username:string){
 const dialog=page.locator('#accounts-dialog');await expect(dialog).toBeVisible();
 await dialog.getByLabel('Username',{exact:true}).fill(username);await dialog.getByLabel('Password',{exact:true}).fill(PASSWORD);
 await dialog.locator('form').getByRole('button',{name:'Log in',exact:true}).click();await expect(dialog).not.toBeVisible();
}
const stamp=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
async function user(prefix:string){const name=`${prefix}_${stamp()}`.slice(0,24);return {name,token:await signup(name)};}
const post=async(token:string,body:string,extra:Record<string,unknown>={})=>{const r=await call(social,'post',token,{body,...extra});expect(r.status,await r.clone().text()).toBe(201);return await r.json() as {id:string};};
async function open(page:Page,name:string,hash='#/social'){
 await page.goto('/');await logIn(page,name);
 await page.evaluate(h=>{location.hash=h;},hash);
 await expect(page.locator('section.social-view')).toBeVisible();
}
const view=(page:Page)=>page.locator('section.social-view');
const png=(width=600,height=400,color='#a684ff')=>sharp({create:{width,height,channels:3,background:color}}).png().toBuffer();


// Evidence screenshots for the design review (docs/evidence/social-chat/social-*.png). Run with SOCIAL_SHOTS=1.
test.skip(!process.env.SOCIAL_SHOTS,'set SOCIAL_SHOTS=1 to regenerate the screenshots');
const OUT='docs/evidence/social-chat';
async function upload(token:string,input:Buffer|Promise<Buffer>,purpose='post'){
 const r=await media(new Request(`https://qcc.test/.netlify/functions/media?action=upload&purpose=${purpose}`,{method:'POST',headers:{'content-type':'image/png',authorization:'Bearer '+token},body:new Uint8Array(await input)}));
 expect(r.status).toBe(201);return (await r.json()).id as string;
}
const gradient=(w:number,h:number,a:string,b:string)=>sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w*0.7}" cy="${h*0.35}" r="${h*0.14}" fill="#ffe08a"/></svg>`)).png().toBuffer();
for(const size of [{name:'phone',width:390,height:844},{name:'desktop',width:1440,height:900}])test(`screenshots ${size.name}`,async({page,context})=>{
 test.setTimeout(120000);
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text());});
 await connect(context);await page.setViewportSize({width:size.width,height:size.height});
 const me=await user('tama'),other=await user('aroha');
 const shots=[['#f97316','#6d28d9'],['#0ea5e9','#16a34a'],['#ec4899','#facc15'],['#14b8a6','#1e293b']] as const;
 const photos=async(n:number,w=900,h=600)=>Promise.all(shots.slice(0,n).map(([a,b])=>upload(other.token,gradient(w,h,a,b) as unknown as Promise<Buffer>)));
 const avatarId=await upload(other.token,await gradient(256,256,'#a684ff','#1e1b4b'),'avatar');
 const bannerId=await upload(other.token,await gradient(1600,500,'#7c3aed','#0f172a'),'banner');
 await call(social,'profile',other.token,{displayName:'Aroha Ngata',bio:'Tide watcher. Early riser. Posts about Ōhope and the odd sunrise.',avatarId,bannerId});
 await call(social,'follow',me.token,{username:other.name,on:true});await call(social,'follow',other.token,{username:me.name,on:true});
 const root=await post(other.token,'Low tide at Ōhope this morning. Worth getting up early for. https://example.com/tides',{media:await photos(1)});
 await post(other.token,'Four photos from the beach clean-up on Saturday.',{media:await photos(4,700,500)});
 await post(other.token,'Two views, one sunrise',{media:await photos(2,700,500)});
 const mine=await post(me.token,'Science fair photos are up. Thanks everyone who came, @'+other.name);
 await post(me.token,'Reminder: hoops at lunch, bring your own ball.');
 const reply=await post(me.token,'Replying: that colour is unreal',{replyTo:root.id});
 await call(social,'like',me.token,{id:root.id,on:true});await call(social,'like',me.token,{id:mine.id,on:true});
 await post(other.token,'@'+me.name+' you should see it at 6am',{replyTo:reply.id});
 await open(page,me.name);
 await expect(page.locator('.social-post .social-media-tile img').first()).toBeVisible();
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete));await page.waitForTimeout(500);
 await page.screenshot({path:`${OUT}/social-feed-${size.name}.png`});
 await page.evaluate(h=>{location.hash=h;},`#/social/post/${reply.id}`);
 await expect(page.locator('.social-post.is-focused')).toBeVisible();await page.waitForTimeout(600);
 await page.screenshot({path:`${OUT}/social-thread-${size.name}.png`});
 await page.evaluate(h=>{location.hash=h;},`#/social/u/${other.name}`);
 await expect(page.getByRole('tab',{name:'Posts'})).toBeVisible();
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete));await page.waitForTimeout(500);
 await page.screenshot({path:`${OUT}/social-profile-${size.name}.png`});
 await page.evaluate(h=>{location.hash=h;},'#/social/settings');
 await expect(page.getByRole('heading',{name:'Settings',level:1})).toBeVisible();await page.waitForTimeout(400);
 await page.screenshot({path:`${OUT}/social-settings-${size.name}.png`});
 await page.evaluate(h=>{location.hash=h;},'#/social/activity');
 await expect(page.locator('.social-activity-row').first()).toBeVisible();await page.waitForTimeout(300);
 await page.screenshot({path:`${OUT}/social-activity-${size.name}.png`});
 // Composer near the limit, with one photo ready and one failed.
 await page.evaluate(h=>{location.hash=h;},'#/social');
 await expect(page.locator('.social-post').first()).toBeVisible();
 if(size.width>=1100){await page.keyboard.press('p');await page.locator('.social-inline textarea').fill('x');}
 else await page.getByRole('button',{name:'New post'}).click();
 const scope=size.width>=1100?page.locator('.social-inline'):page.locator('#social-compose');
 await scope.locator('textarea').fill(Array.from('Kia ora koutou! Our class is running a beach clean-up at Ōhope this Saturday from 9 am. Bring gloves, a hat, water and a bag for rubbish. We will meet by the surf club and finish with a sausage sizzle around midday. Everyone is welcome, bring whānau and friends too. Ka pai!!! See you there. See you all there, bring a friend, bring your whanau, and thanks for helping out this year.').slice(0,273).join(''));
 await scope.locator('input[type=file]').setInputFiles([{name:'a.png',mimeType:'image/png',buffer:await gradient(600,400,'#22c55e','#1e3a8a')}]);
 await expect(scope.locator('.apps-upload')).toHaveAttribute('data-stage','ready',{timeout:15000});
 await page.waitForTimeout(1800);await page.waitForTimeout(400);
 await page.screenshot({path:`${OUT}/social-composer-${size.name}.png`});
});
