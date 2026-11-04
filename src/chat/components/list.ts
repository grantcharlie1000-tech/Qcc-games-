import {appIcon} from '../../apps/icons';
import {avatar} from '../../apps/avatar';
import {ApiError} from '../../apps/api';
import {relativeTime} from '../../apps/text';
import {confirmSheet} from '../../apps/sheets';
import {emptyState,skeletonRows} from '../../social/components/states';
import type {ChatList,ConversationRow,Friend,RequestRow} from '../shared';
import {POLL_MS} from '../shared';
import {Poller} from './poller';
import {isAuthError,type ChatContext,type Screen} from './context';
import {openChatMenu} from './menu';
import {REQUEST_STATUS,rowLabel,rowStatus,type RowStatus} from './status';

/** The chat list and what depends on it (unread, requests). One fetch loop, shared by every screen that shows it. */
export class ListStore {
 data:ChatList|null=null;
 error:unknown=null;
 private readonly subs=new Set<()=>void>();
 private readonly poller:Poller;
 private generation=0;
 constructor(private readonly ctx:ChatContext) {
  this.poller=new Poller(signal=>this.load(signal),POLL_MS.list);
 }
 /** Starts the 15 s loop with the first subscriber, shows cached data at once and refreshes. */
 attach(run:()=>void):()=>void {
  this.subs.add(run);
  if(this.subs.size===1)this.poller.start();
  this.poller.nudge();
  return ()=>{this.subs.delete(run);if(!this.subs.size)this.poller.stop();};
 }
 refresh():void{this.poller.nudge();}
 pause():void{this.poller.pause();}
 resume():void{this.poller.resume();}
 reset():void{this.generation++;this.data=null;this.error=null;this.emit();}
 dispose():void{this.generation++;this.poller.dispose();this.subs.clear();}
 unreadFor(username:string):number{return this.data?.friends.find(row=>row.friend.username.toLowerCase()===username.toLowerCase())?.unread??0;}
 /** Applies a change the caller already knows about (a request answered) without waiting for the next poll. */
 patch(change:(data:ChatList)=>void):void{if(this.data){change(this.data);this.emit();}}
 private async load(signal:AbortSignal):Promise<void> {
  const generation=++this.generation;
  try{
   const data=await this.ctx.client.list(signal);
   if(signal.aborted||generation!==this.generation)return;
   this.data=data;this.error=null;
  }catch(error){
   if(signal.aborted||generation!==this.generation)return;
   if(isAuthError(error)){this.ctx.signedOut();return;}
   this.error=error;
  }
  this.emit();
 }
 private emit():void{for(const run of [...this.subs])run();}
}

/** Keeps `parent`'s children in the order of `items`, reusing elements by key so focus and scroll survive a refresh. */
export function reconcile<T>(parent:HTMLElement,items:T[],key:(item:T)=>string,make:(item:T)=>HTMLElement,update:(el:HTMLElement,item:T)=>void):void {
 const existing=new Map<string,HTMLElement>();
 for(const child of Array.from(parent.children) as HTMLElement[])if(child.dataset.key)existing.set(child.dataset.key,child);
 const wanted=new Set(items.map(key));
 for(const [k,el] of existing)if(!wanted.has(k)){el.remove();existing.delete(k);}
 items.forEach((item,index)=>{
  const k=key(item);let el=existing.get(k);
  if(!el){el=make(item);el.dataset.key=k;}else update(el,item);
  if(parent.children[index]!==el)parent.insertBefore(el,parent.children[index]??null);
 });
}

export function chatLoadFailed(error:unknown,retry:()=>void):HTMLElement {
 const down=error instanceof ApiError&&error.status>=502&&error.status<=503;
 if(error instanceof ApiError&&error.status===404)return emptyState({icon:'info',title:"This page doesn't exist.",action:{label:'Back to chats',href:'#/chat'}});
 return emptyState({icon:'alert',title:down?'Chat is unavailable right now. Try again soon.':"Couldn't load this.",text:down?undefined:'Check your connection and try again.',action:{label:'Try again',run:retry}});
}
const badge=(n:number)=>n>99?'99+':String(n);
const profileHref=(friend:Friend)=>`#/chat/with/${encodeURIComponent(friend.username)}`;

function statusLine(status:RowStatus,at:string|null):HTMLElement {
 const line=document.createElement('span');line.className='chat-status';line.dataset.family=status.family;
 const glyph=document.createElement('span');glyph.className='chat-glyph';glyph.innerHTML=appIcon(status.icon);
 const words=document.createElement('span');words.className='chat-words';words.textContent=status.words;if(status.emphasis)words.classList.add('is-new');
 line.append(glyph,words);
 if(at){const when=document.createElement('span');when.className='chat-when';when.textContent=` · ${relativeTime(at)}`;line.append(when);}
 return line;
}
const rowSignature=(row:ConversationRow)=>JSON.stringify([row.friend,row.last,row.unread,relativeTime(row.last?.at??'')]);

