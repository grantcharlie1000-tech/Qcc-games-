import {avatar} from '../../apps/avatar';
import type {SocialContext} from '../context';
import type {Author} from '../shared';

export interface MentionToken {start:number;end:number;query:string}
/** Only the @handle at the caret is searched; the rest of a draft never leaves the composer. */
export function mentionAt(text:string,caret:number):MentionToken|null {
 const match=/(?:^|\s)@([a-zA-Z0-9_.-]{0,24})$/.exec(text.slice(0,caret));
 if(!match)return null;
 // Replace the complete token, including any username characters after the caret.
 const suffix=/^[a-zA-Z0-9_.-]*/.exec(text.slice(caret))![0].replace(/[.-]+$/,'');
 if(match[1]!.length+suffix.length>24)return null;
 return {start:caret-match[1]!.length-1,end:caret+suffix.length,query:match[1]!};
}
/** A pending result may outlive a caret move or a programmatic draft update. */
export function isCurrentMention(text:string,start:number,end:number,token:MentionToken):boolean {
 if(start!==end)return false;
 const current=mentionAt(text,start);
 return !!current&&current.start===token.start&&current.end===token.end&&current.query===token.query;
}
export function insertMention(text:string,token:MentionToken,username:string):{text:string;caret:number} {
 const tail=text.slice(token.end),separator=/^[\s.,!?;:)\]}]/.test(tail)?'':' ',value=`@${username}${separator}`;
 return {text:text.slice(0,token.start)+value+tail,caret:token.start+value.length+(tail.startsWith(' ')?1:0)};
}
/** Scroll only the suggestions list; selecting an option must not jump the sheet or feed. */
export function scrollMentionIntoView(list:HTMLElement,option:HTMLElement):void {
 const viewport=list.getBoundingClientRect(),rect=option.getBoundingClientRect();
 const top=viewport.top+list.clientTop,bottom=top+list.clientHeight;
 if(rect.top<top)list.scrollTop+=rect.top-top;
 else if(rect.bottom>bottom)list.scrollTop+=rect.bottom-bottom;
}

