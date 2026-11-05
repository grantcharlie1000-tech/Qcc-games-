import {captureAuditEvidence} from '../helpers/audit-evidence';
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


test('composer always shows a count and offers safe keyboard mentions',async({page,context})=>{
 await connect(context);const a=await user('mention'),b=await user('match');await post(b.token,'A visible author');await open(page,a.name,'#/social/discover');
 await page.getByRole('button',{name:'New post',exact:true}).click();
 const sheet=page.locator('#social-compose'),box=sheet.getByRole('textbox',{name:'Post text'});
 await expect(sheet.locator('.social-count')).toHaveText('0/280');
 await box.fill('@');await expect(sheet.getByRole('option')).toContainText('@'+b.name);
 await box.fill('Hello @'+b.name.slice(0,8));
 await expect(sheet.getByRole('listbox',{name:'Mention suggestions'})).toBeVisible();
 await expect(sheet.getByRole('option')).toContainText('@'+b.name);
 await captureAuditEvidence(page,test.info(),'social-mention-suggestions');
 await box.press('ArrowDown');await box.press('Enter');
 await expect(box).toHaveValue('Hello @'+b.name+' ');
 await expect(sheet.getByRole('listbox')).toBeHidden();
 await box.fill('Email me@example.com');await expect(sheet.getByRole('listbox')).toBeHidden();
 await box.fill('😀'.repeat(281));await expect(sheet.locator('.social-count')).toHaveText('281/280');
 await expect(sheet.getByRole('button',{name:'Publish',exact:true})).toBeDisabled();
});

