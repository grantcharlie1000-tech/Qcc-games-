import {test,expect,type BrowserContext,type Page,type Locator} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {LocalDB,createLocalPool} from '../support/local-db';
import type {Pool} from 'pg';
import sharp from 'sharp';
import {createAccountsHandler} from '../../src/accounts/server';
import {createChatHandler} from '../../src/chat/server';
import {createSocialHandler} from '../../src/social/server';
import {createMediaHandler} from '../../src/media/server';
import {createMemoryStore} from '../../src/media/store';

// Motion evidence for docs/social-chat/MOTION_AUDIT.md (DESIGN 12). Run with MOTION_SHOTS=1.
// Each capture freezes the Web Animations clock (document.getAnimations(), pause, currentTime) and screenshots set times,
// then a reduced-motion pass checks, for both triggers, that nothing moves and only the allowed opacity fades run.
test.skip(!process.env.MOTION_SHOTS,'set MOTION_SHOTS=1 to regenerate the motion evidence');
const OUT='docs/evidence/social-chat/motion';
const database=new LocalDB();let pool:Pool;
let accounts:ReturnType<typeof createAccountsHandler>,chat:ReturnType<typeof createChatHandler>,social:ReturnType<typeof createSocialHandler>,media:ReturnType<typeof createMediaHandler>;
test.beforeAll(async()=>{
 mkdirSync(OUT,{recursive:true});
 const connectionString=await database.start();await database.applyMigrations('db/migrations');pool=createLocalPool(connectionString);
 const store=createMemoryStore();const db={query:(text:string,values?:unknown[])=>pool.query(text,values),connect:()=>pool.connect()} as never;
 accounts=createAccountsHandler(pool);chat=createChatHandler(db,store);social=createSocialHandler(db,store);media=createMediaHandler(db,store);
});
test.afterAll(async()=>{await pool?.end();await database.stop();});
test.use({viewport:{width:390,height:844},deviceScaleFactor:1});

const PASSWORD='long enough password';
async function connect(context:BrowserContext,pollScale?:number){
 await context.addInitScript(scale=>{
  if(window!==window.top)return;
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
  if(scale)(window as unknown as {__QCC_POLL_SCALE__:number}).__QCC_POLL_SCALE__=scale;
  // Every element.animate() call, for the reduced-motion checks.
  const log:{target:string;props:string[];duration:number}[]=[];(window as unknown as {__animateLog:typeof log}).__animateLog=log;
  const original=Element.prototype.animate;
  Element.prototype.animate=function(this:Element,frames:Keyframe[]|PropertyIndexedKeyframes|null,options?:number|KeyframeAnimationOptions){
   const props=[...new Set((Array.isArray(frames)?frames:[]).flatMap(f=>Object.keys(f).filter(k=>!['offset','easing','composite'].includes(k))))];
   log.push({target:this.className&&typeof this.className==='string'?this.className.split(' ')[0]!:this.tagName.toLowerCase(),props,duration:typeof options==='number'?options:Number(options?.duration??0)});
   return original.call(this,frames,options);
  };
 },pollScale);
 for(const [name,handle] of [['accounts',accounts],['chat',chat],['social',social],['media',media]] as const)await context.route(`**/.netlify/functions/${name}**`,async route=>{
  const req=route.request();
  const body=['POST','PUT'].includes(req.method())?(name==='media'?req.postDataBuffer()??undefined:req.postData()??undefined):undefined;
  const result=await handle(new Request(req.url(),{method:req.method(),headers:req.headers(),body:body as BodyInit|undefined}));
  await route.fulfill({status:result.status,headers:Object.fromEntries(result.headers),body:Buffer.from(await result.arrayBuffer())});
 });
}
const call=(handle:(request:Request)=>Promise<Response>,action:string,token:string|null,body?:unknown)=>
 handle(new Request(`https://qcc.test/.netlify/functions/x?action=${action}`,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'content-type':'application/json'}),...(token?{authorization:'Bearer '+token}:{})},body:body===undefined?undefined:JSON.stringify(body)}));
