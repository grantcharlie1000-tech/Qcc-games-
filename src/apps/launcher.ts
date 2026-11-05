import './apps.css';
import './launcher.css';
import type {AccountsClient} from '../accounts/client';
import {CHAT_ENDPOINT,type ChatClient} from '../chat/client';
import {POLL_MS} from '../chat/shared';
import {openSheet} from '../ui/sheet';
import {uiIcon} from '../ui/icons';
import {appIcon} from './icons';
import {pollMs} from './format';

/** DESIGN 3.6: 1-9, then 9+. */
const badgeText=(count:number)=>count>9?'9+':String(count);
/** What a badge shows: the count and the words added to the control's accessible name. `pop` is true only when the count has just gone from 0 to 1 or more. */
export interface AppsBadgeState {total:number;detail:string;pop:boolean}
export type AppsBadgeSubscribe=(run:(state:AppsBadgeState)=>void)=>()=>void;
/** Paints one `.apps-badge`. The pop (DESIGN 12.1 row 18) is a `@starting-style` keyed on `data-pop`, so it plays when the count appears, not every time a badge is first drawn (a new island, the launcher opening). */
function paintBadge(badge:HTMLElement,state:AppsBadgeState):void{
  const show=state.total>0;
  if(show&&badge.hidden&&state.pop){badge.dataset.pop='';window.setTimeout(()=>{delete badge.dataset.pop;},400);}
  badge.hidden=!show;badge.textContent=show?badgeText(state.total):'';
}
/** Gives an island's Apps tab (Social, Chat) the same badge and accessible name as the shell's (DESIGN 3.1, 3.6). Returns the unsubscribe. */
export function bindAppsBadge(tab:HTMLElement,subscribe:AppsBadgeSubscribe):()=>void{
  const badge=document.createElement('span');badge.className='apps-badge';badge.hidden=true;badge.setAttribute('aria-hidden','true');
  tab.append(badge);
  const off=subscribe(state=>{paintBadge(badge,state);tab.setAttribute('aria-label',state.detail?`Apps, ${state.detail}`:'Apps');});
  return ()=>{off();badge.remove();};
}

