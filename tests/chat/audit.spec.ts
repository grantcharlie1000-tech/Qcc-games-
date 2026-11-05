import {captureAuditEvidence} from '../helpers/audit-evidence';
import {test,expect,type Page,type BrowserContext,type Locator,type ElementHandle} from '@playwright/test';

// UI regressions from the November phone audit. Only the network boundary is
// stubbed, so the production router, dialogs, composer and badge lifecycle run.
const friend={username:'audit_friend',displayName:'Audit friend',avatar:null};
const at='2026-11-05T10:00:00.000Z';
async function setup(context:BrowserContext,{signedIn=true,request=false,unread=0}={}){
 let incoming=request,unreadCount=unread;
 const messages=[{id:'1',kind:'text',mine:true,body:'A delivered message',snap:null,createdAt:at,viewedAt:null,saved:false}];
 await context.addInitScript(signed=>{
  localStorage.setItem('pocket-arcade:study:v1:reading-choice','accept');
  sessionStorage.setItem('pocket-arcade:study:v1:topic','close-reading');
  if(signed)localStorage.setItem('pocket-arcade:v1:accounts:session',JSON.stringify({username:'audit_me',token:'acct_'+'a'.repeat(64)}));
 },signedIn);
 await context.route('**/.netlify/functions/**',async route=>{
  const req=route.request(),url=new URL(req.url()),action=url.searchParams.get('action');
  let data:unknown={};
  if(url.pathname.endsWith('/accounts'))data={protocolVersion:2,cursor:'0',saves:{},conflicts:{},revisions:{},acks:{}};
  if(url.pathname.endsWith('/social'))data=action==='me'?{media:false,profile:{username:'audit_me',displayName:'Audit me',avatar:null}}:{items:[],cursor:null};
  if(url.pathname.endsWith('/chat')){
   if(!signedIn)return route.fulfill({status:401,json:{error:'unauthorized'}});
   if(action==='summary')data={unread:unreadCount,requests:incoming?1:0};
   if(action==='list')data={friends:incoming?[]:[{friend,last:{kind:'text',mine:true,viewed:false,at},unread:unreadCount}],incoming:incoming?[{friend,at}]:[],outgoing:[]};
   if(action==='respond'){incoming=false;data={ok:true};}
   if(action==='messages'){unreadCount=0;data={friend,retention:'viewed',messages};}
   if(action==='send'){
    const sent={...messages[0],id:String(messages.length+1),body:req.postDataJSON().body};messages.push(sent);data=sent;
   }
  }
  await route.fulfill({status:200,json:data});
 });
}
async function openChat(page:Page,path=''){
 await page.goto('/#/chat'+path);await expect(page.locator('.chat-view')).toBeVisible();
}
async function scrollSheetToEnd(page:Page,selector:string){
 const sheet=page.locator(selector);await expect(sheet).toBeVisible();
 await sheet.evaluate(el=>{el.scrollTop=el.scrollHeight;});
 await expect.poll(()=>sheet.evaluate(el=>Math.abs(el.scrollHeight-el.clientHeight-el.scrollTop))).toBeLessThan(2);
 return sheet;
}
// Visibility alone can pass during a transparent entry animation. Inspect the
// actual target and its ancestors, then let two frames paint before capture.
function chatEvidenceState(target:Element){
 const message=target.querySelector('.chat-msg');
 const receipt=target.querySelector('.chat-receipt');
 const copy=[...target.querySelectorAll('[role=menuitem]')].find(el=>el.textContent==='Copy text');
 const unsend=[...target.querySelectorAll('[role=menuitem]')].find(el=>el.textContent==='Unsend');
 const copyIcon=copy?.querySelector('[data-icon=copy]');
 const subjects=[target,...[message,receipt,copy,copyIcon,unsend].filter((el):el is Element=>!!el)];
 const painted=subjects.every(el=>{
  const rect=el.getBoundingClientRect();
  if(rect.width<=0||rect.height<=0||rect.left<0||rect.top<0||rect.right>innerWidth||rect.bottom>innerHeight)return false;
  const top=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
  // Only the non-interactive Copy glyph may delegate to its owning button.
  // An ancestor hit for a clipped message/receipt must not count as painted.
  if(!top||(!el.contains(top)&&!(el===copyIcon&&top===copy)))return false;
  for(let ancestor:Element|null=el;ancestor;ancestor=ancestor.parentElement){
   const css=getComputedStyle(ancestor);
   if(css.display==='none'||css.visibility!=='visible'||Number(css.opacity)<.999)return false;
   if(ancestor.getAnimations().some(animation=>(animation.pending||animation.playState==='running')&&Number.isFinite(animation.effect?.getTiming().iterations??1)))return false;
  }
  return true;
 });
 return {connected:target.isConnected,painted,message:message?.textContent?.trim()??null,
  pending:target.classList.contains('is-pending'),failed:target.classList.contains('is-failed'),receipt:receipt?.textContent?.trim()??null,
  open:target instanceof HTMLDialogElement?target.open:null,copyIcon:!!copyIcon,
  unsendInk:unsend?.lastElementChild?getComputedStyle(unsend.lastElementChild).color:null};
}
async function captureChatState(page:Page,scenario:string,target:Locator,expected:Partial<ReturnType<typeof chatEvidenceState>>){
 const captured:{subject:ElementHandle<HTMLElement|SVGElement>|null}={subject:null};
 const state={connected:true,painted:true,...expected};
 try{
  await captureAuditEvidence(page,test.info(),scenario,async phase=>{
   if(phase==='before'){
    await expect(target).toBeVisible();
    await expect.poll(()=>target.evaluate(chatEvidenceState)).toMatchObject(state);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    captured.subject=await target.elementHandle();
   }
   // The same DOM identity must still be present. In particular, the after
   // check never retries until a missing message or closed menu reappears.
   expect(captured.subject).not.toBeNull();
   expect(await captured.subject!.evaluate(chatEvidenceState)).toMatchObject(state);
  });
 }finally{await captured.subject?.dispose();}
}
test.use({viewport:{width:390,height:844},hasTouch:true,isMobile:true});

