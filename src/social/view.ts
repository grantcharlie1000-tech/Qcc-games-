import type {AppDeps,AppView} from '../apps/types';
import {appIcon} from '../apps/icons';
import {bindAppsBadge} from '../apps/launcher';
import {bindGlass} from '../ui/glass';
import {bindFloatingGroups} from '../ui/floating-controls';
import {autoHideTabbar} from '../ui/tabbar';
import {createSectionNavigation} from '../ui/navigation';
import {ApiError} from '../apps/api';
import {reducedMotion} from '../apps/motion';
import {SocialClient} from './client';
import type {SocialMe,PostView} from './shared';
import type {SocialContext,Screen,NoticeOptions,ComposeOptions} from './context';
import {isAuthError} from './context';
import {FeedScreen} from './screens/feed';
import {ThreadScreen} from './screens/thread';
import {ProfileScreen,tabFromHash} from './screens/profile';
import {SearchScreen,type SearchIn} from './screens/search';
import {ActivityScreen} from './screens/activity';
import {SettingsScreen,shortcutsOn} from './screens/settings';
import {Segmented} from './components/segmented';
import {openComposeSheet} from './components/compose-sheet';
import {openPhotoViewer} from './components/photo-viewer';
import {openShortcuts} from './components/shortcuts';
import {cardOf} from './components/post-card';
import {closeMenus} from './components/menus';
import {closeAppSheets} from '../apps/sheets';
import {emptyState,skeletonPosts,loadFailed} from './components/states';
import './style.css';

