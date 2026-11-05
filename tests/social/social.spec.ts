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

for(const width of [390,1440])test(`profile sticky tabs hide scrolled reply fragments at ${width}px`,async({page,context},testInfo)=>{
 await connect(context);await page.setViewportSize({width,height:844});
 const a=await user('pin');
 await call(social,'profile',a.token,{displayName:'Visible reply author',bio:'This biography must remain visible before the tabs stick.'});
 const root=await post(a.token,'Original discussion');
 for(let i=0;i<12;i++)await post(a.token,`Reply ${i}: enough content to scroll beneath the floating toolbar.`,{replyTo:root.id});
 await open(page,a.name,`#/social/u/${a.name}/replies`);
 const tabs=page.getByRole('tablist',{name:'Profile sections'}),cards=page.locator('.social-profile-panel .social-post');
 await expect(cards).toHaveCount(12);
 const headerVisible=async()=>{
  await expect(page.locator('.social-profile-bio')).toBeInViewport();
  expect(await page.locator('.social-profile-counts').evaluate(el=>{
   const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+20,r.y+r.height/2));
  })).toBe(true);
  expect(await page.locator('.social-banner').evaluate(el=>{
   const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+30));
  })).toBe(true);
 };
 await headerVisible();
 for(const index of [0,1,2]){
  await cards.nth(index).evaluate(el=>{
   const scroller=el.closest<HTMLElement>('.social-view')!;
   scroller.scrollTop+=el.getBoundingClientRect().top-scroller.getBoundingClientRect().top-20;
  });
  await expect.poll(async()=>Math.round((await tabs.boundingBox())!.y)).toBe(64);
  // The middle of the floating toolbar must not reveal a detached author or image
  // above the tabs. Exclude the intentionally visible back/settings controls.
  await expect.poll(async()=>{
   const r=(await tabs.boundingBox())!;
   const image=await page.screenshot({clip:{x:r.x+72,y:2,width:r.width-144,height:r.y-4}});
   const stats=await sharp(image).removeAlpha().stats();
   return Math.max(...stats.channels.map(c=>c.max));
  },{message:'Scrolled posts must remain hidden above the pinned profile tabs'}).toBeLessThanOrEqual(1);
 }
 await page.screenshot({path:testInfo.outputPath(`profile-sticky-${width}.png`)});
 await page.getByRole('tab',{name:'Photos',exact:true}).click();
 await expect(page.getByText('No photos yet',{exact:true})).toBeVisible();
 await view(page).evaluate(el=>{el.scrollTop=0;});await headerVisible();
 await page.getByRole('tab',{name:'Replies',exact:true}).click();
 await expect(cards).toHaveCount(12);
 await view(page).evaluate(el=>{el.scrollTop=0;});await headerVisible();
 // The mask must neither eat toolbar clicks nor survive profile disposal.
 await page.getByRole('link',{name:'Social settings',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Settings',level:1})).toBeVisible();
 await page.evaluate(h=>{location.hash=h;},`#/social/u/${a.name}/replies`);
 await expect(cards).toHaveCount(12);await headerVisible();
 await page.getByRole('link',{name:'Back to feed',exact:true}).click();
 await expect(page.locator('.social-profile')).toHaveCount(0);
});

test('signed out shows log in prompt',async({page,context})=>{
 await connect(context);await page.goto('/');await guest(page);
 await page.evaluate(()=>{location.hash='#/social';});
 await expect(page.getByRole('heading',{name:'QCC Social',level:1})).toBeVisible();
 await expect(view(page)).toContainText('Short posts from other QCC players. Follow people, reply and like. Log in to see the feed.');
 await expect(page.getByRole('link',{name:'Back to games'}).first()).toBeVisible();
 await page.getByRole('button',{name:'Log in / Sign up'}).click();
 await expect(page.locator('#accounts-dialog')).toBeVisible();
});