test('Chat signup explains the app and exposes bordered credentials',async({page,context})=>{
 await setup(context,{signedIn:false});await page.goto('/#/chat');
 const sheet=page.locator('#accounts-dialog');await expect(sheet).toBeVisible();
 await expect(sheet.getByRole('heading',{name:'Join QCC Chat'})).toBeVisible();
 await expect(sheet.getByRole('button',{name:'Not now'})).toBeVisible();
 for(const field of ['#account-username','#account-password']){
  const border=await sheet.locator(field).evaluate(el=>getComputedStyle(el).borderTopColor);
  expect(border).not.toBe('rgba(0, 0, 0, 0)');
 }
 await captureAuditEvidence(page,test.info(),'chat-signup');
 await sheet.getByRole('button',{name:'Not now'}).click();await expect(sheet).not.toBeVisible();
 await expect(page.locator('.chat-view')).toBeVisible();
});

test('Chat and Social menus show app settings rather than game filters',async({page,context})=>{
 await setup(context);await openChat(page);
 await page.locator('.chat-menu').click();
 const menu=page.locator('#menu');await expect(menu.getByRole('heading',{name:'QCC Chat settings'})).toBeVisible();
 await expect(menu.getByLabel('Find a game')).toBeHidden();
 await expect(menu.getByRole('button',{name:'Leaderboards'})).toBeHidden();
 await expect(menu.getByRole('button',{name:'Log out',exact:true})).toBeVisible();
 await captureAuditEvidence(page,test.info(),'chat-settings');
 await menu.getByRole('button',{name:'Close menu'}).click();
 await page.evaluate(()=>{location.hash='#/social';});await expect(page.locator('.social-view')).toBeVisible();
 await page.locator('.social-menu').click();
 await expect(menu.getByRole('heading',{name:'QCC Social settings'})).toBeVisible();
 await expect(menu.getByLabel('Find a game')).toBeHidden();
});

test('touch composer fits its first line and Enter sends while Shift Enter adds a line',async({page,context})=>{
 await setup(context);await openChat(page,'/with/audit_friend');
 const input=page.getByRole('textbox',{name:'Message to Audit friend'});
 const text='QA test message, please ignore. This is a longer line to check wrapping inside the bubble on a phone width screen.';
 await input.fill(text);
 const sizing=await input.evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight,top:el.scrollTop}));
 expect(sizing.scroll-sizing.client).toBeLessThanOrEqual(1);expect(sizing.top).toBe(0);
 await input.press('Shift+Enter');await expect(input).toHaveValue(/\n$/);
 await input.press('Enter');await expect(input).toHaveValue('');
 await expect(page.locator('.chat-msg').filter({hasText:'QA test message'})).toBeVisible();
 const sent=page.locator('.chat-entry').filter({hasText:text});
 await expect(sent).not.toHaveClass(/is-pending/);
 await expect(sent.locator('.chat-receipt')).toHaveText('Sent');
 await captureChatState(page,'chat-sent-wrapped-message',sent,{message:text,pending:false,failed:false,receipt:'Sent'});
 await input.fill('Composing text');
 await input.dispatchEvent('keydown',{key:'Enter',isComposing:true});await expect(input).toHaveValue('Composing text');
});