/** The shell's Apps tab, its unread badge and the launcher sheet. */
export class AppsLauncher {
  readonly tab=document.createElement('button');
  /** The Menu sheet's Apps entry: the way in below 360px, where the bar has no room for the tab (CSS shows it only there). */
  readonly menuEntry=document.createElement('button');
  private readonly dialog=document.createElement('dialog');
  private readonly tabBadge=document.createElement('span');
  private readonly tileBadge=document.createElement('span');
  private readonly chatTile:HTMLAnchorElement;
  private readonly back:HTMLAnchorElement;
  private unread=0;
  private requests=0;
  private timer:number|undefined;
  private abort:AbortController|undefined;
  private polledToken:string|null=null;
  private disposed=false;
  private available=false;
  private probing:Promise<boolean>|undefined;
  private retry:number|undefined;
  private shown=0;
  private readonly listeners=new Set<(state:AppsBadgeState)=>void>();
  private readonly offAccounts:()=>void;
  constructor(private readonly deps:{accounts:AccountsClient;chat:ChatClient;reducedMotion:()=>boolean}) {
    this.tab.type='button';this.tab.className='ui-tab';this.tab.dataset.action='apps';this.tab.setAttribute('aria-haspopup','dialog');
    this.tab.setAttribute('aria-label','Apps');
    // Hidden (no gap, no polling) until probe() finds a working chat backend.
    this.tab.hidden=true;
    this.menuEntry.type='button';this.menuEntry.className='game-button secondary menu-apps';this.menuEntry.hidden=true;this.menuEntry.textContent='Apps';this.menuEntry.setAttribute('aria-haspopup','dialog');
    this.menuEntry.addEventListener('click',()=>{this.menuEntry.closest('dialog')?.close();this.open(document.querySelector('.app-navigation [data-action=menu]'));});
    this.tab.innerHTML=`${appIcon('apps')}<span>Apps</span>`;
    for(const badge of [this.tabBadge,this.tileBadge]){badge.className='apps-badge';badge.hidden=true;badge.setAttribute('aria-hidden','true');}
    this.tab.append(this.tabBadge);
    this.dialog.id='apps-dialog';this.dialog.className='ui-glass-sheet';this.dialog.setAttribute('aria-labelledby','apps-title');
    this.dialog.innerHTML=`<form method="dialog" class="dialog-head"><h2 id="apps-title">Apps</h2><button class="icon-button" aria-label="Close apps">${uiIcon('close')}</button></form>
<div class="apps-tiles">
<a class="apps-tile" href="#/social" data-app="social"><span class="apps-tile-mark">${appIcon('social-tile')}</span><strong>QCC Social</strong><span class="apps-tile-text">Posts, replies and follows</span></a>
<a class="apps-tile" href="#/chat" data-app="chat"><span class="apps-tile-mark">${appIcon('chat-tile')}</span><strong>QCC Chat</strong><span class="apps-tile-text">Friends-only messages</span></a>
</div>
<a class="game-button secondary apps-back" href="#/collection" hidden>Back to games</a>
<p class="menu-note">Not end-to-end encrypted. Reports go to QCC moderators.</p>`;
    this.chatTile=this.dialog.querySelector<HTMLAnchorElement>('[data-app=chat]')!;
    this.chatTile.querySelector('.apps-tile-mark')!.append(this.tileBadge);
    this.back=this.dialog.querySelector<HTMLAnchorElement>('.apps-back')!;
    document.body.append(this.dialog);
    this.tab.addEventListener('click',()=>this.open());
    // Selecting a tile (or Back to games) closes the sheet; the link then navigates.
    this.dialog.addEventListener('click',event=>{if((event.target as Element).closest('a.apps-tile,a.apps-back'))this.dialog.close();});
    document.addEventListener('visibilitychange',this.onVisibility);
    this.offAccounts=deps.accounts.onChange(()=>this.sync());
    this.sync();
  }
  /**
   * Capability probe, once per page load: an unauthenticated GET of the chat summary. A 401 or a 200 with a JSON body means the handler exists, so the Apps tab and the badge poll switch on.
   * A 404, 503, 502, network error or non-JSON body (an SPA fallback page) keeps them off. One retry after `retryMs`, then it stops for this page load.
   */
  probe(retryMs=30000):Promise<boolean>{
    return this.probing??=(async()=>{
      if(await this.probeOnce())return this.enable();
      await new Promise<void>(resolve=>{this.retry=window.setTimeout(resolve,retryMs);});
      this.retry=undefined;
      return !this.disposed&&await this.probeOnce()?this.enable():false;
    })();
  }
  private async probeOnce():Promise<boolean>{
    if(this.disposed)return false;
    try{
      const response=await fetch(`${CHAT_ENDPOINT}?action=summary`,{credentials:'omit',signal:AbortSignal.timeout(10000)});
      if(response.status!==401&&response.status!==200)return false;
      await response.json();return true;
    }catch{return false;}
  }
  private enable():boolean{
    if(this.disposed)return false;
    this.available=true;
    // Out of the DOM until a backend answers: while it is absent the bar and Menu sheet are exactly the shell's own.
    const study=document.querySelector('.app-tabbar [data-action=study]');
    if(study)study.before(this.tab);else document.querySelector('.app-tabbar')?.append(this.tab);
    document.querySelector('#menu .account-menu')?.before(this.menuEntry);
    this.tab.hidden=false;this.menuEntry.hidden=false;
    // Six-tab fit rules in style.css apply only while this is set.
    this.tab.closest<HTMLElement>('.app-navigation')?.setAttribute('data-apps','on');this.sync();return true;
  }
  get sheet():HTMLDialogElement{return this.dialog;}
  /** The badge count for other Apps tabs (the Social and Chat islands). Calls `run` now and on every change. */
  readonly subscribe:AppsBadgeSubscribe=run=>{
    this.listeners.add(run);run({...this.state(),pop:false});
    return ()=>{this.listeners.delete(run);};
  };
  private state():Omit<AppsBadgeState,'pop'>{
    const total=this.unread+this.requests;
    return {total,detail:total<=0?'':this.requests>0?`${total} new in Chat`:`${this.unread} unread message${this.unread===1?'':'s'}`};
  }
  open(trigger:Element|null=this.tab):void{
    const hash=location.hash,inApp=document.body.classList.contains('social-active')||document.body.classList.contains('chat-active');
    for(const tile of this.dialog.querySelectorAll<HTMLElement>('.apps-tile')){
      if(hash==='#/'+tile.dataset.app||hash.startsWith(`#/${tile.dataset.app}/`))tile.setAttribute('aria-current','page');else tile.removeAttribute('aria-current');
    }
    this.back.hidden=!inApp;
    if(!this.dialog.open)openSheet(this.dialog,trigger);
  }
  /** Fetches the unread count now. Errors keep the last count. */
  async refresh():Promise<void>{
    const token=this.deps.accounts.session()?.token??null;
    if(!token||this.disposed){this.clear();return;}
    this.abort?.abort();
    const abort=this.abort=new AbortController();
    try{
      const summary=await this.deps.chat.summary(abort.signal);
      if(abort.signal.aborted||this.disposed||this.deps.accounts.session()?.token!==token)return;
      this.show(summary.unread,summary.requests);
    }catch{/* keep the last count */}
  }
  dispose():void{
    this.disposed=true;this.stop();if(this.retry!==undefined)clearTimeout(this.retry);this.abort?.abort();
    document.removeEventListener('visibilitychange',this.onVisibility);this.offAccounts();
    if(this.dialog.open)this.dialog.close();
    this.listeners.clear();this.dialog.remove();this.tab.closest('.app-navigation')?.removeAttribute('data-apps');this.tab.remove();this.menuEntry.remove();
  }
  private readonly onVisibility=()=>this.sync();
  // Polls only while signed in and visible; sign-out or an identity change clears the count.
  private sync():void{
    if(this.disposed)return;
    const token=this.deps.accounts.session()?.token??null;
    if(token!==this.polledToken){this.polledToken=token;this.stop();this.abort?.abort();this.clear();}
    if(!this.available||!token||document.visibilityState!=='visible'){this.stop();return;}
    if(this.timer===undefined){
      this.timer=window.setInterval(()=>{if(document.visibilityState==='visible')void this.refresh();},pollMs(POLL_MS.badge));
      void this.refresh();
    }
  }
  private stop():void{if(this.timer!==undefined){clearInterval(this.timer);this.timer=undefined;}}
  private clear():void{this.unread=0;this.requests=0;this.render();}
  private show(unread:number,requests:number):void{this.unread=unread;this.requests=requests;this.render();}
  private render():void{
    const {total,detail}=this.state(),state={total,detail,pop:this.shown<=0&&total>0};
    this.shown=total;
    for(const badge of [this.tabBadge,this.tileBadge])paintBadge(badge,state);
    for(const run of [...this.listeners])run(state);
    this.tab.setAttribute('aria-label',detail?`Apps, ${detail}`:'Apps');
    if(detail)this.chatTile.setAttribute('aria-label',`QCC Chat, ${detail}`);else this.chatTile.removeAttribute('aria-label');
  }
}
