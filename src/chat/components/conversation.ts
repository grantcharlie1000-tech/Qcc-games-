import {appIcon} from '../../apps/icons';
import {avatar} from '../../apps/avatar';
import {ApiError} from '../../apps/api';
import {motion,EASE_OUT} from '../../apps/motion';
import {renderRichText,clockTime,dayLabel,codePoints} from '../../apps/text';
import {bindFloatingGroups} from '../../ui/floating-controls';
import {emptyState,skeletonRows} from '../../social/components/states';
import {MESSAGE_MAX_CHARS,POLL_MS,type ConversationView,type Friend,type MessageView,type Retention} from '../shared';
import {Poller} from './poller';
import {isAuthError,isGone,type ChatContext,type Screen} from './context';
import {openChatMenu,closeChatMenus,type MenuItem} from './menu';
import {openSnapViewer,type SnapViewer} from './snap-viewer';
import {openSendPhoto} from './send-photo';
import {openChatInfo,openMessageReport,RETENTION_LABEL} from './info-sheet';
import {chatLoadFailed} from './list';

const GROUP_GAP_MS=10*60*1000;
const HOLD_MS=500;
const HOLD_SLOP=8;
const NEAR_BOTTOM=120;
const FULL_EVERY=10;
const COUNT_FROM=900;
const MAX_STAGGER=3;

interface Item {id:string;m:MessageView;el:HTMLElement;group:HTMLElement|null;pending:boolean;body:string}
interface Pending {id:string;body:string;state:'sending'|'failed'}

const bigId=(id:string):bigint=>{try{return BigInt(id);}catch{return 0n;}};
const sameDay=(a:string,b:string)=>{const x=new Date(a),y=new Date(b);return x.getFullYear()===y.getFullYear()&&x.getMonth()===y.getMonth()&&x.getDate()===y.getDate();};
export const retentionLine=(mode:Retention)=>mode==='week'?"Messages disappear 7 days after they're sent. Not end-to-end encrypted.":"Messages disappear 24 hours after they're viewed. Not end-to-end encrypted.";
/** System lines are attributed neutrally: the server does not say who changed it. */
export const systemLine=(body:string|null)=>body==='retention:week'?"Messages now disappear 7 days after they're sent.":body==='retention:viewed'?"Messages now disappear 24 hours after they're viewed.":'Chat settings changed.';
const fine=()=>typeof matchMedia==='function'&&matchMedia('(hover:hover) and (pointer:fine)').matches;
const el=<K extends keyof HTMLElementTagNameMap>(tag:K,className='',text?:string):HTMLElementTagNameMap[K]=>{const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;};