export class MentionSuggestions {
 readonly el=document.createElement('div');
 private timer:number|undefined;
 private controller:AbortController|undefined;
 private token:MentionToken|null=null;
 private users:Author[]=[];
 private selected=-1;
 private selection={start:-1,end:-1};
 private sequence=0;
 private disposed=false;
 constructor(private readonly ctx:SocialContext,private readonly field:HTMLTextAreaElement,id:number,private readonly changed:()=>void){
  this.el.className='social-mention-options';this.el.id=`mention-options-${id}`;this.el.hidden=true;
  this.el.setAttribute('role','listbox');this.el.setAttribute('aria-label','Mention suggestions');
  field.setAttribute('aria-autocomplete','list');field.setAttribute('aria-controls',this.el.id);field.setAttribute('aria-expanded','false');
  field.addEventListener('input',this.refresh);field.addEventListener('click',this.refresh);field.addEventListener('keyup',this.caretMoved);field.addEventListener('keydown',this.keydown);field.addEventListener('blur',this.blur);
 }
 private caretMoved=()=>{
  // Picker arrows prevent native movement. Refresh only when the textarea's
  // selection actually changed, including Up/Down/PageUp/PageDown navigation.
  if(this.field.selectionStart!==this.selection.start||this.field.selectionEnd!==this.selection.end)this.refresh();
 };
 private blur=()=>this.close();
 private refresh=()=>{
  const {selectionStart:start,selectionEnd:end}=this.field;this.selection={start,end};
  const token=start===end?mentionAt(this.field.value,start):null;
  this.close();if(!token||this.disposed)return;this.token=token;
  if(!token.query){
   const nearby=new Map<string,Author>();
   for(const author of this.ctx.mentionCandidates?.()??[])if(author.username!==this.ctx.me()?.profile.username)nearby.set(author.username,author);
   if(nearby.size)this.render([...nearby.values()].slice(0,5));else this.message('Type a username to mention someone.');
   return;
  }
  const sequence=this.sequence;
  this.timer=window.setTimeout(async()=>{
   this.timer=undefined;const ctl=this.controller=new AbortController();
   try{
    const result=await this.ctx.client.search(token.query,ctl.signal);
    if(this.disposed||ctl.signal.aborted||sequence!==this.sequence)return;
    if(!isCurrentMention(this.field.value,this.field.selectionStart,this.field.selectionEnd,token)){this.close();return;}
    this.render(result.users);
   }catch{if(!ctl.signal.aborted&&sequence===this.sequence)this.message('Suggestions unavailable. You can still type a username.');}
  },300);
 };
 private render(users:Author[]):void {
  this.users=users.slice(0,5);this.selected=-1;this.el.replaceChildren();
  if(!this.users.length){this.message('No matching people.');return;}
  for(const [i,user] of this.users.entries()){
   const option=document.createElement('button');option.type='button';option.tabIndex=-1;option.className='social-mention-option';option.id=`${this.el.id}-${i}`;option.setAttribute('role','option');option.setAttribute('aria-selected','false');
   const text=document.createElement('span'),name=document.createElement('strong'),handle=document.createElement('span');
   name.textContent=user.displayName||user.username;handle.textContent=`@${user.username}`;text.append(name,handle);option.append(avatar(user,32),text);
   option.addEventListener('pointerdown',event=>event.preventDefault());option.addEventListener('click',()=>this.choose(i));this.el.append(option);
  }
  this.show();
 }
 private message(text:string):void {this.el.replaceChildren();const p=document.createElement('p');p.className='social-mention-help';p.setAttribute('role','status');p.textContent=text;this.el.append(p);this.show();}
 private show():void{this.el.hidden=false;this.field.setAttribute('aria-expanded','true');}
 private keydown=(event:KeyboardEvent)=>{
  if(this.el.hidden||event.isComposing)return;
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.close();return;}
  if((event.key==='ArrowDown'||event.key==='ArrowUp')&&this.users.length){
   event.preventDefault();event.stopPropagation();this.selected=this.selected<0?(event.key==='ArrowDown'?0:this.users.length-1):(this.selected+(event.key==='ArrowDown'?1:-1)+this.users.length)%this.users.length;
   for(const [i,el] of [...this.el.querySelectorAll<HTMLElement>('[role=option]')].entries())el.setAttribute('aria-selected',String(i===this.selected));
   this.field.setAttribute('aria-activedescendant',`${this.el.id}-${this.selected}`);
   const active=this.el.querySelector<HTMLElement>('[aria-selected=true]');if(active)scrollMentionIntoView(this.el,active);
  }else if(event.key==='Enter'&&!event.ctrlKey&&!event.metaKey&&this.selected>=0){event.preventDefault();event.stopPropagation();this.choose(this.selected);}
  else if(event.key==='Tab')this.close();
 };
 private choose(index:number):void {
  const token=this.token,user=this.users[index];if(!token||!user)return;
  if(!isCurrentMention(this.field.value,this.field.selectionStart,this.field.selectionEnd,token)){this.close();return;}
  const result=insertMention(this.field.value,token,user.username);this.field.value=result.text;this.field.setSelectionRange(result.caret,result.caret);this.selection={start:result.caret,end:result.caret};this.close();this.field.focus();this.changed();
 }
 close():void {
  this.sequence++;if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;this.controller?.abort();this.controller=undefined;this.users=[];this.selected=-1;this.token=null;this.el.hidden=true;this.el.replaceChildren();this.field.setAttribute('aria-expanded','false');this.field.removeAttribute('aria-activedescendant');
 }
 dispose():void{this.disposed=true;this.close();this.field.removeEventListener('input',this.refresh);this.field.removeEventListener('click',this.refresh);this.field.removeEventListener('keyup',this.caretMoved);this.field.removeEventListener('keydown',this.keydown);this.field.removeEventListener('blur',this.blur);this.el.remove();}
}
