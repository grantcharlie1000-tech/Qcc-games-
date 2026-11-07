import {captureAuditEvidence} from '../helpers/audit-evidence';
import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import type {Pool} from 'pg';
import {LocalDB,createLocalPool} from '../support/local-db';
import sharp from 'sharp';
import {createAccountsHandler} from '../../src/accounts/server';
import {createSocialHandler} from '../../src/social/server';
import {createMediaHandler} from '../../src/media/server';
import {createMemoryStore} from '../../src/media/store';

const database=new LocalDB(),store=createMemoryStore();
let pool:Pool;
let accounts:ReturnType<typeof createAccountsHandler>,social:ReturnType<typeof createSocialHandler>,withoutUploads:typeof social,media:ReturnType<typeof createMediaHandler>;
test.beforeAll(async()=>{
 const connectionString=await database.start();await database.applyMigrations('db/migrations');pool=createLocalPool(connectionString);
 const db={query:(text:string,values?:unknown[])=>pool.query(text,values),connect:()=>pool.connect()} as never;
 accounts=createAccountsHandler(pool);social=createSocialHandler(db,store);withoutUploads=createSocialHandler(db,null);media=createMediaHandler(db,store);
});
test.afterAll(async()=>{await pool?.end();await database.stop();});
test.use({viewport:{width:390,height:844}});
const password='long enough password';
const call=(handle:(request:Request)=>Promise<Response>,action:string,token:string|null,body?:unknown)=>handle(new Request(`https://qcc.test/.netlify/functions/x?action=${action}`,{
 method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)
}));
const png=()=>sharp({create:{width:80,height:80,channels:3,background:'#a684ff'}}).png().toBuffer();
async function seed(){
 const username=`photo_${Date.now().toString(36)}${Math.random().toString(36).slice(2,6)}`;
 const signup=await call(accounts,'signup',null,{username,password});expect(signup.status).toBe(201);
 const {token}=await signup.json() as {token:string};
 const ids={} as Record<'avatar'|'banner',string>;
 for(const purpose of ['avatar','banner'] as const){
  const response=await media(new Request(`https://qcc.test/.netlify/functions/media?action=upload&purpose=${purpose}`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'image/png'},body:new Uint8Array(await png())}));
  expect(response.status).toBe(201);ids[purpose]=(await response.json()).id;
 }
 expect((await call(social,'profile',token,{avatarId:ids.avatar,bannerId:ids.banner,displayName:'Photo tester',bio:'Keep my bio'})).status).toBe(200);
 expect((await call(social,'post',token,{body:'Keep my post'})).status).toBe(201);
 return {username,token,...ids};
}
async function connect(context:BrowserContext,uploads=true){
 await context.addInitScript(()=>{
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
 });
 for(const [name,handle] of [['accounts',accounts],['social',uploads?social:withoutUploads],['media',media]] as const)await context.route(`**/.netlify/functions/${name}**`,async route=>{
  const req=route.request(),body=req.method()==='POST'?req.postDataBuffer()??undefined:undefined;
  const response=await handle(new Request(req.url(),{method:req.method(),headers:req.headers(),body:body as BodyInit|undefined}));
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
}
async function open(page:Page,username:string){
 await page.goto('/');const dialog=page.locator('#accounts-dialog');await expect(dialog).toBeVisible();
 // These feature fixtures represent an established player; welcome behavior has its own suite.
 await page.evaluate(name=>localStorage.setItem('qcc:christmas-welcome:2026:'+name.toLowerCase(),'seen'),username);
 await dialog.getByLabel('Username',{exact:true}).fill(username);await dialog.getByLabel('Password',{exact:true}).fill(password);
 await dialog.locator('form').getByRole('button',{name:'Log in',exact:true}).click();await expect(dialog).toBeHidden();
 await page.evaluate(()=>{location.hash='#/social/settings';});await expect(page.getByRole('heading',{name:'Settings',level:1})).toBeVisible();
}
async function assertSavedRemoval(page:Page,user:Awaited<ReturnType<typeof seed>>,kind:'avatar'|'banner'){
 const save=page.getByRole('button',{name:'Save',exact:true});await expect(save).toBeEnabled();await save.click();
 await expect(page.getByText('Saved',{exact:true})).toBeVisible();
 const me=await (await call(social,'me',user.token)).json(),other=kind==='avatar'?'banner':'avatar';
 expect(me.profile).toMatchObject({[kind]:null,[other]:user[other],displayName:'Photo tester',bio:'Keep my bio',posts:1});
 await page.reload();await expect(page.getByRole('heading',{name:'Settings',level:1})).toBeVisible();
 const row=page.locator(`.social-media-row.is-${kind}`);
 await expect(row.locator('.social-media-preview img')).toHaveCount(0);
 await expect(row.locator('.social-media-actions').getByRole('button',{name:'Remove',exact:true})).toBeHidden();
 // Removal revokes the old URL even when storage cleanup must wait for a later sweep.
 for(const variant of ['full','thumb'])expect((await media(new Request(`https://qcc.test/.netlify/functions/media?action=get&id=${user[kind]}&v=${variant}`))).status).toBe(404);
}

for(const kind of ['avatar','banner'] as const)test(`existing ${kind} can be removed while new uploads are unavailable`,async({page,context})=>{
 const user=await seed();await connect(context,false);await open(page,user.username);
 const row=page.locator(`.social-media-row.is-${kind}`);
 await expect(row.locator('.social-media-actions').getByRole('button',{name:'Remove',exact:true})).toBeVisible();
 await expect(row.getByRole('button',{name:kind==='avatar'?'Change photo':'Change banner',exact:true})).toBeDisabled();
 await row.locator('.social-media-actions').getByRole('button',{name:'Remove',exact:true}).click();
 await assertSavedRemoval(page,user,kind);
 await captureAuditEvidence(page,test.info(),`profile-${kind}-removal-persisted`);
});

for(const stage of ['pending','failed','ready'] as const)test(`removing a profile photo cancels its ${stage} replacement`,async({page,context})=>{
 const user=await seed();await connect(context);await open(page,user.username);
 let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});
 let started=()=>{};const start=new Promise<void>(resolve=>{started=resolve;});
 let finished=()=>{};const finish=new Promise<void>(resolve=>{finished=resolve;});
 if(stage!=='ready')await context.route('**/.netlify/functions/media?action=upload**',async route=>{
  try{
   if(stage==='pending'){
    const req=route.request();
    const response=await media(new Request(req.url(),{method:req.method(),headers:req.headers(),body:req.postDataBuffer() as unknown as BodyInit}));
    expect(response.status).toBe(201);const body=Buffer.from(await response.arrayBuffer());
    started();await gate;
    await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body});
   }else await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'media_not_configured'})});
  }finally{finished();}
 });
 const row=page.locator('.social-media-row.is-avatar');
 try{
  await row.locator('input[type=file]').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:await png()});
  if(stage==='pending')await start;
  else await expect(row.locator('.apps-upload')).toHaveAttribute('data-stage',stage);
  await row.locator('.social-media-actions').getByRole('button',{name:'Remove',exact:true}).click();
  await expect(row.locator('.apps-upload')).toHaveCount(0);
  await expect(row.locator('.social-media-preview img')).toHaveCount(0);
  release();if(stage!=='ready')await finish;
  await assertSavedRemoval(page,user,'avatar');
  expect(await store.get(user.avatar+'/full')).toBeNull();expect(await store.get(user.avatar+'/thumb')).toBeNull();
 }finally{release();}
});