test('two users: follow, post, see in following feed, like, reply, open thread',async({page,browser,context})=>{
 await connect(context);
 const a=await user('fa'),b=await user('fb');
 const text=`Kia ora from ${b.name}`;
 // B posts through the UI.
 const other=await browser.newContext({viewport:{width:390,height:844}});await connect(other);
 const pageB=await other.newPage();await open(pageB,b.name);
 await pageB.getByRole('button',{name:'New post'}).click();
 const sheet=pageB.locator('#social-compose');await expect(sheet).toBeVisible();
 await sheet.getByRole('textbox',{name:'Post text'}).fill(text);
 await sheet.getByRole('button',{name:'Publish'}).click();
 await expect(sheet).not.toBeVisible();
 await expect(pageB.locator('.social-post').filter({hasText:text})).toBeVisible();
 await other.close();
 // A follows B from the profile and sees the post in Following.
 await open(page,a.name);
 await expect(page.getByText('Your feed is empty')).toBeVisible();
 await page.getByRole('link',{name:'Discover'}).or(page.getByRole('tab',{name:'Discover'})).first().click();
 const card=page.locator('.social-post').filter({hasText:text});
 await expect(card).toBeVisible();
 await card.locator('a.social-name').click();
 await expect(page).toHaveURL(new RegExp(`#/social/u/${b.name}$`));
 await page.getByRole('button',{name:`Follow @${b.name}`}).click();
 await expect(page.getByRole('button',{name:`Following @${b.name}`})).toHaveAttribute('aria-pressed','true');
 await page.locator('.social-view .ui-tab[data-tab=home]').click();
 await expect(page).toHaveURL(/#\/social$/);
 const following=page.locator('.social-post').filter({hasText:text});
 await expect(following).toBeVisible();
 // Like is optimistic and sticks.
 const like=following.getByRole('button',{name:/^Like, 0 likes/});
 await like.click();
 await expect(following.getByRole('button',{name:'Like, 1 like'})).toHaveAttribute('aria-pressed','true');
 // Open the thread and reply.
 await following.locator('.social-body').click();
 await expect(page).toHaveURL(/#\/social\/post\/[0-9a-f-]{36}$/);
 await expect(page.locator('.social-post.is-focused')).toContainText(text);
 await expect(page.locator('.social-counts')).toContainText('1 like');
 await page.getByRole('button',{name:'Write a reply'}).click();
 const reply=page.locator('#social-compose');await expect(reply).toBeVisible();
 await expect(reply.getByRole('heading',{name:`Reply to @${b.name}`})).toBeVisible();
 await reply.getByRole('textbox',{name:'Post text'}).fill('Thanks for sharing');
 await reply.getByRole('button',{name:'Reply',exact:true}).click();
 await expect(reply).not.toBeVisible();
 await expect(page.locator('.social-replies .social-post').filter({hasText:'Thanks for sharing'})).toBeVisible();
 await expect(page.locator('.social-counts')).toContainText('1 reply');
});

test('composer ring and limit',async({page,context})=>{
 await connect(context);const a=await user('cr');await open(page,a.name);
 await page.getByRole('button',{name:'New post'}).click();
 const sheet=page.locator('#social-compose'),box=sheet.getByRole('textbox',{name:'Post text'}),publish=sheet.getByRole('button',{name:'Publish'});
 const ring=sheet.locator('.social-ring'),arc=sheet.locator('.social-ring-arc');
 await expect(publish).toBeDisabled();await expect(ring).toBeHidden();
 await box.fill('hello');
 await expect(publish).toBeEnabled();await expect(ring).toHaveAttribute('data-state','ok');
 await expect(sheet.locator('.social-count')).toHaveText('');
 await box.fill('😀'.repeat(270));
 await expect(ring).toHaveAttribute('data-state','warn');
 await expect(sheet.locator('.social-count')).toHaveText('10');
 await expect(sheet.locator('.social-helper')).toHaveText('10 characters left');
 await box.fill('😀'.repeat(280));
 await expect(publish).toBeEnabled();await expect(sheet.locator('.social-count')).toHaveText('0');
 await expect(arc).toHaveAttribute('stroke-dashoffset','0');
 await box.fill('😀'.repeat(281));
 await expect(publish).toBeDisabled();await expect(ring).toHaveAttribute('data-state','over');
 await expect(sheet.locator('.social-count')).toHaveText('-1');
 await expect(sheet.locator('.social-helper')).toHaveText('Too long by 1 character');
 await expect(sheet.locator('.social-count')).toHaveCSS('color','rgb(255, 100, 103)');
 await box.fill('x'.repeat(100));
 const offset=Number(await arc.getAttribute('stroke-dashoffset'));expect(offset).toBeCloseTo(62.83*(1-100/280),1);
 // Closing with text asks first.
 await sheet.getByRole('button',{name:'Close'}).click();
 const confirm=page.locator('#apps-confirm');await expect(confirm).toBeVisible();
 await expect(confirm.getByRole('heading',{name:'Discard this post?'})).toBeVisible();
 await confirm.getByRole('button',{name:'Keep editing'}).click();
 await expect(sheet).toBeVisible();await expect(box).toHaveValue('x'.repeat(100));
 await sheet.getByRole('button',{name:'Close'}).click();
 await page.locator('#apps-confirm').getByRole('button',{name:'Discard'}).click();
 await expect(sheet).not.toBeVisible();
});

test('block hides the other user\'s posts',async({page,context})=>{
 await connect(context);const a=await user('ba'),b=await user('bb');
 const text=`blockable ${stamp()}`;await post(b.token,text);
 await open(page,a.name,'#/social/discover');
 const card=page.locator('.social-post').filter({hasText:text});await expect(card).toBeVisible();
 await card.getByRole('button',{name:'More options for this post'}).click();
 await page.getByRole('menuitem',{name:`Block @${b.name}`}).click();
 const confirm=page.locator('#apps-confirm');await expect(confirm.getByRole('heading',{name:`Block @${b.name}?`})).toBeVisible();
 await expect(confirm.getByRole('button',{name:'Cancel'})).toBeFocused();
 await confirm.getByRole('button',{name:'Block',exact:true}).click();
 await expect(page.getByText(`Blocked @${b.name}.`)).toBeVisible();
 await expect(page.locator('.social-post').filter({hasText:text})).toHaveCount(0);
 // Their profile is now the blocked state with Unblock, in Settings the list shows them.
 await page.evaluate(h=>{location.hash=h;},`#/social/u/${b.name}`);
 await expect(page.getByRole('heading',{name:`You blocked @${b.name}`})).toBeVisible();
 await page.getByRole('button',{name:'Unblock'}).click();
 await expect(page.getByText(`Unblocked @${b.name}. Follows aren't restored.`)).toBeVisible();
});

test('report menu submits',async({page,context})=>{
 await connect(context);const a=await user('ra'),b=await user('rb');
 const text=`reportable ${stamp()}`;const made=await post(b.token,text);
 await open(page,a.name,'#/social/discover');
 const card=page.locator('.social-post').filter({hasText:text});
 await card.getByRole('button',{name:'More options for this post'}).click();
 await page.getByRole('menuitem',{name:'Report post'}).click();
 const sheet=page.locator('#apps-report');await expect(sheet.getByRole('heading',{name:'Report post'})).toBeVisible();
 const send=sheet.getByRole('button',{name:'Send report'});await expect(send).toBeDisabled();
 await sheet.getByLabel('Self-harm').check();
 await expect(sheet.getByText("If you or someone else isn't safe right now, call 111.")).toBeVisible();
 await sheet.getByLabel('Spam').check();
 await expect(sheet.getByText("isn't safe right now")).toBeHidden();
 await sheet.getByLabel('Anything else? (optional)').fill('looks like an advert');
 await send.click();
 await expect(sheet.getByText('Thanks. QCC moderators will review this.')).toBeVisible();
 await expect(sheet.getByRole('button',{name:`Block @${b.name} too`})).toBeVisible();
 await sheet.getByRole('button',{name:'Done'}).click();
 const rows=await pool.query("SELECT category,note,target_kind FROM social_reports WHERE target_id=$1",[made.id]);
 expect(rows.rows).toEqual([{category:'spam',note:'looks like an advert',target_kind:'post'}]);
});

test('photo post uploads through pipeline and renders thumbnail',async({page,context})=>{
 await connect(context);const a=await user('ph');await open(page,a.name);
 mediaDelay=700;
 try{
  await page.getByRole('button',{name:'New post'}).click();
  const sheet=page.locator('#social-compose'),publish=sheet.getByRole('button',{name:'Publish'});
  await sheet.locator('input[type=file]').setInputFiles({name:'pic.png',mimeType:'image/png',buffer:await png()});
  const chip=sheet.locator('.apps-upload');
  await expect(chip).toHaveAttribute('data-stage',/compressing|uploading|processing/);
  await expect(publish).toBeDisabled();
  await expect(sheet.locator('.social-helper')).toHaveText('Wait for photos to finish uploading');
  await expect(chip).toHaveAttribute('data-stage','ready',{timeout:15000});
  await expect(chip).toHaveAttribute('aria-label','Photo 1 of 1, Ready');
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(sheet).not.toBeVisible();
 }finally{mediaDelay=0;}
 const tile=page.locator('.social-post .social-media-tile img').first();
 await expect(tile).toBeVisible();
 await expect.poll(()=>tile.evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);
 expect(await tile.getAttribute('src')).toMatch(/media\?action=get&id=m_[a-f0-9]{32}&v=thumb/);
 // The viewer opens on the full image and Escape returns focus to the tile.
 await page.locator('.social-media-tile').first().click();
 const viewer=page.locator('#social-photo');await expect(viewer).toBeVisible();
 await expect(viewer.locator('img')).toHaveAttribute('src',/v=full/);
 await page.keyboard.press('Escape');await expect(viewer).not.toBeVisible();
 await expect(page.locator('body')).toHaveClass(/social-active/);
});

test('rich text links are safe',async({page,context})=>{
 await connect(context);const a=await user('rt');
 const html='<img src=x onerror=alert(1)>';
 await post(a.token,`javascript:alert(1) ${html} https://example.com`);
 const dialogs:string[]=[];page.on('dialog',d=>{dialogs.push(d.message());void d.dismiss();});
 await open(page,a.name);
 const body=page.locator('.social-post .social-body').first();await expect(body).toBeVisible();
 await expect(body.locator('a')).toHaveCount(1);
 const link=body.locator('a');
 await expect(link).toHaveAttribute('href','https://example.com');
 await expect(link).toHaveAttribute('rel','noopener noreferrer nofollow ugc');await expect(link).toHaveAttribute('target','_blank');
 await expect(body.locator('img')).toHaveCount(0);
 await expect(body).toContainText(html);
 await expect(body).toContainText('javascript:alert(1)');
 expect(await page.evaluate(()=>(window as unknown as {__xss?:unknown}).__xss)).toBeUndefined();
 expect(dialogs).toEqual([]);
});

test('keyboard shortcuts do not fire while typing',async({page,context})=>{
 await connect(context);const a=await user('ks');
 for(const n of [1,2,3])await post(a.token,`shortcut post ${n}`);
 await open(page,a.name);
 const cards=page.locator('.social-feed > .social-post');await expect(cards).toHaveCount(3);
 await view(page).press('j');await expect(cards.nth(0)).toBeFocused();
 await page.keyboard.press('j');await expect(cards.nth(1)).toBeFocused();
 await page.keyboard.press('k');await expect(cards.nth(0)).toBeFocused();
 await page.keyboard.press('l');
 await expect(cards.nth(0).getByRole('button',{name:/^Like,/})).toHaveAttribute('aria-pressed','true');
 await page.keyboard.press('l');
 await expect(cards.nth(0).getByRole('button',{name:/^Like,/})).toHaveAttribute('aria-pressed','false');
 // n opens the compose sheet; typed letters stay text and fire nothing.
 await page.keyboard.press('n');
 const sheet=page.locator('#social-compose');await expect(sheet).toBeVisible();
 const box=sheet.getByRole('textbox',{name:'Post text'});await expect(box).toBeFocused();
 await page.keyboard.type('jklnr? /o');
 await expect(box).toHaveValue('jklnr? /o');
 await expect(page.locator('#social-shortcuts')).toHaveCount(0);
 await expect(page.locator('#social-compose')).toHaveCount(1);
 await expect(cards.nth(0).getByRole('button',{name:/^Like,/})).toHaveAttribute('aria-pressed','false');
 await expect(page).toHaveURL(/#\/social$/);
 // With a dialog open and focus outside the field, the keys are still ignored.
 await sheet.getByRole('button',{name:'Close'}).click();
 await page.locator('#apps-confirm').getByRole('button',{name:'Discard'}).click();
 await expect(sheet).not.toBeVisible();
 await page.locator('.social-view').focus();
 await page.keyboard.press('?');await expect(page.locator('#social-shortcuts')).toBeVisible();
 // The root listener would run for these, so only the open-dialog guard keeps them quiet.
 await page.evaluate(()=>{const root=document.querySelector('.social-view')!;for(const key of ['n','j','l'])root.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));});
 await expect(page.locator('#social-compose')).toHaveCount(0);
 await expect(page.locator('.social-feed > .social-post:focus')).toHaveCount(0);
 await expect(cards.nth(0).getByRole('button',{name:/^Like,/})).toHaveAttribute('aria-pressed','false');
 // Closed again, the same event does act (so the assertions above were meaningful).
 await page.locator('#social-shortcuts').getByRole('button',{name:'Close shortcuts'}).click();
 await expect(page.locator('#social-shortcuts')).toHaveCount(0,{timeout:3000});
 await page.evaluate(()=>{document.querySelector('.social-view')!.dispatchEvent(new KeyboardEvent('keydown',{key:'n',bubbles:true,cancelable:true}));});
 await expect(page.locator('#social-compose')).toBeVisible();
});

test('reduced motion disables like burst',async({page,context})=>{
 await connect(context);const a=await user('rm');await post(a.token,'motion post');
 await open(page,a.name);
 const card=()=>page.locator('.social-feed > .social-post').first();await expect(card()).toBeVisible();
 // With motion allowed the tap animates (the pulse and the count roll).
 const count=await card().evaluate(async el=>{
  el.querySelector<HTMLButtonElement>('[data-action=like]')!.click();
  await new Promise(resolve=>requestAnimationFrame(()=>resolve(null)));
  return el.getAnimations({subtree:true}).length;
 });
 expect(count).toBeGreaterThan(0);
 await expect(card().getByRole('button',{name:'Like, 1 like'})).toHaveAttribute('aria-pressed','true');
 // Wait for the unlike to reach the server: reloading with it in flight leaves like=1, so the next click would unlike.
 const unliked=page.waitForResponse(r=>r.url().includes('action=like')&&r.request().method()==='POST'&&(r.request().postData()??'').includes('"on":false'));
 await card().getByRole('button',{name:'Like, 1 like'}).click();
 await expect(card().getByRole('button',{name:'Like, 0 likes'})).toHaveAttribute('aria-pressed','false');
 await unliked;
 // With reduced motion (the media query) nothing runs, however soon we look.
 await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
 await expect(card()).toBeVisible();
 const reduced=await card().evaluate(async el=>{
  el.querySelector<HTMLButtonElement>('[data-action=like]')!.click();
  await new Promise(resolve=>requestAnimationFrame(()=>resolve(null)));
  return el.getAnimations({subtree:true}).map(a=>(a as CSSTransition).transitionProperty??(a as CSSAnimation).animationName??'waapi');
 });
 expect(reduced).toEqual([]);
 await expect(card().getByRole('button',{name:'Like, 1 like'})).toHaveAttribute('aria-pressed','true');
});

test('new posts pill appears when scrolled and merges on tap',async({page,context})=>{
 await connect(context,{pollScale:0.05});const a=await user('np');
 for(let i=1;i<=8;i++)await post(a.token,`seed post ${i} `+'lorem ipsum '.repeat(12));
 await open(page,a.name);
 await expect(page.locator('.social-feed > .social-post')).toHaveCount(8);
 await page.locator('.social-view').evaluate(el=>el.scrollTo({top:600}));
 await post(a.token,'a brand new post');
 const pill=page.getByRole('button',{name:'1 new post'});await expect(pill).toBeVisible({timeout:10000});
 await expect(page.locator('.social-post').filter({hasText:'a brand new post'})).toHaveCount(0);
 // Let the pill's entrance transition finish first: an unstable target makes Playwright retry the click with other
 // scroll alignments, which scrolls the feed to the top, and reaching the top merges the posts on purpose, removing the pill.
 await pill.evaluate(el=>Promise.all(el.getAnimations().map(a=>a.finished)));
 await pill.click();
 await expect(page.locator('.social-feed > .social-post').first()).toContainText('a brand new post');
 await expect.poll(()=>page.locator('.social-view').evaluate(el=>el.scrollTop)).toBeLessThan(5);
 await expect(pill).toHaveCount(0);
});

test('settings: edit profile, blocked list and delete all data',async({page,context})=>{
 await connect(context);const a=await user('st'),b=await user('sb');
 await call(social,'block',a.token,{username:b.name,on:true});
 await post(a.token,'to be deleted');
 await open(page,a.name,'#/social/settings');
 await expect(page.getByRole('heading',{name:'Settings',level:1})).toBeVisible();
 await expect(page.getByRole('button',{name:`Unblock @${b.name}`})).toBeVisible();
 const save=page.getByRole('button',{name:'Save',exact:true});await expect(save).toBeDisabled();
 await page.getByLabel('Display name').fill('Tester Tama');await page.getByLabel('Bio').fill('Hello there');
 await save.click();await expect(page.getByText('Saved',{exact:true})).toBeVisible();
 await expect(page.getByLabel('Display name')).toHaveValue('Tester Tama');
 await page.getByRole('button',{name:'Delete all my Social and Chat data'}).click();
 const confirm=page.locator('#apps-confirm');
 const go=confirm.getByRole('button',{name:'Delete everything'});await expect(go).toBeDisabled();
 await confirm.getByLabel('Type your username to confirm').fill(a.name.toUpperCase());await expect(go).toBeEnabled();
 await go.click();
 await expect(page.getByText('Your Social and Chat data has been deleted.')).toBeVisible();
 await expect(page).toHaveURL(new RegExp(`#/social/u/${a.name}$`));
});

for(const size of [{width:390,height:844},{width:1440,height:900}])test(`layout has no horizontal scroll at ${size.width}x${size.height}`,async({page,context})=>{
 await connect(context);await page.setViewportSize(size);
 const a=await user('lo'),b=await user('lb');
 const pic=await png(800,500);
 const upload=await media(new Request('https://qcc.test/.netlify/functions/media?action=upload&purpose=post',{method:'POST',headers:{'content-type':'image/png',authorization:'Bearer '+a.token},body:new Uint8Array(pic)}));
 expect(upload.status).toBe(201);const mediaId=(await upload.json()).id as string;
 const made=await post(a.token,`A long post with a https://example.com/${'verylongpath'.repeat(8)} link and a very long unbroken word ${'x'.repeat(80)}`,{media:[mediaId]});
 await post(b.token,'Another voice in the room');await call(social,'follow',a.token,{username:b.name,on:true});
 await call(social,'like',b.token,{id:made.id,on:true});
 const check=async(label:string)=>{
  await page.waitForTimeout(250);
  const m=await page.evaluate(()=>({doc:document.documentElement.scrollWidth-document.documentElement.clientWidth,view:(()=>{const v=document.querySelector('.social-view')!;return v.scrollWidth-v.clientWidth;})(),inner:innerWidth}));
  expect(m.doc,label).toBeLessThanOrEqual(0);expect(m.view,label).toBeLessThanOrEqual(0);
 };
 await open(page,a.name);
 await expect(page.locator('.social-post .social-media-tile img').first()).toBeVisible();await check('feed');
 await page.evaluate(h=>{location.hash=h;},`#/social/post/${made.id}`);await expect(page.locator('.social-post.is-focused')).toBeVisible();await check('thread');
 await page.evaluate(h=>{location.hash=h;},`#/social/u/${a.name}`);await expect(page.getByRole('tab',{name:'Posts'})).toBeVisible();await check('profile');
 await page.evaluate(h=>{location.hash=h;},'#/social/activity');await expect(page.getByRole('heading',{name:'Activity',level:1})).toBeVisible();await check('activity');
 await page.evaluate(h=>{location.hash=h;},'#/social/settings');await expect(page.getByRole('heading',{name:'Settings',level:1})).toBeVisible();await check('settings');
 await page.evaluate(h=>{location.hash=h;},`#/social/search?q=${b.name.slice(0,5)}`);await expect(page.locator('.social-person').first()).toBeVisible();await check('search');
});

test('open sheets close when leaving Social, so Escape still opens Study',async({page,context})=>{
 await connect(context);const a=await user('es'),b=await user('eb');
 const text=`escape ${stamp()}`;await post(b.token,text);
 await open(page,a.name,'#/social/discover');
 const card=page.locator('.social-post').filter({hasText:text});
 await card.getByRole('button',{name:'More options for this post'}).click();
 await page.getByRole('menuitem',{name:'Report post'}).click();
 await expect(page.locator('#apps-report')).toBeVisible();
 await page.evaluate(()=>{location.hash='#/collection';});
 await expect(page.locator('section.social-view')).toHaveCount(0);
 await expect(page.locator('dialog.apps-sheet[open]')).toHaveCount(0);
 // A stale modal would swallow Escape on the next visit.
 await page.evaluate(()=>{location.hash='#/social';});
 await expect(page.locator('section.social-view')).toBeVisible();
 await page.keyboard.press('Escape');
 await expect(page.locator('body')).toHaveClass(/study-active/);
});

test('self-harm report keeps the support card after sending',async({page,context})=>{
 await connect(context);const a=await user('sh'),b=await user('sj');
 const text=`care ${stamp()}`;await post(b.token,text);
 await open(page,a.name,'#/social/discover');
 await page.locator('.social-post').filter({hasText:text}).getByRole('button',{name:'More options for this post'}).click();
 await page.getByRole('menuitem',{name:'Report post'}).click();
 const sheet=page.locator('#apps-report');
 await sheet.getByLabel('Self-harm').check();
 await sheet.getByRole('button',{name:'Send report'}).click();
 await expect(sheet.getByText('Thanks. QCC moderators will review this.')).toBeVisible();
 await expect(sheet.locator('.apps-report-done .apps-help')).toHaveText("If you or someone else isn't safe right now, call 111. You can talk to someone any time: call or text 1737, or call Youthline on 0800 376 633.");
});

test('a failed rapid second like rolls back to the last confirmed state',async({page,context})=>{
 await connect(context);const a=await user('lk');await post(a.token,'like me');
 await open(page,a.name);
 const card=page.locator('.social-feed > .social-post').first();await expect(card).toBeVisible();
 let calls=0;
 await page.route('**/.netlify/functions/social?action=like',async route=>{
  calls++;
  if(calls===1){await new Promise(r=>setTimeout(r,500));await route.fallback();}
  else await route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({error:'boom'})});
 });
 await card.getByRole('button',{name:/^Like,/}).click();
 await expect(card.getByRole('button',{name:'Like, 1 like'})).toHaveAttribute('aria-pressed','true');
 await card.getByRole('button',{name:'Like, 1 like'}).click();
 await expect(card.getByRole('button',{name:'Like, 0 likes'})).toHaveAttribute('aria-pressed','false');
 await expect.poll(()=>calls).toBe(2);
 // The server kept the first like; the card must show it again.
 await expect(card.getByRole('button',{name:'Like, 1 like'})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText("Couldn't like that. Try again.")).toBeVisible();
 const row=await pool.query("SELECT count(*)::int AS n FROM social_likes l JOIN accounts x ON x.id=l.account_id WHERE x.username=$1",[a.name]);
 expect(row.rows[0].n).toBe(1);
});

