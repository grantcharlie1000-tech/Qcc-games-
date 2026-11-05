import type {AppDeps,AppView} from '../apps/types';
import {appIcon} from '../apps/icons';
import {bindAppsBadge} from '../apps/launcher';
import {ApiError} from '../apps/api';
import {reducedMotion,motion,EASE_OUT} from '../apps/motion';
import {closeAppSheets} from '../apps/sheets';
import {bindGlass} from '../ui/glass';
import {bindFloatingGroups} from '../ui/floating-controls';
import {autoHideTabbar} from '../ui/tabbar';
import {createSectionNavigation} from '../ui/navigation';
import {SocialClient} from '../social/client';
import {ChatClient} from './client';
import {isAuthError,type ChatContext,type NoticeOptions,type Screen} from './components/context';
import {ListScreen,ListStore} from './components/list';
import {AddScreen} from './components/add';
import {ConversationScreen} from './components/conversation';
import {closeChatMenus} from './components/menu';
import './style.css';

export type Route={kind:'list'}|{kind:'add'}|{kind:'with';username:string}|{kind:'missing'};
export function parseRoute(hash:string):Route {
 const path=hash.replace(/^#\/chat\/?/,'').split('?')[0]??'';
 const parts=path.split('/').filter(Boolean).map(part=>{try{return decodeURIComponent(part);}catch{return part;}});
 const [head,second]=parts;
 if(!head)return {kind:'list'};
 if(head==='add'&&parts.length===1)return {kind:'add'};
 if(head==='with'&&second&&parts.length===2)return {kind:'with',username:second};
 return {kind:'missing'};
}

/** QCC Chat: the router and controller. Screens own their data; this owns the frame, the notices, the panes and the shared chat list. */
export class ChatView implements AppView {
 private readonly root=document.createElement('section');
 private readonly navigation=createSectionNavigation('chat');
 private readonly menuGlass=bindGlass(this.navigation.menu);
 private readonly hideTabbar:{dispose():void;reset():void};
 private readonly offAccounts:()=>void;
 private readonly client=new ChatClient(()=>this.deps.accounts.session()?.token??null);
 private readonly social=new SocialClient(()=>this.deps.accounts.session()?.token??null);
 private readonly topbar=document.createElement('header');
 private readonly notices=document.createElement('div');
 private readonly layout=document.createElement('div');
 private readonly listPane=document.createElement('aside');
 private readonly mainPane=document.createElement('main');
 private readonly store:ListStore;
 private readonly wideQuery=window.matchMedia('(min-width:960px)');
 private topGlass:{dispose():void}|undefined;
 private listScreen:ListScreen|undefined;
 private screen:Screen|undefined;
 private route:Route={kind:'list'};
 private hash='';
 private media=true;
 private meToken:string|null=null;
 private forcedOut=false;
 private paused=false;
 private disposed=false;
 private wasWide=false;
 private mediaWatchers=new Set<()=>void>();
 private readonly noticeTimers=new Set<number>();
 private offline:HTMLElement|undefined;
 private announceTimer:number|undefined;
 private enter:Animation|null=null;
 /** The route kind last mounted, so the list only slides back in after a conversation (row 17 exit), not on every visit. */
 private mountedKind:Route['kind']|null=null;
 private readonly links:Record<'chats'|'add',HTMLAnchorElement>;
 private readonly appsTab:HTMLButtonElement;
 private readonly offBadge:()=>void;
 readonly ctx:ChatContext;
 constructor(private readonly container:HTMLElement,private readonly deps:AppDeps) {
  const root=this.root;
  root.className='chat-view';root.setAttribute('aria-label','QCC Chat');root.tabIndex=-1;
  this.ctx={
   client:this.client,deps,token:()=>this.deps.accounts.session()?.token??null,reduced:()=>reducedMotion(deps.reducedMotion),
   mediaEnabled:()=>this.media,onMediaChange:run=>{this.mediaWatchers.add(run);return ()=>{this.mediaWatchers.delete(run);};},
   wide:()=>this.wideQuery.matches,
   notify:(text,options)=>this.notify(text,options),announce:text=>this.announce(text),
   fail:(error,fallback,retry)=>this.fail(error,fallback,retry),signedOut:()=>this.signedOut(),
   go:hash=>this.go(hash),refreshList:()=>{this.store.refresh();void deps.refreshAppsBadge?.();},unreadFor:username=>this.store.unreadFor(username)
  };
  this.store=new ListStore(this.ctx);
  this.topbar.className='apps-top ui-header';
  this.notices.className='chat-notices';
  this.layout.className='chat-layout';this.listPane.className='chat-pane-list';this.mainPane.className='chat-pane-main';
  this.listPane.setAttribute('aria-label','Chats');
  this.layout.append(this.listPane,this.mainPane);
  const nav=this.navigation;
  nav.bar.innerHTML=`<a class="ui-tab" href="#/chat" data-tab="chats">${appIcon('chat')}<span>Chats</span></a><a class="ui-tab" href="#/chat/add" data-tab="add">${appIcon('add-friend')}<span>Add friend</span></a><button type="button" class="ui-tab" data-action="apps" aria-haspopup="dialog" aria-label="Apps">${appIcon('apps')}<span>Apps</span></button>`;
  this.links={chats:nav.bar.querySelector('[data-tab=chats]')!,add:nav.bar.querySelector('[data-tab=add]')!};
  this.appsTab=nav.bar.querySelector('[data-action=apps]')!;
  this.appsTab.addEventListener('click',()=>deps.openApps(this.appsTab));
  this.offBadge=bindAppsBadge(this.appsTab,deps.appsBadge);
  nav.menu.addEventListener('click',()=>deps.openMenu());
  container.replaceChildren(root);
  root.append(this.topbar,this.notices,this.layout,nav.root);
  this.hideTabbar=autoHideTabbar(nav.bar,root);
  window.addEventListener('offline',this.onOffline);window.addEventListener('online',this.onOnline);
  document.addEventListener('visibilitychange',this.onVisibility);window.addEventListener('pagehide',this.onHide);
  this.wideQuery.addEventListener('change',this.onWide);
  this.wasWide=this.wideQuery.matches;
  if(navigator.onLine===false)this.onOffline();
  // Only a different signed-in identity resets the view; a late sync emit must not rebuild it.
  let identity=deps.accounts.session()?.token??null;
  this.offAccounts=deps.accounts.onChange(()=>{
   const next=deps.accounts.session()?.token??null;if(next===identity)return;identity=next;
   this.meToken=null;this.media=true;this.forcedOut=false;this.store.reset();this.show();
  });
  root.focus({preventScroll:true});
 }
 navigate(hash:string):void{this.hash=hash;this.show();}
 pause():void{this.paused=true;this.store.pause();this.screen?.pause?.();this.listScreen?.pause?.();closeAppSheets();}
 resume():void{this.paused=false;this.store.resume();this.screen?.resume?.();}
 dispose():void {
  if(this.disposed)return;
  this.disposed=true;
  window.removeEventListener('offline',this.onOffline);window.removeEventListener('online',this.onOnline);
  document.removeEventListener('visibilitychange',this.onVisibility);window.removeEventListener('pagehide',this.onHide);
  this.wideQuery.removeEventListener('change',this.onWide);
  this.screen?.dispose();this.screen=undefined;this.listScreen?.dispose();this.listScreen=undefined;
  this.store.dispose();closeChatMenus();closeAppSheets();
  this.enter?.cancel();
  for(const t of this.noticeTimers)clearTimeout(t);this.noticeTimers.clear();
  if(this.announceTimer!==undefined)clearTimeout(this.announceTimer);
  this.mediaWatchers.clear();
  this.offAccounts();this.offBadge();this.topGlass?.dispose();this.hideTabbar.dispose();this.menuGlass.dispose();
  if(this.container.contains(this.root))this.container.replaceChildren();
 }
 // ---- services for screens ----
 private go(hash:string):void{if(location.hash===hash)this.show();else location.hash=hash;}
 private announce(text:string):void {
  const live=document.querySelector('#announcer');if(!live)return;
  live.textContent='';
  if(this.announceTimer!==undefined)clearTimeout(this.announceTimer);
  this.announceTimer=window.setTimeout(()=>{live.textContent=text;},30);
 }
 private notify(text:string,options:NoticeOptions={}):void {
  if(!text||this.disposed)return;
  const alert=options.role==='alert';
  const p=document.createElement('div');p.className='apps-notice';p.setAttribute('role',alert?'alert':'status');
  const icon=options.icon===undefined?(alert?'alert':null):options.icon;
  if(icon)p.insertAdjacentHTML('afterbegin',appIcon(icon));
  const span=document.createElement('span');span.className='apps-notice-text';span.textContent=text;p.append(span);
  const remove=()=>{p.remove();};
  if(options.action){
   const b=document.createElement('button');b.type='button';b.className='ui-btn secondary small';b.textContent=options.action.label;
   b.addEventListener('click',()=>{remove();options.action!.run();});p.append(b);
  }
  while(this.notices.children.length>=3)this.notices.firstElementChild!.remove();
  this.notices.append(p);
  if(!options.sticky){const t=window.setTimeout(()=>{this.noticeTimers.delete(t);remove();},options.action?10000:5000);this.noticeTimers.add(t);}
 }
 private fail(error:unknown,fallback:string,retry?:()=>void):boolean {
  if(isAuthError(error)){this.signedOut();return true;}
  const own=error instanceof ApiError&&(error.status===429||error.status===507||error.status===0||error.code==='media_not_configured');
  const text=own?(error as ApiError).message:fallback;
  if(text)this.notify(text,{role:'alert',...(retry?{action:{label:'Try again',run:retry}}:{})});
  return false;
 }
 private signedOut():void {
  if(this.forcedOut||this.disposed)return;
  this.forcedOut=true;this.store.reset();this.show();
  this.notify('Please log in again.',{role:'alert'});
 }
 // ---- data ----
 private loadMedia():void {
  const token=this.ctx.token();
  if(!token||this.meToken===token)return;
  this.meToken=token;
  this.social.me().then(me=>{
   if(this.disposed||token!==this.ctx.token())return;
   if(this.media!==me.media){this.media=me.media;for(const run of [...this.mediaWatchers])run();}
  },()=>{/* keep photos on; a real failure shows when someone tries to send one */});
 }
 // ---- frame ----
 private signedIn():boolean{return !!this.deps.accounts.session()&&!this.forcedOut;}
 private clearScreens(keepList:boolean):void {
  if(this.screen&&this.screen!==this.listScreen)this.screen.dispose();
  this.screen=undefined;
  if(!keepList){this.listScreen?.dispose();this.listScreen=undefined;}
  this.mainPane.replaceChildren();
  if(!keepList)this.listPane.replaceChildren();
 }
 private show():void {
  if(this.disposed)return;
  closeChatMenus();closeAppSheets();
  this.wasWide=this.wideQuery.matches;
  this.route=parseRoute(this.hash||location.hash);
  const wide=this.wasWide,route=this.route;
  const keepList=wide&&this.signedIn()&&!!this.listScreen&&route.kind!=='missing';
  this.clearScreens(keepList);
  this.root.scrollTo({top:0});
  this.root.dataset.route=this.signedIn()?route.kind:'signed-out';this.root.dataset.wide=String(wide);
  this.buildTop();this.syncChrome();
  if(!this.signedIn()){this.mountedKind=null;this.renderSignedOut();return;}
  this.loadMedia();
  this.mount();
  if(this.paused){this.store.pause();this.screen?.pause?.();}
  this.focusRoute();
 }
 private renderSignedOut():void {
  this.listPane.hidden=true;this.mainPane.hidden=false;
  const box=document.createElement('div');box.className='apps-empty chat-intro-signedout';
  box.innerHTML=`${appIcon('chat-tile')}<h1 class="chat-title" tabindex="-1">QCC Chat</h1><p>Message friends one to one. You both have to accept before you can chat, and messages disappear after they're viewed. Log in to start.</p><div class="chat-signedout-actions"><button type="button" class="ui-btn primary apps-pill" data-action="login">Log in / Sign up</button><a class="ui-btn secondary apps-pill" href="#/collection">Back to games</a></div>`;
  box.querySelector('[data-action=login]')!.addEventListener('click',()=>this.deps.openAccounts());
  this.mainPane.append(box);
 }
 private mount():void {
  const route=this.route,wide=this.wideQuery.matches;
  const phoneList=!wide&&route.kind==='list',from=this.mountedKind;
  this.mountedKind=route.kind;
  this.listPane.hidden=!wide&&!phoneList;
  this.mainPane.hidden=phoneList;
  if(wide||phoneList){
   if(!this.listScreen)this.listScreen=new ListScreen(this.ctx,this.listPane,this.store);
   this.listScreen.setActive(route.kind==='with'?route.username:null);
  }
  if(phoneList){this.screen=this.listScreen;if(from==='with')this.animateIn();return;}
  const host=this.mainPane;
  switch(route.kind){
   case 'add':this.screen=new AddScreen(this.ctx,host,this.store,!wide);break;
   case 'with':this.screen=new ConversationScreen(this.ctx,host,route.username);break;
   case 'list':{ // wide, nothing open
    const empty=document.createElement('div');empty.className='apps-empty chat-pane-empty';
    empty.innerHTML=`${appIcon('chat-tile')}<h2>Pick a chat</h2><p>Your messages with friends open here.</p>`;
    host.append(empty);this.screen={dispose:()=>empty.remove()};break;
   }
   default:{
    const missing=document.createElement('div');missing.className='apps-empty';
    missing.innerHTML=`${appIcon('info')}<h2>This page doesn't exist.</h2><a class="ui-btn secondary apps-pill" href="#/chat">Back to chats</a>`;
    host.append(missing);this.screen={dispose:()=>missing.remove()};
   }
  }
  if(route.kind==='with'&&!wide&&from!=='with')this.animateIn();
 }
 /** DESIGN 12.1 row 17: going deeper slides in a little; the list mirrors it going back. Phone only. */
 private animateIn():void {
  this.enter?.cancel();
  const target=this.route.kind==='with'?this.mainPane:this.listPane;
  this.enter=motion(target,[{transform:`translateX(${this.route.kind==='with'?16:-16}px)`,opacity:0},{transform:'translateX(0)',opacity:1}],{duration:200,easing:EASE_OUT},this.deps.reducedMotion,[{opacity:0},{opacity:1}]);
 }
 private focusRoute():void {
  const generation=this.route;
  requestAnimationFrame(()=>{
   if(this.disposed||generation!==this.route)return;
   const active=document.activeElement;
   if(active instanceof HTMLElement&&active!==this.root&&this.root.contains(active)&&active.closest('input,textarea'))return;
   const target=this.screen?.focusTarget?.()??this.mainPane.querySelector<HTMLElement>('h1,h2');
   target?.focus({preventScroll:true});
  });
 }
 private syncChrome():void {
  const route=this.route,signedIn=this.signedIn(),wide=this.wideQuery.matches;
  const current=(link:HTMLAnchorElement,on:boolean)=>{if(on)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');};
  current(this.links.chats,signedIn&&(route.kind==='list'||route.kind==='with'));current(this.links.add,signedIn&&route.kind==='add');
  for(const link of Object.values(this.links))link.hidden=!signedIn;
  // Phone conversation: the island steps aside and the composer docks to the bottom.
  this.navigation.bar.dataset.hidden=signedIn&&route.kind==='with'&&!wide?'true':'false';
  this.navigation.root.toggleAttribute('inert',signedIn&&route.kind==='with'&&!wide);
 }
 private buildTop():void {
  this.topGlass?.dispose();this.topGlass=undefined;
  const route=this.route,wide=this.wideQuery.matches,signedIn=this.signedIn();
  const own=signedIn&&route.kind==='with'&&!wide;
  this.topbar.hidden=own;
  if(own){this.topbar.replaceChildren();return;}
  this.topbar.innerHTML=`<div class="ui-header-inner"><a class="apps-brand arcade-glass floating-glass-group" data-glass-tone="light" href="#/chat" aria-label="QCC Chat home"><span class="apps-brand-mark">${appIcon('chat-tile')}</span><span class="apps-wordmark"><span class="wm-short">Chat</span><span class="wm-long">QCC Chat</span></span></a></div>`;
  this.topGlass=bindFloatingGroups(this.topbar);
 }
 // ---- events ----
 private readonly onWide=():void=>{if(this.wideQuery.matches!==this.wasWide)this.show();};
 private readonly onVisibility=():void=>{if(document.visibilityState==='hidden'){this.screen?.hide?.();closeChatMenus();}};
 private readonly onHide=():void=>{this.screen?.hide?.();};
 private readonly onOffline=():void=>{
  if(this.offline?.isConnected)return;
  this.notify("You're offline. New posts and messages will load when you're back online.",{icon:'info',sticky:true});
  this.offline=this.notices.lastElementChild as HTMLElement;
 };
 private readonly onOnline=():void=>{this.offline?.remove();this.offline=undefined;};
}