const stamp=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,5);
type User={name:string;token:string};
async function user(prefix:string):Promise<User>{
 const name=`${prefix}_${stamp()}`.slice(0,24);
 const response=await call(accounts,'signup',null,{username:name,password:PASSWORD});expect(response.status).toBe(201);return {name,token:(await response.json()).token};
}
async function logIn(page:Page,username:string){
 const dialog=page.locator('#accounts-dialog');await expect(dialog).toBeVisible();
 // These feature fixtures represent an established player; welcome behavior has its own suite.
 await page.evaluate(name=>localStorage.setItem('qcc:christmas-welcome:2026:'+name.toLowerCase(),'seen'),username);
 await dialog.getByLabel('Username',{exact:true}).fill(username);await dialog.getByLabel('Password',{exact:true}).fill(PASSWORD);
 await dialog.locator('form').getByRole('button',{name:'Log in',exact:true}).click();await expect(dialog).not.toBeVisible();
}
async function open(page:Page,name:string,hash:string){
 await page.goto('/');await logIn(page,name);
 await page.evaluate(h=>{location.hash=h;},hash);
}
const post=async(token:string,body:string)=>{const r=await call(social,'post',token,{body});expect(r.status).toBe(201);};
const say=async(from:User,to:User,body:string)=>{const r=await call(chat,'send',from.token,{to:to.name,kind:'text',body});expect(r.status).toBe(201);};
async function befriend(a:User,b:User){
 expect((await call(chat,'request',a.token,{username:b.name})).status).toBe(200);
 expect((await call(chat,'respond',b.token,{username:a.name,accept:true})).status).toBe(200);
}
async function snap(from:User,to:User){
 const image=await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f59e0b"/><stop offset="1" stop-color="#7c2d12"/></linearGradient></defs><rect width="900" height="1200" fill="url(#g)"/><circle cx="630" cy="420" r="170" fill="#fde68a"/></svg>')).png().toBuffer();
 const upload=await media(new Request('https://qcc.test/.netlify/functions/media?action=upload&purpose=snap',{method:'POST',headers:{'content-type':'image/png',authorization:'Bearer '+from.token},body:image as unknown as BodyInit}));
 expect(upload.status).toBe(201);
 expect((await call(chat,'send',from.token,{to:to.name,kind:'snap',mediaId:(await upload.json()).id})).status).toBe(201);
}