test('viewing a conversation refreshes the shared unread badge immediately',async({page,context})=>{
 await setup(context,{unread:1});await openChat(page);
 const apps=page.locator('.chat-tabbar [data-action=apps]');
 await expect(apps).toHaveAttribute('aria-label','Apps, 1 unread message');
 await page.locator('a.chat-row').filter({hasText:'Audit friend'}).click();
 await expect(page.locator('.chat-msg')).toBeVisible();
 // The conversation hides its nav; inspect the state, not visibility.
 await expect(apps).toHaveAttribute('aria-label','Apps',{timeout:3000});
 await expect(page.locator('.app-tabbar [data-action=apps]')).toHaveAttribute('aria-label','Apps');
});

test('accepted request clears the Apps badge immediately without the minute poll',async({page,context})=>{
 await setup(context,{request:true});await openChat(page);
 const apps=page.locator('.chat-tabbar [data-action=apps]');
 await expect(apps.locator('.apps-badge')).toHaveText('1');
 await page.getByRole('button',{name:'Accept request from Audit friend'}).click();
 await expect(page.locator('.chat-row').filter({hasText:'Audit friend'})).toBeVisible();
 await expect(apps.locator('.apps-badge')).toBeHidden({timeout:3000});
 await expect(apps).toHaveAttribute('aria-label','Apps');
 await captureAuditEvidence(page,test.info(),'chat-request-accepted-badge-cleared');
});

test('sent receipt is a check, Copy text is a copy icon and destructive labels stay red',async({page,context})=>{
 await setup(context);await openChat(page,'/with/audit_friend');
 const row=page.locator('.chat-entry').filter({hasText:'A delivered message'});
 await expect(row.locator('.chat-receipt')).toHaveText('Sent');
 expect(await row.locator('[data-icon=status-text-sent] [stroke-dasharray]').count()).toBe(0);
 await row.locator('.chat-msg').tap();
 const sheet=page.locator('#chat-message-menu');await expect(sheet).toBeVisible();
 await expect(sheet.getByRole('menuitem',{name:'Copy text'}).locator('[data-icon=copy]')).toBeVisible();
 const unsend=sheet.getByRole('menuitem',{name:'Unsend'});
 await expect.poll(()=>unsend.locator('span').last().evaluate(el=>getComputedStyle(el).color)).toBe('rgb(255, 100, 103)');
 await captureChatState(page,'chat-message-actions',sheet,{open:true,copyIcon:true,unsendInk:'rgb(255, 100, 103)'});
 await sheet.getByRole('button',{name:'Close menu'}).click();
 await page.getByRole('button',{name:'Chat info',exact:true}).click();
 for(const action of ['block','remove','delete']){
  const button=page.locator(`#chat-info [data-action=${action}]`);await button.scrollIntoViewIfNeeded();
  await expect.poll(()=>button.locator('span').last().evaluate(el=>getComputedStyle(el).color)).toBe('rgb(255, 100, 103)');
 }
 await captureAuditEvidence(page,test.info(),'chat-destructive-info-actions');
});

test('landscape Chat info, Apps and settings scroll inside their visible sheet',async({page,context})=>{
 await setup(context);await page.setViewportSize({width:844,height:390});await openChat(page,'/with/audit_friend');
 await page.getByRole('button',{name:'Chat info',exact:true}).click();
 const info=await scrollSheetToEnd(page,'#chat-info');
 await expect(info.getByRole('button',{name:'Delete conversation',exact:true})).toBeInViewport();
 expect(await info.evaluate(el=>getComputedStyle(el).overflowY)).toBe('auto');
 await captureAuditEvidence(page,test.info(),'chat-info-scrolled');
 await info.getByRole('button',{name:'Close chat info'}).click();
 await page.getByRole('link',{name:'Back to chats'}).click();
 await page.locator('.chat-tabbar [data-action=apps]').click();
 const apps=await scrollSheetToEnd(page,'#apps-dialog');
 await expect(apps.getByRole('link',{name:'Games library'})).toBeInViewport();
 await expect(apps.locator('.menu-note')).toBeInViewport();
 await captureAuditEvidence(page,test.info(),'apps-sheet-scrolled');
 await apps.getByRole('button',{name:'Close apps'}).click();
 await page.locator('.chat-menu').click();
 const menu=await scrollSheetToEnd(page,'#menu');
 expect(await menu.evaluate(el=>getComputedStyle(el).scrollbarWidth)).not.toBe('none');
 await expect(menu.getByRole('button',{name:'Log out',exact:true})).toBeInViewport();
 await captureAuditEvidence(page,test.info(),'chat-settings-scrolled');
});