test('shortcuts has a centered dimmed dialog without duplicate sidebar content',async({page,context})=>{
 await page.setViewportSize({width:1440,height:900});await connect(context);const a=await user('shortcut');await open(page,a.name);
 await expect(page.locator('.social-rail .social-shortcuts')).toHaveCount(0);
 await page.locator('.social-view').focus();await page.keyboard.press('?');
 const dialog=page.getByRole('dialog',{name:'Keyboard shortcuts'});await expect(dialog).toBeVisible();
 await expect.poll(async()=>dialog.evaluate(el=>Math.abs(el.getBoundingClientRect().x+el.getBoundingClientRect().width/2-innerWidth/2))).toBeLessThan(2);
 expect(await dialog.evaluate(el=>getComputedStyle(el,'::backdrop').backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
 await captureAuditEvidence(page,test.info(),'social-desktop-shortcuts');
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden();
});

test('profile onboarding offers photo and first post without a floating pencil',async({page,context})=>{
 await connect(context);const a=await user('fresh');await open(page,a.name,'#/social/u/'+a.name);
 await expect(page.getByRole('link',{name:'Add profile photo',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Write your first post'})).toBeVisible();
 await expect(page.locator('.social-profile-panel')).toContainText('Share an update');
 const compose=page.getByRole('button',{name:'New post',exact:true});
 expect(await compose.evaluate(el=>el.closest('.apps-top')!==null)).toBe(true);
 await captureAuditEvidence(page,test.info(),'social-profile-onboarding');
 await page.getByRole('button',{name:'Write your first post'}).click();await expect(page.locator('#social-compose')).toBeVisible();
});

test('missing post explains availability once with no ghost avatar or duplicate back link',async({page,context})=>{
 await connect(context);const a=await user('missing');await open(page,a.name,'#/social/post/00000000-0000-4000-8000-000000000000');
 await expect(page.getByRole('heading',{name:'Post unavailable'})).toBeVisible();
 await expect(page.locator('.social-thread')).toContainText('may have been deleted');
 await expect(page.locator('.social-avatar.is-ghost')).toHaveCount(0);
 await expect(page.getByRole('link',{name:'Back to feed',exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Back to feed',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'New post',exact:true})).toBeHidden();
 await captureAuditEvidence(page,test.info(),'social-unavailable-post');
});

for(const size of [{width:390,height:844},{width:844,height:390},{width:320,height:568}])test(`header and compose do not cover feed content at ${size.width}x${size.height}`,async({page,context})=>{
 await page.setViewportSize(size);await connect(context);const a=await user('clear');
 for(let i=0;i<8;i++)await post(a.token,'Readable post '+i+' '+'Text '.repeat(18));
 await open(page,a.name);await expect(page.locator('.social-post').first()).toBeVisible();
 const positions=await page.evaluate(()=>{const head=document.querySelector('.apps-top')!.getBoundingClientRect(),post=document.querySelector('.social-post')!.getBoundingClientRect(),compose=document.querySelector('.social-fab')!.getBoundingClientRect();return {headBottom:head.bottom,postTop:post.top,composeBottom:compose.bottom,overflow:document.documentElement.scrollWidth>innerWidth};});
 expect(positions.postTop).toBeGreaterThanOrEqual(positions.headBottom);expect(positions.composeBottom).toBeLessThanOrEqual(positions.headBottom);expect(positions.overflow).toBe(false);
 await captureAuditEvidence(page,test.info(),'social-feed-top');
 await page.locator('.social-view').evaluate(el=>{el.scrollTop=el.scrollHeight;});
 const last=page.locator('.social-post').last();await last.scrollIntoViewIfNeeded();
 const bottom=await page.evaluate(()=>({post:document.querySelector('.social-post:last-of-type')!.getBoundingClientRect().bottom,nav:document.querySelector('.social-view .section-navigation')!.getBoundingClientRect().top}));
 expect(bottom.post).toBeLessThanOrEqual(bottom.nav+1);
 await captureAuditEvidence(page,test.info(),'social-feed-bottom');
});


test('copy link uses the copy glyph and reports clipboard success',async({page,context})=>{
 await connect(context);const a=await user('copy');const p=await post(a.token,'Copy this post');await open(page,a.name);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:(value:string)=>{(window as unknown as {copied:string}).copied=value;return Promise.resolve();}}}));
 await page.locator('.social-post').first().getByRole('button',{name:/More/}).click();
 const copy=page.getByRole('menuitem',{name:'Copy link',exact:true});await expect(copy).toBeVisible();
 await expect(copy.locator('svg rect')).toHaveCount(1);
 await captureAuditEvidence(page,test.info(),'social-post-options');
 await copy.click();
 await expect(page.getByRole('status').filter({hasText:'Link copied'})).toBeVisible();
 expect(await page.evaluate(()=>(window as unknown as {copied:string}).copied)).toContain('#/social/post/'+p.id);
 await expect(page.getByRole('menuitem',{name:'Copy link',exact:true})).toBeHidden();
});

test('mention keyboard navigation reveals every option and selection replaces a full token',async({page,context})=>{
 await connect(context);const me=await user('mentionnav'),prefix='mn'+stamp();
 const people=[] as {name:string;token:string}[];
 for(let i=0;i<5;i++)people.push(await user(prefix+i));
 await open(page,me.name);await page.getByRole('button',{name:'New post',exact:true}).click();
 const sheet=page.locator('#social-compose'),box=sheet.getByRole('textbox',{name:'Post text'}),list=sheet.getByRole('listbox',{name:'Mention suggestions'});
 await box.fill('@'+prefix);await expect(list.getByRole('option')).toHaveCount(5);
 for(let i=0;i<5;i++)await box.press('ArrowDown');
 const active=list.locator('[aria-selected=true]');await expect(active).toHaveCount(1);
 const lower=await list.evaluate(el=>{const selected=el.querySelector('[aria-selected=true]')!,r=selected.getBoundingClientRect(),v=el.getBoundingClientRect();return {scroll:el.scrollTop,bottom:r.bottom,edge:v.top+el.clientTop+el.clientHeight};});
 expect(lower.scroll).toBeGreaterThan(0);expect(lower.bottom).toBeLessThanOrEqual(lower.edge+1);
 await captureAuditEvidence(page,test.info(),'social-mention-last-option');
 await box.press('ArrowDown');await expect(list.getByRole('option').first()).toHaveAttribute('aria-selected','true');
 expect(await list.evaluate(el=>el.scrollTop)).toBe(0);
 await box.fill('Hi @'+people[0]!.name+' today');
 await box.evaluate(el=>{const textarea=el as HTMLTextAreaElement;textarea.setSelectionRange(6,6);textarea.dispatchEvent(new Event('click',{bubbles:true}));});
 await list.getByRole('option').filter({hasText:'@'+people[0]!.name}).click();
 await expect(box).toHaveValue('Hi @'+people[0]!.name+' today');
 await box.fill('(@'+prefix);await expect(list).toBeHidden();
});

test('Escape dismisses inline mentions without opening Study or changing the draft',async({page,context})=>{
 await page.setViewportSize({width:1440,height:900});await connect(context);
 const me=await user('inlineesc'),person=await user('inlineperson');await open(page,me.name);
 await page.locator('.social-inline-prompt').click();
 const inline=page.locator('.social-inline'),box=inline.getByRole('textbox',{name:'Post text'}),list=inline.getByRole('listbox',{name:'Mention suggestions'});
 const draft='Hello @'+person.name;await box.fill(draft);await expect(list.getByRole('option')).toContainText('@'+person.name);
 await box.press('Escape');
 await expect(list).toBeHidden();await expect(box).toHaveValue(draft);await expect(box).toBeFocused();
 await expect(page.locator('body')).not.toHaveClass(/study-active/);await expect(page.locator('.social-view')).toBeVisible();
});

test('native vertical caret movement cancels a pending mention search',async({page,context})=>{
 await connect(context);const me=await user('caretmove');await open(page,me.name);
 await page.getByRole('button',{name:'New post',exact:true}).click();
 const box=page.locator('#social-compose').getByRole('textbox',{name:'Post text'}),list=page.locator('#social-compose').getByRole('listbox',{name:'Mention suggestions'});
 await page.evaluate(()=>{
  const original=window.fetch;
  window.fetch=(input,init)=>{
   const url=input instanceof Request?input.url:String(input);
   if(url.includes('action=search'))(window as Window&{mentionSignal?:AbortSignal|null}).mentionSignal=init?.signal;
   return original(input,init);
  };
 });
 let release=()=>{},started=()=>{};
 const gate=new Promise<void>(resolve=>{release=resolve;}),requestStarted=new Promise<void>(resolve=>{started=resolve;});
 await context.route('**/.netlify/functions/social?action=search**',async route=>{
  started();await gate;
  // An abort is expected after native caret movement, before this delayed result.
  await route.fulfill({status:200,json:{users:[{username:'alice',displayName:'Alice',avatar:null}],posts:[]}}).catch(()=>{});
 });
 const draft='@alice\nNext line';
 try{
  await box.fill(draft);
  await box.evaluate(el=>{const input=el as HTMLTextAreaElement;input.setSelectionRange(6,6);input.dispatchEvent(new Event('click',{bubbles:true}));});
  await requestStarted;await box.press('ArrowDown');
  await expect.poll(()=>box.evaluate(el=>(el as HTMLTextAreaElement).selectionStart)).toBeGreaterThan(6);
  await expect.poll(()=>page.evaluate(()=>(window as Window&{mentionSignal?:AbortSignal|null}).mentionSignal?.aborted)).toBe(true);
  await expect(list).toBeHidden();await expect(box).toHaveValue(draft);
 }finally{release();}
});
