import type {AppDeps,AppView} from '../apps/types';
import {appIcon} from '../apps/icons';
import {uiIcon} from '../ui/icons';
import {bindGlass} from '../ui/glass';
import {autoHideTabbar} from '../ui/tabbar';
import {createSectionNavigation} from '../ui/navigation';
import './style.css';

/** QCC Chat. Placeholder frame (DESIGN 3.1); the screens arrive in a later task and keep this class shape. */
export class ChatView implements AppView {
  private readonly root=document.createElement('section');
  private readonly navigation=createSectionNavigation('chat');
  private readonly menuGlass=bindGlass(this.navigation.menu);
  private readonly hideTabbar:{dispose():void;reset():void};
  private readonly offAccounts:()=>void;
  private hash='';
  private disposed=false;
  constructor(private readonly container:HTMLElement,private readonly deps:AppDeps) {
    this.root.className='chat-view';this.root.setAttribute('aria-label','QCC Chat');this.root.tabIndex=-1;
    this.navigation.bar.innerHTML=`<a class="ui-tab" href="#/collection">${uiIcon('games')}<span>Games</span></a>`;
    this.navigation.menu.addEventListener('click',()=>this.deps.openMenu());
    container.replaceChildren(this.root);
    this.root.append(this.navigation.root);
    this.hideTabbar=autoHideTabbar(this.navigation.bar,this.root);
    this.offAccounts=deps.accounts.onChange(()=>this.render());
    this.render();
    this.root.focus({preventScroll:true});
  }
  navigate(hash:string):void{this.hash=hash;this.render();}
  pause():void{}
  resume():void{}
  dispose():void{
    if(this.disposed)return;
    this.disposed=true;this.offAccounts();this.hideTabbar.dispose();this.menuGlass.dispose();
    if(this.container.contains(this.root))this.container.replaceChildren();
  }
  private render():void{
    if(this.disposed)return;
    const signedIn=!!this.deps.accounts.session();
    const body=signedIn
      ?'<div class="apps-loading" role="status">Loading…</div>'
      :`<div class="apps-empty">${appIcon('chat-tile')}<h2>QCC Chat</h2><p>Message friends one to one. You both have to accept before you can chat, and messages disappear after they're viewed. Log in to start.</p><button type="button" class="game-button" data-action="login">Log in / Sign up</button><a class="game-button secondary" href="#/collection">Back to games</a></div>`;
    this.root.querySelector('.chat-main')?.remove();
    const main=document.createElement('main');
    main.className='chat-main';main.dataset.route=this.hash;
    main.innerHTML=`<h1 class="chat-title">QCC Chat</h1>${body}`;
    main.querySelector('[data-action=login]')?.addEventListener('click',()=>this.deps.openAccounts());
    this.root.prepend(main);
  }
}