test('user text from profiles and search renders as text',async({page,context})=>{
 await connect(context);const a=await user('xs');
 const evil='<img src=x onerror=window.__xss=1>';
 expect((await call(social,'profile',a.token,{displayName:evil,bio:evil})).status).toBe(200);
 await post(a.token,'hello from a tricky name');
 const dialogs:string[]=[];page.on('dialog',d=>{dialogs.push(d.message());void d.dismiss();});
 await open(page,a.name);
 await expect(page.locator('.social-post .social-name').first()).toHaveText(evil);
 await page.evaluate(h=>{location.hash=h;},`#/social/u/${a.name}`);
 await expect(page.locator('.social-profile-name')).toHaveText(evil);
 await expect(page.locator('.social-profile-bio')).toHaveText(evil);
 const q='<svg onload=window.__xss=1>zzz';
 await page.evaluate(h=>{location.hash=h;},`#/social/search?q=${encodeURIComponent(q)}`);
 await expect(page.getByText(`No people match “${q}”.`)).toBeVisible();
 await page.evaluate(h=>{location.hash=h;},`#/social/search?q=${encodeURIComponent(evil)}&in=posts`);
 await expect(page.getByText(`No posts match “${evil}”.`)).toBeVisible();
 expect(await page.locator('.social-view img[onerror], .social-view svg[onload]').count()).toBe(0);
 expect(await page.evaluate(()=>(window as unknown as {__xss?:unknown}).__xss)).toBeUndefined();
 expect(dialogs).toEqual([]);
});