function makeFriendRow(row:ConversationRow):HTMLElement {
 const li=document.createElement('li');li.className='chat-item';
 const link=document.createElement('a');link.className='chat-row';link.href=profileHref(row.friend);
 const main=document.createElement('span');main.className='chat-row-main';
 link.append(avatar(row.friend,48),main);
 li.append(link);
 fillFriendRow(li,row);
 return li;
}
function fillFriendRow(li:HTMLElement,row:ConversationRow):void {
 const sig=rowSignature(row);if(li.dataset.sig===sig)return;li.dataset.sig=sig;
 const link=li.querySelector<HTMLAnchorElement>('a.chat-row')!,main=link.querySelector<HTMLElement>('.chat-row-main')!;
 const status=rowStatus(row);
 const name=document.createElement('span');name.className='chat-name';name.textContent=row.friend.displayName;
 main.replaceChildren(name,statusLine(status,row.last?.at??null));
 link.classList.toggle('is-unread',row.unread>0);
 link.setAttribute('aria-label',rowLabel(row.friend,status,row.last?.at??null,row.unread));
 const existing=link.querySelector('.chat-unread');
 if(row.unread>0){
  if(existing)existing.textContent=badge(row.unread);
  else{const count=document.createElement('span');count.className='chat-unread';count.setAttribute('aria-hidden','true');count.textContent=badge(row.unread);link.append(count);}
 }else existing?.remove();
}
function makeOutgoingRow(row:RequestRow):HTMLElement {
 const li=document.createElement('li');li.className='chat-item';
 const box=document.createElement('div');box.className='chat-row is-static';
 const main=document.createElement('span');main.className='chat-row-main';
 const name=document.createElement('span');name.className='chat-name';name.textContent=row.friend.displayName;
 const handle=document.createElement('span');handle.className='chat-handle';handle.textContent=`@${row.friend.username}`;
 const nameLine=document.createElement('span');nameLine.className='chat-nameline';nameLine.append(name,handle);
 main.append(nameLine,statusLine(REQUEST_STATUS,row.at));
 box.append(avatar(row.friend,48),main);li.append(box);
 return li;
}

/** Incoming requests with Accept, Decline and a More menu (DESIGN 6.3). Used by the list and the Add screen. */
export class IncomingRequests {
 readonly el=document.createElement('section');
 private readonly list=document.createElement('ul');
 private readonly heading=document.createElement('h2');
 constructor(private readonly ctx:ChatContext,private readonly store:ListStore,id:string) {
  this.el.className='chat-requests';this.el.hidden=true;
  this.heading.id=id;this.el.setAttribute('aria-labelledby',id);
  this.list.className='chat-list chat-request-list';
  this.el.append(this.heading,this.list);
 }
 update(rows:RequestRow[]):void {
  this.el.hidden=rows.length===0;
  this.heading.textContent=`Friend requests · ${rows.length}`;
  reconcile(this.list,rows,row=>row.friend.username.toLowerCase(),row=>this.make(row),()=>{});
 }
 private make(row:RequestRow):HTMLElement {
  const {friend}=row,ctx=this.ctx;
  const li=document.createElement('li');li.className='chat-item chat-request';
  const main=document.createElement('div');main.className='chat-row-main';
  const name=document.createElement('span');name.className='chat-name';name.textContent=friend.displayName;
  const handle=document.createElement('span');handle.className='chat-handle';handle.textContent=`@${friend.username}`;
  const wants=document.createElement('span');wants.className='chat-status';wants.dataset.family='request';
  wants.innerHTML=`<span class="chat-glyph">${appIcon('status-request')}</span><span class="chat-words">Wants to be friends</span>`;
  const nameLine=document.createElement('span');nameLine.className='chat-nameline';nameLine.append(name,handle);
  main.append(nameLine,wants);
  const actions=document.createElement('div');actions.className='chat-req-actions';
  const accept=document.createElement('button');accept.type='button';accept.className='ui-btn primary apps-pill small';accept.textContent='Accept';accept.setAttribute('aria-label',`Accept request from ${friend.displayName}`);
  const decline=document.createElement('button');decline.type='button';decline.className='ui-btn secondary apps-pill small';decline.textContent='Decline';decline.setAttribute('aria-label',`Decline request from ${friend.displayName}`);
  const more=document.createElement('button');more.type='button';more.className='apps-icon-btn';more.innerHTML=appIcon('more');more.setAttribute('aria-label',`More options for @${friend.username}`);more.setAttribute('aria-haspopup','menu');
  actions.append(accept,decline,more);
  li.append(avatar(friend,48),main,actions);
  const answer=async(yes:boolean)=>{
   accept.disabled=decline.disabled=true;
   try{
    await ctx.client.respond(friend.username,yes);
    ctx.announce(yes?`You're now friends with ${friend.displayName}.`:`Declined the request from ${friend.displayName}.`);
    this.store.patch(data=>{data.incoming=data.incoming.filter(r=>r.friend.username!==friend.username);});
    ctx.refreshList();
   }catch(error){
    accept.disabled=decline.disabled=false;
    if((error as {status?:number}).status===404){ctx.notify('That request is no longer there.',{icon:'info'});ctx.refreshList();return;}
    ctx.fail(error,yes?"Couldn't accept. Try again.":"Couldn't decline. Try again.");
   }
  };
  accept.addEventListener('click',()=>void answer(true));
  decline.addEventListener('click',()=>void answer(false));
  more.addEventListener('click',()=>openChatMenu(more,`Options for @${friend.username}`,[{label:`Block @${friend.username}`,icon:'block',danger:true,run:()=>void this.block(friend,more)}],document.querySelector<HTMLElement>('.chat-view')??document.body));
  return li;
 }
 private async block(friend:Friend,trigger:HTMLElement):Promise<void> {
  const ok=await confirmSheet({title:`Block @${friend.username}?`,text:"You won't see each other's posts or profiles, follows between you are removed, and you'll stop being friends in Chat. They won't be told.",confirm:'Block',danger:true,trigger});
  if(!ok)return;
  try{
   await this.ctx.client.block(friend.username);
   this.ctx.notify(`Blocked @${friend.username}.`,{icon:'info'});
   this.store.patch(data=>{data.incoming=data.incoming.filter(r=>r.friend.username!==friend.username);});
   this.ctx.refreshList();
  }catch(error){this.ctx.fail(error,"Couldn't block. Try again.");}
 }
}