type Route=
 |{kind:'feed';tab:'following'|'discover'}
 |{kind:'thread';id:string}
 |{kind:'profile';username:string;tab:string|undefined}
 |{kind:'search';q:string;in:SearchIn}
 |{kind:'activity'}
 |{kind:'settings'}
 |{kind:'missing'};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parseRoute(hash:string):Route {
 const [path,query=''] = hash.replace(/^#\/social\/?/,'').split('?');
 const parts=(path??'').split('/').filter(Boolean).map(part=>{try{return decodeURIComponent(part);}catch{return part;}});
 const params=new URLSearchParams(query);
 const [head,second,third]=parts;
 if(!head)return {kind:'feed',tab:'following'};
 if(head==='discover'&&parts.length===1)return {kind:'feed',tab:'discover'};
 if(head==='post'&&second&&UUID.test(second)&&parts.length===2)return {kind:'thread',id:second.toLowerCase()};
 if(head==='u'&&second&&parts.length<=3&&(!third||['replies','photos','media','likes'].includes(third)))return {kind:'profile',username:second,tab:third};
 if(head==='search'&&parts.length===1)return {kind:'search',q:params.get('q')??'',in:params.get('in')==='posts'?'posts':'people'};
 if(head==='activity'&&parts.length===1)return {kind:'activity'};
 if(head==='settings'&&parts.length===1)return {kind:'settings'};
 return {kind:'missing'};
}

/** QCC Social: the router and controller. Screens own their data; this owns the frame, the notices, the sheets and the keyboard. */
export class SocialView implements AppView {
 private readonly root=document.createElement('section');
 private readonly navigation=createSectionNavigation('social');
 private readonly menuGlass=bindGlass(this.navigation.menu);
 private readonly hideTabbar:{dispose():void;reset():void};
 private readonly offAccounts:()=>void;
 private readonly client=new SocialClient(()=>this.deps.accounts.session()?.token??null);
 private readonly topbar=document.createElement('header');
 private readonly layout=document.createElement('div');
 private readonly column=document.createElement('main');
 private readonly rail=document.createElement('aside');
 private readonly notices=document.createElement('div');
 private readonly fab=document.createElement('button');
 private topGlass:{dispose():void}|undefined;
 private segmented:Segmented|undefined;
 private screen:Screen|undefined;
 private route:Route={kind:'feed',tab:'following'};
 private me:SocialMe|null=null;
 private meToken:string|null=null;
 private forcedOut=false;
 private hash='';
 private generation=0;
 private internalNav=0;
 private paused=false;
 private disposed=false;
 private closeCompose:(()=>void)|undefined;
 private focusTimer:number|undefined;
 private focusField=false;
 private readonly noticeTimers=new Set<number>();
 private readonly links:Record<'home'|'search'|'activity'|'profile',HTMLAnchorElement>;
 private readonly appsTab:HTMLButtonElement;
 private readonly offBadge:()=>void;
 readonly ctx:SocialContext;
 constructor(private readonly container:HTMLElement,private readonly deps:AppDeps) {
  const root=this.root;
  root.className='social-view';root.setAttribute('aria-label','QCC Social');root.tabIndex=-1;
  this.ctx={
   client:this.client,deps,scroller:root,
   mentionCandidates:()=>[...root.querySelectorAll('.social-post')].flatMap(el=>{const author=cardOf(el)?.post.author;return author?[author]:[];}),
   me:()=>this.me,token:()=>this.deps.accounts.session()?.token??null,reduced:()=>reducedMotion(deps.reducedMotion),
   notify:(text,options)=>this.notify(text,options),announce:text=>this.announce(text),
   fail:(error,fallback,retry)=>this.fail(error,fallback,retry),signedOut:()=>this.signedOut(),reloadMe:()=>this.loadMe(),
   go:hash=>this.go(hash),refresh:()=>this.show(),openCompose:options=>this.openCompose(options),
   openPhotos:(media,index,trigger)=>openPhotoViewer(media,index,trigger),posted:post=>this.screen?.posted?.(post),
   mediaEnabled:()=>this.me?.media??false
  };
  this.topbar.className='apps-top ui-header';
  this.layout.className='social-layout';this.column.className='social-col';this.rail.className='social-rail';this.rail.setAttribute('aria-label','Search and shortcuts');
  this.notices.className='social-notices';
  this.fab.type='button';this.fab.className='social-fab';this.fab.setAttribute('aria-label','New post');this.fab.innerHTML=appIcon('compose');this.fab.hidden=true;
  this.fab.addEventListener('click',()=>this.openCompose({trigger:this.fab}));
  this.layout.append(this.column,this.rail);
  const nav=this.navigation;
  nav.bar.innerHTML=`<a class="ui-tab" href="#/social" data-tab="home">${appIcon('home')}<span>Home</span></a><a class="ui-tab" href="#/social/search" data-tab="search">${appIcon('search')}<span>Search</span></a><a class="ui-tab" href="#/social/activity" data-tab="activity">${appIcon('activity')}<span>Activity</span></a><a class="ui-tab" href="#/social/settings" data-tab="profile">${appIcon('profile')}<span>Profile</span></a><button type="button" class="ui-tab" data-action="apps" aria-haspopup="dialog" aria-label="Apps">${appIcon('apps')}<span>Apps</span></button>`;
  this.links={home:nav.bar.querySelector('[data-tab=home]')!,search:nav.bar.querySelector('[data-tab=search]')!,activity:nav.bar.querySelector('[data-tab=activity]')!,profile:nav.bar.querySelector('[data-tab=profile]')!};
  this.appsTab=nav.bar.querySelector('[data-action=apps]')!;
  this.appsTab.addEventListener('click',()=>deps.openApps(this.appsTab));
  this.offBadge=bindAppsBadge(this.appsTab,deps.appsBadge);
  nav.menu.addEventListener('click',()=>deps.openMenu());
  container.replaceChildren(root);
  root.append(this.topbar,this.notices,this.layout,nav.root);
  this.hideTabbar=autoHideTabbar(nav.bar,root);
  this.buildRail();
  root.addEventListener('keydown',this.onKey);
  window.addEventListener('offline',this.onOffline);window.addEventListener('online',this.onOnline);
  if(navigator.onLine===false)this.onOffline();
  // Only a different signed-in identity resets the view. A sync that finishes late emits too, and must not rebuild the feed under the reader.
  let identity=deps.accounts.session()?.token??null;
  this.offAccounts=deps.accounts.onChange(()=>{
   const next=deps.accounts.session()?.token??null;if(next===identity)return;identity=next;
   this.me=null;this.meToken=null;this.forcedOut=false;this.show();
  });
  root.focus({preventScroll:true});
 }
 navigate(hash:string):void{
  if(this.hash&&hash!==this.hash)this.internalNav++;
  this.hash=hash;this.show();
 }
 pause():void{this.paused=true;this.screen?.pause?.();}
 resume():void{this.paused=false;this.screen?.resume?.();}
 dispose():void {
  if(this.disposed)return;
  this.disposed=true;this.generation++;
  this.root.removeEventListener('keydown',this.onKey);window.removeEventListener('offline',this.onOffline);window.removeEventListener('online',this.onOnline);
  this.screen?.dispose();this.screen=undefined;this.closeCompose?.();closeMenus();closeAppSheets();
  document.getElementById('social-photo')?.remove();
  for(const t of this.noticeTimers)clearTimeout(t);this.noticeTimers.clear();
  if(this.focusTimer!==undefined)clearInterval(this.focusTimer);
  this.offAccounts();this.offBadge();this.topGlass?.dispose();this.hideTabbar.dispose();this.menuGlass.dispose();
  if(this.container.contains(this.root))this.container.replaceChildren();
 }
 // ---- services for screens ----
 private go(hash:string):void{if(location.hash===hash)this.show();else location.hash=hash;}
 private announce(text:string):void{
  const el=document.querySelector('#announcer');if(!el)return;
  el.textContent='';window.setTimeout(()=>{el.textContent=text;},30);
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
  if(this.forcedOut)return;
  this.forcedOut=true;this.me=null;this.show();
  this.notify('Please log in again.',{role:'alert'});
 }
 private openCompose(options:ComposeOptions={}):void {
  if(!this.me||document.getElementById('social-compose'))return;
  closeMenus();
  this.closeCompose=openComposeSheet(this.ctx,{replyTo:options.replyTo,trigger:options.trigger??document.activeElement,onPosted:post=>this.onPosted(post)});
 }
 private onPosted(post:PostView):void {this.screen?.posted?.(post);}
 // ---- data ----
 private async loadMe():Promise<void> {
  const token=this.ctx.token();
  const me=await this.client.me();
  if(this.disposed||token!==this.ctx.token())return;
  this.me=me;this.meToken=token;this.syncChrome();
 }
 // ---- frame ----
 private signedIn():boolean{return !!this.deps.accounts.session()&&!this.forcedOut;}
 private show():void {
  if(this.disposed)return;
  const generation=++this.generation;
  this.screen?.dispose();this.screen=undefined;this.closeCompose?.();this.closeCompose=undefined;closeMenus();closeAppSheets();
  this.column.replaceChildren();this.root.scrollTo({top:0});
  this.route=parseRoute(this.hash||location.hash);
  if(!this.signedIn()){this.me=null;this.renderSignedOut();return;}
  if(this.me&&this.meToken===this.ctx.token()){this.mount();return;}
  this.buildTop();this.column.append(skeletonPosts(4,'Loading…'));
  this.loadMe().then(()=>{if(generation===this.generation)this.mount();},error=>{
   if(generation!==this.generation||this.disposed)return;
   if(isAuthError(error)){this.signedOut();return;}
   this.column.replaceChildren(loadFailed(error,()=>this.show()));
  });
 }
 private renderSignedOut():void {
  this.buildTop();this.syncChrome();
  const box=document.createElement('div');box.className='apps-empty social-intro';
  box.innerHTML=`${appIcon('social-tile')}<h1 tabindex="-1">QCC Social</h1><p>Short posts from other QCC players. Follow people, reply and like. Log in to see the feed.</p><div class="social-intro-actions"><button type="button" class="ui-btn primary apps-pill" data-action="login">Log in / Sign up</button><a class="ui-btn secondary apps-pill" href="#/collection">Back to games</a></div>`;
  box.querySelector('[data-action=login]')!.addEventListener('click',()=>this.deps.openAccounts());
  this.column.append(box);
 }
 private mount():void {
  this.buildTop();this.syncChrome();
  const route=this.route,column=this.column;
  column.replaceChildren();
  switch(route.kind){
   case 'feed':{
    const h1=document.createElement('h1');h1.className='sr-only';h1.tabIndex=-1;h1.textContent=route.tab==='following'?'Following':'Discover';column.append(h1);
    this.screen=new FeedScreen(this.ctx,column,route.tab);break;
   }
   case 'thread':this.screen=new ThreadScreen(this.ctx,column,route.id);break;
   case 'profile':this.screen=new ProfileScreen(this.ctx,column,route.username,tabFromHash(route.tab));break;
   case 'search':this.screen=new SearchScreen(this.ctx,column,route.q,route.in);break;
   case 'activity':this.screen=new ActivityScreen(this.ctx,column);break;
   case 'settings':this.screen=new SettingsScreen(this.ctx,column);break;
   default:column.append(emptyState({icon:'info',title:"This page doesn't exist.",action:{label:'Back to feed',href:'#/social'}}));
  }
  if(this.paused)this.screen?.pause?.();
  this.focusRoute();
 }
 private focusRoute():void {
  if(this.focusTimer!==undefined)clearInterval(this.focusTimer);
  const generation=this.generation,field=this.focusField;this.focusField=false;
  let tries=0;
  const attempt=()=>{
   if(generation!==this.generation||this.disposed||++tries>30){clearInterval(this.focusTimer);this.focusTimer=undefined;return;}
   const active=document.activeElement;
   if(active instanceof HTMLElement&&active!==this.root&&this.root.contains(active)&&active.closest('input,textarea,[contenteditable]')){clearInterval(this.focusTimer);this.focusTimer=undefined;return;}
   if(field&&this.screen instanceof SearchScreen){this.screen.focusField();clearInterval(this.focusTimer);this.focusTimer=undefined;return;}
   const target=this.screen?.focusTarget?.()??this.column.querySelector<HTMLElement>('h1');
   if(target){target.focus({preventScroll:true});clearInterval(this.focusTimer);this.focusTimer=undefined;}
  };
  this.focusTimer=window.setInterval(attempt,100);attempt();
 }
 private myName():string|null{return this.me?.profile.username??null;}
 private syncChrome():void {
  const route=this.route,me=this.myName();
  const current=(key:keyof typeof this.links,on:boolean)=>{if(on)this.links[key].setAttribute('aria-current','page');else this.links[key].removeAttribute('aria-current');};
  const mine=route.kind==='profile'&&!!me&&route.username.toLowerCase()===me.toLowerCase();
  current('home',this.signedIn()&&(route.kind==='feed'));current('search',route.kind==='search');current('activity',route.kind==='activity');current('profile',mine||route.kind==='settings');
  this.links.profile.href=me?`#/social/u/${encodeURIComponent(me)}`:'#/social/settings';
  const signedIn=this.signedIn();
  for(const link of Object.values(this.links))link.hidden=!signedIn;
  this.fab.hidden=!signedIn||!this.me||!['feed','profile','activity'].includes(route.kind);
  this.rail.hidden=!signedIn;
  this.root.dataset.route=route.kind;
 }
 private buildTop():void {
  this.topGlass?.dispose();this.segmented=undefined;
  const route=this.route,me=this.myName(),signedIn=this.signedIn();
  const brand=`<a class="apps-brand arcade-glass floating-glass-group" data-glass-tone="light" href="#/social" aria-label="QCC Social home"><span class="apps-brand-mark">${appIcon('social-tile')}</span><span class="apps-wordmark"><span class="wm-short">Social</span><span class="wm-long">QCC Social</span></span></a>`;
  const back=(label:string)=>`<div class="apps-back-group arcade-glass floating-glass-group" data-glass-tone="light"><button type="button" class="apps-back-btn" data-action="back" aria-label="${label}">${appIcon('back')}</button></div>`;
  let left=brand,right='';
  if(signedIn){
   if(route.kind==='thread')left=back('Back to feed');
   else if(route.kind==='profile')left=back('Back to feed');
   else if(route.kind==='settings')left=back('Back to profile');
   if(route.kind==='profile'&&me&&route.username.toLowerCase()===me.toLowerCase())right=`<div class="apps-actions-group arcade-glass floating-glass-group" data-glass-tone="light"><a class="apps-icon-btn" href="#/social/settings" aria-label="Social settings">${appIcon('settings')}</a></div>`;
  }
  const feed=signedIn&&route.kind==='feed';
  this.topbar.innerHTML=`<div class="ui-header-inner">${left}${right}${feed?'<div class="apps-seg-group arcade-glass floating-glass-group" data-glass-tone="light"></div>':''}</div>`;
  if(feed){
   const seg=this.segmented=new Segmented({items:[{id:'following',label:'Following'},{id:'discover',label:'Discover'}],selected:route.tab,label:'Feed',
    onSelect:id=>{this.go(id==='discover'?'#/social/discover':'#/social');},
    onReselect:()=>{(this.screen as FeedScreen|undefined)?.toTop?.();this.root.scrollTo({top:0,behavior:this.ctx.reduced()?'auto':'smooth'});}});
   this.topbar.querySelector('.apps-seg-group')!.append(seg.el);
  }
  this.topbar.querySelector('[data-action=back]')?.addEventListener('click',()=>{
   if(route.kind==='settings'&&me){this.go(`#/social/u/${encodeURIComponent(me)}`);return;}
   if(this.internalNav>0&&history.length>1)history.back();else this.go('#/social');
  });
  this.topbar.querySelector('.ui-header-inner')!.append(this.fab);
  this.topGlass=bindFloatingGroups(this.topbar);
 }
 private buildRail():void {
  this.rail.innerHTML=`<form class="social-rail-search" role="search"><input type="search" class="social-search-field" placeholder="Search people and posts" aria-label="Search people and posts" autocomplete="off" maxlength="50"><span class="social-search-icon">${appIcon('search')}</span></form><section class="apps-panel social-rail-panel" aria-label="Keyboard shortcuts"><h2>Keyboard shortcuts</h2><p class="muted">Navigate posts and write faster.</p><button type="button" class="ui-btn secondary apps-pill" data-action="shortcuts">Show shortcuts</button></section><p class="social-rail-note">Posts here can be seen by other QCC players. Reports go to QCC moderators.</p>`;
  this.rail.querySelector('[data-action=shortcuts]')!.addEventListener('click',event=>openShortcuts(event.currentTarget as Element));
  this.rail.querySelector('form')!.addEventListener('submit',event=>{
   event.preventDefault();const q=this.rail.querySelector<HTMLInputElement>('input')!.value.trim();
   this.go(q?`#/social/search?q=${encodeURIComponent(q)}`:'#/social/search');
  });
 }
 private offline:HTMLElement|undefined;
 private readonly onOffline=():void=>{
  if(this.offline?.isConnected)return;
  this.notify("You're offline. New posts and messages will load when you're back online.",{icon:'info',sticky:true});
  this.offline=this.notices.lastElementChild as HTMLElement;
 };
 private readonly onOnline=():void=>{this.offline?.remove();this.offline=undefined;};
 // ---- keyboard (DESIGN 11.3) ----
 private readonly onKey=(event:KeyboardEvent):void=>{
  if(event.defaultPrevented||event.ctrlKey||event.metaKey||event.altKey||event.isComposing||event.repeat)return;
  const target=event.target as Element|null;
  if(target?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'))return;
  if(document.querySelector('dialog[open],.apps-popover'))return;
  if(!this.me||!shortcutsOn()||!(typeof matchMedia==='function'&&matchMedia('(pointer:fine)').matches))return;
  const articles=()=>[...this.column.querySelectorAll<HTMLElement>('article.social-post:not(.is-deleted)')];
  const current=()=>document.activeElement instanceof Element?document.activeElement.closest<HTMLElement>('article.social-post'):null;
  switch(event.key){
   case 'j':case 'k':{
    const list=articles();if(!list.length)return;
    const at=list.indexOf(current()as HTMLElement);
    const next=event.key==='j'?list[Math.min(list.length-1,at+1)]:list[Math.max(0,at<0?0:at-1)];
    if(!next)return;event.preventDefault();next.focus({preventScroll:true});next.scrollIntoView({block:'nearest',behavior:'instant' as ScrollBehavior});return;
   }
   case 'o':{const card=cardOf(current());if(card){event.preventDefault();card.open();}return;}
   case 'l':{const card=cardOf(current());if(card){event.preventDefault();void card.toggleLike(true);}return;}
   case 'r':{const card=cardOf(current());if(card){event.preventDefault();card.reply();}return;}
   case 'n':{
    event.preventDefault();
    if(this.screen instanceof FeedScreen&&this.screen.tab==='following'&&matchMedia('(min-width:1100px)').matches&&this.screen.openInline())return;
    this.openCompose({trigger:document.activeElement});return;
   }
   case '/':{
    event.preventDefault();
    if(this.screen instanceof SearchScreen)this.screen.focusField();else{this.focusField=true;this.go('#/social/search');}
    return;
   }
   case '?':event.preventDefault();openShortcuts(document.activeElement);return;
  }
 };
}