test('cancelling a replacement keeps an earlier photo removal staged',async({page,context})=>{
 const user=await seed();await connect(context);await open(page,user.username);
 const row=page.locator('.social-media-row.is-avatar');
 await row.locator('.social-media-actions').getByRole('button',{name:'Remove',exact:true}).click();
 await row.locator('input[type=file]').setInputFiles({name:'replacement.png',mimeType:'image/png',buffer:await png()});
 await expect(row.locator('.apps-upload')).toHaveAttribute('data-stage','ready');
 await row.locator('.apps-upload-remove').click();
 await expect(row.locator('.social-media-preview img')).toHaveCount(0);
 await assertSavedRemoval(page,user,'avatar');
});

test('a failed photo removal Save preserves server state and can be retried',async({page,context})=>{
 const user=await seed();await connect(context);await open(page,user.username);
 await context.route('**/.netlify/functions/social?action=profile',async route=>{
  await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'unavailable',message:'Could not save this time.'})});
 },{times:1});
 const row=page.locator('.social-media-row.is-avatar'),save=page.getByRole('button',{name:'Save',exact:true});
 await row.locator('.social-media-actions').getByRole('button',{name:'Remove',exact:true}).click();
 await save.click();
 await expect(page.locator('.social-form [role=alert]')).toHaveText('Could not save this time.');
 await expect(page.getByText('Saved',{exact:true})).toBeHidden();await expect(save).toBeEnabled();
 await expect(row.locator('.social-media-preview img')).toHaveCount(0);
 const me=await (await call(social,'me',user.token)).json();
 expect(me.profile).toMatchObject({avatar:user.avatar,banner:user.banner,displayName:'Photo tester',bio:'Keep my bio',posts:1});
 for(const id of [user.avatar,user.banner])for(const variant of ['full','thumb'])
  expect((await media(new Request(`https://qcc.test/.netlify/functions/media?action=get&id=${id}&v=${variant}`))).status).toBe(200);
 await assertSavedRemoval(page,user,'avatar');
});