test('rate limited post shows the limit copy in the composer',async({page,context})=>{
 await connect(context);const a=await user('rl');await open(page,a.name);
 await page.route('**/.netlify/functions/social?action=post',route=>route.fulfill({status:429,headers:{'Retry-After':'120','content-type':'application/json'},body:JSON.stringify({error:'rate_limited'})}));
 await page.getByRole('button',{name:'New post'}).click();
 const sheet=page.locator('#social-compose');
 await sheet.getByRole('textbox',{name:'Post text'}).fill('too many');
 await sheet.getByRole('button',{name:'Publish'}).click();
 await expect(sheet.getByRole('alert')).toHaveText("You've posted a lot this hour. Try again in 2 min.");
 await expect(sheet.getByRole('textbox',{name:'Post text'})).toHaveValue('too many');
 await expect(sheet.getByRole('button',{name:'Publish'})).toBeEnabled();
});

test('feed polling stops while hidden and while Study is open',async({page,context})=>{
 await connect(context,{pollScale:0.05});const a=await user('pl');await post(a.token,'poll me');
 let feeds=0;page.on('request',r=>{if(r.url().includes('/functions/social')&&r.url().includes('action=feed'))feeds++;});
 await open(page,a.name);
 await expect.poll(()=>feeds).toBeGreaterThanOrEqual(3);
 const setVisibility=(state:'visible'|'hidden')=>page.evaluate(value=>{
  Object.defineProperty(document,'visibilityState',{configurable:true,get:()=>value});
  Object.defineProperty(document,'hidden',{configurable:true,get:()=>value==='hidden'});
  document.dispatchEvent(new Event('visibilitychange'));
 },state);
 await setVisibility('hidden');await page.waitForTimeout(300);
 const hiddenCount=feeds;await page.waitForTimeout(3600);expect(feeds).toBe(hiddenCount);
 await setVisibility('visible');
 await expect.poll(()=>feeds).toBeGreaterThan(hiddenCount);
 await page.keyboard.press('Escape');await expect(page.locator('body')).toHaveClass(/study-active/);
 await page.waitForTimeout(300);
 const studyCount=feeds;await page.waitForTimeout(3600);expect(feeds).toBe(studyCount);
});