export class ListScreen implements Screen {
 private readonly el=document.createElement('div');
 private readonly h1=document.createElement('h1');
 private readonly body=document.createElement('div');
 private readonly incoming:IncomingRequests;
 private readonly list=document.createElement('ul');
 private readonly slot=document.createElement('div');
 private readonly note=document.createElement('p');
 private readonly detach:()=>void;
 private active:string|null=null;
 private shown:'loading'|'rows'|'empty'|'error'='loading';
 constructor(private readonly ctx:ChatContext,host:HTMLElement,private readonly store:ListStore) {
  this.el.className='chat-list-screen';
  this.h1.className='chat-title';this.h1.tabIndex=-1;this.h1.textContent='Chats';
  this.incoming=new IncomingRequests(ctx,store,'chat-requests-h');
  this.list.className='chat-list';
  this.slot.className='chat-slot';
  this.note.className='chat-note';
  this.note.innerHTML=`${appIcon('lock')}<span>Friends only. Not end-to-end encrypted. Reported messages can be read by QCC moderators.</span>`;
  this.body.className='chat-list-body';
  this.body.append(this.incoming.el,this.list,this.slot);
  this.el.append(this.h1,this.body,this.note);
  host.append(this.el);
  this.slot.append(skeletonRows(8,'Loading chats…'));
  this.detach=store.attach(()=>this.render());
  this.render();
 }
 focusTarget():HTMLElement{return this.h1;}
 setActive(username:string|null):void{
  this.active=username;
  for(const link of this.list.querySelectorAll<HTMLAnchorElement>('a.chat-row')){
   const on=!!username&&link.getAttribute('href')===profileHref({username} as Friend);
   if(on)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
 }
 pause():void{}
 resume():void{}
 dispose():void{this.detach();this.el.remove();}
 private render():void {
  const data=this.store.data;
  if(!data){
   if(this.store.error&&this.shown!=='error'){this.shown='error';this.slot.replaceChildren(chatLoadFailed(this.store.error,()=>{this.shown='loading';this.slot.replaceChildren(skeletonRows(8,'Loading chats…'));this.store.refresh();}));}
   return;
  }
  this.incoming.update(data.incoming);
  const empty=!data.friends.length&&!data.outgoing.length&&!data.incoming.length;
  type Item={kind:'f';row:ConversationRow}|{kind:'o';row:RequestRow};
  const items:Item[]=[...data.friends.map((row):Item=>({kind:'f',row})),...data.outgoing.map((row):Item=>({kind:'o',row}))];
  reconcile(this.list,items,item=>`${item.kind}:${item.row.friend.username.toLowerCase()}`,
   item=>item.kind==='f'?makeFriendRow(item.row):makeOutgoingRow(item.row),
   (el,item)=>{if(item.kind==='f')fillFriendRow(el,item.row);});
  if(empty){
   if(this.shown!=='empty'){this.shown='empty';this.slot.replaceChildren(emptyState({icon:'chat',title:'No chats yet',text:'Add a friend by their exact username. They need to accept before you can chat.',action:{label:'Add a friend',href:'#/chat/add',primary:true}}));}
  }else if(this.shown!=='rows'){this.shown='rows';this.slot.replaceChildren();}
  this.list.hidden=!items.length;
  this.setActive(this.active);
 }
}
export {makeOutgoingRow};