// ---- the frozen clock ----
/** Pauses every animation and CSS transition in the document (or under `root`) at its start. */
const freeze=(page:Page)=>page.evaluate(()=>{for(const a of document.getAnimations()){a.pause();a.currentTime=0;}});
/** Arms a watcher: as soon as `selector` is added (or gains `attr`), its animations are created (getAnimations flushes style) and paused at 0. */
const armFreeze=(page:Page,selector:string,attr?:string)=>page.evaluate(([selector,attr])=>{
 const hit=()=>{const el=document.querySelector(selector);if(!el)return false;for(const a of [...el.getAnimations({subtree:true}),...document.getAnimations()]){a.pause();a.currentTime=0;}return true;};
 const observer=new MutationObserver(()=>{if(hit())observer.disconnect();});
 observer.observe(document.body,{subtree:true,childList:true,attributes:!!attr,attributeFilter:attr?[attr]:undefined});
 (window as unknown as {__armed:MutationObserver}).__armed=observer;
},[attr?`${selector}[${attr}]`:selector,attr??''] as const);
const seek=(page:Page,t:number)=>page.evaluate(t=>{for(const a of document.getAnimations()){if(a.playState!=='paused')a.pause();a.currentTime=t;}return new Promise<void>(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>r())));},t);
type Clip={x:number;y:number;width:number;height:number};
async function clipOf(target:Locator,pad:{x?:number;y?:number}={}):Promise<Clip>{
 const box=(await target.boundingBox())!;const px=pad.x??12,py=pad.y??12;
 return {x:Math.max(0,Math.round(box.x-px)),y:Math.max(0,Math.round(box.y-py)),width:Math.round(box.width+2*px),height:Math.round(box.height+2*py)};
}
/** Screenshots `clip` at each time (ms) and writes one labelled strip. */
async function strip(page:Page,name:string,clip:Clip,times:number[]){
 const shots:Buffer[]=[];
 for(const t of times){await seek(page,t);shots.push(await page.screenshot({clip,animations:'allow',caret:'hide'}));}
 const gap=6,label=18,width=clip.width*times.length+gap*(times.length-1),height=clip.height+label;
 const text=times.map((t,i)=>`<text x="${i*(clip.width+gap)+4}" y="13" fill="#d4d4d8" font-family="sans-serif" font-size="12">${t} ms</text>`).join('');
 await sharp({create:{width,height,channels:3,background:'#27272a'}})
  .composite([{input:Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${label}">${text}</svg>`),top:0,left:0},...shots.map((input,i)=>({input,top:label,left:i*(clip.width+gap)}))])
  .png({compressionLevel:9,palette:true}).toFile(`${OUT}/${name}.png`);
 await page.evaluate(()=>{for(const a of document.getAnimations())a.play();});
}
const logOf=(page:Page)=>page.evaluate(()=>{const log=(window as unknown as {__animateLog:{target:string;props:string[];duration:number}[]}).__animateLog;return log.splice(0);});
/** CSS transitions and animations running right now (the shell reset should leave none in the apps). */
const cssRunning=(page:Page)=>page.evaluate(()=>document.getAnimations().filter(a=>!(a instanceof CSSTransition&&((a.effect as KeyframeEffect|null)?.target as Element|null)?.closest?.('.ui-tabbar,.ui-tabbar-mini'))&&(a instanceof CSSTransition||a instanceof CSSAnimation)).map(a=>`${a.constructor.name}:${(a as CSSTransition).transitionProperty??(a as CSSAnimation).animationName}`));

test('motion frames, phone',async({page,context})=>{
 test.setTimeout(180000);
 page.on('pageerror',e=>console.log('PAGEERROR',e.message));
 await connect(context,0.05);
 const me=await user('tama'),aroha=await user('aroha'),mere=await user('mere');
 await call(social,'follow',me.token,{username:aroha.name,on:true});
 for(let i=0;i<8;i++)await post(aroha.token,`Post number ${i+1}: low tide at Ōhope this morning, worth getting up early for.`);
 await befriend(me,mere);await say(mere,me,'Kia ora! Are you doing the quiz later?');await snap(mere,me);

 // Social: like pulse and count roll (rows 1, 4).
 await open(page,me.name,'#/social');
 const firstLike=page.locator('.social-feed > .social-post').first().locator('.social-action.is-like');
 await expect(firstLike).toBeVisible();await page.waitForTimeout(600);
 const actions=page.locator('.social-feed > .social-post').first().locator('.social-actions');
 const likeClip=await clipOf(actions,{x:4,y:6});
 await firstLike.evaluate(b=>{b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));for(const a of document.getAnimations()){a.pause();a.currentTime=0;}});
 await strip(page,'like-burst',{...likeClip,width:Math.min(likeClip.width,240)},[0,40,90,180,280]);
 expect((await logOf(page)).map(e=>`${e.target}:${e.duration}`)).toEqual(expect.arrayContaining(['cur:160','old:160','social-like-glyph:180','social-ring-pulse:280']));
 await expect(firstLike).toHaveAttribute('aria-pressed','true');

 // Social island Apps tab badge (DESIGN 3.6; mere's message and snap are unread).
 const apps=page.locator('.social-view .ui-tab[data-action=apps]');
 await expect(apps.locator('.apps-badge')).toHaveText('2');await expect(apps).toHaveAttribute('aria-label','Apps, 2 unread messages');
 await page.waitForTimeout(400);expect(await apps.locator('.apps-badge').evaluate(b=>getComputedStyle(b).backgroundColor)).toBe('rgb(255, 99, 126)');
 await page.screenshot({path:`${OUT}/social-island-badge.png`,clip:await clipOf(page.locator('.social-view .section-navigation'),{x:0,y:4})});

 // Social: new-posts pill enter and exit (row 5).
 await page.locator('section.social-view').evaluate(el=>el.scrollTo(0,900));await page.waitForTimeout(300);
 await armFreeze(page,'.social-new-pill');
 await post(aroha.token,'A brand new post');
 const pill=page.locator('.social-new-pill');await expect(pill).toHaveCount(1,{timeout:15000});
 const pillClip=await clipOf(pill,{x:24,y:14});
 await strip(page,'new-posts-pill-enter',pillClip,[0,50,100,200]);
 await pill.evaluate(b=>{b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));});
 await page.waitForTimeout(400);

 // Launcher sheet from the Social island (row 14: the existing glass sheet).
 await page.locator('section.social-view').evaluate(el=>el.scrollTo(0,0));
 await apps.evaluate(b=>{b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));for(const a of document.getAnimations()){a.pause();a.currentTime=0;}});
 await page.waitForTimeout(50);await freeze(page);
 await strip(page,'launcher-sheet-open',{x:0,y:420,width:390,height:424},[0,60,120,200,320]);
 await expect(page.locator('#apps-dialog [data-app=chat] .apps-badge')).toHaveText('2');
 expect(await page.locator('#apps-dialog [data-app=chat] .apps-badge').evaluate(b=>({ink:getComputedStyle(b).color,wrapped:b.children.length}))).toEqual({ink:'rgb(9, 9, 11)',wrapped:0});
 await page.screenshot({path:`${OUT}/launcher-badge.png`,clip:{x:0,y:480,width:390,height:364}});
 await page.keyboard.press('Escape');await expect(page.locator('#apps-dialog')).not.toBeVisible();

 // Chat: list -> conversation on phone (row 17).
 await page.evaluate(()=>{location.hash='#/chat';});
 const row=page.locator('a.chat-row').first();await expect(row).toBeVisible();await page.waitForTimeout(500);
 const chatApps=page.locator('.chat-view .ui-tab[data-action=apps] .apps-badge');await expect(chatApps).toHaveText('2');
 expect(await chatApps.evaluate(b=>getComputedStyle(b).backgroundColor)).toBe('rgb(255, 99, 126)');
 await armFreeze(page,'.chat-convo');
 await row.click();
 await expect(page.locator('.chat-convo')).toHaveCount(1);
 await strip(page,'chat-open-conversation',{x:0,y:0,width:390,height:844},[0,50,100,200]);
 await expect(page.locator('.chat-entry').first()).toBeVisible();await page.waitForTimeout(500);

 // Chat: send a message (row 8).
 const input=page.getByRole('textbox',{name:/^Message to /});
 await input.fill('Yes, after tea');
 await page.locator('.chat-send').evaluate(b=>{b.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));for(const a of document.getAnimations()){a.pause();a.currentTime=0;}});
 const mine=page.locator('.chat-group[data-mine=true]').last();await expect(mine).toBeVisible();
 await strip(page,'send-message',await clipOf(mine,{x:16,y:16}),[0,45,90,180]);
 expect((await logOf(page)).filter(e=>e.target==='chat-group'||e.target==='chat-entry').map(e=>`${e.target}:${e.duration}`)).toContain('chat-group:180');

 // Chat: snap viewer open, countdown, close (rows 11, 12, 13).
 await armFreeze(page,'img.chat-snap-img');
 await page.locator('button.chat-snap.is-new').click();
 await expect(page.locator('#chat-snap img.chat-snap-img')).toHaveCount(1);
 await strip(page,'snap-open',{x:0,y:0,width:390,height:844},[0,55,110,220]);
 await expect.poll(()=>page.evaluate(()=>document.getAnimations().filter(a=>a instanceof CSSTransition&&a.transitionProperty==='opacity'&&(a.effect as KeyframeEffect).target instanceof Element&&((a.effect as KeyframeEffect).target as Element).classList.contains('chat-snap-dot')).length)).toBe(1);
 await expect(page.locator('.chat-snap-dot')).toHaveCount(10);
 await page.evaluate(()=>{for(const a of document.getAnimations())if(a instanceof CSSTransition&&a.transitionProperty==='opacity'&&((a.effect as KeyframeEffect).target as Element).classList.contains('chat-snap-dot')){a.pause();a.currentTime=0;}});
 const ring=await clipOf(page.locator('.chat-snap-timer'),{x:8,y:8});
 const ringShots:Buffer[]=[];
 for(const t of [0,250,500,750,990]){
  await page.evaluate(t=>{for(const a of document.getAnimations())if(a instanceof CSSTransition&&a.transitionProperty==='opacity'&&((a.effect as KeyframeEffect).target as Element).classList.contains('chat-snap-dot'))a.currentTime=t;},t);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  ringShots.push(await page.screenshot({clip:ring}));
 }
 await sharp({create:{width:ring.width*5+24,height:ring.height,channels:3,background:'#27272a'}}).composite(ringShots.map((input,i)=>({input,top:0,left:i*(ring.width+6)}))).png({palette:true}).toFile(`${OUT}/snap-countdown.png`);
 await page.evaluate(()=>{for(const a of document.getAnimations())a.play();});
 await page.locator('.chat-snap-close').evaluate(b=>{b.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));for(const a of document.getAnimations()){if(!(a instanceof CSSTransition)){a.pause();a.currentTime=0;}}});
 await strip(page,'snap-close',{x:0,y:200,width:390,height:400},[0,40,80,159]);
 await expect(page.locator('#chat-snap')).toHaveCount(0);
 // The badge on the Chat island and the shell island, each with its own fill (glass ink leaves it alone).
 await page.evaluate(()=>{location.hash='#/collection';});
 await say(mere,me,'One more thing');
 const shell=page.locator('.app-navigation .ui-tab[data-action=apps] .apps-badge');await expect(shell).toBeVisible({timeout:15000});await page.waitForTimeout(400);
 expect(await shell.evaluate(b=>getComputedStyle(b).backgroundColor)).toBe('rgb(255, 99, 126)');
 await page.screenshot({path:`${OUT}/shell-island-badge.png`,clip:await clipOf(page.locator('.app-navigation .ui-tabbar'),{x:6,y:6})});
});

