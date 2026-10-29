import type {TopicStorageFailure} from './session';
export const READING_CHOICE_KEY='pocket-arcade:study:v1:reading-choice';
type Choice='accept'|'reject';
const explanation='No tracking or advertising scripts run. This choice controls optional storage of your reading topic and current article.';

export class ReadingPrivacy {
  readonly host=document.createElement('div');
  private memory:Choice|undefined;
  private opener:HTMLElement|null=null;
  private pending:Choice|undefined;
  private available=true;
  private previousMayReturn=false;
  private topicFailure:TopicStorageFailure|undefined;
  private continuation:(()=>void)|undefined;
  constructor(private onChoice:(remember:boolean)=>void){
    this.host.className='study-privacy';
    window.addEventListener('storage',event=>{if(event.key===READING_CHOICE_KEY||event.key===null){this.memory=undefined;this.pending=undefined;this.onChoice(this.allowed());this.render();}});
  }
  private choice():Choice|undefined{
    try{const value=localStorage.getItem(READING_CHOICE_KEY);return this.pending??(value==='accept'||value==='reject'?value:this.memory);}catch{this.available=false;return this.pending??this.memory;}
  }
  allowed(){return this.choice()==='accept';}
  mount(parent:HTMLElement){parent.insertBefore(this.host,parent.querySelector('.study-reader-layout, .study-picker'));if(this.choice()==='reject')this.onChoice(false);this.render();}
  private save(choice:Choice){
    this.memory=choice;try{localStorage.setItem(READING_CHOICE_KEY,choice);this.available=true;this.pending=undefined;this.previousMayReturn=false;}catch{
      this.available=false;this.pending=choice;
      if(choice==='reject')try{localStorage.removeItem(READING_CHOICE_KEY);this.previousMayReturn=false;}catch{this.previousMayReturn=true;}
    }
    const active=this.host.contains(document.activeElement);
    const restore=this.host.querySelector('dialog')?.open&&this.opener?.isConnected?this.opener:this.host.closest('#study-view')?.querySelector<HTMLElement>('[data-reading-choices]');
    this.onChoice(choice==='accept');
    if(!this.available||this.topicFailure){
      if(!this.host.querySelector('dialog')?.open)this.opener=restore??null;
      this.render();const dialog=this.host.querySelector('dialog')!;if(!dialog.open)dialog.showModal();this.focusNotice();return;
    }
    this.close();this.render();
    if(active)restore?.focus({preventScroll:true});
  }
  private render(){
    // Choice changes update this separate host, never the reading document.
    const current=this.choice();
    const wasOpen=this.host.querySelector('dialog')?.open;
    const topicWarning=this.topicFailure==='write'?'Your reading topic could not be remembered. It is available on this page only.':this.topicFailure==='remove'?'An old remembered topic could not be removed. It will not be used while remembering is off.':this.topicFailure==='read'?'The remembered reading topic could not be read. You can choose a chapter for this page.':'';
    this.host.innerHTML=`${current?'' : `<section class="study-cookie-panel" aria-label="Reading storage choices"><h2>Your reading preferences</h2><p>${explanation}</p><div class="study-privacy-actions"><button data-choice="customize">Customize</button><button data-choice="reject">Reject All</button><button data-choice="accept">Accept All</button></div></section>`}
      <dialog class="study-privacy-dialog" aria-labelledby="reading-privacy-title"><h2 id="reading-privacy-title">Reading storage choices</h2>${this.available&&!topicWarning?'':`<p role="status" tabindex="-1">${this.available?'':`Browser storage is unavailable. This choice applies to this page only.${this.previousMayReturn?' A previously saved reading choice could return after reload.':''}`} ${topicWarning}</p>`}<p>${explanation}</p><label class="study-privacy-option"><input type="checkbox" checked disabled> <span>Necessary game and preference storage <strong>Always on</strong></span></label><p>Game progress, scores, favourites, game settings and this choice remain available independently of optional reading storage.</p><label class="study-privacy-option"><input id="remember-reading" type="checkbox"${current==='accept'?' checked':''}> <span>Remember my reading topic for this browser session</span></label><p>The optional session value remembers your topic and current article. Rejecting it keeps your current chapter open in memory and removes that value without changing game data.</p><div class="study-privacy-actions"><button data-choice="save">Save preferences</button><button data-choice="close">Close</button></div></dialog>`;
    this.host.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach(button=>button.onclick=()=>{
      const action=button.dataset.choice;
      if(action==='customize')this.open(button);
      else if(action==='save')this.save(this.host.querySelector<HTMLInputElement>('#remember-reading')!.checked?'accept':'reject');
      else if(action==='close')this.close();else this.save(action as Choice);
    });
    this.host.querySelector('dialog')!.addEventListener('cancel',event=>{event.preventDefault();this.close();});
    if(wasOpen)this.host.querySelector('dialog')!.showModal();
    this.host.closest('#study-view')?.classList.toggle('study-choice-pending',!current);
  }
  private focusNotice(){const notice=this.host.querySelector<HTMLElement>('[role="status"]');if(notice){this.host.querySelector('dialog')!.scrollTop=0;notice.focus({preventScroll:true});}}
  open(opener:HTMLElement){this.opener=opener;this.render();this.host.querySelector('dialog')!.showModal();this.focusNotice();}
  setTopicFailure(failure:TopicStorageFailure|undefined){this.topicFailure=failure;}
  showTopicStorageNotice(opener:HTMLElement,continuation?:()=>void){this.continuation=continuation;this.open(opener);}
  close(){const dialog=this.host.querySelector('dialog');if(!dialog?.open)return false;dialog.close();const target=this.opener?.isConnected?this.opener:this.host.closest('#study-view')?.querySelector<HTMLElement>('[data-reading-choices]');target?.focus({preventScroll:true});const continuation=this.continuation;this.continuation=undefined;continuation?.();return true;}
  dismiss(){return this.close();}
  detach(){this.close();this.host.remove();}
}
