import './apps.css';
import './launcher.css';
import type {AccountsClient} from '../accounts/client';
import type {ChatClient} from '../chat/client';
import {POLL_MS} from '../chat/shared';
import {openSheet} from '../ui/sheet';
import {uiIcon} from '../ui/icons';
import {appIcon} from './icons';
import {pollMs} from './format';

const badgeText=(count:number)=>count>99?'99+':String(count);

/** The shell's Apps tab, its unread badge and the launcher sheet. */
export class AppsLauncher {
  readonly tab=document.createElement('button');
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
  private readonly offAccounts:()=>void;
  constructor(private readonly deps:{accounts:AccountsClient;chat:ChatClient;reducedMotion:()=>boolean}) {
    this.tab.type='button';this.tab.className='ui-tab';this.tab.dataset.action='apps';this.tab.setAttribute('aria-haspopup','dialog');
    this.tab.setAttribute('aria-label','Apps');
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
  get sheet():HTMLDialogElement{return this.dialog;}
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
    this.disposed=true;this.stop();this.abort?.abort();
    document.removeEventListener('visibilitychange',this.onVisibility);this.offAccounts();
    if(this.dialog.open)this.dialog.close();
    this.dialog.remove();this.tab.remove();
  }
  private readonly onVisibility=()=>this.sync();
  // Polls only while signed in and visible; sign-out or an identity change clears the count.
  private sync():void{
    if(this.disposed)return;
    const token=this.deps.accounts.session()?.token??null;
    if(token!==this.polledToken){this.polledToken=token;this.stop();this.abort?.abort();this.clear();}
    if(!token||document.visibilityState!=='visible'){this.stop();return;}
    if(this.timer===undefined){
      this.timer=window.setInterval(()=>{if(document.visibilityState==='visible')void this.refresh();},pollMs(POLL_MS.badge));
      void this.refresh();
    }
  }
  private stop():void{if(this.timer!==undefined){clearInterval(this.timer);this.timer=undefined;}}
  private clear():void{this.unread=0;this.requests=0;this.render();}
  private show(unread:number,requests:number):void{this.unread=unread;this.requests=requests;this.render();}
  private render():void{
    const total=this.unread+this.requests;
    for(const badge of [this.tabBadge,this.tileBadge]){badge.hidden=total<=0;badge.textContent=total>0?badgeText(total):'';}
    const detail=total<=0?'':this.requests>0?`${total} new in Chat`:`${this.unread} unread message${this.unread===1?'':'s'}`;
    this.tab.setAttribute('aria-label',detail?`Apps, ${detail}`:'Apps');
    if(detail)this.chatTile.setAttribute('aria-label',`QCC Chat, ${detail}`);else this.chatTile.removeAttribute('aria-label');
  }
}