for(const trigger of ['media query','app setting'] as const)test(`reduced motion via ${trigger}`,async({page,context})=>{
 test.setTimeout(120000);
 await connect(context,0.05);
 const me=await user('rm'),aroha=await user('rma'),mere=await user('rmm');
 await call(social,'follow',me.token,{username:aroha.name,on:true});
 for(let i=0;i<8;i++)await post(aroha.token,`Reduced post ${i+1}, long enough to fill the feed and make it scroll past the fold.`);
 await befriend(me,mere);await say(mere,me,'Hello there');await snap(mere,me);
 if(trigger==='media query')await page.emulateMedia({reducedMotion:'reduce'});
 await open(page,me.name,'#/social');
 if(trigger==='app setting'){
  await page.locator('.social-view [data-action=menu]').click();
  await expect(page.locator('#menu')).toBeVisible();await page.locator('#motion').check();
  await page.keyboard.press('Escape');await expect(page.locator('#menu')).not.toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.classList.contains('reduce-motion'))).toBe(true);
 }
 expect(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(trigger==='media query');
 const report:Record<string,unknown>={};
 const like=page.locator('.social-feed > .social-post').first().locator('.social-action.is-like');
 await expect(like).toBeVisible();await logOf(page);
 await like.click();await expect(like).toHaveAttribute('aria-pressed','true');
 report.like={waapi:await logOf(page),css:await cssRunning(page)};
 // A pressed button does not scale (row 24).
 const box=(await like.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
 report.pressTransform=await like.evaluate(b=>getComputedStyle(b).transform);await page.mouse.up();
 await page.locator('section.social-view').evaluate(el=>el.scrollTo(0,900));await page.waitForTimeout(200);
 await post(aroha.token,'A brand new post');
 const pill=page.locator('.social-new-pill');await expect(pill).toHaveCount(1,{timeout:15000});
 report.pill={css:await cssRunning(page),opacity:await pill.evaluate(p=>getComputedStyle(p).opacity),transform:await pill.evaluate(p=>getComputedStyle(p).transform)};
 await page.locator('section.social-view').evaluate(el=>el.scrollTo(0,0));
 await page.locator('.social-view .ui-tab[data-action=apps]').click();
 report.sheet={css:await cssRunning(page),open:await page.locator('#apps-dialog').evaluate(d=>({opacity:getComputedStyle(d).opacity,scale:getComputedStyle(d).scale,translate:getComputedStyle(d).translate}))};
 await page.keyboard.press('Escape');
 await page.evaluate(()=>{location.hash='#/chat';});
 await page.locator('a.chat-row').first().click();
 await expect(page.locator('.chat-entry').first()).toBeVisible();await page.waitForTimeout(300);
 report.open=await logOf(page);
 await page.getByRole('textbox',{name:/^Message to /}).fill('Quiet send');await page.getByRole('button',{name:'Send message'}).click();
 await expect(page.locator('.chat-entry').filter({hasText:'Quiet send'})).toBeVisible();
 report.send={waapi:await logOf(page),css:await cssRunning(page)};
 await page.locator('button.chat-snap.is-new').click();
 await expect(page.locator('#chat-snap img.chat-snap-img')).toBeVisible();
 await page.waitForTimeout(1300);
 report.snap={waapi:await logOf(page),dotTransition:await page.locator('.chat-snap-dot').first().evaluate(c=>getComputedStyle(c).transitionDuration),dots:await page.locator('.chat-snap-dot').count(),spent:await page.locator('.chat-snap-dot.is-spent').count(),secs:await page.locator('.chat-snap-secs').textContent()};
 await page.getByRole('button',{name:'Close photo'}).click();
 await expect(page.locator('#chat-snap')).toHaveCount(0);
 report.snapClose=await logOf(page);
 console.log(`REDUCED ${trigger}: ${JSON.stringify(report)}`);
 // Nothing moves: no transform in any WAAPI call, and only the allowed 120 ms opacity fades (rows 11 and 17).
 const all=[...(report.like as {waapi:{props:string[]}[]}).waapi,...(report.open as {props:string[]}[]),...(report.send as {waapi:{props:string[]}[]}).waapi,...(report.snap as {waapi:{props:string[];duration:number}[]}).waapi,...(report.snapClose as {props:string[]}[])];
 for(const call of all)expect(call.props).toEqual(['opacity']);
 for(const call of (report.snap as {waapi:{duration:number}[]}).waapi)expect(call.duration).toBe(120);
 expect((report.like as {waapi:unknown[]}).waapi).toHaveLength(0);expect((report.send as {waapi:unknown[]}).waapi).toHaveLength(0);expect(report.snapClose).toHaveLength(0);
 expect((report.like as {css:unknown[]}).css).toEqual([]);expect((report.pill as {css:unknown[]}).css).toEqual([]);expect((report.sheet as {css:unknown[]}).css).toEqual([]);
 expect(report.pressTransform).toBe('none');
 expect((report.pill as {opacity:string}).opacity).toBe('1');
 expect((report.snap as {dotTransition:string}).dotTransition).toMatch(/^0s$|^0\.00001s$|^1e-05s$/);
 // Stepped, not smooth: after 1.3 s exactly one dot has gone out and the label agrees.
 expect((report.snap as {dots:number}).dots).toBe(10);expect((report.snap as {spent:number}).spent).toBe(1);expect((report.snap as {secs:string}).secs).toBe('9s');
});
