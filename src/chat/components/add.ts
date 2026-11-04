import {appIcon} from '../../apps/icons';
import {ApiError} from '../../apps/api';
import type {Screen,ChatContext} from './context';
import {isAuthError} from './context';
import {IncomingRequests,makeOutgoingRow,reconcile,type ListStore} from './list';

export const USERNAME_PATTERN=/^[a-zA-Z0-9_.-]{3,24}$/;
export const USERNAME_HELP='Usernames are 3–24 letters, numbers, dots, dashes or underscores.';

/** `#/chat/add` (DESIGN 6.4). The answer never says whether a username exists; only a mutual request reads differently. */
export class AddScreen implements Screen {
 private readonly el=document.createElement('div');
 private readonly h1=document.createElement('h1');
 private readonly form=document.createElement('form');
 private readonly input:HTMLInputElement;
 private readonly help=document.createElement('p');
 private readonly result=document.createElement('div');
 private readonly submit:HTMLButtonElement;
 private readonly incoming:IncomingRequests;
 private readonly sentSection=document.createElement('section');
 private readonly sentList=document.createElement('ul');
 private readonly detach:()=>void;
 private busy=false;
 private disposed=false;
 constructor(private readonly ctx:ChatContext,host:HTMLElement,private readonly store:ListStore,showRequests:boolean) {
  this.el.className='chat-add';
  this.h1.className='chat-title';this.h1.tabIndex=-1;this.h1.textContent='Add a friend';
  const intro=document.createElement('p');intro.className='chat-add-intro';intro.textContent="Type their exact QCC username. They'll get a request and can accept or decline.";
  this.form.className='chat-add-form';this.form.noValidate=true;
  this.form.innerHTML=`<label class="apps-field-label" for="chat-add-username">Username</label><div class="chat-add-field"><span class="chat-add-at" aria-hidden="true">@</span><input id="chat-add-username" class="apps-field" name="username" type="text" inputmode="text" autocapitalize="none" autocomplete="off" spellcheck="false" maxlength="24" aria-describedby="chat-add-help chat-add-result" required></div><p id="chat-add-help" class="chat-add-help" role="alert" hidden></p><button type="submit" class="ui-btn primary apps-pill chat-add-submit">Send request</button><div id="chat-add-result" class="chat-add-result" aria-live="polite"></div>`;
  this.input=this.form.querySelector('input')!;this.help=this.form.querySelector('#chat-add-help')!;this.result=this.form.querySelector('#chat-add-result')!;this.submit=this.form.querySelector('button')!;
  const note=document.createElement('p');note.className='chat-add-note';note.textContent="There's no friend search or suggestions, so only people who know your username can send you a request.";
  this.incoming=new IncomingRequests(ctx,store,'chat-add-requests-h');
  this.sentSection.className='chat-requests chat-sent';this.sentSection.hidden=true;this.sentSection.setAttribute('aria-labelledby','chat-sent-h');
  this.sentSection.innerHTML='<h2 id="chat-sent-h">Sent requests</h2>';this.sentList.className='chat-list';this.sentSection.append(this.sentList);
  this.el.append(this.h1,intro,this.form,note);
  if(showRequests)this.el.append(this.incoming.el,this.sentSection);
  host.append(this.el);
  this.form.addEventListener('submit',event=>{event.preventDefault();void this.send();});
  this.input.addEventListener('input',()=>{if(!this.help.hidden&&USERNAME_PATTERN.test(this.input.value.trim()))this.setHelp('');});
  this.detach=showRequests?store.attach(()=>this.renderRequests()):()=>{};
  this.renderRequests();
 }
 focusTarget():HTMLElement{return this.input;}
 dispose():void{this.disposed=true;this.detach();this.el.remove();}
 private setHelp(text:string):void{this.help.hidden=!text;this.help.textContent=text;this.input.setAttribute('aria-invalid',text?'true':'false');}
 private renderRequests():void {
  const data=this.store.data;if(!data||this.disposed)return;
  this.incoming.update(data.incoming);
  this.sentSection.hidden=!data.outgoing.length;
  reconcile(this.sentList,data.outgoing,row=>row.friend.username.toLowerCase(),makeOutgoingRow,()=>{});
 }
 private async send():Promise<void> {
  if(this.busy)return;
  const username=this.input.value.trim().replace(/^@/,'');
  this.result.replaceChildren();
  if(!USERNAME_PATTERN.test(username)){this.setHelp(USERNAME_HELP);this.input.focus();return;}
  this.setHelp('');
  this.busy=true;this.submit.disabled=true;
  try{
   const answer=await this.ctx.client.request(username);
   if(this.disposed)return;
   const p=document.createElement('p');p.className='apps-notice chat-add-notice';p.innerHTML=appIcon('info');
   const text=document.createElement('span');text.className='apps-notice-text';
   if(answer.status==='friends'){
    text.textContent=`You and @${username} are now friends. `;
    const link=document.createElement('a');link.className='apps-link';link.href=`#/chat/with/${encodeURIComponent(username)}`;link.textContent='Open chat';text.append(link);
   }else text.textContent=`Request sent. If @${username} accepts, they'll appear in your chats.`;
   p.append(text);this.result.replaceChildren(p);
   this.input.value='';this.ctx.refreshList();
  }catch(error){
   if(this.disposed)return;
   if(isAuthError(error)){this.ctx.signedOut();return;}
   const p=document.createElement('p');p.className='apps-notice chat-add-notice';p.setAttribute('role','alert');p.innerHTML=appIcon('alert');
   const text=document.createElement('span');text.className='apps-notice-text';
   text.textContent=error instanceof ApiError&&(error.status===429||error.status===400||error.status===0||error.status===503)?error.message:"Couldn't send the request. Try again.";
   p.append(text);this.result.replaceChildren(p);
  }finally{this.busy=false;this.submit.disabled=false;}
 }
}