/** `#/chat/with/<username>` (DESIGN 6.5): header, the message log, the composer. Polls `messages(after=lastId)` every POLL_MS.conversation while visible. */
export class ConversationScreen implements Screen {
 private readonly root=el('div','chat-convo');
 private head!:HTMLElement;
 private headGlass:{dispose():void}|undefined;
 private readonly h1=el('h1','sr-only');
 private readonly wrap=el('div','chat-log-wrap');
 private readonly log=el('div','chat-log');
 private readonly jump=el('button','chat-jump');
 private jumpShown=false;
 private jumpTimer:number|undefined;
 private readonly composer=el('form','chat-composer');
 private input!:HTMLTextAreaElement;
 private sendButton!:HTMLButtonElement;
 private cameraButton:HTMLButtonElement|undefined;
 private fileInput:HTMLInputElement|undefined;
 private countEl!:HTMLElement;
 private intro:HTMLElement|undefined;
 private emptyNote:HTMLElement|undefined;
 private peerName:HTMLElement|undefined;
 private friend:Friend;
 private retention:Retention='viewed';
 private readonly items:Item[]=[];
 private readonly byId=new Map<string,Item>();
 private readonly pendings=new Map<string,Pending>();
 private lastId:string|null=null;
 private poller:Poller;
 private pollCount=0;
 private needFull=false;
 private generation=0;
 private sending=0;
 private queue:Promise<void>=Promise.resolve();
 private pendingSeq=0;
 private ready=false;
 private closed=false;
 private disposed=false;
 private loadAbort:AbortController|undefined;
 private viewer:SnapViewer|null=null;
 private readonly opening=new Set<string>();
 private holdTimer:number|undefined;
 private holdFrom:{x:number;y:number}|null=null;
 private suppressClick=false;
 private lastPointer='mouse';
 private offMedia:()=>void;
 constructor(private readonly ctx:ChatContext,host:HTMLElement,private readonly username:string) {
  this.friend={username,displayName:username,avatar:null};
  this.buildHead();
  this.h1.textContent=`Chat with ${username}`;
  this.log.setAttribute('role','log');this.log.setAttribute('aria-live','polite');this.log.setAttribute('aria-relevant','additions');this.log.setAttribute('aria-label',`Messages with ${username}`);this.log.tabIndex=-1;
  this.jump.type='button';this.jump.hidden=true;this.jump.innerHTML=`<span class="chat-jump-icon">${appIcon('back')}</span><span>New message</span>`;
  this.wrap.append(this.log,this.jump);
  this.buildComposer();
  this.root.append(this.head,this.h1,this.wrap,this.composer);
  host.append(this.root);
  this.headGlass=ctx.wide()?undefined:bindFloatingGroups(this.head);
  this.log.append(skeletonRows(6,'Loading messages…'));
  this.poller=new Poller(signal=>this.poll(signal),POLL_MS.conversation);
  this.jump.addEventListener('click',()=>{this.scrollToBottom(true);this.setJump(false);});
  this.log.addEventListener('scroll',()=>{if(this.jumpShown&&this.distance()<24)this.setJump(false);},{passive:true});
  this.log.addEventListener('click',this.onClick);
  this.log.addEventListener('contextmenu',this.onContext);
  this.log.addEventListener('pointerdown',this.onPointerDown);
  for(const type of ['pointerup','pointercancel','pointerleave'] as const)this.log.addEventListener(type,this.cancelHold);
  this.log.addEventListener('pointermove',this.onPointerMove);
  this.offMedia=ctx.onMediaChange(()=>this.syncCamera());
  document.addEventListener('visibilitychange',this.onVisible);
  void this.load();
 }
 private readonly onVisible=():void=>{if(document.visibilityState==='visible')this.needFull=true;};
 focusTarget():HTMLElement|null{return fine()?this.input:this.h1;}
 pause():void{this.poller.pause();this.viewer?.close();this.cancelHold();closeChatMenus();}
 resume():void{this.needFull=true;this.poller.resume();}
 hide():void{this.viewer?.close();this.cancelHold();closeChatMenus();}
 dispose():void {
  if(this.jumpTimer!==undefined)clearTimeout(this.jumpTimer);
  this.disposed=true;this.generation++;this.loadAbort?.abort();
  this.poller.dispose();this.cancelHold();closeChatMenus();this.viewer?.close();this.viewer=null;
  document.removeEventListener('visibilitychange',this.onVisible);
  this.offMedia();this.headGlass?.dispose();
  this.root.remove();
 }
 // ---- frame ----
 private buildHead():void {
  const wide=this.ctx.wide();
  const header=this.head=el('header',wide?'chat-pane-head':'apps-top ui-header chat-convo-head');
  const peer=`<button type="button" class="chat-peer" aria-label="Chat info for ${'​'}"><span class="chat-peer-avatar"></span><span class="chat-peer-name"></span></button>`;
  const info=`<button type="button" class="apps-icon-btn chat-info-btn" aria-label="Chat info">${appIcon('info')}</button>`;
  if(wide)header.innerHTML=`<div class="chat-peer-wrap">${peer}</div>${info}`;
  else header.innerHTML=`<div class="ui-header-inner"><div class="apps-back-group arcade-glass floating-glass-group" data-glass-tone="light"><a class="apps-back-btn" href="#/chat" aria-label="Back to chats">${appIcon('back')}</a></div><div class="chat-peer-group arcade-glass floating-glass-group" data-glass-tone="light">${peer}</div><div class="apps-actions-group arcade-glass floating-glass-group" data-glass-tone="light">${info}</div></div>`;
  this.peerName=header.querySelector<HTMLElement>('.chat-peer-name')!;
  this.syncPeer();
  for(const button of header.querySelectorAll<HTMLButtonElement>('.chat-peer,.chat-info-btn'))button.addEventListener('click',()=>this.openInfo(button));
 }
 private syncPeer():void {
  const peer=this.head.querySelector<HTMLElement>('.chat-peer')!;
  this.peerName!.textContent=this.friend.displayName;
  peer.setAttribute('aria-label',`Chat info for ${this.friend.displayName}`);
  const holder=peer.querySelector('.chat-peer-avatar')!;holder.replaceChildren(avatar(this.friend,28));
  this.h1.textContent=`Chat with ${this.friend.displayName}`;
  this.log.setAttribute('aria-label',`Messages with ${this.friend.displayName}`);
  this.input?.setAttribute('placeholder',`Message ${this.friend.displayName}`);
  this.input?.setAttribute('aria-label',`Message to ${this.friend.displayName}`);
 }
 private buildComposer():void {
  const c=this.composer;
  c.setAttribute('aria-label','Write a message');
  c.innerHTML=`<span class="chat-count" aria-hidden="true"></span><div class="chat-composer-row"><button type="button" class="chat-camera" aria-label="Send a photo">${appIcon('camera')}</button><textarea class="chat-field" rows="1" enterkeyhint="send" autocomplete="off" autocapitalize="sentences"></textarea><button type="submit" class="chat-send" aria-label="Send message" disabled>${appIcon('send')}</button></div><span class="sr-only chat-helper" role="status"></span>`;
  this.input=c.querySelector('textarea')!;this.sendButton=c.querySelector<HTMLButtonElement>('.chat-send')!;const camera=this.cameraButton=c.querySelector<HTMLButtonElement>('.chat-camera')!;this.countEl=c.querySelector('.chat-count')!;
  this.input.placeholder=`Message ${this.username}`;this.input.setAttribute('aria-label',`Message to ${this.username}`);
  const fileInput=this.fileInput=el('input');fileInput.type='file';fileInput.accept='image/*';fileInput.hidden=true;fileInput.tabIndex=-1;fileInput.setAttribute('aria-hidden','true');
  c.append(fileInput);
  this.syncCamera();
  camera.addEventListener('click',()=>fileInput.click());
  fileInput.addEventListener('change',()=>{
   const file=fileInput.files?.[0];fileInput.value='';
   if(!file||!this.ready||this.closed)return;
   openSendPhoto(this.ctx,{file,friend:this.friend,trigger:camera,onSent:message=>this.afterSnapSent(message)});
  });
  this.input.addEventListener('input',()=>this.syncComposer());
  this.input.addEventListener('keydown',event=>{
   if(event.key!=='Enter'||event.shiftKey||event.isComposing||event.ctrlKey||event.altKey||event.metaKey||event.keyCode===229)return;
   event.preventDefault();this.submit();
  });
  c.addEventListener('submit',event=>{event.preventDefault();this.submit();});
  this.syncComposer();
 }
 private syncCamera():void{if(this.cameraButton)this.cameraButton.hidden=!this.ctx.mediaEnabled();}
 private syncComposer():void {
  const text=this.input.value.trim(),count=codePoints(text);
  // scrollHeight excludes the border. Include it in this border-box field so
  // the browser does not scroll the first line out of view to expose the caret.
  this.input.style.height='auto';
  const style=getComputedStyle(this.input),border=(parseFloat(style.borderTopWidth)||0)+(parseFloat(style.borderBottomWidth)||0);
  const height=Math.min(Math.ceil(this.input.scrollHeight+border),126);
  this.input.style.height=`${height}px`;
  if(this.input.scrollHeight<=this.input.clientHeight+1)this.input.scrollTop=0;
  this.sendButton.disabled=!this.ready||this.closed||!text||count>MESSAGE_MAX_CHARS;
  const left=MESSAGE_MAX_CHARS-count;
  this.countEl.textContent=count>=COUNT_FROM?(left<0?String(left):`${left} left`):'';
  this.countEl.classList.toggle('is-over',left<0);
 }
 private closeComposer():void {
  if(this.closed)return;
  this.closed=true;
  const p=el('p','chat-closed',"You can't send messages in this chat.");p.setAttribute('role','status');
  this.composer.replaceChildren(p);this.composer.classList.add('is-closed');
 }
 // ---- loading ----
 private async load():Promise<void> {
  const generation=++this.generation;
  this.loadAbort?.abort();const abort=this.loadAbort=new AbortController();
  try{
   const view=await this.ctx.client.messages(this.username,null,abort.signal);
   if(this.disposed||generation!==this.generation)return;
   this.log.replaceChildren();
   this.friend=view.friend;this.retention=view.retention;this.syncPeer();
   this.ready=true;
   this.intro=el('div','chat-system chat-intro');this.intro.innerHTML=`${appIcon('timer')}<span></span>`;this.setIntro();this.log.append(this.intro);
   const unread=this.ctx.unreadFor(this.username);
   this.render(view.messages,unread);
   this.syncComposer();this.poller.start();
   this.ctx.refreshList();
  }catch(error){
   if(this.disposed||generation!==this.generation||abort.signal.aborted)return;
   if(isAuthError(error)){this.ctx.signedOut();return;}
   this.log.replaceChildren();
   if(error instanceof ApiError&&error.status===404){this.showNotFriends();return;}
   this.log.append(chatLoadFailed(error,()=>{this.log.replaceChildren(skeletonRows(6,'Loading messages…'));void this.load();}));
  }
 }
 /** Not a friend (or no such person, or blocked): the same quiet state for all three, with the way to ask. */
 private showNotFriends():void {
  this.ready=false;this.closed=false;this.closeComposer();
  for(const button of this.head.querySelectorAll<HTMLElement>('.chat-peer,.chat-info-btn'))button.hidden=true;
  this.composer.hidden=true;
  const box=emptyState({icon:'add-friend',title:"You're not friends yet",text:`You can only message friends. Send @${this.username} a request, and you can chat once they accept.`});
  const status=el('div','chat-notfriends-status');status.setAttribute('role','status');
  const send=el('button','ui-btn primary apps-pill','Send friend request');send.type='button';
  const back=el('a','ui-btn secondary apps-pill','Back to chats');back.href='#/chat';
  const actions=el('div','chat-notfriends-actions');actions.append(send,back);
  box.append(actions,status);box.classList.add('chat-notfriends');
  send.addEventListener('click',async()=>{
   send.disabled=true;status.textContent='';
   try{
    const answer=await this.ctx.client.request(this.username);
    if(this.disposed)return;
    if(answer.status==='friends'){this.composer.hidden=false;this.composer.classList.remove('is-closed');this.closed=false;this.log.replaceChildren(skeletonRows(6,'Loading messages…'));this.rebuildComposer();void this.load();return;}
    status.textContent=`Request sent. If @${this.username} accepts, they'll appear in your chats.`;
    this.ctx.refreshList();
   }catch(error){
    if(this.disposed)return;
    if(isAuthError(error)){this.ctx.signedOut();return;}
    send.disabled=false;
    status.textContent=error instanceof ApiError&&(error.status===400||error.status===429||error.status===0)?error.message:"Couldn't send the request. Try again.";
   }
  });
  this.log.append(box);
 }
 private rebuildComposer():void{this.composer.classList.remove('is-closed');this.composer.replaceChildren();this.buildComposer();for(const b of this.head.querySelectorAll<HTMLElement>('.chat-peer,.chat-info-btn'))b.hidden=false;}
 private setIntro():void{if(this.intro)this.intro.querySelector('span')!.textContent=retentionLine(this.retention);}
 // ---- rendering ----
 private render(messages:MessageView[],unread:number):void {
  const sorted=[...messages].sort((a,b)=>{const x=bigId(a.id),y=bigId(b.id);return x<y?-1:x>y?1:0;});
  const theirs=sorted.filter(m=>!m.mine&&m.kind!=='system');
  const firstNew=unread>0&&theirs.length?theirs[Math.max(0,theirs.length-unread)]?.id:undefined;
  let marker:HTMLElement|undefined;
  for(const m of sorted){
   if(m.id===firstNew){marker=el('div','chat-new','New');marker.setAttribute('role','separator');this.log.append(marker);}
   this.insert(m,{animate:false});
  }
  this.advanceCursor(messages);
  this.afterChange();
  if(marker)marker.scrollIntoView({block:'start'});else this.scrollToBottom(false);
 }
 private advanceCursor(messages:MessageView[]):void {
  for(const m of messages)if(this.lastId===null||bigId(m.id)>bigId(this.lastId))this.lastId=m.id;
 }
 /** A message arrived with an id below one already shown (it landed during your own send): rebuild the log in id order, pending sends last. */
 private reflow(delivered:MessageView[]):void {
  const pendings=this.items.filter(i=>i.pending);
  const settled=new Map<string,MessageView>();
  for(const i of this.items)if(!i.pending)settled.set(i.id,i.m);
  for(const m of delivered)settled.set(m.id,m);
  for(const node of Array.from(this.log.children))if(node!==this.intro)node.remove();
  this.items.length=0;this.byId.clear();this.emptyNote=undefined;
  const sorted=[...settled.values()].sort((a,b)=>{const x=bigId(a.id),y=bigId(b.id);return x<y?-1:x>y?1:0;});
  for(const m of sorted)this.insert(m,{animate:false});
  for(const old of pendings){
   const item=this.insert(old.m,{animate:false,pending:true,body:old.body});
   const state=this.pendings.get(old.id);if(state)this.setPendingState(item,state,state.state);
  }
 }
 private lastItem():Item|undefined{return this.items[this.items.length-1];}
 private insert(m:MessageView,options:{animate:boolean;pending?:boolean;body?:string;stagger?:number}):Item {
  this.emptyNote?.remove();this.emptyNote=undefined;
  const prev=this.lastItem();
  if(!prev||!sameDay(prev.m.createdAt,m.createdAt)){const day=el('div','chat-day',dayLabel(m.createdAt));day.setAttribute('role','separator');this.log.append(day);}
  let node:HTMLElement,group:HTMLElement|null=null,newGroup=false;
  if(m.kind==='system'){
   node=el('p','chat-system');node.dataset.id=m.id;node.innerHTML=`${appIcon('timer')}<span></span>`;node.querySelector('span')!.textContent=systemLine(m.body);
   this.log.append(node);
  }else{
   const continues=!!prev&&prev.m.kind!=='system'&&prev.m.mine===m.mine&&!!prev.group&&this.log.lastElementChild===prev.group&&sameDay(prev.m.createdAt,m.createdAt)&&Math.abs(Date.parse(m.createdAt)-Date.parse(prev.m.createdAt))<=GROUP_GAP_MS;
   if(continues)group=prev!.group;
   else{
    newGroup=true;
    group=el('section','chat-group');group.dataset.mine=String(m.mine);
    const headEl=el('h3','chat-group-head');
    const who=m.mine?{username:this.ctx.deps.accounts.session()?.username??'you',avatar:null}:this.friend;
    const name=el('span','chat-group-name',m.mine?'You':this.friend.displayName);name.dataset.who=m.mine?'me':'friend';
    const time=el('span','chat-group-time',` · ${clockTime(m.createdAt)}`);
    headEl.append(avatar(who,20),name,time);group.append(headEl);this.log.append(group);
   }
   node=this.buildEntry(m,options.pending===true);
   group!.append(node);
  }
  const item:Item={id:m.id,m,el:node,group,pending:options.pending===true,body:options.body??m.body??''};
  this.items.push(item);this.byId.set(m.id,item);
  if(options.animate){
   // Row 8 (your send: no stagger given) or row 9 (a poll: staggered 40 ms). A message that starts a group brings its name line with it.
   const sent=options.stagger===undefined,delay=sent?0:options.stagger!*40;
   motion(newGroup&&group?group:node,[{opacity:0,transform:`translateY(${sent?8:6}px)`},{opacity:1,transform:'none'}],{duration:sent?180:200,easing:EASE_OUT,delay,fill:delay?'backwards':'none'},this.ctx.deps.reducedMotion);
  }
  return item;
 }
 private buildEntry(m:MessageView,pending:boolean):HTMLElement {
  const entry=el('div','chat-entry');entry.dataset.id=m.id;entry.dataset.kind=m.kind;entry.dataset.mine=String(m.mine);entry.tabIndex=-1;
  if(pending)entry.classList.add('is-pending');
  const body=el('div','chat-body');entry.append(body);
  if(m.kind==='text'){
   const text=el('div','chat-msg');text.append(renderRichText(m.body??''));body.append(text);
   if(m.saved)this.addSaved(entry);
  }else body.append(this.buildSnap(m));
  const more=el('button','chat-msg-more');more.type='button';more.innerHTML=appIcon('more');more.setAttribute('aria-label','Message options');more.setAttribute('aria-haspopup','menu');
  body.append(more);
  if(m.mine){const receipt=el('div','chat-receipt');entry.append(receipt);this.fillReceipt(entry,m);}
  return entry;
 }
 private addSaved(entry:HTMLElement):void {
  entry.classList.add('is-saved');
  if(entry.querySelector('.chat-saved'))return;
  const saved=el('span','chat-saved');saved.innerHTML=`${appIcon('saved')}<span>Kept</span>`;
  entry.querySelector('.chat-msg')?.append(saved);
 }
 private buildSnap(m:MessageView):HTMLElement {
  const opened=!!m.snap?.opened;
  const name=this.friend.displayName;
  if(!m.mine&&!opened){
   const button=el('button','chat-snap is-new');button.type='button';
   button.setAttribute('aria-label',`Photo from ${name}. Open once. It's deleted when you close it.`);
   button.innerHTML=`<span class="chat-glyph" data-family="snap">${appIcon('status-snap-new')}</span><span class="chat-snap-text"><span class="chat-snap-title">Photo · Open once</span><span class="chat-snap-sub">Deleted when you close it</span></span>`;
   return button;
  }
  const box=el('div',`chat-snap${opened?' is-opened':''}`);
  const icon=m.mine?(opened?'status-snap-opened':'status-snap-sent'):'status-snap-received';
  const words=m.mine?(opened?"Photo · They've seen it":'Photo · Not seen yet'):"Photo · You've seen it";
  box.innerHTML=`<span class="chat-glyph" data-family="snap">${appIcon(icon)}</span><span class="chat-snap-text"></span>`;
  box.querySelector('.chat-snap-text')!.textContent=words;
  return box;
 }
 private fillReceipt(entry:HTMLElement,m:MessageView):void {
  const receipt=entry.querySelector<HTMLElement>('.chat-receipt');if(!receipt)return;
  const done=m.kind==='snap'?!!m.snap?.opened:m.viewedAt!==null;
  const state=`${m.kind}:${done}`;if(receipt.dataset.state===state)return;receipt.dataset.state=state;
  const icon=m.kind==='snap'?(done?'status-snap-opened':'status-snap-sent'):(done?'status-text-opened':'status-text-sent');
  receipt.innerHTML=`<span class="chat-glyph" data-family="${m.kind==='snap'?'snap':'text'}">${appIcon(icon)}</span><span></span>`;
  receipt.querySelector('span:last-child')!.textContent=done?"They've seen it":'Not seen yet';
 }
 /** Receipts and the empty note: run after any structural change. */
 private afterChange():void {
  let last:Item|undefined;
  for(const item of this.items)if(item.m.mine&&!item.pending&&item.m.kind!=='system')last=item;
  for(const item of this.items)if(item.el.classList.contains('chat-entry'))item.el.classList.toggle('is-last-mine',item===last);
  if(!this.items.length&&this.ready&&!this.emptyNote){this.emptyNote=el('p','chat-empty',`Say kia ora to ${this.friend.displayName}.`);this.log.append(this.emptyNote);}
 }
 private removeItem(id:string):void {
  const item=this.byId.get(id);if(!item)return;
  this.byId.delete(id);this.items.splice(this.items.indexOf(item),1);
  item.el.remove();
  if(item.group&&!item.group.querySelector('.chat-entry'))item.group.remove();
  // Drop day separators and "New" markers left with nothing under them.
  for(const sep of Array.from(this.log.querySelectorAll<HTMLElement>('.chat-day,.chat-new'))){
   const next=sep.nextElementSibling;
   if(!next||next.classList.contains('chat-day')||next.classList.contains('chat-new'))sep.remove();
  }
  this.afterChange();
 }
 private update(item:Item,m:MessageView):void {
  const before=item.m;item.m=m;
  if(m.kind==='text'){
   if(m.saved)this.addSaved(item.el);
   else{item.el.classList.remove('is-saved');item.el.querySelector('.chat-saved')?.remove();}
  }else if(!!before.snap?.opened!==!!m.snap?.opened){
   const old=item.el.querySelector('.chat-snap');const next=this.buildSnap(m);
   if(old)old.replaceWith(next);else item.el.querySelector('.chat-body')?.prepend(next);
  }
  if(m.mine)this.fillReceipt(item.el,m);
 }
 // ---- server data ----
 private applyView(view:ConversationView,full:boolean):void {
  if(view.retention!==this.retention){this.retention=view.retention;this.setIntro();}
  const fresh=view.messages.filter(m=>!this.byId.has(m.id));
  const sorted=[...fresh].sort((a,b)=>{const x=bigId(a.id),y=bigId(b.id);return x<y?-1:x>y?1:0;});
  const incoming=sorted.filter(m=>!m.mine&&m.kind!=='system');
  const atBottom=this.distance()<=NEAR_BOTTOM;
  let staggered=0;
  const shownTop=this.items.reduce((top,i)=>i.pending||bigId(i.id)<=top?top:bigId(i.id),0n);
  const late=sorted.some(m=>bigId(m.id)<shownTop);
  if(late){this.reflow(sorted);staggered=sorted.length;}
  else for(const m of sorted)this.insert(m,{animate:atBottom&&staggered<MAX_STAGGER,stagger:staggered++});
  for(const m of view.messages){const item=this.byId.get(m.id);if(item&&!item.pending)this.update(item,m);}
  this.advanceCursor(view.messages);
  if(full){
   const shown=new Set(view.messages.map(m=>m.id));
   const floor=view.messages.length>=200?view.messages.reduce((min,m)=>bigId(m.id)<min?bigId(m.id):min,bigId(view.messages[0]!.id)):0n;
   for(const item of [...this.items])if(!item.pending&&!shown.has(item.id)&&bigId(item.id)>=floor)this.removeItem(item.id);
  }
  this.afterChange();
  if(incoming.length){
   if(atBottom)this.scrollToBottom(false);else this.setJump(true);
   this.ctx.refreshList();
  }else if(sorted.length&&atBottom)this.scrollToBottom(false);
 }
 private async poll(signal:AbortSignal):Promise<void> {
  if(!this.ready||this.sending>0||this.disposed)return;
  const generation=this.generation;
  const full=this.lastId===null||this.needFull||++this.pollCount%FULL_EVERY===0;this.needFull=false;
  try{
   const view=await this.ctx.client.messages(this.username,full?null:this.lastId,signal);
   if(signal.aborted||this.disposed||generation!==this.generation||this.sending>0)return;
   this.applyView(view,full);
  }catch(error){
   if(signal.aborted||this.disposed)return;
   if(isAuthError(error)){this.ctx.signedOut();return;}
   if(isGone(error)){this.closeComposer();this.poller.stop();this.ctx.notify("You can't message this person any more.",{icon:'info'});}
  }
 }
 // ---- scrolling ----
 /** DESIGN 12.1 row 5: the pill rises 8px into place and leaves the way it came (150 ms) before it is hidden. Showing it again mid-exit retargets the transition. */
 private setJump(show:boolean):void {
  if(show===this.jumpShown)return;
  this.jumpShown=show;
  if(this.jumpTimer!==undefined){clearTimeout(this.jumpTimer);this.jumpTimer=undefined;}
  if(show){delete this.jump.dataset.leaving;this.jump.hidden=false;return;}
  if(this.jump.hidden)return;
  if(this.ctx.reduced()){this.jump.hidden=true;return;}
  this.jump.dataset.leaving='true';
  this.jumpTimer=window.setTimeout(()=>{this.jumpTimer=undefined;this.jump.hidden=true;delete this.jump.dataset.leaving;},150);
 }
 private distance():number{return this.log.scrollHeight-this.log.scrollTop-this.log.clientHeight;}
 private scrollToBottom(smooth:boolean):void{
  const run=()=>{this.log.scrollTo({top:this.log.scrollHeight,behavior:smooth&&!this.ctx.reduced()?'smooth':'auto'});};
  run();requestAnimationFrame(run);
 }
 // ---- sending ----
 private submit():void {
  if(!this.ready||this.closed)return;
  const body=this.input.value.trim();
  if(!body||codePoints(body)>MESSAGE_MAX_CHARS)return;
  this.input.value='';this.syncComposer();
  const id=`p${++this.pendingSeq}`;
  const view:MessageView={id,kind:'text',mine:true,body,snap:null,createdAt:new Date().toISOString(),viewedAt:null,saved:false};
  const item=this.insert(view,{animate:true,pending:true,body});
  this.afterChange();this.scrollToBottom(false);
  const pending:Pending={id,body,state:'sending'};this.pendings.set(id,pending);
  void item;
  this.enqueue(pending);
 }
 private enqueue(pending:Pending):void{this.queue=this.queue.then(()=>this.deliver(pending));}
 private async deliver(pending:Pending):Promise<void> {
  if(this.disposed||!this.pendings.has(pending.id))return;
  const item=this.byId.get(pending.id);if(!item)return;
  this.setPendingState(item,pending,'sending');
  this.sending++;
  try{
   const message=await this.ctx.client.send(this.username,{kind:'text',body:pending.body});
   this.sending--;
   if(this.disposed)return;
   this.resolve(item,pending,message);
  }catch(error){
   this.sending--;
   if(this.disposed)return;
   this.setPendingState(item,pending,'failed');
   if(isAuthError(error)){this.ctx.signedOut();return;}
   if(isGone(error)){this.closeComposer();this.poller.stop();return;}
   this.ctx.fail(error,'');
  }
 }
 private setPendingState(item:Item,pending:Pending,state:Pending['state']):void {
  pending.state=state;
  item.el.classList.toggle('is-failed',state==='failed');
  item.el.querySelector('.chat-failed')?.remove();
  if(state==='failed'){
   const bar=el('div','chat-failed');
   const retry=el('button','chat-retry','Not sent. Tap to try again.');retry.type='button';retry.dataset.action='retry';
   const discard=el('button','chat-discard','Discard');discard.type='button';discard.dataset.action='discard';
   bar.append(retry,discard);item.el.append(bar);
  }
 }
 private resolve(item:Item,pending:Pending,message:MessageView):void {
  this.pendings.delete(pending.id);
  this.byId.delete(item.id);
  const existing=this.byId.get(message.id);
  if(existing){ // a poll already brought it in
   this.items.splice(this.items.indexOf(item),1);item.el.remove();
   if(item.group&&!item.group.querySelector('.chat-entry'))item.group.remove();
   this.afterChange();return;
  }
  item.id=message.id;item.m=message;item.pending=false;
  item.el.dataset.id=message.id;item.el.classList.remove('is-pending','is-failed');
  this.byId.set(message.id,item);
  // lastId is the poll cursor: it moves only when a poll or load delivers messages, so a friend's message that landed before this one is still fetched.
  this.fillReceipt(item.el,message);
  this.afterChange();
  this.ctx.refreshList();
 }
 private afterSnapSent(message:MessageView):void {
  if(this.disposed)return;
  if(!this.byId.has(message.id))this.insert(message,{animate:true});
  this.afterChange();this.scrollToBottom(false);this.ctx.refreshList();
 }
 // ---- actions ----
 private openInfo(trigger:HTMLElement):void {
  if(!this.ready)return;
  openChatInfo(this.ctx,{
   friend:this.friend,trigger,
   retention:()=>this.retention,
   setRetention:async mode=>{
    const view=await this.ctx.client.retention(this.username,mode);
    if(this.disposed)return;
    this.retention=view.retention;this.setIntro();this.applyView(view,true);this.scrollToBottom(false);this.ctx.refreshList();
    this.ctx.announce(`Messages now disappear ${RETENTION_LABEL[view.retention]}.`);
   },
   recent:()=>this.recentFromFriend()
  });
 }
 private recentFromFriend():MessageView[]{return this.items.filter(i=>!i.m.mine&&i.m.kind!=='system'&&!i.pending).map(i=>i.m).reverse();}
 private itemOf(target:EventTarget|null):Item|undefined {
  const entry=(target as Element|null)?.closest?.<HTMLElement>('.chat-entry');
  return entry?.dataset.id?this.byId.get(entry.dataset.id):undefined;
 }
 private menuItems(item:Item):MenuItem[] {
  const m=item.m,items:MenuItem[]=[];
  if(m.kind==='text'){
   items.push({label:m.saved?'Let it disappear':'Keep message',icon:m.saved?'saved':'save',run:()=>void this.toggleSave(item)});
   items.push({label:'Copy text',icon:'copy',run:()=>void this.copy(item)});
  }
  if(m.mine)items.push({label:'Unsend',icon:'trash',danger:true,run:()=>void this.unsend(item)});
  else items.push({label:'Report message',icon:'report',run:()=>openMessageReport(this.ctx,this.friend,this.recentFromFriend().slice(0,10),{trigger:item.el,preselect:m.id})});
  return items;
 }
 private openMenu(item:Item,trigger:HTMLElement,options:{forceSheet?:boolean;at?:{x:number;y:number}}={}):void {
  if(item.pending||item.m.kind==='system')return;
  openChatMenu(trigger,'Message options',this.menuItems(item),document.querySelector<HTMLElement>('.chat-view')??document.body,options);
 }
 private async toggleSave(item:Item):Promise<void> {
  const next=!item.m.saved;
  try{
   const message=await this.ctx.client.save(item.id,next);
   if(this.disposed)return;
   const current=this.byId.get(item.id);if(current)this.update(current,message);
   this.ctx.announce(next?'Message kept.':'Message no longer kept.');
  }catch(error){
   if(this.disposed)return;
   if(isGone(error)){this.removeItem(item.id);this.ctx.notify('That message is gone.',{icon:'info'});return;}
   this.ctx.fail(error,"Couldn't save that. Try again.");
  }
 }
 private async copy(item:Item):Promise<void> {
  try{await navigator.clipboard.writeText(item.m.body??'');this.ctx.announce('Copied.');}
  catch{this.ctx.notify("Couldn't copy that.",{icon:'info'});}
 }
 private async unsend(item:Item):Promise<void> {
  try{
   await this.ctx.client.unsend(item.id);
   if(this.disposed)return;
   this.removeItem(item.id);
   this.ctx.notify('Message unsent.',{icon:'info'});this.ctx.refreshList();
  }catch(error){
   if(this.disposed)return;
   if(isGone(error)){this.removeItem(item.id);return;}
   this.ctx.fail(error,"Couldn't unsend that. Try again.");
  }
 }
 private openSnap(item:Item):void {
  if(this.opening.has(item.id)||item.m.mine||item.m.snap?.opened)return;
  this.opening.add(item.id);
  this.viewer=openSnapViewer({
   ctx:this.ctx,messageId:item.id,friend:this.friend,sentAt:item.m.createdAt,
   onOpened:()=>{const current=this.byId.get(item.id);if(current)this.update(current,{...current.m,viewedAt:new Date().toISOString(),snap:{opened:true}});},
   onClosed:()=>{
    this.viewer=null;this.opening.delete(item.id);
    if(this.disposed)return;
    const current=this.byId.get(item.id);
    current?.el.focus({preventScroll:true});
    this.ctx.refreshList();
   }
  });
 }
 // ---- pointer ----
 private readonly onClick=(event:MouseEvent):void=>{
  const target=event.target as Element;
  if(this.suppressClick){this.suppressClick=false;event.preventDefault();return;}
  const retry=target.closest<HTMLElement>('[data-action=retry]'),discard=target.closest<HTMLElement>('[data-action=discard]');
  if(retry||discard){
   const item=this.itemOf(target);if(!item)return;
   const pending=this.pendings.get(item.id);if(!pending)return;
   if(discard){this.pendings.delete(item.id);this.removeItem(item.id);return;}
   if(pending.state==='failed')this.enqueue(pending);
   return;
  }
  const more=target.closest<HTMLElement>('.chat-msg-more');
  const item=this.itemOf(target);
  if(!item)return;
  if(more){this.openMenu(item,more);return;}
  const snap=target.closest<HTMLElement>('button.chat-snap');
  if(snap){this.openSnap(item);return;}
  // Touch: tapping a message opens its menu (DESIGN 6.5). Links, text selection and desktop clicks are left alone.
  if(!fine()&&!target.closest('a')&&target.closest('.chat-msg')&&!(getSelection()?.toString()))this.openMenu(item,item.el,{forceSheet:true});
 };
 private readonly onContext=(event:MouseEvent):void=>{
  const item=this.itemOf(event.target);if(!item)return;
  event.preventDefault();
  if(this.lastPointer==='touch'||this.lastPointer==='pen')return;
  const more=item.el.querySelector<HTMLElement>('.chat-msg-more')??item.el;
  this.openMenu(item,more,{at:{x:event.clientX,y:event.clientY}});
 };
 private readonly onPointerDown=(event:PointerEvent):void=>{
  this.lastPointer=event.pointerType;
  if(event.pointerType==='mouse')return;
  const item=this.itemOf(event.target);
  if(!item||item.pending||item.m.kind==='system')return;
  this.cancelHold();
  this.holdFrom={x:event.clientX,y:event.clientY};
  this.holdTimer=window.setTimeout(()=>{
   this.holdTimer=undefined;this.holdFrom=null;
   if(this.disposed)return;
   this.suppressClick=true;window.setTimeout(()=>{this.suppressClick=false;},700);
   this.openMenu(item,item.el,{forceSheet:true});
  },HOLD_MS);
 };
 private readonly onPointerMove=(event:PointerEvent):void=>{
  if(!this.holdFrom)return;
  if(Math.hypot(event.clientX-this.holdFrom.x,event.clientY-this.holdFrom.y)>HOLD_SLOP)this.cancelHold();
 };
 private readonly cancelHold=():void=>{if(this.holdTimer!==undefined){clearTimeout(this.holdTimer);this.holdTimer=undefined;}this.holdFrom=null;};
}