for(const kind of ['avatar','banner'] as const)test(`removing a replacement ${kind} preserves the other simultaneous upload`,async({page,context})=>{
 const user=await seed();await connect(context);await open(page,user.username);
 const rows={avatar:page.locator('.social-media-row.is-avatar'),banner:page.locator('.social-media-row.is-banner')};
 const uploaded=Object.fromEntries(['avatar','banner'].map(purpose=>[purpose,page.waitForResponse(response=>
  response.request().method()==='POST'&&new URL(response.url()).searchParams.get('purpose')===purpose
 )])) as Record<'avatar'|'banner',Promise<import('@playwright/test').Response>>;
 const buffer=await png();
 await Promise.all(['avatar','banner'].map(purpose=>rows[purpose as 'avatar'|'banner'].locator('input[type=file]').setInputFiles({name:purpose+'.png',mimeType:'image/png',buffer})));
 const ids={} as Record<'avatar'|'banner',string>;
 for(const purpose of ['avatar','banner'] as const){
  const response=await uploaded[purpose];expect(response.status()).toBe(201);ids[purpose]=(await response.json()).id;
  await expect(rows[purpose].locator('.apps-upload')).toHaveAttribute('data-stage','ready');
 }
 const other=kind==='avatar'?'banner':'avatar';
 await rows[kind].locator('.social-media-actions').getByRole('button',{name:'Remove',exact:true}).click();
 await expect(rows[kind].locator('.apps-upload')).toHaveCount(0);
 await expect(rows[other].locator('.apps-upload')).toHaveAttribute('data-stage','ready');
 await assertSavedRemoval(page,{...user,[other]:ids[other]},kind);
 expect((await media(new Request(`https://qcc.test/.netlify/functions/media?action=get&id=${ids[other]}&v=thumb`))).status).toBe(200);
 expect((await media(new Request(`https://qcc.test/.netlify/functions/media?action=get&id=${user[other]}&v=thumb`))).status).toBe(404);
 expect((await media(new Request(`https://qcc.test/.netlify/functions/media?action=get&id=${ids[kind]}&v=thumb`))).status).toBe(404);
});
